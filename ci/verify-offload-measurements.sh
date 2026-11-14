#!/usr/bin/env sh
# COCALC-280 (LOCAL-3) onellenorzes: a golden-set-alapu offload-mero keret tenyleges
# viselkedese. NEM uj teszt-keretrendszer -- a meglevo ci/verify-offload-config.sh /
# ci/test-env-smoke.sh mintajara, sima sh + assert-szeru grep/egyenloseg-ellenorzesek.
#
# Harom dolgot ellenoriz (AC12):
#   1. A harom uj kulcs (OFFLOAD_ACCEPTANCE_RECALL, OFFLOAD_ACCEPTANCE_MAX_INVALID_PATHS,
#      OFFLOAD_AUTO_PROMOTE) megléte a config.md-ben (preset-tabla + magyarazo szekcio),
#      es az offload-measurements.md dokumentacios huzalozasa.
#   2. A harom OFFLOAD_AUTO_PROMOTE ag (off / suggest / auto) fixture-okon.
#   3. A compare-scan-quality.sh ismert bemenet -> elore kiszamolt recall/precision par.
set -eu

CONFIG=.claude/skills/dev-workflow/config.md
SCRIPT=.claude/skills/dev-workflow/scripts/compare-scan-quality.sh
AGENTS_SCRIPT=.agents/skills/dev-workflow/scripts/compare-scan-quality.sh
MEASUREMENTS=.claude/skills/dev-workflow/offload-measurements.md
GOLDEN=.claude/skills/dev-workflow/golden-sets/fixtures/example-golden.json
SCAN_FAIL=.claude/skills/dev-workflow/golden-sets/fixtures/example-scan-output.md
SCAN_PASS=.claude/skills/dev-workflow/golden-sets/fixtures/example-scan-output-pass.md

for f in "$CONFIG" "$SCRIPT" "$AGENTS_SCRIPT" "$MEASUREMENTS" "$GOLDEN" "$SCAN_FAIL" "$SCAN_PASS"; do
  [ -f "$f" ] || { echo "verify-offload-measurements: hianyzo fajl: $f" >&2; exit 1; }
done

# --- 1. config.md + offload-measurements.md huzalozas ---------------------------------
# has_fixed <fajl> <fix-string> <emberi leiras>   /  has_re <fajl> <regex> <emberi leiras>
has_fixed() {
  grep -Fq "$2" "$1" || { echo "verify-offload-measurements: $1 -- hianyzik: $3" >&2; exit 1; }
}
has_re() {
  grep -Eq "$2" "$1" || { echo "verify-offload-measurements: $1 -- hianyzik: $3" >&2; exit 1; }
}

has_fixed "$CONFIG" '`OFFLOAD_ACCEPTANCE_RECALL`' "OFFLOAD_ACCEPTANCE_RECALL kulcs"
has_fixed "$CONFIG" '`OFFLOAD_ACCEPTANCE_MAX_INVALID_PATHS`' "OFFLOAD_ACCEPTANCE_MAX_INVALID_PATHS kulcs"
has_fixed "$CONFIG" '`OFFLOAD_AUTO_PROMOTE`' "OFFLOAD_AUTO_PROMOTE kulcs"
has_fixed "$CONFIG" '### OFFLOAD_ACCEPTANCE_* és OFFLOAD_AUTO_PROMOTE' "a 3 kulcs magyarazo szekcioja"
# A szallitott alapertekek a preset-tablaban (mindharom profil-oszlop azonos).
has_re "$CONFIG" '\| `OFFLOAD_ACCEPTANCE_RECALL` \| `0\.8` \| `0\.8` \| `0\.8` \|' "OFFLOAD_ACCEPTANCE_RECALL preset-tabla sor (0.8 x3)"
has_re "$CONFIG" '\| `OFFLOAD_ACCEPTANCE_MAX_INVALID_PATHS` \| `0` \| `0` \| `0` \|' "OFFLOAD_ACCEPTANCE_MAX_INVALID_PATHS preset-tabla sor (0 x3)"
has_re "$CONFIG" '\| `OFFLOAD_AUTO_PROMOTE` \| `suggest` \| `suggest` \| `suggest` \|' "OFFLOAD_AUTO_PROMOTE preset-tabla sor (suggest x3)"

