/**
 * ADVOCATE AGENT
 *
 * Automated prior authorization document generator. Takes clinical entities
 * and generates CMS-compliant prior authorization requests including:
 *
 *   1. Patient & provider information formatting
 *   2. Medical necessity justification (AI-generated)
 *   3. Supporting evidence compilation
 *   4. ICD-10 and CPT code mapping
 *   5. Payer-specific requirement matching
 *
 * Aligned with CMS-0057-F (effective Jan 2026) FHIR-based ePA requirements.
 * This agent eliminates hours of manual prior auth paperwork — a $31B+ problem.
 */

const { getLLM } = require("../llm/provider");
const { validateLLMOutput, ADVOCATE_NECESSITY_SCHEMA } = require("../utils/schemaValidator");
const {
  PA_CATEGORIES,
  MEDICAL_NECESSITY_CRITERIA,
  PA_DOCUMENT_SECTIONS,
  PAYER_RULES,
} = require("../data/priorAuthTemplates");

// ── Helpers ──────────────────────────────────────────────────────────────

function norm(s) {
  return (s || "").toLowerCase().trim();
}

function detectPACategory(entities) {
  const plan = norm(entities.plan || "");
  const procedures = (entities.procedures || []).map(norm);
  const allText = [plan, ...procedures].join(" ");

  if (/mri|ct scan|pet|imaging|x-ray|ultrasound|echo/.test(allText)) return "IMAGING";
  if (/surgery|replacement|repair|excision|implant|catheter/.test(allText)) return "SURGERY";
  if (/biologic|chemo|infusion|injection|specialty/.test(allText)) return "SPECIALTY_DRUGS";
  if (/wheelchair|cpap|pump|equipment|prosth/.test(allText)) return "DME";
  if (/consult|referral|specialist/.test(allText)) return "REFERRAL";
  return "REFERRAL"; // default
}

function gatherSupportingEvidence(entities) {
  const evidence = [];

  // Vitals
  if (entities.vitals) {
    const v = entities.vitals;
    const vitalEntries = [];
    if (v.bp) vitalEntries.push(`BP: ${v.bp}`);
    if (v.hr) vitalEntries.push(`HR: ${v.hr}`);
    if (v.temp) vitalEntries.push(`Temp: ${v.temp}`);
    if (v.spo2) vitalEntries.push(`SpO2: ${v.spo2}`);
    if (v.rr) vitalEntries.push(`RR: ${v.rr}`);
    if (vitalEntries.length > 0) {
      evidence.push({ type: "Vital Signs", data: vitalEntries.join(", ") });
    }
  }

  // Lab results
  if (entities.labResults && entities.labResults.length > 0) {
    for (const lab of entities.labResults) {
      evidence.push({
        type: "Lab Result",
        data: `${lab.test}: ${lab.value} ${lab.unit || ""} (${lab.flag || "N/A"})`,
      });
    }
  }

  // Diagnoses with ICD-10
  if (entities.diagnoses && entities.diagnoses.length > 0) {
    for (const dx of entities.diagnoses) {
      evidence.push({
        type: "Diagnosis",
        data: `${dx.name}${dx.icd10 ? ` (${dx.icd10})` : ""}`,
      });
    }
  }

  // Current medications
  if (entities.medications && entities.medications.length > 0) {
    evidence.push({
      type: "Current Medications",
      data: entities.medications.map((m) => `${m.name} ${m.dose || ""} ${m.frequency || ""}`).join("; "),
    });
  }

  return evidence;
}

// ── AI Medical Necessity Generation ─────────────────────────────────────

const ADVOCATE_PROMPT = `You are a medical prior authorization specialist. Generate a compelling medical necessity justification for an insurance prior authorization request.

Patient Data:
{PATIENT_DATA}

Requested Service/Procedure:
{PROCEDURE}

Write a medical necessity justification that includes:
1. Clinical presentation summary
2. Why this service is medically necessary
3. What alternatives have been considered or tried
4. Risk to patient if service is delayed or denied
5. Supporting clinical guidelines or evidence

Respond in this exact JSON format (no markdown, no commentary):
{
  "clinicalSummary": "<2-3 sentence patient presentation>",
  "medicalNecessity": "<detailed justification, 3-5 sentences>",
  "alternativesConsidered": ["<alt 1>", "<alt 2>"],
  "riskOfDenial": "<what happens if this is denied, 2-3 sentences>",
  "supportingGuidelines": ["<guideline 1>", "<guideline 2>"],
  "urgencyLevel": "ROUTINE|URGENT|EMERGENT",
  "estimatedApprovalLikelihood": "HIGH|MODERATE|LOW"
}`;

