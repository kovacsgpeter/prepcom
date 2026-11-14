#!/usr/bin/env sh
# COCALC-232 önellenőrzés: a dev-workflow csomag publikálásának két szállítandója —
#   (1) ci/build-dev-workflow-archive.sh  — a manifest-vezérelt tar.gz-építő,
#   (2) ci/verify-dev-workflow-version-bump.sh — a verzió-kényszerítő guard,
# és a .gitlab-ci.yml-ben lévő publish / version-check job-ok struktúrája.
#
# Nincs új teszt-keretrendszer: a meglévő ci/verify-dev-workflow-installer.sh /
# ci/verify-dev-workflow-manifest.sh mintájára sima sh + assert-szerű grep/egyenlőség-
# ellenőrzések, izolált `mktemp -d` temp-repókban, VALÓDI GitLab Package Registry hívás
# NÉLKÜL.
#
# Lefedi a ticket Teszterv "Automata" pontjait:
#   A. az archívum-építő: versioned fa a csomagban, repo_local_exceptions (config.md,
#      history.md, launch.json) NEM, samples NEM; a kicsomagolt archívum nem tartalmaz
#      valós repo-path-ot és bare Jira project key-t (a COCALC-nnn citáció megengedett).
#   B. a verzió-guard: (1) módosított versioned fájl + változatlan VERSION -> nem-nulla
#      exit a változott fájl nevével + MAJOR-hivatkozással; (2) ugyanez emelt VERSION-nel
#      -> 0; (3) csak nem-versioned fájl változott -> 0; (4) csökkentett VERSION -> nem-0;
#      (5) hiányzó bázis-VERSION -> figyelmeztet + 0.
#   C. .gitlab-ci.yml: a publish job csak default branchen (manual), nincs RUN_HEAVY_JOBS
#      -őr rajta (COCALC-227 .claude/** kizárás rá nem hat); a version-check job feltétel
#      nélküli (nincs `when: never`), és a ci/ szkripteket hívja, nem inline YAML-logikát.
#
# Használat: sh ci/verify-dev-workflow-publish.sh   (repo gyökeréből)
set -eu

REPO_ROOT="$(pwd)"
BUILD_SCRIPT="$REPO_ROOT/ci/build-dev-workflow-archive.sh"
GUARD_SCRIPT="$REPO_ROOT/ci/verify-dev-workflow-version-bump.sh"
CI_FILE="$REPO_ROOT/.gitlab-ci.yml"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

fail() {
  echo "SELF-CHECK HIBA: $1" >&2
  exit 1
}

# =====================================================================================
# A. ci/build-dev-workflow-archive.sh — archívum-tartalom
# =====================================================================================
echo "A/ archívum-építő: versioned igen, repo_local_exceptions/samples nem, nincs valós érték"

test -f "$BUILD_SCRIPT" || fail "hiányzik a build szkript: $BUILD_SCRIPT"

FIX="$WORKDIR/fixture-repo"
mkdir -p "$FIX/.claude/skills/dev-workflow" "$FIX/.claude/agents" "$FIX/.agents/skills/dev-workflow"

cat > "$FIX/dev-workflow-manifest.json" <<'EOF'
{
  "versioned": [
    ".claude/skills/",
    ".claude/agents/",
    ".agents/skills/",
    "AGENTS.md",
    ".gitlab-ci.template.yml",
    "ci/verify-example.sh"
  ],
  "repo_local_exceptions": [
    ".claude/skills/dev-workflow/config.md",
    ".agents/skills/dev-workflow/config.md",
    ".claude/skills/dev-workflow/history.md",
    ".claude/launch.json",
    ".claude/skills/local-skill/"
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
    "written_by": "installer (COCALC-232 self-check fixture)"
  }
}
EOF

printf '9.9.9\n' > "$FIX/VERSION"
printf '# changelog fixture\n' > "$FIX/CHANGELOG.md"

# versioned tartalom — köztük a repo_local_exceptions valós fájljai (VALÓS értékekkel),
# amiknek KI KELL maradniuk, és a *.template.md sablonok, amiknek BENN kell maradniuk.
printf 'REÁLIS repo path: F:\\dev\\repos\\wordcloud, Jira key: COCALC\n' \
  > "$FIX/.claude/skills/dev-workflow/config.md"
printf 'REÁLIS history a wordcloud repóból, COCALC-projekt\n' \
  > "$FIX/.claude/skills/dev-workflow/history.md"
