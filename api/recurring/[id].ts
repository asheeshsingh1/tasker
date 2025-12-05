import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ObjectId } from "mongodb";
import { connectToDatabase, RecurringTask, RecurringFrequency } from "../_lib/mongodb.js";
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Authenticate
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
    // Check ownership
    const existing = await recurringTasks.findOne({
      _id: new ObjectId(id),
      userId: user.userId,
    });

    if (!existing) {
      return res.status(404).json({ error: "Recurring task not found" });
    }

    // PATCH - Update recurring task
    if (req.method === "PATCH") {
      const { text, frequency, customDays, dayOfWeek, dayOfMonth, isActive } = req.body;
      const updates: Partial<RecurringTask> = {};

      if (typeof text === "string") {
        updates.text = text.trim();
      }

      if (typeof isActive === "boolean") {
        updates.isActive = isActive;
      }

      // Track if we need to recalculate nextDue
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

