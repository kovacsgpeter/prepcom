/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * Ujjlenyomat-szűrés és egyezésellenőrzés.
 *
 * Használat:
 *   const fp = require('./fingerprint');
 *
 * Kilépési kódok:
 *   N/A (modul)
 */

'use strict';

const STRICT_KEYS = ['local_model', 'epic_story_host', 'local_executor_host', 'ci_runner'];
const LOOSE_KEYS = ['local_model'];

/**
 * Ellenőrzi, hogy a rowFp egyezik-e a targetFp-vel a megadott kulcsok alapján.
 * @param {object} rowFp - A sor ujjlenyomata
 * @param {object} targetFp - A cél ujjlenyomat
 * @param {Array} keys - A vizsgálandó kulcsok listája
 * @returns {boolean}
 */
function matchesFingerprint(rowFp, targetFp, keys) {
  for (const key of keys) {
    const targetVal = targetFp ? targetFp[key] : undefined;

    // Ha a célérték hiányzik, undefined, null vagy üres string, a kulcsot kihagyjuk
    if (targetVal === undefined || targetVal === null || targetVal === '') {
      continue;
    }

    const rowVal = rowFp ? rowFp[key] : undefined;

    // Ha a sorban hiányzik az érték, eltérés
    if (rowVal === undefined) {
      return false;
    }

    // Szigorú egyezés
    if (rowVal !== targetVal) {
      return false;
    }
  }

  return true;
}

/**
 * Szűri a sorokat ujjlenyomat alapján.
 * @param {Array} rows - A szűrendő sorok
 * @param {object} targetFp - A cél ujjlenyomat
 * @param {string} level - A szűrés szintje: 'strict' vagy 'loose'
 * @returns {Array}
 */
function filterByFingerprint(rows, targetFp, level) {
  let keys;

  if (level === 'strict') {
    keys = STRICT_KEYS;
  } else if (level === 'loose') {
    keys = LOOSE_KEYS;
  } else {
    throw new Error('Ismeretlen ujjlenyomat-szint: ' + level);
  }

  return rows.filter((row) => {
    const rowFp = row.fingerprint;
    return matchesFingerprint(rowFp, targetFp, keys);
  });
}

module.exports = {
  STRICT_KEYS,
  LOOSE_KEYS,
  matchesFingerprint,
  filterByFingerprint,
};