printf 'placeholder: <REPO_PATH>, <JIRA_PROJECT_KEY> — bevezette (COCALC-232)\n' \
  > "$FIX/.claude/skills/dev-workflow/config.template.md"
printf 'REÁLIS agents config: F:\\dev\\repos\\wordcloud / COCALC\n' \
  > "$FIX/.agents/skills/dev-workflow/config.md"
printf 'valódi skill-logika, hordozható, ld. (COCALC-218)\n' \
  > "$FIX/.claude/skills/dev-workflow/SKILL.md"
printf 'reviewer subagent — (COCALC-270) nyers-lelet szerződés\n' \
  > "$FIX/.claude/agents/code-reviewer.md"
printf 'AGENTS fixture\n' > "$FIX/AGENTS.md"
printf 'ez a seed_once cél .gitlab-ci.yml — SOHA nem kerülhet a csomagba\n' > "$FIX/.gitlab-ci.yml"
printf 'launch fixture\n' > "$FIX/.claude/launch.json"
# ORD-506: könyvtár-kivétel (`…/`): az alatta lévő repó-lokális skill nem kerülhet a csomagba;
# az azonos előtagú, de más könyvtár (local-skill-x/) viszont igen (prefix-csapda).
mkdir -p "$FIX/.claude/skills/local-skill/sub" "$FIX/.claude/skills/local-skill-x"
printf 'repó-lokális skill\n' > "$FIX/.claude/skills/local-skill/SKILL.md"
printf 'repó-lokális skill, mélyebb fájl\n' > "$FIX/.claude/skills/local-skill/sub/tool.mjs"
printf 'csomag-skill azonos előtaggal\n' > "$FIX/.claude/skills/local-skill-x/SKILL.md"

# COCALC-320 (AC7): a generikus CI-sablon maga VERSIONED (mindig frissül a csomaggal) —
# a belőle sarjadó, repo-lokális .gitlab-ci.yml (fent) a seed_once szemantikát követi és
# NEM kerül a csomagba. Egy KONKRÉT, egyedi ci/ fájl (nem a teljes ci/ könyvtár) szintén
# felvehető a "versioned" listára a "samples" ci/-kizárás MELLETT — ez bizonyítja, hogy a
# samples/versioned nem kölcsönösen kizáró a KÖNYVTÁR és az ALATTA LÉVŐ EGYEDI FÁJL szintjén.
mkdir -p "$FIX/ci"
printf 'generikus, VERSIONED ci/ szkript — a csomagba kell kerülnie\n' > "$FIX/ci/verify-example.sh"
printf 'wordcloud-specifikus, csak SAMPLES szkript — nem kerülhet a csomagba\n' \
  > "$FIX/ci/product-specific-smoke.sh"
printf 'generikus CI-sablon (versioned), semmilyen konkrét repo-útvonal nélkül\n' \
  > "$FIX/.gitlab-ci.template.yml"

OUT="$WORKDIR/dev-workflow-9.9.9.tar.gz"
( cd "$FIX" && sh "$BUILD_SCRIPT" --target-dir "$FIX" --output "$OUT" ) >/dev/null 2>&1 \
  || fail "a build-dev-workflow-archive.sh nem-nulla exittel állt le a fixture-ön"

test -f "$OUT" || fail "az archívum nem jött létre: $OUT"

EXTRACT="$WORKDIR/extract"
mkdir -p "$EXTRACT"
tar -xzf "$OUT" -C "$EXTRACT" || fail "nem sikerült kicsomagolni az archívumot"

# --- csomag-gyökér: a telepítő ezeket várja ---
test -f "$EXTRACT/dev-workflow-manifest.json" || fail "a csomagból hiányzik a dev-workflow-manifest.json"
test -f "$EXTRACT/VERSION" || fail "a csomagból hiányzik a VERSION"

# --- versioned fa: BENN ---
test -f "$EXTRACT/.claude/skills/dev-workflow/SKILL.md" || fail "a versioned SKILL.md nincs a csomagban"
test -f "$EXTRACT/.claude/agents/code-reviewer.md" || fail "a versioned code-reviewer.md nincs a csomagban"
test -f "$EXTRACT/AGENTS.md" || fail "az AGENTS.md (versioned) nincs a csomagban"
test -f "$EXTRACT/.claude/skills/dev-workflow/config.template.md" \
  || fail "a config.template.md (sablon, versioned) nincs a csomagban"
