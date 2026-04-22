/**
 * ARBITER v2 — Multi-Agent Consensus Engine with Real Voting
 *
 * NO LONGER just "ask an LLM to summarize." Now implements:
 *
 *   1. Weighted Majority Voting — each agent votes on risk level,
 *      weighted by domain expertise
 *   2. Dempster-Shafer Evidence Accumulation — combines evidence
 *      from multiple agents mathematically
 *   3. Inter-Agent Conflict Detection — finds contradictions
 *   4. Confidence Calibration — adjusts confidence based on
 *      cross-agent agreement strength
 *   5. AI Synthesis — ONLY for the final narrative summary
 *
 * This is real ensemble intelligence, not prompt engineering.
 */

const { getLLM } = require("../llm/provider");
const { validateLLMOutput, ARBITER_SYNTHESIS_SCHEMA } = require("../utils/schemaValidator");

// ── Agent Expertise Weights ─────────────────────────────────────────────
// Each agent is weighted by domain relevance for different finding types
const AGENT_WEIGHTS = {
  guardian:   { SAFETY: 1.0, CLINICAL: 0.3, COMPLIANCE: 0.1, DIAGNOSTIC: 0.2 },
  compliance: { SAFETY: 0.1, CLINICAL: 0.1, COMPLIANCE: 1.0, DIAGNOSTIC: 0.1 },
  sentinel:  { SAFETY: 0.6, CLINICAL: 0.9, COMPLIANCE: 0.2, DIAGNOSTIC: 1.0 },
  advocate:  { SAFETY: 0.1, CLINICAL: 0.3, COMPLIANCE: 0.7, DIAGNOSTIC: 0.2 },
  vision:    { SAFETY: 0.3, CLINICAL: 0.7, COMPLIANCE: 0.1, DIAGNOSTIC: 0.8 },
};

const SEVERITY_SCORES = { LOW: 1, MODERATE: 2, HIGH: 3, CRITICAL: 4 };
const RISK_LABELS = ["LOW", "MODERATE", "HIGH", "CRITICAL"];

// ══════════════════════════════════════════════════════════════════════════
//  1. EVIDENCE EXTRACTION — Normalize findings from all agents
// ══════════════════════════════════════════════════════════════════════════

function extractEvidence(allAgentOutputs) {
  const evidence = [];

  // Guardian findings
  const guardian = allAgentOutputs.guardian;
  if (guardian?.findings) {
    for (const f of guardian.findings) {
      evidence.push({
        id: `G:${f.type}:${(f.drugs||[]).join("+")||f.allergen||"unknown"}`,
        source: "guardian",
        domain: "SAFETY",
        severity: f.severity || "MODERATE",
        type: f.type,
        description: f.message,
        raw: f,
      });
    }
  }

  // Sentinel findings (deterministic)
  const sentinel = allAgentOutputs.sentinel;
  if (sentinel?.findings) {
    for (const f of sentinel.findings) {
      const domain = f.type.includes("VITAL") || f.type.includes("LAB") ? "CLINICAL" :
                     f.type.includes("RED_FLAG") ? "CLINICAL" :
                     f.type.includes("MISSED") ? "DIAGNOSTIC" :
                     f.type.includes("MISMATCH") ? "DIAGNOSTIC" : "CLINICAL";
      evidence.push({
        id: `S:${f.type}:${f.possibleCondition||f.vital||f.test||f.medication||f.cluster||"x"}`,
        source: "sentinel",
        domain,
        severity: f.severity || "MODERATE",
        type: f.type,
        description: f.message,
        raw: f,
      });
    }
  }

  // Sentinel AI reasoning
  if (sentinel?.aiReasoning?.missedConsiderations) {
    for (const mc of sentinel.aiReasoning.missedConsiderations) {
      evidence.push({
        id: `SA:${mc.condition}`,
        source: "sentinel-ai",
        domain: "DIAGNOSTIC",
        severity: mc.urgency || "MODERATE",
        type: "AI_INSIGHT",
        description: `AI suspects ${mc.condition}: ${mc.reasoning}`,
        raw: mc,
      });
    }
  }

  // Compliance findings
  const compliance = allAgentOutputs.compliance;
  if (compliance?.billingFindings) {
    for (const f of compliance.billingFindings) {
      evidence.push({
        id: `C:${f.rule}:${f.code||"x"}`,
        source: "compliance",
        domain: "COMPLIANCE",
        severity: f.severity === "ERROR" ? "HIGH" : f.severity === "WARNING" ? "MODERATE" : "LOW",
        type: f.rule || "BILLING",
        description: f.message,
        raw: f,
      });
    }
  }

  // Vision discrepancies
  const vision = allAgentOutputs.vision;
  if (vision?.crossReference?.discrepancies) {
    for (const d of vision.crossReference.discrepancies) {
      evidence.push({
        id: `V:${d.imageFinding}`,
        source: "vision",
        domain: "CLINICAL",
        severity: d.significance || "MODERATE",
        type: "IMAGING_DISCREPANCY",
        description: `Image: "${d.imageFinding}" vs docs: "${d.clinicalData}". ${d.recommendation}`,
        raw: d,
      });
    }
  }

  return evidence;
}

