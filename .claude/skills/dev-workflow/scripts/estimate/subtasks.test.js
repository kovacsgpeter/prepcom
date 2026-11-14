#!/usr/bin/env node
/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * Teszt az estimate/subtasks.js modulhoz.
 *
 * Használat: node subtasks.test.js
 * Kilépési kódok: 0 minden teszt átment; 1 legalább egy sikertelen.
 */

'use strict';

const assert = require('assert');
const { splitBySubtasks } = require('./subtasks');

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

const est = {
  p50: { cost_usd: 2.1, tokens: 2100, wall_s: 2100, active_s: 1050, local_s: 210 },
  p80: { cost_usd: 4.2, tokens: 4200, wall_s: 4200, active_s: 2100, local_s: 420 },
};

test('súlyok 4/9/8 AC-vel: a részek összege az egész (kerekítésen belül)', () => {
  const parts = splitBySubtasks(est, [
    { id: 'A', executor: 'local', ac_count: 4 },
    { id: 'B', executor: 'claude', ac_count: 9 },
    { id: 'C', executor: 'local', ac_count: 8 },
  ]);
  assert.strictEqual(parts.length, 3);
  assert.ok(Math.abs(parts[0].share - 4 / 21) < 1e-12);
  const tokens = parts.reduce((a, p) => a + p.p50.tokens, 0);
  assert.ok(Math.abs(tokens - 2100) <= 2);
  const cost = parts.reduce((a, p) => a + p.p50.cost_usd, 0);
  assert.ok(Math.abs(cost - 2.1) < 0.001);
});

test('a local_s csak a helyi sub-taskoknál, a súlyok arányában', () => {
  const parts = splitBySubtasks(est, [
    { id: 'A', executor: 'local', ac_count: 4 },
    { id: 'B', executor: 'claude', ac_count: 9 },
    { id: 'C', executor: 'local', ac_count: 8 },
  ]);
  assert.strictEqual(parts[0].p50.local_s, 70);
  assert.strictEqual(parts[2].p50.local_s, 140);
  assert.ok(!('local_s' in parts[1].p50));
});

test('hiányzó ac_count -> egyenlő felosztás', () => {
  const parts = splitBySubtasks(est, [{ id: 'A' }, { id: 'B', ac_count: 5 }, { id: 'C' }]);
  assert.ok(Math.abs(parts[0].share - 1 / 3) < 1e-12);
  assert.strictEqual(parts[0].p50.tokens, 700);
});

test('egy vagy nulla sub-task -> üres tömb', () => {
  assert.deepStrictEqual(splitBySubtasks(est, [{ id: 'A' }]), []);
  assert.deepStrictEqual(splitBySubtasks(est, []), []);
});

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
