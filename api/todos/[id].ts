import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ObjectId } from "mongodb";
import { connectToDatabase, Todo } from "../../lib/mongodb";
import { getUserFromRequest } from "../../lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Authenticate
  const user = getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { id } = req.query;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "Invalid todo ID" });
  }

  // Validate ObjectId format
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid todo ID format" });
  }

  const { db } = await connectToDatabase();
  const todos = db.collection<Todo>("todos");

  try {
    // Check ownership
    const existing = await todos.findOne({
      _id: new ObjectId(id),
      userId: user.userId,
    });

    if (!existing) {
      return res.status(404).json({ error: "Todo not found" });
    }

    // PATCH - Update todo
    if (req.method === "PATCH") {
      const { text, completed } = req.body;
      const updates: Partial<Todo> = {};

      if (typeof text === "string") {
        updates.text = text.trim();
      }

      if (typeof completed === "boolean") {
        updates.completed = completed;
        // Set completedAt when marking as complete, null when unmarking
        updates.completedAt = completed ? new Date() : null;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      await todos.updateOne({ _id: new ObjectId(id) }, { $set: updates });

      const updated = await todos.findOne({ _id: new ObjectId(id) });

      return res.json({
        id: updated!._id!.toString(),
        text: updated!.text,
        completed: updated!.completed,
        createdAt: updated!.createdAt.toISOString(),
        completedAt: updated!.completedAt?.toISOString() || null,
      });
    }

    // DELETE - Delete single todo
    if (req.method === "DELETE") {
      await todos.deleteOne({ _id: new ObjectId(id) });
      return res.status(204).send(null);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Todo [id] error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

