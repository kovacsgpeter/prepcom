#!/usr/bin/env bash
# Bármely glab alparancs futtatása a tfss_ai GitLab-user tokenjével, kizárólag erre az
# egy hívásra. Használható MR-kommenthez és Draft Notes API hívásokhoz is.
# A repo .gitattributes szabálya ezt a szkriptet Windows checkoutnál is LF-en tartja.
#
# Ha a GitLab rate limitet (429) jelez, a hívást lineáris visszalépéssel újrapróbálja —
# egy elutasított kérés nem hajtódott végre, ezért az újrapróbálás írásnál (komment,
# draft note) is biztonságos. A két kapcsoló a config.md "GitLab-API terhelés" táblájából
# jön (config-value.sh), a környezeti változó egyszeri felülbírálás:
#   GITLAB_RATE_LIMIT_RETRIES           (5)   újrapróbálások száma; 0 = nincs újrapróbálás
#   GITLAB_RATE_LIMIT_BACKOFF_SECONDS   (20)  az n-edik újrapróbálás előtt n×ennyit vár
# Minden más hibánál (és kimerült újrapróbálásnál) a glab eredeti kimenete és kilépőkódja
# változatlanul megy tovább.
set -euo pipefail

# Ha az env-ben nincs, a Dopplerből olvassuk (doppler.yaml / DOPPLER_PROJECT+CONFIG).
if [ -z "${GITLAB_TOKEN_AI:-}" ] && command -v doppler >/dev/null 2>&1; then
  GITLAB_TOKEN_AI="$(doppler secrets get GITLAB_TOKEN_AI --plain 2>/dev/null || true)"
fi

if [ -z "${GITLAB_TOKEN_AI:-}" ]; then
  echo "HIBA: a GITLAB_TOKEN_AI nincs beállítva (sem env változóként, sem a Dopplerben)." >&2
  echo "Lásd .agents/skills/dev-workflow/config.md AI-identitás szekcióját." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Fallback-szabály (config.md): nem nemnegatív egész érték -> szállított alapérték.
cfg_number() {  # $1: kapcsoló, $2: alapérték
  _val="$(bash "$SCRIPT_DIR/config-value.sh" "$1" "$2")"
  case "$_val" in
    ''|*[!0-9]*)
      echo "FIGYELEM: $1 értéke érvénytelen — visszaesés a szállított alapértékre ($2)." >&2
      _val="$2"
      ;;
  esac
  printf '%s' "$_val"
}

RETRIES="$(cfg_number GITLAB_RATE_LIMIT_RETRIES 5)"
BACKOFF="$(cfg_number GITLAB_RATE_LIMIT_BACKOFF_SECONDS 20)"

TMPD="$(mktemp -d)"
trap 'rm -rf "$TMPD"' EXIT

ATTEMPT=0
while :; do
  RC=0
  GITLAB_TOKEN="$GITLAB_TOKEN_AI" glab "$@" >"$TMPD/out" 2>"$TMPD/err" || RC=$?

  if [ "$RC" -ne 0 ] \
    && [ "$ATTEMPT" -lt "$RETRIES" ] \
    && cat "$TMPD/out" "$TMPD/err" | grep -Eqi 'rate limit|too many requests|retry later|(^|[^0-9])429([^0-9]|$)'; then
    ATTEMPT=$((ATTEMPT + 1))
    WAIT=$((BACKOFF * ATTEMPT))
    echo "INFO: a GitLab rate limitet jelzett (429) — ${WAIT} mp várakozás, újrapróbálás ${ATTEMPT}/${RETRIES}." >&2
    sleep "$WAIT"
    continue
  fi

  cat "$TMPD/out"
  cat "$TMPD/err" >&2
  exit "$RC"
done
