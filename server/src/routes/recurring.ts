import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import db, { RecurringTask, Todo } from "../db.js";
import { JWT_SECRET } from "./auth.js";

const router = Router();

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

// Helper to format recurring task for response
function formatRecurringTask(t: RecurringTask) {
  return {
    id: t.id,
    text: t.text,
    frequency: t.frequency,
    customDays: t.custom_days,
    dayOfWeek: t.day_of_week,
    dayOfMonth: t.day_of_month,
    nextDue: t.next_due,
    lastGenerated: t.last_generated,
    isActive: Boolean(t.is_active),
    createdAt: t.created_at,
  };
}

// Calculate next due date based on frequency
function calculateNextDue(
  frequency: string,
  customDays?: number | null,
  dayOfWeek?: number | null,
  dayOfMonth?: number | null,
  fromDate?: Date
): Date {
  const now = fromDate || new Date();
  const next = new Date(now);
  next.setHours(9, 0, 0, 0); // Default to 9 AM

  switch (frequency) {
    case 'daily':
      // If today's time has passed, schedule for tomorrow
      if (now.getHours() >= 9) {
        next.setDate(next.getDate() + 1);
      }
      break;
    
    case 'weekly':
      // Schedule for specific day of week (0-6, Sunday = 0)
      const targetDay = dayOfWeek ?? 1; // Default to Monday
      const currentDay = now.getDay();
      let daysUntilTarget = targetDay - currentDay;
      if (daysUntilTarget <= 0 || (daysUntilTarget === 0 && now.getHours() >= 9)) {
        daysUntilTarget += 7;
      }
      next.setDate(next.getDate() + daysUntilTarget);
      break;
    
    case 'monthly':
      // Schedule for specific day of month (1-31)
      const targetDayOfMonth = dayOfMonth ?? 1;
      next.setDate(targetDayOfMonth);
      // If this month's date has passed, schedule for next month
      if (next <= now) {
        next.setMonth(next.getMonth() + 1);
        next.setDate(targetDayOfMonth);
      }
      break;
    
    case 'custom':
      // Schedule for N days from now
      const days = customDays ?? 1;
      next.setDate(next.getDate() + days);
      break;
  }

  return next;
}

// Apply auth middleware to all routes
router.use(authenticate);

