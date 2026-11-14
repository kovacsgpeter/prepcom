#!/usr/bin/env sh
# COCALC-278 (LOCAL-2) onellenorzes: az OFFLOAD_PROFILE/OFFLOAD_PHASE_MATRIX/
# OFFLOAD_CLAMP_DIRECTION keret tenyleges viselkedese a resolve-executor-level.sh-ban,
# valamint a config.md/execute-SKILL.md/design-branch.md/retry-and-escalation.md
# dokumentacios huzalozas.
set -eu

CONFIG=.claude/skills/dev-workflow/config-reference.md  # ORD-497: a magyarázatok a referenciában
RESOLVE=.claude/skills/dev-workflow/scripts/resolve-executor-level.sh
EXECUTE=.claude/skills/dev-workflow-execute/SKILL.md
DESIGN_BRANCH=.claude/skills/dev-workflow-execute/design-branch.md
RETRY=.claude/skills/dev-workflow-execute/retry-and-escalation.md

# --- 1. config.md huzalozas ---
grep -Fq '`OFFLOAD_PROFILE`' "$CONFIG"
grep -Fq '`OFFLOAD_PHASE_MATRIX`' "$CONFIG"
grep -Fq '`OFFLOAD_CLAMP_DIRECTION`' "$CONFIG"
grep -Fq '### OFFLOAD_PROFILE és OFFLOAD_PHASE_MATRIX' "$CONFIG"
grep -Fq 'csendben gyengíthet' "$CONFIG"
grep -Fq 'CODE_SCAN_MODEL' "$CONFIG"
grep -Fq 'COCALC-270' "$CONFIG"

# --- 2. execute/SKILL.md es design-branch.md bekotes ---
grep -Fq -- '--offload-profile' "$EXECUTE"
grep -Fq -- '--offload-profile' "$DESIGN_BRANCH"

# --- 3. retry-and-escalation.md -- lokal bukas nem fogyaszt javitokort ---
grep -Fq 'Lokál bukás nem fogyaszt javítókört' "$RETRY"
grep -Fq 'MAX_LOCAL_FIX_RETRIES' "$RETRY"

# --- 4. resolve-executor-level.sh letezik ---
test -f "$RESOLVE"

# --- 5. 5 preset x 5 fazis x 2 irany -- a szallitott alapertek-matrix (S komplexitas,
#        Sub-task issue type -- nincs veto-hatas) ---
# A soronkenti ertekek a config.md "OFFLOAD_PROFILE es OFFLOAD_PHASE_MATRIX" matrixanak
# es a COMPLEXITY_EXECUTOR_MAP S-baseline-jenek (implementer/code-reviewer=haiku,
# qa-tester/figma-designer/repo-scanner=sonnet) egyuttes eredmenye. A szallitott
# alapertek-matrix minden sora egybefuggo (kontiguus) EXECUTOR_LADDER-tartomany, ezert az
# up/down irany a vegso ertekben nem ter el -- csak a kozbulso mechanizmus (lasd 7. blokk)
# mutatja meg a ket irany kozotti erdemi kulonbseget.
# Egy futtatással kapja meg a stdout-ot ES a stderr-t is (ne kelljen ugyanazt a
# hívást kétszer megismételni csak a másik adatfolyamért). $OUT / $WARN a hívó
# hatókörében marad, a temp fájlok minden hívás után törlődnek.
_capture_out=$(mktemp)
_capture_err=$(mktemp)
trap 'rm -f "$_capture_out" "$_capture_err"' EXIT
capture() {
  bash "$RESOLVE" "$@" >"$_capture_out" 2>"$_capture_err"
  OUT=$(cat "$_capture_out")
  WARN=$(cat "$_capture_err")
}

run() {
  capture --complexity S --phase "$2" --issue-type Sub-task --offload-profile "$1" --clamp-direction "$3"
  printf '%s' "$OUT"
}

assert_both_directions() {
  profile="$1"; phase="$2"; expected="$3"
  up=$(run "$profile" "$phase" up)
  down=$(run "$profile" "$phase" down)
  if [ "$up" != "$expected" ]; then
    echo "verify-offload-config: $profile/$phase up -- varva: $expected, kapva: $up" >&2
    exit 1
  fi
  if [ "$down" != "$expected" ]; then
    echo "verify-offload-config: $profile/$phase down -- varva: $expected, kapva: $down" >&2
    exit 1
  fi
}

