#!/usr/bin/env bash
# GATE-1 (COCALC-261) — blokkoló pipeline-eredmény kapu az MR-nyitás után. A legfrissebb,
# a megadott branch-hez tartozó pipeline job-jait `glab api graphql`-lel kérdezi le (szűk
# lekérdezés: job név, státusz, stuck, stage, allowFailure — NEM a teljes REST job-objektum). A
# gépen nincs `jq`, ezért a válasz feldolgozása kizárólag shell-eszközökkel (grep/sed)
# történik. Lásd dev-workflow/config.md "PIPELINE_GATE_*" kapcsolók (Munkamódprofil
# preset-tábla) és dev-workflow-execute/SKILL.md A7a/9. lépés.
#
# Használat: bash wait-for-pipeline.sh <branch-név>
#
# Kapcsolók — a szkript maga olvassa ki őket a config.md "PIPELINE_GATE_* kapcsolók" és
# "GitLab-API terhelés" tábláiból (config-value.sh); a környezeti változó egyszeri,
# futásra szóló felülbírálás. A zárójelben a beégetett tartalék-alapérték, ami csak akkor
# lép életbe, ha a config.md-ből nem olvasható ki érték (lásd "Fallback-szabály"):
#   PIPELINE_GATE_BLOCKING_JOBS         (rule)  "rule" vagy vesszővel elválasztott,
#                                               explicit job-név lista.
#   PIPELINE_GATE_TIMEOUT_MINUTES       (15)    Felső korlát percben a várakozásra.
#   PIPELINE_GATE_POLL_SECONDS          (45)    Két lekérdezés közti várakozás másodpercben.
#   GITLAB_RATE_LIMIT_RETRIES           (5)     Hányszor próbálja újra a lekérdezést, ha a
#                                               GitLab rate limitet (429) jelez; 0 = nem
#                                               próbálja újra, azonnal fail closed.
#   GITLAB_RATE_LIMIT_BACKOFF_SECONDS   (20)    Az n-edik újrapróbálás előtt n×ennyit vár
#                                               (lineáris visszalépés: 20, 40, 60 ... mp).
#   PIPELINE_GATE_STUCK_GRACE_SECONDS   (120)   Ha egy blokkoló job legalább ennyi ideje
#                                               elakadt (PENDING, és a GitLab szerint egyetlen
#                                               online runner sem veheti fel), 4-es kilépőkód.
#                                               0 = kikapcsolva (várakozás a timeoutig).
#
# Kilépőkódok (a hívó fél ez alapján dönt a PIPELINE_GATE_ON_RED/PIPELINE_GATE_ON_TIMEOUT
# kapcsolók szerint, lásd config.md):
#   0 — zöld: minden blokkoló job sikeres (vagy nincs blokkoló job — lásd figyelmeztetés).
#   1 — fail closed: parse-hiba, üres/váratlan válasz, hiányzó glab/hitelesítés, nincs
#       pipeline az MR-hez, a rate limit újrapróbálásai elfogytak, vagy egyéb, a szkript
#       által nem kezelhető állapot.
#   2 — piros: legalább egy blokkoló job sikertelen (failed/canceled).
#   3 — timeout: a PIPELINE_GATE_TIMEOUT_MINUTES letelt, de van még futó/váró blokkoló job.
#   4 — nincs alkalmas runner (ORD-369): egy blokkoló job a PIPELINE_GATE_STUCK_GRACE_SECONDS
#       óta elakadt (a GitLab `stuck` jelzése: nem védett ref egy csak védett refeken futó
#       runnerrel, hiányzó runner-tag, offline runner). A sorban állás (foglalt runner) nem
#       ilyen, arra a mai várakozás érvényes.
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Használat: wait-for-pipeline.sh <branch-név>" >&2
  exit 1
fi

BRANCH="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cfg() { bash "$SCRIPT_DIR/config-value.sh" "$1" "$2"; }

