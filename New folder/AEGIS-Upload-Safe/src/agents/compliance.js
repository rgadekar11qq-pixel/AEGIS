/**
 * COMPLIANCE AGENT
 *
 * Receives structured medical entities (Scribe output) and performs:
 *   1. ICD-10 code validation (checks each diagnosis code against the known set)
 *   2. Billing-rule checks (deterministic payer-logic rules)
 *
 * Returns a compliance report with per-code validation results and billing findings.
 */

const { VALID_ICD10_CODES, BILLING_RULES } = require("../data/billingRules");

/**
 * @param {object} entities – Scribe-produced entity JSON
 * @returns {{
 *   icd10Validation: object[],
 *   billingFindings: object[],
 *   overallStatus: string,
 *   summary: string
 * }}
 */
function runCompliance(entities) {
  if (!entities || typeof entities !== "object") {
    throw Object.assign(
      new Error("entities must be a non-null object (Scribe JSON output)"),
      { statusCode: 400 }
    );
  }

  const diagnoses = entities.diagnoses || [];

  // ── 1. ICD-10 Code Validation ─────────────────────────────────────────
  const icd10Validation = diagnoses.map((dx) => {
    const code = (dx.icd10 || "").trim();
    if (!code) {
      return {
        diagnosis: dx.name,
        code: null,
        valid: false,
        status: "MISSING",
        message: `No ICD-10 code provided for "${dx.name}". A code is required for billing.`,
      };
    }

    const meta = VALID_ICD10_CODES[code];
    if (meta) {
      return {
        diagnosis: dx.name,
        code,
        valid: true,
        status: "VALID",
        description: meta.description,
        category: meta.category,
        message: `Code ${code} is valid: ${meta.description}.`,
      };
    }

    // Check if the code at least follows ICD-10 format: letter + digits (+ optional dot + digits)
    const formatOk = /^[A-Z]\d{2}(\.\d{1,4})?$/i.test(code);
    return {
      diagnosis: dx.name,
      code,
      valid: false,
      status: formatOk ? "UNRECOGNIZED" : "MALFORMED",
      message: formatOk
        ? `Code "${code}" has valid ICD-10 format but is not in the reference database. Verify against the full CMS ICD-10-CM table.`
        : `Code "${code}" does not match ICD-10-CM format (expected: letter + 2 digits + optional dot + up to 4 digits).`,
    };
  });

  // ── 2. Billing-Rule Checks ────────────────────────────────────────────
  const codes = diagnoses.map((dx) => (dx.icd10 || "").trim()).filter(Boolean);
  const billingFindings = [];

  for (const rule of BILLING_RULES) {
    const hits = rule.check(codes);
    billingFindings.push(...hits);
  }

  // ── Overall Status ────────────────────────────────────────────────────
  const hasErrors =
    icd10Validation.some((v) => !v.valid) ||
    billingFindings.some((f) => f.severity === "ERROR");
  const hasWarnings = billingFindings.some((f) => f.severity === "WARNING");

  let overallStatus = "PASS";
  if (hasWarnings) overallStatus = "REVIEW";
  if (hasErrors) overallStatus = "FAIL";

  const invalidCount = icd10Validation.filter((v) => !v.valid).length;
  const summary = [
    `${icd10Validation.length} diagnosis code(s) checked: ${icd10Validation.length - invalidCount} valid, ${invalidCount} invalid/missing.`,
    `${billingFindings.length} billing finding(s).`,
    `Overall status: ${overallStatus}.`,
  ].join(" ");

  return { icd10Validation, billingFindings, overallStatus, summary };
}

module.exports = { runCompliance };
