"use strict";
/**
 * changelog adatgyűjtő — jelleg szerinti csoportosítás (COCALC-241).
 *
 * A dúsított MR-listát a jelleg (`nature`) szerint csoportosítja. A kimeneti
 * objektumban MINDEN kulcs mindig jelen van, üres tömbbel is:
 * a `TICKET_NATURE_TAGS` enum + a végén az `egyéb` gyűjtő.
 * Ismeretlen `nature` (elvileg nem fordulhat elő) szintén az `egyéb`-be kerül.
 */

const OTHER = "egyéb";
const DEFAULT_NATURE_TAGS = ["feature", "fix", "build", "refactoring", "chore"];

/**
 * @param {Array<object>} mrs  { ticketKey, nature, branch, title, url, ticketTitle? }
 * @param {object} [opts]  { natureTags }
 * @returns {Object<string, Array<object>>}
 */
function groupByNature(mrs, opts = {}) {
  const tags =
    Array.isArray(opts.natureTags) && opts.natureTags.length
      ? opts.natureTags
      : DEFAULT_NATURE_TAGS;

  const keys = tags.slice();
  if (!keys.includes(OTHER)) keys.push(OTHER);

  const groups = {};
  for (const k of keys) groups[k] = [];

  for (const mr of mrs || []) {
    const bucket = groups[mr.nature] ? mr.nature : OTHER;
    groups[bucket].push(mr);
  }
  return groups;
}

module.exports = { groupByNature, OTHER };
