---
name: dev-workflow-execute
description: >
  A dev-workflow rendszer végrehajtó állapotgépe, több belépési ponttal. Használd, ha a
  felhasználó azt mondja: "vedd magadhoz azt a ticketet, ami soron következik" (soron
  következő Jira ticket felvétele és implementálása priority/függőség alapján); "folytasd
  a 8-tól" (teszt-env ellenőrzés folytatása egy már pusholt ticketnél); "nézd meg, hogy
  lereviewztem-e a design terved" (Figma design-review kör ellenőrzése és javítása);
  "workflow-t folytasd implementációval" (jóváhagyott design ticketből implementáció
  indítása); vagy "dolgozd fel a review kommentjeimet" (egy review-státuszú ticket
  Jira-/GitLab-kommentjeinek feldolgozása, szükség esetén tisztázó kérdés a sessionben,
  majd jóváhagyott javítási terv alapján implementáció és a szokásos kapuk újrafuttatása);
  vagy "csináld meg előre az összes képernyőtervet" (design-előfutás az összes
  design-érintett ticketre).
  Mindegyik ugyanazt a Jira-állapot vezérelt folyamatot viszi tovább különböző pontokról.
  (Csak példák — a kanonikus mondatok a ../dev-workflow/config.md "Indító parancsok"
  táblázatában vannak.)
---

# dev-workflow — execute (2–6. belépési pont)

## Konfiguráció

Olvasd be **először mindig** [`../dev-workflow/config.md`](../dev-workflow/config.md)-t (rövid, csak értékek; egy kulcs jelentése a [`../dev-workflow/config-reference.md`](../dev-workflow/config-reference.md) azonos című szakaszában — csak azt a szakaszt olvasd be, a referenciát egészben soha). Ez a skill és az általa
hívott subagentek ([`implementer.md`](implementer.md), [`qa-tester.md`](qa-tester.md),
[`code-reviewer.md`](code-reviewer.md), [`figma-designer.md`](figma-designer.md),
[`retry-and-escalation.md`](retry-and-escalation.md)) a config összes változóját
használhatják — ne találgass repo path-ot, assignee nevet, branch-mintát, státusznevet
vagy URL-t, mindig onnan olvasd. Külön figyelj a `TICKET_NATURE_TAGS` (branch-névhez való
"jelleg") és a `JIRA_ISSUE_TYPE_MAP` (a ticket létrehozásakor/frissítésekor ténylegesen
beállítandó Jira issue type) megkülönböztetésére — ez a két dolog nem ugyanaz.
Az "AI-identitás" szekció adja a commit/push/review-komment szerzőségét (lásd A7a,
9. lépés és `implementer.md`). Ne sima `git commit`/`git push origin`/`glab`
kommenthívással végezd ezeket, hanem a configban felsorolt `.agents/skills/dev-workflow/scripts/`
alatti wrapper-szkriptekkel.

**Subagent-híváskor** (implementer, qa-tester, code-reviewer, architect, figma-designer,
ux-designer, local-runner, story-runner) a hívott agent „Releváns változók” / `## Konfiguráció` listájában
szereplő kulcsok feloldott értékeit add át a prompt elején egy `Konfiguráció:` blokkban, soronként
`KULCS=érték` alakban. Az agent ilyenkor nem olvassa be újra a `config.md`-t (csak egy a blokkból
hiányzó kulcsért), és a `config-reference.md`-t is csak célzottan, szakaszonként.

## Codex subagent-routing

Az implementer, QA, code-reviewer és Figma-designer lépéseket **specializált Codex
subagentnek** delegáld, majd várd meg az eredményt, mielőtt a következő kapura lépsz.
Ha a kliens támogatja a projekt-szintű custom agenteket, használd a
`.codex/agents/` alatti `dev_workflow_implementer`, `dev_workflow_qa_tester`,
`dev_workflow_code_reviewer` és `dev_workflow_figma_designer` agenteket. Ha nem tudsz
custom agent-nevet választani, a delegálási promptban add meg a megfelelő referenciafájl
abszolút vagy repo-relatív útját, és utasítsd a subagentet annak teljes beolvasására.
Ezek a pipeline-lépések közös munkafát és egymás kimenetét használják, ezért sorosan
fussanak, ne párhuzamosan.

