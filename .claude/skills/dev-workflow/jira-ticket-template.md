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
`JIRA_ISSUE_TYPE_MAP`, `CLAUDE_CREATED_LABEL`.

## Label — minden létrehozott ticketen kötelező

Minden ticket-létrehozásnál (a [`../dev-workflow-execute/tracker-adapter.md`](../dev-workflow-execute/tracker-adapter.md)
"ticket létrehozása" művelete), ami ezt a sablont követi, a `labels` mezőbe **mindig**
bele kell tenni a `config.md` `CLAUDE_CREATED_LABEL` értékét (jelenleg `claude-created`) —
akkor is, ha a ticketen egyébként más label is szerepel (pl. split esetén mindkét
gyerek-ticket, vagy a fix-ticket eszkaláció). Ez a label **csak eredetet** jelöl (ezt a
workflow hozta létre), **nem** kell megegyeznie a `CLAUDE_WORK_LABEL` (`claude`) labellel —
ez utóbbit a felhasználó rakja fel kézzel, amikor eldönti, hogy a ticket a Claude- vagy a
codex-workflow-hoz tartozik (lásd `config.md` "Jira label-rendszer" szekció). Ne hagyd ki
ezt a labelt csak azért, mert a ticket létrehozásakor még nem dől el, ki fog rajta
dolgozni.

## Két külön "típus" mező — ne keverd össze

Minden ticketnek **két, egymástól független** típus-jellegű mezője van:

1. **Jira issue type** — a Jira natív mezője, amit a "ticket létrehozása" művelet
   (`tracker-adapter.md`) `issuetype` paramétere állít be. Ezt a `config.md` `JIRA_ISSUE_TYPE_MAP` táblázata adja
   meg (pl. `Story`, `Bug`, `Sub-task`, `design-review`, `web-design`, `angular`).
2. **Infobox "Típus" mező** — ez a lenti fejléc-táblázat egyik sora, szabad szöveg a
   ticket leírásában, a `config.md` `TICKET_NATURE_TAGS` enumjából (`feature`/`fix`/
   `build`/`refactoring`/`chore`). Ez adja a branch-nevet is, de **nem** befolyásolja a
   Jira issue type-ot.

Példa, ahol a kettő eltér: egy eszkalált fix-ticket Jira issue type-ja `Bug`, de az
infobox "Típus" mezője továbbra is `fix` lehet — lásd "Fix-ticket (eszkaláció)" lent.

## Fejléc infobox

A ticket leírásának **legelején** egy táblázat/infobox, amiben a `config.md`
`TICKET_INFOBOX_FIELDS` listája szerinti mezők szerepelnek — a **`TICKET_INFOBOX_FIELDS`
lista a forrás, felső korlát nélkül** (COCALC-273 óta nincs kemény "max N mező" szabály).
Az egyetlen ökölszabály: a fejléc maradjon olvasható (ha egy ticket sok mezőt gyűjt össze,
inkább csoportosítsd őket logikusan, mint hogy elhagyj egy releváns mezőt). Alap (config
default) mezők:

| Mező | Kötelező? | Megjegyzés |
|---|---|---|
| Típus | igen | A `TICKET_NATURE_TAGS` enum egyike: `feature` / `fix` / `build` / `refactoring` / `chore`. **Ez nem a Jira issue type** — lásd fent. |
| Dátum | igen | Ticket létrehozásának dátuma. |
| Story felelős | igen | Assignee vagy a story gazdája. |
| Oldalnév | **csak design-érintett ticketnél** | Lásd `config-reference.md` "Oldalnév-konvenció" szekció — a Figma frame nevével pontosan egyezik, `PAGE_NAME_SEPARATOR`-ral összefűzve, ha több szavas. |
| UI-változás kerete | csak UI-érintett ticketnél, opcionális (COCALC-899) | `template-only` / `thin-ts` / `logic` / `free` — meddig nyúlhat az implementáció (lásd `config-reference.md` "UI_CHANGE_BUDGET értékek"). A `ux-designer` redesign-ágából született storyknál mindig ki van töltve; hiányzó mező → `UI_CHANGE_BUDGET_DEFAULT`. |
| Komplexitás | igen (COCALC-273 óta) | `<S\|M\|L> (<becslés alapja>)`, pl. `M (5 AC, 2 réteg — gépi)`. Lásd `config.md` "Komplexitás → végrehajtó-szint routing" szekció — a szülő Story ÉS minden Sub-task külön, saját becslést kap, nem öröklés. Nem az `intake`-ben született ticketeknél (web-design, design-review, eszkalált fix-ticket) elmaradhat — az `execute` ilyenkor a konzervatív fallback szerint jár el. |
| Forrás | csak ha van kapcsolódó ADR-oldal és/vagy Discovery Brief-oldal | Lásd lent "Forrás mező — ADR- és Discovery Brief-hordozó szerep". |

