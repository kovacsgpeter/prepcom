# dev-workflow — konfiguráció: referencia

Ez a fájl a [`config.md`](config.md) kulcsainak **jelentését** írja le: a lehetséges értékeket, a
preset-logikát, a fallback-szabályokat és a konvenciókat. A csomag része (verziózott), upgrade-kor
magától frissül; ne szerkeszd repó-lokálisan.

- **Az érvényes értékek nem itt vannak**, hanem a `config.md`-ben. Az itteni kulcstáblák `Alapérték`
  oszlopa a csomag szállított alapértéke, nem a repó beállítása.
- A szakaszcímek megegyeznek a `config.md` szakaszcímeivel. Egy kulcs jelentéséhez **csak az adott
  szakaszt** olvasd be (pl. `Grep` a `### LOCAL_GATE_MODE értékek` címre, majd `Read` offsettel); a
  fájlt egészben ne töltsd be.
- A „Bevezetve (TICKET)” megjegyzések a kapcsolót bevezető ticketre mutatnak (történeti hivatkozás).

> 📖 Ha egy skill/subagent olyan tracker-/API-hibát vagy váratlan állapotot tapasztal, amire a lenti
> táblázatok nem adnak egyértelmű választ, nézze meg a [`history.md`](history.md)-t, mielőtt
> találgatna. Ez sem hot-path olvasmány.

## GitLab Package Registry

| Env-változó | Leírás |
|---|---|
| `PACKAGE_REGISTRY_READ_USERNAME` | A group szintű Package Registry olvasási deploy token felhasználóneve. |
| `PACKAGE_REGISTRY_READ_TOKEN` | A group szintű Package Registry olvasási deploy token értéke. |
| `CI_JOB_TOKEN` | A CI pipeline-ból történő publikálás alapértelmezett (beépített GitLab CI) tokenje. |

A tokenek tényleges értéke nem kerülhet repóba, Jira-ticketbe,
GitLab-kommentbe, pipeline-logba vagy dokumentációba.

## Jira automatizálás (opcionális, egyszeri Jira/GitLab admin-beállítás)

Alapértelmezetten **minden flag `❓ nincs megerősítve`** — ez nem "nem", hanem "még nem
kérdeztük meg". Az `execute/SKILL.md` "0. lépés: környezet-ellenőrzés" szakasza session
elején **egyszer**, egy kötegben rákérdez mind a négyre, és a válasz alapján **ezt a
fájlt közvetlenül átírja** `true`/`false`-ra — utána soha többé nem kérdez rá, csak ezt a
táblázatot olvassa. Ha egy flag már `true`/`false` (nem `❓`), az azt jelenti, hogy
korábban már megerősítést nyert — ilyenkor ne kérdezz rá újra, csak használd az értéket.

`true` esetén az érintett skill-lépés kihagyja a saját tranzíció-hívását (csak
ellenőrzi az állapotot, fallbackként mégis meghívja, ha az automatizálás valamiért nem
sült el) — ez állapotváltásonként 1-3 LLM-kört (MCP-hívást) spórol meg, futásonként.
`false` esetén a skillek a jelenlegi, explicit `transitionJiraIssue` MCP-hívásokkal
dolgoznak (ez a biztonságos alapállapot, ha nincs elvégezve a Jira/GitLab admin-oldali
beállítás — lásd [`jira-automation-setup.md`](jira-automation-setup.md)).

| Változó | Alapérték | Kiváltott lépés |
|---|---|---|
| `JIRA_AUTO_DONE_ON_MERGE` | `❓ nincs megerősítve` | `execute/SKILL.md` A8a — a `review`→`Done` tranzíciót MR-merge után a GitLab-Jira integráció végzi, nem a skill. |
| `JIRA_AUTO_INPROGRESS_ON_BRANCH` | `❓ nincs megerősítve` | `execute/SKILL.md` A5 — a `To Do`→`In Progress` tranzíciót branch-létrehozáskor a Jira Automation végzi. |
| `JIRA_AUTO_INITIAL_STATUS_ON_CREATE` | `❓ nincs megerősítve` | `design-branch.md` B4/B5 — a web-design/design-review ticket a Jira Automation által rögtön a helyes kezdőállapotban jön létre, nem kell utólag transitionJiraIssue-zni. |
| `JIRA_WORKFLOW_HAS_DIRECT_SECOND_REVIEW_TRANSITION` | `❓ nincs megerősítve` | `design-branch.md` B6 — ha a Jira workflow-sémában felvetted a közvetlen `first_review_done`→`second_review_requested` élt, a B6 egy hívással állítja be a státuszt a jelenlegi két-hopos kerülőút helyett. |

## Munkanyelv (WORKING_LANGUAGE)

> ℹ️ **Bevezetve (COCALC-221)**: ez a repó a Claude-oldali `dev-workflow/config.md`-ben egy
> `WORKFLOW_PROFILE` preset-keretbe ágyazva vezeti be ezt a kapcsolót — ez a Codex-port
> egyelőre nem tartalmazza azt a keretet, ezért itt önálló, egyszerű változóként szerepel,
> ugyanazzal az értékkel és fallback-szabállyal.

| Változó | Alapérték | Leírás |
|---|---|---|
| `WORKING_LANGUAGE` | `magyar` | Az interjú-jellegű Jira-ticket-létrehozó skillek (`jira-ticket`) munkanyelve — ezen a nyelven folytatják az interjút és írják a ticket szövegét, hacsak a felhasználó explicit másképp nem kéri. Ha a skill nem talál értéket ehhez a változóhoz (hiányzó/ismeretlen), essen vissza `magyar`-ra, és ne akadjon el emiatt. |

## Modell-stratégia fázisonként

| Változó | Alapérték | Leírás |
|---|---|---|
| `PREFERRED_INTERVIEW_MODEL` | `gpt-5.6-sol` (`high` reasoning) | A `scoping`/`intake`/`story-interview` fázisra ajánlott Codex modellprofil. Ha ez változik, itt és az érintett skill modell-kérdésében frissítsd. |

| Fázis | Ajánlott modell | Indoklás |
|---|---|---|
| `scoping` / `intake` / `story-interview` (interjú, scope-bontás, DoR Spec) | `PREFERRED_INTERVIEW_MODEL`, jelenleg **gpt-5.6-sol / high** | Itt számít leginkább az ítélőképesség. A skillek egyszer, explicit igen/nem kérdéssel rákérdeznek, ha a session más profilon fut; elutasítás után ugyanabban a sessionben nem kérdeznek újra. |
| `execute` implementer | `dev_workflow_implementer`: **gpt-5.6-terra / medium** | TDD-végrehajtás és célzott javítókörök. |
| `execute` QA | `dev_workflow_qa_tester`: **gpt-5.6-terra / medium** | Tesztfuttatás és böngészős AC-ellenőrzés. |
| `execute` code review | `dev_workflow_code_reviewer`: **gpt-5.6-terra / high**, read-only sandbox | A magasabb reasoning az edge case-ek és regressziók miatt kell. |
| `execute` Figma design | `dev_workflow_figma_designer`: **gpt-5.6-terra / high** | Design-system döntések és állapotok ellenőrzése. |

A fenti custom agentek projekt-szintű konfigurációja a `.codex/agents/` könyvtárban él.
Ha a futó kliens nem tud custom agent-nevet választani, a hívó skill ugyanilyen
modellprofillal indítson specializált subagentet, és adja át neki a megfelelő
`.agents/skills/dev-workflow-execute/*.md` referenciafájlt.

