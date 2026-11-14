#!/usr/bin/env sh
# ORD-384 (dev-workflow 4.28.0) onellenorzes: a repolokalis agent/skill-feluliras
# (overrides.yaml) alkalmazasa a telepitoben (install-or-upgrade.sh + apply-overrides.js).
# Eldobhato, izolalt git-fogyasztoban, szintetikus fixture-csomaggal, a
# DEV_WORKFLOW_INSTALL_LOCAL_ARCHIVE teszt-horgon at -- valodi registry-hivas nelkul.
#
# Szakaszok: 1 friss telepites; 2 frontmatter-feluliras; 3 torzs-feluliras (egyezo hash);
# 4 idempotencia; 5 uj csomagverzio + frontmatter-feluliras; 6 utkozes; 7 utkozes feloldasa;
# 8 hibas yaml; 9 ismeretlen agent; 10 hianyzo torzsfajl; 11 node nelkul (csak Linuxon);
# 12 az overrides.yaml es az overrides/ tartalom bajtra valtozatlan (minden futas koruli ellenorzes).
#
# Szukseges: node (a CI-job node:22 image-en fut). Hasznalat: sh ci/verify-dev-workflow-overrides.sh
set -eu

REPO_ROOT="$(pwd)"
TOOLS_SRC="$REPO_ROOT/.claude/tools/dev-workflow-install"
INSTALLER="$TOOLS_SRC/install-or-upgrade.sh"