## 0. Lépés — környezet-ellenőrzés

Nézd meg a `config.md` "Jira automatizálás" táblázatát. Ha van köztük `❓ nincs
megerősítve` flag, olvasd be az [`env-bootstrap.md`](env-bootstrap.md)-t és kövesd — az
intézi a kérdést és a `config.md` frissítését. Ugyanígy olvasd be, ha a `CI_READINESS_CHECK`
nem `off`, és a `CI_READINESS_CHECKED` értéke `-` (az egyszeri CI-készenlét ellenőrzés még nem
futott; a "CI-készenlét (egyszeri)" szakasz fut le). **Ha mind a négy flag már `true`/`false`, és a
CI-készenlét ellenőrzés kész (`CI_READINESS_CHECKED` dátum) vagy kikapcsolt (`off`), ne olvasd be azt a
fájlt** — ugorj egyenesen a "Belépési pontok"-hoz, ez a lépés ilyenkor nem csinál semmit.

## Belépési pontok

**A pontos mondatokat a `config.md` "Indító parancsok" táblázatából olvasd** (ha a
felhasználó átírta ott valamelyiket, ez a friss forrás — az alábbi táblázat csak a
config.md állapotát tükrözi a fájl írásakor). A felhasználó mondata alapján dönts, honnan
indulsz — közeli parafrázis is elég, nem kell szó szerinti egyezés. Ha egyértelműen egyik
mintára sem hasonlít, kérdezz rá, melyik szakaszt szeretné.

| # | Kanonikus mondat (config.md-ből) | Hova ugrik |
|---|---|---|
| 2 | "vedd magadhoz azt a ticketet, ami soron következik" | **Pickup (A4)** → elágazás kód-ágra (A5) vagy design-ágra ([`design-branch.md`](design-branch.md) B4) |
| 3 | "folytasd a 8-tól" | **A8** — teszt-env ellenőrzés egy már pusholt ticketnél |
| 4 | "nézd meg, hogy lereviewztem-e a design terved" | [`design-branch.md`](design-branch.md) **B6** — design-review-check |
| 5 | "workflow-t folytasd implementációval" | [`design-branch.md`](design-branch.md) **B7 → A5** — implementáció indítása jóváhagyott design ticketből |
| 6 | "dolgozd fel a review kommentjeimet" | [`review-feedback.md`](review-feedback.md) **R1** — review-státuszú ticket emberi visszajelzéseinek feldolgozása, végén vissza **A7**-re |
| 10 | "csináld meg előre az összes képernyőtervet" | [`design-branch.md`](design-branch.md) **B8** — design-előfutás: az összes design-érintett ticket képernyőterve oldalnév szerint deduplikálva, jóváhagyás után sorosan B4 → B5, egyetlen megállással |

Ha a 3., 5. vagy 6. belépési pontnál nem derül ki a beszélgetésből, melyik ticketről van
szó, kérdezz rá a ticket kulcsára — ne találgass.

A (4), (5) és (10) belépési pont közvetlenül a B-ágra indul, a (6) pedig a
[`review-feedback.md`](review-feedback.md)-re. Ezekben az esetekben **először olvasd be
a megfelelő fájlt**, onnan indulj a jelzett szakasszal (B6 / B7 / B8 / R1). A (2) és (3) pont
az A-ágon indul; a design-branch.md-t vagy review-feedback.md-t csak akkor kell
beolvasni, ha az útválasztás oda irányít.

---

## A-ág — kód implementáció

### A4 — Pickup

- JQL lekérdezés Atlassian MCP-vel (`searchJiraIssuesUsingJql`): `assignee = <ASSIGNEE_FOR_PICKUP>
  AND labels = "<CODEX_WORK_LABEL>" AND status = "<INITIAL_STATUS_NAME>"` (a `config.md`
  értékeit behelyettesítve — jelenleg `codex`, illetve `To Do`), priority szerint csökkenő
  sorrendben. Más labellel ellátott vagy label nélküli ticketet ne vegyél figyelembe.
- **Függőség előbb**: ha egy ticket "blocked by" kapcsolatban van egy másik, még nem Done
  ticketttel, azt hagyd ki — csak olyan ticketet válassz, aminek minden blokkoló függősége
  már lezárva. Az egyeztetett prioritásokon belül ez dönt a sorrendről (ez a felhasználó
  szándékos szervező ereje egy csokor ticketnél).
