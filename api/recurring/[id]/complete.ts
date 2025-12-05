import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ObjectId } from "mongodb";
import { connectToDatabase, RecurringTask, CompletionRecord } from "../../_lib/mongodb.js";
import { getUserFromRequest } from "../../_lib/auth.js";

// Get today's date as YYYY-MM-DD string
function getTodayString(): string {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

// Check if today is a valid day to complete this recurring task
function canCompleteToday(task: RecurringTask): { canComplete: boolean; reason?: string } {
  const now = new Date();
  const today = now.getDay(); // 0-6, Sunday = 0
  const todayDate = now.getDate(); // 1-31

  switch (task.frequency) {
    case 'daily':
      return { canComplete: true };
    
    case 'weekly':
      if (task.dayOfWeek === today) {
        return { canComplete: true };
      }
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return { 
        canComplete: false, 
        reason: `This task can only be completed on ${dayNames[task.dayOfWeek ?? 0]}` 
      };
    
    case 'monthly':
      if (task.dayOfMonth === todayDate) {
        return { canComplete: true };
      }
      return { 
        canComplete: false, 
        reason: `This task can only be completed on day ${task.dayOfMonth} of the month` 
      };
    
    default:
      return { canComplete: true };
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

    if (!existing.isActive) {
      return res.status(400).json({ error: "Cannot complete an inactive recurring task" });
    }

    // Check if today is a valid completion day
    const { canComplete, reason } = canCompleteToday(existing);
    if (!canComplete) {
      return res.status(400).json({ error: reason });
    }

    const todayStr = getTodayString();
    const completions = existing.completions || [];

    // Check if already completed today
    const existingCompletion = completions.find(c => c.scheduledDate === todayStr);
    if (existingCompletion?.status === 'completed') {
      return res.status(400).json({ error: "Task already completed for today" });
    }

    // Check if task is paused
    if (existingCompletion?.status === 'paused') {
      return res.status(400).json({ error: "Cannot complete a paused task. Resume it first." });
    }

    // Check if task has been started (must be in_progress to complete)
    if (!existingCompletion || existingCompletion.status !== 'in_progress') {
      return res.status(400).json({ error: "Task must be started before marking complete" });
    }

    // Add or update today's completion
    const existingIndex = completions.findIndex(c => c.scheduledDate === todayStr);
    const totalPausedTime = existingCompletion.totalPausedTime || 0;
    const startedAt = existingCompletion.startedAt;
    
    if (!startedAt) {
      return res.status(400).json({ error: "Task must be started before marking complete" });
    }
    
    // Calculate time taken: completedAt - startedAt - totalPausedTime
    const now = new Date();
    const timeTaken = now.getTime() - new Date(startedAt).getTime() - totalPausedTime;
    
    completions[existingIndex] = {
      ...completions[existingIndex],
      completedAt: now,
      status: 'completed',
      pausedAt: null,
      totalPausedTime,
      timeTaken,
    };

    // Sort completions by date (newest first)
    completions.sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));

    await recurringTasks.updateOne(
      { _id: new ObjectId(id) },
      { $set: { completions } }
    );

    const updated = await recurringTasks.findOne({ _id: new ObjectId(id) });
    return res.json(formatRecurringTask(updated!));
  } catch (error) {
    console.error("Complete recurring task error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

