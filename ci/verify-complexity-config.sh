#!/usr/bin/env sh
# COCALC-273 (MEAS-2) onellenorzes: a komplexitas-becsles (estimate-complexity.sh) es a
# vegrehajto-szint-feloldas (resolve-executor-level.sh) tenyleges viselkedese, valamint a
# config.md/jira-ticket-template.md/tracker-adapter.md/dor-checklist.md dokumentacios
# huzalozas.
set -eu

CONFIG=.claude/skills/dev-workflow/config-reference.md  # ORD-497: a magyarázatok a referenciában
TEMPLATE=.claude/skills/dev-workflow/jira-ticket-template.md
ADAPTER=.claude/skills/dev-workflow-execute/tracker-adapter.md
DOR=.claude/skills/story-interview/dor-checklist.md
ESTIMATE=.claude/skills/dev-workflow/scripts/estimate-complexity.sh
RESOLVE=.claude/skills/dev-workflow/scripts/resolve-executor-level.sh
INTAKE=.claude/skills/dev-workflow-intake/SKILL.md
EXECUTE=.claude/skills/dev-workflow-execute/SKILL.md
DESIGN_BRANCH=.claude/skills/dev-workflow-execute/design-branch.md
JIRA_TICKET_SKILL=.claude/skills/jira-ticket/SKILL.md

# --- 1. Config.md huzalozas ---
grep -Fq '`COMPLEXITY_ESTIMATION`' "$CONFIG"
grep -Fq '`EXECUTOR_LADDER`' "$CONFIG"
grep -Fq '`COMPLEXITY_EXECUTOR_MAP`' "$CONFIG"
grep -Fq 'local' "$CONFIG"
grep -Fq 'OFFLOAD_PROFILE' "$CONFIG"
grep -Fq 'PLAN_ROUND_MODE' "$CONFIG"

# --- 1b. code review javitas: TICKET_INFOBOX_FIELDS sor felsorolja a komplexitast, es
#         nincs benne "5-os limit" utalas ---
grep -Fq '| `TICKET_INFOBOX_FIELDS` | `típus`, `dátum`, `story felelős`, `komplexitás` |' "$CONFIG"
if grep -Fq '5-ös limitbe' "$CONFIG"; then
  echo "verify-complexity-config: a config.md TICKET_INFOBOX_FIELDS sora meg mindig '5-ös limitbe' utalast tartalmaz" >&2
  exit 1
fi

# --- 1c. code review javitas: a 3 uj kapcsolo felvetel a WORKFLOW_PROFILE preset-tablaba ---
grep -Fq '| `COMPLEXITY_ESTIMATION` | `hybrid` | `hybrid` | `hybrid` |' "$CONFIG"
grep -Fq '| `EXECUTOR_LADDER` |' "$CONFIG"
grep -Fq '| `COMPLEXITY_EXECUTOR_MAP` |' "$CONFIG"

# --- 2. jira-ticket-template.md: nincs tobbe "max 5 mezo" korlat, van Komplexitas sor ---
if grep -Fq 'max 5 mező' "$TEMPLATE"; then
  echo "verify-complexity-config: a jira-ticket-template.md meg mindig 'max 5 mező' korlatot tartalmaz" >&2
  exit 1
fi
grep -Fq 'Komplexitás' "$TEMPLATE"

# --- 3. tracker-adapter.md: uj muvelet-par a komplexitas mezohoz ---
grep -Fq 'komplexitás mentése' "$ADAPTER"
grep -Fq 'komplexitás beolvasása' "$ADAPTER"
grep -Fq 'COCALC-266' "$ADAPTER"

# --- 4. dor-checklist.md keresztihivatkozas a komplexitas-becslesre ---
grep -Fq 'COCALC-273' "$DOR"

# --- 5. estimate-complexity.sh tenyleges viselkedese ---
test -f "$ESTIMATE"

out=$(bash "$ESTIMATE" --ac-count 2 --layers 1 --design 0)
[ "$out" = "S (2 AC, 1 réteg — gépi)" ]

out=$(bash "$ESTIMATE" --ac-count 5 --layers 1 --design 0)
[ "$out" = "M (5 AC, 1 réteg — gépi)" ]

out=$(bash "$ESTIMATE" --ac-count 6 --layers 2 --design 1)
[ "$out" = "L (6 AC, 2 réteg, design — gépi)" ]

# Kereszthivatkozas a dor-checklist.md meret-figyelmeztetesevel (8-nal tobb AC eseten a
# szint sosem lehet S).
out=$(bash "$ESTIMATE" --ac-count 9 --layers 1 --design 0)
case "$out" in
  S\ *) echo "verify-complexity-config: 9 AC mellett a becsles S-t adott, ez ellentmond a dor-checklist.md meret-figyelmeztetesenek" >&2; exit 1 ;;
esac

set +e
bash "$ESTIMATE" --ac-count nemszam --layers 1 >/dev/null 2>/dev/null
exit_code=$?
set -e
[ "$exit_code" -eq 2 ]

# --- 6. resolve-executor-level.sh tenyleges viselkedese ---
test -f "$RESOLVE"

# 6a. Letezo, ervenyes mezo -- S komplexitasnal az implementer/code-reviewer olcsobb.
[ "$(bash "$RESOLVE" --complexity S --phase implementer --issue-type Sub-task)" = "haiku" ]
[ "$(bash "$RESOLVE" --complexity S --phase code-reviewer --issue-type Sub-task)" = "haiku" ]
[ "$(bash "$RESOLVE" --complexity S --phase qa-tester --issue-type Sub-task)" = "sonnet" ]
[ "$(bash "$RESOLVE" --complexity S --phase figma-designer --issue-type Sub-task)" = "sonnet" ]

