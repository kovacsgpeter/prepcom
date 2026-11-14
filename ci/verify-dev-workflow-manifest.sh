#!/usr/bin/env sh
# COCALC-231 önellenőrzés: a dev-workflow csomag-határának (dev-workflow-manifest.json)
# és a semver verzió-manifestnek (VERSION) a formai/konzisztencia-szabályai.
set -eu

# --- 1. VERSION létezik és pontosan a semver mintát követi ---
test -f VERSION
version=$(cat VERSION)
echo "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'

# --- 2. dev-workflow-manifest.json létezik és a mezők kiolvashatók ---
test -f dev-workflow-manifest.json

manifest="dev-workflow-manifest.json"

extract_json_array() {
  # $1: mezőnév — kinyeri a JSON tömb elemeit soronként, idézőjelek nélkül.
  # Egyszerű, sortörés-alapú JSON-nak feltételezi a manifestet (nem generikus parser).
  awk -v field="\"$1\"" '
    $0 ~ field { found=1; next }
    found && /\]/ { found=0; next }
    found {
      gsub(/^[ \t]*"/, "");
      gsub(/",?[ \t]*$/, "");
      if (length($0) > 0) print
    }
  ' "$manifest"
}

# A sortörés-alapú awk-parser csendben üres listát ad vissza, ha a manifest valaha
# minifikált/egysoros JSON-ná formázódna — ez a check különbözteti meg a "valóban üres
# tömb a JSON-ban" esetet a "parser nem talált semmit, pedig kellett volna" esettől: ha a
# mező neve szerepel a manifestben, de a kinyert lista üres, az hiba, nem csendes siker.
require_non_empty_if_field_present() {
  # $1: mezőnév, $2: a hozzá tartozó, extract_json_array-jal már kinyert lista
  field="$1"
  list="$2"
  if [ -z "$list" ] && grep -Fq "\"$field\"" "$manifest"; then
    echo "MANIFEST_PARSE_EMPTY: \"$field\" mező szerepel a manifestben, de a kinyert lista üres (a parser nem talált soronkénti JSON-tömböt — lásd formázás)" >&2
    exit 1
  fi
}

versioned_list=$(extract_json_array "versioned")
repo_local_exceptions_list=$(extract_json_array "repo_local_exceptions")
samples_list=$(extract_json_array "samples")
seed_once_list=$(extract_json_array "seed_once")

require_non_empty_if_field_present "versioned" "$versioned_list"
require_non_empty_if_field_present "repo_local_exceptions" "$repo_local_exceptions_list"
require_non_empty_if_field_present "samples" "$samples_list"
require_non_empty_if_field_present "seed_once" "$seed_once_list"

# --- 3. minden "versioned" útvonal ténylegesen létezik a repóban ---
printf '%s\n' "$versioned_list" | while IFS= read -r path; do
  test -e "$path" || { echo "MANIFEST_PATH_MISSING(versioned): $path" >&2; exit 1; }
done

# --- 3b. "versioned" könyvtár-bejegyzés KÖTELEZŐEN záró '/'-rel (konvenció) ---
# Enélkül az isVersionedPath (.claude/tools/changelog/lib/manifest.js), a telepítő és az
# archívum-építő pontos fájl-egyezésként kezelné, és egyetlen, a könyvtár alatti fájlra
# sem találna. A "könyvtárnak látszik" heurisztika: nincs záró '/', ÉS a basename-ben
# nincs pont (nincs kiterjesztése — az AGENTS.md-szerű fájl-bejegyzések átmennek).
printf '%s\n' "$versioned_list" | while IFS= read -r path; do
  [ -n "$path" ] || continue
  case "$path" in
    */) continue ;;
  esac
  base=${path##*/}
  case "$base" in
    ?*.?*) continue ;;
  esac
  echo "MANIFEST_DIR_NO_SLASH(versioned): '$path' — könyvtár-bejegyzésnek látszik, de nincs záró '/'; vedd fel '$path/' alakban" >&2
  exit 1
done

# --- 4. minden "repo_local_exceptions" útvonal ténylegesen létezik a repóban ---
printf '%s\n' "$repo_local_exceptions_list" | while IFS= read -r path; do
  test -e "$path" || { echo "MANIFEST_PATH_MISSING(repo_local_exceptions): $path" >&2; exit 1; }
done

# --- 5. egyik "samples" elem sincs benne a "versioned" tömbben ---
printf '%s\n' "$samples_list" | while IFS= read -r sample; do
  if printf '%s\n' "$versioned_list" | grep -Fxq "$sample"; then
    echo "SAMPLE_IN_VERSIONED: $sample" >&2
    exit 1
  fi
done

# --- 6. minden "seed_once" célhoz van *.template.* megfelelője, a "versioned" fa részeként
#     (COCALC-320, AC9). A cél -> sablon névleképezés (stem/ext-split, ".template." beszúrva
#     a kiterjesztés elé) UGYANAZT a konvenciót követi, mint az install-or-upgrade.sh
#     (generalizált) template_rel_for()-ja — a kettőt kézzel kell szinkronban tartani
#     (mint a resolve-*.sh duplikált konstansoknál máshol a repóban). ---
seed_once_template_name() {
  # $1: seed_once cél repo-relatív útvonala (pl. ".gitlab-ci.yml")
  target="$1"
  base=${target##*/}
  dir=${target%/*}
  [ "$dir" = "$target" ] && dir="."
  case "$base" in
    *.*)
      ext=${base##*.}
      stem=${base%.*}
      # Rejtett dotfile "valódi" kiterjesztés nélkül (pl. ".gitignore") -- a stem üres
      # maradna, ez nem támogatott sablon-alak.
      [ -n "$stem" ] || { printf ''; return 0; }
      if [ "$dir" = "." ]; then
        printf '%s.template.%s' "$stem" "$ext"
      else
        printf '%s/%s.template.%s' "$dir" "$stem" "$ext"
      fi
      ;;
    *)
      printf ''
      ;;
  esac
}

# $1: útvonal -- igaz (0), ha explicit fájlként szerepel a "versioned" listában, vagy egy
# "versioned" könyvtár-bejegyzés (záró '/') alá esik.
is_in_versioned() {
  needle="$1"
  printf '%s\n' "$versioned_list" | grep -Fxq "$needle" && return 0
  printf '%s\n' "$versioned_list" | grep '/$' | while IFS= read -r vdir; do
    case "$needle" in
      "$vdir"*) echo MATCH ;;
    esac
  done | grep -q MATCH
}

printf '%s\n' "$seed_once_list" | while IFS= read -r target; do
  [ -n "$target" ] || continue
  tmpl="$(seed_once_template_name "$target")"
  if [ -z "$tmpl" ]; then
    echo "SEED_ONCE_NO_TEMPLATE_NAME: '$target' — nincs (felismerhető) kiterjesztése, nem vezethető le a sablon-neve" >&2
    exit 1
  fi
  test -e "$tmpl" || { echo "SEED_ONCE_TEMPLATE_MISSING: '$target' -> a várt sablon ('$tmpl') nem létezik a repóban" >&2; exit 1; }
  is_in_versioned "$tmpl" \
    || { echo "SEED_ONCE_TEMPLATE_NOT_VERSIONED: a(z) '$tmpl' sablon (a(z) '$target' seed_once célhoz) nincs a manifest 'versioned' listájában" >&2; exit 1; }
done

echo "verify-dev-workflow-manifest: OK"