test -f "$EXTRACT/.gitlab-ci.template.yml" \
  || fail "a .gitlab-ci.template.yml (versioned) nincs a csomagban"
test -f "$EXTRACT/ci/verify-example.sh" \
  || fail "az egyedileg versioned ci/verify-example.sh nincs a csomagban"

# --- repo_local_exceptions: KI ---
test ! -e "$EXTRACT/.claude/skills/dev-workflow/config.md" \
  || fail "a config.md (repo_local_exceptions) BENNE van a csomagban, pedig nem szabadna"
test ! -e "$EXTRACT/.agents/skills/dev-workflow/config.md" \
  || fail "a .agents config.md (repo_local_exceptions) BENNE van a csomagban"
test ! -e "$EXTRACT/.claude/skills/dev-workflow/history.md" \
  || fail "a history.md (repo_local_exceptions) BENNE van a csomagban"
test ! -e "$EXTRACT/.claude/launch.json" \
  || fail "a .claude/launch.json (repo_local_exceptions) BENNE van a csomagban"
test ! -e "$EXTRACT/.claude/skills/local-skill/SKILL.md" \
  || fail "a .claude/skills/local-skill/ (könyvtár-kivétel) fájlja BENNE van a csomagban"
test ! -e "$EXTRACT/.claude/skills/local-skill/sub/tool.mjs" \
  || fail "a .claude/skills/local-skill/ (könyvtár-kivétel) mélyebb fájlja BENNE van a csomagban"
test -f "$EXTRACT/.claude/skills/local-skill-x/SKILL.md" \
  || fail "a .claude/skills/local-skill-x/ (NEM kivétel, csak azonos előtag) hiányzik a csomagból"

# --- samples: KI (a "ci" könyvtár MAGA létezik a csomagban, hisz egy egyedi fájlja
# versioned — de a samples-only, NEM versioned fájlja nem kerülhet bele) ---
test ! -e "$EXTRACT/.gitlab-ci.yml" || fail "a .gitlab-ci.yml (seed_once cél) BENNE van a csomagban"
test ! -e "$EXTRACT/ci/product-specific-smoke.sh" \
  || fail "a samples-only ci/product-specific-smoke.sh BENNE van a csomagban"

# --- nincs valós repo-path a kicsomagolt fában ---
if grep -rIl 'repos[/\\]wordcloud' "$EXTRACT" >/dev/null 2>&1; then
  grep -rInl 'repos[/\\]wordcloud' "$EXTRACT" >&2
  fail "a kicsomagolt archívum valós repo-path-ot ('...repos/wordcloud') tartalmaz"
fi

# --- nincs bare Jira project key. Ugyanaz a minta, mint a ci/verify-dev-workflow-archive-
# clean.sh-ban: bal oldali szó-határ + 'COCALC', ha NEM '-<szám>' követi. Megengedett a
# ticketszámos citáció (pl. 'COCALC-232'); buktat az önálló 'COCALC' és a hibás
# 'COCALC-<nem-szám>'; nem buktat nagyobb token belsejében (pl. 'MYCOCALCX'). ---
COC_PATTERN='(^|[^A-Za-z0-9])COCALC(-[^0-9]|[^-A-Za-z0-9]|$)'
if grep -rInE "$COC_PATTERN" "$EXTRACT" >/dev/null 2>&1; then
  grep -rInE "$COC_PATTERN" "$EXTRACT" >&2
  fail "a kicsomagolt archívum bare 'COCALC' project key-t tartalmaz (nem citáció-forma)"
fi

echo "A/ OK — az archívum-építő a manifest szerint terít, és nincs benne valós érték."

# =====================================================================================
# B. ci/verify-dev-workflow-version-bump.sh — verzió-kényszerítő guard
# =====================================================================================
echo
echo "B/ verzió-guard: versioned változás VERSION-bump nélkül -> nem-nulla exit; egyébként 0"

test -f "$GUARD_SCRIPT" || fail "hiányzik a verzió-guard szkript: $GUARD_SCRIPT"

FIXG="$WORKDIR/version-guard-repo"
mkdir -p "$FIXG/.claude/skills/dev-workflow"
git -C "$FIXG" init -q
git -C "$FIXG" config user.name selfcheck
git -C "$FIXG" config user.email selfcheck@example.com
git -C "$FIXG" config commit.gpgsign false
git -C "$FIXG" config core.autocrlf false