## Indító parancsok (kanonikus mondatok)

Ez az egy hely, ahol a workflow 6 kézi belépési pontjának mondatait szerkesztheted. Két
dolgot fontos tudni a configolhatóságukról:

- **A skill-kiválasztás** (hogy egyáltalán melyik SKILL.md induljon el) a Codex
  eszköz által, a SKILL.md fájlok saját `description` mezője alapján, szemantikus
  egyezéssel dől el — ez a fájl ekkor még nincs beolvasva, úgyhogy ott a szöveg nem tud
  innen jönni, és a fájlokban is szerepel egy másolat. De ez amúgy sem szó szerinti
  parancs-egyezés — a lenti mondatok bármelyikének **közeli parafrázisa is működik**, nem
  kell pontosan ezt írnod.
- **Az `execute/SKILL.md` belső útválasztása** (hogy a már betöltött skill melyik
  szakaszra ugorjon) viszont ténylegesen erről a táblázatról olvas — ha itt átírod egy
  mondatot, az execute-skill onnantól azt is felismeri.

| # | Kanonikus mondat | Skill / szakasz |
|---|---|---|
| 1 | "szeretnék fejleszteni valamit a `<repo/jira projekt>`-ben" | `scoping/SKILL.md` |
| 2 | "vedd magadhoz azt a ticketet, ami soron következik" | `execute/SKILL.md` — A4 (pickup) |
| 3 | "folytasd a 8-tól" | `execute/SKILL.md` — A8 (teszt-env ellenőrzés) |
| 4 | "nézd meg, hogy lereviewztem-e a design terved" | `execute/SKILL.md` → `design-branch.md` — B6 (design-review-check) |
| 5 | "workflow-t folytasd implementációval" | `execute/SKILL.md` → `design-branch.md` — B7 → A5 |
| 6 | "dolgozd fel a review kommentjeimet" | `execute/SKILL.md` → `review-feedback.md` — R1 (review-státuszú ticket emberi visszajelzéseinek feldolgozása, majd A7-re visszatérés) |
| 10 | "csináld meg előre az összes képernyőtervet" | `execute/SKILL.md` → `design-branch.md` — B8 (design-előfutás: az összes design-érintett ticket képernyőterve előre, oldalnév szerint deduplikálva, jóváhagyás után sorosan B4 → B5, egyetlen megállással). Lásd "Design-előfutás (B8)". |
| 11 | "nézd át UX-szemmel az appot" | `ux-designer/SKILL.md` — audit: böngészős bejárás a `UX_AUDIT_TARGET` ellen, user-flow térkép, Nielsen + WCAG 2.2 AA szerinti, súlyozott találatok. Lásd "UX-designer (UX_*)". Közeli parafrázis is elég (pl. "csinálj UX-auditot"). |
| 12 | "gondold újra a flow-t és tervezz új képernyőket" | `ux-designer/SKILL.md` — redesign: célflow és képernyőnkénti UX-spec a meglévő UI-szerződésre építve (T0–T3 szintek, TS/API-delta), jóváhagyás után story-javaslatok a `dev-workflow-scoping`-nak. |
| 13 | "kritizáld ezt a képernyőtervet" | `ux-designer/SKILL.md` — critique: Figma-terv vagy élő oldal értékelése a UX-spec és a rubrika ellen, Block / Needs changes / Approve verdikttel. A pipeline-ban a `design-branch.md` B4a hívja. |
| 14 | "csináld meg az `<EPIC-KULCS>` epicet storynként" | csak a Claude-workflow-ban: `.claude/skills/dev-workflow-execute/epic-mode.md` — E1 (epic-mód); a Codex-portban nincs E-ág |

Ha átírod valamelyik mondatot, frissítsd a SKILL.md fájlok `description` mezőjében lévő
példamondatot is (ott csak illusztráció, de érdemes szinkronban tartani), és a
[`README.md`](README.md) indító parancsok táblázatát.

## Jira / assignee

| Változó | Alapérték | Leírás |
|---|---|---|
| `ASSIGNEE_FOR_PICKUP` | `<ASSIGNEE_FOR_PICKUP>` ✅ *(accountId `<ASSIGNEE_ACCOUNT_ID>`)* | Erre a névre szűrve válogat ticketet a pickup lépés (execute SKILL.md A4). |
| `CODEX_WORK_LABEL` | `codex` | Kijelöli, hogy egy tickettel a Codex workflow dolgozhat. Minden olyan JQL-keresés kötelező szűrője, amellyel a workflow munkát kezdene (A4 pickup és elakadt-ticket ellenőrzés, B6 design-review keresés). A más agenthez címkézett (pl. `claude`) és a label nélküli ticketeket figyelmen kívül kell hagyni. |
| `CODEX_CREATED_LABEL` | `codex-created` | Automatikus eredetjelölő: a Codex workflow minden ticket-létrehozó lépése kötelezően ráteszi a létrehozott ticketre a közös `jira-ticket-template.md` szerint. Nem jelöl munkatulajdonost, ezért nem helyettesíti a `CODEX_WORK_LABEL` értékét; egy `codex-created` ticketet ember vagy más workflow is feldolgozhat. |
| `MANUAL_DEV_ASSIGNEE` | `<MANUAL_ASSIGNEE_NAME>` | Az eszkalált fix-ticketek (7b/9/8b) felelőse — a te vagy egy kollégád Jira accountja. |
| `MANUAL_REVIEWER_ASSIGNEE` | `<MANUAL_ASSIGNEE_NAME>` | A design-review ticketek felelőse (aki a Figma-tervet review-zi). |
| `INITIAL_STATUS_NAME` | `To Do` | A Jira workflow kezdő státusza — a `createJiraIssue` mindig ide hoz létre, az A4 pickup JQL-je erre szűr. Ha a Jira projekt más néven hívja a kezdő oszlopot (pl. `Backlog`, `Open`), **itt írd át** — minden skill/subagent innen olvassa, sehol nincs máshol beégetve a `"To Do"` szó szerinti string. |
| `REVIEW_STATUS_NAME` | `review` ✅ *(kisbetűs Jira státusznév, `id: 10003`, API-val megerősítve)* | Jira státusz, ahova a ticket kerül, ha az implementáció minden kapun zöld volt (execute A8a). Az `In Progress`-ből induló saját (nem globális) átmenet neve "implementation is under review", `transition id: 7`. Ne exact-case string-matchelj a nagybetűs `Review`-ra — a `statusCategory.name` "In Progress", de a tényleges `status.name` `review`. |

## AI-identitás (GitLab commit/push/review szerzőség)

A skill által generált git- és GitLab-műveletek a külön `<AI_GIT_NAME>` identitással fussanak,
ne a felhasználó interaktív fiókjával. A váltás minden esetben csak az adott parancsra
érvényes env- vagy URL-override; a repó- és globális git konfigurációt nem módosítja.

| Változó | Alapérték | Leírás |
|---|---|---|
| `AI_GIT_NAME` | `<AI_GIT_NAME>` | Commit author/committer név. |
| `AI_GIT_EMAIL` | `<AI_GIT_EMAIL>` | A GitLab-profilhoz kötött commit-email. |
| `AI_GITLAB_USERNAME` | `<AI_GIT_NAME>` | GitLab handle. |
| `AI_GITLAB_TOKEN_ENV_VAR` | `GITLAB_TOKEN_AI` | `api` + `write_repository` jogosultságú PAT környezeti változója; soha ne kerüljön a repóba vagy kommentbe. |

