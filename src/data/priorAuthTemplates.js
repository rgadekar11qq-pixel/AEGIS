/**
 * PRIOR AUTHORIZATION TEMPLATES — Advocate Agent
 *
 * CMS-compliant prior authorization document templates and
 * medical necessity criteria for common procedures and medications.
 * Aligned with CMS-0057-F (effective Jan 2026) FHIR-based ePA requirements.
 */

// ── Prior Auth Categories ───────────────────────────────────────────────
const PA_CATEGORIES = {
  IMAGING: {
    name: "Advanced Imaging",
    examples: ["MRI", "CT", "PET scan", "nuclear medicine"],
    typicalTurnaround: "5 business days",
    urgentTurnaround: "72 hours",
  },
  SURGERY: {
    name: "Surgical Procedures",
    examples: ["joint replacement", "spinal surgery", "cardiac surgery"],
    typicalTurnaround: "15 business days",
    urgentTurnaround: "72 hours",
  },
  SPECIALTY_DRUGS: {
    name: "Specialty Medications",
    examples: ["biologics", "chemotherapy", "gene therapy"],
    typicalTurnaround: "5 business days",
    urgentTurnaround: "24 hours",
  },
  DME: {
    name: "Durable Medical Equipment",
    examples: ["wheelchair", "CPAP", "insulin pump"],
    typicalTurnaround: "10 business days",
    urgentTurnaround: "72 hours",
  },
  REFERRAL: {
    name: "Specialist Referral",
    examples: ["cardiology", "oncology", "neurology"],
    typicalTurnaround: "3 business days",
    urgentTurnaround: "24 hours",
  },
};

// ── Medical Necessity Criteria ──────────────────────────────────────────
const MEDICAL_NECESSITY_CRITERIA = {
  "cardiac catheterization": {
    requiredDiagnoses: ["unstable angina", "NSTEMI", "STEMI", "acute coronary syndrome"],
    requiredFindings: ["elevated troponin", "ST changes on ECG", "positive stress test"],
    contraindications: ["active bleeding", "severe coagulopathy"],
    supportingDocumentation: [
      "ECG results with interpretation",
      "Troponin values with timestamps",
      "Failed conservative management documentation",
      "Risk stratification score (TIMI/GRACE)",
    ],
  },
  "MRI brain": {
    requiredDiagnoses: ["suspected intracranial mass", "stroke", "multiple sclerosis", "persistent headache"],
    requiredFindings: ["neurological deficit", "papilledema", "seizure", "failed conservative treatment > 6 weeks"],
    contraindications: ["MRI-incompatible implant", "severe claustrophobia without sedation"],
    supportingDocumentation: [
      "Neurological examination findings",
      "CT head results (if applicable)",
      "Duration and progression of symptoms",
      "Failed conservative treatments",
    ],
  },
  "joint replacement": {
    requiredDiagnoses: ["severe osteoarthritis", "avascular necrosis", "rheumatoid arthritis"],
    requiredFindings: ["failed conservative management ≥ 3 months", "X-ray showing joint space narrowing", "functional impairment"],
    contraindications: ["active infection", "BMI > 40 (relative)"],
    supportingDocumentation: [
      "X-ray reports",
      "Physical therapy documentation (≥ 6 weeks)",
      "NSAID trial documentation",
      "Functional assessment scores",
    ],
  },
};

// ── Document Template Sections ──────────────────────────────────────────
const PA_DOCUMENT_SECTIONS = [
  {
    id: "patient_info",
    title: "Patient Information",
    fields: ["name", "dob", "memberId", "groupNumber", "planType"],
  },
  {
    id: "provider_info",
    title: "Requesting Provider",
    fields: ["providerName", "npi", "specialty", "phone", "fax"],
  },
  {
    id: "clinical_info",
    title: "Clinical Information",
    fields: ["primaryDiagnosis", "icd10Codes", "relevantHistory", "currentMedications"],
  },
  {
    id: "request_details",
    title: "Service Requested",
    fields: ["procedureDescription", "cptCodes", "quantity", "frequency", "duration"],
  },
  {
    id: "medical_necessity",
    title: "Medical Necessity Justification",
    fields: ["clinicalRationale", "supportingEvidence", "alternativesConsidered", "riskOfDelay"],
  },
  {
    id: "supporting_docs",
    title: "Supporting Documentation",
    fields: ["labResults", "imagingReports", "consultNotes", "priorTreatmentRecords"],
  },
];

// ── Payer-Specific Rules ────────────────────────────────────────────────
const PAYER_RULES = {
  medicare: {
    name: "Medicare / CMS",
    requirements: [
      "Must use CMS-1500 or UB-04 format",
      "ePA via FHIR API required (CMS-0057-F mandate, effective Jan 2026)",
      "Standard turnaround: 7 calendar days",
      "Urgent turnaround: 72 hours",
      "Peer-to-peer review available on denial",
    ],
    appealWindow: "120 days",
  },
  medicaid: {
    name: "Medicaid",
    requirements: [
      "State-specific PA requirements apply",
      "FHIR-based ePA required (CMS-0057-F)",
      "Must document failed step therapy where applicable",
    ],
    appealWindow: "60 days",
  },
  commercial: {
    name: "Commercial Insurance",
    requirements: [
      "Payer-specific clinical criteria (InterQual or MCG)",
      "Online portal submission preferred",
      "Typical turnaround: 14 business days",
      "Urgent turnaround: 24-72 hours",
    ],
    appealWindow: "180 days",
  },
};

module.exports = {
  PA_CATEGORIES,
  MEDICAL_NECESSITY_CRITERIA,
  PA_DOCUMENT_SECTIONS,
  PAYER_RULES,
};
