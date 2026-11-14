'use strict';

/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * Heurisztikus mód (kevés minta): lépésenkénti átlag x a cél lépésszáma. A P80 a P50
 * rögzített szorzata (hangolható konstans). Tiszta függvények.
 */

const { roundMetric } = require('./aggregate');
const { flattenRow, ZERO_DEFAULT_PREFIXES } = require('./metrics');
const { stepsOf } = require('./rows');

// A P80 és a P50 aránya heurisztikus módban (hangolható konstans).
const HEURISTIC_P80_FACTOR = 1.5;

function defaultsToZero(key) {
  return ZERO_DEFAULT_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function heuristicEstimate(rows, targetSteps, rates) {
  if (!rows || rows.length === 0 || !targetSteps || targetSteps <= 0) return null;

  const flats = rows.map((row) => ({ flat: flattenRow(row, rates), steps: stepsOf(row) }));
  const keys = [];
  const seen = new Set();
  for (const { flat } of flats) {
    for (const key of Object.keys(flat)) {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }
  keys.sort();

  const p50 = {};
  const p80 = {};
  for (const key of keys) {
    let total = 0;
    let steps = 0;
    for (const { flat, steps: s } of flats) {
      if (key in flat) {
        total += flat[key];
        steps += s;
      } else if (defaultsToZero(key)) {
        steps += s;
      }
    }
    if (steps <= 0) continue;
    const est = (total / steps) * targetSteps;
    p50[key] = roundMetric(key, est);
    p80[key] = roundMetric(key, est * HEURISTIC_P80_FACTOR);
  }
  return { p50, p80, n: rows.length };
}

module.exports = { HEURISTIC_P80_FACTOR, heuristicEstimate };
