#!/usr/bin/env sh
# COCALC-232: a dev-workflow csomag tar.gz-ének felépítése a dev-workflow-manifest.json
# alapján — a .gitlab-ci.yml `dev-workflow-publish` job-ja és a
# ci/verify-dev-workflow-publish.sh önellenőrzés közösen használja.
#
# Mit tesz a staging könyvtárba:
#   - a manifest "versioned" listájának minden útvonalát (fájl vagy könyvtár rekurzívan),
#     KIVÉVE a "repo_local_exceptions" listában szereplő konkrét fájlokat (config.md,
#     history.md, .claude/launch.json) — így a repo-lokális, valós értékekkel kitöltött
#     fájlok NEM kerülnek a csomagba, a mellettük élő *.template.md sablonok viszont igen
#     (azok a versioned fa részei, nem kivételek);
#   - a csomag gyökerére: dev-workflow-manifest.json, VERSION, és — ha van — CHANGELOG.md
#     (a telepítő read_package_manifest lépése a manifestet és a VERSION-t elvárja a
#     gyökéren; a CHANGELOG.md-re a MAJOR-figyelmeztetés hivatkozik).
# A "samples" lista (.gitlab-ci.yml, ci/) SZÁNDÉKOSAN kimarad — az a fogyasztó repóé.
#
# A JSON-parser ugyanaz a sortörés-alapú awk-konvenció, mint a
# ci/verify-dev-workflow-manifest.sh / install-or-upgrade.sh extract_json_array-jában
# (nem generikus JSON parser).
#
# Használat:
#   sh ci/build-dev-workflow-archive.sh [--target-dir <repo-gyökér>] [--output <tar.gz>]
# Alapértelmezések: --target-dir = $(pwd), --output = dist/dev-workflow-<VERSION>.tar.gz
set -eu

TARGET_DIR="$(pwd)"
OUTPUT=""

fail() {
  echo "HIBA: $1" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --target-dir)
      [ "$#" -ge 2 ] || fail "--target-dir értéket vár"
      TARGET_DIR="$2"; shift 2 ;;
    --output)
      [ "$#" -ge 2 ] || fail "--output értéket vár"
      OUTPUT="$2"; shift 2 ;;
    *)
      fail "ismeretlen argumentum: $1" ;;
  esac
done

[ -d "$TARGET_DIR" ] || fail "a célkönyvtár nem létezik: $TARGET_DIR"

MANIFEST="$TARGET_DIR/dev-workflow-manifest.json"
[ -f "$MANIFEST" ] || fail "nincs dev-workflow-manifest.json a $TARGET_DIR gyökerén"
[ -f "$TARGET_DIR/VERSION" ] || fail "nincs VERSION a $TARGET_DIR gyökerén"

VERSION="$(cat "$TARGET_DIR/VERSION")"
echo "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' \
  || fail "a VERSION nem semver formátumú: $VERSION"

extract_json_array() {
  # $1: mezőnév — a "<mezőnév>": [ ... ] tömb elemei soronként, idézőjelek nélkül.
  # A sor első "..." páros TARTALMÁT adja vissza (match/substr) — ez busybox awk alatt
  # is robusztus a záró vesszőre, tab helyett bemásolt szóközre és a CRLF `\r`-re
  # (a `gsub(/",?[ \t]*$/,"")` forma busybox awk-kal NEM strippel — COCALC-232 review).
  awk -v field="\"$1\"" '
    $0 ~ field { found=1; next }
    found && /\]/ { found=0; next }
    found && match($0, /"[^"]*"/) {
      s = substr($0, RSTART + 1, RLENGTH - 2)
      if (length(s) > 0) print s
    }
  ' "$MANIFEST"
}

VERSIONED_LIST="$(extract_json_array versioned)"
EXCEPTIONS_LIST="$(extract_json_array repo_local_exceptions)"

[ -n "$VERSIONED_LIST" ] || fail "a manifest 'versioned' listája üres vagy nem olvasható (minifikált JSON?)"

