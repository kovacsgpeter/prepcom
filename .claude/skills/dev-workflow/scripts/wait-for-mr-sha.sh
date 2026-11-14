#!/usr/bin/env bash
# Epic-mód (E-ág, E6, 4.23.4). Push után megvárja, hogy az MR
# head-pipeline-ja a frissen pusholt SHA-ra jöjjön létre, MIELŐTT a wait-for-pipeline.sh
# fut. A wait-for-pipeline.sh a branch legfrissebb pipeline-ját olvassa: közvetlenül a push
# után az még az előző SHA futása lehet, és annak (piros vagy zöld) eredményét adná vissza.
#
# Használat: bash wait-for-mr-sha.sh <MR-iid> <várt-SHA>
# Kapcsolók (config.md, config-value.sh; a környezeti változó egyszeri felülbírálás):
#   PIPELINE_GATE_POLL_SECONDS   (45)  két lekérdezés közti várakozás
#   EPIC_SHA_WAIT_SECONDS        (300) felső korlát másodpercben
# Kilépőkódok: 0 — a head-pipeline a várt SHA-ra fut (stdout: a pipeline id-je);
#              3 — timeout, a várt SHA-ra nem jött létre pipeline; 1 — egyéb hiba.
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Használat: wait-for-mr-sha.sh <MR-iid> <várt-SHA>" >&2
  exit 1
fi
IID="$1"
WANT="$2"
case "$IID" in ''|*[!0-9]*) echo "HIBA: az MR-iid nem szám: $IID" >&2; exit 1 ;; esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
num() {  # $1: kapcsoló, $2: alapérték
  _v="$(bash "$SCRIPT_DIR/config-value.sh" "$1" "$2")"
  case "$_v" in ''|*[!0-9]*) echo "FIGYELEM: $1 érvénytelen — visszaesés: $2." >&2; _v="$2" ;; esac
  printf '%s' "$_v"
}
POLL="$(num PIPELINE_GATE_POLL_SECONDS 45)"
[ "$POLL" -ge 1 ] || POLL=1
LIMIT="$(num EPIC_SHA_WAIT_SECONDS 300)"

START=$(date +%s)
while :; do
  MR_JSON="$(bash "$SCRIPT_DIR/glab-note-as-ai.sh" api "projects/:id/merge_requests/$IID")" || {
    echo "HIBA: az MR (!$IID) nem olvasható be." >&2
    exit 1
  }
  FOUND="$(printf '%s' "$MR_JSON" | WANT="$WANT" node -e '
let s = "";
process.stdin.on("data", (d) => { s += d; }).on("end", () => {
  try {
    const hp = JSON.parse(s).head_pipeline || {};
    process.stdout.write(hp.sha === process.env.WANT && hp.id ? String(hp.id) : "");
  } catch { process.stdout.write("ERR"); }
});
')"
  case "$FOUND" in
    ERR) echo "HIBA: az MR-válasz nem JSON (!$IID)." >&2; exit 1 ;;
    '') ;;
    *) echo "$FOUND"; exit 0 ;;
  esac
  if [ $(( $(date +%s) - START )) -ge "$LIMIT" ]; then
    echo "TIMEOUT: ${LIMIT} mp alatt nem jött létre pipeline a $WANT SHA-ra (!$IID)." >&2
    exit 3
  fi
  sleep "$POLL"
done
