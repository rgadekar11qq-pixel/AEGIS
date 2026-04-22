/**
 * GUARDIAN AGENT
 *
 * Receives structured medical entities (the Scribe output) and performs
 * fully deterministic, offline safety checks:
 *   1. Drug–drug interaction screening
 *   2. Drug–allergy cross-reactivity screening
 *
 * Returns a report with a risk level and an array of findings.
 */

const {
  DRUG_INTERACTIONS,
  ALLERGY_CROSS_REACTIVITY,
  DRUG_DISEASE_CONTRAINDICATIONS,
} = require("../data/drugInteractions");

/**
 * Normalise a drug name for comparison.
 */
function norm(name) {
  return (name || "").toLowerCase().trim();
}

/**
 * Run all Guardian checks against the supplied entities.
 *
 * @param {object} entities – Scribe-produced entity JSON
 * @returns {{ riskLevel: string, findings: object[], summary: string }}
 */
function runGuardian(entities) {
  if (!entities || typeof entities !== "object") {
    throw Object.assign(
      new Error("entities must be a non-null object (Scribe JSON output)"),
      { statusCode: 400 }
    );
  }

  const medications = (entities.medications || []).map((m) => norm(m.name));
  const allergies = (entities.allergies || []).map(norm);
  const findings = [];

  // ── 1. Drug–Drug Interactions ──────────────────────────────────────────
  for (const interaction of DRUG_INTERACTIONS) {
    const [drugA, drugB] = interaction.pair;
    if (medications.includes(drugA) && medications.includes(drugB)) {
      findings.push({
        type: "DRUG_INTERACTION",
        severity: interaction.severity,
        drugs: [drugA, drugB],
        message: interaction.description,
      });
    }
  }

  // ── 2. Drug–Allergy Cross-Reactivity ──────────────────────────────────
  for (const allergen of allergies) {
    const rule = ALLERGY_CROSS_REACTIVITY[allergen];
    if (!rule) continue;

    for (const drug of rule.drugs) {
      if (medications.includes(drug)) {
        findings.push({
          type: "ALLERGY_CROSS_REACTIVITY",
          severity: rule.severity,
          allergen,
          drug,
          message: rule.description,
        });
      }
    }
  }

  // ── 3. Drug–Disease Contraindications ────────────────────────────────
  const conditions = (entities.conditions || entities.diagnoses || [])
    .map((c) => (typeof c === "string" ? c : c.name || "").toLowerCase().trim());
  // Also check PMH / history text if present
  const pmhText = (entities.pastMedicalHistory || entities.pmh || "").toLowerCase();

  for (const rule of DRUG_DISEASE_CONTRAINDICATIONS) {
    const conditionPresent =
      conditions.some((c) => c.includes(rule.condition)) ||
      pmhText.includes(rule.condition);
    if (!conditionPresent) continue;

    for (const drug of rule.drugs) {
      if (medications.includes(drug)) {
        findings.push({
          type: "DRUG_DISEASE_CONTRAINDICATION",
          severity: rule.severity,
          condition: rule.condition,
          drug,
          message: rule.description,
        });
      }
    }
  }

  // ── Risk Level ─────────────────────────────────────────────────────────
  let riskLevel = "LOW";
  if (findings.some((f) => f.severity === "MODERATE")) riskLevel = "MODERATE";
  if (findings.some((f) => f.severity === "HIGH")) riskLevel = "HIGH";

  const summary =
    findings.length === 0
      ? "No drug interactions or allergy cross-reactivity issues detected."
      : `${findings.length} potential safety issue(s) identified. Review findings before proceeding.`;

  return { riskLevel, findings, summary };
}

/**
 * Enhanced Guardian with RxNorm API integration.
 * Runs local checks instantly, then supplements with NLM database.
 *
 * @param {object} entities – Scribe-produced entity JSON
 * @returns {Promise<object>} – Extended report with rxnorm field
 */
async function runGuardianAsync(entities) {
  // Run local checks first (instant)
  const localResult = runGuardian(entities);

  // Try RxNorm API for additional interactions
  try {
    const { rxnormInteractionCheck } = require("../data/rxnorm");
    const medications = (entities.medications || []).map(m => (m.name || "").toLowerCase().trim()).filter(Boolean);

    if (medications.length >= 2) {
      const rxResult = await rxnormInteractionCheck(medications);

      // Add RxNorm interactions that aren't already in local findings
      for (const interaction of rxResult.interactions) {
        const isDuplicate = localResult.findings.some(f =>
          f.drugs && interaction.drugs &&
          f.drugs.some(d => interaction.drugs.some(rd => rd.toLowerCase().includes(d)))
        );
        if (!isDuplicate) {
          localResult.findings.push(interaction);
        }
      }

      // Update risk level if RxNorm found HIGH severity
      if (rxResult.interactions.some(i => i.severity === "HIGH")) {
        localResult.riskLevel = "HIGH";
      } else if (rxResult.interactions.some(i => i.severity === "MODERATE") && localResult.riskLevel === "LOW") {
        localResult.riskLevel = "MODERATE";
      }

      localResult.rxnorm = {
        resolved: rxResult.rxcuis.length,
        additionalInteractions: rxResult.interactions.length,
        source: "NLM RxNorm API",
      };

      localResult.summary = localResult.findings.length === 0
        ? "No drug interactions detected (checked local DB + NLM RxNorm)."
        : `${localResult.findings.length} potential safety issue(s) identified (local DB + NLM RxNorm). Review before proceeding.`;
    }
  } catch (e) {
    // RxNorm is optional — local results still valid
    localResult.rxnorm = { error: e.message, note: "Local DB results only" };
  }

  return localResult;
}

module.exports = { runGuardian, runGuardianAsync };
