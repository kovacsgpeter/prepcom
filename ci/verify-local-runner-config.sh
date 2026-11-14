#!/usr/bin/env sh
# dev-workflow (ORD-365, 4.25.0) önellenőrző a local-runnerhez és a story-runnerhez
# (LOCAL_EXECUTOR_HOST, EPIC_STORY_HOST):
#   1. a fájlok megvannak (local-runner.md, story-runner-brief.md, build-prompt.js,
#      apply-response.js);
#   2. a kulcsok és értékkészletük a két config.md-ben (egyező értékkel) és a két
#      config.template.md-ben (a csomag-alapértékekkel);
#   3. a bekötések: SKILL.md A6 / A7 és epic-mode.md E5 a local-runnerre és a
#      story-runner-briefre hivatkozik, a szerződés a kötelező elemeket tartalmazza;
#   4. az új csomagfájlokban nincs repófüggő érték;
#   5. a build-prompt.js és az apply-response.js öntesztje (kilépési kódok 0/3/4/5).
set -eu

fail() {
  echo "verify-local-runner-config: $*" >&2
  exit 1
}

CV=.claude/skills/dev-workflow/scripts/config-value.sh
LR=.claude/agents/local-runner.md
BRIEF=.claude/skills/dev-workflow-execute/story-runner-brief.md
BP=.claude/skills/dev-workflow/scripts/build-prompt.js
AR=.claude/skills/dev-workflow/scripts/apply-response.js
S=.claude/skills/dev-workflow-execute/SKILL.md
EM=.claude/skills/dev-workflow-execute/epic-mode.md

# --- 1. Fájlok ---
for f in "$LR" "$BRIEF" "$BP" "$AR"; do
  test -f "$f" || fail "hiányzó fájl: $f"
done

# --- 2. Config-kulcsok ---
cval() {  # $1: config, $2: kulcs
  DEV_WORKFLOW_CONFIG="$1" bash "$CV" "$2" '<nincs>'
}
# A preset-tábla sorának három profil-cellája (a .claude configban).
preset() {  # $1: config, $2: kulcs
  awk -v K="$2" -F'|' 'index($2, "`" K "`") { for (i = 3; i <= 5; i++) { v = $i; gsub(/[ `]/, "", v); printf "%s ", v }; exit }' "$1"
}
RUN_KEYS="LOCAL_RUN_DIR LOCAL_CONVENTIONS_FILE LOCAL_FORMAT_CMD LOCAL_CHECK_CMD LOCAL_CHECK_DB_CMD"
for side in config config.template; do
  C=".claude/skills/dev-workflow/$side.md"
  A=".agents/skills/dev-workflow/$side.md"
  # ORD-497: a szakaszok magyarázata (értékfelsorolások) a config-reference.md-ben van.
  CR=.claude/skills/dev-workflow/config-reference.md
  AR_=.agents/skills/dev-workflow/config-reference.md
  for ref in "$CR" "$AR_"; do
    grep -Fq '### EPIC_STORY_HOST értékek' "$ref" || fail "$ref: hiányzik az „EPIC_STORY_HOST értékek” szakasz"
    grep -Fq '| `subagent` |' "$ref" || fail "$ref: hiányzik a subagent érték-sor"
  done
  grep -Fq '### LOCAL_EXECUTOR_HOST értékek' "$CR" || fail "$CR: hiányzik a „LOCAL_EXECUTOR_HOST értékek” szakasz"
  grep -Fq '## Helyi végrehajtó (LOCAL_EXECUTOR_HOST)' "$AR_" || fail "$AR_: hiányzik a „Helyi végrehajtó” szakasz"
  grep -Fq 'csak a Claude-workflow-ban' "$A" || fail "$A: hiányzik a Codex-port jelölése"

  # EPIC_STORY_HOST: egyező, érvényes érték.
  a=$(cval "$C" EPIC_STORY_HOST); b=$(cval "$A" EPIC_STORY_HOST)
  [ "$a" = "$b" ] || fail "EPIC_STORY_HOST: a .claude ($a) és az .agents ($b) $side értéke eltér"
  case "$a" in main | subagent) ;; *) fail "$C: EPIC_STORY_HOST érvénytelen érték: $a" ;; esac

  # LOCAL_EXECUTOR_HOST: a .claude preset-sora (három azonos cella) = az .agents táblája.
  p=$(preset "$C" LOCAL_EXECUTOR_HOST)
  [ -n "$p" ] || fail "$C: hiányzik a LOCAL_EXECUTOR_HOST preset-sor"
  set -- $p
  [ "$#" = 3 ] && [ "$1" = "$2" ] && [ "$2" = "$3" ] || fail "$C: a LOCAL_EXECUTOR_HOST preset-sora nem három azonos érték: $p"
  case "$1" in main | subagent) ;; *) fail "$C: LOCAL_EXECUTOR_HOST érvénytelen érték: $1" ;; esac
  b=$(cval "$A" LOCAL_EXECUTOR_HOST)
  [ "$1" = "$b" ] || fail "LOCAL_EXECUTOR_HOST: a .claude ($1) és az .agents ($b) $side értéke eltér"

  for k in $RUN_KEYS; do
    a=$(cval "$C" "$k"); b=$(cval "$A" "$k")
    [ "$a" != '<nincs>' ] || fail "$C: a config-value.sh nem olvassa ki: $k"
    [ "$a" = "$b" ] || fail "$k: a .claude ($a) és az .agents ($b) $side értéke eltér"
  done
