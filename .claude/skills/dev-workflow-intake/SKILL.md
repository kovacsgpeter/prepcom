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
a `TICKET_NATURE_TAGS`, lásd `config.md` "Jira issue type-ok" szekció), a "Komplexitás →
végrehajtó-szint routing" szekció `COMPLEXITY_ESTIMATION` kapcsolója (lásd lent "3. Ticket
összeállítása" — ez adja a `Komplexitás` infobox mező kitöltési módját), a
"Munkamódprofil (WORKFLOW_PROFILE)" szekció `INTERVIEW_EXPLANATION_STYLE` kapcsolója — ezt
a 2. lépésben, a `story-interview` meghívásakor kell átadnod, mert az a skill maga
eszköz-/projekt-független, nincs saját config.md-je —, és a `WORKFLOW_PROFILE` preset-tábla
`CODE_SCAN_INTAKE` (`off`/`auto`/`always`), `CODE_SCAN_STRATEGY` (`hybrid`/`dynamic`/
`layered`), `CODE_SCAN_MAX_AGENTS` és `CODE_SCAN_MODEL` kapcsolói (explicit felülírás, ha
van, elsőbbséget élvez a preset-tábla szerinti értékkel szemben — lásd `config.md`
"Explicit egyedi felülbírálás" szekció) — ezek mind a 2.a lépésben kellenek, ami a
[`repo-scanner.md`](repo-scanner.md) felderítő subagentet indítja (lásd `.claude/agents/repo-scanner.md`
a tényleges subagent-regisztrációért). Végül a `WORKFLOW_PROFILE` preset-tábla
`THREAT_MODEL_INTAKE` (`off`/`auto`/`always`), `THREAT_MODEL_STRATEGY` (`checklist`/
`hybrid`/`llm`) és `THREAT_MODEL_AUTONOMY` (`ask`/`notify`/`auto`) kapcsolói — ezeket a
2.c lépésben (tervezésidejű fenyegetés-modellezés) használod, és a feloldott értéküket a
2. lépésben, a `story-interview` meghívásakor `threat_model` paraméterként adod át (a
`config.md` "### THREAT_MODEL_* értékek" szekciók a jelentésüket és a fallback-szabályt is
tartalmazzák). Hasonlóképp a `WORKFLOW_PROFILE` preset-tábla `NFR_INTAKE` (`off`/`auto`/
`always`), `NFR_STRATEGY` (`checklist`/`hybrid`/`llm`) és `NFR_AUTONOMY` (`ask`/`notify`/
`auto`) kapcsolói — ezeket a 2.d lépésben (tervezésidejű nem-funkcionális modellezés)
használod, és a feloldott értéküket a 2. lépésben, a `story-interview` meghívásakor `nfr`
paraméterként adod át (a `config-reference.md` "### NFR_INTAKE értékek" / "### NFR_STRATEGY
értékek" / "### NFR_AUTONOMY értékek" szekciók a jelentésüket és a fallback-szabályt is
tartalmazzák). Végül a "Confluence-írás (CONFLUENCE_* kapcsolók)" szekció
`CONFLUENCE_SPACE_KEY` / `CONFLUENCE_ADR_PARENT_ID` kapcsolóit (és a fallback-szabályukat)
a 2.e lépésben (ADR-trigger) használod, az [`../dev-workflow/adr-template.md`](../dev-workflow/adr-template.md)
sablonnal együtt — ez a lépés, a fentiekkel ellentétben, nem olvas semmilyen
`ADR_*`-szerű `WORKFLOW_PROFILE`-kapcsolót, mert nincs ilyen (lásd "2.e" lent).

## 1. Repo/projekt feloldása

> 📊 Lépés eleje: hívd meg a `mcp__ccd_session__mark_chapter` tool-t
> `dev-workflow-intake / 1 — Repo/projekt feloldása` címkével (ha a tool nem elérhető,
> hagyd ki és folytasd).

- A felhasználó által megadott `<repo/jira projekt>` változót oldd fel a `config.md`
  `REPO_MAP` táblázatából (logikai név → repo path, Jira project key).
- Ha nem egyértelmű (pl. elgépelés, vagy nincs ilyen bejegyzés), kérdezz rá, mielőtt
  tovább mész — ne találgass Jira project key-t.

## 2. Interjú a Definition of Ready-ig

> 📊 Lépés eleje: hívd meg a `mcp__ccd_session__mark_chapter` tool-t
> `dev-workflow-intake / 2 — Interjú a Definition of Ready-ig` címkével (ha a tool nem
> elérhető, hagyd ki és folytasd).

- Ez a lépés **a meglévő [`story-interview`](../story-interview/SKILL.md) skill
  logikáját követi végig** — ne írj újra DoR-checklistet, hanem alkalmazd azt a skillt,
  ami a típusonkénti (Story/Bug/Task) checklistet a
  [`../story-interview/dor-checklist.md`](../story-interview/dor-checklist.md)
  fájlból veszi
  (elfogadott bemenetek: szöveg, kép, draw.io diagram, Figma-export/link, vagy ezek
  kombinációja; kis kötegekben
  kérdezz; kilépési feltétel: jóváhagyott "DoR Spec" blokk). Add át neki a `config.md`
  `INTERVIEW_EXPLANATION_STYLE` értékét paraméterként (`verbose` vagy `terse`) — a
  `story-interview` maga nem olvas config.md-t, a hívó fél paraméterezi. Add át továbbá a
  `threat_model` paramétereket a feloldott `THREAT_MODEL_INTAKE` / `THREAT_MODEL_STRATEGY`
  / `THREAT_MODEL_AUTONOMY` értékkel (lásd "2.c" lent) — ugyanezért, a `story-interview`
  nem olvas config.md-t. Add át továbbá az `nfr` paramétereket a feloldott `NFR_INTAKE` /
  `NFR_STRATEGY` / `NFR_AUTONOMY` értékkel (lásd "2.d" lent) — ugyanezért. A "2.c", "2.d"
  és "2.e" lépés egymás után, de **egymástól függetlenül** fut: egyik sem várja meg és nem
  használja fel egy másik eredményét.
