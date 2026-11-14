"use strict";
// ORD-376: közös ár-modul. Az analyze.js (riport) és a futási-metrika gyűjtő is innen számol
// költséget, így egyetlen helyen él az árfeloldás, a cache-írás 5 p / 1 ó bontása, a
// longContext-ár és a streaming-duplikátumok kezelése. Függőség nélküli (CommonJS).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PRICING_PATH = path.join(__dirname, "pricing.json");

function loadPricing(file) {
  return JSON.parse(fs.readFileSync(file || PRICING_PATH, "utf8"));
}

// `<verifiedDate vagy 'unverified'>+<a pricing.json szövegének SHA-256 első 8 hex karaktere>`.
// A rawText hiányában a mellékelt pricing.json fájl szövege kerül hash-elésre.
function priceTableVersion(pricing, rawText) {
  const text = typeof rawText === "string" ? rawText : fs.readFileSync(PRICING_PATH, "utf8");
  const hash = crypto.createHash("sha256").update(text).digest("hex").slice(0, 8);
  const date = pricing && pricing.verifiedDate ? String(pricing.verifiedDate) : "unverified";
  return `${date}+${hash}`;
}

// ORD-366: az árfeloldás sorrendje: pontos modell-id (`models`), majd modellcsalád
// (`families`: a modell-id-ben szereplő opus/sonnet/haiku/fable név), végül a
// `unknownModelFallback` -- ez utóbbit a riport külön jelzi (`unknownModels`).
function resolveRate(pricing, model) {
  if (pricing.models[model]) return { rate: pricing.models[model], via: "exact" };
  const lower = String(model).toLowerCase();
  const families = pricing.families || {};
  for (const name of Object.keys(families)) {
    if (name.charAt(0) !== "_" && lower.includes(name.toLowerCase())) {
      return { rate: families[name], via: "family" };
    }
  }
  return { rate: pricing.unknownModelFallback, via: "fallback" };
}

// A kérés költsége. `cacheWrite` (a visszaadott token-szám) a teljes cache-írás; az 5 p / 1 ó
// bontást a `usage.cache_creation.ephemeral_*` adja, bontás hiányában minden `cacheWrite` áron
// számol. Ha a rátának van `longContext` blokkja és a prompt (input + cache-írás + cache-olvasás)
// meghaladja a `thresholdTokens`-t, a `longContext` árai érvényesek.
function costOfRecord(pricing, rec) {
  const resolved = resolveRate(pricing, rec.model);
  let rate = resolved.rate;
  const u = rec.usage;
  const input = u.input_tokens || 0;
  const output = u.output_tokens || 0;
  const cacheWrite = u.cache_creation_input_tokens || 0;
  const cacheRead = u.cache_read_input_tokens || 0;

  let longContext = false;
  if (rate.longContext && input + cacheWrite + cacheRead > rate.longContext.thresholdTokens) {
    rate = Object.assign({}, rate, rate.longContext);
    longContext = true;
  }

  const cc = u.cache_creation;
  const hasSplit =
    cc &&
    typeof cc === "object" &&
    (cc.ephemeral_5m_input_tokens !== undefined || cc.ephemeral_1h_input_tokens !== undefined);
  const write5m = hasSplit ? cc.ephemeral_5m_input_tokens || 0 : cacheWrite;
  const write1h = hasSplit ? cc.ephemeral_1h_input_tokens || 0 : 0;
  const rate1h = rate.cacheWrite1h !== undefined ? rate.cacheWrite1h : rate.cacheWrite;

  const cost =
    (input * rate.input +
      output * rate.output +
      write5m * rate.cacheWrite +
      write1h * rate1h +
      cacheRead * rate.cacheRead) /
    1e6;
  return {
    cost,
    input,
    output,
    cacheWrite,
    cacheRead,
    unknownModel: resolved.via === "fallback",
    cacheSplitKnown: !!hasSplit || cacheWrite === 0,
    longContext,
  };
}

// ORD-366: a streamelt válasz több sorban jelenik meg ugyanazzal a message.id-vel és
// requestId-val; a dedupe-kulcs ebből képződik (hiányzó id esetén nincs kulcs, a rekord
// külön hívásnak számít).
function dedupeKeyOf(rec) {
  return rec.message && rec.message.id && rec.requestId
    ? `${rec.message.id}|${rec.requestId}`
    : null;
}

// Az azonos (message.id, requestId) kulcsú rekordok közül egy marad -- az, amelyik a legtöbb
// output tokent hordozza (a streamelt sorok közül a végső, teljes), egyenlőségnél a későbbi.
// A kulcs nélküli rekordok mind megmaradnak. A rekordoknak `dedupeKey` és `usage` mezője van.
function dedupeRecords(records) {
  const byKey = new Map();
  const out = [];
  let dropped = 0;
  for (const rec of records) {
    if (!rec.dedupeKey) {
      out.push(rec);
      continue;
    }
    const idx = byKey.get(rec.dedupeKey);
    if (idx === undefined) {
      byKey.set(rec.dedupeKey, out.length);
      out.push(rec);
      continue;
    }
    dropped++;
    if ((rec.usage.output_tokens || 0) >= (out[idx].usage.output_tokens || 0)) out[idx] = rec;
  }
  return { records: out, duplicatesDropped: dropped };
}

module.exports = {
  loadPricing,
  priceTableVersion,
  resolveRate,
  costOfRecord,
  dedupeKeyOf,
  dedupeRecords,
};
