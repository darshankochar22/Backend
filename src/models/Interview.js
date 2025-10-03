import mongoose from "mongoose";

const interviewSchema = new mongoose.Schema(
  {
    // User who scheduled the interview
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Job associated with the interview
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },

    // Scheduled date and time
    scheduledAt: {
      type: Date,
      required: true,
    },

    // Interview duration in minutes (default 10 minutes)
    duration: {
      type: Number,
      default: 10,
    },

    // Interview status
    status: {
      type: String,
      enum: ["scheduled", "in-progress", "completed", "cancelled", "expired"],
      default: "scheduled",
    },

    // Interview type
    type: {
      type: String,
      enum: ["ai-interview", "hr-interview"],
      default: "ai-interview",
    },

    // Meeting room ID or link (for future use)
    meetingRoom: {
      type: String,
      default: null,
    },

    // Interview notes or feedback
    notes: {
      type: String,
      default: null,
    },

    // When the interview was actually started
    startedAt: {
      type: Date,
      default: null,
    },

    // When the interview was completed
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
interviewSchema.index({ user: 1, scheduledAt: 1 });
interviewSchema.index({ job: 1, scheduledAt: 1 });
interviewSchema.index({ scheduledAt: 1, status: 1 });

// Virtual for checking if interview is expired
interviewSchema.virtual("isExpired").get(function () {
  const now = new Date();
  const endTime = new Date(
    this.scheduledAt.getTime() + this.duration * 60 * 1000
  );
  return now > endTime && this.status === "scheduled";
});

// Virtual for time remaining until interview starts
interviewSchema.virtual("timeUntilStart").get(function () {
  const now = new Date();
  const timeDiff = this.scheduledAt.getTime() - now.getTime();
  return Math.max(0, timeDiff);
});

// Virtual for time remaining in interview
interviewSchema.virtual("timeRemaining").get(function () {
  if (this.status !== "in-progress" || !this.startedAt) return 0;

  const now = new Date();
  const endTime = new Date(
    this.startedAt.getTime() + this.duration * 60 * 1000
  );
  const timeDiff = endTime.getTime() - now.getTime();
  return Math.max(0, timeDiff);
});

// Method to check for time conflicts
interviewSchema.statics.checkTimeConflict = async function (
  scheduledAt,
  duration,
  excludeId = null
) {
  const startTime = new Date(scheduledAt);
  const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

  const query = {
    status: { $in: ["scheduled", "in-progress"] },
    $or: [
      // New interview starts during existing interview
      {
        scheduledAt: { $lte: startTime },
        $expr: {
          $gt: [
            { $add: ["$scheduledAt", { $multiply: ["$duration", 60000] }] },
            startTime,
          ],
        },
      },
      // New interview ends during existing interview
      {
        scheduledAt: { $lt: endTime },
        $expr: {
          $gt: [
            { $add: ["$scheduledAt", { $multiply: ["$duration", 60000] }] },
            endTime,
          ],
        },
      },
      // New interview completely contains existing interview
      {
        scheduledAt: { $gte: startTime },
        $expr: {
          $lte: [
            { $add: ["$scheduledAt", { $multiply: ["$duration", 60000] }] },
            endTime,
          ],
        },
      },
    ],
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const conflictingInterview = await this.findOne(query);
  return conflictingInterview;
};

// Method to clean up expired interviews
interviewSchema.statics.cleanupExpiredInterviews = async function () {
  const now = new Date();

  const result = await this.updateMany(
    {
      status: "scheduled",
      $expr: {
        $lt: [
          { $add: ["$scheduledAt", { $multiply: ["$duration", 60000] }] },
          now,
        ],
      },
    },
    {
      $set: { status: "expired" },
    }
  );

  return result;
};

export default mongoose.model("Interview", interviewSchema);
