#!/usr/bin/env node
/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * Ujjlenyomat-szűrés tesztek.
 *
 * Használat:
 *   node fingerprint.test.js
 *
 * Kilépési kódok:
 *   0 - siker
 *   1 - hiba
 */

'use strict';

const assert = require('assert');
const {
  matchesFingerprint,
  filterByFingerprint,
  STRICT_KEYS,
  LOOSE_KEYS,
} = require('./fingerprint');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error('FAILED: ' + name);
    console.error(e.message);
  }
}

// Teljes egyezés (mind a 4 kulcs) → igaz
test('teljes egyezés strict szinten', () => {
  const rowFp = {
    local_model: 'gpt-4',
    epic_story_host: 'host1',
    local_executor_host: 'exec1',
    ci_runner: 'runner1',
    dw_version: '1.0',
    gpu: 'nvidia',
  };
  const targetFp = {
    local_model: 'gpt-4',
    epic_story_host: 'host1',
    local_executor_host: 'exec1',
    ci_runner: 'runner1',
  };

  assert.strictEqual(matchesFingerprint(rowFp, targetFp, STRICT_KEYS), true);
});

// Az eltérő ci_runner szigorúan kiesik, lazán bent marad
test('eltérő ci_runner strict szinten kiesik', () => {
  const rows = [
    {
      fingerprint: {
        local_model: 'gpt-4',
        epic_story_host: 'host1',
        local_executor_host: 'exec1',
        ci_runner: 'runner1',
      },
    },
    {
      fingerprint: {
        local_model: 'gpt-4',
        epic_story_host: 'host1',
        local_executor_host: 'exec1',
        ci_runner: 'runner2',
      },
    },
  ];
  const targetFp = {
    local_model: 'gpt-4',
    epic_story_host: 'host1',
    local_executor_host: 'exec1',
    ci_runner: 'runner1',
  };

  const result = filterByFingerprint(rows, targetFp, 'strict');
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].fingerprint.ci_runner, 'runner1');
});

test('eltérő ci_runner loose szinten bent marad', () => {
  const rows = [
    {
      fingerprint: {
        local_model: 'gpt-4',
        epic_story_host: 'host1',
        local_executor_host: 'exec1',
        ci_runner: 'runner1',
      },
    },
    {
      fingerprint: {
        local_model: 'gpt-4',
        epic_story_host: 'host1',
        local_executor_host: 'exec1',
        ci_runner: 'runner2',
      },
    },
  ];
  const targetFp = {
    local_model: 'gpt-4',
    epic_story_host: 'host1',
    local_executor_host: 'exec1',
    ci_runner: 'runner1',
  };

  const result = filterByFingerprint(rows, targetFp, 'loose');
  assert.strictEqual(result.length, 2);
});

// Üres cél ({}) esetén minden sor átmegy mindkét szinten
test('üres cél strict szinten minden sor átmegy', () => {
  const rows = [
    {
      fingerprint: {
        local_model: 'gpt-4',
        epic_story_host: 'host1',
        local_executor_host: 'exec1',
        ci_runner: 'runner1',
      },
    },
    {
      fingerprint: {
        local_model: 'gpt-3',
        epic_story_host: 'host2',
        local_executor_host: 'exec2',
        ci_runner: 'runner2',
      },
    },
  ];
  const targetFp = {};

  const result = filterByFingerprint(rows, targetFp, 'strict');
  assert.strictEqual(result.length, 2);
});

test('üres cél loose szinten minden sor átmegy', () => {
  const rows = [
    {
      fingerprint: {
        local_model: 'gpt-4',
        epic_story_host: 'host1',
        local_executor_host: 'exec1',
        ci_runner: 'runner1',
      },
    },
    {
      fingerprint: {
        local_model: 'gpt-3',
        epic_story_host: 'host2',
        local_executor_host: 'exec2',
        ci_runner: 'runner2',
      },
    },
  ];
  const targetFp = {};

  const result = filterByFingerprint(rows, targetFp, 'loose');
  assert.strictEqual(result.length, 2);
});

// A célban üres string kulcs kimarad
test('célban üres string kulcs kimarad', () => {
  const rowFp = {
    local_model: 'gpt-4',
    epic_story_host: 'host1',
    local_executor_host: 'exec1',
    ci_runner: 'runner1',
  };
  const targetFp = {
    local_model: 'gpt-4',
    epic_story_host: '',
    local_executor_host: 'exec1',
    ci_runner: 'runner1',
  };

  assert.strictEqual(matchesFingerprint(rowFp, targetFp, STRICT_KEYS), true);
});

// A célban megadott kulcs, ami a sor ujjlenyomatából hiányzik → eltérés
test('célban megadott kulcs hiányzik a sorból → eltérés', () => {
  const rowFp = {
    local_model: 'gpt-4',
    epic_story_host: 'host1',
    local_executor_host: 'exec1',
  };
  const targetFp = {
    local_model: 'gpt-4',
    epic_story_host: 'host1',
    local_executor_host: 'exec1',
    ci_runner: 'runner1',
  };

  assert.strictEqual(matchesFingerprint(rowFp, targetFp, STRICT_KEYS), false);
});

// Ismeretlen szint → kivétel
test('ismeretlen szint → kivétel', () => {
  const rows = [
    {
      fingerprint: {
        local_model: 'gpt-4',
      },
    },
  ];
  const targetFp = {
    local_model: 'gpt-4',
  };

  assert.throws(
    () => filterByFingerprint(rows, targetFp, 'unknown'),
    /Ismeretlen ujjlenyomat-szint: unknown/
  );
});

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
