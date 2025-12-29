import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ObjectId } from "mongodb";
import { connectToDatabase, User, UserPreferences } from "./_lib/mongodb.js";
import { getUserFromRequest } from "./_lib/auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { db } = await connectToDatabase();
  const users = db.collection<User>("users");

  try {
    // Handle OPTIONS for CORS preflight
    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    // GET - Retrieve user settings
    if (req.method === "GET") {
      const userDoc = await users.findOne(
        { _id: new ObjectId(user.userId) },
        { projection: { preferences: 1 } }
      );

      if (!userDoc) {
        return res.status(404).json({ error: "User not found" });
      }

      // Return preferences with defaults
      const preferences: UserPreferences = {
        autoCompleteRecurring: false,
        theme: 'light',
        ...userDoc.preferences,
      };

      return res.json({ preferences });
    }

    // PATCH - Update user settings
    if (req.method === "PATCH") {
      const { preferences } = req.body;

      if (!preferences || typeof preferences !== "object") {
        return res.status(400).json({ error: "Preferences object is required" });
      }

      // Validate preferences
      const updates: Partial<UserPreferences> = {};
      
      if (preferences.autoCompleteRecurring !== undefined) {
        if (typeof preferences.autoCompleteRecurring !== "boolean") {
          return res.status(400).json({ error: "autoCompleteRecurring must be a boolean" });
        }
        updates.autoCompleteRecurring = preferences.autoCompleteRecurring;
      }

      if (preferences.theme !== undefined) {
        if (preferences.theme !== 'light' && preferences.theme !== 'dark') {
          return res.status(400).json({ error: "theme must be 'light' or 'dark'" });
        }
        updates.theme = preferences.theme;
      }

      // Get existing preferences first
      const existingUser = await users.findOne({ _id: new ObjectId(user.userId) });
      const existingPreferences = existingUser?.preferences || {};

      // Merge preferences
      const mergedPreferences = {
        ...existingPreferences,
        ...updates,
      };

      // Update user preferences in database
      const updateResult = await users.updateOne(
        { _id: new ObjectId(user.userId) },
        { 
          $set: { 
            preferences: mergedPreferences
          } 
        }
      );

      // Log for debugging
      console.log('Settings update result:', {
        userId: user.userId,
        matched: updateResult.matchedCount,
        modified: updateResult.modifiedCount,
        preferences: mergedPreferences
      });

      // Return updated preferences with defaults
      const finalPreferences: UserPreferences = {
        autoCompleteRecurring: false,
        theme: 'light',
        ...mergedPreferences,
      };

      return res.json({ preferences: finalPreferences });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("User settings error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