done
for tpl in .claude/skills/dev-workflow/config.template.md .agents/skills/dev-workflow/config.template.md; do
  for kv in EPIC_STORY_HOST=main 'LOCAL_RUN_DIR=../{repo}-local-run' 'LOCAL_CONVENTIONS_FILE={task_dir}/conventions.md' \
    LOCAL_FORMAT_CMD=- LOCAL_CHECK_CMD=- LOCAL_CHECK_DB_CMD=-; do
    got=$(cval "$tpl" "${kv%%=*}")
    [ "$got" = "${kv#*=}" ] || fail "$tpl: ${kv%%=*} csomag-alapértéke '$got', nem '${kv#*=}'"
  done
done
[ "$(preset .claude/skills/dev-workflow/config.template.md LOCAL_EXECUTOR_HOST)" = 'main main main ' ] ||
  fail "config.template.md: a LOCAL_EXECUTOR_HOST csomag-alapértéke nem main"

# --- 3. Bekötések ---
section() {  # $1: fájl, $2: a szakasz címének eleje; a következő azonos szintű címig
  awk -v H="$2" 'index($0, H) == 1 { on = 1; print; next } on && /^#{2,3} / { exit } on { print }' "$1"
}
section "$S" '### A6 ' | grep -Fq 'LOCAL_EXECUTOR_HOST=subagent' || fail "$S A6: hiányzik a LOCAL_EXECUTOR_HOST=subagent ág"
section "$S" '### A6 ' | grep -Fq '../../agents/local-runner.md' || fail "$S A6: nem hivatkozik a local-runner.md-re"
section "$S" '### A7 ' | grep -Fq 'LOCAL_EXECUTOR_HOST=subagent' || fail "$S A7: hiányzik a LOCAL_EXECUTOR_HOST=subagent ág"
section "$S" '### A7 ' | grep -Fq '`qa-fast`' || fail "$S A7: hiányzik a local-runner qa-fast módja"
section "$EM" '## E5 ' | grep -Fq 'EPIC_STORY_HOST' || fail "$EM E5: hiányzik az EPIC_STORY_HOST ág"
section "$EM" '## E5 ' | grep -Fq '(story-runner-brief.md)' || fail "$EM E5: nem hivatkozik a story-runner-brief.md-re"
section "$EM" '## E5 ' | grep -Fq '../../agents/local-runner.md' || fail "$EM E5: nem hivatkozik a local-runner.md-re"
section "$EM" '## Megállási pontok' | grep -Fq 'LOCAL_UNREACHABLE' || fail "$EM: a megállási pontokból hiányzik a LOCAL_UNREACHABLE"
for want in build-prompt.js apply-response.js call-local-model.sh commit-as-ai.sh LOCAL_UNREACHABLE PLAN_DEVIATION \
  LOCAL_QA_FALLBACK local-stats.md '| Story | Sub-task | Részlépés | Helyi hívás | Eredmény | Visszaesés Claude-ra | Ok |' \
  'exit 1' 'exit 2' '**3-as kilépés:**' '4: a modell maga jelzett hibát; 5: tiltott útvonal'; do
  grep -Fq -- "$want" "$LR" || fail "$LR: hiányzik a szerződésből: $want"
