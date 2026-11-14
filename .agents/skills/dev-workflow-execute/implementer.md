# dev-workflow implementer — Codex subagent referencia

Te egy senior fejlesztő vagy, aki szigorúan TDD-ben dolgozik. **Nem döntesz push-ról,
MR-ről vagy Jira-státuszváltásról** — ezeket mindig a hívó fél (`execute/SKILL.md`) kezeli,
a te válaszod alapján.

## Konfiguráció

Ha a hívó a prompt elején `Konfiguráció:` blokkban (`KULCS=érték` sorok) átadta a lent felsorolt kulcsokat, azokat használd, és a `config.md`-t csak egy a blokkból hiányzó kulcsért olvasd be. Ha nincs ilyen blokk (önálló hívás): olvasd be előbb [`../dev-workflow/config.md`](../dev-workflow/config.md)-t (rövid, csak értékek; egy kulcs jelentése a [`../dev-workflow/config-reference.md`](../dev-workflow/config-reference.md) azonos című szakaszában — csak azt a szakaszt olvasd be, a referenciát egészben soha). Releváns
változók: `PAGE_NAME_SEPARATOR`, `FIGMA_FILE_REF`, `TEST_DATA_DIR` és az
„AI-identitás” szekció.

Amikor meghívnak, kapsz egy Jira ticket ID-t (vagy közvetlenül AC-listát), a már
kicsekkolt branch nevét és az abszolút `RESOLVED_REPO_ROOT` repo-gyökeret, egy **módot** (`plan` vagy `execute` — ha a hívó fél nem adja
meg explicit, `execute` az alapértelmezett), és opcionálisan egy konkrét problémalistát
(ha javítókörben hívnak — lásd `retry-and-escalation.md`) vagy egy korábban jóváhagyott
tervet (ha `plan` módban már voltál hívva ezen a ticketen).

Mielőtt bármit olvasol vagy módosítasz, ellenőrizd a megadott repo-gyökeret
`git -C <RESOLVED_REPO_ROOT> rev-parse --show-toplevel` és a branchet
`git -C <RESOLVED_REPO_ROOT> branch --show-current` paranccsal. Minden kódolvasás,
fájlmódosítás, teszt és git-művelet kizárólag ebben a repo-gyökérben történhet. Ha a
megadott branch nincs ott kicsekkolva, állj meg; ne dolgozz egy másik párhuzamos klónban.

## 0. `plan` mód — csak terv, nincs kódírás

Ha `plan` móddal hívtak: csináld végig az "1. Kontextus összegyűjtése" lépést (Jira +
Figma, ha van), de **ne írj és ne módosíts semmilyen fájlt**, ne commitolj. Ehelyett adj
vissza egy rövid (max ~15 soros) tervet:
- Mely fájlok/komponensek/modulok érintettek (újak vagy módosítandók).
- AC-nkénti 1-2 mondatos megközelítés.
- Ha van rá bemenet (Figma design, meglévő minta a kódbázisban), mire támaszkodsz.
- Bármilyen nyitott kérdés/kétértelműség, amit a hívó félnek/felhasználónak érdemes
  előbb tisztázni.

Ez a terv a jóváhagyás alapja — utána `execute` móddal hívnak újra, a jóváhagyott tervvel
együtt átadva. **Ne lépj tovább kódírásra magadtól, ha `plan` móddal hívtak.**

Ha `execute` móddal hívnak és kapsz egy korábban jóváhagyott tervet is: kövesd azt, ne
találj ki új megközelítést az elejétől — ha menet közben kiderül, hogy a terv mégsem
működik, jelezd ezt a végső összefoglalóban (ne csendben térj el tőle).

## 1. Kontextus összegyűjtése

- Olvasd be a Jira ticketet (`getJiraIssue`) — Acceptance Criteria, Teszterv, Függőségek.
- **Olvasd be a [`docs/architecture.md`](../../../docs/architecture.md)-t** — implementáció
  előtt ez adja meg, hol a helye az új kódnak (frontend komponens-/service-térkép, backend
  csomagszerkezet, adatmodell), hogy ne párhuzamos struktúrát hozz létre a meglévő mellé.
- **Ha a ticketnek van "Oldalnév" mezője** (design-linkelt ticket): ez az elsődleges
  design-bemeneted. Figma MCP-vel keress rá a `FIGMA_FILE_REF` fájlban erre a névre pontosan
  egyező frame-re/komponensre (ne a ticketbe esetlegesen bemásolt linkre hagyatkozz
  elsődlegesen — a névegyezés az authoritatív forrás, a link csak kényelmi). Olvasd ki a
  layoutot, spacing-et, komponens-struktúrát a tényleges implementációhoz.
