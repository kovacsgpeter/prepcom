#!/usr/bin/env bash
# COCALC-280 (LOCAL-3) — golden-set-alapú kiértékelő: egy dokumentált golden set (feladat-
# brief + fájl/szimbólum szinten rögzített várt leletek) és egy tényleges `repo-scanner`
# nyers-lelet kimenet (COCALC-270 kimeneti szerződés) között három számot ad vissza:
# recall, precision, érvénytelen-fájlút-szám. Ez az `OFFLOAD_PROFILE` (COCALC-278) keret
# ÉLESEDÉSI feltétele — lásd dev-workflow/config.md "OFFLOAD_ACCEPTANCE_* és
# OFFLOAD_AUTO_PROMOTE" szekció, valamint a mérési módszertan a
# dev-workflow/offload-measurements.md-ben. Önellenőrzés: ci/verify-offload-measurements.sh.
#
# A meglévő scripts/ konvenciót követi: `set -euo pipefail`, magyar fejléc-komment a
# config.md releváns szekciójára hivatkozva, beszédes magyar hibaüzenetek, és a
# COCALC-220 (call-local-model.sh) kötelező `--dry-run` konvenciója (lokál/külső bemenet
# nélkül is lefut, beépített fixture-ökkel).
#
# Előfeltétel: `node` a PATH-on — a JSON/markdown feldolgozás ezt használja (nem `jq`-t),
# ugyanazért, amiért a call-local-model.sh is (nincs mindenhol garantáltan `jq`).
#
# Használat:
#   compare-scan-quality.sh --golden <golden-set.json> --scan-output <repo-scanner-kimenet.md> \
#     [--repo-root <dir>]
#   compare-scan-quality.sh --dry-run           # beépített fixture-ök, külső bemenet nélkül
#
# Env-változók (a hívó fél tölti a config.md profil-értékből; itt van az alapérték is):
#   OFFLOAD_ACCEPTANCE_RECALL            (0.8)   e szám alatti recall -> "fail".
#   OFFLOAD_ACCEPTANCE_MAX_INVALID_PATHS (0)     ennél több érvénytelen fájlút -> "fail".
#   OFFLOAD_AUTO_PROMOTE                 (suggest) off | suggest | auto — mi történjen "pass" esetén.
#   COMPARE_SCAN_QUALITY_CONFIG          (.claude/skills/dev-workflow/config.md)
#                                        Ide írja az `auto` promóció az OFFLOAD_PROFILE sort.
#                                        --dry-run-ban, ha nincs explicit megadva, egy eldobható
#                                        temp másolatra mutat (a valós configot sosem írja).
#   COMPARE_SCAN_QUALITY_DRY_RUN_OUTCOME (pass)  CSAK --dry-run: pass|fail — melyik beépített
#                                        scan-fixture-t használja.
#   COMPARE_SCAN_QUALITY_DRY_RUN_CURRENT_PROFILE (off) CSAK --dry-run: az `auto` ág úgy
#                                        viselkedik, mintha a config OFFLOAD_PROFILE sora ezen
#                                        az értéken állna (az "álljon meg, ha nem off" ág tesztje).
#
# Kimenet (stdout): egyetlen JSON sor —
#   {"recall":<0..1>,"precision":<0..1>,"invalidPaths":<egész>,"expectedCount":<egész>,
#    "reportedCount":<egész>,"foundCount":<egész>,"acceptance":"pass"|"fail",
#    "thresholds":{"recall":<szám>,"maxInvalidPaths":<egész>}}
# Ember-olvasható összegzés, javaslatok és figyelmeztetések: stderr.
#
# FIGYELEM: az `acceptance` verdikt CSAK a recallt és az érvénytelen-fájlút-számot kapuzza
# — a precision NEM kapuzott (lásd offload-measurements.md "Ismert korlát"). Alacsony
# precision + `pass` esetén a szkript stderr-figyelmeztetést ad, de a kilépőkód `pass` marad.
#
# Kilépőkódok:
#   0 — a golden-set kiértékelés "pass" (recall >= küszöb ÉS érvénytelen-út <= max),
#       vagy sikeres `auto` promóció.
#   1 — a kiértékelés "fail".
#   2 — kemény hiba (hibás argumentum, hiányzó/olvashatatlan fájl, értelmezhetetlen
#       scan-kimenet, hiányzó `node`).
#   3 — `auto` promóció megtagadva: a config OFFLOAD_PROFILE sora már nem `off`
#       (szándékos kézi beállítás, nem írjuk felül).
set -euo pipefail

