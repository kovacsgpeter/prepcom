#!/usr/bin/env sh
# COCALC-233 önellenőrzés: a .claude/tools/dev-workflow-install/install-or-upgrade.sh
# telepítő/frissítő szkript automata tesztjei — egy eldobható, izolált temp
# munkakönyvtárban/git-repóban, szintetikus (nem a valódi wordcloud-csomagból vett)
# fixture-csomaggal, a DEV_WORKFLOW_INSTALL_LOCAL_ARCHIVE teszt-horgon keresztül —
# valódi GitLab Package Registry hívás NÉLKÜL.
#
# Lefedi a ticket Teszterv "Automata" pontjait:
#   1. telepítés eldobható munkakönyvtárba + manifest szerinti útvonalak meglétének
#      ellenőrzése (versioned fa a helyén, samples NEM kerül a helyére)
#   2. upgrade után git diff --exit-code a repo-lokális kivétel-fájlokra — üres diffet
#      kell adnia
#   3. idempotencia: kétszeri upgrade (azonos verzióra) után git status --porcelain üres
#   4. a fogyasztó .gitlab-ci.yml-je (samples) érintetlen
# Bónuszként (a ticket Teszterv szerint manuális, de itt is automatizálva, mert olcsó):
#   5. MAJOR verzióváltásnál a szkript explicit figyelmeztet
#   6. ha a csomagbeli config.template.md megváltozik, config.md.new keletkezik, a
#      config.md maga változatlan marad, és a diff megjelenik a kimeneten
#   7. (COCALC-243) a fogyasztó repo CHANGELOG.md-jét a telepítő SEM létre nem hozza
#      (nincs a versioned / repo_local_exceptions ágon), SEM felül nem írja, akkor sem,
#      ha a csomag gyökerén ott a csomag-napló referencia-példánya — bájtazonos marad
#
# Használat: sh ci/verify-dev-workflow-installer.sh   (repo gyökeréből)
set -eu

REPO_ROOT="$(pwd)"
INSTALLER="$REPO_ROOT/.claude/tools/dev-workflow-install/install-or-upgrade.sh"
test -f "$INSTALLER" || { echo "SELF-CHECK HIBA: nem található az installer: $INSTALLER" >&2; exit 1; }

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

fail() {
  echo "SELF-CHECK HIBA: $1" >&2
  exit 1
}

# --- 1. szintetikus fixture-csomag felépítése egy adott verzióhoz/tartalommal ---
# $1: build-könyvtár célja, $2: VERSION, $3: foo.txt tartalma, $4: config.template.md tartalma
build_package_dir() {
  build_dir="$1"
  version="$2"
  foo_content="$3"
  config_tmpl_content="$4"

  rm -rf "$build_dir"
  mkdir -p "$build_dir/.claude/skills/dev-workflow" "$build_dir/.claude/tools/dev-workflow-install"

  cat > "$build_dir/dev-workflow-manifest.json" <<'EOF'
{
  "versioned": [
    ".claude/skills/",
    ".claude/tools/",
    "AGENTS.md"
  ],
  "repo_local_exceptions": [
    ".claude/skills/dev-workflow/config.md"
  ],
  "samples": [
    ".gitlab-ci.yml"
  ],
  "version_stamp": {
    "file": ".dev-workflow-version",
    "format": "semver-string",
    "written_by": "installer (COCALC-233 self-check fixture)"
  }
}
EOF

  printf '%s' "$version" > "$build_dir/VERSION"
  printf '%s' "$foo_content" > "$build_dir/.claude/skills/foo.txt"
  printf '%s' "$config_tmpl_content" > "$build_dir/.claude/skills/dev-workflow/config.template.md"
  # COCALC-237: a valódi merge-config-keys.sh-t is a csomagba tesszük (a versioned
  # .claude/tools/ fán), hogy a telepítő upgrade-ága meg tudja hívni a fogyasztóban.
  cp "$REPO_ROOT/.claude/tools/dev-workflow-install/merge-config-keys.sh" \
     "$build_dir/.claude/tools/dev-workflow-install/merge-config-keys.sh"
  printf 'AGENTS fixture v%s\n' "$version" > "$build_dir/AGENTS.md"
  printf 'sample gitlab-ci fixture — SOHA nem szabad a fogyasztó repoba kerulnie\n' > "$build_dir/.gitlab-ci.yml"
  # A valódi ci/build-dev-workflow-archive.sh a csomag gyökerére teszi a CHANGELOG.md-t
  # (olvasható referencia). A telepítő SEM a versioned, SEM a repo_local_exceptions ágon
  # nem nyúl hozzá -> a fogyasztó repóba nem kerül / nem íródik felül (COCALC-243 AC6).
  printf '# Changelog (csomag fixture v%s)\n' "$version" > "$build_dir/CHANGELOG.md"
}

# $1: build-könyvtár, $2: célzott tar.gz útvonal
pack_archive() {
  build_dir="$1"
  archive_path="$2"
  (cd "$build_dir" && tar -czf "$archive_path" .)
}

# --- fogyasztó repo előkészítése (izolált git repo) ---
CONSUMER="$WORKDIR/consumer-repo"
mkdir -p "$CONSUMER"
git -C "$CONSUMER" init -q
git -C "$CONSUMER" config user.name "selfcheck"
git -C "$CONSUMER" config user.email "selfcheck@example.com"
printf 'init\n' > "$CONSUMER/.keep"
git -C "$CONSUMER" add .keep
git -C "$CONSUMER" commit -q -m "init"

run_installer() {
  archive="$1"
  env DEV_WORKFLOW_INSTALL_LOCAL_ARCHIVE="$archive" \
    sh "$INSTALLER" --target-dir "$CONSUMER"
}

echo "1/7 -- friss telepites: versioned fa a helyere kerul, samples nem"
V1_BUILD="$WORKDIR/pkg-v1"
V1_ARCHIVE="$WORKDIR/pkg-v1.tar.gz"
build_package_dir "$V1_BUILD" "1.0.0" "foo v1" "# config sablon v1"
pack_archive "$V1_BUILD" "$V1_ARCHIVE"

INSTALL_OUTPUT="$(run_installer "$V1_ARCHIVE" 2>&1)" || fail "az elso (fresh install) futas hibaval leallt: $INSTALL_OUTPUT"

test -f "$CONSUMER/.claude/skills/foo.txt" || fail "a versioned fa (foo.txt) nem kerult a helyere"
test -f "$CONSUMER/AGENTS.md" || fail "az AGENTS.md (versioned) nem kerult a helyere"
test ! -e "$CONSUMER/.gitlab-ci.yml" || fail "a .gitlab-ci.yml (samples) NEM kerulhetne a fogyasztoba, de ott van"
test -f "$CONSUMER/.claude/skills/dev-workflow/config.md" || fail "a config.md sablonbol nem jott letre a friss telepitesnel"
grep -Fq "config sablon v1" "$CONSUMER/.claude/skills/dev-workflow/config.md" || fail "a config.md nem a v1 sablon tartalmat kapta"
test -f "$CONSUMER/.dev-workflow-version" || fail "a .dev-workflow-version nem jott letre"
[ "$(cat "$CONSUMER/.dev-workflow-version")" = "1.0.0" ] || fail ".dev-workflow-version nem 1.0.0-t tartalmaz"