fail() {
  echo "SELF-CHECK HIBA: $1" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail "a node nem erheto el (ez a szkript node-os CI-jobra szol)"
test -f "$INSTALLER" || fail "nem talalhato az installer: $INSTALLER"
test -f "$REPO_ROOT/.claude/skills/dev-workflow/overrides.template.yaml" || fail "hianyzik az overrides.template.yaml"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

DEMO_REL=".claude/agents/demo.md"
OV_DIR_REL=".claude/skills/dev-workflow/overrides"
OV_YAML_REL=".claude/skills/dev-workflow/overrides.yaml"

# $1: build-konyvtar, $2: VERSION, $3: a demo.md torzsenek szovege
build_package_dir() {
  b="$1"
  rm -rf "$b"
  mkdir -p "$b/.claude/agents" "$b/.claude/skills/demo" "$b/.claude/skills/dev-workflow" "$b/.claude/tools/dev-workflow-install"
  cat > "$b/dev-workflow-manifest.json" <<'MANIFEST'
{
  "versioned": [
    ".claude/skills/",
    ".claude/agents/",
    ".claude/tools/"
  ],
  "repo_local_exceptions": [
    ".claude/skills/dev-workflow/overrides.yaml",
    ".claude/skills/dev-workflow/overrides/"
  ],
  "samples": [],
  "version_stamp": {
    "file": ".dev-workflow-version",
    "format": "semver-string",
    "written_by": "installer (ORD-384 self-check fixture)"
  }
}
MANIFEST
  printf '%s' "$2" > "$b/VERSION"
  printf -- '---\nname: demo\ndescription: Teszt\nmodel: sonnet\ntools: Read, Grep\n---\n%s\n' "$3" > "$b/$DEMO_REL"
  printf -- '---\nname: demo\ndescription: Skill\n---\nSkill torzs\n' > "$b/.claude/skills/demo/SKILL.md"
  cp "$REPO_ROOT/.claude/skills/dev-workflow/overrides.template.yaml" "$b/.claude/skills/dev-workflow/overrides.template.yaml"
  for f in apply-overrides.js overrides-yaml.js overrides-markdown.js merge-config-keys.sh; do
    cp "$TOOLS_SRC/$f" "$b/.claude/tools/dev-workflow-install/$f"
  done
}

pack_archive() {
  (cd "$1" && tar -czf "$2" .)
}

# $1: verzio, $2: a demo.md torzse
make_archive() {
  build_package_dir "$WORKDIR/pkg-$1" "$1" "$2"
  pack_archive "$WORKDIR/pkg-$1" "$WORKDIR/pkg-$1.tar.gz"
}

CONSUMER="$WORKDIR/consumer"
mkdir -p "$CONSUMER"
git -C "$CONSUMER" init -q
git -C "$CONSUMER" config user.name selfcheck
git -C "$CONSUMER" config user.email selfcheck@example.com
printf 'init\n' > "$CONSUMER/.keep"
git -C "$CONSUMER" add .keep
git -C "$CONSUMER" commit -q -m init

# 12. ellenorzes: az overrides.yaml es az overrides/ nem valtozhat a telepito futasa alatt.
ov_sum() {
  (cd "$CONSUMER" && cksum "$OV_YAML_REL" "$OV_DIR_REL"/* 2>/dev/null || true)
}

# $1: archiv; a kimenet az OUT valtozoban
run_inst() {
  before="$(ov_sum)"
  OUT="$(env DEV_WORKFLOW_INSTALL_LOCAL_ARCHIVE="$1" sh "$INSTALLER" --target-dir "$CONSUMER" 2>&1)" \
    || fail "a telepito hibaval allt le: $OUT"
  after="$(ov_sum)"
  [ -z "$before" ] || [ "$before" = "$after" ] || fail "az overrides.yaml vagy az overrides/ tartalma megvaltozott a futas alatt"
}

has() { printf '%s' "$OUT" | grep -Fq -- "$1" || fail "a kimenet nem tartalmazza: $1 -- kimenet: $OUT"; }
hasnt() { if printf '%s' "$OUT" | grep -Fq -- "$1"; then fail "a kimenet nem tartalmazhatja: $1"; fi; }

# a fajl torze (a zaro --- utani resz)
body_of() { awk 'c>=2{print} /^---$/{c++}' "$1"; }

sha_of_pkg_body() {
  node -e "
const fs=require('fs');const {splitMarkdown,sha256Hex}=require(process.argv[2]);
const r=splitMarkdown(fs.readFileSync(process.argv[1],'utf8'));
process.stdout.write(sha256Hex(r.body));" "$1" "$TOOLS_SRC/overrides-markdown.js"
}

write_yaml() { printf '%s\n' "$1" > "$CONSUMER/$OV_YAML_REL"; }

echo "1/12 -- friss telepites: overrides.yaml sablonbol, overrides/ mappa, csomagfajlok valtozatlanok"
make_archive 1.0.0 "Csomag torzs v1"
run_inst "$WORKDIR/pkg-1.0.0.tar.gz"
test -f "$CONSUMER/$OV_YAML_REL" || fail "az overrides.yaml nem jott letre"
grep -Fq 'version: 1' "$CONSUMER/$OV_YAML_REL" || fail "az overrides.yaml nem a sablon"
test -d "$CONSUMER/$OV_DIR_REL" || fail "az overrides/ mappa nem jott letre"
test -f "$CONSUMER/$OV_DIR_REL/.gitkeep" || fail "az overrides/.gitkeep hianyzik"
cmp -s "$WORKDIR/pkg-1.0.0/$DEMO_REL" "$CONSUMER/$DEMO_REL" || fail "a demo.md nem azonos a csomagbelivel"
hasnt "OVERRIDE"
git -C "$CONSUMER" add -A
git -C "$CONSUMER" commit -q -m "v1.0.0"

echo "2/12 -- frontmatter-feluliras: csak a model sor valtozik"
write_yaml "version: 1
agents:
  demo:
    frontmatter:
      model: opus"
run_inst "$WORKDIR/pkg-1.0.0.tar.gz"
has "OVERRIDE ALKALMAZVA (frontmatter): agents.demo model"
grep -Fxq 'model: opus' "$CONSUMER/$DEMO_REL" || fail "a model nem opus"
n="$(diff "$WORKDIR/pkg-1.0.0/$DEMO_REL" "$CONSUMER/$DEMO_REL" | grep -c '^[<>]' || true)"
[ "$n" = "2" ] || fail "a demo.md-ben nem pontosan 1 sor valtozott ($n diff-sor)"

echo "3/12 -- torzs-feluliras egyezo hash-sel"
sha1="$(sha_of_pkg_body "$WORKDIR/pkg-1.0.0/$DEMO_REL")"
printf 'Helyi torzs\n' > "$CONSUMER/$OV_DIR_REL/demo-body.md"
write_yaml "version: 1
agents:
  demo:
    body:
      file: demo-body.md
      base_sha256: $sha1"
run_inst "$WORKDIR/pkg-1.0.0.tar.gz"
has "OVERRIDE ALKALMAZVA (törzs): agents.demo"
[ "$(body_of "$CONSUMER/$DEMO_REL")" = "Helyi torzs" ] || fail "a torzs nem a feluliras"
grep -Fxq 'model: sonnet' "$CONSUMER/$DEMO_REL" || fail "a frontmatter nem erintetlen"

echo "4/12 -- idempotencia: ketszeri futas utan git status ures, a fajl bajtra azonos"
git -C "$CONSUMER" add -A
git -C "$CONSUMER" commit -q -m "v1.0.0 + body override"
cp "$CONSUMER/$DEMO_REL" "$WORKDIR/demo.after1"
run_inst "$WORKDIR/pkg-1.0.0.tar.gz"
run_inst "$WORKDIR/pkg-1.0.0.tar.gz"
cmp -s "$WORKDIR/demo.after1" "$CONSUMER/$DEMO_REL" || fail "a masodik futas utan a demo.md megvaltozott"
[ -z "$(git -C "$CONSUMER" status --porcelain)" ] || fail "git status nem ures: $(git -C "$CONSUMER" status --porcelain)"

echo "5/12 -- uj csomagverzio (megvaltozott torzs) + csak frontmatter-feluliras"
make_archive 1.1.0 "Csomag torzs v2"
write_yaml "version: 1
agents:
  demo:
    frontmatter:
      model: opus"
run_inst "$WORKDIR/pkg-1.1.0.tar.gz"
[ "$(body_of "$CONSUMER/$DEMO_REL")" = "Csomag torzs v2" ] || fail "az uj csomag torzse nem ervenyes"
grep -Fxq 'model: opus' "$CONSUMER/$DEMO_REL" || fail "a frontmatter-feluliras nem el tovabb"

echo "6/12 -- utkozes: a csomag torzse marad, .override-conflict, diff, figyelmeztetes, kilepokod 0"
write_yaml "version: 1
agents:
  demo:
    body:
      file: demo-body.md
      base_sha256: $sha1"
run_inst "$WORKDIR/pkg-1.1.0.tar.gz"
has "OVERRIDE ÜTKÖZÉS"
has "FIGYELEM"
has "--- "
has "+++ "
[ "$(body_of "$CONSUMER/$DEMO_REL")" = "Csomag torzs v2" ] || fail "utkozesnel nem a csomag torzse maradt"
test -f "$CONSUMER/$DEMO_REL.override-conflict" || fail "a .override-conflict nem jott letre"
cmp -s "$CONSUMER/$OV_DIR_REL/demo-body.md" "$CONSUMER/$DEMO_REL.override-conflict" || fail "a .override-conflict nem a helyi torzs"

echo "7/12 -- utkozes feloldasa a base_sha256 frissitesevel: a .override-conflict torlodik"
sha2="$(sha_of_pkg_body "$WORKDIR/pkg-1.1.0/$DEMO_REL")"
write_yaml "version: 1
agents:
  demo:
    body:
      file: demo-body.md
      base_sha256: $sha2"
run_inst "$WORKDIR/pkg-1.1.0.tar.gz"
test ! -e "$CONSUMER/$DEMO_REL.override-conflict" || fail "a regi .override-conflict nem torlodott"
[ "$(body_of "$CONSUMER/$DEMO_REL")" = "Helyi torzs" ] || fail "a feloldas utan nem a feluliras torzse van"

echo "8/12 -- hibas yaml (flow-mapping): figyelmeztetes, a telepites sikeres, a csomagfajlok erintetlenek"
write_yaml "version: 1
agents: {demo: {}}"
run_inst "$WORKDIR/pkg-1.1.0.tar.gz"
has "FIGYELEM"
cmp -s "$WORKDIR/pkg-1.1.0/$DEMO_REL" "$CONSUMER/$DEMO_REL" || fail "hibas yaml mellett a demo.md nem a csomagbeli"

echo "9/12 -- ismeretlen agent: figyelmeztetes, a tobbi bejegyzes ervenyesul"
write_yaml "version: 1
agents:
  nincs-ilyen:
    frontmatter:
      model: haiku
  demo:
    frontmatter:
      model: opus"
run_inst "$WORKDIR/pkg-1.1.0.tar.gz"
has "FIGYELEM"
has "nincs-ilyen"
grep -Fxq 'model: opus' "$CONSUMER/$DEMO_REL" || fail "az ervenyes bejegyzes nem ervenyesult"

echo "10/12 -- hianyzo torzsfajl: figyelmeztetes, a torzs a csomage, a frontmatter-feluliras ervenyes"
write_yaml "version: 1
agents:
  demo:
    frontmatter:
      model: opus
    body:
      file: nincs.md
      base_sha256: $sha2"
run_inst "$WORKDIR/pkg-1.1.0.tar.gz"
has "FIGYELEM"
[ "$(body_of "$CONSUMER/$DEMO_REL")" = "Csomag torzs v2" ] || fail "hianyzo torzsfajlnal nem a csomag torzse maradt"
grep -Fxq 'model: opus' "$CONSUMER/$DEMO_REL" || fail "a frontmatter-feluliras nem ervenyesult"

echo "11/12 -- node nelkul: figyelmeztetes, a telepites sikeres"
if [ "$(uname -s)" = "Linux" ]; then
  NONODE="$WORKDIR/nonode-bin"
  mkdir -p "$NONODE"
  for d in /usr/bin /bin /usr/local/bin; do
    [ -d "$d" ] || continue
    for f in "$d"/*; do
      b="$(basename "$f")"
      case "$b" in node|nodejs|npm|npx|corepack) continue ;; esac
      [ -e "$NONODE/$b" ] || ln -s "$f" "$NONODE/$b"
    done
  done
  write_yaml "version: 1
agents:
  demo:
    frontmatter:
      model: opus"
  OUT="$(env PATH="$NONODE" DEV_WORKFLOW_INSTALL_LOCAL_ARCHIVE="$WORKDIR/pkg-1.1.0.tar.gz" "$NONODE/sh" "$INSTALLER" --target-dir "$CONSUMER" 2>&1)" \
    || fail "node nelkul a telepito hibaval allt le: $OUT"
  has "node nem érhető el"
  grep -Fxq 'model: sonnet' "$CONSUMER/$DEMO_REL" || fail "node nelkul a csomag allapota kellene maradjon"
else
  echo "   SKIPPED (a PATH-bol a node kizarasa csak Linuxon megbizhato)"
fi

echo "12/12 -- az overrides.yaml es az overrides/ tartalom bajtra valtozatlan (a run_inst minden futast ellenorzott)"
test -f "$CONSUMER/$OV_DIR_REL/demo-body.md" || fail "az overrides/demo-body.md eltunt"
[ "$(cat "$CONSUMER/$OV_DIR_REL/demo-body.md")" = "Helyi torzs" ] || fail "az overrides/demo-body.md tartalma megvaltozott"

echo "verify-dev-workflow-overrides: minden ellenorzes zold."
