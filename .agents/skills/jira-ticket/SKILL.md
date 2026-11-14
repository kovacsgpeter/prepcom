---
name: jira-ticket
description: Jira ticket létrehozása a repóhoz a `dev-workflow/config.md`-ben konfigurált Jira projektbe, egy Definition of Ready (DoR) interjú alapján. Használd ezt a skillt, amikor a felhasználó azt mondja, hogy "kell egy ticket a jirába", "nyissunk egy jira ticketet", "írjunk egy story-t/bugot/taskot a [projekt]-be", vagy bármilyen formában jelzi, hogy egy konkrét munkadarabot fel kell venni a Jira-ba — akkor is, ha a kérés csak egy vázlatos indoklással kezdődik ("kell egy ticket azért, mert..."). A skill célja, hogy a kezdeti, gyakran hiányos ötletet strukturált interjúval Definition of Ready állapotba hozza, mielőtt bármi is bekerülne a Jira-ba.
---

# Jira ticket létrehozása a configolt Jira projektbe (DoR-interjú alapján)

## Hordozhatóság — ezt a fájlt ne kelljen szerkeszteni másik repóban

Ez a skill **semmilyen konkrét Jira project key-t nem tartalmazhat szó szerint**. Ha
átmásolod ezt a mappát (a `../dev-workflow/` mappával együtt) egy másik repóba, ott
kizárólag a `dev-workflow/config.md`-t kell kitölteni az adott repóra — ebbe a fájlba nem
kell belenyúlni. Ha bármelyik lépésnél azon kapod magad, hogy egy konkrét project key-t
(pl. `PROJ`) írnál le a válaszodban vagy egy `createJiraIssue` hívásban anélkül, hogy azt
az alábbi "Célprojekt feloldása" lépésben a config-ból olvastad volna ki, állj meg — ez azt
jelenti, hogy elszakadtál a config-forrástól.

## Miért van erre a skillre szükség

Egy Jira ticket csak akkor éri meg valakinek a fejlesztő/reviewer idejét, ha DoR-kész: egyértelmű, ellenőrizhető, nem hagy nyitott kérdéseket. A felhasználó tipikusan egy mondatos ötlettel indít ("kell egy ticket azért, mert..."). A te feladatod nem az, hogy ebből azonnal ticketet gyártasz, hanem hogy interjúval kicsikarod belőle azt, ami a ticket minőségéhez kell — pont úgy, ahogy egy tapasztalt tech lead visszakérdezne backlog refinement-en.

Ne siess a Jira-hívással. Egy rosszul specifikált ticket többe kerül (visszakérdezés, félreértés, újramunka), mint néhány jó kérdés most.

## Konfiguráció

Olvasd be előbb [`../dev-workflow/config.md`](../dev-workflow/config.md)-t (rövid, csak értékek; egy kulcs jelentése a [`../dev-workflow/config-reference.md`](../dev-workflow/config-reference.md) azonos című szakaszában — csak azt a szakaszt olvasd be, a referenciát egészben soha) és
[`../dev-workflow/jira-ticket-template.md`](../dev-workflow/jira-ticket-template.md)-t —
ez a skill **ugyanazt a közös ticket-sablont** használja, mint a `dev-workflow-intake`
skill, hogy a repóban minden ticket egységes formátumú legyen, függetlenül attól, melyik
skill hozta létre. Releváns változó innen: `WORKING_LANGUAGE` (az interjú/ticket-szöveg
nyelve, lásd "Interjú-stílus" lent).

### Célprojekt feloldása (kötelező első lépés, mielőtt bármit kérdeznél)

A célprojekt Jira kulcsát a `config.md` "Repók és projektek" szekciójának `REPO_MAP`
táblázatából told fel — **ne** találgasd, és ne írd be szó szerint egy korábbi
munkamenetből megjegyzett kulcsot:

1. Ha a `REPO_MAP` táblázatnak **egyetlen sora van**, azt a sort használd.
2. Ha **több sora van**, keresd meg azt a sort, amelynek "Repo path/URL" mezője megegyezik
   a jelenlegi munkakönyvtárral (repóval), amiben dolgozol.
3. Ha egyik fenti sem egyértelmű (üres a táblázat, vagy nem található egyező sor),
   **állj meg és kérdezz rá** a felhasználótól, melyik Jira project key-be menjen a
   ticket — ne hozz létre semmit találgatott kulccsal.