# A felhasznalo repo-specifikus ertekekkel tolti ki a config.md-t telepites utan --
# ezt szimulaljuk, hogy az upgrade-agi "sosem irja felul" viselkedest is le tudjuk fedni.
printf '# config sablon v1\nrepo-specifikus: igen\n' > "$CONSUMER/.claude/skills/dev-workflow/config.md"

git -C "$CONSUMER" add -A
git -C "$CONSUMER" commit -q -m "fresh install v1.0.0 + repo-specifikus config.md kitoltese"

echo "2/7 -- upgrade: repo-lokalis kivetel (config.md) valtozatlan marad"
V2_BUILD="$WORKDIR/pkg-v2"
V2_ARCHIVE="$WORKDIR/pkg-v2.tar.gz"
build_package_dir "$V2_BUILD" "1.1.0" "foo v2" "# config sablon v1"
pack_archive "$V2_BUILD" "$V2_ARCHIVE"

run_installer "$V2_ARCHIVE" >/dev/null 2>&1 || fail "az upgrade (v1.1.0) futas hibaval leallt"

git -C "$CONSUMER" diff --exit-code -- .claude/skills/dev-workflow/config.md \
  || fail "a config.md (repo-lokalis kivetel) megvaltozott upgrade utan, pedig nem szabadott volna"
grep -Fq "foo v2" "$CONSUMER/.claude/skills/foo.txt" || fail "a versioned foo.txt nem frissult v2 tartalomra"
[ "$(cat "$CONSUMER/.dev-workflow-version")" = "1.1.0" ] || fail ".dev-workflow-version nem frissult 1.1.0-ra"

echo "3/7 -- upgrade utan a .gitlab-ci.yml (samples) tovabbra sem kerult a fogyasztoba"
test ! -e "$CONSUMER/.gitlab-ci.yml" || fail "a .gitlab-ci.yml az upgrade soran megjelent a fogyasztoban"

git -C "$CONSUMER" add -A
git -C "$CONSUMER" commit -q -m "upgrade to v1.1.0"

echo "4/7 -- idempotencia: ugyanarra a verziora (v1.1.0) masodszor futtatva nincs valtozas"
run_installer "$V2_ARCHIVE" >/dev/null 2>&1 || fail "a masodik, azonos-verziojú futas hibaval leallt"
PORCELAIN="$(git -C "$CONSUMER" status --porcelain)"
[ -z "$PORCELAIN" ] || fail "git status --porcelain nem ures a masodik, idempotens futas utan: $PORCELAIN"

echo "5/7 -- MAJOR verziovaltas eseten a szkript explicit figyelmeztet"
V3_BUILD="$WORKDIR/pkg-v3"
V3_ARCHIVE="$WORKDIR/pkg-v3.tar.gz"
build_package_dir "$V3_BUILD" "2.0.0" "foo v3" "# config sablon v1"
pack_archive "$V3_BUILD" "$V3_ARCHIVE"

MAJOR_OUTPUT="$(run_installer "$V3_ARCHIVE" 2>&1)" || fail "a MAJOR-bump futas hibaval leallt"
echo "$MAJOR_OUTPUT" | grep -Fq "MAJOR verzióváltás" || fail "nincs MAJOR verziovaltas figyelmeztetes a kimeneten"
git -C "$CONSUMER" add -A
git -C "$CONSUMER" commit -q -m "upgrade to v2.0.0 (MAJOR)"

echo "6/7 -- csomagbeli config sablon valtozasa eseten config.md.new keletkezik, config.md valtozatlan"
V4_BUILD="$WORKDIR/pkg-v4"
V4_ARCHIVE="$WORKDIR/pkg-v4.tar.gz"
build_package_dir "$V4_BUILD" "2.1.0" "foo v4" "# config sablon v2 - MEGVALTOZOTT"
pack_archive "$V4_BUILD" "$V4_ARCHIVE"

DRIFT_OUTPUT="$(run_installer "$V4_ARCHIVE" 2>&1)" || fail "a sablon-drift futas hibaval leallt"
echo "$DRIFT_OUTPUT" | grep -Fq "config.md.new" || fail "nincs config.md.new letrehozasi uzenet a kimeneten"
test -f "$CONSUMER/.claude/skills/dev-workflow/config.md.new" || fail "a config.md.new fizikailag nem jott letre"
grep -Fq "MEGVALTOZOTT" "$CONSUMER/.claude/skills/dev-workflow/config.md.new" || fail "a config.md.new nem az uj sablon tartalmat kapta"
grep -Fq "repo-specifikus: igen" "$CONSUMER/.claude/skills/dev-workflow/config.md" || fail "a config.md maga megvaltozott, pedig repo-lokalis kivetel"

echo "7/7 -- (COCALC-243) a fogyaszto repo CHANGELOG.md-jet a telepito nem hozza letre es nem irja felul"
# Az eddigi futasok soran a fogyaszto repoba NEM kerult CHANGELOG.md, pedig minden
# fixture-csomag gyokeren ott volt (build_package_dir). Ez bizonyitja: a telepito a
# csomag-gyokeri CHANGELOG.md-t nem teriti a fogyasztoba (nincs a versioned agon).
test ! -e "$CONSUMER/CHANGELOG.md" \
  || fail "a telepito letrehozott egy CHANGELOG.md-t a fogyaszto repoban (COCALC-243 AC6 serules)"

# Most a fogyaszto SAJAT CHANGELOG.md-t kap egy sentinel sorral; egy tovabbi upgrade
# (V4, elteroe csomag-gyokeri CHANGELOG.md-vel) utan bajtazonosnak kell maradnia.
printf '# Changelog (FOGYASZTO-SAJAT)\n\n## [9.9.9] - 2099-01-01\n- SENTINEL-SOR-NE-IRODJON-FELUL\n' \
  > "$CONSUMER/CHANGELOG.md"
git -C "$CONSUMER" add CHANGELOG.md
git -C "$CONSUMER" commit -q -m "fogyaszto-sajat CHANGELOG.md"

run_installer "$V4_ARCHIVE" >/dev/null 2>&1 || fail "a 7/7 ujra-futtatas hibaval leallt"

git -C "$CONSUMER" diff --exit-code -- CHANGELOG.md \
  || fail "a telepito felulirta a fogyaszto CHANGELOG.md-jet (COCALC-243 AC6 serules)"
grep -Fq "SENTINEL-SOR-NE-IRODJON-FELUL" "$CONSUMER/CHANGELOG.md" \
  || fail "a fogyaszto CHANGELOG.md sentinel sora eltunt"
if grep -Fq "csomag fixture v2.1.0" "$CONSUMER/CHANGELOG.md"; then
  fail "a csomag-gyokeri CHANGELOG.md tartalma beszivargott a fogyaszto CHANGELOG.md-jebe"
fi

