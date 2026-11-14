#!/usr/bin/env node
/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * Teszt az estimate/risk.js modulhoz.
 *
 * Használat: node risk.test.js
 * Kilépési kódok: 0 minden teszt átment; 1 legalább egy sikertelen.
 */

'use strict';

const assert = require('assert');
const { anomalyRisks, fixRoundsRange } = require('./risk');

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

function mk(wall, anomalies, fix) {
  return {
    anomalies: anomalies || [],
    actual: { wall_clock_s: wall, rounds: fix === undefined ? undefined : { fix } },
  };
}

test('6 sor, 1 breaker_open: count, total, extra', () => {
  const pool = [mk(1000), mk(1000), mk(1000), mk(1000), mk(1000), mk(3400, ['breaker_open'])];
  const risks = anomalyRisks(pool);
  assert.deepStrictEqual(risks, [
    { code: 'breaker_open', count: 1, total: 6, extra_wall_s: 2400 },
  ]);
});

test('nincs anomália -> üres tömb', () => {
  assert.deepStrictEqual(anomalyRisks([mk(1), mk(2)]), []);
});

test('nincs tiszta sor -> extra_wall_s null; a tételek kód szerint rendezettek', () => {
  const risks = anomalyRisks([mk(10, ['network_enotfound']), mk(20, ['breaker_open'])]);
  assert.deepStrictEqual(
    risks.map((r) => r.code),
    ['breaker_open', 'network_enotfound']
  );
  assert.strictEqual(risks[0].extra_wall_s, null);
});

test('az extra_wall_s legalább 0', () => {
  const risks = anomalyRisks([mk(1000), mk(500, ['breaker_open'])]);
  assert.strictEqual(risks[0].extra_wall_s, 0);
});

test('fixRoundsRange', () => {
  assert.deepStrictEqual(fixRoundsRange([mk(1, [], 0), mk(1, [], 1), mk(1)]), { min: 0, max: 1 });
  assert.deepStrictEqual(fixRoundsRange([mk(1)]), { min: 0, max: 0 });
});

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