> ℹ️ **Bevezetve (COCALC-377, a COCALC-372 sub-task-lánc tagja), kiegészítve (COCALC-370,
> a COCALC-366 sub-taskja)**: lásd lent "Forrás mező — ADR- és Discovery Brief-hordozó
> szerep" a mező pontos tartalmáról.

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
| Komplexitás | M (5 AC, 2 réteg — gépi) |
| Forrás | ADR-0001: Client-side wordcloud rendering (Confluence link) |
```

Ha a tickethez Discovery Brief is tartozik (nem csak ADR), a "Forrás" mező több sort is
tartalmazhat:

```
| Forrás | ADR-0001: Client-side wordcloud rendering (Confluence link) |
|        | Discovery Brief: Résztvevői visszajelzések exportja (Confluence link) |
```

### Forrás mező — ADR- és Discovery Brief-hordozó szerep

> ℹ️ **Bevezetve (COCALC-377, a COCALC-372 sub-task-lánc tagja), kiegészítve (COCALC-370,
> a COCALC-366 sub-taskja)**: a `forrás` mező **kettős szerepű** — ADR-linket, Discovery
> Brief-linket, vagy mindkettőt hordozhatja, ha a tickethez ezek közül legalább az egyik
> tartozik:
>
> - **ADR-link**: ha a tickethez legalább egy Confluence ADR-oldal tartozik (a
>   `dev-workflow-intake/SKILL.md` "2.e — ADR-trigger" lépése hozza létre, lásd
>   [`adr-template.md`](adr-template.md)), a linkje(i) ide kerülnek, egy sor/link, ha
>   több ADR is tartozik a tickethez.
> - **Discovery Brief-link**: ha a ticket egy korábbi discovery-körből (lásd
>   [`../dev-workflow-discovery/SKILL.md`](../dev-workflow-discovery/SKILL.md)) született,
>   a Brief Confluence-linkje ide kerül — a Discovery Brief a ticket létrehozása **előtt**
>   készül el, ezért ezt a sort a `dev-workflow-intake` "3. Ticket összeállítása" lépése
>   tölti ki, a discovery-kimenetből átvéve (l. `dev-workflow-discovery/SKILL.md`
>   "Kimeneti szerződés").
> - Ha **mindkettő** fennáll, mindkét link szerepel, egy-egy sorban (lásd fenti példa).
> - Ha **egyik sem** áll fenn, a mező **teljesen kimarad** — nem üres helyfoglalóként
>   kerül be, a "Kötelező?" oszlop szerint.

## Törzs

Az infobox után:

```
## Kontextus
<a story-interview DoR Spec "Kontextus" mezőjéből, hat nevesített sorral: **Eredmény** /
**Kinek** / **Miért most** / **Siker mércéje** / **Kötő korlát** / **Scope-on kívül** — a
típusonkénti kötelező/elhagyható sorokat lásd `story-interview/dor-checklist.md`>

## Boundaries
<csak akkor kerül be, ha a DoR Spec "Boundaries" mezője nem üres — lásd lent "Boundaries
és Open Questions szekció — mikor kerül be">
- Mindig csináld: ...
- Kérdezz előbb: ...
- Soha ne: ...

## Kiindulási állapot
_(felderítve: <commit SHA>, <ÉÉÉÉ-HH-NN>)_