echo "SELF -- (ORD-368) a fogyaszto SAJAT, futas kozben felulirt telepitoje 0-val zar, szintaktikai hiba nelkul"
# A fogyaszto a sajat (versioned) telepitojet futtatja, ami a futas kozben felulirja
# onmagat. A sh menet kozben olvassa a szkriptet: ha a main utan tovabb olvasna, egy
# eltero hosszusagu uj valtozat regi bajt-poziciojarol olvasna (szintaktikai hiba, 2).
# A csomagba ezert egy hosszabb telepito-valtozat kerul (a fejlecbe szurt sorokkal).
SELF_CONSUMER="$WORKDIR/self-consumer"
mkdir -p "$SELF_CONSUMER/.claude/tools/dev-workflow-install"
cp "$INSTALLER" "$SELF_CONSUMER/.claude/tools/dev-workflow-install/install-or-upgrade.sh"
build_package_dir "$WORKDIR/build-self" "1.0.0" "foo self" "config sablon self"
awk 'NR == 2 { for (i = 0; i < 200; i++) print "# kitoltes a hossz-eltereshez (ORD-368 onteszt)" } { print }' "$INSTALLER" \
  > "$WORKDIR/build-self/.claude/tools/dev-workflow-install/install-or-upgrade.sh"
pack_archive "$WORKDIR/build-self" "$WORKDIR/self.tar.gz"
rc=0
SELF_OUTPUT="$(env DEV_WORKFLOW_INSTALL_LOCAL_ARCHIVE="$WORKDIR/self.tar.gz" \
  sh "$SELF_CONSUMER/.claude/tools/dev-workflow-install/install-or-upgrade.sh" --target-dir "$SELF_CONSUMER" 2>&1)" || rc=$?
[ "$rc" = 0 ] || fail "az onmagat feluliro telepito nem 0-val zart ($rc): $(printf '%s' "$SELF_OUTPUT" | tail -3)"
if printf '%s' "$SELF_OUTPUT" | grep -qi "syntax error"; then
  fail "az onmagat feluliro telepito szintaktikai hibat irt: $(printf '%s' "$SELF_OUTPUT" | tail -3)"
fi
grep -Fq "ORD-368 onteszt" "$SELF_CONSUMER/.claude/tools/dev-workflow-install/install-or-upgrade.sh" \
  || fail "a telepito nem frissult a csomagbeli valtozatra"

# ============================================================================
# Code review 1. kör (COCALC-320, nitpick 4): regresszios fixture a
# template_rel_for() nem-.md, "van kiterjesztese" agara egy OLYAN
# repo_local_exceptions bejegyzesre, aminek NINCS *.template.* parja a csomagban -- a
# valodi dev-workflow-manifest.json ".claude/launch.json" bejegyzesenek mintajara
# (van kiterjesztese -- .json -- de nincs .claude/launch.template.json a csomagban).
# Bizonyitando: sablon nelkul a viselkedes VALTOZATLAN marad (friss telepitesnel
# KIHAGYVA + nincs iras, upgrade-kor VALTOZATLAN + nincs .new).
# ============================================================================
echo "LJ-1/2 -- sablon nelkuli repo_local_exceptions (pl. .claude/launch.json): friss telepitesnel KIHAGYVA, a cel nem jon letre"
LJ_BUILD="$WORKDIR/pkg-launch"
LJ_ARCHIVE="$WORKDIR/pkg-launch.tar.gz"
mkdir -p "$LJ_BUILD/.claude/skills"
cat > "$LJ_BUILD/dev-workflow-manifest.json" <<'EOF'
{
  "versioned": [
    ".claude/skills/",
    "AGENTS.md"
  ],
  "repo_local_exceptions": [
    ".claude/launch.json"
  ],
  "version_stamp": {
    "file": ".dev-workflow-version",
    "format": "semver-string",
    "written_by": "installer (COCALC-320 launch.json regresszios fixture)"
  }
}
EOF
printf '1.0.0\n' > "$LJ_BUILD/VERSION"
printf 'skill fixture\n' > "$LJ_BUILD/.claude/skills/foo.txt"
printf 'AGENTS fixture\n' > "$LJ_BUILD/AGENTS.md"
# SZANDEKOSAN nincs .claude/launch.template.json a csomagban -- ez a valodi
# dev-workflow-manifest.json ".claude/launch.json" bejegyzesenek mintaja.
pack_archive "$LJ_BUILD" "$LJ_ARCHIVE"

LJ_CONSUMER="$WORKDIR/consumer-launch-json"
mkdir -p "$LJ_CONSUMER"
git -C "$LJ_CONSUMER" init -q
git -C "$LJ_CONSUMER" config user.name selfcheck
git -C "$LJ_CONSUMER" config user.email selfcheck@example.com
printf 'init\n' > "$LJ_CONSUMER/.keep"
git -C "$LJ_CONSUMER" add .keep
git -C "$LJ_CONSUMER" commit -q -m init

LJ_OUT1="$(env DEV_WORKFLOW_INSTALL_LOCAL_ARCHIVE="$LJ_ARCHIVE" sh "$INSTALLER" --target-dir "$LJ_CONSUMER" 2>&1)" \
  || fail "LJ-1: a friss telepites hibaval leallt: $LJ_OUT1"
test ! -e "$LJ_CONSUMER/.claude/launch.json" \
  || fail "LJ-1: a .claude/launch.json (sablon nelkuli repo_local_exceptions) letrejott, pedig nincs sablon a csomagban"
printf '%s\n' "$LJ_OUT1" | grep -Fq 'KIHAGYVA: ".claude/launch.json"' \
  || fail "LJ-1: nincs KIHAGYVA uzenet a sablon nelkuli .claude/launch.json-ra"

git -C "$LJ_CONSUMER" add -A
git -C "$LJ_CONSUMER" commit -q -m "fresh install (no launch.json)"

echo "LJ-2/2 -- ugyanez upgrade-kor: ha a felhasznalo kezzel letrehozta, VALTOZATLAN marad, nincs .new"
printf '{"felhasznalo-sajat": true}\n' > "$LJ_CONSUMER/.claude/launch.json"
git -C "$LJ_CONSUMER" add -A
git -C "$LJ_CONSUMER" commit -q -m "user creates .claude/launch.json by hand"

LJ_BUILD2="$WORKDIR/pkg-launch-v2"
LJ_ARCHIVE2="$WORKDIR/pkg-launch-v2.tar.gz"
mkdir -p "$LJ_BUILD2/.claude/skills"
cp "$LJ_BUILD/dev-workflow-manifest.json" "$LJ_BUILD2/dev-workflow-manifest.json"
printf '1.1.0\n' > "$LJ_BUILD2/VERSION"
printf 'skill fixture v2\n' > "$LJ_BUILD2/.claude/skills/foo.txt"
printf 'AGENTS fixture\n' > "$LJ_BUILD2/AGENTS.md"
pack_archive "$LJ_BUILD2" "$LJ_ARCHIVE2"

LJ_OUT2="$(env DEV_WORKFLOW_INSTALL_LOCAL_ARCHIVE="$LJ_ARCHIVE2" sh "$INSTALLER" --target-dir "$LJ_CONSUMER" 2>&1)" \
  || fail "LJ-2: az upgrade hibaval leallt: $LJ_OUT2"
