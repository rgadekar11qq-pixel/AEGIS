/**
 * AEGIS Unit Tests — Guardian & Compliance Agents
 *
 * Run with: node tests/test_agents.js
 * Or with Jest: npx jest tests/test_agents.js
 *
 * Tests deterministic agent logic WITHOUT any LLM calls.
 */

// ── Minimal test runner (works with or without Jest) ──────────
const isJest = typeof describe !== "undefined";
let _pass = 0, _fail = 0, _tests = [];

function test(name, fn) {
  if (isJest) return global.test(name, fn);
  try { fn(); _pass++; _tests.push({ name, status: "PASS" }); console.log(`  ✅ ${name}`); }
  catch (e) { _fail++; _tests.push({ name, status: "FAIL", error: e.message }); console.log(`  ❌ ${name}: ${e.message}`); }
}
function expect(val) {
  return {
    toBe(v) { if (val !== v) throw new Error(`Expected ${JSON.stringify(v)}, got ${JSON.stringify(val)}`); },
    toEqual(v) { if (JSON.stringify(val) !== JSON.stringify(v)) throw new Error(`Expected ${JSON.stringify(v)}, got ${JSON.stringify(val)}`); },
    toBeGreaterThan(v) { if (!(val > v)) throw new Error(`Expected ${val} > ${v}`); },
    toBeGreaterThanOrEqual(v) { if (!(val >= v)) throw new Error(`Expected ${val} >= ${v}`); },
    toBeTruthy() { if (!val) throw new Error(`Expected truthy, got ${JSON.stringify(val)}`); },
    toBeFalsy() { if (val) throw new Error(`Expected falsy, got ${JSON.stringify(val)}`); },
    toContain(v) { if (!val.includes(v)) throw new Error(`Expected array to contain ${JSON.stringify(v)}`); },
    toHaveLength(v) { if (val.length !== v) throw new Error(`Expected length ${v}, got ${val.length}`); },
    toThrow() { let threw = false; try { val(); } catch(e) { threw = true; } if (!threw) throw new Error("Expected function to throw"); },
  };
}
if (!isJest) global.expect = expect;

const { runGuardian } = require("../src/agents/guardian");
const { runCompliance } = require("../src/agents/compliance");
const { calculateClinicalScores, heartScore, qsofaScore, news2Score } = require("../src/agents/clinicalScores");

// ═══════════════════════════════════════════════════════════════
//  GUARDIAN TESTS
// ═══════════════════════════════════════════════════════════════
console.log("\n🛡️  GUARDIAN AGENT TESTS");
console.log("─".repeat(50));

test("Guardian: should throw on null input", () => {
  expect(() => runGuardian(null)).toThrow();
});

test("Guardian: should return LOW risk when no meds/allergies", () => {
  const result = runGuardian({ medications: [], allergies: [] });
  expect(result.riskLevel).toBe("LOW");
  expect(result.findings).toHaveLength(0);
});

test("Guardian: should detect aspirin + warfarin interaction", () => {
  const result = runGuardian({
    medications: [{ name: "aspirin" }, { name: "warfarin" }],
    allergies: [],
  });
  expect(result.riskLevel).toBe("HIGH");
  expect(result.findings.length).toBeGreaterThan(0);
  const interaction = result.findings.find(f => f.type === "DRUG_INTERACTION");
  expect(interaction).toBeTruthy();
});

test("Guardian: should detect penicillin allergy + amoxicillin cross-reactivity", () => {
  const result = runGuardian({
    medications: [{ name: "amoxicillin" }],
    allergies: ["penicillin"],
  });
  expect(result.findings.length).toBeGreaterThan(0);
  const allergy = result.findings.find(f => f.type === "ALLERGY_CROSS_REACTIVITY");
  expect(allergy).toBeTruthy();
  expect(allergy.allergen).toBe("penicillin");
});

test("Guardian: should handle multiple simultaneous interactions", () => {
  const result = runGuardian({
    medications: [{ name: "aspirin" }, { name: "warfarin" }, { name: "fluoxetine" }, { name: "tramadol" }],
    allergies: ["penicillin"],
  });
  expect(result.findings.length).toBeGreaterThanOrEqual(2);
  expect(result.riskLevel).toBe("HIGH");
});

