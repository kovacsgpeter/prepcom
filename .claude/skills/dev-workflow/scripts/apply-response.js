#!/usr/bin/env node
// dev-workflow (ORD-365, 4.25.0) — a helyi implementer validált válaszának kiírása a
// munkafába (a local-runner és a story-runner „Válasz alkalmazása” lépése, lásd
// .claude/agents/local-runner.md).
//
// Használat: node apply-response.js <munkafa> <response.json> <engedélyezett1> [engedélyezett2 ...]
//
// A filesWritten minden útvonalára kiírja a fileContents tartalmát (záró sortöréssel).
// Elutasítja a listán kívüli (a terv adott lépésének fájllistáján nem szereplő), az abszolút
// és a ".."-t tartalmazó útvonalat, valamint a tartalom nélküli bejegyzést. A commit-üzenet a
// <response.json>.commitmsg fájlba kerül.
//
// Kilépési kódok: 0 — kiírva; 4 — a modell maga jelzett hibát (status != ok); 5 — tiltott
// útvonal vagy hiányzó tartalom (semmi nem íródik ki); egyéb (pl. érvénytelen JSON) — node-hiba, 1.
const fs = require('fs');
const path = require('path');
const [, , wt, respFile, ...allowed] = process.argv;
const r = JSON.parse(fs.readFileSync(respFile, 'utf8'));
if (r.status !== 'ok') { console.error('STATUS ' + r.status + ': ' + r.summary); process.exit(4); }
const bad = [];
for (const f of r.filesWritten) {
  if (path.isAbsolute(f) || f.split('/').includes('..') || !allowed.includes(f)) bad.push(f);
  if (typeof (r.fileContents || {})[f] !== 'string') bad.push(f + ' (no content)');
}
if (bad.length) { console.error('REJECTED: ' + bad.join(', ')); process.exit(5); }
for (const f of r.filesWritten) {
  const p = path.join(wt, f);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, r.fileContents[f].endsWith('\n') ? r.fileContents[f] : r.fileContents[f] + '\n');
  console.log('wrote ' + f);
}
fs.writeFileSync(respFile + '.commitmsg', r.commitMessage || '');
console.log('summary: ' + r.summary);
if (r.openQuestions && r.openQuestions.length) console.log('openQuestions: ' + JSON.stringify(r.openQuestions));
