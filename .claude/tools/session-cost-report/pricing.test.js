#!/usr/bin/env node
/**
 * ORD-376, 4.27.0: a közös ár-modul (pricing.js) tesztje.
 *
 * Ellenőrzi az árfeloldást (pontos modell, család-fallback, ismeretlen),
 * a deduplikációt, a verziósztringet, a cache-írás bontását (5p/1ó)
 * és a longContext árazást.
 *
 * Futtatás: node pricing.test.js
 */

"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const pricing = require("./pricing.js");

const PRICING_PATH = path.join(__dirname, "pricing.json");
const pricingData = pricing.loadPricing();

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ok - ${name}`);
    passed++;
  } catch (e) {
    console.error(`  NOT OK - ${name}`);
    console.error(e);
    failed++;
  }
}

// 1. Ismert modell: claude-sonnet-5-5

test("1. Ismert modell: claude-sonnet-5-5 pontos árazás", () => {
  const rec = {
    model: "claude-sonnet-5-5",
    usage: {
      input_tokens: 1000,
      output_tokens: 500,
      cache_creation_input_tokens: 200,
      cache_read_input_tokens: 100,
    },
  };
  const rate = pricingData.models["claude-sonnet-5-5"];
  const expectedCost =
    (rec.usage.input_tokens * rate.input +
      rec.usage.output_tokens * rate.output +
      rec.usage.cache_creation_input_tokens * rate.cacheWrite +
      rec.usage.cache_read_input_tokens * rate.cacheRead) /
    1e6;

  const result = pricing.costOfRecord(pricingData, rec);
  assert.ok(Math.abs(result.cost - expectedCost) < 1e-12, `cost mismatch: ${result.cost} vs ${expectedCost}`);
  assert.strictEqual(result.unknownModel, false);
});

// 2. Család-fallback: claude-opus-9-9

test("2. Család-fallback: claude-opus-9-9 -> families.opus", () => {
  const rec = {
    model: "claude-opus-9-9",
    usage: {
      input_tokens: 1000,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
  const rate = pricingData.families.opus;
  const expectedCost = (rec.usage.input_tokens * rate.input) / 1e6;

  const result = pricing.costOfRecord(pricingData, rec);
  assert.ok(Math.abs(result.cost - expectedCost) < 1e-12, `cost mismatch: ${result.cost} vs ${expectedCost}`);
  assert.strictEqual(result.unknownModel, false);

  const resolved = pricing.resolveRate(pricingData, "claude-opus-9-9");
  assert.strictEqual(resolved.via, "family");
});

// 3. Ismeretlen család: gpt-x

test("3. Ismeretlen család: gpt-x -> unknownModelFallback", () => {
  const rec = {
    model: "gpt-x",
    usage: {
      input_tokens: 1000,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
  const rate = pricingData.unknownModelFallback;
  const expectedCost = (rec.usage.input_tokens * rate.input) / 1e6;

  const result = pricing.costOfRecord(pricingData, rec);
  assert.ok(Math.abs(result.cost - expectedCost) < 1e-12, `cost mismatch: ${result.cost} vs ${expectedCost}`);
  assert.strictEqual(result.unknownModel, true);
});

// 4. Dedup

test("4. Dedup: dedupeKeyOf és dedupeRecords", () => {
  // dedupeKeyOf
  const rec1 = { message: { id: "m1" }, requestId: "r1" };
  assert.strictEqual(pricing.dedupeKeyOf(rec1), "m1|r1");

  const rec2 = { message: { id: "m2" }, requestId: "r2" };
  assert.strictEqual(pricing.dedupeKeyOf(rec2), "m2|r2");

  const rec3 = { message: {}, requestId: "r3" };
  assert.strictEqual(pricing.dedupeKeyOf(rec3), null);

  const rec4 = { requestId: "r4" };
  assert.strictEqual(pricing.dedupeKeyOf(rec4), null);

  // dedupeRecords
  const records = [
    { dedupeKey: "k1", usage: { output_tokens: 10 } },
    { dedupeKey: "k1", usage: { output_tokens: 20 } },
    { dedupeKey: "k2", usage: { output_tokens: 5 } },
    { dedupeKey: null, usage: { output_tokens: 100 } },
  ];

  const result = pricing.dedupeRecords(records);
  assert.strictEqual(result.duplicatesDropped, 1);
  assert.strictEqual(result.records.length, 3);
  // k1 esetén a nagyobb output_tokens (20) marad
  const k1Rec = result.records.find((r) => r.dedupeKey === "k1");
  assert.strictEqual(k1Rec.usage.output_tokens, 20);
  // k2 megmarad
  const k2Rec = result.records.find((r) => r.dedupeKey === "k2");
  assert.strictEqual(k2Rec.usage.output_tokens, 5);
  // null kulcsú megmarad
  const nullRec = result.records.find((r) => r.dedupeKey === null);
  assert.strictEqual(nullRec.usage.output_tokens, 100);
});

// 5. priceTableVersion

test("5. priceTableVersion: konzisztens és mintának megfelelő", () => {
  const v1 = pricing.priceTableVersion(pricingData);
  const v2 = pricing.priceTableVersion(pricingData);
  assert.strictEqual(v1, v2);

  const pattern = /^[A-Za-z0-9_.:/+-]{0,64}$/;
  assert.ok(pattern.test(v1), `version string does not match pattern: ${v1}`);

  assert.ok(v1.startsWith(String(pricingData.verifiedDate)), `version does not start with verifiedDate: ${v1}`);
});

// 6. 1 órás cache-írás

test("6. 1 órás cache-írás: cacheWrite1h áron számolódik", () => {
  const a = 1000;
  const b = 2000;
  const rec = {
    model: "claude-sonnet-5-5",
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: a + b,
      cache_read_input_tokens: 0,
      cache_creation: {
        ephemeral_5m_input_tokens: a,
        ephemeral_1h_input_tokens: b,
      },
    },
  };
  const rate = pricingData.models["claude-sonnet-5-5"];
  const expectedCost = (a * rate.cacheWrite + b * rate.cacheWrite1h) / 1e6;

  const result = pricing.costOfRecord(pricingData, rec);
  assert.ok(Math.abs(result.cost - expectedCost) < 1e-12, `cost mismatch: ${result.cost} vs ${expectedCost}`);
});

// 7. Haiku 5.5 longContext

test("7. Haiku 5.5 longContext: 100k fölött longContext ár, alatt normál", () => {
  const rate = pricingData.models["claude-haiku-5-5"];

  // 100k fölött
  const recHigh = {
    model: "claude-haiku-5-5",
    usage: {
      input_tokens: 100001,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
  const expectedHigh = (100001 * rate.longContext.input) / 1e6;
  const resultHigh = pricing.costOfRecord(pricingData, recHigh);
  assert.ok(Math.abs(resultHigh.cost - expectedHigh) < 1e-12, `high cost mismatch: ${resultHigh.cost} vs ${expectedHigh}`);
  assert.strictEqual(resultHigh.longContext, true);

  // 100k alatt
  const recLow = {
    model: "claude-haiku-5-5",
    usage: {
      input_tokens: 99999,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
  const expectedLow = (99999 * rate.input) / 1e6;
  const resultLow = pricing.costOfRecord(pricingData, recLow);
  assert.ok(Math.abs(resultLow.cost - expectedLow) < 1e-12, `low cost mismatch: ${resultLow.cost} vs ${expectedLow}`);
  assert.strictEqual(resultLow.longContext, false);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