- Ha nincs egyetlen felvehető ticket sem (mind blokkolva, vagy nincs `INITIAL_STATUS_NAME`
  státuszú), jelezd ezt a felhasználónak és állj meg.
- **Elakadt ticket ellenőrzés (mindig fusson le, a fenti pickuptól függetlenül)**: külön
  JQL-lel `assignee = <ASSIGNEE_FOR_PICKUP> AND labels = "<CODEX_WORK_LABEL>" AND status not
  in ("<INITIAL_STATUS_NAME>", "Done", "Closed") AND updated <
  -<STUCK_TICKET_THRESHOLD_DAYS>d`. Találat esetén **ne javítsd automatikusan** (nem
  tudod, miért ragadt ott) — csak sorold fel a felhasználónak (kulcs, státusz, mióta
  változatlan), hogy döntsön. Más agenthez címkézett ticketet itt se jelezz.
- **Elágazás**: ha a kiválasztott ticketnek van kitöltött "Oldalnév" mezője, de **még
  nincs jóváhagyott/lezárt design hozzá** (nincs `SECOND_REVIEW_DONE_STATUS` állapotú,
  hozzá linkelt design-review ticket) → olvasd be a [`design-branch.md`](design-branch.md)
  fájlt, és ugorj az ott leírt **B4**-re. Egyébként (pure backend, vagy már van
  jóváhagyott design) folytasd lent **A5**-tel — ilyenkor a design-branch.md-t nem kell
  beolvasnod.

### A5 — Branch

- A ticket jellege (`TICKET_NATURE_TAGS`) és a `REPO_MAP` alapján dőlj el, melyik repóban
  dolgozol (FE vagy BE bejegyzés a ticket project key-e vagy a ticket tartalma alapján —
  ha a ticket Sub-task egy FE/BE split szülő Story alatt, a saját tartalma dönt, nem a
  szülőé).
- **Repo-gyökér feloldása**: a kiválasztott `REPO_MAP` bejegyzés path-ja `.` esetén
  futtasd az aktív Codex workspace-ben a `git rev-parse --show-toplevel` parancsot, és
  az abszolút eredményt tartsd meg `RESOLVED_REPO_ROOT` értékként. Konkrét path esetén
  azt normalizáld abszolút úttá. Ettől a ponttól minden git/parancs workdirje ez legyen,
  és ugyanezt az abszolút értéket add át minden subagentnek. Ne használj egy másik,
  párhuzamos klónt csak azért, mert létezik a gépen.
- **Munkafa-ellenőrzés előbb**: `git -C <RESOLVED_REPO_ROOT> status` — ha van nem commitolt módosítás a jelenlegi
  branch-en, **ne veszejtsd el csendben**. Ha egyértelmű a kontextusból, hogy ez egy másik,
  folyamatban lévő ticket/feladat munkája (pl. más ticket-kulcsra utaló branch-név, vagy a
  felhasználó korábban említette), `git stash -u`-val tedd félre váltás előtt, és a
  stash-t jelezd a felhasználónak (melyik branch-en, mit tartalmaz), hogy tudja, hol
  keresse, ha vissza akar térni rá. Ha nem egyértelmű, kinek/minek a munkája, **kérdezz
  rá**, mielőtt bármit stash-elnél vagy felülírnál.
- **Branch létrehozása — szkripttel, ne kézi git-parancsokkal**: miután a munkafa tiszta
  (nincs stash-elendő módosítás, vagy már megtörtént), állítsd össze a végleges branch
  nevet a `BRANCH_NAME_PATTERN`/`BRANCH_NAME_WORD_SEPARATOR` szerint, és egyetlen hívással
  futtasd:
  `bash <ennek-a-skillnek-a-mappája>/scripts/create-feature-branch.sh <RESOLVED_REPO_ROOT> <REPO_MAP-beli alap branch> <összeállított branch név>`.
  A [`scripts/create-feature-branch.sh`](scripts/create-feature-branch.sh) maga
  ellenőrzi a munkafa tisztaságát, checkoutolja + fast-forward-only pull-olja az alap
  branch-et, majd létrehozza/checkoutolja az új branch-et. Ha hibával leáll, **ne
  próbáld megkerülni** — állj meg és jelezd a felhasználónak.
