#!/usr/bin/env node
/**
 * dev-workflow (ORD-376, 4.27.0)
 *
 * Teszt a collect-run-metrics.js gyűjtőhöz: szintetikus mini-transcriptekkel
 * (fixtures/run-metrics/), kézzel számolt költségekkel.
 *
 * Használat:
 *   node collect-run-metrics.test.js
 *
 * Kilépési kódok:
 *   0: minden teszt átment
 *   1: legalább egy teszt sikertelen
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const collect = require('./collect-run-metrics.js');
const { validateRow, loadSchema } = require('./validate-run-metrics.js');
const pricingLib = require('../../../tools/session-cost-report/pricing.js');

const SCRIPT = path.join(__dirname, 'collect-run-metrics.js');
const FX = path.join(__dirname, 'fixtures', 'run-metrics');
const PRICING = path.join(FX, 'pricing.json');
const PROJECTS = path.join(FX, 'projects');
const schema = loadSchema();

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`FAIL: ${name}\n  ${e.message}`);
  }
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'run-metrics-test-'));

// A szkript futtatása külön folyamatban, tiszta környezettel.
function run(args, envExtra = {}) {
  const env = Object.assign({}, process.env, { GLAB_BIN: 'glab-nincs-telepitve-teszt' }, envExtra);
  for (const k of ['RUN_METRICS_STORE', 'LOCAL_MODEL_NAME', 'LOCAL_HW_PROFILE', 'WORKFLOW_PROFILE', 'EPIC_STORY_HOST', 'LOCAL_EXECUTOR_HOST']) {
    if (!(k in envExtra)) delete env[k];
  }
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env, cwd: tmpRoot });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function rowsOf(res) {
  return res.out.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

const base = ['--sessions', 'sess1', '--projects-dir', PROJECTS, '--pricing', PRICING, '--dry-run'];
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

// ---- segédek

test('parseArgs: a --window és --alias ismételhető, a többi kapcsoló skalár', () => {
  const o = collect.parseArgs(['--window', 'A=1..2', '--window', 'B=3..4', '--alias', 'X=Y', '--story', 'S']);
  assert.strictEqual(o.window.length, 2);
  assert.strictEqual(o.alias.length, 1);
  assert.strictEqual(o.story, 'S');
});

test('parseWindowSpecs: érvényes ablakok, érintkező ablakok nem átfedők', () => {
  const m = collect.parseWindowSpecs([
    'ORD-56=2026-02-01T10:00:00.000Z..2026-02-01T10:10:00.000Z',
    'ORD-71=2026-02-01T10:10:00.000Z..2026-02-01T10:20:00.000Z',
  ]);
  assert.strictEqual(m.size, 2);
  assert.strictEqual(m.get('ORD-71')[0].start, Date.parse('2026-02-01T10:10:00.000Z'));
  assert.strictEqual(collect.parseWindowSpecs(undefined).size, 0);
});

test('parseWindowSpecs: átfedő ablak hibát dob', () => {
  assert.throws(
    () => collect.parseWindowSpecs(['ORD-56=2026-02-01T10:00:00Z..2026-02-01T10:10:00Z', 'ORD-71=2026-02-01T10:09:00Z..2026-02-01T10:20:00Z']),
    /átfedő.*ORD-56 és ORD-71/,
  );
});

test('parseWindowSpecs: az időzóna kötelező (Z vagy ±hh:mm)', () => {
  assert.throws(() => collect.parseWindowSpecs(['ORD-56=2026-02-01T10:00:00..2026-02-01T10:10:00Z']), /időzónát/);
  assert.throws(() => collect.parseWindowSpecs(['ORD-56=2026-02-01T10:00:00Z..2026-02-01T10:10:00']), /időzónát/);
  assert.throws(() => collect.parseWindowSpecs(['ORD-56=2026-02-01..2026-02-02']), /időzónát/);
  const m = collect.parseWindowSpecs(['ORD-56=2026-02-01T12:00:00+02:00..2026-02-01T12:10:00+02:00']);
  assert.strictEqual(m.get('ORD-56')[0].start, Date.parse('2026-02-01T10:00:00Z'));
});

test('parseWindowSpecs: hibás formátum (hiányzó .., rossz dátum, fordított sorrend)', () => {
  assert.throws(() => collect.parseWindowSpecs(['ORD-56=2026-02-01T10:00:00Z']), /hiányzó \.\./);
  assert.throws(() => collect.parseWindowSpecs(['ORD-56']), /hiányzó =/);
  assert.throws(() => collect.parseWindowSpecs(['ORD-56=nem-datum..2026-02-01T10:00:00Z']), /érvénytelen dátum/);
  assert.throws(() => collect.parseWindowSpecs(['ORD-56=2026-02-01T10:10:00Z..2026-02-01T10:00:00Z']), /nem későbbi/);
  assert.throws(() => collect.parseWindowSpecs(['=2026-02-01T10:00:00Z..2026-02-01T10:10:00Z']), /üres story-kulcs/);
});

test('parseAliasSpecs: térkép, ütköző és önmagára mutató alias hibát dob', () => {
  assert.deepStrictEqual(collect.parseAliasSpecs(['ORD-57=ORD-56', 'ORD-58=ORD-56']), { 'ORD-57': 'ORD-56', 'ORD-58': 'ORD-56' });
  assert.deepStrictEqual(collect.parseAliasSpecs(undefined), {});
  assert.throws(() => collect.parseAliasSpecs(['ORD-57=ORD-56', 'ORD-57=ORD-71']), /ütköző/);
  assert.throws(() => collect.parseAliasSpecs(['X=X']), /önmagára/);
  assert.throws(() => collect.parseAliasSpecs(['X']), /hiányzó =/);
  assert.throws(() => collect.parseAliasSpecs(['X=']), /üres oldal/);
});

test('storyOfAgent: sub-task alias a storyhoz rendel, a szülő-lánc is öröklődik', () => {
  const parent = { id: 'p', meta: { description: 'Implement ORD-57 lépés' } };
  const child = { id: 'c', meta: { description: 'Javítás', parentAgentId: 'p' } };
  const byId = { p: parent, c: child };
  const aliases = { 'ORD-57': 'ORD-56' };
  assert.strictEqual(collect.storyOfAgent(parent, byId, ['ORD-56'], 0, aliases), 'ORD-56');
  assert.strictEqual(collect.storyOfAgent(child, byId, ['ORD-56'], 0, aliases), 'ORD-56');
  assert.strictEqual(collect.storyOfAgent(parent, byId, ['ORD-56']), null);
  const both = { id: 'b', meta: { description: 'ORD-71 és ORD-57' } };
  assert.strictEqual(collect.storyOfAgent(both, { b: both }, ['ORD-56', 'ORD-71'], 0, aliases), 'ORD-71');
});

test('storyWindows: az explicit windowMap elsőbbséget élvez', () => {
  const w = collect.storyWindows('ORD-56', [], [], { windowMap: new Map([['ORD-56', [{ start: 1, end: 5 }]]]), since: '2026-01-01T00:00:00Z' });
  assert.deepStrictEqual(w, [{ start: 1, end: 5 }]);
});

test('mentionsStory: szóhatár (ORD-8 != ORD-82)', () => {
  assert.ok(collect.mentionsStory('Architect plan ORD-82', 'ORD-82'));
  assert.ok(!collect.mentionsStory('Architect plan ORD-82', 'ORD-8'));
  assert.ok(collect.mentionsStory('Plan ORD-8', 'ORD-8'));
  assert.ok(!collect.mentionsStory('XORD-8 terv', 'ORD-8'));
  assert.strictEqual(collect.firstStoryId('Re-review ORD-98 MR 39'), 'ORD-98');
  assert.strictEqual(collect.firstStoryId('A7 helyi kapu'), null);
});

test('storyOfAgent: a nem story-token (UTF-8) nem nyeli el a valódi story-azonosítót', () => {
  const parent = { id: 'p', meta: { description: 'Story-runner ORD-82' } };
  const own = { id: 'a', meta: { description: 'Review UTF-8 fix for ORD-82' } };
  const child = { id: 'c', meta: { description: 'SHA-256 ellenőrzés', parentAgentId: 'p' } };
  const byId = { p: parent, a: own, c: child };
  assert.strictEqual(collect.storyOfAgent(own, byId, ['ORD-82']), 'ORD-82');
  assert.strictEqual(collect.storyOfAgent(child, byId, ['ORD-82']), 'ORD-82');
  assert.strictEqual(collect.storyOfAgent(own, byId, ['ORD-94']), null);
  assert.deepStrictEqual(collect.storyIdsIn('Review UTF-8 fix for ORD-82 és ORD-94', 'ORD'), ['ORD-82', 'ORD-94']);
});

test('encodeCwd: minden nem alfanumerikus karakter kötőjel', () => {
  assert.strictEqual(collect.encodeCwd('C:\\dev\\repos\\ordoviii'), 'C--dev-repos-ordoviii');
  assert.strictEqual(collect.encodeCwd('/home/u/my.repo'), '-home-u-my-repo');
});

test('sanitizeId: szóköz _, tiltott karakter eldobva', () => {
  assert.strictEqual(collect.sanitizeId('RTX 3090 24GB'), 'RTX_3090_24GB');
  assert.strictEqual(collect.sanitizeId('a@b c'), 'ab_c');
});

// ---- story-sor

test('ORD-82: ablak-szűrés, dedup, kézzel számolt költség (5 p és 1 ó cache-írás)', () => {
  const res = run(['--story', 'ORD-82', '--epic', 'ORD-3', '--features-file', path.join(FX, 'features.json'), '--plan-file', path.join(FX, 'plan.md'), '--local-log', path.join(FX, 'local-log.jsonl'), ...base]);
  assert.strictEqual(res.code, 0, res.err);
  const [row] = rowsOf(res);
  assert.deepStrictEqual(validateRow(row, schema), []);
  assert.strictEqual(row.kind, 'story');
  assert.strictEqual(row.project, 'ORD');
  assert.strictEqual(row.epic, 'ORD-3');
  assert.strictEqual(row.backfilled, false);
  // sonnet: input 10+2000+4000+1000+100+200+500; a streamelt duplikátum (output 50) kiesett
  assert.deepStrictEqual(row.actual.tokens['test-sonnet'], { input: 7810, cache_write: 1000, cache_read: 25000, output: 790 });
  assert.deepStrictEqual(row.actual.tokens['test-haiku'], { input: 400, cache_write: 200, cache_read: 0, output: 40 });
  // sonnet: 7810*2 + 790*10 + 600*2.5 + 400*4 + 25000*0.2 = 31620 µ$; haiku: 400 + 200 + 200*1.25 = 850 µ$
  near(row.actual.cost_usd, 0.0325);
  assert.strictEqual(row.actual.cost_estimated, true, 'a haiku cache-írás bontása nem ismert');
  // az ORD-8 architect és az ORD-94 ablak nem szivárog be
  assert.ok(!('test-opus' in row.actual.tokens));
});

test('ORD-82: fázisok, körök, anomáliák, jellemzők', () => {
  const res = run(['--story', 'ORD-82', '--features-file', path.join(FX, 'features.json'), '--plan-file', path.join(FX, 'plan.md'), '--local-log', path.join(FX, 'local-log.jsonl'), ...base]);
  const [row] = rowsOf(res);
  const bp = row.actual.by_phase;
  assert.strictEqual(bp.architect.tokens, 5500);
  assert.strictEqual(bp.implement.tokens, 20420);
  assert.strictEqual(bp.fix.tokens, 220);
  assert.strictEqual(bp.review.tokens, 550);
  assert.strictEqual(bp.qa.tokens, 330);
  assert.strictEqual(bp.orchestration_main.tokens, 8220);
  assert.strictEqual(bp.orchestration_main.wall_s, null);
  assert.strictEqual(bp.implement.wall_s, 690);
  assert.strictEqual(bp.fix.wall_s, 1320);
  assert.strictEqual(bp.review.wall_s, 180);
  // a szülő-láncon kapott story: a "Review of the change" leírás story nélküli
  assert.deepStrictEqual(row.actual.rounds, { fix: 0, review: 1, qa: 1 });
  assert.deepStrictEqual([...row.anomalies].sort(), ['breaker_open', 'context_compaction', 'invalid_json', 'unreachable']);
  assert.strictEqual(row.features.plan_steps, 5, 'a plan-meta felülírja a becslést');
  assert.strictEqual(row.features.plan_files, 3);
  assert.deepStrictEqual(row.features.estimated, undefined);
  assert.strictEqual(row.features.complexity, 'M');
  assert.strictEqual(row.actual.wall_clock_s, 1500, 'a mark_chapter-ablak: 10:05 -> 10:30');
});

test('helyi napló: hívások, visszaesések, model_s, más ticket és dry-run kizárva', () => {
  const res = run(['--story', 'ORD-82', '--features-file', path.join(FX, 'features.json'), '--local-log', path.join(FX, 'local-log.jsonl'), ...base]);
  const [row] = rowsOf(res);
  assert.deepStrictEqual(row.actual.local, { calls: 3, success: 1, fallbacks: { total: 2, invalid_json: 1, typecheck: 1 }, model_s: 15 });
  assert.strictEqual(row.fingerprint.local_model, 'test-model');
});

test('helyi napló duration_ms nélkül: model_s null', () => {
  const log = path.join(tmpRoot, 'nodur.jsonl');
  fs.writeFileSync(log, JSON.stringify({ outcome: 'success', dry_run: false, ticket: 'ORD-82' }) + '\n');
  const res = run(['--story', 'ORD-82', '--local-log', log, ...base]);
  const [row] = rowsOf(res);
  assert.strictEqual(row.actual.local.model_s, null);
  assert.strictEqual(row.actual.local.calls, 1);
});

test('ORD-8: a szóhatár miatt csak a saját agentje, ablak az agent ideje', () => {
  const res = run(['--story', 'ORD-8', ...base]);
  const [row] = rowsOf(res);
  assert.deepStrictEqual(row.actual.tokens, { 'test-sonnet': { input: 7000, cache_write: 0, cache_read: 0, output: 70 } });
  assert.strictEqual(row.actual.by_phase.architect.tokens, 7070);
  assert.strictEqual(row.actual.cost_estimated, false);
});

test('ORD-94: chapter-ablak a fő szálból, nincs becsült költség', () => {
  const res = run(['--story', 'ORD-94', ...base]);
  const [row] = rowsOf(res);
  assert.deepStrictEqual(row.actual.tokens['test-sonnet'], { input: 3510, cache_write: 0, cache_read: 0, output: 360 });
  near(row.actual.cost_usd, 0.0106);
  assert.strictEqual(row.actual.cost_estimated, false);
  assert.deepStrictEqual(row.anomalies, []);
});

test('--since/--until felülírja a chapter-ablakot', () => {
  const res = run(['--story', 'ORD-94', '--since', '2026-01-01T10:31:00.000Z', '--until', '2026-01-01T10:31:00.000Z', ...base]);
  const [row] = rowsOf(res);
  assert.deepStrictEqual(row.actual.tokens['test-sonnet'], { input: 3000, cache_write: 0, cache_read: 0, output: 300 });
});

test('price_table_version egyezik a pricing-modul értékével', () => {
  const [row] = rowsOf(run(['--story', 'ORD-94', ...base]));
  const p = pricingLib.loadPricing(PRICING);
  assert.strictEqual(row.price_table_version, pricingLib.priceTableVersion(p, fs.readFileSync(PRICING, 'utf8')));
  assert.ok(row.price_table_version.startsWith('2026-01-01+'));
});

test('--gpu: azonosító-mintára szűrve, LOCAL_HW_PROFILE a tartalék', () => {
  let [row] = rowsOf(run(['--story', 'ORD-94', '--gpu', 'RTX 3090 24GB', ...base]));
  assert.strictEqual(row.fingerprint.gpu, 'RTX_3090_24GB');
  [row] = rowsOf(run(['--story', 'ORD-94', ...base], { LOCAL_HW_PROFILE: 'RTX_4090' }));
  assert.strictEqual(row.fingerprint.gpu, 'RTX_4090');
});

// ---- epic_overhead

test('epic_overhead: a story-ablakokon kívüli fő-szál és a story nélküli subagent', () => {
  const res = run(['--kind', 'epic_overhead', '--epic', 'ORD-3', '--stories', 'ORD-82,ORD-94', ...base]);
  assert.strictEqual(res.code, 0, res.err);
  const [row] = rowsOf(res);
  assert.deepStrictEqual(validateRow(row, schema), []);
  assert.strictEqual(row.kind, 'epic_overhead');
  assert.strictEqual(row.story, null);
  assert.strictEqual(row.epic, 'ORD-3');
  assert.deepStrictEqual(row.features, {});
  // 10:00-s hívás (1000/100) + a story nélküli "Explore repo" (900/90) + a nem listázott ORD-8-hoz
  // rendelt agent-x8 (7000/70, ORD-387: korábban elveszett): 3000 + 1900 + 14700 = 20400 µ$
  assert.deepStrictEqual(row.actual.tokens, { 'test-sonnet': { input: 8900, cache_write: 0, cache_read: 0, output: 260 } });
  near(row.actual.cost_usd, 0.0204);
  assert.strictEqual(row.actual.wall_clock_s, 300, '10:00-10:05 a story-ablakokon kívül');
  assert.ok(res.err.includes('story nélküli subagent'));
  assert.ok(res.err.includes('nem listázott story-hoz rendelt subagent'));
});

test('epic_overhead --epic nélkül hiba, --warn-only mellett 0', () => {
  let res = run(['--kind', 'epic_overhead', ...base]);
  assert.strictEqual(res.code, 1);
  res = run(['--kind', 'epic_overhead', '--warn-only', ...base]);
  assert.strictEqual(res.code, 0);
  assert.ok(res.err.includes('FIGYELEM'));
});

// ---- fő szálas story-k (ORD-387)

const PROJECTS_MT = path.join(FX, 'projects-mainthread');
const baseMT = ['--sessions', 'sess3', '--projects-dir', PROJECTS_MT, '--pricing', PRICING, '--dry-run'];
const W56 = ['--window', 'ORD-56=2026-02-01T10:00:00.000Z..2026-02-01T10:10:00.000Z'];
const W71 = ['--window', 'ORD-71=2026-02-01T10:10:00.000Z..2026-02-01T10:20:00.000Z'];

test('--window: átfedő ablakok hibával állnak meg, sort nem írnak', () => {
  const overlap = ['--window', 'ORD-71=2026-02-01T10:09:00.000Z..2026-02-01T10:20:00.000Z'];
  let res = run(['--story', 'ORD-56', ...W56, ...overlap, ...baseMT]);
  assert.strictEqual(res.code, 1);
  assert.ok(res.err.includes('átfedő'), res.err);
  assert.strictEqual(res.out.trim(), '');
  res = run(['--story', 'ORD-56', '--warn-only', ...W56, ...overlap, ...baseMT]);
  assert.strictEqual(res.code, 0);
  assert.strictEqual(res.out.trim(), '');
});

test('--window: két story fő szála nem számolódik duplán (érintkező ablakok)', () => {
  let res = run(['--story', 'ORD-56', ...W56, ...W71, ...baseMT]);
  assert.strictEqual(res.code, 0, res.err);
  let [row] = rowsOf(res);
  assert.deepStrictEqual(validateRow(row, schema), []);
  near(row.actual.by_phase.orchestration_main.cost_usd, 0.003);
  res = run(['--story', 'ORD-71', ...W56, ...W71, ...baseMT]);
  [row] = rowsOf(res);
  assert.deepStrictEqual(validateRow(row, schema), []);
  near(row.actual.by_phase.orchestration_main.cost_usd, 0.006);
});

test('--alias: a sub-task kulccsal indított subagent a storyhoz számít', () => {
  let [row] = rowsOf(run(['--story', 'ORD-56', ...W56, ...W71, ...baseMT]));
  near(row.actual.by_phase.implement.cost_usd, 0.006);
  [row] = rowsOf(run(['--story', 'ORD-56', ...W56, ...W71, '--alias', 'ORD-57=ORD-56', ...baseMT]));
  near(row.actual.by_phase.implement.cost_usd, 0.015);
});

test('összeg-invariáns: a story-sorok és az overhead-sor összege egyenlő a sessionök teljes költségével', () => {
  const common = [...W56, ...W71, '--alias', 'ORD-57=ORD-56', ...baseMT];
  const res56 = run(['--story', 'ORD-56', ...common]);
  const res71 = run(['--story', 'ORD-71', ...common]);
  const resOv = run(['--kind', 'epic_overhead', '--epic', 'ORD-2', '--stories', 'ORD-56,ORD-71', ...common]);
  for (const r of [res56, res71, resOv]) assert.strictEqual(r.code, 0, r.err);
  const rows = [rowsOf(res56)[0], rowsOf(res71)[0], rowsOf(resOv)[0]];
  for (const row of rows) assert.deepStrictEqual(validateRow(row, schema), []);
  // kézi számolás: fő 0,0150 + 0,0060 + 0,0090 + 0,0030 + 0,0015 + 0,0015 = 0,0360 $; overhead: 0,0090
  near(rows[2].actual.cost_usd, 0.009);
  const pricing = pricingLib.loadPricing(PRICING);
  const sess = collect.loadSession(PROJECTS_MT, 'sess3', []);
  const recs = [...sess.main.records];
  for (const a of sess.agents) recs.push(...a.tr.records);
  const total = recs.reduce((acc, r) => acc + pricingLib.costOfRecord(pricing, r).cost, 0);
  near(total, 0.036);
  const sumRows = rows.reduce((acc, r) => acc + r.actual.cost_usd, 0);
  assert.ok(Math.abs(sumRows - total) <= 0.0005, `${sumRows} != ${total}`);
  const tok = (row) => Object.values(row.actual.tokens).reduce((acc, t) => acc + t.input + t.output + t.cache_write + t.cache_read, 0);
  const totalTokens = recs.reduce((acc, r) => {
    const c = pricingLib.costOfRecord(pricing, r);
    return acc + c.input + c.output + c.cacheWrite + c.cacheRead;
  }, 0);
  assert.strictEqual(rows.reduce((acc, r) => acc + tok(r), 0), totalTokens);
  assert.ok(resOv.err.includes('nem listázott story'), resOv.err);
  assert.ok(resOv.err.includes('agent-t99'), resOv.err);
});

// ---- CI, store

test('hiányzó glab: ci null, figyelmeztetés, a sor mégis érvényes', () => {
  const res = run(['--story', 'ORD-94', '--mr', '7', ...base]);
  const [row] = rowsOf(res);
  assert.strictEqual(row.actual.ci, null);
  assert.strictEqual(row.actual.mr_iid, 7);
  assert.ok(res.err.includes('glab'));
  assert.deepStrictEqual(validateRow(row, schema), []);
});

test('store: .gitignore, idempotencia, --force', () => {
  const store = path.join(tmpRoot, 'store1', 'sub', 'runs.jsonl');
  const args = ['--story', 'ORD-94', '--sessions', 'sess1', '--projects-dir', PROJECTS, '--pricing', PRICING, '--store', store];
  let res = run(args);
  assert.strictEqual(res.code, 0, res.err);
  assert.strictEqual(fs.readFileSync(path.join(path.dirname(store), '.gitignore'), 'utf8'), '*\n');
  assert.strictEqual(fs.readFileSync(store, 'utf8').split('\n').filter(Boolean).length, 1);
  const first = fs.readFileSync(store, 'utf8');
  res = run(args);
  assert.strictEqual(res.code, 0);
  assert.ok(res.err.includes('--force'));
  assert.strictEqual(fs.readFileSync(store, 'utf8'), first, 'a meglévő sor érintetlen');
  res = run([...args, '--force']);
  assert.strictEqual(res.code, 0);
  const lines = fs.readFileSync(store, 'utf8').split('\n').filter(Boolean);
  assert.strictEqual(lines.length, 1, 'felülírás, nem hozzáfűzés');
  // másik story: új sor
  res = run(['--story', 'ORD-8', ...args.slice(2)]);
  assert.strictEqual(fs.readFileSync(store, 'utf8').split('\n').filter(Boolean).length, 2);
});

test('store: ~ a home-ra oldódik (RUN_METRICS_STORE és alapérték)', () => {
  const home = path.join(tmpRoot, 'home');
  fs.mkdirSync(home);
  const envHome = { HOME: home, USERPROFILE: home };
  const a = ['--story', 'ORD-94', '--sessions', 'sess1', '--projects-dir', PROJECTS, '--pricing', PRICING];
  let res = run(a, Object.assign({ RUN_METRICS_STORE: '~/custom/runs.jsonl' }, envHome));
  assert.strictEqual(res.code, 0, res.err);
  assert.ok(fs.existsSync(path.join(home, 'custom', 'runs.jsonl')));
  res = run(a, envHome);
  assert.strictEqual(res.code, 0, res.err);
  assert.ok(fs.existsSync(path.join(home, '.dev-workflow', 'metrics', 'runs.jsonl')));
  assert.ok(fs.existsSync(path.join(home, '.dev-workflow', 'metrics', '.gitignore')));
});

test('érvénytelen sor nem íródik; hiányzó --story hiba / --warn-only 0', () => {
  const warnings = [];
  const store = path.join(tmpRoot, 'store2', 'runs.jsonl');
  const r = collect.writeRows([{ schema: 'run-metrics/v1', bogus: 1 }], { store }, warnings);
  assert.strictEqual(r.errors, 1);
  assert.ok(!fs.existsSync(store));
  assert.strictEqual(run(['--sessions', 'sess1', '--dry-run']).code, 1);
  assert.strictEqual(run(['--sessions', 'sess1', '--dry-run', '--warn-only']).code, 0);
});

// ---- backfill

test('backfill ORD-3: költség újraszámolva, szabad szöveg és ismeretlen kulcs eldobva', () => {
  const res = run(['--backfill', path.join(FX, 'backfill-ord3'), '--pricing', PRICING, '--dry-run']);
  assert.strictEqual(res.code, 0, res.err);
  const [story, over] = rowsOf(res);
  for (const r of [story, over]) {
    assert.deepStrictEqual(validateRow(r, schema), []);
    assert.strictEqual(r.backfilled, true);
    assert.ok(!('notes' in r) && !('estimate_note' in r) && !('session_id' in r) && !('extra_key' in r) && !('backfill' in r));
    assert.ok(r.price_table_version.startsWith('2026-01-01+'));
    assert.strictEqual(r.actual.cost_estimated, true);
  }
  assert.strictEqual(story.fingerprint.gpu, 'RTX_3090_24GB');
  // 1000*2 + 500*10 + 1000*2.5 + 10000*0.2 = 11500 µ$ (a régi 99.9 eldobva)
  near(story.actual.cost_usd, 0.0115);
  near(story.actual.by_phase.implement.cost_usd, 0.0092);
  near(story.actual.by_phase.orchestration_main.cost_usd, 0.0023);
  assert.strictEqual(story.actual.by_phase.implement.wall_s, 60);
  assert.deepStrictEqual(story.anomalies, ['breaker_open']);
  // haiku: 1000*1 + 1000*5 = 6000 µ$
  near(over.actual.cost_usd, 0.006);
  assert.strictEqual(over.kind, 'epic_overhead');
  assert.deepStrictEqual(over.features, {});
});

test('backfill ORD-2: story a terv fájlnevéből (v1 kihagyva), local-stats Ok-leképezés', () => {
  const dir = path.join(FX, 'backfill-ord2');
  const res = run(['--backfill', dir, '--sessions', 'sess2', '--projects-dir', path.join(dir, 'projects'), '--pricing', PRICING, '--dry-run']);
  assert.strictEqual(res.code, 0, res.err);
  const rows = rowsOf(res);
  assert.strictEqual(rows.length, 1);
  const [row] = rows;
  assert.deepStrictEqual(validateRow(row, schema), []);
  assert.strictEqual(row.story, 'ORD-81');
  assert.strictEqual(row.backfilled, true);
  assert.strictEqual(row.features.plan_steps, 7);
  assert.strictEqual(row.features.plan_files, 2);
  assert.deepStrictEqual(row.actual.tokens, { 'test-sonnet': { input: 100, cache_write: 0, cache_read: 0, output: 10 } });
  near(row.actual.cost_usd, 0.0003);
  assert.deepStrictEqual(row.actual.local, {
    calls: 5, success: 5, steps: 4, steps_clean: 1, model_s: null,
    fallbacks: { total: 3, estimated: true, invalid_json: 1, typecheck: 1, unmapped: 1 },
  });
});

test('mapFallbackReason: kulcsszavas leképezés', () => {
  const m = collect.mapFallbackReason;
  assert.strictEqual(m('érvénytelen JSON'), 'invalid_json');
  assert.strictEqual(m('típushiba/lint'), 'typecheck');
  assert.strictEqual(m('meglévő teszt'), 'test');
  assert.strictEqual(m('teszt-API'), 'test');
  assert.strictEqual(m('API-használat'), 'api_misuse');
  assert.strictEqual(m('breaker nyitva'), 'breaker');
  assert.strictEqual(m('nem bontható'), 'unsplittable');
  assert.strictEqual(m('kézi javítás'), 'manual_edit');
  assert.strictEqual(m('írásjel'), 'unmapped');
});

// ---- estimate (ORD-377)

function estimateDir(name) {
  const dir = path.join(tmpRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const sampleEstimate = (story) => ({
  schema: 'estimate/v1',
  story,
  basis: 'history',
  confidence: 'normal',
  sample: { scope: 'project', project: 'ORD', n: 6, n_project: 6, k: 5, level: 'strict', sample_id: 'ORD:n6' },
  p50: { cost_usd: 3.1, wall_s: 5100 },
  p80: { cost_usd: 4.5, wall_s: 7200 },
});

test('estimate: az explicit --estimate-file a sorban megjelenik és a sor érvényes', () => {
  const dir = estimateDir('est-explicit');
  const file = path.join(dir, 'x.json');
  fs.writeFileSync(file, JSON.stringify(sampleEstimate('ORD-8')));
  const res = run(['--story', 'ORD-8', '--estimate-file', file, ...base]);
  const [row] = rowsOf(res);
  assert.strictEqual(row.estimate.schema, 'estimate/v1');
  assert.strictEqual(row.estimate.p50.cost_usd, 3.1);
  assert.strictEqual(row.estimate.sample.sample_id, 'ORD:n6');
  assert.deepStrictEqual(validateRow(row, schema), []);
});

test('estimate: a terv melletti <STORY>-estimate.json automatikusan megtalálódik', () => {
  const dir = estimateDir('est-auto');
  const plan = path.join(dir, 'ORD-8-plan.md');
  fs.writeFileSync(plan, '<!-- plan-meta: steps=3 files=2 -->\n');
  fs.writeFileSync(path.join(dir, 'ORD-8-estimate.json'), JSON.stringify(sampleEstimate('ORD-8')));
  const [row] = rowsOf(run(['--story', 'ORD-8', '--plan-file', plan, ...base]));
  assert.strictEqual(row.estimate.basis, 'history');
  assert.strictEqual(row.features.plan_steps, 3);
});

test('estimate: eltérő story null és figyelmeztetés', () => {
  const dir = estimateDir('est-mismatch');
  const file = path.join(dir, 'x.json');
  fs.writeFileSync(file, JSON.stringify(sampleEstimate('ORD-99')));
  const res = run(['--story', 'ORD-8', '--estimate-file', file, ...base]);
  assert.strictEqual(rowsOf(res)[0].estimate, null);
  assert.ok(/más story-hoz/.test(res.err), res.err);
});

test('estimate: hiányzó fájl null, figyelmeztetés nélkül', () => {
  const dir = estimateDir('est-missing');
  const plan = path.join(dir, 'ORD-8-plan.md');
  fs.writeFileSync(plan, '<!-- plan-meta: steps=3 files=2 -->\n');
  let res = run(['--story', 'ORD-8', '--plan-file', plan, ...base]);
  assert.strictEqual(rowsOf(res)[0].estimate, null);
  assert.ok(!/estimate/.test(res.err), res.err);
  res = run(['--story', 'ORD-8', '--estimate-file', path.join(dir, 'nincs.json'), ...base]);
  assert.strictEqual(rowsOf(res)[0].estimate, null);
  assert.ok(!/estimate/.test(res.err), res.err);
});

test('estimate: olvashatatlan fájl figyelmeztetést ad; az exportok megvannak', () => {
  const dir = estimateDir('est-broken');
  const file = path.join(dir, 'x.json');
  fs.writeFileSync(file, '{nem json');
  const res = run(['--story', 'ORD-8', '--estimate-file', file, ...base]);
  assert.strictEqual(rowsOf(res)[0].estimate, null);
  assert.ok(/olvashatatlan estimate-fájl/.test(res.err), res.err);
  assert.strictEqual(typeof collect.loadEstimate, 'function');
  assert.strictEqual(typeof collect.configValue, 'function');
  assert.strictEqual(typeof collect.buildFingerprint, 'function');
});

console.log(`${passed} passed, ${failed} failed`);
try {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
} catch (e) {
  /* nem kritikus */
}
if (failed > 0) process.exit(1);
