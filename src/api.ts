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

// Todos API
export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  completedAt: string | null;
}

export const todos = {
  list: () => request<Todo[]>("/todos"),

  create: (text: string) =>
    request<Todo>("/todos", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  update: (id: string, data: { text?: string; completed?: boolean }) =>
    request<Todo>(`/todos/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<void>(`/todos/${id}`, { method: "DELETE" }),

  clearCompleted: () =>
    request<void>("/todos", { method: "DELETE" }),
};
