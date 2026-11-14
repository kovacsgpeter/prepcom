#!/usr/bin/env sh
# COCALC-237: a repo-lokális dev-workflow `config.md` és a csomagban szállított
# `config.template.md` közötti automatikus KULCS-összefésülés — az upgrade-kor beszúrja
# az új kapcsolókat az alapértékükkel, a már kitöltött értékeket bitre változatlanul
# hagyja, a megszűnt kulcsokat NEM törli (csak listázza), az átnevezett kulcsokat pedig
# — explicit hint mellett — migrálja, hint nélkül kézi beavatkozást kér.
#
# A "gépi olvashatóság" megvalósítása: a meglévő Markdown-táblák parse-olása (formátum-
# váltás nélkül) — a döntés és a 3 mérlegelt út a `.claude/skills/dev-workflow/history.md`
# "config.md gépi olvashatóság — formátum-döntés (2026-08-28, COCALC-237)" szekciójában.
#
# KULCS-HORDOZÓ tábla: az a Markdown-tábla, amelynek fejléc-első-oszlopa (backtick nélkül,
# trimmelve) pontosan `Változó`, `Kapcsoló` vagy `Egyedi kapcsoló`. A kulcs az első cella
# első backtick-tokene; az alapérték `Változó`/`Kapcsoló` táblánál a 2. cella backtick-
# tokene, `Egyedi kapcsoló` (a WORKFLOW_PROFILE preset-tábla) esetén a `balanced` fejlécű
# oszlopé. Minden más tábla (Jira transition-gráf, issue-type map, `Érték | Jelentés` stb.)
# NEM kulcs-forrás.
#
# ÁTNEVEZÉS-HINT konvenció (MAJOR bumpnál, a csomag-karbantartó teszi a template-be):
#   <!-- dev-workflow:rename REGI_KULCS -> UJ_KULCS since=X.Y.Z -->
# Ezt a szkript a (verziózott) sablon-fájlból grep-eli; ha REGI eltűnt a sablonból és UJ
# megjelent, a REGI sorából kiolvasott élő értéket átírja UJ sorába — egyetlen bejegyzés.
# A hint FORMÁTUMA kötött: kötelező a `dev-workflow:rename` prefix és az ASCII `->` nyíl
# (a Unicode `→` NEM támogatott, szándékosan — a sablon máshol előforduló `X -> Y` alakú
# HTML-kommentre a minta így sem talál, mert a `rename` kulcsszóhoz van kötve); a záró
# `-->` kötelező, a ` since=X.Y.Z` rész opcionális.
#
# BIZONYTALANSÁG -> a hívó telepítő v1 viselkedésére kell visszaesni (`config.md.new` +
# diff, a `config.md` érintetlen). Ezt NEM-NULLA kilépőkóddal jelezzük:
#   0  sikeres összefésülés (VAGY nincs teendő — idempotens no-op)
#   1  bizonytalan / hiba -> a hívó essen vissza a v1 viselkedésre; a <élő-config.md>
#      ilyenkor GARANTÁLTAN nem módosult
#   2  használati hiba (rossz argumentumok)
#
# SORVÉG-MEGŐRZÉS (COCALC-237 review 1. kör, Major 1): a szkript a feldolgozást belül
# LF-normalizált másolaton végzi, de a kiírás előtt visszaállítja a <élő-config.md>
# EREDETI sorvégét — ha a fájl CRLF sorvégű (Windows, git `core.autocrlf=true`), a
# mergelt kimenet is CRLF lesz, a beszúrt sorokkal együtt. Így egy 1 kulcsos bővítés
# `git diff`-je tényleg 1 sor, nem az egész fájl (CRLF->LF) átírása.
#
# Tényleges összefésüléskor a szkript a <élő-config.md> mellé egy `<élő-config.md>.bak`
# biztonsági másolatot ír (minden tényleges összefésülés előtt újraírja; no-op futáson
# nem keletkezik), majd felülírja a <élő-config.md>-t az összefésült tartalommal.
#
# Használat:
#   sh merge-config-keys.sh <élő-config.md> <sablon.md> [<régi-sablon.md>]
#   sh merge-config-keys.sh --list-keys <fájl>     # diagnosztika: KULCS<TAB>ALAPÉRTÉK<TAB>SZEKCIÓ<TAB>SZIGNATÚRA
# A <régi-sablon.md> (ORD-368, opcionális) a korábban telepített sablon: ha megvan, a
# sablonba ezzel a frissítéssel újonnan került, kulcs nélküli szekciók (pl. `Érték |
# Jelentés` értéktáblák) is beszúródnak. Nélküle a viselkedés a korábbi.
set -eu

