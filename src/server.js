import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import mongoose from "mongoose";
import session from "express-session";
import MongoStore from "connect-mongo";

// Import routes
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import todoRoutes from "./routes/todos.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5003; // Different port from FastAPI

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// CORS configuration
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://hexagon-eran.vercel.app",
      "https://hexagon-steel.vercel.app", // Your actual deployed frontend
      "https://hexagon.vercel.app",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-change",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URL || "mongodb://localhost:27017/hexagon",
    }),
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// MongoDB connection
const connectDB = async () => {
  try {
    const mongoUrl =
      process.env.MONGO_URL || "mongodb://localhost:27017/hexagon";
    await mongoose.connect(mongoUrl);
    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
};

// Routes
app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/todos", todoRoutes);

// Health check endpoint
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Hexagon Node.js Backend is running",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(err.status || 500).json({
    error: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Start server
const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}`);
  });
};

startServer().catch(console.error);

export default app;
