#!/usr/bin/env node
/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * Teszt az estimate/calibration.js modulhoz.
 *
 * Használat: node calibration.test.js
 * Kilépési kódok: 0 minden teszt átment; 1 legalább egy sikertelen.
 */

'use strict';

const assert = require('assert');
const {
  CALIBRATION_CLAMP,
  actualOf,
  calibrationFactors,
  hitRates,
  applyCalibration,
} = require('./calibration');

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

function near(a, b) {
  assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
}

// cost: raw P50, P80 (megjelenített), tényleges
function mk(rawCost, p80Cost, actualCost) {
  return {
    estimate: { raw: { p50: { cost_usd: rawCost } }, p80: { cost_usd: p80Cost } },
    actual: { cost_usd: actualCost, wall_clock_s: 100, tokens: {} },
  };
}

test('actualOf', () => {
  const row = { actual: { cost_usd: 2, wall_clock_s: 50, active_agent_s: 30, tokens: { m: { input: 5 } } } };
  assert.strictEqual(actualOf(row, 'cost_usd'), 2);
  assert.strictEqual(actualOf(row, 'wall_s'), 50);
  assert.strictEqual(actualOf(row, 'active_s'), 30);
  assert.strictEqual(actualOf(row, 'tokens'), 5);
  assert.strictEqual(actualOf({}, 'cost_usd'), null);
});

test('4 pár: a faktor az arányok mediánja', () => {
  // arányok: 1,1 / 1,2 / 1,4 / 2,0 -> medián 1,3
  const rows = [mk(10, 12, 11), mk(10, 12, 12), mk(10, 12, 14), mk(10, 12, 20)];
  const r = calibrationFactors(rows, 3);
  assert.strictEqual(r.n, 4);
  near(r.factors.cost_usd, 1.3);
});

test('2 pár minSamples=3 mellett -> null', () => {
  const r = calibrationFactors([mk(10, 12, 11), mk(10, 12, 12)], 3);
  assert.strictEqual(r.factors, null);
  assert.strictEqual(r.n, 2);
});

test('a clamp felső és alsó határa', () => {
  const hi = calibrationFactors([mk(1, 2, 10), mk(1, 2, 10), mk(1, 2, 10)], 3);
  assert.strictEqual(hi.factors.cost_usd, CALIBRATION_CLAMP[1]);
  const lo = calibrationFactors([mk(10, 20, 1), mk(10, 20, 1), mk(10, 20, 1)], 3);
  assert.strictEqual(lo.factors.cost_usd, CALIBRATION_CLAMP[0]);
});

test('találati arány 3/4', () => {
  const rows = [mk(10, 12, 11), mk(10, 12, 12), mk(10, 12, 9), mk(10, 12, 20)];
  assert.deepStrictEqual(hitRates(rows), { cost_usd: { hit: 3, total: 4 } });
});

test('applyCalibration család szerint szoroz, a többit nem bántja', () => {
  const est = {
    p50: { cost_usd: 2, 'model_cost:m': 1, tokens: 1000, wall_s: 100, claude_s: 60, active_s: 50, other: 7 },
    p80: { cost_usd: 3 },
  };
  const r = applyCalibration(est, { cost_usd: 1.5, wall_s: 2 });
  assert.strictEqual(r.p50.cost_usd, 3);
  assert.strictEqual(r.p50['model_cost:m'], 1.5);
  assert.strictEqual(r.p50.tokens, 1000);
  assert.strictEqual(r.p50.wall_s, 200);
  assert.strictEqual(r.p50.claude_s, 120);
  assert.strictEqual(r.p50.active_s, 50);
  assert.strictEqual(r.p50.other, 7);
  assert.strictEqual(r.p80.cost_usd, 4.5);
});

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
