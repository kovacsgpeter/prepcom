#!/usr/bin/env sh
# Statikus self-check a wait-for-pipeline.sh (COCALC-261 / GATE-1) blokkoló
# kapu-szkripthez, a verify-test-env-config.sh mintájára. A COCALC-261 teszterve
# szándékosan csak statikus ellenőrzés — a szkript tényleges, élő GitLab GraphQL-hívás
# elleni viselkedését (piros/zöld pipeline, backend-deploy manuális job) a felhasználó
# manuálisan ellenőrzi, lásd a ticket "Teszterv" szekcióját. A 4.22.0 óta a fájl végén
# egy hamis `glab`-os viselkedés-teszt is fut (429 újrapróbálás, nem-429 hiba), ami
# nem hív GitLabot, és a poll/újrapróbálás kapcsolók config.md-ből jövését is ellenőrzi.
#
# Használat: sh ci/wait-for-pipeline-check.sh   (repo gyökeréből)

set -eu

SCRIPT="$(pwd)/.claude/skills/dev-workflow/scripts/wait-for-pipeline.sh"

test -f "$SCRIPT"

# Shell-szintaxis ellenőrzés.
bash -n "$SCRIPT"

# A dev-workflow/config.md-ben dokumentált szerződés nyomai a szkriptben:
grep -Fq 'set -euo pipefail' "$SCRIPT"
grep -Fq 'glab api graphql' "$SCRIPT"
grep -Fq 'allowFailure' "$SCRIPT"

# AC3 — fail-closed ág megléte parse-hiba/üres válasz esetén.
grep -Fq 'fail closed' "$SCRIPT"

# AC4/5 — a blokkoló-szabály (stage nem deploy/post-deploy/.pre és nem allow_failure).
grep -Fq 'PIPELINE_GATE_BLOCKING_JOBS' "$SCRIPT"
grep -Fq 'post-deploy' "$SCRIPT"
grep -Fq '.pre' "$SCRIPT"

# AC11 — timeout-kapcsoló.
grep -Fq 'PIPELINE_GATE_TIMEOUT_MINUTES' "$SCRIPT"

# AC12 — nincs pipeline az MR-hez -> azonnali hiba, timeout kivárása nélkül.
grep -Fq 'nincs pipeline' "$SCRIPT"

# Code review javítás (COCALC-261) — escapelt idézőjeles job-név fail-closed kezelése,
# és a MANUAL job-státusz korai, informatív jelzése.
grep -Fq 'escapelt' "$SCRIPT"
grep -Fq 'MANUAL' "$SCRIPT"

# Regressziós horog — a GitLab GraphQL `Project.pipelines` connection nem fogad `orderBy`
# argumentumot (ettől a szkript minden futáskor fail-closed-olt); a legfrissebb
# pipeline-t a `first: 1` önmagában adja. A `pipelines(...)` hívás argumentumlistája ne
# tartalmazzon `orderBy`-t (a fejléc-kommentben a szó előfordulhat, azt nem nézzük), és
# pontosan `pipelines(ref: $ref, first: 1)` formában kérdezzen.
if grep -Eq 'pipelines\([^)]*orderBy' "$SCRIPT"; then
  echo "HIBA: a wait-for-pipeline.sh GraphQL lekérdezésének pipelines(...) hívása" >&2
  echo "'orderBy'-t tartalmaz — a GitLab 'pipelines' connection ezt nem fogadja el," >&2
  echo "a szkript minden futáskor fail-closed-olna." >&2
  exit 1
fi
grep -Fq 'pipelines(ref: $ref, first: 1)' "$SCRIPT"

# A poll-intervallum, az újrapróbálás és a rate limit kezelése a központi config.md-ből
# jön (config-value.sh), nem beégetett érték — a kulcsoknak ott kell lenniük, mindkét
# fában (.claude és a Codex-tükör .agents), a sablonban is.
HELPER="$(pwd)/.claude/skills/dev-workflow/scripts/config-value.sh"
test -f "$HELPER"
bash -n "$HELPER"
grep -Fq 'config-value.sh' "$SCRIPT"
grep -Fq 'PIPELINE_GATE_POLL_SECONDS' "$SCRIPT"
grep -Fq 'GITLAB_RATE_LIMIT_RETRIES' "$SCRIPT"
if grep -Eq '^POLL_INTERVAL_SECONDS=[0-9]+' "$SCRIPT"; then
  echo "HIBA: a wait-for-pipeline.sh POLL_INTERVAL_SECONDS értéke beégetett — a config.md" >&2
  echo "PIPELINE_GATE_POLL_SECONDS kapcsolójából kell jönnie." >&2
  exit 1
fi
for cfg in \
  .claude/skills/dev-workflow/config.md \
  .claude/skills/dev-workflow/config.template.md; do
  for key in PIPELINE_GATE_TIMEOUT_MINUTES PIPELINE_GATE_POLL_SECONDS; do
    grep -Fq "| \`$key\` |" "$cfg" || { echo "HIBA: $cfg nem tartalmazza a(z) $key kapcsolót." >&2; exit 1; }
  done
