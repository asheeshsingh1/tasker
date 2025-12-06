import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { connectToDatabase, User } from "../_lib/mongodb.js";
import { signToken } from "../_lib/auth.js";

// Generate a random salt for encryption (for legacy users without salt)
function generateEncryptionSalt(): string {
  return randomBytes(16).toString('base64');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const { db } = await connectToDatabase();
    const users = db.collection<User>("users");

    // Find user
    const user = await users.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Ensure user has encryption salt (generate for legacy users)
    let encryptionSalt = user.encryptionSalt;
    if (!encryptionSalt) {
      encryptionSalt = generateEncryptionSalt();
      await users.updateOne(
        { _id: user._id },
        { $set: { encryptionSalt } }
      );
    }

    // Generate token
    const token = signToken({ userId: user._id!.toString(), email: user.email });

    return res.json({
      token,
      user: { id: user._id!.toString(), email: user.email, name: user.name },
      encryptionSalt, // Return salt for client-side encryption setup
    });
  } catch (error) {
    console.error("Login error:", error);
    // In production, don't expose error details to client
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Login error details:", message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

