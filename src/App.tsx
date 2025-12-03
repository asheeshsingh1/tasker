import { useState, useEffect, useMemo, type ChangeEvent, type KeyboardEvent, type FormEvent } from "react";
import { auth, todos, setToken, type User, type Todo } from "./api";

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
type StatusFilter = "all" | "active" | "completed";
type DateFilter = "all" | "today" | "week" | "older";
type SortOption = "newest" | "oldest" | "name" | "completed-fast" | "completed-slow";

// Helper functions for date filtering
function getDaysDiff(date: Date): number {
  const now = new Date();
  const diffTime = now.getTime() - date.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

function isToday(date: Date): boolean {
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function isWithinWeek(date: Date): boolean {
  return getDaysDiff(date) <= 7;
}

function formatDuration(createdAt: string, completedAt: string | null): string | null {
  if (!completedAt) return null;
  
  const start = new Date(createdAt).getTime();
  const end = new Date(completedAt).getTime();
  const diffMs = end - start;
  
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
  const days = getDaysDiff(date);
  
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
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
  
  // Filter states
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [showOldCompleted, setShowOldCompleted] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>("newest");

  // Fetch todos on mount
  useEffect(() => {
    const fetchTodos = async () => {
      try {
        const data = await todos.list();
        setTodoList(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load todos");
      } finally {
        setLoading(false);
      }
    };
    fetchTodos();
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
        if (statusFilter === "active" && todo.completed) return false;
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

  const handleInput = (e: ChangeEvent<HTMLInputElement>) => {
    setTask(e.target.value);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") addTask();
  };

  const completedCount = todoList.filter((t) => t.completed).length;
  const totalCount = todoList.length;
  const activeCount = totalCount - completedCount;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

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
      </header>

      {/* Error banner */}
      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError("")}>✕</button>
        </div>
      )}

      {/* Progress */}
      {totalCount > 0 && (
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

      {/* Input */}
      <div className="input-area">
        <input
          type="text"
          className="task-input"
          placeholder="What needs to be done?"
          value={task}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <button className="add-btn" onClick={addTask}>
          Add Task
        </button>
      </div>

      {/* Filter Toggle & Bar */}
      {totalCount > 0 && (
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
                  </button>
                  <button
                    className={`filter-btn ${statusFilter === "active" && !isSortingByDuration ? "active" : ""}`}
                    onClick={() => setStatusFilter("active")}
                    disabled={isSortingByDuration}
                  >
                    Active
                  </button>
                  <button
                    className={`filter-btn ${statusFilter === "completed" || isSortingByDuration ? "active" : ""}`}
                    onClick={() => setStatusFilter("completed")}
                    disabled={isSortingByDuration}
                  >
                    Done
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

      {/* Hidden tasks notice */}
      {hiddenOldCompletedCount > 0 && (
        <div className="hidden-notice">
          <span>{hiddenOldCompletedCount} completed task{hiddenOldCompletedCount > 1 ? 's' : ''} older than 3 days hidden</span>
          <button onClick={() => setShowOldCompleted(true)}>Show all</button>
        </div>
      )}

      {/* Show all toggle when showing old completed */}
      {showOldCompleted && hiddenOldCompletedCount === 0 && todoList.some(t => t.completed && getDaysDiff(new Date(t.createdAt)) > 3) && (
        <div className="hidden-notice">
          <span>Showing all tasks including old completed</span>
          <button onClick={() => setShowOldCompleted(false)}>Hide old completed</button>
        </div>
      )}

      {/* Todo List */}
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
              onDelete={deleteTask}
            />
          ))
        )}
      </ul>

      {/* Footer */}
      {totalCount > 0 && (
        <footer className="app-footer">
          <span className="footer-stat">
            <strong>{totalCount - completedCount}</strong> task{totalCount - completedCount !== 1 ? 's' : ''} remaining
          </span>
          {completedCount > 0 && (
            <button className="clear-completed-btn" onClick={clearCompleted}>
              Clear completed
            </button>
          )}
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
  onDelete: (id: string) => void;
}

function TodoItem({ todo, onToggle, onDelete }: TodoItemProps) {
  const relativeDate = formatRelativeDate(todo.createdAt);
  const isOld = getDaysDiff(new Date(todo.createdAt)) > 3;
  const duration = formatDuration(todo.createdAt, todo.completedAt);
  
  return (
    <li className={`todo-item ${todo.completed ? 'completed' : ''} ${isOld ? 'old' : ''}`}>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={todo.completed}
          onChange={() => onToggle(todo.id)}
        />
        <span className="checkbox-visual" />
      </label>
      <div className="todo-content">
        <span className="todo-text">{todo.text}</span>
        <div className="todo-meta">
          <span className="todo-date">{relativeDate}</span>
          {duration && <span className="todo-duration">⏱ {duration}</span>}
        </div>
      </div>
      <button
        className="delete-btn"
        onClick={() => onDelete(todo.id)}
        aria-label="Delete task"
        title="Deleting a todo removes it forever."
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
        </svg>
      </button>
    </li>
  );
}

export default App;
