#!/usr/bin/env sh
# COCALC-233: dev-workflow csomag telepítő/frissítő szkript egy fogyasztó repo számára.
#
# A GitLab Package Registry Generic Packages API-járól letölti a dev-workflow csomag
# tar.gz-ét (group deploy tokennel), és a benne lévő dev-workflow-manifest.json szerint
# szétteríti a fogyasztó repóban:
#   - "versioned" útvonalak mindig felülíródnak (ezek a tényleges skill/subagent/tool
#     tartalom, csomagvezérelt, sosem repo-lokálisan szerkesztett fájlok);
#   - "repo_local_exceptions" útvonalak SOSEM íródnak felül, ha már léteznek — friss
#     telepítésnél a *.template.md sablon-változatuk kerül a helyükre (ha van ilyen a
#     csomagban), frissítésnél pedig, ha a csomagbeli sablon megváltozott a korábban
#     telepítetthez képest, egy <fájl>.new kerül melléjük + diff a stdout-ra;
#   - "samples" útvonalak SOHA nem kerülnek a helyükre, csak jelzésre.
# A telepített verziót a manifest "version_stamp.file" mezője által megnevezett fájlba
# írja (alapértelmezetten .dev-workflow-version, a fogyasztó repo gyökerén) — ez különbözik
# a dev-workflow forrás-repójában (wordcloud) natívan élő VERSION fájltól, mert egy
# fogyasztó repo nem birtokolja/verziózza magát a csomagot, csak a telepített állapotát.
#
# ⚠️ EGYSZERI BOOTSTRAP egy teljesen friss/üres fogyasztó repóba: ez a szkript maga is a
# csomag "versioned" tartalmának része (lásd dev-workflow-manifest.json "versioned" lista
# ".claude/tools/" bejegyzése), tehát minden további csomag-frissítéssel automatikusan
# frissül — DE az ELSŐ letöltéshez, amíg a szkript még nincs a repóban, kézzel kell
# lehozni. Példa (a konkrét projekt/package/verzió a saját env-változóid szerint):
#
#   curl -fsSL --header "Deploy-Token: ${DEV_WORKFLOW_DEPLOY_TOKEN}" \
#     "https://gitlab.com/api/v4/projects/<dist-projekt-URL-kódolt-path-vagy-ID>/packages/generic/<package-név>/<verzió>/<fájlnév>.tar.gz" \
#     -o dev-workflow.tar.gz
#   tar -xzf dev-workflow.tar.gz ./.claude/tools/dev-workflow-install/install-or-upgrade.sh
#
# A tar-tag útvonala ELÖL './'-lel kezdődik: a csomagot a ci/build-dev-workflow-archive.sh
# `tar -czf out .` hívása állítja elő, ami './'-prefixes tagneveket ad. GNU tar (a Linux
# alapértelmezés) a prefix nélküli '.claude/...' mintát "Not found in archive"-val
# elutasítja; a './.claude/...' forma GNU és BSD tar alatt is működik.
#
# Ezután a kicsomagolt szkript már innen, sh-val futtatható, és onnantól a teljes
# csomagot (a saját magát felülíró másolatával együtt) le tudja húzni.
#
# Használat:
#   sh install-or-upgrade.sh [--target-dir <fogyasztó-repo-gyökér>]
#
# Kötelező env változók (ha nincs DEV_WORKFLOW_INSTALL_LOCAL_ARCHIVE — lásd lent):
#   DEV_WORKFLOW_DEPLOY_TOKEN   — group deploy token (Deploy-Token fejlécben megy, SOHA
#                                 nincs kiírva stdout/stderr-re, hibaágban sem)
#   DEV_WORKFLOW_DIST_PROJECT   — a dist projekt GitLab path-ja vagy numerikus ID-ja
#   DEV_WORKFLOW_PACKAGE_NAME   — a Generic Package neve a dist projekt registryjében
#
# Opcionális env változók:
#   DEV_WORKFLOW_PACKAGE_VERSION  — konkrét verzió letöltése. Ha nincs megadva, a
#                                    szkript a legfrissebb (created_at szerint legutolsó)
#                                    verziót próbálja lekérdezni a Packages API-tól — ehhez
#                                    viszont DEV_WORKFLOW_API_TOKEN (PAT) is kell, mert a
#                                    Packages API-t a group deploy token NEM hitelesíti.
#   DEV_WORKFLOW_API_TOKEN        — PAT (PRIVATE-TOKEN, api vagy read_api scope), KIZÁRÓLAG
#                                    a "legfrissebb verzió" feloldásához (a projekt-szintű
#                                    /packages listázás deploy tokennel 404-et ad). Ha
#                                    DEV_WORKFLOW_PACKAGE_VERSION explicit meg van adva,
#                                    erre nincs szükség — a letöltés maga a deploy tokennel
#                                    megy.
#   DEV_WORKFLOW_PACKAGE_FILENAME — a letöltendő tar.gz fájlnév a registryben
#                                    (alapértelmezett: dev-workflow-<verzió>.tar.gz)
#   DEV_WORKFLOW_GITLAB_API_URL   — GitLab API bázis-URL (alapértelmezett:
#                                    https://gitlab.com/api/v4 — self-hosted GitLab-hoz
#                                    írd felül)
#   DEV_WORKFLOW_INSTALL_LOCAL_ARCHIVE — teszt/offline horog: ha be van állítva, a
#                                    szkript ebből a helyi tar.gz útvonalból dolgozik,
#                                    NEM hív hálózatot, és a fenti kötelező env
#                                    változókra sincs szüksége. Ezt használja a
#                                    ci/verify-dev-workflow-installer.sh önellenőrzés.
set -eu

