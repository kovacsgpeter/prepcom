#!/usr/bin/env sh
# ORD-382 (4.28.0) önellenőrző: a check-ci-readiness.sh egyszeri CI-készenlét ellenőrzés
# statikus kötései és tényleges viselkedése fixture-ökkel (nincs hálózat: a hamis glab a
# ci/fixtures/ci-readiness/glab-stub.sh, a CI_READINESS_GLAB env-en át).
set -eu

fail() {
  echo "HIBA: $*" >&2
  exit 1
}

CHECK=.claude/skills/dev-workflow/scripts/check-ci-readiness.sh
MIRROR=.agents/skills/dev-workflow/scripts/check-ci-readiness.sh
FIX=ci/fixtures/ci-readiness
STUB="$(pwd)/$FIX/glab-stub.sh"

# --- 1. statikus kötések ---
[ -f "$CHECK" ] || fail "hiányzik: $CHECK"
bash -n "$CHECK" || fail "$CHECK szintaxishibás"
for s in 'glab api' 'CI_READINESS_GLAB' 'protected_branches'; do
  grep -Fq -- "$s" "$CHECK" || fail "$CHECK nem tartalmazza: $s"
done
# Csak olvas: PUT/DELETE sehol; a POST csak kiírt javaslatban (hint "...") szerepelhet.
if grep -Eq -- '-X (PUT|DELETE|PATCH)' "$CHECK"; then
  fail "$CHECK író hívást tartalmaz (-X PUT/DELETE/PATCH)"
fi
grep -F -- '-X POST' "$CHECK" | grep -Fv 'hint ' >/dev/null && fail "$CHECK: a -X POST nem csak kiírt szövegben szerepel"
for cfg in .claude/skills/dev-workflow/config.template.md .agents/skills/dev-workflow/config.template.md; do
  for key in CI_READINESS_CHECK CI_READINESS_CHECKED; do
    grep -Fq "| \`$key\` |" "$cfg" || fail "$cfg nem tartalmazza a(z) $key kapcsolót"
  done
done
got="$(DEV_WORKFLOW_CONFIG=.claude/skills/dev-workflow/config.template.md bash .claude/skills/dev-workflow/scripts/config-value.sh CI_READINESS_CHECK '<nincs>')"
[ "$got" = "on" ] || fail "a sablonban CI_READINESS_CHECK = '$got', nem 'on'"

# --- 2. viselkedés ---
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT INT TERM

# run_case <fixture-könyvtár> <várt kilépőkód> <várt minta> [<nem várt minta>]
run_case() {
  rc=0
  CI_READINESS_GLAB="$STUB" CI_READINESS_FIXTURES="$1" DEV_WORKFLOW_CONFIG="${CASE_CONFIG:-$1/config.md}" \
    bash "$CHECK" >"$TMP/out" 2>&1 || rc=$?
  if [ "$rc" != "$2" ]; then
    cat "$TMP/out" >&2
    fail "$1: kilépőkód $rc (várt $2)"
  fi
  if [ -n "$3" ] && ! grep -Fq -- "$3" "$TMP/out"; then
    cat "$TMP/out" >&2
    fail "$1: a kimenetből hiányzik: $3"
  fi
  if [ -n "${4:-}" ] && grep -Fq -- "$4" "$TMP/out"; then
    cat "$TMP/out" >&2
    fail "$1: a kimenetben nem várt: $4"
  fi
}

run_case "$FIX/shared-on" 0 "OK: a megosztott runnerek" "HIBA:"
run_case "$FIX/shared-quota" 0 "95%" "HIBA:"
# explicit keret (env): 380 / 1000 = 38%, nincs figyelmeztetés
CI_READINESS_MINUTES_LIMIT=1000 run_case "$FIX/shared-quota" 0 "38%" "FIGYELMEZTETÉS:"
# explicit keret, ami fölött 95%: 380 / 400
CI_READINESS_MINUTES_LIMIT=400 run_case "$FIX/shared-quota" 0 "95%" "HIBA:"
# 0 = nincs korlát
CI_READINESS_MINUTES_LIMIT=0 run_case "$FIX/shared-quota" 0 "nincs korlát" "FIGYELMEZTETÉS:"
# nem free plan és nincs keret a válaszban: ismeretlen keret, egy OK sor, nincs figyelmeztetés
mkdir "$TMP/paid"
cp "$FIX/shared-quota"/* "$TMP/paid/"
sed 's/"plan":"free"/"plan":"premium"/' "$FIX/shared-quota/namespace.json" >"$TMP/paid/namespace.json"
run_case "$TMP/paid" 0 "a keret ismeretlen" "FIGYELMEZTETÉS:"
run_case "$FIX/tagged-only" 1 "HIBA:" ""
grep -Fq 'default: tags: [docker]' "$TMP/out" || fail "tagged-only: hiányzik a default: tags javaslat"
run_case "$FIX/ref-protected" 1 "HIBA:" ""
for s in 'feature/*' 'refactoring/*' 'chore/*' 'Protected branches' 'glab api -X POST'; do
  grep -Fq -- "$s" "$TMP/out" || fail "ref-protected: hiányzik a kimenetből: $s"
done
run_case "$FIX/all-ok" 0 "Összegzés: 0 HIBA, 0 FIGYELMEZTETÉS" "FIGYELMEZTETÉS:"

# API-hiba: üres fixture-könyvtár -> FIGYELMEZTETÉS, kilépés 0
mkdir "$TMP/empty"
cp "$FIX/all-ok/config.md" "$TMP/empty/config.md"
run_case "$TMP/empty" 0 "FIGYELMEZTETÉS:" "HIBA:"

# nem megállapítható runner (a runner részletei hiányoznak) -> FIGYELMEZTETÉS, nem HIBA
mkdir "$TMP/unknown"
cp "$FIX/ref-protected"/config.md "$FIX/ref-protected"/project.json "$FIX/ref-protected"/runners.json \
  "$FIX/ref-protected"/gitlab-ci.yml "$FIX/ref-protected"/protected_branches.json "$TMP/unknown/"
run_case "$TMP/unknown" 0 "FIGYELMEZTETÉS:" "HIBA:"

# placeholder-config
cat >"$TMP/placeholder.md" <<'EOF'
| Logikai név | Repo path/URL | Alap branch | Jira project key |
|---|---|---|---|
| `<LOGICAL_REPO_NAME>` | `<REPO_PATH>` | `master` | `<JIRA_PROJECT_KEY>` |
EOF
CASE_CONFIG="$TMP/placeholder.md" run_case "$FIX/all-ok" 0 "REPO_MAP még nincs kitöltve"

# kikapcsolva
sed 's/| `CI_READINESS_CHECK` | `on` |/| `CI_READINESS_CHECK` | `off` |/' "$FIX/all-ok/config.md" >"$TMP/off.md"
CASE_CONFIG="$TMP/off.md" run_case "$FIX/tagged-only" 0 "kikapcsolva"

# használati hiba
rc=0
bash "$CHECK" --bogus >/dev/null 2>&1 || rc=$?
[ "$rc" = 2 ] || fail "ismeretlen kapcsoló: kilépőkód $rc (várt 2)"

# --- 3. Codex-tükör ---
cmp -s "$CHECK" "$MIRROR" || fail "$MIRROR eltér a $CHECK fájltól"

echo "verify-ci-readiness.sh: minden ellenőrzés zöld."
