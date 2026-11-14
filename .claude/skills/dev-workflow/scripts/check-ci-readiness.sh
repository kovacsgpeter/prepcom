#!/usr/bin/env bash
# Egyszeri CI-készenlét ellenőrzés (ORD-382, 4.28.0): a repó GitLab-projektje fel tudja-e
# venni a workflow pipeline-jait. Három feltételt néz, a REPO_MAP minden repójára:
#   1. van-e olyan online, nem szüneteltetett runner, amelyik a .gitlab-ci.yml jobjait (a
#      `default: tags` és a jobszintű `tags`, az include-olt template-jobokkal együtt) felveheti;
#   2. ha a megfelelő runner csak védett refeken fut (`ref_protected`), védettek-e a workflow
#      branch-mintái (`<TICKET_NATURE_TAGS>/*`) és az alap branch;
#   3. ha a munka a megosztott runnerekre épül, elfogyott-e a csoport havi compute-perc kerete.
# A hiányzó tag vagy védett minta miatt a pipeline jobjai "stuck" állapotban elakadnának.
#
# Használat: bash check-ci-readiness.sh [--repo <logikai-név>] [--project <group/projekt>]
#   --repo     csak a REPO_MAP adott logikai nevű sorára fut (alap: minden sorra);
#   --project  a REPO_MAP helyett közvetlenül a megadott GitLab-projektre (tesztekhez, kézi próbához).
#
# Kimenet (stdout): `OK:`, `HIBA:`, `FIGYELMEZTETÉS:` sorok, a javítási tanácsok `  javítás:` sorok.
# Kilépőkód: 0 — nincs HIBA (FIGYELMEZTETÉS lehet; az API-elérhetetlenség is csak FIGYELMEZTETÉS);
#            1 — van legalább egy HIBA; 2 — használati hiba.
# CSAK OLVAS: a `glab api` hívásai kizárólag GET-ek; védett beállítást nem módosít, a javító
# parancsokat csak kiírja.
#
# Kapcsolók (config.md, config-value.sh; env felülbírálhatja):
#   CI_READINESS_CHECK  (on)  `off` mellett kilép 0-val egy "kikapcsolva" sorral.
#   CI_READINESS_MINUTES_LIMIT  (auto)  a havi compute-perc keret: `auto` — a `namespaces/<id>`
#     válasz `shared_runners_minutes_limit` értéke, ha van és > 0; ha nincs, és a `plan` `free`,
#     akkor 400; egyébként ismeretlen (egy OK info-sor). Szám — explicit keret; `0` — nincs korlát.
# Teszt-env: CI_READINESS_GLAB (a glab parancs felülírása), DEV_WORKFLOW_CONFIG (a config.md helye).
#
# Heurisztika-korlátok (nincs YAML-parser, awk-os kinyerés): az `extends:`, a `!reference` és az
# `include:` fájlokból örökölt tagek nem látszanak (az include-ot egy default-tagű jobként
# kezeli); a `runners/<id>` részletei (tag_list, access_level) 403/404 esetén "nem
# megállapítható" állapotot adnak, ami FIGYELMEZTETÉS, nem HIBA.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${DEV_WORKFLOW_CONFIG:-$SCRIPT_DIR/../config.md}"
GLAB="${CI_READINESS_GLAB:-glab}"
ERRORS=0
WARNINGS=0

REPO_FILTER=""
PROJECT_OVERRIDE=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo) [ "$#" -ge 2 ] || { echo "Használat: check-ci-readiness.sh [--repo <logikai-név>] [--project <group/projekt>]" >&2; exit 2; }
            REPO_FILTER="$2"; shift 2 ;;
    --project) [ "$#" -ge 2 ] || { echo "Használat: check-ci-readiness.sh [--repo <logikai-név>] [--project <group/projekt>]" >&2; exit 2; }
            PROJECT_OVERRIDE="$2"; shift 2 ;;
    *) echo "Használat: check-ci-readiness.sh [--repo <logikai-név>] [--project <group/projekt>]" >&2; exit 2 ;;
  esac
done

ok() { echo "OK: $*"; }
warn() { echo "FIGYELMEZTETÉS: $*"; WARNINGS=$((WARNINGS + 1)); }
err() { echo "HIBA: $*"; ERRORS=$((ERRORS + 1)); }
hint() { echo "  javítás: $*"; }