TARGET_DIR="$(pwd)"
CLEANUP_DIRS=""

cleanup() {
  for d in $CLEANUP_DIRS; do
    rm -rf "$d"
  done
}
trap cleanup EXIT

track_cleanup_dir() {
  CLEANUP_DIRS="$CLEANUP_DIRS $1"
}

fail() {
  echo "HIBA: $1" >&2
  exit 1
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --target-dir)
        [ "$#" -ge 2 ] || fail "--target-dir értéket vár"
        TARGET_DIR="$2"
        shift 2
        ;;
      *)
        fail "ismeretlen argumentum: $1"
        ;;
    esac
  done
}

url_encode_path() {
  printf '%s' "$1" | sed 's#/#%2F#g'
}

# $1: mezőnév, $2: manifest fájl útvonala — soronkénti JSON-tömb elemeit adja vissza,
# idézőjelek nélkül (nem generikus JSON parser, ugyanaz a konvenció, mint
# ci/verify-dev-workflow-manifest.sh extract_json_array-jában).
extract_json_array() {
  awk -v field="\"$1\"" '
    $0 ~ field { found=1; next }
    found && /\]/ { found=0; next }
    found {
      gsub(/^[ \t]*"/, "");
      gsub(/",?[ \t]*$/, "");
      if (length($0) > 0) print
    }
  ' "$2"
}

# A sortörés-alapú awk-parser (extract_json_array) csendben üres listát ad vissza, ha a
# manifest valaha minifikált/egysoros JSON-ná formázódna — ez a check különbözteti meg a
# "valóban üres tömb a JSON-ban" esetet a "parser nem talált semmit, pedig kellett volna"
# esettől: ha a mező neve szerepel a manifestben, de a kinyert lista üres, az hiba, nem
# csendes no-op (ami a hívó copy_versioned_tree-t üres lista fölött hiba nélkül futtatná
# végig, és a szkript sikerüzenettel zárna úgy, hogy semmit nem másolt be). Ugyanaz a
# védelem, mint a ci/verify-dev-workflow-manifest.sh-ban.
require_non_empty_if_field_present() {
  # $1: mezőnév, $2: a hozzá tartozó, extract_json_array-jal már kinyert lista,
  # $3: a manifest fájl útvonala
  field="$1"
  list="$2"
  manifest_path="$3"
  if [ -z "$list" ] && grep -Fq "\"$field\"" "$manifest_path"; then
    fail "a csomag manifestjében (\"$manifest_path\") a \"$field\" mező szerepel, de a kinyert lista üres (a parser nem talált soronkénti JSON-tömböt — lásd formázás, pl. minifikált/egysoros JSON)"
  fi
}

is_in_list() {
  # $1: keresett érték, $2: soronkénti lista
  needle="$1"
  haystack="$2"
  printf '%s\n' "$haystack" | grep -Fxq "$needle"
}

resolve_latest_version() {
  api_url="$1"
  project_enc="$2"
  # A GitLab projekt-szintű Packages API (/projects/:id/packages listázás) NEM fogad el
  # deploy tokent — csak PAT-ot (PRIVATE-TOKEN) vagy CI job tokent. A group deploy token
  # kizárólag a packages/generic/.../<fájl> letöltő/feltöltő végpontokon hitelesít, a
  # listázáson 404-et ad. Ezért a "legfrissebb verzió" feloldásához külön PAT kell.
  [ -n "${DEV_WORKFLOW_API_TOKEN:-}" ] || fail "a legfrissebb csomagverzió automatikus feloldásához DEV_WORKFLOW_API_TOKEN (PAT, api vagy read_api scope) szükséges — a group deploy token a Packages API-t nem hitelesíti. Alternatíva: add meg explicit a DEV_WORKFLOW_PACKAGE_VERSION env változót."
  response="$(curl -fsSL --header "PRIVATE-TOKEN: ${DEV_WORKFLOW_API_TOKEN}" \
    "$api_url/projects/$project_enc/packages?package_name=${DEV_WORKFLOW_PACKAGE_NAME}&order_by=created_at&sort=desc&per_page=1")" \
    || fail "nem sikerült lekérdezni a legfrissebb csomagverziót a Packages API-tól (DEV_WORKFLOW_API_TOKEN érvényes? api/read_api scope megvan?)"
  echo "$response" | grep -o '"version":"[^"]*"' | head -1 | sed -E 's/"version":"([^"]*)"/\1/'
}

obtain_package() {
  PKG_DIR="$(mktemp -d)"
  track_cleanup_dir "$PKG_DIR"

  if [ -n "${DEV_WORKFLOW_INSTALL_LOCAL_ARCHIVE:-}" ]; then
    archive="$DEV_WORKFLOW_INSTALL_LOCAL_ARCHIVE"
    [ -f "$archive" ] || fail "DEV_WORKFLOW_INSTALL_LOCAL_ARCHIVE nem létező fájlra mutat: $archive"
  else
    : "${DEV_WORKFLOW_DEPLOY_TOKEN:?a DEV_WORKFLOW_DEPLOY_TOKEN env változó kötelező (group deploy token)}"
    : "${DEV_WORKFLOW_DIST_PROJECT:?a DEV_WORKFLOW_DIST_PROJECT env változó kötelező (dist projekt path/ID)}"
    : "${DEV_WORKFLOW_PACKAGE_NAME:?a DEV_WORKFLOW_PACKAGE_NAME env változó kötelező (Generic Package neve)}"

    api_url="${DEV_WORKFLOW_GITLAB_API_URL:-https://gitlab.com/api/v4}"
    project_enc="$(url_encode_path "$DEV_WORKFLOW_DIST_PROJECT")"

    version="${DEV_WORKFLOW_PACKAGE_VERSION:-}"
    if [ -z "$version" ]; then
      version="$(resolve_latest_version "$api_url" "$project_enc")"
      [ -n "$version" ] || fail "nem sikerült megállapítani a legfrissebb csomagverziót"
    fi

    filename="${DEV_WORKFLOW_PACKAGE_FILENAME:-dev-workflow-${version}.tar.gz}"
    download_dir="$(mktemp -d)"
    track_cleanup_dir "$download_dir"
    archive="$download_dir/$filename"
    download_url="$api_url/projects/$project_enc/packages/generic/${DEV_WORKFLOW_PACKAGE_NAME}/${version}/${filename}"

    curl -fsSL --header "Deploy-Token: ${DEV_WORKFLOW_DEPLOY_TOKEN}" -o "$archive" "$download_url" \
      || fail "nem sikerült letölteni a csomagot (a token értékét biztonsági okból nem írjuk ki)"
  fi

  tar -xzf "$archive" -C "$PKG_DIR" || fail "nem sikerült kicsomagolni a letöltött archívumot"
}

read_package_manifest() {
  manifest="$PKG_DIR/dev-workflow-manifest.json"
  [ -f "$manifest" ] || fail "a csomag gyökerén nincs dev-workflow-manifest.json"
  [ -f "$PKG_DIR/VERSION" ] || fail "a csomag gyökerén nincs VERSION fájl"

  versioned_list="$(extract_json_array versioned "$manifest")"
  repo_local_exceptions_list="$(extract_json_array repo_local_exceptions "$manifest")"
  samples_list="$(extract_json_array samples "$manifest")"
  seed_once_list="$(extract_json_array seed_once "$manifest")"

  require_non_empty_if_field_present "versioned" "$versioned_list" "$manifest"
  require_non_empty_if_field_present "repo_local_exceptions" "$repo_local_exceptions_list" "$manifest"
  require_non_empty_if_field_present "samples" "$samples_list" "$manifest"
  require_non_empty_if_field_present "seed_once" "$seed_once_list" "$manifest"

  version_stamp_file="$(grep -A3 '"version_stamp"' "$manifest" | grep '"file"' | sed -E 's/.*"file":[[:space:]]*"([^"]+)".*/\1/' | head -1)"
  [ -n "$version_stamp_file" ] || version_stamp_file=".dev-workflow-version"

  new_version="$(cat "$PKG_DIR/VERSION")"
}

# Code review 1. kör (COCALC-320, nitpick 5): a "samples" könyvtár-bejegyzések (pl. "ci/")
# szemantikája kétértelmű lehet, ha a könyvtár ALATT egyedi fájlok külön, a "versioned"
# listán keresztül MÁR automatikusan települtek (COCALC-320 óta ez a helyzet a "ci/"-vel:
# 17 konkrét szkript versioned, maga a könyvtár-bejegyzés viszont még samples) — enélkül a
# jegyzet egy első telepítő azt hihetné, hogy a teljes könyvtár kezeletlen maradt. A jegyzet
# szándékosan ÁLTALÁNOS (nem a "ci/"-t nevesíti), hogy jövőbeli hasonló átfedésekre is álljon.
print_samples_notice() {
  echo "INFO: az alábbi minta-útvonalak NEM kerülnek automatikusan a fogyasztó repóba —"
  echo "      nézd meg kézzel a kicsomagolt csomagban, hogy hova kellene bemásolnod őket."
  echo "      (Ha egy itt felsorolt KÖNYVTÁR alatt egyedi fájlok külön, a 'versioned' listán"
  echo "      keresztül MÁR automatikusan települtek, azok itt nem szerepelnek újra — csak a"
  echo "      könyvtár maradék, kifejezetten minta-jellegű tartalmát kell kézzel átnézned.)"
  # `if` (nem `[ -n "$s" ] && echo ...`) szándékos: utóbbi a `set -e` alatt a teljes
  # while-konstrukció kilépőkódjává tenné a hamis teszt (1) állapotát, ha $samples_list
  # üres (a printf egyetlen üres sort ad ki) -- ez a legutolsó, `$s` üres iterációban
  # levinné az egész install-or-upgrade.sh-t, pedig nincs tényleges hiba.
  printf '%s\n' "$samples_list" | while IFS= read -r s; do
    if [ -n "$s" ]; then
      echo "  - $s"
    fi
  done
}

# Egy repo_local_exceptions VAGY seed_once relatív útvonalhoz tartozó sablon relatív
# útvonalát adja vissza (pl. ".../config.md" -> ".../config.template.md",
# ".gitlab-ci.yml" -> ".gitlab-ci.template.yml"), vagy üres stringet, ha az adott
# útvonalnak nincs (felismerhető) kiterjesztése, tehát nincs sablon-konvenció rá (pl.
# .claude/launch.json). COCALC-320: általánosítva az eredeti *.md-only alakról
# tetszőleges kiterjesztésre (stem/ext-split — a ".template" mindig a KITERJESZTÉS elé
# kerül be, nem a fájlnév végére) — a ci/verify-dev-workflow-manifest.sh
# seed_once_template_name()-je ugyanezt a konvenciót követi (kézzel szinkronban tartva,
# a resolve-*.sh duplikált konstansok mintájára).
template_rel_for() {
  rel="$1"
  base="$(basename "$rel")"
  case "$base" in
    *.*)
      dir="$(dirname "$rel")"
      ext="${base##*.}"
      stem="${base%.*}"
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

# A frissítés-előtti (régi) sablon-tartalmat menti el egy ideiglenes könyvtárba, MIELŐTT
# a versioned fa másolása a sablonokat (amik a versioned fa részei) felülírná — enélkül
# nem lenne mihez képest diffelni az upgrade-ág "sablon megváltozott" ellenőrzését.
# COCALC-320: a repo_local_exceptions MELLETT a seed_once célok sablonjait is menti —
# mindkettő ugyanazt a template_rel_for() leképezést és "diffelj a régi/új sablon között"
# mintát használja (lásd handle_repo_local_exceptions / handle_seed_once).
snapshot_old_templates() {
  snap_dir="$1"
  {
    printf '%s\n' "$repo_local_exceptions_list"
    printf '%s\n' "$seed_once_list"
  } | while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    tmpl_rel="$(template_rel_for "$rel")"
    [ -n "$tmpl_rel" ] || continue
    if [ -f "$TARGET_DIR/$tmpl_rel" ]; then
      mkdir -p "$snap_dir/$(dirname "$tmpl_rel")"
      cp "$TARGET_DIR/$tmpl_rel" "$snap_dir/$tmpl_rel"
    fi
  done
}

# $1: a manifest "versioned" fájából származó, csomag-relatív útvonal -- igaz (0), ha ez az
# útvonal repo_local_exceptions VAGY seed_once célként van kizárva a nyers másolásból (a
# kettőnek a copy_versioned_tree()-n kívül, a handle_repo_local_exceptions() /
# handle_seed_once()-ban van saját, sablon-tudatos kezelése). Ma nincs átfedés (a
# seed_once célok, pl. ".gitlab-ci.yml", nem esnek egyetlen "versioned" könyvtár alá sem),
# de a guard szimmetrikus a repo_local_exceptions_list-tel jövő-biztosításként — code
# review 1. kör (COCALC-320 javítás).
is_excluded_from_versioned_copy() {
  needle="$1"
  is_in_list "$needle" "$repo_local_exceptions_list" || is_in_list "$needle" "$seed_once_list" || is_under_excluded_dir "$needle"
}

# ORD-384: a "/"-re végződő repo_local_exceptions bejegyzés (pl. ".claude/skills/dev-workflow/overrides/")
# könyvtár-kivétel: ez alatti útvonal sem másolódik a csomagból. Ma a csomagban nincs ilyen
# fájl, a guard jövő-biztosítás.
is_under_excluded_dir() {
  printf '%s\n' "$repo_local_exceptions_list" | awk -v n="$1" '
    substr($0, length($0)) == "/" && index(n, $0) == 1 { found = 1 }
    END { exit found ? 0 : 1 }'
}

copy_versioned_tree() {
  printf '%s\n' "$versioned_list" | while IFS= read -r entry; do
    [ -n "$entry" ] || continue
    src="$PKG_DIR/$entry"
    if [ ! -e "$src" ]; then
      echo "FIGYELEM: a csomagban nem található \"$entry\" (a manifest 'versioned' listája szerint kellene) — kihagyva" >&2
      continue
    fi
    if [ -d "$src" ]; then
      find "$src" -type f | while IFS= read -r file; do
        rel="${file#"$PKG_DIR"/}"
        if is_excluded_from_versioned_copy "$rel"; then
          continue
        fi
        dest="$TARGET_DIR/$rel"
        mkdir -p "$(dirname "$dest")"
        cp "$file" "$dest"
      done
    else
      if is_excluded_from_versioned_copy "$entry"; then
        continue
      fi
      dest="$TARGET_DIR/$entry"
      mkdir -p "$(dirname "$dest")"
      cp "$src" "$dest"
    fi
  done
}

handle_repo_local_exceptions() {
  snap_dir="$1"
  printf '%s\n' "$repo_local_exceptions_list" | while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    target_file="$TARGET_DIR/$rel"
    tmpl_rel="$(template_rel_for "$rel")"

    # ORD-384: "/"-re végződő bejegyzés = könyvtár-kivétel (pl. overrides/): a tartalma
    # sosem íródik felül; hiányzó könyvtárat üresen (.gitkeep) létrehozzuk.
    case "$rel" in
      */)
        dir_path="${target_file%/}"
        if [ ! -d "$dir_path" ]; then
          mkdir -p "$dir_path"
          : > "$dir_path/.gitkeep"
          echo "TELEPÍTVE (üres könyvtár): $rel"
        else
          echo "VÁLTOZATLAN (repo-lokális kivétel, a tartalma nem íródott felül): $rel"
        fi
        continue
        ;;
    esac

    if [ ! -e "$target_file" ]; then
      # Friss telepítés: a fájl még nem létezik ebben a fogyasztó repóban.
      if [ -n "$tmpl_rel" ] && [ -f "$TARGET_DIR/$tmpl_rel" ]; then
        mkdir -p "$(dirname "$target_file")"
        cp "$TARGET_DIR/$tmpl_rel" "$target_file"
        echo "TELEPÍTVE (sablonból): $rel — töltsd ki a repo-specifikus értékeket, mielőtt bármelyik dev-workflow skillt használnád."
      else
        echo "KIHAGYVA: \"$rel\" nincs sablon-változata a csomagban — ezt kézzel kell létrehoznod ebben a repóban."
      fi
      continue
    fi

    # Frissítés: a fájl már létezik — a nyers tartalma SOSEM íródik felül. A config.md
    # esetén viszont (COCALC-237) megpróbáljuk az ÚJ kulcsokat automatikusan beszúrni az
    # alapértékükkel, a már kitöltött értékek érintése nélkül — ha ez bármiért bizonytalan,
    # a szkript visszaesik a lenti v1 viselkedésre (`<fájl>.new` + diff).
    if [ -n "$tmpl_rel" ] && [ -f "$TARGET_DIR/$tmpl_rel" ]; then
      old_tmpl="$snap_dir/$tmpl_rel"
      new_tmpl="$TARGET_DIR/$tmpl_rel"
      # ORD-497 (4.30.0): a hosszú (értékek + magyarázatok) config.md egyszeri átállítása a
      # rövid, csak értékeket tartalmazó formátumra — a sablon-diff feltételtől függetlenül,
      # hogy régi-sablon-snapshot nélkül is lefusson. A slim-config.js maga dönti el, van-e
      # teendő (10 = nincs), és bizonytalanságnál (1) a config.md-t garantáltan nem módosítja.
      case "$rel" in
        config.md|*/config.md)
          slim_helper="$PKG_DIR/.claude/tools/dev-workflow-install/slim-config.js"
          if [ -f "$slim_helper" ]; then
            if command -v node >/dev/null 2>&1; then
              slim_rc=0
              if [ -f "$old_tmpl" ]; then
                node "$slim_helper" "$target_file" "$new_tmpl" "$old_tmpl" || slim_rc=$?
              else
                node "$slim_helper" "$target_file" "$new_tmpl" || slim_rc=$?
              fi
              case "$slim_rc" in
                0|10) ;;
                *)
                  echo "FIGYELEM: a(z) \"$rel\" rövid formátumra állítása nem sikerült (a fájl változatlan) — a régi, hosszú formátum tovább működik; kézi átállításhoz: node $slim_helper \"$rel\" \"$tmpl_rel\""
                  ;;
              esac
            else
              echo "FIGYELEM: a(z) \"$rel\" rövid formátumra állítása kimaradt (node nem érhető el) — a régi, hosszú formátum tovább működik."
            fi
          fi
          ;;
      esac
      if [ -f "$old_tmpl" ] && ! diff -q "$old_tmpl" "$new_tmpl" >/dev/null 2>&1; then
        merged_ok=0
        case "$rel" in
          config.md|*/config.md)
            merge_helper="$PKG_DIR/.claude/tools/dev-workflow-install/merge-config-keys.sh"
            # ORD-368: a csomagbeli helper a régi sablont is megkapja (kulcs nélküli új
            # szekciók); a fogyasztó esetleg régebbi helpere csak két argumentumot ismer.
            merge_old_tmpl="$old_tmpl"
            if [ ! -f "$merge_helper" ]; then
              merge_helper="$TARGET_DIR/.claude/tools/dev-workflow-install/merge-config-keys.sh"
              merge_old_tmpl=""
            fi
            if [ -f "$merge_helper" ]; then
              if sh "$merge_helper" "$target_file" "$new_tmpl" ${merge_old_tmpl:+"$merge_old_tmpl"}; then
                merged_ok=1
                echo "ÖSSZEFÉSÜLVE: \"$rel\" — az új kulcsok beszúrva az alapértékükkel, a korábban kitöltött értékek változatlanok (biztonsági másolat: \"$rel.bak\", ha volt tényleges változás)."
              else
                echo "FIGYELEM: a(z) \"$rel\" automatikus kulcs-összefésülése bizonytalan volt — visszaesés a biztonságos \"$rel.new\" + diff viselkedésre (a \"$rel\" maga változatlan)."
              fi
            fi
            ;;
        esac
        if [ "$merged_ok" -eq 0 ]; then
          new_file="$target_file.new"
          cp "$new_tmpl" "$new_file"
          echo "FIGYELEM: a csomagbeli \"$tmpl_rel\" sablon megváltozott a korábban telepítetthez képest."
          echo "          Létrehozva: \"$rel.new\" — kézzel egyeztesd a jelenlegi \"$rel\"-lel, a \"$rel\" maga változatlan maradt."
          echo "          Diff (régi sablon -> új sablon):"
          diff -u "$old_tmpl" "$new_tmpl" || true
        fi
      fi
    fi
    echo "VÁLTOZATLAN (repo-lokális kivétel, a nyers tartalma nem íródott felül): $rel"
  done
}

