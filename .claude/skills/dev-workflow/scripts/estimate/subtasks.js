'use strict';

/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * Sub-task szintű becslés: a story becslésének heurisztikus (AC-súlyozású) felosztása.
 * Mérési adat nincs hozzá, ezért az eredmény mindig alacsony megbízhatóságú (a formázó jelzi).
 * Tiszta függvények.
 */

const { roundMetric } = require('./aggregate');

const SPLIT_KEYS = ['cost_usd', 'tokens', 'wall_s', 'active_s'];

function weightsOf(subtasks) {
  const allHave = subtasks.every((s) => typeof s.ac_count === 'number' && s.ac_count > 0);
  return subtasks.map((s) => (allHave ? s.ac_count : 1));
}

function splitBySubtasks(est, subtasks) {
  if (!Array.isArray(subtasks) || subtasks.length < 2) return [];
  const weights = weightsOf(subtasks);
  const total = weights.reduce((a, b) => a + b, 0);
  const localTotal = subtasks.reduce(
    (acc, s, i) => acc + (s.executor === 'local' ? weights[i] : 0),
    0
  );

  return subtasks.map((s, i) => {
    const share = weights[i] / total;
    const part = { p50: {}, p80: {} };
    for (const side of ['p50', 'p80']) {
      for (const key of SPLIT_KEYS) {
        if (typeof est[side][key] === 'number') {
          part[side][key] = roundMetric(key, est[side][key] * share);
        }
      }
      if (s.executor === 'local' && localTotal > 0 && typeof est[side].local_s === 'number') {
        part[side].local_s = roundMetric('local_s', (est[side].local_s * weights[i]) / localTotal);
      }
    }
    return {
      id: s.id,
      type: s.type || '',
      executor: s.executor || '',
      share,
      p50: part.p50,
      p80: part.p80,
    };
  });
}

module.exports = { splitBySubtasks };
