import express from "express";
import crypto from "crypto";
import { body, validationResult } from "express-validator";
import multer from "multer";
import path from "path";
import { authenticateToken } from "../middleware/auth.js";
import { authorizeRoles } from "../middleware/auth.js";
import User from "../models/User.js";

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, DOC, and DOCX files are allowed"), false);
    }
  },
});

// Get current user profile
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      username: user.username,
      email: user.email,
      provider: user.provider,
      role: user.role,
      created_at: user.createdAt,
      last_login: user.lastLogin,
      profile: user.profile,
      studentProfile: user.studentProfile || {},
      hrProfile: user.hrProfile || {},
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update user profile
router.put(
  "/me",
  [
    body("email")
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage("Please provide a valid email"),
    body("profile.full_name")
      .optional()
      .isLength({ max: 100 })
      .withMessage("Full name must be less than 100 characters"),
    body("profile.bio")
      .optional()
      .isLength({ max: 500 })
      .withMessage("Bio must be less than 500 characters"),
    body("profile.location")
      .optional()
      .isLength({ max: 100 })
      .withMessage("Location must be less than 100 characters"),
    body("profile.website")
      .optional()
      .isURL()
      .withMessage("Please provide a valid website URL"),
    body("profile.phone")
      .optional()
      .matches(/^[\+]?[1-9][\d]{0,15}$/)
      .withMessage("Please provide a valid phone number"),
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

      const { email, profile } = req.body;
      const updateFields = {};

      // Check if email is being updated and if it's already taken
      if (email && email !== req.user.email) {
        const existingUser = await User.findOne({
          email,
          _id: { $ne: req.user._id },
        });
        if (existingUser) {
          return res.status(400).json({ error: "Email is already taken" });
        }
        updateFields.email = email;
      }

      // Update profile fields
      if (profile) {
        const profileUpdate = {};

        if (profile.full_name !== undefined)
          profileUpdate["profile.full_name"] = profile.full_name;
        if (profile.bio !== undefined)
          profileUpdate["profile.bio"] = profile.bio;
        if (profile.location !== undefined)
          profileUpdate["profile.location"] = profile.location;
        if (profile.website !== undefined)
          profileUpdate["profile.website"] = profile.website;
        if (profile.phone !== undefined)
          profileUpdate["profile.phone"] = profile.phone;
        if (profile.avatar !== undefined)
          profileUpdate["profile.avatar"] = profile.avatar;

        Object.assign(updateFields, profileUpdate);
      }

      if (Object.keys(updateFields).length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      // Update user
      const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        { $set: updateFields },
        { new: true, runValidators: true }
      ).select("-password");

      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        username: updatedUser.username,
        email: updatedUser.email,
        provider: updatedUser.provider,
        created_at: updatedUser.createdAt,
        last_login: updatedUser.lastLogin,
        profile: updatedUser.profile,
      });
    } catch (error) {
      console.error("Update profile error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Upload resume
router.post(
  "/upload-resume",
  upload.single("resume"),
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { originalname, mimetype, size, buffer } = req.file;

      // Convert file to base64
      const fileBase64 = buffer.toString("base64");

      const resumeData = {
        filename: originalname,
        content_type: mimetype,
        file_size: size,
        uploaded_at: new Date(),
        file_data: fileBase64,
        // Public token for non-authenticated viewing
        public_token: crypto.randomBytes(24).toString("hex"),
      };

      // Update user with resume (store under studentProfile.resume going forward)
      const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        { $set: { "studentProfile.resume": resumeData } },
        { new: true }
      ).select("-password");

      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        message: "Resume uploaded successfully",
        filename: originalname,
        file_size: size,
        uploaded_at: resumeData.uploaded_at,
      });
    } catch (error) {
      console.error("Upload resume error:", error);
      if (error.code === "LIMIT_FILE_SIZE") {
        return res
          .status(400)
          .json({ error: "File size too large. Maximum size is 10MB" });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Public resume viewer by token (no auth)
router.get("/public/resume/:userId/:token", async (req, res) => {
  try {
    const { userId, token } = req.params;
    const user = await User.findById(userId).select(
      "studentProfile.resume profile.resume"
    );
    if (!user) return res.status(404).json({ error: "User not found" });
    const resume =
      (user.studentProfile && user.studentProfile.resume) ||
      user.profile?.resume;
    if (!resume || !resume.file_data || !resume.public_token) {
      return res.status(404).json({ error: "No resume found" });
    }
    if (token !== resume.public_token) {
      return res.status(403).json({ error: "Invalid token" });
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

    res.send(fileBuffer);
  } catch (error) {
    console.error("Public resume view error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Download resume
router.get("/download-resume", authenticateToken, async (req, res) => {
  if (req.user.role !== "student") {
    return res
      .status(403)
      .json({ error: "Only students can download their resume" });
  }
  try {
    const user = await User.findById(req.user._id).select(
      "studentProfile.resume profile.resume"
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const resume =
      (user.studentProfile && user.studentProfile.resume) ||
      user.profile?.resume;
    if (!resume || !resume.file_data) {
      return res.status(404).json({ error: "No resume found" });
    }

    // Convert base64 back to buffer
    const fileBuffer = Buffer.from(resume.file_data, "base64");

    // Compute cache validators
    const lastModified = resume.uploaded_at
      ? new Date(resume.uploaded_at)
      : new Date();
    const lastModifiedStr = lastModified.toUTCString();
    const etag = `${fileBuffer.length}-${lastModified.getTime()}`;

    res.set({
      "Content-Type": resume.content_type,
      // Use inline so browsers render instead of forcing download
      "Content-Disposition": `inline; filename="${resume.filename}"`,
      "Content-Length": fileBuffer.length,
      // Prevent caching so clients always fetch latest resume
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
      Expires: "0",
      // Ensure shared caches differentiate by auth
      Vary: "Authorization",
      "Last-Modified": lastModifiedStr,
      ETag: etag,
    });

    res.send(fileBuffer);
  } catch (error) {
    console.error("Download resume error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete resume
router.delete("/delete-resume", authenticateToken, async (req, res) => {
  if (req.user.role !== "student") {
    return res
      .status(403)
      .json({ error: "Only students can delete their resume" });
  }
  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $unset: { "studentProfile.resume": "", "profile.resume": "" } },
      { new: true }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ message: "Resume deleted successfully" });
  } catch (error) {
    console.error("Delete resume error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Change password (for local users only)
router.put(
  "/change-password",
  [
    body("currentPassword")
      .notEmpty()
      .withMessage("Current password is required"),
    body("newPassword")
      .isLength({ min: 6 })
      .withMessage("New password must be at least 6 characters long")
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage(
        "New password must contain at least one lowercase letter, one uppercase letter, and one number"
      ),
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

      const { currentPassword, newPassword } = req.body;

      // Only local users can change password
      if (req.user.provider !== "local") {
        return res.status(400).json({
          error: "Password change not available for social login users",
        });
      }

      // Get user with password
      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Verify current password
      const isCurrentPasswordValid = await user.comparePassword(
        currentPassword
      );
      if (!isCurrentPasswordValid) {
        return res.status(400).json({ error: "Current password is incorrect" });
      }

      // Update password
      user.password = newPassword;
      await user.save();

      res.json({ message: "Password changed successfully" });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Deactivate account
router.delete("/me", authenticateToken, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { isActive: false },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ message: "Account deactivated successfully" });
  } catch (error) {
    console.error("Deactivate account error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