Előfeltételek: az email legyen megerősítve a GitLab-profilban, a PAT legyen beállítva,
és a `<AI_GIT_NAME>` user legalább Developer szerepkörrel legyen a projekt tagja.

| Csatorna | Wrapper | Hívó |
|---|---|---|
| Commit | `.agents/skills/dev-workflow/scripts/commit-as-ai.sh` | `dev-workflow-execute/implementer.md` |
| Push | `.agents/skills/dev-workflow/scripts/push-as-ai.sh` | `dev-workflow-execute/SKILL.md` A7a |
| GitLab API/MR-komment/review | `.agents/skills/dev-workflow/scripts/glab-note-as-ai.sh` | pipeline code reviewer és önálló GitLab review skill |
| Helyi LLM-hívás (végrehajtó-adapter) | `.agents/skills/dev-workflow/scripts/call-local-model.sh` | — (még senki ezen az oldalon — a tényleges execute-lánc bekötés, `dev-workflow-execute/SKILL.md` A6, csak a Claude-oldalon történt meg, `implementer` fázisra, COCALC-387) — közvetlen Ollama-/OpenAI-kompatibilis HTTP-hívás (COCALC-220 / LOCAL-1); LOCAL-5 óta: `--phase` kapcsoló, fájlon át menő kérés/válasz, `LOCAL_MODEL_THINK`/`NUM_CTX`/`FORMAT` env-változók és tömbelem-útvonal (`findings[].path`) — a `repo-scanner` és `qa-tester` fázis-bekötés viszont ezen az oldalon sincs meg, csak a Claude-oldalon; a hét konfigolható kapcsoló (endpoint, modell, timeout, dialektus, fallback-policy, breaker-threshold, max-retries) alapértéke a Claude-oldali `dev-workflow/config.md` "WORKFLOW_PROFILE" preset-táblájából jön, mert ez a repó nem duplikálja azt a keretet. A szkript maga a Claude-oldalival egyező biztonsági korlátokat kapta (COCALC-387 code review javítás): nem-loopback végpont figyelmeztetése, abszolút/repo-n-kívüli (symlink-escape ellen is védett) fájlút-elutasítás — lásd a szkript fejléc-kommentjét a teljes kontraktusért |

Ha az AI-identitás adatai változnak, ezt a táblázatot és a wrapper-szkriptek konstansait
együtt frissítsd. A manuális identitásváltáshoz a repo gyökerében lévő
[`tools/switch-git-identity.ps1`](../../../tools/switch-git-identity.ps1) használható;
ez nem módosítja a push hitelesítését.

## Repók és projektek

`REPO_MAP` — logikai név → repo elérési út/URL, alap branch, Jira project key. Ez a
repo-szintű másolat **csak** a saját repóját (<LOGICAL_REPO_NAME>) tartalmazza — egy **teljesen
másik, önálló alkalmazáshoz** (a "construction calculator" apphoz, aminek saját,
`<OTHER_REPO_NAME>`/`<OTHER_REPO_NAME>` nevű repói vannak) lesz saját,
oda konkretizált másolat, ha *azokban* is bevezetitek a workflow-t. Ne keverd össze a két
alkalmazást — a <LOGICAL_REPO_NAME> csak a Jira `<JIRA_PROJECT_KEY>` project key-t osztja meg azzal az appal,
a kódbázisuk teljesen független.

Az itt használt `.` repo path egy szándékos, hordozható sentinel: minden workflow-futás
elején az aktív Codex workspace-ből futtatott `git rev-parse --show-toplevel` eredményére
kell feloldani, és az így kapott abszolút útvonalat kell `RESOLVED_REPO_ROOT` néven minden
git-parancsnak és subagentnek továbbadni. Ne cseréld gépspecifikus abszolút klón-útvonalra.

| Logikai név | Repo path/URL | Alap branch | Jira project key |
|---|---|---|---|
| `<LOGICAL_REPO_NAME>` | `.` *(aktív Git workspace gyökere)* | `master` | `<JIRA_PROJECT_KEY>` |

Amikor az intake skill a `<repo/jira projekt>` változót kapja a felhasználótól, ebből a
táblázatból oldja fel a konkrét repo path-ot és Jira project key-t. Ha a megadott név nem
egyértelmű vagy nincs bejegyzés rá, **ne találgass** — kérdezz rá, vagy ellenőrizd
`getVisibleJiraProjects`-szel, mielőtt Jira project key-t feltételeznél.

### Több réteg egy repóban

Ha a repo több réteget (frontend, backend, stb.) tartalmaz egyszintű alkönyvtárakban, a fenti
`REPO_MAP` `<LOGICAL_REPO_NAME>` sora mindkét jellegű tickethez ugyanaz — a repo path nem
változik, csak az, hogy a munkafa melyik alkönyvtárában dolgozol (a réteg jellege szerint).
A konkrét alkönyvtár-neveket (pl. frontend-/backend-mappa) a fogyasztó repo tölti ki a saját
szerkezete alapján.

## Ticket formátum

| Változó | Alapérték | Leírás |
|---|---|---|
| `TICKET_NATURE_TAGS` | `feature`, `fix`, `build`, `refactoring`, `chore` | **Nem a Jira issue type mező!** Ez egy saját "jelleg" cimke, ami a ticket leírásának infobox "Típus" mezőjébe kerül (lásd [jira-ticket-template.md](jira-ticket-template.md)) és a branch-nevet is adja. A valódi Jira issue type-ot a lenti "Jira issue type-ok" szekció `JIRA_ISSUE_TYPE_MAP` táblázata adja meg — a kettő egymástól független mező ugyanazon a ticketen. Fix enum, ne bővítsd ötletszerűen. |
| `TICKET_INFOBOX_FIELDS` | `típus`, `dátum`, `story felelős` `manual dor` | A ticket fejlécében táblázatos/infobox formában megjelenő mezők, lásd [jira-ticket-template.md](jira-ticket-template.md). Design-érintett ticketeknél **kötelezően** bekerül még egy `oldalnév` mező is (ez az 5-ös limitbe beleszámít). |
| `PAGE_NAME_SEPARATOR` | `_` | Az oldalnév-konvencióban több szavas névnél ez az elválasztó (lásd lent). |

## Jira issue type-ok (valódi Jira mező)

Ez **nem ugyanaz, mint a fenti `TICKET_NATURE_TAGS`** — ez a Jira natív "Issue Type"
mezője, amit `createJiraIssue` hívásakor ténylegesen be kell állítani.

> ⚠️ Az elérhető issue type-ok **projektenként eltérnek** — mindig ellenőrizd
> `getVisibleJiraProjects`-szel a konkrét project key elérhető típusait, mielőtt
> `createJiraIssue`-t hívnál. Ha a kívánt típus (pl. `java`/`css`/`html`) nem elérhető,
> essz vissza `Sub-task`-ra, a jelleget írd a Kontextus szekció első mondatába. A
> `<JIRA_PROJECT_KEY>` projekt jelenlegi subtask-szintű típusai: `Sub-task`, `angular`, `java`,
> `web-design`, `documentation`, `code-review`, `design-review`. Az `angular` és a `java`
> típus subtask-szintű
> (`hierarchyLevel: -1`) — önálló, szülő nélküli story-ként nem hozható létre, csak
> Sub-task-ként egy `Story` szülő alatt.

