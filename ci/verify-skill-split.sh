#!/usr/bin/env sh
# ORD-498 (4.31.0): az execute és intake SKILL.md feltételes ágainak kiszervezését ellenőrzi:
#   1. a két SKILL.md mérete a keretben marad (LF-bájt; execute ≤ 46 000, intake ≤ 42 000);
#   2. a két SKILL.md minden relatív .md linkje létező fájlra mutat;
#   3. minden kiszervezett fájlra hivatkozik a saját SKILL.md-je;
#   4. a hivatkozásokban „idézőjelben” megnevezett szakaszcímek léteznek a célfájlban.
set -eu

fail() { echo "verify-skill-split: $*" >&2; exit 1; }

EX=.claude/skills/dev-workflow-execute
IN=.claude/skills/dev-workflow-intake

size() { tr -d '\r' < "$1" | wc -c | tr -d ' '; }
[ "$(size $EX/SKILL.md)" -le 46000 ] || fail "$EX/SKILL.md: $(size $EX/SKILL.md) bájt > 46 000 — feltételes ág a saját fájljába való"
[ "$(size $IN/SKILL.md)" -le 42000 ] || fail "$IN/SKILL.md: $(size $IN/SKILL.md) bájt > 42 000 — feltételes ág a saját fájljába való"

for f in batch-mode local-execution workflow-meta test-env kovet-report; do
  [ -f "$EX/$f.md" ] || fail "hiányzik: $EX/$f.md"
  grep -Fq "[\`$f.md\`]($f.md)" "$EX/SKILL.md" || fail "$EX/SKILL.md nem hivatkozik a(z) $f.md-re"
done
for f in code-scan threat-model nfr adr-trigger; do
  [ -f "$IN/$f.md" ] || fail "hiányzik: $IN/$f.md"
  grep -Fq "[\`$f.md\`]($f.md)" "$IN/SKILL.md" || fail "$IN/SKILL.md nem hivatkozik a(z) $f.md-re"
done

node - "$EX" "$IN" <<'EOF' || exit 1
const fs = require('fs');
const path = require('path');
let bad = 0;
const fail = (m) => { console.error('verify-skill-split: ' + m); bad++; };
for (const dir of process.argv.slice(2)) {
  const skill = path.join(dir, 'SKILL.md');
  const text = fs.readFileSync(skill, 'utf8').replace(/\r/g, '');
  // 2. relatív .md linkek
  for (const m of text.matchAll(/\]\(([^)#\s]+\.md)(#[^)]*)?\)/g)) {
    const target = path.join(dir, m[1]);
    if (!/^[a-z]+:/.test(m[1]) && !fs.existsSync(target)) fail(`${skill}: törött link: ${m[1]}`);
  }
  // 4. „szakasz” hivatkozások a kiszervezett fájlokra: [`x.md`](x.md) ugyanabban a bekezdésben „cím”
  const ownHeads = text.split('\n').filter((l) => /^#{2,3} /.test(l)).map((l) => l.replace(/^#+ /, '').replace(/`/g, ''));
  const paras = text.split(/\n\s*\n|\n(?=- )/);
  for (const p of paras) {
    const files = [...p.matchAll(/\[`([a-z-]+\.md)`\]\(\1\)/g)].map((m) => m[1]).filter((f) => f !== 'SKILL.md');
    if (files.length !== 1) continue;
    const file = path.join(dir, files[0]);
    if (!fs.existsSync(file)) continue;
    const heads = fs.readFileSync(file, 'utf8').replace(/\r/g, '').split('\n')
      .filter((l) => /^#{2,3} /.test(l)).map((l) => l.replace(/^#+ /, '').replace(/`/g, ''));
    for (const q of p.matchAll(/„([^”]+)”/g)) {
      const t = q[1].replace(/`/g, '').trim();
      if (/ /.test(t) && !/^[A-Z0-9]/.test(t)) continue; // idézett mondat, nem szakaszcím
      const has = (hs) => hs.some((h) => h === t || h.startsWith(t));
      if (!has(heads) && !has(ownHeads)) fail(`${skill}: a(z) „${q[1]}” szakasz nincs a ${files[0]}-ben`);
    }
  }
}
process.exit(bad ? 1 : 0);
EOF

echo "verify-skill-split: OK"