// Get all recurring tasks for user
router.get("/", (req: AuthRequest, res: Response) => {
  try {
    const tasks = db
      .prepare("SELECT * FROM recurring_tasks WHERE user_id = ? ORDER BY created_at DESC")
      .all(req.userId) as RecurringTask[];

    res.json(tasks.map(formatRecurringTask));
  } catch (error) {
    console.error("Get recurring tasks error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create recurring task
router.post("/", (req: AuthRequest, res: Response) => {
  try {
    const { text, frequency, customDays, dayOfWeek, dayOfMonth } = req.body;

    if (!text?.trim()) {
      res.status(400).json({ error: "Text is required" });
      return;
    }

    if (!['daily', 'weekly', 'monthly', 'custom'].includes(frequency)) {
      res.status(400).json({ error: "Invalid frequency. Must be: daily, weekly, monthly, or custom" });
      return;
    }

    if (frequency === 'custom' && (!customDays || customDays < 1)) {
      res.status(400).json({ error: "Custom frequency requires customDays > 0" });
      return;
    }

    if (frequency === 'weekly' && (dayOfWeek === undefined || dayOfWeek < 0 || dayOfWeek > 6)) {
      res.status(400).json({ error: "Weekly frequency requires dayOfWeek (0-6)" });
      return;
    }

    if (frequency === 'monthly' && (dayOfMonth === undefined || dayOfMonth < 1 || dayOfMonth > 31)) {
      res.status(400).json({ error: "Monthly frequency requires dayOfMonth (1-31)" });
      return;
    }

    const nextDue = calculateNextDue(frequency, customDays, dayOfWeek, dayOfMonth);

    const result = db
      .prepare(`
        INSERT INTO recurring_tasks (user_id, text, frequency, custom_days, day_of_week, day_of_month, next_due)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        req.userId,
        text.trim(),
        frequency,
        customDays || null,
        dayOfWeek ?? null,
        dayOfMonth ?? null,
        nextDue.toISOString()
      );

    const task = db.prepare("SELECT * FROM recurring_tasks WHERE id = ?").get(result.lastInsertRowid) as RecurringTask;

    res.status(201).json(formatRecurringTask(task));
  } catch (error) {
    console.error("Create recurring task error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update recurring task
router.patch("/:id", (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { text, frequency, customDays, dayOfWeek, dayOfMonth, isActive } = req.body;

    const existing = db
      .prepare("SELECT * FROM recurring_tasks WHERE id = ? AND user_id = ?")
      .get(id, req.userId) as RecurringTask | undefined;

    if (!existing) {
      res.status(404).json({ error: "Recurring task not found" });
      return;
    }

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (typeof text === "string") {
      updates.push("text = ?");
      values.push(text.trim());
    }

    if (typeof isActive === "boolean") {
      updates.push("is_active = ?");
      values.push(isActive ? 1 : 0);
    }

    // If frequency or schedule parameters changed, recalculate next_due
    let needsRecalculation = false;
    let newFrequency = existing.frequency;
    let newCustomDays = existing.custom_days;
    let newDayOfWeek = existing.day_of_week;
    let newDayOfMonth = existing.day_of_month;

    if (frequency && ['daily', 'weekly', 'monthly', 'custom'].includes(frequency)) {
      updates.push("frequency = ?");
      values.push(frequency);
      newFrequency = frequency;
      needsRecalculation = true;
    }

    if (typeof customDays === "number") {
      updates.push("custom_days = ?");
      values.push(customDays);
      newCustomDays = customDays;
      needsRecalculation = true;
    }

    if (typeof dayOfWeek === "number") {
      updates.push("day_of_week = ?");
      values.push(dayOfWeek);
      newDayOfWeek = dayOfWeek;
      needsRecalculation = true;
    }

    if (typeof dayOfMonth === "number") {
      updates.push("day_of_month = ?");
      values.push(dayOfMonth);
      newDayOfMonth = dayOfMonth;
      needsRecalculation = true;
    }

    if (needsRecalculation) {
      const nextDue = calculateNextDue(newFrequency, newCustomDays, newDayOfWeek, newDayOfMonth);
      updates.push("next_due = ?");
      values.push(nextDue.toISOString());
    }

    if (updates.length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    values.push(Number(id));
    db.prepare(`UPDATE recurring_tasks SET ${updates.join(", ")} WHERE id = ?`).run(...values);

    const updated = db.prepare("SELECT * FROM recurring_tasks WHERE id = ?").get(id) as RecurringTask;
    res.json(formatRecurringTask(updated));
  } catch (error) {
    console.error("Update recurring task error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete recurring task
router.delete("/:id", (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existing = db
      .prepare("SELECT id FROM recurring_tasks WHERE id = ? AND user_id = ?")
      .get(id, req.userId);

    if (!existing) {
      res.status(404).json({ error: "Recurring task not found" });
      return;
    }

    db.prepare("DELETE FROM recurring_tasks WHERE id = ?").run(id);
    res.status(204).send();
  } catch (error) {
    console.error("Delete recurring task error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Generate due tasks (creates todo instances from recurring tasks that are due)
router.post("/generate", (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    
    // Find all active recurring tasks that are due
    const dueTasks = db
      .prepare(`
        SELECT * FROM recurring_tasks 
        WHERE user_id = ? AND is_active = 1 AND next_due <= ?
      `)
      .all(req.userId, now.toISOString()) as RecurringTask[];

    const generatedTodos: Todo[] = [];

    for (const task of dueTasks) {
      // Create a new todo from the recurring task
      const result = db
        .prepare("INSERT INTO todos (user_id, text, status, recurring_task_id) VALUES (?, ?, 'active', ?)")
        .run(req.userId, task.text, task.id);

      const newTodo = db.prepare("SELECT * FROM todos WHERE id = ?").get(result.lastInsertRowid) as Todo;
      generatedTodos.push(newTodo);

      // Calculate and update next_due
      const nextDue = calculateNextDue(
        task.frequency,
        task.custom_days,
        task.day_of_week,
        task.day_of_month,
        now
      );

      db.prepare("UPDATE recurring_tasks SET next_due = ?, last_generated = ? WHERE id = ?")
        .run(nextDue.toISOString(), now.toISOString(), task.id);
    }

    res.json({
      generated: generatedTodos.length,
      todos: generatedTodos.map(t => ({
        id: t.id,
        text: t.text,
        completed: Boolean(t.completed),
        status: t.status || 'active',
        createdAt: t.created_at,
        pausedAt: t.paused_at,
        totalPausedTime: t.total_paused_time || 0,
        completedAt: t.completed_at,
        recurringTaskId: t.recurring_task_id,
      })),
    });
  } catch (error) {
    console.error("Generate recurring tasks error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

