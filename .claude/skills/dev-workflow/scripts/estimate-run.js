#!/usr/bin/env node
/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * Futási becslés (estimate/v1): egy story (vagy egy epic storyjai) várható költsége, tokenje,
 * faliórája és aktív ideje P50/P80 értékkel, a korábbi futások store-jából (run-metrics/v1).
 * Az E3 epic-terv és az A6 terv-jóváhagyás üzenetébe illeszthető szöveget ad. Determinisztikus:
 * a kimenetben nincs időbélyeg és nincs véletlen.
 *
 * Használat:
 *   node estimate-run.js --story <ID> --features-file <f> [--plan-file <terv>] [kapcsolók]
 *   node estimate-run.js --epic <ID> --stories-file <f> [kapcsolók]
 *
 * Kapcsolók:
 *   --story <ID> | --epic <ID>  pontosan az egyik kötelező
 *   --features-file <f>   a story jellemzői (JSON: complexity, ac_count, subtasks, design ...)
 *   --stories-file <f>    epic módban: [{ "story": "...", "features": {...} }]
 *   --plan-file <f>       a terv; a plan-meta sor felülírja a plan_steps és plan_files jellemzőt
 *   --project <P>         alap: a story/epic kulcs előtagja
 *   --store <f>           a store (alap: RUN_METRICS_STORE, majd ~/.dev-workflow/metrics/runs.jsonl)
 *   --min-samples <N>     alap: RUN_METRICS_MIN_SAMPLES (3)
 *   --exclude-anomalies on|off   alap: RUN_METRICS_EXCLUDE_ANOMALIES (on)
 *   --fingerprint-file <f>  a becsült story ujjlenyomata (JSON); alap: a jelenlegi konfiguráció
 *   --pricing <f>         másik ártábla (alap: a session-cost-report ártáblája)
 *   --no-calibration      a korábbi becslések alapú korrekció kikapcsolása
 *   --subtasks            sub-task sorok a kimenetben (heurisztikus, alacsony megbízhatóságú felosztás)
 *   --json                a kimenet az estimate/v1 JSON (2 szóközös behúzás, záró sortörés)
 *   --out <f>             story módban a becslés JSON-ja ebbe a fájlba (a gyűjtő --estimate-file-ja
 *                         vagy a terv melletti <STORY>-estimate.json ezt olvassa)
 *   --warn-only           hiba esetén is 0-val lép ki (a figyelmeztetés stderr-re megy)
 *   --help                ez a súgó
 *
 * Kilépési kódok: 0 siker (a "nincs elég adat" is siker); 1 használati hiba vagy olvashatatlan
 * bemenet. A figyelmeztetések stderr-re mennek.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const collect = require('./collect-run-metrics.js');
const { validateRow, loadSchema } = require('./validate-run-metrics.js');
const pricingLib = require('../../../tools/session-cost-report/pricing.js');
const { parseStoreText } = require('./estimate/rows.js');
const { buildEstimate } = require('./estimate/build.js');
const { buildEpicEstimate } = require('./estimate/epic.js');
const { formatBlock, formatEpicBlock, formatSubtaskLines } = require('./estimate/format-block.js');
const { splitBySubtasks } = require('./estimate/subtasks.js');

const BOOLEAN_FLAGS = ['no-calibration', 'subtasks', 'json', 'warn-only', 'help'];
const VALUE_FLAGS = [
  'story',
  'epic',
  'features-file',
  'stories-file',
  'plan-file',
  'project',
  'store',
  'min-samples',
  'exclude-anomalies',
  'fingerprint-file',
  'pricing',
  'out',
];

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`ismeretlen argumentum: ${a}`);
    const key = a.slice(2);
    if (BOOLEAN_FLAGS.includes(key)) {
      opts[key] = true;
    } else if (VALUE_FLAGS.includes(key)) {
      if (i + 1 >= argv.length) throw new Error(`hiányzó érték: ${a}`);
      opts[key] = argv[++i];
    } else {
      throw new Error(`ismeretlen kapcsoló: ${a}`);
    }
  }
  return opts;
}

function projectOf(opts, key) {
  if (opts.project) return collect.sanitizeId(opts.project);
  const m = /^([A-Za-z][A-Za-z0-9]*)-\d+$/.exec(key || '');
  return m ? m[1] : 'unknown';
}