# A glab api GET hívása; a nyers választ az stdout-ra adja, a sikert a kilépőkód jelzi.
api() { "$GLAB" api "$@" 2>/dev/null; }

# Egyszerű JSON-kinyerők (nincs jq): az első előfordulás értéke.
jflat() { printf '%s' "$1" | tr -d '\n'; }
jnum() { jflat "$1" | grep -oE "\"$2\": *[0-9]+" | head -1 | grep -oE '[0-9]+$' || true; }
jbool() { jflat "$1" | grep -oE "\"$2\": *(true|false)" | head -1 | sed -E 's/.*: *//' || true; }
jstr() { jflat "$1" | grep -oE "\"$2\": *\"[^\"]*\"" | head -1 | sed -E 's/^[^:]*: *"(.*)"$/\1/' || true; }
jtags() { jflat "$1" | grep -oE '"tag_list": *\[[^]]*\]' | head -1 | sed -E 's/^[^[]*\[//; s/\]$//' | tr -d '" ' || true; }

CHECK="$(bash "$SCRIPT_DIR/config-value.sh" CI_READINESS_CHECK on)"
if [ "$CHECK" = "off" ]; then
  echo "A CI-készenlét ellenőrzés kikapcsolva (CI_READINESS_CHECK=off)."
  exit 0
fi

# --- REPO_MAP és projektfeloldás ---

