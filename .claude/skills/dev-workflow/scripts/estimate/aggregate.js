'use strict';

/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * A kiválasztott minták lépésszám szerint skálázott P50/P80 értékei. Tiszta függvények.
 */

const { percentile, roundTo } = require('./stats');
const { flattenRow, ZERO_DEFAULT_PREFIXES } = require('./metrics');
const { stepsOf } = require('./rows');

// A minta lépésszámáról a cél lépésszámára skálázó szorzó; 0 esetén 1.
function scaleFactor(sampleSteps, targetSteps) {
  if (!sampleSteps || !targetSteps) return 1;
  return targetSteps / sampleSteps;
}

function isCostKey(key) {
  return key === 'cost_usd' || key.startsWith('model_cost:') || key.startsWith('phase_cost:');
}

function defaultsToZero(key) {
  return ZERO_DEFAULT_PREFIXES.some((prefix) => key.startsWith(prefix));
}

// Kerekítés: pénz 4 tizedesre, minden más egészre.
function roundMetric(key, value) {
  return roundTo(value, isCostKey(key) ? 4 : 0);
}

function aggregateSamples(samples, targetSteps, rates) {
  const scaled = Boolean(targetSteps) && targetSteps > 0;
  const flats = samples.map((row) => {
    const factor = scaled ? scaleFactor(stepsOf(row), targetSteps) : 1;
    const flat = flattenRow(row, rates);
    const out = {};
    for (const key of Object.keys(flat)) out[key] = flat[key] * factor;
    return out;
  });

  const keys = [];
  const seen = new Set();
  for (const flat of flats) {
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
    const values = [];
    for (const flat of flats) {
      if (key in flat) values.push(flat[key]);
      else if (defaultsToZero(key)) values.push(0);
    }
    if (values.length === 0) continue;
    p50[key] = roundMetric(key, percentile(values, 50));
    p80[key] = roundMetric(key, percentile(values, 80));
  }
  return { p50, p80, scaled };
}

module.exports = { scaleFactor, aggregateSamples, roundMetric, isCostKey };