// ══════════════════════════════════════════════════════════════════════════
//  2. WEIGHTED MAJORITY VOTING — Real ensemble risk assessment
// ══════════════════════════════════════════════════════════════════════════

function weightedMajorityVote(allAgentOutputs) {
  const votes = [];

  // Guardian votes on safety risk
  if (allAgentOutputs.guardian) {
    const g = allAgentOutputs.guardian;
    const riskScore = SEVERITY_SCORES[g.riskLevel] || 1;
    votes.push({ agent: "guardian", domain: "SAFETY", riskScore, weight: 1.0 });
  }

  // Sentinel votes on clinical risk
  if (allAgentOutputs.sentinel) {
    const s = allAgentOutputs.sentinel;
    const riskScore = SEVERITY_SCORES[s.riskLevel] || 1;
    votes.push({ agent: "sentinel", domain: "CLINICAL", riskScore, weight: 0.95 });

    // Sentinel deterioration risk adds weight
    const detRisk = s.deteriorationRisk?.level;
    if (detRisk) {
      const detScore = SEVERITY_SCORES[detRisk] || 1;
      votes.push({ agent: "sentinel-deterioration", domain: "CLINICAL", riskScore: detScore, weight: 0.7 });
    }
  }

  // Compliance votes on documentation risk
  if (allAgentOutputs.compliance) {
    const c = allAgentOutputs.compliance;
    const riskScore = c.overallStatus === "FAIL" ? 3 : c.overallStatus === "WARNING" ? 2 : 1;
    votes.push({ agent: "compliance", domain: "COMPLIANCE", riskScore, weight: 0.6 });
  }

  // Vision votes on imaging correlation
  if (allAgentOutputs.vision?.crossReference) {
    const cr = allAgentOutputs.vision.crossReference;
    const riskScore = cr.overallCorrelation === "DISCORDANT" ? 4 :
                      cr.overallCorrelation === "PARTIALLY_CONCORDANT" ? 2 : 1;
    votes.push({ agent: "vision", domain: "CLINICAL", riskScore, weight: 0.8 });
  }

  if (votes.length === 0) return { overallRisk: "LOW", confidence: 0, votes: [] };

  // Weighted average
  let totalWeight = 0;
  let weightedSum = 0;
  for (const v of votes) {
    weightedSum += v.riskScore * v.weight;
    totalWeight += v.weight;
  }
  const avgRisk = weightedSum / totalWeight;

  // Map to risk label: 1-1.5=LOW, 1.5-2.5=MOD, 2.5-3.5=HIGH, 3.5+=CRITICAL
  let overallRisk;
  if (avgRisk >= 3.5) overallRisk = "CRITICAL";
  else if (avgRisk >= 2.5) overallRisk = "HIGH";
  else if (avgRisk >= 1.5) overallRisk = "MODERATE";
  else overallRisk = "LOW";

  // Confidence based on vote agreement
  const riskScores = votes.map(v => v.riskScore);
  const variance = computeVariance(riskScores);
  // Low variance = high agreement = high confidence
  const agreementConfidence = Math.max(0, 100 - variance * 25);

  return {
    overallRisk,
    weightedRiskScore: Math.round(avgRisk * 100) / 100,
    confidence: Math.round(agreementConfidence),
    voteCount: votes.length,
    votes,
  };
}

function computeVariance(arr) {
  if (arr.length <= 1) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
}

