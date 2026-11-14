#!/usr/bin/env node
// dev-workflow (ORD-365, 4.25.0) — a helyi implementer-hívás promptjának összeállítása
// (a local-runner és a story-runner „Prompt összeállítása” lépése, lásd
// .claude/agents/local-runner.md).
//
// Használat: node build-prompt.js <munkafa> <prompt-fájl> <task.md> <fájl1> [fájl2 ...]
//
// Sorrendben összefűzi: a munkafa local-prompts/implementer.md sablonját, a task.md-t, a
// repó konvenció-fájlját (ha van), majd a felsorolt repo-relatív fájlok JELENLEGI tartalmát
// (a nem létező fájl NEW jelölést kap). A prompt hosszát kiírja.
//
// Konvenció-fájl: a LOCAL_CONVENTIONS_FILE kulcs (környezeti változó, különben a config.md
// `Kapcsoló` táblája; a config helye $DEV_WORKFLOW_CONFIG, különben a munkafa
// .claude/skills/dev-workflow/config.md-je). A `{task_dir}` helyőrző a task.md mappája;
// relatív útvonal a munkafához képest értendő. Üres vagy `-` érték, illetve hiányzó kulcs
// esetén a task.md melletti conventions.md (a szállított alapérték is ez).
//
// Kilépési kódok: 0 — rendben; 3 — a prompt hosszabb, mint LOCAL_PROMPT_MAX_CHARS
// (környezeti változó, alap 90000); egyéb (pl. hiányzó sablon) — node-hiba, 1.
const fs = require('fs');
const path = require('path');

const [, , wt, out, task, ...files] = process.argv;
if (!wt || !out || !task) {
  console.error('Használat: node build-prompt.js <munkafa> <prompt-fájl> <task.md> <fájl1> [fájl2 ...]');
  process.exit(2);
}

// A config.md `Kapcsoló` / `Változó` fejlécű tábláiból olvas, mint a config-value.sh.
function configValue(key) {
  if (process.env[key]) return process.env[key];
  const cfg = process.env.DEV_WORKFLOW_CONFIG || path.join(wt, '.claude/skills/dev-workflow/config.md');
  if (!fs.existsSync(cfg)) return '';
  const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|\s*$/, '').split('|');
  const tick = (s) => (s.match(/`([^`]+)`/) || [])[1] || '';
  let inTable = false;
  let prev = '';
  for (const raw of fs.readFileSync(cfg, 'utf8').split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line) && /^\s*\|/.test(prev)) {
      const h = cells(prev)[0].trim().replace(/`/g, '');
      inTable = h === 'Kapcsoló' || h === 'Változó';
    } else if (inTable && /^\s*\|/.test(line)) {
      const c = cells(line);
      if (tick(c[0]) === key) return tick(c[1] || '') || (c[1] || '').trim();
    } else {
      inTable = false;
    }
    prev = line;
  }
  return '';
}

function conventionsPath() {
  const taskDir = path.dirname(task);
  const v = configValue('LOCAL_CONVENTIONS_FILE').trim();
  if (!v || v === '-') return path.join(taskDir, 'conventions.md');
  const p = v.split('{task_dir}').join(taskDir);
  return path.isAbsolute(p) ? p : path.join(wt, p);
}

const maxChars = Number(process.env.LOCAL_PROMPT_MAX_CHARS) || 90000;
const tpl = fs.readFileSync(path.join(wt, '.claude/skills/dev-workflow/local-prompts/implementer.md'), 'utf8');
const conv = conventionsPath();
let s = tpl.trimEnd() + '\n\n' + fs.readFileSync(task, 'utf8').trimEnd() + '\n\n';
if (fs.existsSync(conv)) s += fs.readFileSync(conv, 'utf8').trimEnd() + '\n\n';
else console.error(`figyelem: nincs konvenció-fájl (${conv})`);
s += '## CURRENT FILE CONTENTS\n';
for (const f of files) {
  const p = path.join(wt, f);
  if (fs.existsSync(p)) s += `\n### FILE: ${f}\n\`\`\`\n${fs.readFileSync(p, 'utf8')}\n\`\`\`\n`;
  else s += `\n### FILE: ${f}\n(does not exist yet — NEW file)\n`;
}
fs.writeFileSync(out, s);
console.log(`prompt chars: ${s.length}`);
if (s.length > maxChars) {
  console.error(`TOO LONG (> LOCAL_PROMPT_MAX_CHARS ${maxChars})`);
  process.exit(3);
}
