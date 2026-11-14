'use strict';

/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * Egy story becslése: a tiszta modulok összekapcsolása az estimate/v1 objektummá. A kimenet
 * kulcssorrendje fix (a JSON szövege a fixture-ben bájtra egyezik). I/O nélkül.
 */

const { roundTo } = require('./stats');
const { storyRows, withoutSelf, localShareOf, isAnomalous } = require('./rows');
const { selectPool } = require('./scope');
const { kFor, selectNearest } = require('./similarity');
const { aggregateSamples } = require('./aggregate');
const { heuristicEstimate } = require('./heuristic');
const { anomalyRisks, fixRoundsRange } = require('./risk');
const { calibrationFactors, hitRates, applyCalibration } = require('./calibration');

const SCHEMA = 'estimate/v1';

function buildEstimate(input) {
  const { rows, target, config, rates } = input;
  const features = target.features || {};
  const planSteps = typeof features.plan_steps === 'number' ? features.plan_steps : 0;
  const targetFeatures = {
    complexity: features.complexity || '',
    plan_steps: planSteps,
    local_share: roundTo(localShareOf(features), 4),
  };

  const pool = selectPool(
    rows,
    { project: target.project, story: target.story, fingerprint: target.fingerprint },
    { minSamples: config.minSamples, excludeAnomalies: config.excludeAnomalies }
  );
  const base = storyRows(withoutSelf(rows, target.project, target.story));

  let basis = 'none';
  let est = { p50: {}, p80: {} };
  let scaled = false;
  let k = 0;
  let roundsFix = { min: 0, max: 0 };
  let risks = [];
  let heurRows = base;

  if (pool.mode === 'history') {
    const nearest = selectNearest(pool.pool, targetFeatures, kFor(pool.pool.length));
    const agg = aggregateSamples(nearest, planSteps, rates);
    basis = 'history';
    est = { p50: agg.p50, p80: agg.p80 };
    scaled = agg.scaled;
    k = nearest.length;
    roundsFix = fixRoundsRange(nearest);
    if (config.excludeAnomalies) risks = anomalyRisks(pool.poolAll);
  } else {
    // A heurisztikus ág is kizárja az anomáliás sorokat, ha a kizárás `on`.
    heurRows = config.excludeAnomalies ? base.filter((row) => !isAnomalous(row)) : base;
    const heur = heuristicEstimate(heurRows, planSteps, rates);
    if (heur) {
      basis = 'heuristic';
      est = { p50: heur.p50, p80: heur.p80 };
      roundsFix = fixRoundsRange(heurRows);
    }
  }

  const raw = { p50: est.p50, p80: est.p80 };

  // Kalibráció a használt minta-hatókör korábbi becsléseiből (azok, amelyeknek van estimate.raw).
  let calibration = { applied: false, n: 0, factors: null };
  let hitRate = {};
  if (basis !== 'none') {
    const scopeRows = (pool.mode === 'history' && pool.scope === 'project'
      ? base.filter((row) => row.project === target.project)
      : base
    ).filter((row) => row.estimate && row.estimate.raw);
    hitRate = hitRates(scopeRows);
    if (config.calibrate) {
      const cal = calibrationFactors(scopeRows, config.minSamples);
      if (cal.factors) {
        est = applyCalibration(est, cal.factors);
        calibration = { applied: true, n: cal.n, factors: cal.factors };
      } else {
        calibration = { applied: false, n: cal.n, factors: null };
      }
    }
  }

  const confidence = basis === 'history' && scaled ? 'normal' : 'low';
  const sample =
    basis === 'history'
      ? {
          scope: pool.scope,
          project: target.project,
          n: pool.n,
          n_project: pool.nProject,
          k,
          level: pool.level,
          sample_id: pool.sampleId,
        }
      : {
          scope: 'none',
          project: target.project,
          n: heurRows.length,
          n_project: 0,
          k: 0,
          level: 'none',
          sample_id: `heuristic:n${heurRows.length}`,
        };

  return {
    schema: SCHEMA,
    story: target.story,
    basis,
    confidence,
    sample,
    target: targetFeatures,
    p50: est.p50,
    p80: est.p80,
    raw,
    calibration,
    hit_rate: hitRate,
    risks,
    rounds_fix: roundsFix,
  };
}

module.exports = { SCHEMA, buildEstimate };