grep -Fq 'felhasznalo-sajat' "$LJ_CONSUMER/.claude/launch.json" \
  || fail "LJ-2: a felhasznalo sajat .claude/launch.json tartalma elveszett upgrade utan"
printf '%s\n' "$LJ_OUT2" | grep -Fq 'VÁLTOZATLAN (repo-lokális kivétel, a nyers tartalma nem íródott felül): .claude/launch.json' \
  || fail "LJ-2: nincs VÁLTOZATLAN uzenet a sablon nelkuli .claude/launch.json-ra upgrade utan"
test ! -e "$LJ_CONSUMER/.claude/launch.json.new" \
  || fail "LJ-2: keletkezett egy .claude/launch.json.new, pedig nincs csomagbeli sablon amihez diffelni"

echo "LJ/ OK -- sablon nelkuli, kiterjesztéses repo_local_exceptions bejegyzesnel (pl. .claude/launch.json) a viselkedes valtozatlan (KIHAGYVA / VALTOZATLAN, nincs iras)."

# ============================================================================
# COCALC-320: seed_once szemantika (.gitlab-ci.yml <- .gitlab-ci.template.yml)
# ============================================================================
# A ticket Teszterv "Automata" pontjai (a szintetikus fixture-ökön):
#   (1) friss seed: a cél (.gitlab-ci.yml) még nem létezik -> létrejön a sablonból
#   (2) drift: a cél már létezik, a csomagbeli sablon megváltozott -> <cél>.new + diff,
#       a cél maga változatlan
#   (3) meglévő-fájl védelem MÉG FRISS telepítésnél is: ha a cél MÁR LÉTEZIK (a
#       felhasználó saját .gitlab-ci.yml-jével érkezik), az ELSŐ telepítés SEM írja felül
#   (4) idempotencia: kétszeri, azonos-verziójú futás után git status --porcelain üres
#   (5) AC5: a samples-notice NEM említi a .gitlab-ci.yml-t (seed_once, nem samples)

# $1: build-könyvtár, $2: VERSION, $3: .gitlab-ci.template.yml tartalma
build_seed_once_package_dir() {
  build_dir="$1"
  version="$2"
  tmpl_content="$3"

  rm -rf "$build_dir"
  mkdir -p "$build_dir/.claude/skills/dev-workflow"

  cat > "$build_dir/dev-workflow-manifest.json" <<'EOF'
{
  "versioned": [
    ".claude/skills/",
    ".gitlab-ci.template.yml"
  ],
  "repo_local_exceptions": [
    ".claude/skills/dev-workflow/config.md"
  ],
  "samples": [
    "ci/"
  ],
  "seed_once": [
    ".gitlab-ci.yml"
  ],
  "version_stamp": {
    "file": ".dev-workflow-version",
    "format": "semver-string",
    "written_by": "installer (COCALC-320 self-check fixture)"
  }
}
EOF

  printf '%s' "$version" > "$build_dir/VERSION"
  printf 'config sablon fixture\n' > "$build_dir/.claude/skills/dev-workflow/config.template.md"
  printf '%s' "$tmpl_content" > "$build_dir/.gitlab-ci.template.yml"
}

SO_CONSUMER="$WORKDIR/consumer-seed-once"
mkdir -p "$SO_CONSUMER"
git -C "$SO_CONSUMER" init -q
git -C "$SO_CONSUMER" config user.name selfcheck
git -C "$SO_CONSUMER" config user.email selfcheck@example.com
printf 'init\n' > "$SO_CONSUMER/.keep"
git -C "$SO_CONSUMER" add .keep
git -C "$SO_CONSUMER" commit -q -m init

echo "SO-1/6 -- friss seed: a cel (.gitlab-ci.yml) meg nem letezik -> letrejon a sablonbol"
SO_V1_BUILD="$WORKDIR/so-pkg-v1"
SO_V1_ARCHIVE="$WORKDIR/so-pkg-v1.tar.gz"
build_seed_once_package_dir "$SO_V1_BUILD" "1.0.0" "sablon v1 tartalma"
pack_archive "$SO_V1_BUILD" "$SO_V1_ARCHIVE"

SO_OUT1="$(env DEV_WORKFLOW_INSTALL_LOCAL_ARCHIVE="$SO_V1_ARCHIVE" sh "$INSTALLER" --target-dir "$SO_CONSUMER" 2>&1)" \
  || fail "SO-1: a friss seed telepites hibaval leallt: $SO_OUT1"
test -f "$SO_CONSUMER/.gitlab-ci.yml" || fail "SO-1: a .gitlab-ci.yml nem jott letre a sablonbol"
grep -Fq "sablon v1 tartalma" "$SO_CONSUMER/.gitlab-ci.yml" || fail "SO-1: a .gitlab-ci.yml nem a sablon tartalmat kapta"
printf '%s\n' "$SO_OUT1" | grep -Fq "TELEPÍTVE" || fail "SO-1: nincs TELEPÍTVE uzenet a seed_once celra"

echo "SO-2/6 -- AC5: a samples-notice NEM emliti a .gitlab-ci.yml-t (seed_once, nem samples)"
printf '%s\n' "$SO_OUT1" | grep -Fxq "  - ci/" || fail "SO-2: a samples-notice nem sorolta fel a 'ci/' mintat"
printf '%s\n' "$SO_OUT1" | grep -Fxq "  - .gitlab-ci.yml" \
  && fail "SO-2: a samples-notice tevesen felsorolta a .gitlab-ci.yml-t (seed_once celnak kellene lennie, nem samples-nek)"

git -C "$SO_CONSUMER" add -A
git -C "$SO_CONSUMER" commit -q -m "fresh seed v1.0.0"

echo "SO-3/6 -- drift: a cel MAR letezik, a sablon megvaltozik -> .gitlab-ci.yml.new + diff, a cel valtozatlan"
SO_V2_BUILD="$WORKDIR/so-pkg-v2"
SO_V2_ARCHIVE="$WORKDIR/so-pkg-v2.tar.gz"
build_seed_once_package_dir "$SO_V2_BUILD" "1.1.0" "sablon v2 - MEGVALTOZOTT"
pack_archive "$SO_V2_BUILD" "$SO_V2_ARCHIVE"

SO_OUT2="$(env DEV_WORKFLOW_INSTALL_LOCAL_ARCHIVE="$SO_V2_ARCHIVE" sh "$INSTALLER" --target-dir "$SO_CONSUMER" 2>&1)" \
  || fail "SO-3: a drift-upgrade futas hibaval leallt: $SO_OUT2"
printf '%s\n' "$SO_OUT2" | grep -Fq ".gitlab-ci.yml.new" || fail "SO-3: nincs .gitlab-ci.yml.new letrehozasi uzenet"
test -f "$SO_CONSUMER/.gitlab-ci.yml.new" || fail "SO-3: a .gitlab-ci.yml.new fizikailag nem jott letre"
grep -Fq "MEGVALTOZOTT" "$SO_CONSUMER/.gitlab-ci.yml.new" || fail "SO-3: a .gitlab-ci.yml.new nem az uj sablon tartalmat kapta"
grep -Fq "sablon v1 tartalma" "$SO_CONSUMER/.gitlab-ci.yml" || fail "SO-3: a .gitlab-ci.yml maga megvaltozott, pedig seed_once cel"

