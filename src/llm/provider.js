/**
 * LLM PROVIDER ABSTRACTION
 *
 * Provides a unified interface for LLM inference that can switch between:
 *   - Gemini API (development / fallback)
 *   - vLLM on AMD MI300X (hackathon deployment)
 *
 * This abstraction lets every agent call `llm.generate()` without caring
 * which backend is active — we flip one env var to switch.
 */

require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

// ── Provider detection ──────────────────────────────────────────────────────

const PROVIDER = (process.env.LLM_PROVIDER || "gemini").toLowerCase();

// ── Gemini Provider ─────────────────────────────────────────────────────────

class GeminiProvider {
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY_HERE") {
      throw new Error("GEMINI_API_KEY is not configured.");
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    this.visionModel = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    this.name = "Gemini 2.5 Flash";
  }

  async generate(prompt, { temperature = 0, maxTokens = 4096 } = {}) {
    return this._withTimeout(async () => {
      const result = await this.model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      });
      return result.response.text().trim();
    }, 30000);
  }

  /** Wraps an async fn with a timeout + 1 retry */
  async _withTimeout(fn, ms) {
    const attempt = () => Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`LLM call timed out after ${ms/1000}s`)), ms)
      ),
    ]);
    try {
      return await attempt();
    } catch (err) {
      if (err.message.includes("timed out")) {
        console.warn("[LLM] Timeout, retrying once...");
        return await attempt(); // retry once
      }
      throw err;
    }
  }

  async generateWithImage(prompt, imageBase64, mimeType = "image/png", { temperature = 0, maxTokens = 4096 } = {}) {
    const result = await this.visionModel.generateContent({
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType, data: imageBase64 } },
          { text: prompt },
        ],
      }],
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    });
    return result.response.text().trim();
  }
}

// ── vLLM Provider (AMD MI300X) ──────────────────────────────────────────────

class VLLMProvider {
  constructor() {
    this.baseUrl = process.env.VLLM_BASE_URL || "http://localhost:8000/v1";
    this.model = process.env.VLLM_MODEL || "meta-llama/Llama-3.1-70B-Instruct";
    this.visionModel = process.env.VLLM_VISION_MODEL || "meta-llama/Llama-3.2-11B-Vision-Instruct";
    this.name = `vLLM (${this.model}) on AMD MI300X`;
  }

  async generate(prompt, { temperature = 0, maxTokens = 4096 } = {}) {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        temperature,
        max_tokens: maxTokens,
      }),
    });
    if (!response.ok) {
      throw new Error(`vLLM error: ${response.status} ${await response.text()}`);
    }
    const data = await response.json();
    return data.choices[0].message.content.trim();
  }

  async generateWithImage(prompt, imageBase64, mimeType = "image/png", { temperature = 0, maxTokens = 4096 } = {}) {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.visionModel,
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            { type: "text", text: prompt },
          ],
        }],
        temperature,
        max_tokens: maxTokens,
      }),
    });
    if (!response.ok) {
      throw new Error(`vLLM Vision error: ${response.status} ${await response.text()}`);
    }
    const data = await response.json();
    return data.choices[0].message.content.trim();
  }
}

// ── Factory ─────────────────────────────────────────────────────────────────

let _instance = null;

function getLLM() {
  if (_instance) return _instance;

  switch (PROVIDER) {
    case "vllm":
    case "amd":
      _instance = new VLLMProvider();
      break;
    case "gemini":
    default:
      _instance = new GeminiProvider();
      break;
  }

  console.log(`[LLM] Provider initialized: ${_instance.name}`);
  return _instance;
}

module.exports = { getLLM, PROVIDER };
