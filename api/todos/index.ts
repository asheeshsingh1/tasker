import type { VercelRequest, VercelResponse } from "@vercel/node";
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
    subtasks: (t.subtasks || []).map(st => ({
      id: st.id,
      text: st.text,
      completed: st.completed,
      createdAt: st.createdAt.toISOString(),
    })),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Authenticate
  const user = getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { db } = await connectToDatabase();
  const todos = db.collection<Todo>("todos");

  try {
    // GET - List all todos for user
    if (req.method === "GET") {
      const userTodos = await todos
        .find({ userId: user.userId })
        .sort({ createdAt: -1 })
        .toArray();

      return res.json(userTodos.map(formatTodo));
    }

    // POST - Create new todo
    if (req.method === "POST") {
      const { text, recurringTaskId } = req.body;

      if (!text?.trim()) {
        return res.status(400).json({ error: "Text is required" });
      }

      const result = await todos.insertOne({
        userId: user.userId,
        text: text.trim(),
        completed: false,
        status: 'active',
        createdAt: new Date(),
        pausedAt: null,
        totalPausedTime: 0,
        completedAt: null,
        recurringTaskId: recurringTaskId || null,
        subtasks: [],
      });

      const newTodo = await todos.findOne({ _id: result.insertedId });

      return res.status(201).json(formatTodo(newTodo!));
    }

    // DELETE - Clear all completed todos for user
    if (req.method === "DELETE") {
      await todos.deleteMany({ userId: user.userId, completed: true });
      return res.status(204).send(null);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Todos error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

