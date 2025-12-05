import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectToDatabase, RecurringTask, RecurringFrequency, CompletionRecord } from "../_lib/mongodb.js";
import { getUserFromRequest } from "../_lib/auth.js";

// Helper to format recurring task for response
function formatRecurringTask(t: RecurringTask) {
  return {
    id: t._id!.toString(),
    text: t.text,
    frequency: t.frequency,
    customDays: t.customDays,
    dayOfWeek: t.dayOfWeek,
    dayOfMonth: t.dayOfMonth,
    nextDue: t.nextDue.toISOString(),
    lastGenerated: t.lastGenerated?.toISOString() || null,
    isActive: t.isActive,
    createdAt: t.createdAt.toISOString(),
    completions: (t.completions || []).map(c => ({
      scheduledDate: c.scheduledDate,
      completedAt: c.completedAt?.toISOString() || null,
      status: c.status,
      startedAt: c.startedAt?.toISOString() || null,
      pausedAt: c.pausedAt?.toISOString() || null,
      totalPausedTime: c.totalPausedTime || 0,
      timeTaken: c.timeTaken ?? null,
    })),
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
  next.setHours(9, 0, 0, 0); // Default to 9 AM

  switch (frequency) {
    case 'daily':
      if (now.getHours() >= 9) {
        next.setDate(next.getDate() + 1);
      }
      break;
    
    case 'weekly':
      const targetDay = dayOfWeek ?? 1;
      const currentDay = now.getDay();
      let daysUntilTarget = targetDay - currentDay;
      if (daysUntilTarget <= 0 || (daysUntilTarget === 0 && now.getHours() >= 9)) {
        daysUntilTarget += 7;
      }
      next.setDate(next.getDate() + daysUntilTarget);
      break;
    
    case 'monthly':
      const targetDayOfMonth = dayOfMonth ?? 1;
      next.setDate(targetDayOfMonth);
      if (next <= now) {
        next.setMonth(next.getMonth() + 1);
        next.setDate(targetDayOfMonth);
      }
      break;
    
    case 'custom':
      const days = customDays ?? 1;
      next.setDate(next.getDate() + days);
      break;
  }

  return next;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Authenticate
  const user = getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { db } = await connectToDatabase();
  const recurringTasks = db.collection<RecurringTask>("recurring_tasks");

  try {
    // GET - List all recurring tasks for user
    if (req.method === "GET") {
      const tasks = await recurringTasks
        .find({ userId: user.userId })
        .sort({ createdAt: -1 })
        .toArray();

      // Mark incomplete past tasks as "missed"
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      for (const task of tasks) {
        if (task.completions && task.completions.length > 0) {
          let needsUpdate = false;
          const updatedCompletions = task.completions.map(completion => {
            const completionDateStr = new Date(completion.scheduledDate).toISOString().split('T')[0];
            // If it's a past date and status is not 'completed' or 'missed', mark as 'missed'
            if (completionDateStr < todayStr && completion.status !== 'completed' && completion.status !== 'missed') {
              needsUpdate = true;
              return {
                ...completion,
                status: 'missed' as const,
                pausedAt: null,
                timeTaken: null,
              };
            }
            return completion;
          });

          if (needsUpdate) {
            await recurringTasks.updateOne(
              { _id: task._id },
              { $set: { completions: updatedCompletions } }
            );
            task.completions = updatedCompletions;
          }
        }
      }

      return res.json(tasks.map(formatRecurringTask));
    }

    // POST - Create new recurring task
    if (req.method === "POST") {
      const { text, frequency, customDays, dayOfWeek, dayOfMonth } = req.body;

      if (!text?.trim()) {
        return res.status(400).json({ error: "Text is required" });
      }

      if (!['daily', 'weekly', 'monthly', 'custom'].includes(frequency)) {
        return res.status(400).json({ error: "Invalid frequency" });
      }

      if (frequency === 'custom' && (!customDays || customDays < 1)) {
        return res.status(400).json({ error: "Custom frequency requires customDays > 0" });
      }

      if (frequency === 'weekly' && (dayOfWeek === undefined || dayOfWeek < 0 || dayOfWeek > 6)) {
        return res.status(400).json({ error: "Weekly frequency requires dayOfWeek (0-6)" });
      }

      if (frequency === 'monthly' && (dayOfMonth === undefined || dayOfMonth < 1 || dayOfMonth > 31)) {
        return res.status(400).json({ error: "Monthly frequency requires dayOfMonth (1-31)" });
      }

      const nextDue = calculateNextDue(frequency, customDays, dayOfWeek, dayOfMonth);

      const result = await recurringTasks.insertOne({
        userId: user.userId,
        text: text.trim(),
        frequency,
        customDays: customDays || null,
        dayOfWeek: dayOfWeek ?? null,
        dayOfMonth: dayOfMonth ?? null,
        nextDue,
        lastGenerated: null,
        isActive: true,
        createdAt: new Date(),
        completions: [],
      });

      const newTask = await recurringTasks.findOne({ _id: result.insertedId });

      return res.status(201).json(formatRecurringTask(newTask!));
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Recurring tasks error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