Granuláris Story-bontásnál a gyerek ticket issue type-ját kizárólag az alábbi központi
mappingből válaszd; az intake skillben ne legyen rétegenkénti issue type hardcode:

| `JIRA_SUBTASK_ISSUE_TYPE_MAP` kulcs | Jira issue type | Használat |
|---|---|---|
| `frontend` | `angular` | Frontend-réteghez tartozó implementációs részfeladat. |
| `backend` | `java` | Backend-réteghez tartozó implementációs részfeladat. |
| `fallback` | `Sub-task` | Egyéb/nem támogatott réteg, illetve ha a konfigurált rétegtípus az adott Jira projektben nem érhető el subtask-szinten. |

A mapping alkalmazása előtt a projekt metadata alapján ellenőrizd, hogy a kiválasztott
típus `subtask: true` (ekvivalensen `hierarchyLevel: -1`). Sikertelen ellenőrzésnél a
`fallback` értéket használd.

Ebből a workflow jelenleg ezeket használja:

| Helyzet | Jira issue type | Megjegyzés |
|---|---|---|
| story-interview "Story" típus, backend vagy nem FE-specifikus | `Story` | |
| story-interview "Story" típus, kizárólag frontend, **nincs FE/BE split** | `angular` | Csak ha a story önállóan, split nélkül megy — split esetén lásd a következő két sort. |
| story-interview "Bug" típus | `Bug` | |
| story-interview "Task" típus | `Task` | |
| Granuláris Story-bontás — szülő ticket | `Story` | A gyerekek Jira natív parent/Sub-task kapcsolattal kerülnek alá, nem csak "blocks" linkkel — lásd `jira-ticket-template.md` "Granuláris Story-bontás esetén". |
| Granuláris Story-bontás — gyerek ticket | `JIRA_SUBTASK_ISSUE_TYPE_MAP[layer]`, különben `fallback` | Frontend: `angular`; backend: `java`; egyéb/nem támogatott: `Sub-task`. |
| Design-review ticket (execute B5) | `design-review` | |
| Web-design ticket (execute B4) | `web-design` | A Figma-tervezési munkát nyomon követő, könnyűsúlyú ticket — lásd `jira-ticket-template.md` "Web-design ticket" szekció. |
| Eszkalált fix-ticket (retry-and-escalation.md, 7b/9/8b) | `Bug` | A `TICKET_NATURE_TAGS` infobox "Típus" mezője ettől függetlenül marad `fix` — két külön mező ugyanazon a ticketen. |

`code-review` és `documentation` jelenleg nincs használva ebben a workflow-ban — ha
később bevezetnéd (pl. a 9. lépés code review-ját külön ticketre is kirakva), itt bővítsd
a táblázatot.

> ⚠️ **Technikai korlát**: a `Sub-task` (és bármelyik subtask-szintű típus) csak a
> szülőjével **azonos Jira projektben** hozható létre. A fenti "FE/BE split" sorok azt
> feltételezik, hogy a frontend és backend repo **ugyanahhoz a Jira projekthez** tartozik
> (ezt megerősítetted) — ha ez változna, szólj, mert akkor vissza kell állni a korábbi, két
> külön (linkelt) Story-s megoldásra.

## Branch-elnevezés

| Változó | Alapérték | Leírás |
|---|---|---|
| `BRANCH_NAME_PATTERN` | `{type}/{ticket_key}_{harom_szavas_osszefoglalo}` | `{type}` a ticket jellege (lásd `TICKET_NATURE_TAGS`, **nem** a Jira issue type), `{ticket_key}` a Jira kulcs, a harmadik rész a ticket céljának 3 szavas összefoglalója. |
| `BRANCH_NAME_WORD_SEPARATOR` | `_` | A `{harom_szavas_osszefoglalo}` szavai közötti elválasztó (lehet `-` is, ha úgy szereted). |

Példa a fenti default értékekkel: `feature/PROJ-123_uj_bejelentkezo_oldal`

## Minőségi kapuk / retry

| Változó | Alapérték | Leírás |
|---|---|---|
| `MAX_LOCAL_FIX_RETRIES` | `7` | Max javítókör-szám. **Gate-enként külön számolva**: a qa-tester helyi AC-ellenőrzés (execute A7b) és a code review kör (execute 9. lépés) egymástól független számlálót vezet, de mindkettő ezt az egy konfigértéket használja limitként. |

## GitLab-API terhelés (rate limit)

> ℹ️ **Itt vezetve be (4.22.0)**: a GitLab.com felhasználónként és végpont-típusonként
> perc alapú rate limitet alkalmaz, túllépésnél HTTP 429-et ad ("Rate limit exceeded"). Az
> AI-identitású hívások (`push-as-ai.sh`, `glab-note-as-ai.sh`) mind ugyanazt a tokent
> használják, tehát egy számlálóra terhelődnek — a párhuzamos session-ök és worktree-k
> kérései összeadódnak. Az alábbi értékeket a szkriptek maguk olvassák ki ebből a táblából
> ([`scripts/config-value.sh`](scripts/config-value.sh)), ezért elég itt átírni őket; egy
> futásra az azonos nevű környezeti változó felülbírálja. Érvénytelen (nem egész szám)
> érték esetén a szkript egysoros jelzéssel a szállított alapértékre esik vissza.

| Kapcsoló | Érték | Jelentés |
|---|---|---|
| `GITLAB_RATE_LIMIT_RETRIES` | `5` | Hányszor próbálja újra a `glab-note-as-ai.sh` a hívást, ha a GitLab 429-et ad. `0` = nincs újrapróbálás. Kimerülés után a glab eredeti hibáját és kilépőkódját adja vissza. |
| `GITLAB_RATE_LIMIT_BACKOFF_SECONDS` | `20` | Lineáris visszalépés alapja: az n-edik újrapróbálás előtt `n × ennyi` másodpercet vár (az alapértékkel 20, 40, 60, 80, 100 mp, összesen legfeljebb 5 perc). |
| `CODE_REVIEW_MAX_INLINE_COMMENTS` | `5` | A code-reviewer és a `gitlab-branch-review` legfeljebb ennyi soronkénti (inline diff) MR-kommentet/draft note-ot hoz létre egy review-körben: súlyosság szerint az első ennyi kap inline kommentet, a többi csak az összesítésben szerepel. `0` = csak az összesítés. Minden inline komment/draft külön kérés. |
| `TEST_ENV_DEPLOY_POLL_SECONDS` | `45` | Az `execute` A8 lépésében a deploy lefutására várakozó `glab ci status` ciklus két lekérdezése közti idő másodpercben. |
| `TEST_ENV_DEPLOY_WAIT_MINUTES` | `10` | Ugyanennek a ciklusnak a felső korlátja percben; ennyi után a lépés megáll és jelzi, hogy a deploy nem készült el, nem vár tovább. |

## Teszt-adat generálás

| Változó | Alapérték | Leírás |
|---|---|---|
| `TEST_DATA_DIR` | `test-data/` (repo gyökeréhez képest) | Ide kerülnek az `implementer` által generált minta-adatfájlok (lásd `implementer.md` "1b" lépés), ha az AC adatbevitelt/feltöltést/importot érint és a repóban még nincs erre már bevett konvenció (pl. a <LOGICAL_REPO_NAME> repóban a gyökérben lévő `<LOGICAL_REPO_NAME>_teszt_*.csv`/`.xlsx` fájlok — ha ilyen meglévő konvenciót talál, azt kövesse ez helyett). |

