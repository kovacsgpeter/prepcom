#!/usr/bin/env sh
# COCALC-257 (ENV-1): a lokalis kornyezet-izolacio klononkenti port-offsetjenek
# EGYETLEN aritmetikai forrasa. A repo gyoker KONYVTARNEVEBOL vezeti le a
# WORKFLOW_INSTANCE erteket (N), es ebbol a harom lokalis portot:
#
#   frontend dev-szerver  : 4201 + N
#   backend (local profil): 8081 + N
#   Karma                 : 9876 + N
#
# N = 0 eseten pontosan a mai portok (4201 / 8081 / 9876).
#
# A konyvtarnev -> N lekepezes a .claude/skills/dev-workflow/config.md
# "LOCAL_ENV_ISOLATION ertekek" szekcio WORKFLOW_INSTANCE tablajabol van IDE DUPLIKALVA
# (a szkript nem olvas markdownt futasidoben -- ugyanaz az ok, mint a commit-as-ai.sh /
# resolve-executor-level.sh beegetett konstansainal). Ha a config.md tablaja bovul (uj
# klon), ezt a `case`-t is boviteni kell; a ci/verify-local-env-isolation-config.sh
# kereszt-ellenorzi a kettot.
#
# Kimenet (stdout, eval-elheto KULCS=ERTEK sorok):
#   WORKFLOW_INSTANCE=<N>
#   FRONTEND_DEV_PORT=<4201+N>
#   LOCAL_BACKEND_PORT=<8081+N>
#   KARMA_PORT=<9876+N>
#
# Kilepokodok:
#   0  siker (ismeretlen konyvtarnev eseten is: stderr-figyelmeztetes + N=0, NEM blokkol)
#   2  nem git-munkafabol hivtak es a $PWD sem hasznalhato
#   3  N > 98 -- a frontend dev-port (4201+N) belelogna a candidate env 4300-4399 savjaba
#
# Hasznalat (a munkafan belul barhonnan):
#   eval "$(sh .claude/skills/dev-workflow/scripts/resolve-workflow-instance.sh)"
#
# Teszt-seam-ek (CSAK teszteleshez -- eles hivasnal egyiket sem adjuk meg):
#   - elso argumentum: a basename helyett hasznalt konyvtarnev-feluliras (a
#     ci/verify-local-env-isolation-config.sh ezzel jarja be a lekepezes/fallback agakat).
#   - WORKFLOW_INSTANCE_OVERRIDE env-valtozo: ha be van allitva es nemnegativ egesz, azt
#     hasznaljuk N-kent, a `case`-t (es a konyvtarnev-feloldast) kihagyva -- igy az
#     N>98 -> exit 3 ag CI-bol is kivalthato, amit a lekepezes maga sosem adna.
set -eu

if [ -n "${WORKFLOW_INSTANCE_OVERRIDE:-}" ]; then
  case "$WORKFLOW_INSTANCE_OVERRIDE" in
    *[!0-9]*|"")
      echo "resolve-workflow-instance: WORKFLOW_INSTANCE_OVERRIDE='$WORKFLOW_INSTANCE_OVERRIDE' nem nemnegativ egesz -- figyelmen kivul hagyom." >&2
      ;;
    *)
      N="$WORKFLOW_INSTANCE_OVERRIDE"
      ;;
  esac
fi

if [ -z "${N:-}" ]; then
  ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  [ -n "$ROOT" ] || ROOT="$(pwd 2>/dev/null || true)"
  if [ -z "$ROOT" ]; then
    echo "resolve-workflow-instance: nem hatarozhato meg a repo gyokere (nem git-munkafa es a \$PWD sem olvashato)" >&2
    exit 2
  fi

  DIRNAME="${1:-$(basename "$ROOT")}"

  case "$DIRNAME" in
    wordcloud)       N=0 ;;
    wordcloud-codex) N=1 ;;
    *)
      echo "resolve-workflow-instance: a(z) '$DIRNAME' klon-konyvtarnev nincs a config.md WORKFLOW_INSTANCE tablajaban -- 0-as instance-szal folytatom. Vegyel fel egy sort a tablaba, ha ez tartos klon." >&2
      N=0
      ;;
  esac
fi

if [ "$N" -gt 98 ]; then
  echo "resolve-workflow-instance: WORKFLOW_INSTANCE=$N > 98 -- a frontend dev-port ($((4201 + N))) belelogna a candidate env 4300-4399 savjaba (COCALC-245). Allits be <=98 instance-t a config.md tablajaban." >&2
  exit 3
fi

echo "WORKFLOW_INSTANCE=$N"
echo "FRONTEND_DEV_PORT=$((4201 + N))"
echo "LOCAL_BACKEND_PORT=$((8081 + N))"
echo "KARMA_PORT=$((9876 + N))"