**Mi létezik már:** ...
**Érintett fájlok:** ... (vagy "Nincs meglévő implementáció ezen a területen" zöldmezős esetben)
**Követendő minta:** ...
**Mi hiányzik ténylegesen:** ...

## Acceptance Criteria
- [ ] <konkrét, ellenőrizhető kritérium 1>
- [ ] <konkrét, ellenőrizhető kritérium 2>
...

## Teszterv
<hogyan ellenőrizhető minden AC — mit fog megnézni a qa-tester subagent (automata teszt
mit fed le, mit kell manuálisan/böngészőben ellenőrizni)>

## Biztonsági megfontolások
<csak akkor, ha a tervezésidejű fenyegetés-modell (dev-workflow-intake "2.c") futott ÉS
legalább egy azonosított kockázatból NEM lett AC — az elvetett kockázatok, kategóriánként
egymondatos indoklással, hogy miért vállalható. A felvett [biztonsági] AC-ket nem
ismétli, csak hivatkozik rájuk (pl. "lásd AC7"). A tartalom kategória-szintű: konkrét
sebezhetőség-részlet vagy titok nem kerülhet bele. Ha a modell nem futott vagy nem talált
relevánsat, ez a szekció KIMARAD — nem üres helyfoglalóként kerül be.>

## Nem-funkcionális megfontolások
<csak akkor, ha a tervezésidejű NFR-modell (dev-workflow-intake NFR-modellezés lépése,
`NFR_INTAKE` kapcsoló — lásd `../story-interview/nfr-catalog.md`) futott ÉS legalább
egy azonosított szempontból NEM lett AC — a tudatosan elvetett szempontok, kategóriánként
egymondatos indoklással, hogy miért vállalható. A felvett [nfr] AC-ket nem ismétli, csak
hivatkozik rájuk (pl. "lásd AC7"). Ha a modell nem futott vagy nem talált relevánsat, ez a
szekció KIMARAD — nem üres helyfoglalóként kerül be.>

## Függőségek
<másik ticket kulcsa, ha blokkol/blokkolva van, egyébként "Nincs ismert függőség">

## Open Questions
<csak akkor kerül be, ha a DoR Spec "Open Questions" mezője nem üres — lásd lent
"Boundaries és Open Questions szekció — mikor kerül be">
- <kérdés> — tudatosan nyitva hagyva: <egymondatos indoklás>

