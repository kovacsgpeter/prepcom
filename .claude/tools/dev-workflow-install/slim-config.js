#!/usr/bin/env node
// ORD-497 (4.30.0): a repo-lokális dev-workflow `config.md` egyszeri átállítása a hosszú
// (értékek + magyarázatok) formátumról a rövid, csak értékeket tartalmazó formátumra.
// A magyarázatok a csomaggal verziózott `config-reference.md`-be kerültek.
//
// Használat:
//   node slim-config.js <élő-config.md> <új-sablon.md> [<régi-sablon.md>]
//
// Működés:
//   - Az új (rövid) sablonból indul. Minden kulcssorba az élő config explicit értékét írja
//     (ugyanazzal a szabállyal, mint a scripts/config-value.sh: az első olyan kulcssor, amelyet
//     nem követ üres első cellás folytatósor); a preset-tábla soraiba az élő preset-cellákat.
//   - A repó-specifikus táblákat (repók, teszt-env, indító mondatok, issue-type map) az élő
//     configból szó szerint átveszi.
//   - Az élő config olyan explicit kulcsai, amelyeknek az új sablonban nincs explicit sora,
//     a „Repó-lokális kulcsok (migrálva)” szakaszba kerülnek.
//   - Az élő config olyan szakaszai, amelyek címe sem a `config-reference.md`-ben, sem az új
//     sablonban nem szerepel (repó-lokális kiegészítések), szó szerint a fájl végére kerülnek
//     (a máshová már beírt kulcssoraik nélkül).
//   - Önellenőrzés: minden kulcsra és mindhárom profilra a régi és az új fájl feloldott
//     értékének egyeznie kell; eltérésnél semmit nem ír (kilépőkód 1).
//   - A régi fájlt `<élő-config.md>.pre-4.30.bak` néven menti, a sorvéget megőrzi.
//   - Ha a régi sablon is megvan, listázza azokat a szakaszokat, amelyek szövege lokálisan
//     eltért a régi sablontól (kézi átnézésre; ezek a szövegek csak a .bak-ban maradnak meg).
//
// Kilépőkód: 0 átállítva; 10 nincs teendő (már rövid formátum, vagy a sablon nem rövid);
//            1 hiba / bizonytalan — az élő fájl GARANTÁLTAN változatlan; 2 használati hiba.
'use strict';
const fs = require('fs');
const path = require('path');

const SLIM_MARKER = /^# dev-workflow — konfiguráció \(értékek\)\s*$/m;
const KEY_HDR = /^(Változó|Kapcsoló)$/;
const REPO_TABLE_HDR = [/^Logikai név$/, /^#$/, /^`JIRA_SUBTASK_ISSUE_TYPE_MAP` kulcs$/];
const LOCAL_KEYS_HEADING = '## Repó-lokális kulcsok (migrálva)';
const LOCAL_SECTIONS_HEADING = '## Repó-lokális kiegészítések (migrálva)';
const PROFILES = ['cheap', 'balanced', 'genius'];

function usage() {
  process.stderr.write('Használat: node slim-config.js <élő-config.md> <új-sablon.md> [<régi-sablon.md>]\n');
  process.exit(2);
}

// --- config-value.sh-kompatibilis olvasás (awk-szemantika: minden `|` cellahatár) ---------
const trim = (s) => s.replace(/^[ \t]+|[ \t]+$/g, '');
const isRow = (l) => /^[ \t]*\|/.test(l);
const isSep = (l) => /^[ \t]*\|[ \t]*:?-{3,}/.test(l);
function cells(l) {
  let t = trim(l).replace(/^\|/, '').replace(/\|[ \t]*$/, '');
  return t.split('|');
}
const firstTick = (c) => {
  const m = /`([^`]+)`/.exec(c);
  return m ? m[1] : '';
};

// Táblák listája: { start, end (excl), header: cells[], rows: [{idx, cells}] }
function tables(lines) {
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    if (!(isSep(lines[i]) && isRow(lines[i - 1]))) continue;
    const t = { start: i - 1, header: cells(lines[i - 1]).map((c) => trim(c).replace(/`/g, '')), rows: [] };
    let j = i + 1;
    while (j < lines.length && isRow(lines[j])) {
      t.rows.push({ idx: j, cells: cells(lines[j]) });
      j++;
    }
    t.end = j;
    t.rawHeader = trim(cells(lines[i - 1])[0]);
    out.push(t);
    i = j - 1;
  }
  return out;
}