assert_both_directions off          repo-scanner    sonnet
assert_both_directions off          code-reviewer   haiku
assert_both_directions off          qa-tester       sonnet
assert_both_directions off          implementer     haiku
assert_both_directions off          figma-designer  sonnet

assert_both_directions conservative repo-scanner    sonnet
assert_both_directions conservative code-reviewer   haiku
assert_both_directions conservative qa-tester       sonnet
assert_both_directions conservative implementer     haiku
assert_both_directions conservative figma-designer  sonnet

assert_both_directions balanced     repo-scanner    sonnet
assert_both_directions balanced     code-reviewer   haiku
assert_both_directions balanced     qa-tester       sonnet
assert_both_directions balanced     implementer     haiku
assert_both_directions balanced     figma-designer  sonnet

assert_both_directions aggressive   repo-scanner    haiku
assert_both_directions aggressive   code-reviewer   haiku
assert_both_directions aggressive   qa-tester       haiku
# implementer/aggressive: az implementer-nek COCALC-387 ota MAR VAN lokal-vegrehajtasi
# szerzodese (call-local-model.sh + implementer-response.v1 sema) -- a matrix-clamp
# koztes eredmenye ezert MOSTANTOL erdemben iranyfuggo a VEGSO eredmenyben is (nem csak a
# koztes stderr-uzenetben, mint a tobbi, meg szerzodes nelkuli fazisnal): "down" a
# legkozelebbi lefele levo engedett szintet adja ("local"), "up" a legkozelebbi felfele
# levot ("sonnet"). Lasd a 7. blokkot a reszletes ellenorzeshez.
up_impl_aggr=$(run aggressive implementer up)
down_impl_aggr=$(run aggressive implementer down)
if [ "$up_impl_aggr" != "sonnet" ]; then
  echo "verify-offload-config: aggressive/implementer up -- varva: sonnet, kapva: $up_impl_aggr" >&2
  exit 1
fi
if [ "$down_impl_aggr" != "local" ]; then
  echo "verify-offload-config: aggressive/implementer down -- varva: local, kapva: $down_impl_aggr" >&2
  exit 1
fi
assert_both_directions aggressive   figma-designer  sonnet

# max-local: repo-scanner-nek es (COCALC-387 ota) az implementer-nek van lokal-szerzodese
# -> mindkettonel "local" marad. A code-reviewer/qa-tester fazisnak nincs -> AC7
# "hasznalhatatlan preset" fallback: EXECUTOR_LADDER alapszint ("sonnet"), jelzessel
# (lasd 6. blokk).
assert_both_directions max-local    repo-scanner    local
assert_both_directions max-local    code-reviewer   sonnet
assert_both_directions max-local    qa-tester       sonnet
assert_both_directions max-local    implementer     local
assert_both_directions max-local    figma-designer  sonnet

# --- 6. Lokal-szerzodes hianya (AC6) + hasznalhatatlan preset -> EXECUTOR_LADDER
#        alapszint visszaeses (AC7), jelzessel -- CSAK code-reviewer/qa-tester-nel; az
#        implementer-nek COCALC-387 ota MAR VAN lokal-szerzodese, lasd lent ---
for phase in code-reviewer qa-tester; do
  RESOLVE_EXECUTOR_LEVEL_TEST_FORCE_LOCAL=1 capture --complexity S --phase "$phase" --issue-type Sub-task --offload-profile max-local
  [ "$OUT" = "sonnet" ]
  printf '%s' "$WARN" | grep -Fq 'nincs lokal-szerzodese'
  printf '%s' "$WARN" | grep -Fq 'visszaesés'
done

# repo-scanner-nek es (COCALC-387 ota) az implementer-nek MAR van lokal-szerzodese --
# FORCE_LOCAL + max-local eseten mindkettonel "local" marad (nincs megtagadas, nincs
# visszaeses).
RESOLVE_EXECUTOR_LEVEL_TEST_FORCE_LOCAL=1 capture --complexity S --phase repo-scanner --issue-type Sub-task --offload-profile max-local
[ "$OUT" = "local" ]
RESOLVE_EXECUTOR_LEVEL_TEST_FORCE_LOCAL=1 capture --complexity S --phase implementer --issue-type Sub-task --offload-profile max-local
[ "$OUT" = "local" ]

