import express from "express";
import { body, validationResult } from "express-validator";
import passport from "passport";
import User from "../models/User.js";
import {
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../middleware/auth.js";

const router = express.Router();

// Validation middleware
const validateSignup = [
  body("username")
    .isLength({ min: 3, max: 30 })
    .withMessage("Username must be between 3 and 30 characters")
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage("Username can only contain letters, numbers, and underscores")
    .trim(),
  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email address")
    .trim(),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      "Password must contain at least one lowercase letter, one uppercase letter, and one number"
    ),
  body("role")
    .optional()
    .isIn(["student", "hr"])
    .withMessage("role must be 'student' or 'hr'"),
];

const validateLogin = [
  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email address")
    .trim(),
  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 1 })
    .withMessage("Password cannot be empty"),
];

// Register new user
router.post("/signup", validateSignup, async (req, res) => {
  try {
    console.log("Signup attempt for:", req.body.email);

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log("Validation errors:", errors.array());
      return res.status(400).json({
        error: "Validation failed",
        details: errors.array(),
      });
    }

    const { username, email, password, role } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      console.log(
        "User already exists:",
        existingUser.email === email ? "email" : "username"
      );
      return res.status(400).json({
        error: "User already exists",
        field: existingUser.email === email ? "email" : "username",
      });
    }

    // Create new user
    const user = new User({
      username,
      email,
      password,
      provider: "local",
      role: role || "student",
    });

    await user.save();
    console.log("New user created:", user._id);

    // Generate tokens
    const accessToken = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    res.status(201).json({
      message: "User created successfully",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        provider: user.provider,
        role: user.role,
        profile: user.profile,
        createdAt: user.createdAt,
      },
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: "bearer",
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({
      error: "Internal server error",
      message: "Failed to create account. Please try again.",
    });
  }
});

// Login user
router.post("/login", validateLogin, async (req, res) => {
  try {
    console.log("Login attempt for:", req.body.email);

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log("Login validation errors:", errors.array());
      return res.status(400).json({
        error: "Validation failed",
        details: errors.array(),
      });
    }

    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email, provider: "local" });
    if (!user) {
      console.log("User not found for email:", email);
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Check if account is active
    if (!user.isActive) {
      console.log("Account deactivated for:", email);
      return res.status(401).json({ error: "Account is deactivated" });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      console.log("Invalid password for:", email);
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Generate tokens
    const accessToken = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    console.log("Successful login for:", email);

    res.json({
      message: "Login successful",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        provider: user.provider,
        role: user.role,
        profile: user.profile,
        lastLogin: user.lastLogin,
      },
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: "bearer",
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      error: "Internal server error",
      message: "Login failed. Please try again.",
    });
  }
});

// Refresh token endpoint
router.post("/refresh", async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(401).json({ error: "Refresh token required" });
    }

    const decoded = verifyRefreshToken(refresh_token);
    const user = await User.findById(decoded.userId);

    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    // Generate new tokens
    const accessToken = generateToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);

    res.json({
      access_token: accessToken,
      refresh_token: newRefreshToken,
      token_type: "bearer",
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    res.status(401).json({ error: "Invalid refresh token" });
  }
});

// Google OAuth routes - Rewritten
router.get("/google/url", (req, res) => {
  try {
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    if (!googleClientId) {
      return res.status(500).json({
        error: "Google OAuth not configured",
        message: "GOOGLE_CLIENT_ID is missing from environment variables",
      });
    }

    const redirectUri = `${
      process.env.BACKEND_BASE_URL || "http://localhost:5003"
    }/auth/google/callback`;

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", googleClientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");

    // Carry role via OAuth state (validated later). Defaults to 'student'.
    const requestedRole = (req.query.role || "student")
      .toString()
      .toLowerCase();
    const role = ["student", "hr"].includes(requestedRole)
      ? requestedRole
      : "student";
    authUrl.searchParams.set("state", JSON.stringify({ role }));

    console.log("Generated Google OAuth URL:", authUrl.toString());
    console.log("Redirect URI:", redirectUri);

    res.json({
      url: authUrl.toString(),
      redirect_uri: redirectUri,
    });
  } catch (error) {
    console.error("Error generating Google OAuth URL:", error);
    res.status(500).json({ error: "Failed to generate OAuth URL" });
  }
});

