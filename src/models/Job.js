import mongoose from "mongoose";

const jobSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    company: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    location: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    experience: {
      type: String,
      required: true,
      enum: ["Entry", "Mid", "Senior", "Lead"],
      default: "Mid",
    },
    skills: [
      {
        type: String,
        trim: true,
        maxlength: 50,
      },
    ],
    description: {
      type: String,
      required: true,
      maxlength: 2000,
    },
    salary: {
      min: {
        type: Number,
        min: 0,
      },
      max: {
        type: Number,
        min: 0,
      },
      currency: {
        type: String,
        default: "USD",
        maxlength: 3,
      },
    },
    jobType: {
      type: String,
      enum: ["Full-time", "Part-time", "Contract", "Internship"],
      default: "Full-time",
    },
    remote: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["active", "paused", "closed"],
      default: "active",
    },
    postedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    applications: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        // Snapshot of candidate's resume at time of application (optional)
        resume: {
          filename: { type: String },
          content_type: { type: String },
          file_size: { type: Number },
          uploaded_at: { type: Date },
          file_data: { type: String }, // base64 encoded; may increase doc size
        },
        appliedAt: {
          type: Date,
          default: Date.now,
        },
        status: {
          type: String,
          enum: ["pending", "reviewed", "accepted", "rejected"],
          default: "pending",
        },
        coverLetter: {
          type: String,
          maxlength: 1000,
        },
        // LLM analysis summary of the candidate resume
        analysis: {
          summary: { type: String, default: "" },
          analyzedAt: { type: Date },
          model: { type: String, default: "" },
          urlsAnalyzed: [{ type: String }], // URLs that were crawled and analyzed
          interviewQuestions: [{ type: String }], // AI-generated interview questions
        },
      },
    ],
    tags: [
      {
        type: String,
        trim: true,
        maxlength: 30,
      },
    ],
    benefits: [
      {
        type: String,
        trim: true,
        maxlength: 100,
      },
    ],
    requirements: [
      {
        type: String,
        trim: true,
        maxlength: 200,
      },
    ],
    applicationDeadline: {
      type: Date,
    },
    views: {
      type: Number,
      default: 0,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better performance
jobSchema.index({ title: "text", company: "text", description: "text" });
jobSchema.index({ status: 1, isArchived: 1 });
jobSchema.index({ postedBy: 1 });
jobSchema.index({ createdAt: -1 });

// Virtual for formatted creation date
jobSchema.virtual("uploadedAt").get(function () {
  return this.createdAt ? this.createdAt.toISOString().split("T")[0] : null;
});

// Ensure virtual fields are serialized
jobSchema.set("toJSON", { virtuals: true });

const Job = mongoose.model("Job", jobSchema);

export default Job;