cat > "$FIXG/dev-workflow-manifest.json" <<'EOF'
{
  "versioned": [
    ".claude/skills/",
    "AGENTS.md"
  ],
  "repo_local_exceptions": [
    ".claude/skills/dev-workflow/config.md",
    ".claude/skills/local-skill/"
  ],
  "samples": [
    ".gitlab-ci.yml"
  ],
  "version_stamp": { "file": ".dev-workflow-version", "format": "semver-string", "written_by": "fixture" }
}
EOF
printf '2.0.0\n' > "$FIXG/VERSION"
printf 'AGENTS fixture\n' > "$FIXG/AGENTS.md"
printf 'skill fixture v1\n' > "$FIXG/.claude/skills/dev-workflow/impl.md"
mkdir -p "$FIXG/.claude/skills/local-skill"
printf 'local skill v1\n' > "$FIXG/.claude/skills/local-skill/SKILL.md"
printf '# readme\n' > "$FIXG/README.md"
git -C "$FIXG" add -A
git -C "$FIXG" commit -qm "base"
BASE_SHA="$(git -C "$FIXG" rev-parse HEAD)"

run_guard() {
  # $1: bázis-ref, kimenet: exit-kód a $GUARD_EXIT-be, stderr a $GUARD_ERR fájlba
  GUARD_ERR="$WORKDIR/guard.err"
  set +e
  ( cd "$FIXG" && DEV_WORKFLOW_VERSION_BUMP_BASE_REF="$1" sh "$GUARD_SCRIPT" ) \
    >/dev/null 2>"$GUARD_ERR"
  GUARD_EXIT=$?
  set -e
}

# --- B1: versioned fájl változott, VERSION változatlan -> HIBA (nem-nulla exit) ---
printf 'skill fixture v2 — MODOSITVA\n' > "$FIXG/.claude/skills/dev-workflow/impl.md"
git -C "$FIXG" add -A && git -C "$FIXG" commit -qm "versioned change, no bump"
run_guard "$BASE_SHA"
[ "$GUARD_EXIT" -ne 0 ] || fail "B1: a guard 0-val tért vissza, pedig versioned változott VERSION-bump nélkül"
grep -Fq "impl.md" "$GUARD_ERR" || fail "B1: a hibaüzenet nem nevezi meg a változott fájlt (impl.md)"
grep -Fq "MAJOR" "$GUARD_ERR" || fail "B1: a hibaüzenet nem hivatkozik a MAJOR-kritériumra"
grep -Fq "CHANGELOG.md" "$GUARD_ERR" || fail "B1: a hibaüzenet nem hivatkozik a CHANGELOG.md-re"

# --- B2: ugyanez, de emelt VERSION-nel -> OK (0) ---
printf '2.0.1\n' > "$FIXG/VERSION"
git -C "$FIXG" add -A && git -C "$FIXG" commit -qm "bump to 2.0.1"
run_guard "$BASE_SHA"
[ "$GUARD_EXIT" -eq 0 ] || fail "B2: a guard nem-nullával tért vissza emelt VERSION mellett (kimenet: $(cat "$GUARD_ERR"))"

# --- B3: csak nem-versioned fájl változott, VERSION változatlan -> OK (0) ---
B3_BASE="$(git -C "$FIXG" rev-parse HEAD)"
printf '# readme — modositva\n' > "$FIXG/README.md"
git -C "$FIXG" add -A && git -C "$FIXG" commit -qm "non-versioned change only"
run_guard "$B3_BASE"
[ "$GUARD_EXIT" -eq 0 ] || fail "B3: a guard nem-nullával tért vissza, pedig csak nem-versioned fájl változott (kimenet: $(cat "$GUARD_ERR"))"

# --- B4: versioned változás + CSÖKKENTETT VERSION -> HIBA ---
B4_BASE="$(git -C "$FIXG" rev-parse HEAD)"
printf 'skill fixture v3\n' > "$FIXG/.claude/skills/dev-workflow/impl.md"
printf '1.0.0\n' > "$FIXG/VERSION"
git -C "$FIXG" add -A && git -C "$FIXG" commit -qm "versioned change + version DOWNGRADE"
run_guard "$B4_BASE"
[ "$GUARD_EXIT" -ne 0 ] || fail "B4: a guard 0-val tért vissza, pedig a VERSION csökkent versioned változás mellett"

