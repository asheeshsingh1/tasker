import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import todoRoutes from "./routes/todos.js";
import recurringRoutes from "./routes/recurring.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/todos", todoRoutes);
app.use("/api/recurring", recurringRoutes);

// Health check
app.get("/api/health", (_, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