- **2.b — vizuális/diagram bemenet**: ha a felhasználó mockupot, screenshotot vagy
  draw.io diagramot ad, a `story-interview` skill már kezeli ezt (lásd ott az "Elfogadott
  bemenetek" szekciót) — ne kérj helyette csak szöveges leírást, ha van kép/diagram.
- **2.c — tervezésidejű fenyegetés-modellezés**: az AC-lista körvonalazódása után menj
  végig a [`../story-interview/threat-catalog.md`](../story-interview/threat-catalog.md)
  katalóguson a `THREAT_MODEL_*` kapcsolók szerint — a részletes orchestrálás lent, a
  "## 2.c — Fenyegetés-modellezés (katalógus-vezérelt)" szekcióban.
- **2.d — tervezésidejű nem-funkcionális modellezés**: az AC-lista körvonalazódása után, a
  "2.c"-vel azonos ponton, de **attól függetlenül** menj végig a
  [`../story-interview/nfr-catalog.md`](../story-interview/nfr-catalog.md) katalóguson az
  `NFR_*` kapcsolók szerint — a részletes orchestrálás lent, a "## 2.d — Nem-funkcionális
  követelmények (katalógus-vezérelt)" szekcióban.
- **2.e — ADR-trigger**: az AC-lista körvonalazódása után, a "2.c"/"2.d"-vel azonos
  ponton, de azoktól **függetlenül** ismerd fel, ha egy AC architektúra-jellegű döntést
  takar (adatmodell/séma, API-forma, könyvtár-/technológiaválasztás, új strukturális
  minta) — a részletes orchestrálás lent, a "## 2.e — ADR-trigger (architektúra-jellegű
  döntés azonosítása)" szekcióban. **Nem konfigurálható** — mindig lefut, és a
  létrehozás mindig explicit jóváhagyást kér.
- Kimenet: egy jóváhagyott "DoR Spec" Markdown blokk (a `story-interview` skill kimeneti
  szerződése szerint). Ha az Acceptance Criteria lista rendes (Given/When/Then vagy
  konkrét, mérhető checklist), abból már egyértelmű, mit kell tesztelni — ez egyben a
  ticket Teszterv szekciójának alapja is lesz.

## 2.a — Kiindulási állapot felderítés

Ez a lépés a 2. lépés (`story-interview` meghívása) **részeként, azt megelőzően** fut le —
a "2.a" jelölés arra utal, hogy a `story-interview` hívás előfeltétele, nem egy önálló,
azt követő lépés. Nézd meg a `config.md` `WORKFLOW_PROFILE` preset-tábla `CODE_SCAN_INTAKE`
kapcsolójának értékét (explicit felülírás, ha van, elsőbbséget élvez — a három érték
jelentését lásd `config-reference.md` "CODE_SCAN_INTAKE értékek" szekció):

- **`off` esetén**: nincs kódfelderítés, nem indul semmilyen felderítő subagent — a
  "Kiindulási állapot" mező a `story-interview` kimenetében "Felderítés: kihagyva
  (CODE_SCAN_INTAKE=off)" lesz.
- **`auto` esetén**: a felhasználó kezdeti leírásából vegyél ki kulcsszavakat (érintett
  terület/komponens/modul neve), és futtass egy **olcsó, saját (nem subagent) `Glob`-ot**
  ezekre a mappákra/fájlnév-mintákra. Ha **nulla** találat, ne indíts felderítő
  subagentet — a "Kiindulási állapot" mező "Nincs meglévő implementáció ezen a
  területen" jelzést kap, ugyanúgy, mintha subagentek futottak volna és nem találtak
  volna semmit. Ha van legalább egy találat, folytasd az `always` szerinti
  orchestrálással.
- **`always` esetén**: mindig indulnak felderítő subagentek, előzetes `Glob`-szűrés
  nélkül — az orchestrálás a `config.md` `CODE_SCAN_STRATEGY` kapcsolója szerint zajlik
  (lásd lent).

### Részletek — csak ha fut

Ezek a szakaszok — „Orchestrálás `CODE_SCAN_STRATEGY` szerint”, „Kötelező fájlút-validáció (minden ágon)”, „Lokál repo-scanner (`LOCAL_PHASES`, LOCAL-5)” — a [`code-scan.md`](code-scan.md)-ben vannak (azonos címekkel) — **ha a felderítés fut (`auto` találat vagy `always`; `off` mellett nem kell)** olvasd be és
kövesd; egyébként ne töltsd be.

## 2.c — Fenyegetés-modellezés (katalógus-vezérelt)