## Ticket-életciklus higiénia

| Változó | Alapérték | Leírás |
|---|---|---|
| `STUCK_TICKET_THRESHOLD_DAYS` | `3` | Az A4 pickup ezen a küszöbön túl változatlan, de nem `INITIAL_STATUS_NAME`/végállapotú (Done/Closed) ticketet tekinti "elakadtnak", és figyelmeztet rá — nem javítja automatikusan, csak felszínre hozza (lásd `execute/SKILL.md` A4). |
| `DESIGN_TICKET_CLOSE_STATUS` | `Closed` | A web-design és design-review ticketek **záró** státusza, amikor a rájuk épülő munka elkészült — **nem** `Done` (az a tényleges munkaticketeknek van fenntartva). Használja: `design-branch.md` B4 (web-design kész), és az `execute/SKILL.md` A8a utáni "kapcsolódó ticketek lezárása" lépés (design-review ticket, ha a rá épülő implementáció mergelve lett). |

## Design-előfutás (B8)

> ℹ️ **Bevezetve (COCALC-398, 4.19.0)** — a `../dev-workflow-execute/design-branch.md`
> B8 szakasza olvassa (10. indító mondat, "csináld meg előre az összes képernyőtervet").

| Változó | Alapérték | Leírás |
|---|---|---|
| `DESIGN_PREPASS_UNCERTAIN_CANDIDATES` | `ask` | A `design-branch.md` B8 gyűjtésénél az oldalnév nélküli, de UI-ra utaló jelöltek kezelése: `ask` (külön lista, a felhasználó dönt) vagy `skip` (csak kitöltött Oldalnév). Ismeretlen érték → `ask`. |
| `DESIGN_PREPASS_MAX_PAGES` | `10` | Egy előfutás-körben legfeljebb ennyi oldal készül (költségvédelem); a többi a következő körre marad. Hibás érték → `10`. |

## UX-designer (UX_*)

> ℹ️ **Bevezetve (COCALC-899, 4.21.0)** — a [`../ux-designer/SKILL.md`](../ux-designer/SKILL.md) skill és a [`../ux-designer/ux-designer.md`](../ux-designer/ux-designer.md) utasítássor
> olvassa (11–13. indító mondat). A változási keretet a
> [`scripts/ui-contract.js`](scripts/ui-contract.js) ellenőrzi, az [`../dev-workflow-execute/implementer.md`](../dev-workflow-execute/implementer.md)
> "3." lépése és a [`../dev-workflow-execute/design-branch.md`](../dev-workflow-execute/design-branch.md)
> B4a lépése használja.

| Változó | Alapérték | Leírás |
|---|---|---|
| `UX_DESIGN_PRINCIPLES_FILE` | `docs/design-principles.md` | A termékspecifikus design-elvek (szereplők, fő feladatok, kritikus pillanatok, vizuális alapok). Ha a fájl hiányzik, a ux-designer jelzi, és csak az általános rubrikával dolgozik. |
| `UX_OUTPUT_DIR` | `docs/ux` | Az audit-, redesign- és kritika-dokumentumok helye. |
| `UX_FRONTEND_DIR` | `frontend` | A frontend gyökere a változási keret osztályozásához (`ui-contract.js check-budget --frontend-dir`). |
| `UX_FRONTEND_APP_DIR` | `frontend/src/app` | Az alkalmazás forrása a UI-szerződés kinyeréséhez (`ui-contract.js extract --app-dir`). |
| `UX_BACKEND_DIR` | `backend` | A backend gyökere. A kinyerés itt keresi a `*Controller.java` végpontokat, a keret-ellenőrzés minden itteni változást T3-nak vesz. |
| `UX_DESIGN_TOKENS_FILE` | `frontend/src/styles/_design-tokens.scss` | A design-tokenek forrásfájlja (SCSS-változók vagy CSS custom property-k). |
| `UX_AUDIT_TARGET` | `local-dev-server` | Az audit célpontja: `local-dev-server`, `test-env` (a `TEST_ENV_URLS` frontend-URL-je) vagy egy `http(s)://` URL. Ismeretlen érték → `local-dev-server`, jelzéssel. |
| `UX_AUDIT_VIEWPORTS` | `1440x900,768x1024,375x812` | Az audit és a `live` kritika viewportjai (szélesség×magasság, vesszővel elválasztva). |
| `UX_MAX_FINDINGS` | `15` | Egy riport legfeljebb ennyi találatot tartalmaz; a többi összevonva vagy a "Mérlegelt, de elvetett" táblában. Hibás érték → `15`. |
| `UX_CRITIQUE_GATE` | `advisory` | A B4a UX-kritika: `off` (nem fut), `advisory` (fut, az eredmény a design-review ticketbe kerül, nem állít meg), `blocking` (Block verdiktnél egy automatikus `figma-designer` `revise` kör, utána újra-kritika). Ismeretlen érték → `advisory`. |
| `UI_CHANGE_BUDGET_DEFAULT` | `free` | Ez érvényes, ha a ticketen nincs "UI-változás kerete" mező. A `free` a mai viselkedést tartja meg (nincs keret-ellenőrzés). A redesignból született ticketek mindig explicit keretet kapnak. Ismeretlen érték → `free`, jelzéssel. |
| `UI_CHANGE_BUDGET_BASE` | `origin/master` | A keret-ellenőrzés git-bázisa (a merge-base ehhez képest számolódik). |

### UI_CHANGE_BUDGET értékek

A ticket "UI-változás kerete" mezője azt mondja meg, meddig nyúlhat az implementáció. A
szinteket a `ui-contract.js` gépileg sorolja be; bizonytalan esetben a magasabb szintre.

| Keret | Megengedett szint | Mit enged |
|---|---|---|
| `template-only` | T0 | `*.html`, `*.scss`/`*.css`, asset, komponens-metaadat (`imports`, `templateUrl`, `styleUrl`), `*.spec.ts`. Meglévő publikus tagra köt. |
| `thin-ts` | T0–T1 | + új prezentációs tag inject nélkül, új prezentációs komponens, útvonal-változás, TS-beli szöveg-literál. |
| `logic` | T0–T2 | + meglévő tag módosítása/törlése, új service-függés, service/modell/segéd-TS, új függőség. |
| `free` | T0–T3 | + backend/API. Nincs keret-ellenőrzés. |

**Fallback-szabály**: hiányzó sor → a fenti alapérték, csendben; ismeretlen enum-érték →
az alapérték, egysoros jelzéssel. A skill nem akad el.

## Epic-mód (E-ág)

