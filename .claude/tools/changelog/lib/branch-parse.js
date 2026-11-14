"use strict";
/**
 * changelog adatgyűjtő — forrás-branch név elemzése (COCALC-241).
 *
 * A `BRANCH_NAME_PATTERN` (config.md) `{type}/{ticket_key}_{harom_szavas_osszefoglalo}`
 * konvenció szerint egy branch-névből kinyeri a jelleget és a Jira ticketkulcsot.
 *
 *   feature/COCALC-241_valami_szoveg  ->  { nature: "feature", ticketKey: "COCALC-241" }
 *
 * A `{type}` a `TICKET_NATURE_TAGS` enum egyik eleme kell legyen. A ticketkulcs
 * után `_` és `-` elválasztó is elfogadott. Bármi, ami nem illeszkedik (ismeretlen
 * prefix, hiányzó ticketkulcs, minta-idegen név) -> `{ nature: "egyéb", ticketKey: null }`,
 * és nem szakítja meg a futást.
 */

const OTHER = "egyéb";
const DEFAULT_NATURE_TAGS = ["feature", "fix", "build", "refactoring", "chore"];

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @param {string} branchName
 * @param {object} [opts]
 * @param {string[]} [opts.natureTags]  Az elfogadott jelleg-prefixek (config.md TICKET_NATURE_TAGS).
 * @returns {{nature:string, ticketKey:(string|null)}}
 */
function parseBranch(branchName, opts = {}) {
  const tags =
    Array.isArray(opts.natureTags) && opts.natureTags.length
      ? opts.natureTags
      : DEFAULT_NATURE_TAGS;
  const name = String(branchName || "").trim();

  // A teljes konvenció: <jelleg>/<TICKETKULCS><_ vagy -><összefoglaló>. A harmadik
  // (összefoglaló) rész jelenlétét megköveteljük — enélkül a név nem követi a mintát.
  const re = new RegExp(
    "^(" + tags.map(escapeRe).join("|") + ")/([A-Z][A-Z0-9]+-\\d+)[_-].+$"
  );
  const m = name.match(re);
  if (!m) return { nature: OTHER, ticketKey: null };
  return { nature: m[1], ticketKey: m[2] };
}

module.exports = { parseBranch, OTHER };
