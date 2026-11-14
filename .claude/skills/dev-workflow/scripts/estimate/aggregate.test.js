#!/usr/bin/env node
/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * Teszt az estimate/aggregate.js modulhoz.
 *
 * Használat: node aggregate.test.js
 * Kilépési kódok: 0 minden teszt átment; 1 legalább egy sikertelen.
 */

'use strict';

const assert = require('assert');
const { scaleFactor, aggregateSamples } = require('./aggregate');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`Sikertelen: ${name}`);
    console.error(e.message);
  }
}

const rates = { m: { input: 1, output: 1, cacheWrite: 1, cacheRead: 1 } };

function mk(steps, cost, wall, local) {
  return {
    features: { plan_steps: steps },
    actual: {
      cost_usd: cost,
      wall_clock_s: wall,
      tokens: { m: { input: 1000, cache_write: 0, cache_read: 0, output: 0 } },
      local: { model_s: local === undefined ? null : local },
    },
  };
}

test('scaleFactor', () => {
  assert.strictEqual(scaleFactor(10, 20), 2);
  assert.strictEqual(scaleFactor(0, 20), 1);
  assert.strictEqual(scaleFactor(10, 0), 1);
});

test('3 minta, célszám = 2x minta-lépés: duplázott értékek', () => {
  const samples = [mk(10, 1, 100), mk(10, 2, 200), mk(10, 3, 300)];
  const r = aggregateSamples(samples, 20, rates);
  assert.strictEqual(r.scaled, true);
  assert.strictEqual(r.p50.cost_usd, 4);
  assert.strictEqual(r.p80.cost_usd, 5.2);
  assert.strictEqual(r.p50.wall_s, 400);
  assert.strictEqual(r.p80.wall_s, 520);
  assert.strictEqual(r.p50.tokens, 2000);
  assert.strictEqual(r.p50['model_tokens:m'], 2000);
});

test('lépésszám nélkül scaled=false és nincs skálázás', () => {
  const r = aggregateSamples([mk(10, 1, 100), mk(10, 3, 300)], undefined, rates);
  assert.strictEqual(r.scaled, false);
  assert.strictEqual(r.p50.cost_usd, 2);
});

test('hiányzó local_s mintát kihagyja, a model_* hiány 0', () => {
  const a = mk(10, 1, 100, 40);
  const b = mk(10, 1, 100);
  const r = aggregateSamples([a, b], 10, rates);
  assert.strictEqual(r.p50.local_s, 40);
  const c = mk(10, 1, 100);
  c.actual.tokens = { other: { input: 1000, cache_write: 0, cache_read: 0, output: 0 } };
  const r2 = aggregateSamples([a, c], 10, rates);
  assert.strictEqual(r2.p50['model_tokens:m'], 500);
});

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