OFFLOAD_ACCEPTANCE_RECALL="${OFFLOAD_ACCEPTANCE_RECALL:-0.8}"
OFFLOAD_ACCEPTANCE_MAX_INVALID_PATHS="${OFFLOAD_ACCEPTANCE_MAX_INVALID_PATHS:-0}"
OFFLOAD_AUTO_PROMOTE="${OFFLOAD_AUTO_PROMOTE:-suggest}"
COMPARE_SCAN_QUALITY_DRY_RUN_OUTCOME="${COMPARE_SCAN_QUALITY_DRY_RUN_OUTCOME:-pass}"
COMPARE_SCAN_QUALITY_DRY_RUN_CURRENT_PROFILE="${COMPARE_SCAN_QUALITY_DRY_RUN_CURRENT_PROFILE:-off}"

GOLDEN=""
SCAN_OUTPUT=""
REPO_ROOT=""
DRY_RUN=0

die() { echo "HIBA: $*" >&2; exit 2; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --golden) GOLDEN="${2:-}"; shift 2 ;;
    --scan-output) SCAN_OUTPUT="${2:-}"; shift 2 ;;
    --repo-root) REPO_ROOT="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) awk 'NR>1 && /^set -euo pipefail$/{exit} NR>1{sub(/^# ?/,""); print}' "$0"; exit 0 ;;
    *) die "ismeretlen argumentum: $1 (lásd --help)" ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  die "a 'node' nincs a PATH-on — enélkül a JSON/markdown feldolgozás nem megy (lásd fejléc)."
fi

if [ -z "$REPO_ROOT" ]; then
  REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
fi

# --- Fallback-szabály (config.md): érvénytelen küszöb-értékek -> szállított alapérték ---
if ! printf '%s' "$OFFLOAD_ACCEPTANCE_RECALL" | grep -Eq '^(0(\.[0-9]+)?|1(\.0+)?)$'; then
  echo "FIGYELEM: OFFLOAD_ACCEPTANCE_RECALL='$OFFLOAD_ACCEPTANCE_RECALL' nem 0.0–1.0 közti szám — visszaesés a szállított alapértékre (0.8)." >&2
  OFFLOAD_ACCEPTANCE_RECALL="0.8"
fi
if ! printf '%s' "$OFFLOAD_ACCEPTANCE_MAX_INVALID_PATHS" | grep -Eq '^[0-9]+$'; then
  echo "FIGYELEM: OFFLOAD_ACCEPTANCE_MAX_INVALID_PATHS='$OFFLOAD_ACCEPTANCE_MAX_INVALID_PATHS' nem nemnegatív egész — visszaesés a szállított alapértékre (0)." >&2
  OFFLOAD_ACCEPTANCE_MAX_INVALID_PATHS="0"
fi
case "$OFFLOAD_AUTO_PROMOTE" in
  off|suggest|auto) ;;
  *)
    echo "FIGYELEM: OFFLOAD_AUTO_PROMOTE='$OFFLOAD_AUTO_PROMOTE' ismeretlen — visszaesés a szállított alapértékre (suggest)." >&2
    OFFLOAD_AUTO_PROMOTE="suggest"
    ;;
esac

TMPDIR_SELF="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_SELF"' EXIT

