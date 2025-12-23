import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ObjectId } from "mongodb";
import { connectToDatabase, RecurringTask, RecurringFrequency } from "../_lib/mongodb.js";
import { getUserFromRequest } from "../_lib/auth.js";

// Get today's date as YYYY-MM-DD string (using client date if provided)
function getTodayString(clientDate?: string): string {
  if (clientDate && /^\d{4}-\d{2}-\d{2}$/.test(clientDate)) {
    return clientDate;
  }
  // Fallback to server's local date (should rarely be used since client always sends date)
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

// Parse client date to get day of week and day of month
function parseClientDate(clientDate?: string): { dayOfWeek: number; dayOfMonth: number } {
  if (clientDate && /^\d{4}-\d{2}-\d{2}$/.test(clientDate)) {
    // Parse the date string directly to avoid timezone issues
    const [year, month, day] = clientDate.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    return {
      dayOfWeek: date.getDay(),
      dayOfMonth: day,
    };
  }
  const now = new Date();
  return {
    dayOfWeek: now.getDay(),
    dayOfMonth: now.getDate(),
  };
}

// Check if today is a valid day for this recurring task
function isTodayScheduled(task: RecurringTask, clientDate?: string): boolean {
  const { dayOfWeek, dayOfMonth } = parseClientDate(clientDate);

  switch (task.frequency) {
    case 'daily':
      return true;
    case 'weekly':
      return task.dayOfWeek === dayOfWeek;
    case 'monthly':
      return task.dayOfMonth === dayOfMonth;
    default:
      return true;
  }
}

// Check if today is a valid day to complete this recurring task (with reason)
function canCompleteToday(task: RecurringTask, clientDate?: string): { canComplete: boolean; reason?: string } {
  const { dayOfWeek, dayOfMonth } = parseClientDate(clientDate);

  switch (task.frequency) {
    case 'daily':
      return { canComplete: true };
    case 'weekly':
      if (task.dayOfWeek === dayOfWeek) {
        return { canComplete: true };
      }
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return { 
        canComplete: false, 
        reason: `This task can only be completed on ${dayNames[task.dayOfWeek ?? 0]}` 
      };
    case 'monthly':
      if (task.dayOfMonth === dayOfMonth) {
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

// Action handlers
async function handleStart(existing: RecurringTask, recurringTasks: any, clientDate?: string): Promise<RecurringTask> {
  if (!isTodayScheduled(existing, clientDate)) {
    throw new Error("Today is not a scheduled day for this task");
  }

  const todayStr = getTodayString(clientDate);
  const completions = existing.completions || [];
  const existingCompletion = completions.find(c => c.scheduledDate === todayStr);

  if (existingCompletion?.status === 'completed') {
    throw new Error("Task already completed for today");
  }
  if (existingCompletion?.status === 'in_progress' || existingCompletion?.status === 'paused') {
    throw new Error("Task already started");
  }

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

  completions.sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));

  await recurringTasks.updateOne(
    { _id: existing._id },
    { $set: { completions } }
  );

  return await recurringTasks.findOne({ _id: existing._id });
}

async function handlePause(existing: RecurringTask, recurringTasks: any, clientDate?: string): Promise<RecurringTask> {
  if (!isTodayScheduled(existing, clientDate)) {
    throw new Error("Today is not a scheduled day for this task");
  }

  const todayStr = getTodayString(clientDate);
  const completions = existing.completions || [];
  const existingCompletion = completions.find(c => c.scheduledDate === todayStr);

  if (existingCompletion?.status === 'completed') {
    throw new Error("Task already completed for today");
  }
  if (existingCompletion?.status === 'paused') {
    throw new Error("Task is already paused");
  }
  if (!existingCompletion || existingCompletion.status !== 'in_progress') {
    throw new Error("Task must be started before pausing");
  }

  const existingIndex = completions.findIndex(c => c.scheduledDate === todayStr);
  
  completions[existingIndex] = {
    ...completions[existingIndex],
    status: 'paused',
    pausedAt: new Date(),
  };

  completions.sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));

  await recurringTasks.updateOne(
    { _id: existing._id },
    { $set: { completions } }
  );

  return await recurringTasks.findOne({ _id: existing._id });
}