done
for want in '## Felosztás' '**Merge-et nem csinál.**' '## Story-runner feladatleírás' LOCAL_UNREACHABLE SUBAGENT_UNAVAILABLE \
  '(../../agents/local-runner.md)' '## Az eredmény ellenőrzése (fő szál)' run-notes.md BRANCH_NAME_PATTERN; do
  grep -Fq -- "$want" "$BRIEF" || fail "$BRIEF: hiányzik: $want"
done
# ORD-375: a nyitott circuit breaker (exit 2, „circuit breaker nyitva” a stderr-ben) nem
# elérhetetlenség, hanem visszaesés. A felismerés a call-local-model.sh üzenetére épül (azt a
# verify-call-local-model.sh 7. esete élesben ellenőrzi), ezért annak is itt kell lennie.
BREAKER_MSG='circuit breaker nyitva'
grep -Fq "$BREAKER_MSG" .claude/skills/dev-workflow/scripts/call-local-model.sh ||
  fail "call-local-model.sh: nincs '$BREAKER_MSG' üzenet, a local-runner breaker-felismerése nem működne"
for f in "$LR" "$BRIEF"; do
  grep -Fq "$BREAKER_MSG" "$f" || fail "$f: hiányzik a nyitott breaker kezelése (ORD-375)"
done
grep -Fq '2> <response.json>.err' "$LR" || fail "$LR: a helyi hívás stderr-je nem kerül fájlba (a breaker nem ismerhető fel)"
section "$LR" '## Eredmény-kezelés' | grep -Fq 'nyitott breakerrel' ||
  fail "$LR: az eredmény-kezelési táblából hiányzik a nyitott breaker sora"
section "$LR" '## `qa-fast` mód' | grep -Fq "$BREAKER_MSG" ||
  fail "$LR: a qa-fast módból hiányzik a nyitott breaker kezelése"

# --- 4. Repófüggő érték az új csomagfájlokban ---
if grep -niE 'ordoviii|pnpm|tail[0-9a-f]{6}\.ts\.net' "$LR" "$BRIEF" "$BP" "$AR"; then
  fail "repófüggő érték az új csomagfájlokban (lásd fent)"
fi

# --- 5. Szkript-öntesztek ---
command -v node >/dev/null 2>&1 || fail "az önteszthez node kell"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
WT="$TMP/wt"
RUN="$TMP/run"
mkdir -p "$WT/.claude/skills/dev-workflow/local-prompts" "$WT/src" "$RUN"
printf 'TEMPLATE\n' >"$WT/.claude/skills/dev-workflow/local-prompts/implementer.md"
printf 'TASK\n' >"$RUN/task.md"
printf 'RUN-CONVENTIONS\n' >"$RUN/conventions.md"
printf 'WT-CONVENTIONS\n' >"$WT/conv.md"
printf 'const a = 1;\n' >"$WT/src/a.ts"
bp() {  # $1: várt kilépőkód; a többi: env-értékek (K=V), utána --
  want=$1; shift
  rc=0
  env DEV_WORKFLOW_CONFIG="$WT/nincs.md" "$@" node "$BP" "$WT" "$TMP/prompt.txt" "$RUN/task.md" src/a.ts src/uj.ts \
    >"$TMP/out" 2>"$TMP/err" || rc=$?
  [ "$rc" = "$want" ] || fail "build-prompt.js: várt kilépőkód $want, kapott $rc: $(cat "$TMP/err")"
}
bp 0 LOCAL_CONVENTIONS_FILE=
for want in TEMPLATE TASK RUN-CONVENTIONS '## CURRENT FILE CONTENTS' '### FILE: src/a.ts' 'const a = 1;' \
  '### FILE: src/uj.ts' '(does not exist yet — NEW file)'; do
  grep -Fq -- "$want" "$TMP/prompt.txt" || fail "build-prompt.js: a promptból hiányzik: $want"