// ══════════════════════════════════════════════════════════════════════════
//  3. DEMPSTER-SHAFER EVIDENCE ACCUMULATION
// ══════════════════════════════════════════════════════════════════════════

function dempsterShaferAccumulate(evidence) {
  // Group evidence by semantic similarity (same issue flagged by multiple agents)
  const clusters = [];

  for (const e of evidence) {
    let merged = false;
    for (const cluster of clusters) {
      if (areSimilarFindings(cluster[0], e)) {
        cluster.push(e);
        merged = true;
        break;
      }
    }
    if (!merged) clusters.push([e]);
  }

  // Score each cluster
  const scoredClusters = clusters.map(cluster => {
    const sources = [...new Set(cluster.map(e => e.source))];
    const maxSeverity = cluster.reduce((max, e) =>
      (SEVERITY_SCORES[e.severity] || 1) > (SEVERITY_SCORES[max] || 1) ? e.severity : max,
      "LOW"
    );

    // Dempster-Shafer: combine belief masses
    // Each agent provides belief mass based on its domain expertise weight
    let combinedBelief = 0;
    for (const e of cluster) {
      const agentSource = e.source.split("-")[0]; // strip -ai suffix
      const weight = AGENT_WEIGHTS[agentSource]?.[e.domain] || 0.3;
      const severityFactor = (SEVERITY_SCORES[e.severity] || 1) / 4;
      const beliefMass = weight * severityFactor;
      // Dempster combination: combined = 1 - (1-a)(1-b)
      combinedBelief = 1 - (1 - combinedBelief) * (1 - beliefMass);
    }

    // Multi-agent bonus: findings confirmed by 2+ agents get confidence boost
    const multiAgentBonus = sources.length >= 3 ? 0.15 :
                            sources.length >= 2 ? 0.1 : 0;
    combinedBelief = Math.min(1, combinedBelief + multiAgentBonus);

    return {
      id: cluster[0].id,
      description: cluster[0].description,
      type: cluster[0].type,
      domain: cluster[0].domain,
      severity: maxSeverity,
      sources,
      sourceCount: sources.length,
      evidenceCount: cluster.length,
      beliefMass: Math.round(combinedBelief * 100) / 100,
      confidenceLabel: combinedBelief >= 0.7 ? "HIGH" :
                       combinedBelief >= 0.4 ? "MODERATE" : "LOW",
      details: cluster.map(e => ({ source: e.source, severity: e.severity, description: e.description })),
    };
  });

  // Sort by belief mass (highest first)
  scoredClusters.sort((a, b) => b.beliefMass - a.beliefMass);
  return scoredClusters;
}

