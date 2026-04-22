/**
 * VISION AGENT
 *
 * Multimodal medical image analysis using Gemini Vision or
 * Llama 3.2 Vision on AMD MI300X. Capabilities:
 *
 *   1. Medical image analysis (X-rays, CT slices, dermatology)
 *   2. Prescription / handwritten note OCR
 *   3. Lab result document extraction
 *   4. Cross-referencing visual findings with clinical entities
 *
 * This agent showcases AMD MI300X's massive 192GB HBM3 memory,
 * which can run vision models alongside text LLMs concurrently.
 */

const { getLLM } = require("../llm/provider");
const fs = require("fs");
const path = require("path");

// ── Analysis Prompts ─────────────────────────────────────────────────────

const MEDICAL_IMAGE_PROMPT = `You are a board-certified radiologist AI assistant performing preliminary image analysis.
Analyze this medical image and provide a structured report.

IMPORTANT: This is an AI-assisted analysis and must be confirmed by a qualified physician.

Provide your analysis in this exact JSON format (no markdown):
{
  "imageType": "<X-ray|CT|MRI|Ultrasound|Dermatology|Lab Report|Prescription|ECG|Other>",
  "bodyRegion": "<anatomical region if applicable>",
  "findings": [
    {
      "description": "<finding description>",
      "location": "<anatomical location>",
      "severity": "NORMAL|MILD|MODERATE|SEVERE|CRITICAL",
      "confidence": "<HIGH|MODERATE|LOW>"
    }
  ],
  "impression": "<overall impression, 2-3 sentences>",
  "recommendations": ["<recommendation 1>", "<recommendation 2>"],
  "urgency": "ROUTINE|URGENT|EMERGENT",
  "limitations": "<any limitations of the analysis>"
}`;

const PRESCRIPTION_OCR_PROMPT = `You are a medical document AI. Extract all information from this prescription or medical document.

Provide your extraction in this exact JSON format (no markdown):
{
  "documentType": "<Prescription|Lab Report|Referral|Discharge Summary|Other>",
  "medications": [
    {
      "name": "<drug name, generic lowercase>",
      "dose": "<dosage>",
      "route": "<oral|IV|IM|topical|inhaled|null>",
      "frequency": "<frequency>",
      "duration": "<duration if specified>"
    }
  ],
  "diagnoses": [
    { "name": "<diagnosis>", "icd10": "<code if visible, else null>" }
  ],
  "instructions": ["<instruction 1>"],
  "providerName": "<prescriber name if visible>",
  "date": "<date if visible>",
  "additionalNotes": "<any other relevant information>"
}`;

const CROSS_REFERENCE_PROMPT = `You are a clinical correlation specialist. Compare visual findings from a medical image analysis with the patient's clinical data to identify discrepancies or confirmations.

Image Analysis Results:
{IMAGE_ANALYSIS}

Clinical Data (from patient documentation):
{CLINICAL_DATA}

Identify:
1. Findings that CONFIRM the clinical documentation
2. Findings that CONTRADICT or are inconsistent with documentation
3. NEW findings not mentioned in clinical documentation
4. Missing workup suggested by the image findings

Respond in this exact JSON format (no markdown):
{
  "confirmations": [
    { "finding": "<what matches>", "clinicalData": "<what it confirms>" }
  ],
  "discrepancies": [
    { "imageFinding": "<what the image shows>", "clinicalData": "<what docs say>", "significance": "HIGH|MODERATE|LOW", "recommendation": "<what to do>" }
  ],
  "newFindings": [
    { "finding": "<new finding>", "significance": "HIGH|MODERATE|LOW", "suggestedAction": "<action>" }
  ],
  "overallCorrelation": "CONCORDANT|PARTIALLY_CONCORDANT|DISCORDANT",
  "summary": "<2-3 sentence summary>"
}`;

// ── Analysis Functions ──────────────────────────────────────────────────

/**
 * Analyze a medical image.
 *
 * @param {string} imageBase64 — Base64-encoded image data
 * @param {string} mimeType — Image MIME type (image/png, image/jpeg, etc.)
 * @param {string} [context] — Optional clinical context
 * @returns {Promise<object>} — Image analysis results
 */