> ℹ️ **Bevezetve (4.23.4, az ordoviii-ben fejlesztve)**: a 14. belépési pont („csináld meg az
> `<EPIC-KULCS>` epicet storynként”) egy teljes epicet visz végig: storynként branch →
> implementáció → helyi kapu → push + MR → zöld pipeline → code review → **merge** → a következő
> story a friss alap branch-ről; a független storyk párhuzamosan, külön worktree-ben. A lépések:
> [`../../../.claude/skills/dev-workflow-execute/epic-mode.md`](../../../.claude/skills/dev-workflow-execute/epic-mode.md); a szkriptek:
> [`../../../.claude/skills/dev-workflow-execute/scripts/epic-worktree.sh`](../../../.claude/skills/dev-workflow-execute/scripts/epic-worktree.sh),
> [`../../../.claude/skills/dev-workflow/scripts/merge-as-ai.sh`](../../../.claude/skills/dev-workflow/scripts/merge-as-ai.sh) és [`../../../.claude/skills/dev-workflow/scripts/wait-for-mr-sha.sh`](../../../.claude/skills/dev-workflow/scripts/wait-for-mr-sha.sh).
> Egy story belseje a batch-út (`STORY_BATCH_MODE=on`). A kapcsolók nem thoroughness-profil-függők,
> ezért nincsenek a preset-táblában; egy futásra az azonos nevű környezeti változó vagy a
> felhasználó mondata („…storynként jóváhagyással”, „…sorban, párhuzamosítás nélkül”) felülbírálja.
> A `-` érték „nincs beállítva”-t jelent.
> **Codex-port:** az E-ág csak a Claude-workflow-ban van; a Codex `execute` portjában nincs
> batch-mód, ezért E-ág sincs. A kulcsok itt a két config egyezése miatt vannak.

| Kapcsoló | Érték | Jelentés |
|---|---|---|
| `EPIC_APPROVAL_MODE` | `upfront` | A megállási pontok, lásd lent „EPIC_APPROVAL_MODE értékek”. |
| `EPIC_PARALLEL_MODE` | `parallel` | A párhuzamosság, lásd lent „EPIC_PARALLEL_MODE értékek”. |
| `EPIC_MAX_PARALLEL` | `2` | Egyszerre legfeljebb ennyi story-kör (worktree-slot) fut. `serial` módban figyelmen kívül marad (1). A GitLab-API terhelés és a helyi gép (függőség-telepítés, dev-szerver, adatbázis) miatt 3 fölé ne emeld. |
| `EPIC_LOCAL_LLM_CONCURRENCY` | `1` | Egyszerre legfeljebb ennyi helyi LLM-hívás (`call-local-model.sh`: `local` szintű `implementer` / `qa-tester`) futhat az epic-futásban; a többi sorban vár, a felhős subagentek ettől függetlenül párhuzamosak (`EPIC_MAX_PARALLEL`). Csak akkor emeld, ha a helyi gép több modellpéldányt is elbír. |
| `EPIC_ON_STORY_FAILURE` | `continue-independent` | Egy story megállásakor: `continue-independent` — a tőle függő storyk kimaradnak, a többi fut tovább; `stop-epic` — a még nem indult storyk nem indulnak. |
| `EPIC_BASE_BRANCH` | `master` | Az alap branch, amiről a worktree-k indulnak, és ahova a merge megy (egyezzen a `REPO_MAP` alap branchével). |
| `EPIC_WORKTREE_ROOT` | `..` | A worktree-k szülőmappája, a fő munkafához képest (vagy abszolút útvonal); a worktree neve `<repó>-wt<slot>`. |
| `EPIC_WORKTREE_SETUP_CMD` | `-` | Az új worktree-ben egyszer lefutó előkészítő parancs (függőség-telepítés), `sh -c`-vel a worktree gyökerében. `-` = nincs. |
| `EPIC_REBASE_CHECK_CMD` | `-` | Az E6 merge-sorban a branch frissítése (merge vagy rebase, `EPIC_REFRESH_MODE`) után, push előtt futó gyors ellenőrzés a worktree-ben; hibánál a story megáll. `-` = nincs (csak a CI dönt). |
| `EPIC_TEST_ENV` | `skip` | Az A8 teszt-env lépés storynként: `skip` — kimarad (a teszt-környezet jellemzően az alap branch-ről deployol, merge után); `run` — a mai A8 fut. |
| `EPIC_MERGE_REMOVE_SOURCE_BRANCH` | `true` | A `merge-as-ai.sh` merge után törli-e a távoli forrásbranchet. |
| `EPIC_SHA_WAIT_SECONDS` | `300` | Push után legfeljebb ennyi másodpercig várja a `wait-for-mr-sha.sh`, hogy az MR head-pipeline-ja a frissen pusholt SHA-ra jöjjön létre (a lekérdezési időköz a `PIPELINE_GATE_POLL_SECONDS`). Timeout esetén a story a `PIPELINE_GATE_ON_TIMEOUT` szerint jár el. |
| `EPIC_SERIAL_PATHS` | `-` | Szóközzel elválasztott útvonal-minták (a repó sémái, migrációi): ha két story terve közös fájlt érint ezekből, nem futnak párhuzamosan. A lockfájlok, a gyökér build-manifest, a `CLAUDE.md` / `AGENTS.md` és a CI-fájl ettől függetlenül mindig soros. `-` = csak a beépített lista. |
| `EPIC_STORY_HOST` | `main` | Ki vezeti egy story körét (munkafa → sub-taskok → helyi kapu → MR → pipeline → review → `review` státusz), lásd lent „EPIC_STORY_HOST értékek”. |
| `EPIC_REFRESH_MODE` | `merge` | Az E6 merge-sorban hogyan frissül a branch, ha közben mozdult az alap branch, lásd lent „EPIC_REFRESH_MODE értékek”. |
| `EPIC_PORT_STEP` | `10` | `isolated` módban a slotonkénti port-eltolás: a `<slot>`. worktree portjai `+ slot × ennyi`. |
| `EPIC_ISOLATED_PORTS` | `-` | `isolated` módban az eltolandó portok `NÉV=alapport` alakban. Az `epic-worktree.sh` a worktree `.env`-jében minden `:<port>` / `=<port>` előfordulást eltol, és a `NÉV=<új port>` sorokat is beírja; ezeket a repó compose-fájlja és dev-szerver configja olvashatja (alapértékük a mai port). `-` mellett az `isolated` mód hibával megáll. |

### EPIC_APPROVAL_MODE értékek

| Érték | Jelentés |
|---|---|
| `upfront` *(alap)* | **Egy** jóváhagyás az elején (E3): a storyk sorrendje, a párhuzamos hullámok és storynként a terv. Az „igen” lefedi az A6 terv-jóváhagyásokat és a merge-eket; utána az E-ág csak a megállási pontoknál áll meg (piros pipeline vagy blocker review-találat a javítókör után, rebase-ütközés, a tervtől eltérő implementáció). |
| `per-story` | Az elején csak a sorrend és a hullámok jóváhagyása; az A6 terv-jóváhagyás storynként megmarad, a merge autonóm. |
| `pre-merge` | Mint `upfront`, de minden story merge-e előtt (zöld pipeline és review után) megáll egy „mergeljem?” kérdéssel. |

### EPIC_PARALLEL_MODE értékek

| Érték | Jelentés |
|---|---|
| `parallel` *(alap)* | A független storyk (E2 hullám, ütközés-becsléssel) párhuzamosan, saját worktree-ben implementálódnak (legfeljebb `EPIC_MAX_PARALLEL`). A **helyi kapu sorban fut** (közös teszt-adatbázis és dev-szerver-port), a push és a CI ismét párhuzamos. A merge mindig sorban megy: rebase a friss alap branch-re, új zöld pipeline, aztán merge. |
| `isolated` | Mint `parallel`, de minden worktree saját portokat és compose-projektet kap (`EPIC_ISOLATED_PORTS`, `EPIC_PORT_STEP`, saját `COMPOSE_PROJECT_NAME`), ezért a helyi kapuk is párhuzamosan futhatnak. A repó compose-fájljának és dev-szerverének env-ből kell olvasnia a portokat. |
| `serial` | Egyszerre egy story: worktree a friss alap branch-ről → teljes kör → merge → a következő. A legkisebb kockázat, a leglassabb futás. |

