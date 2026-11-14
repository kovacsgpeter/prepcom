#!/usr/bin/env bash
# AI-identitású push a GITLAB_TOKEN_AI környezeti változóban tárolt tokennel.
# A remote és a felhasználó saját credential-beállításai változatlanok maradnak.
# A repo .gitattributes szabálya ezt a szkriptet Windows checkoutnál is LF-en tartja.
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Használat: push-as-ai.sh <branch-név> [extra git push flag-ek]" >&2
  exit 1
fi

BRANCH="$1"
shift

# Ha az env-ben nincs, a Dopplerből olvassuk (doppler.yaml / DOPPLER_PROJECT+CONFIG).
if [ -z "${GITLAB_TOKEN_AI:-}" ] && command -v doppler >/dev/null 2>&1; then
  GITLAB_TOKEN_AI="$(doppler secrets get GITLAB_TOKEN_AI --plain 2>/dev/null || true)"
fi

if [ -z "${GITLAB_TOKEN_AI:-}" ]; then
  echo "HIBA: a GITLAB_TOKEN_AI nincs beállítva (sem env változóként, sem a Dopplerben)." >&2
  echo "Lásd .agents/skills/dev-workflow/config.md AI-identitás szekcióját." >&2
  exit 1
fi

ORIGIN_URL="$(git remote get-url origin)"
case "$ORIGIN_URL" in
  https://*) AUTHENTICATED_URL="https://oauth2:${GITLAB_TOKEN_AI}@${ORIGIN_URL#https://}" ;;
  *)
    echo "HIBA: az origin remote nem https:// URL ($ORIGIN_URL)." >&2
    exit 1
    ;;
esac

git push "$AUTHENTICATED_URL" "$BRANCH" "$@"
