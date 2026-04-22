/**
 * SENTINEL AGENT
 *
 * The diagnostic safety net. Analyzes the COMPLETE patient picture
 * (entities from Scribe + safety report from Guardian + compliance from Compliance)
 * to detect:
 *
 *   1. Missed diagnoses — symptoms suggesting conditions not yet documented
 *   2. Medication-diagnosis mismatches — drugs prescribed without matching dx
 *   3. Vital sign abnormalities — values outside safe ranges
 *   4. Lab critical values — results requiring immediate attention
 *   5. Red-flag symptom clusters — combinations suggesting high-acuity conditions
 *   6. AI-powered clinical reasoning — LLM analyzes the full picture
 *
 * The Sentinel runs AFTER Scribe, Guardian, and Compliance and cross-references
 * all their outputs. It's the agent that "catches what humans miss."
 */

const { getLLM } = require("../llm/provider");
const {
  SYMPTOM_CONDITION_MAP,
  VITAL_RANGES,
  LAB_RANGES,
  RED_FLAG_CLUSTERS,
  MED_DIAGNOSIS_EXPECTATIONS,
} = require("../data/clinicalKnowledge");

// ── Helpers ──────────────────────────────────────────────────────────────

function norm(s) {
  return (s || "").toLowerCase().trim();
}

function parseBP(bpStr) {
  if (!bpStr) return null;
  const match = bpStr.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return null;
  return { systolic: parseInt(match[1]), diastolic: parseInt(match[2]) };
}

function parseNumeric(val) {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const n = parseFloat(val.replace(/[^0-9.\-]/g, ""));
    return isNaN(n) ? null : n;
  }
  return null;
}

// ── 1. Check for missed diagnoses based on symptoms ──────────────────────

function checkMissedDiagnoses(entities) {
  const findings = [];
  const symptoms = (entities.symptoms || []).map(norm);
  const diagnoses = (entities.diagnoses || []).map((d) => norm(d.name));

  for (const symptom of symptoms) {
    const mapping = SYMPTOM_CONDITION_MAP[symptom];
    if (!mapping) continue;

    for (const cond of mapping.conditions) {
      const condNorm = norm(cond.name);
      // Check if this condition is already diagnosed
      const isDiagnosed = diagnoses.some(
        (d) => d.includes(condNorm) || condNorm.includes(d)
      );

      if (!isDiagnosed && (cond.urgency === "CRITICAL" || cond.urgency === "HIGH")) {
        findings.push({
          type: "MISSED_DIAGNOSIS",
          severity: cond.urgency,
          symptom,
          possibleCondition: cond.name,
          requiredWorkup: cond.requires,
          message: `Symptom "${symptom}" may indicate ${cond.name} (${cond.urgency}). Consider workup: ${cond.requires.join(", ") || "clinical correlation"}.`,
        });
      }
    }
  }

  return findings;
}

// ── 2. Check medication-diagnosis mismatches ─────────────────────────────

function checkMedDiagnosisMismatch(entities) {
  const findings = [];
  const medications = (entities.medications || []).map((m) => norm(m.name));
  const diagnoses = (entities.diagnoses || []).map((d) => norm(d.name));
  const diagText = diagnoses.join(" ");

  for (const med of medications) {
    const rule = MED_DIAGNOSIS_EXPECTATIONS[med];
    if (!rule) continue;

    const hasMatchingDx = rule.expectedDiagnoses.some(
      (expected) => diagText.includes(expected)
    );

    if (!hasMatchingDx) {
      findings.push({
        type: "MED_DIAGNOSIS_MISMATCH",
        severity: "MODERATE",
        medication: med,
        expectedDiagnoses: rule.expectedDiagnoses,
        message: `"${med}" is prescribed but no matching diagnosis found. Expected: ${rule.expectedDiagnoses.slice(0, 3).join(", ")}. Verify indication or add diagnosis.`,
      });
    }
  }

  return findings;
}

// ── 3. Vital sign analysis ───────────────────────────────────────────────

