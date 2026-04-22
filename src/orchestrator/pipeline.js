/**
 * AEGIS Pipeline Orchestrator
 *
 * Coordinates all six AEGIS agents plus the Arbiter consensus engine.
 *
 *   Pipeline Order:
 *     1. Scribe (LLM) → entity extraction
 *     2. Clinical Scores (deterministic, instant)
 *     3. Guardian + Compliance (parallel, deterministic + RxNorm API)
 *     4. Sentinel (LLM) → cross-references Guardian + Compliance outputs
 *     5. Vision + Advocate (parallel, LLM, if requested)
 *     6. Arbiter → mathematical consensus (voting + Dempster-Shafer + LLM synthesis)
 *
 * Emits real-time step events via callback for the live dashboard.
 */

require("dotenv").config();

const { runScribe } = require("../agents/scribe");
const { runGuardian, runGuardianAsync } = require("../agents/guardian");
const { runCompliance } = require("../agents/compliance");
const { runSentinel } = require("../agents/sentinel");
const { runAdvocate } = require("../agents/advocate");
const { runVision } = require("../agents/vision");
const { runArbiter } = require("../orchestrator/arbiter");
const { calculateClinicalScores } = require("../agents/clinicalScores");

// ─────────────────────────────────────────────────────────────────
//  AEGIS Full Pipeline
// ─────────────────────────────────────────────────────────────────

/**
 * Runs the full AEGIS pipeline:
 *   1. Scribe — extract entities
 *   2. Guardian + Compliance + Sentinel — parallel safety/compliance/diagnostic checks
 *   3. Advocate — prior auth generation (if requested)
 *   4. Vision — image analysis (if image provided)
 *   5. Arbiter — consensus engine
 *
 * @param {object} params
 * @param {string} params.rawText — Clinical note text
 * @param {string} [params.imageBase64] — Optional medical image (base64)
 * @param {string} [params.imageMimeType] — Image MIME type
 * @param {boolean} [params.generatePriorAuth] — Generate prior auth doc
 * @param {string} [params.payerType] — Payer type for prior auth
 * @param {function} [params.onStep] — Real-time callback: (agentName, status, data) => void
 * @returns {Promise<object>} — Full AEGIS analysis result
 */