- **Ticket → "In Progress"**: ha a `config.md` `JIRA_AUTO_INPROGRESS_ON_BRANCH` flag
  `true`, a Jira Automation ezt már elvégezte a branch létrehozásakor — csak
  `getJiraIssue`-val ellenőrizd, hogy tényleg "In Progress"-ben van-e, és **csak akkor**
  hívj explicit `transitionJiraIssue`-t, ha valamiért mégsem (fallback). Ha a flag
  `false`, hívd meg közvetlenül, mint eddig.

### A6 — Implementáció

- **Döntsd el, kell-e terv-jóváhagyási kör előbb.** Triviális esetben (pl. javítókörben
  hívva egy már korábban jóváhagyott implementációhoz — lásd
  [`retry-and-escalation.md`](retry-and-escalation.md), ott sosem kell terv; vagy
  egyetlen AC-s, nyilvánvalóan egyfájlos módosítás) hagyd ki ezt és ugorj egyenesen a
  lenti "közvetlen végrehajtás"-ra. Minden más esetben (több AC, több fájlt/komponenst
  érintő ticket, vagy split nélküli, nagyobb Bug/Task ticket):
  1. Hívd meg az [`implementer`](implementer.md) subagentet **`plan` móddal**.
  2. Mutasd meg a kapott tervet a felhasználónak, kérj rövid jóváhagyást ("mehet így,
     vagy módosítsunk?"). Ha módosít, vidd vissza a visszajelzést, és — ha érdemi
     irányváltás — hívd meg újra `plan` móddal a pontosított bemenettel.
  3. Jóváhagyás után hívd meg újra az `implementer`-t **`execute` móddal**, átadva a
     jóváhagyott tervet is.
  - Ez a kör egy plusz subagent-hívást jelent, de az a cél, hogy rossz irányú
    implementációt (és az azt visszacsináló javítóköröket) előre kizárjunk — egy elkerült
    félrekanyarodás jellemzően többe kerülne, mint maga a terv-kör.
- **Közvetlen végrehajtás** (ha a fenti szerint kihagyható a terv-kör): hívd meg az
  [`implementer`](implementer.md) subagentet közvetlenül **`execute` móddal** a ticket
  ID-vel, AC-listával, branch-csel és az abszolút `RESOLVED_REPO_ROOT` értékkel.
- **`FIGMA_TOOLS_MISSING` az `implementer`-től (design-linkelt ticket):** a futás megáll,
  jelezd a felhasználónak egy sorban, és ne indíts kerülőutat (más agentet, becsült
  értékekkel dolgozó végrehajtást). A felhasználó a connector rendbetétele után kéri az
  újrafuttatást.

### A7 — Helyi AC-ellenőrzés

- Hívd meg a [`qa-tester`](qa-tester.md) subagentet `local` target móddal, átadva az
  abszolút `RESOLVED_REPO_ROOT` értéket és a branch nevét.
- **7a — zöld**: pushold fel a branch-et
  `bash .agents/skills/dev-workflow/scripts/push-as-ai.sh <branch-név>`-vel (nem sima
  `git push origin`-nel). Ha a wrapper a `GITLAB_TOKEN_AI` hiányára vagy 403-ra fut,
  jelezd a konkrét hibát, és kérdezd meg, engedélyezi-e a felhasználó a saját
  identitásával történő fallback push-t. Ezután nyiss MR-t/PR-t (a ticket AC-jét/linkjét
  belefoglalva a leírásba). Ha a `config.md` `JIRA_AUTO_DONE_ON_MERGE` flag `true`, az
  MR leírásába **kötelezően** kerüljön bele egy GitLab closing-kulcsszó + a ticket-kulcs
  (pl. `Closes <TICKET-KULCS>`) — sima mention/link **nem** elég ehhez az
  automatizációhoz, a GitLab csak explicit closing-kulcsszóra vált Jira-státuszt merge
  után (lásd `jira-automation-setup.md` 1. pont 9. lépése). Folytasd a **9. lépéssel**.
- **7b — piros**: kövesd a [`retry-and-escalation.md`](retry-and-escalation.md) "Javítókör
  mechanika" szekcióját (`implementer` javít → `qa-tester` újra ellenőriz, max
  `MAX_LOCAL_FIX_RETRIES`-ig). Ha zöldre vált, ugyanúgy 7a. Ha a limit kimerül nyitott
  blocker/majorral: a `retry-and-escalation.md` szerint mégis pusholj + nyiss MR-t
  "⚠️ Manuális javítás szükséges" jelöléssel, hozz létre fix-ticketet, és **állj meg**.
