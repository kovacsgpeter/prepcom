#!/usr/bin/env bash
# dev-workflow-execute — A5 branch-létrehozás determinisztikus (nulla ítéletet igénylő)
# része. A hívó skillnek/LLM-nek ELŐTTE le kell zárnia a stash-döntést (git stash -u,
# ha kellett) — ez a szkript szándékosan NEM dönt erről, csak ellenőrzi, hogy a munkafa
# tiszta-e, és leáll, ha nem az.
#
# Használat:
#   bash create-feature-branch.sh <base_branch> <new_branch_name>
#
# Mit csinál (ebben a sorrendben, hibánál azonnal megáll):
#   1. Ellenőrzi, hogy a munkafa tiszta-e (nincs commitolatlan módosítás).
#   2. Checkoutolja az alap branch-et.
#   3. Fast-forward-only pull-t futtat rajta (ha nem FF, megáll — nem force-ol).
#   4. Létrehozza és checkoutolja az új branch-et az alap branch friss állapotából.

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Használat: create-feature-branch.sh <base_branch> <new_branch_name>" >&2
  exit 1
fi

BASE_BRANCH="$1"
NEW_BRANCH="$2"

if [ -n "$(git status --porcelain)" ]; then
  echo "HIBA: nem commitolt/stash-elt módosítás van a munkafában — a hívó félnek ezt" >&2
  echo "előbb le kellett volna kezelnie (git stash -u vagy commit), a szkript emiatt" >&2
  echo "szándékosan nem folytatja." >&2
  exit 1
fi

git checkout "$BASE_BRANCH"
git pull --ff-only origin "$BASE_BRANCH"
git checkout -b "$NEW_BRANCH"

echo "OK: '$NEW_BRANCH' branch létrehozva és checkoutolva a friss '$BASE_BRANCH'-ről."
