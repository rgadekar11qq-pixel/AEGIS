/**
 * AEGIS — Simulated Vital Signs Stream
 *
 * Server-Sent Events (SSE) endpoint that simulates a patient's vital signs
 * deteriorating over time. Demonstrates real-time clinical monitoring and
 * automatic NEWS2 early warning score calculation.
 *
 * Scenarios:
 *   - stable    : Normal vitals with minor fluctuations
 *   - sepsis    : Progressive deterioration (↑HR, ↓BP, ↑Temp, ↓SpO2)
 *   - cardiac   : Post-MI monitoring (↑HR, ST changes, troponin rise)
 *   - recovery  : Improving from critical state
 */

const express = require("express");
const router = express.Router();

// ── NEWS2 Calculator (real-time) ─────────────────────────────────────────
function calcNEWS2(v) {
  let score = 0;
  // Resp rate
  if (v.rr <= 8) score += 3; else if (v.rr <= 11) score += 1;
  else if (v.rr <= 20) score += 0; else if (v.rr <= 24) score += 2; else score += 3;
  // SpO2
  if (v.spo2 <= 91) score += 3; else if (v.spo2 <= 93) score += 2;
  else if (v.spo2 <= 95) score += 1;
  // Systolic BP
  if (v.sbp <= 90) score += 3; else if (v.sbp <= 100) score += 2;
  else if (v.sbp <= 110) score += 1; else if (v.sbp >= 220) score += 3;
  // Heart rate
  if (v.hr <= 40) score += 3; else if (v.hr <= 50) score += 1;
  else if (v.hr <= 90) score += 0; else if (v.hr <= 110) score += 1;
  else if (v.hr <= 130) score += 2; else score += 3;
  // Temperature
  if (v.temp <= 35) score += 3; else if (v.temp <= 36) score += 1;
  else if (v.temp <= 38) score += 0; else if (v.temp <= 39) score += 1; else score += 2;
  return score;
}

// ── Vital Scenarios ──────────────────────────────────────────────────────
const SCENARIOS = {
  stable: {
    name: "Stable Post-Op Monitoring",
    baseline: { hr: 72, sbp: 120, dbp: 78, spo2: 98, rr: 14, temp: 36.8 },
    trend: (v, t) => ({
      hr: v.hr + (Math.random() - 0.5) * 4,
      sbp: v.sbp + (Math.random() - 0.5) * 6,
      dbp: v.dbp + (Math.random() - 0.5) * 4,
      spo2: Math.min(100, v.spo2 + (Math.random() - 0.4) * 1),
      rr: v.rr + (Math.random() - 0.5) * 2,
      temp: v.temp + (Math.random() - 0.5) * 0.1,
    }),
  },
  sepsis: {
    name: "Sepsis Deterioration",
    baseline: { hr: 88, sbp: 118, dbp: 74, spo2: 96, rr: 18, temp: 37.6 },
    trend: (v, t) => ({
      hr: v.hr + 0.3 + Math.random() * 0.6,             // Rising slowly
      sbp: v.sbp - 0.2 - Math.random() * 0.5,            // Dropping slowly
      dbp: v.dbp - 0.15 - Math.random() * 0.3,
      spo2: Math.max(82, v.spo2 - 0.1 - Math.random() * 0.15),  // Dropping slowly
      rr: v.rr + 0.1 + Math.random() * 0.2,              // Rising slowly
      temp: Math.min(40.5, v.temp + 0.02 + Math.random() * 0.03), // Fever rising slowly
    }),
  },
  cardiac: {
    name: "Post-MI Monitoring",
    baseline: { hr: 92, sbp: 148, dbp: 90, spo2: 95, rr: 18, temp: 37.0 },
    trend: (v, t) => ({
      hr: v.hr + (t > 15 ? 1.2 : 0.3) + Math.random() * 1,
      sbp: v.sbp - (t > 15 ? 1.0 : 0.2) - Math.random() * 0.8,
      dbp: v.dbp - 0.2 - Math.random() * 0.5,
      spo2: Math.max(86, v.spo2 - (t > 20 ? 0.4 : 0.1) - Math.random() * 0.2),
      rr: v.rr + (t > 15 ? 0.4 : 0.1) + Math.random() * 0.3,
      temp: v.temp + (Math.random() - 0.5) * 0.05,
    }),
  },
  recovery: {
    name: "Recovery from Critical",
    baseline: { hr: 128, sbp: 86, dbp: 52, spo2: 89, rr: 28, temp: 39.2 },
    trend: (v, t) => ({
      hr: v.hr - 0.8 - Math.random() * 0.5,             // Recovering
      sbp: v.sbp + 0.6 + Math.random() * 0.8,            // Improving
      dbp: v.dbp + 0.3 + Math.random() * 0.5,
      spo2: Math.min(99, v.spo2 + 0.2 + Math.random() * 0.3),
      rr: Math.max(12, v.rr - 0.3 - Math.random() * 0.4),
      temp: Math.max(36.5, v.temp - 0.04 - Math.random() * 0.03),
    }),
  },
};

// ── SSE Endpoint ─────────────────────────────────────────────────────────
router.get("/vitals/stream", (req, res) => {
  const scenario = SCENARIOS[req.query.scenario] || SCENARIOS.sepsis;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let vitals = { ...scenario.baseline };
  let tick = 0;
  const history = [];

  const interval = setInterval(() => {
    tick++;
    vitals = scenario.trend(vitals, tick);

    // Clamp values to realistic ranges
    vitals.hr = Math.max(30, Math.min(180, Math.round(vitals.hr)));
    vitals.sbp = Math.max(50, Math.min(240, Math.round(vitals.sbp)));
    vitals.dbp = Math.max(30, Math.min(140, Math.round(vitals.dbp)));
    vitals.spo2 = Math.max(70, Math.min(100, Math.round(vitals.spo2)));
    vitals.rr = Math.max(6, Math.min(45, Math.round(vitals.rr)));
    vitals.temp = Math.round(vitals.temp * 10) / 10;

    const news2 = calcNEWS2(vitals);
    let alert = null;
    if (news2 >= 7) alert = { level: "CRITICAL", message: "NEWS2 ≥ 7 — Urgent clinical review, consider ICU" };
    else if (news2 >= 5) alert = { level: "HIGH", message: "NEWS2 ≥ 5 — Urgent response, increase monitoring" };
    else if (news2 >= 3) alert = { level: "MODERATE", message: "NEWS2 ≥ 3 — Clinical review within 1 hour" };

    const point = {
      tick,
      timestamp: Date.now(),
      vitals: { ...vitals, bp: `${vitals.sbp}/${vitals.dbp}` },
      news2,
      alert,
      scenario: scenario.name,
    };

    history.push(point);

    const event = JSON.stringify(point);
    res.write(`data: ${event}\n\n`);

    // Stop after 150 ticks (~5 minutes at 2s intervals)
    if (tick >= 150) {
      res.write(`data: ${JSON.stringify({ tick, done: true, history })}\n\n`);
      res.write("data: [DONE]\n\n");
      clearInterval(interval);
      res.end();
    }
  }, 2000); // Every 2 seconds

  // Clean up on client disconnect
  req.on("close", () => {
    clearInterval(interval);
  });
});

// ── Get available scenarios ──────────────────────────────────────────────
router.get("/vitals/scenarios", (req, res) => {
  res.json({
    scenarios: Object.entries(SCENARIOS).map(([key, val]) => ({
      id: key,
      name: val.name,
      baseline: val.baseline,
    })),
  });
});

module.exports = router;
