import { MongoClient, Db } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI!;

if (!MONGODB_URI) {
  throw new Error("Please define the MONGODB_URI environment variable");
}

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  // Use cached connection in development to avoid multiple connections
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  
  const db = client.db("tasker");

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

// User type
export interface User {
  _id?: string;
  email: string;
  password: string;
  name: string;
  createdAt: Date;
}

// Todo type
export interface Todo {
  _id?: string;
  userId: string;
  text: string;
  completed: boolean;
  createdAt: Date;
  completedAt: Date | null;
}