function helpText() {
  const src = fs.readFileSync(__filename, 'utf8');
  const m = src.match(/\/\*\*([\s\S]*?)\*\//);
  return m[1].split('\n').map((l) => l.replace(/^ \* ?/, '')).join('\n').trim() + '\n';
}

function readJson(io, file, what) {
  let text;
  try {
    text = io.readFile(file);
  } catch (e) {
    throw new Error(`olvashatatlan ${what}: ${e.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`érvénytelen JSON a(z) ${what} fájlban: ${e.message}`);
  }
}

// A store beolvasása; a hiányzó fájl üres store (a becslés ekkor "nincs elég adat").
function readStore(io, file, warnings) {
  let text;
  try {
    text = io.readFile(file);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw new Error(`olvashatatlan store: ${e.message}`);
  }
  const schema = loadSchema();
  const { rows, skipped } = parseStoreText(text, (row) => validateRow(row, schema));
  if (skipped > 0) warnings.push(`${skipped} érvénytelen store-sor kihagyva`);
  return rows;
}

// Az árak a store-ban szereplő modellnevekre feloldva.
function buildRates(rows, pricing) {
  const rates = {};
  for (const row of rows) {
    const tokens = (row.actual && row.actual.tokens) || {};
    for (const model of Object.keys(tokens)) {
      if (rates[model]) continue;
      const rate = pricingLib.resolveRate(pricing, model).rate;
      if (rate) {
        rates[model] = {
          input: rate.input,
          output: rate.output,
          cacheWrite: rate.cacheWrite,
          cacheRead: rate.cacheRead,
        };
      }
    }
  }
  return rates;
}

function loadFeatures(io, file, planFile) {
  const features = file ? collect.sanitizeDeep(readJson(io, file, 'features-fájl')) : {};
  if (planFile) {
    let meta = null;
    try {
      meta = collect.parsePlanMeta(planFile);
    } catch (e) {
      throw new Error(`olvashatatlan terv-fájl: ${e.message}`);
    }
    if (meta) Object.assign(features, meta);
  }
  return features;
}

function buildConfig(opts) {
  const minRaw = opts['min-samples'] !== undefined ? opts['min-samples'] : collect.configValue('RUN_METRICS_MIN_SAMPLES', '3');
  const minSamples = Number(minRaw);
  if (!Number.isInteger(minSamples) || minSamples < 1) throw new Error(`érvénytelen --min-samples: ${minRaw}`);
  const exRaw = opts['exclude-anomalies'] !== undefined ? opts['exclude-anomalies'] : collect.configValue('RUN_METRICS_EXCLUDE_ANOMALIES', 'on');
  if (!['on', 'off'].includes(exRaw)) throw new Error(`érvénytelen --exclude-anomalies: ${exRaw}`);
  return { minSamples, excludeAnomalies: exRaw === 'on', calibrate: !opts['no-calibration'] };
}

function jsonText(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

function execute(opts, io, warnings) {
  if (Boolean(opts.story) === Boolean(opts.epic)) throw new Error('pontosan az egyik kell: --story vagy --epic');
  const key = opts.story || opts.epic;
  const project = projectOf(opts, key);
  const config = buildConfig(opts);
  const rows = readStore(io, collect.resolveStorePath(opts), warnings);
  const pricing = pricingLib.loadPricing(opts.pricing || undefined);
  const rates = buildRates(rows, pricing);
  const fingerprint = opts['fingerprint-file']
    ? collect.sanitizeDeep(readJson(io, opts['fingerprint-file'], 'fingerprint-fájl'))
    : collect.buildFingerprint(opts, null);

  if (opts.epic) {
    if (!opts['stories-file']) throw new Error('az --epic módhoz kell a --stories-file');
    const list = readJson(io, opts['stories-file'], 'stories-fájl');
    if (!Array.isArray(list)) throw new Error('a stories-fájl nem tömb');
    const stories = list.map((s) => ({
      story: collect.sanitizeId(s.story),
      features: collect.sanitizeDeep(s.features || {}),
    }));
    const epic = buildEpicEstimate({ rows, epic: opts.epic, project, stories, fingerprint, config, rates });
    return opts.json ? jsonText(epic) : formatEpicBlock(epic) + '\n';
  }

  const features = loadFeatures(io, opts['features-file'], opts['plan-file']);
  const est = buildEstimate({ rows, target: { project, story: opts.story, features, fingerprint }, config, rates });
  if (opts.out) io.writeFile(opts.out, jsonText(est));
  if (opts.json) return jsonText(est);
  let text = formatBlock(est, { subtasks: features.subtasks });
  if (opts.subtasks && est.basis !== 'none') {
    const parts = formatSubtaskLines(splitBySubtasks(est, features.subtasks || []));
    if (parts) text += '\n' + parts;
  }
  return text + '\n';
}

function run(argv, io) {
  const defaults = {
    readFile: (file) => fs.readFileSync(file, 'utf8'),
    writeFile: (file, text) => {
      fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
      fs.writeFileSync(file, text);
    },
  };
  const useIo = Object.assign(defaults, io || {});
  const warnings = [];
  let opts = {};
  try {
    opts = parseArgs(argv);
    if (opts.help) return { stdout: helpText(), stderr: '', code: 0 };
    const stdout = execute(opts, useIo, warnings);
    return { stdout, stderr: warnings.map((w) => `FIGYELEM: ${w}\n`).join(''), code: 0 };
  } catch (e) {
    warnings.push(e.message);
    return {
      stdout: '',
      stderr: warnings.map((w) => `FIGYELEM: ${w}\n`).join(''),
      code: opts['warn-only'] || argv.includes('--warn-only') ? 0 : 1,
    };
  }
}

function main(argv) {
  const res = run(argv);
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  return res.code;
}

module.exports = { parseArgs, run, main };

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