> 📊 Lépés eleje: hívd meg a `mcp__ccd_session__mark_chapter` tool-t
> `dev-workflow-intake / 2.c — Fenyegetés-modellezés` címkével (ha a tool nem elérhető,
> hagyd ki és folytasd).

Ez a lépés a 2. lépés (`story-interview`) **részeként**, az AC-lista körvonalazódása
**után** fut — a tervezés fázisában felszínre hozza a story leírásából már látható
biztonsági kockázatokat, és ellenőrizhető biztonsági AC-ket javasol. **Nem támad, nem
elemez kódot, nem sorol fel konkrét sebezhetőséget** — csak a
[`../story-interview/threat-catalog.md`](../story-interview/threat-catalog.md) 8
kategóriájára támaszkodik. A `story-interview` hívásnak add át a `threat_model`
paramétereket a lenti kapcsolók feloldott értékével.

**Elhatárolás** (COCALC-275 AC14): ez a lépés **nem** érinti a `code-reviewer.md`
"Biztonság" review-kategóriáját, a `gitlab-branch-review/SKILL.md`-t és a futásidejű
biztonsági szondát — azok utólagos, kód-szintű ellenőrzések, más ticketek tulajdonában.
Az `execute` ág változatlan (COCALC-275 AC15): a biztonsági AC-k a normál AC-listában
élnek, `[biztonsági]` prefix tokennel, az `implementer` és a `qa-tester` külön logika
nélkül dolgozik velük.

### Mikor fut — `THREAT_MODEL_INTAKE`

Nézd meg a `config.md` `WORKFLOW_PROFILE` preset-tábla `THREAT_MODEL_INTAKE` értékét
(explicit felülírás, ha van, elsőbbséget élvez — a három érték jelentését lásd `config.md`
"### THREAT_MODEL_INTAKE értékek"):

- **`off`**: a fenyegetés-modell nem fut — a DoR Spec "Biztonsági kockázatok" mezője
  `N/A (THREAT_MODEL_INTAKE=off)`, és a ticketre **nem** kerül "Biztonsági megfontolások"
  szekció.
- **`auto`** (alapérték): olcsó, jel-alapú előszűrő — menj végig a `threat-catalog.md`
  kategóriáinak "Mikor releváns" jelzőszó-listáin, és nézd meg, a story leírása (Kontextus
  + AC-k + edge case-ek) tartalmaz-e bármelyikre kiváltó jelet. Ha **egyetlen** kategória
  sem talál, ne futtasd a modellt — a DoR Spec mezője `N/A (nem talált relevánsat)`,
  szekció nélkül. Ha legalább egy kategória releváns, folytasd a `THREAT_MODEL_STRATEGY`
  szerinti kifejtéssel.
- **`always`**: mindig fuss a `THREAT_MODEL_STRATEGY` szerint, előszűrés nélkül. Ha a
  végén sincs egyetlen releváns kockázat sem, a DoR Spec mezője `N/A (nem talált
  relevánsat)` — szekció ekkor sem kerül a ticketre.

### Részletek — csak ha fut

Ezek a szakaszok — „Hogyan szűr — `THREAT_MODEL_STRATEGY`”, „Hogyan kérdez — `THREAT_MODEL_AUTONOMY`”, „Az elvetett kockázat nyoma (COCALC-275 AC10–11)” — a [`threat-model.md`](threat-model.md)-ben vannak (azonos címekkel) — **ha a „Mikor fut” szerint a fenyegetés-modell fut** olvasd be és
kövesd; egyébként ne töltsd be.

### Sub-task / Bug / Task viselkedés

- **Granuláris Story-bontásnál** (3a lépés): a teljes kockázatlista a **szülő Story**-n
  születik meg; minden **Sub-task** csak a rá vonatkozó `[biztonsági]` AC-ket kapja (nem
  öröklődik a teljes lista — tudatosan más, mint a COCALC-273 Sub-taskonkénti
  komplexitás-becslése).
- **Bug**: a katalógus lefut, de a kérdés szűkebb — **nyit-e a javítás új kockázatot**;
  ha igen, `[biztonsági]` jelölésű regressziós AC készül rá.
- **Task**: nem kód-szintű Tasknál (konvenció/dokumentáció/workflow-meta) jellemzően
  nincs releváns kockázat → a DoR Spec mezője `N/A (nem kód-szintű változtatás)`;
  kód-szintű Tasknál a Story-val azonos módon fut.

### Fallback

Ha bármelyik `THREAT_MODEL_*` kapcsoló értéke hiányzik vagy ismeretlen, a `config.md`
"### THREAT_MODEL_* értékek" szekciók fallback-szabálya szerint az alapértékkel folytasd
(`auto` / `hybrid` / `ask`), rövid jelzéssel — **ne akadj el** emiatt.

## 2.d — Nem-funkcionális követelmények (katalógus-vezérelt)

> 📊 Lépés eleje: hívd meg a `mcp__ccd_session__mark_chapter` tool-t
> `dev-workflow-intake / 2.d — Nem-funkcionális követelmények` címkével (ha a tool nem
> elérhető, hagyd ki és folytasd).

