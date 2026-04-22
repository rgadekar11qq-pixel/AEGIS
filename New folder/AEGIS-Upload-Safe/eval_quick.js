/**
 * Quick single-case evaluation — writes results to eval_output.txt
 */
const fs = require("fs");
const { runAegisPipeline } = require("./src/orchestrator/pipeline");

const note = `Patient John Doe, 58M. Chief complaint: chest pain radiating to left arm for 2 hours.
History of Type 2 DM on metformin 1000mg BID, HTN on lisinopril 20mg daily.
Allergies: penicillin, sulfa. BP 158/94, HR 92, SpO2 96%.
ECG shows ST depression V3-V5. Troponin 0.08 (normal <0.04).
Started aspirin 325mg, warfarin 5mg daily, nitroglycerin SL.
Assessment: Unstable angina. Plan: admit to CCU, cardiology consult.`;

const known = [
  "Aspirin + Warfarin bleeding risk",
  "Elevated BP 158/94",
  "Troponin 0.08 above normal",
  "E11.9 unspecified diabetes code",
  "ACS suspicion",
  "Warfarin without AFib/DVT diagnosis",
];

(async () => {
  const log = [];
  log.push("AEGIS Quick Evaluation — " + new Date().toISOString());
  log.push("Case: Cardiac — Missed ACS with Drug Interaction\n");

  try {
    const start = Date.now();
    const result = await runAegisPipeline({ rawText: note, generatePriorAuth: false });
    const dur = ((Date.now() - start) / 1000).toFixed(1);
    const allText = JSON.stringify(result).toLowerCase();

    log.push(`Pipeline completed in ${dur}s`);
    log.push(`Risk Level: ${result.summary?.overallRisk}`);
    log.push(`Total Issues: ${result.summary?.totalIssues}`);
    log.push(`Critical: ${result.summary?.criticalIssues}\n`);
    log.push("--- Detection Results ---");

    let detected = 0;
    for (const issue of known) {
      const words = issue.toLowerCase().split(/[\s,\-\+]+/).filter(w => w.length > 3);
      const hits = words.filter(w => allText.includes(w));
      const found = hits.length / words.length >= 0.5;
      if (found) detected++;
      log.push(`${found ? "✅" : "❌"} ${issue} (${Math.round(hits.length/words.length*100)}%)`);
    }

    const sens = Math.round(detected / known.length * 100);
    log.push(`\nSensitivity: ${detected}/${known.length} = ${sens}%`);
    log.push(`\nClinical Scores: ${JSON.stringify(result.clinicalScores?.map(s => `${s.name}: ${s.score}/${s.maxScore} ${s.risk}`) || [])}`);
  } catch (e) {
    log.push("ERROR: " + e.message);
  }

  fs.writeFileSync("d:/AWS/eval_output.txt", log.join("\n"));
  process.exit(0);
})();
