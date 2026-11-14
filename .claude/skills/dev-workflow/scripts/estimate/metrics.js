'use strict';

/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * Egy store-sor lapos, számszerű metrikái (cost_usd, tokens, wall_s, active_s, local_s, ci_s,
 * claude_s, model_*, phase_*), amelyekből P50/P80 számolható. Tiszta függvények, I/O nélkül.
 */

// Azok az előtagok, amelyek lépésszám szerint skálázódnak és hiányuk 0-nak számít.
const SCALED_PREFIXES = ['model_tokens:', 'model_cost:', 'phase_tokens:', 'phase_cost:'];
const ZERO_DEFAULT_PREFIXES = ['model_tokens:', 'model_cost:', 'phase_tokens:', 'phase_cost:'];

function num(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// Egy modell költsége az ártáblából (USD / 1M token); ismeretlen modell: 0.
function modelCostOf(rate, t) {
  if (!rate) return 0;
  const tok = t || {};
  return (
    ((tok.input || 0) * rate.input +
      (tok.cache_write || 0) * rate.cacheWrite +
      (tok.cache_read || 0) * rate.cacheRead +
      (tok.output || 0) * rate.output) /
    1e6
  );
}

function sumTokens(t) {
  return (t.input || 0) + (t.cache_write || 0) + (t.cache_read || 0) + (t.output || 0);
}

// A sor összes tokenje, minden modellre és mind a négy fajtára.
function totalTokens(row) {
  const tokens = row && row.actual && row.actual.tokens;
  if (!tokens || typeof tokens !== 'object') return 0;
  let total = 0;
  for (const model of Object.keys(tokens)) {
    total += sumTokens(tokens[model] || {});
  }
  return total;
}

function flattenRow(row, rates) {
  const out = {};
  const actual = (row && row.actual) || {};
  const priceTable = rates || {};

  if (num(actual.cost_usd)) out.cost_usd = actual.cost_usd;
  out.tokens = totalTokens(row);
  if (num(actual.wall_clock_s)) out.wall_s = actual.wall_clock_s;
  if (num(actual.active_agent_s)) out.active_s = actual.active_agent_s;

  if (actual.local && num(actual.local.model_s)) out.local_s = actual.local.model_s;
  if (actual.ci && typeof actual.ci === 'object') {
    out.ci_s = (actual.ci.run_s || 0) + (actual.ci.queue_s || 0);
  }
  if ('wall_s' in out && ('local_s' in out || 'ci_s' in out)) {
    out.claude_s = Math.max(0, out.wall_s - (out.local_s || 0) - (out.ci_s || 0));
  }

  const tokens = actual.tokens || {};
  for (const model of Object.keys(tokens)) {
    const t = tokens[model] || {};
    out['model_tokens:' + model] = sumTokens(t);
    out['model_cost:' + model] = modelCostOf(priceTable[model], t);
  }

  const phases = actual.by_phase || {};
  for (const phase of Object.keys(phases)) {
    const p = phases[phase] || {};
    if (num(p.tokens)) out['phase_tokens:' + phase] = p.tokens;
    if (num(p.cost_usd)) out['phase_cost:' + phase] = p.cost_usd;
  }
  return out;
}

module.exports = { SCALED_PREFIXES, ZERO_DEFAULT_PREFIXES, modelCostOf, totalTokens, flattenRow };
