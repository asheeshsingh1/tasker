import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { connectToDatabase, User } from "../_lib/mongodb.js";
import { signToken } from "../_lib/auth.js";

function generateEncryptionSalt(): string {
  return randomBytes(16).toString("base64");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { email, password, name } = req.body;

    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email is required" });
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return res.status(400).json({ error: "Name must be at least 2 characters" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const { db } = await connectToDatabase();
    const users = db.collection<User>("users");

    const existing = await users.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const encryptionSalt = generateEncryptionSalt();

    const result = await users.insertOne({
      email: normalizedEmail,
      password: hashedPassword,
      name: name.trim(),
      encryptionSalt,
      createdAt: new Date(),
    });

    const userId = result.insertedId.toString();
    const token = signToken({ userId, email: normalizedEmail });

    return res.status(201).json({
      token,
      user: { id: userId, email: normalizedEmail, name: name.trim() },
      encryptionSalt,
    });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
