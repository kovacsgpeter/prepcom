#!/usr/bin/env sh
# COCALC-392 onellenorzes: a frontend lockfile-szinkron kapu (resolve-ci-npm-major.sh +
# verify-frontend-lockfile-sync.sh) bekotesenek es a CI npm-major-feloldasi LOGIKA
# helyessegenek ellenorzese.
#
# TELJESEN OFFLINE -- ez a job (frontend-lockfile-sync-config-check) minden MR-en/
# default-branch pusholt commiton fut, ezert NEM hivhat valodi halozati kerest a
# nodejs.org fele (az tranziens kiesesnel flaky pirosat okozna). A resolve-ci-npm-major.sh
# elsodleges forrasat ezert a `--index-file`/`NODE_DIST_INDEX` explicit felulirassal, egy
# repoba tett fixture-fajllal (ci/fixtures/node-dist-index.sample.json) teszteljuk -- a
# fixture SOHA nem aktivalodik automatikusan eles futasban (lasd resolve-ci-npm-major.sh
# fejlece), csak itt, explicit teszt-parameterkent. A docker-fallback-ot is kikapcsoljuk a
# negativ teszthez (PATH-bol eltavolitott docker-konyvtar), hogy a hiba-ag se probalkozzon
# halozati docker image-letoltessel.
#
# A valodi (halozati) feloldas KIZAROLAG a lokal kapuban (implementer "3." lepese) fut --
# ez a szabaly valtozatlan, itt csak a feloldasi LOGIKAT teszteljuk, nem a halozatot.
#
# Amit ellenoriz (blokkonkent):
#  1. A ket szkript letezik (.claude/skills/dev-workflow/scripts/).
#  2. Az implementer.md a "3." lepesben hivatkozza a verify-frontend-lockfile-sync.sh-t
#     (kotelezo, blocker), es van kulon szakasz az uj fuggoseg felvetelere.
#  3. dev-workflow-manifest.json tartalmazza ezt a szkriptet ES a fixture-t a "versioned"
#     listaban.
#  4. .gitlab-ci.yml bekoti ezt a jobot.
#  5. resolve-ci-npm-major.sh a fixture index-file-lal, szintetikus node:22 image-re a
#     fixture-bol SZAMOLT vart npm-fomajort adja (nem beegetett ertek -- a fixture
#     tartalmabol szamitva, igy nem tud elcsuszni a fixture-tol), ES a VALODI
#     .gitlab-ci.yml frontend-image-ere is numerikus eredmenyt ad ugyanezzel a
#     fixture-rel (a job-blokk-kinyeres tenyleges tesztje, halozat nelkul).
#  6. resolve-ci-npm-major.sh hangos hibaval (exit 2) all le, ha SEM a fixture index-file
#     nem tartalmaz illeszkedo fovezio, SEM a docker-fallback nem erheto el (docker
#     kivonva a PATH-bol -- igy ez a teszt sem hiv halozatot).
set -eu

RESOLVE=.claude/skills/dev-workflow/scripts/resolve-ci-npm-major.sh
VERIFY_SYNC=.claude/skills/dev-workflow/scripts/verify-frontend-lockfile-sync.sh
IMPLEMENTER=.claude/agents/implementer.md
MANIFEST=dev-workflow-manifest.json
CI_YML=.gitlab-ci.yml
FIXTURE_INDEX=ci/fixtures/node-dist-index.sample.json

fail() { echo "verify-frontend-lockfile-sync-config: $1" >&2; exit 1; }

# --- 1. A ket szkript es a fixture letezik ---------------------------------------------
test -f "$RESOLVE" || fail "hianyzik: $RESOLVE"
test -f "$VERIFY_SYNC" || fail "hianyzik: $VERIFY_SYNC"
test -f "$FIXTURE_INDEX" || fail "hianyzik a teszt-fixture: $FIXTURE_INDEX"

# --- 2. implementer.md bekotes ---------------------------------------------------------
grep -Fq 'verify-frontend-lockfile-sync.sh' "$IMPLEMENTER" \
  || fail "az $IMPLEMENTER nem hivatkozik a verify-frontend-lockfile-sync.sh-ra"
grep -Fq 'resolve-ci-npm-major.sh' "$IMPLEMENTER" \
  || fail "az $IMPLEMENTER nem hivatkozik a resolve-ci-npm-major.sh-ra"
grep -Fq '## 3a. Új frontend-függőség felvétele' "$IMPLEMENTER" \
  || fail "az $IMPLEMENTER-ből hiányzik a '3a. Új frontend-függőség felvétele' szakasz"
grep -Fq 'blocker' "$IMPLEMENTER" \
  || fail "az $IMPLEMENTER lockfile-szinkron leírásából hiányzik a blocker-jelleg kimondása"

# --- 3. manifest bejegyzesek ---------------------------------------------------------
grep -Fq 'ci/verify-frontend-lockfile-sync.sh' "$MANIFEST" \
  || fail "a $MANIFEST 'versioned' listájából hiányzik: ci/verify-frontend-lockfile-sync.sh"
grep -Fq "$FIXTURE_INDEX" "$MANIFEST" \
  || fail "a $MANIFEST 'versioned' listájából hiányzik: $FIXTURE_INDEX"

# --- 4. .gitlab-ci.yml bekotes ---------------------------------------------------------
grep -Fq 'frontend-lockfile-sync-config-check' "$CI_YML" \
  || fail "a $CI_YML-ből hiányzik a frontend-lockfile-sync-config-check job"
