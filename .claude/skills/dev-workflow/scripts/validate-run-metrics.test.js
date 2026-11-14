#!/usr/bin/env node
/**
 * dev-workflow (ORD-376, 4.27.0)
 *
 * Teszt a validate-run-metrics.js modulhoz.
 *
 * Használat:
 *   node validate-run-metrics.test.js
 *
 * Kilépési kódok:
 *   0: minden teszt átment
 *   1: legalább egy teszt sikertelen
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { validateRow, loadSchema, SUPPORTED_KEYWORDS } = require('./validate-run-metrics');

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

// Fixture betöltés
function loadFixture(filename) {
  const filePath = path.join(__dirname, '..', 'schemas', 'fixtures', filename);
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim() !== '');
  return lines.map(line => JSON.parse(line));
}

const validRows = loadFixture('valid-rows.jsonl');
const invalidRows = loadFixture('invalid-rows.jsonl');
const schema = loadSchema();

// 1. Minden valid sor hibátlan
test('Minden valid sor hibátlan', () => {
  assert.strictEqual(validRows.length, 2, 'Pontosan 2 valid sor kell legyen');
  for (const row of validRows) {
    const errors = validateRow(row, schema);
    assert.strictEqual(errors.length, 0, `Valid sor hibás: ${errors.join(', ')}`);
  }
});

// 2. Az invalid sorok mind hibásak
test('Az invalid sorok mind hibásak', () => {
  assert.strictEqual(invalidRows.length, 4, 'Pontosan 4 invalid sor kell legyen');
  const expectedFields = ['notes', 'foo', 'kind', 'fingerprint.ci_runner'];
  
  for (let i = 0; i < invalidRows.length; i++) {
    const row = invalidRows[i];
    const errors = validateRow(row, schema);
    assert.ok(errors.length > 0, `Invalid sor ${i + 1} nem adott hibát`);
    
    const expectedField = expectedFields[i];
    const hasFieldError = errors.some(err => err.includes(expectedField));
    assert.ok(hasFieldError, `Invalid sor ${i + 1} nem tartalmazza a(z) '${expectedField}' mezőnevet a hibaüzenetben`);
  }
});

// 3. Ismeretlen séma-kulcsszóra hiba
test('Ismeretlen séma-kulcsszóra hiba', () => {
  const badSchema = { type: 'object', format: 'x' };
  assert.throws(
    () => validateRow({}, badSchema),
    /ismeretlen séma-kulcsszó/
  );
});

// 4. Hiányzó kötelező mező
test('Hiányzó kötelező mező', () => {
  const rowWithoutStory = { ...validRows[0] };
  delete rowWithoutStory.story;
  const errors = validateRow(rowWithoutStory, schema);
  const hasStoryError = errors.some(err => err.includes('story'));
  assert.ok(hasStoryError, 'Hiányzó story mező nem adott hibát');
});

// 5. Negatív token-szám
test('Negatív token-szám', () => {
  const rowCopy = JSON.parse(JSON.stringify(validRows[0]));
  // Feltételezzük, hogy az első modell kulcsa a 'actual.tokens' objektumban
  const firstModelKey = Object.keys(rowCopy.actual.tokens)[0];
  rowCopy.actual.tokens[firstModelKey].input = -1;
  
  const errors = validateRow(rowCopy, schema);
  const hasInputError = errors.some(err => err.includes('input'));
  assert.ok(hasInputError, 'Negatív input token nem adott hibát');
});

// 6. A SUPPORTED_KEYWORDS pontosan a tíz kulcsszót tartalmazza
test('A SUPPORTED_KEYWORDS pontosan a tíz kulcsszót tartalmazza', () => {
  const expectedKeywords = [
    'type',
    'enum',
    'const',
    'required',
    'properties',
    'additionalProperties',
    'items',
    'pattern',
    'maxLength',
    'minimum',
  ];
  const sortedSupported = [...SUPPORTED_KEYWORDS].sort();
  const sortedExpected = [...expectedKeywords].sort();
  assert.deepStrictEqual(sortedSupported, sortedExpected, 'A SUPPORTED_KEYWORDS nem egyezik a várt kulcsszavakkal');
});

// Összegzés
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
