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
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const { runAegisPipeline } = require("./orchestrator/pipeline");

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
    error: "Not found. Endpoints: POST /aegis, /aegis/stream, /scribe, /guardian, /compliance, /sentinel, /advocate, /vision, /message — GET /health, /sse",
  });
});

// ── MCP Server Setup (For Prompt Opinion Hackathon) ──────────────────────────
const mcpServer = new Server({
  name: "aegis-mcp-server",
  version: "1.0.0",
}, {
  capabilities: { tools: {} }
});

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "run_aegis_pipeline",
        description: "Runs the complete Autonomous Examination Guardian & Intelligence System (AEGIS) multi-agent clinical pipeline on a patient's medical chart. Returns a synthesized, conflict-free clinical consensus.",
        inputSchema: {
          type: "object",
          properties: {
            clinical_note: { type: "string", description: "The raw clinical text or patient chart (e.g., HPI, PMH, Vitals, Medications)." }
          },
          required: ["clinical_note"]
        }
      }
    ]
  };
});

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "run_aegis_pipeline") {
    try {
      const { clinical_note } = request.params.arguments;
      if (!clinical_note) throw new Error("clinical_note argument is required");
      
      console.log(`[MCP] Executing AEGIS pipeline for incoming clinical note...`);
      const result = await runAegisPipeline(clinical_note, null);
      
      const reportText = `
# AEGIS ARBITER CONSENSUS REPORT

## Guardian (Safety Checks)
Risk Level: ${result.guardian.riskLevel}
Summary: ${result.guardian.summary}

## Sentinel (Missed Diagnoses)
Status: ${result.sentinel.status}
Summary: ${result.sentinel.summary}

## Compliance (ICD-10 & Billing)
Status: ${result.compliance.status}
Summary: ${result.compliance.summary}

## Advocate (Prior Authorization)
Status: ${result.advocate.status}
Recommendation: ${result.advocate.recommendation}

## Final Arbiter Decision
${result.arbiter.finalDecision}

---
*Generated by AEGIS Multi-Agent System via MCP on Google Cloud Run*
`;
      return { content: [{ type: "text", text: reportText }] };
    } catch (e) {
      console.error("[MCP] Tool error:", e);
      return { isError: true, content: [{ type: "text", text: `AEGIS Pipeline Error: ${e.message}` }] };
    }
  }
  throw new Error(`Tool not found: ${request.params.name}`);
});

const activeTransports = new Map();
app.get("/sse", async (req, res) => {
  console.log("[MCP] New SSE connection established");
  const transport = new SSEServerTransport("/message", res);
  const sessionId = Math.random().toString(36).substring(7);
  activeTransports.set(sessionId, transport);
  res.setHeader("X-Session-ID", sessionId);
  await mcpServer.connect(transport);
  req.on('close', () => {
    console.log(`[MCP] SSE connection closed (session: ${sessionId})`);
    activeTransports.delete(sessionId);
  });
});

app.post("/message", async (req, res) => {
  const sessionId = req.headers["x-session-id"];
  let transport = sessionId ? activeTransports.get(sessionId) : Array.from(activeTransports.values()).pop();
  if (!transport) {
    res.status(400).send("No active SSE connection");
    return;
  }
  await transport.handlePostMessage(req, res);
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
║      GET  /sse           MCP Server Connection Endpoint          ║
║      POST /message       MCP Server Message Transport            ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
