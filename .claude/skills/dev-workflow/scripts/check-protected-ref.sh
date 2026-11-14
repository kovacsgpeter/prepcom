#!/usr/bin/env bash
# Push előtti ellenőrzés (ORD-369): illeszkedik-e a branch a GitLab-projekt védett
# branch-mintáira. Ha a projekt runnere csak védett refeken fut, egy nem védett branch
# pipeline-jának jobjai elakadnak ("stuck"), és a pipeline-kapu csak időkorláttal állna le.
# A mintákat a GitLab API-ból veszi (`protected_branches`), repófüggő érték nincs benne.
#
# Használat: bash check-protected-ref.sh <branch-név> [--info]
#
# Kapcsoló (config.md "PIPELINE_GATE_* kapcsolók", config-value.sh; env felülbírálhatja):
#   PIPELINE_GATE_PROTECTED_REF_CHECK  (warn)  warn — nem védett branchnél figyelmeztet, 0;
#                                              stop — nem védett branchnél 2-es kilépőkód;
#                                              off  — nem ellenőriz.
# --info: a kapcsolótól függetlenül kiírja az eredményt és a mintákat, mindig 0-val tér
# vissza (a wait-for-pipeline.sh 4-es kilépése előtti diagnózishoz).
#
# Kilépőkódok: 0 — védett, vagy nem dönthető el (API-hiba: csak jelez, nem blokkol), vagy
# warn/off/--info; 2 — nem védett, és a mód `stop`; 1 — használati hiba.
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Használat: check-protected-ref.sh <branch-név> [--info]" >&2
  exit 1
fi

BRANCH="$1"
INFO=false
[ "${2:-}" = "--info" ] && INFO=true
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MODE="$(bash "$SCRIPT_DIR/config-value.sh" PIPELINE_GATE_PROTECTED_REF_CHECK warn)"
case "$MODE" in
  warn|stop|off) ;;
  *)
    echo "FIGYELEM: PIPELINE_GATE_PROTECTED_REF_CHECK értéke érvénytelen ($MODE) — visszaesés a szállított alapértékre (warn)." >&2
    MODE=warn
    ;;
esac
if [ "$INFO" = "false" ] && [ "$MODE" = "off" ]; then
  exit 0
fi

ORIGIN_URL="$(git remote get-url origin)"
PROJECT_PATH="$(printf '%s' "$ORIGIN_URL" | sed -E 's#^(https?://[^/]+/|git@[^:]+:)##; s#\.git$##')"
PROJECT_ENC="$(printf '%s' "$PROJECT_PATH" | sed 's#/#%2F#g')"

if ! command -v glab >/dev/null 2>&1 \
  || ! RAW="$(glab api "projects/$PROJECT_ENC/protected_branches?per_page=100" 2>&1)"; then
  echo "FIGYELEM: a védett branch-minták nem kérdezhetők le ($PROJECT_PATH) — az ellenőrzés kimarad." >&2
  exit 0
fi

# A válasz felső szintű objektumainak "name" mezője a minta (a hozzáférési szintekben nincs
# "name" kulcs, csak "access_level_description").
PATTERNS="$(printf '%s' "$RAW" | tr -d '\n' | grep -oE '"name":"[^"]*"' | sed -E 's/^"name":"(.*)"$/\1/' || true)"

MATCH=""
while IFS= read -r PATTERN; do
  [ -z "$PATTERN" ] && continue
  # A GitLab-minta `*` jele bármilyen karaktersort illeszt (a `/`-t is), mint a shell case.
  # shellcheck disable=SC2254
  case "$BRANCH" in
    $PATTERN) MATCH="$PATTERN"; break ;;
  esac
done <<EOF_PATTERNS
$PATTERNS
EOF_PATTERNS

LIST="$(printf '%s' "$PATTERNS" | tr '\n' ' ' | sed 's/ *$//')"
if [ -n "$MATCH" ]; then
  echo "OK: a(z) '$BRANCH' branch védett (minta: $MATCH)."
  exit 0
fi

MSG="a(z) '$BRANCH' branch egyik védett mintára sem illeszkedik (minták: ${LIST:-nincs}). Ha a projekt runnere csak védett refeken fut, a pipeline jobjai el fognak akadni — válassz a mintáknak megfelelő branch-nevet, vagy a projektben védd a mintát."
if [ "$INFO" = "true" ] || [ "$MODE" = "warn" ]; then
  echo "FIGYELEM: $MSG" >&2
  exit 0
fi
echo "HIBA: $MSG" >&2
exit 2