is_exception() {
  # $1: repo-relatív útvonal. ORD-506: a `/`-re végződő bejegyzés könyvtár-kivétel (az
  # installer ORD-384 szemantikája), a többi pontos fájl-egyezés.
  printf '%s\n' "$EXCEPTIONS_LIST" | awk -v p="$1" '
    $0 == "" { next }
    substr($0, length($0)) == "/" { if (index(p, $0) == 1) { found = 1; exit } ; next }
    $0 == p { found = 1; exit }
    END { exit found ? 0 : 1 }'
}

STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

copy_one() {
  # $1: repo-relatív fájl-útvonal.
  # (A `find | while` pipe subshellben fut — ezért nincs itt számláló: nem propagálódna
  #  a fő shellbe. A végső ellenőrzés a staging tényleges tartalmát nézi.)
  rel="$1"
  if is_exception "$rel"; then
    echo "  KIHAGYVA (repo_local_exceptions): $rel"
    return 0
  fi
  mkdir -p "$STAGING/$(dirname "$rel")"
  cp "$TARGET_DIR/$rel" "$STAGING/$rel"
}

echo "dev-workflow csomag építése — VERSION $VERSION, forrás: $TARGET_DIR"
printf '%s\n' "$VERSIONED_LIST" | while IFS= read -r entry; do
  [ -n "$entry" ] || continue
  src="$TARGET_DIR/$entry"
  if [ ! -e "$src" ]; then
    echo "FIGYELEM: a 'versioned' listában szereplő \"$entry\" nem létezik — kihagyva" >&2
    continue
  fi
  if [ -d "$src" ]; then
    find "$src" -type f | while IFS= read -r file; do
      rel="${file#"$TARGET_DIR"/}"
      copy_one "$rel"
    done
  else
    copy_one "$entry"
  fi
done

# A while-ciklus subshellben futott (pipe) — a staging tényleges tartalmából ellenőrzünk.
[ -n "$(find "$STAGING" -type f -print -quit)" ] \
  || fail "a staging könyvtár üres — semmit nem másoltunk a csomagba"

cp "$MANIFEST" "$STAGING/dev-workflow-manifest.json"
cp "$TARGET_DIR/VERSION" "$STAGING/VERSION"
[ -f "$TARGET_DIR/CHANGELOG.md" ] && cp "$TARGET_DIR/CHANGELOG.md" "$STAGING/CHANGELOG.md"

if [ -z "$OUTPUT" ]; then
  OUTPUT="$TARGET_DIR/dist/dev-workflow-${VERSION}.tar.gz"
fi
# Csak POSIX-abszolút (`/...`) vagy relatív `--output` támogatott — a relatívot a hívó
# cwd-jéhez kötjük (nem a staginghez). Windows-drive alakú abszolút út (`C:\...`)
# NEM támogatott: a `:` miatt a GNU tar remote hostként értelmezné (`--force-local`-t
# igényelne, amit a busybox tar viszont nem ismer) — adj relatív vagy POSIX-abszolút utat.
case "$OUTPUT" in
  /*) : ;;
  *) OUTPUT="$(pwd)/$OUTPUT" ;;
esac
mkdir -p "$(dirname "$OUTPUT")"

# A staging már csak a csomagba szánt fájlokat tartalmazza — a teljes tartalmát archiváljuk.
# --force-local: relatív útban esetleg előforduló `:` ne legyen remote host (GNU tar).
# --owner/--group=0: ne szivárogjon build-gépi felhasználónév a tarba (GNU tar); ha
# valamelyik flag nem támogatott (busybox tar), a sima hívásra esünk vissza.
( cd "$STAGING" \
  && { tar --force-local --numeric-owner --owner=0 --group=0 -czf "$OUTPUT" . 2>/dev/null \
       || tar -czf "$OUTPUT" . ; } )

echo "Kész: $OUTPUT"
echo "  csomagolt fájlok: $(tar -tzf "$OUTPUT" | grep -cv '/$')"
