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

  let parsed = null;
  try {
    const llm = getLLM();
    const prompt = EXTRACTION_PROMPT + rawText;

    for (let attempt = 0; attempt < 2; attempt++) {
      let text;
      try {
        text = await llm.generate(prompt, { temperature: 0, maxTokens: 4096 });
      } catch (err) {
        if (attempt === 0) { console.warn("[Scribe] LLM call failed, retrying..."); continue; }
        break;
      }

      // Strip accidental markdown code fences
      text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) text = jsonMatch[0];

      try {
        parsed = JSON.parse(text);
        break; // Success
      } catch (err) {
        if (attempt === 0) {
          console.warn("[Scribe] JSON parse failed, retrying with fresh call...");
          continue;
        }
      }
    }
  } catch (err) {
    console.warn("[Scribe] LLM extraction error:", err.message);
  }

  if (!parsed || typeof parsed !== "object") {
    console.warn("[Scribe] Utilizing deterministic fallback clinical extractor");
    parsed = extractDeterministicFallback(rawText);
  }

  // ── Schema Validation — ensure essential fields exist ──────────
  return validateScribeOutput(parsed);
}

/**
 * Deterministic fallback extractor for clinical notes.
 */
function extractDeterministicFallback(rawText) {
  const patient = { name: null, age: null, sex: null };
  const ptMatch = rawText.match(/Patient\s+([A-Za-z\s\.]+?)(?:,\s*(\d+)\s*(?:yo|y\/o)?\s*([MFmf])|\.|$)/i);
  if (ptMatch) {
    patient.name = ptMatch[1].trim();
    if (ptMatch[2]) patient.age = parseInt(ptMatch[2], 10);
    if (ptMatch[3]) patient.sex = ptMatch[3].toUpperCase();
  }

  const symptoms = [];
  const commonSymptoms = [
    "chest pain", "shortness of breath", "dyspnea", "fever", "cough", "headache",
    "vomiting", "blurred vision", "altered mental status", "fatigue", "slurred speech",
    "weakness", "agitation", "paranoia", "tenderness", "left arm pain"
  ];
  for (const s of commonSymptoms) {
    if (new RegExp(`\\b${s}\\b`, "i").test(rawText)) {
      symptoms.push(s);
    }
  }

  const allergies = [];
  const allergyMatch = rawText.match(/Allergies:\s*([^\n\.]+)/i);
  if (allergyMatch) {
    const list = allergyMatch[1].split(/[,;]/);
    for (const a of list) {
      const clean = a.trim().toLowerCase();
      if (clean && !["none", "no known drug allergies", "nkda"].includes(clean)) {
        const word = clean.split(/\s+/)[0];
        if (word && !allergies.includes(word)) allergies.push(word);
      }
    }
  }

  const medications = [];
  const knownMeds = [
    "metformin", "lisinopril", "aspirin", "nitroglycerin", "warfarin",
    "albuterol", "amoxicillin", "clavulanate", "azithromycin", "propranolol",
    "ibuprofen", "amlodipine", "apixaban", "levothyroxine", "sertraline",
    "acetaminophen", "glipizide", "metoprolol", "hydrochlorothiazide",
    "lithium", "haloperidol", "codeine", "tpa"
  ];
  for (const med of knownMeds) {
    const medRegex = new RegExp(`\\b${med}(?:-[a-z]+)?(?:\\s+(\\d+(?:\\/\\d+)?\\s*(?:mg|mcg|g|mEq)))?`, "i");
    const m = rawText.match(medRegex);
    if (m && !medications.some(x => x.name === med)) {
      medications.push({
        name: med,
        dose: m[1] || null,
        route: "oral",
        frequency: null
      });
    }
  }

  const vitals = { bp: null, hr: null, temp: null, spo2: null, rr: null };
  const bpM = rawText.match(/\bBP\s*([0-9]{2,3}\/[0-9]{2,3})\b/i);
  if (bpM) vitals.bp = bpM[1];
  const hrM = rawText.match(/\bHR\s*([0-9]{2,3})\b/i);
  if (hrM) vitals.hr = parseInt(hrM[1], 10);
  const tempM = rawText.match(/\bTemp\s*([0-9]{2,3}(?:\.[0-9]+)?(?:°?[CF])?)\b/i);
  if (tempM) vitals.temp = tempM[1];
  const spo2M = rawText.match(/\bSpO2\s*([0-9]{2,3}%?)\b/i);
  if (spo2M) vitals.spo2 = spo2M[1];
  const rrM = rawText.match(/\bRR\s*([0-9]{1,2})\b/i);
  if (rrM) vitals.rr = parseInt(rrM[1], 10);

  const diagnoses = [];
  const dxMatch = rawText.match(/Assessment:\s*([^\n\.]+)/i);
  if (dxMatch) {
    diagnoses.push({ name: dxMatch[1].trim(), icd10: null });
  }
  const knownDx = [
    { name: "Unstable angina", icd10: "I20.0" },
    { name: "Septic shock", icd10: "R65.21" },
    { name: "Community-acquired pneumonia", icd10: "J18.9" },
    { name: "Acute ischemic stroke", icd10: "I63.9" },
    { name: "Type 2 diabetes mellitus", icd10: "E11.9" },
    { name: "Essential hypertension", icd10: "I10" },
    { name: "Asthma", icd10: "J45.909" },
    { name: "Atrial fibrillation", icd10: "I48.91" }
  ];
  for (const k of knownDx) {
    if (new RegExp(`\\b${k.name}\\b`, "i").test(rawText) && !diagnoses.some(d => d.name.toLowerCase().includes(k.name.toLowerCase()))) {
      diagnoses.push(k);
    }
  }

  let plan = null;
  const planM = rawText.match(/Plan:\s*([^\n]+)/i);
  if (planM) plan = planM[1].trim();

  return {
    patient,
    symptoms,
    diagnoses,
    medications,
    allergies,
    procedures: [],
    vitals,
    labResults: [],
    plan
  };
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
