import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import db, { User } from "../db.js";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
const SALT_ROUNDS = 10;

// Register
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      res.status(400).json({ error: "Email, password, and name are required" });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    // Check if user exists
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Insert user
    const result = db.prepare(
      "INSERT INTO users (email, password, name) VALUES (?, ?, ?)"
    ).run(email, hashedPassword, name);

    const userId = result.lastInsertRowid as number;

    // Generate token
    const token = jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: "7d" });

    res.status(201).json({
      token,
      user: { id: userId, email, name },
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Login
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    // Find user
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as User | undefined;

    if (!user) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    // Generate token
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get current user (verify token)
router.get("/me", (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; email: string };
    const user = db.prepare("SELECT id, email, name FROM users WHERE id = ?").get(decoded.userId) as Omit<User, "password"> | undefined;

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    res.json({ user });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

export default router;
export { JWT_SECRET };

