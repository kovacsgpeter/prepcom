#!/usr/bin/env sh
# COCALC-273 (MEAS-2) -- execute-oldali olvasas: a ticket infobox "Komplexitas" mezojebol
# kiolvasott szint-betu (S/M/L) + a COMPLEXITY_EXECUTOR_MAP alapjan eldonti, egy adott
# fazis (implementer/qa-tester/code-reviewer/figma-designer/repo-scanner) melyik
# EXECUTOR_LADDER szinten fusson. A dev-workflow-execute/SKILL.md (A5a) es a
# design-branch.md (B4/B6) hivja meg, egyszer, minden execute-futas elejen, minden
# erintett fazisra.
#
# COCALC-278 (LOCAL-2) -- bovitve az OFFLOAD_PROFILE/OFFLOAD_PHASE_MATRIX kerettel: a
# COMPLEXITY_EXECUTOR_MAP altal adott szint csak egy JAVASLAT, amit a mátrix -- a
# --offload-profile ertekehez tartozo, fazisonkent engedett szint-halmaz -- clampel, ha
# kivul esne a kereten. A "repo-scanner" fazis is itt jelenik meg eloszor (korabban a
# COMPLEXITY_EXECUTOR_MAP nem ismerte) -- kizarolag azert, hogy az
# OFFLOAD_PHASE_MATRIX es a COMPLEXITY_EXECUTOR_MAP UGYANAZT a fazis-halmazt ismerje
# (config.md AC12); a repo-scanner tenyleges modellvalasztasat ma tovabbra is a
# CODE_SCAN_MODEL (COCALC-270) adja, fazis-specifikus felulbiralaskent, a keret altal
# engedett halmazon belul -- ez a szkript nem hivja at a dev-workflow-intake/SKILL.md
# CODE_SCAN_MODEL-olvasasat, csak a keretet szolgaltatja neki, ha majd bekotik.
#
# COCALC-385 -- felvett "architect" fazis (csak-olvaso tervezo, lasd agents/architect.md
# es config.md ARCHITECT_INTAKE): az OFFLOAD_PHASE_MATRIX-ban a "figma-designer" mintajat
# koveti -- STRUKTURALISAN kizart a "local"-bol (es a "haiku"-bol is), minden
# --offload-profile ertek mellett mindig "sonnet opus" az engedett halmaz. Ez NEM a lenti
# "Lokal-szerzodes hianya" utolagos hard-clamp utjan megy (mint a code-reviewer/qa-tester/
# implementer eseteben), hanem mar magaban az allowed_set()-ben -- a level ezert sosem
# tud "local"-ra vagy "haiku"-ra allni ennel a fazisnal, a matrix-clamp lepes elott sem.
#
# COCALC-899 (4.21.0) -- felvett "ux-designer" fazis (csak-olvaso UX-tervezo/kritikus, lasd
# agents/ux-designer.md es config.md "UX-designer (UX_*)"): ugyanaz a minta, mint az
# "architect" -- vizualis itelet, bongeszo- es Figma-MCP, ezert strukturalisan kizart a
# "local"-bol es a "haiku"-bol, minden --offload-profile mellett "sonnet opus".
#
# A COMPLEXITY_EXECUTOR_MAP es az OFFLOAD_PHASE_MATRIX itt duplikalva van -- a config.md
# "Komplexitas -> vegrehajto-szint routing" szekcioja (OFFLOAD_PROFILE alszekcioval
# egyutt) a kanonikus doksi, ha ott modosul barmelyik alapertek-tabla, itt is at kell
# vezetni (ugyanaz az ok, mint az estimate-complexity.sh fejleceben).
#
# Hasznalat:
#   resolve-executor-level.sh --complexity S|M|L|<ures/ervenytelen> \
#     --phase implementer|qa-tester|code-reviewer|figma-designer|repo-scanner|architect|ux-designer \
#     --issue-type <Jira issue type> \
#     [--offload-profile off|conservative|balanced|aggressive|max-local] \
#     [--clamp-direction up|down] \
#     [--local-phases <vesszos vagy szokozos lista: implementer,repo-scanner,qa-tester>]
#
# --local-phases (LOCAL-5, config.md LOCAL_PHASES): azok a fazisok, amelyeknel a "local" szint
# egyaltalan engedett (a matrix-clamp UTAN, a hard-clamp itt oldodik fel). Csak az
# implementer, repo-scanner es qa-tester kerulhet a listara -- ezeknek van lokal-vegrehajtasi
# szerzodesuk (call-local-model.sh + sema + prompt-sablon + a hivo SKILL.md lepese); a
# code-reviewer-nek nincs, ha listara kerul, figyelmen kivul marad (stderr jelzessel).
# Elhagyasa = "implementer,repo-scanner" (a LOCAL-5 elotti viselkedes: ennel a ket fazisnal a
# local szint a matrix szerint engedett volt, a qa-tester/code-reviewer mindig clampelt).
# Ismeretlen nev -> figyelmen kivul marad, stderr jelzessel; ha egyetlen ervenyes nev sem
# marad, az alapertek ("implementer,repo-scanner") ervenyes, jelzessel.
#
# --offload-profile elhagyasa ugyanazt eredmenyezi, mint az explicit "off" -- ez a
# szallitott alapertek (config.md OFFLOAD_PROFILE), es onmagaban NEM valtoztat a
# COCALC-278 elotti viselkedesen (a legtobb fazisnal az "off" mátrix-sor amugy sem
# szukiti a COMPLEXITY_EXECUTOR_MAP altal amugy is adott haiku/sonnet/opus ertekeket).
# --clamp-direction elhagyasa "up"-ot jelent (config.md OFFLOAD_CLAMP_DIRECTION
# alapertek).
#
# Kimenet (stdout): a vegleges EXECUTOR_LADDER szint neve (local|haiku|sonnet|opus).
#
# Fallback (COCALC-273 AC7): hianyzo/ervenytelen --complexity -> "sonnet" minden fazisra,
# es figyelmezteto uzenet stderr-re -- ez NEM hibaallapot a hivo szamara (kilepokod 0
# marad), a fallback maga a helyes, biztonsagos valasz.
#
# Fallback (COCALC-278 AC13): hianyzo/ismeretlen --offload-profile -> "off" (a COCALC-216
# fallback-konvencio mintajara) -- ha a mezo teljesen hianyzott, ez csendben tortenik (ez
# maga a szallitott alapertek), ha viszont expliciten ervenytelen erteket kapott a
# szkript, figyelmezteto uzenet is jar stderr-re.
#
# Mátrix-clamp (COCALC-278 AC5): ha a COMPLEXITY_EXECUTOR_MAP altal adott szint kivul
# esik az OFFLOAD_PHASE_MATRIX altal az adott (offload-profile, fazis) parhoz engedett
# szint-halmazon, a szkript a --clamp-direction szerint a legkozelebbi engedett szintre
# kerekit (fel: dragabb/biztonsagosabb, le: olcsobb -- csendben gyengithet, lasd
# config.md figyelmeztetese), es jelez stderr-re.
#
# Lokal-szerzodes hianya (COCALC-278 AC6, szukitve COCALC-387-ben): a "code-reviewer" es
# a "qa-tester" fazisnak (meg) nincs tenyleges lokal-vegrehajtasi szerzodese (a
# call-local-model.sh-t meg senki nem koti be ezekhez) -- FUGGETLENUL attol, hogy a
# mátrix az adott offload-profile mellett megengedne a "local" szintet, a szkript ezt a
# ket fazist mindig felfele clampeli, ha a mátrix "local"-t adna, a
# --clamp-direction-tol fuggetlenul (ez hard constraint, nem iranyfuggo). A
# "repo-scanner" fazisnak MAR VAN lokal-szerzodese (COCALC-270), az "implementer"
# fazisnak MOSTANTOL (COCALC-387) IS VAN -- a call-local-model.sh-n megy, verziozott
# JSON-semaval (implementer-response.v1.schema.json), ha a lenti feloldas utan a szint
# "local" marad. A "figma-designer" es az "architect" pedig strukturalisan ki van zarva a
# mátrixban (soha nincs local/haiku az engedett halmazukban).
#
# Hasznalhatatlan preset (COCALC-278 AC7): ha egy preset az adott fazisra engedett
# egyetlen szintje pont a fentiek szerint tiltott "local" (pl. max-local + code-reviewer/
# qa-tester), a szkript az EXECUTOR_LADDER alapszintjere (sonnet) esik vissza, jelzessel.
#
# Veto-modell (COCALC-273 AC8): a tracker issue type csak KIZARNI tud -- egy Story vagy
# Bug sosem eshet az EXECUTOR_LADDER legolcsobb (elso) szintjere, meg akkor sem, ha a
# terkep (a mátrix-clamp utan is) azt adna. Ha ez tortenne, a szkript eggyel feljebb
# lepteti. Ez a lepes a mátrix-clamp UTAN fut.
#
# Teszt-only hook: a RESOLVE_EXECUTOR_LEVEL_TEST_FORCE_LOCAL=1 env-valtozo a
# COMPLEXITY_EXECUTOR_MAP-bol szarmazo szintet "local"-ra kenyszeriti, MIELOTT a
# mátrix-clamp es a veto-logika lefutna -- ezt a ci/verify-complexity-config.sh es a
# ci/verify-offload-config.sh hasznalja, hogy az egyes agakat determinisztikusan
# tesztelhessek.
set -eu