# --- B6 (ORD-506): csak könyvtár-kivétel (`…/`) alatti fájl változott -> OK (0), bump nélkül ---
B6_BASE="$(git -C "$FIXG" rev-parse HEAD)"
printf 'local skill v2\n' > "$FIXG/.claude/skills/local-skill/SKILL.md"
printf 'local skill new file\n' > "$FIXG/.claude/skills/local-skill/extra.md"
git -C "$FIXG" add -A && git -C "$FIXG" commit -qm "dir-exception change only"
run_guard "$B6_BASE"
[ "$GUARD_EXIT" -eq 0 ] || fail "B6: a guard bumpot kért, pedig csak könyvtár-kivétel alatti fájl változott (kimenet: $(cat "$GUARD_ERR"))"

# --- B7 (ORD-506): könyvtár-kivétel + valódi versioned változás, bump nélkül -> HIBA, csak a versioned fájlt nevezi ---
B7_BASE="$(git -C "$FIXG" rev-parse HEAD)"
printf 'local skill v3\n' > "$FIXG/.claude/skills/local-skill/SKILL.md"
printf 'skill fixture v4\n' > "$FIXG/.claude/skills/dev-workflow/impl.md"
git -C "$FIXG" add -A && git -C "$FIXG" commit -qm "dir-exception + versioned change, no bump"
run_guard "$B7_BASE"
[ "$GUARD_EXIT" -ne 0 ] || fail "B7: a guard 0-val tért vissza, pedig versioned fájl is változott bump nélkül"
grep -Fq "impl.md" "$GUARD_ERR" || fail "B7: a hibaüzenet nem nevezi meg a versioned impl.md-t"
grep -Fq "local-skill" "$GUARD_ERR" && fail "B7: a hibaüzenet a könyvtár-kivétel alatti fájlt is versioned-nek sorolja"

# --- B5: a bázison nincs VERSION fájl -> FIGYELMEZTETÉS + exit 0 (nem blokkol) ---
FIXG2="$WORKDIR/no-base-version-repo"
mkdir -p "$FIXG2/.claude/skills/dev-workflow"
git -C "$FIXG2" init -q
git -C "$FIXG2" config user.name selfcheck
git -C "$FIXG2" config user.email selfcheck@example.com
git -C "$FIXG2" config commit.gpgsign false
git -C "$FIXG2" config core.autocrlf false
cp "$FIXG/dev-workflow-manifest.json" "$FIXG2/dev-workflow-manifest.json"
printf 'skill\n' > "$FIXG2/.claude/skills/dev-workflow/impl.md"
git -C "$FIXG2" add -A && git -C "$FIXG2" commit -qm "base without VERSION"
FIXG2_BASE="$(git -C "$FIXG2" rev-parse HEAD)"
printf '1.0.0\n' > "$FIXG2/VERSION"
printf 'skill v2\n' > "$FIXG2/.claude/skills/dev-workflow/impl.md"
git -C "$FIXG2" add -A && git -C "$FIXG2" commit -qm "add VERSION + change skill"
set +e
( cd "$FIXG2" && DEV_WORKFLOW_VERSION_BUMP_BASE_REF="$FIXG2_BASE" sh "$GUARD_SCRIPT" ) \
  >/dev/null 2>"$WORKDIR/guard5.err"
G5_EXIT=$?
set -e
[ "$G5_EXIT" -eq 0 ] || fail "B5: a guard nem-nullával tért vissza, pedig a bázison nincs VERSION (kihagyás várt)"
grep -Fq "FIGYELMEZTETÉS" "$WORKDIR/guard5.err" || fail "B5: nincs FIGYELMEZTETÉS a kimeneten a hiányzó bázis-VERSION-höz"

echo "B/ OK — a verzió-guard a versioned diff + VERSION viszony szerint buktat/enged."

# =====================================================================================
# C. .gitlab-ci.yml — publish + version-check job struktúra
# =====================================================================================
echo
echo "C/ .gitlab-ci.yml: publish csak master (manual), nincs RUN_HEAVY_JOBS-őr; version-check feltétel nélküli"

test -f "$CI_FILE" || fail "nincs .gitlab-ci.yml: $CI_FILE"

# A repo .gitlab-ci.yml-je CRLF sorvégű lehet (Windows) — normalizáljuk, hogy a
# horgony-illesztések (`...$`) ne bukjanak el a rejtett \r miatt.
CI_NORM="$WORKDIR/gitlab-ci.norm.yml"
tr -d '\r' < "$CI_FILE" > "$CI_NORM"