# Fallback-szabály (config.md): nem pozitív egész (vagy a RETRIES/BACKOFF esetén nem
# nemnegatív egész) érték -> szállított alapérték, egysoros jelzéssel.
cfg_number() {  # $1: kapcsoló, $2: alapérték, $3: minimum (0 vagy 1)
  _val="$(cfg "$1" "$2")"
  case "$_val" in
    ''|*[!0-9]*) _val="" ;;
  esac
  if [ -z "$_val" ] || [ "$_val" -lt "$3" ]; then
    echo "FIGYELEM: $1 értéke érvénytelen — visszaesés a szállított alapértékre ($2)." >&2
    _val="$2"
  fi
  printf '%s' "$_val"
}

PIPELINE_GATE_BLOCKING_JOBS="$(cfg PIPELINE_GATE_BLOCKING_JOBS rule)"
PIPELINE_GATE_TIMEOUT_MINUTES="$(cfg_number PIPELINE_GATE_TIMEOUT_MINUTES 15 1)"
POLL_INTERVAL_SECONDS="$(cfg_number PIPELINE_GATE_POLL_SECONDS 45 1)"
GITLAB_RATE_LIMIT_RETRIES="$(cfg_number GITLAB_RATE_LIMIT_RETRIES 5 0)"
GITLAB_RATE_LIMIT_BACKOFF_SECONDS="$(cfg_number GITLAB_RATE_LIMIT_BACKOFF_SECONDS 20 0)"
PIPELINE_GATE_STUCK_GRACE_SECONDS="$(cfg_number PIPELINE_GATE_STUCK_GRACE_SECONDS 120 0)"

if ! command -v glab >/dev/null 2>&1; then
  echo "HIBA: a 'glab' parancssori eszköz nincs telepítve/nem elérhető a PATH-on —" >&2
  echo "enélkül a pipeline-kapu nem tud lekérdezni, lásd dev-workflow/config.md" >&2
  echo "'AI-identitás' szekció (push-as-ai.sh mintájára)." >&2
  exit 1
fi

ORIGIN_URL="$(git remote get-url origin)"
PROJECT_PATH="$(printf '%s' "$ORIGIN_URL" | sed -E 's#^(https?://[^/]+/|git@[^:]+:)##; s#\.git$##')"
if [ -z "$PROJECT_PATH" ]; then
  echo "HIBA: nem sikerült a GitLab projekt full-path-ját levezetni az origin remote" >&2
  echo "URL-jéből ($ORIGIN_URL) — fail closed." >&2
  exit 1
fi

# A GitLab GraphQL `Project.pipelines` connection NEM fogad `orderBy` argumentumot
# (`glab api graphql` válasza: "Field 'pipelines' doesn't accept argument 'orderBy'",
# code: argumentNotAccepted) — a séma alapból csökkenő pipeline-ID (= created_at) szerint
# rendez, így a `first: 1` önmagában a legfrissebb, a `$ref` branch-hez tartozó
# pipeline-t adja (élesben igazolva a REST `/pipelines?ref=…` első sorával). Ha ez a
# feltevés valaha megdőlne (a `first: 1` nem a legfrissebbet hozza), a `pipelines`
# connection akkor sem rendezhető GraphQL-ből — a `glab ci list` első sorából vett IID
# szerinti szűrés a járható út.
read -r -d '' GRAPHQL_QUERY <<'EOF' || true
query($fullPath: ID!, $ref: String!) {
  project(fullPath: $fullPath) {
    pipelines(ref: $ref, first: 1) {
      nodes {
        status
        jobs {
          nodes {
            name
            status
            stuck
            allowFailure
            stage { name }
          }
        }
      }
    }
  }
}
EOF

# `read -r -d ''` a heredoc-ból a záró NUL hiánya miatt mindig nemnulla kilépőkóddal tér
# vissza, ezért a fenti sor végén `|| true` — ez szándékos, nem hibaág (set -e alatt
# máskülönben itt állna meg a szkript).

is_terminal_status() {
  case "$1" in
    SUCCESS|FAILED|CANCELED|SKIPPED) return 0 ;;
    *) return 1 ;;
  esac
}

is_rate_limited() {  # GitLab rate limit (HTTP 429) felismerése a glab hibakimenetéből
  printf '%s' "$1" | grep -Eqi 'rate limit|too many requests|retry later|(^|[^0-9])429([^0-9]|$)'
}

