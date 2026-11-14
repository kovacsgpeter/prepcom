#!/usr/bin/env sh
# COCALC-222: önellenőrző szkript — biztosítja, hogy a .claude/skills és .agents/skills
# alatti fájlok hordozhatók maradjanak: (1) ne szivárogjon beléjük repo/projekt-specifikus
# KONFIG-ÉRTÉK (a konkrét Jira project key önmagában, vagy a repó neve), (2) ne maradjon
# bennük az elavult 'jira-cocalc-ticket' skillnév (a jira-ticket átnevezés visszaszivárgása).
#
# Mit NEM tekint hibának: a `COCALC-` előtaggal kötőjelezett hivatkozást (pl. a
# `(COCALC-273, MEAS-2)` "bevezetve/bővítve" proveniencia-jegyzetet vagy a
# `COCALC-nnn` sablon-helyőrzőt). Ezek nem konfig-értékek — a hordozandó konfig-érték
# maga a csupasz `COCALC` project key token. Ezért lelet: a `COCALC` szó, ha NEM
# `COCALC-...` alak része (tehát utána nem kötőjel áll), plusz a `wordcloud` repónév.
set -eu

# Legitim kivételek — ezekben a fájlokban SZÁNDÉKOSAN szerepelhet a konkrét repóra
# (wordcloud) és Jira projektre (COCALC) konkretizált érték, mert ezek a "kanonikus,
# repóra konkretizált konfiguráció/napló" fájlok, nem hordozandó skill-logika — lásd
# a config.md fejlécét ("Ez egy repo-szintű, konkretizált példány").
# A dev-workflow/offload-measurements.md a history.md-vel azonos jellegű: repo-specifikus
# mérési napló/módszertan (COCALC-280), nem hordozandó skill-logika. A golden-sets/README.md
# és a golden-sets/fixtures/* determinisztikus önteszt-adat, ami a repo-gyökér valós
# fájljaira és a bevezető ticketre hivatkozik — szintén nem hordozandó skill-logika.
# A dev-workflow/config.template.md (COCALC-232) a config.md placeholder változata: a
# konkrét repo/Jira értékek ki vannak belőle véve (<...> helyőrzők), de a kapcsolókat
# bevezető `(COCALC-nnn)` ticket-hivatkozások szándékosan bennmaradnak — ezért kivétel.
# A dev-workflow/adr-template.md (COCALC-375) és a dev-workflow/jira-ticket-template.md
# (COCALC-377/COCALC-370) egy kitöltött minta-ADR-t mutat be — szándékosan nem placeholder
# szöveg, hanem egy hihető, a wordcloud repóra szabott példa, hogy a sablon kitöltési
# módja egyértelmű legyen. A dev-workflow-discovery/discovery-fixture.md (COCALC-371)
# ugyanígy egy minta discovery-interjú fixture-szövege. Egyik sem hordozandó skill-logika.
EXCEPTION_SUFFIXES="dev-workflow/config.md dev-workflow/config.template.md dev-workflow/history.md dev-workflow/offload-measurements.md dev-workflow/golden-sets/README.md dev-workflow/adr-template.md dev-workflow/jira-ticket-template.md dev-workflow-discovery/discovery-fixture.md"

fail=0

echo "== 1. COCALC/wordcloud hordozhatósági ellenőrzés (.claude/skills, .agents/skills) =="
# A minta szándékosan NEM egyezik a `COCALC-...` alakra (lásd a fejléc-kommentet):
# `COCALC` csak akkor lelet, ha utána nem kötőjel áll (tehát csupasz project key token).
# A `wordcloud` repónév mindig lelet.
for root in .claude/skills .agents/skills; do
    [ -d "$root" ] || continue
    matches=$(grep -rniE 'wordcloud|COCALC([^-]|$)' --include='*.md' "$root" || true)
    if [ -n "$matches" ]; then
        filtered=$(printf '%s\n' "$matches" | while IFS= read -r line; do
            file=${line%%:*}
            keep=1
            for suffix in $EXCEPTION_SUFFIXES; do
                case "$file" in
                    *"$suffix") keep=0 ;;
                esac
            done
            if [ "$keep" -eq 1 ]; then
                printf '%s\n' "$line"
            fi
        done || true)
        if [ -n "$filtered" ]; then
            echo "HIBA: hordozhatatlan COCALC/wordcloud hivatkozás található $root alatt:" >&2
            printf '%s\n' "$filtered" >&2
            fail=1
        fi
    fi
done

echo "== 2. Elavult 'jira-cocalc-ticket' hivatkozás keresése =="
# A keresés szándékosan csak a .claude/skills és .agents/skills fákra szorítkozik — az
# archived/ mappa és a gyökér-szintű dev-workflow-backlog-intake-runbook.md történeti
# dokumentum, azokban a régi skillnév szándékosan megmaradhat, nincs itt ellenőrizve.
for root in .claude/skills .agents/skills; do
    [ -d "$root" ] || continue
    matches=$(grep -rn 'jira-cocalc-ticket' "$root" || true)
    if [ -n "$matches" ]; then
        echo "HIBA: elavult 'jira-cocalc-ticket' hivatkozás található $root alatt:" >&2
        printf '%s\n' "$matches" >&2
        fail=1
    fi
done

if [ "$fail" -ne 0 ]; then
    exit 1
fi

echo "OK: nincs hordozhatatlan COCALC/wordcloud hivatkozás és nincs elavult jira-cocalc-ticket hivatkozás."
