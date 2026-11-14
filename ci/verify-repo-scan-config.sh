#!/usr/bin/env sh
# COCALC-270 (SCAN-1) önellenőrzés: a párhuzamosított repo-felderítés config/skill/agent
# huzalozása és a fájlút-validációs szabály (validate-scan-paths.sh) tényleges viselkedése.
set -eu

# --- 1. A subagent-regisztráció és a mérvadó skill-fájl megléte (COCALC-217 mintája) ---
test -f .claude/agents/repo-scanner.md
test -f .claude/skills/dev-workflow-intake/repo-scanner.md
grep -Fq '../skills/dev-workflow-intake/repo-scanner.md' .claude/agents/repo-scanner.md
grep -Fq 'name: repo-scanner' .claude/agents/repo-scanner.md
grep -Fq 'name: repo-scanner' .claude/skills/dev-workflow-intake/repo-scanner.md

# --- 2. A 3+1 új config.md kulcs regisztrálva a WORKFLOW_PROFILE preset-táblában ---
grep -Fq '| `CODE_SCAN_INTAKE` | `off` | `auto` | `always` |' .claude/skills/dev-workflow/config-reference.md
grep -Fq '| `CODE_SCAN_STRATEGY` | `hybrid` | `hybrid` | `hybrid` |' .claude/skills/dev-workflow/config-reference.md
# COCALC-306 óta profilonként differenciált (cheap 2 / balanced 4 / genius 6), lásd a
# config.md preset-tábla sorát és a CHANGELOG 4.17.0 szakaszát.
grep -Fq '| `CODE_SCAN_MAX_AGENTS` | `2` | `4` | `6` |' .claude/skills/dev-workflow/config-reference.md
grep -Fq '| `CODE_SCAN_MODEL` | `sonnet` | `sonnet` | `sonnet` |' .claude/skills/dev-workflow/config-reference.md
grep -Fq '### CODE_SCAN_INTAKE értékek' .claude/skills/dev-workflow/config-reference.md
grep -Fq '### CODE_SCAN_STRATEGY értékek' .claude/skills/dev-workflow/config-reference.md
grep -Fq 'dynamic` módban **nincs meg**' .claude/skills/dev-workflow/config-reference.md

# --- 3. dev-workflow-intake 2.a a párhuzamos orchestrálást írja le ---
# ORD-498: a részletek a code-scan.md-ben vannak, a SKILL.md 2.a csak hivatkozik rájuk.
CS=.claude/skills/dev-workflow-intake/code-scan.md
grep -Fq '## Orchestrálás `CODE_SCAN_STRATEGY` szerint' "$CS"
grep -Fq '**`hybrid`**' "$CS"
grep -Fq '**`dynamic`**' "$CS"
grep -Fq '**`layered`**' "$CS"
grep -Fq 'Kötelező fájlút-validáció' "$CS"
grep -Fq '[`code-scan.md`](code-scan.md)' .claude/skills/dev-workflow-intake/SKILL.md

# --- 4. jira-ticket-template.md a CODE_SCAN_INTAKE=auto nulla-találat fallback-et ismeri ---
grep -Fq 'CODE_SCAN_INTAKE=auto' .claude/skills/dev-workflow/jira-ticket-template.md

# --- 5. A fájlút-validáció tényleges, gépileg tesztelhető viselkedése ---
test -f .claude/skills/dev-workflow-intake/scripts/validate-scan-paths.sh

tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT
mkdir -p "$tmp_dir/backend"
: > "$tmp_dir/backend/letezik.txt"

# 5a. Létező + nem létező út vegyesen: a nem létező kiesik, a létező megmarad.
out=$(printf '%s\n' "backend/letezik.txt" "nincs-ilyen.txt" \
  | bash .claude/skills/dev-workflow-intake/scripts/validate-scan-paths.sh "$tmp_dir")
[ "$out" = "backend/letezik.txt" ]

# 5b. Csak nem létező utak: minden lelet kiesik, a szkript jelzi és 2-vel lép ki.
set +e
warn=$(printf '%s\n' "nincs-1.txt" "nincs-2.txt" \
  | bash .claude/skills/dev-workflow-intake/scripts/validate-scan-paths.sh "$tmp_dir" 2>&1 1>/dev/null)
exit_code=$?
set -e
[ "$exit_code" -eq 2 ]
printf '%s' "$warn" | grep -Fq 'ALL_FINDINGS_DROPPED'

# 5c. Üres bemenet: nincs mit validálni, sikeres kilépés.
printf '' | bash .claude/skills/dev-workflow-intake/scripts/validate-scan-paths.sh "$tmp_dir"

echo "verify-repo-scan-config: OK"
