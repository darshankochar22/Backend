import express from "express";
import { body, query, validationResult } from "express-validator";
import { authenticateToken, optionalAuth } from "../middleware/auth.js";
import { authorizeRoles } from "../middleware/auth.js";
import Job from "../models/Job.js";
import User from "../models/User.js";

const router = express.Router();

// Validation middleware
const validateJob = [
  body("title")
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage("Title must be between 1 and 200 characters"),
  body("company")
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Company must be between 1 and 100 characters"),
  body("location")
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Location must be between 1 and 100 characters"),
  body("experience")
    .optional()
    .isIn(["Entry", "Mid", "Senior", "Lead"])
    .withMessage("Experience must be Entry, Mid, Senior, or Lead"),
  body("skills").optional().isArray().withMessage("Skills must be an array"),
  body("skills.*")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("Each skill must be less than 50 characters"),
  body("description")
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage("Description must be between 1 and 2000 characters"),
  body("salary.min")
    .optional()
    .isNumeric()
    .withMessage("Minimum salary must be a number"),
  body("salary.max")
    .optional()
    .isNumeric()
    .withMessage("Maximum salary must be a number"),
  body("jobType")
    .optional()
    .isIn(["Full-time", "Part-time", "Contract", "Internship"])
    .withMessage(
      "Job type must be Full-time, Part-time, Contract, or Internship"
    ),
  body("remote").optional().isBoolean().withMessage("Remote must be a boolean"),
  body("tags").optional().isArray().withMessage("Tags must be an array"),
  body("tags.*")
    .optional()
    .trim()
    .isLength({ max: 30 })
    .withMessage("Each tag must be less than 30 characters"),
  body("benefits")
    .optional()
    .isArray()
    .withMessage("Benefits must be an array"),
  body("benefits.*")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Each benefit must be less than 100 characters"),
  body("requirements")
    .optional()
    .isArray()
    .withMessage("Requirements must be an array"),
  body("requirements.*")
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage("Each requirement must be less than 200 characters"),
];

