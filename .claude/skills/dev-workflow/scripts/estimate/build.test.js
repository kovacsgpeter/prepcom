#!/usr/bin/env node
/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * Teszt az estimate/build.js modulhoz (minimális store-ok, szerkezeti ellenőrzéssel).
 *
 * Használat: node build.test.js
 * Kilépési kódok: 0 minden teszt átment; 1 legalább egy sikertelen.
 */

'use strict';

const assert = require('assert');
const { buildEstimate } = require('./build');

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
const rates = { m: { input: 1, output: 1, cacheWrite: 1, cacheRead: 1 } };
const CONFIG = { minSamples: 3, excludeAnomalies: true, calibrate: true };

function mk(project, story, steps, cost, wall, extra) {
  return Object.assign(
    {
      project,
      story,
      kind: 'story',
      features: { complexity: 'M', plan_steps: steps, subtasks: [{ executor: 'local' }, { executor: 'claude' }] },
      fingerprint: FP,
      actual: {
        cost_usd: cost,
        wall_clock_s: wall,
        tokens: { m: { input: 1000, cache_write: 0, cache_read: 0, output: 0 } },
        rounds: { fix: 1 },
      },
      anomalies: [],
    },
    extra || {}
  );
}

function input(rows, features) {
  return {
    rows,
    target: { project: 'ORD', story: 'ORD-99', features: features || { complexity: 'M', plan_steps: 20 }, fingerprint: FP },
    config: CONFIG,
    rates,
  };
}

test('history: saját projekt, skálázás a lépésszám arányában', () => {
  const rows = [mk('ORD', 'ORD-1', 10, 1, 100), mk('ORD', 'ORD-2', 10, 2, 200), mk('ORD', 'ORD-3', 10, 3, 300)];
  const est = buildEstimate(input(rows));
  assert.strictEqual(est.schema, 'estimate/v1');
  assert.strictEqual(est.basis, 'history');
  assert.strictEqual(est.confidence, 'normal');
  assert.strictEqual(est.sample.scope, 'project');
  assert.strictEqual(est.sample.sample_id, 'ORD:n3');
  assert.strictEqual(est.sample.k, 3);
  assert.strictEqual(est.p50.cost_usd, 4);
  assert.deepStrictEqual(est.raw.p50, est.p50);
  assert.deepStrictEqual(est.calibration, { applied: false, n: 0, factors: null });
  assert.deepStrictEqual(est.rounds_fix, { min: 1, max: 1 });
  assert.deepStrictEqual(Object.keys(est), [
    'schema', 'story', 'basis', 'confidence', 'sample', 'target', 'p50', 'p80', 'raw', 'calibration',
    'hit_rate', 'risks', 'rounds_fix',
  ]);
});

test('fallback-all: kevés saját projekt, minden projekt', () => {
  const rows = [mk('ORD', 'ORD-1', 10, 1, 100)];
  for (let i = 0; i < 4; i++) rows.push(mk('XYZ', 'XYZ-' + i, 10, 2, 200));
  const est = buildEstimate(input(rows));
  assert.strictEqual(est.sample.scope, 'all');
  assert.strictEqual(est.sample.n, 5);
  assert.strictEqual(est.sample.n_project, 1);
  assert.strictEqual(est.sample.sample_id, 'all:n5:ORD1');
  assert.strictEqual(est.sample.k, 5);
});

test('heurisztikus mód: alacsony megbízhatóság, P80 = 1,5x', () => {
  const rows = [mk('ORD', 'ORD-1', 10, 1, 100), mk('XYZ', 'XYZ-1', 10, 3, 300)];
  const est = buildEstimate(input(rows));
  assert.strictEqual(est.basis, 'heuristic');
  assert.strictEqual(est.confidence, 'low');
  assert.strictEqual(est.sample.scope, 'none');
  assert.strictEqual(est.sample.n, 2);
  assert.strictEqual(est.p50.cost_usd, 4);
  assert.strictEqual(est.p80.cost_usd, 6);
});

test('heurisztikus mód: az anomáliás sort kizárja, ha a kizárás on (és beszámítja, ha off)', () => {
  const rows = [
    mk('ORD', 'ORD-1', 10, 1, 100),
    mk('XYZ', 'XYZ-1', 10, 3, 300),
    mk('XYZ', 'XYZ-2', 10, 50, 5000, { anomalies: ['breaker_open'] }),
  ];
  const on = buildEstimate(input(rows));
  assert.strictEqual(on.basis, 'heuristic');
  assert.strictEqual(on.sample.n, 2);
  assert.strictEqual(on.sample.sample_id, 'heuristic:n2');
  assert.strictEqual(on.p50.cost_usd, 4);
  const inp = input(rows);
  inp.config = Object.assign({}, CONFIG, { excludeAnomalies: false, minSamples: 4 });
  const off = buildEstimate(inp);
  assert.strictEqual(off.sample.n, 3);
  assert.strictEqual(off.sample.sample_id, 'heuristic:n3');
  assert.strictEqual(off.p50.cost_usd, 36);
});

test('none: üres store', () => {
  const est = buildEstimate(input([]));
  assert.strictEqual(est.basis, 'none');
  assert.deepStrictEqual(est.p50, {});
  assert.strictEqual(est.confidence, 'low');
});

test('a saját sor kizárása és a lépésszám nélküli cél alacsony megbízhatósága', () => {
  const rows = [
    mk('ORD', 'ORD-99', 10, 100, 1000),
    mk('ORD', 'ORD-1', 10, 1, 100),
    mk('ORD', 'ORD-2', 10, 2, 200),
    mk('ORD', 'ORD-3', 10, 3, 300),
  ];
  const est = buildEstimate(input(rows, { complexity: 'M' }));
  assert.strictEqual(est.sample.n, 3);
  assert.strictEqual(est.confidence, 'low');
  assert.strictEqual(est.p50.cost_usd, 2);
});

test('kalibráció és kockázat', () => {
  const rows = [];
  for (let i = 1; i <= 3; i++) {
    rows.push(
      mk('ORD', 'ORD-' + i, 10, 2 * i, 100, {
        estimate: { raw: { p50: { cost_usd: i } }, p80: { cost_usd: 2 * i - 1 } },
      })
    );
  }
  rows.push(mk('ORD', 'ORD-4', 10, 2, 400, { anomalies: ['breaker_open'] }));
  const est = buildEstimate(input(rows));
  assert.strictEqual(est.calibration.applied, true);
  assert.strictEqual(est.calibration.factors.cost_usd, 2);
  assert.deepStrictEqual(est.hit_rate.cost_usd, { hit: 0, total: 3 });
  assert.strictEqual(est.risks.length, 1);
  assert.strictEqual(est.risks[0].code, 'breaker_open');
  assert.strictEqual(est.risks[0].count, 1);
  assert.strictEqual(est.risks[0].total, 4);
  // nyers P50 = (2, 4, 6 skálázva x2 -> medián 8), korrigálva x2 -> 16
  assert.strictEqual(est.raw.p50.cost_usd, 8);
  assert.strictEqual(est.p50.cost_usd, 16);
});

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
