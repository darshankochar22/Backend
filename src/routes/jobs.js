import express from "express";
import jwt from "jsonwebtoken";
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

    // If the requester is HR, only return their own posted jobs
    if (req.user && req.user.role === "hr") {
      filter.postedBy = req.user._id;
    }

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
        .populate(
          "applications.user",
          "_id username email role profile.full_name profile.resume.filename profile.resume.content_type profile.resume.file_size profile.resume.uploaded_at profile.resume.public_token studentProfile.resume.filename studentProfile.resume.content_type studentProfile.resume.file_size studentProfile.resume.uploaded_at studentProfile.resume.public_token"
        )
        .lean();

      if (!job || job.isArchived) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.postedBy.toString() !== req.user._id.toString()) {
        return res
          .status(403)
          .json({ error: "Not authorized to view applicants" });
      }

      const baseUrl = (
        process.env.BACKEND_BASE_URL || `${req.protocol}://${req.get("host")}`
      ).replace(/\/$/, "");
      const applicants = (job.applications || []).map((app) => ({
        id: app._id,
        user: app.user,
        status: app.status,
        appliedAt: app.appliedAt,
        coverLetter: app.coverLetter,
        resume: (() => {
          const r =
            (app.user &&
              app.user.studentProfile &&
              app.user.studentProfile.resume) ||
            (app.user && app.user.profile && app.user.profile.resume);
          const public_token = r && r.public_token ? r.public_token : undefined;
          const public_url =
            public_token && app.user && app.user._id
              ? `${baseUrl}/users/public/resume/${app.user._id}/${public_token}`
              : undefined;
          return r
            ? {
                filename: r.filename,
                content_type: r.content_type,
                file_size: r.file_size,
                uploaded_at: r.uploaded_at,
                has_file: !!r.filename,
                public_url,
              }
            : { has_file: false };
        })(),
      }));

      res.json({ applicants });
    } catch (error) {
      console.error("List applicants error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// HR: get a signed, temporary URL to view resume without headers (for window.open)
router.get(
  "/:id/applicants/:appId/resume-url",
  authenticateToken,
  authorizeRoles("hr"),
  async (req, res) => {
    try {
      const { id, appId } = req.params;
      const job = await Job.findById(id).select("postedBy isArchived");
      if (!job || job.isArchived) {
        return res.status(404).json({ error: "Job not found" });
      }
      if (job.postedBy.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: "Not authorized" });
      }
      const token = jwt.sign(
        {
          typ: "resume_view",
          hr: req.user._id.toString(),
          job: id,
          app: appId,
        },
        process.env.JWT_SECRET,
        { expiresIn: "60s" }
      );
      const base =
        process.env.BACKEND_BASE_URL ||
        `http://localhost:${process.env.PORT || 5003}`;
      const url = `${base}/jobs/${id}/applicants/${appId}/resume/view?st=${encodeURIComponent(
        token
      )}`;
      return res.json({ url, expires_in: 60 });
    } catch (error) {
      console.error("Generate resume URL error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Public (signed) viewer for resume
router.get("/:id/applicants/:appId/resume/view", async (req, res) => {
  try {
    const { id, appId } = req.params;
    const { st } = req.query;
    if (!st || typeof st !== "string") {
      return res.status(401).json({ error: "Missing token" });
    }
    let payload;
    try {
      payload = jwt.verify(st, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    if (
      payload.typ !== "resume_view" ||
      payload.job !== id ||
      payload.app !== appId
    ) {
      return res.status(401).json({ error: "Invalid token" });
    }
    const job = await Job.findById(id);
    if (!job || job.isArchived) {
      return res.status(404).json({ error: "Job not found" });
    }
    const application = job.applications.id(appId);
    if (!application || !application.user) {
      return res.status(404).json({ error: "Application not found" });
    }
    const applicant = await User.findById(application.user).select(
      "role profile.resume studentProfile.resume"
    );
    if (!applicant || applicant.role !== "student") {
      return res.status(404).json({ error: "Applicant not found" });
    }
    const resume =
      application.resume ||
      (applicant.studentProfile && applicant.studentProfile.resume) ||
      applicant.profile?.resume ||
      null;
    if (!resume || !resume.file_data) {
      return res.status(404).json({ error: "No resume file stored" });
    }
    const fileBuffer = Buffer.from(resume.file_data, "base64");
    const lastModified = resume.uploaded_at
      ? new Date(resume.uploaded_at)
      : new Date();
    const lastModifiedStr = lastModified.toUTCString();
    const etag = `${fileBuffer.length}-${lastModified.getTime()}`;
    res.set({
      "Content-Type": resume.content_type,
      "Content-Disposition": `inline; filename="${resume.filename}"`,
      "Content-Length": fileBuffer.length,
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
      Expires: "0",
      "Last-Modified": lastModifiedStr,
      ETag: etag,
    });
    return res.send(fileBuffer);
  } catch (error) {
    console.error("Signed resume view error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});
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
        .populate(
          "applications.user",
          "username email profile.full_name profile.resume.filename profile.resume.content_type profile.resume.file_size profile.resume.uploaded_at"
        )
        .lean();
      formattedJob.applications = (fullJob.applications || []).map((app) => ({
        id: app._id,
        user: app.user,
        status: app.status,
        appliedAt: app.appliedAt,
        coverLetter: app.coverLetter,
        resume:
          app.user && app.user.profile && app.user.profile.resume
            ? {
                filename: app.user.profile.resume.filename,
                content_type: app.user.profile.resume.content_type,
                file_size: app.user.profile.resume.file_size,
                uploaded_at: app.user.profile.resume.uploaded_at,
                has_file: !!app.user.profile.resume.filename,
              }
            : { has_file: false },
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
        return res
          .status(404)
          .json({ error: "Job not found or not available" });
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

      // Resolve candidate resume (prefer studentProfile.resume, then legacy profile.resume)
      const applicantForSnapshot = await User.findById(req.user._id).select(
        "studentProfile.resume profile.resume"
      );
      const selectedResume =
        (applicantForSnapshot.studentProfile &&
          applicantForSnapshot.studentProfile.resume) ||
        (applicantForSnapshot.profile && applicantForSnapshot.profile.resume) ||
        null;

      // Add application with embedded resume snapshot (if present)
      job.applications.push({
        user: req.user._id,
        coverLetter: coverLetter || "",
        appliedAt: new Date(),
        status: "pending",
        ...(selectedResume
          ? {
              resume: {
                filename: selectedResume.filename,
                content_type: selectedResume.content_type,
                file_size: selectedResume.file_size,
                uploaded_at: selectedResume.uploaded_at,
                file_data: selectedResume.file_data,
              },
            }
          : {}),
      });

      await job.save();

      res.json({
        message: "Application submitted successfully",
        resume_attached: !!selectedResume,
      });
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

// HR: download applicant resume for a specific job (only if HR owns the job)
router.get(
  "/:id/applicants/:appId/resume",
  authenticateToken,
  authorizeRoles("hr"),
  async (req, res) => {
    try {
      const { id, appId } = req.params;
      const job = await Job.findById(id).populate(
        "applications.user",
        "profile.resume studentProfile.resume filename"
      );
      if (!job || job.isArchived) {
        return res.status(404).json({ error: "Job not found" });
      }
      if (job.postedBy.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: "Not authorized" });
      }
      const application = job.applications.id(appId);
      if (!application || !application.user) {
        return res.status(404).json({ error: "Application not found" });
      }
      // Prefer embedded snapshot on the application; fallback to latest from user
      const applicant = await User.findById(application.user).select(
        "role profile.resume studentProfile.resume"
      );
      if (applicant.role !== "student") {
        return res.status(400).json({ error: "Applicant is not a student" });
      }

      const snapshot = application.resume || null;
      const latest =
        (applicant.studentProfile && applicant.studentProfile.resume) ||
        applicant.profile?.resume ||
        null;
      const resume = snapshot || latest;

      if (!resume || !resume.file_data) {
        return res.status(404).json({ error: "No resume file stored" });
      }

      const fileBuffer = Buffer.from(resume.file_data, "base64");

      // Cache-safe, inline display
      const lastModified = resume.uploaded_at
        ? new Date(resume.uploaded_at)
        : new Date();
      const lastModifiedStr = lastModified.toUTCString();
      const etag = `${fileBuffer.length}-${lastModified.getTime()}`;

      res.set({
        "Content-Type": resume.content_type,
        "Content-Disposition": `inline; filename="${resume.filename}"`,
        "Content-Length": fileBuffer.length,
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        Pragma: "no-cache",
        Expires: "0",
        Vary: "Authorization",
        "Last-Modified": lastModifiedStr,
        ETag: etag,
      });
      return res.send(fileBuffer);
    } catch (error) {
      console.error("Download applicant resume error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// HR: delete an application for a job they own
router.delete(
  "/:id/applicants/:appId",
  authenticateToken,
  authorizeRoles("hr"),
  async (req, res) => {
    try {
      const { id, appId } = req.params;
      const job = await Job.findById(id);
      if (!job || job.isArchived) {
        return res.status(404).json({ error: "Job not found" });
      }
      if (job.postedBy.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: "Not authorized" });
      }
      const application = job.applications.id(appId);
      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      // Remove subdocument safely in Mongoose 7/8
      job.applications.pull({ _id: appId });
      await job.save();

      return res.json({ message: "Application deleted" });
    } catch (error) {
      console.error("Delete application error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);