git -C "$SO_CONSUMER" add -A
git -C "$SO_CONSUMER" commit -q -m "drift upgrade v1.1.0 (.gitlab-ci.yml.new keletkezett)"

echo "SO-4/6 -- idempotencia: ugyanarra a verziora (v1.1.0) masodszor futtatva nincs UJABB valtozas"
env DEV_WORKFLOW_INSTALL_LOCAL_ARCHIVE="$SO_V2_ARCHIVE" sh "$INSTALLER" --target-dir "$SO_CONSUMER" >/dev/null 2>&1 \
  || fail "SO-4: a masodik, azonos-verziojú futas hibaval leallt"
SO_PORCELAIN="$(git -C "$SO_CONSUMER" status --porcelain)"
[ -z "$SO_PORCELAIN" ] || fail "SO-4: git status --porcelain nem ures a masodik, idempotens futas utan: $SO_PORCELAIN"

echo "SO-5/6 -- meglevo-fajl vedelem MEG FRISS telepitesnel is: ha a cel MAR LETEZIK, nem irodik felul"
SO_CONSUMER2="$WORKDIR/consumer-seed-once-preexisting"
mkdir -p "$SO_CONSUMER2"
git -C "$SO_CONSUMER2" init -q
git -C "$SO_CONSUMER2" config user.name selfcheck
git -C "$SO_CONSUMER2" config user.email selfcheck@example.com
printf 'sajat, kezzel irt .gitlab-ci.yml -- MEG A CSOMAG ELOTT\n' > "$SO_CONSUMER2/.gitlab-ci.yml"
git -C "$SO_CONSUMER2" add -A
git -C "$SO_CONSUMER2" commit -q -m "sajat .gitlab-ci.yml a dev-workflow telepitese elott"

SO_OUT5="$(env DEV_WORKFLOW_INSTALL_LOCAL_ARCHIVE="$SO_V1_ARCHIVE" sh "$INSTALLER" --target-dir "$SO_CONSUMER2" 2>&1)" \
  || fail "SO-5: a friss telepites (mar letezo cellal) hibaval leallt: $SO_OUT5"
grep -Fq "sajat, kezzel irt .gitlab-ci.yml" "$SO_CONSUMER2/.gitlab-ci.yml" \
  || fail "SO-5: a MAR LETEZO .gitlab-ci.yml FELULIRODOTT egy FRISS telepitesnel, pedig seed_once cel"
printf '%s\n' "$SO_OUT5" | grep -Fq "VÁLTOZATLAN" || fail "SO-5: nincs VÁLTOZATLAN uzenet a mar letezo seed_once celra"
test ! -e "$SO_CONSUMER2/.gitlab-ci.yml.new" \
  || fail "SO-5: keletkezett egy .gitlab-ci.yml.new az elso, korabbi sablon-allapot nelkuli futasnal"

echo "SO-6/6 -- masodik upgrade UGYANAZZAL a sablonnal: nincs uj .new, a korabbi .new erintetlen"
SO_PRE_NEW="$(cat "$SO_CONSUMER/.gitlab-ci.yml.new")"
env DEV_WORKFLOW_INSTALL_LOCAL_ARCHIVE="$SO_V2_ARCHIVE" sh "$INSTALLER" --target-dir "$SO_CONSUMER" >/dev/null 2>&1 \
  || fail "SO-6: a harmadik futas hibaval leallt"
[ "$(cat "$SO_CONSUMER/.gitlab-ci.yml.new")" = "$SO_PRE_NEW" ] \
  || fail "SO-6: a korabban letrejott .gitlab-ci.yml.new tartalma megvaltozott egy azonos-verziojú ujrafutasnal"

echo "verify-dev-workflow-installer: seed_once (COCALC-320) minden ellenorzese zold."

# ============================================================================
# COCALC-237: merge-config-keys.sh — a config.md upgrade-kori kulcs-összefésülés
# ============================================================================
# A ticket Teszterv "Automata" pontjai (a szintetikus, tábla-alakú fixture-ökön):
#   (1) kitöltött config.md + új kulcsot tartalmazó sablon -> az új kulcs beszúrva az
#       alapértékkel ÉS minden korábbi érték bitre változatlan (git diff a régi sorokra üres)
#   (2) kétszer futtatva idempotens (nincs második írás)
#   (3) parse-olhatatlan config.md -> a szkript NEM ír, nem-nulla kilépőkóddal jelez
#       (a hívó telepítő ilyenkor a v1 .new + diff ágra esik)
# Továbbá: megszűnt kulcs jelzése (nem törlés), átnevezés hinttel (migrál) / hint nélkül
# (v1 fallback), egész-szekció beszúrás (a próza + tábla együtt marad), és a telepítőbe
# ágyazott integráció (handle_repo_local_exceptions upgrade-ág).

MK="$(pwd)/.claude/tools/dev-workflow-install/merge-config-keys.sh"
test -f "$MK" || fail "nem található a merge-config-keys.sh: $MK"

MW="$WORKDIR/merge"
mkdir -p "$MW"

# --- tábla-alakú mini fixture (kitöltött, "éles" config.md) ---
cat > "$MW/live.md" <<'EOF'
# mini dev-workflow config

## Alfa szekció

Bevezető próza az alfához — ennek együtt kell maradnia a táblával.

| Változó | Jelenlegi érték | Leírás |
|---|---|---|
| `ALFA_ONE` | `user-1` | Első alfa kulcs (a felhasználó átírta). |
| `ALFA_TWO` | `a2` | Második alfa kulcs. |
| `ALFA_LIST` | `x`, `y`, `user-z` | Több-tokenes értékű kulcs (a felhasználó a `z`-t átírta). |

## Profil preset

| Egyedi kapcsoló | `cheap` | `balanced` | `genius` | Ticket |
|---|---|---|---|---|
| `PRESET_X` | `user-cx` | `user-bx` | `gx` | T-1 |

## Nem kulcs-forrás tábla

| Érték | Jelentés |
|---|---|
| `on` | bekapcsolva |
| `off` | kikapcsolva |
EOF

echo "8/20 -- parser: csak a Változó/Kapcsoló/Egyedi kapcsoló fejlécű táblák kulcsai, a helyes alapértékkel"
KEYS="$(sh "$MK" --list-keys "$MW/live.md")" || fail "--list-keys nem-nulla kilépőkóddal futott"
printf '%s\n' "$KEYS" | grep -q "^ALFA_ONE	user-1	" || fail "ALFA_ONE nem a várt (kulcs<TAB>alapérték) alakban jött ki"
printf '%s\n' "$KEYS" | grep -q "^PRESET_X	user-bx	" || fail "PRESET_X alapértéke nem a 'balanced' oszlopból jött"
printf '%s\n' "$KEYS" | grep -q "^on	" && fail "az 'Érték | Jelentés' tábla NEM lehet kulcs-forrás, mégis kinyerte"
[ "$(printf '%s\n' "$KEYS" | grep -c .)" -eq 4 ] || fail "pontosan 4 kulcsot vártam (ALFA_ONE, ALFA_TWO, ALFA_LIST, PRESET_X)"

