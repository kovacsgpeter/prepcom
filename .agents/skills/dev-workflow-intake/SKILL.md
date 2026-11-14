---
name: dev-workflow-intake
description: >
  A dev-workflow rendszer story-szintű ticket-létrehozó motorja. Egyetlen, már
  körülhatárolt story/task/bug ötletet visz végig az interjún a Jira ticket(ek)ig:
  interjúztat a Definition of Ready-ig, szükség esetén frontend/backend ticketre bontja,
  és létrehozza a ticket(ek)et Jira-ban "To Do" állapotban. Ezt a skillt jellemzően a
  `dev-workflow-scoping` skill hívja meg storyonként, miután eldöntötte, hány önálló
  story-ra bomlik egy ötlet. Akkor használd közvetlenül, ha a felhasználó explicit jelzi,
  hogy az ötlet biztosan egyetlen, jól körülhatárolt story, és nincs szükség
  scope-felmérésre. Nem implementál — az implementáció a `dev-workflow-execute` skill
  dolga, amit a felhasználó külön indít. (A leírt mondat csak példa — a kanonikus,
  szerkeszthető változat a ../dev-workflow/config.md "Indító parancsok" táblázatában van.)
---

# dev-workflow — intake (a `scoping` skill által storyonként hívott motor)

Ezt a skillt kétféleképp hívhatják:
- **A `scoping` skill hívja**, miután eldöntötte, hogy az ötlet hány story-ra bomlik, és
  ehhez a híváshoz már megkapod, melyik konkrét story-ról van szó (cím + rövid cél).
- **Közvetlenül a felhasználó**, ha kifejezetten jelzi, hogy egyetlen, egyértelmű
  story-ról van szó, és nem akar előtte scope-felmérést ("szeretnék fejleszteni valamit a
  `<repo/jira projekt>`-ben" — ha ez az első mondat és nincs korábbi scoping-kontextus,
  alapból induljon el a `dev-workflow-scoping` skill helyette, kivéve, ha a felhasználó
  explicit "ez egy story, ugorjunk az interjúra" jellegű kéréssel kezd).

> 💡 **Modell-kérdés (csak ha közvetlenül hívtak, nem `scoping`-on keresztül)**: az
> interjú-fázisban számít legtöbbet a modellminőség (AC-pontosság, edge case-ek) — ha a
> session jelenleg nem a `config.md` `PREFERRED_INTERVIEW_MODEL` értékén fut, kérdezd meg
> **explicit, igen/nem formában**, session elején egyszer: *"Erre az interjú-fázisra
> átválthatunk `<PREFERRED_INTERVIEW_MODEL>`-re — mehet, vagy maradjunk a jelenlegin?"*
> Nemleges válasz esetén ne kérdezd újra. (Ha a `scoping` hívott meg, ezt már megkérdezte
> — itt ne kérdezz rá újra.)

## Konfiguráció

Olvasd be először [`../dev-workflow/config.md`](../dev-workflow/config.md)-t (rövid, csak értékek; egy kulcs jelentése a [`../dev-workflow/config-reference.md`](../dev-workflow/config-reference.md) azonos című szakaszában — csak azt a szakaszt olvasd be, a referenciát egészben soha). Ebből a skillből releváns:
`REPO_MAP`, `TICKET_NATURE_TAGS`, `TICKET_INFOBOX_FIELDS`, `PAGE_NAME_SEPARATOR`,
`JIRA_ISSUE_TYPE_MAP` (a valódi Jira issue type kiválasztásához — ez **nem ugyanaz**, mint
a `TICKET_NATURE_TAGS`, lásd `config.md` "Jira issue type-ok" szekció).

## 1. Repo/projekt feloldása

- A felhasználó által megadott `<repo/jira projekt>` változót oldd fel a `config.md`
  `REPO_MAP` táblázatából (logikai név → repo path, Jira project key).
- Ha nem egyértelmű (pl. elgépelés, vagy nincs ilyen bejegyzés), kérdezz rá, mielőtt
  tovább mész — ne találgass Jira project key-t.

## 2. Interjú a Definition of Ready-ig