function checkVitals(entities) {
  const findings = [];
  const vitals = entities.vitals || {};

  // Blood pressure
  const bp = parseBP(vitals.bp);
  if (bp) {
    const sys = VITAL_RANGES.systolicBP;
    const dia = VITAL_RANGES.diastolicBP;

    if (bp.systolic >= sys.criticalHigh || bp.diastolic >= dia.criticalHigh) {
      findings.push({
        type: "VITAL_CRITICAL",
        severity: "CRITICAL",
        vital: "blood pressure",
        value: vitals.bp,
        message: `CRITICAL: Blood pressure ${vitals.bp} exceeds critical threshold. Hypertensive urgency/emergency protocol indicated.`,
      });
    } else if (bp.systolic >= sys.high || bp.diastolic >= dia.high) {
      findings.push({
        type: "VITAL_ABNORMAL",
        severity: "MODERATE",
        vital: "blood pressure",
        value: vitals.bp,
        message: `Elevated BP ${vitals.bp}. Assess for end-organ damage. Consider antihypertensive adjustment.`,
      });
    } else if (bp.systolic <= sys.criticalLow) {
      findings.push({
        type: "VITAL_CRITICAL",
        severity: "CRITICAL",
        vital: "blood pressure",
        value: vitals.bp,
        message: `CRITICAL: Hypotension (${vitals.bp}). Assess for shock, sepsis, hemorrhage. IV fluids, vasopressors may be needed.`,
      });
    }
  }

  // Heart rate
  const hr = parseNumeric(vitals.hr);
  if (hr !== null) {
    const range = VITAL_RANGES.heartRate;
    if (hr >= range.criticalHigh) {
      findings.push({
        type: "VITAL_CRITICAL",
        severity: "CRITICAL",
        vital: "heart rate",
        value: hr,
        message: `CRITICAL: Tachycardia HR ${hr} bpm. Rule out SVT, VT, sepsis, PE, hemorrhage. 12-lead ECG STAT.`,
      });
    } else if (hr >= range.high) {
      findings.push({
        type: "VITAL_ABNORMAL",
        severity: "MODERATE",
        vital: "heart rate",
        value: hr,
        message: `Tachycardia HR ${hr} bpm. Evaluate for pain, anxiety, infection, dehydration, cardiac cause.`,
      });
    } else if (hr <= range.criticalLow) {
      findings.push({
        type: "VITAL_CRITICAL",
        severity: "CRITICAL",
        vital: "heart rate",
        value: hr,
        message: `CRITICAL: Bradycardia HR ${hr} bpm. Assess hemodynamic stability. Check medication effect (beta-blockers, CCBs). Transcutaneous pacing standby.`,
      });
    }
  }

  // SpO2
  const spo2 = parseNumeric(vitals.spo2);
  if (spo2 !== null) {
    const range = VITAL_RANGES.spo2;
    if (spo2 <= range.criticalLow) {
      findings.push({
        type: "VITAL_CRITICAL",
        severity: "CRITICAL",
        vital: "SpO2",
        value: spo2,
        message: `CRITICAL: Hypoxemia SpO2 ${spo2}%. Supplemental O2, ABG, assess for respiratory failure. Intubation standby.`,
      });
    } else if (spo2 <= range.low) {
      findings.push({
        type: "VITAL_ABNORMAL",
        severity: "MODERATE",
        vital: "SpO2",
        value: spo2,
        message: `Low SpO2 ${spo2}%. Apply supplemental oxygen. Assess for pneumonia, PE, COPD exacerbation, heart failure.`,
      });
    }
  }

  return findings;
}

// ── 4. Lab critical values ───────────────────────────────────────────────

function checkLabResults(entities) {
  const findings = [];
  const labs = entities.labResults || [];

  for (const lab of labs) {
    const testName = norm(lab.test);
    const value = parseNumeric(lab.value);
    if (value === null) continue;

    // Try to match lab name to our reference ranges
    for (const [key, range] of Object.entries(LAB_RANGES)) {
      if (testName.includes(key) || key.includes(testName)) {
        if (range.criticalHigh && value >= range.criticalHigh) {
          findings.push({
            type: "LAB_CRITICAL",
            severity: "CRITICAL",
            test: lab.test,
            value: `${lab.value} ${lab.unit || range.unit}`,
            reference: `Normal: ${range.low}–${range.high} ${range.unit}`,
            message: `CRITICAL VALUE: ${lab.test} = ${lab.value} (critical threshold: ${range.criticalHigh}). Immediate clinical action required.`,
          });
        } else if (value > range.high) {
          findings.push({
            type: "LAB_ABNORMAL",
            severity: "MODERATE",
            test: lab.test,
            value: `${lab.value} ${lab.unit || range.unit}`,
            reference: `Normal: ${range.low}–${range.high} ${range.unit}`,
            message: `Elevated ${lab.test} = ${lab.value} (normal: ${range.low}–${range.high}). Monitor and correlate clinically.`,
          });
        } else if (range.criticalLow && value <= range.criticalLow) {
          findings.push({
            type: "LAB_CRITICAL",
            severity: "CRITICAL",
            test: lab.test,
            value: `${lab.value} ${lab.unit || range.unit}`,
            reference: `Normal: ${range.low}–${range.high} ${range.unit}`,
            message: `CRITICAL VALUE: ${lab.test} = ${lab.value} (critical low: ${range.criticalLow}). Immediate clinical action required.`,
          });
        }
        break;
      }
    }
  }

  return findings;
}

