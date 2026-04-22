/**
 * Deterministic drug-interaction and allergy knowledge base.
 *
 * In production this would be backed by RxNorm / FDA FAERS / a graph DB.
 * Here we hard-code a representative set of clinically-important rules so the
 * /guardian endpoint can demonstrate fully offline, deterministic safety checks.
 */

// ── Drug–Drug Interactions ──────────────────────────────────────────────────
// Each pair is stored alphabetically so lookups are O(1).
const DRUG_INTERACTIONS = [
  {
    pair: ["aspirin", "warfarin"],
    severity: "HIGH",
    description:
      "Concurrent use increases bleeding risk significantly. Monitor INR closely or consider alternative antiplatelet therapy.",
  },
  {
    pair: ["lisinopril", "potassium chloride"],
    severity: "HIGH",
    description:
      "ACE inhibitors increase serum potassium. Combining with potassium supplements can cause life-threatening hyperkalemia.",
  },
  {
    pair: ["metformin", "contrast dye"],
    severity: "HIGH",
    description:
      "Metformin must be held 48 h before and after iodinated contrast to prevent lactic acidosis.",
  },
  {
    pair: ["simvastatin", "amiodarone"],
    severity: "HIGH",
    description:
      "Amiodarone inhibits CYP3A4 metabolism of simvastatin, increasing rhabdomyolysis risk. Max simvastatin dose 20 mg.",
  },
  {
    pair: ["ciprofloxacin", "theophylline"],
    severity: "MODERATE",
    description:
      "Ciprofloxacin inhibits theophylline metabolism, potentially causing toxicity (seizures, arrhythmias).",
  },
  {
    pair: ["fluoxetine", "tramadol"],
    severity: "HIGH",
    description:
      "Both increase serotonin. Combined use raises serotonin syndrome risk — potentially fatal.",
  },
  {
    pair: ["clopidogrel", "omeprazole"],
    severity: "MODERATE",
    description:
      "Omeprazole reduces clopidogrel activation via CYP2C19 inhibition, diminishing antiplatelet effect.",
  },
  {
    pair: ["methotrexate", "ibuprofen"],
    severity: "HIGH",
    description:
      "NSAIDs reduce renal clearance of methotrexate, leading to potentially fatal toxicity.",
  },
  {
    pair: ["sildenafil", "nitroglycerin"],
    severity: "HIGH",
    description:
      "PDE-5 inhibitors potentiate nitrate-induced hypotension. Combination is contraindicated.",
  },
  {
    pair: ["lithium", "hydrochlorothiazide"],
    severity: "HIGH",
    description:
      "Thiazides decrease lithium clearance, risking lithium toxicity. Monitor levels frequently.",
  },
  {
    pair: ["glipizide", "metoprolol"],
    severity: "MODERATE",
    description:
      "Beta-blockers mask hypoglycemic symptoms (tachycardia, tremor) and impair glycogenolysis. Monitor blood glucose closely in diabetic patients.",
  },
  {
    pair: ["lithium", "ibuprofen"],
    severity: "HIGH",
    description:
      "NSAIDs reduce renal lithium clearance, causing lithium accumulation and toxicity. Monitor lithium levels or use acetaminophen instead.",
  },
  {
    pair: ["metoprolol", "warfarin"],
    severity: "MODERATE",
    description:
      "Metoprolol may increase warfarin plasma concentration via CYP2C19 inhibition. Monitor INR when initiating or adjusting doses.",
  },
  {
    pair: ["amlodipine", "simvastatin"],
    severity: "MODERATE",
    description:
      "Amlodipine inhibits CYP3A4, increasing simvastatin exposure and rhabdomyolysis risk. Limit simvastatin to 20mg/day.",
  },
  {
    pair: ["sertraline", "tramadol"],
    severity: "HIGH",
    description:
      "Both are serotonergic agents. Combined use increases risk of serotonin syndrome — potentially fatal. Consider alternative analgesic.",
  },
  {
    pair: ["digoxin", "amiodarone"],
    severity: "HIGH",
    description:
      "Amiodarone increases digoxin levels by ~70%. Reduce digoxin dose by 50% and monitor levels closely.",
  },
  {
    pair: ["lisinopril", "spironolactone"],
    severity: "MODERATE",
    description:
      "ACE inhibitor + potassium-sparing diuretic increases hyperkalemia risk. Monitor potassium within 1 week of initiation.",
  },
  {
    pair: ["apixaban", "aspirin"],
    severity: "HIGH",
    description:
      "DOAC + antiplatelet increases major bleeding risk. Evaluate necessity of dual therapy; use lowest effective doses.",
  },
];

