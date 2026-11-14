#!/usr/bin/env node
/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * Teszt a stats.js modulhoz.
 *
 * Használat:
 *   node stats.test.js
 *
 * Kilépési kódok:
 *   0: minden teszt átment
 *   1: legalább egy teszt sikertelen
 */

'use strict';

const assert = require('assert');

const {
  percentile,
  median,
  mean,
  sum,
  roundTo,
} = require('./stats');

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

test('[1,2,3,4,5] p50 = 3', () => {
  assert.strictEqual(percentile([1, 2, 3, 4, 5], 50), 3);
});

test('[1,2,3,4,5] p80 = 4.2', () => {
  const result = percentile([1, 2, 3, 4, 5], 80);
  assert.ok(Math.abs(result - 4.2) < 1e-9);
});

test('[10] p80 = 10', () => {
  assert.strictEqual(percentile([10], 80), 10);
});

test('[1,2] p50 = 1.5', () => {
  assert.strictEqual(percentile([1, 2], 50), 1.5);
});

test('üres tömb → null (percentile)', () => {
  assert.strictEqual(percentile([], 50), null);
});

test('üres tömb → null (median)', () => {
  assert.strictEqual(median([]), null);
});

test('üres tömb → null (mean)', () => {
  assert.strictEqual(mean([]), null);
});

test('rendezetlen bemenet [5,1,3] median = 3', () => {
  assert.strictEqual(median([5, 1, 3]), 3);
});

test('bemeneti tömb változatlan marad', () => {
  const input = [5, 1, 3];
  const original = [...input];
  median(input);
  assert.deepStrictEqual(input, original);
});

test('sum([]) = 0', () => {
  assert.strictEqual(sum([]), 0);
});

test('sum([1,2,3]) = 6', () => {
  assert.strictEqual(sum([1, 2, 3]), 6);
});

test('mean([1,2,3]) = 2', () => {
  assert.strictEqual(mean([1, 2, 3]), 2);
});

test('roundTo(2.5, 0) = 3', () => {
  assert.strictEqual(roundTo(2.5, 0), 3);
});

test('roundTo(1.23456, 2) = 1.23', () => {
  assert.strictEqual(roundTo(1.23456, 2), 1.23);
});

test('roundTo(0.00005, 4) = 0.0001', () => {
  assert.strictEqual(roundTo(0.00005, 4), 0.0001);
});

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
