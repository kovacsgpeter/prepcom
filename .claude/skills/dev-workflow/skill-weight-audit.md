# Skill-fájlok súlyának auditja

> Bevezetve: **COCALC-306** ("CHEAPER dw 1" — workflow-költség csökkentés, 4. AC-csoport).
> Ez a fájl egy **egyszeri állapotfelvétel** (nem hot-path olvasmány, egyetlen skill sem
> olvassa be automatikusan) arról, mely dev-workflow fájlokat tölti be a harness **mindig**
> egy tipikus `execute` A-ági körben (pickup → implementáció → kapuk → review), és melyeket
> csak **igény szerint, feltételesen**. A cél: látható legyen, hol van a legnagyobb
> token-overhead, hogy jövőbeli ticketek tudják, hova érdemes a tömörítést célozni.
>
> **Módszertan**: fájlméret (karakter/szó, `wc -cw`) és egy durva **4 karakter ≈ 1 token**
> becslés — ez **nem** tényleges API-token-szám (arra az `analyze.js` valós
> session-mérése kellene, lásd [`offload-measurements.md`](offload-measurements.md)
> "Ismert korlátok" — ugyanaz a korlát itt is érvényes: nincs éles session-adat, amiből
> pontos számot lehetne venni). A cél a **nagyságrendek** láthatóvá tétele, nem a
> pontos elszámolás.

## MINDIG betöltött fájlok egy tipikus `execute` A-ági körben

Ezeket a fájlokat a harness a **normál, elágazás nélküli** ticket-pickup útvonalon
(nincs design-ág, nincs retry, nincs batch mód) is teljes egészében beolvassa — némelyiket
**többször is**, mert minden hívott subagent saját, önálló kontextusban indul, és a saját
"Konfiguráció" lépése szerint **maga is** beolvassa a `config.md`-t.

| Fájl | Méret | Becsült token | Ki olvassa, mikor |
|---|---|---|---|
| [`config.md`](config.md) | 130 176 karakter | **~32 500** | A **fő szál** (session eleje) **és** minden hívott subagent ([`implementer.md`](../../agents/implementer.md), [`qa-tester.md`](../../agents/qa-tester.md), [`code-reviewer.md`](../../agents/code-reviewer.md)) **saját maga is**, a "Konfiguráció" lépésük szerint — egy happy-path körben ez **4x teljes beolvasás** = kb. **130 000 token** csak ebből az egy fájlból. |
| [`dev-workflow-execute/SKILL.md`](../dev-workflow-execute/SKILL.md) | 53 965 karakter | **~13 500** | A fő szál, session eleje (az `execute` belépési pont teljes állapotgépe). |
| [`dev-workflow-execute/tracker-adapter.md`](../dev-workflow-execute/tracker-adapter.md) | 21 718 karakter | **~5 400** | A fő szál, gyakorlatilag minden lépésben (ticket olvasás/komment/tranzíció) — a happy path minden Jira-műveleten átmegy. |
| [`agents/implementer.md`](../../agents/implementer.md) | 16 196 karakter | **~4 050** | Az `implementer` subagent, minden induláskor (A6 — legalább 1x, minden ticketen). |
| [`agents/qa-tester.md`](../../agents/qa-tester.md) | 14 506 karakter | **~3 600** | A `qa-tester` subagent, minden induláskor (A7 — `LOCAL_GATE_MODE=full`/`fast` esetén, ami a `balanced`/`genius` profil alapértéke). |
| [`agents/code-reviewer.md`](../../agents/code-reviewer.md) | 11 287 karakter | **~2 800** | A `code-reviewer` subagent, minden induláskor (9. lépés — minden ticketen). |

**Happy-path összesen** (egy retry/design-ág nélküli ticketen, a fenti fájlok
összeadva, a `config.md` 4x-es beolvasásával számolva): kb. **162 000 token** —
ebből a `config.md` (négyszeri beolvasással) adja a **kb. 80%-ot**. Ez messze a
legnagyobb egyedi overhead-forrás a listában, jóval megelőzve bármelyik másik fájlt.

## Csak igény szerint (feltételesen) betöltött fájlok