# Egy megnevezett top-level job sorai (a job-kulcstól a következő 0. oszlopú kulcsig).
job_block() {
  awk -v job="$1:" '
    $0 == job { inb = 1; next }
    inb && /^[^[:space:]]/ { inb = 0 }
    inb { print }
  ' "$CI_NORM"
}

# --- publish stage a stages: listában ---
grep -Eq '^[[:space:]]+- publish$' "$CI_NORM" \
  || fail "C: nincs 'publish' bejegyzés a .gitlab-ci.yml stages: listájában"

has_line()   { printf '%s\n' "$2" | grep -Fq "$1"; }
lacks_line()  { ! printf '%s\n' "$2" | grep -Fq "$1"; }

# --- dev-workflow-publish job ---
grep -q "^dev-workflow-publish:$" "$CI_NORM" || fail "C: nincs 'dev-workflow-publish' job a .gitlab-ci.yml-ben"
PUB="$(job_block dev-workflow-publish)"
[ -n "$PUB" ] || fail "C: a 'dev-workflow-publish' job blokkja üres"
has_line 'stage: publish' "$PUB" \
  || fail "C: a dev-workflow-publish nem a 'publish' stage-ben van"
has_line '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH' "$PUB" \
  || fail "C: a dev-workflow-publish rules-ában nincs default-branch feltétel"
has_line 'when: manual' "$PUB" \
  || fail "C: a dev-workflow-publish nem 'when: manual'"
lacks_line 'RUN_HEAVY_JOBS' "$PUB" \
  || fail "C: a dev-workflow-publish RUN_HEAVY_JOBS-ra hivatkozik — a COCALC-227 .claude/** kizárás rá NEM vonatkozhat"
has_line 'ci/build-dev-workflow-archive.sh' "$PUB" \
  || fail "C: a dev-workflow-publish nem a ci/build-dev-workflow-archive.sh szkriptet hívja"

# --- dev-workflow-version-check job ---
grep -q "^dev-workflow-version-check:$" "$CI_NORM" || fail "C: nincs 'dev-workflow-version-check' job a .gitlab-ci.yml-ben"
VC="$(job_block dev-workflow-version-check)"
[ -n "$VC" ] || fail "C: a 'dev-workflow-version-check' job blokkja üres"
lacks_line 'RUN_HEAVY_JOBS' "$VC" \
  || fail "C: a dev-workflow-version-check RUN_HEAVY_JOBS-ra hivatkozik — egy csak-.claude/** változás pont az az eset, amit védenie kell"
lacks_line 'when: never' "$VC" \
  || fail "C: a dev-workflow-version-check rules-ában 'when: never' van — a guardnak feltétel nélkül futnia kell (blokkoló)"
has_line 'ci/verify-dev-workflow-version-bump.sh' "$VC" \
  || fail "C: a dev-workflow-version-check nem a ci/verify-dev-workflow-version-bump.sh szkriptet hívja (inline YAML-logika tilos)"

echo "C/ OK — a publish job master-only/manual és RUN_HEAVY_JOBS-mentes, a version-check feltétel nélküli és ci/ szkriptet hív."

# =====================================================================================
# D. VALÓS-fa szivárgás-ellenőrzés (nem szintetikus fixture)
# =====================================================================================
# Az A/B/C szekciók a szűrőlogikát tesztelik fixture-ökön — ez a szekció a repo tényleges
# gyökeréből épített és kicsomagolt archívumot (a valódi CHANGELOG.md-vel) vizsgálja.
# Ugyanezt a szkriptet futtatja a .gitlab-ci.yml `dev-workflow-archive-leak-check` job-ja
# blokkolóan, és a `dev-workflow-publish` az upload előtt.
echo
echo "D/ valós archívum: nincs repo-lokális útvonal / önálló Jira project key a szállított fában"

LEAK_SCRIPT="$REPO_ROOT/ci/verify-dev-workflow-archive-clean.sh"
test -f "$LEAK_SCRIPT" || fail "hiányzik a valós-fa szivárgás-ellenőrző: $LEAK_SCRIPT"

# D0: a valós repo-gyökérből épített, kicsomagolt archívum tartalmazza a Doppler-run
# wrappert (COCALC-320, AC10) — versioned kell legyen, hogy egy fogyasztó repo is
# megkapja a csomaggal együtt, ne csak a forrás (wordcloud) repóban legyen elérhető.
REAL_OUT="$WORKDIR/dev-workflow-real.tar.gz"
( cd "$REPO_ROOT" && sh "$BUILD_SCRIPT" --output "$REAL_OUT" ) >/dev/null 2>&1 \
  || fail "D0: a build-dev-workflow-archive.sh nem-nulla exittel állt le a valós repo-gyökéren"
