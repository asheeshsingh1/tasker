import { useState, useEffect, useMemo, type ChangeEvent, type KeyboardEvent, type FormEvent } from "react";
import { auth, todos, recurring, setToken, type User, type Todo, type RecurringTask, type RecurringFrequency, type CompletionRecord } from "./api";

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { user } = await auth.me();
        setUser(user);
      } catch {
        setToken(null);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  const handleLogout = () => {
    setToken(null);
    setUser(null);
  };

  if (loading) {
    return (
      <div className="app">
        <div className="loading-state">
          <div className="loading-spinner" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm onAuth={setUser} />;
  }

  return <TodoApp user={user} onLogout={handleLogout} />;
}

// Auth Form Component
interface AuthFormProps {
  onAuth: (user: User) => void;
}

function AuthForm({ onAuth }: AuthFormProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const result = isLogin
        ? await auth.login(email, password)
        : await auth.register(email, password, name);
      
      setToken(result.token);
      onAuth(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app auth-app">
      <header className="app-header">
        <h1 className="app-title">Tasker</h1>
        <p className="app-subtitle">
          {isLogin ? "Welcome back" : "Create your account"}
        </p>
      </header>

      <form className="auth-form" onSubmit={handleSubmit}>
        {!isLogin && (
          <div className="form-group">
            <label htmlFor="name">Name</label>
            <input
              id="name"
              type="text"
              className="task-input"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required={!isLogin}
            />
          </div>
        )}

        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            className="task-input"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className="task-input"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>

        {error && <div className="auth-error">{error}</div>}

        <button type="submit" className="add-btn auth-btn" disabled={submitting}>
          {submitting ? "Please wait..." : isLogin ? "Sign In" : "Create Account"}
        </button>

        <p className="auth-switch">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button
            type="button"
            className="auth-switch-btn"
            onClick={() => {
              setIsLogin(!isLogin);
              setError("");
            }}
          >
            {isLogin ? "Sign up" : "Sign in"}
          </button>
        </p>
      </form>
    </div>
  );
}

// Filter types
type StatusFilter = "all" | "active" | "paused" | "completed";
type ViewMode = "tasks" | "recurring";
type DateFilter = "all" | "today" | "week" | "older";
type SortOption = "newest" | "oldest" | "name" | "completed-fast" | "completed-slow";
type RecurringStatusFilter = "all" | "pending" | "in_progress" | "paused" | "completed" | "not_today";

// Helper functions for date filtering
function getDaysDiff(date: Date): number {
  const now = new Date();
  // Compare dates only (ignore time) to avoid timezone issues
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffTime = todayStart.getTime() - dateStart.getTime();
  const days = Math.round(diffTime / (1000 * 60 * 60 * 24));
  // Ensure we never return negative days
  return Math.max(0, days);
}

function isToday(date: Date): boolean {
  const today = new Date();
  return date.getFullYear() === today.getFullYear() &&
         date.getMonth() === today.getMonth() &&
         date.getDate() === today.getDate();
}

function isWithinWeek(date: Date): boolean {
  return getDaysDiff(date) <= 7;
}

function formatDuration(createdAt: string, completedAt: string | null, totalPausedTime: number = 0): string | null {
  if (!completedAt) return null;
  
  const start = new Date(createdAt).getTime();
  const end = new Date(completedAt).getTime();
  // Actual working time = total time - paused time
  const diffMs = Math.max(0, end - start - totalPausedTime);
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  
  // Check if date is valid
  if (isNaN(date.getTime())) {
    return "Unknown";
  }
  
  const days = getDaysDiff(date);
  
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  }
  return date.toLocaleDateString();
}