async function analyzeImage(imageBase64, mimeType = "image/png", context = "") {
  const llm = getLLM();
  const prompt = context
    ? `${MEDICAL_IMAGE_PROMPT}\n\nAdditional clinical context: ${context}`
    : MEDICAL_IMAGE_PROMPT;

  let text = await llm.generateWithImage(prompt, imageBase64, mimeType, {
    temperature: 0.1,
    maxTokens: 2048,
  });

  text = text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "");
  return JSON.parse(text);
}

/**
 * Extract information from a prescription or medical document image.
 *
 * @param {string} imageBase64 — Base64-encoded image
 * @param {string} mimeType — Image MIME type
 * @returns {Promise<object>} — Extracted document data
 */
async function extractDocument(imageBase64, mimeType = "image/png") {
  const llm = getLLM();
  let text = await llm.generateWithImage(PRESCRIPTION_OCR_PROMPT, imageBase64, mimeType, {
    temperature: 0,
    maxTokens: 2048,
  });

  text = text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "");
  return JSON.parse(text);
}

/**
 * Cross-reference image findings with clinical entities.
 *
 * @param {object} imageAnalysis — Output from analyzeImage
 * @param {object} entities — Scribe output
 * @returns {Promise<object>} — Cross-reference results
 */
async function crossReferenceWithClinical(imageAnalysis, entities) {
  const llm = getLLM();
  const prompt = CROSS_REFERENCE_PROMPT
    .replace("{IMAGE_ANALYSIS}", JSON.stringify(imageAnalysis, null, 2))
    .replace("{CLINICAL_DATA}", JSON.stringify({
      diagnoses: entities.diagnoses,
      symptoms: entities.symptoms,
      procedures: entities.procedures,
      plan: entities.plan,
      vitals: entities.vitals,
      labResults: entities.labResults,
    }, null, 2));

  let text = await llm.generate(prompt, { temperature: 0.1, maxTokens: 2048 });
  text = text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "");
  return JSON.parse(text);
}

// ── Main Vision Function ────────────────────────────────────────────────

/**
 * Run the Vision agent — multimodal medical image analysis.
 *
 * @param {object} params
 * @param {string} params.imageBase64 — Base64-encoded image
 * @param {string} [params.mimeType] — Image MIME type
 * @param {string} [params.mode] — "analyze" | "extract" | "full"
 * @param {object} [params.entities] — Scribe output for cross-referencing
 * @param {string} [params.context] — Additional clinical context
 * @returns {Promise<object>} — Vision analysis results
 */
async function runVision(params) {
  if (!params || !params.imageBase64) {
    throw Object.assign(
      new Error("imageBase64 is required"),
      { statusCode: 400 }
    );
  }

  const {
    imageBase64,
    mimeType = "image/png",
    mode = "analyze",
    entities = null,
    context = "",
  } = params;

  const startTime = Date.now();
  const result = { mode };

  try {
    if (mode === "extract") {
      // Document extraction mode (prescriptions, lab reports)
      result.extraction = await extractDocument(imageBase64, mimeType);
      result.status = "EXTRACTED";
      result.summary = `Extracted ${result.extraction.documentType || "document"} with ${result.extraction.medications?.length || 0} medications and ${result.extraction.diagnoses?.length || 0} diagnoses.`;
    } else {
      // Image analysis mode (default)
      result.analysis = await analyzeImage(imageBase64, mimeType, context);
      result.status = "ANALYZED";

      // Cross-reference with clinical data if entities provided
      if (entities && mode === "full") {
        result.crossReference = await crossReferenceWithClinical(result.analysis, entities);
        result.summary = `Image analysis complete (${result.analysis.imageType}). Correlation: ${result.crossReference.overallCorrelation}. ${result.analysis.findings?.length || 0} findings, ${result.crossReference.discrepancies?.length || 0} discrepancies.`;
      } else {
        result.summary = `Image analysis complete (${result.analysis.imageType}). ${result.analysis.findings?.length || 0} findings. Urgency: ${result.analysis.urgency}.`;
      }
    }
  } catch (err) {
    console.error("[Vision] Analysis failed:", err.message);
    result.status = "ERROR";
    result.error = err.message;
    result.summary = "Vision analysis failed. Ensure image is valid and try again.";
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

module.exports = { runVision };
