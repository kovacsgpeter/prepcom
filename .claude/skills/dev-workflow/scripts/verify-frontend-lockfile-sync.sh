#!/usr/bin/env sh
# COCALC-392: az implementer lokal minosegi ellenorzesenek (agents/implementer.md "3.")
# kapuja -- ha a frontend/package.json vagy a frontend/package-lock.json valtozott,
# ellenorzi, hogy a lockfile a CI-ban ELVART npm FOVERZIOVAL szinkronban van-e (a
# `resolve-ci-npm-major.sh` altal beegetes nelkul feloldott ertekkel).
#
# Miert kell ez: az implementer/fejleszto lokal gepen gyakran ujabb npm-mal
# (`npm install`) generalja/frissiti a lockfile-t, mint amit a CI image (node:22 ->
# npm 10) hasznal -- ez `npm ci` EUSAGE hibat okoz a CI-ban (lasd a ticket kontextusat:
# "Missing: chokidar@5.0.0 / readdirp@5.1.1 from lock file"). Ez a szkript ugyanazzal
# az npm fovezioval futtat egy `npm ci --dry-run`-t, mint a CI, meg push elott elkapva a
# szinkronhibat.
#
# Hasznalat: sh verify-frontend-lockfile-sync.sh [--base <git-ref>]   (repo gyokerebol)
#   --base <ref>   a git-diff bazisa a mar commitolt valtozasokhoz (alap:
#                   $DEV_WORKFLOW_DEFAULT_BRANCH vagy origin/master). A munkafa
#                   (uncommitted/staged) valtozasait mindig kulon is nezi, fuggetlenul a
#                   bazistol.
#
# Kilepokodok:
#   0 -- nincs erintett fajl (skip), VAGY a lockfile szinkronban van a CI npm-majorral.
#   1 -- lockfile-szinkron hiba (`npm ci --dry-run` piros) -- BLOCKER, mint egy piros teszt.
#   2 -- az npm-major nem oldhato fel (lasd resolve-ci-npm-major.sh) -- ez sem nema hiba,
#        a hivo felnek jeleznie kell, nem szabad csendben zoldnek tekinteni a kaput.
set -eu

BASE_REF="${DEV_WORKFLOW_DEFAULT_BRANCH:-origin/master}"
while [ $# -gt 0 ]; do
  case "$1" in
    --base)
      BASE_REF="$2"
      shift 2
      ;;
    *)
      echo "verify-frontend-lockfile-sync: ismeretlen argumentum: $1" >&2
      exit 2
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

PKG_JSON="frontend/package.json"
PKG_LOCK="frontend/package-lock.json"

# --- 1. Erintett-e a diff a lockfile-parosat -----------------------------------------
COMMITTED_DIFF="$(git diff --name-only "${BASE_REF}...HEAD" -- "$PKG_JSON" "$PKG_LOCK" 2>/dev/null || true)"
WORKTREE_DIFF="$(git diff --name-only -- "$PKG_JSON" "$PKG_LOCK" 2>/dev/null || true)"
STAGED_DIFF="$(git diff --name-only --cached -- "$PKG_JSON" "$PKG_LOCK" 2>/dev/null || true)"

CHANGED="$(printf '%s\n%s\n%s\n' "$COMMITTED_DIFF" "$WORKTREE_DIFF" "$STAGED_DIFF" | grep -v '^$' || true)"

if [ -z "$CHANGED" ]; then
  echo "verify-frontend-lockfile-sync: OK -- nem valtozott a $PKG_JSON/$PKG_LOCK (kihagyva)."
  exit 0
fi

test -f "$PKG_JSON" || {
  echo "verify-frontend-lockfile-sync: HIBA -- $PKG_JSON hianyzik, pedig a diff erinti." >&2
  exit 1
}
test -f "$PKG_LOCK" || {
  echo "verify-frontend-lockfile-sync: HIBA -- $PKG_LOCK hianyzik, pedig a diff erinti (generald: 'npx npm@<ci-major> install --package-lock-only')." >&2
  exit 1
}

# --- 2. A CI npm fovezioja (beegetes nelkul, resolve-ci-npm-major.sh) ---------------
if ! NPM_MAJOR="$(sh "$SCRIPT_DIR/resolve-ci-npm-major.sh")"; then
  echo "verify-frontend-lockfile-sync: HIBA -- a CI npm fovezioje nem oldhato fel (lasd fent a resolve-ci-npm-major.sh reszletes hibajat). A kapu emiatt NEM tekintheto zoldnek." >&2
  exit 2
fi

echo "verify-frontend-lockfile-sync: CI npm fovezio = $NPM_MAJOR -- 'npm ci --dry-run' futtatasa a frontend/ alatt..."

# --- 3. A tenyleges szinkron-ellenorzes: npm ci --dry-run a CI npm-majoraval --------
LOG_FILE="$(mktemp)"
trap 'rm -f "$LOG_FILE"' EXIT

if (cd frontend && npx -y "npm@${NPM_MAJOR}" ci --dry-run) >"$LOG_FILE" 2>&1; then
  echo "verify-frontend-lockfile-sync: OK -- a lockfile szinkronban van az npm@${NPM_MAJOR}-zal (CI: $NPM_MAJOR)."
  exit 0
fi

echo "verify-frontend-lockfile-sync: HIBA -- a lockfile NEM szinkronban az npm@${NPM_MAJOR}-zal (CI ezzel futtatna 'npm ci'-t):" >&2
tail -n 60 "$LOG_FILE" >&2
echo "verify-frontend-lockfile-sync: javitas -- futtasd: (cd frontend && npx npm@${NPM_MAJOR} install --package-lock-only), majd commitold a frontend/package-lock.json-t." >&2
exit 1