router.get("/google/callback", async (req, res) => {
  try {
    console.log("Google OAuth callback received");
    console.log("Query params:", req.query);

    const { code, error, state } = req.query;

    if (error) {
      console.error("Google OAuth error:", error);
      return res.redirect(
        `${
          process.env.FRONTEND_URL || "http://localhost:5173"
        }/login?error=${error}`
      );
    }

    if (!code) {
      console.error("No authorization code received");
      return res.redirect(
        `${
          process.env.FRONTEND_URL || "http://localhost:5173"
        }/login?error=no_code`
      );
    }

    // Exchange code for tokens
    const tokenData = {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${
        process.env.BACKEND_BASE_URL || "http://localhost:5003"
      }/auth/google/callback`,
      grant_type: "authorization_code",
    };

    console.log("Exchanging code for tokens...");
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(tokenData),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange failed:", tokenResponse.status, errorText);
      return res.redirect(
        `${
          process.env.FRONTEND_URL || "http://localhost:5173"
        }/login?error=token_exchange_failed`
      );
    }

    const tokens = await tokenResponse.json();
    console.log("Tokens received successfully");

    const { access_token, id_token } = tokens;

    if (!access_token) {
      console.error("No access token in response");
      return res.redirect(
        `${
          process.env.FRONTEND_URL || "http://localhost:5173"
        }/login?error=no_access_token`
      );
    }

    // Get user info from Google
    console.log("Fetching user info from Google...");
    const userInfoResponse = await fetch(
      `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${access_token}`
    );

    if (!userInfoResponse.ok) {
      const errorText = await userInfoResponse.text();
      console.error(
        "Failed to get user info:",
        userInfoResponse.status,
        errorText
      );
      return res.redirect(
        `${
          process.env.FRONTEND_URL || "http://localhost:5173"
        }/login?error=user_info_failed`
      );
    }

    const userInfo = await userInfoResponse.json();
    console.log("User info received:", {
      id: userInfo.id,
      email: userInfo.email,
      name: userInfo.name,
    });

    const { email, name, id: googleId, picture } = userInfo;

    if (!email) {
      console.error("No email in user info");
      return res.redirect(
        `${
          process.env.FRONTEND_URL || "http://localhost:5173"
        }/login?error=no_email`
      );
    }

    // Find or create user
    let user = await User.findOne({ email });
    if (!user) {
      console.log("Creating new user for:", email);
      let role = "student";
      try {
        if (state) {
          const parsed = JSON.parse(state);
          const requestedRole = (parsed.role || "student")
            .toString()
            .toLowerCase();
          if (["student", "hr"].includes(requestedRole)) role = requestedRole;
        }
      } catch (_) {}

      user = new User({
        username: email.split("@")[0],
        email,
        googleId,
        provider: "google",
        role,
        profile: {
          full_name: name || "",
          avatar: picture || "",
        },
      });
      await user.save();
      console.log("New user created:", user._id);
    } else {
      console.log("Existing user found:", user._id);
      // Update Google info if needed
      if (!user.googleId) {
        user.googleId = googleId;
        user.provider = "google";
      }
      if (!user.profile.full_name && name) {
        user.profile.full_name = name;
      }
      if (!user.profile.avatar && picture) {
        user.profile.avatar = picture;
      }
      // Optionally update role from state for existing Google users
      try {
        if (state) {
          const parsed = JSON.parse(state);
          const requestedRole = (parsed.role || "student")
            .toString()
            .toLowerCase();
          if (
            ["student", "hr"].includes(requestedRole) &&
            user.role !== requestedRole
          ) {
            user.role = requestedRole;
          }
        }
      } catch (_) {}
      await user.save();
    }

    // Generate JWT tokens
    const jwtToken = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    console.log("OAuth successful, redirecting to frontend with token");

    // Redirect to frontend with token
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    res.redirect(
      `${frontendUrl}/login?token=${jwtToken}&refresh=${refreshToken}&success=true`
    );
  } catch (error) {
    console.error("Google OAuth callback error:", error);
    res.redirect(
      `${
        process.env.FRONTEND_URL || "http://localhost:5173"
      }/login?error=oauth_failed`
    );
  }
});

// Logout endpoint (for token blacklisting if needed)
router.post("/logout", async (req, res) => {
  // For now, we'll just return success since JWT tokens are stateless
  // In a production app, you might want to implement token blacklisting
  res.json({ message: "Logged out successfully" });
});

export default router;