# --- 7. OFFLOAD_CLAMP_DIRECTION mechanizmusa -- a stderr-uzenet is a tenyleges,
#        iranyfuggo vegeredmenyt tukrozi (implementer/aggressive, lasd fent 5. blokk) ---
capture --complexity S --phase implementer --issue-type Sub-task --offload-profile aggressive --clamp-direction down
warn_down=$WARN
capture --complexity S --phase implementer --issue-type Sub-task --offload-profile aggressive --clamp-direction up
warn_up=$WARN
printf '%s' "$warn_down" | grep -Fq '"local"'
printf '%s' "$warn_up" | grep -Fq '"sonnet"'
if printf '%s' "$warn_up" | grep -Fq '"local"'; then
  echo "verify-offload-config: up irany nem probalt volna a local szintet erinteni ennel a fazisnal" >&2
  exit 1
fi

# --- 8. figma-designer es ux-designer (COCALC-899, 4.21.0) kizarasa (AC ⛔): FORCE_LOCAL
#        hook ellenere sosem local/haiku, egyik presetnel sem ---
for excluded in figma-designer ux-designer; do
  for profile in off conservative balanced aggressive max-local; do
    RESOLVE_EXECUTOR_LEVEL_TEST_FORCE_LOCAL=1 capture --complexity S --phase "$excluded" --issue-type Sub-task --offload-profile "$profile"
    case "$OUT" in
      local|haiku)
        echo "verify-offload-config: $excluded $profile mellett \"$OUT\"-ra oldodott, pedig kizart a local/haiku" >&2
        exit 1
        ;;
    esac
  done
done

# --- 9. Ismeretlen/elgepelt OFFLOAD_PROFILE -> "off" fallback, jelzessel (AC13) ---
capture --complexity M --phase implementer --issue-type Story --offload-profile typo-preset
[ "$OUT" = "sonnet" ]
printf '%s' "$WARN" | grep -Fq 'fallback: off'

# Hianyzo --offload-profile (nincs flag) -- csendben "off"-kent viselkedik, NEM jelez.
capture --complexity M --phase implementer --issue-type Story
warn_missing=$WARN
if printf '%s' "$warn_missing" | grep -Fq 'offload-profile'; then
  echo "verify-offload-config: hianyzo --offload-profile eseten nem szabadna offload-profile figyelmeztetest adnia (csendes off-fallback)" >&2
  exit 1
fi

# --- 10. CODE_SCAN_MODEL (COCALC-270) fazis-specifikus felulbiralas -- csak a keret
#         engedte halmazon belul: "off" + repo-scanner mellett a keret "haiku sonnet
#         opus"-ot enged -- ha a CODE_SCAN_MODEL "local"-t akarna adni, az a kereten
#         KIVUL esne, tehat clampelodne (a szkript maga nem olvassa a CODE_SCAN_MODEL
#         erteket -- ezt a hivo SKILL.md/repo-scanner.md dolga lesz majd, ha bekotik --
#         itt csak azt ellenorizzuk, hogy a keret ezt strukturalisan biztositja: "off"
#         mellett a repo-scanner engedett halmaza nem tartalmazza a "local"-t).
capture --complexity M --phase repo-scanner --issue-type Sub-task --offload-profile off
[ "$OUT" = "sonnet" ]
RESOLVE_EXECUTOR_LEVEL_TEST_FORCE_LOCAL=1 capture --complexity M --phase repo-scanner --issue-type Sub-task --offload-profile off
[ "$OUT" != "local" ]
printf '%s' "$WARN" | grep -Fq 'offload-clamp'

# --- 11. OFFLOAD_PHASE_MATRIX es COMPLEXITY_EXECUTOR_MAP ugyanazt a fazis-halmazt
#         ismeri (AC12) -- mindket "fazis-halmaz" definicio magaban a szkriptben el (a
#         COMPLEXITY_EXECUTOR_MAP eseten az elso, a "--phase" ismeretlen ertekre hibaval
#         leallo case-ag, az OFFLOAD_PHASE_MATRIX eseten az allowed_set() fuggveny
#         case-agai). Az alabbi 5 fazis midegyikere kell, hogy mindket rendszer ervenyes,
#         nem-ures eredmenyt adjon -- ha a ket rendszer fazis-halmaza szetcsuszna, az
#         allowed_set() ures stringet adna vissza egy olyan fazisra, amit a --phase
#         validacio meg elfogad, es a kesobbi "$level" nem lenne benne egyik halmazban
#         sem (a set_contains mindig false-t adna, a nearest_in_set vegtelen ures
#         eredmenyt), ami a hivo oldalon ures stdout-ban latszana.
for phase in repo-scanner code-reviewer qa-tester implementer figma-designer ux-designer; do
  for profile in off conservative balanced aggressive max-local; do
    out=$(bash "$RESOLVE" --complexity M --phase "$phase" --issue-type Sub-task --offload-profile "$profile" 2>/dev/null)
    if [ -z "$out" ]; then
      echo "verify-offload-config: $phase / $profile -- ures eredmeny, a fazis-halmazok szetcsusztak (AC12 serules)" >&2
      exit 1
    fi
  done
