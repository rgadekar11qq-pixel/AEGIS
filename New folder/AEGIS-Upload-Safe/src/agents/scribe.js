/**
 * SCRIBE AGENT
 *
 * Receives free-text clinical notes from a physician and calls the
 * Gemini generative-AI model to extract structured medical entities.
 *
 * Output schema (enforced by the prompt):
 * {
 *   patient:     { name, age, sex },
 *   symptoms:    [string],
 *   diagnoses:   [{ name, icd10 }],
 *   medications: [{ name, dose, route, frequency }],
 *   allergies:   [string],
 *   procedures:  [string],
 *   vitals:      { bp, hr, temp, spo2, rr },
 *   labResults:  [{ test, value, unit, flag }],
 *   plan:        string
 * }
 */

const { getLLM } = require("../llm/provider");

const EXTRACTION_PROMPT = `
You are a medical NLP engine embedded in a clinical documentation pipeline.
Your ONLY job is to read the physician's raw note below and return a JSON
object — nothing else. Do NOT wrap the output in markdown fences.

Return exactly this schema (use null for missing fields, [] for empty arrays):

{
  "patient": {
    "name": "<string or null>",
    "age": "<number or null>",
    "sex": "<M | F | Other | null>"
  },
  "symptoms": ["<string>"],
  "diagnoses": [
    { "name": "<string>", "icd10": "<ICD-10-CM code or null>" }
  ],
  "medications": [
    {
      "name": "<generic drug name, lowercase>",
      "dose": "<string or null>",
      "route": "<oral | IV | IM | SC | topical | inhaled | null>",
      "frequency": "<string or null>"
    }
  ],
  "allergies": ["<allergen name, lowercase>"],
  "procedures": ["<string>"],
  "vitals": {
    "bp": "<string or null>",
    "hr": "<number or null>",
    "temp": "<string or null>",
    "spo2": "<string or null>",
    "rr": "<number or null>"
  },
  "labResults": [
    { "test": "<string>", "value": "<string>", "unit": "<string>", "flag": "<normal | high | low | critical>" }
  ],
  "plan": "<free-text plan summary or null>"
}

Rules:
1. Drug names MUST be lowercase generic names (e.g. "metformin" not "Glucophage").
2. Allergens MUST be lowercase (e.g. "penicillin").
3. ICD-10 codes must follow CM format (e.g. "E11.9"). If unsure, set to null.
4. Return ONLY valid JSON — no commentary, no markdown.

──── PHYSICIAN NOTE ────
`;

/**
 * @param {string} rawText  – The raw physician note
 * @returns {Promise<object>} – Parsed medical entities
 */
async function runScribe(rawText) {
  if (!rawText || typeof rawText !== "string" || rawText.trim().length === 0) {
    throw Object.assign(new Error("rawText is required and must be non-empty"), {
      statusCode: 400,
    });
  }

  const llm = getLLM();
  const prompt = EXTRACTION_PROMPT + rawText;

  let parsed = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let text;
    try {
      text = await llm.generate(prompt, { temperature: 0, maxTokens: 4096 });
    } catch (err) {
      if (attempt === 0) { console.warn("[Scribe] LLM call failed, retrying..."); continue; }
      throw err;
    }

    // Strip accidental markdown code fences
    text = text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();

    try {
      parsed = JSON.parse(text);
      break; // Success
    } catch (err) {
      if (attempt === 0) {
        console.warn("[Scribe] JSON parse failed, retrying with fresh call...");
        continue;
      }
      throw Object.assign(
        new Error(`Gemini returned non-JSON output after 2 attempts. Raw: ${text.slice(0, 300)}`),
        { statusCode: 502 }
      );
    }
  }

  // ── Schema Validation — ensure essential fields exist ──────────
  return validateScribeOutput(parsed);
}

/**
 * Validates and normalizes Scribe output to ensure downstream agents
 * receive consistent data, even if the LLM omits fields.
 */
function validateScribeOutput(data) {
  if (!data || typeof data !== "object") {
    throw Object.assign(new Error("LLM returned non-object output"), { statusCode: 502 });
  }

  return {
    patient: {
      name: data.patient?.name || null,
      age: data.patient?.age || null,
      sex: data.patient?.sex || null,
    },
    symptoms: Array.isArray(data.symptoms) ? data.symptoms : [],
    diagnoses: Array.isArray(data.diagnoses)
      ? data.diagnoses.map(d => ({
          name: d?.name || "Unknown",
          icd10: d?.icd10 || null,
        }))
      : [],
    medications: Array.isArray(data.medications)
      ? data.medications.map(m => ({
          name: (m?.name || "").toLowerCase().trim(),
          dose: m?.dose || null,
          route: m?.route || null,
          frequency: m?.frequency || null,
        }))
      : [],
    allergies: Array.isArray(data.allergies)
      ? data.allergies.map(a => (typeof a === "string" ? a.toLowerCase().trim() : String(a)))
      : [],
    procedures: Array.isArray(data.procedures) ? data.procedures : [],
    vitals: {
      bp: data.vitals?.bp || null,
      hr: data.vitals?.hr || null,
      temp: data.vitals?.temp || null,
      spo2: data.vitals?.spo2 || null,
      rr: data.vitals?.rr || null,
    },
    labResults: Array.isArray(data.labResults) ? data.labResults : [],
    labs: data.labs || data.labResults || {},
    plan: data.plan || null,
  };
}

module.exports = { runScribe };