# --- --dry-run: beépített fixture-ök ---------------------------------------------------
if [ "$DRY_RUN" -eq 1 ]; then
  GOLDEN="$TMPDIR_SELF/golden.json"
  SCAN_OUTPUT="$TMPDIR_SELF/scan.md"
  cat > "$GOLDEN" <<'JSON'
{
  "brief": "DRY-RUN beépített golden set — a repo-gyökér ismert, biztosan létező fájljaira mutat.",
  "expectedFindings": [
    { "path": "CLAUDE.md", "symbol": "(dokumentum)", "reason": "dry-run fixture" },
    { "path": "README.md", "symbol": "(dokumentum)", "reason": "dry-run fixture" },
    { "path": "AGENTS.md", "symbol": "(dokumentum)", "reason": "dry-run fixture" },
    { "path": "VERSION", "symbol": "(fájl)", "reason": "dry-run fixture" }
  ]
}
JSON
  if [ "$COMPARE_SCAN_QUALITY_DRY_RUN_OUTCOME" = "fail" ]; then
    cat > "$SCAN_OUTPUT" <<'MD'
## Feladat
dry-run

## Ezt kerestem
dry-run

## Leletek
- `CLAUDE.md:1` — "dry-run" — megvan
- `README.md:1` — "dry-run" — megvan
- `frontend/src/app/nincs-ilyen-fajl.ts:5` — "hallucináció" — nem létező út

## Nem találtam
a maradékot
MD
  else
    cat > "$SCAN_OUTPUT" <<'MD'
## Feladat
dry-run

## Ezt kerestem
dry-run

## Leletek
- `CLAUDE.md:1` — "dry-run" — megvan
- `README.md:1` — "dry-run" — megvan
- `AGENTS.md:1` — "dry-run" — megvan
- `VERSION:1` — "dry-run" — megvan

## Nem találtam
semmit
MD
  fi
fi

[ -n "$GOLDEN" ] || die "--golden kötelező (vagy használj --dry-run-t)."
[ -n "$SCAN_OUTPUT" ] || die "--scan-output kötelező (vagy használj --dry-run-t)."
[ -f "$GOLDEN" ] || die "a golden-set fájl nem található: $GOLDEN"
[ -f "$SCAN_OUTPUT" ] || die "a scan-kimenet fájl nem található: $SCAN_OUTPUT"

# --- A tényleges kiértékelés node-ban -------------------------------------------------
NODE_HELPER="$TMPDIR_SELF/evaluate.js"
cat > "$NODE_HELPER" <<'NODE'
const fs = require("fs");
const path = require("path");

const [goldenPath, scanPath, repoRoot, recallThresholdRaw, maxInvalidRaw] = process.argv.slice(2);

function normPath(p) {
  return String(p).trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/:\d+$/, "");
}

let golden;
try {
  golden = JSON.parse(fs.readFileSync(goldenPath, "utf8"));
} catch (e) {
  console.error("HIBA: a golden-set nem érvényes JSON: " + e.message);
  process.exit(2);
}
if (!golden || !Array.isArray(golden.expectedFindings)) {
  console.error("HIBA: a golden-set-ből hiányzik az 'expectedFindings' tömb (lásd golden-sets/README.md).");
  process.exit(2);
}
const expected = Array.from(
  new Set(golden.expectedFindings.map((f) => normPath(f && f.path)).filter(Boolean))
);

