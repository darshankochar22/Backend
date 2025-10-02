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
import jobRoutes from "./routes/jobs.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5003; // Different port from FastAPI

// Trust proxy for Vercel deployment
app.set("trust proxy", 1);

// Security middleware
app.use(helmet());

// CORS must be BEFORE rate limiting so errors still include CORS headers
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://hexagon-eran.vercel.app",
      "https://hexagon-steel.vercel.app",
      "https://hexagon.vercel.app",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.options("*", cors());

// Rate limiting (after CORS so 429 responses still have ACAO)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);
// After your cors() middleware, add:
app.options("*", cors());
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
    const mongoUrl = process.env.MONGO_URL;

    if (!mongoUrl) {
      console.error("❌ MONGO_URL environment variable is not set");
      process.exit(1);
    }

    // Validate MongoDB URL format
    if (
      !mongoUrl.startsWith("mongodb://") &&
      !mongoUrl.startsWith("mongodb+srv://")
    ) {
      console.error("❌ Invalid MongoDB URL format:", mongoUrl);
      console.error("❌ URL must start with 'mongodb://' or 'mongodb+srv://'");
      process.exit(1);
    }

    console.log("🔗 Connecting to MongoDB...");
    await mongoose.connect(mongoUrl);
    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
};

// Ensure DB is connected in serverless environments BEFORE routes
app.use(async (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    await connectDB().catch(next);
  }
  next();
});

// Routes
app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/todos", todoRoutes);
app.use("/jobs", jobRoutes);

// Health check endpoint
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Hexagon Node.js Backend is running",
    version: "1.0.1",
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

// (moved DB ensure middleware above routes)

// Start server only when not running on Vercel serverless
const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}`);
  });
};

if (!process.env.VERCEL) {
  startServer().catch(console.error);
}

export default app;