async function handleResume(existing: RecurringTask, recurringTasks: any, clientDate?: string): Promise<RecurringTask> {
  const todayStr = getTodayString(clientDate);
  const completions = existing.completions || [];
  const existingIndex = completions.findIndex(c => c.scheduledDate === todayStr);
  const existingCompletion = existingIndex >= 0 ? completions[existingIndex] : null;

  if (!existingCompletion || existingCompletion.status !== 'paused') {
    throw new Error("Task is not paused");
  }

  const pausedAt = existingCompletion.pausedAt ? new Date(existingCompletion.pausedAt) : new Date();
  const pausedDuration = Date.now() - pausedAt.getTime();
  const totalPausedTime = (existingCompletion.totalPausedTime || 0) + pausedDuration;

  completions[existingIndex] = {
    ...completions[existingIndex],
    status: 'in_progress',
    pausedAt: null,
    totalPausedTime,
  };

  completions.sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));

  await recurringTasks.updateOne(
    { _id: existing._id },
    { $set: { completions } }
  );

  return await recurringTasks.findOne({ _id: existing._id });
}

async function handleComplete(existing: RecurringTask, recurringTasks: any, clientDate?: string): Promise<RecurringTask> {
  if (!existing.isActive) {
    throw new Error("Cannot complete an inactive recurring task");
  }

  const { canComplete, reason } = canCompleteToday(existing, clientDate);
  if (!canComplete) {
    throw new Error(reason);
  }

  const todayStr = getTodayString(clientDate);
  const completions = existing.completions || [];
  const existingCompletion = completions.find(c => c.scheduledDate === todayStr);

  if (existingCompletion?.status === 'completed') {
    throw new Error("Task already completed for today");
  }
  if (existingCompletion?.status === 'paused') {
    throw new Error("Cannot complete a paused task. Resume it first.");
  }
  if (!existingCompletion || existingCompletion.status !== 'in_progress') {
    throw new Error("Task must be started before marking complete");
  }

  const existingIndex = completions.findIndex(c => c.scheduledDate === todayStr);
  const totalPausedTime = existingCompletion.totalPausedTime || 0;
  const startedAt = existingCompletion.startedAt;
  
  if (!startedAt) {
    throw new Error("Task must be started before marking complete");
  }
  
  const now = new Date();
  // Calculate timeTaken, ensuring it's never negative (safeguard against edge cases)
  const timeTaken = Math.max(0, now.getTime() - new Date(startedAt).getTime() - totalPausedTime);
  
  completions[existingIndex] = {
    ...completions[existingIndex],
    completedAt: now,
    status: 'completed',
    pausedAt: null,
    totalPausedTime,
    timeTaken,
  };

  completions.sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));

  await recurringTasks.updateOne(
    { _id: existing._id },
    { $set: { completions } }
  );

  return await recurringTasks.findOne({ _id: existing._id });
}

