#!/usr/bin/env node
/**
 * dev-workflow (ORD-376, 4.27.0)
 *
 * Futási metrika gyűjtése (run-metrics/v1): egy story (vagy egy epic overhead-je) tényleges
 * erőforrás-felhasználását összegzi a Claude Code transcriptekből (fő szál + subagentek),
 * a helyi modell naplójából, a tervből és (opcionálisan) a GitLab CI-ból, és egy sort ír a
 * közös store-ba. Metrikába csak szám, logikai érték és azonosító kerül, szöveg soha.
 *
 * Használat:
 *   node collect-run-metrics.js --story <ID> --sessions <id,id> [kapcsolók]
 *   node collect-run-metrics.js --story <ID> --sessions <id> --window <STORY>=<ISO>..<ISO> [--window ...] [--alias <SUBTASK>=<STORY> ...]
 *   node collect-run-metrics.js --kind epic_overhead --epic <ID> --sessions <id,id> [--stories <ID,ID>]
 *   node collect-run-metrics.js --backfill <munkamappa> [--sessions <id,id>] [--stories <ID,ID>]
 *
 * Kapcsolók:
 *   --story <ID>          a story kulcsa (kötelező, ha --kind story)
 *   --sessions <a,b>      a Claude Code session-azonosítók (a <projects-dir>/<id>.jsonl alapján)
 *   --since/--until <ISO> a fő szál story-ablaka (felülírja a mark_chapter-ablakokat)
 *   --window <S>=<ISO>..<ISO> a story fő szálának explicit ablaka (ismételhető; félig nyitott [tól, ig);
 *                         az időpontok időzónát hordoznak (`Z` vagy `±hh:mm`), különben hiba;
 *                         átfedő ablakok hiba; felülírja a --since/--until és a mark_chapter ablakot)
 *   --alias <SUB>=<S>     a sub-task kulccsal indított subagent a storyhoz számít (ismételhető)
 *   --features-file <f>  a hívó által előállított jellemzők (JSON); nincs tracker-hívás
 *   --plan-file <f>       a terv; első sora lehet `<!-- plan-meta: steps=N files=M -->`
 *   --estimate-file <f>   a jóváhagyáskor mentett becslés (estimate-run.js --out); a sor `estimate` mezőjébe
 *                         kerül. Nélküle, `--plan-file` mellett a terv melletti <STORY>-estimate.json
 *   --mr <iid>            GitLab MR (a CI-adatok `glab api`-ból; hiba esetén ci: null)
 *   --local-log <f,f|dir> a call-local-model.sh naplója(i)
 *   --store <f>           a store (alap: RUN_METRICS_STORE, majd ~/.dev-workflow/metrics/runs.jsonl)
 *   --epic <ID>           az epic kulcsa    --kind story|epic_overhead (alap: story)
 *   --project <P>         alap: a story/epic kulcs előtagja
 *   --gpu <név>           alap: LOCAL_HW_PROFILE
 *   --force               meglévő (project, story, kind) sor felülírása
 *   --backfill <mappa>    korábbi futás visszamenőleges felvétele (lásd a fájl alján)
 *   --projects-dir <d>    alap: ~/.claude/projects/<a cwd kódolva>
 *   --pricing <f>         másik ártábla (tesztekhez)
 *   --dry-run             a sor(ok) stdout-ra, a store érintetlen
 *   --warn-only           hiba esetén is 0-val lép ki (a figyelmeztetés stderr-re megy)
 *
 * epic_overhead: a storykhoz nem rendelt maradék (ablakon kívüli fő szál, nem rendelt vagy nem
 * listázott story-hoz tartozó subagent). A --window ablakai itt is érvényesek; a --since/--until
 * csak pontosan egy listázott storynál. Tracker szülő-mező feloldás nincs, csak --alias.
 *
 * Korlát: --window nélkül párhuzamos (átfedő ablakú) storyknál a fő szál hívásai mindkét storyhoz
 * beszámítanak (ORD-376 review, Minor 2); explicit --window ablakokkal ez megszűnik (az átfedés hiba).
 * Ha egy agent leírása két listázott storyt említ, a story- és az overhead-sor eltérően dönthet.
 *
 * Kilépési kódok: 0 siker (vagy --warn-only); 1 hiba (érvénytelen sor, hiányzó bemenet).
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const pricingLib = require('../../../tools/session-cost-report/pricing.js');
const { validateRow, loadSchema } = require('./validate-run-metrics.js');

const ID_CHARS = /[^A-Za-z0-9_.:/+-]/g;
const BOOLEAN_FLAGS = ['force', 'dry-run', 'warn-only'];
const REPEATABLE_FLAGS = ['window', 'alias'];

// ---------------------------------------------------------------- általános segédek

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`ismeretlen argumentum: ${a}`);
    const key = a.slice(2);
    if (BOOLEAN_FLAGS.includes(key)) {
      opts[key] = true;
    } else {
      if (i + 1 >= argv.length) throw new Error(`hiányzó érték: ${a}`);
      const value = argv[++i];
      if (REPEATABLE_FLAGS.includes(key)) (opts[key] = opts[key] || []).push(value);
      else opts[key] = value;
    }
  }
  return opts;
}

// Azonosító-mintára szűrés: a szóköz `_`, a többi tiltott karakter elhagyva, max. 64 karakter.
function sanitizeId(value) {
  return String(value).replace(/\s+/g, '_').replace(ID_CHARS, '').slice(0, 64);
}

function sanitizeDeep(value) {
  if (typeof value === 'string') return sanitizeId(value);
  if (Array.isArray(value)) return value.map(sanitizeDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[sanitizeId(k)] = sanitizeDeep(value[k]);
    return out;
  }
  return value;
}

const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
const secBetween = (a, b) => Math.max(0, round((b - a) / 1000, 1));
const iso = (ms) => new Date(ms).toISOString();

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Story-azonosító szóhatárral: `ORD-8` nem egyezik az `ORD-82`-vel.
function mentionsStory(text, story) {
  return new RegExp(`(?<![A-Za-z0-9-])${escapeRe(story)}(?![0-9])`).test(text || '');
}

function firstStoryId(text) {
  const m = /(?<![A-Za-z0-9-])[A-Z][A-Z0-9]*-\d+(?![0-9])/.exec(text || '');
  return m ? m[0] : null;
}

// Minden kulcsszerű token a szövegben, opcionálisan projekt-előtagra szűrve (a `UTF-8`,
// `SHA-256` és hasonló tokenek így nem számítanak story-azonosítónak).
function storyIdsIn(text, prefix) {
  const ids = (text || '').match(/(?<![A-Za-z0-9-])[A-Z][A-Z0-9]*-\d+(?![0-9])/g) || [];
  return prefix ? ids.filter((id) => id.startsWith(`${prefix}-`)) : ids;
}

function projectOf(opts, story, epic) {
  if (opts.project) return sanitizeId(opts.project);
  const key = story || epic || '';
  const m = /^([A-Za-z][A-Za-z0-9]*)-\d+$/.exec(key);
  return m ? m[1] : 'unknown';
}

// A Claude Code a cwd-ből képzi a projekt-mappa nevét: minden nem alfanumerikus karakter '-'.
function encodeCwd(cwd) {
  return String(cwd).replace(/[^A-Za-z0-9]/g, '-');
}

function defaultProjectsDir() {
  return path.join(os.homedir(), '.claude', 'projects', encodeCwd(process.cwd()));
}

function resolveStorePath(opts) {
  let p = opts.store || process.env.RUN_METRICS_STORE || '~/.dev-workflow/metrics/runs.jsonl';
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) p = path.join(os.homedir(), p.slice(1));
  return path.resolve(p);
}

// ---------------------------------------------------------------- konfig és ujjlenyomat

function configValue(key, def) {
  if (process.env[key]) return process.env[key];
  const script = path.join(__dirname, 'config-value.sh');
  const cfgFile = process.env.DEV_WORKFLOW_CONFIG || path.join(__dirname, '..', 'config.md');
  if (!fs.existsSync(script) || !fs.existsSync(cfgFile)) return def;
  try {
    const out = execFileSync('bash', [script, key, def], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.trim();
  } catch (e) {
    return def;
  }
}

function dwVersion() {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const stamp = path.join(dir, '.dev-workflow-version');
    if (fs.existsSync(stamp)) return sanitizeId(fs.readFileSync(stamp, 'utf8').trim());
    const ver = path.join(dir, 'VERSION');
    if (fs.existsSync(ver) && fs.existsSync(path.join(dir, 'dev-workflow-manifest.json'))) {
      return sanitizeId(fs.readFileSync(ver, 'utf8').trim());
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return '';
}

function buildFingerprint(opts, localRows) {
  let model = process.env.LOCAL_MODEL_NAME || '';
  if (!model && localRows && localRows.length) {
    const counts = {};
    for (const r of localRows) if (r.model) counts[r.model] = (counts[r.model] || 0) + 1;
    model = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || '';
  }
  const raw = {
    dw_version: dwVersion(),
    workflow_profile: configValue('WORKFLOW_PROFILE', ''),
    epic_story_host: configValue('EPIC_STORY_HOST', ''),
    local_executor_host: configValue('LOCAL_EXECUTOR_HOST', ''),
    local_model: model,
    gpu: opts.gpu || configValue('LOCAL_HW_PROFILE', ''),
    ci_runner: configValue('CI_RUNNER_TAG', ''),
  };
  const fp = {};
  for (const k of Object.keys(raw)) {
    const v = sanitizeId(raw[k]);
    if (v) fp[k] = v;
  }
  return fp;
}

const TZ_SUFFIX = /(Z|[+-]\d{2}:\d{2})$/;

// --window <STORY>=<ISO-tól>..<ISO-ig> értékek: story -> ablakok (ms, félig nyitott [tól, ig)).
// Átfedő ablakok (bármely két ablak között, ugyanannak a storynak is) hibát adnak.
function parseWindowSpecs(specs) {
  const map = new Map();
  const all = [];
  for (const spec of specs || []) {
    const eq = String(spec).indexOf('=');
    if (eq < 0) throw new Error(`hibás --window (hiányzó =): ${spec}`);
    const story = sanitizeId(spec.slice(0, eq));
    if (!story) throw new Error(`hibás --window (üres story-kulcs): ${spec}`);
    const range = spec.slice(eq + 1);
    const dots = range.indexOf('..');
    if (dots < 0) throw new Error(`hibás --window (hiányzó ..): ${spec}`);
    const startStr = range.slice(0, dots);
    const endStr = range.slice(dots + 2);
    const start = Date.parse(startStr);
    const end = Date.parse(endStr);
    if (isNaN(start) || isNaN(end)) throw new Error(`hibás --window (érvénytelen dátum): ${spec}`);
    // Az időpont kötelezően időzónát hordoz (`Z` vagy `±hh:mm`): a hiányzó zóna a gép helyi idejeként
    // értelmeződne, és gépenként eltérő ablakot adna.
    if (!TZ_SUFFIX.test(startStr) || !TZ_SUFFIX.test(endStr)) {
      throw new Error(`hibás --window (az időpont időzónát kér: Z vagy ±hh:mm): ${spec}`);
    }
    if (end <= start) throw new Error(`hibás --window (a vég nem későbbi a kezdetnél): ${spec}`);
    for (const o of all) {
      if (start < o.end && o.start < end) throw new Error(`átfedő --window ablakok: ${o.story} és ${story}`);
    }
    all.push({ story, start, end });
    if (!map.has(story)) map.set(story, []);
    map.get(story).push({ start, end });
  }
  return map;
}

// --alias <SUBTASK>=<STORY> értékek: { subtask: story }.
function parseAliasSpecs(specs) {
  const out = {};
  for (const spec of specs || []) {
    const eq = String(spec).indexOf('=');
    if (eq < 0) throw new Error(`hibás --alias (hiányzó =): ${spec}`);
    const sub = sanitizeId(spec.slice(0, eq));
    const story = sanitizeId(spec.slice(eq + 1));
    if (!sub || !story) throw new Error(`hibás --alias (üres oldal): ${spec}`);
    if (sub === story) throw new Error(`hibás --alias (önmagára mutat): ${spec}`);
    if (out[sub] !== undefined && out[sub] !== story) throw new Error(`ütköző --alias: ${sub} két storyhoz tartozna (${out[sub]}, ${story})`);
    out[sub] = story;
  }
  return out;
}

// ---------------------------------------------------------------- transcriptek

// Egy JSONL transcript: usage-rekordok (deduplikálva), mark_chapter jelölők, tömörítés-határok.
function readTranscript(file) {
  const out = { records: [], chapters: [], compactions: [], first: null, last: null };
  const raw = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    let j;
    try {
      j = JSON.parse(line);
    } catch (e) {
      continue;
    }
    const ts = j.timestamp ? Date.parse(j.timestamp) : NaN;
    if (!isNaN(ts)) {
      if (out.first === null || ts < out.first) out.first = ts;
      if (out.last === null || ts > out.last) out.last = ts;
    }
    if (isNaN(ts)) continue;
    if (j.type === 'system' && j.subtype === 'compact_boundary') out.compactions.push(ts);
    if (j.type !== 'assistant' || !j.message) continue;
    const content = Array.isArray(j.message.content) ? j.message.content : [];
    for (const block of content) {
      if (block && block.type === 'tool_use' && /mark_chapter$/.test(block.name || '')) {
        out.chapters.push({ ts, title: String((block.input && block.input.title) || '') });
      }
    }
    if (j.message.usage && j.message.model && j.message.model !== '<synthetic>') {
      raw.push({ ts, model: j.message.model, usage: j.message.usage, dedupeKey: pricingLib.dedupeKeyOf(j) });
    }
  }
  out.records = pricingLib.dedupeRecords(raw).records;
  return out;
}

function loadSession(projectsDir, sid, warnings) {
  const mainFile = path.join(projectsDir, `${sid}.jsonl`);
  const session = { id: sid, main: null, agents: [] };
  if (fs.existsSync(mainFile)) session.main = readTranscript(mainFile);
  else warnings.push(`hiányzó fő transcript: ${mainFile}`);
  const subDir = path.join(projectsDir, sid, 'subagents');
  if (fs.existsSync(subDir)) {
    for (const f of fs.readdirSync(subDir).sort()) {
      const m = /^agent-(.+)\.jsonl$/.exec(f);
      if (!m) continue;
      let meta = {};
      const metaFile = path.join(subDir, `agent-${m[1]}.meta.json`);
      if (fs.existsSync(metaFile)) {
        try {
          meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
        } catch (e) {
          warnings.push(`olvashatatlan meta.json: agent-${m[1]}`);
        }
      }
      session.agents.push({ id: m[1], meta, tr: readTranscript(path.join(subDir, f)) });
    }
  }
  return session;
}

// Az agent story-ja: a leírásban említett jelölt story (szóhatárral), ennek hiányában a
// szülő-lánc első találata. Jelölt-lista nélkül az első kulcsszerű token (régi viselkedés).
// Az `aliases` ({sub-task: story}) a story-említés után, a szülő-lánc előtt számít (ORD-387).
function storyOfAgent(agent, byId, candidates, depth = 0, aliases = null) {
  const desc = agent.meta.description;
  const own = candidates ? candidates.find((s) => mentionsStory(desc, s)) : firstStoryId(desc);
  if (own) return own;
  if (aliases) {
    for (const key of Object.keys(aliases)) {
      if (!mentionsStory(desc, key)) continue;
      const target = aliases[key];
      if (!candidates || candidates.includes(target)) return target;
    }
  }
  const parent = agent.meta.parentAgentId && byId[agent.meta.parentAgentId];
  if (parent && depth < 10) return storyOfAgent(parent, byId, candidates, depth + 1, aliases);
  return null;
}

function phaseOfAgent(meta) {
  const type = meta.agentType || '';
  const desc = meta.description || '';
  if (type === 'architect') return 'architect';
  if (type === 'qa-tester') return 'qa';
  if (type === 'code-reviewer') return 'review';
  if (type === 'implementer' || type === 'local-runner') return 'implement';
  if (type === 'general-purpose' && /^story-runner/i.test(desc)) return 'implement';
  return null;
}

// A fő szál story-ablakai: --window > --since/--until > mark_chapter-ablakok > a story subagentjeinek első/utolsó ideje.
function storyWindows(story, sessions, storyAgents, opts) {
  // az explicit --window ablak vége nem kap +1-et (félig nyitott [tól, ig)); a --since/--until ág
  // viszont end + 1 (a megadott végpont még az ablakba esik)
  if (opts.windowMap && opts.windowMap.has(story)) return opts.windowMap.get(story).map((w) => ({ start: w.start, end: w.end }));
  const mains = sessions.filter((s) => s.main && s.main.first !== null);
  const lo = mains.length ? Math.min(...mains.map((s) => s.main.first)) : null;
  const hi = mains.length ? Math.max(...mains.map((s) => s.main.last)) : null;
  if (opts.since || opts.until) {
    const start = opts.since ? Date.parse(opts.since) : lo;
    const end = opts.until ? Date.parse(opts.until) : hi;
    return start === null || end === null ? [] : [{ start, end: end + 1 }];
  }
  const windows = [];
  for (const s of mains) {
    const chapters = s.main.chapters.slice().sort((a, b) => a.ts - b.ts);
    chapters.forEach((c, i) => {
      if (!mentionsStory(c.title, story)) return;
      const next = chapters[i + 1];
      windows.push({ start: c.ts, end: next ? next.ts : s.main.last + 1 });
    });
  }
  if (windows.length) return windows;
  if (storyAgents.length) {
    // az architect-tervek gyakran korábban, másik story futása közben készülnek: az ablak a runnertől indul
    const runners = storyAgents.filter((a) => phaseOfAgent(a.meta) === 'implement');
    const from = runners.length ? runners : storyAgents;
    return [{ start: Math.min(...from.map((a) => a.tr.first)), end: Math.max(...storyAgents.map((a) => a.tr.last)) + 1 }];
  }
  return [];
}

const inWindows = (ts, windows) => windows.some((w) => ts >= w.start && ts < w.end);

// ---------------------------------------------------------------- költség

function emptyTokens() {
  return { input: 0, cache_write: 0, cache_read: 0, output: 0 };
}

// Rekordok összegzése: tokenek modellenként, költség, becsült-e a költség.
function summarize(recs, pricing) {
  const tokens = {};
  let cost = 0;
  let estimated = !pricing.verified;
  let total = 0;
  for (const r of recs) {
    const c = pricingLib.costOfRecord(pricing, r);
    const t = (tokens[r.model] = tokens[r.model] || emptyTokens());
    t.input += c.input;
    t.cache_write += c.cacheWrite;
    t.cache_read += c.cacheRead;
    t.output += c.output;
    total += c.input + c.cacheWrite + c.cacheRead + c.output;
    cost += c.cost;
    if (!c.cacheSplitKnown || c.unknownModel) estimated = true;
  }
  return { tokens, cost_usd: round(cost, 4), estimated, total };
}

// ---------------------------------------------------------------- helyi modell napló, terv, CI

function readLocalRows(spec, warnings) {
  const files = [];
  for (const p of String(spec).split(',').filter(Boolean)) {
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      for (const f of fs.readdirSync(p).sort()) if (f.endsWith('.jsonl')) files.push(path.join(p, f));
    } else if (fs.existsSync(p)) {
      files.push(p);
    } else {
      warnings.push(`hiányzó helyi napló: ${p}`);
    }
  }
  const rows = [];
  for (const f of files) {
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        rows.push(JSON.parse(line));
      } catch (e) {
        /* sérült sor: kihagyva */
      }
    }
  }
  return rows;
}