const scanText = fs.readFileSync(scanPath, "utf8");
const lines = scanText.split(/\r?\n/);
const leletekIdx = lines.findIndex((l) => /^##\s+Leletek\s*$/.test(l));
if (leletekIdx === -1) {
  console.error("HIBA: a scan-kimenetből hiányzik a '## Leletek' szekció — nem a COCALC-270 nyers-lelet szerződés szerinti kimenet.");
  process.exit(2);
}
const reported = [];
let sawNincsLelet = false;
for (let i = leletekIdx + 1; i < lines.length; i++) {
  const l = lines[i];
  if (/^##\s+/.test(l)) break;
  if (/nincs lelet\.?/i.test(l)) { sawNincsLelet = true; continue; }
  const m = l.match(/^\s*[-*]\s+`([^`]+)`/);
  if (m) reported.push(normPath(m[1]));
}
const reportedSet = Array.from(new Set(reported));
if (reportedSet.length === 0 && !sawNincsLelet && !lines.slice(leletekIdx + 1).some((l) => /^##\s+/.test(l) ? false : l.trim())) {
  // üres Leletek szekció, "Nincs lelet." nélkül — megengedő: 0 lelet
}

const expectedSet = new Set(expected);
const found = reportedSet.filter((p) => expectedSet.has(p));
const recall = expected.length === 0 ? 1 : found.length / expected.length;
const precision = reportedSet.length === 0 ? 1 : found.length / reportedSet.length;

// Érvénytelen fájlút: abszolút/Windows-drive/gyökér-kezdetű út, VAGY a repo-gyökérhez
// képest nem létező fájl.
let invalidPaths = 0;
const invalidList = [];
for (const p of reportedSet) {
  const malformed = /^([a-zA-Z]:\/|\/)/.test(p);
  const exists = !malformed && fs.existsSync(path.join(repoRoot, p));
  if (malformed || !exists) {
    invalidPaths++;
    invalidList.push(p);
  }
}

const round4 = (n) => Math.round(n * 1e4) / 1e4;
const recallThreshold = Number(recallThresholdRaw);
const maxInvalid = parseInt(maxInvalidRaw, 10);
// FONTOS: az acceptance verdikt SZÁNDÉKOSAN csak a recallt és az érvénytelen-fájlút-számot
// nézi -- a precision NINCS kapuzva (lásd offload-measurements.md "Ismert korlát"). Egy
// olyan scanner-kimenet, ami sok LÉTEZŐ, de irreleváns fájlt is feljelent (alacsony
// precision), 0 érvénytelen út + küszöb feletti recall mellett `pass`-t kap. 0.5 alatti
// precision + `pass` esetén a szkript stderr-figyelmeztetést ad, de ez NEM befolyásolja a
// kilépőkódot.
const LOW_PRECISION_WARN = 0.5;
const acceptance = recall >= recallThreshold && invalidPaths <= maxInvalid ? "pass" : "fail";

const result = {
  recall: round4(recall),
  precision: round4(precision),
  invalidPaths,
  expectedCount: expected.length,
  reportedCount: reportedSet.length,
  foundCount: found.length,
  acceptance,
  thresholds: { recall: recallThreshold, maxInvalidPaths: maxInvalid },
};
process.stdout.write(JSON.stringify(result) + "\n");

const notMissed = expected.length === 0 ? "(a brief nulla leletet várt — a recall definíció szerint 1.0)" : "";
console.error(
  `Golden-set kiértékelés: recall=${result.recall} precision=${result.precision} ` +
    `érvénytelen-fájlút=${invalidPaths} (várt=${expected.length}, jelentett=${reportedSet.length}, ` +
    `talált=${found.length}) ${notMissed}`.trim()
);
if (invalidList.length) {
  console.error("Érvénytelen (nem létező / rossz formátumú) utak: " + invalidList.join(", "));
}
if (acceptance === "pass" && result.precision < LOW_PRECISION_WARN) {
  console.error(
    `FIGYELEM: alacsony precision (${result.precision}) ELFOGADOTT (pass) eredmény mellett — ` +
      `az acceptance verdikt NEM kapuzza a precisiont, így a sok létező-de-irreleváns ` +
      `túljelentés láthatatlan marad a döntésnek. Nézd át a scanner kimenetét.`
  );
}
NODE

set +e
RESULT_JSON="$(node "$NODE_HELPER" "$GOLDEN" "$SCAN_OUTPUT" "$REPO_ROOT" "$OFFLOAD_ACCEPTANCE_RECALL" "$OFFLOAD_ACCEPTANCE_MAX_INVALID_PATHS")"
NODE_EXIT=$?
set -e
if [ "$NODE_EXIT" -ne 0 ]; then
  exit "$NODE_EXIT"
fi
printf '%s\n' "$RESULT_JSON"

ACCEPTANCE="fail"
if printf '%s' "$RESULT_JSON" | grep -q '"acceptance":"pass"'; then
  ACCEPTANCE="pass"
fi

# --- OFFLOAD_AUTO_PROMOTE kezelése ---------------------------------------------------
PROMOTE_LADDER="off conservative balanced aggressive max-local"
next_in_ladder() {
  cur="$1"; prev=""
  for step in $PROMOTE_LADDER; do
    if [ "$prev" = "$cur" ]; then echo "$step"; return; fi
    prev="$step"
  done
  echo "$cur" # a max-local után nincs tovább
}

resolve_config_path() {
  if [ -n "${COMPARE_SCAN_QUALITY_CONFIG:-}" ]; then
    echo "$COMPARE_SCAN_QUALITY_CONFIG"; return
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    # A valós configot dry-run-ban SOSEM írjuk — eldobható másolat.
    cp "$REPO_ROOT/.claude/skills/dev-workflow/config.md" "$TMPDIR_SELF/config-dryrun.md" 2>/dev/null || : > "$TMPDIR_SELF/config-dryrun.md"
    echo "$TMPDIR_SELF/config-dryrun.md"; return
  fi
  echo "$REPO_ROOT/.claude/skills/dev-workflow/config.md"
}

current_profile_from_config() {
  cfg="$1"
  if [ "$DRY_RUN" -eq 1 ] && [ -z "${COMPARE_SCAN_QUALITY_CONFIG:-}" ]; then
    echo "$COMPARE_SCAN_QUALITY_DRY_RUN_CURRENT_PROFILE"; return
  fi
  line="$(grep -E '^\| `OFFLOAD_PROFILE` \|' "$cfg" 2>/dev/null | head -1 || true)"
  val="$(printf '%s' "$line" | sed -E 's/^\| `OFFLOAD_PROFILE` \| `([^`]+)`.*/\1/')"
  [ -n "$val" ] && echo "$val" || echo "off"
}

if [ "$ACCEPTANCE" = "pass" ]; then
  case "$OFFLOAD_AUTO_PROMOTE" in
    off)
      : # hallgat
      ;;
    suggest)
      CFG="$(resolve_config_path)"
      CUR="$(current_profile_from_config "$CFG")"
      NEXT="$(next_in_ladder "$CUR")"
      if [ "$NEXT" = "$CUR" ]; then
        echo "Javaslat: az OFFLOAD_PROFILE már a létra tetején van ($CUR) — nincs feljebb lépés." >&2
      else
        echo "Javaslat: OFFLOAD_PROFILE=$NEXT (jelenlegi: $CUR). Az érték NEM lett átírva (OFFLOAD_AUTO_PROMOTE=suggest)." >&2
      fi
      ;;
    auto)
      CFG="$(resolve_config_path)"
      CUR="$(current_profile_from_config "$CFG")"
      NEXT="$(next_in_ladder "$CUR")"
      if [ "$CUR" != "off" ]; then
        echo "FIGYELEM: az OFFLOAD_PROFILE sora már nem 'off' (jelenlegi: $CUR) — a szándékos kézi beállítást nem írom felül. Megállok." >&2
        exit 3
      fi
      if [ "$DRY_RUN" -eq 1 ] && [ -z "${COMPARE_SCAN_QUALITY_CONFIG:-}" ]; then
        echo "DRY-RUN: az auto-promóció ide írna: $CFG (OFFLOAD_PROFILE: off → $NEXT). Valós fájl nem módosul." >&2
      else
        [ -f "$CFG" ] || die "az auto-promócióhoz a config nem található: $CFG"
        # A preset-tábla OFFLOAD_PROFILE sorában mindhárom `off` cellát átírjuk.
        tmp_cfg="$TMPDIR_SELF/config-rewrite.md"
        awk -v next_val="$NEXT" '
          /^\| `OFFLOAD_PROFILE` \|/ { gsub(/`off`/, "`" next_val "`") }
          { print }
        ' "$CFG" > "$tmp_cfg"
        cp "$tmp_cfg" "$CFG"
        echo "OFFLOAD_PROFILE: off → $NEXT (auto-promóció, átírva itt: $CFG)." >&2
      fi
      ;;
  esac
  exit 0
else
  if [ "$OFFLOAD_AUTO_PROMOTE" = "suggest" ]; then
    echo "A golden-set kiértékelés nem érte el a küszöböt (recall >= $OFFLOAD_ACCEPTANCE_RECALL ÉS érvénytelen-fájlút <= $OFFLOAD_ACCEPTANCE_MAX_INVALID_PATHS) — nincs promóciós javaslat." >&2
  fi
  exit 1
fi