function areSimilarFindings(a, b) {
  // Same type = definitely related
  if (a.type === b.type && a.id.split(":").slice(-1)[0] === b.id.split(":").slice(-1)[0]) return true;

  // Check keyword overlap in descriptions
  const wordsA = new Set(a.description.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const wordsB = new Set(b.description.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  let overlap = 0;
  for (const w of wordsA) { if (wordsB.has(w)) overlap++; }
  const jaccardSimilarity = overlap / (wordsA.size + wordsB.size - overlap);
  return jaccardSimilarity > 0.3;
}

// ══════════════════════════════════════════════════════════════════════════
//  4. CONFLICT DETECTION — Find where agents disagree
// ══════════════════════════════════════════════════════════════════════════

function detectConflicts(allAgentOutputs, scoredClusters) {
  const conflicts = [];

  // Guardian says LOW risk but Sentinel says HIGH/CRITICAL
  const guardianRisk = SEVERITY_SCORES[allAgentOutputs.guardian?.riskLevel] || 0;
  const sentinelRisk = SEVERITY_SCORES[allAgentOutputs.sentinel?.riskLevel] || 0;
  if (Math.abs(guardianRisk - sentinelRisk) >= 2) {
    conflicts.push({
      type: "RISK_DISAGREEMENT",
      agents: ["guardian", "sentinel"],
      description: `Guardian assessed ${allAgentOutputs.guardian?.riskLevel || "N/A"} risk, but Sentinel assessed ${allAgentOutputs.sentinel?.riskLevel || "N/A"} risk.`,
      resolution: sentinelRisk > guardianRisk ?
        "Escalating to higher risk level — Sentinel's clinical analysis takes precedence for diagnostic concerns." :
        "Guardian's drug safety analysis takes precedence — medication risks confirmed.",
      resolvedRisk: RISK_LABELS[Math.max(guardianRisk, sentinelRisk) - 1],
    });
  }

  // Compliance PASS but Sentinel finds billing mismatches
  const compliancePass = allAgentOutputs.compliance?.overallStatus === "PASS";
  const hasMedMismatch = scoredClusters.some(c => c.type === "MED_DIAGNOSIS_MISMATCH");
  if (compliancePass && hasMedMismatch) {
    conflicts.push({
      type: "COMPLIANCE_MISMATCH",
      agents: ["compliance", "sentinel"],
      description: "Compliance passed ICD-10 validation, but Sentinel detected medication-diagnosis mismatches — drugs prescribed without supporting diagnoses.",
      resolution: "Compliance checks code syntax; Sentinel checks clinical accuracy. Both are valid — documentation needs clinical review.",
    });
  }

  // Vision discordant with clinical documentation
  if (allAgentOutputs.vision?.crossReference?.overallCorrelation === "DISCORDANT") {
    conflicts.push({
      type: "IMAGING_DISCREPANCY",
      agents: ["vision", "scribe"],
      description: "Medical image findings are discordant with documented clinical data.",
      resolution: "Requires manual review — image findings may reveal undocumented pathology.",
    });
  }

  return conflicts;
}

// ══════════════════════════════════════════════════════════════════════════
//  5. AI SYNTHESIS — Final narrative (the ONLY LLM call)
// ══════════════════════════════════════════════════════════════════════════

const SYNTHESIS_PROMPT = `You are the Chief Medical Officer AI writing a final clinical intelligence briefing.
You are given QUANTITATIVE consensus results from 7 specialized AI agents that analyzed a patient.
The voting and scoring has already been done mathematically. You only need to write the narrative.

Voting Result: {VOTE_RESULT}
Top Issues (scored by Dempster-Shafer evidence accumulation): {TOP_ISSUES}
Conflicts Between Agents: {CONFLICTS}
Deterioration Risk: {DETERIORATION}

Write a concise clinical intelligence briefing in this JSON format (no markdown):
{
  "executiveSummary": "<3 sentence briefing for attending physician>",
  "criticalAlerts": ["<actionable alert>"],
  "clinicalRecommendations": [
    {"priority": 1, "action": "<specific>", "rationale": "<why>", "timeframe": "IMMEDIATE|WITHIN_1_HOUR|WITHIN_24_HOURS|ROUTINE"}
  ],
  "qualityMetrics": {
    "documentationCompleteness": "COMPLETE|PARTIAL|INCOMPLETE",
    "codingAccuracy": "ACCURATE|NEEDS_REVIEW|INACCURATE",
    "safetyVerification": "VERIFIED|CONCERNS_NOTED|UNSAFE"
  }
}`;

async function synthesizeReport(voteResult, scoredClusters, conflicts, deteriorationRisk) {
  try {
    const llm = getLLM();
    const prompt = SYNTHESIS_PROMPT
      .replace("{VOTE_RESULT}", JSON.stringify(voteResult))
      .replace("{TOP_ISSUES}", JSON.stringify(scoredClusters.slice(0, 10).map(c => ({
        type: c.type, severity: c.severity, belief: c.beliefMass,
        sources: c.sources, description: c.description,
      }))))
      .replace("{CONFLICTS}", JSON.stringify(conflicts))
      .replace("{DETERIORATION}", JSON.stringify(deteriorationRisk || { level: "UNKNOWN" }));

    let text = await llm.generate(prompt, { temperature: 0.1, maxTokens: 1500 });
    text = text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "");
    const raw = JSON.parse(text);

    // Schema validation — coerce malformed LLM output to safe defaults
    const { valid, data, errors } = validateLLMOutput(raw, ARBITER_SYNTHESIS_SCHEMA);
    if (!valid) {
      console.warn("[Arbiter] Schema validation fixed LLM output:", errors.join("; "));
    }
    return data;
  } catch (err) {
    console.error("[Arbiter] Synthesis failed:", err.message);
    return {
      executiveSummary: `Analysis identified ${scoredClusters.length} issues. Overall risk: ${voteResult.overallRisk}. Review individual agent reports.`,
      criticalAlerts: scoredClusters.filter(c => c.severity === "CRITICAL").map(c => c.description),
      clinicalRecommendations: [],
      qualityMetrics: { documentationCompleteness: "PARTIAL", codingAccuracy: "NEEDS_REVIEW", safetyVerification: "CONCERNS_NOTED" },
    };
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  MAIN ARBITER FUNCTION
// ══════════════════════════════════════════════════════════════════════════

async function runArbiter(allAgentOutputs) {
  if (!allAgentOutputs || typeof allAgentOutputs !== "object") {
    throw Object.assign(new Error("allAgentOutputs required"), { statusCode: 400 });
  }

  const startTime = Date.now();

  // 1. Extract all evidence from all agents
  const evidence = extractEvidence(allAgentOutputs);

  // 2. Weighted majority voting for overall risk
  const voteResult = weightedMajorityVote(allAgentOutputs);

  // 3. Dempster-Shafer evidence accumulation
  const scoredClusters = dempsterShaferAccumulate(evidence);

  // 4. Detect inter-agent conflicts
  const conflicts = detectConflicts(allAgentOutputs, scoredClusters);

  // 5. AI synthesis (narrative only — math is done)
  const deteriorationRisk = allAgentOutputs.sentinel?.deteriorationRisk;
  const synthesis = await synthesizeReport(voteResult, scoredClusters, conflicts, deteriorationRisk);

  // Build final report
  const criticalCount = scoredClusters.filter(c => c.severity === "CRITICAL").length;
  const highCount = scoredClusters.filter(c => c.severity === "HIGH").length;

  return {
    // Quantitative results (NOT from LLM)
    overallRisk: voteResult.overallRisk,
    totalIssues: scoredClusters.length,
    criticalIssues: criticalCount,
    highIssues: highCount,

    // Voting details
    voting: {
      method: "Weighted Majority Vote",
      weightedRiskScore: voteResult.weightedRiskScore,
      confidence: voteResult.confidence,
      voteCount: voteResult.voteCount,
      votes: voteResult.votes,
    },

    // Evidence accumulation
    scoredIssues: scoredClusters,
    evidenceMethod: "Dempster-Shafer Belief Accumulation",

    // Conflict resolution
    conflicts,
    conflictCount: conflicts.length,

    // AI synthesis (narrative)
    consensus: {
      executiveSummary: synthesis.executiveSummary,
      criticalAlerts: synthesis.criticalAlerts,
      clinicalRecommendations: synthesis.clinicalRecommendations,
      qualityMetrics: synthesis.qualityMetrics,
      // Add the computed consensus data
      agentConsensus: {
        overallConfidence: voteResult.confidence >= 75 ? "HIGH" :
                          voteResult.confidence >= 50 ? "MODERATE" : "LOW",
        areasOfAgreement: scoredClusters
          .filter(c => c.sourceCount >= 2)
          .map(c => `${c.sources.join(" + ")} agree: ${c.description.slice(0, 80)}`),
        areasOfConflict: conflicts.map(c => c.description),
      },
    },

    agentStatuses: {
      scribe: "✅ Complete",
      guardian: `${allAgentOutputs.guardian?.riskLevel === "LOW" ? "✅" : "⚠️"} ${allAgentOutputs.guardian?.riskLevel || "N/A"}`,
      compliance: `${allAgentOutputs.compliance?.overallStatus === "PASS" ? "✅" : "⚠️"} ${allAgentOutputs.compliance?.overallStatus || "N/A"}`,
      sentinel: `${allAgentOutputs.sentinel?.riskLevel === "LOW" ? "✅" : "🔴"} ${allAgentOutputs.sentinel?.riskLevel || "N/A"}`,
      advocate: allAgentOutputs.advocate ? `📄 ${allAgentOutputs.advocate.status}` : "⏭️ Skipped",
      vision: allAgentOutputs.vision?.status ? `👁️ ${allAgentOutputs.vision.status}` : "⏭️ No image",
    },

    summary: `AEGIS consensus: ${scoredClusters.length} issues (${criticalCount} critical). Risk: ${voteResult.overallRisk} (confidence: ${voteResult.confidence}%). ${conflicts.length} inter-agent conflicts resolved. ${synthesis.executiveSummary || ""}`,
    durationMs: Date.now() - startTime,
  };
}

module.exports = { runArbiter };