# COCALC-320: a "seed_once" célok kezelése — a handle_repo_local_exceptions() mintájára,
# de EGYSZERŰBB szemantikával (nincs config.md-szerű kulcs-összefésülés-különeset):
#   - a forrás-sablon (pl. ".gitlab-ci.template.yml") a "versioned" fa része, MINDIG
#     frissül a csomaggal (ezt már a copy_versioned_tree() elintézte, ELŐBB fut le, mint
#     ez a függvény);
#   - a CÉL (pl. ".gitlab-ci.yml") ha még nem létezik, a sablonból jön létre EGYSZER;
#   - ha a cél MÁR LÉTEZIK (akár mert korábban seed-elve lett, akár mert a felhasználó
#     saját maga hozta létre MÉG a dev-workflow telepítése előtt), a nyers tartalma SOSEM
#     íródik felül — ha a csomagbeli sablon megváltozott a korábban telepítetthez képest,
#     "<cél>.new" + unified diff jelzi (a repo_local_exceptions v1 fallback-ágának mintája).
# A "nincs (elérhető) sablon" esetben a control-flow SZÁNDÉKOSAN pontosan a
# handle_repo_local_exceptions() sorrendjét követi (előbb a cél létezik-e, utána van-e
# sablon) — code review 1. kör (COCALC-320 javítás): korábban ez a függvény FORDÍTOTT
# sorrendben nézte a két feltételt, ezért egy MÁR LÉTEZŐ, de sablon nélküli cél is
# (tévesen) a "KIHAGYVA... kézzel kell létrehoznod" üzenetet kapta a
# handle_repo_local_exceptions() csendes "VÁLTOZATLAN"-jával szemben.
handle_seed_once() {
  snap_dir="$1"
  printf '%s\n' "$seed_once_list" | while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    target_file="$TARGET_DIR/$rel"
    tmpl_rel="$(template_rel_for "$rel")"

    if [ ! -e "$target_file" ]; then
      # Friss seed: a cél még nem létezik ebben a fogyasztó repóban -- ha van (elérhető)
      # sablon, létrehozzuk belőle EGYSZER (a további csomag-frissítések ezt már SOHA nem
      # írják felül); ha nincs, kézi létrehozásra utasítjuk a felhasználót.
      if [ -n "$tmpl_rel" ] && [ -f "$TARGET_DIR/$tmpl_rel" ]; then
        mkdir -p "$(dirname "$target_file")"
        cp "$TARGET_DIR/$tmpl_rel" "$target_file"
        echo "TELEPÍTVE (seed_once, sablonból): $rel — a további csomag-frissítések ezt MÁR NEM írják felül; ha kézzel módosítod, biztonságban van."
      else
        echo "KIHAGYVA: \"$rel\" (seed_once) nincs sablon-változata a csomagban — ezt kézzel kell létrehoznod ebben a repóban."
      fi
      continue
    fi

    # A cél már létezik (akár egy korábbi seed-elésből, akár mert a felhasználó saját
    # maga hozta létre) -- a nyers tartalma SOSEM íródik felül. Ha van (elérhető) sablon ÉS
    # az megváltozott a korábban telepítetthez képest (a snapshot_old_templates() által
    # mentett RÉGI sablon-állapothoz képest), "<cél>.new" + diff jelzi; sablon nélkül a
    # drift nem eldönthető, csendben "VÁLTOZATLAN" marad (a handle_repo_local_exceptions()
    # mintájára).
    if [ -n "$tmpl_rel" ] && [ -f "$TARGET_DIR/$tmpl_rel" ]; then
      old_tmpl="$snap_dir/$tmpl_rel"
      new_tmpl="$TARGET_DIR/$tmpl_rel"
      if [ -f "$old_tmpl" ] && ! diff -q "$old_tmpl" "$new_tmpl" >/dev/null 2>&1; then
        new_file="$target_file.new"
        cp "$new_tmpl" "$new_file"
        echo "FIGYELEM: a csomagbeli \"$tmpl_rel\" sablon megváltozott a korábban telepítetthez képest."
        echo "          Létrehozva: \"$rel.new\" — kézzel egyeztesd a jelenlegi \"$rel\"-lel, a \"$rel\" maga változatlan maradt."
        echo "          Diff (régi sablon -> új sablon):"
        diff -u "$old_tmpl" "$new_tmpl" || true
      fi
    fi
    echo "VÁLTOZATLAN (seed_once, a nyers tartalma nem íródott felül): $rel"
  done
}

