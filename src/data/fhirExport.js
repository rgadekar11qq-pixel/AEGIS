/**
 * AEGIS — FHIR R4 Bundle Export
 *
 * Converts pipeline results into a valid HL7 FHIR R4 Bundle (JSON).
 * This demonstrates healthcare interoperability — a core requirement
 * for any production clinical system.
 *
 * Outputs a Bundle containing:
 *   - Patient resource
 *   - Condition resources (diagnoses)
 *   - MedicationStatement resources
 *   - Observation resources (vitals, labs)
 *   - RiskAssessment resource (from Arbiter)
 */

function generateFHIRBundle(pipelineResult) {
  const r = pipelineResult;
  const scribe = r.agents?.scribe?.output || {};
  const arb = r.agents?.arbiter?.output || {};
  const ts = new Date().toISOString();
  const patientId = `patient-${Date.now()}`;

  const bundle = {
    resourceType: "Bundle",
    type: "collection",
    timestamp: ts,
    meta: {
      profile: ["http://hl7.org/fhir/StructureDefinition/Bundle"],
      source: "AEGIS v1.0 — Multi-Agent Clinical Intelligence",
    },
    entry: [],
  };

  // ── Patient ──────────────────────────────────────────────────
  if (scribe.patient) {
    bundle.entry.push({
      resource: {
        resourceType: "Patient",
        id: patientId,
        name: scribe.patient.name ? [{
          use: "official",
          text: scribe.patient.name,
        }] : undefined,
        gender: scribe.patient.sex === "M" ? "male" : scribe.patient.sex === "F" ? "female" : "unknown",
        extension: scribe.patient.age ? [{
          url: "http://hl7.org/fhir/StructureDefinition/patient-age",
          valueAge: { value: parseInt(scribe.patient.age), unit: "years", system: "http://unitsofmeasure.org", code: "a" },
        }] : undefined,
      },
    });
  }

  // ── Conditions (Diagnoses) ────────────────────────────────────
  for (const dx of (scribe.diagnoses || [])) {
    bundle.entry.push({
      resource: {
        resourceType: "Condition",
        subject: { reference: `Patient/${patientId}` },
        code: {
          coding: dx.icd10 ? [{
            system: "http://hl7.org/fhir/sid/icd-10-cm",
            code: dx.icd10,
            display: dx.name,
          }] : [],
          text: dx.name,
        },
        clinicalStatus: {
          coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }],
        },
        recordedDate: ts,
      },
    });
  }

  // ── MedicationStatements ──────────────────────────────────────
  for (const med of (scribe.medications || [])) {
    bundle.entry.push({
      resource: {
        resourceType: "MedicationStatement",
        status: "active",
        subject: { reference: `Patient/${patientId}` },
        medicationCodeableConcept: {
          text: `${med.name}${med.dose ? ` ${med.dose}` : ""}`,
        },
        dosage: med.dose ? [{
          text: `${med.dose}${med.route ? ` ${med.route}` : ""}${med.frequency ? ` ${med.frequency}` : ""}`,
          route: med.route ? { text: med.route } : undefined,
        }] : undefined,
        dateAsserted: ts,
      },
    });
  }

  // ── Vital Signs (Observations) ────────────────────────────────
  const vitals = scribe.vitals || {};
  const vitalMappings = [
    { key: "bp", code: "85354-9", display: "Blood Pressure", unit: "mmHg" },
    { key: "hr", code: "8867-4", display: "Heart Rate", unit: "/min" },
    { key: "temp", code: "8310-5", display: "Body Temperature", unit: "Cel" },
    { key: "spo2", code: "2708-6", display: "Oxygen Saturation", unit: "%" },
    { key: "rr", code: "9279-1", display: "Respiratory Rate", unit: "/min" },
  ];

  for (const v of vitalMappings) {
    if (vitals[v.key]) {
      bundle.entry.push({
        resource: {
          resourceType: "Observation",
          status: "final",
          category: [{
            coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "vital-signs" }],
          }],
          code: {
            coding: [{ system: "http://loinc.org", code: v.code, display: v.display }],
          },
          subject: { reference: `Patient/${patientId}` },
          valueString: String(vitals[v.key]),
          effectiveDateTime: ts,
        },
      });
    }
  }

  // ── Risk Assessment (from Arbiter) ─────────────────────────────
  if (arb.overallRisk) {
    const riskValue = arb.overallRisk === "HIGH" ? 0.75 :
                      arb.overallRisk === "CRITICAL" ? 0.95 :
                      arb.overallRisk === "MODERATE" ? 0.5 : 0.15;

    bundle.entry.push({
      resource: {
        resourceType: "RiskAssessment",
        status: "final",
        subject: { reference: `Patient/${patientId}` },
        method: {
          text: "AEGIS Multi-Agent Consensus (Weighted Majority Voting + Dempster-Shafer Evidence)",
        },
        prediction: [{
          outcome: { text: `${arb.overallRisk} Risk — ${arb.consensus?.executiveSummary || ""}`.slice(0, 200) },
          probabilityDecimal: riskValue,
        }],
        note: [{
          text: `Consensus confidence: ${arb.voting?.confidence || 0}%. Votes: ${arb.voting?.voteCount || 0}. Issues: ${arb.totalIssues || 0} (${arb.criticalIssues || 0} critical).`,
        }],
        date: ts,
      },
    });
  }

  // ── Allergy Intolerances ───────────────────────────────────────
  for (const allergy of (scribe.allergies || [])) {
    bundle.entry.push({
      resource: {
        resourceType: "AllergyIntolerance",
        clinicalStatus: {
          coding: [{ system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical", code: "active" }],
        },
        patient: { reference: `Patient/${patientId}` },
        code: { text: allergy },
        recordedDate: ts,
      },
    });
  }

  return bundle;
}

module.exports = { generateFHIRBundle };