// Explicit értékek: kulcs -> { cell (nyers 2. cella), value (feloldott) } — az első nyer.
function explicitValues(lines) {
  const map = new Map();
  for (const t of tables(lines)) {
    if (!KEY_HDR.test(t.header[0])) continue;
    t.rows.forEach((r, k) => {
      const key = firstTick(r.cells[0]);
      if (!key || map.has(key)) return;
      const next = t.rows[k + 1];
      if (next && trim(next.cells[0]) === '') return; // értékfelsorolás, nem beállított érték
      const v = firstTick(r.cells[1] || '') || trim(r.cells[1] || '');
      map.set(key, { cell: trim(r.cells[1] || ''), value: v, raw: lines[r.idx] });
    });
  }
  return map;
}

function presetTable(lines) {
  const t = tables(lines).find((x) => x.header[0] === 'Egyedi kapcsoló');
  if (!t) return null;
  const col = {};
  t.header.forEach((h, i) => {
    if (PROFILES.includes(h)) col[h] = i;
  });
  const rows = new Map();
  for (const r of t.rows) {
    const key = firstTick(r.cells[0]);
    if (key && !rows.has(key)) rows.set(key, Object.fromEntries(PROFILES.map((p) => [p, trim(r.cells[col[p]] ?? '')])));
  }
  return { table: t, rows };
}