# "logikai név|útvonal|alap branch" sorok a config.md REPO_MAP tábláján; a <...> placeholder kimarad.
list_repo_paths() {
  [ -r "$CONFIG_FILE" ] || return 0
  awk '
    function trim(s){ gsub(/^[ \t\r]+/, "", s); gsub(/[ \t\r]+$/, "", s); return s }
    /^[ \t]*\|[ \t]*Logikai név[ \t]*\|[ \t]*Repo path\/URL/ { intab = 1; next }
    intab && /^[ \t]*\|[ \t]*:?-+/ { next }
    intab && /^[ \t]*\|/ {
      n = split($0, c, "|")
      name = trim(c[2]); path = trim(c[3]); base = trim(c[4])
      gsub(/`/, "", name); gsub(/`/, "", path); gsub(/`/, "", base)
      if (name == "" || path == "" || name ~ /</ || path ~ /</) next
      print name "|" path "|" base
      next
    }
    { intab = 0 }
  ' "$CONFIG_FILE" 2>/dev/null || true
}

# GitLab-projektútvonal a REPO_MAP értékből; nem GitLab-útvonalnál (pl. `.`) az origin URL-ből.
resolve_project() {
  local value="$1" url=""
  case "$value" in
    http://*|https://*|git@*) url="$value" ;;
    .*|/*|*:*) url="$(git -C "$value" remote get-url origin 2>/dev/null || true)" ;;
    *)
      if [ -d "$value/.git" ]; then
        url="$(git -C "$value" remote get-url origin 2>/dev/null || true)"
      else
        url="$value"
      fi
      ;;
  esac
  [ -n "$url" ] || return 0
  printf '%s' "$url" | sed -E 's#^(https?://[^/]+/|git@[^:]+:)##; s#\.git$##'
}

# --- Konfigurációból: branch-előtagok ---

# A TICKET_NATURE_TAGS cella összes backtickelt értéke (a config-value.sh csak az elsőt adná).
nature_tags() {
  local tags=""
  if [ -r "$CONFIG_FILE" ]; then
    tags="$(awk -F'|' '$2 ~ /`TICKET_NATURE_TAGS`/ { print $3; exit }' "$CONFIG_FILE" 2>/dev/null \
      | grep -oE '`[^`]+`' | tr -d '`' | tr '\n' ' ' || true)"
  fi
  [ -n "$tags" ] || tags="feature fix build refactoring chore"
  printf '%s' "$tags"
}

# --- Betöltők ---

PROJECT_ENC=""
PROJECT_JSON=""
SHARED_ON="false"
DEFAULT_BRANCH=""
NAMESPACE_ID=""
RUNNERS=""        # soronként: id|tagek(vesszővel)|run_untagged|access_level|online|paused|shared|ismert
UNKNOWN_RUNNERS=0
CI_SETS=""        # soronként egy tag-halmaz (vesszővel, rendezve); `-` = tag nélküli
CI_PARSED="false"
MATCHED_RUNNERS="" # soronként: id|access_level

load_project() {
  PROJECT_JSON=""
  if ! PROJECT_JSON="$(api "projects/$PROJECT_ENC")"; then
    warn "a(z) $PROJECT_PATH projekt nem kérdezhető le, az ellenőrzés kimarad."
    return 1
  fi
  SHARED_ON="$(jbool "$PROJECT_JSON" shared_runners_enabled)"
  DEFAULT_BRANCH="$(jstr "$PROJECT_JSON" default_branch)"
  NAMESPACE_ID="$(jflat "$PROJECT_JSON" | grep -oE '"namespace": *\{"id": *[0-9]+' | head -1 | grep -oE '[0-9]+$' || true)"
  return 0
}

load_runners() {
  RUNNERS=""
  UNKNOWN_RUNNERS=0
  local list obj id online paused active shared det tags untagged access known
  if ! list="$(api "projects/$PROJECT_ENC/runners?per_page=100")"; then
    warn "a(z) $PROJECT_PATH runnerei nem kérdezhetők le, a runner-ellenőrzés kimarad."
    return 1
  fi
  while IFS= read -r obj; do
    id="$(jnum "$obj" id)"
    [ -n "$id" ] || continue
    online="$(jbool "$obj" online)"
    paused="$(jbool "$obj" paused)"
    active="$(jbool "$obj" active)"
    shared="false"
    if [ "$(jstr "$obj" runner_type)" = "instance_type" ]; then
      shared="true"
    elif [ -z "$(jstr "$obj" runner_type)" ]; then
      shared="$(jbool "$obj" is_shared)" # tartalék, ha a runner_type hiányzik
    fi
    [ "$paused" = "true" ] || { [ "$active" = "false" ] && paused="true"; } || paused="false"
    [ "$shared" = "true" ] || shared="false"
    tags=""; untagged=""; access=""; known=1
    if [ "$shared" != "true" ]; then
      if det="$(api "runners/$id")"; then
        tags="$(jtags "$det")"
        untagged="$(jbool "$det" run_untagged)"
        access="$(jstr "$det" access_level)"
        [ -n "$access" ] || known=0
      else
        known=0
        warn "a(z) $id azonosítójú runner részletei nem kérdezhetők le (jogosultság?), a runner nem állapítható meg."
      fi
    fi
    if [ "$known" = 0 ] && [ "$online" = "true" ] && [ "$paused" != "true" ]; then
      UNKNOWN_RUNNERS=$((UNKNOWN_RUNNERS + 1))
    fi
    RUNNERS="${RUNNERS}${id}|${tags}|${untagged}|${access}|${online}|${paused}|${shared}|${known}"$'\n'
  done < <({ jflat "$list" | awk '{ gsub(/\},[ \t]*\{/, "}\n{"); print }'; echo; })
  return 0
}

# A .gitlab-ci.yml tag-halmazai: default: tags, jobszintű tags, include-olt jobok (default-tagek).
load_ci_tags() {
  CI_SETS=""
  CI_PARSED="false"
  local raw out
  if [ -z "$DEFAULT_BRANCH" ] || ! raw="$(api "projects/$PROJECT_ENC/repository/files/.gitlab-ci.yml/raw?ref=$DEFAULT_BRANCH")" || [ -z "$raw" ]; then
    warn "a(z) $PROJECT_PATH .gitlab-ci.yml fájlja nem olvasható, a tag-ellenőrzés kimarad."
    return 0
  fi
  if printf '%s' "$raw" | grep -Eq 'tags:.*!reference'; then
    warn "a(z) $PROJECT_PATH .gitlab-ci.yml fájlja !reference tageket használ, a tag-ellenőrzés kimarad."
    return 0
  fi
  out="$(printf '%s\n' "$raw" | awk '
    function trim(s){ gsub(/^[ \t\r]+/, "", s); gsub(/[ \t\r]+$/, "", s); return s }
    function addtag(t) { gsub(/["'"'"']/, "", t); t = trim(t); if (t != "") tags[++nt] = t }
    function setstr(   i, j, tmp, s) {
      for (i = 2; i <= nt; i++) { tmp = tags[i]; j = i - 1; while (j >= 1 && tags[j] > tmp) { tags[j + 1] = tags[j]; j-- } tags[j + 1] = tmp }
      s = ""; for (i = 1; i <= nt; i++) s = s (i > 1 ? "," : "") tags[i]
      return s == "" ? "-" : s
    }
    function flush() {
      if (ctx == "default") print "DEFAULT " (have ? setstr() : "-")
      else if (ctx == "job" && script) print "JOB " (have ? setstr() : "INHERIT")
      ctx = ""; have = 0; nt = 0; script = 0; blk = 0
    }
    {
      sub(/\r$/, "")
      if ($0 ~ /^[ \t]*(#|$)/) next
      match($0, /^[ ]*/); ind = RLENGTH
      txt = substr($0, ind + 1)
      if (ind == 0) {
        flush()
        key = txt; sub(/:.*/, "", key)
        if (key == "default") ctx = "default"
        else if (key == "include") print "INCLUDE"
        else if (key ~ /^(stages|variables|workflow|image|services|cache|before_script|after_script|spec|---)$/) ctx = ""
        else if (key ~ /^\./) ctx = ""
        else ctx = "job"
        next
      }
      if (ctx != "default" && ctx != "job") next
      if (blk && ind > blk && txt ~ /^-[ \t]/) { t = txt; sub(/^-[ \t]+/, "", t); addtag(t); next }
      blk = 0
      if (txt ~ /^tags:/) {
        rest = trim(substr(txt, 6)); have = 1; nt = 0
        if (rest ~ /^\[/) { gsub(/^\[|\].*$/, "", rest); n = split(rest, parts, ","); for (i = 1; i <= n; i++) addtag(parts[i]) }
        else if (rest == "") blk = ind
        next
      }
      if (txt ~ /^script:/) script = 1
    }
    END { flush() }
  ')" || true
  [ -n "$out" ] || { warn "a(z) $PROJECT_PATH .gitlab-ci.yml fájlja nem értelmezhető, a tag-ellenőrzés kimarad."; return 0; }
  local default_set="-" line sets=""
  if printf '%s\n' "$out" | grep -q '^DEFAULT '; then
    default_set="$(printf '%s\n' "$out" | grep '^DEFAULT ' | head -1 | cut -d' ' -f2)"
  fi
  while IFS= read -r line; do
    case "$line" in
      "JOB INHERIT") sets="${sets}${default_set}"$'\n' ;;
      "JOB "*) sets="${sets}${line#JOB }"$'\n' ;;
      INCLUDE) sets="${sets}${default_set}"$'\n' ;;
    esac
  done <<EOF_OUT
$out
EOF_OUT
  CI_SETS="$(printf '%s' "$sets" | sed '/^$/d' | sort -u)"
  if [ -n "$CI_SETS" ]; then
    CI_PARSED="true"
  else
    warn "a(z) $PROJECT_PATH .gitlab-ci.yml fájljában nem találhatók jobok, a tag-ellenőrzés kimarad."
  fi
}

# --- AC2: felvehető-e a job ---

# Az online, nem szüneteltetett saját (nem megosztott) runnerek közül az illeszkedők.
runner_matches() { # $1: tag-halmaz ("-" = tag nélküli); stdout: "id|access" sorok
  local set="$1" id tags untagged access online paused shared known t okm
  while IFS='|' read -r id tags untagged access online paused shared known; do
    [ -n "$id" ] || continue
    [ "$shared" = "true" ] && continue
    [ "$known" = "1" ] || continue
    [ "$online" = "true" ] && [ "$paused" != "true" ] || continue
    if [ "$set" = "-" ]; then
      [ "$untagged" = "true" ] && echo "$id|$access"
    else
      okm=1
      for t in $(printf '%s' "$set" | tr ',' ' '); do
        case ",$tags," in *",$t,"*) ;; *) okm=0 ;; esac
      done
      [ "$okm" = 1 ] && echo "$id|$access"
    fi
  done <<EOF_R
$RUNNERS
EOF_R
}

check_runner_match() {
  MATCHED_RUNNERS=""
  local shared_online=0 own_online=0 id tags untagged access online paused shared known
  while IFS='|' read -r id tags untagged access online paused shared known; do
    [ -n "$id" ] || continue
    [ "$online" = "true" ] && [ "$paused" != "true" ] || continue
    if [ "$shared" = "true" ]; then shared_online=1; else own_online=1; fi
  done <<EOF_R
$RUNNERS
EOF_R
  if [ "$SHARED_ON" = "true" ] && [ "$shared_online" = 1 ]; then
    ok "a megosztott runnerek be vannak kapcsolva, és van online runner."
    return 0
  fi
  if [ "$CI_PARSED" != "true" ]; then
    if [ "$own_online" = 1 ] || [ "$UNKNOWN_RUNNERS" -gt 0 ]; then
      ok "van online, nem szüneteltetett runner (a CI-tagek nem állapíthatók meg)."
      MATCHED_RUNNERS="$(runner_matches "-"; true)"
    else
      err "nincs online, nem szüneteltetett runner a(z) $PROJECT_PATH projekthez."
      hint "kapcsolj be megosztott runnert, vagy regisztrálj és indíts el egy projekt-/csoport-runnert."
    fi
    return 0
  fi
  local set m first_tags="" matched_all=1 tg
  first_tags="$(printf '%s' "$RUNNERS" | awk -F'|' '$7 != "true" && $5 == "true" && $6 != "true" && $2 != "" { print $2; exit }')"
  while IFS= read -r set; do
    [ -n "$set" ] || continue
    m="$(runner_matches "$set"; true)"
    if [ -n "$m" ]; then
      ok "a(z) ${set/#-/(tag nélküli)} tag-halmazra van illeszkedő online runner."
      MATCHED_RUNNERS="${MATCHED_RUNNERS}${m}"$'\n'
    elif [ "$UNKNOWN_RUNNERS" -gt 0 ]; then
      warn "a runner-illeszkedés nem állapítható meg teljesen a(z) ${set/#-/(tag nélküli)} tag-halmazra (runner-részletek nem kérdezhetők le)."
      matched_all=0
    else
      err "nincs online, nem szüneteltetett runner a(z) ${set/#-/(tag nélküli)} tag-halmazra."
      tg="${first_tags:-<runner-tag>}"
      hint "a .gitlab-ci.yml-ben: default: tags: [$tg]"
      hint "vagy kapcsold be a megosztott runnereket (Settings → CI/CD → Runners)."
      matched_all=0
    fi
  done <<EOF_S
$CI_SETS
EOF_S
  MATCHED_RUNNERS="$(printf '%s' "$MATCHED_RUNNERS" | sed '/^$/d' | sort -u)"
  return 0
}

# --- AC3: védett branch-minták ---

required_patterns() { # stdout: soronként egy szükséges minta
  local t
  [ -n "${BASE_BRANCH:-}" ] && echo "$BASE_BRANCH"
  for t in $(nature_tags); do echo "$t/*"; done
}

check_protected_patterns() {
  [ -n "$MATCHED_RUNNERS" ] || return 0
  # Csak akkor számít, ha minden illeszkedő runner csak védett refeken fut.
  if printf '%s\n' "$MATCHED_RUNNERS" | grep -qvE '\|ref_protected$'; then
    return 0
  fi
  local raw names missing="" pat sample n covered
  if ! raw="$(api "projects/$PROJECT_ENC/protected_branches?per_page=100")"; then
    warn "a védett branch-minták nem kérdezhetők le ($PROJECT_PATH), az ellenőrzés kimarad."
    return 0
  fi
  names="$(jflat "$raw" | grep -oE '"name": *"[^"]*"' | sed -E 's/^"name": *"(.*)"$/\1/' || true)"
  while IFS= read -r pat; do
    [ -n "$pat" ] || continue
    sample="${pat/\*/x}"
    covered=0
    while IFS= read -r n; do
      [ -n "$n" ] || continue
      # shellcheck disable=SC2254
      case "$sample" in $n) covered=1; break ;; esac
    done <<EOF_N
$names
EOF_N
    [ "$covered" = 1 ] || missing="${missing}${pat} "
  done < <(required_patterns)
  missing="${missing% }"
  if [ -z "$missing" ]; then
    ok "a workflow branch-minták védettek (a runner csak védett refeken fut)."
    return 0
  fi
  if [ "$UNKNOWN_RUNNERS" -gt 0 ]; then
    warn "a runner csak védett refeken fut, de nem védett minták: $missing (a runner-részletek nem teljesen ismertek)."
  else
    err "a runner csak védett refeken fut, de nem védett branch-minták: $missing"
  fi
  hint "felületen: Settings → Repository → Protected branches (push és merge: Developers + Maintainers, force push tiltva)."
  for pat in $missing; do
    hint "glab api -X POST \"projects/$PROJECT_ENC/protected_branches\" -f name='$pat' -F push_access_level=30 -F merge_access_level=30 -F allow_force_push=false"
  done
  return 0
}

# --- AC4: compute-perc keret ---

# A GitLab.com REST `namespaces/<id>` válasza adja a havi felhasználást (`ci_minutes_usage`);
# a keretet a CI_READINESS_MINUTES_LIMIT adja (lásd a fejlécben). Ismeretlen keretnél nincs figyelmeztetés.
check_ci_minutes() {
  [ "$SHARED_ON" = "true" ] || return 0
  local ns used limit extra pct cfg plan
  if [ -z "$NAMESPACE_ID" ] || ! ns="$(api "namespaces/$NAMESPACE_ID")"; then
    warn "a compute-perc felhasználás nem kérdezhető le, az ellenőrzés kimarad."
    return 0
  fi
  used="$(jnum "$ns" monthly_minutes_used)"
  [ -n "$used" ] || used="$(jnum "$ns" total_minutes_used)"
  if [ -z "$used" ]; then
    warn "a compute-perc felhasználás nem kérdezhető le, az ellenőrzés kimarad."
    return 0
  fi
  cfg="$(bash "$SCRIPT_DIR/config-value.sh" CI_READINESS_MINUTES_LIMIT auto)"
  case "$cfg" in
    auto)
      limit="$(jnum "$ns" shared_runners_minutes_limit)"
      extra="$(jnum "$ns" extra_shared_runners_minutes_limit)"
      limit=$(( ${limit:-0} + ${extra:-0} ))
      if [ "$limit" -le 0 ]; then
        plan="$(jstr "$ns" plan)"
        if [ "$plan" = "free" ]; then
          limit=400
        fi
      fi
      ;;
    *[!0-9]*|"")
      warn "a CI_READINESS_MINUTES_LIMIT értéke érvénytelen ($cfg): auto, szám vagy 0 lehet."
      return 0
      ;;
    *) limit=$((10#$cfg)) ;;
  esac
  if [ "$limit" -le 0 ]; then
    ok "a havi compute-perc felhasználás: $used perc (a keret ismeretlen, vagy nincs korlát)."
    return 0
  fi
  pct=$(( used * 100 / limit ))
  if [ "$pct" -ge 80 ]; then
    warn "a csoport havi compute-perc kerete ${pct}%-ban elfogyott ($used / $limit perc)."
  else
    ok "a havi compute-perc felhasználás: ${pct}% ($used / $limit perc)."
  fi
}

# --- main ---

check_repo() { # $1: logikai név; $2: projektútvonal; $3: alap branch (üres: a projekt alapértelmezett branche)
  PROJECT_PATH="$2"
  BASE_BRANCH="$3"
  PROJECT_ENC="$(printf '%s' "$PROJECT_PATH" | sed 's#/#%2F#g')"
  echo "== $1 ($PROJECT_PATH) =="
  load_project || return 0
  [ -n "$BASE_BRANCH" ] || BASE_BRANCH="$DEFAULT_BRANCH"
  load_runners || return 0
  load_ci_tags
  check_runner_match
  check_protected_patterns
  check_ci_minutes
}

main() {
  local line name path base project found=0
  if [ -n "$PROJECT_OVERRIDE" ]; then
    check_repo "${REPO_FILTER:-projekt}" "$PROJECT_OVERRIDE" ""
    found=1
  else
    while IFS='|' read -r name path base; do
      [ -n "$name" ] || continue
      [ -z "$REPO_FILTER" ] || [ "$REPO_FILTER" = "$name" ] || continue
      project="$(resolve_project "$path")"
      if [ -z "$project" ]; then
        warn "a(z) $name repó GitLab-projektje nem állapítható meg ($path), kimarad."
        found=1
        continue
      fi
      found=1
      check_repo "$name" "$project" "$base"
    done < <(list_repo_paths)
    if [ "$found" = 0 ]; then
      if [ -n "$REPO_FILTER" ] && [ -n "$(list_repo_paths)" ]; then
        echo "Használat: ismeretlen repó a REPO_MAP-ben: $REPO_FILTER" >&2
        exit 2
      fi
      warn "REPO_MAP még nincs kitöltve, a CI-készenlét ellenőrzés kimarad"
      exit 0
    fi
  fi
  echo "Összegzés: $ERRORS HIBA, $WARNINGS FIGYELMEZTETÉS"
  [ "$ERRORS" -eq 0 ] || exit 1
  exit 0
}

main
