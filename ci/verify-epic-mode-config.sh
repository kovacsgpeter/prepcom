#!/usr/bin/env sh
# dev-workflow (4.23.4) önellenőrző az epic-módhoz (E-ág, 14. belépési pont):
#   1. a fájlok megvannak (epic-mode.md, epic-worktree.sh, merge-as-ai.sh, wait-for-mr-sha.sh);
#   2. az EPIC_* kulcsok és értéktáblák a két config.md-ben (egyező értékkel) és a két
#      config.template.md-ben (a csomag-alapértékekkel);
#   3. a 14. indító mondat a configokban, a README-kben és az execute SKILL.md-ben;
#   4. a merge-as-ai.sh SHA- és pipeline-kapuja, a wait-for-mr-sha.sh, valamint az
#      epic-worktree.sh port-eltolása (hálózat és GitLab nélkül, stubbal);
#   5. az E6 force push nélküli merge-frissítése (ORD-370, EPIC_REFRESH_MODE=merge) egy
#      eldobható git-repón: AI-identitású merge-commit, fast-forward push, ütközésnél abort.
# Az alkalmazás-oldali port-bekötés (compose-fájl, dev-szerver) repófüggő, azt a fogyasztó
# repó saját tesztje ellenőrzi.
set -eu

fail() {
  echo "verify-epic-mode-config: $*" >&2
  exit 1
}

# --- 1. Fájlok ---
for f in \
  .claude/skills/dev-workflow-execute/epic-mode.md \
  .claude/skills/dev-workflow-execute/scripts/epic-worktree.sh \
  .claude/skills/dev-workflow/scripts/merge-as-ai.sh   .claude/skills/dev-workflow/scripts/wait-for-mr-sha.sh; do
  test -f "$f" || fail "hiányzó fájl: $f"
done

# --- 2. Config-kulcsok ---
KEYS="EPIC_APPROVAL_MODE EPIC_PARALLEL_MODE EPIC_MAX_PARALLEL EPIC_LOCAL_LLM_CONCURRENCY EPIC_ON_STORY_FAILURE EPIC_BASE_BRANCH EPIC_WORKTREE_ROOT EPIC_WORKTREE_SETUP_CMD EPIC_REBASE_CHECK_CMD EPIC_TEST_ENV EPIC_MERGE_REMOVE_SOURCE_BRANCH EPIC_SHA_WAIT_SECONDS EPIC_SERIAL_PATHS EPIC_PORT_STEP EPIC_ISOLATED_PORTS EPIC_REFRESH_MODE"
for cfg in .claude/skills/dev-workflow/config.md .agents/skills/dev-workflow/config.md \
  .claude/skills/dev-workflow/config.template.md .agents/skills/dev-workflow/config.template.md; do
  grep -Fq '## Epic-mód (E-ág)' "$cfg" || fail "$cfg: hiányzik az \"Epic-mód (E-ág)\" szakasz"
  for k in $KEYS; do
    grep -Fq "| \`$k\` |" "$cfg" || fail "$cfg: hiányzó kulcs: $k"
  done
  # ORD-497: az EPIC_* értékfelsorolások (magyarázat) a config-reference.md-ben vannak.
  ref="${cfg%/*}/config-reference.md"
  for v in upfront per-story pre-merge parallel isolated serial merge rebase; do
    grep -Fq "| \`$v\`" "$ref" || fail "$ref: hiányzó érték az EPIC_* értéktáblákból: $v"
  done
  grep -Eq '^\| 14 \| "csináld meg az `<EPIC-KULCS>` epicet storynként" \|' "$cfg" ||
    fail "$cfg: hiányzó vagy hibás 14. indító mondat"
done
for k in $KEYS; do
  a=$(DEV_WORKFLOW_CONFIG=.claude/skills/dev-workflow/config.md bash .claude/skills/dev-workflow/scripts/config-value.sh "$k" '<nincs>')
  b=$(DEV_WORKFLOW_CONFIG=.agents/skills/dev-workflow/config.md bash .claude/skills/dev-workflow/scripts/config-value.sh "$k" '<nincs>')
  [ "$a" = "$b" ] || fail "$k: a .claude ($a) és az .agents ($b) config értéke eltér"
  [ "$a" != '<nincs>' ] || fail "$k: a config-value.sh nem olvassa ki"