test("Guardian: should normalize drug names (case insensitive)", () => {
  const result = runGuardian({
    medications: [{ name: "ASPIRIN" }, { name: "Warfarin" }],
    allergies: [],
  });
  expect(result.findings.length).toBeGreaterThan(0);
});

test("Guardian: should be safe with empty medications array", () => {
  const result = runGuardian({ medications: [] });
  expect(result.riskLevel).toBe("LOW");
  expect(result.findings).toHaveLength(0);
});

test("Guardian: no false positives - non-interacting drug pair", () => {
  const result = runGuardian({
    medications: [{ name: "metformin" }, { name: "lisinopril" }],
    allergies: [],
  });
  expect(result.findings).toHaveLength(0);
  expect(result.riskLevel).toBe("LOW");
});

// ═══════════════════════════════════════════════════════════════
//  COMPLIANCE TESTS
// ═══════════════════════════════════════════════════════════════
console.log("\n📋 COMPLIANCE AGENT TESTS");
console.log("─".repeat(50));

test("Compliance: should throw on null input", () => {
  expect(() => runCompliance(null)).toThrow();
});

test("Compliance: should PASS with valid ICD-10 codes", () => {
  const result = runCompliance({
    diagnoses: [
      { name: "Type 2 DM with hyperglycemia", icd10: "E11.65" },
      { name: "Hypertension", icd10: "I10" },
    ],
  });
  expect(result.overallStatus).toBe("PASS");
  expect(result.icd10Validation.every(v => v.valid)).toBeTruthy();
});

test("Compliance: should FAIL with missing ICD-10 code", () => {
  const result = runCompliance({
    diagnoses: [{ name: "Some condition", icd10: "" }],
  });
  expect(result.overallStatus).toBe("FAIL");
  const missing = result.icd10Validation.find(v => v.status === "MISSING");
  expect(missing).toBeTruthy();
});

test("Compliance: should flag malformed ICD-10 code", () => {
  const result = runCompliance({
    diagnoses: [{ name: "Test", icd10: "INVALID" }],
  });
  const bad = result.icd10Validation.find(v => v.status === "MALFORMED");
  expect(bad).toBeTruthy();
});

test("Compliance: should validate E11.9 as unspecified diabetes", () => {
  const result = runCompliance({
    diagnoses: [{ name: "Diabetes", icd10: "E11.9" }],
  });
  const validation = result.icd10Validation[0];
  expect(validation.valid).toBeTruthy();
  expect(validation.code).toBe("E11.9");
});

test("Compliance: should check billing rules with unspecified codes", () => {
  const result = runCompliance({
    diagnoses: [{ name: "Diabetes", icd10: "E11.9" }],
  });
  // E11.9 is unspecified — billing rules should flag it
  const hasWarning = result.billingFindings.length > 0;
  expect(hasWarning).toBeTruthy();
});

test("Compliance: should handle empty diagnoses array", () => {
  const result = runCompliance({ diagnoses: [] });
  expect(result.overallStatus).toBe("PASS");
  expect(result.icd10Validation).toHaveLength(0);
});

// ═══════════════════════════════════════════════════════════════
//  CLINICAL SCORES TESTS
// ═══════════════════════════════════════════════════════════════
console.log("\n🏥 CLINICAL SCORES TESTS");
console.log("─".repeat(50));

test("HEART Score: should calculate for cardiac case", () => {
  const result = heartScore({
    diagnoses: [{ name: "Unstable angina" }],
    vitals: { bp: "158/94", hr: "92", spo2: "96%" },
    labs: { troponin: "0.08" },
    patient: { age: "58" },
    _rawText: "chest pain radiating to left arm, ST depression V3-V5, troponin 0.08 normal <0.04, history of diabetes DM, hypertension HTN",
  });
  expect(result).toBeTruthy();
  expect(result.name).toBe("HEART Score");
  expect(result.score).toBeGreaterThan(3); // Should be at least moderate
  expect(result.risk).toBe("HIGH");
});