is_blocking_stage() {
  case "$1" in
    deploy|post-deploy|.pre) return 1 ;;
    *) return 0 ;;
  esac
}

DEADLINE=$(( $(date +%s) + PIPELINE_GATE_TIMEOUT_MINUTES * 60 ))
# Job-nevenkénti, egyszeri MANUAL-jelzéshez — a poll-ciklusok között is megőrződik, hogy
# ne ismételjük ugyanazt az üzenetet minden poll-körben (lásd lent).
NOTIFIED_MANUAL_JOBS=""
# Egymást követő, rate limit miatt elutasított lekérdezések száma — egy sikeres válasz nullázza.
RATE_LIMIT_ATTEMPT=0
# Mióta (epoch mp) van folyamatosan elakadt blokkoló job; üres = most nincs (ORD-369).
STUCK_SINCE=""

while :; do
  if ! RAW_RESPONSE="$(glab api graphql -f query="$GRAPHQL_QUERY" -f fullPath="$PROJECT_PATH" -f ref="$BRANCH" 2>&1)"; then
    # A GitLab rate limitje (429) átmeneti: nem pipeline-hiba és nem "nem tudom értelmezni",
    # ezért lineáris visszalépéssel újrapróbáljuk, a GITLAB_RATE_LIMIT_RETRIES-ig — csak ezután
    # fail closed (a kapu a bizonytalan állapotot továbbra sem engedi át).
    if is_rate_limited "$RAW_RESPONSE" && [ "$RATE_LIMIT_ATTEMPT" -lt "$GITLAB_RATE_LIMIT_RETRIES" ]; then
      RATE_LIMIT_ATTEMPT=$((RATE_LIMIT_ATTEMPT + 1))
      RATE_LIMIT_WAIT=$((GITLAB_RATE_LIMIT_BACKOFF_SECONDS * RATE_LIMIT_ATTEMPT))
      echo "INFO: a GitLab rate limitet jelzett (429) — ${RATE_LIMIT_WAIT} mp várakozás, újrapróbálás ${RATE_LIMIT_ATTEMPT}/${GITLAB_RATE_LIMIT_RETRIES}." >&2
      sleep "$RATE_LIMIT_WAIT"
      continue
    fi
    if is_rate_limited "$RAW_RESPONSE"; then
      echo "HIBA: a GitLab rate limit (429) a ${GITLAB_RATE_LIMIT_RETRIES} újrapróbálás után sem szűnt meg — fail closed." >&2
      echo "Várj pár percet, vagy emeld a config.md GITLAB_RATE_LIMIT_RETRIES / PIPELINE_GATE_POLL_SECONDS értékét. Nyers válasz:" >&2
    else
      echo "HIBA: a glab api graphql hívás sikertelen — fail closed. Nyers válasz:" >&2
    fi
    echo "$RAW_RESPONSE" >&2
    exit 1
  fi
  RATE_LIMIT_ATTEMPT=0

  if [ -z "$RAW_RESPONSE" ]; then
    echo "HIBA: üres válasz a glab api graphql hívásra — fail closed (nem tudjuk" >&2
    echo "értelmezni a pipeline állapotát, nem engedünk át)." >&2
    exit 1
  fi

  FLAT_RESPONSE="$(printf '%s' "$RAW_RESPONSE" | tr -d '\n')"

  if printf '%s' "$FLAT_RESPONSE" | grep -Fq '"pipelines":{"nodes":[]}'; then
    echo "HIBA: a(z) '$BRANCH' branch-hez ($PROJECT_PATH) nincs pipeline — azonnali hiba," >&2
    echo "timeout kivárása nélkül (a kapu nem tud mire várni)." >&2
    exit 1
  fi

  # Job-blokkonként egy sorba bontás — a lekérdezés fix mezősorrendje miatt a GraphQL
  # válaszban minden job-node ugyanilyen szerkezetben szerepel (jq hiányában ez a
  # legmegbízhatóbb shell-oldali feldolgozás; ha a szerkezet mégsem illeszkedik, a lenti
  # nulla-találatos ág fail closed-dal áll le).
  # A job/stage név mezőt escapelt karaktereket (pl. `\"`) is helyesen záró darabként
  # kezelő minta — `([^"\\]|\\.)*` engedi az escape-szekvenciákat (backslash + bármi),
  # hogy egy escapelt idézőjeles job-név ne törje meg a blokk-egyezést és ne csúsztassa
  # el/dobja el csendben a teljes job-bejegyzést (lásd lent a JOB_NAME-nél a fail-closed
  # ágat az ilyen nevek explicit kezelésére).
  JOB_LINES="$(printf '%s' "$FLAT_RESPONSE" | grep -oE '"name":"([^"\\]|\\.)*","status":"[^"]*",("stuck":(true|false|null),)?"allowFailure":(true|false),"stage":\{"name":"([^"\\]|\\.)*"\}' || true)"

  if [ -z "$JOB_LINES" ]; then
    echo "HIBA: nem sikerült egyetlen job-blokkot sem kinyerni a GraphQL válaszból —" >&2
    echo "fail closed (parse-hiba / váratlan válaszszerkezet). Nyers válasz:" >&2
    echo "$RAW_RESPONSE" >&2
    exit 1
  fi

  ALL_TERMINAL=true
  ANY_RED=false
  BLOCKING_COUNT=0
  SUMMARY_LINES=""
  STUCK_JOBS=""

  while IFS= read -r JOB_LINE; do
    [ -z "$JOB_LINE" ] && continue

    JOB_NAME="$(printf '%s' "$JOB_LINE" | sed -E 's/^"name":"((\\.|[^"\\])*)".*/\1/')"
    JOB_STATUS="$(printf '%s' "$JOB_LINE" | sed -E 's/.*"status":"([^"]*)".*/\1/')"
    JOB_ALLOW_FAILURE="$(printf '%s' "$JOB_LINE" | sed -E 's/.*"allowFailure":(true|false).*/\1/')"
    JOB_STUCK=false
    case "$JOB_LINE" in *'"stuck":true'*) JOB_STUCK=true ;; esac
    JOB_STAGE="$(printf '%s' "$JOB_LINE" | sed -E 's/.*"stage":\{"name":"((\\.|[^"\\])*)"\}.*/\1/')"

    if [ -z "$JOB_NAME" ] || [ -z "$JOB_STATUS" ] || [ -z "$JOB_STAGE" ]; then
      echo "HIBA: egy job-blokk mezői nem nyerhetők ki egyértelműen (speciális karakter a" >&2
      echo "job névben?) — fail closed. Blokk: $JOB_LINE" >&2
      exit 1
    fi

    # A JOB_LINES fenti mintája már nem dobja el csendben az escapelt idézőjelet
    # tartalmazó job-nevet, de a shell-oldali feldolgozás (sed/grep) nem tud biztonságosan
    # JSON-unescape-elni (pl. `\"` -> `"`, `\\` -> `\`) — ezért egy ilyen job-név esetén
    # explicit fail-closeddal állunk le ahelyett, hogy a nyers, escapelt formában
    # csonkított/torzított névvel folytatnánk (lásd COCALC-261 edge case: "Job neve
    # speciális karaktert tartalmaz... ha mégis, a fail-closed szabály lép életbe.").
    case "$JOB_NAME" in
      *'\'*)
        echo "HIBA: a(z) '$JOB_NAME' job neve escapelt/speciális karaktert tartalmaz a" >&2
        echo "GraphQL válaszban — a shell-oldali (sed/grep) feldolgozás ezt nem tudja" >&2
        echo "biztonságosan unescape-elni, fail closed." >&2
        exit 1
        ;;
    esac

    IS_BLOCKING=false
    if [ "$PIPELINE_GATE_BLOCKING_JOBS" = "rule" ]; then
      if [ "$JOB_ALLOW_FAILURE" = "false" ] && is_blocking_stage "$JOB_STAGE"; then
        IS_BLOCKING=true
      fi
    else
      case ",$PIPELINE_GATE_BLOCKING_JOBS," in
        *",$JOB_NAME,"*) IS_BLOCKING=true ;;
      esac
    fi

    if [ "$IS_BLOCKING" = "true" ]; then
      BLOCKING_COUNT=$((BLOCKING_COUNT + 1))
      SUMMARY_LINES="${SUMMARY_LINES}${JOB_NAME}: ${JOB_STATUS}
"
      if [ "$JOB_STATUS" = "MANUAL" ]; then
        # Korai, informatív jelzés — MANUAL (kézi jóváhagyásra váró) blokkoló job esetén
        # ne maradjon néma a szkript a teljes PIPELINE_GATE_TIMEOUT_MINUTES timeoutig,
        # job-nevenként csak egyszer (a NOTIFIED_MANUAL_JOBS lista poll-ciklusok között is
        # megőrződik, lásd a szkript elején).
        case ",$NOTIFIED_MANUAL_JOBS," in
          *",$JOB_NAME,"*) : ;;
          *)
            echo "INFO: a(z) '$JOB_NAME' blokkoló job MANUAL állapotban van (kézi" >&2
            echo "jóváhagyásra vár) — a várakozás folytatódik a $PIPELINE_GATE_TIMEOUT_MINUTES perces timeoutig." >&2
            NOTIFIED_MANUAL_JOBS="${NOTIFIED_MANUAL_JOBS},${JOB_NAME}"
            ;;
        esac
      fi
      if [ "$JOB_STATUS" = "PENDING" ] && [ "$JOB_STUCK" = "true" ]; then
        STUCK_JOBS="${STUCK_JOBS}${STUCK_JOBS:+, }${JOB_NAME}"
      fi
      if ! is_terminal_status "$JOB_STATUS"; then
        ALL_TERMINAL=false
      elif [ "$JOB_STATUS" != "SUCCESS" ] && [ "$JOB_STATUS" != "SKIPPED" ]; then
        ANY_RED=true
      fi
    fi
  done <<EOF_JOBS
$JOB_LINES
EOF_JOBS

  if [ "$BLOCKING_COUNT" -eq 0 ]; then
    echo "FIGYELEM: a szabály/lista szerint egyetlen blokkoló job sem található ebben a" >&2
    echo "pipeline-ban — ez gyanús (nem várt, hogy semmi ne blokkolna), ellenőrizd" >&2
    echo "kézzel a .gitlab-ci.yml-t." >&2
  fi

  if [ "$ALL_TERMINAL" = "true" ]; then
    echo "$SUMMARY_LINES"
    if [ "$ANY_RED" = "true" ]; then
      echo "VERDIKT: PIROS — legalább egy blokkoló job nem sikeres." >&2
      exit 2
    fi
    echo "VERDIKT: ZÖLD — minden blokkoló job sikeres."
    exit 0
  fi

  NOW="$(date +%s)"
  # Elakadt (stuck) blokkoló job: a GitLab szerint egyetlen online runner sem veheti fel.
  # Átmeneti is lehet (a runner épp újraindul), ezért csak a türelmi idő után áll meg.
  if [ -n "$STUCK_JOBS" ] && [ "$PIPELINE_GATE_STUCK_GRACE_SECONDS" -gt 0 ]; then
    [ -z "$STUCK_SINCE" ] && STUCK_SINCE="$NOW"
    if [ $((NOW - STUCK_SINCE)) -ge "$PIPELINE_GATE_STUCK_GRACE_SECONDS" ]; then
      echo "$SUMMARY_LINES"
      echo "VERDIKT: NINCS ALKALMAS RUNNER — elakadt blokkoló job(ok): $STUCK_JOBS (legalább $PIPELINE_GATE_STUCK_GRACE_SECONDS mp óta)." >&2
      echo "Lehetséges ok: a ref nem védett, de a runner csak védett refeken fut; hiányzó runner-tag; offline runner." >&2
      bash "$SCRIPT_DIR/check-protected-ref.sh" "$BRANCH" --info >&2 || true
      exit 4
    fi
  else
    STUCK_SINCE=""
  fi

  if [ "$NOW" -ge "$DEADLINE" ]; then
    echo "$SUMMARY_LINES"
    echo "VERDIKT: TIMEOUT — a PIPELINE_GATE_TIMEOUT_MINUTES ($PIPELINE_GATE_TIMEOUT_MINUTES perc) letelt, még van futó/váró blokkoló job." >&2
    exit 3
  fi

  sleep "$POLL_INTERVAL_SECONDS"
done