REAL_EXTRACT="$WORKDIR/real-extract"
mkdir -p "$REAL_EXTRACT"
tar -xzf "$REAL_OUT" -C "$REAL_EXTRACT" || fail "D0: nem sikerült kicsomagolni a valós archívumot"
test -f "$REAL_EXTRACT/ci/run-with-doppler.sh" \
  || fail "D0: a ci/run-with-doppler.sh (versioned, COCALC-320 AC10) nincs a valós csomagolt ci/ tartalomban"
echo "D0/ OK — a valós csomag tartalmazza a ci/run-with-doppler.sh-t."

# D1: a tényleges repo-gyökér archívuma tiszta.
( cd "$REPO_ROOT" && sh "$LEAK_SCRIPT" ) \
  || fail "D1: a valós repo-gyökérből épített archívum megbukott a szivárgás-ellenőrzésen"

# Minimális, DE a build-dev-workflow-archive.sh awk-parserének megfelelő (elemenként
# külön sor) manifest — ugyanaz a formátum, mint a valódi dev-workflow-manifest.json-é.
write_min_manifest() {
  cat > "$1/dev-workflow-manifest.json" <<'EOF'
{
  "versioned": [
    ".claude/skills/"
  ],
  "repo_local_exceptions": [],
  "samples": [],
  "version_stamp": { "file": ".dev-workflow-version", "format": "semver-string", "written_by": "fixture" }
}
EOF
}

# $1: fixture-repo gyökér, $2: a versioned fájl (cited.md) tartalma.
# Kimenet: $LEAK_EXIT (exit-kód), $LEAK_OUT (stdout+stderr fájl).
run_leak_on_fixture() {
  d="$1"
  rm -rf "$d"
  mkdir -p "$d/ci" "$d/.claude/skills/dev-workflow"
  cp "$REPO_ROOT/ci/build-dev-workflow-archive.sh" "$d/ci/build-dev-workflow-archive.sh"
  write_min_manifest "$d"
  printf '1.0.0\n' > "$d/VERSION"
  printf '%s\n' "$2" > "$d/.claude/skills/dev-workflow/cited.md"
  LEAK_OUT="$WORKDIR/leak.out"
  set +e
  ( cd "$d" && sh "$LEAK_SCRIPT" --target-dir "$d" ) >"$LEAK_OUT" 2>&1
  LEAK_EXIT=$?
  set -e
}

# $1: fixture-repo gyökér, $2: a versioned fájl KONKRÉT relatív útvonala (ez kerül a
# manifest "versioned" listájába IS, szó szerint), $3: a fájl tartalma. A run_leak_on_fixture-
# től eltérően itt a hívó szabja meg az útvonalat (nem mindig 'cited.md') — ez kell a
# PERMANENT_ALLOW_SUFFIXES (COCALC-320 kritikus javítás) suffix-egyezésének teszteléséhez,
# ami a fájl TÉNYLEGES relatív útvonalán (pl. 'ci/verify-dev-workflow-archive-clean.sh')
# dönt, nem a fájlnév-mintán. Kimenet: $LEAK_EXIT, $LEAK_OUT (mint run_leak_on_fixture).
run_leak_on_fixture_at() {
  d="$1"; rel="$2"; content="$3"
  rm -rf "$d"
  mkdir -p "$d/ci" "$d/$(dirname "$rel")"
  cp "$REPO_ROOT/ci/build-dev-workflow-archive.sh" "$d/ci/build-dev-workflow-archive.sh"
  cat > "$d/dev-workflow-manifest.json" <<EOF
{
  "versioned": [
    "$rel"
  ],
  "repo_local_exceptions": [],
  "samples": [],
  "version_stamp": { "file": ".dev-workflow-version", "format": "semver-string", "written_by": "fixture" }
}
EOF
  printf '1.0.0\n' > "$d/VERSION"
  printf '%s\n' "$content" > "$d/$rel"
  LEAK_OUT="$WORKDIR/leak-at.out"
  set +e
  ( cd "$d" && sh "$LEAK_SCRIPT" --target-dir "$d" ) >"$LEAK_OUT" 2>&1
  LEAK_EXIT=$?
  set -e
}

