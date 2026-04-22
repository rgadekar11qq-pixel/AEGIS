/**
 * CLINICAL KNOWLEDGE BASE — Sentinel Agent
 *
 * Symptom→condition mappings, vital sign ranges, lab reference ranges,
 * and red-flag symptom clusters used by the Sentinel agent to detect
 * potentially missed diagnoses and escalation risks.
 */

// ── Symptom → Potential Diagnoses ─────────────────────────────────────────
const SYMPTOM_CONDITION_MAP = {
  "chest pain": {
    conditions: [
      { name: "Acute coronary syndrome", urgency: "CRITICAL", requires: ["troponin", "ECG"] },
      { name: "Pulmonary embolism", urgency: "CRITICAL", requires: ["D-dimer", "CT-PA"] },
      { name: "Aortic dissection", urgency: "CRITICAL", requires: ["CT angiography"] },
      { name: "Pneumothorax", urgency: "HIGH", requires: ["chest X-ray"] },
      { name: "Pericarditis", urgency: "MODERATE", requires: ["ECG", "echocardiogram"] },
      { name: "GERD", urgency: "LOW", requires: [] },
    ],
  },
  "shortness of breath": {
    conditions: [
      { name: "Heart failure exacerbation", urgency: "HIGH", requires: ["BNP", "chest X-ray"] },
      { name: "COPD exacerbation", urgency: "HIGH", requires: ["ABG", "chest X-ray"] },
      { name: "Pulmonary embolism", urgency: "CRITICAL", requires: ["D-dimer", "CT-PA"] },
      { name: "Pneumonia", urgency: "MODERATE", requires: ["chest X-ray", "CBC"] },
      { name: "Asthma exacerbation", urgency: "MODERATE", requires: ["peak flow", "SpO2"] },
    ],
  },
  "headache": {
    conditions: [
      { name: "Subarachnoid hemorrhage", urgency: "CRITICAL", requires: ["CT head", "lumbar puncture"] },
      { name: "Meningitis", urgency: "CRITICAL", requires: ["lumbar puncture", "blood cultures"] },
      { name: "Intracranial mass", urgency: "HIGH", requires: ["MRI brain"] },
      { name: "Temporal arteritis", urgency: "HIGH", requires: ["ESR", "CRP", "temporal artery biopsy"] },
      { name: "Migraine", urgency: "LOW", requires: [] },
    ],
  },
  "abdominal pain": {
    conditions: [
      { name: "Appendicitis", urgency: "HIGH", requires: ["CT abdomen", "CBC"] },
      { name: "Cholecystitis", urgency: "HIGH", requires: ["RUQ ultrasound", "LFTs"] },
      { name: "Pancreatitis", urgency: "HIGH", requires: ["lipase", "amylase"] },
      { name: "Bowel obstruction", urgency: "HIGH", requires: ["abdominal X-ray"] },
      { name: "Abdominal aortic aneurysm", urgency: "CRITICAL", requires: ["CT angiography"] },
    ],
  },
  "fever": {
    conditions: [
      { name: "Sepsis", urgency: "CRITICAL", requires: ["blood cultures", "lactate", "CBC"] },
      { name: "Endocarditis", urgency: "HIGH", requires: ["blood cultures", "echocardiogram"] },
      { name: "UTI / Pyelonephritis", urgency: "MODERATE", requires: ["UA", "urine culture"] },
      { name: "Pneumonia", urgency: "MODERATE", requires: ["chest X-ray", "CBC"] },
    ],
  },
  "syncope": {
    conditions: [
      { name: "Cardiac arrhythmia", urgency: "HIGH", requires: ["ECG", "telemetry", "echocardiogram"] },
      { name: "Aortic stenosis", urgency: "HIGH", requires: ["echocardiogram"] },
      { name: "Pulmonary embolism", urgency: "CRITICAL", requires: ["D-dimer", "CT-PA"] },
      { name: "Vasovagal", urgency: "LOW", requires: [] },
    ],
  },
  "altered mental status": {
    conditions: [
      { name: "Stroke", urgency: "CRITICAL", requires: ["CT head", "MRI brain"] },
      { name: "Hypoglycemia", urgency: "CRITICAL", requires: ["glucose"] },
      { name: "Sepsis / infection", urgency: "CRITICAL", requires: ["blood cultures", "UA", "chest X-ray"] },
      { name: "Drug toxicity", urgency: "HIGH", requires: ["drug levels", "tox screen"] },
      { name: "Hepatic encephalopathy", urgency: "HIGH", requires: ["ammonia", "LFTs"] },
    ],
  },
};

// ── Vital Sign Reference Ranges ─────────────────────────────────────────
const VITAL_RANGES = {
  systolicBP: { low: 90, high: 140, criticalLow: 80, criticalHigh: 180, unit: "mmHg" },
  diastolicBP: { low: 60, high: 90, criticalLow: 50, criticalHigh: 120, unit: "mmHg" },
  heartRate: { low: 60, high: 100, criticalLow: 40, criticalHigh: 150, unit: "bpm" },
  temperature: { low: 36.1, high: 37.2, criticalLow: 35.0, criticalHigh: 39.5, unit: "°C" },
  spo2: { low: 95, high: 100, criticalLow: 90, criticalHigh: 100, unit: "%" },
  respiratoryRate: { low: 12, high: 20, criticalLow: 8, criticalHigh: 30, unit: "/min" },
};