usage() {
  echo "Használat: sh merge-config-keys.sh <élő-config.md> <sablon.md> [<régi-sablon.md>]" >&2
  echo "           sh merge-config-keys.sh --list-keys <fájl>" >&2
  exit 2
}

# --- KULCS-listázó: KEY<TAB>DEFAULT<TAB>SECTION<TAB>SIG<TAB>RAWROW ---------------------
list_keys() {
  awk '
    function trim(s){ gsub(/^[ \t\r]+/,"",s); gsub(/[ \t\r]+$/,"",s); return s }
    function strip_ticks(s){ gsub(/`/,"",s); return trim(s) }
    function first_tick(s){ if (match(s, /`[^`]+`/)) return substr(s, RSTART+1, RLENGTH-2); return "" }
    function is_sep(l){ return (l ~ /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/) }
    function split_cells(l, arr,   n,i,tmp){
      tmp=trim(l); sub(/^\|/,"",tmp); sub(/\|[ \t]*$/,"",tmp)
      n=split(tmp, arr, "|")
      for(i=1;i<=n;i++) arr[i]=trim(arr[i])
      return n
    }
    /^#+[ \t]/ { h=$0; sub(/^#+[ \t]+/,"",h); section=trim(h) }
    {
      line=$0
      if (is_sep(line) && prev ~ /^[ \t]*\|/) {
        nc = split_cells(prev, hc)
        c1 = strip_ticks(hc[1])
        in_kt = 0; defcol = 0
        if (c1 == "Változó" || c1 == "Kapcsoló") { in_kt = 1; defcol = 2 }
        else if (c1 == "Egyedi kapcsoló") {
          for (i = 1; i <= nc; i++) if (strip_ticks(hc[i]) == "balanced") defcol = i
          if (defcol > 0) in_kt = 1
        }
        if (in_kt) sig = trim(prev)
        prev = line; next
      }
      if (in_kt && line ~ /^[ \t]*\|/) {
        nc = split_cells(line, cc)
        key = first_tick(cc[1])
        if (key != "") {
          dv = first_tick(cc[defcol])
          if (dv == "") dv = cc[defcol]
          printf "%s\t%s\t%s\t%s\t%s\n", key, dv, section, sig, trim(line)
        }
      } else if (in_kt) {
        in_kt = 0
      }
      prev = line
    }
  ' "$1"
}

