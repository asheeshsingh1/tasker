import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { connectToDatabase, OtpVerification, User } from "../_lib/mongodb.js";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, otp, password, name } = req.body;

  // Validate required fields
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Email is required" });
  }

  if (!otp || typeof otp !== "string") {
    return res.status(400).json({ error: "Verification code is required" });
  }

  if (!password || typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return res.status(400).json({ error: "Name must be at least 2 characters" });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const { db } = await connectToDatabase();
    const users = db.collection<User>("users");
    const otpCollection = db.collection<OtpVerification>("otp_verifications");

    // Check if email is already registered
    const existingUser = await users.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ error: "Email is already registered" });
    }

    // Find the OTP record
    const otpRecord = await otpCollection.findOne({
      email: normalizedEmail,
      otp: otp.trim(),
    });

    if (!otpRecord) {
      return res.status(400).json({ error: "Invalid verification code" });
    }

    // Check if OTP is expired
    if (new Date() > otpRecord.expiresAt) {
      await otpCollection.deleteOne({ _id: otpRecord._id });
      return res.status(400).json({ error: "Verification code has expired. Please request a new one." });
    }

    // OTP is valid - create the user account
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await users.insertOne({
      email: normalizedEmail,
      password: hashedPassword,
      name: name.trim(),
      createdAt: new Date(),
    });

    // Delete the used OTP
    await otpCollection.deleteMany({ email: normalizedEmail });

    // Generate JWT token
    const token = jwt.sign(
      { userId: result.insertedId.toString(), email: normalizedEmail },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(201).json({
      token,
      user: {
        id: result.insertedId.toString(),
        email: normalizedEmail,
        name: name.trim(),
      },
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