done
for tpl in .claude/skills/dev-workflow/config.template.md .agents/skills/dev-workflow/config.template.md; do
  for kv in EPIC_APPROVAL_MODE=upfront EPIC_PARALLEL_MODE=parallel EPIC_TEST_ENV=skip \
    EPIC_WORKTREE_SETUP_CMD=- EPIC_REBASE_CHECK_CMD=- EPIC_SERIAL_PATHS=- EPIC_ISOLATED_PORTS=- \
    EPIC_REFRESH_MODE=merge; do
    got=$(DEV_WORKFLOW_CONFIG="$tpl" bash .claude/skills/dev-workflow/scripts/config-value.sh "${kv%%=*}" '<nincs>')
    [ "$got" = "${kv#*=}" ] || fail "$tpl: ${kv%%=*} csomag-alapértéke '$got', nem '${kv#*=}'"
  done
done

# --- 3. Bekötések ---
for f in .claude/skills/dev-workflow/README.md .agents/skills/dev-workflow/README.md; do
  grep -Fq '| 14 | "csináld meg az `<EPIC-KULCS>` epicet storynként"' "$f" || fail "$f: hiányzik a 14. sor"
done
S=.claude/skills/dev-workflow-execute/SKILL.md
grep -Fq '| 14 | "csináld meg az `<EPIC-KULCS>` epicet storynként" | [`epic-mode.md`](epic-mode.md) **E1**' "$S" ||
  fail "$S: hiányzik a 14. belépési pont"
grep -Fq 'Kivétel az E-ág (epic-mód)' "$S" || fail "$S: hiányzik a megállási pontok E-ági kivétele"
for step in '## E1 ' '## E2 ' '## E3 ' '## E4 ' '## E5 ' '## E6 ' '## Megállási pontok' '## E7 '; do
  grep -Fq "$step" .claude/skills/dev-workflow-execute/epic-mode.md || fail "epic-mode.md: hiányzó szakasz: $step"
done
grep -Fq 'wait-for-mr-sha.sh <MR-iid> <várt-SHA>' .claude/skills/dev-workflow-execute/epic-mode.md ||
  fail "epic-mode.md: az E6 nem várja meg a pusholt SHA pipeline-ját (wait-for-mr-sha.sh)"
grep -Fq 'EPIC_LOCAL_LLM_CONCURRENCY' .claude/skills/dev-workflow-execute/epic-mode.md ||
  fail "epic-mode.md: hiányzik a helyi LLM-hívások ütemezése (EPIC_LOCAL_LLM_CONCURRENCY)"
# ORD-370: az E6 1. pontja az EPIC_REFRESH_MODE szerint ágazik; a merge ágban nincs force push.
E=.claude/skills/dev-workflow-execute/epic-mode.md
grep -Fq 'EPIC_REFRESH_MODE' "$E" || fail "epic-mode.md: az E6 nem hivatkozik az EPIC_REFRESH_MODE-ra"
MERGE_BLOCK=$(tr -d '\r' <"$E" | awk '/^   - `merge` \*\(alap\)\*/{on=1} on&&/^   - `rebase`/{exit} on')
[ -n "$MERGE_BLOCK" ] || fail "epic-mode.md: az E6-ban nincs \`merge\` ág"
printf '%s' "$MERGE_BLOCK" | grep -Fq 'merge --abort' || fail "epic-mode.md: a merge ágból hiányzik a merge --abort"
printf '%s' "$MERGE_BLOCK" | grep -Fq 'commit-as-ai.sh' || fail "epic-mode.md: a merge ágban a commit nem AI-identitású"
if printf '%s' "$MERGE_BLOCK" | grep -Eq -- '--force-with-lease`|--force[ `]'; then
  fail "epic-mode.md: a merge ágban force push szerepel"
