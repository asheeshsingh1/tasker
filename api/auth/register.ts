import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import { connectToDatabase, User } from "../_lib/mongodb";
import { signToken } from "../_lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { email, password, name } = req.body;

    // Validation
    if (!email || !password || !name) {
      return res.status(400).json({ error: "Email, password, and name are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const { db } = await connectToDatabase();
    const users = db.collection<User>("users");

    // Check if user exists
    const existing = await users.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const result = await users.insertOne({
      email: email.toLowerCase(),
      password: hashedPassword,
      name,
      createdAt: new Date(),
    });

    const userId = result.insertedId.toString();

    // Generate token
    const token = signToken({ userId, email: email.toLowerCase() });

    return res.status(201).json({
      token,
      user: { id: userId, email: email.toLowerCase(), name },
    });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