### EPIC_STORY_HOST értékek

> ℹ️ **Bevezetve (ORD-365, 4.25.0)**, az ORD-2 epic-futás kísérlete alapján. A felosztás és a
> story-runner feladatleírása: [`../../../.claude/skills/dev-workflow-execute/story-runner-brief.md`](../../../.claude/skills/dev-workflow-execute/story-runner-brief.md).
> **Codex-port:** csak a Claude-workflow-ban (az E-ág itt nincs), a kulcs a két config egyezése miatt van itt.

| Érték | Jelentés |
|---|---|
| `main` *(alap)* | A mai viselkedés: a story körét a fő szál vezeti (`epic-mode.md` E4–E6). |
| `subagent` | Storyként egy **story-runner** subagent viszi a kört (munkafa, branch, In Progress, sub-taskonként az implementáció a helyi lépésekkel, helyi kapu, push + MR, pipeline, code review, javító körök, `review` státusz) — **merge nélkül**. A fő szálon csak a tervfrissítés, az indítás, az eredmény független ellenőrzése, a merge, a lezárás és az epic-állapot marad. |

### EPIC_REFRESH_MODE értékek

> ℹ️ **Bevezetve (ORD-370, 4.26.0)**, az ORD-2 epic-futás tapasztalata alapján: az auto mód a
> force pusht letiltja, ezért a rebase utáni `--force-with-lease` push nem futott le.

| Érték | Jelentés |
|---|---|
| `merge` *(alap)* | `git merge --no-commit --no-ff origin/<alap>`, a merge-commit az AI-identitással (`commit-as-ai.sh`), utána fast-forward push — **force push nélkül**. Ütközésnél `git merge --abort`, a story megáll. A branch története merge-commitot kap; a végső merge (merge-commit, nem squash) ezt változatlanul viszi. |
| `rebase` | A korábbi viselkedés: `git rebase origin/<alap>`, utána `push-as-ai.sh <branch> --force-with-lease`. Ütközésnél `git rebase --abort`, a story megáll. Lineáris történet, de force push kell. |

**Fallback-szabály**: ismeretlen/elgépelt `EPIC_*` érték → visszaesés a fenti alapértékre,
egysoros jelzéssel; az E-ág nem akad el emiatt.

## Helyi végrehajtó (LOCAL_EXECUTOR_HOST)

> ℹ️ **Bevezetve (ORD-365, 4.25.0).** **Codex-port: csak a Claude-workflow-ban.** A Codex
> `execute` portjában nincs `local` szintű fázis-bekötés és nincs `local-runner` agent; a
> kulcsok itt a két config egyezése miatt vannak (a lemaradás dokumentált, nem pótolt). A
> részletek: [`../../../.claude/skills/dev-workflow/config.md`](../../../.claude/skills/dev-workflow/config.md)
> „LOCAL_EXECUTOR_HOST értékek” és [`../../../.claude/agents/local-runner.md`](../../../.claude/agents/local-runner.md).

| Kapcsoló | Érték | Jelentés |
|---|---|---|
| `LOCAL_EXECUTOR_HOST` | `main` | Ki vezérli a `local` szintű lépéseket: `main` — a fő szál (a mai viselkedés); `subagent` — a `local-runner` subagent (a helyi modell elérhetetlenségekor megáll, nem esik csendben Claude-ra). |
| `LOCAL_RUN_DIR` | `../{repo}-local-run` | A futás munkamappája (task, prompt, válasz, terv, `local-stats.md`, `run-notes.md`), a fő munkafán kívül. |
| `LOCAL_CONVENTIONS_FILE` | `{task_dir}/conventions.md` | A repó konvenciói a helyi modellnek (`build-prompt.js`); repófüggő tartalom, a csomag nem szállítja. |
| `LOCAL_FORMAT_CMD` | `-` | Formázás a kiírt fájlokra (`{files}`); `-` = a repó `CLAUDE.md` / `AGENTS.md` parancsa. |
| `LOCAL_CHECK_CMD` | `-` | A commit előtti ellenőrzés; `-` = a repó `CLAUDE.md` / `AGENTS.md` parancsai. |
| `LOCAL_CHECK_DB_CMD` | `-` | Ellenőrzés DB-t érintő lépésnél; `-` = a repó integrációs teszt-parancsa, ha van. |

## CI-készenlét (CI_READINESS_*)

Egyszeri ellenőrzés a `scripts/check-ci-readiness.sh`-val (a `.claude` fában is megvan): runner és CI-tag, védett branch-minták, compute-perc keret. A részletek: `.claude/skills/dev-workflow/config.md` „PIPELINE_GATE_* kapcsolók”.

| Kapcsoló | Érték | Jelentés |
|---|---|---|
| `CI_READINESS_CHECK` | `on` | Egyszeri CI-készenlét ellenőrzés a [`scripts/check-ci-readiness.sh`](scripts/check-ci-readiness.sh)-val: `on` — a bootstrap és a `dev-workflow-execute` 0. lépése futtatja; `off` — nem fut, a szkript maga is kilép egy „kikapcsolva” sorral. |
| `CI_READINESS_CHECKED` | `-` | Az ellenőrzés utolsó hibátlan lefutásának dátuma (`ÉÉÉÉ-HH-NN`), a `dev-workflow-execute` 0. lépése írja be. `-` = még nem futott: ilyenkor a 0. lépés lefuttatja. |
| `CI_READINESS_MINUTES_LIMIT` | `auto` | A megosztott runnerek havi compute-perc kerete a figyelmeztetéshez. `auto` — a `namespaces/<id>` válasz `shared_runners_minutes_limit` értéke, ha van és > 0; ha nincs, és a csoport `plan`-je `free`, akkor 400; egyébként a keret ismeretlen (egy `OK` info-sor, nincs figyelmeztetés). Szám — explicit keret (percben); `0` — nincs korlát. |

A `check-ci-readiness.sh` a `REPO_MAP` minden repójára három dolgot néz (csak olvas, `glab api` GET): (1) van-e online, nem szüneteltetett runner, amely a `.gitlab-ci.yml` tagjeit felveheti (saját runnernél a `default: tags` kötelező); (2) ha a runner csak védett refeken fut (`ref_protected`), védettek-e a `<TICKET_NATURE_TAGS>/*` branch-minták és az alap branch; (3) megosztott runnernél elfogyott-e a csoport havi compute-perc kerete (80% fölött figyelmeztet; a keretet a `CI_READINESS_MINUTES_LIMIT` adja, ismeretlen keretnél nincs figyelmeztetés). `HIBA` (1-es kilépőkód) a hiányzó tag vagy védett minta, a nem lekérdezhető adat csak `FIGYELMEZTETÉS`; a javítási parancsokat kiírja, de soha nem futtatja. A szükséges branch-minták forrása a `TICKET_NATURE_TAGS` (`<jelleg>/*`) és az alap branch; egy szűkebb védett minta (pl. `feature/ORD-*`) nem fedi le a `feature/*`-ot, ezért a szkript konzervatívan `HIBA`-t ad rá.

## Teszt-environment

`TEST_ENV_URLS` — a `qa-tester` subagent teszt-env módban ezeket böngészi végig.

