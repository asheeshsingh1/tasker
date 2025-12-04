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
    const client = new MongoClient(MONGODB_URI);
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

// Todo type
export interface Todo {
  _id?: ObjectId;
  userId: string;
  text: string;
  completed: boolean;
  createdAt: Date;
  completedAt: Date | null;
}

// Re-export ObjectId for convenience
export { ObjectId };