function resolve(lines, key, profile, ex, pre) {
  if (ex.has(key) && ex.get(key).value !== '') return ex.get(key).value;
  if (key === 'WORKFLOW_PROFILE') return '';
  let prof = profile;
  if (!prof) {
    const p = ex.get('WORKFLOW_PROFILE');
    prof = p ? p.value : '';
  }
  if (!PROFILES.includes(prof)) prof = 'balanced';
  const row = pre && pre.rows.get(key);
  if (!row) return '';
  const cell = row[prof];
  return /^`[^`]+`$/.test(cell) ? cell.slice(1, -1) : '';
}

function allKeys(lines) {
  const ks = new Set();
  for (const l of lines) {
    const m = /^[ \t]*\|[ \t]*`([A-Z][A-Z0-9_]*)`/.exec(l);
    if (m) ks.add(m[1]);
  }
  return ks;
}

// --- szakaszok ----------------------------------------------------------------------------
function headings(lines) {
  return lines.map((l, i) => ({ l, i })).filter((x) => /^#{2,3} /.test(x.l));
}
function sectionRange(lines, hIdx) {
  const level = lines[hIdx].match(/^#+/)[0].length;
  let j = hIdx + 1;
  while (j < lines.length) {
    const m = /^(#{1,3}) /.exec(lines[j]);
    if (m && m[1].length <= level) break;
    j++;
  }
  return [hIdx, j];
}
// Csak a szakasz saját szövege (az alszakaszok nélkül), összehasonlításhoz normalizálva.
function ownText(lines, hIdx) {
  let j = hIdx + 1;
  while (j < lines.length && !/^#{1,3} /.test(lines[j])) j++;
  return lines
    .slice(hIdx + 1, j)
    .filter((l) => !isRow(l))
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2 || args.length > 3) usage();
  const [liveFile, newTmplFile, oldTmplFile] = args;
  let liveRaw, tmplRaw, refRaw, oldTmplRaw;
  try {
    liveRaw = fs.readFileSync(liveFile, 'utf8');
    tmplRaw = fs.readFileSync(newTmplFile, 'utf8');
  } catch (e) {
    process.stderr.write(`HIBA: ${e.message}\n`);
    process.exit(1);
  }
  if (SLIM_MARKER.test(liveRaw)) {
    process.stdout.write('NINCS TEENDŐ: a config.md már a rövid formátumú.\n');
    process.exit(10);
  }
  if (!SLIM_MARKER.test(tmplRaw)) {
    process.stdout.write('NINCS TEENDŐ: a sablon nem a rövid formátumú.\n');
    process.exit(10);
  }
  const refFile = path.join(path.dirname(newTmplFile), 'config-reference.md');
  try {
    refRaw = fs.readFileSync(refFile, 'utf8');
  } catch (e) {
    process.stderr.write(`HIBA: a config-reference.md nem olvasható (${refFile}): ${e.message}\n`);
    process.exit(1);
  }
  if (oldTmplFile) {
    try {
      oldTmplRaw = fs.readFileSync(oldTmplFile, 'utf8');
    } catch {
      oldTmplRaw = null;
    }
  }

  const crlf = /\r\n/.test(liveRaw);
  const live = liveRaw.replace(/\r\n/g, '\n').split('\n');
  const tmpl = tmplRaw.replace(/\r\n/g, '\n').split('\n');
  const ref = refRaw.replace(/\r\n/g, '\n').split('\n');

  const liveEx = explicitValues(live);
  const livePre = presetTable(live);
  const out = tmpl.slice();
  const placed = new Set();

  // 1. explicit kulcssorok
  for (const t of tables(out)) {
    if (!KEY_HDR.test(t.header[0])) continue;
    for (const r of t.rows) {
      const key = firstTick(r.cells[0]);
      if (!key || !liveEx.has(key)) continue;
      out[r.idx] = `| \`${key}\` | ${liveEx.get(key).cell} |`;
      placed.add(key);
    }
  }
  // 2. preset-tábla
  const newPre = presetTable(out);
  if (newPre && livePre) {
    for (const r of newPre.table.rows) {
      const key = firstTick(r.cells[0]);
      const lr = livePre.rows.get(key);
      if (lr) out[r.idx] = `| \`${key}\` | ${lr.cheap} | ${lr.balanced} | ${lr.genius} |`;
    }
  }
  // 3. repó-specifikus táblák (hátulról, hogy az indexek ne csússzanak)
  const liveTables = tables(live);
  const outTables = tables(out).reverse();
  for (const t of outTables) {
    const pat = REPO_TABLE_HDR.find((p) => p.test(t.rawHeader));
    if (!pat) continue;
    const lt = liveTables.find((x) => pat.test(x.rawHeader));
    if (!lt) continue;
    out.splice(t.start, t.end - t.start, ...live.slice(lt.start, lt.end));
  }

  // 4. el nem helyezett explicit kulcsok
  const leftovers = [...liveEx.entries()].filter(([k]) => !placed.has(k));
  // 5. repó-lokális szakaszok
  const known = new Set([...headings(ref), ...headings(tmpl)].map((h) => h.l.trim()));
  const localBlocks = [];
  const carriedKeys = new Set();
  const hs = headings(live);
  let skipUntil = -1;
  for (const h of hs) {
    if (h.i < skipUntil || known.has(h.l.trim())) continue;
    const [a, b] = sectionRange(live, h.i);
    skipUntil = b;
    const block = live.slice(a, b).filter((l) => {
      const k = firstTick((isRow(l) && cells(l)[0]) || '');
      if (k && placed.has(k) && liveEx.has(k) && liveEx.get(k).raw === l) return false;
      if (k) carriedKeys.add(k);
      return true;
    });
    // üresen maradt táblafej (fejléc + elválasztó) eltávolítása
    for (let i = block.length - 2; i >= 0; i--) {
      if (isRow(block[i]) && isSep(block[i + 1]) && !isRow(block[i + 2] || '') && !isRow(block[i - 1] || '')) block.splice(i, 2);
    }
    localBlocks.push(block);
  }
  const leftoverRows = leftovers.filter(([k]) => !carriedKeys.has(k));
  while (out.length && out[out.length - 1] === '') out.pop();
  if (leftoverRows.length) {
    out.push('', LOCAL_KEYS_HEADING, '', '| Változó | Érték |', '|---|---|');
    for (const [k, v] of leftoverRows) out.push(`| \`${k}\` | ${v.cell} |`);
  }
  if (localBlocks.length) {
    out.push('', LOCAL_SECTIONS_HEADING, '');
    for (const b of localBlocks) {
      while (b.length && b[b.length - 1] === '') b.pop();
      out.push(...b.map((l) => l.replace(/^## /, '### ')), '');
    }
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  out.push('');

  // 6. önellenőrzés
  const newEx = explicitValues(out);
  const newPre2 = presetTable(out);
  const keys = new Set([...allKeys(live), ...allKeys(out)]);
  const diffs = [];
  for (const k of keys) {
    for (const p of PROFILES) {
      const a = resolve(live, k, p, liveEx, livePre);
      const b = resolve(out, k, p, newEx, newPre2);
      if (a !== '' && a !== b) diffs.push(`${k} [${p}]: '${a}' -> '${b}'`);
    }
  }
  const pa = resolve(live, 'WORKFLOW_PROFILE', '', liveEx, livePre);
  const pb = resolve(out, 'WORKFLOW_PROFILE', '', newEx, newPre2);
  if (pa !== pb) diffs.push(`WORKFLOW_PROFILE: '${pa}' -> '${pb}'`);
  if (diffs.length) {
    process.stderr.write('HIBA: az átállítás megváltoztatna feloldott értékeket — a config.md változatlan:\n');
    for (const d of diffs.slice(0, 30)) process.stderr.write(`  - ${d}\n`);
    process.exit(1);
  }

  // 7. eltérő lokális szöveg (csak a régi sablonnal)
  const changed = [];
  if (oldTmplRaw) {
    const old = oldTmplRaw.replace(/\r\n/g, '\n').split('\n');
    const oldText = new Map(headings(old).map((h) => [h.l.trim(), ownText(old, h.i)]));
    for (const h of hs) {
      const t = oldText.get(h.l.trim());
      if (t !== undefined && t !== ownText(live, h.i)) changed.push(h.l.trim());
    }
  }

  const text = crlf ? out.join('\n').replace(/\n/g, '\r\n') : out.join('\n');
  const bak = `${liveFile}.pre-4.30.bak`;
  try {
    fs.writeFileSync(bak, liveRaw);
    fs.writeFileSync(liveFile, text);
  } catch (e) {
    process.stderr.write(`HIBA: írás sikertelen: ${e.message}\n`);
    try {
      fs.writeFileSync(liveFile, liveRaw);
    } catch {}
    process.exit(1);
  }
  process.stdout.write(
    `ÁTÁLLÍTVA: ${liveFile} — rövid formátum (${Buffer.byteLength(liveRaw)} -> ${Buffer.byteLength(text)} bájt), ` +
      `${placed.size} kulcs a helyén, ${leftoverRows.length} repó-lokális kulcs, ${localBlocks.length} repó-lokális szakasz; ` +
      `a régi fájl: ${bak}\n`,
  );
  if (changed.length) {
    process.stdout.write('NÉZD ÁT: ezeknek a szakaszoknak a szövege lokálisan eltért a régi sablontól (a régi szöveg csak a .bak-ban van meg):\n');
    for (const c of changed) process.stdout.write(`  - ${c}\n`);
  }
  process.exit(0);
}

if (require.main === module) main();
module.exports = { explicitValues, presetTable, resolve, tables };
