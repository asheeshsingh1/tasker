import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import db, { Todo } from "../db.js";
import { JWT_SECRET } from "./auth.js";

const router = Router();

// Extend Request type to include userId
interface AuthRequest extends Request {
  userId?: number;
}

// Auth middleware
function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// Apply auth middleware to all routes
router.use(authenticate);

// Get all todos for user
router.get("/", (req: AuthRequest, res: Response) => {
  try {
    const todos = db
      .prepare("SELECT * FROM todos WHERE user_id = ? ORDER BY created_at DESC")
      .all(req.userId) as Todo[];

    // Convert SQLite integers to booleans
    const formatted = todos.map((t) => ({
      id: t.id,
      text: t.text,
      completed: Boolean(t.completed),
      createdAt: t.created_at,
    }));

    res.json(formatted);
  } catch (error) {
    console.error("Get todos error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create todo
router.post("/", (req: AuthRequest, res: Response) => {
  try {
    const { text } = req.body;

    if (!text?.trim()) {
      res.status(400).json({ error: "Text is required" });
      return;
    }

    const result = db
      .prepare("INSERT INTO todos (user_id, text) VALUES (?, ?)")
      .run(req.userId, text.trim());

    const todo = db.prepare("SELECT * FROM todos WHERE id = ?").get(result.lastInsertRowid) as Todo;

    res.status(201).json({
      id: todo.id,
      text: todo.text,
      completed: Boolean(todo.completed),
      createdAt: todo.created_at,
    });
  } catch (error) {
    console.error("Create todo error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update todo (toggle completed or update text)
router.patch("/:id", (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { text, completed } = req.body;

    // Check ownership
    const existing = db
      .prepare("SELECT * FROM todos WHERE id = ? AND user_id = ?")
      .get(id, req.userId) as Todo | undefined;

    if (!existing) {
      res.status(404).json({ error: "Todo not found" });
      return;
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (typeof text === "string") {
      updates.push("text = ?");
      values.push(text.trim());
    }

    if (typeof completed === "boolean") {
      updates.push("completed = ?");
      values.push(completed ? 1 : 0);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    values.push(Number(id));

    db.prepare(`UPDATE todos SET ${updates.join(", ")} WHERE id = ?`).run(...values);

    const updated = db.prepare("SELECT * FROM todos WHERE id = ?").get(id) as Todo;

    res.json({
      id: updated.id,
      text: updated.text,
      completed: Boolean(updated.completed),
      createdAt: updated.created_at,
    });
  } catch (error) {
    console.error("Update todo error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete todo
router.delete("/:id", (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Check ownership
    const existing = db
      .prepare("SELECT id FROM todos WHERE id = ? AND user_id = ?")
      .get(id, req.userId);

    if (!existing) {
      res.status(404).json({ error: "Todo not found" });
      return;
    }

    db.prepare("DELETE FROM todos WHERE id = ?").run(id);

    res.status(204).send();
  } catch (error) {
    console.error("Delete todo error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete all completed todos
router.delete("/", (req: AuthRequest, res: Response) => {
  try {
    db.prepare("DELETE FROM todos WHERE user_id = ? AND completed = 1").run(req.userId);
    res.status(204).send();
  } catch (error) {
    console.error("Clear completed error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

