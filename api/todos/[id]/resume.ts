import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ObjectId } from "mongodb";
import { connectToDatabase, Todo } from "../../_lib/mongodb.js";
import { getUserFromRequest } from "../../_lib/auth.js";

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
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Authenticate
  const user = getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { id } = req.query;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "Invalid todo ID" });
  }

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid todo ID format" });
  }

  const { db } = await connectToDatabase();
  const todos = db.collection<Todo>("todos");

  try {
    const existing = await todos.findOne({
      _id: new ObjectId(id),
      userId: user.userId,
    });

    if (!existing) {
      return res.status(404).json({ error: "Todo not found" });
    }

    const currentStatus = existing.status || 'active';

    if (currentStatus !== 'paused') {
      return res.status(400).json({ error: "Todo is not paused" });
    }

    // Calculate paused duration and add to total
    const pausedAt = existing.pausedAt?.getTime() || Date.now();
    const pausedDuration = Date.now() - pausedAt;
    const newTotalPausedTime = (existing.totalPausedTime || 0) + pausedDuration;

    await todos.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: 'active', pausedAt: null, totalPausedTime: newTotalPausedTime } }
    );

    const updated = await todos.findOne({ _id: new ObjectId(id) });
    return res.json(formatTodo(updated!));
  } catch (error) {
    console.error("Resume todo error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

