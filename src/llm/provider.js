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

const DEFAULT_GROQ_KEY = Buffer.from("Z3NrX0g1TnNvRFRVeVdLWGNUNFlEV0ZvV0dkeWIwRllpMlVwR2RrU21tQmlpNWV4TmxrRVJGS1U=", "base64").toString("utf-8");
const PROVIDER = (process.env.LLM_PROVIDER || "groq").toLowerCase();

// ── Groq Provider (Llama / GPT-OSS via Groq API) ───────────────────────────

class GroqProvider {
  constructor() {
    this.apiKey = process.env.GROQ_API_KEY || DEFAULT_GROQ_KEY;
    this.baseUrl = "https://api.groq.com/openai/v1";
    this.model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
    this.visionModel = process.env.GROQ_VISION_MODEL || "openai/gpt-oss-20b";
    this.name = `Groq (${this.model})`;
  }

  async generate(prompt, { temperature = 0, maxTokens = 4096 } = {}) {
    return this._withTimeout(async () => {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: prompt }],
          temperature,
          max_tokens: maxTokens,
        }),
      });
      if (!response.ok) {
        throw new Error(`Groq error: ${response.status} ${await response.text()}`);
      }
      const data = await response.json();
      return data.choices[0].message.content.trim();
    }, 15000);
  }

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
        return await attempt();
      }
      throw err;
    }
  }

  async generateWithImage(prompt, imageBase64, mimeType = "image/png", { temperature = 0, maxTokens = 4096 } = {}) {
    try {
      return await this._withTimeout(async () => {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.visionModel,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: prompt },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:${mimeType};base64,${imageBase64}`,
                    },
                  },
                ],
              },
            ],
            temperature,
            max_tokens: maxTokens,
          }),
        });
        if (!response.ok) {
          return this.generate(prompt, { temperature, maxTokens });
        }
        const data = await response.json();
        return data.choices[0].message.content.trim();
      }, 20000);
    } catch {
      return this.generate(prompt, { temperature, maxTokens });
    }
  }
}

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
    const headers = { "Content-Type": "application/json" };
    if (process.env.VLLM_API_KEY) {
      headers["Authorization"] = `Bearer ${process.env.VLLM_API_KEY}`;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
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
    const headers = { "Content-Type": "application/json" };
    if (process.env.VLLM_API_KEY) {
      headers["Authorization"] = `Bearer ${process.env.VLLM_API_KEY}`;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
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
    case "groq":
      _instance = new GroqProvider();
      break;
    case "vllm":
    case "amd":
      _instance = new VLLMProvider();
      break;
    case "gemini":
    default:
      if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "YOUR_GEMINI_API_KEY_HERE") {
        _instance = new GeminiProvider();
      } else {
        _instance = new GroqProvider();
      }
      break;
  }


  console.log(`[LLM] Provider initialized: ${_instance.name}`);
  return _instance;
}

module.exports = { getLLM, PROVIDER };
