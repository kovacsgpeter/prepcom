#!/usr/bin/env sh
# Kötelező fájlút-validáció a dev-workflow-intake "2.a — Kiindulási állapot felderítés"
# lépéséhez (COCALC-270, SCAN-1) — a repo-scanner subagentek nyers leleteinek fájlútjait
# ellenőrzi, mielőtt a fő szál szintetizálná őket a ticket "Kiindulási állapot"
# szekciójába. Ez a szkript maga NEM hívja meg a repo-scanner subagenteket (azt a
# dev-workflow-intake/SKILL.md "2.a" lépése orchestrálja LLM-szinten) — kizárólag a
# validációs SZABÁLYT teszi gépileg futtathatóvá és tesztelhetővé (lásd
# ci/verify-repo-scan-config.sh).
#
# Használat:
#   printf '%s\n' "backend/pom.xml" "nincs-ilyen.txt" | bash validate-scan-paths.sh <repo_root>
#
# Bemenet: stdin-en soronként egy, a <repo_root>-hoz képest RELATÍV fájlútvonal (ahogy a
# repo-scanner kimeneti szerződése is megköveteli — lásd repo-scanner.md).
# Kimenet:
#   - stdout-ra kerül minden ténylegesen létező útvonal, változatlanul, soronként.
#   - stderr-re kerül egy "WARN: dropped ..." sor minden nem létező útvonalra.
#   - ha volt legalább egy bemeneti sor, de EGY sem létezett ténylegesen, az utolsó
#     stderr-sor "ALL_FINDINGS_DROPPED" lesz, és a szkript kilépőkódja 2 — ez jelzi a
#     hívó fő szálnak, hogy a "Kiindulási állapot" mezőt a zöldmezős fallback-szövegre
#     kell állítania (lásd jira-ticket-template.md).
#   - üres bemenetnél (nincs egyetlen sor sem) a szkript simán 0-val lép ki, nincs mit
#     validálni.
set -eu

repo_root="${1:-.}"

valid_count=0
input_count=0

while IFS= read -r path || [ -n "$path" ]; do
  [ -z "$path" ] && continue
  input_count=$((input_count + 1))
  if [ -f "$repo_root/$path" ]; then
    valid_count=$((valid_count + 1))
    printf '%s\n' "$path"
  else
    printf 'WARN: dropped nem letezo utvonal: %s\n' "$path" >&2
  fi
done

if [ "$input_count" -gt 0 ] && [ "$valid_count" -eq 0 ]; then
  printf 'ALL_FINDINGS_DROPPED\n' >&2
  exit 2
fi

exit 0
