import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ObjectId } from "mongodb";
import { connectToDatabase, RecurringTask } from "../../_lib/mongodb.js";
import { getUserFromRequest } from "../../_lib/auth.js";

// Get today's date as YYYY-MM-DD string
function getTodayString(): string {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

// Check if today is a valid day for this recurring task
function isTodayScheduled(task: RecurringTask): boolean {
  const now = new Date();
  const today = now.getDay(); // 0-6, Sunday = 0
  const todayDate = now.getDate(); // 1-31

  switch (task.frequency) {
    case 'daily':
      return true;
    case 'weekly':
      return task.dayOfWeek === today;
    case 'monthly':
      return task.dayOfMonth === todayDate;
    default:
      return true;
  }
}

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { id } = req.query;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "Invalid recurring task ID" });
  }

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid recurring task ID format" });
  }

  const { db } = await connectToDatabase();
  const recurringTasks = db.collection<RecurringTask>("recurring_tasks");

  try {
    const existing = await recurringTasks.findOne({
      _id: new ObjectId(id),
      userId: user.userId,
    });

    if (!existing) {
      return res.status(404).json({ error: "Recurring task not found" });
    }

    // Check if today is a scheduled day
    if (!isTodayScheduled(existing)) {
      return res.status(400).json({ error: "Today is not a scheduled day for this task" });
    }

    const todayStr = getTodayString();
    const completions = existing.completions || [];
    const existingCompletion = completions.find(c => c.scheduledDate === todayStr);

    // Check if already started or completed
    if (existingCompletion?.status === 'completed') {
      return res.status(400).json({ error: "Task already completed for today" });
    }

    if (existingCompletion?.status === 'in_progress' || existingCompletion?.status === 'paused') {
      return res.status(400).json({ error: "Task already started" });
    }

    // Add or update today's completion to in_progress with startedAt
    const existingIndex = completions.findIndex(c => c.scheduledDate === todayStr);
    const now = new Date();
    
    if (existingIndex >= 0) {
      completions[existingIndex] = {
        ...completions[existingIndex],
        status: 'in_progress',
        startedAt: now,
        pausedAt: null,
        totalPausedTime: 0,
      };
    } else {
      completions.push({
        scheduledDate: todayStr,
        completedAt: null,
        status: 'in_progress',
        startedAt: now,
        pausedAt: null,
        totalPausedTime: 0,
        timeTaken: null,
      });
    }

    // Sort completions by date (newest first)
    completions.sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));

    await recurringTasks.updateOne(
      { _id: new ObjectId(id) },
      { $set: { completions } }
    );

    const updated = await recurringTasks.findOne({ _id: new ObjectId(id) });
    return res.json(formatRecurringTask(updated!));
  } catch (error) {
    console.error("Start recurring task error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