> ⚠️ **Fontos, gyakran téves feltevés**: a `TEST_ENV_URLS` alatti URL **nem feltétlenül**
> frissül automatikusan minden push-ra — ez a `TEST_ENV_MR_DEPLOY_MODE` értékétől függ
> (lásd lent). Mielőtt az A8 lépés meghívná a `qa-tester`-t, mindig ellenőrizni kell,
> hogy a cél tényleg a jelenlegi branch-et tükrözi-e, ne csak feltételezni.

| Logikai név | URL | `TEST_ENV_MR_DEPLOY_MODE` |
|---|---|---|
| `<LOGICAL_REPO_NAME>` | `<TEST_ENV_URL>` | `<TEST_ENV_MR_DEPLOY_MODE>` — a konkrét deploy-viselkedést lásd a lenti `TEST_ENV_MR_DEPLOY_MODE` értéktáblában. |

`TEST_ENV_MR_DEPLOY_MODE` lehetséges értékei, és mit jelentenek az A8 lépés számára:
- **`auto`** — a CI-projekt úgy van beállítva, hogy MR/feature-branch push-ra is
  automatikusan deploy-ol egy, a branch-hez tartozó (vagy legalább a legutóbbi push-t
  tükröző) környezetbe. Ilyenkor A8 elég, ha a legutóbbi releváns CI pipeline
  sikeres lefutását ellenőrzi, mielőtt tesztel.
- **`manual`** — a deploy-t valakinek (embernek
  vagy a skillnek, explicit jóváhagyással) kézzel kell elindítania a jelenlegi MR
  pipeline-on, különben a cél URL nem a branch friss állapotát mutatja.
- **`none`** — nincs is MR-szintű/test-env deploy konfigurálva ebben a repóban; az A8
  lépés ilyenkor nem futtatható értelmesen, amíg ez nem változik (csak A7 lokál +
  code review ad automatikus lefedettséget merge előtt).

## Design-review ciklus (B ág)

A design-review ticket Jira issue type-ja (`design-review`) és a web-design ticket
issue type-ja (`web-design`) a fenti "Jira issue type-ok" szekció `JIRA_ISSUE_TYPE_MAP`
táblázatában van, itt nincs külön változóként megismételve.

| Változó | Alapérték | Leírás |
|---|---|---|
| `FIRST_REVIEW_REQUESTED_STATUS` | `first_review_requested` ✅ | Első kör után beállított Jira státusz. |
| `FIRST_REVIEW_DONE_STATUS` | `first_review_done` ✅ | Ezt a felhasználó állítja be kézzel, ha megnézte az első kört. |
| `SECOND_REVIEW_REQUESTED_STATUS` | `second_review_requested` ✅ | Második (utolsó automata) kör után beállított státusz. |
| `SECOND_REVIEW_DONE_STATUS` | `second_review_done` ✅ | Ezt is a felhasználó állítja kézzel — ezután nincs több automata Figma-kör. |
| `FIGMA_FILE_REF` | `<FIGMA_FILE_REF_VALUE>` | A design system + oldaltervek Figma fájlja. |

**Tényleges Jira átmenet-gráf** (mért, nem feltételezett — API-val ellenőrizve; a teljes
nyomozás: [`history.md`](history.md)). A `To Do` a fenti `INITIAL_STATUS_NAME` jelenlegi
értéke — a gráf innen olvasandó, ha az érték változik:

- `INITIAL_STATUS_NAME` (`To Do`) → csak `In Progress`.
- `In Progress`-ből egymástól függetlenül elérhető: `review`, `first_review_requested`,
  `second_review_requested`, és `Done` is — a workflow saját sorrendjét **kizárólag a
  skill-logika tartja be**, Jira nem kényszeríti ki.
- `review` → `Done`.
- `first_review_requested` → csak `first_review_done`.
- 🛑 `first_review_done` → **nincs közvetlen** út `second_review_requested`-be — előbb
  vissza `In Progress`-be, onnan tovább. (Ha `getTransitionsForJiraIssue` innen nem
  listázza, ez NEM azt jelenti, hogy nem létezik, csak innen nem érhető el egy hopban.)
- `second_review_requested` → `second_review_done`.
- `second_review_done`-ból nincs dedikált "Done", csak a globális `Closed`.
- `createJiraIssue` mindig `To Do`-ban hoz létre — a célállapotot **mindig külön**
  `transitionJiraIssue` hívás(ok) érik el utólag (B4: 1 hop, B5: 2 hop — ez már át van
  vezetve a [`design-branch.md`](../dev-workflow-execute/design-branch.md) B4/B5
  lépéseibe).

> ✅ **A korábbi "ismert rés" javítva** (a teljes eredeti leírásért lásd
> [`history.md`](history.md)): az A4 pickup mostantól külön JQL-lel jelzi az elakadt
> ticketeket (`STUCK_TICKET_THRESHOLD_DAYS`); az `execute/SKILL.md` A8a utáni "8c —
> kapcsolódó ticketek lezárása" lépés lezárja a szülő Story-t, ha minden gyereke kész,
> és a design-review/web-design ticketeket is a `DESIGN_TICKET_CLOSE_STATUS`-ra állítja.
> A "work is done and merged" tranzíció ID inkonzisztenciája továbbra is fennáll (ez
> Jira-oldali workflow-sajátosság, nem javítható a skill oldaláról) — ezért minden
> érintett lépés `getTransitionsForJiraIssue`-val ellenőrzi az aktuális ID-t, sosem
> hardcode-olja. A `review`→`Done` automatizálásra lásd a `JIRA_AUTO_DONE_ON_MERGE`
> flaget és a [`jira-automation-setup.md`](jira-automation-setup.md) 1. pontját.

### Oldalnév-konvenció (design ↔ implementáció összekötés)

A Figma-oldalterv és a hozzá tartozó Jira ticket(ek) **névegyeztetéssel** vannak
összekötve, nem csak linkkel:

1. Amikor a `figma-designer` subagent létrehoz egy oldaltervet, a Figma frame/szekció
   nevét **pontosan** a ticket infobox `oldalnév` mezőjével egyezően állítja be — több szó
   esetén `PAGE_NAME_SEPARATOR`-ral összefűzve (pl. `checkout_summary`).
2. Ez az `oldalnév` mező bekerül a design-review ticket fejlécébe, és ha van hozzá
   kapcsolódó FE implementációs ticket (FE/BE split vagy már létező pickup-olt ticket),
   arra is rá kell írni/kommentelni.
3. Az `implementer` subagent design-linkelt ticketnél **elsődlegesen ez alapján a név
   alapján** keresi meg a Figma fájlban a megfelelő frame-et (Figma MCP keresés), a mentett
   link csak másodlagos/kényelmi hivatkozás.

## Hogyan hivatkozz erre a fájlra más skillekből

A skillek és subagentek a saját `## Konfiguráció` szekciójukban sorolják fel az általuk olvasott
kulcsokat, és **a rövid `config.md`-t** olvassák be először (`../dev-workflow/config.md` a
skill-mappákból, `../skills/dev-workflow/config.md` az agent-mappából). Egy kulcs jelentésére ennek a
fájlnak a szakaszcímével hivatkoznak — pl. „lásd `config-reference.md` "### LOCAL_GATE_MODE értékek"” —,
és csak azt a szakaszt olvassák be. A subagentnek a hívó adja át a releváns értékeket a promptban; az
agent a `config.md`-t csak akkor olvassa be, ha egy érték hiányzik a promptból.
