import jwt from "jsonwebtoken";
import { VercelRequest } from "@vercel/node";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

export interface JWTPayload {
  userId: string;
  email: string;
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

export function getUserFromRequest(req: VercelRequest): JWTPayload | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  
  const token = authHeader.slice(7);
  return verifyToken(token);
}