complexity=""
phase=""
issue_type=""
offload_profile=""
clamp_direction=""
local_phases_arg=""

while [ $# -gt 0 ]; do
  case "$1" in
    --complexity) complexity="${2:-}"; shift 2 ;;
    --phase) phase="${2:-}"; shift 2 ;;
    --issue-type) issue_type="${2:-}"; shift 2 ;;
    --offload-profile) offload_profile="${2:-}"; shift 2 ;;
    --clamp-direction) clamp_direction="${2:-}"; shift 2 ;;
    --local-phases) local_phases_arg="${2:-}"; shift 2 ;;
    *) echo "resolve-executor-level: ismeretlen argumentum: $1" >&2; exit 2 ;;
  esac
done

case "$phase" in
  implementer|qa-tester|code-reviewer|figma-designer|repo-scanner|architect|ux-designer) : ;;
  *) echo "resolve-executor-level: ismeretlen --phase: \"$phase\"" >&2; exit 2 ;;
esac

# --- OFFLOAD_PROFILE fallback (COCALC-278 AC13) ---
case "$offload_profile" in
  "")
    offload_profile="off"
    ;;
  off|conservative|balanced|aggressive|max-local)
    : ;;
  *)
    echo "resolve-executor-level: ismeretlen vagy ervenytelen --offload-profile (\"$offload_profile\") -- fallback: off" >&2
    offload_profile="off"
    ;;
