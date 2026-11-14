#!/usr/bin/env sh
# dev-workflow (4.28.0) önellenőrző a futási becsléshez (ORD-377):
#   1. a modulok, tesztek, a CLI és a fixture-esetek fájljai megvannak;
#   2. az estimate/ alatt nincs Date.now / new Date / Math.random (determinizmus);
#   3. a fixture-esetek JSON-fájljai parse-olhatók, a store.jsonl minden sora érvényes;
#   4. az estimate-run.js --help 0-val lép ki;
#   5. az estimate/run-all-tests.js (modulok + fixture-teszt) zöld;
#   6. a config.template.md RUN_METRICS szakasza nem mondja "még nincs implementálva"-nak,
#      és említi az estimate-run.js-t;
#   7. az epic-mode.md és a SKILL.md említi az estimate-run.js-t.
set -eu

fail() {
  echo "verify-estimate-config: $*" >&2
  exit 1
}

SK=.claude/skills/dev-workflow
E=$SK/scripts/estimate
F=$SK/schemas/fixtures/estimate

# --- 1. Fájlok ---
for m in stats rows fingerprint scope similarity metrics aggregate heuristic risk calibration \
  subtasks format-units format-block build epic; do
  test -f "$E/$m.js" || fail "hiányzó modul: $E/$m.js"
  test -f "$E/$m.test.js" || fail "hiányzó modulteszt: $E/$m.test.js"
done
for f in $E/run-all-tests.js $SK/scripts/estimate-run.js $SK/scripts/estimate-run.fixtures.test.js \
  $F/README.md $F/pricing.json $F/fingerprint.json; do
  test -f "$f" || fail "hiányzó fájl: $f"
done
for c in project-own fallback-all heuristic loose-anomalies calibration epic subtasks; do
  input=features.json
  if [ "$c" = epic ]; then input=stories.json; fi
  for f in args.json "$input" store.jsonl expected.json expected.txt; do
    test -f "$F/cases/$c/$f" || fail "hiányzó fixture-fájl: $F/cases/$c/$f"
  done
done

# --- 2. Determinizmus ---
if grep -nE 'Date\.now|new Date|Math\.random' "$E"/*.js >/dev/null 2>&1; then
  grep -nE 'Date\.now|new Date|Math\.random' "$E"/*.js >&2
  fail "az $E alatt időbélyeg vagy véletlen használata tilos"
fi

# --- 3. Fixture-ök érvényessége ---
node -e '
const fs = require("fs");
const path = require("path");
const { validateRow, loadSchema } = require(process.argv[1]);
const schema = loadSchema(process.argv[2]);
const casesDir = process.argv[3];
let bad = 0;
for (const c of fs.readdirSync(casesDir)) {
  const dir = path.join(casesDir, c);
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (f.endsWith(".json")) {
      try { JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { console.error(p + ": érvénytelen JSON: " + e.message); bad++; }
    }
  }
  fs.readFileSync(path.join(dir, "store.jsonl"), "utf8").split("\n").filter((l) => l.trim()).forEach((l, i) => {
    let errs;
    try { errs = validateRow(JSON.parse(l), schema); } catch (e) { errs = [e.message]; }
    if (errs.length) { console.error(c + "/store.jsonl " + (i + 1) + ". sor érvénytelen: " + errs[0]); bad++; }
  });
}
for (const f of ["pricing.json", "fingerprint.json"]) {
  try { JSON.parse(fs.readFileSync(path.join(casesDir, "..", f), "utf8")); } catch (e) { console.error(f + ": érvénytelen JSON"); bad++; }
}
process.exit(bad ? 1 : 0);
' "$PWD/$SK/scripts/validate-run-metrics.js" "$SK/schemas/run-metrics.v1.json" "$F/cases" ||
  fail "fixture-ellenőrzés sikertelen"

# --- 4. CLI súgó ---
node $SK/scripts/estimate-run.js --help >/dev/null || fail "az estimate-run.js --help nem 0-val lép ki"

# --- 5. Tesztek ---
node $E/run-all-tests.js >/dev/null || fail "az estimate/run-all-tests.js sikertelen"

# --- 6. config.template.md ---
TPL=$SK/config-reference.md  # ORD-497: a RUN_METRICS magyarázata a referenciában
SECTION=$(awk '/^### RUN_METRICS értékek/{f=1;next} /^### /{f=0} f' "$TPL")
if printf '%s\n' "$SECTION" | grep -Fq 'még nincs implementálva'; then
  fail "$TPL: a RUN_METRICS szakasz még 'nincs implementálva'-t mond"
fi
printf '%s\n' "$SECTION" | grep -Fq 'estimate-run.js' || fail "$TPL: a RUN_METRICS szakasz nem említi az estimate-run.js-t"

# --- 7. Leírások ---
grep -Fq 'estimate-run.js' .claude/skills/dev-workflow-execute/epic-mode.md ||
  fail "az epic-mode.md nem említi az estimate-run.js-t"
grep -Fq 'estimate-run.js' .claude/skills/dev-workflow-execute/SKILL.md ||
  fail "a SKILL.md nem említi az estimate-run.js-t"

echo "verify-estimate-config: OK"