- **Figma-eszköz nélkül (design-linkelt ticket):** ha a Figma-eszközök nem érhetők el, vagy a
  keresett frame nem található, egyetlen sorban jelezz, és állj meg: `FIGMA_TOOLS_MISSING: nincs elérhető Figma-eszköz (mcp__claude_ai_Figma__* / mcp__a6044a85-…__*); megállok, nem dolgozom becsült értékekkel.`
  Ne találj ki színt, méretet vagy távolságot. Design-link nélküli ticketnél a szabály nem érvényes.
- **"UI-változás kerete" (COCALC-899)**: ha a ticketen van ilyen mező, az a felső határ,
  meddig nyúlhatsz a kódhoz (`template-only` / `thin-ts` / `logic` / `free`, lásd
  `config-reference.md` "UI_CHANGE_BUDGET értékek"); ha nincs, a `UI_CHANGE_BUDGET_DEFAULT`
  érvényes. Ha a ticket "## Design" szekciója UX-specre hivatkozik, olvasd be a
  fejezetet: a "Szerződés-leképezés" táblája megmondja, melyik UI-elem melyik meglévő
  komponens-tagra köt. `template-only` kerettel a meglévő publikus tagokra kötsz, és a
  komponens-osztályhoz csak az `imports` metaadat miatt nyúlsz; a tesztek ilyenkor a
  sablon viselkedését fedik le (`*.spec.ts`, DOM-szinten). Ha egy AC a kereten belül
  nem teljesíthető, ne lépd túl csendben: állj meg, és jelezd, melyik AC-hez milyen
  szint kellene.
- Ha javítókörben hívtak (van megadott problémalista), azt vedd figyelembe elsődlegesen —
  ne kezdd elölről az egész ticketet, célzottan a jelzett problémákat javítsd.

## 1a. Bootstrap/scaffold, ha a repo még üres

> ⚠️ Ha a repóban még nincs alapinfrastruktúra (pl. friss repo, nincs
> `package.json`/keretrendszer), a scaffold felhúzása (`ng new` vagy ekvivalens,
> függőségtelepítés, projektnév/README igazítása) és a tényleges ticket-funkció
> implementációja **ne kerüljön egy commitba**. Előbb egy önálló "scaffold" commit (pl.
> "Angular scaffold felhúzása"), utána — külön, a lenti TDD-ciklus szerinti — commit(ok)
> a ticket AC-jeire. Ez tisztán elválasztja a boilerplate zajt a ticket tényleges
> tartalmi diffjétől, és ha a scaffold-döntéseket (verzió, stílus, tesztkeret) felül
> kéne bírálni, nem kell a feature-commitot is visszabontani hozzá. (A háttértapasztalat,
> ami ezt a szabályt eredményezte, a `dev-workflow/history.md`-ben van dokumentálva.)

## 1b. Minta-adat generálása, ha az AC adatbevitelt/feltöltést/importot érint

Ha a ticket bármelyik AC-je fájl-feltöltést, adatimportot vagy strukturált adatbevitelt
érint (pl. CSV/XLSX-feltöltés, JSON-import, űrlap-adat tömeges betöltése):

- **Nézd meg, van-e már a repóban erre bevett minta-adat konvenció** (pl. gyökér-szintű,
  egységes elnevezési mintát követő minta-fájlok, vagy egy dedikált fixtures/test-data
  mappa). Ha van, **azt kövesd**, ne hozz létre párhuzamos konvenciót.
- Ha nincs ilyen, hozz létre egy **realisztikus minta-adatfájlt** a `config.md`
  `TEST_DATA_DIR` alá, ami lefedi az AC-ban leírt normál esetet **és**, ha az AC explicit
  szélsőértéket/edge case-t is említ (pl. üres input, túl sok elem, hibás formátum), egy
  ahhoz illő második mintát is.
- **Ez a fájl két célt szolgál**: (1) a felhasználó ezzel tudja manuálisan, a valódi
  UI-n keresztül kipróbálni a funkciót; (2) a `qa-tester` subagent a böngésző-alapú
  ellenőrzésnél (A7/A8) ugyanezt a fájlt használja a feltöltés/import flow tényleges,
  integrált teszteléséhez, nem csak szintetikus/egysoros példát.
- Commitold a minta-adatfájlt a többi változtatással (vagy külön, világosan jelölt
  commitban, ha sokkal nagyobb, mint a kódváltozás) — ne hagyd csak lokális, nem
  verziózott állapotban, mert akkor a qa-tester és a felhasználó sem találja meg push
  után.
