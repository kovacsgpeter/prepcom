# Közös Jira ticket sablon

Ezt a formátumot használja minden dev-workflow skill, amikor Jira ticketet hoz létre vagy
frissít: [`../dev-workflow-intake/SKILL.md`](../dev-workflow-intake/SKILL.md) (story/task
ticket, FE/BE split), [`../dev-workflow-execute/design-branch.md`](../dev-workflow-execute/design-branch.md)
(web-design/design_review ticket), a [`retry-and-escalation.md`](../dev-workflow-execute/retry-and-escalation.md)
szerinti fix-ticket eszkaláció, valamint az önálló [`../jira-ticket/SKILL.md`](../jira-ticket/SKILL.md)
(egyszerű, split nélküli ticket létrehozása a `REPO_MAP`-ból feloldott Jira projektbe).

## Konfiguráció

Olvasd be előbb [`config.md`](config.md)-t (rövid, csak értékek; egy kulcs jelentése a [`config-reference.md`](config-reference.md) azonos című szakaszában — csak azt a szakaszt olvasd be, a referenciát egészben soha). Ez a sablon a következő változókat
használja: `TICKET_NATURE_TAGS`, `TICKET_INFOBOX_FIELDS`, `PAGE_NAME_SEPARATOR`,
`JIRA_ISSUE_TYPE_MAP`, `CODEX_CREATED_LABEL`.

## Label — minden létrehozott ticketen kötelező

Minden `createJiraIssue` hívásnál, ami ezt a sablont követi, a natív Jira `labels`
mezőbe **mindig** bele kell tenni a config `CODEX_CREATED_LABEL` értékét (jelenleg
`codex-created`) — akkor is, ha a ticketen más label is szerepel, illetve split esetén a
szülőn és minden gyerek-ticketen is. Ez kizárólag eredetjelölés, nem munkatulajdon:
nem helyettesíti a `CODEX_WORK_LABEL` (`codex`) értékét. A munkalabelt csak ott add hozzá
külön, ahol a workflow ezt explicit előírja.

## Két külön "típus" mező — ne keverd össze

Minden ticketnek **két, egymástól független** típus-jellegű mezője van:

1. **Jira issue type** — a Jira natív mezője, amit a `createJiraIssue` hívás
   `issuetype` paramétere állít be. Ezt a `config.md` `JIRA_ISSUE_TYPE_MAP` táblázata adja
   meg (pl. `Story`, `Bug`, `Sub-task`, `design-review`, `web-design`, `angular`).
2. **Infobox "Típus" mező** — ez a lenti fejléc-táblázat egyik sora, szabad szöveg a
   ticket leírásában, a `config.md` `TICKET_NATURE_TAGS` enumjából (`feature`/`fix`/
   `build`/`refactoring`/`chore`). Ez adja a branch-nevet is, de **nem** befolyásolja a
   Jira issue type-ot.

Példa, ahol a kettő eltér: egy eszkalált fix-ticket Jira issue type-ja `Bug`, de az
infobox "Típus" mezője továbbra is `fix` lehet — lásd "Fix-ticket (eszkaláció)" lent.

## Fejléc infobox

A ticket leírásának **legelején** egy táblázat/infobox, amiben a `config.md`
`TICKET_INFOBOX_FIELDS` listája szerinti mezők szerepelnek — **max 5 mező összesen**.
Alap (config default) mezők:

| Mező | Kötelező? | Megjegyzés |
|---|---|---|
| Típus | igen | A `TICKET_NATURE_TAGS` enum egyike: `feature` / `fix` / `build` / `refactoring` / `chore`. **Ez nem a Jira issue type** — lásd fent. |
| Dátum | igen | Ticket létrehozásának dátuma. |
| Story felelős | igen | Assignee vagy a story gazdája. |
| Oldalnév | **csak design-érintett ticketnél** | Lásd `config-reference.md` "Oldalnév-konvenció" szekció — a Figma frame nevével pontosan egyezik, `PAGE_NAME_SEPARATOR`-ral összefűzve, ha több szavas. |
| UI-változás kerete | csak UI-érintett ticketnél, opcionális (COCALC-899) | `template-only` / `thin-ts` / `logic` / `free` — meddig nyúlhat az implementáció (lásd `config-reference.md` "UI_CHANGE_BUDGET értékek"). A `ux-designer` redesign-ágából született storyknál mindig ki van töltve; hiányzó mező → `UI_CHANGE_BUDGET_DEFAULT`. |

Ha a `config.md`-ben más mezőlista van beállítva, azt kövesd — ez a táblázat csak a
default illusztráció.

Formátum a ticket leírásban:

```
| Mező | Érték |
|---|---|
| Típus | feature |
| Dátum | 2026-08-16 |
| Story felelős | <név> |
| Oldalnév | checkout_summary |
| UI-változás kerete | template-only |
```

## Törzs

Az infobox után:

