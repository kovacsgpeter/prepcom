#!/usr/bin/env node
/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * Teszt az estimate/heuristic.js modulhoz.
 *
 * Használat: node heuristic.test.js
 * Kilépési kódok: 0 minden teszt átment; 1 legalább egy sikertelen.
 */

'use strict';

const assert = require('assert');
const { HEURISTIC_P80_FACTOR, heuristicEstimate } = require('./heuristic');

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

function mk(steps, cost, wall) {
  return {
    features: { plan_steps: steps },
    actual: { cost_usd: cost, wall_clock_s: wall, tokens: {} },
  };
}

test('2 sor: lépésenkénti átlag x lépésszám', () => {
  // összes költség 3 / összes lépés 15 = 0,2 / lépés; cél 10 lépés -> 2
  const r = heuristicEstimate([mk(5, 1, 500), mk(10, 2, 1000)], 10, rates);
  assert.strictEqual(r.n, 2);
  assert.strictEqual(r.p50.cost_usd, 2);
  assert.strictEqual(r.p80.cost_usd, 3);
  // falióra: 1500 / 15 = 100 / lépés -> 1000, P80 1500
  assert.strictEqual(r.p50.wall_s, 1000);
  assert.strictEqual(r.p80.wall_s, 1500);
});

test('a P80 szorzó konstans', () => {
  assert.strictEqual(HEURISTIC_P80_FACTOR, 1.5);
});

test('üres sorok vagy nincs cél-lépésszám -> null', () => {
  assert.strictEqual(heuristicEstimate([], 10, rates), null);
  assert.strictEqual(heuristicEstimate([mk(5, 1, 500)], 0, rates), null);
  assert.strictEqual(heuristicEstimate([mk(5, 1, 500)], undefined, rates), null);
});

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