// ── 5. Red flag cluster detection ────────────────────────────────────────

function checkRedFlagClusters(entities) {
  const findings = [];
  const symptoms = (entities.symptoms || []).map(norm);
  const vitals = entities.vitals || {};
  const labs = entities.labResults || [];
  const medications = (entities.medications || []).map((m) => norm(m.name));

  // Build a set of all present markers
  const markers = new Set(symptoms);

  // Add vital-derived markers
  const hr = parseNumeric(vitals.hr);
  if (hr && hr > 100) markers.add("tachycardia");
  if (hr && hr < 60) markers.add("bradycardia");

  const bp = parseBP(vitals.bp);
  if (bp && bp.systolic < 90) markers.add("hypotension");
  if (bp && bp.systolic > 180) markers.add("hypertensive crisis");

  const spo2 = parseNumeric(vitals.spo2);
  if (spo2 && spo2 < 92) markers.add("hypoxia");

  // Add lab-derived markers
  for (const lab of labs) {
    const name = norm(lab.test);
    const val = parseNumeric(lab.value);
    if (name.includes("troponin") && val > 0.04) markers.add("elevated troponin");
    if (name.includes("glucose") && val > 300) markers.add("hyperglycemia");
    if (name.includes("lactate") && val > 2) markers.add("elevated lactate");
    if (name.includes("inr") && val > 3) markers.add("elevated INR");
    if (name.includes("hemoglobin") && val < 8) markers.add("anemia");
  }

  // Add medication-derived markers
  if (medications.some((m) => ["warfarin", "heparin", "enoxaparin", "rivaroxaban", "apixaban"].includes(m))) {
    markers.add("anticoagulant use");
  }

  // Check each cluster
  for (const cluster of RED_FLAG_CLUSTERS) {
    const matchCount = cluster.markers.filter((m) => markers.has(m)).length;
    if (matchCount >= 2) {
      findings.push({
        type: "RED_FLAG_CLUSTER",
        severity: cluster.urgency,
        cluster: cluster.name,
        condition: cluster.condition,
        matchedMarkers: cluster.markers.filter((m) => markers.has(m)),
        missingMarkers: cluster.markers.filter((m) => !markers.has(m)),
        action: cluster.action,
        message: `⚠️ RED FLAG: ${cluster.name} — ${matchCount}/${cluster.markers.length} markers present for ${cluster.condition}. ${cluster.action}`,
      });
    }
  }

  return findings;
}

// ── 6. AI-Powered Clinical Reasoning ─────────────────────────────────────

const SENTINEL_PROMPT = `You are a senior attending physician performing a secondary clinical review.
You are reviewing the output of an AI clinical documentation pipeline. Your role is to catch
anything the primary documentation may have missed.

Analyze the following patient data and identify:
1. Any diagnoses that should be considered but aren't documented
2. Any concerning symptom combinations or lab/vital trends
3. Any medication adjustments that should be considered
4. Any additional workup that should be ordered
5. Risk of clinical deterioration within 24-48 hours

Patient Data:
{PATIENT_DATA}

Respond in this exact JSON format (no markdown, no commentary):
{
  "missedConsiderations": [
    { "condition": "<name>", "reasoning": "<why you suspect this>", "urgency": "CRITICAL|HIGH|MODERATE|LOW", "suggestedWorkup": ["<test1>", "<test2>"] }
  ],
  "medicationConcerns": [
    { "medication": "<name>", "concern": "<explanation>", "suggestion": "<what to do>" }
  ],
  "deteriorationRisk": {
    "level": "HIGH|MODERATE|LOW",
    "reasoning": "<explanation>",
    "monitoringPlan": "<what to watch>"
  },
  "overallAssessment": "<2-3 sentence clinical summary>"
}`;

