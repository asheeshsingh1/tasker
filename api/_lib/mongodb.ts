import { MongoClient, Db, ObjectId } from "mongodb";

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  // Check for environment variable at runtime (important for serverless)
  const MONGODB_URI = process.env.MONGODB_URI;
  
  if (!MONGODB_URI) {
    console.error("MONGODB_URI is not defined in environment variables");
    throw new Error("Please define the MONGODB_URI environment variable");
  }

  // Use cached connection to avoid multiple connections
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  try {
    const client = new MongoClient(MONGODB_URI, {
      // Optimize for serverless
      maxPoolSize: 10,
      minPoolSize: 0,
      maxIdleTimeMS: 10000,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    await client.connect();
    
    const db = client.db("tasker");

    cachedClient = client;
    cachedDb = db;

    console.log("Successfully connected to MongoDB");
    return { client, db };
  } catch (error) {
    console.error("MongoDB connection error:", error);
    throw error;
  }
}

// User type
export interface User {
  _id?: ObjectId;
  email: string;
  password: string;
  name: string;
  createdAt: Date;
}

// Todo status type
export type TodoStatus = 'active' | 'paused' | 'completed';

// Todo type
export interface Todo {
  _id?: ObjectId;
  userId: string;
  text: string;
  completed: boolean;
  status: TodoStatus;
  createdAt: Date;
  pausedAt: Date | null;
  totalPausedTime: number; // milliseconds
  completedAt: Date | null;
  recurringTaskId: string | null;
}

// Recurring task frequency type
export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'custom';

// Completion record for recurring tasks
export interface CompletionRecord {
  scheduledDate: string; // ISO date string (YYYY-MM-DD)
  completedAt: Date | null;
  status: 'completed' | 'missed' | 'pending' | 'paused' | 'in_progress';
  startedAt: Date | null; // when user clicked "Start"
  pausedAt: Date | null;
  totalPausedTime: number; // milliseconds
  timeTaken: number | null; // milliseconds - completedAt - startedAt - totalPausedTime
}

// Recurring task type
export interface RecurringTask {
  _id?: ObjectId;
  userId: string;
  text: string;
  frequency: RecurringFrequency;
  customDays: number | null;
  dayOfWeek: number | null; // 0-6, Sunday = 0
  dayOfMonth: number | null; // 1-31
  nextDue: Date;
  lastGenerated: Date | null;
  isActive: boolean;
  createdAt: Date;
  completions: CompletionRecord[]; // History of completions
}

// Re-export ObjectId for convenience
export { ObjectId };