Ez a lépés a 2. lépés (`story-interview`) **részeként**, az AC-lista körvonalazódása
**után** fut — ugyanazon a ponton, mint a "2.c" fenyegetés-modellezés, de attól
**függetlenül**: a "2.c" és "2.d" egymás után futnak, egyik sem várja meg vagy használja
fel a másik eredményét. A tervezés fázisában felszínre hozza a story leírásából már
látható nem-funkcionális szempontokat, és ellenőrizhető, `[nfr]` prefix tokennel jelölt
Acceptance Criteria-t javasol. **Nem mér és nem futtat semmilyen futásidejű
NFR-vizsgálatot** (Lighthouse, axe, terheléses teszt) — kizárólag a
[`../story-interview/nfr-catalog.md`](../story-interview/nfr-catalog.md) 5 kategóriájára
támaszkodik. A `story-interview` hívásnak add át az `nfr` paramétereket a lenti kapcsolók
feloldott értékével.

**Elhatárolás**: ez a lépés **nem** érinti az adatvédelmi/GDPR-jellegű szempontokat
(adatmegőrzési idő, felhasználói tájékoztatás, harmadik félnek történő adattovábbítás) —
azok a "2.c" lépés `threat-catalog.md` "Érzékeny adat tárolása, naplózása és továbbítása"
kategóriájához tartoznak, nem ide (lásd `nfr-catalog.md` "Elhatárolás — mit NEM érint"
szekció, a két katalógus közötti kétirányú elhatárolás forrása). Ugyanígy nem érinti a
`code-reviewer.md` review-kategóriáit, sem a futásidejű NFR-mérőeszközöket — azok
utólagos, kód-szintű/futásidejű ellenőrzések, más ticketek tulajdonában. A
nem-funkcionális AC-k a normál AC-listában élnek, `[nfr]` prefix tokennel jelölve, az
`implementer` és a `qa-tester` külön logika nélkül dolgozik velük.

### Mikor fut — `NFR_INTAKE`

Nézd meg a `config.md` `WORKFLOW_PROFILE` preset-tábla `NFR_INTAKE` értékét (explicit
felülírás, ha van, elsőbbséget élvez — a három érték jelentését lásd `config.md`
"### NFR_INTAKE értékek"):

- **`off`**: a nem-funkcionális modell nem fut — a DoR Spec "Nem-funkcionális
  követelmények" mezője `N/A (NFR_INTAKE=off)`, és a ticketre **nem** kerül
  "Nem-funkcionális megfontolások" szekció.
- **`auto`** (alapérték): olcsó, jel-alapú előszűrő — menj végig az `nfr-catalog.md` öt
  kategóriájának "Mikor releváns" szűk jelzőszó-listáin, és nézd meg, a story leírása
  (Kontextus + AC-k + edge case-ek) tartalmaz-e bármelyikre kiváltó jelet. Ha **egyetlen**
  kategória sem talál, ne futtasd a modellt — a DoR Spec mezője `N/A (nem talált
  relevánsat)`, szekció nélkül. Ha legalább egy kategória releváns, folytasd az
  `NFR_STRATEGY` szerinti kifejtéssel.
- **`always`**: mindig fuss az `NFR_STRATEGY` szerint, előszűrés nélkül. Ha a végén sincs
  egyetlen releváns szempont sem, a DoR Spec mezője `N/A (nem talált relevánsat)` —
  szekció ekkor sem kerül a ticketre.

### Részletek — csak ha fut

Ezek a szakaszok — „Hogyan szűr — `NFR_STRATEGY`”, „Hogyan kérdez — `NFR_AUTONOMY`”, „Az elvetett szempont nyoma” — a [`nfr.md`](nfr.md)-ben vannak (azonos címekkel) — **ha a „Mikor fut” szerint az NFR-modell fut** olvasd be és
kövesd; egyébként ne töltsd be.

### Sub-task / Bug / Task viselkedés

- **Granuláris Story-bontásnál** (3a lépés): a teljes nem-funkcionális lista a **szülő
  Story**-n születik meg; minden **Sub-task** csak a rá vonatkozó `[nfr]` AC-ket kapja
  (nem öröklődik a teljes lista — ugyanaz a szabály, mint a "2.c" biztonsági AC-knél).
- **Bug**: a katalógus lefut, de a kérdés szűkebb — **nyit-e a javítás új
  nem-funkcionális hiányt**; ha igen, `[nfr]` jelölésű regressziós AC készül rá (a
  `threat-catalog.md` Bug-szabályának mintájára).
- **Task**: nem kód-szintű Tasknál (konvenció/dokumentáció/workflow-meta) jellemzően
  nincs releváns szempont → a DoR Spec mezője `N/A (nem kód-szintű változtatás)`;
  kód-szintű Tasknál a Story-val azonos módon fut.

### Fallback

Ha bármelyik `NFR_*` kapcsoló értéke hiányzik vagy ismeretlen, a `config.md` "### NFR_INTAKE
értékek" / "### NFR_STRATEGY értékek" / "### NFR_AUTONOMY értékek" szekciók
fallback-szabálya szerint az alapértékkel folytasd (`auto` / `hybrid` / `ask`), rövid
jelzéssel — **ne akadj el** emiatt.

## 2.e — ADR-trigger (architektúra-jellegű döntés azonosítása)

> 📊 Lépés eleje: hívd meg a `mcp__ccd_session__mark_chapter` tool-t
> `dev-workflow-intake / 2.e — ADR-trigger` címkével (ha a tool nem elérhető, hagyd ki és
> folytasd).

