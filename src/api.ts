const API_BASE = "/api";

function getToken(): string | null {
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
}

export const auth = {
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
}

export const todos = {
  list: () => request<Todo[]>("/todos"),

  create: (text: string, recurringTaskId?: number) =>
    request<Todo>("/todos", {
      method: "POST",
      body: JSON.stringify({ text, recurringTaskId }),
    }),

  update: (id: string, data: { text?: string; completed?: boolean }) =>
    request<Todo>(`/todos/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  pause: (id: string) =>
    request<Todo>(`/todos/${id}/pause`, { method: "POST" }),

  resume: (id: string) =>
    request<Todo>(`/todos/${id}/resume`, { method: "POST" }),

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
  id: number;
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

export interface GenerateResult {
  generated: number;
  todos: Todo[];
}

export const recurring = {
  list: () => request<RecurringTask[]>("/recurring"),

  create: (data: CreateRecurringTaskData) =>
    request<RecurringTask>("/recurring", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: number, data: UpdateRecurringTaskData) =>
    request<RecurringTask>(`/recurring/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    request<void>(`/recurring/${id}`, { method: "DELETE" }),

  generate: () =>
    request<GenerateResult>("/recurring/generate", { method: "POST" }),

  complete: (id: number) =>
    request<RecurringTask>(`/recurring/${id}/complete`, { method: "POST" }),

  uncomplete: (id: number) =>
    request<RecurringTask>(`/recurring/${id}/uncomplete`, { method: "POST" }),

  start: (id: number) =>
    request<RecurringTask>(`/recurring/${id}/start`, { method: "POST" }),

  pause: (id: number) =>
    request<RecurringTask>(`/recurring/${id}/pause`, { method: "POST" }),

  resume: (id: number) =>
    request<RecurringTask>(`/recurring/${id}/resume`, { method: "POST" }),
};
