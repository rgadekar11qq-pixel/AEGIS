/**
 * AEGIS — RxNorm Drug Interaction API Integration
 *
 * Uses the FREE NLM RxNorm REST API (no API key needed) to:
 *   1. Normalize drug names → RxCUI identifiers
 *   2. Check drug-drug interactions via the NLM Interaction API
 *
 * This supplements our local drugInteractions.js database with 100,000+
 * interaction pairs from the National Library of Medicine.
 *
 * Docs: https://lhncbc.nlm.nih.gov/RxNav/APIs/api-Interaction.findDrugInteractions.html
 */

const BASE_URL = "https://rxnav.nlm.nih.gov/REST";

// ── In-memory cache to avoid NLM rate limits ────────────────
const _rxcuiCache = new Map();   // drugName → { rxcui, ts }
const _interactionCache = new Map();  // "rxcui1+rxcui2" → { data, ts }
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function cacheGet(cache, key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return undefined; }
  return entry.data;
}

/**
 * Look up a drug by name and get its RxCUI.
 * @param {string} drugName
 * @returns {Promise<string|null>} — RxCUI or null
 */
async function getRxCUI(drugName) {
  const key = drugName.toLowerCase().trim();
  const cached = cacheGet(_rxcuiCache, key);
  if (cached !== undefined) return cached;
  try {
    const url = `${BASE_URL}/rxcui.json?name=${encodeURIComponent(drugName)}&search=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    const rxcui = data?.idGroup?.rxnormId?.[0] || null;
    _rxcuiCache.set(key, { data: rxcui, ts: Date.now() });
    return rxcui;
  } catch (e) {
    console.warn(`[RxNorm] Failed to resolve "${drugName}": ${e.message}`);
    return null;
  }
}

/**
 * Check interactions between a list of RxCUIs.
 * @param {string[]} rxcuis — Array of RxCUI identifiers
 * @returns {Promise<object[]>} — Array of interaction objects
 */
async function checkInteractions(rxcuis) {
  if (rxcuis.length < 2) return [];

  try {
    const url = `${BASE_URL}/interaction/list.json?rxcuis=${rxcuis.join("+")}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json();

    const interactions = [];
    const pairs = data?.fullInteractionTypeGroup || [];

    for (const group of pairs) {
      for (const type of (group.fullInteractionType || [])) {
        for (const pair of (type.interactionPair || [])) {
          interactions.push({
            severity: pair.severity || "N/A",
            description: pair.description || "",
            drugs: (type.interactionConcept || []).map(c =>
              c.minConceptItem?.name || "Unknown"
            ),
            source: group.sourceName || "NLM",
          });
        }
      }
    }

    return interactions;
  } catch (e) {
    console.warn(`[RxNorm] Interaction check failed: ${e.message}`);
    return [];
  }
}

/**
 * Full pipeline: resolve drug names → check interactions.
 * Falls back gracefully on network errors (returns empty array).
 *
 * @param {string[]} drugNames — Array of drug name strings
 * @returns {Promise<{ rxcuis: object[], interactions: object[] }>}
 */
async function rxnormInteractionCheck(drugNames) {
  if (!drugNames || drugNames.length < 2) {
    return { rxcuis: [], interactions: [] };
  }

  // Resolve drug names to RxCUIs in parallel
  const resolved = await Promise.all(
    drugNames.map(async name => ({
      name,
      rxcui: await getRxCUI(name),
    }))
  );

  const validRxcuis = resolved.filter(r => r.rxcui);
  if (validRxcuis.length < 2) {
    return { rxcuis: resolved, interactions: [] };
  }

  // Check interactions between all resolved drugs
  const interactions = await checkInteractions(validRxcuis.map(r => r.rxcui));

  return {
    rxcuis: resolved,
    interactions: interactions.map(i => ({
      type: "RXNORM_INTERACTION",
      severity: i.severity === "high" ? "HIGH" : i.severity === "low" ? "LOW" : "MODERATE",
      drugs: i.drugs,
      message: i.description,
      source: `NLM RxNorm (${i.source})`,
    })),
  };
}

module.exports = { getRxCUI, checkInteractions, rxnormInteractionCheck };
