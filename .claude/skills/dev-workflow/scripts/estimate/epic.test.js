#!/usr/bin/env node
/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * Teszt az estimate/epic.js modulhoz (kézzel számolt összeg).
 *
 * Használat: node epic.test.js
 * Kilépési kódok: 0 minden teszt átment; 1 legalább egy sikertelen.
 */

'use strict';

const assert = require('assert');
const { buildEpicEstimate } = require('./epic');

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

const FP = { local_model: 'm', epic_story_host: 'h', local_executor_host: 'x', ci_runner: 'r' };
const CONFIG = { minSamples: 3, excludeAnomalies: true, calibrate: false };

function story(project, key, epic, steps, cost) {
  return {
    project,
    story: key,
    epic,
    kind: 'story',
    features: { complexity: 'M', plan_steps: steps },
    fingerprint: FP,
    actual: { cost_usd: cost, wall_clock_s: 100, tokens: {} },
    anomalies: [],
  };
}

function overhead(project, epic, cost) {
  return {
    project,
    story: null,
    epic,
    kind: 'epic_overhead',
    features: {},
    fingerprint: FP,
    actual: { cost_usd: cost, wall_clock_s: 60, tokens: {} },
    anomalies: [],
  };
}

// Régi epic ORD-1: 2 story (ORD-11, ORD-12), overhead 4 és 8 USD -> storyra 2 és 4 USD.
// Régi epic ORD-5: 2 story, overhead 6 USD -> storyra 3 USD.
const rows = [
  story('ORD', 'ORD-11', 'ORD-1', 10, 2),
  story('ORD', 'ORD-12', 'ORD-1', 10, 2),
  story('ORD', 'ORD-51', 'ORD-5', 10, 2),
  story('ORD', 'ORD-52', 'ORD-5', 10, 2),
  overhead('ORD', 'ORD-1', 4),
  overhead('ORD', 'ORD-1', 8),
];

test('2 story + 2 overhead-sor: kézzel számolt összeg', () => {
  const r = buildEpicEstimate({
    rows,
    epic: 'ORD-9',
    project: 'ORD',
    stories: [
      { story: 'ORD-91', features: { complexity: 'M', plan_steps: 10 } },
      { story: 'ORD-92', features: { complexity: 'M', plan_steps: 20 } },
    ],
    fingerprint: FP,
    config: CONFIG,
    rates: {},
  });
  assert.strictEqual(r.stories.length, 2);
  // 4 minta, mind 2 USD / 10 lépés: ORD-91 -> 2, ORD-92 -> 4
  assert.strictEqual(r.stories[0].p50.cost_usd, 2);
  assert.strictEqual(r.stories[1].p50.cost_usd, 4);
  // overhead soronként (egy storyra): 4/2 = 2 és 8/2 = 4; P50 = 3, P80 = 3,6; x2 story
  assert.strictEqual(r.overhead.n, 2);
  assert.strictEqual(r.overhead.scope, 'project');
  assert.strictEqual(r.overhead.p50.cost_usd, 6);
  assert.strictEqual(r.overhead.p80.cost_usd, 7.2);
  assert.strictEqual(r.total.p50.cost_usd, 12);
  assert.strictEqual(r.total.p80.cost_usd, 2 + 4 + 7.2);
});

test('nincs overhead-adat -> overhead null, az összeg csak a storykból áll', () => {
  const r = buildEpicEstimate({
    rows: rows.filter((x) => x.kind === 'story'),
    epic: 'ORD-9',
    project: 'ORD',
    stories: [{ story: 'ORD-91', features: { complexity: 'M', plan_steps: 10 } }],
    fingerprint: FP,
    config: CONFIG,
    rates: {},
  });
  assert.strictEqual(r.overhead, null);
  assert.strictEqual(r.total.p50.cost_usd, 2);
});

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