done

# --- 12. LOCAL-5: --local-phases (LOCAL_PHASES) -- melyik fazisoknal oldodik fel a hard-clamp ---
# 12a. lista nelkul a qa-tester max-local mellett is sonnet (hasznalhatatlan preset -> alapszint);
#      listaval local. Vesszo es szokoz is elvalaszto.
capture --complexity S --phase qa-tester --issue-type Sub-task --offload-profile max-local
[ "$OUT" = "sonnet" ]
capture --complexity S --phase qa-tester --issue-type Sub-task --offload-profile max-local --local-phases implementer,repo-scanner,qa-tester
[ "$OUT" = "local" ]
capture --complexity S --phase qa-tester --issue-type Sub-task --offload-profile max-local --local-phases "implementer repo-scanner qa-tester"
[ "$OUT" = "local" ]
if printf '%s' "$WARN" | grep -Eq 'ismeretlen|nincs lokal-szerzodese'; then
  echo "verify-offload-config: ervenyes --local-phases listanal nem vart figyelmeztetes: $WARN" >&2
  exit 1
fi
# 12b. lista nelkul az implementer es a repo-scanner a LOCAL-5 elotti modon local marad (max-local)
capture --complexity S --phase implementer --issue-type Sub-task --offload-profile max-local
[ "$OUT" = "local" ]
capture --complexity S --phase repo-scanner --issue-type Sub-task --offload-profile max-local
[ "$OUT" = "local" ]
# 12c. ami nincs a listan, az felfele clampelodik, jelzessel
capture --complexity S --phase repo-scanner --issue-type Sub-task --offload-profile max-local --local-phases implementer
[ "$OUT" = "sonnet" ]
printf '%s' "$WARN" | grep -Fq 'nincs lokal-szerzodese'
capture --complexity S --phase implementer --issue-type Sub-task --offload-profile max-local --local-phases repo-scanner,qa-tester
[ "$OUT" = "sonnet" ]
# 12d. a code-reviewer-nek tovabbra sincs lokal-szerzodese: listan sem lehet local
capture --complexity S --phase code-reviewer --issue-type Sub-task --offload-profile max-local --local-phases code-reviewer,qa-tester
[ "$OUT" = "sonnet" ]
printf '%s' "$WARN" | grep -Fq 'code-reviewer-nek nincs lokal-szerzodese'
# 12e. ismeretlen fazisnev: figyelmen kivul marad; ha egy ervenyes sem marad -> alapertek, jelzessel
capture --complexity S --phase qa-tester --issue-type Sub-task --offload-profile max-local --local-phases foo
[ "$OUT" = "sonnet" ]
printf '%s' "$WARN" | grep -Fq 'ismeretlen fazis'
printf '%s' "$WARN" | grep -Fq 'fallback: implementer repo-scanner'
# 12f. a Story/Bug veto a listaval engedett qa-testerre is fennall (sosem local)
capture --complexity S --phase qa-tester --issue-type Story --offload-profile max-local --local-phases qa-tester
[ "$OUT" = "haiku" ]
printf '%s' "$WARN" | grep -Fq 'veto'
# 12g. off profil mellett a lista nem nyit ki semmit (a keret az elsodleges)
for phase in implementer repo-scanner qa-tester; do
  capture --complexity S --phase "$phase" --issue-type Sub-task --offload-profile off --local-phases implementer,repo-scanner,qa-tester
  [ "$OUT" != "local" ] || { echo "verify-offload-config: off profil mellett $phase local-ra oldodott" >&2; exit 1; }
done

echo "verify-offload-config: OK"