Ez a lépés a 2. lépés (`story-interview`) **részeként**, az AC-lista körvonalazódása
**után** fut — ugyanazon a ponton, mint a "2.c" és "2.d", de azoktól **függetlenül**: a
"2.c", "2.d" és "2.e" egymás után, de egymástól függetlenül futnak, egyik sem várja meg
és nem használja fel egy másik eredményét. A cél: felismerni, ha az interjú során
körvonalazódó AC-lista mögött egy **architektúra-jellegű döntés** húzódik, ami
önmagában, a kódtól/tickettől függetlenül is megtalálhatóvá tétel érdekében megérdemel
egy [ADR-oldalt](../dev-workflow/adr-template.md) — nem a döntés meghozatala (azt az
interjú AC-i már körvonalazzák), hanem a **rögzítése**.

**Elhatárolás**: ez a lépés nem implementációs döntést hoz és nem kódot ír — kizárólag a
már körvonalazódó AC-lista alapján ismeri fel, hogy egy döntés ADR-t érdemel-e, és
jóváhagyás esetén rögzíti azt. Nem érinti a `code-reviewer.md` review-kategóriáit sem —
azok utólagos, kód-szintű ellenőrzések, más ticketek tulajdonában.

> ⚠️ **Ez a lépés — a "2.c"/"2.d"-vel ellentétben — nem konfigurálható.** Nincs
> `ADR_INTAKE`/`ADR_STRATEGY`/`ADR_AUTONOMY`-szerű kapcsoló a `config.md`-ben, és nem is
> vezetünk be ilyet: a lépés **mindig** lefut, és az ADR létrehozása **mindig** explicit
> felhasználói jóváhagyást kér (lásd lent "Hogyan kérdez") — a `THREAT_MODEL_AUTONOMY=ask`
> mintájára, de annál szigorúbban: itt nincs `notify`/`auto` szint.

### Mikor fut

Minden interjú-körben lefut, az AC-lista körvonalazódása után, a "2.c"/"2.d"-vel azonos
ponton — nincs előszűrő on/off kapcsoló, mint a `THREAT_MODEL_INTAKE`/`NFR_INTAKE`-nél.
Ha a lenti "Hogyan szűr" szerint **egyetlen** AC vagy a Kontextus/Kiindulási állapot sem
utal architektúra-jellegű döntésre, a lépés **nem szól semmit** és nem kérdez semmit — ez
nem hiba, ez a várt eredmény zöldmezős vagy tisztán rutinjellegű ticketeknél (lásd AC6).

### Hogyan szűr

Menj végig a körvonalazódó AC-listán **és** a "2.a" Kiindulási állapot felderítésen, és
keress jelet a következő négy kategóriára — ez **konkrétan és kizárólagosan** ez a négy:

- **Adatmodell vagy séma-változás**: új entitás/tábla, meglévő entitás mezőinek
  struktúrális bővítése, adatbázis-migráció.
- **API-forma**: új endpoint bevezetése, meglévő endpoint kontraktusának (kérés-/
  válasz-forma) megváltoztatása.
- **Könyvtár- vagy technológiaválasztás**: új külső függőség bevezetése, vagy egy
  meglévő függőség/keretrendszer lecserélése.
- **Új strukturális minta bevezetése a kódbázisban**: eddig nem használt architekturális
  réteg, cross-cutting megoldás vagy mappaszintű szervezési minta, ami a jövőbeli
  fejlesztésre mintaként fog szolgálni.

**Kifejezetten NEM számít ide** — ezekre ne ajánlj fel ADR-t, ne is kérdezz rájuk:

- elnevezési, formázási vagy szövegezési döntés (pl. változónév, commit-üzenet stílus);
- egy már meglévő, a kódbázisban bevett minta **rutinszerű követése** (ha a story
  ugyanazt a mintát alkalmazza, amit a "2.a" felderítés máshol már talált, az nem új
  döntés, hanem a meglévő minta alkalmazása).

Ha egy AC/Kontextus-részlet több kategóriába is beleesik, egy döntési pontként kezeld
(ne generálj több, egymást átfedő ADR-jelöltet ugyanarra a döntésre).

### Részletek — csak ha fut

Ezek a szakaszok — „Hogyan kérdez”, „Az elvetett döntés nyoma” — a [`adr-trigger.md`](adr-trigger.md)-ben vannak (azonos címekkel) — **ha a „Hogyan szűr” legalább egy architektúra-jellegű jelet talált** olvasd be és
kövesd; egyébként ne töltsd be.

### Sub-task/Bug/Task viselkedés

- **Granuláris Story-bontásnál** (3a lépés): az ADR-trigger a **szülő Story** szintjén
  fut (mint a "2.c"/"2.d") — egy architektúra-jellegű döntés jellemzően a teljes story-t
  érinti, nem egy konkrét részfeladatot. A létrejövő ADR "Related tickets" mezőjébe a
  szülő Story kulcsa kerül; a Sub-taskok nem futtatják újra a triggert, legfeljebb a
  Kontextusukban hivatkoznak az ADR linkjére, ha az adott részfeladat közvetlenül érinti.
- **Bug**: architektúra-jellegű döntés ritkán merül fel egy javításnál; ha mégis (pl. a
  javítás egy addig hiányzó strukturális mintát vezet be), a lépés ugyanúgy lefut.
- **Task**: kód-szintű Tasknál a Story-val azonos módon fut; nem kód-szintű (konvenció/
  dokumentáció/workflow-meta jellegű) Tasknál jellemzően nincs ADR-jelölt döntés — ilyen
  volt maga ez a sub-task (COCALC-376) is.