// A helyi napló összegzése. Ha vannak sub-task azonosítók, csak a story/sub-task `ticket`-ű
// és a ticket nélküli sorok számítanak; sub-task lista nélkül minden sor (a hívó a megfelelő naplót adja).
function summarizeLocal(rows, story, subtaskIds) {
  const allowed = subtaskIds.length ? new Set([story, ...subtaskIds]) : null;
  const mine = rows.filter((r) => {
    if (r.dry_run === true) return false;
    if (!allowed || !r.ticket) return true;
    return allowed.has(r.ticket);
  });
  const local = { calls: 0, success: 0, fallbacks: { total: 0 }, model_s: null };
  const anomalies = new Set();
  let ms = 0;
  let haveMs = false;
  for (const r of mine) {
    if (r.event === 'fallback') {
      const code = sanitizeId(r.fallback_reason || 'unmapped') || 'unmapped';
      local.fallbacks[code] = (local.fallbacks[code] || 0) + 1;
      local.fallbacks.total += 1;
      if (code === 'breaker') anomalies.add('breaker_open');
      if (code === 'invalid_json') anomalies.add('invalid_json');
      if (code === 'unreachable') anomalies.add('unreachable');
      continue;
    }
    if (!r.outcome) continue;
    if (r.outcome === 'breaker_open') {
      anomalies.add('breaker_open');
      continue;
    }
    local.calls += 1;
    if (r.outcome === 'success') local.success += 1;
    if (r.outcome === 'hard_error') anomalies.add('unreachable');
    if (typeof r.duration_ms === 'number') {
      ms += r.duration_ms;
      haveMs = true;
    }
  }
  if (haveMs) local.model_s = round(ms / 1000, 1);
  return { local, anomalies: [...anomalies], rows: mine };
}