done
grep -Fq 'prompt chars:' "$TMP/out" || fail "build-prompt.js: nem írta ki a prompt hosszát"
bp 0 LOCAL_CONVENTIONS_FILE=conv.md
grep -Fq WT-CONVENTIONS "$TMP/prompt.txt" && ! grep -Fq RUN-CONVENTIONS "$TMP/prompt.txt" ||
  fail "build-prompt.js: a LOCAL_CONVENTIONS_FILE (munkafa-relatív) nem érvényesült"
bp 0 'LOCAL_CONVENTIONS_FILE={task_dir}/conventions.md'
grep -Fq RUN-CONVENTIONS "$TMP/prompt.txt" || fail "build-prompt.js: a {task_dir} helyőrző nem érvényesült"
printf '| Kapcsoló | Érték | Jelentés |\n|---|---|---|\n| `LOCAL_CONVENTIONS_FILE` | `conv.md` | x |\n' >"$WT/cfg.md"
rc=0
LOCAL_CONVENTIONS_FILE= DEV_WORKFLOW_CONFIG="$WT/cfg.md" node "$BP" "$WT" "$TMP/prompt.txt" "$RUN/task.md" src/a.ts >/dev/null 2>&1 || rc=$?
[ "$rc" = 0 ] && grep -Fq WT-CONVENTIONS "$TMP/prompt.txt" || fail "build-prompt.js: a config.md LOCAL_CONVENTIONS_FILE értéke nem érvényesült"
bp 3 LOCAL_CONVENTIONS_FILE= LOCAL_PROMPT_MAX_CHARS=50
grep -Fq 'TOO LONG' "$TMP/err" || fail "build-prompt.js: a 3-as kilépésnél hiányzik a TOO LONG üzenet"

ar() {  # $1: várt kilépőkód, $2: válasz-JSON, a többi: engedélyezett útvonalak
  want=$1; printf '%s' "$2" >"$TMP/resp.json"; shift 2
  rc=0
  node "$AR" "$WT" "$TMP/resp.json" "$@" >"$TMP/out" 2>"$TMP/err" || rc=$?
  [ "$rc" = "$want" ] || fail "apply-response.js: várt kilépőkód $want, kapott $rc: $(cat "$TMP/err")"
}
ar 0 '{"status":"ok","summary":"s","filesWritten":["src/b.ts"],"fileContents":{"src/b.ts":"export const b = 2;"},"commitMessage":"feat(PROJ-1): b"}' src/b.ts
[ "$(cat "$WT/src/b.ts")" = 'export const b = 2;' ] && [ "$(tail -c 1 "$WT/src/b.ts" | od -An -c | tr -d ' ')" = '\n' ] ||
  fail "apply-response.js: a fájl nem (záró sortöréssel) íródott ki"
[ "$(cat "$TMP/resp.json.commitmsg")" = 'feat(PROJ-1): b' ] || fail "apply-response.js: hibás .commitmsg"
ar 4 '{"status":"error","summary":"nem megy","filesWritten":[],"fileContents":{}}' src/b.ts
ar 5 '{"status":"ok","summary":"s","filesWritten":["src/c.ts"],"fileContents":{"src/c.ts":"x"}}' src/b.ts
ar 5 '{"status":"ok","summary":"s","filesWritten":["../kint.ts"],"fileContents":{"../kint.ts":"x"}}' ../kint.ts
ar 5 '{"status":"ok","summary":"s","filesWritten":["src/d.ts"],"fileContents":{}}' src/d.ts
[ ! -e "$WT/src/c.ts" ] && [ ! -e "$TMP/kint.ts" ] && [ ! -e "$WT/src/d.ts" ] ||
  fail "apply-response.js: elutasított válasznál is írt fájlt"

echo "verify-local-runner-config: OK"
