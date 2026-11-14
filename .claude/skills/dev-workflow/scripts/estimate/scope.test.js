#!/usr/bin/env node
/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * scope.js tesztek.
 *
 * Használat:
 *   node scope.test.js
 *
 * Kilépési kódok:
 *   0 - siker
 *   1 - hiba
 */

'use strict';

const assert = require('assert');
const scope = require('./scope');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`FAILED: ${name}`);
    console.error(e.message);
  }
}

// Segéd függvény sorok létrehozásához
function mk(project, story, fp, anomalies) {
  return {
    project: project,
    story: story,
    kind: 'story',
    features: { plan_steps: 10 },
    fingerprint: fp,
    actual: {},
    anomalies: anomalies || []
  };
}

// Cél ujjlenyomat
const FP = {
  local_model: 'm',
  epic_story_host: 'h',
  local_executor_host: 'x',
  ci_runner: 'r'
};

// Laza ujjlenyomat (ci_runner eltér)
const LOOSE_FP = {
  local_model: 'm',
  epic_story_host: 'h',
  local_executor_host: 'x',
  ci_runner: 'r2'
};

// Teszt 1: saját projekt szigorú - elegendő minta
test('saját projekt szigorú: 4 ORD-sor FP-vel', () => {
  const rows = [
    mk('ORD', 'ORD-1', FP, []),
    mk('ORD', 'ORD-2', FP, []),
    mk('ORD', 'ORD-3', FP, []),
    mk('ORD', 'ORD-4', FP, []),
    mk('ORD', 'ORD-99', FP, []) // saját sor, kiesik
  ];

  const target = {
    project: 'ORD',
    story: 'ORD-99',
    fingerprint: FP
  };

  const opts = {
    minSamples: 3,
    excludeAnomalies: true
  };

  const result = scope.selectPool(rows, target, opts);

  assert.strictEqual(result.mode, 'history');
  assert.strictEqual(result.scope, 'project');
  assert.strictEqual(result.level, 'strict');
  assert.strictEqual(result.n, 4);
  assert.strictEqual(result.sampleId, 'ORD:n4');
  assert.strictEqual(result.label, 'ORD n=4');
});

// Teszt 2: saját projekt elégtelen, all szigorú elegendő
test('saját projekt elégtelen + 8 más projektbeli sor FP-vel', () => {
  const rows = [
    mk('ORD', 'ORD-1', FP, []), // 1 ORD-sor
    mk('ORD', 'ORD-99', FP, []), // saját sor
    mk('PROJ2', 'P2-1', FP, []),
    mk('PROJ2', 'P2-2', FP, []),
    mk('PROJ2', 'P2-3', FP, []),
    mk('PROJ3', 'P3-1', FP, []),
    mk('PROJ3', 'P3-2', FP, []),
    mk('PROJ3', 'P3-3', FP, []),
    mk('PROJ4', 'P4-1', FP, []),
    mk('PROJ4', 'P4-2', FP, [])
  ];

  const target = {
    project: 'ORD',
    story: 'ORD-99',
    fingerprint: FP
  };

  const opts = {
    minSamples: 3,
    excludeAnomalies: true
  };

  const result = scope.selectPool(rows, target, opts);

  assert.strictEqual(result.mode, 'history');
  assert.strictEqual(result.scope, 'all');
  assert.strictEqual(result.level, 'strict');
  assert.strictEqual(result.n, 9);
  assert.strictEqual(result.nProject, 1);
  assert.strictEqual(result.sampleId, 'all:n9:ORD1');
  assert.strictEqual(result.label, 'minden projekt n=9 (ORD n=1)');
});

// Teszt 3: szigorú elégtelen, laza elegendő
test('szigorú elégtelen → laza: 4 ORD-sor LOOSE_FP-vel', () => {
  const rows = [
    mk('ORD', 'ORD-1', LOOSE_FP, []),
    mk('ORD', 'ORD-2', LOOSE_FP, []),
    mk('ORD', 'ORD-3', LOOSE_FP, []),
    mk('ORD', 'ORD-4', LOOSE_FP, []),
    mk('ORD', 'ORD-99', FP, []) // saját sor
  ];

  const target = {
    project: 'ORD',
    story: 'ORD-99',
    fingerprint: FP
  };

  const opts = {
    minSamples: 3,
    excludeAnomalies: true
  };

  const result = scope.selectPool(rows, target, opts);

  assert.strictEqual(result.mode, 'history');
  assert.strictEqual(result.scope, 'project');
  assert.strictEqual(result.level, 'loose');
  assert.strictEqual(result.n, 4);
});

// Teszt 4: minden elégtelen → heurisztikus
test('minden elégtelen (2 sor összesen) → heurisztikus', () => {
  const rows = [
    mk('ORD', 'ORD-1', FP, []),
    mk('ORD', 'ORD-2', FP, []),
    mk('ORD', 'ORD-99', FP, []) // saját sor
  ];

  const target = {
    project: 'ORD',
    story: 'ORD-99',
    fingerprint: FP
  };

  const opts = {
    minSamples: 3,
    excludeAnomalies: true
  };

  const result = scope.selectPool(rows, target, opts);

  assert.strictEqual(result.mode, 'heuristic');
  assert.strictEqual(result.scope, 'none');
  assert.strictEqual(result.level, 'none');
  assert.strictEqual(result.pool.length, 0);
  assert.strictEqual(result.n, 2);
  assert.strictEqual(result.label, 'heurisztika n=2');
});

// Teszt 5: anomália-kizárás
test('anomália-kizárás: 4 ORD-sor, ebből 1 anomália', () => {
  const rows = [
    mk('ORD', 'ORD-1', FP, []),
    mk('ORD', 'ORD-2', FP, []),
    mk('ORD', 'ORD-3', FP, []),
    mk('ORD', 'ORD-4', FP, ['breaker_open']), // anomália
    mk('ORD', 'ORD-99', FP, []) // saját sor
  ];

  const target = {
    project: 'ORD',
    story: 'ORD-99',
    fingerprint: FP
  };

  // excludeAnomalies: true
  let opts = {
    minSamples: 3,
    excludeAnomalies: true
  };

  let result = scope.selectPool(rows, target, opts);
  assert.strictEqual(result.n, 3);
  assert.strictEqual(result.poolAll.length, 4);

  // excludeAnomalies: false
  opts = {
    minSamples: 3,
    excludeAnomalies: false
  };

  result = scope.selectPool(rows, target, opts);
  assert.strictEqual(result.n, 4);
});

// Teszt 6: saját sor kiesik
test('a saját sor kiesik a mintából', () => {
  const rows = [
    mk('ORD', 'ORD-1', FP, []),
    mk('ORD', 'ORD-2', FP, []),
    mk('ORD', 'ORD-3', FP, []),
    mk('ORD', 'ORD-99', FP, []) // saját sor
  ];

  const target = {
    project: 'ORD',
    story: 'ORD-99',
    fingerprint: FP
  };

  const opts = {
    minSamples: 3,
    excludeAnomalies: true
  };

  const result = scope.selectPool(rows, target, opts);

  // Ellenőrizzük, hogy a saját sor nincs-e a pool-ban
  const hasSelf = result.pool.some((row) => row.story === 'ORD-99');
  assert.strictEqual(hasSelf, false);
});

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