async function handleUncomplete(existing: RecurringTask, recurringTasks: any, clientDate?: string): Promise<RecurringTask> {
  const todayStr = getTodayString(clientDate);
  const completions = existing.completions || [];
  const existingIndex = completions.findIndex(c => c.scheduledDate === todayStr);
  const existingCompletion = existingIndex >= 0 ? completions[existingIndex] : null;

  if (!existingCompletion || existingCompletion.status !== 'completed') {
    throw new Error("Task is not completed for today");
  }

  // When uncompleting, we need to exclude the time spent in completed state from future timeTaken calculations.
  // We do this by adding it to totalPausedTime, which gets subtracted in the timeTaken formula.
  // This ensures timeTaken only includes actual in-progress time, not time spent in completed state.
  const now = new Date();
  const completedAt = existingCompletion.completedAt ? new Date(existingCompletion.completedAt) : now;
  const timeInCompletedState = now.getTime() - completedAt.getTime();
  const newTotalPausedTime = (existingCompletion.totalPausedTime || 0) + timeInCompletedState;

  completions[existingIndex] = {
    ...completions[existingIndex],
    completedAt: null,
    status: 'in_progress',
    timeTaken: null,
    // Add completed time to totalPausedTime so it's excluded from timeTaken calculation
    totalPausedTime: newTotalPausedTime,
  };

  completions.sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));

  await recurringTasks.updateOne(
    { _id: existing._id },
    { $set: { completions } }
  );

  return await recurringTasks.findOne({ _id: existing._id });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

    // POST - Handle actions (start, pause, resume, complete, uncomplete)
    if (req.method === "POST") {
      const { action, clientDate } = req.body;
      
      if (!action) {
        return res.status(400).json({ error: "Action is required" });
      }

      try {
        let updated: RecurringTask;
        
        switch (action) {
          case 'start':
            updated = await handleStart(existing, recurringTasks, clientDate);
            break;
          case 'pause':
            updated = await handlePause(existing, recurringTasks, clientDate);
            break;
          case 'resume':
            updated = await handleResume(existing, recurringTasks, clientDate);
            break;
          case 'complete':
            updated = await handleComplete(existing, recurringTasks, clientDate);
            break;
          case 'uncomplete':
            updated = await handleUncomplete(existing, recurringTasks, clientDate);
            break;
          default:
            return res.status(400).json({ error: `Unknown action: ${action}` });
        }
        
        return res.json(formatRecurringTask(updated));
      } catch (err: any) {
        return res.status(400).json({ error: err.message });
      }
    }

    // PATCH - Update recurring task
    if (req.method === "PATCH") {
      const { text, frequency, customDays, dayOfWeek, dayOfMonth, isActive, clientDate } = req.body;
      const updates: Partial<RecurringTask> = {};

      if (typeof text === "string") {
        updates.text = text.trim();
      }

      if (typeof isActive === "boolean") {
        updates.isActive = isActive;
      }

      let needsRecalculation = false;
      let newFrequency = existing.frequency;
      let newCustomDays = existing.customDays;
      let newDayOfWeek = existing.dayOfWeek;
      let newDayOfMonth = existing.dayOfMonth;

      if (frequency && ['daily', 'weekly', 'monthly', 'custom'].includes(frequency)) {
        updates.frequency = frequency;
        newFrequency = frequency;
        needsRecalculation = true;
      }

      if (typeof customDays === "number") {
        updates.customDays = customDays;
        newCustomDays = customDays;
        needsRecalculation = true;
      }

      if (typeof dayOfWeek === "number") {
        updates.dayOfWeek = dayOfWeek;
        newDayOfWeek = dayOfWeek;
        needsRecalculation = true;
      }

      if (typeof dayOfMonth === "number") {
        updates.dayOfMonth = dayOfMonth;
        newDayOfMonth = dayOfMonth;
        needsRecalculation = true;
      }

      if (needsRecalculation) {
        updates.nextDue = calculateNextDue(newFrequency, newCustomDays, newDayOfWeek, newDayOfMonth);
        
        // Check if today is still a scheduled day with the new frequency
        // If not, remove any incomplete completion record for today
        const todayStr = getTodayString(clientDate);
        const newTaskSchedule: RecurringTask = {
          ...existing,
          frequency: newFrequency,
          customDays: newCustomDays,
          dayOfWeek: newDayOfWeek,
          dayOfMonth: newDayOfMonth,
        };
        
        const isTodayStillScheduled = isTodayScheduled(newTaskSchedule, clientDate);
        
        if (!isTodayStillScheduled) {
          // Remove any incomplete completion record for today (pending, in_progress, paused)
          const completions = existing.completions || [];
          const todayCompletionIndex = completions.findIndex(c => c.scheduledDate === todayStr);
          
          if (todayCompletionIndex >= 0) {
            const todayCompletion = completions[todayCompletionIndex];
            // Only remove if it's not completed (we want to preserve completed records)
            if (todayCompletion.status !== 'completed') {
              completions.splice(todayCompletionIndex, 1);
              updates.completions = completions;
            }
          }
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      await recurringTasks.updateOne({ _id: new ObjectId(id) }, { $set: updates });

      const updated = await recurringTasks.findOne({ _id: new ObjectId(id) });
      return res.json(formatRecurringTask(updated!));
    }

    // DELETE - Delete recurring task
    if (req.method === "DELETE") {
      await recurringTasks.deleteOne({ _id: new ObjectId(id) });
      return res.status(204).send(null);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Recurring task [id] error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