// ── Drug–Allergy Cross-Reactivity ───────────────────────────────────────────
// Maps an allergy allergen to drugs that should be flagged.
const ALLERGY_CROSS_REACTIVITY = {
  penicillin: {
    drugs: ["amoxicillin", "amoxicillin-clavulanate", "ampicillin", "piperacillin", "nafcillin", "penicillin", "augmentin"],
    severity: "HIGH",
    description:
      "Patient has documented penicillin allergy. All beta-lactam penicillins carry cross-reactivity risk (~1-10 % with cephalosporins).",
  },
  sulfa: {
    drugs: [
      "sulfamethoxazole",
      "trimethoprim-sulfamethoxazole",
      "sulfasalazine",
      "dapsone",
    ],
    severity: "HIGH",
    description:
      "Sulfonamide allergy — avoid sulfa-containing antibiotics. Cross-reactivity with non-antibiotic sulfonamides (e.g. furosemide) is debated but low-risk.",
  },
  nsaids: {
    drugs: ["ibuprofen", "naproxen", "ketorolac", "aspirin", "diclofenac", "celecoxib"],
    severity: "MODERATE",
    description:
      "NSAID allergy/sensitivity. Cross-reactivity across COX inhibitors is common, especially in aspirin-exacerbated respiratory disease.",
  },
  codeine: {
    drugs: ["codeine", "morphine", "hydrocodone", "oxycodone", "tramadol"],
    severity: "HIGH",
    description:
      "Opioid allergy flagged. True immunologic allergy is rare but must be respected. Evaluate for histamine-mediated pseudo-allergy.",
  },
  latex: {
    drugs: [],
    severity: "LOW",
    description:
      "Latex allergy noted. Not a drug interaction but important for procedural planning (gloves, IV port covers).",
  },
  iodine: {
    drugs: ["contrast dye", "amiodarone", "povidone-iodine"],
    severity: "MODERATE",
    description:
      "Iodine sensitivity documented. Pre-medicate before contrast procedures; review amiodarone necessity.",
  },
};

// ── Drug–Disease Contraindications ──────────────────────────────────────────
// Maps a condition keyword to drugs that are contraindicated.
const DRUG_DISEASE_CONTRAINDICATIONS = [
  {
    condition: "asthma",
    drugs: ["propranolol", "metoprolol", "atenolol", "nadolol", "timolol", "carvedilol"],
    severity: "HIGH",
    description:
      "Beta-blockers are contraindicated in asthma — they block bronchodilatory beta-2 receptors, risking severe bronchospasm and respiratory failure.",
  },
  {
    condition: "copd",
    drugs: ["propranolol", "nadolol", "timolol"],
    severity: "HIGH",
    description:
      "Non-selective beta-blockers are contraindicated in COPD — risk of acute bronchospasm. Cardioselective agents (bisoprolol) may be used cautiously.",
  },
  {
    condition: "renal failure",
    drugs: ["metformin", "nsaids", "ibuprofen", "naproxen"],
    severity: "HIGH",
    description:
      "Drug is nephrotoxic or renally cleared — contraindicated or requires dose adjustment in renal impairment.",
  },
  {
    condition: "heart failure",
    drugs: ["verapamil", "diltiazem", "thiazolidinediones", "pioglitazone"],
    severity: "HIGH",
    description:
      "Negative inotropes and fluid-retaining agents worsen heart failure. Contraindicated in reduced ejection fraction.",
  },
];

module.exports = { DRUG_INTERACTIONS, ALLERGY_CROSS_REACTIVITY, DRUG_DISEASE_CONTRAINDICATIONS };
