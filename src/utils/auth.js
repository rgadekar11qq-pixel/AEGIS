/**
 * AEGIS Enterprise Authentication & Access Control Subsystem
 *
 * Implements server-side cryptographic authentication for clinical decision support.
 * Compliant with HIPAA Security Rule (45 CFR § 164.312 - Technical Safeguards):
 *   - Strictly limits access to two predefined clinical accounts (Owner and Guest)
 *   - Password verification using salted bcrypt hashes (12 rounds)
 *   - Constant-time verification & dummy hashing to mitigate timing side-channel attacks
 *   - Tamper-evident HMAC-SHA256 authenticated session tokens
 *   - In-memory rate limiting against brute-force login attempts
 *   - Comprehensive HIPAA audit logging of security events
 */

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

// Server signing secret for session tokens
const AUTH_SECRET = process.env.AEGIS_SESSION_SECRET || crypto.randomBytes(32).toString("hex");

// Pre-computed constant-time dummy hash (prevents username enumeration timing leaks)
const DUMMY_HASH = "$2a$12$e8yL9sYmPj4rGk0/0E8mvuC.5j1rO9HsqqE2aT3/B1uM4bKzJ3Qv.";

// Audit log location
const AUDIT_DIR = process.env.VERCEL ? "/tmp/data" : path.join(__dirname, "..", "..", "data");
try {
  if (!fs.existsSync(AUDIT_DIR)) fs.mkdirSync(AUDIT_DIR, { recursive: true });
} catch (e) {
  // Silent fallback in read-only environment
}
const AUDIT_LOG = path.join(AUDIT_DIR, "audit.log");

function logSecurityEvent(event, userId, ip, details = "") {
  const ts = new Date().toISOString();
  const entry = `[SECURITY] ${ts} | EVENT: ${event} | USER: ${userId || "ANONYMOUS"} | IP: ${ip || "UNKNOWN"} | ${details}\n`;
  try {
    fs.appendFile(AUDIT_LOG, entry, () => {});
  } catch (e) {}
}

// In-memory cache for hashed credentials derived from plain env vars
let cachedAccounts = null;

/**
 * Loads the two predefined accounts (Owner and Guest) from environment variables.
 * No public registration or user creation is permitted.
 */
function getAuthorizedAccounts() {
  if (cachedAccounts) return cachedAccounts;

  const accounts = [];

  // 1. Owner account
  const ownerId = (process.env.AEGIS_OWNER_ID || "owner").trim();
  let ownerHash = process.env.AEGIS_OWNER_PASSWORD_HASH;
  if (!ownerHash && process.env.AEGIS_OWNER_PASSWORD) {
    ownerHash = bcrypt.hashSync(process.env.AEGIS_OWNER_PASSWORD.trim(), 12);
  }

  if (ownerHash) {
    accounts.push({
      id: ownerId,
      passwordHash: ownerHash,
      role: "owner",
      name: process.env.AEGIS_OWNER_NAME || "System Administrator",
      title: "Lead Clinical Administrator",
      department: "Executive Medical Informatics"
    });
  }

  // 2. Guest account
  const guestId = (process.env.AEGIS_GUEST_ID || "guest").trim();
  let guestHash = process.env.AEGIS_GUEST_PASSWORD_HASH;
  if (!guestHash && process.env.AEGIS_GUEST_PASSWORD) {
    guestHash = bcrypt.hashSync(process.env.AEGIS_GUEST_PASSWORD.trim(), 12);
  }

  if (guestHash) {
    accounts.push({
      id: guestId,
      passwordHash: guestHash,
      role: "guest",
      name: process.env.AEGIS_GUEST_NAME || "Clinical Evaluator",
      title: "Attending Clinical Evaluator",
      department: "External Peer Review"
    });
  }

  cachedAccounts = accounts;
  return accounts;
}

/**
 * Resets cached accounts (useful when testing or dynamically reconfiguring env)
 */
function invalidateAccountCache() {
  cachedAccounts = null;
}

/**
 * Verifies credentials against the predefined accounts using bcrypt.
 * Runs a dummy bcrypt comparison if the user does not exist to prevent
 * username enumeration via response-timing side-channels.
 */
function verifyCredentials(username, password) {
  if (!username || !password || typeof username !== "string" || typeof password !== "string") {
    return null;
  }

  const cleanUser = username.trim();
  const accounts = getAuthorizedAccounts();
  const user = accounts.find(a => a.id.toLowerCase() === cleanUser.toLowerCase());

  if (!user) {
    // Constant-time dummy bcrypt check
    try {
      bcrypt.compareSync(password, DUMMY_HASH);
    } catch (e) {}
    return null;
  }

  const isMatch = bcrypt.compareSync(password, user.passwordHash);
  if (!isMatch) return null;

  return {
    id: user.id,
    role: user.role,
    name: user.name,
    title: user.title,
    department: user.department
  };
}

/**
 * Generates an HMAC-SHA256 signed session token (24-hour validity)
 */
