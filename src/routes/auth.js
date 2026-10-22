/**
 * AEGIS Authentication Routes
 *
 *   POST /auth/login   — Validates credentials, sets HttpOnly session cookie
 *   POST /auth/logout  — Clears session cookie
 *   GET  /auth/session — Verifies active session and returns user profile
 */

const express = require("express");
const {
  verifyCredentials,
  generateSessionToken,
  isAuthenticated,
  rateLimitLogin,
  recordFailedLogin,
  clearFailedLogins,
  logSecurityEvent
} = require("../utils/auth");

const router = express.Router();

// ── POST /auth/login ─────────────────────────────────────────────────────────
router.post("/login", rateLimitLogin, (req, res) => {
  const { username, password } = req.body || {};
  const ip = req.ip || (req.connection && req.connection.remoteAddress) || "unknown";

  if (!username || !password || typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({
      success: false,
      error: "Medical Personnel ID and Security Passphrase are both required.",
      code: "MISSING_CREDENTIALS"
    });
  }

  const user = verifyCredentials(username, password);
  if (!user) {
    recordFailedLogin(ip);
    logSecurityEvent("LOGIN_FAILED", username, ip, "Invalid credentials provided");
    // Generic error message to prevent username enumeration
    return res.status(401).json({
      success: false,
      error: "Access Denied: Invalid identifier or security passphrase.",
      code: "INVALID_CREDENTIALS"
    });
  }

  clearFailedLogins(ip);
  const token = generateSessionToken(user, 24);
  logSecurityEvent("LOGIN_SUCCESS", user.id, ip, `Role: ${user.role}`);

  const isProd = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
  res.cookie("aegis_session", token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "Lax",
    maxAge: 24 * 60 * 60 * 1000,
    path: "/"
  });

  res.json({
    success: true,
    authenticated: true,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      title: user.title,
      department: user.department
    }
  });
});

// ── POST /auth/logout ────────────────────────────────────────────────────────
router.post("/logout", (req, res) => {
  const ip = req.ip || (req.connection && req.connection.remoteAddress) || "unknown";
  logSecurityEvent("LOGOUT", req.user ? req.user.id : "UNKNOWN", ip);
  res.clearCookie("aegis_session", { path: "/" });
  res.json({
    success: true,
    message: "Session ended successfully."
  });
});

// ── GET /auth/session ────────────────────────────────────────────────────────
router.get("/session", (req, res) => {
  if (isAuthenticated(req)) {
    return res.json({
      authenticated: true,
      user: req.user
    });
  }
  return res.json({
    authenticated: false
  });
});

module.exports = router;