echo "9/20 -- új kulcs beszúrása MEGLÉVŐ táblába + minden korábbi érték bitre változatlan"
MG="$MW/case9"; mkdir -p "$MG"; cd "$MG"
git init -q .; git config user.name t; git config user.email t@e
cp "$MW/live.md" config.md
git add config.md; git commit -qm base
awk '1; /^\| `ALFA_TWO` \| `a2` \|/{ print "| `ALFA_THREE` | `a3` | Új, opcionális alfa kulcs. |" }' "$MW/live.md" > tmpl.md
sh "$MK" config.md tmpl.md || fail "a 9. eset merge-je nem-nulla kilépőkóddal futott"
grep -q '^| `ALFA_THREE` | `a3` |' config.md || fail "az új ALFA_THREE kulcs nem került be a config.md-be"
[ "$(git diff --numstat config.md | awk '{print $2}')" = "0" ] || fail "az összefésülés törölt/módosított sort a config.md-ben (nem csak beszúrt)"
[ "$(git diff --numstat config.md | awk '{print $1}')" = "1" ] || fail "pontosan 1 beszúrt sort vártam"
grep -q '^| `ALFA_ONE` | `user-1` |' config.md || fail "a felhasználó által állított ALFA_ONE érték megváltozott"
grep -q '^| `PRESET_X` | `user-cx` | `user-bx` | `gx` |' config.md || fail "a PRESET_X sor (benne a user-cx/user-bx érték) megváltozott"
test -f config.md.bak || fail "nem készült config.md.bak biztonsági másolat a tényleges összefésüléskor"

echo "10/20 -- idempotencia: második futás nem ír újra (git working tree tiszta a bak eltávolítása után)"
git add config.md; git commit -qm merged
rm -f config.md.bak
cp config.md ../case9-before
sh "$MK" config.md tmpl.md || fail "a második (idempotens) merge nem-nulla kilépőkóddal futott"
diff -q config.md ../case9-before >/dev/null || fail "a második merge megváltoztatta a config.md-t (nem idempotens)"
test ! -e config.md.bak || fail "a második, no-op futás mégis készített config.md.bak-ot"

echo "11/20 -- parse-olhatatlan config.md: nincs írás, nem-nulla kilépőkód (v1 fallback jelzés)"
cd "$MW"
printf 'csak sima szoveg\nnincs benne tabla\n' > unparse.md
cp unparse.md unparse-before.md
if sh "$MK" unparse.md live.md; then fail "parse-olhatatlan config.md mellett a merge 0-val tért vissza (v1 fallbacknek kellene)"; fi
diff -q unparse.md unparse-before.md >/dev/null || fail "parse-olhatatlan config.md-t a merge mégis módosított"

echo "12/20 -- megszűnt kulcs: NEM törlődik, viszont a kimenet jelzi hogy eltávolítható"
MG="$MW/case12"; mkdir -p "$MG"; cd "$MG"
cp "$MW/live.md" config.md
grep -v 'ALFA_TWO' "$MW/live.md" > tmpl.md
OUT="$(sh "$MK" config.md tmpl.md)" || fail "a 12. eset merge-je nem-nulla kilépőkóddal futott"
grep -q '^| `ALFA_TWO` | `a2` |' config.md || fail "az ALFA_TWO kulcs törlődött a config.md-ből (nem szabadna)"
printf '%s\n' "$OUT" | grep -q 'ALFA_TWO' || fail "a kimenet nem jelezte a megszűnt ALFA_TWO kulcsot"
test ! -e config.md.bak || fail "megszűnt-kulcs-only esetben (nincs tartalmi változás) nem kéne config.md.bak"

echo "13/20 -- átnevezés HINT-tel: az érték migrál az új kulcs sorába, egyetlen bejegyzés"
MG="$MW/case13"; mkdir -p "$MG"; cd "$MG"
cp "$MW/live.md" config.md
sed 's/`ALFA_ONE`/`ALFA_PRIME`/g' "$MW/live.md" > tmpl.md
printf '\n<!-- dev-workflow:rename ALFA_ONE -> ALFA_PRIME since=9.0.0 -->\n' >> tmpl.md
sh "$MK" config.md tmpl.md || fail "a hinttel jelölt átnevezés merge-je nem-nulla kilépőkóddal futott"
grep -q 'ALFA_ONE' config.md && fail "a régi ALFA_ONE kulcs bennmaradt átnevezés után"
grep -q '^| `ALFA_PRIME` | `user-1` |' config.md || fail "az ALFA_PRIME nem a migrált (user-1) értéket kapta"
[ "$(grep -c '`ALFA_PRIME`' config.md)" -eq 1 ] || fail "az ALFA_PRIME kulcs több sorban jelent meg (duplikáció)"

echo "14/20 -- átnevezés-gyanú HINT NÉLKÜL (1 add + 1 remove ugyanabban a szekcióban): v1 fallback, config.md érintetlen"
MG="$MW/case14"; mkdir -p "$MG"; cd "$MG"
cp "$MW/live.md" config.md
cp config.md config-before.md
sed 's/`ALFA_ONE`/`ALFA_RENAMED`/g' "$MW/live.md" > tmpl.md   # nincs rename-hint
if sh "$MK" config.md tmpl.md; then fail "hint nélküli átnevezés-gyanú mellett a merge 0-val tért vissza (v1 fallbacknek kellene)"; fi
diff -q config.md config-before.md >/dev/null || fail "hint nélküli átnevezés-gyanúnál a merge mégis módosította a config.md-t"

echo "15/20 -- egész-szekció beszúrás: vadonatúj szekció kulccsal, a magyarázó próza együtt jön a táblával"
MG="$MW/case15"; mkdir -p "$MG"; cd "$MG"
git init -q .; git config user.name t; git config user.email t@e
cp "$MW/live.md" config.md
git add config.md; git commit -qm base
awk '
/^## Profil preset/ && !d {
  print "## Beta szekció"
  print ""
  print "Beta bevezető próza — ez a mondat NEM eshet el az összefésülésnél."
  print ""
  print "| Változó | Jelenlegi érték | Leírás |"
  print "|---|---|---|"
  print "| `BETA_ONE` | `b1` | Beta kulcs egy új szekcióban. |"
  print ""
  d=1
}
{ print }
' "$MW/live.md" > tmpl.md
sh "$MK" config.md tmpl.md || fail "az egész-szekció beszúrás merge-je nem-nulla kilépőkóddal futott"
grep -q '^## Beta szekció' config.md || fail "az új 'Beta szekció' cím nem került be"
grep -q 'Beta bevezető próza' config.md || fail "az új szekció magyarázó prózája nem került be (a próza elesett)"
[ "$(grep -c '`BETA_ONE`' config.md)" -eq 1 ] || fail "a BETA_ONE kulcs nem pontosan egyszer került be"
sh "$MK" --list-keys config.md | grep -q '^BETA_ONE	b1	' || fail "a beszúrt BETA_ONE nem olvasható vissza a parserrel (round-trip bukott)"

