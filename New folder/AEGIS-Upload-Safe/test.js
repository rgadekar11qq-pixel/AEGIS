/**
 * Quick smoke test for the Clinical Documentation Pipeline API.
 * Starts the server, runs requests against all endpoints, and reports results.
 */

const http = require("http");

const PORT = 3099; // Use a non-default port so we don't conflict
process.env.PORT = PORT;

// Patch require to load our server
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const agentRoutes = require("./src/routes/agents");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.get("/health", (_req, res) => {
  res.json({ status: "ok", agents: ["scribe", "guardian", "compliance"] });
});
app.use(agentRoutes);
app.use((err, _req, res, _next) => {
  res.status(err.statusCode || 500).json({ success: false, error: err.message });
});

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts = {
      hostname: "127.0.0.1",
      port: PORT,
      path,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
    };
    const req = http.request(opts, (res) => {
      let buf = "";
      res.on("data", (chunk) => (buf += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(buf) });
        } catch (e) {
          resolve({ status: res.statusCode, body: buf });
        }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${PORT}${path}`, (res) => {
      let buf = "";
      res.on("data", (chunk) => (buf += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(buf) });
        } catch (e) {
          resolve({ status: res.statusCode, body: buf });
        }
      });
    }).on("error", reject);
  });
}

async function run() {
  const server = app.listen(PORT);

  const results = [];

  // ── 1. Health check ──
  try {
    const r = await get("/health");
    const pass = r.status === 200 && r.body.status === "ok";
    results.push(`[${pass ? "PASS" : "FAIL"}] GET /health — status=${r.status}`);
  } catch (e) {
    results.push(`[FAIL] GET /health — ${e.message}`);
  }

  // ── 2. Guardian (deterministic — no API key needed) ──
  try {
    const r = await post("/guardian", {
      entities: {
        medications: [
          { name: "aspirin", dose: "81mg", route: "oral", frequency: "daily" },
          { name: "warfarin", dose: "5mg", route: "oral", frequency: "daily" },
        ],
        allergies: ["penicillin"],
      },
    });
    const pass =
      r.status === 200 &&
      r.body.success === true &&
      r.body.data.riskLevel === "HIGH" &&
      r.body.data.findings.length >= 1;
    results.push(
      `[${pass ? "PASS" : "FAIL"}] POST /guardian — risk=${r.body.data?.riskLevel}, findings=${r.body.data?.findings?.length}`
    );
    if (pass) {
      for (const f of r.body.data.findings) {
        results.push(`   ↳ ${f.type}: ${f.severity} — ${f.drugs?.join(" + ") || f.drug} — ${f.message.slice(0, 80)}`);
      }
    }
  } catch (e) {
    results.push(`[FAIL] POST /guardian — ${e.message}`);
  }

  // ── 3. Compliance (deterministic — no API key needed) ──
  try {
    const r = await post("/compliance", {
      entities: {
        diagnoses: [
          { name: "Type 2 Diabetes", icd10: "E11.9" },
          { name: "Essential Hypertension", icd10: "I10" },
          { name: "CKD Stage 3", icd10: "N18.3" },
          { name: "Unknown condition", icd10: "Z99.99" },
        ],
      },
    });
    const pass =
      r.status === 200 &&
      r.body.success === true &&
      r.body.data.overallStatus !== undefined;
    results.push(
      `[${pass ? "PASS" : "FAIL"}] POST /compliance — status=${r.body.data?.overallStatus}, icd10=${r.body.data?.icd10Validation?.length} codes, billing=${r.body.data?.billingFindings?.length} findings`
    );
    if (pass) {
      for (const v of r.body.data.icd10Validation) {
        results.push(`   ↳ ${v.code || "null"}: ${v.status} — ${v.message.slice(0, 80)}`);
      }
      for (const f of r.body.data.billingFindings) {
        results.push(`   ↳ [${f.rule}] ${f.severity} — ${f.message.slice(0, 80)}`);
      }
    }
  } catch (e) {
    results.push(`[FAIL] POST /compliance — ${e.message}`);
  }

  // ── 4. Scribe (skipped if no API key) ──
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "YOUR_GEMINI_API_KEY_HERE") {
    results.push(`[SKIP] POST /scribe — GEMINI_API_KEY not configured (expected)`);
  } else {
    try {
      const r = await post("/scribe", {
        rawText: "Patient Jane Smith, 45F. Complains of persistent cough for 2 weeks. On metformin 500mg BID for diabetes. Allergies: sulfa. BP 130/85.",
      });
      const pass = r.status === 200 && r.body.success === true;
      results.push(`[${pass ? "PASS" : "FAIL"}] POST /scribe — extracted entities successfully`);
    } catch (e) {
      results.push(`[FAIL] POST /scribe — ${e.message}`);
    }
  }

  // ── Print results ──
  console.log("\n========================================");
  console.log("  SMOKE TEST RESULTS");
  console.log("========================================");
  for (const r of results) console.log(r);
  console.log("========================================\n");

  server.close();
}

run().catch((e) => {
  console.error("Test runner error:", e);
  process.exit(1);
});