function generateSessionToken(user, expiresInHours = 24) {
  const now = Date.now();
  const payload = {
    sub: user.id,
    id: user.id,
    role: user.role,
    name: user.name,
    title: user.title,
    department: user.department,
    iat: now,
    exp: now + expiresInHours * 60 * 60 * 1000,
    nonce: crypto.randomBytes(16).toString("hex")
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", AUTH_SECRET).update(payloadB64).digest("base64url");

  return `${payloadB64}.${signature}`;
}

/**
 * Validates a session token signature, structure, and expiration
 */
function verifySessionToken(tokenString) {
  if (!tokenString || typeof tokenString !== "string") return null;

  const parts = tokenString.trim().split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;
  const expectedSig = crypto.createHmac("sha256", AUTH_SECRET).update(payloadB64).digest("base64url");

  const expectedBuf = Buffer.from(expectedSig);
  const actualBuf = Buffer.from(signature);

  if (expectedBuf.length !== actualBuf.length) return null;
  if (!crypto.timingSafeEqual(expectedBuf, actualBuf)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (Date.now() > payload.exp) {
      return null; // Expired
    }
    return payload;
  } catch (err) {
    return null;
  }
}

/**
 * Extracts session token from cookie, header, or query parameter
 */
function extractToken(req) {
  if (!req) return null;

  // 1. Signed or standard HttpOnly cookie
  if (req.cookies && req.cookies.aegis_session) {
    return req.cookies.aegis_session;
  }

  // 2. Fallback to raw cookie header parsing
  if (req.headers && req.headers.cookie) {
    const match = req.headers.cookie.match(/(?:^|;\s*)aegis_session=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }

  // 3. Authorization Bearer header
  const authHeader = req.headers && (req.headers["authorization"] || req.headers["Authorization"]);
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  // 4. Query param ?token= (used for EventSource SSE)
  if (req.query && req.query.token) {
    return req.query.token;
  }

  return null;
}

/**
 * Determines whether a request is authenticated
 */
function isAuthenticated(req) {
  const token = extractToken(req);
  if (!token) return false;
  const user = verifySessionToken(token);
  if (!user) return false;
  req.user = user;
  return true;
}

/**
 * Express Middleware: Strictly guards clinical API endpoints.
 * Returns HTTP 401 JSON on unauthenticated requests.
 */
function requireAuthApi(req, res, next) {
  if (isAuthenticated(req)) {
    return next();
  }

  const clientIp = req.ip || (req.connection && req.connection.remoteAddress) || "unknown";
  logSecurityEvent("UNAUTHORIZED_API_ACCESS_BLOCKED", null, clientIp, `${req.method} ${req.originalUrl}`);

  return res.status(401).json({
    success: false,
    error: "Access Denied: Enterprise authentication required to access clinical decision services.",
    code: "AUTH_REQUIRED"
  });
}

/**
 * Express Middleware: Strictly guards protected web pages.
 * Redirects unauthenticated requests to /login.
 */
function requireAuthPage(req, res, next) {
  if (isAuthenticated(req)) {
    return next();
  }
  return res.redirect("/login");
}

/**
 * Express Middleware: Strictly guards protected frontend assets (e.g. app.js).
 */
function requireAuthAsset(req, res, next) {
  if (isAuthenticated(req)) {
    return next();
  }
  return res.status(401).send("Unauthorized");
}

// ── Rate Limiting for Login Endpoint ──────────────────────────────────────────
const loginAttempts = new Map();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function rateLimitLogin(req, res, next) {
  const ip = req.ip || (req.connection && req.connection.remoteAddress) || "unknown";
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (record) {
    if (now < record.lockoutUntil) {
      const waitMinutes = Math.ceil((record.lockoutUntil - now) / 60000);
      logSecurityEvent("LOGIN_RATE_LIMITED", null, ip, `Lockout active for ${waitMinutes}m`);
      return res.status(429).json({
        success: false,
        error: `Security Alert: Too many failed login attempts. Terminal locked for ${waitMinutes} minute(s).`,
        code: "RATE_LIMITED",
        retryAfterMinutes: waitMinutes
      });
    }

    if (now - record.firstAttempt > LOCKOUT_WINDOW_MS) {
      loginAttempts.delete(ip);
    }
  }

  next();
}

function recordFailedLogin(ip) {
  const now = Date.now();
  let record = loginAttempts.get(ip);
  if (!record || now - record.firstAttempt > LOCKOUT_WINDOW_MS) {
    record = { count: 0, firstAttempt: now, lockoutUntil: 0 };
  }
  record.count += 1;
  if (record.count >= MAX_FAILED_ATTEMPTS) {
    record.lockoutUntil = now + LOCKOUT_WINDOW_MS;
  }
  loginAttempts.set(ip, record);
}

function clearFailedLogins(ip) {
  loginAttempts.delete(ip);
}

module.exports = {
  getAuthorizedAccounts,
  invalidateAccountCache,
  verifyCredentials,
  generateSessionToken,
  verifySessionToken,
  extractToken,
  isAuthenticated,
  requireAuthApi,
  requireAuthPage,
  requireAuthAsset,
  rateLimitLogin,
  recordFailedLogin,
  clearFailedLogins,
  logSecurityEvent
};
