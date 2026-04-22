/**
 * AEGIS — Autonomous Examination Guardian & Intelligence System
 *
 * Six-agent clinical intelligence platform powered by AMD MI300X GPUs.
 * Catches what individual humans miss through multi-agent consensus.
 *
 * Agents:
 *   SCRIBE     → AI entity extraction from clinical notes
 *   GUARDIAN    → Drug interaction & allergy safety checks
 *   COMPLIANCE  → ICD-10 & billing validation
 *   SENTINEL   → Missed diagnosis detection & clinical reasoning
 *   ADVOCATE   → Automated prior authorization generation
 *   VISION     → Medical image analysis & cross-referencing
 *   ARBITER    → Multi-agent consensus engine
 */

require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const agentRoutes = require("./routes/agents");
const { getLLM, PROVIDER } = require("./llm/provider");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "50mb" })); // Large limit for image uploads

// ── Rate Limiting (no external deps) ─────────────────────────────────────────
const _rateBuckets = new Map();
function rateLimit(windowMs, maxRequests) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    let bucket = _rateBuckets.get(key);
    if (!bucket || now - bucket.start > windowMs) {
      bucket = { start: now, count: 0 };
      _rateBuckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > maxRequests) {
      return res.status(429).json({ success: false, error: "Rate limit exceeded. Try again later." });
    }
    next();
  };
}
// Pipeline endpoints: 20 requests/min (heavy LLM calls)
app.use(["/aegis", "/scribe", "/sentinel", "/advocate", "/vision"], rateLimit(60000, 20));
// General API: 60 requests/min
app.use(["/guardian", "/compliance", "/scores"], rateLimit(60000, 60));

// ── Input Sanitization (XSS prevention) ──────────────────────────────────────
function sanitizeStrings(obj) {
  if (typeof obj === "string") {
    return obj.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
              .replace(/<[^>]*>/g, "")
              .replace(/javascript:/gi, "");
  }
  if (Array.isArray(obj)) return obj.map(sanitizeStrings);
  if (obj && typeof obj === "object") {
    const clean = {};
    for (const [k, v] of Object.entries(obj)) {
      // Don't sanitize base64 image data
      if (k === "imageBase64") { clean[k] = v; continue; }
      clean[k] = sanitizeStrings(v);
    }
    return clean;
  }
  return obj;
}
app.use((req, _res, next) => {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeStrings(req.body);
  }
  next();
});

// Request logger + HIPAA Audit Trail
const fs = require("fs");
const AUDIT_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(AUDIT_DIR)) fs.mkdirSync(AUDIT_DIR, { recursive: true });
const AUDIT_LOG = path.join(AUDIT_DIR, "audit.log");

app.use((req, res, next) => {
  const ts = new Date().toISOString();
  const method = req.method;
  const url = req.originalUrl;
  console.log(`[${ts}]  ${method}  ${url}`);

  // Audit log (HIPAA requirement — track all PHI access)
  if (url.includes("/aegis") || url.includes("/scribe") || url.includes("/sentinel")) {
    const entry = `${ts} | ${method} ${url} | IP: ${req.ip || "local"} | UA: ${(req.headers["user-agent"] || "").slice(0, 80)}\n`;
    fs.appendFile(AUDIT_LOG, entry, () => {}); // async, non-blocking
  }

  // HIPAA security headers — prevent caching of PHI
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

// Serve frontend
app.use(express.static(path.join(__dirname, "..", "public")));

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  let llmInfo;
  try {
    const llm = getLLM();
    llmInfo = { provider: PROVIDER, name: llm.name, status: "connected" };
  } catch {
    llmInfo = { provider: PROVIDER, status: "not_configured" };
  }

  res.json({
    status: "ok",
    system: "AEGIS v1.0",
    uptime: process.uptime(),
    agents: ["scribe", "guardian", "compliance", "sentinel", "advocate", "vision", "arbiter"],
    llm: llmInfo,
    timestamp: new Date().toISOString(),
  });
});

// ── Agent routes ─────────────────────────────────────────────────────────────
app.use(agentRoutes);

// ── Vitals stream routes ─────────────────────────────────────────────────────
const vitalsRoutes = require("./routes/vitals");
app.use(vitalsRoutes);

// ── 404 handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: "Not found. Endpoints: POST /aegis, /aegis/stream, /scribe, /guardian, /compliance, /sentinel, /advocate, /vision — GET /health",
  });
});

// ── Error handler ────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  const status = err.statusCode || 500;
  console.error(`[ERROR]  ${err.message}`);
  if (status === 500) console.error(err.stack);

  res.status(status).json({
    success: false,
    error: err.message,
  });
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║     █████╗ ███████╗ ██████╗ ██╗███████╗                         ║
║    ██╔══██╗██╔════╝██╔════╝ ██║██╔════╝                         ║
║    ███████║█████╗  ██║  ███╗██║███████╗                         ║
║    ██╔══██║██╔══╝  ██║   ██║██║╚════██║                         ║
║    ██║  ██║███████╗╚██████╔╝██║███████║                         ║
║    ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝╚══════╝                         ║
║                                                                  ║
║    Autonomous Examination Guardian & Intelligence System         ║
║    http://localhost:${PORT}                                          ║
║                                                                  ║
║    Agents:                                                       ║
║    ┌─────────────┬──────────────────────────────────────────┐    ║
║    │ 🖊️  Scribe   │ AI entity extraction (LLM)               │    ║
║    │ 🛡️  Guardian │ Drug interaction / allergy safety         │    ║
║    │ 📋 Compliance│ ICD-10 & billing validation              │    ║
║    │ 🔍 Sentinel  │ Missed diagnosis detection               │    ║
║    │ 📄 Advocate  │ Prior authorization generation            │    ║
║    │ 👁️  Vision   │ Medical image analysis                    │    ║
║    │ ⚖️  Arbiter  │ Multi-agent consensus engine              │    ║
║    └─────────────┴──────────────────────────────────────────┘    ║
║                                                                  ║
║    Endpoints:                                                    ║
║      POST /aegis         Full pipeline                           ║
║      POST /aegis/stream  Pipeline with SSE streaming             ║
║      GET  /health        System status                           ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