function parsePlanMeta(file) {
  const text = fs.readFileSync(file, 'utf8');
  const m = /<!--\s*plan-meta:\s*([^>]*?)\s*-->/.exec(text);
  if (!m) return null;
  const steps = /steps=(\d+)/.exec(m[1]);
  const files = /files=(\d+)/.exec(m[1]);
  const out = {};
  if (steps) out.plan_steps = Number(steps[1]);
  if (files) out.plan_files = Number(files[1]);
  return out;
}

function glabJson(args) {
  const bin = process.env.GLAB_BIN || 'glab';
  return JSON.parse(execFileSync(bin, ['api', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
}

// CI-adatok az MR pipeline-jaiból; bármilyen hibánál null + figyelmeztetés.
function collectCi(mr, warnings) {
  try {
    const list = glabJson([`projects/:id/merge_requests/${Number(mr)}/pipelines`]);
    let run = 0;
    let queue = 0;
    for (const p of list) {
      const d = glabJson([`projects/:id/pipelines/${Number(p.id)}`]);
      run += d.duration || 0;
      queue += d.queued_duration || 0;
    }
    return { pipelines: list.length, mr_pipelines: list.length, run_s: Math.round(run), queue_s: Math.round(queue) };
  } catch (e) {
    warnings.push(`CI-adat nem érhető el (glab): ${e.code || e.message}`);
    return null;
  }
}

// ---------------------------------------------------------------- sorok építése

function loadPricingInfo(opts) {
  const file = opts.pricing || undefined;
  const pricing = pricingLib.loadPricing(file);
  const raw = file ? fs.readFileSync(file, 'utf8') : undefined;
  return { pricing, version: sanitizeId(pricingLib.priceTableVersion(pricing, raw)) };
}

function buildStoryRow(opts, sessions, info, warnings, extra = {}) {
  const story = opts.story;
  const byId = {};
  for (const s of sessions) for (const a of s.agents) byId[a.id] = a;
  const agents = [];
  for (const s of sessions) for (const a of s.agents) if (storyOfAgent(a, byId, [story], 0, opts.aliasMap || null) === story) agents.push(a);
  const windows = storyWindows(story, sessions, agents, opts);
  if (!windows.length && !agents.length) warnings.push(`nincs adat a(z) ${story} storyhoz`);

  const reviewers = agents.filter((a) => phaseOfAgent(a.meta) === 'review').sort((a, b) => a.tr.first - b.tr.first);
  const firstReviewEnd = reviewers.length ? reviewers[0].tr.last : null;

  const phases = {};
  const addPhase = (name, recs, wall) => {
    const p = (phases[name] = phases[name] || { recs: [], wall: 0, hasWall: true });
    p.recs.push(...recs);
    if (wall === null) p.hasWall = false;
    else p.wall += wall;
  };
  for (const a of agents) {
    let phase = phaseOfAgent(a.meta);
    if (!phase) {
      warnings.push(`ismeretlen fázis (orchestration_main): ${sanitizeId(a.meta.agentType || '?')} agent-${a.id}`);
      addPhase('orchestration_main', a.tr.records, null);
      continue;
    }
    if (phase === 'implement' && firstReviewEnd !== null) {
      addPhase('implement', a.tr.records.filter((r) => r.ts <= firstReviewEnd), secBetween(a.tr.first, Math.min(a.tr.last, firstReviewEnd)));
      const after = a.tr.records.filter((r) => r.ts > firstReviewEnd);
      if (after.length) addPhase('fix', after, secBetween(Math.max(a.tr.first, firstReviewEnd), a.tr.last));
      continue;
    }
    addPhase(phase, a.tr.records, secBetween(a.tr.first, a.tr.last));
  }
  const mainRecs = [];
  const compactions = [];
  for (const s of sessions) {
    if (!s.main) continue;
    mainRecs.push(...s.main.records.filter((r) => inWindows(r.ts, windows)));
    compactions.push(...s.main.compactions.filter((t) => inWindows(t, windows)));
  }
  if (mainRecs.length) addPhase('orchestration_main', mainRecs, null);

  const all = [];
  const byPhase = {};
  for (const name of ['architect', 'implement', 'qa', 'review', 'fix', 'orchestration_main']) {
    const p = phases[name];
    if (!p) continue;
    const sum = summarize(p.recs, info.pricing);
    all.push(...p.recs);
    byPhase[name] = { tokens: sum.total, cost_usd: sum.cost_usd, wall_s: p.hasWall ? round(p.wall, 1) : null };
  }
  const total = summarize(all, info.pricing);

  // a falióra az ablakokból (ezek tartalmazzák a runner-t és az utána jövőket), ablak híján a subagentekből
  const starts = windows.length ? windows.map((w) => w.start) : agents.map((a) => a.tr.first);
  const ends = windows.length ? windows.map((w) => w.end - 1) : agents.map((a) => a.tr.last);
  const wall = starts.length ? secBetween(Math.min(...starts), Math.max(...ends)) : 0;

  const features = extra.features || {};
  const actual = {
    wall_clock_s: wall,
    active_agent_s: wall,
    active_estimated: true,
    tokens: total.tokens,
    cost_usd: total.cost_usd,
    cost_estimated: total.estimated,
    by_phase: byPhase,
    rounds: { fix: Math.max(0, reviewers.length - 1), review: reviewers.length, qa: agents.filter((a) => phaseOfAgent(a.meta) === 'qa').length },
  };
  const anomalies = new Set();
  if (compactions.length) anomalies.add('context_compaction');

  let localRows = [];
  if (extra.localRows) {
    const ids = (features.subtasks || []).map((t) => t && t.id).filter(Boolean);
    const res = summarizeLocal(extra.localRows, story, ids);
    localRows = res.rows;
    if (res.rows.length) actual.local = res.local;
    res.anomalies.forEach((x) => anomalies.add(x));
  }
  if (opts.mr) {
    actual.mr_iid = Number(opts.mr);
    actual.ci = collectCi(opts.mr, warnings);
  }
  return {
    schema: 'run-metrics/v1',
    recorded_at: new Date().toISOString(),
    dw_version: dwVersion(),
    project: projectOf(opts, story, opts.epic),
    epic: opts.epic ? sanitizeId(opts.epic) : null,
    story: sanitizeId(story),
    kind: 'story',
    backfilled: Boolean(extra.backfilled),
    price_table_version: info.version,
    features,
    fingerprint: buildFingerprint(opts, localRows),
    actual,
    anomalies: [...anomalies],
    estimate: extra.estimate || null,
  };
}

// A storyhoz nem rendelhető költség: a story-ablakokon kívüli fő-szál hívások és a story nélküli
// (vagy nem listázott story-hoz rendelt) subagentek.
// Ismert korlát: ha egy agent leírása két listázott storyt említ, a story-sor és az overhead-sor
// eltérően dönthet (mindkettő az első egyezést veszi a saját listájából), így az összeg-invariáns sérülhet.
function buildOverheadRow(opts, sessions, info, warnings, extra = {}) {
  const byId = {};
  for (const s of sessions) for (const a of s.agents) byId[a.id] = a;
  // story-jelöltek: a --stories lista és a leírások epic-előtagú tokenjei (a `UTF-8`-féle tokenek
  // így nem számítanak story-nak); a story-ablakokat a --stories lista adja, ha meg van adva
  const listed = opts.stories ? opts.stories.split(',').filter(Boolean) : [];
  const prefix = opts.epic ? opts.epic.split('-')[0] : null;
  const aliasMap = opts.aliasMap || null;
  const windowMap = opts.windowMap || null;
  const found = new Set(listed);
  for (const s of sessions) for (const a of s.agents) for (const id of storyIdsIn(a.meta.description, prefix)) found.add(id);
  if (opts.epic) found.delete(opts.epic);
  // a sub-task kulcsok (alias-kulcsok) nem story-jelöltek; az explicit ablakok storyjai és az alias-célok azok
  if (aliasMap) {
    for (const k of Object.keys(aliasMap)) found.delete(k);
    for (const v of Object.values(aliasMap)) found.add(v);
  }
  if (windowMap) for (const k of windowMap.keys()) found.add(k);
  const candidates = [...found];
  const storyOf = new Map();
  for (const s of sessions) for (const a of s.agents) storyOf.set(a, storyOfAgent(a, byId, candidates, 0, aliasMap));
  const baseStories = listed.length ? listed : [...new Set([...storyOf.values()].filter(Boolean))];
  const stories = [...new Set([...baseStories, ...(windowMap ? windowMap.keys() : [])])];

  // a --since/--until csak pontosan egy listázott storynál érvényes (egy ablak több storyra nem értelmezhető)
  const manual = {};
  if (opts.since || opts.until) {
    if (stories.length === 1) Object.assign(manual, { since: opts.since, until: opts.until });
    else warnings.push('a --since/--until az epic_overhead-ben több storynál figyelmen kívül marad');
  }
  const allWindows = [];
  for (const st of stories) {
    const agents = [...storyOf.entries()].filter(([, v]) => v === st).map(([a]) => a);
    allWindows.push(...storyWindows(st, sessions, agents, Object.assign({ windowMap }, manual)));
  }
  const recs = [];
  const compactions = [];
  let span = 0;
  for (const s of sessions) {
    if (!s.main) continue;
    recs.push(...s.main.records.filter((r) => !inWindows(r.ts, allWindows)));
    compactions.push(...s.main.compactions.filter((t) => !inWindows(t, allWindows)));
    if (s.main.first !== null) {
      const covered = allWindows
        .map((w) => ({ start: Math.max(w.start, s.main.first), end: Math.min(w.end, s.main.last) }))
        .filter((w) => w.end > w.start)
        .sort((a, b) => a.start - b.start);
      let union = 0;
      let cur = null;
      for (const w of covered) {
        if (cur && w.start <= cur.end) cur.end = Math.max(cur.end, w.end);
        else {
          if (cur) union += cur.end - cur.start;
          cur = { start: w.start, end: w.end };
        }
      }
      if (cur) union += cur.end - cur.start;
      span += s.main.last - s.main.first - union;
    }
  }
  for (const [a, st] of storyOf) {
    if (st && stories.includes(st)) continue;
    if (st) warnings.push(`nem listázott story-hoz rendelt subagent az epic_overhead-ben: agent-${a.id}`);
    else warnings.push(`story nélküli subagent az epic_overhead-ben: agent-${a.id}`);
    recs.push(...a.tr.records);
  }
  const sum = summarize(recs, info.pricing);
  const anomalies = compactions.length ? ['context_compaction'] : [];
  return {
    schema: 'run-metrics/v1',
    recorded_at: new Date().toISOString(),
    dw_version: dwVersion(),
    project: projectOf(opts, null, opts.epic),
    epic: sanitizeId(opts.epic),
    story: null,
    kind: 'epic_overhead',
    backfilled: Boolean(extra.backfilled),
    price_table_version: info.version,
    features: {},
    fingerprint: buildFingerprint(opts, []),
    actual: { wall_clock_s: Math.max(0, round(span / 1000, 1)), tokens: sum.tokens, cost_usd: sum.cost_usd, cost_estimated: sum.estimated },
    anomalies,
    estimate: null,
  };
}

// A jellemzők: a hívó features-fájlja + a terv plan-meta sora (az utóbbi mérés, ezért felülír).
function loadFeatures(opts, warnings) {
  let features = {};
  if (opts['features-file']) {
    try {
      features = sanitizeDeep(JSON.parse(fs.readFileSync(opts['features-file'], 'utf8')));
    } catch (e) {
      warnings.push(`olvashatatlan features-fájl: ${e.message}`);
    }
  }
  if (opts['plan-file'] && fs.existsSync(opts['plan-file'])) {
    const meta = parsePlanMeta(opts['plan-file']);
    if (meta) {
      Object.assign(features, meta);
      if (Array.isArray(features.estimated)) {
        features.estimated = features.estimated.filter((k) => !(k in meta));
        if (!features.estimated.length) delete features.estimated;
      }
    }
  }
  return features;
}

// A jóváhagyáskor mentett becslés (estimate-run.js --out): --estimate-file, ennek híján a terv melletti
// <story>-estimate.json. A hiányzó fájl nem hiba; olvashatatlan, nem objektum vagy más story-hoz tartozó
// fájl figyelmeztetést ad (és null-t).
function loadEstimate(opts, story, warnings) {
  let file = opts['estimate-file'];
  if (!file && opts['plan-file']) {
    file = path.join(path.dirname(opts['plan-file']), `${sanitizeId(story)}-estimate.json`);
  }
  if (!file) return null;
  if (!fs.existsSync(file)) return null;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    warnings.push(`olvashatatlan estimate-fájl: ${e.message}`);
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    warnings.push('az estimate-fájl nem objektum');
    return null;
  }
  if (data.story !== story) {
    warnings.push(`az estimate-fájl más story-hoz tartozik (${sanitizeId(data.story)} != ${story})`);
    return null;
  }
  return sanitizeDeep(data);
}

// ---------------------------------------------------------------- store

function storeKey(row) {
  return `${row.project}|${row.kind === 'epic_overhead' ? row.epic : row.story}|${row.kind}`;
}

function readStoreLines(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
}

// Sorok írása: érvénytelen sor nem íródik; meglévő kulcs --force nélkül marad. Visszaadja a hibák/kihagyások számát.
function writeRows(rows, opts, warnings) {
  const schema = loadSchema();
  const valid = [];
  let errors = 0;
  for (const row of rows) {
    const errs = validateRow(row, schema);
    if (errs.length) {
      errors++;
      warnings.push(`érvénytelen sor (${row.kind} ${row.story || row.epic}): ${errs.slice(0, 5).join('; ')}`);
    } else {
      valid.push(row);
    }
  }
  if (opts['dry-run']) {
    for (const row of valid) process.stdout.write(JSON.stringify(row) + '\n');
    return { errors, written: 0 };
  }
  const store = resolveStorePath(opts);
  fs.mkdirSync(path.dirname(store), { recursive: true });
  const ignore = path.join(path.dirname(store), '.gitignore');
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '*\n');
  let lines = readStoreLines(store);
  let written = 0;
  for (const row of valid) {
    const key = storeKey(row);
    const idx = lines.findIndex((l) => {
      try {
        return storeKey(JSON.parse(l)) === key;
      } catch (e) {
        return false;
      }
    });
    if (idx >= 0 && !opts.force) {
      warnings.push(`már van sor (${key}); felülíráshoz --force kell`);
      continue;
    }
    if (idx >= 0) lines[idx] = JSON.stringify(row);
    else lines.push(JSON.stringify(row));
    written++;
  }
  if (written) fs.writeFileSync(store, lines.join('\n') + '\n');
  return { errors, written };
}

// ---------------------------------------------------------------- backfill

const LEGACY_DROP = ['notes', 'estimate_note', 'session_id'];

// Aggregált tokenekből költség (longContext nélkül: az aggregátum nem kérés-szintű).
function costOfTokens(pricing, model, t) {
  const rate = pricingLib.resolveRate(pricing, model).rate;
  return (t.input * rate.input + t.output * rate.output + t.cache_write * rate.cacheWrite + t.cache_read * rate.cacheRead) / 1e6;
}

// Importált (ORD-3-alakú) sor normalizálása: a régi költség eldobva és a mostani ártáblával újraszámolva.
function normalizeImportedRow(row, info, schema) {
  const allowed = Object.keys(schema.properties);
  const out = {};
  const src = Object.assign({}, row);
  if (src.backfill !== undefined && src.backfilled === undefined) src.backfilled = Boolean(src.backfill);
  delete src.backfill;
  for (const k of LEGACY_DROP) delete src[k];
  for (const k of allowed) if (src[k] !== undefined) out[k] = sanitizeDeep(src[k]);
  out.schema = 'run-metrics/v1';
  out.recorded_at = new Date().toISOString();
  out.backfilled = true;
  out.price_table_version = info.version;
  if (!out.features) out.features = {};
  if (out.estimate === undefined) out.estimate = null;
  const actual = out.actual;
  let storyCost = 0;
  let storyTokens = 0;
  for (const [model, t] of Object.entries(actual.tokens || {})) {
    storyCost += costOfTokens(info.pricing, model, t);
    storyTokens += t.input + t.cache_write + t.cache_read + t.output;
  }
  actual.cost_usd = round(storyCost, 4);
  actual.cost_estimated = true;
  for (const p of Object.values(actual.by_phase || {})) {
    p.cost_usd = storyTokens ? round(((p.tokens || 0) * storyCost) / storyTokens, 4) : 0;
  }
  return out;
}

function mapFallbackReason(text) {
  const t = String(text).toLowerCase();
  if (/json/.test(t)) return 'invalid_json';
  if (/typecheck|típus|tsc/.test(t)) return 'typecheck';
  if (/teszt|test/.test(t)) return 'test';
  if (/\bapi\b/.test(t)) return 'api_misuse';
  if (/breaker/.test(t)) return 'breaker';
  if (/nem bontható|split/.test(t)) return 'unsplittable';
  if (/kézi|manual/.test(t)) return 'manual_edit';
  return 'unmapped';
}

// A local-stats.md táblázatából egy story helyi összegzése (ORD-2-alakú: Story | Sub-task | Részlépés |
// Helyi hívás | Eredmény | Visszaesés Claude-ra | Ok).
function localFromStats(file, story) {
  const local = { calls: 0, success: 0, steps: 0, steps_clean: 0, fallbacks: { total: 0, estimated: true }, model_s: null };
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 7 || cells[0] !== story) continue;
    local.steps += 1;
    const calls = /^(\d+)/.exec(cells[3]);
    const n = calls ? Number(calls[1]) : 0;
    local.calls += n;
    if (/exit 0/.test(cells[3])) local.success += n;
    if (/^igen/i.test(cells[5])) {
      const code = mapFallbackReason(cells[6]);
      local.fallbacks[code] = (local.fallbacks[code] || 0) + 1;
      local.fallbacks.total += 1;
    } else {
      local.steps_clean += 1;
    }
  }
  return local.steps ? local : null;
}

