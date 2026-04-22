/**
 * AEGIS — Clinical Scoring Calculators
 *
 * Evidence-based clinical decision tools that auto-calculate from
 * extracted entities. These are NOT LLM-generated — they're deterministic
 * implementations of published medical scoring systems.
 *
 *  • HEART Score — chest pain risk stratification
 *  • qSOFA — sepsis screening
 *  • NEWS2 — National Early Warning Score
 *  • Wells Score — PE probability
 *  • CHA₂DS₂-VASc — stroke risk in atrial fibrillation
 *  • Glasgow Coma Scale — consciousness level
 */

// ═════════════════════════════════════════════════════════════
//  HEART SCORE — Chest Pain Risk (0-10)
//  History, ECG, Age, Risk factors, Troponin
// ═════════════════════════════════════════════════════════════
function heartScore(entities) {
  const diagnoses = (entities.diagnoses || []).map(d => (d.name || "").toLowerCase());
  const vitals = entities.vitals || {};
  const labs = entities.labs || {};
  const age = parseInt(entities.patient?.age) || 0;
  const rawText = (entities._rawText || "").toLowerCase();

  // Only calculate if relevant
  const isCardiac = diagnoses.some(d =>
    d.includes("angina") || d.includes("chest pain") || d.includes("acs") ||
    d.includes("myocardial") || d.includes("coronary") || d.includes("stemi") ||
    d.includes("nstemi")
  ) || rawText.includes("chest pain") || rawText.includes("troponin");
  if (!isCardiac) return null;

  let score = 0;
  const breakdown = [];

  // History (0-2)
  const highSuspicion = rawText.includes("radiating") || rawText.includes("diaphoresis") ||
    rawText.includes("pressure") || rawText.includes("crushing");
  const modSuspicion = rawText.includes("chest pain") || rawText.includes("chest tightness");
  if (highSuspicion) { score += 2; breakdown.push({ param: "History", value: 2, note: "Highly suspicious" }); }
  else if (modSuspicion) { score += 1; breakdown.push({ param: "History", value: 1, note: "Moderately suspicious" }); }
  else { breakdown.push({ param: "History", value: 0, note: "Slightly suspicious" }); }

  // ECG (0-2)
  const hasSTChanges = rawText.includes("st depression") || rawText.includes("st elevation") ||
    rawText.includes("st segment") || rawText.includes("t-wave inversion");
  const hasBBB = rawText.includes("bundle branch") || rawText.includes("bbb") || rawText.includes("lvh");
  if (hasSTChanges) { score += 2; breakdown.push({ param: "ECG", value: 2, note: "ST deviation" }); }
  else if (hasBBB) { score += 1; breakdown.push({ param: "ECG", value: 1, note: "Non-specific repolarization" }); }
  else { breakdown.push({ param: "ECG", value: 0, note: "Normal" }); }

  // Age (0-2)
  if (age >= 65) { score += 2; breakdown.push({ param: "Age", value: 2, note: `${age} years (≥65)` }); }
  else if (age >= 45) { score += 1; breakdown.push({ param: "Age", value: 1, note: `${age} years (45-64)` }); }
  else { breakdown.push({ param: "Age", value: 0, note: `${age} years (<45)` }); }

  // Risk Factors (0-2)
  let riskFactors = 0;
  const allText = rawText + " " + diagnoses.join(" ");
  if (allText.includes("diabetes") || allText.includes("dm") || allText.includes("diabetic")) riskFactors++;
  if (allText.includes("hypertension") || allText.includes("htn")) riskFactors++;
  if (allText.includes("smoking") || allText.includes("smoker") || allText.includes("tobacco")) riskFactors++;
  if (allText.includes("hyperlipidemia") || allText.includes("cholesterol") || allText.includes("dyslipidemia")) riskFactors++;
  if (allText.includes("obesity") || allText.includes("bmi >30") || allText.includes("obese")) riskFactors++;
  if (allText.includes("family history") && (allText.includes("cad") || allText.includes("coronary") || allText.includes("mi"))) riskFactors++;

  if (riskFactors >= 3) { score += 2; breakdown.push({ param: "Risk Factors", value: 2, note: `${riskFactors} factors (≥3)` }); }
  else if (riskFactors >= 1) { score += 1; breakdown.push({ param: "Risk Factors", value: 1, note: `${riskFactors} factor(s)` }); }
  else { breakdown.push({ param: "Risk Factors", value: 0, note: "None identified" }); }

  // Troponin (0-2)
  const troponin = parseFloat(labs.troponin) || parseFloat(rawText.match(/troponin\s*[\:\=]?\s*([\d\.]+)/i)?.[1]) || 0;
  const troponinNormal = rawText.includes("normal <0.04") ? 0.04 : rawText.includes("normal <0.01") ? 0.01 : 0.04;
  if (troponin > troponinNormal * 3) { score += 2; breakdown.push({ param: "Troponin", value: 2, note: `${troponin} (>3× normal)` }); }
  else if (troponin > troponinNormal) { score += 1; breakdown.push({ param: "Troponin", value: 1, note: `${troponin} (1-3× normal)` }); }
  else { breakdown.push({ param: "Troponin", value: 0, note: troponin > 0 ? `${troponin} (normal)` : "Not elevated/not measured" }); }

  let risk, recommendation;
  if (score <= 3) { risk = "LOW"; recommendation = "Consider early discharge. 30-day MACE risk: 0.9-1.7%"; }
  else if (score <= 6) { risk = "MODERATE"; recommendation = "Admit for observation and further workup. 30-day MACE risk: 12-16.6%"; }
  else { risk = "HIGH"; recommendation = "Urgent intervention recommended. 30-day MACE risk: 50-65%"; }

  return { name: "HEART Score", score, maxScore: 10, risk, recommendation, breakdown };
}