async function runAegisPipeline(params) {
  const {
    rawText,
    imageBase64 = null,
    imageMimeType = "image/png",
    generatePriorAuth = true,
    payerType = "medicare",
    onStep = null,
  } = params;

  const result = {
    timestamp: new Date().toISOString(),
    pipeline: "AEGIS v1.0",
    agents: {},
    timings: {},
  };

  const pipelineStart = Date.now();
  const emit = (agent, status, data = {}) => {
    if (onStep) onStep(agent, status, data);
  };

  // ── Step 1: SCRIBE ────────────────────────────────────────────
  emit("scribe", "running");
  const scribeStart = Date.now();
  let entities;

  try {
    entities = await runScribe(rawText);
    // Attach raw text for clinical score calculators
    entities._rawText = rawText;
    result.agents.scribe = { status: "complete", output: entities };
    result.timings.scribe = Date.now() - scribeStart;
    emit("scribe", "complete", { output: entities, durationMs: result.timings.scribe });
  } catch (err) {
    result.agents.scribe = { status: "error", error: err.message };
    emit("scribe", "error", { error: err.message });
    throw err; // Can't continue without entities
  }

  // ── Step 1b: CLINICAL SCORES (deterministic, instant) ───────
  try {
    const clinicalScores = calculateClinicalScores(entities);
    result.clinicalScores = clinicalScores;
    emit("scores", "complete", { output: clinicalScores });
  } catch (err) {
    result.clinicalScores = [];
  }

  // ── Step 2a: GUARDIAN + COMPLIANCE (parallel, no LLM dependency) ────
  emit("guardian", "running");
  emit("compliance", "running");

  const parallelStart = Date.now();
  result.failedAgents = [];

  const [guardianResult, complianceResult] = await Promise.allSettled([
    // Guardian (local DB + RxNorm API)
    (async () => {
      const start = Date.now();
      const output = await runGuardianAsync(entities);
      result.timings.guardian = Date.now() - start;
      return output;
    })(),
    // Compliance (deterministic)
    (async () => {
      const start = Date.now();
      const output = runCompliance(entities);
      result.timings.compliance = Date.now() - start;
      return output;
    })(),
  ]);

  // Process Guardian result
  let guardianOutput = null;
  if (guardianResult.status === "fulfilled") {
    guardianOutput = guardianResult.value;
    result.agents.guardian = { status: "complete", output: guardianOutput };
    emit("guardian", "complete", { output: guardianOutput, durationMs: result.timings.guardian });
  } else {
    result.agents.guardian = { status: "error", error: guardianResult.reason?.message };
    result.failedAgents.push("guardian");
    emit("guardian", "error", { error: guardianResult.reason?.message });
  }

  // Process Compliance result
  let complianceOutput = null;
  if (complianceResult.status === "fulfilled") {
    complianceOutput = complianceResult.value;
    result.agents.compliance = { status: "complete", output: complianceOutput };
    emit("compliance", "complete", { output: complianceOutput, durationMs: result.timings.compliance });
  } else {
    result.agents.compliance = { status: "error", error: complianceResult.reason?.message };
    result.failedAgents.push("compliance");
    emit("compliance", "error", { error: complianceResult.reason?.message });
  }

  // ── Step 2b: SENTINEL (runs after Guardian+Compliance for cross-referencing) ─
  emit("sentinel", "running");
  let sentinelOutput = null;
  try {
    const sentinelStart = Date.now();
    sentinelOutput = await runSentinel(entities, guardianOutput, complianceOutput);
    result.timings.sentinel = Date.now() - sentinelStart;
    result.agents.sentinel = { status: "complete", output: sentinelOutput };
    emit("sentinel", "complete", { output: sentinelOutput, durationMs: result.timings.sentinel });
  } catch (err) {
    result.timings.sentinel = 0;
    result.agents.sentinel = { status: "error", error: err.message };
    result.failedAgents.push("sentinel");
    emit("sentinel", "error", { error: err.message });
  }

  result.timings.parallelPhase = Date.now() - parallelStart;

  // ── Step 3: VISION (if image provided) ────────────────────────
  if (imageBase64) {
    emit("vision", "running");
    const visionStart = Date.now();
    try {
      const visionOutput = await runVision({
        imageBase64,
        mimeType: imageMimeType,
        mode: "full",
        entities,
      });
      result.agents.vision = { status: "complete", output: visionOutput };
      result.timings.vision = Date.now() - visionStart;
      emit("vision", "complete", { output: visionOutput, durationMs: result.timings.vision });
    } catch (err) {
      result.agents.vision = { status: "error", error: err.message };
      emit("vision", "error", { error: err.message });
    }
  } else {
    result.agents.vision = { status: "skipped", reason: "No image provided" };
    emit("vision", "skipped");
  }

  // ── Step 4: ADVOCATE (prior auth) ─────────────────────────────
  if (generatePriorAuth) {
    emit("advocate", "running");
    const advocateStart = Date.now();
    try {
      const advocateOutput = await runAdvocate(entities, { payerType });
      result.agents.advocate = { status: "complete", output: advocateOutput };
      result.timings.advocate = Date.now() - advocateStart;
      emit("advocate", "complete", { output: advocateOutput, durationMs: result.timings.advocate });
    } catch (err) {
      result.agents.advocate = { status: "error", error: err.message };
      emit("advocate", "error", { error: err.message });
    }
  } else {
    result.agents.advocate = { status: "skipped", reason: "Not requested" };
    emit("advocate", "skipped");
  }

  // ── Step 5: ARBITER (consensus) ───────────────────────────────
  emit("arbiter", "running");
  const arbiterStart = Date.now();
  try {
    const arbiterInput = {
      scribe: entities,
      guardian: result.agents.guardian?.output || null,
      compliance: result.agents.compliance?.output || null,
      sentinel: result.agents.sentinel?.output || null,
      advocate: result.agents.advocate?.output || null,
      vision: result.agents.vision?.output || null,
    };

    const arbiterOutput = await runArbiter(arbiterInput);
    result.agents.arbiter = { status: "complete", output: arbiterOutput };
    result.timings.arbiter = Date.now() - arbiterStart;
    emit("arbiter", "complete", { output: arbiterOutput, durationMs: result.timings.arbiter });
  } catch (err) {
    result.agents.arbiter = { status: "error", error: err.message };
    emit("arbiter", "error", { error: err.message });
  }

  // ── Final Summary ─────────────────────────────────────────────
  result.timings.total = Date.now() - pipelineStart;

  const arbiterOut = result.agents.arbiter?.output;
  result.summary = {
    overallRisk: arbiterOut?.overallRisk || "UNKNOWN",
    totalIssues: arbiterOut?.totalIssues || 0,
    criticalIssues: arbiterOut?.criticalIssues || 0,
    agentStatuses: arbiterOut?.agentStatuses || {},
    executiveSummary: arbiterOut?.consensus?.executiveSummary || "",
    pipelineDurationMs: result.timings.total,
  };

  emit("pipeline", "complete", { summary: result.summary });
  return result;
}

module.exports = { runAegisPipeline };
