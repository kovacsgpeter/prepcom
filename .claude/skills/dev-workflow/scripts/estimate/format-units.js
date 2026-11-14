'use strict';

/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * Számformázók a becslés-blokkhoz. Tizedesjel pont (a fixture bájtra egyezést tesztel).
 */

const { roundTo } = require('./stats');

// Költség USD-ben, két tizedes: 3.10
function formatCost(usd) {
  return roundTo(usd, 2).toFixed(2);
}

// Token: >= 1 000 000 -> 1.9M, >= 1 000 -> 820k, különben a szám.
function formatTokens(n) {
  if (n >= 1e6 || Math.round(n / 1e3) >= 1000) return roundTo(n / 1e6, 1).toFixed(1) + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'k';
  return String(Math.round(n));
}

// Időtartam: <1 p, 45 p, 1 ó 25 p (a perc félre-fel kerekített).
function formatDuration(seconds) {
  if (seconds < 60) return '<1 p';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes + ' p';
  return Math.floor(minutes / 60) + ' ó ' + (minutes % 60) + ' p';
}

module.exports = { formatCost, formatTokens, formatDuration };