has_fixed "$MEASUREMENTS" 'Ismert korlát' "'Ismert korlát' szekcio"
has_fixed "$MEASUREMENTS" 'nem verziózott baseline-store' "'nem verziozott baseline-store' megfogalmazas"
has_fixed "$MEASUREMENTS" 'precision nincs kapuzva' "a precision-nem-kapuzott korlat dokumentacioja"
for phase in repo-scanner code-reviewer qa-tester implementer figma-designer; do
  has_fixed "$MEASUREMENTS" "$phase" "a(z) $phase fazis emlitese"
done

# --- kozos capture segito -----------------------------------------------------------
_out=$(mktemp)
_err=$(mktemp)
_cfg=$(mktemp)
trap 'rm -f "$_out" "$_err" "$_cfg"' EXIT

# run KEY=VAL ... <parancs> ...
# A kornyezeti valtozokat `env` ARGUMENTUMKENT kapja (nem shell-elotagkent), hogy ne
# szivarogjanak be a CI-szkript sajat kornyezetebe a kovetkezo hivasokra (POSIX sh-ban
# a `VAR=val fuggveny` elotag a fuggvenyhivas utan is megmarad).
run() {
  set +e
  env "$@" >"$_out" 2>"$_err"
  RC=$?
  set -e
  OUT=$(cat "$_out")
  ERR=$(cat "$_err")
}

# --- 3. Ismert bemenet -> elore kiszamolt recall/precision ---------------------------
# GOLDEN varja: CLAUDE.md, README.md, AGENTS.md  (3 db)
# SCAN_FAIL jelenti: CLAUDE.md, README.md, .claude/.../history.md,
#   frontend/.../nincs-ilyen-fajl.ts (4 db)
#   -> talalt = {CLAUDE.md, README.md} = 2  -> recall = 2/3 = 0.6667
#   -> precision = 2/4 = 0.5
#   -> ervenytelen ut = {frontend/.../nincs-ilyen-fajl.ts} = 1  -> acceptance = fail (exit 1)
run OFFLOAD_AUTO_PROMOTE=off bash "$SCRIPT" --golden "$GOLDEN" --scan-output "$SCAN_FAIL"
[ "$RC" -eq 1 ] || { echo "verify-offload-measurements: SCAN_FAIL -- varva exit 1, kapva $RC" >&2; exit 1; }
printf '%s' "$OUT" | grep -Fq '"recall":0.6667' || { echo "verify-offload-measurements: SCAN_FAIL recall != 0.6667 ($OUT)" >&2; exit 1; }
printf '%s' "$OUT" | grep -Fq '"precision":0.5' || { echo "verify-offload-measurements: SCAN_FAIL precision != 0.5 ($OUT)" >&2; exit 1; }
printf '%s' "$OUT" | grep -Fq '"invalidPaths":1' || { echo "verify-offload-measurements: SCAN_FAIL invalidPaths != 1 ($OUT)" >&2; exit 1; }
printf '%s' "$OUT" | grep -Fq '"acceptance":"fail"' || { echo "verify-offload-measurements: SCAN_FAIL acceptance != fail ($OUT)" >&2; exit 1; }

# SCAN_PASS: mind a 3 vart lelet megvan, 0 ervenytelen ut -> recall 1, precision 1, pass (exit 0)
run OFFLOAD_AUTO_PROMOTE=off bash "$SCRIPT" --golden "$GOLDEN" --scan-output "$SCAN_PASS"
[ "$RC" -eq 0 ] || { echo "verify-offload-measurements: SCAN_PASS -- varva exit 0, kapva $RC" >&2; exit 1; }
printf '%s' "$OUT" | grep -Fq '"recall":1' || { echo "verify-offload-measurements: SCAN_PASS recall != 1 ($OUT)" >&2; exit 1; }
printf '%s' "$OUT" | grep -Fq '"precision":1' || { echo "verify-offload-measurements: SCAN_PASS precision != 1 ($OUT)" >&2; exit 1; }
printf '%s' "$OUT" | grep -Fq '"acceptance":"pass"' || { echo "verify-offload-measurements: SCAN_PASS acceptance != pass ($OUT)" >&2; exit 1; }

# --dry-run fail-ag: elore kiszamolt recall 0.5
run COMPARE_SCAN_QUALITY_DRY_RUN_OUTCOME=fail OFFLOAD_AUTO_PROMOTE=off bash "$SCRIPT" --dry-run
[ "$RC" -eq 1 ] || { echo "verify-offload-measurements: --dry-run fail -- varva exit 1, kapva $RC" >&2; exit 1; }
printf '%s' "$OUT" | grep -Fq '"recall":0.5' || { echo "verify-offload-measurements: --dry-run fail recall != 0.5 ($OUT)" >&2; exit 1; }

