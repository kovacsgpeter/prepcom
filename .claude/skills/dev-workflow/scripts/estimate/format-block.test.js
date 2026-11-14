#!/usr/bin/env node
/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * Teszt az estimate/format-block.js modulhoz (szó szerinti összevetés).
 *
 * Használat: node format-block.test.js
 * Kilépési kódok: 0 minden teszt átment; 1 legalább egy sikertelen.
 */

'use strict';

const assert = require('assert');
const { formatBlock, formatEpicBlock, formatSubtaskLines } = require('./format-block');

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

function historyEst() {
  return {
    story: 'ORD-9',
    basis: 'history',
    confidence: 'normal',
    sample: { scope: 'all', project: 'ORD', n: 9, n_project: 1, k: 5, level: 'loose' },
    target: { complexity: 'M', plan_steps: 14, local_share: 0.8 },
    p50: {
      cost_usd: 3.1,
      tokens: 1900000,
      wall_s: 5100,
      active_s: 2700,
      local_s: 1200,
      claude_s: 3000,
      ci_s: 900,
      'model_cost:claude-sonnet-4-5-20250929': 2.6,
      'model_cost:claude-haiku-4-5': 0.3,
      'model_cost:claude-opus-4-1': 0.2,
    },
    p80: { cost_usd: 4.5, tokens: 2400000, wall_s: 7200, active_s: 3600 },
    calibration: { applied: true, n: 4, factors: { cost_usd: 1.18 } },
    hit_rate: {
      cost_usd: { hit: 3, total: 4 },
      wall_s: { hit: 4, total: 4 },
      active_s: { hit: 3, total: 4 },
    },
    risks: [{ code: 'breaker_open', count: 1, total: 6, extra_wall_s: 2400 }],
    rounds_fix: { min: 0, max: 1 },
  };
}

test('history blokk (normál, kalibráció, találati arány, kockázat)', () => {
  const expected = [
    'Becslés ORD-9 (M, 14 lépés, 1/2 helyi sub-task) — n=9 hasonló (k=5), ujjlenyomat: laza',
    'minta: minden projekt n=9 (ORD n=1)',
    '            P50       P80',
    'Claude $    3.10      4.50  (sonnet 2.60 / haiku 0.30 / opus 0.20)',
    'Tokenek     1.9M      2.4M',
    'Falióra     1 ó 25 p  2 ó 0 p  (helyi LLM 20 p · Claude 50 p · CI 15 p · javítókör 0–1)',
    'Aktív idő   45 p      1 ó 0 p',
    'Korrekció: ×1.18 (n=4 korábbi becslés)',
    'P80 találati arány: költség 3/4, falióra 4/4, aktív idő 3/4',
    'Kockázat: 1/6 hasonló futásban breaker_open (+40 p)',
  ].join('\n');
  const actual = formatBlock(historyEst(), { subtasks: [{ executor: 'local' }, { executor: 'claude' }] });
  assert.strictEqual(actual, expected);
});

test('heurisztikus blokk: alacsony megbízhatóság, nincs sub-task rész', () => {
  const est = {
    story: 'ORD-10',
    basis: 'heuristic',
    confidence: 'low',
    sample: { scope: 'none', project: 'ORD', n: 2, n_project: 0, k: 0, level: 'none' },
    target: { complexity: 'S', plan_steps: 10, local_share: 0 },
    p50: { cost_usd: 2, wall_s: 1000 },
    p80: { cost_usd: 3, wall_s: 1500 },
    risks: [],
    rounds_fix: { min: 0, max: 0 },
  };
  const expected = [
    'Becslés ORD-10 (S, 10 lépés) — heurisztikus becslés, n=2 korábbi story',
    'minta: heurisztika n=2',
    'FIGYELEM: alacsony megbízhatóság (heurisztikus becslés)',
    '            P50       P80',
    'Claude $    2.00      3.00',
    'Falióra     17 p      25 p  (javítókör 0–0)',
  ].join('\n');
  assert.strictEqual(formatBlock(est, {}), expected);
});

test('none blokk', () => {
  const est = { story: 'ORD-11', basis: 'none', confidence: 'low', target: { plan_steps: 5 } };
  const expected = [
    'Becslés ORD-11 (5 lépés)',
    'Nincs elég adat a becsléshez (a store üres vagy nincs használható sor)',
  ].join('\n');
  assert.strictEqual(formatBlock(est, {}), expected);
});

test('sub-task sorok', () => {
  const parts = [
    {
      id: 'ORD-1',
      type: 'backend',
      executor: 'local',
      share: 0.5,
      p50: { cost_usd: 1, tokens: 1000, wall_s: 600, local_s: 300 },
      p80: { cost_usd: 2, tokens: 2000, wall_s: 1200, local_s: 600 },
    },
  ];
  const expected = [
    'Sub-task bontás — FIGYELEM: alacsony megbízhatóság (heurisztikus felosztás)',
    '  ORD-1 (backend, local) 50%: $ 1.00 / 2.00 · 1k / 2k · 10 p / 20 p · helyi 5 p / 10 p',
  ].join('\n');
  assert.strictEqual(formatSubtaskLines(parts), expected);
  assert.strictEqual(formatSubtaskLines([]), '');
});

test('epic blokk: storyk, overhead, összeg, megjegyzés', () => {
  const story = {
    story: 'ORD-1',
    basis: 'none',
    confidence: 'low',
    target: {},
  };
  const epic = {
    epic: 'ORD-2',
    stories: [story],
    overhead: { n: 2, scope: 'project', p50: { cost_usd: 1, wall_s: 600 }, p80: { cost_usd: 2, wall_s: 1200 } },
    total: { p50: { cost_usd: 4, wall_s: 3600 }, p80: { cost_usd: 6, wall_s: 5400 } },
  };
  const expected = [
    'Becslés ORD-1',
    'Nincs elég adat a becsléshez (a store üres vagy nincs használható sor)',
    '',
    'Epic ORD-2: 1 story',
    'epic_overhead: n=2 (saját projekt), P50 1.00 $ / 10 p, P80 2.00 $ / 20 p',
    'Összesen (storyk és epic_overhead):',
    '            P50       P80',
    'Claude $    4.00      6.00',
    'Falióra     1 ó 0 p   1 ó 30 p',
    'Megjegyzés: a P80-ak összege konzervatív; a hullámok összeadva, párhuzamosság nincs modellezve',
  ].join('\n');
  assert.strictEqual(formatEpicBlock(epic), expected);
});

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