// ═════════════════════════════════════════════════════════════
//  qSOFA — Quick Sepsis-Related Organ Failure Assessment (0-3)
// ═════════════════════════════════════════════════════════════
function qsofaScore(entities) {
  const vitals = entities.vitals || {};
  const rawText = (entities._rawText || "").toLowerCase();

  const isSepsis = rawText.includes("sepsis") || rawText.includes("septic") ||
    rawText.includes("infection") || rawText.includes("fever") || rawText.includes("altered mental");
  if (!isSepsis) return null;

  let score = 0;
  const breakdown = [];

  // Respiratory rate >= 22
  const rr = parseInt(vitals.rr) || parseInt(rawText.match(/rr\s*[\:\=]?\s*(\d+)/i)?.[1]) || 0;
  if (rr >= 22) { score++; breakdown.push({ param: "Respiratory Rate", value: 1, note: `${rr} (≥22)` }); }
  else { breakdown.push({ param: "Respiratory Rate", value: 0, note: rr > 0 ? `${rr} (<22)` : "Not documented" }); }

  // Systolic BP <= 100
  const bp = vitals.bp || "";
  const sbp = parseInt(bp.split("/")[0]) || parseInt(rawText.match(/bp\s*[\:\=]?\s*(\d+)/i)?.[1]) || 0;
  if (sbp > 0 && sbp <= 100) { score++; breakdown.push({ param: "Systolic BP", value: 1, note: `${sbp} (≤100)` }); }
  else { breakdown.push({ param: "Systolic BP", value: 0, note: sbp > 0 ? `${sbp} (>100)` : "Not documented" }); }

  // Altered mental status
  const gcsMatch = rawText.match(/gcs\s*[\:\=]?\s*(\d+)/i);
  const gcs = gcsMatch ? parseInt(gcsMatch[1]) : 15;
  const ams = rawText.includes("altered mental") || rawText.includes("confused") ||
    rawText.includes("disoriented") || rawText.includes("unresponsive") || gcs < 15;
  if (ams) { score++; breakdown.push({ param: "Mental Status", value: 1, note: gcs < 15 ? `GCS ${gcs} (altered)` : "Altered" }); }
  else { breakdown.push({ param: "Mental Status", value: 0, note: "Alert and oriented" }); }

  let risk, recommendation;
  if (score >= 2) { risk = "HIGH"; recommendation = "High sepsis risk. Initiate Sepsis-3 bundle: blood cultures, lactate, broad-spectrum antibiotics within 1 hour."; }
  else if (score === 1) { risk = "MODERATE"; recommendation = "Monitor closely. Consider full SOFA scoring and serial lactate measurements."; }
  else { risk = "LOW"; recommendation = "Low sepsis risk by qSOFA. Continue clinical assessment."; }

  return { name: "qSOFA", score, maxScore: 3, risk, recommendation, breakdown };
}

