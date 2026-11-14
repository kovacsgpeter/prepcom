'use strict';

/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * Statisztikai alapműveletek becslésekhez.
 */

function percentile(values, p) {
  if (!values || values.length === 0) {
    return null;
  }

  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  const pos = (n - 1) * p / 100;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);

  if (lo === hi) {
    return s[lo];
  }

  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

function median(values) {
  return percentile(values, 50);
}

function mean(values) {
  if (!values || values.length === 0) {
    return null;
  }
  return sum(values) / values.length;
}

function sum(values) {
  if (!values || values.length === 0) {
    return 0;
  }
  return values.reduce((acc, val) => acc + val, 0);
}

function roundTo(n, digits) {
  return Math.round(n * 10 ** digits) / 10 ** digits;
}

module.exports = {
  percentile,
  median,
  mean,
  sum,
  roundTo,
};
