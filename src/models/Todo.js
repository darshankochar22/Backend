import mongoose from "mongoose";

const todoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxLength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxLength: 1000,
      default: "",
    },
    completed: {
      type: Boolean,
      default: false,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    dueDate: {
      type: Date,
      default: null,
    },
    category: {
      type: String,
      trim: true,
      default: "general",
      maxLength: 50,
    },
    tags: [
      {
        type: String,
        trim: true,
        maxLength: 30,
      },
    ],
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Set completedAt when todo is marked as completed
todoSchema.pre("save", function (next) {
  if (this.isModified("completed")) {
    if (this.completed && !this.completedAt) {
      this.completedAt = new Date();
    } else if (!this.completed && this.completedAt) {
      this.completedAt = null;
    }
  }
  next();
});

// Indexes for better performance
todoSchema.index({ user: 1, createdAt: -1 });
todoSchema.index({ user: 1, completed: 1 });
todoSchema.index({ user: 1, category: 1 });
todoSchema.index({ user: 1, priority: 1 });
todoSchema.index({ user: 1, dueDate: 1 });

const Todo = mongoose.model("Todo", todoSchema);

export default Todo;