- **7c**: ha 7b-nél megállt a folyamat és a felhasználó kézzel javított, a folytatás a
  (3) belépési ponttal ("folytasd a 8-tól") indítható újra.

### 9 — Code review

- Push/MR után hívd meg a [`code-reviewer`](code-reviewer.md) subagentet a diffen/MR-en,
  átadva az abszolút `RESOLVED_REPO_ROOT` értéket is.
  A `code-reviewer` minden körben automatikusan posztol Jira- **és** GitLab-kommentet
  (soronkénti diff-komment blocker/major találatokhoz, legfeljebb a `config.md`
  `CODE_REVIEW_MAX_INLINE_COMMENTS` darabig + egy összesített komment) — ez a subagent
  saját, feltétel nélküli lépése, nem kell hozzá itt semmit külön elrendelni. A 2.+
  javítókörben add át neki az előző körök inline posztolt találatainak listáját
  (`fájl:sor` + egysoros leírás), hogy ne posztolja őket újra inline — minden felesleges
  komment egy GitLab-kérés.
- **Ebben a pipeline-ban felülírjuk a code-reviewer.md saját "kérj emberi jóváhagyást"
  szabályát**, mert ez a szakasz nincs a felhasználó által megjelölt kézi
  jóváhagyási pontok között: blocker/major találat esetén automatikusan jóváhagyottnak
  tekintve hívd az [`implementer`](implementer.md)-t a javításra, majd újra a
  `code-reviewer`-t — a [`retry-and-escalation.md`](retry-and-escalation.md) "Javítókör
  mechanika" szerint, **saját, A7-től független számlálóval**, ugyanazzal a
  `MAX_LOCAL_FIX_RETRIES` limittel.
- Minor/nitpick találat nem blokkol — csak Jira kommentbe kerül.
- Ha a kör kimerül nyitott blocker/majorral: `retry-and-escalation.md` szerinti
  eszkaláció (fix-ticket, `MANUAL_DEV_ASSIGNEE`), **állj meg**.
- Ha elfogadva (vagy csak minor/nitpick maradt): folytasd **A8**-cal.

### A8 — Teszt-env ellenőrzés

*(Ide ugrik közvetlenül a (3) "folytasd a 8-tól" belépési pont is — ha onnan jöttél, a
push/MR és a code review már megtörtént korábban, ne csináld újra, csak ha a felhasználó
kifejezetten jelzi, hogy új push történt azóta.)*

- ⚠️ **Ne feltételezd, hogy a push frissítette a teszt-környezetet** — nézd meg
  `TEST_ENV_MR_DEPLOY_MODE`-ot (`config.md`):
  - `auto`: ellenőrizd (`glab ci status`), hogy a jelenlegi commit-ra sikeresen lefutott
    a releváns CI pipeline, mielőtt tesztelsz.
  - `manual`: a deploy nem indul magától. **Ne indítsd el saját döntésből** —
    megosztott, gyakran production-címkéjű infrastruktúrát módosítana. Kérdezd meg a
    felhasználót, hogy jóváhagyásoddal elindítsd-e, vagy inkább hagyjátok ki az A8-at
    (A7 + code review maradjon elég ehhez a tickethez). Csak explicit igen után indítsd.
  - `none`: A8 nem futtatható értelmesen — jelezd, és folytasd nélküle.
  - Ha a flag `❓`, kérdezz rá egyszer (nézze meg a repó CI-fájlját, vagy mondja meg),
    és írd be a `config.md`-be, hogy legközelebb ne kelljen újra.
  - A deploy lefutására várakozás **egyetlen blokkoló szkript-hívással** történjen, ne
    ismételt tool-körökkel — pl. `until glab ci status --branch <branch> | grep -q
    success; do sleep "$POLL"; done`, ahol a lekérdezési időköz és a felső korlát a
    `config.md` "GitLab-API terhelés" tábláján áll:
    `POLL=$(bash .agents/skills/dev-workflow/scripts/config-value.sh TEST_ENV_DEPLOY_POLL_SECONDS 45)`
    és `TEST_ENV_DEPLOY_WAIT_MINUTES` (alapérték 10) — a ciklust ennyi perc után szakítsd
    meg, és jelezd, hogy a deploy nem készült el. Ne köss be rövidebb időközt: minden
    `glab ci status` több GitLab API-kérés, a sűrű lekérdezés rate limitet (429) okoz.
    Minden külön "kész van már?" tool-hívás egy felesleges LLM-kört fizettet ki.