### Fallback

Ha a Confluence nem elérhető (a Confluence MCP-hívás hibázik, vagy erre a gépre még
nincs felírva az allow-listbe — lásd a repo `.claude/skills/dev-workflow/scripts/
setup-mcp-allowlist.sh`-t), **vagy** a `config.md` `CONFLUENCE_SPACE_KEY`/
`CONFLUENCE_ADR_PARENT_ID` kapcsolók bármelyike hiányzik/üres (lásd `config.md`
"Confluence-írás (CONFLUENCE_* kapcsolók)" fallback-szabálya, COCALC-374): **ne akadj
el**. A már összeállított, nyolc szekciós ADR-tartalmat (a döntés jóváhagyva lett, csak
a publikálás nem sikerült) írd be egy Jira-kommentbe a tracker "komment írása"
műveletével, a komment elején **explicit** jelzéssel: "⚠️ Confluence-publikálás nem
sikerült — ez a tartalom egy ADR-nek szánt döntés, amit később, amint elérhető a
Confluence, fel kell vinni `CONFLUENCE_ADR_PARENT_ID` alá." Ez **nem** számít üres/el
nem készült ADR-nek — a döntés és a jóváhagyás megtörtént, csak a céloldal hiányzik.

## 3. Ticket összeállítása

> 📊 Lépés eleje: hívd meg a `mcp__ccd_session__mark_chapter` tool-t
> `dev-workflow-intake / 3 — Ticket összeállítása` címkével (ha a tool nem elérhető,
> hagyd ki és folytasd).

- A jóváhagyott DoR Spec alapján töltsd ki a [`../dev-workflow/jira-ticket-template.md`](../dev-workflow/jira-ticket-template.md)
  sablont: infobox (típus, dátum, story felelős — és `oldalnév`, ha a story design/FE-oldal
  jellegű és a DoR Spec UI-referenciájából levezethető egy oldalnév; ha nem egyértelmű,
  kérdezz rá a felhasználótól, milyen néven fusson majd a Figma-tervben, `PAGE_NAME_SEPARATOR`-ral
  összefűzve, ha több szavas).
- **`Komplexitás` mező (COCALC-273)** — a `config.md` `COMPLEXITY_ESTIMATION` kapcsolója
  szerint:
  - `formula`/`hybrid`: futtasd
    `bash .claude/skills/dev-workflow/scripts/estimate-complexity.sh --ac-count <funkcionális AC-tételszám> --layers <érintett rétegek száma> --design <1, ha van Oldalnév/design-ág, egyébként 0>`
    — az `--ac-count` a **funkcionális** AC-tételek száma: sem a 2.c lépésben felvett
    `[biztonsági]`, sem az NFR-modellezésből felvett `[nfr]` prefix tokenes AC-ket **ne**
    számold bele (COCALC-275 AC12 és COCALC-363, a `dor-checklist.md`
    méret-figyelmeztetésével összhangban). A `--layers` a DoR Spec
    "Érintett réteg(ek)" mezőjéből számolt darabszám (pl. csak
    frontend vagy csak backend → `1`; FE/BE split → `2`; granuláris subtask-bontásnál egy
    Sub-taskra jellemzően `1`, a szülő Story-ra a ténylegesen összesített rétegszám) — ez
    adja a gépi alapot (`<S|M|L> (<N> AC, <M> réteg[, design] — gépi)`). `formula`
    esetén ezt írd be változatlanul a mezőbe. `hybrid` esetén (ez az alapérték) ezt vedd
    kiindulásnak, de ha ítéleted szerint felül kell bírálni (pl. zöldmezős, kevés AC-jű, de
    fogalmilag nehéz téma), írd át a szintet, és a zárójelbe **kötelezően** tedd bele az
    egymondatos indoklást is (pl. `M → L (fogalmilag nehéz, kevés AC ellenére — LLM
    felülbírálás)`) — indoklás nélkül ne írd felül a gépi alapot.
  - `llm`: saját ítélet alapján válaszd meg a szintet (a formula-szkript eredménye csak
    informális támpont, nem kötelező beírni), a zárójelbe a döntésed rövid indoklása
    kerüljön.
  - Ha a script érvénytelen bemenettel (2-es kilépőkóddal) hibázna, ne akadj el — essél
    vissza `hybrid`/`llm` kézi becslésre, és jelezd ezt a zárójeles indoklásban.
- A DoR Spec "Kiindulási állapot" → ticket "Kiindulási állapot" szekció (lásd
  `jira-ticket-template.md` "Kiindulási állapot szekció — mikor kötelező") — a fejlécbe
  (`_(felderítve: <commit SHA>, <ÉÉÉÉ-HH-NN>)_`) írd bele a `git rev-parse --short HEAD`
  paranccsal lekért aktuális rövid SHA-t és a mai dátumot.
- A DoR Spec "Acceptance Criteria" → ticket "Acceptance Criteria" szekció. A 2.c lépésben
  felvett biztonsági AC-k ugyanebbe a listába kerülnek, `[biztonsági]` prefix tokennel
  jelölve.
