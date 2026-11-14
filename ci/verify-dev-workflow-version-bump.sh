#!/usr/bin/env sh
# COCALC-232: a dev-workflow csomag verzió-kényszerítő guard-ja. A .gitlab-ci.yml
# `dev-workflow-version-check` job-ja futtatja (blokkoló) — a tényleges logika itt van a
# ci/ alatt, nem inline YAML-ban (mint a ci/verify-test-env-config.sh / test-env-smoke.sh).
#
# Elhasal (nem-nulla exit), ha a dev-workflow-manifest.json "versioned" listájában
# szereplő fájl változott az előző kiadáshoz képest, DE a VERSION nem nőtt. A hibaüzenet
# megmondja, melyik fájl változott és milyen bumpot vár (a CHANGELOG.md MAJOR-kritériumára
# hivatkozva).
#
# "Előző kiadás" = git-alapú bázis (offline, tokenmentes, MR-pipeline-on is működik):
#   - explicit felülírás:  $DEV_WORKFLOW_VERSION_BUMP_BASE_REF  (tetszőleges git ref)
#   - MR-pipeline:          origin/$CI_MERGE_REQUEST_TARGET_BRANCH_NAME
#   - default branch push:  $CI_COMMIT_BEFORE_SHA (ha valós), különben HEAD~1
#   - lokális futás:        $DEV_WORKFLOW_DEFAULT_BRANCH  (alap: origin/master)
# Ha a bázis nem feloldható, vagy nincs rajta VERSION fájl: FIGYELMEZTETÉS + exit 0
# (nem blokkol — pl. nagyon régi history, vagy első kiadás előtti állapot).
#
# Csak a commitált állapotot nézi (git diff a bázis...HEAD között), a working tree-t nem —
# ugyanúgy, ahogy a CI is a pusholt commiton dolgozik.
#
# Használat: sh ci/verify-dev-workflow-version-bump.sh   (repo gyökeréből)
set -eu

MANIFEST="${DEV_WORKFLOW_MANIFEST:-dev-workflow-manifest.json}"

warn_skip() {
  echo "verify-dev-workflow-version-bump: FIGYELMEZTETÉS — $1" >&2
  echo "verify-dev-workflow-version-bump: a verzió-ellenőrzés kihagyva (nem blokkol)." >&2
  exit 0
}

die() {
  echo "verify-dev-workflow-version-bump: HIBA — $1" >&2
  exit 1
}

test -f VERSION || die "nincs VERSION fájl a repo gyökerén"
test -f "$MANIFEST" || die "nincs $MANIFEST a repo gyökerén"

CURRENT_VERSION="$(cat VERSION)"
echo "$CURRENT_VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' \
  || die "a jelenlegi VERSION nem semver formátumú: '$CURRENT_VERSION'"

# --- bázis-ref meghatározása ---------------------------------------------------------
BASE_REF=""
if [ -n "${DEV_WORKFLOW_VERSION_BUMP_BASE_REF:-}" ]; then
  BASE_REF="$DEV_WORKFLOW_VERSION_BUMP_BASE_REF"
elif [ -n "${CI_MERGE_REQUEST_TARGET_BRANCH_NAME:-}" ]; then
  git fetch -q origin "$CI_MERGE_REQUEST_TARGET_BRANCH_NAME" 2>/dev/null || true
  BASE_REF="origin/$CI_MERGE_REQUEST_TARGET_BRANCH_NAME"
elif [ -n "${CI_COMMIT_BRANCH:-}" ] && [ -n "${CI_DEFAULT_BRANCH:-}" ] \
  && [ "$CI_COMMIT_BRANCH" = "$CI_DEFAULT_BRANCH" ]; then
  case "${CI_COMMIT_BEFORE_SHA:-}" in
    ""|0000000000000000000000000000000000000000) BASE_REF="HEAD~1" ;;
    *) BASE_REF="$CI_COMMIT_BEFORE_SHA" ;;
  esac
else
  BASE_REF="${DEV_WORKFLOW_DEFAULT_BRANCH:-origin/master}"
fi

BASE_SHA="$(git rev-parse --verify --quiet "${BASE_REF}^{commit}" || true)"
[ -n "$BASE_SHA" ] || warn_skip "a bázis-ref ('$BASE_REF') nem oldható fel commitra"

BASE_VERSION="$(git show "${BASE_SHA}:VERSION" 2>/dev/null || true)"
[ -n "$BASE_VERSION" ] || warn_skip "a bázison ('$BASE_REF') nincs VERSION fájl"
echo "$BASE_VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' \
  || warn_skip "a bázis VERSION-je nem semver formátumú: '$BASE_VERSION'"

echo "verify-dev-workflow-version-bump: bázis = $BASE_REF ($BASE_SHA), VERSION $BASE_VERSION -> $CURRENT_VERSION"

# --- manifest "versioned" lista (sortörés-alapú awk-parser). A sor első "..." páros
#     TARTALMÁT veszi (match/substr) — busybox awk alatt is robusztus a záró vesszőre és
#     a `\r`-re; a `gsub(/",?[ \t]*$/,"")` forma busybox awk-kal NEM strippel (COCALC-232
#     review-nitpick — a version-check job alpine/git:latest = busybox alatt fut). --------
VERSIONED_LIST="$(
  awk '
    $0 ~ /"versioned"/ { found=1; next }
    found && /\]/ { found=0; next }
    found && match($0, /"[^"]*"/) {
      s = substr($0, RSTART + 1, RLENGTH - 2)
      if (length(s) > 0) print s
    }
  ' "$MANIFEST"
)"
[ -n "$VERSIONED_LIST" ] || die "a $MANIFEST 'versioned' listája üres vagy nem olvasható (minifikált JSON?)"