## Design
<Figma link, ha van — az oldalnév a hivatkozási forrás, ez a link csak kényelmi>
<UX-spec, ha a story a `ux-designer` redesign-ágából született: `<UX_OUTPUT_DIR>/redesign-<téma>.md#<oldalnév>` — a képernyő tartalmának, állapotainak és szerződés-leképezésének elsődleges forrása>
```

Az **Acceptance Criteria** és a **Teszterv** szekció a `story-interview` skill kimenetéből
(DoR Spec) származik — ne generálj újat, ha már megvan onnan, csak illeszd be ide. A
**Biztonsági megfontolások** szekció a DoR Spec "Biztonsági kockázatok" mezőjéből jön
(lásd lent, "## Biztonsági megfontolások szekció — mikor kerül be"), a **Nem-funkcionális
megfontolások** szekció a DoR Spec "Nem-funkcionális követelmények" mezőjéből (lásd lent,
"## Nem-funkcionális megfontolások szekció — mikor kerül be"), a **Boundaries** és
az **Open Questions** szekció pedig a DoR Spec azonos nevű mezőiből (lásd lent
"Boundaries és Open Questions szekció — mikor kerül be").

## Biztonsági megfontolások szekció — mikor kerül be

A törzsben a Teszterv és a Függőségek közé illesztett "## Biztonsági megfontolások"
szekció a tervezésidejű fenyegetés-modell (lásd `dev-workflow-intake/SKILL.md` "2.c" és
`story-interview/threat-catalog.md`) **elvetett** kockázatait rögzíti — azokat, amelyekből
tudatosan **nem** lett AC, kategóriánként egymondatos indoklással.

- **Bekerül**, ha a fenyegetés-modell futott (`THREAT_MODEL_INTAKE` ≠ `off`, és `auto`
  esetén volt legalább egy releváns kategória) **és** legalább egy azonosított kockázat
  AC nélkül maradt.
- A szekció **kimarad** (nem üres helyfoglalóként, hanem az egésze), ha a modell nem
  futott, vagy nem talált releváns kockázatot, vagy minden azonosított kockázatból lett
  AC. Ilyenkor a DoR Spec "Biztonsági kockázatok" mezője `N/A (...)` vagy csak
  AC-hivatkozásokat tartalmaz.
- **Nem duplikál**: a felvett `[biztonsági]` prefix tokenes AC-ket nem ismétli meg, csak
  hivatkozik rájuk (pl. "lásd AC7").
- **Kategória-szintű tartalom**: konkrét sebezhetőség-részlet, kihasználási lépés, payload
  vagy titok nem kerülhet a szekcióba — csak a kategória és a vállalhatóság indoklása.
- A `dev-workflow-execute` ág, az `implementer` és a `qa-tester` ezt a szekciót külön nem
  dolgozza fel — a biztonsági követelmények a normál AC-listában, `[biztonsági]` jelöléssel
  élnek.

## Nem-funkcionális megfontolások szekció — mikor kerül be

A törzsben a Teszterv és a Függőségek közé illesztett "## Nem-funkcionális megfontolások"
szekció a tervezésidejű NFR-modell (lásd `dev-workflow-intake/SKILL.md` NFR-modellezés
lépése és `story-interview/nfr-catalog.md`) **tudatosan elvetett** szempontjait rögzíti —
azokat, amelyekből tudatosan **nem** lett AC, kategóriánként egymondatos indoklással.

- **Bekerül**, ha az NFR-modell futott (`NFR_INTAKE` ≠ `off`, és `auto` esetén volt
  legalább egy releváns kategória) **és** legalább egy azonosított szempont AC nélkül
  maradt.
- A szekció **kimarad** (nem üres helyfoglalóként, hanem az egésze), ha a modell nem
  futott, vagy nem talált releváns szempontot, vagy minden azonosított szempontból lett
  AC. Ilyenkor a DoR Spec "Nem-funkcionális követelmények" mezője `N/A (...)` vagy csak
  AC-hivatkozásokat tartalmaz.
- **Nem duplikál**: a felvett `[nfr]` prefix tokenes AC-ket nem ismétli meg, csak
  hivatkozik rájuk (pl. "lásd AC7").
- A `dev-workflow-execute` ág, az `implementer` és a `qa-tester` ezt a szekciót külön nem
  dolgozza fel — a nem-funkcionális követelmények a normál AC-listában, `[nfr]` jelöléssel
  élnek.

## Boundaries és Open Questions szekció — mikor kerül be

A törzsben a Kontextus után illesztett "## Boundaries" és a Függőségek után illesztett
"## Open Questions" szekció a `story-interview` DoR Spec azonos nevű mezőiből jön — lásd
[`../story-interview/SKILL.md`](../story-interview/SKILL.md) "Boundaries és Open
Questions".

- **"## Boundaries"**: bekerül, ha a DoR Spec "Boundaries" mezője nem üres (3 alpont:
  Mindig csináld / Kérdezz előbb / Soha ne). Üresen a szekció **teljesen kimarad** — a
  "Biztonsági megfontolások" mintája szerint, nem üres helyfoglalóként.
- **"## Open Questions"**: bekerül, ha a DoR Spec "Open Questions" mezője nem üres — azaz
  van legalább egy, tudatosan nyitva hagyott kérdés "tudatosan nyitva hagyva" jelöléssel
  és egymondatos indoklással. Üresen a szekció **teljesen kimarad**. Ez különbözik attól,
  ha a ticketnek egyáltalán nincs nyitott kérdése — az sem eredményez szekciót, mert
  nincs mit felsorolni.
- Egyik szekció sem duplikálja a ticket más részeit (AC-lista, Biztonsági megfontolások,
  Nem-funkcionális megfontolások) — önálló tartalom.

## Kiindulási állapot szekció — mikor kötelező

A fenti törzsben szereplő "## Kiindulási állapot" szekció azt rögzíti, mi derült ki a
kódbázis felderítéséből, **mielőtt** a ticket AC-jei/terve megszülettek volna — hogy a
ticketet felvevő fél (implementer, figma-designer, vagy egy ember) ne a nulláról induljon
ki, és ne párhuzamos struktúrát/mintát vezessen be a meglévő mellé.

- **Kötelező** a szekció az `intake` (`dev-workflow-intake/SKILL.md`) és a `jira-ticket`
  skill által létrehozott minden tickethez, valamint a `design-branch.md` B4 lépése által
  létrehozott web-design tickethez (ott design-system tartalommal — lásd
  `design-branch.md` B4).
- **Nem kötelező** a `design-branch.md` B5 lépése által létrehozott design-review
  tickethez, sem az eszkalált fix-tickethez (`retry-and-escalation.md`) — ezek egy már
  létező munka folytatásai/javításai, nem önálló felderítést igénylő új scope-ok.
- **Zöldmezős esetben** (a `dev-workflow-intake/SKILL.md` "Technológia / architektúra"
  pontjához hasonlóan, ha a repó/terület még üres) a szekció **nem maradhat üresen** — a
  "Mi létezik már" mezőbe explicit ez a mondat kerül: "Nincs meglévő implementáció ezen a
  területen".
- **A commit SHA a fejlécben** (`_(felderítve: <commit SHA>, <ÉÉÉÉ-HH-NN>)_`) kizárólag
  elavulás-jelző — ha a ticket felvétele és az implementáció között sok idő telt el, ez
  jelzi, hogy a felderítés esetleg már nem friss. **Nem vált ki automatikus
  újra-felderítést** — az implementer/figma-designer csak akkor néz utána újra, ha a saját
  munkája során ellentmondást talál a leírt állapot és a tényleges kód között.
- **Nem kód-szintű Tasknál** (pl. konvenció-változás, dokumentáció, workflow-meta ticket)
  a `story-interview/dor-checklist.md` "Technológia / architektúra" DoR-pontja kihagyható
  — ilyenkor a "Kiindulási állapot" szekcióban is elég egy mondat, ami kimondja ezt a
  feltételezést (pl. "N/A — nem kód-szintű változtatás, nincs implementációs minta,
  aminek megfelelni kellene"), nem kell kódfelderítést erőltetni.
- **`CODE_SCAN_INTAKE=off` esetén** (lásd `config.md` "Munkamódprofil" szekció,
  `WORKFLOW_PROFILE` preset-tábla) a "Mi létezik már" mező helyén a "Felderítés: kihagyva
  (CODE_SCAN_INTAKE=off)" szöveg szerepel — a szekció ekkor sem maradhat teljesen üresen,
  csak a tényleges kódfelderítés marad el. A másik három almező (**Érintett fájlok**,
  **Követendő minta**, **Mi hiányzik ténylegesen**) se maradjon üresen vagy hiányozzon: ezekbe
  is kerüljön egy konzisztens jelzés (`—`), hogy a szekció ne tűnjön félig kitöltetlennek.
- **`CODE_SCAN_INTAKE=auto` esetén, ha az előzetes olcsó `Glob` nulla találatot ad**
  (lásd `dev-workflow-intake/SKILL.md` "2.a" lépés) — a "Mi létezik már" mezőbe ugyanaz a
  "Nincs meglévő implementáció ezen a területen" mondat kerül, mint a fenti "Zöldmezős
  esetben" pontnál, **nem** a `CODE_SCAN_INTAKE=off` szövege (ott nincs is felderítési
  kísérlet, itt volt, csak nulla találattal zárult — a két eset szövegesen
  megkülönböztetendő).
- **`CODE_SCAN_INTAKE=always`/`auto` esetén, ha a felderítő subagentek minden leletje
  érvénytelen fájlútra hivatkozott** (lásd `dev-workflow-intake/SKILL.md` "2.a" lépés
  "Kötelező fájlút-validáció" pontja) — a "Mi létezik már" mező a "Nincs meglévő
  implementáció ezen a területen" fallback szöveget kapja, **és** egy külön mondatot arról,
  hogy ez érvénytelen leletek miatti fallback, nem tényleges zöldmezős eredmény.

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
a B4-nél létrehozott web-design tickethez is.

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
