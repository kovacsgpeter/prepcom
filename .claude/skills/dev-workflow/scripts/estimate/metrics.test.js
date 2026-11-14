#!/usr/bin/env node
/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * Teszt az estimate/metrics.js modulhoz.
 *
 * Használat: node metrics.test.js
 * Kilépési kódok: 0 minden teszt átment; 1 legalább egy sikertelen.
 */

'use strict';

const assert = require('assert');
const { flattenRow, modelCostOf, totalTokens } = require('./metrics');

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

function near(a, b, msg) {
  assert.ok(Math.abs(a - b) < 1e-9, `${msg || ''} ${a} != ${b}`);
}

const rates = {
  sonnet: { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  haiku: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
};

function makeRow() {
  return {
    actual: {
      cost_usd: 3,
      wall_clock_s: 1000,
      active_agent_s: 600,
      tokens: {
        sonnet: { input: 1000000, cache_write: 0, cache_read: 1000000, output: 100000 },
        haiku: { input: 2000000, cache_write: 0, cache_read: 0, output: 0 },
      },
      by_phase: {
        plan: { tokens: 500, cost_usd: 0.5, wall_s: 10 },
        impl: { tokens: 1500, cost_usd: 2.5, wall_s: null },
      },
      local: { model_s: 200 },
      ci: { run_s: 100, queue_s: 50 },
    },
  };
}

test('kézzel számolt sor (két modell, két fázis)', () => {
  const flat = flattenRow(makeRow(), rates);
  near(flat['model_cost:sonnet'], 3.2, 'sonnet');
  near(flat['model_cost:haiku'], 2, 'haiku');
  assert.strictEqual(flat['model_tokens:sonnet'], 2100000);
  assert.strictEqual(flat['model_tokens:haiku'], 2000000);
  assert.strictEqual(flat.tokens, 4100000);
  assert.strictEqual(flat.cost_usd, 3);
  assert.strictEqual(flat.local_s, 200);
  assert.strictEqual(flat.ci_s, 150);
  assert.strictEqual(flat.claude_s, 650);
  assert.strictEqual(flat.wall_s, 1000);
  assert.strictEqual(flat.active_s, 600);
  assert.strictEqual(flat['phase_tokens:plan'], 500);
  assert.strictEqual(flat['phase_cost:impl'], 2.5);
});

test('local_s hiányzik, ha a model_s null', () => {
  const row = makeRow();
  row.actual.local.model_s = null;
  const flat = flattenRow(row, rates);
  assert.ok(!('local_s' in flat));
  assert.strictEqual(flat.claude_s, 850);
});

test('claude_s hiányzik, ha sem a helyi, sem a CI idő nem ismert', () => {
  const row = makeRow();
  row.actual.local.model_s = null;
  row.actual.ci = null;
  const flat = flattenRow(row, rates);
  assert.ok(!('claude_s' in flat));
  assert.ok(!('ci_s' in flat));
});

test('ismeretlen modell költsége 0', () => {
  const row = makeRow();
  row.actual.tokens.mystery = { input: 5, cache_write: 0, cache_read: 0, output: 0 };
  const flat = flattenRow(row, rates);
  assert.strictEqual(flat['model_cost:mystery'], 0);
  assert.strictEqual(modelCostOf(undefined, { input: 5 }), 0);
});

test('totalTokens actual nélkül 0', () => {
  assert.strictEqual(totalTokens({}), 0);
});

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
