/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * Hasonlóság és k-NN (legközelebbi szomszédok) számítás.
 *
 * Használat:
 *   const sim = require('./similarity');
 *
 * Kilépési kódok:
 *   N/A (modul)
 */

'use strict';

const rowsLib = require('./rows');

const K_MAX = 5;

/**
 * Determine k based on pool size.
 * @param {number} n - Pool size
 * @returns {number}
 */
function kFor(n) {
  return Math.min(K_MAX, n);
}

/**
 * Calculate distance of a row from a target.
 * @param {object} row - Store row
 * @param {object} target - Target object { complexity, plan_steps, local_share }
 * @returns {{ complexityMismatch: number, d: number }}
 */
function distanceOf(row, target) {
  let complexityMismatch = 0;

  if (target.complexity && row.features.complexity !== target.complexity) {
    complexityMismatch = 1;
  }

  const stepsDiff = Math.abs(rowsLib.stepsOf(row) - target.plan_steps);
  const stepsNorm = stepsDiff / Math.max(target.plan_steps, 1);

  const localShareDiff = Math.abs(rowsLib.localShareOf(row.features) - target.local_share);

  const d = stepsNorm + localShareDiff;

  return { complexityMismatch, d };
}

/**
 * Select nearest neighbors from pool.
 * @param {Array} pool - Store rows
 * @param {object} target - Target object
 * @param {number} k - Number of neighbors
 * @returns {Array}
 */
function selectNearest(pool, target, k) {
  const scored = pool.map((row) => {
    const dist = distanceOf(row, target);
    return { row, ...dist };
  });

  scored.sort((a, b) => {
    if (a.complexityMismatch !== b.complexityMismatch) {
      return a.complexityMismatch - b.complexityMismatch;
    }
    if (a.d !== b.d) {
      return a.d - b.d;
    }
    if (a.row.story < b.row.story) {
      return -1;
    }
    if (a.row.story > b.row.story) {
      return 1;
    }
    return 0;
  });

  return scored.slice(0, k).map((item) => item.row);
}

module.exports = {
  K_MAX,
  kFor,
  distanceOf,
  selectNearest,
};
