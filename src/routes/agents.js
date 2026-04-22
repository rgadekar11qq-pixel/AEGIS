/**
 * AEGIS Route Definitions
 *
 * Individual agent endpoints + full pipeline + SSE streaming.
 *
 *   POST /scribe       — Extract entities from clinical notes
 *   POST /guardian      — Drug interaction / allergy checks
 *   POST /compliance    — ICD-10 + billing validation
 *   POST /sentinel      — Missed diagnosis detection
 *   POST /advocate      — Prior authorization generation
 *   POST /vision        — Medical image analysis
 *   POST /aegis         — Full AEGIS pipeline (all agents + arbiter)
 *   POST /aegis/stream  — Full pipeline with SSE streaming
 *   GET  /health        — Health check
 */

const express = require("express");
const { runScribe } = require("../agents/scribe");
const { runGuardian } = require("../agents/guardian");
const { runCompliance } = require("../agents/compliance");
const { runSentinel } = require("../agents/sentinel");
const { runAdvocate } = require("../agents/advocate");
const { runVision } = require("../agents/vision");
const { runAegisPipeline } = require("../orchestrator/pipeline");

const router = express.Router();

// ── POST /scribe ─────────────────────────────────────────────────────────
router.post("/scribe", async (req, res, next) => {
  try {
    const { rawText } = req.body;
    const entities = await runScribe(rawText);
    res.json({ success: true, agent: "scribe", timestamp: new Date().toISOString(), data: entities });
  } catch (err) { next(err); }
});

// ── POST /guardian ───────────────────────────────────────────────────────
router.post("/guardian", (req, res, next) => {
  try {
    const { entities } = req.body;
    const report = runGuardian(entities);
    res.json({ success: true, agent: "guardian", timestamp: new Date().toISOString(), data: report });
  } catch (err) { next(err); }
});

// ── POST /compliance ─────────────────────────────────────────────────────
router.post("/compliance", (req, res, next) => {
  try {
    const { entities } = req.body;
    const report = runCompliance(entities);
    res.json({ success: true, agent: "compliance", timestamp: new Date().toISOString(), data: report });
  } catch (err) { next(err); }
});

// ── POST /sentinel ───────────────────────────────────────────────────────
router.post("/sentinel", async (req, res, next) => {
  try {
    const { entities, guardianReport, complianceReport } = req.body;
    const report = await runSentinel(entities, guardianReport, complianceReport);
    res.json({ success: true, agent: "sentinel", timestamp: new Date().toISOString(), data: report });
  } catch (err) { next(err); }
});

// ── POST /advocate ───────────────────────────────────────────────────────
router.post("/advocate", async (req, res, next) => {
  try {
    const { entities, payerType, procedure } = req.body;
    const report = await runAdvocate(entities, { payerType, procedure });
    res.json({ success: true, agent: "advocate", timestamp: new Date().toISOString(), data: report });
  } catch (err) { next(err); }
});

// ── POST /vision ─────────────────────────────────────────────────────────
router.post("/vision", async (req, res, next) => {
  try {
    const { imageBase64, mimeType, mode, entities, context } = req.body;
    const report = await runVision({ imageBase64, mimeType, mode, entities, context });
    res.json({ success: true, agent: "vision", timestamp: new Date().toISOString(), data: report });
  } catch (err) { next(err); }
});

// ── POST /aegis — Full Pipeline ──────────────────────────────────────────
router.post("/aegis", async (req, res, next) => {
  try {
    const {
      rawText,
      imageBase64,
      imageMimeType,
      generatePriorAuth,
      payerType,
    } = req.body;

    if (!rawText || typeof rawText !== "string" || rawText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "rawText is required and must be a non-empty string",
      });
    }

    const result = await runAegisPipeline({
      rawText,
      imageBase64,
      imageMimeType,
      generatePriorAuth: generatePriorAuth !== false,
      payerType,
    });

    res.json({ success: true, pipeline: "aegis", timestamp: new Date().toISOString(), data: result });
  } catch (err) { next(err); }
});