```
## Kontextus
<mit és miért — a story-interview DoR Spec "Kontextus" mezőjéből>

## Acceptance Criteria
- [ ] <konkrét, ellenőrizhető kritérium 1>
- [ ] <konkrét, ellenőrizhető kritérium 2>
...

## Teszterv
<hogyan ellenőrizhető minden AC — mit fog megnézni a qa-tester subagent (automata teszt
mit fed le, mit kell manuálisan/böngészőben ellenőrizni)>

## Függőségek
<másik ticket kulcsa, ha blokkol/blokkolva van, egyébként "Nincs ismert függőség">

## Design
<Figma link, ha van — az oldalnév a hivatkozási forrás, ez a link csak kényelmi>
<UX-spec, ha a story a `ux-designer` redesign-ágából született: `<UX_OUTPUT_DIR>/redesign-<téma>.md#<oldalnév>` — a képernyő tartalmának, állapotainak és szerződés-leképezésének elsődleges forrása>
```

Az **Acceptance Criteria** és a **Teszterv** szekció a `story-interview` skill kimenetéből
(DoR Spec) származik — ne generálj újat, ha már megvan onnan, csak illeszd be ide.

## Granuláris Story-bontás esetén

Ha egy Story granuláris részfeladatokra bomlik (`intake/SKILL.md` 3a lépés), a bontás
**Jira natív parent/Sub-task hierarchiával** valósul meg. Többrétegű story esetén ez
feltételezi, hogy a rétegek ugyanahhoz a Jira projekthez tartoznak — lásd `config.md`
"Jira issue type-ok" figyelmeztetését, ha ez változna:

1. Hozz létre egy **szülő ticketet** (Jira issue type `Story`, a `JIRA_ISSUE_TYPE_MAP`
   szerint) az eredeti, teljes körű Kontextussal — ez fogja össze a story célját, de a
   részletes AC/Teszterv már a gyerekekben van.
2. Hozd létre a granuláris, Sub-task-szintű gyerek ticketeket a `parent` mezőben a szülő
   kulcsával. Az issue type minden gyereknél a `config.md`
   `JIRA_SUBTASK_ISSUE_TYPE_MAP` mappingjéből jön: frontend → `angular`, backend →
   `java`, egyéb/nem támogatott réteg vagy nem elérhető subtask-típus → `Sub-task`.
   Mindegyik gyerek csak a saját részfeladatát érintő AC-ket és teszttervet tartalmazza.
3. A Sub-taskok "Függőségek" szekciójában jelöld, ha az egyik a másiktól függ (pl. FE a
   BE API-ra épül) — ezt a natív parent/Sub-task kapcsolat **nem** fejezi ki automatikusan,
   ezért emellé is kell egy explicit "blocks"/"is blocked by" Jira-link a két Sub-task
   között, amelyik logikailag előbb kell.
4. Ha a story design-t (oldalnevet) is igényel, az Oldalnév mező mindkét Sub-taskra és a
   szülő ticketre is kerüljön fel.

## Fix-ticket (eszkaláció)

Amikor a [retry-and-escalation.md](../dev-workflow-execute/retry-and-escalation.md) fix-ticketet hoz
létre: a **Jira issue type** `Bug` (a `JIRA_ISSUE_TYPE_MAP` szerint), az infobox **Típus**
mező marad `fix` (`TICKET_NATURE_TAGS`-ból — ez a két mező egymástól független, lásd fent),
a Story felelős mező `MANUAL_DEV_ASSIGNEE`, és a Kontextus szekció helyett a nem-zöld
pontok strukturált összefoglalója kerül bele (lásd ott a pontos formátumot).

## Design_review ticket

Amikor a `design-branch.md` B5 lépése hozza létre: a **Jira issue type** `design-review` (a
`JIRA_ISSUE_TYPE_MAP` szerint), a Story felelős mező `MANUAL_REVIEWER_ASSIGNEE`, és
**kötelező** az Oldalnév mező. Linkeld az eredeti implementációs tickethez, és — ha volt —
a B4-nél létrehozott web-design tickethez is. A `createJiraIssue` hívás natív `labels`
mezőjébe az általánosan kötelező `CODEX_CREATED_LABEL` mellett a `CODEX_WORK_LABEL`
értéke (jelenleg `codex`) is kerüljön be, hogy a B6 design-review keresése egy későbbi
sessionben is megtalálja.

## Web-design ticket

Amikor a `design-branch.md` B4 lépése elindítja a `figma-designer` subagentet: hozz létre
egy könnyűsúlyú Jira ticketet, **Jira issue type** `web-design` (a `JIRA_ISSUE_TYPE_MAP`
szerint), a Story felelős mező az implementációs ticket felelőse. Nem igényel teljes
AC-listát/teszttervet (azt a rá épülő design-review ticket és a végleges implementációs
ticket AC-jei fedik le) — a cím és a Kontextus elég, hogy melyik oldaltervről van szó
(kötelező Oldalnév mező), és a Függőségek szekcióban linkelve legyen az implementációs
tickethez. Státusza a `figma-designer` munkája alatt "In Progress", utána a `config.md`
`DESIGN_TICKET_CLOSE_STATUS` értéke (**nem** "Done" — az a valódi implementációs
ticketeknek van fenntartva, lásd `config.md` "Ticket-életciklus higiénia" szekció).