grep -Fq 'ci/verify-frontend-lockfile-sync.sh' "$CI_YML" \
  || fail "a $CI_YML nem hívja meg a ci/verify-frontend-lockfile-sync.sh-t"

# --- segéd: 'docker' konyvtaranak eltavolitasa a PATH-bol -- a negativ tesztnel kell,
#     hogy a docker-fallback se probalkozzon halozati image-letoltessel. Ha nincs docker
#     a PATH-on (pl. a valodi CI job-image-ben), ez no-op. -----------------------------
strip_docker_from_path() {
  docker_bin="$(command -v docker 2>/dev/null || true)"
  if [ -z "$docker_bin" ]; then
    printf '%s' "$PATH"
    return 0
  fi
  docker_dir="$(dirname "$docker_bin")"
  old_ifs="$IFS"
  IFS=':'
  result=""
  for p in $PATH; do
    [ "$p" = "$docker_dir" ] && continue
    result="${result:+$result:}$p"
  done
  IFS="$old_ifs"
  printf '%s' "$result"
}
NO_DOCKER_PATH="$(strip_docker_from_path)"

# --- 5. pozitiv teszt: fixture index-file, szintetikus node:22 image -> a fixture-bol
#        SZAMOLT vart npm-fomajor (nem beegetett ertek); plusz a VALODI .gitlab-ci.yml
#        frontend-image-ere is numerikus eredmeny ugyanezzel a fixture-rel -----------
FIXTURE_CI_YML="$(mktemp)"
trap 'rm -f "$FIXTURE_CI_YML"' EXIT
cat > "$FIXTURE_CI_YML" <<'FIXTURE'
frontend-test:
  stage: test
  image: node:22-bookworm-slim
  tags:
    - docker
FIXTURE

EXPECTED_NPM_MAJOR="$(
  node -e '
    const fs = require("fs");
    const major = process.argv[1];
    const list = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
    const entry = list.find((r) => typeof r.version === "string" && r.version.indexOf("v" + major + ".") === 0 && r.npm);
    if (!entry) { process.exit(1); }
    console.log(String(entry.npm).split(".")[0]);
  ' "22" "$FIXTURE_INDEX"
)" || fail "a fixture ($FIXTURE_INDEX) nem tartalmaz v22.x bejegyzest npm mezovel -- a pozitiv teszt elovarasa serult"

ACTUAL_NPM_MAJOR="$(sh "$RESOLVE" --ci-yml "$FIXTURE_CI_YML" --index-file "$FIXTURE_INDEX")" \
  || fail "a resolve-ci-npm-major.sh a fixture index-file-lal, szintetikus node:22 image-re hibaval allt le"
[ "$ACTUAL_NPM_MAJOR" = "$EXPECTED_NPM_MAJOR" ] \
  || fail "a resolve-ci-npm-major.sh fixture-alapu eredmenye ('$ACTUAL_NPM_MAJOR') nem egyezik a fixture-bol szamolt vart ertekkel ('$EXPECTED_NPM_MAJOR')"

REAL_CI_RESULT="$(sh "$RESOLVE" --ci-yml "$CI_YML" --index-file "$FIXTURE_INDEX")" \
  || fail "a resolve-ci-npm-major.sh a VALODI $CI_YML-re (fixture index-file-lal, halozat nelkul) hibaval allt le -- ellenorizd, hogy a fixture tartalmazza-e a $CI_YML aktualis frontend node-fovezio-vonalat"
printf '%s' "$REAL_CI_RESULT" | grep -Eq '^[0-9]+$' \
  || fail "a resolve-ci-npm-major.sh a VALODI $CI_YML-re nem numerikus eredmenyt adott: '$REAL_CI_RESULT'"

# --- 6. negativ teszt: fixture index-file, nem illeszkedo fovezio (99), docker kikapcsolva
#        a PATH-bol -> exit 2, hangos HIBA, halozat nelkul --------------------------------
FIXTURE_CI_YML_BAD="$(mktemp)"
trap 'rm -f "$FIXTURE_CI_YML" "$FIXTURE_CI_YML_BAD"' EXIT
cat > "$FIXTURE_CI_YML_BAD" <<'FIXTURE'
frontend-test:
  stage: test
  image: node:99-bookworm-slim
  tags:
    - docker
FIXTURE

FIXTURE_ERR_FILE="$(mktemp)"
trap 'rm -f "$FIXTURE_CI_YML" "$FIXTURE_CI_YML_BAD" "$FIXTURE_ERR_FILE"' EXIT

set +e
PATH="$NO_DOCKER_PATH" sh "$RESOLVE" --ci-yml "$FIXTURE_CI_YML_BAD" --index-file "$FIXTURE_INDEX" >/dev/null 2>"$FIXTURE_ERR_FILE"
FIXTURE_EXIT=$?
set -e
[ "$FIXTURE_EXIT" -eq 2 ] \
  || fail "a resolve-ci-npm-major.sh nem illeszkedo fovezio + docker nelkul nem exit 2-vel allt le (kapott: $FIXTURE_EXIT)"
grep -Fq 'HIBA' "$FIXTURE_ERR_FILE" \
  || fail "a resolve-ci-npm-major.sh hiba-aga nem irt hangos HIBA uzenetet"

echo "verify-frontend-lockfile-sync-config: OK (fixture node:22 -> npm $ACTUAL_NPM_MAJOR; valodi $CI_YML -> npm $REAL_CI_RESULT)"
