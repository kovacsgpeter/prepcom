#!/usr/bin/env node
/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * Teszt a rows.js modulhoz.
 *
 * Használat:
 *   node rows.test.js
 *
 * Kilépési kódok:
 *   0: minden teszt átment
 *   1: legalább egy teszt sikertelen
 */

'use strict';

const assert = require('assert');
const {
  parseStoreText,
  stepsOf,
  localShareOf,
  isAnomalous,
  withoutSelf,
  storyRows,
  overheadRows,
} = require('./rows');

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

// Validate function for tests: returns error if 'schema' field is missing
function validate(row) {
  const errors = [];
  if (!row.schema) {
    errors.push('Hiányzó schema mező');
  }
  return errors;
}

// Test parseStoreText
test('parseStoreText', () => {
  const text = [
    '{"schema": "v1", "id": 1}',
    'invalid json',
    '{"id": 2}',
    '',
  ].join('\n');

  const result = parseStoreText(text, validate);
  assert.strictEqual(result.rows.length, 1, 'rows.length nem 1');
  assert.strictEqual(result.skipped, 2, 'skipped nem 2');
});

// Test stepsOf
test('stepsOf', () => {
  assert.strictEqual(
    stepsOf({ features: { plan_steps: 14 } }),
    14,
    'stepsOf nem 14'
  );
  assert.strictEqual(stepsOf({}), 0, 'stepsOf nem 0');
  assert.strictEqual(stepsOf(null), 0, 'stepsOf nem 0 null-ra');
  assert.strictEqual(stepsOf(undefined), 0, 'stepsOf nem 0 undefined-ra');
});

// Test localShareOf
test('localShareOf', () => {
  const features = {
    subtasks: [
      { id: 1, executor: 'local' },
      { id: 2, executor: 'local' },
      { id: 3, executor: 'local' },
      { id: 4, executor: 'claude' },
    ],
  };
  assert.strictEqual(localShareOf(features), 0.75, 'localShareOf nem 0.75');

  assert.strictEqual(localShareOf({}), 0, 'localShareOf nem 0 üres features');
  assert.strictEqual(
    localShareOf({ subtasks: [] }),
    0,
    'localShareOf nem 0 üres subtasks'
  );
  assert.strictEqual(localShareOf(null), 0, 'localShareOf nem 0 null');
});

// Test isAnomalous
test('isAnomalous', () => {
  assert.strictEqual(isAnomalous({ anomalies: [] }), false, 'isAnomalous nem false');
  assert.strictEqual(
    isAnomalous({ anomalies: ['breaker_open'] }),
    true,
    'isAnomalous nem true'
  );
  assert.strictEqual(isAnomalous({}), false, 'isAnomalous nem false hiányzó anomalies');
  assert.strictEqual(isAnomalous(null), false, 'isAnomalous nem false null');
});

// Test withoutSelf
test('withoutSelf', () => {
  const rows = [
    { project: 'ORD', story: 'ORD-1' },
    { project: 'ORD', story: 'ORD-2' },
    { project: 'X', story: 'ORD-1' },
  ];
  const result = withoutSelf(rows, 'ORD', 'ORD-1');
  assert.strictEqual(result.length, 2, 'withoutSelf nem 2');
  assert.strictEqual(result[0].story, 'ORD-2', 'withoutSelf első elem nem ORD-2');
  assert.strictEqual(result[1].project, 'X', 'withoutSelf második elem nem X');
});

// Test storyRows
test('storyRows', () => {
  const rows = [
    { kind: 'epic_overhead', actual: {}, features: { plan_steps: 5 } },
    { kind: 'story', features: { plan_steps: 5 } },
    { kind: 'story', actual: {}, features: {} },
    { kind: 'story', actual: {}, features: { plan_steps: 3 } },
  ];
  const result = storyRows(rows);
  assert.strictEqual(result.length, 1, 'storyRows nem 1');
  assert.strictEqual(result[0].features.plan_steps, 3, 'storyRows nem 3');
});

// Test overheadRows
test('overheadRows', () => {
  const rows = [
    { kind: 'epic_overhead' },
    { kind: 'story' },
    { kind: 'epic_overhead' },
  ];
  const result = overheadRows(rows);
  assert.strictEqual(result.length, 2, 'overheadRows nem 2');
});

// Összegzés
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
