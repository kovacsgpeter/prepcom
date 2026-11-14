'use strict';

/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * A becslés-blokk szövege (E3 epic-terv és A6 terv-jóváhagyás). Tiszta függvények, a kimenetben
 * nincs időbélyeg. A mintacímkét (minta: ...) a becslés `sample` mezőjéből állítja elő.
 */

const { formatCost, formatTokens, formatDuration } = require('./format-units');

const LABEL_WIDTH = 12;
const VALUE_WIDTH = 10;

const MEASURE_LABELS = {
  cost_usd: 'költség',
  tokens: 'token',
  wall_s: 'falióra',
  active_s: 'aktív idő',
};
const MEASURE_ORDER = ['cost_usd', 'tokens', 'wall_s', 'active_s'];

function has(obj, key) {
  return Boolean(obj) && typeof obj[key] === 'number';
}

// A modellnév rövidítése: a claude- előtag és a verziószám nélkül (claude-sonnet-4-5 -> sonnet).
function shortModel(name) {
  return name.replace(/^claude-/, '').replace(/-\d.*$/, '');
}

function modelDetail(p50) {
  const entries = Object.keys(p50)
    .filter((k) => k.startsWith('model_cost:') && p50[k] > 0)
    .map((k) => ({ name: shortModel(k.slice('model_cost:'.length)), value: p50[k] }));
  entries.sort((a, b) => b.value - a.value || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return entries.map((e) => `${e.name} ${formatCost(e.value)}`).join(' / ');
}

function wallDetail(p50, roundsFix) {
  const parts = [];
  if (has(p50, 'local_s')) parts.push(`helyi LLM ${formatDuration(p50.local_s)}`);
  if (has(p50, 'claude_s')) parts.push(`Claude ${formatDuration(p50.claude_s)}`);
  if (has(p50, 'ci_s')) parts.push(`CI ${formatDuration(p50.ci_s)}`);
  if (roundsFix) parts.push(`javítókör ${roundsFix.min}–${roundsFix.max}`);
  return parts.join(' · ');
}

function row(label, a, b, detail) {
  const line = (label.padEnd(LABEL_WIDTH) + a.padEnd(VALUE_WIDTH) + b).trimEnd();
  return detail ? `${line}  (${detail})` : line;
}

// A P50/P80 táblázat sorai (fejléc és mutatók).
function tableLines(p50, p80, roundsFix) {
  const lines = [''.padEnd(LABEL_WIDTH) + 'P50'.padEnd(VALUE_WIDTH) + 'P80'];
  if (has(p50, 'cost_usd')) {
    lines.push(row('Claude $', formatCost(p50.cost_usd), formatCost(p80.cost_usd), modelDetail(p50)));
  }
  if (has(p50, 'tokens')) {
    lines.push(row('Tokenek', formatTokens(p50.tokens), formatTokens(p80.tokens), ''));
  }
  if (has(p50, 'wall_s')) {
    lines.push(
      row('Falióra', formatDuration(p50.wall_s), formatDuration(p80.wall_s), wallDetail(p50, roundsFix))
    );
  }
  if (has(p50, 'active_s')) {
    lines.push(row('Aktív idő', formatDuration(p50.active_s), formatDuration(p80.active_s), ''));
  }
  return lines;
}

function sampleLabel(sample) {
  if (sample.scope === 'project') return `${sample.project} n=${sample.n}`;
  if (sample.scope === 'all') {
    return `minden projekt n=${sample.n} (${sample.project} n=${sample.n_project})`;
  }
  return `heurisztika n=${sample.n}`;
}

function headLine(est, subtasks) {
  const target = est.target || {};
  const inner = [];
  if (target.complexity) inner.push(target.complexity);
  if (typeof target.plan_steps === 'number') inner.push(`${target.plan_steps} lépés`);
  if (Array.isArray(subtasks) && subtasks.length > 0) {
    const local = subtasks.filter((s) => s.executor === 'local').length;
    inner.push(`${local}/${subtasks.length} helyi sub-task`);
  }
  let line = `Becslés ${est.story}`;
  if (inner.length > 0) line += ` (${inner.join(', ')})`;
  const sample = est.sample || {};
  if (est.basis === 'history') {
    const level = sample.level === 'strict' ? 'szigorú' : 'laza';
    line += ` — n=${sample.n} hasonló (k=${sample.k}), ujjlenyomat: ${level}`;
  } else if (est.basis === 'heuristic') {
    line += ` — heurisztikus becslés, n=${sample.n} korábbi story`;
  }
  return line;
}

function formatBlock(est, opts) {
  const options = opts || {};
  const lines = [headLine(est, options.subtasks)];
  if (est.basis === 'none') {
    lines.push('Nincs elég adat a becsléshez (a store üres vagy nincs használható sor)');
    return lines.join('\n');
  }
  lines.push(`minta: ${sampleLabel(est.sample)}`);
  if (est.confidence === 'low' || est.basis === 'heuristic') {
    lines.push('FIGYELEM: alacsony megbízhatóság (heurisztikus becslés)');
  }
  lines.push(...tableLines(est.p50, est.p80, est.rounds_fix));

  const cal = est.calibration;
  if (cal && cal.applied && cal.factors) {
    const key = MEASURE_ORDER.find((m) => typeof cal.factors[m] === 'number');
    if (key) lines.push(`Korrekció: ×${cal.factors[key].toFixed(2)} (n=${cal.n} korábbi becslés)`);
  }
  const hits = est.hit_rate || {};
  const hitParts = MEASURE_ORDER.filter((m) => hits[m]).map(
    (m) => `${MEASURE_LABELS[m]} ${hits[m].hit}/${hits[m].total}`
  );
  if (hitParts.length > 0) lines.push(`P80 találati arány: ${hitParts.join(', ')}`);
  for (const risk of est.risks || []) {
    let line = `Kockázat: ${risk.count}/${risk.total} hasonló futásban ${risk.code}`;
    if (typeof risk.extra_wall_s === 'number') line += ` (+${Math.round(risk.extra_wall_s / 60)} p)`;
    lines.push(line);
  }
  return lines.join('\n');
}

// Sub-task sorok (heurisztikus felosztás: mindig alacsony megbízhatóság).
function formatSubtaskLines(parts) {
  if (!parts || parts.length === 0) return '';
  const lines = ['Sub-task bontás — FIGYELEM: alacsony megbízhatóság (heurisztikus felosztás)'];
  for (const part of parts) {
    const kind = [part.type, part.executor].filter(Boolean).join(', ');
    const head = `  ${part.id}${kind ? ` (${kind})` : ''} ${Math.round(part.share * 100)}%`;
    const a = part.p50;
    const b = part.p80;
    const cells = [];
    if (has(a, 'cost_usd')) cells.push(`$ ${formatCost(a.cost_usd)} / ${formatCost(b.cost_usd)}`);
    if (has(a, 'tokens')) cells.push(`${formatTokens(a.tokens)} / ${formatTokens(b.tokens)}`);
    if (has(a, 'wall_s')) cells.push(`${formatDuration(a.wall_s)} / ${formatDuration(b.wall_s)}`);
    if (has(a, 'local_s')) cells.push(`helyi ${formatDuration(a.local_s)} / ${formatDuration(b.local_s)}`);
    lines.push(`${head}: ${cells.join(' · ')}`);
  }
  return lines.join('\n');
}

// Epic-blokk: storynkénti blokk, epic_overhead, összeg és megjegyzés.
function formatEpicBlock(epic) {
  const blocks = epic.stories.map((s) => formatBlock(s, {}));
  const lines = [`Epic ${epic.epic}: ${epic.stories.length} story`];
  if (epic.overhead) {
    const ov = epic.overhead;
    const scope = ov.scope === 'project' ? 'saját projekt' : 'minden projekt';
    lines.push(
      `epic_overhead: n=${ov.n} (${scope}), P50 ${formatCost(ov.p50.cost_usd || 0)} $ / ` +
        `${formatDuration(ov.p50.wall_s || 0)}, P80 ${formatCost(ov.p80.cost_usd || 0)} $ / ` +
        `${formatDuration(ov.p80.wall_s || 0)}`
    );
  }
  lines.push(`Összesen (storyk${epic.overhead ? ' és epic_overhead' : ''}):`);
  lines.push(...tableLines(epic.total.p50, epic.total.p80, null));
  lines.push(
    'Megjegyzés: a P80-ak összege konzervatív; a hullámok összeadva, párhuzamosság nincs modellezve'
  );
  return blocks.join('\n\n') + '\n\n' + lines.join('\n');
}

module.exports = { formatBlock, formatEpicBlock, formatSubtaskLines, sampleLabel };