test("HEART Score: should return null for non-cardiac case", () => {
  const result = heartScore({
    diagnoses: [{ name: "Urinary tract infection" }],
    vitals: {},
    _rawText: "dysuria, frequency, UTI",
  });
  expect(result).toBeFalsy();
});

test("qSOFA: should calculate for sepsis case", () => {
  const result = qsofaScore({
    vitals: { bp: "82/50", rr: "28" },
    _rawText: "sepsis, altered mental status, BP 82/50, RR 28, fever",
  });
  expect(result).toBeTruthy();
  expect(result.name).toBe("qSOFA");
  expect(result.score).toBeGreaterThanOrEqual(2);
  expect(result.risk).toBe("HIGH");
});

test("NEWS2: should calculate with vitals data", () => {
  const result = news2Score({
    vitals: { bp: "82/50", hr: "118", spo2: "89%", rr: "28", temp: "39.8" },
    _rawText: "altered mental status",
  });
  expect(result).toBeTruthy();
  expect(result.name).toBe("NEWS2");
  expect(result.score).toBeGreaterThan(5); // Should be high
  expect(result.risk).toBe("HIGH");
});

test("Clinical Scores: should return multiple scores for complex case", () => {
  const scores = calculateClinicalScores({
    diagnoses: [{ name: "Unstable angina" }],
    vitals: { bp: "158/94", hr: "92", spo2: "96%", temp: "37" },
    patient: { age: "58" },
    _rawText: "chest pain radiating, troponin 0.08, ST depression, diabetes, hypertension",
  });
  expect(scores.length).toBeGreaterThanOrEqual(1);
});

// ═══════════════════════════════════════════════════════════════
//  EDGE CASES & ROBUSTNESS TESTS
// ═══════════════════════════════════════════════════════════════
console.log("\n🔒 EDGE CASE & ROBUSTNESS TESTS");
console.log("─".repeat(50));

test("Guardian: should handle medications with missing name field", () => {
  const result = runGuardian({
    medications: [{ dose: "500mg" }, { name: "aspirin" }],
    allergies: [],
  });
  expect(result.riskLevel).toBe("LOW"); // Should not crash
});

test("Guardian: should handle 20+ medications without error", () => {
  const meds = Array(20).fill(null).map((_, i) => ({ name: `drug_${i}` }));
  const result = runGuardian({ medications: meds, allergies: [] });
  expect(result.riskLevel).toBe("LOW"); // No known interactions
});

test("Guardian: should handle duplicate medications gracefully", () => {
  const result = runGuardian({
    medications: [{ name: "aspirin" }, { name: "aspirin" }, { name: "warfarin" }],
    allergies: [],
  });
  expect(result.riskLevel).toBe("HIGH");
});

test("Guardian: should handle unicode/special characters in drug names", () => {
  const result = runGuardian({
    medications: [{ name: "métformin" }, { name: "lisinöpril" }],
    allergies: ["pénicillin"],
  });
  expect(result.riskLevel).toBe("LOW"); // Should not crash
});

test("Guardian: should handle allergies as strings and objects", () => {
  const result = runGuardian({
    medications: [{ name: "amoxicillin" }],
    allergies: ["penicillin"],
  });
  expect(result.findings.length).toBeGreaterThan(0);
});

test("Compliance: should handle diagnosis with only name, no ICD-10", () => {
  const result = runCompliance({
    diagnoses: [{ name: "Unknown illness" }],
  });
  expect(result.overallStatus).toBe("FAIL");
});

test("Compliance: should accept valid 3-character ICD-10 codes", () => {
  const result = runCompliance({
    diagnoses: [{ name: "Hypertension", icd10: "I10" }],
  });
  const validation = result.icd10Validation[0];
  expect(validation.valid).toBeTruthy();
});

test("Compliance: should accept valid 7-character ICD-10 codes", () => {
  const result = runCompliance({
    diagnoses: [{ name: "DM Type 2 with neuropathy", icd10: "E11.40" }],
  });
  const validation = result.icd10Validation[0];
  expect(validation.valid).toBeTruthy();
});