# --- 2. A harom OFFLOAD_AUTO_PROMOTE ag ---------------------------------------------
# (a) off -- hallgat: nincs "Javaslat:" a stderr-en, pass eseten exit 0
run OFFLOAD_AUTO_PROMOTE=off bash "$SCRIPT" --golden "$GOLDEN" --scan-output "$SCAN_PASS"
[ "$RC" -eq 0 ] || { echo "verify-offload-measurements: AUTO_PROMOTE=off -- varva exit 0, kapva $RC" >&2; exit 1; }
if printf '%s' "$ERR" | grep -Fq 'Javaslat:'; then
  echo "verify-offload-measurements: AUTO_PROMOTE=off nem irhatna 'Javaslat:'-ot" >&2
  exit 1
fi

# (b) suggest -- kiirja a javasolt OFFLOAD_PROFILE erteket, de fajlt NEM ir
cp "$CONFIG" "$_cfg"
run COMPARE_SCAN_QUALITY_CONFIG="$_cfg" OFFLOAD_AUTO_PROMOTE=suggest bash "$SCRIPT" --golden "$GOLDEN" --scan-output "$SCAN_PASS"
[ "$RC" -eq 0 ] || { echo "verify-offload-measurements: AUTO_PROMOTE=suggest -- varva exit 0, kapva $RC" >&2; exit 1; }
printf '%s' "$ERR" | grep -Fq 'Javaslat: OFFLOAD_PROFILE=conservative' || {
  echo "verify-offload-measurements: AUTO_PROMOTE=suggest nem javasolt 'conservative'-ot ($ERR)" >&2
  exit 1
}
if ! cmp -s "$CONFIG" "$_cfg"; then
  echo "verify-offload-measurements: AUTO_PROMOTE=suggest nem irhatott volna a config-ba" >&2
  exit 1
fi

# (c) auto, a sor meg 'off' -- atirja a config OFFLOAD_PROFILE sorat
cp "$CONFIG" "$_cfg"
run COMPARE_SCAN_QUALITY_CONFIG="$_cfg" OFFLOAD_AUTO_PROMOTE=auto bash "$SCRIPT" --golden "$GOLDEN" --scan-output "$SCAN_PASS"
[ "$RC" -eq 0 ] || { echo "verify-offload-measurements: AUTO_PROMOTE=auto (off) -- varva exit 0, kapva $RC" >&2; exit 1; }
grep -Eq '\| `OFFLOAD_PROFILE` \| `conservative` \| `conservative` \| `conservative` \|' "$_cfg" || {
  echo "verify-offload-measurements: AUTO_PROMOTE=auto nem irta at az OFFLOAD_PROFILE sort 'conservative'-ra" >&2
  exit 1
}

# (c2) auto, de a sor mar NEM 'off' (a fenti atiras utan) -- ne irja felul, alljon meg (exit 3)
_cfg_before=$(cat "$_cfg")
run COMPARE_SCAN_QUALITY_CONFIG="$_cfg" OFFLOAD_AUTO_PROMOTE=auto bash "$SCRIPT" --golden "$GOLDEN" --scan-output "$SCAN_PASS"
[ "$RC" -eq 3 ] || { echo "verify-offload-measurements: AUTO_PROMOTE=auto (nem off) -- varva exit 3, kapva $RC" >&2; exit 1; }
printf '%s' "$ERR" | grep -Fq 'nem írom felül' || {
  echo "verify-offload-measurements: AUTO_PROMOTE=auto (nem off) nem jelezte a feluliras-megtagadast ($ERR)" >&2
  exit 1
}
[ "$_cfg_before" = "$(cat "$_cfg")" ] || {
  echo "verify-offload-measurements: AUTO_PROMOTE=auto (nem off) megis modositotta a configot" >&2
  exit 1
}

# --- 4. A .agents tukor viselkedesben azonos (dry-run pass) -------------------------
run OFFLOAD_AUTO_PROMOTE=off bash "$AGENTS_SCRIPT" --dry-run
[ "$RC" -eq 0 ] || { echo "verify-offload-measurements: .agents tukor --dry-run -- varva exit 0, kapva $RC" >&2; exit 1; }
printf '%s' "$OUT" | grep -Fq '"acceptance":"pass"' || {
  echo "verify-offload-measurements: .agents tukor --dry-run kimenete elter ($OUT)" >&2
  exit 1
}

echo "verify-offload-measurements: OK"
