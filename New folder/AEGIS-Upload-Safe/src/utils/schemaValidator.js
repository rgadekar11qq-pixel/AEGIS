/**
 * AEGIS — Lightweight Schema Validator for LLM Outputs
 *
 * Validates JSON responses from LLMs against expected schemas.
 * No external dependencies (Zod/Joi not needed for this scope).
 * Returns a sanitized object that always conforms to the schema,
 * using defaults for missing/malformed fields.
 */

/**
 * Validate and coerce a value to the expected type.
 * @param {*} value    — The value to validate
 * @param {object} rule — { type, default, enum, items, required }
 * @returns {*} — Validated/coerced value
 */
function coerce(value, rule) {
  if (value === undefined || value === null) return rule.default ?? null;

  switch (rule.type) {
    case "string":
      if (typeof value !== "string") return String(value);
      if (rule.enum && !rule.enum.includes(value)) return rule.default ?? rule.enum[0];
      if (rule.maxLength && value.length > rule.maxLength) return value.slice(0, rule.maxLength);
      return value;

    case "number":
      const n = typeof value === "number" ? value : parseFloat(value);
      if (isNaN(n)) return rule.default ?? 0;
      if (rule.min !== undefined && n < rule.min) return rule.min;
      if (rule.max !== undefined && n > rule.max) return rule.max;
      return n;

    case "boolean":
      return Boolean(value);

    case "array":
      if (!Array.isArray(value)) return rule.default ?? [];
      if (rule.items) return value.map(item => coerce(item, rule.items));
      return value;

    case "object":
      if (typeof value !== "object" || value === null) return rule.default ?? {};
      if (rule.properties) return validateSchema(value, rule.properties);
      return value;

    default:
      return value;
  }
}

/**
 * Validate an object against a schema definition.
 * Missing fields get defaults. Extra fields are preserved.
 *
 * @param {object} data   — The data to validate
 * @param {object} schema — Schema definition (field → rule)
 * @returns {object} — Validated data with defaults applied
 */
function validateSchema(data, schema) {
  const result = {};
  const obj = data && typeof data === "object" ? data : {};

  for (const [key, rule] of Object.entries(schema)) {
    result[key] = coerce(obj[key], rule);
  }

  return result;
}

/**
 * Validate LLM output with error tracking.
 * Returns { valid, data, errors } where errors lists any fixes applied.
 *
 * @param {object} data   — Raw LLM output
 * @param {object} schema — Schema definition
 * @returns {{ valid: boolean, data: object, errors: string[] }}
 */
function validateLLMOutput(data, schema) {
  const errors = [];

  if (!data || typeof data !== "object") {
    errors.push("LLM returned non-object output; using defaults for all fields");
    return { valid: false, data: validateSchema({}, schema), errors };
  }

  const obj = data && typeof data === "object" ? data : {};
  for (const [key, rule] of Object.entries(schema)) {
    if (rule.required && (obj[key] === undefined || obj[key] === null)) {
      errors.push(`Missing required field "${key}"; using default`);
    }
    if (obj[key] !== undefined && obj[key] !== null) {
      const expectedType = rule.type;
      const actualType = Array.isArray(obj[key]) ? "array" : typeof obj[key];
      if (expectedType && actualType !== expectedType) {
        errors.push(`Field "${key}" expected ${expectedType}, got ${actualType}; coercing`);
      }
    }
  }

  return { valid: errors.length === 0, data: validateSchema(data, schema), errors };
}

// ── Pre-built Schemas ──────────────────────────────────────────────────────

const SCRIBE_SCHEMA = {
  patient: {
    type: "object",
    default: { name: null, age: null, sex: null },
    properties: {
      name: { type: "string", default: null },
      age: { type: "number", default: null },
      sex: { type: "string", default: null, enum: ["M", "F", "Other", null] },
    },
  },
  symptoms: { type: "array", default: [], items: { type: "string" } },
  diagnoses: {
    type: "array",
    default: [],
    items: {
      type: "object",
      properties: {
        name: { type: "string", default: "Unknown", required: true },
        icd10: { type: "string", default: null },
      },
    },
  },
  medications: {
    type: "array",
    default: [],
    items: {
      type: "object",
      properties: {
        name: { type: "string", default: "", required: true },
        dose: { type: "string", default: null },
        route: { type: "string", default: null },
        frequency: { type: "string", default: null },
      },
    },
  },
  allergies: { type: "array", default: [], items: { type: "string" } },
  procedures: { type: "array", default: [], items: { type: "string" } },
  vitals: {
    type: "object",
    default: {},
    properties: {
      bp: { type: "string", default: null },
      hr: { type: "number", default: null },
      temp: { type: "string", default: null },
      spo2: { type: "string", default: null },
      rr: { type: "number", default: null },
    },
  },
  labResults: { type: "array", default: [] },
  plan: { type: "string", default: null },
};

const ARBITER_SYNTHESIS_SCHEMA = {
  executiveSummary: { type: "string", required: true, default: "Analysis complete. Review individual agent reports." },
  criticalAlerts: { type: "array", default: [], items: { type: "string" } },
  clinicalRecommendations: { type: "array", default: [] },
  qualityMetrics: {
    type: "object",
    default: {},
    properties: {
      documentationCompleteness: { type: "string", default: "PARTIAL", enum: ["COMPLETE", "PARTIAL", "INCOMPLETE"] },
      codingAccuracy: { type: "string", default: "NEEDS_REVIEW", enum: ["ACCURATE", "NEEDS_REVIEW", "INACCURATE"] },
      safetyVerification: { type: "string", default: "CONCERNS_NOTED", enum: ["VERIFIED", "CONCERNS_NOTED", "UNSAFE"] },
    },
  },
};

const ADVOCATE_NECESSITY_SCHEMA = {
  clinicalSummary: { type: "string", required: true, default: "Clinical summary generation unavailable." },
  medicalNecessity: { type: "string", required: true, default: "Medical necessity justification requires manual review." },
  alternativesConsidered: { type: "array", default: [], items: { type: "string" } },
  riskOfDenial: { type: "string", default: "Risk assessment unavailable." },
  supportingGuidelines: { type: "array", default: [], items: { type: "string" } },
  urgencyLevel: { type: "string", default: "ROUTINE", enum: ["ROUTINE", "URGENT", "EMERGENT"] },
  estimatedApprovalLikelihood: { type: "string", default: "MODERATE", enum: ["HIGH", "MODERATE", "LOW"] },
};

module.exports = {
  validateSchema,
  validateLLMOutput,
  coerce,
  SCRIBE_SCHEMA,
  ARBITER_SYNTHESIS_SCHEMA,
  ADVOCATE_NECESSITY_SCHEMA,
};
