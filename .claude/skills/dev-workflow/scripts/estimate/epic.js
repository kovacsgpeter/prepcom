'use strict';

/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * Epic-összeg: a storyk becsléseinek összege plusz az epic_overhead. Tudott torzítás: a
 * P80-ak összege konzervatív; a hullámokat egyszerűen összeadja, a párhuzamosság nincs
 * modellezve. I/O nélkül.
 */

const { percentile } = require('./stats');
const { overheadRows } = require('./rows');
const { flattenRow } = require('./metrics');
const { roundMetric } = require('./aggregate');
const { buildEstimate } = require('./build');

function addInto(target, source) {
  for (const key of Object.keys(source)) {
    target[key] = (target[key] || 0) + source[key];
  }
}

function sortedRounded(obj) {
  const out = {};
  for (const key of Object.keys(obj).sort()) out[key] = roundMetric(key, obj[key]);
  return out;
}

// Az epic_overhead egy story-ra eső értékei soronként: az overhead-sor értéke osztva az azonos
// epic story-sorainak számával (ha 0, a sor kimarad).
function perStoryOverheads(rows, ovRows, rates) {
  const result = [];
  for (const ov of ovRows) {
    const count = rows.filter(
      (r) => r.kind === 'story' && r.project === ov.project && r.epic && r.epic === ov.epic
    ).length;
    if (count === 0) continue;
    const flat = flattenRow(ov, rates);
    const per = {};
    for (const key of Object.keys(flat)) per[key] = flat[key] / count;
    result.push(per);
  }
  return result;
}

function overheadEstimate(rows, project, storyCount, rates) {
  const all = overheadRows(rows);
  const own = all.filter((r) => r.project === project);
  const scope = own.length > 0 ? 'project' : 'all';
  const usable = perStoryOverheads(rows, scope === 'project' ? own : all, rates);
  if (usable.length === 0) return null;

  const keys = new Set();
  for (const per of usable) for (const key of Object.keys(per)) keys.add(key);
  const p50 = {};
  const p80 = {};
  for (const key of Array.from(keys).sort()) {
    const values = usable.filter((per) => key in per).map((per) => per[key]);
    p50[key] = roundMetric(key, percentile(values, 50) * storyCount);
    p80[key] = roundMetric(key, percentile(values, 80) * storyCount);
  }
  return { n: usable.length, scope, p50, p80 };
}

function buildEpicEstimate(input) {
  const { rows, epic, project, stories, fingerprint, config, rates } = input;
  const estimates = stories.map((s) =>
    buildEstimate({
      rows,
      target: { project, story: s.story, features: s.features, fingerprint },
      config,
      rates,
    })
  );

  const sum50 = {};
  const sum80 = {};
  for (const est of estimates) {
    addInto(sum50, est.p50);
    addInto(sum80, est.p80);
  }

  const overhead = overheadEstimate(rows, project, stories.length, rates);
  if (overhead) {
    addInto(sum50, overhead.p50);
    addInto(sum80, overhead.p80);
  }

  return {
    epic,
    stories: estimates,
    overhead,
    total: { p50: sortedRounded(sum50), p80: sortedRounded(sum80) },
  };
}

module.exports = { buildEpicEstimate };