| Fájl | Becsült token | Mikor tölti be |
|---|---|---|
| [`dev-workflow-execute/retry-and-escalation.md`](../dev-workflow-execute/retry-and-escalation.md) | ~2 750 | Csak ha egy kapu (A7b vagy 9. lépés) blocker/major találatot ad — nem minden ticketen fut. |
| [`dev-workflow-execute/design-branch.md`](../dev-workflow-execute/design-branch.md) | ~2 740 | Csak ha a ticketnek van "Oldalnév" mezője (design-linkelt ticket) és nincs hozzá jóváhagyott design. |
| [`dev-workflow-execute/review-feedback.md`](../dev-workflow-execute/review-feedback.md) | ~1 670 | Csak a "dolgozd fel a review kommentjeimet" belépési ponton, nem a normál pickupon. |
| [`agents/figma-designer.md`](../../agents/figma-designer.md) | ~1 230 | Csak a B-ágon (design-ticket), a fő A-ági implementációs körben sosem. |
| [`dev-workflow-intake/SKILL.md`](../dev-workflow-intake/SKILL.md) | ~12 470 | Csak a ticket **létrehozásakor/scope-bontásakor** (intake fázis) — egy már létrehozott, `execute`-re felvett ticketnél nem tölti be újra. |
| [`dev-workflow-intake/repo-scanner.md`](../dev-workflow-intake/repo-scanner.md) | ~1 750 | Csak az intake "2.a — Kiindulási állapot felderítés" lépésén, `CODE_SCAN_INTAKE≠off` esetén. |
| [`dev-workflow-scoping/SKILL.md`](../dev-workflow-scoping/SKILL.md) | ~3 000 | Csak a kezdeti scope-felmérés fázisban. |
| [`dev-workflow-discovery/SKILL.md`](../dev-workflow-discovery/SKILL.md) | ~4 760 | Csak `DISCOVERY_DEPTH≠off` esetén, a scoping keretező körében. |
| [`story-interview/SKILL.md`](../story-interview/SKILL.md) + `threat-catalog.md` + `nfr-catalog.md` + `dor-checklist.md` | ~5 300 + 2 700 + 1 750 + 3 370 ≈ **13 100** | Csak a DoR-interjú (ticket-összeállítás) fázisban, nem az `execute` fázisban. |
| [`gitlab-branch-review/SKILL.md`](../gitlab-branch-review/SKILL.md) | ~2 700 | Önállóan hívható, csak explicit felhasználói kérésre ("reviewold le ezt a branch-et"), a pipeline-on kívül. |
| [`code-reviewer/SKILL.md`](../code-reviewer/SKILL.md) (standalone pointer) | ~970 | Ugyanígy önállóan hívva, a mérvadó [`agents/code-reviewer.md`](../../agents/code-reviewer.md)-ra mutat. |
| [`jira-ticket/SKILL.md`](../jira-ticket/SKILL.md) | ~4 180 | Csak explicit ticket-létrehozási kérésre. |
| [`changelog/SKILL.md`](../changelog/SKILL.md) | ~3 160 | Csak explicit changelog-generálási kérésre. |
| [`session-cost-report/SKILL.md`](../session-cost-report/SKILL.md) | ~610 | Csak explicit költség-riport kérésre — maga a riport offline, utólagos elemzés, nem az agent-loop része. |
| `qa-tester/SKILL.md` / `implementer/SKILL.md` / `figma-designer/SKILL.md` (standalone pointerek) | ~530 / ~645 / ~530 | Önálló hívásnál, a mérvadó `agents/*.md`-re mutatnak — a pipeline-beli hívásnál nem ezek töltődnek be. |

## Legalább 1 végrehajtott javaslat: `dev-workflow-execute/SKILL.md` frontmatter `description` tömörítése

A `description` mező (a `Skill`-választáshoz a harness **mindig** betölti/kiértékeli,
függetlenül attól, hogy a felhasználó végül ezt a skillt választja-e) **141 szóról
kb. 65 szóra** csökkent — az öt belépési pont felsorolás-stílusa megmaradt, csak a
redundáns, minden példamondathoz fűzött zárójeles parafrázis rövidült/esett ki (a
kanonikus, szerkeszthető parancslistára mutató záró megjegyzés is megmaradt). Lásd a
[`../dev-workflow-execute/SKILL.md`](../dev-workflow-execute/SKILL.md) frontmatterjét —
ez a változtatás egy önálló, jól azonosítható commitban van (nem keveredik a többi
AC-csoport diffjével).

## Nem itt megoldott, de az audit által feltárt következő lépés

A fenti táblázat legnagyobb egyedi tétele a `config.md` **négyszeri, teljes beolvasása**
egy happy-path körben (fő szál + 3 subagent). Ennek csökkentése (pl. subagentenként csak a
ténylegesen releváns szekciók átadása a hívási promptban, a teljes fájl beolvasása helyett)
**külön ticket hatóköre** — ez az audit csak számszerűsíti a jelenséget, nem old meg rajta
semmit, hogy a 4. AC-csoport ("táblázatos audit, legalább 1 végrehajtott javaslat") ne
csússzon át egy jóval nagyobb, a config.md szerkezetét érintő refaktorba.