// ── POST /aegis/stream — Full Pipeline with SSE ──────────────────────────
router.post("/aegis/stream", async (req, res) => {
  const {
    rawText,
    imageBase64,
    imageMimeType,
    generatePriorAuth,
    payerType,
  } = req.body;

  if (!rawText || typeof rawText !== "string" || rawText.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: "rawText is required",
    });
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sendEvent = (agent, status, data = {}) => {
    const event = JSON.stringify({ agent, status, data, timestamp: Date.now() });
    res.write(`data: ${event}\n\n`);
  };

  try {
    const result = await runAegisPipeline({
      rawText,
      imageBase64,
      imageMimeType,
      generatePriorAuth: generatePriorAuth !== false,
      payerType,
      onStep: sendEvent,
    });

    // Send final result
    sendEvent("pipeline", "done", { result });
    res.write("data: [DONE]\n\n");
  } catch (err) {
    sendEvent("pipeline", "error", { error: err.message });
    res.write("data: [DONE]\n\n");
  }

  res.end();
});

// ── Run History ──────────────────────────────────────────────────────────
const { saveRun, getRuns, getRun } = require("../data/runHistory");

// POST /aegis/runs — Save a pipeline run result
router.post("/aegis/runs", (req, res) => {
  try {
    const record = saveRun(req.body);
    res.json({ success: true, ...record });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /aegis/runs — List all saved runs (summaries)
router.get("/aegis/runs", (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const runs = getRuns(limit);
    res.json({ success: true, count: runs.length, runs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /aegis/runs/:id — Get a single run by ID (full result)
router.get("/aegis/runs/:id", (req, res) => {
  try {
    const run = getRun(req.params.id);
    if (!run) return res.status(404).json({ success: false, error: "Run not found" });
    res.json({ success: true, run });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Clinical Scores (standalone) ─────────────────────────────────────────
const { calculateClinicalScores } = require("../agents/clinicalScores");

router.post("/scores", (req, res) => {
  try {
    const { entities } = req.body;
    const scores = calculateClinicalScores(entities);
    res.json({ success: true, scores });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── FHIR R4 Bundle Export ────────────────────────────────────────────────
const { generateFHIRBundle } = require("../data/fhirExport");

router.post("/aegis/fhir", (req, res) => {
  try {
    const bundle = generateFHIRBundle(req.body);
    res.setHeader("Content-Type", "application/fhir+json");
    res.json(bundle);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /aegis/what-if — Instant deterministic re-analysis ─────────────
// Runs Guardian + Clinical Scores with toggled medications (NO LLM call)
// Response time: ~5ms — enables real-time interactive medication modeling
router.post("/aegis/what-if", (req, res, next) => {
  try {
    const { entities, disabledMeds = [] } = req.body;
    if (!entities || typeof entities !== "object") {
      return res.status(400).json({ success: false, error: "entities required" });
    }

    const startTime = Date.now();
    const disabled = new Set(disabledMeds.map(m => (m || "").toLowerCase().trim()));

    // Clone entities with filtered medications
    const modifiedEntities = {
      ...entities,
      medications: (entities.medications || []).filter(
        m => !disabled.has((m.name || "").toLowerCase().trim())
      ),
    };

    // Run deterministic Guardian (instant — no LLM)
    const guardianResult = runGuardian(modifiedEntities);

    // Run clinical scores (instant — pure math)
    const { calculateClinicalScores } = require("../agents/clinicalScores");
    const scores = calculateClinicalScores(modifiedEntities);

    const durationMs = Date.now() - startTime;

    res.json({
      success: true,
      mode: "what-if",
      durationMs,
      activeMeds: modifiedEntities.medications.map(m => m.name),
      disabledMeds: [...disabled],
      guardian: guardianResult,
      clinicalScores: scores,
      timestamp: new Date().toISOString(),
    });
  } catch (err) { next(err); }
});

// ── Health Check ─────────────────────────────────────────────────────────
router.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "AEGIS v1.0",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    provider: process.env.LLM_PROVIDER || "gemini",
  });
});

module.exports = router;