test("Compliance: should handle very long diagnosis names", () => {
  const result = runCompliance({
    diagnoses: [{ name: "A".repeat(500), icd10: "I10" }],
  });
  expect(result.overallStatus).toBe("PASS"); // Should not crash
});

// ═══════════════════════════════════════════════════════════════
//  FHIR EXPORT TESTS
// ═══════════════════════════════════════════════════════════════
console.log("\n🔗 FHIR R4 EXPORT TESTS");
console.log("─".repeat(50));

const { generateFHIRBundle } = require("../src/data/fhirExport");

test("FHIR: should generate valid bundle structure", () => {
  const bundle = generateFHIRBundle({ agents: { scribe: { output: {} } } });
  expect(bundle.resourceType).toBe("Bundle");
  expect(bundle.type).toBe("collection");
  expect(bundle.timestamp).toBeTruthy();
});

test("FHIR: should include Patient resource when patient data exists", () => {
  const bundle = generateFHIRBundle({
    agents: { scribe: { output: { patient: { name: "John Doe", sex: "M", age: "58" } } } },
  });
  const patient = bundle.entry.find(e => e.resource.resourceType === "Patient");
  expect(patient).toBeTruthy();
  expect(patient.resource.gender).toBe("male");
});

test("FHIR: should include Condition resources for diagnoses", () => {
  const bundle = generateFHIRBundle({
    agents: {
      scribe: { output: { diagnoses: [{ name: "Hypertension", icd10: "I10" }], patient: {} } },
    },
  });
  const condition = bundle.entry.find(e => e.resource.resourceType === "Condition");
  expect(condition).toBeTruthy();
  expect(condition.resource.code.coding[0].code).toBe("I10");
});

test("FHIR: should include RiskAssessment from Arbiter", () => {
  const bundle = generateFHIRBundle({
    agents: {
      scribe: { output: { patient: {} } },
      arbiter: { output: { overallRisk: "HIGH", consensus: { executiveSummary: "Test" }, voting: { confidence: 85, voteCount: 4 }, totalIssues: 3, criticalIssues: 1 } },
    },
  });
  const risk = bundle.entry.find(e => e.resource.resourceType === "RiskAssessment");
  expect(risk).toBeTruthy();
  expect(risk.resource.prediction[0].probabilityDecimal).toBe(0.75);
});

test("FHIR: should handle empty pipeline result without crashing", () => {
  const bundle = generateFHIRBundle({});
  expect(bundle.resourceType).toBe("Bundle");
  expect(bundle.entry).toHaveLength(0);
});

// ═══════════════════════════════════════════════════════════════
//  MODULE EXISTENCE TESTS
// ═══════════════════════════════════════════════════════════════
console.log("\n📦 MODULE INTEGRITY TESTS");
console.log("─".repeat(50));

test("RxNorm module should export expected functions", () => {
  const rxnorm = require("../src/data/rxnorm");
  expect(typeof rxnorm.getRxCUI).toBe("function");
  expect(typeof rxnorm.rxnormInteractionCheck).toBe("function");
});

test("Guardian should export both sync and async functions", () => {
  const guardian = require("../src/agents/guardian");
  expect(typeof guardian.runGuardian).toBe("function");
  expect(typeof guardian.runGuardianAsync).toBe("function");
});

test("FHIR export module should export generateFHIRBundle", () => {
  const fhir = require("../src/data/fhirExport");
  expect(typeof fhir.generateFHIRBundle).toBe("function");
});

// ── Summary ──────────────────────────────────────────────────
if (!isJest) {
  const total = _pass + _fail;
  console.log("\n" + "═".repeat(50));
  console.log(`  Results: ${_pass}/${total} passed, ${_fail} failed`);
  console.log("═".repeat(50));
  if (_fail > 0) {
    console.log("\n  Failed tests:");
    _tests.filter(t => t.status === "FAIL").forEach(t => console.log(`    ❌ ${t.name}: ${t.error}`));
  }
  console.log("");
  // Write results to file
  const fs = require("fs");
  fs.writeFileSync("d:/AWS/test_results.json", JSON.stringify({ total, passed: _pass, failed: _fail, tests: _tests }, null, 2));
  process.exit(_fail > 0 ? 1 : 0);
}