cd "$REPO_ROOT"
echo "16/20 -- telepítő-integráció: upgrade-kor a config.md sablon-változás ÖSSZEFÉSÜLÉSSEL zárul (nem .new)"
V5_BUILD="$WORKDIR/pkg-v5"
V5_ARCHIVE="$WORKDIR/pkg-v5.tar.gz"
build_package_dir "$V5_BUILD" "2.2.0" "foo v5" "$(cat "$MW/live.md")"
pack_archive "$V5_BUILD" "$V5_ARCHIVE"
# friss fogyasztó, hogy a config.md a tábla-alakú sablonból jöjjön létre
CONSUMER2="$WORKDIR/consumer-repo-2"
mkdir -p "$CONSUMER2"; git -C "$CONSUMER2" init -q
git -C "$CONSUMER2" config user.name selfcheck; git -C "$CONSUMER2" config user.email s@e
printf 'init\n' > "$CONSUMER2/.keep"; git -C "$CONSUMER2" add .keep; git -C "$CONSUMER2" commit -qm init
env DEV_WORKFLOW_INSTALL_LOCAL_ARCHIVE="$V5_ARCHIVE" sh "$INSTALLER" --target-dir "$CONSUMER2" >/dev/null 2>&1 \
  || fail "a 16. eset friss telepitese hibaval leallt"
test -f "$CONSUMER2/.claude/tools/dev-workflow-install/merge-config-keys.sh" \
  || fail "a merge-config-keys.sh nem került ki a fogyasztóba (a versioned .claude/tools/ fán kellene)"
printf '%s\n' "| \`ALFA_ONE\` | \`user-1\` | Első alfa kulcs (a felhasználó átírta). |" >/dev/null
# user átírja az egyik értéket, majd jön egy új kulcsot hozó sablon-verzió
sed -i 's/`ALFA_TWO` | `a2`/`ALFA_TWO` | `KONSUMER-ERTEK`/' "$CONSUMER2/.claude/skills/dev-workflow/config.md"
git -C "$CONSUMER2" add -A; git -C "$CONSUMER2" commit -qm "v2.2.0 + user config"
V6_BUILD="$WORKDIR/pkg-v6"
V6_ARCHIVE="$WORKDIR/pkg-v6.tar.gz"
awk '1; /^\| `ALFA_TWO` \|/{ print "| `ALFA_FOUR` | `a4` | Upgrade-ben érkezett új kulcs. |" }' "$MW/live.md" > "$WORKDIR/tmpl-v6.md"
build_package_dir "$V6_BUILD" "2.3.0" "foo v6" "$(cat "$WORKDIR/tmpl-v6.md")"
pack_archive "$V6_BUILD" "$V6_ARCHIVE"
INT_OUT="$(env DEV_WORKFLOW_INSTALL_LOCAL_ARCHIVE="$V6_ARCHIVE" sh "$INSTALLER" --target-dir "$CONSUMER2" 2>&1)" \
  || fail "a 16. eset upgrade-je hibaval leallt"
printf '%s\n' "$INT_OUT" | grep -Fq "ÖSSZEFÉSÜLVE" || fail "az upgrade nem jelzett ÖSSZEFÉSÜLVE-t (a merge-ág nem futott le a telepítőben)"
grep -q '^| `ALFA_FOUR` | `a4` |' "$CONSUMER2/.claude/skills/dev-workflow/config.md" \
  || fail "az upgrade-ben érkezett ALFA_FOUR kulcs nem került be a fogyasztó config.md-jébe"
grep -q '`ALFA_TWO` | `KONSUMER-ERTEK`' "$CONSUMER2/.claude/skills/dev-workflow/config.md" \
  || fail "az upgrade felülírta a fogyasztó által állított ALFA_TWO értéket"
test ! -e "$CONSUMER2/.claude/skills/dev-workflow/config.md.new" \
  || fail "az upgrade config.md.new-t készített, pedig az összefésülésnek sikerülnie kellett"

cd "$MW"
echo "17/20 -- átnevezés HINT-tel: több-tokenes érték + preset MINDHÁROM oszlop nyersen migrál (nem csonkul)"
MG="$MW/case17"; mkdir -p "$MG"; cd "$MG"
cp "$MW/live.md" config.md
# ALFA_LIST -> ALFA_ITEMS (több-tokenes érték), PRESET_X -> PRESET_Y (3 oszlop) — mindkettőhöz hint
sed -e 's/`ALFA_LIST`/`ALFA_ITEMS`/g' -e 's/`PRESET_X`/`PRESET_Y`/g' "$MW/live.md" > tmpl.md
{
  printf '\n<!-- dev-workflow:rename ALFA_LIST -> ALFA_ITEMS since=9.0.0 -->\n'
  printf '<!-- dev-workflow:rename PRESET_X -> PRESET_Y since=9.0.0 -->\n'
} >> tmpl.md
sh "$MK" config.md tmpl.md || fail "a 17. eset (több-tokenes/preset átnevezés) merge-je nem-nulla kilépőkóddal futott"
grep -q '^| `ALFA_ITEMS` | `x`, `y`, `user-z` | Több-tokenes értékű kulcs' config.md \
  || fail "az ALFA_ITEMS értékcellája csonkult (nem a teljes 'x, y, user-z' + leírás jött át)"
grep -q '^| `PRESET_Y` | `user-cx` | `user-bx` | `gx` |' config.md \
  || fail "a PRESET_Y nem őrizte meg mind a 3 élő oszlopot (user-cx / user-bx / gx)"
grep -q 'ALFA_LIST\|PRESET_X' config.md && fail "régi kulcsnév bennmaradt a 17. eset átnevezése után"

cd "$MW"
echo "18/20 -- CRLF config.md: a merge megőrzi a CRLF sorvéget, csak a beszúrt sor a diff (nem az egész fájl LF-re)"
MG="$MW/case18"; mkdir -p "$MG"; cd "$MG"
git init -q .; git config user.name t; git config user.email t@e
git config core.autocrlf false
# CRLF sorvégű config.md (a busybox/GNU eltérések elkerülésére tr+paste helyett sed):
sed 's/$/\r/' "$MW/live.md" > config.md
git add config.md; git commit -qm base
awk '1; /^\| `ALFA_TWO` \| `a2` \|/{ print "| `ALFA_CRLF` | `c1` | CRLF-teszt kulcs. |" }' "$MW/live.md" > tmpl.md
sh "$MK" config.md tmpl.md || fail "a CRLF eset merge-je nem-nulla kilépőkóddal futott"
cr_cnt="$(tr -cd '\r' < config.md | wc -c | tr -d ' ')"
nl_cnt="$(tr -cd '\n' < config.md | wc -c | tr -d ' ')"
[ "$cr_cnt" != "0" ] || fail "a merge után a config.md elvesztette a CRLF sorvéget (0 CR)"
[ "$cr_cnt" = "$nl_cnt" ] || fail "a merge után a config.md nem tisztán CRLF (CR=$cr_cnt, LF=$nl_cnt) — LF-re váltott sor(ok)"
[ "$(git diff --numstat config.md | awk '{print $1" "$2}')" = "1 0" ] \
  || fail "CRLF config.md-nél a git diff nem pontosan 1 beszúrt / 0 törölt sor (az egész fájl sorvége átíródott?)"
