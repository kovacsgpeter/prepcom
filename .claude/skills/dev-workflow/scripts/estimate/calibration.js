'use strict';

/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * Önkalibráció a korábbi becslések és a tényleges értékek alapján, valamint a P80 találati
 * arány. A korrekció a store-ban rögzített nyers (kalibráció előtti) P50-ből számolódik
 * (estimate.raw.p50), így nem halmozódik. Tiszta függvények.
 */

const { median } = require('./stats');
const { totalTokens } = require('./metrics');
const { roundMetric } = require('./aggregate');

const CALIBRATION_CLAMP = [0.5, 2];
const MEASURES = ['cost_usd', 'tokens', 'wall_s', 'active_s'];

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// A sor tényleges értéke az adott mutatóra, vagy null.
function actualOf(row, measure) {
  const actual = row && row.actual;
  if (!actual) return null;
  let v = null;
  if (measure === 'cost_usd') v = actual.cost_usd;
  else if (measure === 'tokens') v = totalTokens(row);
  else if (measure === 'wall_s') v = actual.wall_clock_s;
  else if (measure === 'active_s') v = actual.active_agent_s;
  return isNum(v) ? v : null;
}

function rawP50Of(row, measure) {
  const raw = row && row.estimate && row.estimate.raw;
  const v = raw && raw.p50 && raw.p50[measure];
  return isNum(v) ? v : null;
}

// Mutatónként a "tényleges / nyers P50" arányok mediánja, a clamp-be szorítva. Egy mutató
// csak legalább minSamples párnál kerül be; ha egy sem, a factors null. Az n a legtöbb párral
// rendelkező mutató párjainak száma.
function calibrationFactors(rows, minSamples) {
  const factors = {};
  let n = 0;
  for (const measure of MEASURES) {
    const ratios = [];
    for (const row of rows) {
      const raw = rawP50Of(row, measure);
      const actual = actualOf(row, measure);
      if (raw !== null && raw > 0 && actual !== null) ratios.push(actual / raw);
    }
    if (ratios.length > n) n = ratios.length;
    if (ratios.length >= minSamples && ratios.length > 0) {
      const m = median(ratios);
      factors[measure] = Math.min(CALIBRATION_CLAMP[1], Math.max(CALIBRATION_CLAMP[0], m));
    }
  }
  if (Object.keys(factors).length === 0) return { factors: null, n };
  return { factors, n };
}

// Találati arány a korábban megjelenített P80-nal: actual <= p80 -> találat.
function hitRates(rows) {
  const out = {};
  for (const measure of MEASURES) {
    let hit = 0;
    let total = 0;
    for (const row of rows) {
      const p80 = row && row.estimate && row.estimate.p80 && row.estimate.p80[measure];
      const actual = actualOf(row, measure);
      if (isNum(p80) && actual !== null) {
        total++;
        if (actual <= p80) hit++;
      }
    }
    if (total > 0) out[measure] = { hit, total };
  }
  return out;
}

function familyOf(key) {
  if (key === 'cost_usd' || key.startsWith('model_cost:') || key.startsWith('phase_cost:')) {
    return 'cost_usd';
  }
  if (key === 'tokens' || key.startsWith('model_tokens:') || key.startsWith('phase_tokens:')) {
    return 'tokens';
  }
  if (key === 'wall_s' || key === 'claude_s' || key === 'local_s' || key === 'ci_s') {
    return 'wall_s';
  }
  if (key === 'active_s') return 'active_s';
  return null;
}

function scaleSide(side, factors) {
  const out = {};
  for (const key of Object.keys(side)) {
    const family = familyOf(key);
    const f = family && factors[family];
    out[key] = isNum(f) ? roundMetric(key, side[key] * f) : side[key];
  }
  return out;
}

function applyCalibration(est, factors) {
  return { p50: scaleSide(est.p50, factors), p80: scaleSide(est.p80, factors) };
}

module.exports = {
  CALIBRATION_CLAMP,
  MEASURES,
  actualOf,
  calibrationFactors,
  hitRates,
  applyCalibration,
};