esac

# --- OFFLOAD_CLAMP_DIRECTION fallback (config.md alapertek: up) ---
case "$clamp_direction" in
  "") clamp_direction="up" ;;
  up|down) : ;;
  *)
    echo "resolve-executor-level: ismeretlen vagy ervenytelen --clamp-direction (\"$clamp_direction\") -- fallback: up" >&2
    clamp_direction="up"
    ;;
esac

# --- LOCAL_PHASES (LOCAL-5): melyik fazisoknal engedett a "local" szint ---
# Elhagyott/ures argumentum = alapertek, csendben. Vesszo es szokoz is elvalaszto.
local_phases_default="implementer repo-scanner"
local_phases=""
if [ -z "$local_phases_arg" ]; then
  local_phases="$local_phases_default"
else
  for _name in $(printf '%s' "$local_phases_arg" | tr ',' ' '); do
    case "$_name" in
      implementer|repo-scanner|qa-tester)
        set_contains_tmp=" $local_phases "
        case "$set_contains_tmp" in
          *" $_name "*) : ;;
          *) local_phases="$local_phases $_name" ;;
        esac
        ;;
      code-reviewer)
        echo "resolve-executor-level: a(z) code-reviewer-nek nincs lokal-szerzodese -- a --local-phases listan figyelmen kivul marad" >&2
        ;;
      *)
        echo "resolve-executor-level: ismeretlen fazis a --local-phases listan (\"$_name\") -- figyelmen kivul marad" >&2
        ;;
    esac
  done
  local_phases="$(printf '%s' "$local_phases" | sed 's/^ *//; s/ *$//')"
  if [ -z "$local_phases" ]; then
    echo "resolve-executor-level: a --local-phases egyetlen ervenyes fazist sem tartalmaz (\"$local_phases_arg\") -- fallback: $local_phases_default" >&2
    local_phases="$local_phases_default"
  fi
fi

