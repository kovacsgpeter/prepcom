'use strict';

/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * Anomália-kockázat ("1/6 hasonló futásban breaker_open, +40 p") és a javítókörök tartománya.
 * Tiszta függvények.
 */

const { median, roundTo } = require('./stats');
const { isAnomalous } = require('./rows');

function wallOf(row) {
  const w = row && row.actual && row.actual.wall_clock_s;
  return typeof w === 'number' && Number.isFinite(w) ? w : null;
}

function walls(rows) {
  return rows.map(wallOf).filter((w) => w !== null);
}

// Kódonként: hány sorban fordult elő, és mennyivel hosszabb a falióra a tiszta sorokhoz képest.
function anomalyRisks(poolAll) {
  const codes = new Set();
  for (const row of poolAll) {
    if (isAnomalous(row)) for (const code of row.anomalies) codes.add(code);
  }
  const clean = walls(poolAll.filter((row) => !isAnomalous(row)));
  const result = [];
  for (const code of Array.from(codes).sort()) {
    const carriers = poolAll.filter((row) => isAnomalous(row) && row.anomalies.includes(code));
    const carrierWalls = walls(carriers);
    let extra = null;
    if (clean.length > 0 && carrierWalls.length > 0) {
      extra = Math.max(0, roundTo(median(carrierWalls) - median(clean), 0));
    }
    result.push({ code, count: carriers.length, total: poolAll.length, extra_wall_s: extra });
  }
  return result;
}

// A mintákban mért javítókörök (actual.rounds.fix) legkisebb és legnagyobb értéke.
function fixRoundsRange(samples) {
  const values = [];
  for (const row of samples) {
    const fix = row && row.actual && row.actual.rounds && row.actual.rounds.fix;
    if (typeof fix === 'number' && Number.isFinite(fix)) values.push(fix);
  }
  if (values.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...values), max: Math.max(...values) };
}

module.exports = { anomalyRisks, fixRoundsRange };
