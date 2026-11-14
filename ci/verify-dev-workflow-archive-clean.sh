#!/usr/bin/env sh
# COCALC-232 (review 1. kör): a VALÓS, szállítandó dev-workflow archívum szivárgás-
# ellenőrzése. A ci/verify-dev-workflow-publish.sh A/B/C szekciói szintetikus fixture-t
# használnak (a SZŰRŐLOGIKÁT tesztelik) — ez a szkript ezzel szemben a repo tényleges
# gyökeréből építi meg az archívumot a ci/build-dev-workflow-archive.sh-val, kicsomagolja,
# és a TELJES kicsomagolt fát (beleértve a valódi CHANGELOG.md-t) átvizsgálja:
#
#   - repo-lokális útvonal:  'repos/wordcloud' vagy 'repos\wordcloud'
#   - önálló Jira project key: 'COCALC' bal oldali szó-határral, ha NEM '-<szám>' követi.
#     Megengedett: a 'COCALC-<szám>' citáció-forma (bevezető ticket-hivatkozás, pl.
#     'COCALC-232'). Buktat: önálló 'COCALC' (sor végén / szóköz / írásjel után) és a
#     hibás 'COCALC-<nem-szám>' forma. Nem buktat: nagyobb token belsejében (pl.
#     'MYCOCALCX'). A minta empirikusan ellenőrzött GNU és busybox grep alatt is.
#
# Bármely találat -> nem-nulla exit, a találatok kiírásával. A .gitlab-ci.yml
# `dev-workflow-archive-leak-check` job-ja blokkolóan futtatja (nem csak a manuális
# publish-nál), és a `dev-workflow-publish` is meghívja az upload ELŐTT.
#
# COCALC-320 (kritikus javítás): a ci/ önellenőrző szkriptek egy része (COCALC-320 óta
# a "versioned" fa része, hogy egy fogyasztó repo is megkapja őket — lásd
# dev-workflow-manifest.json) a SAJÁT dokumentációjában/fixture-jeiben szándékosan
# bemutatja a fenti két mintát (pl. ez a fájl maga a "repos/wordcloud" és a bare "COCALC"
# példát idézi a fejléc-kommentjében és a self-check fixture-jeiben) — enélkül az
# allowlist nélkül SAJÁT MAGUKON buknának el, amint a csomag részévé válnak. A
# ci/verify-tracker-mcp-abstraction.sh PERMANENT_ALLOW_SUFFIXES mintáját követi: fix,
# repo-relatív útvonal-suffix lista, nem migrációs (nem várjuk, hogy valaha kikerüljön
# belőle egy elem, mivel ezek a fájlok a szivárgás-ellenőrző ÉLŐ dokumentációi/tesztjei).
PERMANENT_ALLOW_SUFFIXES="ci/verify-dev-workflow-archive-clean.sh ci/verify-dev-workflow-publish.sh ci/verify-skill-portability.sh"

# Használat: sh ci/verify-dev-workflow-archive-clean.sh [--target-dir <repo-gyökér>]
set -eu

TARGET_DIR="$(pwd)"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --target-dir)
      [ "$#" -ge 2 ] || { echo "HIBA: --target-dir értéket vár" >&2; exit 2; }
      TARGET_DIR="$2"; shift 2 ;;
    *)
      echo "HIBA: ismeretlen argumentum: $1" >&2; exit 2 ;;
  esac
done

BUILD_SCRIPT="$TARGET_DIR/ci/build-dev-workflow-archive.sh"
test -f "$BUILD_SCRIPT" || { echo "HIBA: nincs $BUILD_SCRIPT" >&2; exit 2; }

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

ARCHIVE="$WORKDIR/dev-workflow.tar.gz"
EXTRACT="$WORKDIR/extract"
mkdir -p "$EXTRACT"

( cd "$TARGET_DIR" && sh "$BUILD_SCRIPT" --output "$ARCHIVE" ) >/dev/null \
  || { echo "HIBA: a build-dev-workflow-archive.sh nem-nulla exittel állt le" >&2; exit 1; }

tar -xzf "$ARCHIVE" -C "$EXTRACT" \
  || { echo "HIBA: nem sikerült kicsomagolni a felépített archívumot" >&2; exit 1; }

# A grep-kimenet '<EXTRACT>/<relatív út>:sor:...' sorait rövidíti a prefix PONTOS
# (nem regex) levágásával — a $EXTRACT egy mktemp útvonal, aminek a '.'-jai regexben
# „bármely karakter"-ként viselkednének egy sed-mintában.
strip_prefix() {
  printf '%s\n' "$1" | while IFS= read -r line; do
    [ -n "$line" ] || continue
    printf '  %s\n' "${line#"$EXTRACT/"}"
  done
}

# $1: a $EXTRACT-hez képesti relatív útvonal -- igaz (0), ha a PERMANENT_ALLOW_SUFFIXES
# valamelyik eleme a végét adja (suffix-egyezés, a verify-tracker-mcp-abstraction.sh
# mintájára).
is_permanently_allowed() {
  rel="$1"
  for suffix in $PERMANENT_ALLOW_SUFFIXES; do
    case "$rel" in
      *"$suffix") return 0 ;;
    esac
  done
  return 1
}

# $1: nyers grep -rInE kimenet ('<abs-path>:sor:...' soronként) -- kiszűri azokat a
# sorokat, amiknek a fájlja a PERMANENT_ALLOW_SUFFIXES-en szerepel.
filter_permanently_allowed() {
  printf '%s\n' "$1" | while IFS= read -r line; do
    [ -n "$line" ] || continue
    file="${line%%:*}"
    rel="${file#"$EXTRACT/"}"
    is_permanently_allowed "$rel" || printf '%s\n' "$line"
  done
}

leak=0

path_hits="$(filter_permanently_allowed "$(grep -rInE 'repos[/\\]wordcloud' "$EXTRACT" || true)")"
if [ -n "$path_hits" ]; then
  echo "SZIVÁRGÁS — a szállítandó archívum repo-lokális útvonalat tartalmaz:" >&2
  strip_prefix "$path_hits" >&2
  leak=1
fi

# Bare Jira project key: 'COCALC' bal oldali szó-határral, ha NEM '-<szám>' követi.
# Megengedett a 'COCALC-<szám>' citáció (pl. 'COCALC-232'); buktat az önálló 'COCALC'
# és a hibás 'COCALC-<nem-szám>'; nem buktat nagyobb token belsejében (pl. 'MYCOCALCX').
key_hits="$(filter_permanently_allowed "$(grep -rInE '(^|[^A-Za-z0-9])COCALC(-[^0-9]|[^-A-Za-z0-9]|$)' "$EXTRACT" || true)")"
if [ -n "$key_hits" ]; then
  echo "SZIVÁRGÁS — a szállítandó archívum önálló (nem citáció-formájú) Jira project key-t tartalmaz:" >&2
  strip_prefix "$key_hits" >&2
  leak=1
fi

if [ "$leak" -ne 0 ]; then
  echo "verify-dev-workflow-archive-clean: HIBA — a fenti tartalom nem kerülhet a csomagba." >&2
  echo "  Írd át a forrásfájlt (pl. útvonal -> helyőrző, bare key -> 'COCALC-<szám>' citáció)," >&2
  echo "  vagy tedd a manifest 'repo_local_exceptions' listájára, ha repo-lokálisnak szánt." >&2
  exit 1
fi

echo "verify-dev-workflow-archive-clean: OK — a valós archívum nem tartalmaz repo-lokális útvonalat vagy önálló Jira project key-t."