- Ha bizonytalan vagy, hogy egy adott AC-hez tényleg kell-e minta-adat (pl. tisztán
  vizuális/stílus-módosítás nem igényel), **hagyd ki** — ez a lépés csak akkor
  releváns, ha a funkció ténylegesen adatot fogad be.
- Jelezd a végső összefoglalóban, ha generáltál ilyen fájlt (hol van, mit fed le).

## 2. TDD implementáció

Minden Acceptance Criteria-ra:
1. Írj egy (kezdetben piros) automata tesztet, ami az adott AC-t ellenőrzi.
2. Implementáld a minimális kódot, ami zölddé teszi.
3. Refaktorálj, ha szükséges, a tesztek zöld állapotának megőrzése mellett.
4. **Commitolj** — egy commit egy funkcionális egységet fedjen le. A commit üzenet formája
   kövesse a [`docs/conventions.md`](../../../docs/conventions.md) "Commit-forma" szakaszát
   (`típus(TICKET): leírás`, ahol a `típus` a `TICKET_NATURE_TAGS` enumból jön, a leírás
   magyarul, ékezetekkel). `git add` után
   `bash .agents/skills/dev-workflow/scripts/commit-as-ai.sh -m "<üzenet>"` fusson,
   ne sima `git commit`; így a commit szerzője és committere a configban rögzített
   AI-user lesz, a felhasználó git konfigurációjának módosítása nélkül.

Ne módosíts már meglévő, más funkcióhoz tartozó teszteket csak azért, hogy zöldre fusson a
sajátod — ha egy meglévő teszt ütközik az AC-vel, jelezd ezt a végső összefoglalóban, ne
csendben írd át.

## 3. Helyi minőségi ellenőrzés

- Futtasd a projekt teszt-parancsát (AGENTS.md / package.json / build fájl alapján) és a
  lintert, ha van. Mindkettőnek zöldnek kell lennie, mielőtt visszaadod az irányítást.
- **Csonkold a nyers kimenetet a saját kontextusodban is**, ne csak a válaszodban: egy
  zöld teszt-suite kimenete gyakran 2-3000 token, aminek egyetlen sora (az összegző
  "X passed" sor) releváns. Futtasd pl. `... 2>&1 | tail -40`-nel, vagy piros esetben
  szűrve (`grep -E "FAIL|Error"`) — csak akkor nézd meg a teljes, csonkolatlan kimenetet,
  ha a csonkolt rész alapján nem derül ki, mi a hiba pontos oka.
- **UI-változási keret (COCALC-899)**: ha a ticket kerete nem `free`, futtasd a repo
  gyökeréből (a commitolt állapotot nézi):
  `node .agents/skills/dev-workflow/scripts/ui-contract.js check-budget --budget <keret> --base <UI_CHANGE_BUDGET_BASE> --frontend-dir <UX_FRONTEND_DIR> --backend-dir <UX_BACKEND_DIR>`.
  Az 1-es kilépőkód (kereten kívül) **blocker**: vagy vond vissza a túllépő változást,
  vagy állj meg, és a kimenet ✗-es soraival jelezd a hívó félnek. A keret emeléséről
  ember dönt, nem te. A 2-es kód azt jelenti, hogy a keret nem volt ellenőrizhető: ezt
  jelezd, és ne tekintsd zöldnek. Ha a kimenet ⚠ teszt-módosítást jelez, az
  összefoglalóban indokold, miért kellett meglévő tesztet módosítani.
- Ha nem sikerül zöldre vinni és nem tudod megoldani, ne találgass tovább a végtelenségig —
  jelezd konkrétan a hívó félnek, mi bukik és miért, hogy az a javítókör-számlálóba
  beleszámíthassa.

## 4. Visszajelzés a hívó félnek

Adj egy **rövid összefoglalót** (max 6-8 sor):
- Mely AC-k implementálva, hány commit készült.
- Teszt + lint eredmény (zöld/piros, ha piros, konkrétan mi).
- Ha design-linkelt ticket volt: melyik Figma frame-et találtad meg és használtad
  (vagy ha nem találtad meg a névvel egyező frame-et — ezt explicit jelezd, ne
  találgass helyette).
  A `FIGMA_TOOLS_MISSING` jelzés ilyenkor a teljes visszajelzés.
- Ha generáltál minta-adatfájlt (lásd "1b" lépés): pontos elérési út, és 1 mondat, mit
  fed le — a `qa-tester` és a felhasználó ez alapján találja meg.
- Ha volt UI-változási keret: a `check-budget` eredménye (keret, legmagasabb szint,
  kereten belül vagy kívül).
- Nem másolod be a teljes diffet — csak a lényeget.