# --- COMPLEXITY_EXECUTOR_MAP (config.md tukorkepe, szallitott alapertek) ---
# S: implementer + code-reviewer eggyel olcsobban (sonnet -> haiku), qa-tester es
#    figma-designer valtozatlan. M/L: minden fazis a mai szinten (sonnet).
# repo-scanner: nem komplexitas-vezerelt (lasd fejlec) -- minden komplexitas-erteknel
#    "sonnet", ugyanugy, mint M/L a tobbi fazisnal.
level=""
case "$complexity" in
  S)
    case "$phase" in
      implementer) level="haiku" ;;
      code-reviewer) level="haiku" ;;
      qa-tester) level="sonnet" ;;
      figma-designer) level="sonnet" ;;
      repo-scanner) level="sonnet" ;;
      architect) level="sonnet" ;;
      ux-designer) level="sonnet" ;;
    esac
    ;;
  M|L)
    level="sonnet"
    ;;
  *)
    echo "resolve-executor-level: ervenytelen vagy hianyzo komplexitas (\"$complexity\") -- fallback: $phase sonnet szinten fut" >&2
    level="sonnet"
    ;;
esac

# --- Teszt-only hook (lasd fenti fejlec) ---
if [ "${RESOLVE_EXECUTOR_LEVEL_TEST_FORCE_LOCAL:-0}" = "1" ]; then
  level="local"
fi

# --- Segedfuggvenyek a mátrix-clamphez (EXECUTOR_LADDER sorrend: local<haiku<sonnet<opus) ---
level_index() {
  case "$1" in
    local) echo 0 ;;
    haiku) echo 1 ;;
    sonnet) echo 2 ;;
    opus) echo 3 ;;
  esac
}

level_name() {
  case "$1" in
    0) echo local ;;
    1) echo haiku ;;
    2) echo sonnet ;;
    3) echo opus ;;
  esac
}

set_contains() {
  # $1: szokozzel elvalasztott szint-halmaz, $2: keresett szint
  case " $1 " in
    *" $2 "*) return 0 ;;
    *) return 1 ;;
  esac
}

# Visszaadja $1 halmaz legkozelebbi tagjat $2 szinthez kepest, $3 irany szerint
# ("up": nagyobb/egyenlo index preferalt, "down": kisebb/egyenlo). Ha az adott iranyban
# nincs talalat, a masik vegen levo szelso tagot adja vissza (a halmaz sose ures, amikor
# ezt hivjuk).
nearest_in_set() {
  set_str="$1"; cur="$2"; dir="$3"
  if set_contains "$set_str" "$cur"; then
    echo "$cur"
    return
  fi
  cur_idx=$(level_index "$cur")
  if [ "$dir" = "up" ]; then
    i=$cur_idx
    while [ "$i" -le 3 ]; do
      cand=$(level_name "$i")
      if set_contains "$set_str" "$cand"; then echo "$cand"; return; fi
      i=$((i + 1))
    done
    for cand in opus sonnet haiku local; do
      if set_contains "$set_str" "$cand"; then echo "$cand"; return; fi
    done
  else
    i=$cur_idx
    while [ "$i" -ge 0 ]; do
      cand=$(level_name "$i")
      if set_contains "$set_str" "$cand"; then echo "$cand"; return; fi
      i=$((i - 1))
    done
    for cand in local haiku sonnet opus; do
      if set_contains "$set_str" "$cand"; then echo "$cand"; return; fi
    done
  fi
}