fi

# --- 4. Szkript-öntesztek (stubbal, hálózat nélkül) ---
command -v node >/dev/null 2>&1 || fail "az önteszthez node kell"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# 4a. merge-as-ai.sh: a glab-note-as-ai.sh helyére stub, ami a FAKE_MR-t adja vissza.
mkdir -p "$TMP/scripts"
cp .claude/skills/dev-workflow/scripts/merge-as-ai.sh .claude/skills/dev-workflow/scripts/config-value.sh "$TMP/scripts/"
cat >"$TMP/scripts/glab-note-as-ai.sh" <<'STUB'
#!/usr/bin/env bash
case "$*" in
  *"--method PUT"*) echo "PUT $*" >>"$STUB_LOG"; printf '{"state":"merged","merge_commit_sha":"m3rg3"}' ;;
  *) printf '%s' "$FAKE_MR" ;;
esac
STUB
SHA=0123456789abcdef0123456789abcdef01234567
OTHER=89abcdef0123456789abcdef0123456789abcdef
run_merge() {  # $1: várt kilépőkód, $2: FAKE_MR JSON
  : >"$TMP/log"
  rc=0
  FAKE_MR="$2" STUB_LOG="$TMP/log" DEV_WORKFLOW_CONFIG=.claude/skills/dev-workflow/config.md \
    bash "$TMP/scripts/merge-as-ai.sh" 7 "$SHA" >"$TMP/out" 2>"$TMP/err" || rc=$?
  [ "$rc" = "$1" ] || fail "merge-as-ai.sh: várt kilépőkód $1, kapott $rc ($2): $(cat "$TMP/err")"
}
run_merge 0 "{\"state\":\"opened\",\"sha\":\"$SHA\",\"head_pipeline\":{\"id\":1,\"sha\":\"$SHA\",\"status\":\"success\"}}"
grep -Fq "sha=$SHA" "$TMP/log" || fail "merge-as-ai.sh: a merge-kérés nincs a várt SHA-hoz kötve"
grep -Fq "should_remove_source_branch=true" "$TMP/log" || fail "merge-as-ai.sh: hiányzik a forrásbranch törlése"
[ "$(cat "$TMP/out")" = m3rg3 ] || fail "merge-as-ai.sh: nem a merge-commit SHA-t írta ki"
run_merge 2 "{\"state\":\"opened\",\"sha\":\"$SHA\",\"head_pipeline\":{\"id\":1,\"sha\":\"$OTHER\",\"status\":\"success\"}}"
run_merge 2 "{\"state\":\"opened\",\"sha\":\"$SHA\",\"head_pipeline\":{\"id\":1,\"sha\":\"$SHA\",\"status\":\"running\"}}"
run_merge 2 "{\"state\":\"opened\",\"sha\":\"$OTHER\",\"head_pipeline\":{\"id\":1,\"sha\":\"$OTHER\",\"status\":\"success\"}}"
run_merge 2 "{\"state\":\"opened\",\"draft\":true,\"sha\":\"$SHA\",\"head_pipeline\":{\"id\":1,\"sha\":\"$SHA\",\"status\":\"success\"}}"
run_merge 2 "{\"state\":\"merged\",\"sha\":\"$SHA\",\"head_pipeline\":{\"id\":1,\"sha\":\"$SHA\",\"status\":\"success\"}}"
run_merge 2 "{\"state\":\"opened\",\"sha\":\"$SHA\"}"
[ ! -s "$TMP/log" ] || fail "merge-as-ai.sh: nem teljesülő előfeltételnél is mergelt"