async function runAIClinicalReasoning(entities, guardianReport, complianceReport) {
  try {
    const llm = getLLM();
    const patientData = JSON.stringify({
      patient: entities.patient,
      symptoms: entities.symptoms,
      diagnoses: entities.diagnoses,
      medications: entities.medications,
      allergies: entities.allergies,
      vitals: entities.vitals,
      labResults: entities.labResults,
      procedures: entities.procedures,
      plan: entities.plan,
      safetyReport: {
        riskLevel: guardianReport?.riskLevel,
        findings: guardianReport?.findings,
      },
      complianceReport: {
        status: complianceReport?.overallStatus,
        findings: complianceReport?.billingFindings,
      },
    }, null, 2);

    const prompt = SENTINEL_PROMPT.replace("{PATIENT_DATA}", patientData);
    let text = await llm.generate(prompt, { temperature: 0.1, maxTokens: 2048 });

    // Strip markdown fences
    text = text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "");
    return JSON.parse(text);
  } catch (err) {
    console.error("[Sentinel] AI reasoning failed:", err.message);
    return {
      missedConsiderations: [],
      medicationConcerns: [],
      deteriorationRisk: { level: "UNKNOWN", reasoning: "AI analysis unavailable", monitoringPlan: "Standard monitoring" },
      overallAssessment: "AI clinical reasoning unavailable. Rely on deterministic checks.",
    };
  }
}

// ── Main Sentinel Function ───────────────────────────────────────────────

/**
 * Run the Sentinel agent — the clinical safety net.
 *
 * @param {object} entities — Scribe output
 * @param {object} guardianReport — Guardian output (optional, for cross-ref)
 * @param {object} complianceReport — Compliance output (optional, for cross-ref)
 * @returns {Promise<object>} — Sentinel findings
 */
async function runSentinel(entities, guardianReport = null, complianceReport = null) {
  if (!entities || typeof entities !== "object") {
    throw Object.assign(
      new Error("entities must be a non-null object (Scribe JSON output)"),
      { statusCode: 400 }
    );
  }

  const startTime = Date.now();

  // Run all deterministic checks
  const missedDiagnoses = checkMissedDiagnoses(entities);
  const medMismatches = checkMedDiagnosisMismatch(entities);
  const vitalAlerts = checkVitals(entities);
  const labAlerts = checkLabResults(entities);
  const redFlags = checkRedFlagClusters(entities);

  // Run AI clinical reasoning in parallel
  const aiReasoning = await runAIClinicalReasoning(entities, guardianReport, complianceReport);

  // Combine all findings
  const allFindings = [
    ...redFlags,
    ...missedDiagnoses,
    ...vitalAlerts,
    ...labAlerts,
    ...medMismatches,
  ];

  // Determine overall risk
  let riskLevel = "LOW";
  if (allFindings.some((f) => f.severity === "MODERATE")) riskLevel = "MODERATE";
  if (allFindings.some((f) => f.severity === "HIGH")) riskLevel = "HIGH";
  if (allFindings.some((f) => f.severity === "CRITICAL")) riskLevel = "CRITICAL";

  // Count by type
  const findingCounts = {
    redFlags: redFlags.length,
    missedDiagnoses: missedDiagnoses.length,
    vitalAlerts: vitalAlerts.length,
    labAlerts: labAlerts.length,
    medMismatches: medMismatches.length,
  };

  const totalFindings = allFindings.length +
    (aiReasoning.missedConsiderations?.length || 0) +
    (aiReasoning.medicationConcerns?.length || 0);

  const summary = totalFindings === 0
    ? "Sentinel review complete. No additional safety concerns identified."
    : `Sentinel identified ${totalFindings} concern(s) requiring attention. Risk level: ${riskLevel}.`;

  return {
    riskLevel,
    findings: allFindings,
    aiReasoning,
    findingCounts,
    deteriorationRisk: aiReasoning.deteriorationRisk,
    summary,
    durationMs: Date.now() - startTime,
  };
}

module.exports = { runSentinel };
