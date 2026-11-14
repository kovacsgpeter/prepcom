/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * Hatókör-létra és anomália-kizárás a becsléshez.
 *
 * Használat:
 *   const scope = require('./scope');
 *
 * Kilépési kódok:
 *   N/A (modul)
 */

'use strict';

const rowsLib = require('./rows');
const fingerprint = require('./fingerprint');

/**
 * Választ a mintavételi pool-t a hatókör-létra alapján.
 *
 * @param {Array} rows - Az összes store sor
 * @param {object} target - A cél objektum { project, story, fingerprint }
 * @param {object} opts - Opciók { minSamples, excludeAnomalies }
 * @returns {object} Az eredmény objektum
 */
function selectPool(rows, target, opts) {
  const minSamples = opts.minSamples || 1;
  const excludeAnomalies = opts.excludeAnomalies || false;

  // Alaphalmaz: saját sor nélkül, csak story-k
  const base = rowsLib.storyRows(rowsLib.withoutSelf(rows, target.project, target.story));

  // Lépcsők definíciója
  const steps = [
    { scope: 'project', level: 'strict' },
    { scope: 'project', level: 'loose' },
    { scope: 'all', level: 'strict' },
    { scope: 'all', level: 'loose' }
  ];

  for (const step of steps) {
    // Jelöltek meghatározása
    let candidates;
    if (step.scope === 'project') {
      candidates = base.filter((row) => row.project === target.project);
    } else {
      candidates = base;
    }

    // Ujjlenyomat-szűrés
    const poolAll = fingerprint.filterByFingerprint(candidates, target.fingerprint, step.level);

    // Anomália-kizárás
    let pool;
    if (excludeAnomalies) {
      pool = poolAll.filter((row) => !rowsLib.isAnomalous(row));
    } else {
      pool = poolAll;
    }

    // nProject számítása: project hatókörű pool mérete az adott szinten
    let nProject;
    if (step.scope === 'project') {
      nProject = pool.length;
    } else {
      // All hatókörnél: project szűrés + fingerprint szűrés + anomália szűrés
      const projectCandidates = base.filter((row) => row.project === target.project);
      const projectFiltered = fingerprint.filterByFingerprint(projectCandidates, target.fingerprint, step.level);
      if (excludeAnomalies) {
        nProject = projectFiltered.filter((row) => !rowsLib.isAnomalous(row)).length;
      } else {
        nProject = projectFiltered.length;
      }
    }

    // Ellenőrzés, hogy elegendő-e a minta
    if (pool.length >= minSamples) {
      // sampleId és label generálása
      let sampleId;
      let label;

      if (step.scope === 'project') {
        sampleId = `${target.project}:n${pool.length}`;
        label = `${target.project} n=${pool.length}`;
      } else {
        sampleId = `all:n${pool.length}:${target.project}${nProject}`;
        label = `minden projekt n=${pool.length} (${target.project} n=${nProject})`;
      }

      return {
        mode: 'history',
        scope: step.scope,
        level: step.level,
        pool: pool,
        poolAll: poolAll,
        n: pool.length,
        nProject: nProject,
        sampleId: sampleId,
        label: label
      };
    }
  }

  // Heurisztikus mód: egyik lépcső sem elegendő
  return {
    mode: 'heuristic',
    scope: 'none',
    level: 'none',
    pool: [],
    poolAll: [],
    n: base.length,
    nProject: 0,
    sampleId: `heuristic:n${base.length}`,
    label: `heurisztika n=${base.length}`
  };
}

module.exports = {
  selectPool
};
