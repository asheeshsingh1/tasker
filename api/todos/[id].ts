import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ObjectId } from "mongodb";
import { connectToDatabase, Todo, Subtask } from "../_lib/mongodb.js";
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
    subtasks: (t.subtasks || []).map(st => ({
      id: st.id,
      text: st.text,
      completed: st.completed,
      createdAt: st.createdAt.toISOString(),
    })),
  };
}

// Action handlers
async function handlePause(existing: Todo, todos: any): Promise<Todo> {
  const currentStatus = existing.status || (existing.completed ? 'completed' : 'active');

  if (currentStatus === 'paused') {
    throw new Error("Todo is already paused");
  }

  if (currentStatus === 'completed' || existing.completed) {
    throw new Error("Cannot pause a completed todo");
  }

  await todos.updateOne(
    { _id: existing._id },
    { $set: { status: 'paused', pausedAt: new Date() } }
  );

  return await todos.findOne({ _id: existing._id });
}

async function handleResume(existing: Todo, todos: any): Promise<Todo> {
  const currentStatus = existing.status || 'active';

  if (currentStatus !== 'paused') {
    throw new Error("Todo is not paused");
  }

  const pausedAt = existing.pausedAt?.getTime() || Date.now();
  const pausedDuration = Date.now() - pausedAt;
  const newTotalPausedTime = (existing.totalPausedTime || 0) + pausedDuration;

  await todos.updateOne(
    { _id: existing._id },
    { $set: { status: 'active', pausedAt: null, totalPausedTime: newTotalPausedTime } }
  );

  return await todos.findOne({ _id: existing._id });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

    // POST - Handle actions (pause, resume)
    if (req.method === "POST") {
      const { action } = req.body;
      
      if (!action) {
        return res.status(400).json({ error: "Action is required" });
      }

      try {
        let updated: Todo;
        
        switch (action) {
          case 'pause':
            updated = await handlePause(existing, todos);
            break;
          case 'resume':
            updated = await handleResume(existing, todos);
            break;
          default:
            return res.status(400).json({ error: `Unknown action: ${action}` });
        }
        
        return res.json(formatTodo(updated));
      } catch (err: any) {
        return res.status(400).json({ error: err.message });
      }
    }

    // PATCH - Update todo
    if (req.method === "PATCH") {
      const { text, completed, subtasks } = req.body;
      const updates: Partial<Todo> = {};
      const currentStatus = existing.status || (existing.completed ? 'completed' : 'active');

      if (typeof text === "string") {
        updates.text = text.trim();
      }

      if (typeof completed === "boolean") {
        if (completed && currentStatus === 'paused') {
          return res.status(400).json({ error: "Cannot complete a paused task. Resume it first." });
        }
        
        updates.completed = completed;
        
        if (completed) {
          updates.status = 'completed';
          updates.completedAt = new Date();
        } else {
          // When uncompleting, add the time spent in "completed" state to totalPausedTime
          // This ensures that time between complete → uncomplete → complete is not counted
          if (existing.completedAt) {
            const now = new Date();
            const completedAt = new Date(existing.completedAt);
            const timeInCompletedState = now.getTime() - completedAt.getTime();
            updates.totalPausedTime = (existing.totalPausedTime || 0) + timeInCompletedState;
          }
          updates.status = 'active';
          updates.completedAt = null;
        }
      }

      // Handle subtasks update
      if (Array.isArray(subtasks)) {
        // Validate subtasks structure
        const validSubtasks: Subtask[] = subtasks.map((st: any) => {
          if (!st.id || typeof st.text !== 'string' || typeof st.completed !== 'boolean') {
            throw new Error("Invalid subtask structure. Each subtask must have id, text, and completed fields.");
          }
          return {
            id: st.id,
            text: st.text.trim(),
            completed: st.completed,
            createdAt: st.createdAt ? new Date(st.createdAt) : new Date(),
          };
        });
        updates.subtasks = validSubtasks;
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
