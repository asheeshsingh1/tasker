import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ObjectId } from "mongodb";
import { connectToDatabase, User } from "../../lib/mongodb";
import { getUserFromRequest } from "../../lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const payload = getUserFromRequest(req);
    if (!payload) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { db } = await connectToDatabase();
    const users = db.collection<User>("users");

    const user = await users.findOne(
      { _id: new ObjectId(payload.userId) },
      { projection: { password: 0 } }
    );

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    return res.json({
      user: { id: user._id!.toString(), email: user.email, name: user.name },
    });
  } catch (error) {
    console.error("Me error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

