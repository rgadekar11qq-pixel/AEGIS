/**
 * AEGIS — Run History Logger
 * Saves every pipeline run to JSON files for audit trail and replay.
 * Runs are stored in /data/runs/ as individual JSON files.
 */

const fs = require("fs");
const path = require("path");

const RUNS_DIR = path.join(__dirname, "..", "..", "data", "runs");

// Ensure directory exists
if (!fs.existsSync(RUNS_DIR)) {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
}

/**
 * Save a pipeline run result.
 * @param {object} result — Full pipeline result object
 * @returns {object} — { id, filename, timestamp }
 */
function saveRun(result) {
  const id = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const timestamp = new Date().toISOString();

  const record = {
    id,
    timestamp,
    summary: {
      overallRisk: result.summary?.overallRisk || "UNKNOWN",
      totalIssues: result.summary?.totalIssues || 0,
      criticalIssues: result.summary?.criticalIssues || 0,
      pipelineDurationMs: result.summary?.pipelineDurationMs || 0,
      executiveSummary: result.summary?.executiveSummary || "",
    },
    timings: result.timings || {},
    agents: {},
  };

  // Save agent summaries (not full output to keep files manageable)
  const agentNames = ["scribe", "guardian", "compliance", "sentinel", "advocate", "vision", "arbiter"];
  for (const name of agentNames) {
    const agent = result.agents?.[name];
    if (!agent) continue;
    record.agents[name] = {
      status: agent.status,
      // Save key metrics per agent
      ...(name === "scribe" && agent.output ? {
        diagnosesCount: agent.output.diagnoses?.length || 0,
        medicationsCount: agent.output.medications?.length || 0,
        patient: agent.output.patient?.name || "Unknown",
      } : {}),
      ...(name === "guardian" && agent.output ? { riskLevel: agent.output.riskLevel, findingsCount: agent.output.findings?.length || 0 } : {}),
      ...(name === "compliance" && agent.output ? { overallStatus: agent.output.overallStatus, findingsCount: agent.output.billingFindings?.length || 0 } : {}),
      ...(name === "sentinel" && agent.output ? { riskLevel: agent.output.riskLevel, findingsCount: agent.output.findings?.length || 0 } : {}),
      ...(name === "advocate" && agent.output ? { urgency: agent.output.urgency, category: agent.output.category } : {}),
      ...(name === "vision" && agent.output ? { status: agent.output.status } : {}),
      ...(name === "arbiter" && agent.output ? {
        overallRisk: agent.output.overallRisk,
        totalIssues: agent.output.totalIssues,
        votingConfidence: agent.output.voting?.confidence,
        conflictCount: agent.output.conflictCount,
      } : {}),
    };
  }

  // Save full result as well for replay
  const fullRecord = { ...record, fullResult: result };

  const filename = `${id}.json`;
  fs.writeFileSync(path.join(RUNS_DIR, filename), JSON.stringify(fullRecord, null, 2));

  return { id, filename, timestamp };
}

/**
 * Get all saved runs (summaries only, sorted newest first).
 * @param {number} limit — Max number of runs to return
 * @returns {Array} — Run summaries
 */
function getRuns(limit = 50) {
  if (!fs.existsSync(RUNS_DIR)) return [];
  const files = fs.readdirSync(RUNS_DIR)
    .filter(f => f.endsWith(".json"))
    .sort((a, b) => b.localeCompare(a)) // newest first (timestamp in filename)
    .slice(0, limit);

  return files.map(f => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(RUNS_DIR, f), "utf-8"));
      // Return summary only (not fullResult)
      const { fullResult, ...summary } = data;
      return summary;
    } catch (e) { return null; }
  }).filter(Boolean);
}

/**
 * Get a single run by ID (full result).
 * @param {string} id — Run ID
 * @returns {object|null}
 */
function getRun(id) {
  const filename = `${id}.json`;
  const filepath = path.join(RUNS_DIR, filename);
  if (!fs.existsSync(filepath)) return null;
  return JSON.parse(fs.readFileSync(filepath, "utf-8"));
}

module.exports = { saveRun, getRuns, getRun };