# --- manifest "repo_local_exceptions" lista — ugyanaz a sortörés-alapú parser. Ezeket a
#     fájlokat (config.md, history.md, .claude/launch.json) a ci/build-dev-workflow-archive.sh
#     is KIHAGYJA a csomagból (is_exception), tehát a változásuk nem érinti a szállított
#     csomag tartalmát, és nem kíván VERSION-bumpot. Enélkül a check tévesen kérte a bumpot,
#     ha csak a repo-lokális config.md/history.md változott (COCALC-235). A lista lehet üres
#     (nincs die) — egy kivétel nélküli manifestnél ez érvényes állapot.
EXCEPTIONS_LIST="$(
  awk '
    $0 ~ /"repo_local_exceptions"/ { found=1; next }
    found && /\]/ { found=0; next }
    found && match($0, /"[^"]*"/) {
      s = substr($0, RSTART + 1, RLENGTH - 2)
      if (length(s) > 0) print s
    }
  ' "$MANIFEST"
)"

# ORD-506: a `/`-re végződő bejegyzés könyvtár-kivétel (az installer ORD-384 szemantikája):
# az alatta lévő minden útvonal repó-lokális; a többi bejegyzés pontos fájl-egyezés.
is_exception_path() {
  p="$1"
  printf '%s\n' "$EXCEPTIONS_LIST" | while IFS= read -r e; do
    [ -n "$e" ] || continue
    case "$e" in
      */) case "$p" in "$e"*) echo yes; break ;; esac ;;
      *)  [ "$p" = "$e" ] && { echo yes; break; } ;;
    esac
  done
}

is_versioned_path() {
  p="$1"
  # repo_local_exceptions: pontos útvonal-egyezés — kivétel, nem számít 'versioned'-nek.
  [ -n "$(is_exception_path "$p")" ] && return 0
  printf '%s\n' "$VERSIONED_LIST" | while IFS= read -r v; do
    [ -n "$v" ] || continue
    case "$v" in
      */) case "$p" in "$v"*) echo yes; break ;; esac ;;
      *)  [ "$p" = "$v" ] && { echo yes; break; } ;;
    esac
  done
}

# --- változott versioned fájlok a bázis és a HEAD között ----------------------------
CHANGED="$(git diff --name-only "${BASE_SHA}...HEAD" || true)"

CHANGED_VERSIONED=""
if [ -n "$CHANGED" ]; then
  # POSIX: a while-t nem pipe-oljuk (subshell), hanem here-string helyett ideiglenes fájl.
  TMP_CHANGED="$(mktemp)"
  trap 'rm -f "$TMP_CHANGED"' EXIT
  printf '%s\n' "$CHANGED" > "$TMP_CHANGED"
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    if [ -n "$(is_versioned_path "$f")" ]; then
      CHANGED_VERSIONED="$CHANGED_VERSIONED$f
"
    fi
  done < "$TMP_CHANGED"
fi

if [ -z "$CHANGED_VERSIONED" ]; then
  echo "verify-dev-workflow-version-bump: OK — a bázis óta nem változott 'versioned' fájl, VERSION-bump nem kötelező."
  exit 0
fi

# --- semver összehasonlítás: CURRENT szigorúan nagyobb legyen, mint BASE ------------
version_gt() {
  # 0 (igaz), ha $1 > $2 mint MAJOR.MINOR.PATCH
  a="$1"; b="$2"
  a_ma=${a%%.*}; a_r=${a#*.}; a_mi=${a_r%%.*}; a_pa=${a_r#*.}
  b_ma=${b%%.*}; b_r=${b#*.}; b_mi=${b_r%%.*}; b_pa=${b_r#*.}
  [ "$a_ma" -gt "$b_ma" ] && return 0
  [ "$a_ma" -lt "$b_ma" ] && return 1
  [ "$a_mi" -gt "$b_mi" ] && return 0
  [ "$a_mi" -lt "$b_mi" ] && return 1
  [ "$a_pa" -gt "$b_pa" ] && return 0
  return 1
}

if version_gt "$CURRENT_VERSION" "$BASE_VERSION"; then
  echo "verify-dev-workflow-version-bump: OK — 'versioned' fájl változott ÉS a VERSION nőtt ($BASE_VERSION -> $CURRENT_VERSION)."
  exit 0
fi

{
  echo "verify-dev-workflow-version-bump: HIBA — a dev-workflow csomag verziója nem nőtt,"
  echo "  pedig a(z) $MANIFEST 'versioned' listájában szereplő fájl(ok) változott(ak) a"
  echo "  bázishoz ('$BASE_REF') képest:"
  printf '%s' "$CHANGED_VERSIONED" | sed 's/^/    - /'
  echo "  Jelenlegi VERSION:        $CURRENT_VERSION"
  echo "  Előző kiadás VERSION-je:  $BASE_VERSION"
  echo
  echo "  Emelj legalább PATCH-et a VERSION fájlban. Ha a változás egy kapcsoló/flag"
  echo "  ÁTNEVEZÉSE vagy MEGSZŰNÉSE, vagy egy új KÖTELEZŐ config.md mező bevezetése,"
  echo "  akkor MAJOR-t emelj — lásd CHANGELOG.md \"Mi számít MAJOR változásnak\" szekció."
} >&2
exit 1
