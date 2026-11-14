#!/usr/bin/env bash
# AI-identitású push — az AI GitLab-user (tfss_ai) tokenjével (GITLAB_TOKEN_AI env
# változó) pushol, az 'origin' remote URL-jébe ideiglenesen beágyazott hitelesítéssel —
# a tárolt git-credential-helpert/GITLAB_TOKEN-t nem érinti, csak erre az egy push
# hívásra vonatkozik. Lásd dev-workflow/config.md "AI-identitás" szekció.
#
# Előfeltétel: a tfss_ai GitLab-usernek Developer/Maintainer jogosultsággal tagnak kell
# lennie ebben a projektben, különben a push 403-mal elutasításra kerül.
#
# Használat: bash push-as-ai.sh <branch-név> [extra git push flag-ek]
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Használat: push-as-ai.sh <branch-név> [extra git push flag-ek]" >&2
  exit 1
fi

BRANCH="$1"
shift

# Ha az env-ben nincs, a Dopplerből olvassuk (a projektet/configot a repo gyökerében lévő
# doppler.yaml, ill. a DOPPLER_PROJECT/DOPPLER_CONFIG env var adja) - így a tokent nem kell
# setx-szel vagy fájlban tárolni, a Doppler marad az egyetlen forrása.
if [ -z "${GITLAB_TOKEN_AI:-}" ] && command -v doppler >/dev/null 2>&1; then
  GITLAB_TOKEN_AI="$(doppler secrets get GITLAB_TOKEN_AI --plain 2>/dev/null || true)"
fi

if [ -z "${GITLAB_TOKEN_AI:-}" ]; then
  echo "HIBA: a GITLAB_TOKEN_AI nincs beállítva (sem env változóként, sem a Dopplerben) — az AI GitLab-user" >&2
  echo "personal access tokenje kell bele (api + write_repository scope), lásd" >&2
  echo "dev-workflow/config.md 'AI-identitás' szekció." >&2
  exit 1
fi

ORIGIN_URL="$(git remote get-url origin)"
case "$ORIGIN_URL" in
  https://*)
    AUTHENTICATED_URL="https://oauth2:${GITLAB_TOKEN_AI}@${ORIGIN_URL#https://}"
    ;;
  *)
    echo "HIBA: az origin remote nem https:// URL ($ORIGIN_URL) — ez a szkript csak" >&2
    echo "https remote-hoz készült." >&2
    exit 1
    ;;
esac

git push "$AUTHENTICATED_URL" "$BRANCH" "$@"