- A DoR Spec "Biztonsági kockázatok" mező → ticket `## Biztonsági megfontolások` szekció
  (a Teszterv és a Függőségek közé — lásd `jira-ticket-template.md`). **Csak akkor kerül
  be**, ha a fenyegetés-modell futott és legalább egy elvetett kockázatot rögzített; ha
  nem futott vagy nem talált relevánsat (`N/A ...`), a szekció **kimarad** — nem üres
  helyfoglalóként. A szekció a már felvett `[biztonsági]` AC-ket nem duplikálja, csak
  hivatkozik rájuk.
- A DoR Spec alapján fogalmazd meg a "Teszterv" szekciót (mit fed le automata teszt, mit
  kell manuálisan/böngészőben ellenőrizni).
- A DoR Spec "Boundaries" és "Open Questions" mezője → ticket `## Boundaries` / `## Open
  Questions` szekció (lásd `jira-ticket-template.md` "Boundaries és Open Questions
  szekció — mikor kerül be"). Ugyanúgy, mint a "Biztonsági megfontolások" szekciónál:
  **csak akkor kerülnek be**, ha a DoR Spec megfelelő mezője nem üres — üresen a szekció
  **kimarad**, nem üres helyfoglalóként.

## 3a. Frontend/backend split és granuláris subtask-bontás

> 📊 Lépés eleje: hívd meg a `mcp__ccd_session__mark_chapter` tool-t
> `dev-workflow-intake / 3a — Frontend/backend split és granuláris subtask-bontás`
> címkével (ha a tool nem elérhető, hagyd ki és folytasd).

> ⚠️ **2026-08-17-i pontosítás**: a korábbi verzió csak akkor bontott subtaskokra, ha a
> story mindkét réteget érintette, és akkor is csak **egy-egy** Sub-taskot hozott létre
> rétegenként. A felhasználó explicit visszajelzése alapján ez hiányos volt — a valódi
> igény, hogy **minden Story méretű ticket alapból tovább bomoljon** kisebb,
> implementálható méretű Sub-task ticketekre, rétegenként akár többre is, ne csak egyre.

- Minden Story-típusú DoR Spec esetén (Bug/Task esetén lásd a lenti kivételt):
  1. Készül egy **szülő ticket** (Jira issue type `Story`) az eredeti, teljes körű
     Kontextussal, AC-vel és teszttervvel — a `Komplexitás` mezőt a szülő **saját**
     (teljes, összes AC-t számoló) AC-listája és réteg-száma alapján számítsd, a fenti "3.
     Ticket összeállítása" szabálya szerint.
  2. A story implementációs munkáját bontsd le **konkrét, kis méretű részfeladatokra**
     (ökölszabály: egy részfeladat kb. egy komponens/endpoint/modul méretű, nem egy egész
     réteg) — annyi Sub-task ticket keletkezik, ahány logikailag különálló darabra esik a
     munka, rétegenként akár több is (pl. 3-4 frontend + 2-3 backend darab egy story
     alatt), nem csak egy-egy.
  3. Mindegyik részfeladathoz **`parent` mezőben a szülő ticket kulcsával** hozz létre egy
     Sub-task-szintű ticketet ([`tracker-adapter.md`](../dev-workflow-execute/tracker-adapter.md)
     "ticket létrehozása" művelet). Az issue type-ot a `config.md`
     `JIRA_SUBTASK_ISSUE_TYPE_MAP` mappingjéből, a részfeladat rétege alapján válaszd; ne
     tarts fenn itt külön rétegenkénti hardcode-ot. **Előbb
     ellenőrizd — a "ticket létrehozása" művelet preflight-jével —, milyen subtask-szintű
     típusok érhetők el ténylegesen az adott Jira project key-nél** — ez projektenként
     eltér (lásd `config.md` "Jira issue type-ok" szekció figyelmeztetését). Ha a mapping szerinti
     típus nem érhető el vagy nem subtask-szintű, használd a mapping `fallback` értékét,
     és a jelleget (pl. "Backend (Java) jellegű
     részfeladat") írd bele a ticket Kontextus szekciójának első mondatába.
  4. Minden részfeladat kapjon saját, konkrét AC-t és teszttervet (rövidebb lehet, mint a
     szülőé, de ellenőrizhető legyen). **A `Komplexitás` mezőt is mindegyik Sub-taskra
     külön, saját AC-listája/rétege alapján számítsd** (COCALC-273 AC2) — **ne örökítsd**
     a szülő ticket becsült szintjét, mert egy Sub-task tipikusan lényegesen kisebb
     méretű, mint a teljes Story.
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

> 📊 Lépés eleje: hívd meg a `mcp__ccd_session__mark_chapter` tool-t
> `dev-workflow-intake / 4 — Létrehozás Jira-ban` címkével (ha a tool nem elérhető,
> hagyd ki és folytasd).

- Hozd létre a ticket(ek)et a [`tracker-adapter.md`](../dev-workflow-execute/tracker-adapter.md)
  "ticket létrehozása" műveletével a feloldott Jira project key alatt — ez a ticketet
  mindig a `config.md` `INITIAL_STATUS_NAME`
  státuszába teszi (ez a Jira workflow saját kezdő állapota, nem külön beállítandó), a
  `config.md` `JIRA_ISSUE_TYPE_MAP` szerint
  helyesen beállított Jira issue type-pal (**ne** a `TICKET_NATURE_TAGS` infobox-értéket
  add meg issue type-ként — a kettő különböző mező, lásd `jira-ticket-template.md`).
  A `labels` mezőbe mindig kerüljön bele a `config.md` `CLAUDE_CREATED_LABEL` értéke
  (lásd `jira-ticket-template.md` "Label" szekció) — ez csak eredetjelölés. **Ez nem a
  `CLAUDE_WORK_LABEL`**: az intake által itt létrehozott ticket ezután `To Do`-ban vár,
  és csak akkor veszi fel az A4 pickup, ha valaki (a felhasználó) rátette a `claude`
  labelt is — ha a story célja explicit, hogy ez a workflow implementálja, jelezd a
  felhasználónak a ticket létrehozása után, hogy tegye rá a `CLAUDE_WORK_LABEL`-t is.
- Bontás esetén **előbb a szülő ticketet** hozd létre, utána a Sub-task-szintű
  gyerekeket, a `parent` mezőben a szülő kulcsával — a Sub-task csak úgy hozható létre,
  ha a szülő már létezik.
- Mutasd meg a felhasználónak a végleges leírást **jóváhagyásra**, mielőtt létrehoznád (ha
  ezt a `story-interview` lépésben már megtette, itt elég a végleges ticket-formátumot
  (infobox + AC + teszterv) újra megerősíttetni, ne kérdezz kétszer ugyanarra).

## 5. Visszajelzés

> 📊 Lépés eleje: hívd meg a `mcp__ccd_session__mark_chapter` tool-t
> `dev-workflow-intake / 5 — Visszajelzés` címkével (ha a tool nem elérhető, hagyd ki és
> folytasd).

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
  következik'."* 💡 Ez egyben jó pont a `/clear`-re is — az `execute` a Jira ticketből
  olvas vissza mindent, nem kell hozzá ez a beszélgetés.

## Kilépési feltétel

Ez a skill **soha nem implementál és nem vált branch-et** — kizárólag Jira ticketet hoz
létre `INITIAL_STATUS_NAME` állapotban. Ha a felhasználó itt implementációt kérne,
jelezd, hogy azt a `dev-workflow-execute` skill kezeli, külön indítással.

## Red Flags

- A "2.a" felderítés nulla találatot ad, de a felhasználó mégis "biztos van már ilyen"
  állítással nyomja át a "Kiindulási állapot" mezőt — ellenőrizetlen feltételezés kerülne
  lelet helyett a ticketbe.
- Egy `repo-scanner` lelet fájlútja `test -f`-fel nem létezik, mégis bekerülne a
  "Kiindulási állapot" szekcióba — ez a "Kötelező fájlút-validáció" pont megkerülése.
- `THREAT_MODEL_AUTONOMY=ask` mellett a modell mégis csendben felvesz egy `[biztonsági]`
  AC-t, külön jóváhagyás kikérése nélkül.
- Granuláris subtask-bontásnál (3a) egy Sub-task örökli a szülő Story `Komplexitás`
  szintjét, ahelyett hogy saját AC-lista/réteg alapján, önállóan kapná (COCALC-273 AC2
  explicit tiltja az öröklést).
- A `Komplexitás` mező `hybrid` módban zárójeles indoklás nélkül lett felülbírálva — a
  script gépi alapja némán, nyom nélkül lett felülírva.
- A ticket létrehozása (4. lépés) előtt nincs végső jóváhagyás kikérve a felhasználótól,
  a folyamat "gondolom jó lesz" alapon megy tovább a Jira-ban való létrehozásig.
- A "2.e" lépés a felhasználó explicit jóváhagyása **nélkül** hoz létre ADR-oldalt —
  ennek a lépésnek nincs `notify`/`auto` szintje, minden döntési pont külön `ask`.
- Egy rutinszerűen ismételt, már bevett mintát követő AC (pl. "még egy CRUD endpoint a
  meglévő minta szerint") ADR-jelöltként kerül felvetésre — ez a "Hogyan szűr" NEM-lista
  megkerülése ("meglévő minta rutinszerű követése").

## Tipikus kifogások

- **"A felderítés úgyis lassú, hagyjuk ki."** — `CODE_SCAN_INTAKE=off`-fal explicit
  kikapcsolható, de ez a felhasználó tudatos döntése legyen (és a ticketen is jelölve van
  "Felderítés: kihagyva"), ne csendes, alapértelmezett kihagyás.
- **"Ez a döntés úgyis csak ebben a ticketben él, minek külön ADR-oldal."** — pont ez a
  fájdalom, amire az ADR-sablon válaszol (lásd `adr-template.md` "Miért ez a sablon
  léte"): a ticket előbb-utóbb lezárul/archiválódik, az architekturális döntés viszont a
  kódtól/tickettől függetlenül is megtalálható kell maradjon — ha a felhasználó mégis
  elutasítja, a döntés nyoma akkor is bekerül a Boundaries/Open Questions mezőbe (lásd
  "Az elvetett döntés nyoma"), nem tűnik el nyomtalanul.
- **"A biztonsági kérdés ide nem tartozik, ez csak egy belső Jira ticket."** — A katalógus
  tervezésidejű, kategória-szintű, gyors átfutású; auth nélküli repóban is ki kell mondani
  a "nincs mit védeni" döntést, nem átugrani a lépést.
- **"A Sub-taskoknak elég a szülő Story becslése, minek számolni újra."** — COCALC-273
  explicit tiltja az öröklést, mert egy Sub-task tipikusan lényegesen kisebb méretű, mint
  a teljes Story — az öröklés torzítaná a végrehajtó-szint routingot.