# --- egész-szekció beszúrás: a sablon adott szekció-blokkját (cím + magyarázó próza +
#     tábla) beilleszti a WORK-be, a sablonban előtte álló, a WORK-ben is LÉTEZŐ
#     legközelebbi ## / ### szekció után (ORD-368: korábban csak a közvetlenül megelőző
#     szekció jöhetett szóba, így két egymást követő új szekciónál a második bukott). A
#     blokk a szekció-címtől a következő ## / ### címig (vagy EOF-ig) tart. Kilépőkód != 0,
#     ha a sablonban előtte álló szekciók egyike sem található a WORK-ben. --------------
insert_section() {
  _work="$1"; _sec="$2"
  _block="$TMPD/section-block.md"
  _pred="$(
    awk -v SEC="$_sec" '
      function trim(s){ gsub(/^[ \t\r]+/,"",s); gsub(/[ \t\r]+$/,"",s); return s }
      function head(l,   h){ h = l; sub(/^##+[ \t]+/, "", h); return trim(h) }
      NR == FNR { if ($0 ~ /^##+[ \t]/) have[head($0)] = 1; next }
      /^##+[ \t]/ {
        h = head($0)
        if (h == SEC) { print last; exit }
        if (h in have) last = h
      }
    ' "$_work" "$TMPL_LF"
  )"
  [ -n "$_pred" ] || return 1
  awk -v SEC="$_sec" '
    function trim(s){ gsub(/^[ \t\r]+/,"",s); gsub(/[ \t\r]+$/,"",s); return s }
    /^##+[ \t]/ {
      h = $0; sub(/^##+[ \t]+/, "", h); h = trim(h)
      if (grab && h != SEC) { exit }
      if (h == SEC) { grab = 1 }
    }
    grab { print }
  ' "$TMPL_LF" > "$_block"
  [ -s "$_block" ] || return 1
  awk -v PRED="$_pred" -v BLOCK="$_block" '
    function trim(s){ gsub(/^[ \t\r]+/,"",s); gsub(/[ \t\r]+$/,"",s); return s }
    {
      line = $0
      if (line ~ /^##+[ \t]/) {
        h = line; sub(/^##+[ \t]+/, "", h); h = trim(h)
        if (seen_pred && !done) {
          print ""
          while ((getline bl < BLOCK) > 0) print bl
          close(BLOCK)
          done = 1
        }
        if (h == PRED) seen_pred = 1
      }
      print line
    }
    END {
      if (seen_pred && !done) {
        print ""
        while ((getline bl < BLOCK) > 0) print bl
        close(BLOCK)
        done = 1
      }
      if (!done) exit 5
    }
  ' "$_work" > "$_work.tmp" || return 1
  mv "$_work.tmp" "$_work"
}

if [ "$#" -eq 2 ] && [ "$1" = "--list-keys" ]; then
  [ -f "$2" ] || { echo "merge-config-keys: nincs ilyen fájl: $2" >&2; exit 2; }
  list_keys "$2"
  exit 0
fi

[ "$#" -eq 2 ] || [ "$#" -eq 3 ] || usage
LIVE="$1"
TMPL="$2"
OLD_TMPL="${3:-}"
[ "$LIVE" != "--list-keys" ] || usage
[ -f "$LIVE" ] || { echo "merge-config-keys: nincs ilyen fájl: $LIVE" >&2; exit 2; }
[ -f "$TMPL" ] || { echo "merge-config-keys: nincs ilyen fájl: $TMPL" >&2; exit 2; }
[ -z "$OLD_TMPL" ] || [ -f "$OLD_TMPL" ] || { echo "merge-config-keys: nincs ilyen fájl: $OLD_TMPL" >&2; exit 2; }

TMPD="$(mktemp -d)"
trap 'rm -rf "$TMPD"' EXIT
: > "$TMPD/added.sections"

bail() {
  # v1 fallback jelzése — a LIVE garantáltan érintetlen ezen a ponton
  echo "merge-config-keys: $1" >&2
  echo "merge-config-keys: visszaesés a v1 viselkedésre (a hívó telepítő \`config.md.new\` + diff-et készít, a config.md változatlan)." >&2
  exit 1
}

# --- sorvég-detektálás + LF-normalizált munkamásolatok (COCALC-237 review Major 1) -----
# A teljes belső feldolgozás LF-en megy; a végső kiírás előtt visszaállítjuk a LIVE
# eredeti sorvégét, hogy egy CRLF config.md ne íródjon át teljesen LF-re.
# Tudatos döntés: VEGYES LF/CRLF bemenet -> EGYSÉGES CRLF a kimeneten (bármely `\r`
# jelenléte CRLF-nek számít) — egy vegyes sorvégű config eleve rendezetlen, nem
# próbáljuk soronként megőrizni az eredeti keveréket.
LIVE_IS_CRLF=0
if [ "$(tr -cd '\r' < "$LIVE" | wc -c | tr -d ' ')" != "0" ]; then
  LIVE_IS_CRLF=1
fi
LIVE_LF="$TMPD/live.lf.md"
TMPL_LF="$TMPD/tmpl.lf.md"
tr -d '\r' < "$LIVE" > "$LIVE_LF"
tr -d '\r' < "$TMPL" > "$TMPL_LF"

list_keys "$LIVE_LF" > "$TMPD/live.keys"
list_keys "$TMPL_LF" > "$TMPD/tmpl.keys"

cut -f1 "$TMPD/live.keys" | sort -u > "$TMPD/live.names"
cut -f1 "$TMPD/tmpl.keys" | sort -u > "$TMPD/tmpl.names"

[ -s "$TMPD/live.names" ] || bail "a config.md-ből egyetlen kulcs-hordozó tábla sem olvasható ki (fejléc: Változó/Kapcsoló/Egyedi kapcsoló)."
[ -s "$TMPD/tmpl.names" ] || bail "a sablonból egyetlen kulcs-hordozó tábla sem olvasható ki (fejléc: Változó/Kapcsoló/Egyedi kapcsoló)."

comm -13 "$TMPD/live.names" "$TMPD/tmpl.names" > "$TMPD/added.names"    # sablonban van, config.md-ben nincs
comm -23 "$TMPD/live.names" "$TMPD/tmpl.names" > "$TMPD/removed.names"  # config.md-ben van, sablonban nincs

# --- átnevezés-hintek a sablonból ----------------------------------------------------
# Kötött minta: `dev-workflow:rename` prefix + ASCII `->` + kötelező záró `-->`, opcionális
# ` since=X.Y.Z`. Így a sablon máshol előforduló, `rename` nélküli `X -> Y` HTML-komment
# NEM számít hintnek.
: > "$TMPD/renames"
grep -oE '<!--[ ]*dev-workflow:rename[ ]+[A-Za-z0-9_]+[ ]+->[ ]+[A-Za-z0-9_]+([ ]+since=[0-9][0-9.]*)?[ ]*-->' "$TMPL_LF" 2>/dev/null \
  | sed -E 's/.*dev-workflow:rename[ ]+([A-Za-z0-9_]+)[ ]+->[ ]+([A-Za-z0-9_]+).*/\1 \2/' > "$TMPD/rename.hints" || true
while read -r oldk newk; do
  [ -n "${oldk:-}" ] && [ -n "${newk:-}" ] || continue
  if grep -qxF "$oldk" "$TMPD/removed.names" && grep -qxF "$newk" "$TMPD/added.names"; then
    echo "$oldk $newk" >> "$TMPD/renames"
  fi
done < "$TMPD/rename.hints"

if [ -s "$TMPD/renames" ]; then
  awk '{print $1}' "$TMPD/renames" | sort -u > "$TMPD/rename.olds"
  awk '{print $2}' "$TMPD/renames" | sort -u > "$TMPD/rename.news"
  comm -23 "$TMPD/added.names" "$TMPD/rename.news" > "$TMPD/added.names.tmp"; mv "$TMPD/added.names.tmp" "$TMPD/added.names"
  comm -23 "$TMPD/removed.names" "$TMPD/rename.olds" > "$TMPD/removed.names.tmp"; mv "$TMPD/removed.names.tmp" "$TMPD/removed.names"
else
  : > "$TMPD/rename.olds"; : > "$TMPD/rename.news"
fi

# --- hint NÉLKÜLI átnevezés-gyanú: egy szekcióban pontosan 1 új ÉS 1 megszűnt kulcs ----
: > "$TMPD/add.sec"; : > "$TMPD/rem.sec"
while IFS= read -r k; do
  [ -n "$k" ] || continue
  awk -F'\t' -v K="$k" '$1==K{print $3; exit}' "$TMPD/tmpl.keys" >> "$TMPD/add.sec"
done < "$TMPD/added.names"
while IFS= read -r k; do
  [ -n "$k" ] || continue
  awk -F'\t' -v K="$k" '$1==K{print $3; exit}' "$TMPD/live.keys" >> "$TMPD/rem.sec"
done < "$TMPD/removed.names"

SUSP_SECTION=""
while IFS= read -r cntline; do
  [ -n "$cntline" ] || continue
  cnt=$(printf '%s' "$cntline" | awk '{print $1}')
  sec=$(printf '%s' "$cntline" | sed -E 's/^[[:space:]]*[0-9]+[[:space:]]//')
  [ "$cnt" = "1" ] || continue
  rc=$(grep -cxF "$sec" "$TMPD/rem.sec" 2>/dev/null || true)
  if [ "${rc:-0}" = "1" ]; then SUSP_SECTION="$sec"; break; fi
done <<EOF
$(sort "$TMPD/add.sec" | uniq -c)
EOF

if [ -n "$SUSP_SECTION" ]; then
  bail "a(z) \"$SUSP_SECTION\" szekcióban pontosan egy kulcs eltűnt és egy új jelent meg, de nincs hozzá '<!-- dev-workflow:rename RÉGI -> ÚJ -->' hint a sablonban — lehetséges átnevezés, kézi beavatkozás szükséges."
fi

ADDED_CNT=$(grep -cve '^$' "$TMPD/added.names" || true)
REMOVED_CNT=$(grep -cve '^$' "$TMPD/removed.names" || true)
RENAME_CNT=$(grep -cve '^$' "$TMPD/renames" || true)

if [ "${ADDED_CNT:-0}" = "0" ] && [ "${REMOVED_CNT:-0}" = "0" ] && [ "${RENAME_CNT:-0}" = "0" ]; then
  echo "merge-config-keys: nincs kulcs-eltérés a sablon és a config.md között — nincs teendő."
  exit 0
fi

# --- összefésült tartalom felépítése egy munkamásolaton -------------------------------
WORK="$TMPD/work.md"
cp "$LIVE_LF" "$WORK"

# 1) átnevezések: érték-migráció, egyetlen sor a régi kulcs helyén. Egy kulcs több
#    kulcs-hordozó táblában is szerepelhet (dedup) — minden élő előfordulást a hozzá
#    tartozó (azonos szignatúrájú) sablon-sorral cserélünk. A migrált sor a SABLON
#    kulcs-/leírás-celláját kapja, de a RÉGI sor ÉRTÉK-celláját/celláit NYERSEN (COCALC-237
#    review Major 2): `Változó`/`Kapcsoló` táblánál a 2. cella, `Egyedi kapcsoló`
#    (preset) táblánál MINDHÁROM (`cheap`/`balanced`/`genius`) oszlop az élő sorból —
#    így a több-tokenes érték és a felhasználói profilonkénti testreszabás sem csonkul.
while read -r oldk newk; do
  [ -n "${oldk:-}" ] || continue
  # az élő OLDK kulcs-sorai: SIG<TAB>RAWROW
  awk -F'\t' -v K="$oldk" '$1==K{ printf "%s\t%s\n", $4, $5 }' "$TMPD/live.keys" > "$TMPD/ren.oldrows"
  [ -s "$TMPD/ren.oldrows" ] || bail "az átnevezés-migráció ($oldk -> $newk) nem találta a régi kulcs sorát a config.md-ben."
  while IFS="$(printf '\t')" read -r oldsig oldraw; do
    [ -n "${oldraw:-}" ] || continue
    newrow=$(awk -F'\t' -v K="$newk" -v S="$oldsig" '$1==K && $4==S{print $5; exit}' "$TMPD/tmpl.keys")
    newsig="$oldsig"
    if [ -z "$newrow" ]; then
      newrow=$(awk -F'\t' -v K="$newk" '$1==K{print $5; exit}' "$TMPD/tmpl.keys")
      newsig=$(awk -F'\t' -v K="$newk" '$1==K{print $4; exit}' "$TMPD/tmpl.keys")
    fi
    [ -n "$newrow" ] || bail "az átnevezés-migráció ($oldk -> $newk) nem végezhető el: a sablonban nincs sor a(z) $newk kulcshoz."
    # Markdown-escapelt cső (`\|`) bármelyik érintett sorban -> a nyers `|`-re bontás
    # elcsúsztatná az oszlopokat, ezért NEM kockáztatunk: v1 fallback (AC8-konzisztens).
    if printf '%s' "$oldraw$newrow" | grep -qF '\|'; then
      bail "az átnevezés-migráció ($oldk -> $newk) egy Markdown-escapelt csövet (\\|) tartalmazó cellát érintene — a biztonságos oszlop-kezelést nem garantáljuk."
    fi
    migrated=$(awk -v OLDRAW="$oldraw" -v NEWRAW="$newrow" -v SIG="$newsig" '
      BEGIN {
        no = split(OLDRAW, o, "|")
        nn = split(NEWRAW, n, "|")
        preset = (SIG ~ /Egyedi kapcsoló/)
        ok = 0
        if (preset) {
          if (no >= 6 && nn >= 6) { n[3] = o[3]; n[4] = o[4]; n[5] = o[5]; ok = 1 }
        } else {
          if (no >= 4 && nn >= 4) { n[3] = o[3]; ok = 1 }
        }
        if (!ok) exit 7
        out = ""
        for (i = 1; i <= nn; i++) out = out n[i] (i < nn ? "|" : "")
        print out
        exit 0
      }' < /dev/null) || bail "az átnevezés-migráció ($oldk -> $newk) nem tudta egyértelműen kinyerni a régi sor érték-celláját (\"$oldsig\")."
    awk -v OLDRAW="$oldraw" -v MIG="$migrated" '
      { l = $0; sub(/\r$/, "", l); if (l == OLDRAW) { print MIG; replaced = 1 } else print }
      END { if (!replaced) exit 4 }
    ' "$WORK" > "$WORK.tmp" || bail "az átnevezés-migráció ($oldk -> $newk) nem találta a(z) \"$oldsig\" táblában a régi kulcs sorát."
    mv "$WORK.tmp" "$WORK"
  done < "$TMPD/ren.oldrows"
done < "$TMPD/renames"

# 2) új kulcsok beszúrása a megfelelő (szekció + fejléc-szignatúra) táblába.
#    pending sorok: SECTION <TAB> SIG <TAB> RAWROW
: > "$TMPD/pending"
while IFS= read -r k; do
  [ -n "$k" ] || continue
  awk -F'\t' -v K="$k" '$1==K{ printf "%s\t%s\t%s\n", $3, $4, $5; exit }' "$TMPD/tmpl.keys" >> "$TMPD/pending"
done < "$TMPD/added.names"

# Egy pending-fájl fölött végigmegy a WORK-ön, minden kulcs-hordozó tábla végén beszúrja
# a hozzá (szekció + szignatúra) tartozó pending sorokat. Az el nem helyezett sorok
# SECTION-jeit a $2-be írt fájlba gyűjti. Kilépőkód 3, ha maradt elhelyezetlen.
run_inserter() {
  _in="$1"; _unplaced="$2"
  : > "$_unplaced"
  awk -v PEND="$TMPD/pending" -v UNPLACED="$_unplaced" '
    function trim(s){ gsub(/^[ \t\r]+/,"",s); gsub(/[ \t\r]+$/,"",s); return s }
    function is_sep(l){ return (l ~ /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/) }
    function flush(   i){
      for (i = 1; i <= np; i++)
        if (!pu[i] && ps[i] == cursec && pg[i] == cursig) { print pr[i]; pu[i] = 1 }
    }
    BEGIN {
      np = 0
      while ((getline l < PEND) > 0) {
        n = split(l, a, "\t")
        if (n < 3) continue
        np++; ps[np] = a[1]; pg[np] = a[2]; pr[np] = a[3]; pu[np] = 0
      }
      close(PEND)
    }
    /^#+[ \t]/ { h = $0; sub(/^#+[ \t]+/, "", h); cursec = trim(h) }
    {
      line = $0
      if (is_sep(line) && prev ~ /^[ \t]*\|/) { cursig = trim(prev); in_kt = 1; print line; prev = line; next }
      if (in_kt && line !~ /^[ \t]*\|/) { flush(); in_kt = 0; cursig = "" }
      print line; prev = line
    }
    END {
      if (in_kt) flush()
      nu = 0
      for (i = 1; i <= np; i++) if (!pu[i]) { nu++; print ps[i] >> UNPLACED }
      if (nu > 0) exit 3
    }
  ' "$_in"
}

if [ -s "$TMPD/pending" ]; then
  if run_inserter "$WORK" "$TMPD/unplaced" > "$TMPD/work.next"; then
    mv "$TMPD/work.next" "$WORK"
  else
    # A first pass minden meglévő táblába beilleszthető sort már elhelyezett a
    # work.next-ben; ami maradt, az olyan szekció(k)be tartozik, ami a config.md-ben még
    # nem létezik — ezeket EGÉSZ-szekció beszúrással pótoljuk (a magyarázó próza + a
    # teljes tábla, minden új kulcssorával együtt, egyben jön a sablonból).
    mv "$TMPD/work.next" "$WORK"
    sort -u "$TMPD/unplaced" > "$TMPD/missing.sections"
    while IFS= read -r msec; do
      [ -n "$msec" ] || continue
      insert_section "$WORK" "$msec" \
        || bail "egy új kulcs a config.md-ben nem létező \"$msec\" szekcióba tartozik, és a szekció automatikus beszúrása nem volt egyértelmű."
    done < "$TMPD/missing.sections"
  fi
fi

# 3) (ORD-368) kulcs NÉLKÜLI új szekciók (pl. `Érték | Jelentés` értéktábla) — csak ha a
#    hívó megadta a régi sablont: az a szekció kerül be, amely a régi sablonban még nem
#    volt (ezzel a frissítéssel jelent meg), a WORK-ben sincs, és nincs benne kulcssor. Így
#    a repóban átnevezett (a régi sablonban is meglévő) szekció nem duplikálódik, a
#    kulcsos szekciókat pedig a fenti 2) lépés kezeli. A sablon sorrendjében, ezért egymást
#    követő új szekciók is a helyükre kerülnek.
if [ -n "$OLD_TMPL" ]; then
  tr -d '\r' < "$OLD_TMPL" > "$TMPD/old.lf.md"
  heads() { awk '/^##+[ \t]/ { h = $0; sub(/^##+[ \t]+/, "", h); gsub(/^[ \t]+|[ \t]+$/, "", h); print h }' "$1"; }
  heads "$TMPD/old.lf.md" | sort -u > "$TMPD/old.heads"
  heads "$TMPL_LF" > "$TMPD/tmpl.heads"
  while IFS= read -r nsec; do
    [ -n "$nsec" ] || continue
    grep -qxF -- "$nsec" "$TMPD/old.heads" && continue
    heads "$WORK" | grep -qxF -- "$nsec" && continue
    awk -v SEC="$nsec" '
      function trim(s){ gsub(/^[ \t\r]+/,"",s); gsub(/[ \t\r]+$/,"",s); return s }
      /^##+[ \t]/ { h = $0; sub(/^##+[ \t]+/, "", h); h = trim(h); if (grab && h != SEC) exit; if (h == SEC) grab = 1 }
      grab { print }
    ' "$TMPL_LF" > "$TMPD/new-section.md"
    [ -z "$(list_keys "$TMPD/new-section.md")" ] || continue
    insert_section "$WORK" "$nsec" \
      || bail "a sablon új, kulcs nélküli \"$nsec\" szekciójának helye a config.md-ben nem egyértelmű."
    echo "$nsec" >> "$TMPD/added.sections"
  done < "$TMPD/tmpl.heads"
fi

# --- round-trip önellenőrzés: az összefésült kulcshalmaz a várt legyen -----------------
list_keys "$WORK" | cut -f1 | sort -u > "$TMPD/merged.names"
cat "$TMPD/tmpl.names" "$TMPD/removed.names" | sort -u > "$TMPD/expected.names"
if ! diff -q "$TMPD/expected.names" "$TMPD/merged.names" >/dev/null 2>&1; then
  bail "az összefésült config.md kulcshalmaza nem a várt (round-trip ellenőrzés bukott)."
fi

# Egy kulcs-sor (RAWROW) NYERS érték-cellájának/celláinak trimmelt tartalma — a
# report-üzenetekhez, hogy ne a `first_tick`-elt/csonkolt alapérték jelenjen meg.
raw_value_cell() {  # $1: RAWROW, $2: SIG
  printf '%s\n' "$1" | awk -v SIG="$2" -F'|' '
    function trim(s){ gsub(/^[ \t]+|[ \t]+$/, "", s); return s }
    {
      if (SIG ~ /Egyedi kapcsoló/) print trim($3) " / " trim($4) " / " trim($5)
      else print trim($3)
    }'
}

# --- megszűnt kulcsok jelentése (a config.md tartalmát NEM módosítjuk miattuk) --------
report_removed() {
  [ -s "$TMPD/removed.names" ] || return 0
  echo "merge-config-keys: az alábbi kulcs(ok) már nincsenek a sablonban — a config.md-ben MEGMARADTAK, kézzel eltávolíthatók, ha nem használod őket:"
  while IFS= read -r k; do
    [ -n "$k" ] || continue
    sec=$(awk -F'\t' -v K="$k" '$1==K{print $3; exit}' "$TMPD/live.keys")
    echo "  - $k  (szekció: ${sec:-ismeretlen})"
  done < "$TMPD/removed.names"
}

# --- a LIVE eredeti sorvégének visszaállítása a WORK-ön (COCALC-237 review Major 1) ----
# Belül végig LF-en dolgoztunk; ha a LIVE CRLF volt, a kiírt/összehasonlított WORK is
# CRLF legyen — így egy CRLF config.md-nél a diff tényleg csak a beszúrt sor(oka)t mutatja.
if [ "$LIVE_IS_CRLF" = "1" ]; then
  awk '{ sub(/\r$/, ""); printf "%s\r\n", $0 }' "$WORK" > "$WORK.eol" && mv "$WORK.eol" "$WORK"
fi

# --- írás: csak ha ténylegesen változott a tartalom (idempotencia-barát) --------------
if diff -q "$LIVE" "$WORK" >/dev/null 2>&1; then
  report_removed
  echo "merge-config-keys: a config.md tartalma nem változott (nincs beszúrandó/migrálandó kulcs)."
  exit 0
fi

cp "$LIVE" "$LIVE.bak"
cp "$WORK" "$LIVE"

if [ -s "$TMPD/added.names" ]; then
  echo "merge-config-keys: beszúrt új kulcs(ok) az alapértékükkel:"
  while IFS= read -r k; do
    [ -n "$k" ] || continue
    krow=$(awk -F'\t' -v K="$k" '$1==K{print $5; exit}' "$TMPD/tmpl.keys")
    ksig=$(awk -F'\t' -v K="$k" '$1==K{print $4; exit}' "$TMPD/tmpl.keys")
    sec=$(awk -F'\t' -v K="$k" '$1==K{print $3; exit}' "$TMPD/tmpl.keys")
    echo "  - $k = $(raw_value_cell "$krow" "$ksig")  (szekció: ${sec:-ismeretlen})"
  done < "$TMPD/added.names"
fi
if [ -s "$TMPD/added.sections" ]; then
  echo "merge-config-keys: beszúrt új, kulcs nélküli szekció(k) a sablonból:"
  while IFS= read -r s; do echo "  - $s"; done < "$TMPD/added.sections"
fi
if [ -s "$TMPD/renames" ]; then
  echo "merge-config-keys: átnevezett kulcs(ok) migrált értékkel (egyetlen bejegyzés, régi sor helyén):"
  while read -r oldk newk; do
    [ -n "${oldk:-}" ] || continue
    echo "  - $oldk -> $newk"
    echo "merge-config-keys: FIGYELEM: a(z) $oldk -> $newk átnevezés után a config.md prózájában maradt szöveges hivatkozásokat kézzel nézd át."
  done < "$TMPD/renames"
fi
report_removed
echo "merge-config-keys: biztonsági másolat készült: $LIVE.bak"
echo "merge-config-keys: az összefésülés kész — a korábban kitöltött értékek változatlanok."
exit 0