# ORD-384: a repólokális agent/skill-felülírások (overrides.yaml) alkalmazása a versioned fa
# másolása UTÁN. Node 22 kell; hiányában csak figyelmeztet, a telepítés sikeres marad.
apply_overrides() {
  overrides_yaml="$TARGET_DIR/.claude/skills/dev-workflow/overrides.yaml"
  [ -f "$overrides_yaml" ] || return 0
  overrides_helper="$TARGET_DIR/.claude/tools/dev-workflow-install/apply-overrides.js"
  if [ ! -f "$overrides_helper" ]; then
    echo "FIGYELEM: az apply-overrides.js nem található ($overrides_helper), az overrides.yaml nem alkalmazható, a felülírások kimaradtak"
    return 0
  fi
  if ! command -v node >/dev/null 2>&1; then
    echo "FIGYELEM: az overrides.yaml nem alkalmazható (node nem érhető el), a felülírások kimaradtak"
    return 0
  fi
  if ! node "$overrides_helper" --target-dir "$TARGET_DIR"; then
    echo "FIGYELEM: az overrides.yaml alkalmazása hibával leállt, a felülírások részben vagy egészben kimaradtak"
  fi
  return 0
}

report_version_and_write_stamp() {
  stamp_path="$TARGET_DIR/$version_stamp_file"
  old_version="0.0.0"
  if [ -f "$stamp_path" ]; then
    old_version="$(cat "$stamp_path")"
  fi

  echo "Verzió: $old_version -> $new_version"

  old_major="${old_version%%.*}"
  new_major="${new_version%%.*}"
  if [ "$old_version" != "0.0.0" ] && [ "$old_major" != "$new_major" ]; then
    echo "FIGYELEM: MAJOR verzióváltás történt ($old_major.x.x -> $new_major.x.x)." >&2
    echo "          A repo-lokális config.md-t (és a fentebb esetlegesen keletkezett *.new fájlokat)" >&2
    echo "          kézzel nézd át — MAJOR verzió kompatibilitást törő kapcsoló-átnevezést/megszűnést" >&2
    echo "          vagy új kötelező mezőt jelezhet, lásd a csomag CHANGELOG.md-jét." >&2
  fi

  mkdir -p "$(dirname "$stamp_path")"
  printf '%s' "$new_version" > "$stamp_path"
}

main() {
  parse_args "$@"
  [ -d "$TARGET_DIR" ] || fail "a célkönyvtár nem létezik: $TARGET_DIR"

  obtain_package
  read_package_manifest
  print_samples_notice

  snap_dir="$(mktemp -d)"
  track_cleanup_dir "$snap_dir"
  snapshot_old_templates "$snap_dir"

  copy_versioned_tree
  handle_repo_local_exceptions "$snap_dir"
  handle_seed_once "$snap_dir"
  apply_overrides
  report_version_and_write_stamp

  echo "dev-workflow telepítés/frissítés kész ($TARGET_DIR, verzió: $new_version)."
}

# ORD-368: a main hívása és a kilépés EGY sorban. A szkript a versioned .claude/tools/ fa
# részeként futás közben felülírja önmagát; a sh menet közben olvassa a fájlt, és a main
# után a (már kicserélt) fájl régi bájt-pozíciójáról olvasna tovább. Az egy soros alakot a
# shell egészben beolvassa, és az exit miatt a fájlból többet nem olvas.
main "$@"; exit $?