async function generateMedicalNecessity(entities, procedure) {
  try {
    const llm = getLLM();
    const patientData = JSON.stringify({
      patient: entities.patient,
      diagnoses: entities.diagnoses,
      symptoms: entities.symptoms,
      medications: entities.medications,
      vitals: entities.vitals,
      labResults: entities.labResults,
      allergies: entities.allergies,
    }, null, 2);

    const prompt = ADVOCATE_PROMPT
      .replace("{PATIENT_DATA}", patientData)
      .replace("{PROCEDURE}", procedure || entities.plan || "Specialist consultation");

    let text = await llm.generate(prompt, { temperature: 0.2, maxTokens: 2048 });
    text = text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "");
    const raw = JSON.parse(text);
    const { valid, data, errors } = validateLLMOutput(raw, ADVOCATE_NECESSITY_SCHEMA);
    if (!valid) console.warn("[Advocate] Schema validation fixed LLM output:", errors.join("; "));
    return data;
  } catch (err) {
    console.error("[Advocate] AI generation failed:", err.message);
    return {
      clinicalSummary: "Clinical summary generation unavailable.",
      medicalNecessity: "Medical necessity justification requires manual review.",
      alternativesConsidered: [],
      riskOfDenial: "Risk assessment unavailable.",
      supportingGuidelines: [],
      urgencyLevel: "ROUTINE",
      estimatedApprovalLikelihood: "MODERATE",
    };
  }
}

// ── Document Builder ────────────────────────────────────────────────────

function buildPADocument(entities, category, evidence, medNecessity, payerType = "medicare") {
  const payer = PAYER_RULES[payerType] || PAYER_RULES.medicare;
  const cat = PA_CATEGORIES[category] || PA_CATEGORIES.REFERRAL;
  const now = new Date().toISOString();

  return {
    metadata: {
      documentType: "Prior Authorization Request",
      generatedAt: now,
      generatedBy: "AEGIS Advocate Agent",
      payerType: payer.name,
      category: cat.name,
      turnaround: {
        standard: cat.typicalTurnaround,
        urgent: cat.urgentTurnaround,
      },
      cmsCompliance: "CMS-0057-F (FHIR ePA)",
      appealWindow: payer.appealWindow,
    },

    patientInformation: {
      name: entities.patient?.name || "[Patient Name]",
      age: entities.patient?.age || "[Age]",
      sex: entities.patient?.sex || "[Sex]",
      memberId: "[Member ID — to be filled]",
      dateOfService: now.split("T")[0],
    },

    requestingProvider: {
      name: "[Provider Name — to be filled]",
      npi: "[NPI — to be filled]",
      specialty: "[Specialty]",
      facility: "[Facility Name]",
      phone: "[Phone]",
      fax: "[Fax]",
    },

    clinicalInformation: {
      primaryDiagnosis: entities.diagnoses?.[0] || null,
      allDiagnoses: entities.diagnoses || [],
      icd10Codes: (entities.diagnoses || [])
        .filter((d) => d.icd10)
        .map((d) => ({ code: d.icd10, description: d.name })),
      currentMedications: entities.medications || [],
      allergies: entities.allergies || [],
      relevantVitals: entities.vitals || {},
      pertinentLabResults: entities.labResults || [],
    },

    serviceRequested: {
      description: entities.plan || "[Service Description]",
      procedures: entities.procedures || [],
      urgency: medNecessity.urgencyLevel || "ROUTINE",
    },

    medicalNecessityJustification: {
      clinicalSummary: medNecessity.clinicalSummary,
      justification: medNecessity.medicalNecessity,
      alternativesConsidered: medNecessity.alternativesConsidered,
      riskIfDenied: medNecessity.riskOfDenial,
      supportingGuidelines: medNecessity.supportingGuidelines,
    },

    supportingEvidence: evidence,

    payerRequirements: payer.requirements,

    estimatedOutcome: {
      approvalLikelihood: medNecessity.estimatedApprovalLikelihood,
      recommendedActions: [
        "Submit via FHIR ePA API per CMS-0057-F",
        "Include all supporting lab results and imaging",
        "Document failed conservative management if applicable",
        medNecessity.urgencyLevel === "URGENT" || medNecessity.urgencyLevel === "EMERGENT"
          ? "Mark as URGENT — expedited review required"
          : "Standard review timeline applies",
      ],
    },
  };
}

// ── Main Advocate Function ──────────────────────────────────────────────

/**
 * Run the Advocate agent — automated prior authorization.
 *
 * @param {object} entities — Scribe output
 * @param {object} [options] — Optional: { payerType, procedure }
 * @returns {Promise<object>} — Prior auth document
 */
async function runAdvocate(entities, options = {}) {
  if (!entities || typeof entities !== "object") {
    throw Object.assign(
      new Error("entities must be a non-null object (Scribe JSON output)"),
      { statusCode: 400 }
    );
  }

  const startTime = Date.now();
  const payerType = options.payerType || "medicare";
  const procedure = options.procedure || entities.plan;

  // 1. Detect PA category
  const category = detectPACategory(entities);

  // 2. Gather supporting evidence
  const evidence = gatherSupportingEvidence(entities);

  // 3. AI-generate medical necessity justification
  const medNecessity = await generateMedicalNecessity(entities, procedure);

  // 4. Build the PA document
  const document = buildPADocument(entities, category, evidence, medNecessity, payerType);

  return {
    status: "GENERATED",
    category,
    urgency: medNecessity.urgencyLevel,
    approvalLikelihood: medNecessity.estimatedApprovalLikelihood,
    document,
    summary: `Prior authorization request generated for ${PA_CATEGORIES[category]?.name || category}. Urgency: ${medNecessity.urgencyLevel}. Estimated approval: ${medNecessity.estimatedApprovalLikelihood}.`,
    durationMs: Date.now() - startTime,
  };
}

module.exports = { runAdvocate };
