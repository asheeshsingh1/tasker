import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "data.db");

const db = new Database(dbPath);

// Enable foreign keys
db.pragma("foreign_keys = ON");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);

  -- Recurring tasks table
  CREATE TABLE IF NOT EXISTS recurring_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    frequency TEXT NOT NULL CHECK(frequency IN ('daily', 'weekly', 'monthly', 'custom')),
    custom_days INTEGER DEFAULT NULL,
    day_of_week INTEGER DEFAULT NULL,
    day_of_month INTEGER DEFAULT NULL,
    next_due DATETIME NOT NULL,
    last_generated DATETIME DEFAULT NULL,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_recurring_tasks_user_id ON recurring_tasks(user_id);
  CREATE INDEX IF NOT EXISTS idx_recurring_tasks_next_due ON recurring_tasks(next_due);
`);

// Add new columns to todos table if they don't exist (migration)
try {
  db.exec(`ALTER TABLE todos ADD COLUMN status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed'))`);
} catch { /* Column already exists */ }

try {
  db.exec(`ALTER TABLE todos ADD COLUMN paused_at DATETIME DEFAULT NULL`);
} catch { /* Column already exists */ }

try {
  db.exec(`ALTER TABLE todos ADD COLUMN total_paused_time INTEGER DEFAULT 0`);
} catch { /* Column already exists */ }

try {
  db.exec(`ALTER TABLE todos ADD COLUMN completed_at DATETIME DEFAULT NULL`);
} catch { /* Column already exists */ }

try {
  db.exec(`ALTER TABLE todos ADD COLUMN recurring_task_id INTEGER DEFAULT NULL REFERENCES recurring_tasks(id) ON DELETE SET NULL`);
} catch { /* Column already exists */ }

export default db;

// Type definitions
export interface User {
  id: number;
  email: string;
  password: string;
  name: string;
  created_at: string;
}

export interface Todo {
  id: number;
  user_id: number;
  text: string;
  completed: number; // SQLite stores booleans as 0/1
  status: 'active' | 'paused' | 'completed';
  created_at: string;
  paused_at: string | null;
  total_paused_time: number; // milliseconds
  completed_at: string | null;
  recurring_task_id: number | null;
}

export interface RecurringTask {
  id: number;
  user_id: number;
  text: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'custom';
  custom_days: number | null;
  day_of_week: number | null; // 0-6, Sunday = 0
  day_of_month: number | null; // 1-31
  next_due: string;
  last_generated: string | null;
  is_active: number; // SQLite boolean
  created_at: string;
}