grep -q 'ALFA_CRLF' config.md || fail "a beszúrt ALFA_CRLF kulcs nem került be a CRLF config.md-be"

cd "$MW"
echo "19/20 -- rename-hint robusztusság: since=-es hint felismerése, 'zajos' A -> B komment NEM hint"
MG="$MW/case19"; mkdir -p "$MG"; cd "$MG"
cp "$MW/live.md" config.md
# ALFA_TWO -> ALFA_BIS: hinttel (since=-es formában). + egy zajos, 'rename' nélküli
# 'X -> Y' HTML-komment a sablon máshol -> NEM számíthat hintnek.
sed 's/`ALFA_TWO`/`ALFA_BIS`/g' "$MW/live.md" > tmpl.md
{
  printf '\n<!-- ez csak egy megjegyzes: FOO -> BAR atalakitas kesobb -->\n'
  printf '<!-- dev-workflow:rename ALFA_TWO -> ALFA_BIS since=9.1.0 -->\n'
} >> tmpl.md
sh "$MK" config.md tmpl.md || fail "a 19. eset (since=-es hint) merge-je nem-nulla kilépőkóddal futott"
grep -q 'ALFA_TWO' config.md && fail "az ALFA_TWO nem lett átnevezve (a since=-es hintet nem ismerte fel)"
grep -q '^| `ALFA_BIS` | `a2` |' config.md || fail "az ALFA_BIS nem a migrált (a2) értéket kapta"
[ "$(grep -c '`ALFA_BIS`' config.md)" -eq 1 ] || fail "az ALFA_BIS duplikálódott (a zajos FOO -> BAR komment is hintnek számított?)"

cd "$MW"
echo "20/20 -- Markdown-escapelt cső (\\|) az érintett cellában rename-nél -> v1 fallback, config.md érintetlen"
MG="$MW/case20"; mkdir -p "$MG"; cd "$MG"
cat > config.md <<'EOF'
# mini

## Alfa szekció

| Változó | Jelenlegi érték | Leírás |
|---|---|---|
| `PIPE_KEY` | `bal \| jobb` | Escapelt csövet tartalmazó értékcella. |
| `PLAIN_KEY` | `p1` | Sima kulcs. |
EOF
cp config.md config-before.md
sed 's/`PIPE_KEY`/`PIPE_KEY_NEW`/g' config.md > tmpl.md
printf '\n<!-- dev-workflow:rename PIPE_KEY -> PIPE_KEY_NEW since=9.2.0 -->\n' >> tmpl.md
if sh "$MK" config.md tmpl.md; then fail "escapelt csöves cella rename-jénél a merge 0-val tért vissza (v1 fallbacknek kellene)"; fi
diff -q config.md config-before.md >/dev/null || fail "escapelt csöves rename-nél a merge mégis módosította a config.md-t"

cd "$REPO_ROOT"

# --- ORD-368: kulcs nélküli új szekció és a legközelebbi létező előd -----------------
# A sablon az Alfa szekció után egy kulcs nélküli értéktáblát és egy új, kulcsos szekciót kap.
awk '
/^## Profil preset/ && !d {
  print "### Alfa értékek"
  print ""
  print "| Érték | Jelentés |"
  print "|---|---|"
  print "| `egy` | Gamma-próza: az értéktábla első sora. |"
  print ""
  print "## Delta szekció"
  print ""
  print "| Változó | Jelenlegi érték | Leírás |"
  print "|---|---|---|"
  print "| `DELTA_ONE` | `d1` | Delta kulcs. |"
  print ""
  d=1
}
{ print }
' "$MW/live.md" > "$MW/tmpl-ord368.md"

echo "21/24 -- (ORD-368) régi sablonnal: a kulcs nélküli új szekció is bekerül, a meglévő sorok változatlanok"
MG="$MW/case21"; mkdir -p "$MG"; cd "$MG"
cp "$MW/live.md" config.md
sh "$MK" config.md "$MW/tmpl-ord368.md" "$MW/live.md" >/dev/null || fail "a régi sablonos merge nem-nulla kilépőkóddal futott"
[ "$(grep -c '^### Alfa értékek' config.md)" -eq 1 ] || fail "a kulcs nélküli 'Alfa értékek' szekció nem pontosan egyszer került be"
grep -q 'Gamma-próza' config.md || fail "a kulcs nélküli szekció táblája nem került be"
[ "$(diff "$MW/live.md" config.md | grep -c '^<')" -eq 0 ] || fail "a merge meglévő sort törölt vagy módosított"

echo "22/24 -- (ORD-368) két egymást követő új szekció: a második a legközelebbi LÉTEZŐ előd után kerül be (nem v1 fallback)"
a=$(grep -n '^### Alfa értékek' config.md | cut -d: -f1); b=$(grep -n '^## Delta szekció' config.md | cut -d: -f1)
[ -n "$a" ] && [ -n "$b" ] && [ "$a" -lt "$b" ] || fail "az új szekciók nincsenek meg, vagy rossz sorrendben ($a, $b)"
[ "$(grep -c '`DELTA_ONE`' config.md)" -eq 1 ] || fail "a DELTA_ONE kulcs nem pontosan egyszer került be"
MG="$MW/case22"; mkdir -p "$MG"; cd "$MG"
cp "$MW/live.md" config.md
sh "$MK" config.md "$MW/tmpl-ord368.md" >/dev/null 2>&1 || fail "régi sablon nélkül a Delta szekció beszúrása bukott (a közvetlen előd hiányzik)"
grep -q '^## Delta szekció' config.md || fail "régi sablon nélkül a Delta szekció nem került be"

echo "23/24 -- (ORD-368) két argumentummal a kulcs nélküli szekció a korábbi módon kimarad"
grep -q '^### Alfa értékek' config.md && fail "két argumentummal is bekerült a kulcs nélküli szekció (a régi viselkedésnek kellene)"

echo "24/24 -- (ORD-368) a repóban átnevezett, a régi sablonban is meglévő szekció nem duplikálódik"
MG="$MW/case24"; mkdir -p "$MG"; cd "$MG"
sed 's/^## Alfa szekció$/## Alfa szekció (helyi)/' "$MW/live.md" > config.md
cp config.md config-before.md
sh "$MK" config.md "$MW/live.md" "$MW/live.md" >/dev/null || fail "az átnevezett szekciós merge nem-nulla kilépőkóddal futott"
diff -q config.md config-before.md >/dev/null || fail "az átnevezett (régi sablonban is meglévő) szekció újra bekerült"

cd "$REPO_ROOT"
echo "verify-dev-workflow-installer: minden ellenorzes zold."