- Hívd meg a [`qa-tester`](qa-tester.md) subagentet `test-env` target móddal, **csak a
  fenti ellenőrzés után**, ha a cél tényleg a jelenlegi branch/commit állapotát tükrözi.
- **8a — zöld**: állítsd az eredeti ticket(ek)et `REVIEW_STATUS_NAME` státuszra. 💡 Ha
  több ticketet dolgozol fel egymás után, ez biztonságos új-task/session pont — a következő pickup
  (A4) a Jira ticketből olvas vissza mindent.
  - `JIRA_AUTO_DONE_ON_MERGE=true` esetén a `review`→`Done` lépést a GitLab-Jira
    integráció intézi merge után; `false` esetén ez ismert rés marad (`history.md`) —
    jelezd a felhasználónak, hogy merge után kézzel kell lezárni.
  - **8c — kapcsolódó ticketek lezárása**: ha ez a ticket egy Sub-task, és a szülő
    Story minden gyereke Done/Closed/`REVIEW_STATUS_NAME`, ajánld fel (jóváhagyás
    után) a szülő lezárását — `getTransitionsForJiraIssue`-val ellenőrzött ID-vel, **ne
    találgass**, a "work is done and merged" ID státuszfüggő (`history.md`). Ha van
    hozzá design-review/web-design ticket (Oldalnév-egyezés/link) és az implementáció
    most fejeződött be, állítsd `DESIGN_TICKET_CLOSE_STATUS`-ra (nem `Done`-ra).
- **8b — piros**: `retry-and-escalation.md` szerinti fix-ticket (`MANUAL_DEV_ASSIGNEE`),
  **retry kör nélkül, azonnal** — a folyamat itt véget ér ezen a ticketen.

---

## B-ág — design-igényes feladat

A teljes B-ág (B4-B7: web-design ticket, Figma terv, design-review ciklus, folytatás
implementációval) a különálló [`design-branch.md`](design-branch.md) fájlban van —
szándékosan kiszervezve, hogy tiszta backend / már-jóváhagyott-design ticketeknél ne
kelljen betölteni. Olvasd be azt a fájlt, amint az A4 elágazás vagy a (4)/(5) belépési
pont a B-ágra irányít, és onnantól azt kövesd (B7 végén visszatér ide, A5-re).

---

## R-ág — review-visszajelzés feldolgozása

A teljes R-ág (R1-R6: ticket/branch/MR feloldás, Jira-/GitLab-kommentek beolvasása,
tisztázó kérdések, javítási terv jóváhagyása, implementáció, majd visszatérés a szokásos
kapukhoz) a különálló [`review-feedback.md`](review-feedback.md) fájlban van.
Csak a (6) belépési pontnál olvasd be; R6 végén az A7-re tér vissza.

---

## Általános szabályok

- Minden fázisváltás előtt röviden jelezd a felhasználónak, melyik szakaszba lépsz be —
  ez egy hosszan futó, több session-ön átívelő folyamat, mindig legyen világos, hol tart.
- Soha ne lépj át egy "workflow megáll" ponton automatikusan — azok szándékos kézi
  jóváhagyási/pihenő pontok. **Ezek egyben biztonságos új-task/session pontok** — a Jira
  ticket(ek) státusza és a git branch/commit-history hordozza az állapotot, nem a
  beszélgetés; új taskban elég a folytató indító mondatot és a ticket kulcsát megadni.
- Ha bármelyik subagent olyan hibát jelez, amit ez a skill nem tud kategorizálni
  (nem a megszokott blocker/major/minor formátum), ne találgass — mutasd meg a
  felhasználónak nyers formában, és kérdezz, hogyan tovább.