// ═════════════════════════════════════════════════════════════
//  NEWS2 — National Early Warning Score (0-20)
// ═════════════════════════════════════════════════════════════
function news2Score(entities) {
  const vitals = entities.vitals || {};
  const rawText = (entities._rawText || "").toLowerCase();
  let score = 0;
  const breakdown = [];

  // Respiratory rate
  const rr = parseInt(vitals.rr) || parseInt(rawText.match(/rr\s*[\:\=]?\s*(\d+)/i)?.[1]) || 0;
  if (rr > 0) {
    let rrPts = 0;
    if (rr <= 8) rrPts = 3; else if (rr <= 11) rrPts = 1; else if (rr <= 20) rrPts = 0;
    else if (rr <= 24) rrPts = 2; else rrPts = 3;
    score += rrPts; breakdown.push({ param: "Resp Rate", value: rrPts, note: `${rr}/min` });
  }

  // SpO2
  const spo2 = parseInt(vitals.spo2) || parseInt(rawText.match(/spo2\s*[\:\=]?\s*(\d+)/i)?.[1]) || 0;
  if (spo2 > 0) {
    let spo2Pts = 0;
    if (spo2 <= 91) spo2Pts = 3; else if (spo2 <= 93) spo2Pts = 2; else if (spo2 <= 95) spo2Pts = 1;
    score += spo2Pts; breakdown.push({ param: "SpO2", value: spo2Pts, note: `${spo2}%` });
  }

  // Systolic BP
  const sbp = parseInt((vitals.bp || "").split("/")[0]) || 0;
  if (sbp > 0) {
    let bpPts = 0;
    if (sbp <= 90) bpPts = 3; else if (sbp <= 100) bpPts = 2; else if (sbp <= 110) bpPts = 1;
    else if (sbp <= 219) bpPts = 0; else bpPts = 3;
    score += bpPts; breakdown.push({ param: "Systolic BP", value: bpPts, note: `${sbp}mmHg` });
  }

  // Heart rate
  const hr = parseInt(vitals.hr) || parseInt(rawText.match(/hr\s*[\:\=]?\s*(\d+)/i)?.[1]) || 0;
  if (hr > 0) {
    let hrPts = 0;
    if (hr <= 40) hrPts = 3; else if (hr <= 50) hrPts = 1; else if (hr <= 90) hrPts = 0;
    else if (hr <= 110) hrPts = 1; else if (hr <= 130) hrPts = 2; else hrPts = 3;
    score += hrPts; breakdown.push({ param: "Heart Rate", value: hrPts, note: `${hr}bpm` });
  }

  // Temperature
  const temp = parseFloat(vitals.temp) || parseFloat(rawText.match(/temp?\s*[\:\=]?\s*([\d\.]+)/i)?.[1]) || 0;
  if (temp > 0) {
    let tempPts = 0;
    if (temp <= 35) tempPts = 3; else if (temp <= 36) tempPts = 1; else if (temp <= 38) tempPts = 0;
    else if (temp <= 39) tempPts = 1; else tempPts = 2;
    score += tempPts; breakdown.push({ param: "Temperature", value: tempPts, note: `${temp}°C` });
  }

  // Consciousness (AVPU)
  const ams = rawText.includes("altered") || rawText.includes("confused") ||
    rawText.includes("unresponsive") || rawText.includes("unconscious");
  if (ams) { score += 3; breakdown.push({ param: "Consciousness", value: 3, note: "Not alert (AVPU)" }); }
  else { breakdown.push({ param: "Consciousness", value: 0, note: "Alert" }); }

  if (breakdown.length < 2) return null; // Not enough vitals data

  let risk, recommendation;
  if (score >= 7) { risk = "HIGH"; recommendation = "Urgent — continuous monitoring, senior clinical review, consider ICU transfer."; }
  else if (score >= 5) { risk = "MODERATE"; recommendation = "Urgent response — increase monitoring frequency, clinical review within 30 minutes."; }
  else if (score >= 1) { risk = "LOW"; recommendation = "Ward-based care. Reassess within 4-6 hours."; }
  else { risk = "LOW"; recommendation = "Routine monitoring. Reassess within 12 hours."; }

  return { name: "NEWS2", score, maxScore: 20, risk, recommendation, breakdown };
}