- Ez a lépés **a meglévő [`story-interview`](../story-interview/SKILL.md) skill
  logikáját követi végig** — ne írj újra DoR-checklistet, hanem alkalmazd azt a skillt,
  ami a típusonkénti (Story/Bug/Task) checklistet a
  [`../story-interview/dor-checklist.md`](../story-interview/dor-checklist.md)
  fájlból veszi
  (elfogadott bemenetek: szöveg, kép, draw.io diagram, Figma-export/link, vagy ezek
  kombinációja; kis kötegekben
  kérdezz; kilépési feltétel: jóváhagyott "DoR Spec" blokk).
- **2.b — vizuális/diagram bemenet**: ha a felhasználó mockupot, screenshotot vagy
  draw.io diagramot ad, a `story-interview` skill már kezeli ezt (lásd ott az "Elfogadott
  bemenetek" szekciót) — ne kérj helyette csak szöveges leírást, ha van kép/diagram.
- Kimenet: egy jóváhagyott "DoR Spec" Markdown blokk (a `story-interview` skill kimeneti
  szerződése szerint). Ha az Acceptance Criteria lista rendes (Given/When/Then vagy
  konkrét, mérhető checklist), abból már egyértelmű, mit kell tesztelni — ez egyben a
  ticket Teszterv szekciójának alapja is lesz.

## 3. Ticket összeállítása

- A jóváhagyott DoR Spec alapján töltsd ki a [`../dev-workflow/jira-ticket-template.md`](../dev-workflow/jira-ticket-template.md)
  sablont: infobox (típus, dátum, story felelős — és `oldalnév`, ha a story design/FE-oldal
  jellegű és a DoR Spec UI-referenciájából levezethető egy oldalnév; ha nem egyértelmű,
  kérdezz rá a felhasználótól, milyen néven fusson majd a Figma-tervben, `PAGE_NAME_SEPARATOR`-ral
  összefűzve, ha több szavas).
- A DoR Spec "Acceptance Criteria" → ticket "Acceptance Criteria" szekció.
- A DoR Spec alapján fogalmazd meg a "Teszterv" szekciót (mit fed le automata teszt, mit
  kell manuálisan/böngészőben ellenőrizni).

## 3a. Frontend/backend split és granuláris subtask-bontás

> ⚠️ **2026-08-17-i pontosítás**: a korábbi verzió csak akkor bontott subtaskokra, ha a
> story mindkét réteget érintette, és akkor is csak **egy-egy** Sub-taskot hozott létre
> rétegenként. A felhasználó explicit visszajelzése alapján ez hiányos volt — a valódi
> igény, hogy **minden Story méretű ticket alapból tovább bomoljon** kisebb,
> implementálható méretű Sub-task ticketekre, rétegenként akár többre is, ne csak egyre.

- Minden Story-típusú DoR Spec esetén (Bug/Task esetén lásd a lenti kivételt):
  1. Készül egy **szülő ticket** (Jira issue type `Story`) az eredeti, teljes körű
     Kontextussal, AC-vel és teszttervvel.
  2. A story implementációs munkáját bontsd le **konkrét, kis méretű részfeladatokra**
     (ökölszabály: egy részfeladat kb. egy komponens/endpoint/modul méretű, nem egy egész
     réteg) — annyi Sub-task ticket keletkezik, ahány logikailag különálló darabra esik a
     munka, rétegenként akár több is (pl. 3-4 frontend + 2-3 backend darab egy story
     alatt), nem csak egy-egy.
  3. Mindegyik részfeladathoz **`parent` mezőben a szülő ticket kulcsával** hozz létre egy
     Sub-task-szintű ticketet. Az issue type-ot a `config.md`
     `JIRA_SUBTASK_ISSUE_TYPE_MAP` mappingjéből, a részfeladat rétege alapján válaszd; ne
     tarts fenn itt külön rétegenkénti hardcode-ot. **Előbb
     ellenőrizd `getVisibleJiraProjects`-szel, milyen subtask-szintű típusok érhetők el
     ténylegesen az adott Jira project key-nél** — ez projektenként eltér (lásd
     `config.md` "Jira issue type-ok" szekció figyelmeztetését). Ha a mapping szerinti
     típus nem érhető el vagy nem subtask-szintű, használd a mapping `fallback` értékét,
     és a jelleget (pl. "Backend (Java) jellegű
     részfeladat") írd bele a ticket Kontextus szekciójának első mondatába.
  4. Minden részfeladat kapjon saját, konkrét AC-t és teszttervet (rövidebb lehet, mint a
     szülőé, de ellenőrizhető legyen).
  5. Jelöld az implementációs sorrendet/függőségeket: ha egy részfeladat egy másikra épül
     (akár ugyanazon a rétegen belül, akár réteghatáron át, pl. frontend a backend API-ra),
     a "Függőségek" szekcióban szövegesen **és** Jira-linkkel is (`createIssueLink`,
     "Blocks" típus, lásd `jira-ticket-template.md` "Granuláris Story-bontás esetén" szekcióját a link
     irányáról) — a natív parent/Sub-task kapcsolat **nem** fejezi ki ezt automatikusan.
  6. Ha a story design-t (új oldalt) is igényel, az `oldalnév` mező kerüljön fel a szülőre
     **és** minden design-relevanciájú Sub-taskra (a design-review ticket ezt majd az
     `execute`-hoz tartozó `design-branch.md` B5 lépésében hozza létre és linkeli — itt
     csak a mezőt/nevet rögzítsd előre, ha már ismert).
- Ha egy story teljes egészében túl kicsi ahhoz, hogy érdemben tovább bontható legyen
  (pl. egyetlen apró UI-módosítás), maradhat egyetlen ticket subtaskok nélkül — ez a
  kivétel, nem az alapeset.
- Ha a DoR Spec típusa Bug vagy Task (nem Story), a fenti bontási logika nem vonatkozik
  rá — egy ticket készül, Jira issue type `Bug` vagy `Task` a `JIRA_ISSUE_TYPE_MAP`
  szerint, függetlenül attól, melyik repót érinti.

## 4. Létrehozás Jira-ban

- Hozd létre a ticket(ek)et Atlassian MCP-vel (`createJiraIssue`) a feloldott Jira
  project key alatt — a `createJiraIssue` ezt mindig a `config.md` `INITIAL_STATUS_NAME`
  státuszába teszi (ez a Jira workflow saját kezdő állapota, nem külön beállítandó), a
  `config.md` `JIRA_ISSUE_TYPE_MAP` szerint
  helyesen beállított Jira issue type-pal (**ne** a `TICKET_NATURE_TAGS` infobox-értéket
  add meg issue type-ként — a kettő különböző mező, lásd `jira-ticket-template.md`). A
  natív Jira `labels` mezőbe minden létrehozott szülő- és gyerek-ticketnél kerüljön be a
  config `CODEX_CREATED_LABEL` értéke (lásd a sablon "Label" szekcióját). Ez csak
  eredetjelölés, nem helyettesíti és nem adja hozzá automatikusan a `CODEX_WORK_LABEL`-t.
- Bontás esetén **előbb a szülő ticketet** hozd létre, utána a Sub-task-szintű
  gyerekeket, a `parent` mezőben a szülő kulcsával — a Sub-task csak úgy hozható létre,
  ha a szülő már létezik.
- Mutasd meg a felhasználónak a végleges leírást **jóváhagyásra**, mielőtt létrehoznád (ha
  ezt a `story-interview` lépésben már megtette, itt elég a végleges ticket-formátumot
  (infobox + AC + teszterv) újra megerősíttetni, ne kérdezz kétszer ugyanarra).

## 5. Visszajelzés

Foglald össze röviden:
- A létrehozott ticket kulcs(ok) és linkek.
- Ha granuláris bontás történt: a szülő Story kulcsa, a gyerek ticketek kulcsai és issue
  type-jai, valamint hogy melyik melyiket
  blokkolja.
- **Ha a `scoping` skill hívott meg** (több story közül az egyikkel foglalkozol): ennyi
  elég, ne írj záró emlékeztetőt a következő parancsról — a `scoping` egy összesített
  végösszefoglalót ad az összes story után.
- **Ha közvetlenül a felhasználó hívott** (nem `scoping`-on keresztül): tedd hozzá az
  emlékeztetőt is: *"A ticket(ek) készen állnak. Ha implementálni akarod, indítsd a
  `dev-workflow-execute` skillt ezzel: 'vedd magadhoz azt a ticketet, ami soron
  következik'."* 💡 Ez egyben biztonságos új-task/session pont is — az `execute` a Jira
  ticketből olvas vissza mindent, nem kell hozzá ez a beszélgetés.

## Kilépési feltétel

Ez a skill **soha nem implementál és nem vált branch-et** — kizárólag Jira ticketet hoz
létre `INITIAL_STATUS_NAME` állapotban. Ha a felhasználó itt implementációt kérne,
jelezd, hogy azt a `dev-workflow-execute` skill kezeli, külön indítással.
