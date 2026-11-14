#!/usr/bin/env bash
# Egy config-kapcsoló értéke a központi dev-workflow/config.md-ből — hogy a szkriptek a
# számokat (poll-intervallum, újrapróbálás, korlátok) maguk olvassák ki, és a konfig
# módosításához elég egyetlen helyen, a config.md-ben átírni az értéket.
#
# Használat: bash config-value.sh <KAPCSOLÓ> <alapérték>
#
# Feloldási sorrend (az első találat nyer):
#   1. a <KAPCSOLÓ> nevű környezeti változó, ha be van állítva és nem üres — egyszeri,
#      futásra szóló felülbírálás (pl. `PIPELINE_GATE_POLL_SECONDS=10 bash ...`);
#   2. a config.md `Kapcsoló` / `Változó` fejlécű táblájának az a sora, amelynek első
#      cellájában a <KAPCSOLÓ> szerepel backtickben; az értéke a 2. cella. Egy ilyen sor
#      csak akkor explicit érték, ha a közvetlenül következő táblasor első cellája NEM
#      üres: ha a kulcssort üres első cellás folytatósor követi, a sor értékfelsorolás
#      (a lehetséges értékek leírása), nem beállított érték — a keresés folytatódik;
#   3. a config.md preset-táblájának (`Egyedi kapcsoló` fejléc) a WORKFLOW_PROFILE
#      szerinti oszlopa (a profil: a WORKFLOW_PROFILE env, különben az explicit
#      WORKFLOW_PROFILE sor, érvénytelen/hiányzó érték esetén `balanced`). Csak az a
#      cella érték, amely pontosan egy backticked tokent tartalmaz; a `*(nincs)*`,
#      a `lásd ...` és a nyilas cellák nem érték;
#   4. az <alapérték> (a szkript beégetett, szállított alapértéke).
# A config.md helye: $DEV_WORKFLOW_CONFIG, különben a szkript melletti ../config.md.
# Hiányzó/olvashatatlan config.md nem hiba — az <alapérték> lép életbe.
#
# Az értéket CSAK kiolvassa, nem validálja: a típus-ellenőrzés és a fallback-szabály
# (érvénytelen érték -> szállított alapérték) a hívó szkript dolga.
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Használat: config-value.sh <KAPCSOLÓ> <alapérték>" >&2
  exit 2
fi

KEY="$1"
DEFAULT="$2"

case "$KEY" in
  ''|[0-9]*|*[!A-Za-z0-9_]*)
    echo "HIBA: érvénytelen kapcsoló-név: '$KEY'" >&2
    exit 2
    ;;
esac

ENV_VALUE="${!KEY:-}"
if [ -n "$ENV_VALUE" ]; then
  printf '%s\n' "$ENV_VALUE"
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${DEV_WORKFLOW_CONFIG:-$SCRIPT_DIR/../config.md}"

# Az awk két módban fut: MODE=explicit (Kapcsoló/Változó táblák, felsorolás-sor
# kihagyásával) és MODE=preset (az `Egyedi kapcsoló` tábla PROFILE oszlopa).
read_config() {
  awk -v K="$1" -v MODE="$2" -v PROFILE="${3:-balanced}" '
    function trim(s){ gsub(/^[ \t\r]+/, "", s); gsub(/[ \t\r]+$/, "", s); return s }
    function first_tick(s){ if (match(s, /`[^`]+`/)) return substr(s, RSTART + 1, RLENGTH - 2); return "" }
    function is_sep(l){ return (l ~ /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/) }
    function cells(l, arr,   t){ t = trim(l); sub(/^\|/, "", t); sub(/\|[ \t]*$/, "", t); return split(t, arr, "|") }
    {
      if (done) next
      line = $0; sub(/\r$/, "", line)
      # Függő jelölt: a következő sor dönti el, explicit érték vagy felsorolás.
      if (pend) {
        enumeration = 0
        if (line ~ /^[ \t]*\|/) {
          cells(line, nc)
          if (trim(nc[1]) == "") enumeration = 1
        }
        pend = 0
        if (!enumeration) { print pval; done = 1; next }
      }
      if (is_sep(line) && prev ~ /^[ \t]*\|/) {
        n = cells(prev, hc); c1 = trim(hc[1]); gsub(/`/, "", c1)
        in_kt = (MODE == "explicit" && (c1 == "Változó" || c1 == "Kapcsoló"))
        in_pt = 0
        if (MODE == "preset" && c1 == "Egyedi kapcsoló") {
          for (i = 2; i <= n; i++) {
            h = trim(hc[i]); gsub(/`/, "", h)
            if (h == PROFILE) { pcol = i; in_pt = 1 }
          }
        }
        prev = line; next
      }
      if (in_kt && line ~ /^[ \t]*\|/) {
        cells(line, cc)
        if (first_tick(cc[1]) == K) {
          pval = first_tick(cc[2]); if (pval == "") pval = trim(cc[2])
          pend = 1
        }
      } else if (in_kt) {
        in_kt = 0
      }
      if (in_pt && line ~ /^[ \t]*\|/) {
        cells(line, cc)
        if (first_tick(cc[1]) == K) {
          cell = trim(cc[pcol])
          if (cell ~ /^`[^`]+`$/) print substr(cell, 2, length(cell) - 2)
          done = 1
        }
      } else if (in_pt) {
        in_pt = 0
      }
      prev = line
    }
    END { if (pend && !done) print pval }
  ' "$CONFIG_FILE" 2>/dev/null || true
}

if [ -r "$CONFIG_FILE" ]; then
  FILE_VALUE="$(read_config "$KEY" explicit)"
  if [ -z "$FILE_VALUE" ] && [ "$KEY" != "WORKFLOW_PROFILE" ]; then
    PROFILE="${WORKFLOW_PROFILE:-}"
    [ -n "$PROFILE" ] || PROFILE="$(read_config WORKFLOW_PROFILE explicit)"
    case "$PROFILE" in
      cheap|balanced|genius) ;;
      *) PROFILE=balanced ;;
    esac
    FILE_VALUE="$(read_config "$KEY" preset "$PROFILE")"
  fi
  if [ -n "$FILE_VALUE" ]; then
    printf '%s\n' "$FILE_VALUE"
    exit 0
  fi
fi

printf '%s\n' "$DEFAULT"
