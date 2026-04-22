/**
 * ICD-10 code validation and billing / compliance rules.
 *
 * In production this would pull from the CMS ICD-10-CM database and
 * payer-specific edits (NCCI, MUE, LCD/NCD). Here we encode a curated
 * subset so /compliance can run entirely offline.
 */

// ── Valid ICD-10 Codes (subset) ─────────────────────────────────────────────
const VALID_ICD10_CODES = {
  // Diabetes
  "E11.9": { description: "Type 2 diabetes mellitus without complications", category: "Endocrine" },
  "E11.65": { description: "Type 2 DM with hyperglycemia", category: "Endocrine" },
  "E11.21": { description: "Type 2 DM with diabetic nephropathy", category: "Endocrine" },
  "E11.22": { description: "Type 2 DM with diabetic chronic kidney disease", category: "Endocrine" },
  "E11.40": { description: "Type 2 DM with diabetic neuropathy, unspecified", category: "Endocrine" },
  "E11.42": { description: "Type 2 DM with diabetic polyneuropathy", category: "Endocrine" },
  "E10.9": { description: "Type 1 diabetes mellitus without complications", category: "Endocrine" },

  // Hypertension
  "I10": { description: "Essential (primary) hypertension", category: "Circulatory" },
  "I11.9": { description: "Hypertensive heart disease without heart failure", category: "Circulatory" },
  "I12.9": { description: "Hypertensive chronic kidney disease, stage 1-4 or unspecified", category: "Circulatory" },

  // Heart / Vascular
  "I25.10": { description: "Atherosclerotic heart disease of native coronary artery without angina", category: "Circulatory" },
  "I48.91": { description: "Unspecified atrial fibrillation", category: "Circulatory" },
  "I50.9": { description: "Heart failure, unspecified", category: "Circulatory" },

  // Respiratory
  "J06.9": { description: "Acute upper respiratory infection, unspecified", category: "Respiratory" },
  "J18.9": { description: "Pneumonia, unspecified organism", category: "Respiratory" },
  "J44.1": { description: "COPD with acute exacerbation", category: "Respiratory" },
  "J45.20": { description: "Mild intermittent asthma, uncomplicated", category: "Respiratory" },

  // Musculoskeletal
  "M54.5": { description: "Low back pain", category: "Musculoskeletal" },
  "M79.3": { description: "Panniculitis, unspecified", category: "Musculoskeletal" },

  // Mental / Behavioral
  "F32.1": { description: "Major depressive disorder, single episode, moderate", category: "Mental" },
  "F41.1": { description: "Generalized anxiety disorder", category: "Mental" },

  // Injury / External causes
  "S62.001A": { description: "Fracture of navicular bone of right wrist, initial encounter", category: "Injury" },

  // Renal
  "N18.3": { description: "Chronic kidney disease, stage 3", category: "Renal" },
  "N18.4": { description: "Chronic kidney disease, stage 4", category: "Renal" },

  // Neoplasm
  "C34.90": { description: "Malignant neoplasm of unspecified part of bronchus or lung", category: "Neoplasm" },
  "C50.919": { description: "Malignant neoplasm of unspecified site of unspecified female breast", category: "Neoplasm" },

  // Other
  "R50.9": { description: "Fever, unspecified", category: "Other" },
  "Z23": { description: "Encounter for immunization", category: "Preventive" },
  "Z00.00": { description: "Encounter for general adult medical exam without abnormal findings", category: "Preventive" },
};

// ── Billing Rules ───────────────────────────────────────────────────────────
const BILLING_RULES = [
  {
    id: "BILL-001",
    name: "Unspecified code when specific exists",
    severity: "WARNING",
    check: (codes) => {
      const unspecifiedMap = {
        "E11.9": ["E11.65", "E11.21", "E11.22"],
        "I50.9": ["I50.1", "I50.20", "I50.30", "I50.40"],
        "J18.9": ["J13", "J14", "J15.0", "J15.1"],
      };
      const findings = [];
      for (const code of codes) {
        if (unspecifiedMap[code]) {
          findings.push({
            code,
            rule: "BILL-001",
            message: `"${code}" is an unspecified code. Consider using a more specific code (e.g. ${unspecifiedMap[code].join(", ")}) to reduce claim denials.`,
            severity: "WARNING",
          });
        }
      }
      return findings;
    },
  },
  {
    id: "BILL-002",
    name: "Duplicate diagnostic category",
    severity: "INFO",
    check: (codes) => {
      const seen = {};
      const findings = [];
      for (const code of codes) {
        const meta = VALID_ICD10_CODES[code];
        if (!meta) continue;
        if (seen[meta.category]) {
          findings.push({
            code,
            rule: "BILL-002",
            message: `Multiple codes in "${meta.category}" category (${seen[meta.category]} and ${code}). Verify medical necessity for each to avoid bundling edits.`,
            severity: "INFO",
          });
        }
        seen[meta.category] = code;
      }
      return findings;
    },
  },
  {
    id: "BILL-003",
    name: "Preventive visit with acute diagnosis",
    severity: "WARNING",
    check: (codes) => {
      const hasPreventive = codes.some(
        (c) => VALID_ICD10_CODES[c]?.category === "Preventive"
      );
      const hasAcute = codes.some((c) => {
        const cat = VALID_ICD10_CODES[c]?.category;
        return cat && !["Preventive", "Other"].includes(cat);
      });
      if (hasPreventive && hasAcute) {
        return [
          {
            code: codes.find((c) => VALID_ICD10_CODES[c]?.category === "Preventive"),
            rule: "BILL-003",
            message:
              "Mixing preventive visit code with acute/chronic diagnosis codes. Bill preventive and problem-oriented services on separate claims with modifier -25 on E/M.",
            severity: "WARNING",
          },
        ];
      }
      return [];
    },
  },
  {
    id: "BILL-004",
    name: "Primary neoplasm documentation",
    severity: "ERROR",
    check: (codes) => {
      const neoplasmCodes = codes.filter(
        (c) => VALID_ICD10_CODES[c]?.category === "Neoplasm"
      );
      if (neoplasmCodes.length > 0 && codes.length === 1) {
        return [
          {
            code: neoplasmCodes[0],
            rule: "BILL-004",
            message:
              "Neoplasm code submitted as sole diagnosis. Payers often require laterality, histology, and staging codes. Add secondary codes for completeness.",
            severity: "ERROR",
          },
        ];
      }
      return [];
    },
  },
  {
    id: "BILL-005",
    name: "CKD staging with hypertension",
    severity: "WARNING",
    check: (codes) => {
      const hasCKD = codes.some((c) => c.startsWith("N18"));
      const hasHTN = codes.some((c) => c === "I10");
      if (hasCKD && hasHTN) {
        return [
          {
            code: "I10",
            rule: "BILL-005",
            message:
              'When CKD and hypertension coexist, CMS presumes a causal relationship. Use I12.9 ("Hypertensive CKD") instead of I10 per ICD-10 guidelines.',
            severity: "WARNING",
          },
        ];
      }
      return [];
    },
  },
];

module.exports = { VALID_ICD10_CODES, BILLING_RULES };