# --- OFFLOAD_PHASE_MATRIX (config.md "OFFLOAD_PROFILE es OFFLOAD_PHASE_MATRIX"
#     alszekciojanak tukorkepe, szallitott alapertek) ---
allowed_set() {
  profile="$1"; ph="$2"
  case "$profile" in
    off)
      case "$ph" in
        repo-scanner|code-reviewer|qa-tester|implementer) echo "haiku sonnet opus" ;;
        figma-designer) echo "sonnet opus" ;;
        architect) echo "sonnet opus" ;;
        ux-designer) echo "sonnet opus" ;;
      esac
      ;;
    conservative)
      case "$ph" in
        repo-scanner) echo "local haiku sonnet" ;;
        code-reviewer|qa-tester|implementer) echo "haiku sonnet opus" ;;
        figma-designer) echo "sonnet opus" ;;
        architect) echo "sonnet opus" ;;
        ux-designer) echo "sonnet opus" ;;
      esac
      ;;
    balanced)
      case "$ph" in
        repo-scanner|code-reviewer|qa-tester) echo "local haiku sonnet" ;;
        implementer) echo "haiku sonnet opus" ;;
        figma-designer) echo "sonnet opus" ;;
        architect) echo "sonnet opus" ;;
        ux-designer) echo "sonnet opus" ;;
      esac
      ;;
    aggressive)
      case "$ph" in
        repo-scanner|code-reviewer|qa-tester) echo "local haiku" ;;
        implementer) echo "local sonnet" ;;
        figma-designer) echo "sonnet opus" ;;
        architect) echo "sonnet opus" ;;
        ux-designer) echo "sonnet opus" ;;
      esac
      ;;
    max-local)
      case "$ph" in
        repo-scanner|code-reviewer|qa-tester|implementer) echo "local" ;;
        figma-designer) echo "sonnet opus" ;;
        architect) echo "sonnet opus" ;;
        ux-designer) echo "sonnet opus" ;;
      esac
      ;;
  esac
}

matrix_set=$(allowed_set "$offload_profile" "$phase")

if ! set_contains "$matrix_set" "$level"; then
  clamped=$(nearest_in_set "$matrix_set" "$level" "$clamp_direction")
  echo "resolve-executor-level: offload-clamp -- $phase / $offload_profile mellett \"$level\" nem engedett, $clamp_direction irannyal a legkozelebbi engedett szintre kerekitve: \"$clamped\"" >&2
  level="$clamped"
fi

# --- Lokal-szerzodes hianya (COCALC-278 AC6/AC7, szukitve COCALC-387-ben) -- hard
# constraint, iranytol fuggetlen. Az "implementer" INNENTOL KIVETEL -- annak MAR VAN
# lokal-vegrehajtasi szerzodese (call-local-model.sh + implementer-response.v1 sema),
# ezert az implementer szintje "local" maradhat, ha a matrix ezt adja. A COCALC-273 (AC8)
# veto-modellje (Story/Bug sosem "local") ettol fuggetlenul, LENT, MEG UTANA fut.
# LOCAL-5: a "local" szint ott engedett, ahol a fazis szerepel a --local-phases listan
# (implementer/repo-scanner/qa-tester); a code-reviewer-nek tovabbra sincs lokal-szerzodese. ---
local_allowed=0
case "$phase" in
  implementer|repo-scanner|qa-tester)
    case " $local_phases " in
      *" $phase "*) local_allowed=1 ;;
    esac
    ;;
esac
case "$phase" in
  code-reviewer|qa-tester|repo-scanner|implementer)
    if [ "$level" = "local" ] && [ "$local_allowed" = "0" ]; then
      no_local_set=$(printf '%s' "$matrix_set" | tr ' ' '\n' | grep -v '^local$' | tr '\n' ' ')
      no_local_set=$(printf '%s' "$no_local_set" | sed 's/^ *//; s/ *$//')
      if [ -z "$no_local_set" ]; then
        echo "resolve-executor-level: $phase-nek nincs lokal-szerzodese (vagy nincs a --local-phases listan), es a(z) $offload_profile preset egyetlen engedett szintje (local) hasznalhatatlan -- visszaesés az EXECUTOR_LADDER alapszintjere (sonnet)" >&2
        level="sonnet"
      else
        clamped=$(nearest_in_set "$no_local_set" "local" "up")
        echo "resolve-executor-level: $phase-nek nincs lokal-szerzodese (vagy nincs a --local-phases listan) -- helyi vegrehajtas megtagadva, felleptetve: \"$clamped\"" >&2
        level="$clamped"
      fi
    fi
    ;;
esac

# --- Veto-modell: a legolcsobb (EXECUTOR_LADDER elso) szint Story/Bug-nal kizart ---
# Az EXECUTOR_LADDER sorrendje: local < haiku < sonnet < opus.
if [ "$level" = "local" ]; then
  case "$issue_type" in
    Story|Bug)
      echo "resolve-executor-level: veto -- $issue_type tipus nem eshet a legolcsobb (local) szintre, felleptetve haiku-ra" >&2
      level="haiku"
      ;;
  esac
fi

echo "$level"
