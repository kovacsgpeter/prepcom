#!/usr/bin/env node
/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * A becslő közös referencia-fixture-jei (schemas/fixtures/estimate/cases/*): minden eseten
 * lefuttatja az args.json szerinti run(argv) hívást kétszer (szöveg és --json), és bájtra
 * összeveti az expected.txt, illetve expected.json tartalmával. A Sling-port ugyanezeket a
 * fájlokat olvassa.
 *
 * Használat:
 *   node estimate-run.fixtures.test.js            ellenőrzés
 *   node estimate-run.fixtures.test.js --update   az elvárások felülírása (csak szándékos rögzítéshez)
 *
 * Az args.json útvonalai: "./..." az eset mappájához, "@F/..." a közös fixture-mappához relatív.
 *
 * Kilépési kódok:
 *   0: minden teszt átment (vagy az --update lefutott)
 *   1: legalább egy teszt sikertelen
 */

'use strict';

const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { run } = require('./estimate-run.js');

const F = path.join(__dirname, '..', 'schemas', 'fixtures', 'estimate');
const CASES = path.join(F, 'cases');
const UPDATE = process.argv.includes('--update');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n     ${String(e.message).split('\n').join('\n     ')}`);
  }
}

function resolveArgs(args, caseDir) {
  return args.map((a) => {
    if (a.startsWith('@F/')) return path.join(F, a.slice(3));
    if (a.startsWith('./')) return path.join(caseDir, a.slice(2));
    return a;
  });
}

function loadCase(name) {
  const dir = path.join(CASES, name);
  const args = JSON.parse(fs.readFileSync(path.join(dir, 'args.json'), 'utf8'));
  return { name, dir, argv: resolveArgs(args, dir) };
}

function runOk(argv) {
  const res = run(argv);
  assert.strictEqual(res.code, 0, `kilépési kód ${res.code}: ${res.stderr}`);
  assert.strictEqual(res.stderr, '', `váratlan figyelmeztetés: ${res.stderr}`);
  return res.stdout;
}

const names = fs
  .readdirSync(CASES)
  .filter((n) => fs.statSync(path.join(CASES, n)).isDirectory())
  .sort();

const EXPECTED_CASES = ['calibration', 'epic', 'fallback-all', 'heuristic', 'loose-anomalies', 'project-own', 'subtasks'];

if (UPDATE) {
  for (const name of names) {
    const c = loadCase(name);
    fs.writeFileSync(path.join(c.dir, 'expected.txt'), runOk(c.argv));
    fs.writeFileSync(path.join(c.dir, 'expected.json'), runOk(c.argv.concat(['--json'])));
    console.log(`frissítve: ${name}`);
  }
  process.exit(0);
}

test('mind a 7 eset megvan', () => {
  assert.deepStrictEqual(names, EXPECTED_CASES);
});

for (const name of names) {
  const c = loadCase(name);
  const expectedTxt = fs.readFileSync(path.join(c.dir, 'expected.txt'), 'utf8');
  const expectedJson = fs.readFileSync(path.join(c.dir, 'expected.json'), 'utf8');

  test(`${name}: szöveges kimenet bájtra egyezik`, () => {
    assert.strictEqual(runOk(c.argv), expectedTxt);
  });

  test(`${name}: --json kimenet bájtra egyezik`, () => {
    assert.strictEqual(runOk(c.argv.concat(['--json'])), expectedJson);
  });

  test(`${name}: determinisztikus (két futás egyezik, nincs időbélyeg)`, () => {
    const a = runOk(c.argv.concat(['--json']));
    const b = runOk(c.argv.concat(['--json']));
    assert.strictEqual(a, b);
    assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:/.test(a), 'a kimenet időbélyeget tartalmaz');
  });
}

test('az elvárt JSON sémája (estimate/v1, epicnél epic-szerkezet)', () => {
  for (const name of names) {
    const j = JSON.parse(fs.readFileSync(path.join(CASES, name, 'expected.json'), 'utf8'));
    if (name === 'epic') {
      assert.strictEqual(j.stories.length, 3);
      for (const s of j.stories) assert.strictEqual(s.schema, 'estimate/v1');
    } else {
      assert.strictEqual(j.schema, 'estimate/v1', name);
    }
  }
});

test('project-own: --out ugyanazt a JSON-t menti, mint a --json', () => {
  const c = loadCase('project-own');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'estimate-fixture-'));
  try {
    const out = path.join(dir, 'ORD-100-estimate.json');
    runOk(c.argv.concat(['--out', out]));
    assert.strictEqual(fs.readFileSync(out, 'utf8'), runOk(c.argv.concat(['--json'])));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('üres store: basis=none és "Nincs elég adat" szöveg', () => {
  const c = loadCase('project-own');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'estimate-fixture-'));
  try {
    const empty = path.join(dir, 'empty.jsonl');
    fs.writeFileSync(empty, '');
    const argv = c.argv.slice();
    argv[argv.indexOf('--store') + 1] = empty;
    const json = JSON.parse(runOk(argv.concat(['--json'])));
    assert.strictEqual(json.basis, 'none');
    assert.deepStrictEqual(json.p50, {});
    const text = runOk(argv);
    assert.ok(text.includes('Nincs elég adat a becsléshez'), text);
    assert.ok(!text.includes('P50'), text);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('hiányzó store fájl is "nincs elég adat", nem hiba', () => {
  const c = loadCase('project-own');
  const argv = c.argv.slice();
  argv[argv.indexOf('--store') + 1] = path.join(os.tmpdir(), 'nincs-ilyen-store-377.jsonl');
  assert.strictEqual(JSON.parse(runOk(argv.concat(['--json']))).basis, 'none');
});

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
