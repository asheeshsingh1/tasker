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

  const { db } = await connectToDatabase();
  const todos = db.collection<Todo>("todos");

  try {
    // GET - List all todos for user
    if (req.method === "GET") {
      const userTodos = await todos
        .find({ userId: user.userId })
        .sort({ createdAt: -1 })
        .toArray();

      const formatted = userTodos.map((t) => ({
        id: t._id!.toString(),
        text: t.text,
        completed: t.completed,
        createdAt: t.createdAt.toISOString(),
        completedAt: t.completedAt?.toISOString() || null,
      }));

      return res.json(formatted);
    }

    // POST - Create new todo
    if (req.method === "POST") {
      const { text } = req.body;

      if (!text?.trim()) {
        return res.status(400).json({ error: "Text is required" });
      }

      const result = await todos.insertOne({
        userId: user.userId,
        text: text.trim(),
        completed: false,
        createdAt: new Date(),
        completedAt: null,
      });

      const newTodo = await todos.findOne({ _id: result.insertedId });

      return res.status(201).json({
        id: newTodo!._id!.toString(),
        text: newTodo!.text,
        completed: newTodo!.completed,
        createdAt: newTodo!.createdAt.toISOString(),
        completedAt: newTodo!.completedAt?.toISOString() || null,
      });
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

