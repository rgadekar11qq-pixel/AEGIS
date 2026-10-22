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
  const ip = (req.headers && req.headers["x-forwarded-for"] ? req.headers["x-forwarded-for"].split(",")[0].trim() : null) || req.ip || "127.0.0.1";
  const isFormSubmit = req.headers["content-type"] && req.headers["content-type"].includes("application/x-www-form-urlencoded");

  if (!username || !password || typeof username !== "string" || typeof password !== "string") {
    if (isFormSubmit) return res.redirect("/login?error=missing");
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
    if (isFormSubmit) return res.redirect("/login?error=invalid");
    return res.status(401).json({
      success: false,
      error: "Access Denied: Invalid identifier or security passphrase.",
      code: "INVALID_CREDENTIALS"
    });
  }

  clearFailedLogins(ip);
  const token = generateSessionToken(user, 24);
  logSecurityEvent("LOGIN_SUCCESS", user.id, ip, `Role: ${user.role}`);

  const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
  res.cookie("aegis_session", token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: "Lax",
    maxAge: 24 * 60 * 60 * 1000,
    path: "/"
  });

  if (isFormSubmit) {
    return res.redirect("/");
  }

  res.json({
    success: true,
    authenticated: true,
    token: token,
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
  const ip = (req.headers && req.headers["x-forwarded-for"] ? req.headers["x-forwarded-for"].split(",")[0].trim() : null) || req.ip || "127.0.0.1";
  logSecurityEvent("LOGOUT", req.user ? req.user.id : "UNKNOWN", ip);
  res.clearCookie("aegis_session", { path: "/" });
  
  if (req.headers["content-type"] && req.headers["content-type"].includes("application/x-www-form-urlencoded")) {
    return res.redirect("/login");
  }

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