done
for cfg in \
  .claude/skills/dev-workflow/config.md \
  .claude/skills/dev-workflow/config.template.md \
  .agents/skills/dev-workflow/config.md \
  .agents/skills/dev-workflow/config.template.md; do
  for key in GITLAB_RATE_LIMIT_RETRIES GITLAB_RATE_LIMIT_BACKOFF_SECONDS \
    CODE_REVIEW_MAX_INLINE_COMMENTS TEST_ENV_DEPLOY_POLL_SECONDS TEST_ENV_DEPLOY_WAIT_MINUTES; do
    grep -Fq "| \`$key\` |" "$cfg" || { echo "HIBA: $cfg nem tartalmazza a(z) $key kapcsolót." >&2; exit 1; }
  done
done
for tree in .claude .agents; do
  W="$(pwd)/$tree/skills/dev-workflow/scripts/glab-note-as-ai.sh"
  test -f "$W"
  bash -n "$W"
  grep -Fq 'GITLAB_RATE_LIMIT_RETRIES' "$W"
  cmp -s "$HELPER" "$(pwd)/$tree/skills/dev-workflow/scripts/config-value.sh" \
    || { echo "HIBA: $tree/skills/dev-workflow/scripts/config-value.sh eltér a .claude-os másolattól." >&2; exit 1; }
done

# Viselkedés-teszt hamis `glab`-bal (nincs hálózat, nincs GitLab-hívás): a 429-et a
# szkript újrapróbálja, más hibánál azonnal fail closed, a konfig-érték pedig a
# config.md-ből jön (itt egy eldobható config-másolaton, DEV_WORKFLOW_CONFIG-gal).
if command -v git >/dev/null 2>&1 && git remote get-url origin >/dev/null 2>&1; then
  STUB_DIR="$(mktemp -d)"
  trap 'rm -rf "$STUB_DIR"' EXIT
  cat > "$STUB_DIR/glab" <<'STUB'
#!/usr/bin/env bash
# A védett branch-minták lekérdezése (check-protected-ref.sh) nem számít a hívásszámba.
case "$*" in
  *protected_branches*)
    [ "${STUB_PROTECTED:-ok}" = "fail" ] && { echo "glab: 403 Forbidden" >&2; exit 1; }
    echo '[{"id":1,"name":"master","push_access_levels":[{"access_level":40,"access_level_description":"Maintainers"}]},{"id":2,"name":"feature/*","push_access_levels":[]}]'
    exit 0 ;;
esac
n=$(cat "$STUB_STATE" 2>/dev/null || echo 0); n=$((n+1)); echo "$n" > "$STUB_STATE"
if [ "${STUB_MODE:-}" = "other" ]; then echo "glab: 404 Not Found" >&2; exit 3; fi
if [ "$n" -le "${STUB_429_COUNT:-0}" ]; then echo "Rate limit exceeded; see https://docs.gitlab.com/" >&2; exit 1; fi
# STUB_MODE=stuck|queued: az első STUB_PENDING_CALLS hívásra PENDING job (stuck: true/false),
# utána SUCCESS. A stuck mező nélküli (régi) válaszforma is támogatott (alapeset).
if [ "$n" -le "${STUB_PENDING_CALLS:-0}" ]; then
  stuck=false; [ "${STUB_MODE:-}" = "stuck" ] && stuck=true
  echo '{"data":{"project":{"pipelines":{"nodes":[{"status":"PENDING","jobs":{"nodes":[{"name":"angular-build","status":"PENDING","stuck":'"$stuck"',"allowFailure":false,"stage":{"name":"build"}}]}}]}}}}'
  exit 0