# D2: beültetett repo-path a versioned fában -> BUKTAT, és a 'SZIVÁRGÁS' üzenettel
# (nem csak build-hibával — a manifest szándékosan érvényes).
run_leak_on_fixture "$WORKDIR/leaky-repo" 'hivatkozás: F:\dev\repos\wordcloud\valami — ez SZIVÁRGÁS'
[ "$LEAK_EXIT" -ne 0 ] || fail "D2: a szivárgás-ellenőrző 0-val tért vissza beültetett repo-path mellett"
grep -Fq 'SZIVÁRGÁS' "$LEAK_OUT" || fail "D2: nincs 'SZIVÁRGÁS' jelzés a kimeneten (talán build-hiba maszkírozott?)"
grep -Fq 'repo-lokális útvonalat' "$LEAK_OUT" || fail "D2: a jelzés nem a repo-lokális útvonalra hivatkozik"

# D3a: csak ticketszámos citáció + nagyobb token belseje -> TISZTA (exit 0)
run_leak_on_fixture "$WORKDIR/coc-repo" 'bevezette (COCALC-232), lásd COCALC-273 is; a MYCOCALCX token nem kulcs.'
[ "$LEAK_EXIT" -eq 0 ] || fail "D3a: a ticketszámos citáció / 'MYCOCALCX' hibásan buktatott (exit $LEAK_EXIT; kimenet: $(cat "$LEAK_OUT"))"

# D3b: önálló 'COCALC' project key a mondatban -> BUKTAT
run_leak_on_fixture "$WORKDIR/coc-repo" 'a COCALC projekt kulcsa itt önmagában, citáció nélkül szerepel.'
[ "$LEAK_EXIT" -ne 0 ] || fail "D3b: az önálló 'COCALC' project key nem buktatott"
grep -Fq 'Jira project key' "$LEAK_OUT" || fail "D3b: a jelzés nem a project key-re hivatkozik"

# D3c: hibás 'COCALC-<nem-szám>' forma -> BUKTAT
run_leak_on_fixture "$WORKDIR/coc-repo" 'rossz formátum: COCALC-abc nem érvényes ticketszám.'
[ "$LEAK_EXIT" -ne 0 ] || fail "D3c: a hibás 'COCALC-<nem-szám>' forma nem buktatott"

# D4: ugyanaz a szivárgó tartalom, de az ÁLLANDÓ allowlistolt fájlok egyikében (a
# COCALC-320 kritikus javítás — PERMANENT_ALLOW_SUFFIXES ezekben a saját szövegükben/
# fixture-jeikben szándékosan tartalmazzák a mintát) -> TISZTA (exit 0).
for allowed_rel in \
  "ci/verify-dev-workflow-archive-clean.sh" \
  "ci/verify-dev-workflow-publish.sh" \
  "ci/verify-skill-portability.sh"
do
  run_leak_on_fixture_at "$WORKDIR/allow-repo" "$allowed_rel" \
    'sajat pelda a dokumentacioban: F:\dev\repos\wordcloud es onallo COCALC project key'
  [ "$LEAK_EXIT" -eq 0 ] || fail "D4: az állandó allowlistolt '$allowed_rel' mégis buktatott (kimenet: $(cat "$LEAK_OUT"))"
done
echo "D4/ OK — a 3 állandó allowlistolt ci/ szkript saját szivárgó-mintázatú szövege nem buktat."

# D5: ugyanaz a szivárgó tartalom egy NEM allowlistolt ci/ fájlban -> továbbra is BUKTAT
# (bizonyítja, hogy az allowlist suffix-specifikus, nem blanket-kizárás az egész ci/ fára).
run_leak_on_fixture_at "$WORKDIR/notallow-repo" "ci/some-other-script.sh" \
  'sajat pelda a dokumentacioban: F:\dev\repos\wordcloud es onallo COCALC project key'
[ "$LEAK_EXIT" -ne 0 ] || fail "D5: egy NEM allowlistolt ci/ fájl (ci/some-other-script.sh) nem buktatott, pedig kellett volna"
echo "D5/ OK — egy nem-allowlistolt ci/ fájl ugyanazon tartalommal továbbra is buktat."

echo "D/ OK — a valós archívum tiszta; a szivárgás-ellenőrző elkapja a beültetett repo-path-ot"
echo "        és az önálló/hibás project key-t, a ticketszámos citációt viszont átengedi."

echo
echo "verify-dev-workflow-publish: minden ellenőrzés zöld."