// ── Lab Reference Ranges ────────────────────────────────────────────────
const LAB_RANGES = {
  troponin: { low: 0, high: 0.04, criticalHigh: 0.1, unit: "ng/mL", category: "cardiac" },
  bnp: { low: 0, high: 100, criticalHigh: 400, unit: "pg/mL", category: "cardiac" },
  glucose: { low: 70, high: 100, criticalLow: 40, criticalHigh: 400, unit: "mg/dL", category: "metabolic" },
  creatinine: { low: 0.7, high: 1.3, criticalHigh: 4.0, unit: "mg/dL", category: "renal" },
  potassium: { low: 3.5, high: 5.0, criticalLow: 2.5, criticalHigh: 6.5, unit: "mEq/L", category: "electrolyte" },
  sodium: { low: 136, high: 145, criticalLow: 120, criticalHigh: 160, unit: "mEq/L", category: "electrolyte" },
  hemoglobin: { low: 12.0, high: 17.5, criticalLow: 7.0, criticalHigh: 20.0, unit: "g/dL", category: "hematology" },
  wbc: { low: 4.5, high: 11.0, criticalLow: 2.0, criticalHigh: 30.0, unit: "K/uL", category: "hematology" },
  platelets: { low: 150, high: 400, criticalLow: 50, criticalHigh: 1000, unit: "K/uL", category: "hematology" },
  lactate: { low: 0.5, high: 2.0, criticalHigh: 4.0, unit: "mmol/L", category: "metabolic" },
  inr: { low: 0.8, high: 1.1, criticalHigh: 4.0, unit: "", category: "coagulation" },
};

// ── Red Flag Symptom Clusters ───────────────────────────────────────────
// Combinations of symptoms/findings that suggest high-acuity conditions
const RED_FLAG_CLUSTERS = [
  {
    name: "Sepsis triad",
    markers: ["fever", "tachycardia", "hypotension"],
    condition: "Sepsis / Septic Shock",
    urgency: "CRITICAL",
    action: "Initiate sepsis bundle: blood cultures, lactate, broad-spectrum antibiotics within 1 hour",
  },
  {
    name: "ACS presentation",
    markers: ["chest pain", "elevated troponin", "ST changes"],
    condition: "Acute Coronary Syndrome",
    urgency: "CRITICAL",
    action: "Activate cath lab. Aspirin, heparin, cardiology consult STAT",
  },
  {
    name: "Stroke signs",
    markers: ["altered mental status", "focal weakness", "speech difficulty"],
    condition: "Acute Stroke",
    urgency: "CRITICAL",
    action: "CT head STAT, assess tPA eligibility (within 4.5h window)",
  },
  {
    name: "PE triad",
    markers: ["shortness of breath", "tachycardia", "pleuritic chest pain"],
    condition: "Pulmonary Embolism",
    urgency: "CRITICAL",
    action: "D-dimer or CT-PA based on Wells score. Anticoagulation if confirmed",
  },
  {
    name: "DKA presentation",
    markers: ["hyperglycemia", "metabolic acidosis", "altered mental status"],
    condition: "Diabetic Ketoacidosis",
    urgency: "CRITICAL",
    action: "Insulin drip, aggressive IV fluids, electrolyte monitoring q2h",
  },
  {
    name: "Bleeding risk",
    markers: ["anticoagulant use", "elevated INR", "anemia"],
    condition: "Active / Occult Hemorrhage",
    urgency: "HIGH",
    action: "Type and crossmatch, GI consult if GI bleed suspected, hold anticoagulation",
  },
];

// ── Medication-Diagnosis Mismatches ────────────────────────────────────
// Common cases where a prescribed medication doesn't match any diagnosis
const MED_DIAGNOSIS_EXPECTATIONS = {
  metformin: { expectedDiagnoses: ["diabetes", "type 2 dm", "type 2 diabetes", "prediabetes", "pcos"], category: "Endocrine" },
  insulin: { expectedDiagnoses: ["diabetes", "type 1 dm", "type 2 dm", "dka", "hyperglycemia"], category: "Endocrine" },
  lisinopril: { expectedDiagnoses: ["hypertension", "heart failure", "diabetic nephropathy", "ckd"], category: "Cardiovascular" },
  amlodipine: { expectedDiagnoses: ["hypertension", "angina", "coronary artery disease"], category: "Cardiovascular" },
  atorvastatin: { expectedDiagnoses: ["hyperlipidemia", "hypercholesterolemia", "cad", "coronary artery disease", "atherosclerosis"], category: "Cardiovascular" },
  levothyroxine: { expectedDiagnoses: ["hypothyroidism", "thyroid", "hashimoto"], category: "Endocrine" },
  albuterol: { expectedDiagnoses: ["asthma", "copd", "bronchospasm", "reactive airway"], category: "Respiratory" },
  warfarin: { expectedDiagnoses: ["atrial fibrillation", "dvt", "pe", "pulmonary embolism", "mechanical valve"], category: "Hematology" },
  furosemide: { expectedDiagnoses: ["heart failure", "edema", "fluid overload", "ckd", "cirrhosis"], category: "Cardiovascular" },
  omeprazole: { expectedDiagnoses: ["gerd", "peptic ulcer", "gastritis", "gi prophylaxis"], category: "GI" },
};

module.exports = {
  SYMPTOM_CONDITION_MAP,
  VITAL_RANGES,
  LAB_RANGES,
  RED_FLAG_CLUSTERS,
  MED_DIAGNOSIS_EXPECTATIONS,
};