function formatPausedTime(pausedAt: string | null, totalPausedTime: number): string | null {
  if (!pausedAt && totalPausedTime === 0) return null;
  
  let total = totalPausedTime;
  if (pausedAt) {
    // Currently paused, add ongoing pause time
    total += Date.now() - new Date(pausedAt).getTime();
  }
  
  const seconds = Math.floor(total / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h paused`;
  if (hours > 0) return `${hours}h ${minutes % 60}m paused`;
  if (minutes > 0) return `${minutes}m paused`;
  return `${seconds}s paused`;
}

function getNextDueText(nextDue: string): string {
  const date = new Date(nextDue);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return "Overdue";
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  if (diffDays < 7) return `Due in ${diffDays} days`;
  return `Due ${date.toLocaleDateString()}`;
}

function getFrequencyLabel(freq: RecurringFrequency, customDays?: number | null, dayOfWeek?: number | null, dayOfMonth?: number | null): string {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  switch (freq) {
    case 'daily': return 'Daily';
    case 'weekly': return `Weekly on ${dayNames[dayOfWeek ?? 1]}`;
    case 'monthly': return `Monthly on day ${dayOfMonth ?? 1}`;
    case 'custom': return `Every ${customDays} day${customDays !== 1 ? 's' : ''}`;
  }
}

function getTodayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function canCompleteToday(task: RecurringTask): { canComplete: boolean; reason?: string } {
  const now = new Date();
  const today = now.getDay(); // 0-6, Sunday = 0
  const todayDate = now.getDate(); // 1-31
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  switch (task.frequency) {
    case 'daily':
      return { canComplete: true };
    case 'weekly':
      if (task.dayOfWeek === today) {
        return { canComplete: true };
      }
      return { canComplete: false, reason: `Only on ${dayNames[task.dayOfWeek ?? 0]}` };
    case 'monthly':
      if (task.dayOfMonth === todayDate) {
        return { canComplete: true };
      }
      return { canComplete: false, reason: `Only on day ${task.dayOfMonth}` };
    default:
      return { canComplete: true };
  }
}

function isCompletedToday(completions: CompletionRecord[]): boolean {
  const todayStr = getTodayString();
  return completions.some(c => c.scheduledDate === todayStr && c.status === 'completed');
}

function getScheduledDates(task: RecurringTask, limit: number = 10): string[] {
  const dates: string[] = [];
  const createdAt = new Date(task.createdAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let current = new Date(createdAt);
  current.setHours(0, 0, 0, 0);
  
  // Generate scheduled dates from creation to today
  while (current <= today && dates.length < limit) {
    const dayOfWeek = current.getDay();
    const dayOfMonth = current.getDate();
    
    let isScheduled = false;
    switch (task.frequency) {
      case 'daily':
        isScheduled = true;
        break;
      case 'weekly':
        isScheduled = dayOfWeek === task.dayOfWeek;
        break;
      case 'monthly':
        isScheduled = dayOfMonth === task.dayOfMonth;
        break;
    }
    
    if (isScheduled) {
      // Use local date format to avoid timezone issues
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      const day = String(current.getDate()).padStart(2, '0');
      dates.unshift(`${year}-${month}-${day}`); // Newest first
    }
    
    current.setDate(current.getDate() + 1);
  }
  
  return dates.slice(0, limit);
}

type HistoryStatus = 'completed' | 'missed' | 'pending' | 'paused' | 'in_progress';

function getHistoryWithStatus(task: RecurringTask): Array<{ date: string; status: HistoryStatus }> {
  const scheduledDates = getScheduledDates(task, 14); // Last 14 scheduled dates
  const completions = task.completions || [];
  const completionsMap = new Map(completions.map(c => [c.scheduledDate, c.status]));
  const todayStr = getTodayString();
  
  return scheduledDates.map(date => {
    const status = completionsMap.get(date);
    if (status) return { date, status };
    // If not in completions and it's before today, it was missed
    if (date < todayStr) return { date, status: 'missed' as const };
    // Today or future
    return { date, status: 'pending' as const };
  });
}

// Todo App Component
interface TodoAppProps {
  user: User;
  onLogout: () => void;
}

function TodoApp({ user, onLogout }: TodoAppProps) {
  const [task, setTask] = useState("");
  const [todoList, setTodoList] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // View mode: tasks or recurring
  const [viewMode, setViewMode] = useState<ViewMode>("tasks");
  
  // Recurring tasks state
  const [recurringTasks, setRecurringTasks] = useState<RecurringTask[]>([]);
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  
  // Filter states
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [showOldCompleted, setShowOldCompleted] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>("newest");

  // Recurring task filter state
  const [recurringStatusFilter, setRecurringStatusFilter] = useState<RecurringStatusFilter>("all");
  const [showRecurringFilters, setShowRecurringFilters] = useState(false);

  // Fetch todos and recurring tasks on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [todosData, recurringData] = await Promise.all([
          todos.list(),
          recurring.list(),
        ]);
        
        setTodoList(todosData);
        setRecurringTasks(recurringData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Check if sorting by completion duration (hides active todos)
  const isSortingByDuration = sortOption === "completed-fast" || sortOption === "completed-slow";

  // Filtered and sorted todos
  const filteredTodos = useMemo(() => {
    let result = todoList.filter((todo) => {
      const todoDate = new Date(todo.createdAt);
      const daysDiff = getDaysDiff(todoDate);
      
      // If sorting by duration, only show completed todos
      if (isSortingByDuration && !todo.completed) {
        return false;
      }
      
      // Default behavior: hide completed tasks older than 3 days
      if (!showOldCompleted && todo.completed && daysDiff > 3) {
        return false;
      }
      
      // Status filter (skip if sorting by duration - already filtered)
      if (!isSortingByDuration) {
        if (statusFilter === "active" && (todo.completed || todo.status === 'paused')) return false;
        if (statusFilter === "paused" && todo.status !== 'paused') return false;
        if (statusFilter === "completed" && !todo.completed) return false;
      }
      
      // Date filter
      if (dateFilter === "today" && !isToday(todoDate)) return false;
      if (dateFilter === "week" && !isWithinWeek(todoDate)) return false;
      if (dateFilter === "older" && isWithinWeek(todoDate)) return false;
      
      return true;
    });

    // Sort the results
    result.sort((a, b) => {
      switch (sortOption) {
        case "newest":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "name":
          return a.text.localeCompare(b.text);
        case "completed-fast":
        case "completed-slow":
          // Calculate duration: completedAt - createdAt
          const aDuration = a.completedAt 
            ? new Date(a.completedAt).getTime() - new Date(a.createdAt).getTime()
            : Infinity;
          const bDuration = b.completedAt
            ? new Date(b.completedAt).getTime() - new Date(b.createdAt).getTime()
            : Infinity;
          return sortOption === "completed-fast" 
            ? aDuration - bDuration  // Shortest duration first
            : bDuration - aDuration; // Longest duration first
        default:
          return 0;
      }
    });

    return result;
  }, [todoList, statusFilter, dateFilter, showOldCompleted, sortOption, isSortingByDuration]);

  // Count of hidden old completed tasks
  const hiddenOldCompletedCount = useMemo(() => {
    if (showOldCompleted) return 0;
    return todoList.filter((todo) => {
      const daysDiff = getDaysDiff(new Date(todo.createdAt));
      return todo.completed && daysDiff > 3;
    }).length;
  }, [todoList, showOldCompleted]);

  // Filtered recurring tasks
  const filteredRecurringTasks = useMemo(() => {
    const todayStr = getTodayString();
    
    return recurringTasks.filter((task) => {
      // Check today's completion status
      const todayCompletion = (task.completions || []).find(c => c.scheduledDate === todayStr);
      const { canComplete } = canCompleteToday(task);
      
      const isCompletedToday = todayCompletion?.status === 'completed';
      const isPausedToday = todayCompletion?.status === 'paused';
      const isInProgressToday = todayCompletion?.status === 'in_progress';
      const isNotStarted = canComplete && (!todayCompletion || todayCompletion.status === 'pending');
      const isNotForToday = !canComplete && !isCompletedToday;
      
      switch (recurringStatusFilter) {
        case "all":
          return true;
        case "pending":
          return isNotStarted;
        case "in_progress":
          return isInProgressToday;
        case "paused":
          return isPausedToday;
        case "completed":
          return isCompletedToday;
        case "not_today":
          return isNotForToday;
        default:
          return true;
      }
    });
  }, [recurringTasks, recurringStatusFilter]);

  // Recurring task counts for filter badges
  const recurringCounts = useMemo(() => {
    const todayStr = getTodayString();
    let pending = 0, inProgress = 0, paused = 0, completed = 0, notToday = 0;
    
    recurringTasks.forEach((task) => {
      const todayCompletion = (task.completions || []).find(c => c.scheduledDate === todayStr);
      const { canComplete } = canCompleteToday(task);
      
      if (todayCompletion?.status === 'completed') {
        completed++;
      } else if (todayCompletion?.status === 'paused') {
        paused++;
      } else if (todayCompletion?.status === 'in_progress') {
        inProgress++;
      } else if (canComplete) {
        pending++;
      } else {
        notToday++;
      }
    });
    
    return { pending, inProgress, paused, completed, notToday };
  }, [recurringTasks]);

  const addTask = async () => {
    const trimmed = task.trim();
    if (trimmed === "") return;

    try {
      const newTodo = await todos.create(trimmed);
      setTodoList([newTodo, ...todoList]);
    setTask("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add task");
    }
  };

  const toggleTask = async (id: string) => {
    const todo = todoList.find((t) => t.id === id);
    if (!todo) return;

    try {
      const updated = await todos.update(id, { completed: !todo.completed });
      setTodoList(todoList.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update task");
    }
  };

  const editTask = async (id: string, text: string) => {
    try {
      const updated = await todos.update(id, { text });
      setTodoList(todoList.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to edit task");
    }
  };

  const pauseTask = async (id: string) => {
    try {
      const updated = await todos.pause(id);
      setTodoList(todoList.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pause task");
    }
  };

  const resumeTask = async (id: string) => {
    try {
      const updated = await todos.resume(id);
      setTodoList(todoList.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resume task");
    }
  };

  const deleteTask = async (id: string) => {
    try {
      await todos.delete(id);
      setTodoList(todoList.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete task");
    }
  };

  const clearCompleted = async () => {
    try {
      await todos.clearCompleted();
      setTodoList(todoList.filter((t) => !t.completed));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear completed");
    }
  };

  // Recurring task functions
  const createRecurringTask = async (data: { text: string; frequency: RecurringFrequency; dayOfWeek?: number; dayOfMonth?: number }) => {
    try {
      const newTask = await recurring.create(data);
      setRecurringTasks([newTask, ...recurringTasks]);
      setShowRecurringForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create recurring task");
    }
  };

  const toggleRecurringTask = async (id: string, isActive: boolean) => {
    try {
      const updated = await recurring.update(id, { isActive });
      setRecurringTasks(recurringTasks.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update recurring task");
    }
  };

  const completeRecurringTask = async (id: string) => {
    try {
      const updated = await recurring.complete(id);
      setRecurringTasks(recurringTasks.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete recurring task");
    }
  };

  const uncompleteRecurringTask = async (id: string) => {
    try {
      const updated = await recurring.uncomplete(id);
      setRecurringTasks(recurringTasks.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to undo completion");
    }
  };

  const startRecurringTask = async (id: string) => {
    try {
      const updated = await recurring.start(id);
      setRecurringTasks(recurringTasks.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start recurring task");
    }
  };

  const pauseRecurringTask = async (id: string) => {
    try {
      const updated = await recurring.pause(id);
      setRecurringTasks(recurringTasks.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pause recurring task");
    }
  };

  const resumeRecurringTask = async (id: string) => {
    try {
      const updated = await recurring.resume(id);
      setRecurringTasks(recurringTasks.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resume recurring task");
    }
  };

  const editRecurringTask = async (id: string, data: { text?: string; frequency?: RecurringFrequency; dayOfWeek?: number; dayOfMonth?: number }) => {
    try {
      const updated = await recurring.update(id, data);
      setRecurringTasks(recurringTasks.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update recurring task");
    }
  };

  const deleteRecurringTask = async (id: string) => {
    try {
      await recurring.delete(id);
      setRecurringTasks(recurringTasks.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete recurring task");
    }
  };

  const handleInput = (e: ChangeEvent<HTMLInputElement>) => {
    setTask(e.target.value);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") addTask();
  };

  const completedCount = todoList.filter((t) => t.completed).length;
  const pausedCount = todoList.filter((t) => t.status === 'paused').length;
  const totalCount = todoList.length;
  const activeCount = totalCount - completedCount - pausedCount;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  // Recurring tasks progress (only tasks scheduled for today)
  const todayRecurringStats = useMemo(() => {
    const todayStr = getTodayString();
    let total = 0;
    let completed = 0;
    
    recurringTasks.forEach((task) => {
      const { canComplete } = canCompleteToday(task);
      if (canComplete) {
        total++;
        const todayCompletion = (task.completions || []).find(c => c.scheduledDate === todayStr);
        if (todayCompletion?.status === 'completed') {
          completed++;
        }
      }
    });
    
    return {
      total,
      completed,
      progress: total > 0 ? (completed / total) * 100 : 0
    };
  }, [recurringTasks]);

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-row">
          <div>
            <h1 className="app-title">Tasker</h1>
            <p className="app-subtitle">Hello, {user.name} 👋</p>
          </div>
          <button className="logout-btn" onClick={onLogout}>
            Sign out
          </button>
        </div>
        
        {/* View Mode Tabs */}
        <div className="view-tabs">
          <button 
            className={`view-tab ${viewMode === 'tasks' ? 'active' : ''}`}
            onClick={() => setViewMode('tasks')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
            </svg>
            Tasks
            {totalCount > 0 && <span className="tab-badge">{totalCount}</span>}
          </button>
          <button 
            className={`view-tab ${viewMode === 'recurring' ? 'active' : ''}`}
            onClick={() => setViewMode('recurring')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 2.1l4 4-4 4" />
              <path d="M3 12.2v-2a4 4 0 014-4h12.8M7 21.9l-4-4 4-4" />
              <path d="M21 11.8v2a4 4 0 01-4 4H4.2" />
            </svg>
            Recurring
            {recurringTasks.length > 0 && <span className="tab-badge">{recurringTasks.length}</span>}
          </button>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError("")}>✕</button>
        </div>
      )}

      {/* Progress - Tasks View Only */}
      {viewMode === 'tasks' && totalCount > 0 && (
        <div className="progress-section">
          <div className="progress-header">
            <span className="progress-label">Progress</span>
            <span className="progress-count">{completedCount} of {totalCount}</span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Add Task Button */}
      {viewMode === 'tasks' && !showTaskForm && (
      <div className="input-area">
          <button 
            className="add-btn add-task-btn" 
            onClick={() => setShowTaskForm(true)}
          >
            + Add Task
          </button>
        </div>
      )}

      {/* Task Form */}
      {viewMode === 'tasks' && showTaskForm && (
        <div className="input-area task-form">
          <div className="form-group">
            <label htmlFor="task-text">Task description</label>
        <input
              id="task-text"
          type="text"
          className="task-input"
          placeholder="What needs to be done?"
          value={task}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          autoFocus
        />
          </div>
          <div className="form-actions">
            <button 
              type="button" 
              className="cancel-btn"
              onClick={() => { setShowTaskForm(false); setTask(""); }}
            >
              Cancel
            </button>
            <button className="add-btn" onClick={() => { 
              if (task.trim()) {
                addTask(); 
                setShowTaskForm(false); 
              }
            }}>
              Create Task
        </button>
      </div>
        </div>
      )}
      
      {/* Progress - Recurring Tasks View (only tasks for today) */}
      {viewMode === 'recurring' && todayRecurringStats.total > 0 && (
        <div className="progress-section">
          <div className="progress-header">
            <span className="progress-label">Today's Progress</span>
            <span className="progress-count">{todayRecurringStats.completed} of {todayRecurringStats.total}</span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${todayRecurringStats.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Add Recurring Task Button */}
      {viewMode === 'recurring' && !showRecurringForm && (
        <div className="input-area">
          <button 
            className="add-btn add-recurring-btn" 
            onClick={() => setShowRecurringForm(true)}
          >
            + Add Recurring Task
          </button>
        </div>
      )}

      {/* Recurring Task Form */}
      {viewMode === 'recurring' && showRecurringForm && (
        <RecurringTaskForm 
          onSubmit={createRecurringTask} 
          onCancel={() => setShowRecurringForm(false)} 
        />
      )}

      {/* Filter Toggle & Bar - Tasks View */}
      {viewMode === 'tasks' && totalCount > 0 && (
        <>
          <div className="filter-toggle-bar">
            <h2 className="tasks-heading">Tasks</h2>
            
            <div className="filter-actions">
              {(statusFilter !== "all" || dateFilter !== "all" || sortOption !== "newest") && (
                <button 
                  className="clear-filters-btn"
                  onClick={() => {
                    setStatusFilter("all");
                    setDateFilter("all");
                    setSortOption("newest");
                  }}
                >
                  Reset all
                </button>
              )}
            
            <button 
              className={`filter-toggle-btn ${showFilters ? "active" : ""}`}
              onClick={() => setShowFilters(!showFilters)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              Filters
              {(statusFilter !== "all" || dateFilter !== "all" || sortOption !== "newest") && (
                <span className="filter-badge">
                  {(statusFilter !== "all" ? 1 : 0) + (dateFilter !== "all" ? 1 : 0) + (sortOption !== "newest" ? 1 : 0)}
            </span>
              )}
              <svg className={`chevron ${showFilters ? "open" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            </div>
          </div>

          <div className={`filter-panel ${showFilters ? "open" : ""}`}>
            <div className="filter-panel-content">
              <div className="filter-group">
                <span className="filter-label">Status:</span>
                <div className="filter-buttons">
                  <button
                    className={`filter-btn ${statusFilter === "all" && !isSortingByDuration ? "active" : ""}`}
                    onClick={() => setStatusFilter("all")}
                    disabled={isSortingByDuration}
                  >
                    All
                    <span className="filter-count">{totalCount}</span>
                  </button>
                  <button
                    className={`filter-btn ${statusFilter === "active" && !isSortingByDuration ? "active" : ""}`}
                    onClick={() => setStatusFilter("active")}
                    disabled={isSortingByDuration}
                  >
                    Active
                    <span className="filter-count">{activeCount}</span>
                  </button>
                  <button
                    className={`filter-btn ${statusFilter === "paused" && !isSortingByDuration ? "active" : ""}`}
                    onClick={() => setStatusFilter("paused")}
                    disabled={isSortingByDuration}
                  >
                    ⏸ Paused
                    <span className="filter-count">{pausedCount}</span>
                  </button>
                  <button
                    className={`filter-btn ${statusFilter === "completed" || isSortingByDuration ? "active" : ""}`}
                    onClick={() => setStatusFilter("completed")}
                    disabled={isSortingByDuration}
                  >
                    Done
                    <span className="filter-count">{completedCount}</span>
                  </button>
                </div>
              </div>
              
              <div className="filter-group">
                <span className="filter-label">Date:</span>
                <div className="filter-buttons">
                  <button
                    className={`filter-btn ${dateFilter === "all" ? "active" : ""}`}
                    onClick={() => setDateFilter("all")}
                  >
                    All
                  </button>
                  <button
                    className={`filter-btn ${dateFilter === "today" ? "active" : ""}`}
                    onClick={() => setDateFilter("today")}
                  >
                    Today
                  </button>
                  <button
                    className={`filter-btn ${dateFilter === "week" ? "active" : ""}`}
                    onClick={() => setDateFilter("week")}
                  >
                    This Week
                  </button>
                  <button
                    className={`filter-btn ${dateFilter === "older" ? "active" : ""}`}
                    onClick={() => setDateFilter("older")}
                  >
                    Older
                  </button>
                </div>
              </div>

              <div className="filter-group">
                <span className="filter-label">Sort:</span>
                <div className="filter-buttons">
                  <button
                    className={`filter-btn ${sortOption === "newest" ? "active" : ""}`}
                    onClick={() => setSortOption("newest")}
                  >
                    Newest
                  </button>
                  <button
                    className={`filter-btn ${sortOption === "oldest" ? "active" : ""}`}
                    onClick={() => setSortOption("oldest")}
                  >
                    Oldest
                  </button>
                  <button
                    className={`filter-btn ${sortOption === "name" ? "active" : ""}`}
                    onClick={() => setSortOption("name")}
                  >
                    Name
                  </button>
                  <button
                    className={`filter-btn ${sortOption === "completed-fast" ? "active" : ""}`}
                    onClick={() => setSortOption("completed-fast")}
                    title="Shows only completed tasks, sorted by fastest completion"
                  >
                    ⚡ Fast
                  </button>
                  <button
                    className={`filter-btn ${sortOption === "completed-slow" ? "active" : ""}`}
                    onClick={() => setSortOption("completed-slow")}
                    title="Shows only completed tasks, sorted by slowest completion"
                  >
                    🐢 Slow
                  </button>
                </div>
              </div>

              {isSortingByDuration && (
                <div className="filter-notice">
                  ℹ️ Sorting by completion time shows only completed tasks
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Hidden tasks notice - Tasks View */}
      {viewMode === 'tasks' && hiddenOldCompletedCount > 0 && (
        <div className="hidden-notice">
          <span>{hiddenOldCompletedCount} completed task{hiddenOldCompletedCount > 1 ? 's' : ''} older than 3 days hidden</span>
          <button onClick={() => setShowOldCompleted(true)}>Show all</button>
        </div>
      )}

      {/* Show all toggle when showing old completed - Tasks View */}
      {viewMode === 'tasks' && showOldCompleted && hiddenOldCompletedCount === 0 && todoList.some(t => t.completed && getDaysDiff(new Date(t.createdAt)) > 3) && (
        <div className="hidden-notice">
          <span>Showing all tasks including old completed</span>
          <button onClick={() => setShowOldCompleted(false)}>Hide old completed</button>
        </div>
      )}

      {/* Todo List - Tasks View */}
      {viewMode === 'tasks' && (
      <ul className="todo-list">
        {loading ? (
          <div className="empty-state">
            <div className="loading-spinner" />
            <p className="empty-text">Loading your tasks...</p>
          </div>
        ) : filteredTodos.length === 0 ? (
          <EmptyState hasFilters={statusFilter !== "all" || dateFilter !== "all"} />
        ) : (
          filteredTodos.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={toggleTask}
                onEdit={editTask}
                onPause={pauseTask}
                onResume={resumeTask}
              onDelete={deleteTask}
            />
          ))
        )}
      </ul>
      )}
      
      {/* Recurring Tasks Filter Bar */}
      {viewMode === 'recurring' && recurringTasks.length > 0 && (
        <>
          <div className="filter-toggle-bar">
            <h2 className="tasks-heading">Recurring Tasks</h2>
            
            <div className="filter-actions">
              {recurringStatusFilter !== "all" && (
                <button 
                  className="clear-filters-btn"
                  onClick={() => setRecurringStatusFilter("all")}
                >
                  Clear
                </button>
              )}
            
              <button 
                className={`filter-toggle-btn ${showRecurringFilters ? "active" : ""}`}
                onClick={() => setShowRecurringFilters(!showRecurringFilters)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                Filters
                {recurringStatusFilter !== "all" && (
                  <span className="filter-badge">1</span>
                )}
                <svg className={`chevron ${showRecurringFilters ? "open" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
          </div>
          
          <div className={`filter-panel ${showRecurringFilters ? "open" : ""}`}>
            <div className="filter-panel-content">
              <div className="filter-group">
                <span className="filter-label">Status:</span>
                <div className="filter-buttons">
                  <button
                    className={`filter-btn ${recurringStatusFilter === "all" ? "active" : ""}`}
                    onClick={() => setRecurringStatusFilter("all")}
                  >
                    All
                    <span className="filter-count">{recurringTasks.length}</span>
                  </button>
                  <button
                    className={`filter-btn ${recurringStatusFilter === "pending" ? "active" : ""}`}
                    onClick={() => setRecurringStatusFilter("pending")}
                  >
                    Pending
                    <span className="filter-count">{recurringCounts.pending}</span>
                  </button>
                  <button
                    className={`filter-btn ${recurringStatusFilter === "in_progress" ? "active" : ""}`}
                    onClick={() => setRecurringStatusFilter("in_progress")}
                  >
                    Active
                    <span className="filter-count">{recurringCounts.inProgress}</span>
                  </button>
                  <button
                    className={`filter-btn ${recurringStatusFilter === "paused" ? "active" : ""}`}
                    onClick={() => setRecurringStatusFilter("paused")}
                  >
                    ⏸ Paused
                    <span className="filter-count">{recurringCounts.paused}</span>
                  </button>
                  <button
                    className={`filter-btn ${recurringStatusFilter === "completed" ? "active" : ""}`}
                    onClick={() => setRecurringStatusFilter("completed")}
                  >
                    Done
                    <span className="filter-count">{recurringCounts.completed}</span>
                  </button>
                  <button
                    className={`filter-btn ${recurringStatusFilter === "not_today" ? "active" : ""}`}
                    onClick={() => setRecurringStatusFilter("not_today")}
                  >
                    Not Today
                    <span className="filter-count">{recurringCounts.notToday}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Recurring Tasks List */}
      {viewMode === 'recurring' && (
        <ul className="todo-list recurring-list">
          {loading ? (
            <div className="empty-state">
              <div className="loading-spinner" />
              <p className="empty-text">Loading recurring tasks...</p>
            </div>
          ) : recurringTasks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🔄</div>
              <h3 className="empty-title">No recurring tasks</h3>
              <p className="empty-text">Create recurring tasks to automatically generate todos on a schedule</p>
            </div>
          ) : filteredRecurringTasks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🔍</div>
              <h3 className="empty-title">No matching tasks</h3>
              <p className="empty-text">Try adjusting your filters</p>
            </div>
          ) : (
            filteredRecurringTasks.map((task) => (
              <RecurringTaskItem
                key={task.id}
                task={task}
                onStart={startRecurringTask}
                onComplete={completeRecurringTask}
                onUncomplete={uncompleteRecurringTask}
                onPause={pauseRecurringTask}
                onResume={resumeRecurringTask}
                onEdit={editRecurringTask}
                onDelete={deleteRecurringTask}
              />
            ))
          )}
        </ul>
      )}

      {/* Footer - Tasks View */}
      {viewMode === 'tasks' && totalCount > 0 && (
        <footer className="app-footer">
          <span className="footer-stat">
            <strong>{activeCount}</strong> active
            {pausedCount > 0 && <>, <strong>{pausedCount}</strong> paused</>}
          </span>
          {completedCount > 0 && (
            <button className="clear-completed-btn" onClick={clearCompleted}>
              Clear completed
            </button>
          )}
        </footer>
      )}
      
      {/* Footer - Recurring View */}
      {viewMode === 'recurring' && recurringTasks.length > 0 && (
        <footer className="app-footer">
          <span className="footer-stat">
            <strong>{recurringTasks.filter(t => t.isActive).length}</strong> active, <strong>{recurringTasks.filter(t => !t.isActive).length}</strong> paused
          </span>
        </footer>
      )}
    </div>
  );
}

// Empty State Component
interface EmptyStateProps {
  hasFilters?: boolean;
}

function EmptyState({ hasFilters }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{hasFilters ? "🔍" : "📝"}</div>
      <h3 className="empty-title">
        {hasFilters ? "No matching tasks" : "No tasks yet"}
      </h3>
      <p className="empty-text">
        {hasFilters 
          ? "Try adjusting your filters to see more tasks"
          : "Add your first task above to get started"
        }
      </p>
    </div>
  );
}

// Todo Item Component
interface TodoItemProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
}

function TodoItem({ todo, onToggle, onEdit, onPause, onResume, onDelete }: TodoItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(todo.text);
  const [menuOpen, setMenuOpen] = useState(false);
  
  const relativeDate = formatRelativeDate(todo.createdAt);
  const isOld = getDaysDiff(new Date(todo.createdAt)) > 3;
  const duration = formatDuration(todo.createdAt, todo.completedAt, todo.totalPausedTime);
  const isPaused = todo.status === 'paused';

  const handleSaveEdit = () => {
    if (editText.trim() && editText.trim() !== todo.text) {
      onEdit(todo.id, editText.trim());
    }
    setIsEditing(false);
    setMenuOpen(false);
  };

  const handleCancelEdit = () => {
    setEditText(todo.text);
    setIsEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSaveEdit();
    if (e.key === 'Escape') handleCancelEdit();
  };
  
  return (
    <li className={`todo-item ${todo.completed ? 'completed' : ''} ${isPaused ? 'paused' : ''} ${isOld ? 'old' : ''}`}>
      <label className={`checkbox ${isPaused ? 'disabled' : ''}`} title={isPaused ? "Resume task before marking complete" : ""}>
        <input
          type="checkbox"
          checked={todo.completed}
          onChange={() => onToggle(todo.id)}
          disabled={isPaused}
        />
        <span className="checkbox-visual" />
      </label>
      
      <div className="todo-content">
        {isEditing ? (
          <div className="todo-edit-row">
            <input
              type="text"
              className="todo-edit-input"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
            <button className="edit-save-btn" onClick={handleSaveEdit}>Save</button>
            <button className="edit-cancel-btn" onClick={handleCancelEdit}>Cancel</button>
          </div>
        ) : (
          <>
        <span className="todo-text">{todo.text}</span>
        <div className="todo-meta">
          <span className="todo-date">{relativeDate}</span>
          {isPaused && <span className="todo-status-badge paused">⏸ Paused</span>}
          {duration && <span className="todo-duration">⏱ {duration}</span>}
        </div>
          </>
        )}
      </div>
      
      {/* Three-dot menu */}
      <div className="todo-menu">
      <button
          className="menu-btn"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Task options"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>
        
        {menuOpen && (
          <>
            <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
            <div className="menu-dropdown">
              {!todo.completed && (
                <button 
                  className="menu-item"
                  onClick={() => {
                    setIsEditing(true);
                    setMenuOpen(false);
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit
                </button>
              )}
              {!todo.completed && (
                <button 
                  className="menu-item"
                  onClick={() => {
                    isPaused ? onResume(todo.id) : onPause(todo.id);
                    setMenuOpen(false);
                  }}
                >
                  {isPaused ? (
                    <>
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      Resume
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="4" width="4" height="16" />
                        <rect x="14" y="4" width="4" height="16" />
                      </svg>
                      Pause
                    </>
                  )}
                </button>
              )}
              <button 
                className="menu-item danger"
                onClick={() => {
                  onDelete(todo.id);
                  setMenuOpen(false);
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
        </svg>
                Delete
      </button>
            </div>
          </>
        )}
      </div>
    </li>
  );
}

// Recurring Task Form Component
interface RecurringTaskFormProps {
  onSubmit: (data: { text: string; frequency: RecurringFrequency; dayOfWeek?: number; dayOfMonth?: number }) => void;
  onCancel: () => void;
}

function RecurringTaskForm({ onSubmit, onCancel }: RecurringTaskFormProps) {
  const [text, setText] = useState("");
  const [frequency, setFrequency] = useState<RecurringFrequency>("daily");
  const [dayOfWeek, setDayOfWeek] = useState(1); // Monday
  const [dayOfMonth, setDayOfMonth] = useState(1);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    
    onSubmit({
      text: text.trim(),
      frequency,
      ...(frequency === 'weekly' && { dayOfWeek }),
      ...(frequency === 'monthly' && { dayOfMonth }),
    });
  };

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return (
    <form className="recurring-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="recurring-text">Task description</label>
        <input
          id="recurring-text"
          type="text"
          className="task-input"
          placeholder="e.g., Weekly team standup"
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
          autoFocus
        />
      </div>
      
      <div className="form-group">
        <label>Frequency</label>
        <div className="frequency-options">
          {(['daily', 'weekly', 'monthly'] as RecurringFrequency[]).map((f) => (
            <button
              key={f}
              type="button"
              className={`frequency-btn ${frequency === f ? 'active' : ''}`}
              onClick={() => setFrequency(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {frequency === 'weekly' && (
        <div className="form-group">
          <label htmlFor="day-of-week">Day of week</label>
          <select
            id="day-of-week"
            className="task-input select-input"
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(Number(e.target.value))}
          >
            {dayNames.map((name, i) => (
              <option key={i} value={i}>{name}</option>
            ))}
          </select>
        </div>
      )}

      {frequency === 'monthly' && (
        <div className="form-group">
          <label htmlFor="day-of-month">Day of month</label>
          <select
            id="day-of-month"
            className="task-input select-input"
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(Number(e.target.value))}
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <option key={day} value={day}>{day}</option>
            ))}
          </select>
        </div>
      )}

      <div className="form-actions">
        <button type="button" className="cancel-btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="add-btn">
          Create Task
        </button>
      </div>
    </form>
  );
}

// Recurring Task Item Component
interface RecurringTaskItemProps {
  task: RecurringTask;
  onStart: (id: string) => void;
  onComplete: (id: string) => void;
  onUncomplete: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onEdit: (id: string, data: { text?: string; frequency?: RecurringFrequency; dayOfWeek?: number; dayOfMonth?: number }) => void;
  onDelete: (id: string) => void;
}

function RecurringTaskItem({ task, onStart, onComplete, onUncomplete, onPause, onResume, onEdit, onDelete }: RecurringTaskItemProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(task.text);
  const [editFrequency, setEditFrequency] = useState<RecurringFrequency>(task.frequency);
  const [editDayOfWeek, setEditDayOfWeek] = useState(task.dayOfWeek ?? 1);
  const [editDayOfMonth, setEditDayOfMonth] = useState(task.dayOfMonth ?? 1);
  
  const frequencyLabel = getFrequencyLabel(task.frequency, task.customDays, task.dayOfWeek, task.dayOfMonth);
  const { canComplete, reason } = canCompleteToday(task);
  const completions = task.completions || [];
  const todayStr = getTodayString();
  const todayCompletion = completions.find(c => c.scheduledDate === todayStr);
  const completedToday = todayCompletion?.status === 'completed';
  const isPausedToday = todayCompletion?.status === 'paused';
  const isInProgress = todayCompletion?.status === 'in_progress';
  const isNotStarted = !todayCompletion || todayCompletion.status === 'pending';
  
  // Format time in hours, minutes, and seconds
  const formatTime = (ms: number) => {
    if (ms < 0) ms = 0;
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);
    
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };
  
  // Only show time when completed (time = completedAt - startedAt - pausedTime)
  const getTimeElapsed = () => {
    // Only show time when completed
    if (completedToday && todayCompletion?.timeTaken != null) {
      return formatTime(todayCompletion.timeTaken);
    }
    return null;
  };
  
  const formatHistoryDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Use local date format for yesterday
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    
    if (dateStr === todayStr) return 'Today';
    if (dateStr === yesterdayStr) return 'Yesterday';
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };
  
  // Get time taken for a completion record
  const getCompletionTime = (completion: CompletionRecord) => {
    if (completion.status === 'completed' && completion.timeTaken != null) {
      return formatTime(completion.timeTaken);
    }
    return null;
  };
  
  // Get history with completion data - use actual completions from database
  const getHistoryItems = () => {
    const todayStr = getTodayString();
    
    // Sort completions by date (newest first) and limit to 100
    const sortedCompletions = [...completions]
      .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate))
      .slice(0, 100);
    
    return sortedCompletions.map(c => {
      // If it's a past date and task wasn't completed, show as "missed"
      const isPastDate = c.scheduledDate < todayStr;
      const isIncomplete = c.status !== 'completed' && c.status !== 'missed';
      const displayStatus = (isPastDate && isIncomplete) ? 'missed' : c.status;
      
      return {
        date: c.scheduledDate,
        status: displayStatus,
        timeTaken: c.timeTaken
      };
    });
  };
  
  const historyItems = getHistoryItems();
  const timeElapsed = getTimeElapsed();
  // Can only check if task is in_progress (started but not paused)
  const canCheckbox = canComplete && isInProgress;
  
  const handleCheckboxChange = () => {
    if (completedToday) {
      onUncomplete(task.id);
    } else if (canCheckbox) {
      onComplete(task.id);
    }
  };

  const handleSaveEdit = () => {
    const updates: { text?: string; frequency?: RecurringFrequency; dayOfWeek?: number; dayOfMonth?: number } = {};
    
    if (editText.trim() && editText.trim() !== task.text) {
      updates.text = editText.trim();
    }
    if (editFrequency !== task.frequency) {
      updates.frequency = editFrequency;
    }
    if (editFrequency === 'weekly' && editDayOfWeek !== task.dayOfWeek) {
      updates.dayOfWeek = editDayOfWeek;
    }
    if (editFrequency === 'monthly' && editDayOfMonth !== task.dayOfMonth) {
      updates.dayOfMonth = editDayOfMonth;
    }
    
    if (Object.keys(updates).length > 0) {
      onEdit(task.id, updates);
    }
    setIsEditing(false);
    setMenuOpen(false);
  };

  const handleCancelEdit = () => {
    setEditText(task.text);
    setEditFrequency(task.frequency);
    setEditDayOfWeek(task.dayOfWeek ?? 1);
    setEditDayOfMonth(task.dayOfMonth ?? 1);
    setIsEditing(false);
  };
  
  if (isEditing) {
    return (
      <li className="todo-item recurring-item editing">
        <div className="edit-recurring-form">
          <div className="form-group">
            <label>Task name</label>
            <input
              type="text"
              className="task-input"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              autoFocus
            />
          </div>
          
          <div className="form-group">
            <label>Frequency</label>
            <div className="frequency-options">
              <button
                type="button"
                className={`frequency-btn ${editFrequency === 'daily' ? 'active' : ''}`}
                onClick={() => setEditFrequency('daily')}
              >
                Daily
              </button>
              <button
                type="button"
                className={`frequency-btn ${editFrequency === 'weekly' ? 'active' : ''}`}
                onClick={() => setEditFrequency('weekly')}
              >
                Weekly
              </button>
              <button
                type="button"
                className={`frequency-btn ${editFrequency === 'monthly' ? 'active' : ''}`}
                onClick={() => setEditFrequency('monthly')}
              >
                Monthly
              </button>
            </div>
          </div>
          
          {editFrequency === 'weekly' && (
            <div className="form-group">
              <label>Day of week</label>
              <select
                className="select-input"
                value={editDayOfWeek}
                onChange={(e) => setEditDayOfWeek(Number(e.target.value))}
              >
                <option value={0}>Sunday</option>
                <option value={1}>Monday</option>
                <option value={2}>Tuesday</option>
                <option value={3}>Wednesday</option>
                <option value={4}>Thursday</option>
                <option value={5}>Friday</option>
                <option value={6}>Saturday</option>
              </select>
            </div>
          )}
          
          {editFrequency === 'monthly' && (
            <div className="form-group">
              <label>Day of month</label>
              <select
                className="select-input"
                value={editDayOfMonth}
                onChange={(e) => setEditDayOfMonth(Number(e.target.value))}
              >
                {Array.from({ length: 31 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{i + 1}</option>
                ))}
              </select>
            </div>
          )}
          
          <div className="form-actions">
            <button type="button" className="cancel-btn" onClick={handleCancelEdit}>
              Cancel
            </button>
            <button type="button" className="add-btn" onClick={handleSaveEdit}>
              Save Changes
            </button>
          </div>
        </div>
      </li>
    );
  }
  
  return (
    <li className={`todo-item recurring-item ${!task.isActive ? 'inactive' : ''} ${completedToday ? 'completed-today' : ''} ${isPausedToday ? 'paused' : ''}`}>
      <div className="recurring-main">
        <label 
          className={`checkbox ${!canCheckbox && !completedToday ? 'disabled' : ''}`} 
          title={
            completedToday ? "Uncheck to undo completion" : 
            !canComplete ? "Task not scheduled for today" :
            isPausedToday ? "Resume task before marking complete" :
            isNotStarted ? "Start task first" :
            isInProgress ? "Mark as done for today" : ""
          }
        >
          <input
            type="checkbox"
            checked={completedToday}
            onChange={handleCheckboxChange}
            disabled={!canCheckbox && !completedToday}
          />
          <span className="checkbox-visual" />
        </label>
        <div className="todo-content">
          <span className={`todo-text ${completedToday ? 'completed' : ''}`}>{task.text}</span>
          <div className="todo-meta">
            <span className="recurring-frequency">{frequencyLabel}</span>
            {canComplete && isNotStarted && !completedToday && <span className="todo-status-badge pending">○ Pending</span>}
            {isPausedToday && <span className="todo-status-badge paused">⏸ Paused</span>}
            {isInProgress && <span className="todo-status-badge in-progress">▶ In Progress</span>}
            {completedToday && timeElapsed && <span className="todo-duration">⏱ {timeElapsed}</span>}
          </div>
        </div>
        
        {/* Three-dot menu */}
        <div className="todo-menu">
          <button 
            className="menu-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Task options"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
          
          {menuOpen && (
            <>
              <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
              <div className="menu-dropdown">
                {/* Edit button */}
                <button 
                  className="menu-item"
                  onClick={() => { setIsEditing(true); setMenuOpen(false); }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit
                </button>
                
                {/* Start button - only when not started and today is scheduled */}
                {canComplete && isNotStarted && !completedToday && (
                  <button 
                    className="menu-item"
                    onClick={() => { onStart(task.id); setMenuOpen(false); }}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    Start
                  </button>
                )}
                
                {/* Pause button - only when in progress */}
                {canComplete && isInProgress && !completedToday && (
                  <button 
                    className="menu-item"
                    onClick={() => { onPause(task.id); setMenuOpen(false); }}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" />
                      <rect x="14" y="4" width="4" height="16" />
                    </svg>
                    Pause
                  </button>
                )}
                
                {/* Resume button - only when paused */}
                {canComplete && isPausedToday && !completedToday && (
                  <button 
                    className="menu-item"
                    onClick={() => { onResume(task.id); setMenuOpen(false); }}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    Resume
                  </button>
                )}
                
                {/* History */}
                <button 
                  className="menu-item"
                  onClick={() => { setShowHistory(!showHistory); setMenuOpen(false); }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  {showHistory ? 'Hide History' : 'Show History'}
                </button>
                
                {/* Delete */}
                <button 
                  className="menu-item danger"
                  onClick={() => { onDelete(task.id); setMenuOpen(false); }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* History section */}
      {showHistory && (
        <div className="recurring-history">
          <div className="history-header">
            <span>History</span>
            <button className="history-close" onClick={() => setShowHistory(false)}>×</button>
          </div>
          <div className="history-list">
            {historyItems.length === 0 ? (
              <div className="history-empty">No history yet</div>
            ) : (
              historyItems.map((item) => (
                <div key={item.date} className={`history-item ${item.status}`}>
                  <span className="history-date">{formatHistoryDate(item.date)}</span>
                  <span className={`history-status ${item.status}`}>
                    {item.status === 'completed' && (
                      <>✓ Completed {item.timeTaken != null && <span className="history-time">({formatTime(item.timeTaken)})</span>}</>
                    )}
                    {item.status === 'missed' && '✗ Missed'}
                    {item.status === 'pending' && '○ Pending'}
                    {item.status === 'paused' && '⏸ Paused'}
                    {item.status === 'in_progress' && '○ In Progress'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export default App;
