import express from "express";
import { body, query, validationResult } from "express-validator";
import { authenticateToken } from "../middleware/auth.js";
import Todo from "../models/Todo.js";

const router = express.Router();

// Validation middleware
const validateTodo = [
  body("title")
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage("Title must be between 1 and 200 characters"),
  body("description")
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Description must be less than 1000 characters"),
  body("priority")
    .optional()
    .isIn(["low", "medium", "high"])
    .withMessage("Priority must be low, medium, or high"),
  body("category")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("Category must be less than 50 characters"),
  body("tags").optional().isArray().withMessage("Tags must be an array"),
  body("tags.*")
    .optional()
    .trim()
    .isLength({ max: 30 })
    .withMessage("Each tag must be less than 30 characters"),
  body("dueDate")
    .optional()
    .isISO8601()
    .withMessage("Due date must be a valid ISO 8601 date"),
];

// Get all todos for the authenticated user
router.get(
  "/",
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
    query("completed")
      .optional()
      .isBoolean()
      .withMessage("Completed must be a boolean"),
    query("priority")
      .optional()
      .isIn(["low", "medium", "high"])
      .withMessage("Priority must be low, medium, or high"),
    query("category")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Category must be less than 50 characters"),
    query("sortBy")
      .optional()
      .isIn(["createdAt", "updatedAt", "dueDate", "priority", "title"])
      .withMessage("Invalid sort field"),
    query("sortOrder")
      .optional()
      .isIn(["asc", "desc"])
      .withMessage("Sort order must be asc or desc"),
  ],
  authenticateToken,
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: "Validation failed",
          details: errors.array(),
        });
      }

      const {
        page = 1,
        limit = 20,
        completed,
        priority,
        category,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = req.query;

      // Build filter object
      const filter = { user: req.user._id, isArchived: false };

      if (completed !== undefined) {
        filter.completed = completed === "true";
      }

      if (priority) {
        filter.priority = priority;
      }

      if (category) {
        filter.category = category;
      }

      // Build sort object
      const sort = {};
      sort[sortBy] = sortOrder === "asc" ? 1 : -1;

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Get todos with pagination
      const todos = await Todo.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .populate("user", "username email");

      // Get total count for pagination
      const totalTodos = await Todo.countDocuments(filter);
      const totalPages = Math.ceil(totalTodos / limit);

      res.json({
        todos,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalTodos,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      });
    } catch (error) {
      console.error("Get todos error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Get a specific todo
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const todo = await Todo.findOne({
      _id: req.params.id,
      user: req.user._id,
    }).populate("user", "username email");

    if (!todo) {
      return res.status(404).json({ error: "Todo not found" });
    }

    res.json(todo);
  } catch (error) {
    console.error("Get todo error:", error);
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid todo ID" });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a new todo
router.post("/", validateTodo, authenticateToken, async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: "Validation failed",
        details: errors.array(),
      });
    }

    const { title, description, priority, category, tags, dueDate } = req.body;

    const todo = new Todo({
      title,
      description: description || "",
      priority: priority || "medium",
      category: category || "general",
      tags: tags || [],
      dueDate: dueDate || null,
      user: req.user._id,
    });

    await todo.save();
    await todo.populate("user", "username email");

    res.status(201).json(todo);
  } catch (error) {
    console.error("Create todo error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update a todo
router.put("/:id", validateTodo, authenticateToken, async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: "Validation failed",
        details: errors.array(),
      });
    }

    const { title, description, priority, category, tags, dueDate, completed } =
      req.body;

    const updateFields = {};
    if (title !== undefined) updateFields.title = title;
    if (description !== undefined) updateFields.description = description;
    if (priority !== undefined) updateFields.priority = priority;
    if (category !== undefined) updateFields.category = category;
    if (tags !== undefined) updateFields.tags = tags;
    if (dueDate !== undefined) updateFields.dueDate = dueDate;
    if (completed !== undefined) updateFields.completed = completed;

    const todo = await Todo.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $set: updateFields },
      { new: true, runValidators: true }
    ).populate("user", "username email");

    if (!todo) {
      return res.status(404).json({ error: "Todo not found" });
    }

    res.json(todo);
  } catch (error) {
    console.error("Update todo error:", error);
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid todo ID" });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

// Toggle todo completion status
router.patch("/:id/toggle", authenticateToken, async (req, res) => {
  try {
    const todo = await Todo.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!todo) {
      return res.status(404).json({ error: "Todo not found" });
    }

    todo.completed = !todo.completed;
    await todo.save();
    await todo.populate("user", "username email");

    res.json(todo);
  } catch (error) {
    console.error("Toggle todo error:", error);
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid todo ID" });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete a todo
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const todo = await Todo.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!todo) {
      return res.status(404).json({ error: "Todo not found" });
    }

    res.json({ message: "Todo deleted successfully" });
  } catch (error) {
    console.error("Delete todo error:", error);
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid todo ID" });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

// Archive a todo
router.patch("/:id/archive", authenticateToken, async (req, res) => {
  try {
    const todo = await Todo.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isArchived: true },
      { new: true }
    ).populate("user", "username email");

    if (!todo) {
      return res.status(404).json({ error: "Todo not found" });
    }

    res.json(todo);
  } catch (error) {
    console.error("Archive todo error:", error);
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid todo ID" });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get archived todos
router.get(
  "/archive/list",
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
  ],
  authenticateToken,
  async (req, res) => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const skip = (page - 1) * limit;

      const todos = await Todo.find({
        user: req.user._id,
        isArchived: true,
      })
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate("user", "username email");

      const totalTodos = await Todo.countDocuments({
        user: req.user._id,
        isArchived: true,
      });
      const totalPages = Math.ceil(totalTodos / limit);

      res.json({
        todos,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalTodos,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      });
    } catch (error) {
      console.error("Get archived todos error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Restore archived todo
router.patch("/:id/restore", authenticateToken, async (req, res) => {
  try {
    const todo = await Todo.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isArchived: false },
      { new: true }
    ).populate("user", "username email");

    if (!todo) {
      return res.status(404).json({ error: "Todo not found" });
    }

    res.json(todo);
  } catch (error) {
    console.error("Restore todo error:", error);
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid todo ID" });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get todo statistics
router.get("/stats/overview", authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;

    const [
      totalTodos,
      completedTodos,
      pendingTodos,
      overdueTodos,
      todosByPriority,
      todosByCategory,
    ] = await Promise.all([
      Todo.countDocuments({ user: userId, isArchived: false }),
      Todo.countDocuments({ user: userId, completed: true, isArchived: false }),
      Todo.countDocuments({
        user: userId,
        completed: false,
        isArchived: false,
      }),
      Todo.countDocuments({
        user: userId,
        completed: false,
        isArchived: false,
        dueDate: { $lt: new Date() },
      }),
      Todo.aggregate([
        { $match: { user: userId, isArchived: false } },
        { $group: { _id: "$priority", count: { $sum: 1 } } },
      ]),
      Todo.aggregate([
        { $match: { user: userId, isArchived: false } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]),
    ]);

    res.json({
      totalTodos,
      completedTodos,
      pendingTodos,
      overdueTodos,
      completionRate:
        totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0,
      todosByPriority: todosByPriority.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      todosByCategory: todosByCategory.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
    });
  } catch (error) {
    console.error("Get todo stats error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
