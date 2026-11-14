#!/usr/bin/env node
/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * Teszt az estimate/format-units.js modulhoz.
 *
 * Használat: node format-units.test.js
 * Kilépési kódok: 0 minden teszt átment; 1 legalább egy sikertelen.
 */

'use strict';

const assert = require('assert');
const { formatCost, formatTokens, formatDuration } = require('./format-units');

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

test('formatCost', () => {
  assert.strictEqual(formatCost(3.1), '3.10');
  assert.strictEqual(formatCost(0), '0.00');
  assert.strictEqual(formatCost(12.345), '12.35');
});

test('formatTokens', () => {
  assert.strictEqual(formatTokens(1900000), '1.9M');
  assert.strictEqual(formatTokens(820000), '820k');
  assert.strictEqual(formatTokens(999), '999');
  assert.strictEqual(formatTokens(1000), '1k');
  assert.strictEqual(formatTokens(999999), '1.0M');
  assert.strictEqual(formatTokens(1000000), '1.0M');
});

test('formatDuration', () => {
  assert.strictEqual(formatDuration(59), '<1 p');
  assert.strictEqual(formatDuration(60), '1 p');
  assert.strictEqual(formatDuration(2700), '45 p');
  assert.strictEqual(formatDuration(3599), '1 ó 0 p');
  assert.strictEqual(formatDuration(5100), '1 ó 25 p');
  assert.strictEqual(formatDuration(7200), '2 ó 0 p');
});

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