// Get all jobs (public endpoint)
router.get("/", optionalAuth, async (req, res) => {
  try {
    const {
      search,
      experience,
      location,
      company,
      remote,
      jobType,
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    // Build filter object
    const filter = {
      status: "active",
      isArchived: false,
    };

    // Add search filter
    if (search) {
      filter.$text = { $search: search };
    }

    // Add experience filter
    if (experience && experience !== "all") {
      filter.experience = experience;
    }

    // Add location filter
    if (location) {
      filter.location = { $regex: location, $options: "i" };
    }

    // Add company filter
    if (company) {
      filter.company = { $regex: company, $options: "i" };
    }

    // Add remote filter
    if (remote !== undefined) {
      filter.remote = remote === "true";
    }

    // Add job type filter
    if (jobType) {
      filter.jobType = jobType;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build sort object
    const sort = {};
    if (sortBy === "relevance" && search) {
      sort.score = { $meta: "textScore" };
    } else {
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;
    }

    // Execute query
    const jobs = await Job.find(filter)
      .populate("postedBy", "username email profile.full_name")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const total = await Job.countDocuments(filter);

    // Format response
    const formattedJobs = jobs.map((job) => ({
      id: job._id,
      title: job.title,
      company: job.company,
      location: job.location,
      experience: job.experience,
      skills: job.skills || [],
      description: job.description,
      salary: job.salary,
      jobType: job.jobType,
      remote: job.remote,
      status: job.status,
      uploadedAt: job.createdAt.toISOString().split("T")[0],
      postedBy: job.postedBy,
      tags: job.tags || [],
      benefits: job.benefits || [],
      requirements: job.requirements || [],
      views: job.views,
      applicationDeadline: job.applicationDeadline,
    }));

    res.json({
      jobs: formattedJobs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Get jobs error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// HR: list applicants for a job they posted
router.get(
  "/:id/applicants",
  authenticateToken,
  authorizeRoles("hr"),
  async (req, res) => {
    try {
      const job = await Job.findById(req.params.id)
        .populate("applications.user", "username email profile.full_name role")
        .lean();

      if (!job || job.isArchived) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.postedBy.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: "Not authorized to view applicants" });
      }

      const applicants = (job.applications || []).map((app) => ({
        id: app._id,
        user: app.user,
        status: app.status,
        appliedAt: app.appliedAt,
        coverLetter: app.coverLetter,
      }));

      res.json({ applicants });
    } catch (error) {
      console.error("List applicants error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Get a single job by ID
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate("postedBy", "username email profile.full_name")
      .lean();

    if (!job || job.isArchived) {
      return res.status(404).json({ error: "Job not found" });
    }

    // Increment view count (only for non-posters)
    if (!req.user || req.user._id.toString() !== job.postedBy._id.toString()) {
      await Job.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });
      job.views += 1;
    }

    const formattedJob = {
      id: job._id,
      title: job.title,
      company: job.company,
      location: job.location,
      experience: job.experience,
      skills: job.skills || [],
      description: job.description,
      salary: job.salary,
      jobType: job.jobType,
      remote: job.remote,
      status: job.status,
      uploadedAt: job.createdAt.toISOString().split("T")[0],
      postedBy: job.postedBy,
      tags: job.tags || [],
      benefits: job.benefits || [],
      requirements: job.requirements || [],
      views: job.views,
      applicationDeadline: job.applicationDeadline,
    };

    // Include applications ONLY for HR owner viewing their own job
    const isOwnerHr =
      req.user &&
      req.user.role === "hr" &&
      job.postedBy &&
      job.postedBy._id &&
      req.user._id.toString() === job.postedBy._id.toString();

    if (isOwnerHr) {
      const fullJob = await Job.findById(req.params.id)
        .populate("applications.user", "username email profile.full_name")
        .lean();
      formattedJob.applications = (fullJob.applications || []).map((app) => ({
        id: app._id,
        user: app.user,
        status: app.status,
        appliedAt: app.appliedAt,
        coverLetter: app.coverLetter,
      }));
    }

    res.json(formattedJob);
  } catch (error) {
    console.error("Get job error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a new job
router.post(
  "/",
  validateJob,
  authenticateToken,
  authorizeRoles("hr"),
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

    const jobData = {
      ...req.body,
      postedBy: req.user._id,
    };

    const job = new Job(jobData);
    await job.save();
    await job.populate("postedBy", "username email profile.full_name");

    const formattedJob = {
      id: job._id,
      title: job.title,
      company: job.company,
      location: job.location,
      experience: job.experience,
      skills: job.skills || [],
      description: job.description,
      salary: job.salary,
      jobType: job.jobType,
      remote: job.remote,
      status: job.status,
      uploadedAt: job.createdAt.toISOString().split("T")[0],
      postedBy: job.postedBy,
      tags: job.tags || [],
      benefits: job.benefits || [],
      requirements: job.requirements || [],
      views: job.views,
      applicationDeadline: job.applicationDeadline,
    };

    res.status(201).json(formattedJob);
  } catch (error) {
    console.error("Create job error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
  }
);

// Update a job
router.put(
  "/:id",
  validateJob,
  authenticateToken,
  authorizeRoles("hr"),
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

    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    // Check if user owns the job
    if (job.postedBy.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ error: "Not authorized to update this job" });
    }

    const updatedJob = await Job.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate("postedBy", "username email profile.full_name");

    const formattedJob = {
      id: updatedJob._id,
      title: updatedJob.title,
      company: updatedJob.company,
      location: updatedJob.location,
      experience: updatedJob.experience,
      skills: updatedJob.skills || [],
      description: updatedJob.description,
      salary: updatedJob.salary,
      jobType: updatedJob.jobType,
      remote: updatedJob.remote,
      status: updatedJob.status,
      uploadedAt: updatedJob.createdAt.toISOString().split("T")[0],
      postedBy: updatedJob.postedBy,
      tags: updatedJob.tags || [],
      benefits: updatedJob.benefits || [],
      requirements: updatedJob.requirements || [],
      views: updatedJob.views,
      applicationDeadline: updatedJob.applicationDeadline,
    };

    res.json(formattedJob);
  } catch (error) {
    console.error("Update job error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
  }
);

// Delete a job
router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles("hr"),
  async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    // Check if user owns the job
    if (job.postedBy.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ error: "Not authorized to delete this job" });
    }

    // Soft delete by archiving
    job.isArchived = true;
    job.status = "closed";
    await job.save();

    res.json({ message: "Job deleted successfully" });
  } catch (error) {
    console.error("Delete job error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
  }
);

// Apply to a job
router.post(
  "/:id/apply",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
  try {
    const { coverLetter } = req.body;

    const job = await Job.findById(req.params.id);
    if (!job || job.isArchived || job.status !== "active") {
      return res.status(404).json({ error: "Job not found or not available" });
    }

    // Check if user already applied
    const existingApplication = job.applications.find(
      (app) => app.user.toString() === req.user._id.toString()
    );

    if (existingApplication) {
      return res
        .status(400)
        .json({ error: "You have already applied to this job" });
    }

    // Add application
    job.applications.push({
      user: req.user._id,
      coverLetter: coverLetter || "",
      appliedAt: new Date(),
      status: "pending",
    });

    await job.save();
    await job.populate("applications.user", "username email profile.full_name");

    res.json({ message: "Application submitted successfully" });
  } catch (error) {
    console.error("Apply to job error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
  }
);

// Get user's posted jobs
router.get(
  "/my/jobs",
  authenticateToken,
  authorizeRoles("hr"),
  async (req, res) => {
  try {
    const jobs = await Job.find({ postedBy: req.user._id, isArchived: false })
      .populate("postedBy", "username email profile.full_name")
      .sort({ createdAt: -1 })
      .lean();

    const formattedJobs = jobs.map((job) => ({
      id: job._id,
      title: job.title,
      company: job.company,
      location: job.location,
      experience: job.experience,
      skills: job.skills || [],
      description: job.description,
      salary: job.salary,
      jobType: job.jobType,
      remote: job.remote,
      status: job.status,
      uploadedAt: job.createdAt.toISOString().split("T")[0],
      postedBy: job.postedBy,
      tags: job.tags || [],
      benefits: job.benefits || [],
      requirements: job.requirements || [],
      views: job.views,
      applicationDeadline: job.applicationDeadline,
      applications: job.applications,
    }));

    res.json({ jobs: formattedJobs });
  } catch (error) {
    console.error("Get my jobs error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
  }
);

// Get user's applications
router.get(
  "/my/applications",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
  try {
    const jobs = await Job.find({
      "applications.user": req.user._id,
      isArchived: false,
    })
      .populate("postedBy", "username email profile.full_name")
      .sort({ "applications.appliedAt": -1 })
      .lean();

    const applications = [];
    jobs.forEach((job) => {
      const application = job.applications.find(
        (app) => app.user.toString() === req.user._id.toString()
      );
      if (application) {
        applications.push({
          id: application._id,
          job: {
            id: job._id,
            title: job.title,
            company: job.company,
            location: job.location,
            experience: job.experience,
            postedBy: job.postedBy,
          },
          status: application.status,
          appliedAt: application.appliedAt,
          coverLetter: application.coverLetter,
        });
      }
    });

    res.json({ applications });
  } catch (error) {
    console.error("Get my applications error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
  }
);

export default router;