# 6b. M/L komplexitasnal minden fazis a mai (sonnet) szinten marad.
[ "$(bash "$RESOLVE" --complexity M --phase implementer --issue-type Story)" = "sonnet" ]
[ "$(bash "$RESOLVE" --complexity L --phase code-reviewer --issue-type Story)" = "sonnet" ]

# 6c. Hianyzo mezo -- fallback sonnet, figyelmeztetessel, de nem hibas kilepokoddal.
warn=$(bash "$RESOLVE" --complexity "" --phase implementer --issue-type Story 2>&1 1>/dev/null)
[ "$(bash "$RESOLVE" --complexity "" --phase implementer --issue-type Story 2>/dev/null)" = "sonnet" ]
printf '%s' "$warn" | grep -Fq 'fallback'

# 6d. Ervenytelen ertek (elgepeles) -- ugyanugy fallback sonnet + jelzes.
warn=$(bash "$RESOLVE" --complexity XL --phase implementer --issue-type Story 2>&1 1>/dev/null)
[ "$(bash "$RESOLVE" --complexity XL --phase implementer --issue-type Story 2>/dev/null)" = "sonnet" ]
printf '%s' "$warn" | grep -Fq 'fallback'

# 6e. Veto-modell: ha a terkep "local"-t adna (teszt-hook), Story/Bug eseten felleptetve
# haiku-ra; nem-veto-kototeles issue type-nal (pl. Sub-task) marad "local".
# COCALC-278 (LOCAL-2) ota alapertelmezett --offload-profile mellett ("off") a "local"
# szint strukturalisan elerhetetlen, es az "implementer" fazisnak (meg mindig) nincs
# lokal-szerzodese sem -- egyik korulmeny sem alkalmas tobbe arra, hogy a veto-agat
# izoltan tesztelje. Ezert a "repo-scanner" fazist hasznaljuk (annak MAR van
# lokal-szerzodese, COCALC-270), --offload-profile max-local mellett (a lent,
# ci/verify-offload-config.sh-ban reszletesebben tesztelt mátrix szerint ott az egyetlen
# engedett szint a "local") -- igy pontosan a veto-agat izolalja.
[ "$(RESOLVE_EXECUTOR_LEVEL_TEST_FORCE_LOCAL=1 bash "$RESOLVE" --complexity S --phase repo-scanner --issue-type Story --offload-profile max-local)" = "haiku" ]
[ "$(RESOLVE_EXECUTOR_LEVEL_TEST_FORCE_LOCAL=1 bash "$RESOLVE" --complexity S --phase repo-scanner --issue-type Bug --offload-profile max-local)" = "haiku" ]
[ "$(RESOLVE_EXECUTOR_LEVEL_TEST_FORCE_LOCAL=1 bash "$RESOLVE" --complexity S --phase repo-scanner --issue-type Sub-task --offload-profile max-local)" = "local" ]

# --- 7. dev-workflow-intake/SKILL.md: szülő ÉS minden Sub-task külön becslést kap ---
grep -Fq 'estimate-complexity.sh' "$INTAKE"
grep -Fq 'COMPLEXITY_ESTIMATION' "$INTAKE"
grep -Fq 'ne örökítsd' "$INTAKE"

# --- 8. dev-workflow-execute/SKILL.md: A5a lepes + a negy fazis mindegyike hivasidejuleg
#        kapja a feloldott EXECUTOR_LADDER szintet ---
grep -Fq '### A5a — Végrehajtó-szint meghatározása' "$EXECUTE"
grep -Fq 'resolve-executor-level.sh' "$EXECUTE"
grep -Fq 'implementer` szintet' "$EXECUTE"
grep -Fq 'qa-tester` szintet' "$EXECUTE"
grep -Fq 'code-reviewer` szintet' "$EXECUTE"

# --- 9. design-branch.md: figma-designer is hivasidejuleg kapja a feloldott szintet ---
grep -Fq 'figma-designer` végrehajtó-szintje' "$DESIGN_BRANCH"
grep -Fq 'resolve-executor-level.sh' "$DESIGN_BRANCH"

# --- 10. code review minor javitas: jira-ticket/SKILL.md nincs stale "max 5 mezo" utalas,
#          es tartalmazza a Komplexitas mezot ---
if grep -Fq 'max 5 mező' "$JIRA_TICKET_SKILL"; then
  echo "verify-complexity-config: a jira-ticket/SKILL.md meg mindig 'max 5 mező' utalast tartalmaz" >&2
  exit 1
fi
grep -Fq 'Komplexitás' "$JIRA_TICKET_SKILL"

# --- 11. code review minor javitas: intake A3 pontositja a --layers ertelmezeset ---
# Sortores-turo: a bekezdes ujratordelese (pl. COCALC-275/363) nem tori el az
# ellenorzest -- a sorvegeket (CRLF is) szokozze alakitjuk, mielott keresunk.
tr -d '\r' < "$INTAKE" | tr '\n' ' ' | tr -s ' ' \
  | grep -Fq 'a DoR Spec "Érintett réteg(ek)" mezőjéből számolt darabszám'

echo "verify-complexity-config: OK"
