#!/usr/bin/env node
/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * Tesztek a similarity modulhoz.
 *
 * Használat:
 *   node similarity.test.js
 *
 * Kilépési kódok:
 *   0: siker
 *   1: hiba
 */

'use strict';

const assert = require('assert');
const sim = require('./similarity');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`FAIL: ${name}`);
    console.error(e.message);
  }
}

function mk(story, complexity, steps, localTasks, totalTasks) {
  const subtasks = [];
  for (let i = 0; i < totalTasks; i++) {
    subtasks.push({
      id: `task-${i}`,
      type: 'dev',
      executor: i < localTasks ? 'local' : 'claude',
      ac_count: 1,
    });
  }

  return {
    story,
    project: 'ORD',
    kind: 'story',
    features: {
      complexity,
      plan_steps: steps,
      subtasks,
    },
  };
}

test('kFor(3) = 3', () => {
  assert.strictEqual(sim.kFor(3), 3);
});

test('kFor(9) = 5', () => {
  assert.strictEqual(sim.kFor(9), 5);
});

test('kFor(5) = 5', () => {
  assert.strictEqual(sim.kFor(5), 5);
});

test('distanceOf: azonos komplexitás, távolság számítás', () => {
  const row = mk('ORD-1', 'M', 10, 5, 10);
  const target = { complexity: 'M', plan_steps: 14, local_share: 0.75 };
  const result = sim.distanceOf(row, target);

  assert.strictEqual(result.complexityMismatch, 0);
  const expectedD = Math.abs(10 - 14) / 14 + Math.abs(0.5 - 0.75);
  assert.ok(Math.abs(result.d - expectedD) < 1e-9);
});

test('distanceOf: eltérő komplexitás', () => {
  const row = mk('ORD-1', 'L', 10, 5, 10);
  const target = { complexity: 'M', plan_steps: 14, local_share: 0.75 };
  const result = sim.distanceOf(row, target);

  assert.strictEqual(result.complexityMismatch, 1);
});

test('distanceOf: üres komplexitás a célban', () => {
  const row = mk('ORD-1', 'L', 10, 5, 10);
  const target = { complexity: '', plan_steps: 14, local_share: 0.75 };
  const result = sim.distanceOf(row, target);

  assert.strictEqual(result.complexityMismatch, 0);
});

test('selectNearest: komplexitás prioritás', () => {
  const pool = [
    mk('ORD-1', 'M', 10, 5, 10),
    mk('ORD-2', 'L', 13, 5, 10),
  ];
  const target = { complexity: 'M', plan_steps: 14, local_share: 0.75 };
  const result = sim.selectNearest(pool, target, 2);

  assert.strictEqual(result[0].story, 'ORD-1');
});

test('selectNearest: szöveges sorrend dönt azonos távolságnál', () => {
  const pool = [
    mk('ORD-10', 'M', 14, 7, 10),
    mk('ORD-2', 'M', 14, 7, 10),
  ];
  const target = { complexity: 'M', plan_steps: 14, local_share: 0.75 };
  const result = sim.selectNearest(pool, target, 2);

  assert.strictEqual(result[0].story, 'ORD-10');
});

test('selectNearest: nem módosítja a bemenetet', () => {
  const pool = [
    mk('ORD-1', 'M', 10, 5, 10),
    mk('ORD-2', 'M', 12, 6, 10),
  ];
  const originalLength = pool.length;
  const target = { complexity: 'M', plan_steps: 14, local_share: 0.75 };
  sim.selectNearest(pool, target, 1);

  assert.strictEqual(pool.length, originalLength);
});

test('selectNearest: k-nál többet nem ad vissza', () => {
  const pool = [
    mk('ORD-1', 'M', 10, 5, 10),
    mk('ORD-2', 'M', 12, 6, 10),
    mk('ORD-3', 'M', 13, 7, 10),
  ];
  const target = { complexity: 'M', plan_steps: 14, local_share: 0.75 };
  const result = sim.selectNearest(pool, target, 2);

  assert.strictEqual(result.length, 2);
});

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