Az így feloldott Jira project key-t tartsd fejben a folyamat végéig (ebben a fájlban innentől
**"a feloldott project key"**-ként hivatkozunk rá).

Ebből a két konfig-fájlból ide relevánsak:
- `REPO_MAP` (`config.md`) — a feloldott project key forrása, lásd fent.
- `TICKET_NATURE_TAGS` (`config.md`) — az infobox "Típus" mezőjének enumja
  (`feature`/`fix`/`build`/`refactoring`/`chore`). **Ez nem a Jira issue type.**
- `TICKET_INFOBOX_FIELDS` (`config.md`) — az infobox kötelező mezői (típus, dátum, story
  felelős, + oldalnév, ha design-érintett).
- `PAGE_NAME_SEPARATOR` (`config.md`) — oldalnév-konvenció, ha a ticket UI/design-t érint.
- `JIRA_ISSUE_TYPE_MAP` (`config.md` "Jira issue type-ok" szekció) — ebből olvasd ki a
  **valódi** Jira issue type-ot (`Story`/`Bug`/`Task`/`angular`/...) a feloldott project
  key-re vonatkozóan. Ne találgasd, és ne keverd össze a `TICKET_NATURE_TAGS` értékkel — a
  kettő egymástól független mező ugyanazon a ticketen (lásd `jira-ticket-template.md` "Két
  külön típus mező" szekció).
- A ticket **leírásának formátuma** (infobox + `## Kontextus` + `## Acceptance Criteria` +
  `## Teszterv` + `## Függőségek` + `## Design`) mindig
  [`jira-ticket-template.md`](../dev-workflow/jira-ticket-template.md) szerint épül fel —
  lásd lent a "Ticket összeállítása a sablon szerint" szekciót.

Ez a skill **nem** végez FE/BE split-et vagy szülő/Sub-task bontást (az a
`dev-workflow-intake` skill dolga, ha valaki azt indítja) — egyetlen, önálló ticketet hoz
létre. Ha az interjú során kiderül, hogy az ötlet mégis több rétegre bomlik, jelezd ezt a
felhasználónak, és ajánld fel, hogy inkább a `dev-workflow-intake`/`dev-workflow-scoping`
skillt használjátok helyette.

## A folyamat

1. **Célprojekt feloldása** — lásd fent, a `config.md` `REPO_MAP`-jából.
2. **Típus azonosítása** — Story, Bug vagy Task? Ha a felhasználó nem mondja ki explicit, következtess a kontextusból, de erősítsd meg egy rövid kérdéssel, ha nem egyértelmű.
3. **DoR-interjú** — az adott típushoz tartozó checklist alapján (lásd lent), kis köteg kérdésekkel (max 2-3 egyszerre), amíg minden pont explicit meg nem van válaszolva.
4. **Ticket összeállítása a sablon szerint** — a jóváhagyott válaszokból töltsd ki a
   [`jira-ticket-template.md`](../dev-workflow/jira-ticket-template.md) infobox + törzs
   szerkezetét (lásd lent).
5. **Összegzés és megerősítés** — mutasd meg a végleges, sablon-formátumú ticket-tervezetet, és kérj rövid jóváhagyást, mielőtt ténylegesen létrehozod a Jira issue-t.
6. **Létrehozás** — az Atlassian MCP eszközökkel hozd létre a ticketet a feloldott project key alatt.

## DoR checklist típusonként

Ne kérdezz rá olyasmire, amit a felhasználó már megadott az első üzenetében — abból indulj ki, és csak a hiányzó pontokra kérdezz rá. Ha egy pont nyilvánvalóan nem releváns (pl. nincs frontend), mondd ki az feltételezést és lépj tovább, ne erőltesd a kérdést.

Minden típusnál, a lenti tartalmi pontokon felül, a sablon infobox-a miatt kérdezz rá
(vagy tegyél ésszerű feltételezést) az alábbi két, típus-független mezőre is, ha még nem
egyértelmű:
- **Jelleg** (`TICKET_NATURE_TAGS`) — `feature`/`fix`/`build`/`refactoring`/`chore`.
  Alapértelmezett javaslat: Story → `feature`, Bug → `fix`; Task esetén kérdezz rá, mert
  ott többféle is ésszerű lehet.
- **Story felelős** — ki lesz a ticket felelőse/assignee-je. Ha a felhasználó nem mond
  nevet, ajánld fel saját magát alapértelmezettként, és erősíttesd meg.

### Story
- **Cím** — rövid, felhasználói szempontú (mit akar elérni a user/rendszer, nem hogyan)
- **Kontextus / "miért"** — milyen problémát old meg, kinek fontos, miért most
- **Acceptance criteria** — konkrét, ellenőrizhető lista (min. 2-3 tétel). Ha segít, Given/When/Then formában, de sima checklist is elég, amíg tesztelhető.
- **Edge case-ek** — mi történik hibás inputtal, üres állapottal, jogosultság hiányában stb. Ha a felhasználó nem gondolt bele, kérdezz rá konkrét helyzetekkel ("mi történik, ha X?").
- **API-kontraktus** — ha backend/API érintett: endpoint, request/response váz, hibakódok
- **FE mockup-hivatkozás / oldalnév** — ha van UI: Figma-link vagy leírás a várt megjelenésről, és ha a story önálló design-oldalt is igényel, az oldalnév (`PAGE_NAME_SEPARATOR`-ral összefűzve, ha több szavas) — ez kerül a sablon "Oldalnév" infobox-mezőjébe.
- **Függőségek** — blokkolja-e más ticket, vagy blokkolva van-e mástól

### Bug
- **Cím** — mi romlott el, tömören
- **Reprodukciós lépések** — számozott lista, amivel bárki reprodukálni tudja
- **Elvárt viselkedés** — mi történne helyesen
- **Tényleges viselkedés** — mi történik ténylegesen
- **Környezet** — verzió, böngésző/eszköz, environment (prod/staging/local)
- **Súlyosság** — mennyire blokkoló (kritikus / közepes / kisebb), és van-e workaround
- **Bizonyíték** — van-e log, screenshot, error message (ha van, kérd el)

### Task
- **Cím** — mi a konkrét elvégzendő munka
- **"Done" definíció** — miről tudjuk, hogy kész (ez a task acceptance criteria-ja, ne hagyd üresen)
- **Kontextus** — miért kell, mihez kapcsolódik
- **Függőségek** — kell-e hozzá más ticket lezárása előbb

## Interjú-stílus

- Kérdezz kis köteg­ekben (1-3 kérdés/kör), ne egyszerre 10 pontot.
- Kezdd azokkal a kérdésekkel, amik a legjobban alakítják a ticket tartalmát (pl. típus, majd AC-k), a formai apróságok (pl. jelleg, story felelős) legyenek a végén.
- Ahol ésszerű, ajánlj konkrét megfogalmazást vagy opciókat, amiket a felhasználó csak jóváhagy vagy módosít — ne kényszerítsd szabad szöveg írására, ha egy javaslat gyorsabb.
- Ha a felhasználó egy DoR-pontra azt mondja "nem tudom" vagy "mindegy", ne ess neki újra — tegyél egy ésszerű feltételezést, mondd ki explicit, és lépj tovább.
- A `config.md` `WORKING_LANGUAGE` kapcsolójában rögzített nyelven folytasd az interjút és
  a ticket szövegét is, hacsak a felhasználó másképp nem kéri (ha a kapcsoló hiányzik vagy
  ismeretlen értéket tartalmaz, essen vissza `magyar`-ra, a `config.md` szerint).

## Ticket összeállítása a sablon szerint

Az interjú lezárása után a [`jira-ticket-template.md`](../dev-workflow/jira-ticket-template.md)
szerkezetét töltsd ki — **ne** szabad szöveges "Cím + Leírás" formában foglald össze:

1. **Infobox** (a leírás legelején, táblázatként, max 5 mező):

   | Mező | Érték |
   |---|---|
   | Típus | `feature` / `fix` / `build` / `refactoring` / `chore` (`TICKET_NATURE_TAGS`) |
   | Dátum | a ticket létrehozásának dátuma |
   | Story felelős | az interjúban egyeztetett assignee |
   | Oldalnév | *csak ha a ticket design/UI-érintett* — a Figma frame-mel egyező név |

2. **Törzs**, az infobox után, a sablon fejezetei szerint:
   - `## Kontextus` — a "Kontextus / miért" válaszból (Bug esetén: a reprodukciós
     lépések + elvárt/tényleges viselkedés kerül ide strukturáltan).
   - `## Acceptance Criteria` — checklist-elemek (Bug esetén az "Elvárt viselkedés" innen
     vezethető le, Task esetén a "Done" definíció).
   - `## Teszterv` — hogyan ellenőrizhető minden AC (mit fed le automata teszt, mit kell
     manuálisan/böngészőben megnézni). Bug esetén: a reprodukciós lépések megismétlése +
     szükséges-e regressziós teszt.
   - `## Függőségek` — a megadott függőségek, vagy "Nincs ismert függőség".
   - `## Design` — Figma-link, ha van; egyébként ez a szekció elhagyható.

## Összegzés jóváhagyás előtt

Mielőtt létrehoznád a ticketet, mutasd meg egyben a fenti sablon szerint kitöltött,
teljes leírást:
- Projekt: a feloldott project key
- Jira issue type (a `JIRA_ISSUE_TYPE_MAP` szerint meghatározva — lásd lent)
- Cím
- A teljes, sablon-formátumú leírás (infobox + törzs)
- Bármilyen feltételezés, amit menet közben tettél

Kérj rövid megerősítést ("mehet?"), csak akkor hozd létre ténylegesen a Jira issue-t. Ha a felhasználó módosít valamit, frissítsd és erősíttesd meg újra.

## Jira issue létrehozása (Atlassian MCP)

Az Atlassian MCP-n keresztül (a `createJiraIssue`, `getAccessibleAtlassianResources`, `getJiraProjectIssueTypesMetadata`, `getVisibleJiraProjects` eszközök) hozd létre a ticketet:

1. Ha még nincs kéznél a cloudId, hívd meg a `getAccessibleAtlassianResources`-t.
2. Határozd meg a **Jira issue type**-ot a `config.md` `JIRA_ISSUE_TYPE_MAP` táblázata
   alapján (pl. Story → `Story`, kivéve ha a story kizárólag frontend-et érint és nincs
   split — akkor `angular`; Bug → `Bug`; Task → `Task`). Ha bizonytalan vagy az elérhető
   issue type-okban/kötelező mezőkben, hívd meg a `getJiraProjectIssueTypesMetadata`-t
   (vagy `getVisibleJiraProjects`-et) a feloldott project key-re, mielőtt létrehozod az
   issue-t — ne találgass.
3. Hívd meg a `createJiraIssue`-t:
   - `projectKey`: a "Célprojekt feloldása" lépésben feloldott project key
   - `issueTypeName`: a fenti 2. pontban meghatározott, **valódi** Jira issue type (nem a `TICKET_NATURE_TAGS` érték!)
   - `summary`: a jóváhagyott cím
   - `description`: a jóváhagyott, sablon-formátumú leírás (infobox táblázat + `## Kontextus`/`## Acceptance Criteria`/`## Teszterv`/`## Függőségek`/`## Design` szekciók, jól strukturálva, ne egy tömbben)
   - `labels`: mindig tartalmazza a config `CODEX_CREATED_LABEL` értékét (lásd a közös sablon "Label" szekcióját); ez csak eredetjelölés, nem jelenti azt, hogy a Codex workflow-nak kell dolgoznia a ticketen
4. Miután létrejött, add vissza a ticket kulcsát és linkjét a felhasználónak.

### Ha az Atlassian MCP nincs hitelesítve

Ha a `createJiraIssue` vagy bármelyik Atlassian eszköz hitelesítési hibát ad (vagy egyáltalán nem elérhető), ne akadj el ezen:
1. Jelezd röviden, hogy az Atlassian kapcsolat nincs hitelesítve, és ezt a ChatGPT/Codex plugin- vagy connector-beállításokban lehet rendezni.
2. Ennek ellenére add oda a teljes, jóváhagyott, sablon-formátumú ticket-szöveget (cím + infobox + törzs) készen arra, hogy a felhasználó kézzel bemásolja a Jira-ba, vagy hogy legközelebb, hitelesítés után, egy mondattal újra kérje a létrehozást.

Ne hagyd a felhasználót ticket-tervezet nélkül csak azért, mert a live létrehozás nem sikerült.