# 4b. wait-for-mr-sha.sh: egyező SHA → 0 + pipeline id; eltérő SHA, 0 mp keret → 3.
cp .claude/skills/dev-workflow/scripts/wait-for-mr-sha.sh "$TMP/scripts/"
rc=0
out=$(FAKE_MR="{\"head_pipeline\":{\"id\":42,\"sha\":\"$SHA\"}}" STUB_LOG="$TMP/log"   DEV_WORKFLOW_CONFIG=.claude/skills/dev-workflow/config.md   bash "$TMP/scripts/wait-for-mr-sha.sh" 7 "$SHA" 2>/dev/null) || rc=$?
[ "$rc" = 0 ] && [ "$out" = 42 ] || fail "wait-for-mr-sha.sh: egyező SHA-ra nem 0/42 (rc=$rc, out=$out)"
rc=0
FAKE_MR="{\"head_pipeline\":{\"id\":41,\"sha\":\"$OTHER\"}}" STUB_LOG="$TMP/log" EPIC_SHA_WAIT_SECONDS=0   DEV_WORKFLOW_CONFIG=.claude/skills/dev-workflow/config.md   bash "$TMP/scripts/wait-for-mr-sha.sh" 7 "$SHA" >/dev/null 2>&1 || rc=$?
[ "$rc" = 3 ] || fail "wait-for-mr-sha.sh: régi SHA pipeline-jára nem 3-as (timeout) kilépőkód ($rc)"

# 4c. epic-worktree.sh: valódi, eldobható git-repó két klónnal, isolated port-eltolás.
REPO="$(pwd)"
mkdir -p "$TMP/origin" "$TMP/w"
git init -q --bare -b master "$TMP/origin/r.git"
git clone -q "$TMP/origin/r.git" "$TMP/w/r" 2>/dev/null
(
  cd "$TMP/w/r"
  git -c user.name=t -c user.email=t@t commit -q --allow-empty -m init
  git push -q origin master
  printf 'PORT=3000\nAPP_ORIGIN=http://localhost:5173\nDATABASE_URL=postgres://a:b@127.0.0.1:5434/d\nTEST_DATABASE_URL=postgres://a:b@127.0.0.1:5433/t\nX=15434\n' >.env
)
WT="$(cd "$TMP/w/r" && EPIC_PARALLEL_MODE=isolated EPIC_SKIP_INSTALL=1 \
  EPIC_ISOLATED_PORTS='DB_HOST_PORT=5434 DB_TEST_HOST_PORT=5433 MAILPIT_SMTP_HOST_PORT=1025 MAILPIT_WEB_HOST_PORT=8025 API_PROXY_PORT=3000 WEB_DEV_PORT=5173' \
  DEV_WORKFLOW_CONFIG="$REPO/.claude/skills/dev-workflow/config.md" \
  bash "$REPO/.claude/skills/dev-workflow-execute/scripts/epic-worktree.sh" add 2 feature/ORD-1_x 2>/dev/null)" ||
  fail "epic-worktree.sh add hibával állt le"
[ -f "$WT/.env" ] || fail "epic-worktree.sh: a worktree nem kapott .env-et ($WT)"
for want in 'PORT=3020' 'APP_ORIGIN=http://localhost:5193' '127.0.0.1:5454/d' '127.0.0.1:5453/t' 'X=15434' \
  'COMPOSE_PROJECT_NAME=r-wt2' 'DB_HOST_PORT=5454' 'DB_TEST_HOST_PORT=5453' 'WEB_DEV_PORT=5193' 'API_PROXY_PORT=3020'; do
  grep -Fq "$want" "$WT/.env" || fail "epic-worktree.sh: a .env-ből hiányzik: $want"
done
rc=0
(cd "$TMP/w/r" && EPIC_SKIP_INSTALL=1 DEV_WORKFLOW_CONFIG="$REPO/.claude/skills/dev-workflow/config.md" \
  bash "$REPO/.claude/skills/dev-workflow-execute/scripts/epic-worktree.sh" add 2 feature/ORD-2_y >/dev/null 2>&1) || rc=$?
[ "$rc" = 2 ] || fail "epic-worktree.sh: foglalt slotra nem 2-es kilépőkód ($rc)"
(cd "$TMP/w/r" && DEV_WORKFLOW_CONFIG="$REPO/.claude/skills/dev-workflow/config.md" \
  bash "$REPO/.claude/skills/dev-workflow-execute/scripts/epic-worktree.sh" remove 2 >/dev/null 2>&1) ||
  fail "epic-worktree.sh remove hibával állt le"
