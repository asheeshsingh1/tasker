const API_BASE = "/api";

export function getToken(): string | null {
  return localStorage.getItem("token");
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem("token", token);
  } else {
    localStorage.removeItem("token");
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

// Auth API
export interface User {
  id: string;
  email: string;
  name: string;
}

export interface AuthResponse {
  token: string;
  user: User;
  encryptionSalt: string;
}

export interface SendOtpResponse {
  message: string;
  email: string;
}

export const auth = {
  sendOtp: (email: string) =>
    request<SendOtpResponse>("/auth/send-otp", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  verifyOtp: (email: string, otp: string, password: string, name: string) =>
    request<AuthResponse>("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email, otp, password, name }),
    }),

  register: (email: string, password: string, name: string) =>
    request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),

  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<{ user: User }>("/auth/me"),
};

// Todo status type
export type TodoStatus = 'active' | 'paused' | 'completed';

// Todos API
export interface Subtask {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
}

export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  status: TodoStatus;
  createdAt: string;
  pausedAt: string | null;
  totalPausedTime: number;
  completedAt: string | null;
  recurringTaskId: number | null;
  subtasks?: Subtask[];
}

export const todos = {
  list: () => request<Todo[]>("/todos"),

  create: (text: string, recurringTaskId?: number) =>
    request<Todo>("/todos", {
      method: "POST",
      body: JSON.stringify({ text, recurringTaskId }),
    }),

  update: (id: string, data: { text?: string; completed?: boolean; subtasks?: Subtask[] }) =>
    request<Todo>(`/todos/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  pause: (id: string) =>
    request<Todo>(`/todos/${id}`, { 
      method: "POST",
      body: JSON.stringify({ action: 'pause' }),
    }),

  resume: (id: string) =>
    request<Todo>(`/todos/${id}`, { 
      method: "POST",
      body: JSON.stringify({ action: 'resume' }),
    }),

  delete: (id: string) =>
    request<void>(`/todos/${id}`, { method: "DELETE" }),

  clearCompleted: () =>
    request<void>("/todos", { method: "DELETE" }),
};

// Recurring Tasks API
export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'custom';

export interface CompletionRecord {
  scheduledDate: string; // YYYY-MM-DD
  completedAt: string | null;
  status: 'completed' | 'missed' | 'pending' | 'paused' | 'in_progress';
  startedAt: string | null; // when user clicked "Start"
  pausedAt: string | null;
  totalPausedTime: number; // in milliseconds
  timeTaken: number | null; // in milliseconds - completedAt - startedAt - totalPausedTime
}

export interface RecurringTask {
  id: string;
  text: string;
  frequency: RecurringFrequency;
  customDays: number | null;
  dayOfWeek: number | null; // 0-6, Sunday = 0
  dayOfMonth: number | null; // 1-31
  nextDue: string;
  lastGenerated: string | null;
  isActive: boolean;
  createdAt: string;
  completions: CompletionRecord[];
}

export interface CreateRecurringTaskData {
  text: string;
  frequency: RecurringFrequency;
  customDays?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
}

export interface UpdateRecurringTaskData {
  text?: string;
  frequency?: RecurringFrequency;
  customDays?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  isActive?: boolean;
}

export const recurring = {
  list: () => request<RecurringTask[]>(`/recurring?clientDate=${getLocalDateString()}`),

  create: (data: CreateRecurringTaskData) =>
    request<RecurringTask>("/recurring", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdateRecurringTaskData) =>
    request<RecurringTask>(`/recurring/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ ...data, clientDate: getLocalDateString() }),
    }),

  delete: (id: string) =>
    request<void>(`/recurring/${id}`, { method: "DELETE" }),

  complete: (id: string) =>
    request<RecurringTask>(`/recurring/${id}`, { 
      method: "POST",
      body: JSON.stringify({ action: 'complete', clientDate: getLocalDateString() }),
    }),

  uncomplete: (id: string) =>
    request<RecurringTask>(`/recurring/${id}`, { 
      method: "POST",
      body: JSON.stringify({ action: 'uncomplete', clientDate: getLocalDateString() }),
    }),

  start: (id: string) =>
    request<RecurringTask>(`/recurring/${id}`, { 
      method: "POST",
      body: JSON.stringify({ action: 'start', clientDate: getLocalDateString() }),
    }),

  pause: (id: string) =>
    request<RecurringTask>(`/recurring/${id}`, { 
      method: "POST",
      body: JSON.stringify({ action: 'pause', clientDate: getLocalDateString() }),
    }),

  resume: (id: string) =>
    request<RecurringTask>(`/recurring/${id}`, { 
      method: "POST",
      body: JSON.stringify({ action: 'resume', clientDate: getLocalDateString() }),
    }),
};

// User Settings API
export interface UserPreferences {
  autoCompleteRecurring?: boolean;
  theme?: 'light' | 'dark';
  enableSubtasks?: boolean;
}

export const userSettings = {
  get: () => request<{ preferences: UserPreferences }>("/settings"),
  
  update: (preferences: Partial<UserPreferences>) =>
    request<{ preferences: UserPreferences }>("/settings", {
      method: "PATCH",
      body: JSON.stringify({ preferences }),
    }),
};

// Helper to get client's local date as YYYY-MM-DD
function getLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
