import express from "express";
import Interview from "../models/Interview.js";
import Job from "../models/Job.js";
import { authenticateToken, authorizeRoles } from "../middleware/auth.js";

const router = express.Router();

// Get all scheduled interviews for a user
router.get("/my-interviews", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Clean up expired interviews first
    await Interview.cleanupExpiredInterviews();

    const interviews = await Interview.find({
      user: userId,
      status: { $in: ["scheduled", "in-progress"] },
    })
      .populate("job", "title company location")
      .sort({ scheduledAt: 1 });

    res.json({
      success: true,
      interviews: interviews.map((interview) => ({
        id: interview._id,
        job: interview.job,
        scheduledAt: interview.scheduledAt,
        duration: interview.duration,
        status: interview.status,
        type: interview.type,
        timeUntilStart: interview.timeUntilStart,
        timeRemaining: interview.timeRemaining,
        isExpired: interview.isExpired,
      })),
    });
  } catch (error) {
    console.error("Error fetching user interviews:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch interviews",
    });
  }
});

// Schedule a new interview
router.post("/schedule", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { jobId, scheduledAt, duration = 10 } = req.body;

    // Validate required fields
    if (!jobId || !scheduledAt) {
      return res.status(400).json({
        success: false,
        message: "Job ID and scheduled time are required",
      });
    }

    // Check if job exists
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    // Check if user has applied to this job
    const hasApplied = job.applications.some(
      (app) => app.user.toString() === userId
    );

    if (!hasApplied) {
      return res.status(400).json({
        success: false,
        message: "You must apply to this job before scheduling an interview",
      });
    }

    // Parse scheduled time
    const scheduledDate = new Date(scheduledAt);

    // Validate scheduled time (must be in the future)
    if (scheduledDate <= new Date()) {
      return res.status(400).json({
        success: false,
        message: "Interview must be scheduled for a future time",
      });
    }

    // Check for time conflicts
    const conflict = await Interview.checkTimeConflict(scheduledDate, duration);
    if (conflict) {
      return res.status(400).json({
        success: false,
        message: "Time slot is already booked. Please choose a different time.",
      });
    }

    // Create new interview
    const interview = new Interview({
      user: userId,
      job: jobId,
      scheduledAt: scheduledDate,
      duration: duration,
      type: "ai-interview",
    });

    await interview.save();

    // Populate job details
    await interview.populate("job", "title company location");

    res.status(201).json({
      success: true,
      message: "Interview scheduled successfully",
      interview: {
        id: interview._id,
        job: interview.job,
        scheduledAt: interview.scheduledAt,
        duration: interview.duration,
        status: interview.status,
        type: interview.type,
        timeUntilStart: interview.timeUntilStart,
      },
    });
  } catch (error) {
    console.error("Error scheduling interview:", error);
    res.status(500).json({
      success: false,
      message: "Failed to schedule interview",
    });
  }
});

// Cancel/Delete an interview
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const interviewId = req.params.id;
    const userId = req.user.id;

    const interview = await Interview.findOne({
      _id: interviewId,
      user: userId,
    });

    if (!interview) {
      return res.status(404).json({
        success: false,
        message: "Interview not found",
      });
    }

    // Check if interview can be cancelled
    if (interview.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel completed interview",
      });
    }

    await Interview.findByIdAndDelete(interviewId);

    res.json({
      success: true,
      message: "Interview cancelled successfully",
    });
  } catch (error) {
    console.error("Error cancelling interview:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel interview",
    });
  }
});

// Start an interview
router.post("/:id/start", authenticateToken, async (req, res) => {
  try {
    const interviewId = req.params.id;
    const userId = req.user.id;

    const interview = await Interview.findOne({
      _id: interviewId,
      user: userId,
    });

    if (!interview) {
      return res.status(404).json({
        success: false,
        message: "Interview not found",
      });
    }

    // Check if interview can be started
    const now = new Date();
    const timeUntilStart = interview.scheduledAt.getTime() - now.getTime();
    const timeUntilEnd =
      interview.scheduledAt.getTime() +
      interview.duration * 60 * 1000 -
      now.getTime();

    if (timeUntilStart > 0) {
      return res.status(400).json({
        success: false,
        message: "Interview has not started yet",
        timeUntilStart: timeUntilStart,
      });
    }

    if (timeUntilEnd <= 0) {
      return res.status(400).json({
        success: false,
        message: "Interview time has expired",
      });
    }

    if (interview.status !== "scheduled") {
      return res.status(400).json({
        success: false,
        message: "Interview cannot be started",
      });
    }

    // Update interview status
    interview.status = "in-progress";
    interview.startedAt = now;
    await interview.save();

    res.json({
      success: true,
      message: "Interview started successfully",
      interview: {
        id: interview._id,
        timeRemaining: interview.timeRemaining,
        duration: interview.duration,
      },
    });
  } catch (error) {
    console.error("Error starting interview:", error);
    res.status(500).json({
      success: false,
      message: "Failed to start interview",
    });
  }
});

// Complete an interview
router.post("/:id/complete", authenticateToken, async (req, res) => {
  try {
    const interviewId = req.params.id;
    const userId = req.user.id;
    const { notes } = req.body;

    const interview = await Interview.findOne({
      _id: interviewId,
      user: userId,
    });

    if (!interview) {
      return res.status(404).json({
        success: false,
        message: "Interview not found",
      });
    }

    if (interview.status !== "in-progress") {
      return res.status(400).json({
        success: false,
        message: "Interview is not in progress",
      });
    }

    // Update interview status
    interview.status = "completed";
    interview.completedAt = new Date();
    if (notes) {
      interview.notes = notes;
    }
    await interview.save();

    res.json({
      success: true,
      message: "Interview completed successfully",
    });
  } catch (error) {
    console.error("Error completing interview:", error);
    res.status(500).json({
      success: false,
      message: "Failed to complete interview",
    });
  }
});

// Get interview details with countdown
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const interviewId = req.params.id;
    const userId = req.user.id;

    const interview = await Interview.findOne({
      _id: interviewId,
      user: userId,
    }).populate("job", "title company location");

    if (!interview) {
      return res.status(404).json({
        success: false,
        message: "Interview not found",
      });
    }

    res.json({
      success: true,
      interview: {
        id: interview._id,
        job: interview.job,
        scheduledAt: interview.scheduledAt,
        duration: interview.duration,
        status: interview.status,
        type: interview.type,
        timeUntilStart: interview.timeUntilStart,
        timeRemaining: interview.timeRemaining,
        isExpired: interview.isExpired,
        startedAt: interview.startedAt,
        completedAt: interview.completedAt,
      },
    });
  } catch (error) {
    console.error("Error fetching interview details:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch interview details",
    });
  }
});

// Clean up expired interviews (admin endpoint)
router.post(
  "/cleanup",
  authenticateToken,
  authorizeRoles(["hr", "admin"]),
  async (req, res) => {
    try {
      const result = await Interview.cleanupExpiredInterviews();

      res.json({
        success: true,
        message: `Cleaned up ${result.modifiedCount} expired interviews`,
        modifiedCount: result.modifiedCount,
      });
    } catch (error) {
      console.error("Error cleaning up interviews:", error);
      res.status(500).json({
        success: false,
        message: "Failed to cleanup interviews",
      });
    }
  }
);

export default router;
