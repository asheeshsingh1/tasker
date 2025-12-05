import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ObjectId } from "mongodb";
import { connectToDatabase, Todo } from "../_lib/mongodb.js";
import { getUserFromRequest } from "../_lib/auth.js";

// Helper to format todo for response
function formatTodo(t: Todo) {
  return {
    id: t._id!.toString(),
    text: t.text,
    completed: t.completed,
    status: t.status || (t.completed ? 'completed' : 'active'),
    createdAt: t.createdAt.toISOString(),
    pausedAt: t.pausedAt?.toISOString() || null,
    totalPausedTime: t.totalPausedTime || 0,
    completedAt: t.completedAt?.toISOString() || null,
    recurringTaskId: t.recurringTaskId || null,
  };
}

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
      const currentStatus = existing.status || (existing.completed ? 'completed' : 'active');

      if (typeof text === "string") {
        updates.text = text.trim();
      }

      if (typeof completed === "boolean") {
        // Prevent completing a paused task - must resume first
        if (completed && currentStatus === 'paused') {
          return res.status(400).json({ error: "Cannot complete a paused task. Resume it first." });
        }
        
        updates.completed = completed;
        
        if (completed) {
          // When completing, update status and completedAt
          updates.status = 'completed';
          updates.completedAt = new Date();
        } else {
          // When uncompleting, reset status to active
          updates.status = 'active';
          updates.completedAt = null;
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      await todos.updateOne({ _id: new ObjectId(id) }, { $set: updates });

      const updated = await todos.findOne({ _id: new ObjectId(id) });

      return res.json(formatTodo(updated!));
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

