import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase, RecurringTask, Todo, RecurringFrequency } from "../_lib/mongodb.js";
import { getUserFromRequest } from "../_lib/auth.js";

// Helper to format todo for response
function formatTodo(t: Todo) {
  return {
    id: t._id!.toString(),
    text: t.text,
    completed: t.completed,
    status: t.status || 'active',
    createdAt: t.createdAt.toISOString(),
    pausedAt: t.pausedAt?.toISOString() || null,
    totalPausedTime: t.totalPausedTime || 0,
    completedAt: t.completedAt?.toISOString() || null,
    recurringTaskId: t.recurringTaskId || null,
  };
}

// Calculate next due date based on frequency
function calculateNextDue(
  frequency: RecurringFrequency,
  customDays?: number | null,
  dayOfWeek?: number | null,
  dayOfMonth?: number | null,
  fromDate?: Date
): Date {
  const now = fromDate || new Date();
  const next = new Date(now);
  next.setHours(9, 0, 0, 0);

  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    
    case 'weekly':
      const targetDay = dayOfWeek ?? 1;
      const currentDay = now.getDay();
      let daysUntilTarget = targetDay - currentDay;
      if (daysUntilTarget <= 0) {
        daysUntilTarget += 7;
      }
      next.setDate(next.getDate() + daysUntilTarget);
      break;
    
    case 'monthly':
      const targetDayOfMonth = dayOfMonth ?? 1;
      next.setMonth(next.getMonth() + 1);
      next.setDate(targetDayOfMonth);
      break;
    
    case 'custom':
      const days = customDays ?? 1;
      next.setDate(next.getDate() + days);
      break;
  }

  return next;
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

  const { db } = await connectToDatabase();
  const recurringTasks = db.collection<RecurringTask>("recurring_tasks");
  const todos = db.collection<Todo>("todos");

  try {
    const now = new Date();

    // Find all active recurring tasks that are due
    const dueTasks = await recurringTasks
      .find({
        userId: user.userId,
        isActive: true,
        nextDue: { $lte: now },
      })
      .toArray();

    const generatedTodos: Todo[] = [];

    for (const task of dueTasks) {
      // Create a new todo from the recurring task
      const result = await todos.insertOne({
        userId: user.userId,
        text: task.text,
        completed: false,
        status: 'active',
        createdAt: new Date(),
        pausedAt: null,
        totalPausedTime: 0,
        completedAt: null,
        recurringTaskId: task._id!.toString(),
      });

      const newTodo = await todos.findOne({ _id: result.insertedId });
      if (newTodo) {
        generatedTodos.push(newTodo);
      }

      // Calculate and update next_due
      const nextDue = calculateNextDue(
        task.frequency,
        task.customDays,
        task.dayOfWeek,
        task.dayOfMonth,
        now
      );

      await recurringTasks.updateOne(
        { _id: task._id },
        { $set: { nextDue, lastGenerated: now } }
      );
    }

    return res.json({
      generated: generatedTodos.length,
      todos: generatedTodos.map(formatTodo),
    });
  } catch (error) {
    console.error("Generate recurring tasks error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

