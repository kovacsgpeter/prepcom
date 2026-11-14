#!/usr/bin/env sh
# dev-workflow (4.27.0) önellenőrző a futási metrika-gyűjtéshez (ORD-376):
#   1. a fájlok megvannak (séma, validátor, gyűjtő, fixture-ök);
#   2. a RUN_METRICS* és LOCAL_HW_PROFILE kulcsok a config.template.md preset-táblájában a
#      csomag-alapértékkel, a "### RUN_METRICS értékek" szakasz és a Codex-port megjegyzés megvan;
#   3. a séma JSON-ként betölthető, és nem tartalmaz "notes" / "estimate_note" kulcsot;
#   4. a valid-rows.jsonl minden sora érvényes, az invalid-rows.jsonl minden sora érvénytelen;
#   5. a collect-run-metrics.js --help 0-val lép ki.
set -eu

fail() {
  echo "verify-run-metrics-config: $*" >&2
  exit 1
}

SK=.claude/skills/dev-workflow

# --- 1. Fájlok ---
for f in \
  $SK/schemas/run-metrics.v1.json \
  $SK/scripts/validate-run-metrics.js \
  $SK/scripts/collect-run-metrics.js \
  $SK/schemas/fixtures/valid-rows.jsonl \
  $SK/schemas/fixtures/invalid-rows.jsonl; do
  test -f "$f" || fail "hiányzó fájl: $f"
done

# --- 2. Config-kulcsok ---
TPL=$SK/config.template.md
for kv in 'RUN_METRICS|off' 'RUN_METRICS_STORE|~/.dev-workflow/metrics/runs.jsonl' \
  'RUN_METRICS_MIN_SAMPLES|3' 'RUN_METRICS_EXCLUDE_ANOMALIES|on' 'LOCAL_HW_PROFILE|*(üres)*'; do
  k=${kv%%|*}
  v=${kv#*|}
  grep -Fq "| \`$k\` | \`$v\` | \`$v\` | \`$v\` |" "$TPL" ||
    grep -Fq "| \`$k\` | $v | $v | $v |" "$TPL" ||
    fail "$TPL: a(z) $k kulcs hiányzik vagy nem '$v' az alapértéke"
done
grep -Fq '### RUN_METRICS értékek' "$TPL" || fail "$TPL: hiányzik a \"### RUN_METRICS értékek\" szakasz"
grep -Fq '**Codex-port**' "$SK/config-reference.md" || fail "$SK/config-reference.md: hiányzik a Codex-port megjegyzés"

# --- 3. Séma ---
SCHEMA=$SK/schemas/run-metrics.v1.json
node -e '
const fs = require("fs");
const text = fs.readFileSync(process.argv[1], "utf8");
try { JSON.parse(text); } catch (e) { console.error("a séma nem érvényes JSON: " + e.message); process.exit(1); }
for (const k of ["\"notes\"", "\"estimate_note\""]) {
  if (text.includes(k)) { console.error("a séma tiltott kulcsot tartalmaz: " + k); process.exit(1); }
}
' "$SCHEMA" || fail "séma-ellenőrzés sikertelen"

# --- 4. Fixture-ök ---
node -e '
const fs = require("fs");
const { validateRow, loadSchema } = require(process.argv[1]);
const schema = loadSchema(process.argv[2]);
const rows = (f) => fs.readFileSync(f, "utf8").split("\n").filter((l) => l.trim());
let bad = 0;
rows(process.argv[3]).forEach((l, i) => {
  const errs = validateRow(JSON.parse(l), schema);
  if (errs.length) { console.error("valid-rows.jsonl " + (i + 1) + ". sor érvénytelen: " + errs[0]); bad++; }
});
rows(process.argv[4]).forEach((l, i) => {
  let errs;
  try { errs = validateRow(JSON.parse(l), schema); } catch (e) { errs = [e.message]; }
  if (!errs.length) { console.error("invalid-rows.jsonl " + (i + 1) + ". sor érvényes"); bad++; }
});
process.exit(bad ? 1 : 0);
' "$PWD/$SK/scripts/validate-run-metrics.js" "$SCHEMA" "$SK/schemas/fixtures/valid-rows.jsonl" \
  "$SK/schemas/fixtures/invalid-rows.jsonl" || fail "fixture-ellenőrzés sikertelen"

# --- 5. Gyűjtő súgó ---
node $SK/scripts/collect-run-metrics.js --help >/dev/null || fail "a collect-run-metrics.js --help nem 0-val lép ki"

echo "verify-run-metrics-config: OK"
