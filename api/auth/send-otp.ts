import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase, OtpVerification, User, RateLimitRecord } from "../_lib/mongodb.js";

// Rate limit configuration
const RATE_LIMITS = {
  perEmail: {
    coolOffSeconds: 300,       // 6 minutes between requests for same email
  },
  perIp: {
    maxRequests: 2,            // Max 2 OTP requests per IP per hour
    windowMinutes: 60,         // Per hour
  },
  daily: {
    maxEmails: 90,             // Max 90 emails per day (buffer of 10 for 100 limit)
  },
};

// Get client IP from request headers
function getClientIp(req: VercelRequest): string {
  // Vercel/Cloudflare headers
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(',')[0];
    return ips.trim();
  }
  
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }
  
  return 'unknown';
}

// Get today's date string for daily limit key
function getTodayKey(): string {
  const now = new Date();
  return `daily_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// Generate a 6-digit OTP
function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send email via SendGrid
async function sendOtpEmail(email: string, otp: string): Promise<boolean> {
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL;

  if (!SENDGRID_API_KEY || !SENDGRID_FROM_EMAIL) {
    console.error("SendGrid environment variables not configured");
    return false;
  }

  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email }],
            subject: "Your Tasker Verification Code",
          },
        ],
        from: {
          email: SENDGRID_FROM_EMAIL,
          name: "Tasker App",
        },
        content: [
          {
            type: "text/plain",
            value: `Your Tasker Verification Code\n\nYour verification code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this code, you can safely ignore this email.`,
          },
          {
            type: "text/html",
            value: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #c75d3a;">Tasker Verification Code</h2>
                <p>Your verification code is:</p>
                <div style="background: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
                  <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${otp}</span>
                </div>
                <p style="color: #666;">This code expires in 10 minutes.</p>
                <p style="color: #666;">If you didn't request this code, you can safely ignore this email.</p>
              </div>
            `,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("SendGrid error:", errorText);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email } = req.body;

  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Email is required" });
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const clientIp = getClientIp(req);

  try {
    const { db } = await connectToDatabase();
    const users = db.collection<User>("users");
    const otpCollection = db.collection<OtpVerification>("otp_verifications");
    const rateLimits = db.collection<RateLimitRecord>("rate_limits");

    // Create TTL index for automatic cleanup (run once)
    await rateLimits.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {});

    // === RATE LIMIT CHECK 1: Per-email cool-off ===
    const recentOtp = await otpCollection.findOne({
      email: normalizedEmail,
      createdAt: { $gte: new Date(Date.now() - RATE_LIMITS.perEmail.coolOffSeconds * 1000) },
    });

    if (recentOtp) {
      const waitTime = Math.ceil((recentOtp.createdAt.getTime() + RATE_LIMITS.perEmail.coolOffSeconds * 1000 - Date.now()) / 1000);
      return res.status(429).json({ 
        error: `Please wait ${waitTime} seconds before requesting another code`,
        retryAfter: waitTime,
      });
    }

    // === RATE LIMIT CHECK 2: Per-IP limit ===
    const ipKey = `ip_${clientIp}`;
    const windowStart = new Date(Date.now() - RATE_LIMITS.perIp.windowMinutes * 60 * 1000);
    
    const ipRecord = await rateLimits.findOne({
      key: ipKey,
      windowStart: { $gte: windowStart },
    });

    if (ipRecord && ipRecord.count >= RATE_LIMITS.perIp.maxRequests) {
      return res.status(429).json({ 
        error: "Too many requests. Please try again later.",
        retryAfter: RATE_LIMITS.perIp.windowMinutes * 60,
      });
    }

    // === RATE LIMIT CHECK 3: Daily global limit ===
    const dailyKey = getTodayKey();
    const dailyRecord = await rateLimits.findOne({ key: dailyKey });

    if (dailyRecord && dailyRecord.count >= RATE_LIMITS.daily.maxEmails) {
      return res.status(429).json({ 
        error: "Daily email limit reached. Please try again tomorrow.",
        retryAfter: 86400, // 24 hours
      });
    }

    // === CHECK IF EMAIL ALREADY REGISTERED ===
    const existingUser = await users.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ error: "Email is already registered. Please login instead." });
    }

    // === GENERATE AND SEND OTP ===
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Delete any existing OTPs for this email
    await otpCollection.deleteMany({ email: normalizedEmail });

    // Store new OTP
    await otpCollection.insertOne({
      email: normalizedEmail,
      otp,
      expiresAt,
      verified: false,
      createdAt: new Date(),
    });

    // Send OTP via email
    const sent = await sendOtpEmail(normalizedEmail, otp);

    if (!sent) {
      // Remove the OTP if email failed
      await otpCollection.deleteMany({ email: normalizedEmail });
      return res.status(500).json({ error: "Failed to send verification code. Please try again." });
    }

    // === UPDATE RATE LIMIT COUNTERS (only after successful send) ===
    
    // Update IP counter
    await rateLimits.updateOne(
      { key: ipKey, windowStart: { $gte: windowStart } },
      { 
        $inc: { count: 1 },
        $setOnInsert: { 
          windowStart: new Date(),
          expiresAt: new Date(Date.now() + RATE_LIMITS.perIp.windowMinutes * 60 * 1000),
        },
      },
      { upsert: true }
    );

    // Update daily counter
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 0);
    
    await rateLimits.updateOne(
      { key: dailyKey },
      { 
        $inc: { count: 1 },
        $setOnInsert: { 
          windowStart: new Date(),
          expiresAt: tomorrow,
        },
      },
      { upsert: true }
    );

    // Get remaining quota for response
    const updatedDaily = await rateLimits.findOne({ key: dailyKey });
    const remainingToday = RATE_LIMITS.daily.maxEmails - (updatedDaily?.count || 0);

    return res.json({ 
      message: "Verification code sent to your email",
      email: normalizedEmail,
      // Only show remaining in dev/debug (remove in production if needed)
      _debug: process.env.NODE_ENV !== 'production' ? { remainingToday } : undefined,
    });
  } catch (error) {
    console.error("Send OTP error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