[ ! -e "$WT" ] || fail "epic-worktree.sh remove: a worktree megmaradt"

# --- 5. Merge-frissítés force push nélkül (ORD-370) ---
# Az E6 `merge` ágának parancsai egy eldobható repón. A távoli oldal tiltja a nem
# fast-forward pusht, így egy force-ot igénylő frissítés itt elbukna. A `git merge` a
# `--no-commit` mellett is identitást kér; a CI-konténerben nincs, ezért itt `-c`-vel kapja
# (a merge-commit szerzőjét a commit-as-ai.sh állítja).
git init -q --bare -b master "$TMP/origin/m.git"
git -C "$TMP/origin/m.git" config receive.denyNonFastForwards true
git clone -q "$TMP/origin/m.git" "$TMP/w/m" 2>/dev/null
(
  cd "$TMP/w/m"
  g() { git -c user.name=t -c user.email=t@t "$@"; }
  printf 'a\n' >a.txt; printf 'k\n' >k.txt; git add .; g commit -qm init; git push -q origin master
  git switch -q -c feature/ORD-1_x; printf 'b\n' >b.txt; git add b.txt; g commit -qm story
  git push -q origin feature/ORD-1_x
  git switch -q master; printf 'c\n' >c.txt; git add c.txt; g commit -qm masik; git push -q origin master
  git switch -q feature/ORD-1_x
) >/dev/null 2>&1 || fail "a merge-frissítés tesztrepója nem állt össze"
(
  cd "$TMP/w/m" && git fetch -q origin &&
    git -c user.name=t -c user.email=t@t merge --no-commit --no-ff origin/master >/dev/null 2>&1 &&
    bash "$REPO/.claude/skills/dev-workflow/scripts/commit-as-ai.sh" --no-edit >/dev/null &&
    git push -q origin feature/ORD-1_x 2>/dev/null
) || fail "E6 merge-frissítés: a merge-commit vagy a force nélküli push elbukott"
[ "$(git -C "$TMP/w/m" log -1 --format=%an)" != t ] || fail "E6 merge-frissítés: a merge-commit nem AI-identitású"
[ "$(git -C "$TMP/w/m" rev-list --parents -n 1 HEAD | wc -w | tr -d ' ')" = 3 ] ||
  fail "E6 merge-frissítés: nem merge-commit készült"
git -C "$TMP/w/m" merge-base --is-ancestor origin/master HEAD || fail "E6 merge-frissítés: az alap nem őse a branchnek"
# Ütközés: merge --abort után a munkafa tiszta, a HEAD változatlan.
(
  cd "$TMP/w/m"
  g() { git -c user.name=t -c user.email=t@t "$@"; }
  printf 'feature\n' >k.txt; g commit -qam f
  git switch -q master; git merge -q --ff-only origin/master
  printf 'master\n' >k.txt; g commit -qam m; git push -q origin master
  git switch -q feature/ORD-1_x
) >/dev/null 2>&1 || fail "az ütközéses teszteset nem állt össze"
BEFORE=$(git -C "$TMP/w/m" rev-parse HEAD)
git -C "$TMP/w/m" fetch -q origin
if git -C "$TMP/w/m" -c user.name=t -c user.email=t@t merge --no-commit --no-ff origin/master >/dev/null 2>&1; then
  fail "E6 merge-frissítés: az ütközéses eset nem ütközött"
fi
git -C "$TMP/w/m" merge --abort || fail "E6 merge-frissítés: a merge --abort elbukott"
[ "$(git -C "$TMP/w/m" rev-parse HEAD)" = "$BEFORE" ] && [ -z "$(git -C "$TMP/w/m" status --porcelain)" ] ||
  fail "E6 merge-frissítés: ütközés és abort után a munkafa nem az eredeti"

echo "verify-epic-mode-config: OK"