function runBackfill(dir, opts, info, warnings) {
  const rows = [];
  const importFile = path.join(dir, 'metrics', 'runs.jsonl');
  if (fs.existsSync(importFile)) {
    const schema = loadSchema();
    for (const line of fs.readFileSync(importFile, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      rows.push(normalizeImportedRow(JSON.parse(line), info, schema));
    }
    return rows;
  }
  if (!opts.sessions) throw new Error('backfill transcriptből: a --sessions kötelező');
  const projectsDir = opts['projects-dir'] || defaultProjectsDir();
  const sessions = opts.sessions.split(',').filter(Boolean).map((s) => loadSession(projectsDir, s, warnings));
  let stories = opts.stories ? opts.stories.split(',').filter(Boolean) : [];
  if (!stories.length) {
    stories = fs.readdirSync(dir).map((f) => /^([A-Za-z][A-Za-z0-9]*-\d+)-plan\.md$/.exec(f)).filter(Boolean).map((m) => m[1]);
  }
  const statsFile = path.join(dir, 'local-stats.md');
  for (const story of stories) {
    const planFile = path.join(dir, `${story}-plan.md`);
    const o = Object.assign({}, opts, { story, 'plan-file': fs.existsSync(planFile) ? planFile : undefined });
    const row = buildStoryRow(o, sessions, info, warnings, { features: loadFeatures(o, warnings), backfilled: true });
    if (fs.existsSync(statsFile)) {
      const local = localFromStats(statsFile, story);
      if (local) row.actual.local = local;
    }
    rows.push(row);
  }
  if (opts.epic) rows.push(buildOverheadRow(Object.assign({}, opts, { stories: stories.join(',') }), sessions, info, warnings, { backfilled: true }));
  return rows;
}

// ---------------------------------------------------------------- belépési pont

function main(argv) {
  const warnings = [];
  let opts;
  let fatal = false;
  let rows = [];
  try {
    opts = parseArgs(argv);
    opts.windowMap = parseWindowSpecs(opts.window);
    opts.aliasMap = parseAliasSpecs(opts.alias);
    const info = loadPricingInfo(opts);
    if (opts.backfill) {
      rows = runBackfill(opts.backfill, opts, info, warnings);
    } else {
      const kind = opts.kind || 'story';
      if (!['story', 'epic_overhead'].includes(kind)) throw new Error(`ismeretlen --kind: ${kind}`);
      if (kind === 'story' && !opts.story) throw new Error('a --story kötelező');
      if (kind === 'epic_overhead' && !opts.epic) throw new Error('az --epic kötelező epic_overhead-hez');
      if (!opts.sessions) throw new Error('a --sessions kötelező');
      const projectsDir = opts['projects-dir'] || defaultProjectsDir();
      const sessions = opts.sessions.split(',').filter(Boolean).map((s) => loadSession(projectsDir, s, warnings));
      if (kind === 'story') {
        const features = loadFeatures(opts, warnings);
        const localRows = opts['local-log'] ? readLocalRows(opts['local-log'], warnings) : null;
        const estimate = loadEstimate(opts, opts.story, warnings);
        rows.push(buildStoryRow(opts, sessions, info, warnings, { features, localRows, estimate }));
      } else {
        rows.push(buildOverheadRow(opts, sessions, info, warnings));
      }
    }
  } catch (e) {
    warnings.push(e.message);
    fatal = true;
    opts = opts || {};
  }
  let errors = 0;
  if (!fatal) {
    const res = writeRows(rows, opts, warnings);
    errors = res.errors;
    if (!opts['dry-run']) process.stderr.write(`run-metrics: ${res.written} sor írva\n`);
  }
  for (const w of warnings) process.stderr.write(`FIGYELEM: ${w}\n`);
  if (fatal || errors) return opts['warn-only'] ? 0 : 1;
  return 0;
}

module.exports = {
  parseArgs,
  sanitizeId,
  sanitizeDeep,
  mentionsStory,
  firstStoryId,
  storyIdsIn,
  encodeCwd,
  defaultProjectsDir,
  resolveStorePath,
  configValue,
  buildFingerprint,
  loadEstimate,
  readTranscript,
  loadSession,
  parseWindowSpecs,
  parseAliasSpecs,
  storyOfAgent,
  phaseOfAgent,
  storyWindows,
  summarizeLocal,
  parsePlanMeta,
  buildStoryRow,
  buildOverheadRow,
  writeRows,
  normalizeImportedRow,
  mapFallbackReason,
  localFromStats,
  main,
};

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    // a fájl fejléc-kommentje a súgó
    const src = fs.readFileSync(__filename, 'utf8');
    const m = src.match(/\/\*\*([\s\S]*?)\*\//);
    process.stdout.write(m[1].split('\n').map((l) => l.replace(/^ \* ?/, '')).join('\n').trim() + '\n');
    process.exitCode = 0;
  } else {
    process.exitCode = main(argv);
  }
}