fi
echo '{"data":{"project":{"pipelines":{"nodes":[{"status":"SUCCESS","jobs":{"nodes":[{"name":"angular-build","status":"SUCCESS","allowFailure":false,"stage":{"name":"build"}}]}}]}}}}'
STUB
  chmod +x "$STUB_DIR/glab"
  sed -E 's/^(\| `GITLAB_RATE_LIMIT_BACKOFF_SECONDS` \| `)[0-9]+(`)/\10\2/; s/^(\| `PIPELINE_GATE_POLL_SECONDS` \| `)[0-9]+(`)/\11\2/' \
    .claude/skills/dev-workflow/config.md > "$STUB_DIR/config.md"

  # $1: STUB_429_COUNT, $2: STUB_MODE, $3: várt kilépőkód, $4: várt glab-hívásszám,
  # $5: STUB_PENDING_CALLS, $6: PIPELINE_GATE_STUCK_GRACE_SECONDS
  run_gate() {
    rm -f "$STUB_DIR/state"
    rc=0
    PATH="$STUB_DIR:$PATH" STUB_STATE="$STUB_DIR/state" STUB_429_COUNT="$1" STUB_MODE="$2" \
      STUB_PENDING_CALLS="${5:-0}" PIPELINE_GATE_STUCK_GRACE_SECONDS="${6:-120}" \
      DEV_WORKFLOW_CONFIG="$STUB_DIR/config.md" \
      bash "$SCRIPT" selfcheck-branch >"$STUB_DIR/out" 2>&1 || rc=$?
    calls="$(cat "$STUB_DIR/state" 2>/dev/null || echo 0)"
    if [ "$rc" != "$3" ] || [ "$calls" != "$4" ]; then
      echo "HIBA: wait-for-pipeline.sh viselkedés-teszt (429=$1, mód='$2', pending=${5:-0}, grace=${6:-120}): kilépőkód $rc (várt $3), glab-hívás $calls (várt $4)." >&2
      cat "$STUB_DIR/out" >&2
      exit 1
    fi
  }
  run_gate 0 ""      0 1   # azonnal zöld
  run_gate 2 ""      0 3   # kétszer 429, utána zöld -> újrapróbál
  run_gate 99 ""     1 6   # tartós 429 -> 5 újrapróbálás után fail closed (1 + 5 hívás)
  run_gate 0 "other" 1 1   # nem-429 hiba -> azonnal fail closed, nincs újrapróbálás
  # ORD-369 — elakadt (stuck) job: a türelmi idő után 4-es kód, diagnózissal.
  run_gate 0 "stuck"  4 2 99 1   # tartósan stuck -> 1 mp türelmi idő után 4
  grep -Fq 'NINCS ALKALMAS RUNNER' "$STUB_DIR/out" || { echo "HIBA: a 4-es kilépéshez nincs diagnózis." >&2; exit 1; }
  grep -Fq "'selfcheck-branch' branch egyik védett mintára sem illeszkedik" "$STUB_DIR/out" ||
    { echo "HIBA: a 4-es kilépés diagnózisából hiányzik a védett-minta ellenőrzés." >&2; exit 1; }
  run_gate 0 "queued" 0 4 3 1    # sorban áll (PENDING, nem stuck) a türelmi időn túl is -> vár, zöld
  run_gate 0 "stuck"  0 2 1 5    # stuck, de a türelmi időn belül feloldódik -> zöld
  run_gate 0 "stuck"  0 3 2 0    # 0 = kikapcsolva: stuck mellett is vár -> zöld

  # ORD-369 — check-protected-ref.sh: illeszkedő / nem illeszkedő minta, a három mód, API-hiba.
  CPR="$(pwd)/.claude/skills/dev-workflow/scripts/check-protected-ref.sh"
  bash -n "$CPR"
  run_cpr() {  # $1: branch, $2: mód, $3: STUB_PROTECTED, $4: várt kilépőkód, $5: várt kimenet-részlet
    rc=0
    PATH="$STUB_DIR:$PATH" STUB_STATE="$STUB_DIR/state" STUB_PROTECTED="$3" \
      PIPELINE_GATE_PROTECTED_REF_CHECK="$2" DEV_WORKFLOW_CONFIG="$STUB_DIR/config.md" \
      bash "$CPR" "$1" >"$STUB_DIR/out" 2>&1 || rc=$?
    if [ "$rc" != "$4" ] || { [ -n "$5" ] && ! grep -Fq -- "$5" "$STUB_DIR/out"; }; then
      echo "HIBA: check-protected-ref.sh ($1, $2, $3): kilépőkód $rc (várt $4), a kimenetből hiányzik: $5" >&2
      cat "$STUB_DIR/out" >&2
      exit 1
    fi
  }
  run_cpr feature/ORD-1_x warn ok   0 'védett (minta: feature/*)'
  run_cpr master          stop ok   0 'védett (minta: master)'
  run_cpr bugfix/ORD-1_x  warn ok   0 'FIGYELEM'
  run_cpr bugfix/ORD-1_x  stop ok   2 'HIBA'
  run_cpr bugfix/ORD-1_x  stop fail 0 'nem kérdezhetők le'
  run_cpr bugfix/ORD-1_x  off  ok   0 ''
  [ ! -s "$STUB_DIR/out" ] || { echo "HIBA: check-protected-ref.sh off módban is ellenőrzött." >&2; exit 1; }
  run_cpr bugfix/ORD-1_x  bogus ok  0 'érvénytelen'
  for cfg in .claude/skills/dev-workflow/config.md .claude/skills/dev-workflow/config.template.md; do
    for key in PIPELINE_GATE_STUCK_GRACE_SECONDS PIPELINE_GATE_PROTECTED_REF_CHECK; do
      grep -Fq "| \`$key\` |" "$cfg" || { echo "HIBA: $cfg nem tartalmazza a(z) $key kapcsolót." >&2; exit 1; }
    done
  done
  for kv in PIPELINE_GATE_STUCK_GRACE_SECONDS=120 PIPELINE_GATE_PROTECTED_REF_CHECK=warn; do
    got=$(DEV_WORKFLOW_CONFIG=.claude/skills/dev-workflow/config.template.md bash "$HELPER" "${kv%%=*}" '<nincs>')
    [ "$got" = "${kv#*=}" ] || { echo "HIBA: a sablonban ${kv%%=*} = '$got', nem '${kv#*=}'." >&2; exit 1; }
  done
else
  echo "wait-for-pipeline.sh self-check: nincs git origin remote — a viselkedés-teszt kihagyva."
fi

echo "wait-for-pipeline.sh self-check: minden statikus ellenorzes zold."
