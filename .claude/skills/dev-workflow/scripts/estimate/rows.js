/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * Store-olvasás és soradat-segédek.
 *
 * Használat:
 *   const rows = require('./rows');
 *
 * Kilépési kódok:
 *   N/A (modul)
 */

'use strict';

/**
 * Parse JSONL text into rows.
 * @param {string} text - JSONL string
 * @param {function} validate - Validation function returning error array
 * @returns {{rows: Array, skipped: number}}
 */
function parseStoreText(text, validate) {
  const rows = [];
  let skipped = 0;

  const lines = text.split('\n');
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine === '') {
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(trimmedLine);
    } catch (e) {
      skipped++;
      continue;
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      skipped++;
      continue;
    }

    const errors = validate(parsed);
    if (errors.length > 0) {
      skipped++;
      continue;
    }

    rows.push(parsed);
  }

  return { rows, skipped };
}

/**
 * Get plan_steps from row features.
 * @param {object} row - Store row
 * @returns {number}
 */
function stepsOf(row) {
  if (
    row &&
    typeof row === 'object' &&
    row.features &&
    typeof row.features === 'object' &&
    typeof row.features.plan_steps === 'number'
  ) {
    return row.features.plan_steps;
  }
  return 0;
}

/**
 * Calculate local share of subtasks.
 * @param {object} features - Features object
 * @returns {number}
 */
function localShareOf(features) {
  if (
    !features ||
    typeof features !== 'object' ||
    !features.subtasks ||
    !Array.isArray(features.subtasks) ||
    features.subtasks.length === 0
  ) {
    return 0;
  }

  const localCount = features.subtasks.filter(
    (task) => task && task.executor === 'local'
  ).length;

  return localCount / features.subtasks.length;
}

/**
 * Check if row is anomalous.
 * @param {object} row - Store row
 * @returns {boolean}
 */
function isAnomalous(row) {
  return Boolean(
    row &&
      typeof row === 'object' &&
      Array.isArray(row.anomalies) &&
      row.anomalies.length > 0
  );
}

/**
 * Filter out self row.
 * @param {Array} rows - Store rows
 * @param {string} project - Project identifier
 * @param {string} story - Story identifier
 * @returns {Array}
 */
function withoutSelf(rows, project, story) {
  return rows.filter(
    (row) => !(row.project === project && row.story === story)
  );
}

/**
 * Filter story rows.
 * @param {Array} rows - Store rows
 * @returns {Array}
 */
function storyRows(rows) {
  return rows.filter(
    (row) =>
      row.kind === 'story' &&
      row.actual &&
      typeof row.actual === 'object' &&
      stepsOf(row) > 0
  );
}

/**
 * Filter overhead rows.
 * @param {Array} rows - Store rows
 * @returns {Array}
 */
function overheadRows(rows) {
  return rows.filter((row) => row.kind === 'epic_overhead');
}

module.exports = {
  parseStoreText,
  stepsOf,
  localShareOf,
  isAnomalous,
  withoutSelf,
  storyRows,
  overheadRows,
};