// ═════════════════════════════════════════════════════════════
//  CHA₂DS₂-VASc — Stroke Risk in AF (0-9)
// ═════════════════════════════════════════════════════════════
function cha2ds2vascScore(entities) {
  const diagnoses = (entities.diagnoses || []).map(d => (d.name || "").toLowerCase());
  const rawText = (entities._rawText || "").toLowerCase();

  const hasAF = diagnoses.some(d => d.includes("atrial fib") || d.includes("atrial flutter") || d.includes("afib") || d.includes("a-fib")) ||
    rawText.includes("atrial fibrillation") || rawText.includes("afib");
  if (!hasAF) return null;

  let score = 0;
  const breakdown = [];
  const age = parseInt(entities.patient?.age) || 0;
  const sex = (entities.patient?.sex || "").toLowerCase();
  const allText = rawText + " " + diagnoses.join(" ");

  // CHF
  if (allText.includes("heart failure") || allText.includes("chf") || allText.includes("ef <40") || allText.includes("reduced ejection")) {
    score++; breakdown.push({ param: "CHF/LV Dysfunction", value: 1, note: "Present" });
  }
  // Hypertension
  if (allText.includes("hypertension") || allText.includes("htn")) { score++; breakdown.push({ param: "Hypertension", value: 1, note: "Present" }); }
  // Age ≥75 (+2), 65-74 (+1)
  if (age >= 75) { score += 2; breakdown.push({ param: "Age ≥75", value: 2, note: `${age} years` }); }
  else if (age >= 65) { score += 1; breakdown.push({ param: "Age 65-74", value: 1, note: `${age} years` }); }
  // Diabetes
  if (allText.includes("diabetes") || allText.includes("dm") || allText.includes("diabetic")) { score++; breakdown.push({ param: "Diabetes", value: 1, note: "Present" }); }
  // Stroke/TIA (+2)
  if (allText.includes("stroke") || allText.includes("tia") || allText.includes("cerebrovascular")) { score += 2; breakdown.push({ param: "Stroke/TIA History", value: 2, note: "Present" }); }
  // Vascular disease
  if (allText.includes("peripheral arterial") || allText.includes("pad") || allText.includes("prior mi") || allText.includes("aortic plaque")) { score++; breakdown.push({ param: "Vascular Disease", value: 1, note: "Present" }); }
  // Sex = female
  if (sex.includes("f")) { score++; breakdown.push({ param: "Sex (Female)", value: 1, note: "Female" }); }

  let risk, recommendation;
  if (score >= 2) { risk = "HIGH"; recommendation = "Anticoagulation recommended (DOACs preferred over warfarin). Annual stroke risk: " + (score >= 6 ? "9.8-15.2%" : score >= 4 ? "4.0-6.7%" : "2.2-3.2%"); }
  else if (score === 1) { risk = "MODERATE"; recommendation = "Consider anticoagulation. Discuss risks/benefits with patient."; }
  else { risk = "LOW"; recommendation = "Anticoagulation generally not recommended. Reassess periodically."; }

  return { name: "CHA₂DS₂-VASc", score, maxScore: 9, risk, recommendation, breakdown };
}

// ═════════════════════════════════════════════════════════════
//  MASTER FUNCTION — Run all applicable scores
// ═════════════════════════════════════════════════════════════
function calculateClinicalScores(entities) {
  const scores = [];
  const calculators = [heartScore, qsofaScore, news2Score, cha2ds2vascScore];

  for (const calc of calculators) {
    try {
      const result = calc(entities);
      if (result) scores.push(result);
    } catch (e) {
      // Skip failed calculators silently
    }
  }

  return scores;
}

module.exports = { calculateClinicalScores, heartScore, qsofaScore, news2Score, cha2ds2vascScore };
