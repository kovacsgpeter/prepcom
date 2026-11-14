---
name: dev-workflow-execute
description: >
  A dev-workflow rendszer végrehajtó állapotgépe, több belépési ponttal: ticket-pickup és
  implementálás ("vedd magadhoz a soron következő ticketet"); teszt-env ellenőrzés
  folytatása ("folytasd a 8-tól"); design-review kör ellenőrzése ("lereviewztem-e a
  design terved"); implementáció jóváhagyott design ticketből; review-kommentek
  feldolgozása ("dolgozd fel a review kommentjeimet"); batch-pickup egy Story
  minden sub-taskjára ("vedd magadhoz a következő storyt gyorsmódban",
  `STORY_BATCH_MODE=on`); design-előfutás az összes design-érintett ticketre
  ("csináld meg előre az összes képernyőtervet"); vagy egy teljes epic végigvitele
  storynként, merge-dzsel és párhuzamos worktree-kkel ("csináld meg az <EPIC> epicet
  storynként", E-ág). Mindegyik ugyanazt a Jira-állapot
  vezérelt folyamatot viszi tovább. A kanonikus parancslista a `../dev-workflow/config.md` "Indító parancsok"
  táblázatában van.
---

# dev-workflow — execute (2–6. belépési pont)

## Konfiguráció

Olvasd be **először mindig** [`../dev-workflow/config.md`](../dev-workflow/config.md)-t (rövid, csak értékek; egy kulcs jelentése a [`../dev-workflow/config-reference.md`](../dev-workflow/config-reference.md) azonos című szakaszában — csak azt a szakaszt olvasd be, a referenciát egészben soha). Ez a skill és az általa
hívott subagentek ([`implementer.md`](../../agents/implementer.md), [`qa-tester.md`](../../agents/qa-tester.md),
[`code-reviewer.md`](../../agents/code-reviewer.md), [`figma-designer.md`](../../agents/figma-designer.md),
[`retry-and-escalation.md`](retry-and-escalation.md),
[`tracker-adapter.md`](tracker-adapter.md)) a config összes változóját
használhatják — ne találgass repo path-ot, assignee nevet, branch-mintát, státusznevet
vagy URL-t, mindig onnan olvasd. Külön figyelj a `TICKET_NATURE_TAGS` (branch-névhez való
"jelleg") és a `JIRA_ISSUE_TYPE_MAP` (a ticket létrehozásakor/frissítésekor ténylegesen
beállítandó Jira issue type) megkülönböztetésére — ez a két dolog nem ugyanaz. Az
"AI-identitás" szekció adja a commit/push/review-komment szerzőségét (lásd A7a, 9.
lépés, [`../../agents/implementer.md`](../../agents/implementer.md)) — ne sima `git commit`/`git push origin`/`glab mr note create`-tel
csináld ezeket, hanem a config.md-ben felsorolt `commit-as-ai.sh`/`push-as-ai.sh`/
`glab-note-as-ai.sh` szkriptekkel. A "PIPELINE_GATE_* kapcsolók" szakasz
(`PIPELINE_GATE_BLOCKING_JOBS`/`_POSITION`/`_ON_RED`/`_ON_TIMEOUT`/`_TIMEOUT_MINUTES`)
adja a lenti "7a1"/"9a" pipeline-eredmény kapu (GATE-1, `wait-for-pipeline.sh`) viselkedését.
A "### LOCAL_GATE_MODE értékek" / "### LOCAL_GATE_BROWSER_TARGET értékek" szakasz
(`LOCAL_GATE_MODE`, `LOCAL_GATE_BROWSER_TARGET`) adja a lenti **A7 helyi AC-ellenőrzés
kapu** (GATE-2) viselkedését — mit és hol futtat a lokál kapu, illetve hogy `none` alatt
teljesen kimarad-e (feltétel nélküli push + MR). Feloldásuk a COCALC-216 preset-tábla
olvasási konvenciója szerint: `WORKFLOW_PROFILE` → explicit felülírás → preset-tábla;
fallback `full` / `local-dev-server`.

**Subagent-híváskor** (implementer, qa-tester, code-reviewer, architect, figma-designer,
ux-designer, local-runner, story-runner) a hívott agent „Releváns változók” / `## Konfiguráció` listájában
szereplő kulcsok feloldott értékeit add át a prompt elején egy `Konfiguráció:` blokkban, soronként
`KULCS=érték` alakban. Az agent ilyenkor nem olvassa be újra a `config.md`-t (csak egy a blokkból
hiányzó kulcsért), és a `config-reference.md`-t is csak célzottan, szakaszonként.

A "### STORY_BATCH_MODE értékek" szakasz (`STORY_BATCH_MODE` = `off` | `on`) adja, hogy az
A-ág **egy darab ticketet** dolgoz-e fel körönként (`off`, a mai viselkedés), vagy egy
**szülő Story-t + minden nyitott sub-taskját együtt**, egyetlen implementációs körben
(`on`) — lásd lent az "A-ág — Batch mód" szakaszt és az A4/A5/A5a/A6/A7/7a/7a1/7b/9/9a/A8a
lépések "batch módban" bekezdéseit. Feloldása ugyanaz a COCALC-216 konvenció: `WORKFLOW_PROFILE` →
explicit felülírás → preset-tábla; fallback `off`. A 8. indító mondat ("vedd magadhoz a
következő storyt gyorsmódban") erre a futásra explicit `on`-t jelent.

## 0. Lépés — környezet-ellenőrzés

> 📊 Lépés eleje: hívd meg a `mcp__ccd_session__mark_chapter` tool-t
> `dev-workflow-execute / 0 — Környezet-ellenőrzés` címkével (ha a tool nem elérhető,
> hagyd ki és folytasd — lásd `../dev-workflow/config-reference.md` "Session-cost-report" szakasza).

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
| 8 | "vedd magadhoz a következő storyt gyorsmódban" | **Pickup (A4)**, ugyanoda, de erre a futásra `STORY_BATCH_MODE=on` explicit felülírással — a szülő Story + minden nyitott sub-taskja egy körben (lásd "A-ág — Batch mód"). Közeli parafrázis is elég ("…egyben", "…egy körben"). |
| 3 | "folytasd a 8-tól" | **A8** — teszt-env ellenőrzés egy már pusholt ticketnél |
| 4 | "nézd meg, hogy lereviewztem-e a design terved" | [`design-branch.md`](design-branch.md) **B6** — design-review-check |
| 5 | "workflow-t folytasd implementációval" | [`design-branch.md`](design-branch.md) **B7 → A5** — implementáció indítása jóváhagyott design ticketből |
| 6 | "dolgozd fel a review kommentjeimet" | [`review-feedback.md`](review-feedback.md) **R1** — review-státuszú ticket emberi visszajelzéseinek feldolgozása, végén vissza **A7**-re |
| 14 | "csináld meg az `<EPIC-KULCS>` epicet storynként" | [`epic-mode.md`](epic-mode.md) **E1** — epic-mód: storynként branch → batch-kör → push + MR → zöld pipeline → review → **merge** → a következő story a friss masterről; független storyk párhuzamosan, worktree-ben (`EPIC_*` kapcsolók). Közeli parafrázis is elég ("vidd végig az epicet"). |
| 10 | "csináld meg előre az összes képernyőtervet" | [`design-branch.md`](design-branch.md) **B8** — design-előfutás: az összes design-érintett ticket képernyőterve oldalnév szerint deduplikálva, jóváhagyás után sorosan B4 → B5, egyetlen megállással |

Ha a 3., 5. vagy 6. belépési pontnál nem derül ki a beszélgetésből, melyik ticketről van
szó, kérdezz rá a ticket kulcsára — ne találgass.

A (14) belépési pont az E-ágra indul: **először olvasd be az [`epic-mode.md`](epic-mode.md)
fájlt**, és onnan indulj (E1); a story-körökhöz onnan tér vissza ide, az A-ág lépéseire.

A (4), (5) és (10) belépési pont közvetlenül a B-ágra indul, a (6) pedig a
[`review-feedback.md`](review-feedback.md)-re — ezekben az esetekben **először olvasd be
a megfelelő fájlt**, onnan indulj a jelzett szakasszal (B6 / B7 / B8 / R1). A (2) és (3) pont
az A-ágon indul, a design-branch.md-t/review-feedback.md-t csak akkor kell beolvasni, ha
az A4 elágazás vagy a (6) pont oda irányít (lásd lent).

---

## A-ág — kód implementáció

### A-ág — Batch mód (STORY_BATCH_MODE)

> ℹ️ **Bevezetve (COCALC-328)**. Oldd fel a `config.md` `STORY_BATCH_MODE` értékét a
> COCALC-216 konvenció szerint (`WORKFLOW_PROFILE` → explicit felülírás → preset-tábla;
> fallback `off`). A 8. indító mondat ("vedd magadhoz a következő storyt gyorsmódban" vagy
> közeli parafrázisa) erre a futásra explicit `on`-t jelent, függetlenül a preset-tábla
> értékétől.

- **`off` (alap)**: ticketenként egyszer; a batch-megjegyzéseket hagyd figyelmen kívül.
- **`on`**: egy kör = **szülő Story + minden nyitott sub-taskja**. Az A4 előtt olvasd be a
  [`batch-mode.md`](batch-mode.md)-t, és minden lépésnél alkalmazd az ottani azonos nevű szakaszt.

### A4 — Pickup

> 📊 Lépés eleje: hívd meg a `mcp__ccd_session__mark_chapter` tool-t
> `dev-workflow-execute / A4 — Pickup` címkével (ha a tool nem elérhető, hagyd ki és
> folytasd).

- Ticket-lekérdezés a [`tracker-adapter.md`](tracker-adapter.md) "keresés" műveletével
  (Jira-leképezésben JQL): `assignee = <ASSIGNEE_FOR_PICKUP>
  AND status = "<INITIAL_STATUS_NAME>" AND labels = <CLAUDE_WORK_LABEL> AND labels not in (<WORKFLOW_FLAGGED_LABEL>)` (a `config.md`
  `INITIAL_STATUS_NAME` és `CLAUDE_WORK_LABEL` értékét behelyettesítve — jelenleg `To Do`
  és `claude` és `workflow-flagged`), priority szerint csökkenő sorrendben. A `labels = <CLAUDE_WORK_LABEL>`
  feltétel **kötelező** — lásd `config.md` "Jira label-rendszer" szekció: ez zárja ki a
  `codex`-nek vagy label nélkül hagyott ticketeket, még ha egyébként minden más
  feltételnek megfelelnének is. Az
   `AND labels not in (<WORKFLOW_FLAGGED_LABEL>)` feltétel is **kötelező**: a flaggelt
   (kézzel félretett) ticketet a workflow soha nem veheti fel (lásd `config.md` "Jira
   label-rendszer" — `WORKFLOW_FLAGGED_LABEL`). **Fallback**: ha a `WORKFLOW_FLAGGED_LABEL`
   sor hiányzik a `config.md`-ből (régi, még nem frissített telepítés), **hagyd el az
   egész `AND labels not in (...)` klózt** (ne tedd be üresen — `labels not in ()` Jira
   JQL 400) egy rövid egysoros jelzéssel; a flag-szűrés ilyenkor inaktív, de a pickup nem
   akad el.
- **Függőség előbb**: ha egy ticket "blocked by" kapcsolatban van egy másik, még nem Done
  ticketttel, azt hagyd ki — csak olyan ticketet válassz, aminek minden blokkoló függősége
  már lezárva. Az egyeztetett prioritásokon belül ez dönt a sorrendről (ez a felhasználó
  szándékos szervező ereje egy csokor ticketnél).
- Ha nincs egyetlen felvehető ticket sem (mind blokkolva, vagy nincs `INITIAL_STATUS_NAME`
  státuszú), jelezd ezt a felhasználónak és állj meg. **Ha a blokkolás az oka** (van
  `INITIAL_STATUS_NAME` státuszú ticket, de mindegyiknek van még nyitott blokkoló
  függősége): mutasd meg a **blokkolási láncot** — soronként, melyik ticketet melyik
  blokkolja ("blocked by" Jira-linkek mentén) —, és ha **kör** van benne (A blokkolja
  B-t, B blokkolja C-t, … végül visszamutat A-ra), nevezd meg a kört alkotó ticketeket.
- **Elakadt ticket ellenőrzés (mindig fusson le, a fenti pickuptól függetlenül)**: külön
  JQL-lel `assignee = <ASSIGNEE_FOR_PICKUP> AND labels = <CLAUDE_WORK_LABEL>
  AND labels not in (<WORKFLOW_FLAGGED_LABEL>) AND status
  not in ("<INITIAL_STATUS_NAME>", "Done", "Closed") AND updated <
  -<STUCK_TICKET_THRESHOLD_DAYS>d`. Itt is kötelező a `labels = <CLAUDE_WORK_LABEL>` szűrés
  (lásd `config.md` "Jira label-rendszer") — egy `codex`-nek szánt ticket elakadása nem
  ennek a workflow-nak a dolga. Kötelező a `labels not in (<WORKFLOW_FLAGGED_LABEL>)`
  kizárás is: a flaggelt ticketet "elakadt"-ként sem jelezzük (szándékosan félre lett
  téve) — a fenti fallback (hiányzó `WORKFLOW_FLAGGED_LABEL` sor → a klóz elhagyása
  jelzéssel) itt is érvényes. Találat esetén **ne javítsd automatikusan** (nem tudod,
  miért ragadt ott) — csak sorold fel a felhasználónak (kulcs, státusz, mióta
  változatlan), hogy döntsön.
- **Félkész Story ellenőrzés (mindig fusson le, a fenti pickuptól és az elakadt-ticket
  ellenőrzéstől függetlenül)**: külön JQL-lel `assignee = <ASSIGNEE_FOR_PICKUP> AND
  issuetype = Story AND status in ("Done", "Closed") AND labels = <CLAUDE_WORK_LABEL>
  AND labels not in (<WORKFLOW_FLAGGED_LABEL>)` — ugyanazok a label-szabályok, mint a
  fenti elakadt-ticket ellenőrzésnél: a `labels = <CLAUDE_WORK_LABEL>` szűrés
  **kötelező** (lásd `config.md` "Jira label-rendszer"), a
  `labels not in (<WORKFLOW_FLAGGED_LABEL>)` kizárás is **kötelező**, és ugyanaz a
  fallback érvényes, ha a `WORKFLOW_FLAGGED_LABEL` sor hiányzik a `config.md`-ből (hagyd
  el az egész `AND labels not in (...)` klózt, egysoros jelzéssel). Minden találatra
  kérd le a [`tracker-adapter.md`](tracker-adapter.md) "keresés" műveletével az összes
  sub-taskját, és nézd meg, van-e köztük **nyitott** (nem Done/Closed/`REVIEW_STATUS_NAME`
  státuszú). Ha igen, sorold fel: a szülő Story kulcsa + a nyitott sub-task(ok) kulcsa és
  státusza — **automatikus javítás nélkül**, a felhasználó dönt, mit tegyen (a workflow
  itt csak jelez, nem transitionál semmit). Ha egyetlen Done/Closed Story-nak sincs
  nyitott sub-taskja, ez a lépés **néma marad** — ne írj ki "minden rendben" sort minden
  pickupnál.
- **Elágazás**: ha a kiválasztott ticketnek van kitöltött "Oldalnév" mezője, de **még
  nincs jóváhagyott/lezárt design hozzá** (nincs `SECOND_REVIEW_DONE_STATUS` állapotú,
  hozzá linkelt design-review ticket) → olvasd be a [`design-branch.md`](design-branch.md)
  fájlt, és ugorj az ott leírt **B4**-re. Egyébként (pure backend, vagy már van
  jóváhagyott design) folytasd lent **A5**-tel — ilyenkor a design-branch.md-t nem kell
  beolvasnod. **Batch módban** ezt az elágazást a **szülő Story** "Oldalnév" mezőjére
  nézd (nem az egyes sub-taskokéra).

### A5 — Branch

> 📊 Lépés eleje: hívd meg a `mcp__ccd_session__mark_chapter` tool-t
> `dev-workflow-execute / A5 — Branch` címkével (ha a tool nem elérhető, hagyd ki és
> folytasd).

- A ticket jellege (`TICKET_NATURE_TAGS`) és a `REPO_MAP` alapján dőlj el, melyik repóban
  dolgozol (FE vagy BE bejegyzés a ticket project key-e vagy a ticket tartalma alapján —
  ha a ticket Sub-task egy FE/BE split szülő Story alatt, a saját tartalma dönt, nem a
  szülőé).
- **Munkafa-ellenőrzés előbb**: `git status` — ha van nem commitolt módosítás a jelenlegi
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
  `bash <ennek-a-skillnek-a-mappája>/scripts/create-feature-branch.sh <REPO_MAP-beli alap branch> <összeállított branch név>`.
  A [`scripts/create-feature-branch.sh`](scripts/create-feature-branch.sh) maga
  ellenőrzi a munkafa tisztaságát, checkoutolja + fast-forward-only pull-olja az alap
  branch-et, majd létrehozza/checkoutolja az új branch-et. Ha hibával leáll, **ne
  próbáld megkerülni** — állj meg és jelezd a felhasználónak.
- **Ticket → "In Progress"**: ha a `config.md` `JIRA_AUTO_INPROGRESS_ON_BRANCH` flag
  `true`, a Jira Automation ezt már elvégezte a branch létrehozásakor — csak a
  [`tracker-adapter.md`](tracker-adapter.md) "ticket beolvasása" műveletével ellenőrizd,
  hogy tényleg "In Progress"-ben van-e, és **csak akkor** hívd a "státuszváltás"
  műveletet, ha valamiért mégsem (fallback). Ha a flag `false`, hívd meg közvetlenül,
  mint eddig.
### A5a — Végrehajtó-szint meghatározása (komplexitás)

> 📊 Lépés eleje: hívd meg a `mcp__ccd_session__mark_chapter` tool-t
> `dev-workflow-execute / A5a — Végrehajtó-szint meghatározása` címkével (ha a tool nem
> elérhető, hagyd ki és folytasd).

> ℹ️ **Bevezetve (COCALC-273, MEAS-2), bővítve (COCALC-278, LOCAL-2)**. Ezt a lépést
> **egyszer, az execute-futás elején** futtasd le (itt, az A5 után, vagy — ha a B-ágra
> kerülsz A4-ből, mielőtt A5-öt egyáltalán elérnéd — a `design-branch.md` B4 elején, lásd
> ott), és a kapott térképet cache-eld a session hátralévő részére; ne futtasd le újra
> minden egyes subagent-hívás előtt.

- Hívd meg a [`tracker-adapter.md`](tracker-adapter.md) "komplexitás beolvasása"
  műveletét: olvasd ki a ticket leírásából a `Komplexitás` infobox-sort
  (lásd `tracker-adapter.md` "Művelet 4" — ideiglenes, egyszerű parse-mód, a
  determinisztikus szabály a jövőbeli COCALC-266 dolga) és a ticket Jira issue type-ját.
- Olvasd be a `config.md` `OFFLOAD_PROFILE`, `OFFLOAD_CLAMP_DIRECTION` és `LOCAL_PHASES`
  értékét (lásd `config-reference.md` "OFFLOAD_PROFILE és OFFLOAD_PHASE_MATRIX" és "LOCAL_PHASES") —
  ha nincs explicit felülírva, a szállított alapérték `off`/`up`/`implementer,repo-scanner`.
- Minden fázisra (`implementer`, `qa-tester`, `code-reviewer`, és — ha a ticket a B-ágon
  jár — `figma-designer`, és — ha a `config.md` `ARCHITECT_INTAKE` értéke nem `off` —
  `architect`) futtasd:
  `bash .claude/skills/dev-workflow/scripts/resolve-executor-level.sh --complexity <kiolvasott érték vagy üres> --phase <fázis> --issue-type <issue type> --offload-profile <OFFLOAD_PROFILE> --clamp-direction <OFFLOAD_CLAMP_DIRECTION> --local-phases <LOCAL_PHASES>`.
  Az eredmény (`local`/`haiku`/`sonnet`/`opus`) adja az adott fázis subagent-hívásának
  **hívásidejű modell-argumentumát** (lásd A6/A7/9. lépés és `design-branch.md` B4/B6) —
  **nem** a subagent-fájl `model:` frontmatterjét írod át, azok változatlanul maradnak
  (fallback szerepük van, lásd `config.md` "Modell-stratégia fázisonként"). A szkript a
  `COMPLEXITY_EXECUTOR_MAP` szerinti javaslatot az `OFFLOAD_PROFILE` mátrixa szerint
  engedett szint-halmazra clampeli, ha az kívül esne rajta (lásd `config.md`
  "OFFLOAD_PROFILE és OFFLOAD_PHASE_MATRIX" precedencia-lépései) — ezt is csendben
  fogadd el, a szkript sajátmaga jelez stderr-re, ha clampelt.
- Ha a `Komplexitás` mező hiányzik/érvénytelen, a szkript stderr-re figyelmeztet és
  `sonnet`-et ad vissza minden fázisra — ezt csendben fogadd el, **ne állj meg és ne
  kérdezz vissza**, ez a szándékos, biztonságos fallback (`config-reference.md` "Fallback-szabály").
- **Workflow-meta ticketnél** (`WORKFLOW_META_LABEL`) ez a lépés ugyanúgy lefut (az
  `implementer`/`code-reviewer` fázisokra van szükség, a `qa-tester`/`figma-designer`
  ilyenkor amúgy sem hívódik, lásd A7/A8 kivétele).
### A6 — Implementáció

> 📊 Lépés eleje: hívd meg a `mcp__ccd_session__mark_chapter` tool-t
> `dev-workflow-execute / A6 — Implementáció` címkével (ha a tool nem elérhető, hagyd ki
> és folytasd).

- **Minden `implementer`-hívásnál** (plan és execute módban is) add át hívásidejű modell-
  argumentumként az A5a-ban meghatározott `implementer` szintet — ez felülírja az
  `implementer.md` `model: sonnet` frontmatterjét erre a hívásra. Nem hozol létre külön
  agent-variánst, ugyanaz a subagent-fájl fut, csak más modellel.
- **`FIGMA_TOOLS_MISSING` az `implementer`-től (design-linkelt ticket):** a futás megáll,
  jelezd a felhasználónak egy sorban, és ne indíts kerülőutat (más agentet, becsült
  értékekkel dolgozó végrehajtást). A felhasználó a connector rendbetétele után kéri az
  újrafuttatást.
- **`implementer` szint `local`**: a lenti „közvetlen végrehajtás” és a terv-kör 4. lépése nem az `implementer`
  subagentet indítja — kövesd a [`local-execution.md`](local-execution.md) „A6” szakaszait (`LOCAL_EXECUTOR_HOST=subagent`
  mellett a [`local-runner`](../../agents/local-runner.md) végzi).
- **Döntsd el, kell-e terv-jóváhagyási kör előbb.** Triviális esetben (pl. javítókörben
  hívva egy már korábban jóváhagyott implementációhoz — lásd
  [`retry-and-escalation.md`](retry-and-escalation.md), ott sosem kell terv; vagy
  egyetlen AC-s, nyilvánvalóan egyfájlos módosítás) hagyd ki ezt és ugorj egyenesen a
  lenti "közvetlen végrehajtás"-ra. Minden más esetben (több AC, több fájlt/komponenst
  érintő ticket, vagy split nélküli, nagyobb Bug/Task ticket):
  - **`ARCHITECT_INTAKE` — ki készítse a tervet** (olvasd be a `config.md`
    `ARCHITECT_INTAKE` kapcsolóját, COCALC-216 olvasási konvenció szerint: explicit
    felülírás → preset-tábla → fallback `off`):
    - `off` *(alap)*: a lenti 1-4. lépés az `implementer` `plan` módjával megy,
      változatlanul (a mai viselkedés) — az `architect` nem indul.
    - `auto`: ha az A5a-ban feloldott `implementer` végrehajtó-szint `local`, a lenti 2.
      lépésben az `implementer` helyett az [`architect`](../../agents/architect.md)
      subagentet hívd — a kapott fájl-szintű lépéslista a "terv", ugyanúgy jóváhagyásra
      kerül, mint az `implementer` `plan`-kimenete. Minden más esetben (a feloldott
      `implementer` szint nem `local`) az `implementer` `plan` módja fut, mint `off`-nál.
    - `always`: a lenti 2. lépésben **mindig** az `architect` készíti a tervet, az
      `implementer` feloldott végrehajtó-szintjétől függetlenül.
    Az `architect` hívása is hívásidejű modell-argumentumot kap (az A5a-ban meghatározott
    `architect` szint — a `config.md` OFFLOAD_PHASE_MATRIX `architect` sora miatt ez
    sosem `local`) — **nem** az `architect.md` `model: sonnet` frontmatterjét írod át,
    ugyanúgy, mint a többi fázisnál.
  1. A hívás előtt kérdezd meg a [`tracker-adapter.md`](tracker-adapter.md) "terv
     beolvasása" műveletét — ha van már korábban jóváhagyott, mentett terv ehhez a
     tickethez, add át azt is bemenetként a terv-készítő subagentnek (a `plan` mód/az
     `architect` ez alapján dönti el, hogy a korábbi terv még érvényes-e, vagy újat kell-e
     készíteni — lásd [`../../agents/implementer.md`](../../agents/implementer.md) "0.
     `plan` mód"). Ha nincs mentett terv, ez csak annyit jelent, hogy a terv-kör az
     elejétől indul, ahogy eddig.
  2. Hívd meg a fenti elágazás szerinti terv-készítő subagentet — az `implementer`-t
     **`plan` móddal**, vagy az `architect`-et (nincs neki külön módja, mindig csak
     tervet ad).
  3. Mutasd meg a kapott tervet a felhasználónak, kérj rövid jóváhagyást ("mehet így,
     vagy módosítsunk?"). **Becslés (ORD-377)**: ha a `RUN_METRICS` (`config-value.sh RUN_METRICS off`)
     értéke `collect+estimate`, a mutatás előtt írd az architect válaszát ideiglenes fájlba, és
     futtasd: `node .claude/skills/dev-workflow/scripts/estimate-run.js --story <ticket> --features-file <json> --plan-file <ideiglenes terv> --out <LOCAL_RUN_DIR>/<ticket>-estimate.json --subtasks --warn-only`.
     A kimenetet a terv alá illeszd, azonos üzenetben. Batch módban is egyszer, a közös tervre,
     `--subtasks` kapcsolóval. Epic-módban `upfront` / `pre-merge` esetén az A6 kimarad, ott az
     E3 becslése érvényes. A hiba csak figyelmeztetés. Ha módosít, vidd vissza a visszajelzést, és — ha érdemi
     irányváltás — hívd meg újra ugyanazt a terv-készítő subagentet a pontosított
     bemenettel.
  4. Jóváhagyás után hívd meg az `implementer`-t **`execute` móddal**, átadva a
     jóváhagyott tervet is — függetlenül attól, hogy azt az `implementer` saját `plan`
     köre vagy az `architect` készítette.
  - **A jóváhagyott terv mentése** — miután a felhasználó jóváhagyta a tervet, de mielőtt
    az `execute`-hívás elindulna, hívd meg a [`tracker-adapter.md`](tracker-adapter.md)
    "terv mentése" műveletét (Jira-kommentként, a ott dokumentált fix
    `## Terv (jóváhagyva) — <SHA>, <dátum>` címsor-mintával) — csak utána indítsd az
    `implementer`-t `execute` móddal. Ez csak arra az ágra vonatkozik, ahol egyáltalán volt
    terv-kör (ha a terv-kör a fenti szabály szerint kihagyható volt, nincs mit menteni).
  - Ez a kör egy plusz subagent-hívást jelent, de az a cél, hogy rossz irányú
    implementációt (és az azt visszacsináló javítóköröket) előre kizárjunk — egy elkerült
    félrekanyarodás jellemzően többe kerülne, mint maga a terv-kör.
- **Közvetlen végrehajtás** (ha a fenti szerint kihagyható a terv-kör): hívd meg az
  `implementer` subagentet közvetlenül **`execute` móddal** a ticket
  ID-vel, AC-listával és a branch/repo hivatkozással.
### A7 — Helyi AC-ellenőrzés

> 📊 Lépés eleje: hívd meg a `mcp__ccd_session__mark_chapter` tool-t
> `dev-workflow-execute / A7 — Helyi AC-ellenőrzés` címkével (ha a tool nem elérhető,
> hagyd ki és folytasd).

- **Workflow-meta ticket kivétel**: ha a ticketen rajta van a `config.md`
  `WORKFLOW_META_LABEL` (`workflow-meta`), **hagyd ki ezt a teljes lépést** — nincs
  futtatható alkalmazás, amin a `qa-tester` AC-t ellenőrizhetne, a változás skill-/
  config-/sablon-Markdown. Az A6 commitjai után menj a **7a0 csomag-verzió kapun** át
  **7a**-ra (push + MR), onnan a **9. lépésre**. Ilyenkor a `LOCAL_GATE_MODE`-ot fel sem
  kell oldani — ez a kivétel az elsődleges; a `none` mód fogalmilag nem ütközik vele
  (mindkettő "A7 skip", csak más okból).
- **GATE-2 — lokál kapu mód feloldása** (nem `workflow-meta` ticketnél): oldd fel a
  `config.md` `LOCAL_GATE_MODE` és `LOCAL_GATE_BROWSER_TARGET` értékét (COCALC-216
  olvasási konvenció: `WORKFLOW_PROFILE` → explicit felülírás → preset-tábla; fallback
  `full` / `local-dev-server`), és ágazz el:
  - **`full`** *(alap)*: a lenti A7 pontosan a mai módon fut — `qa-tester` `local` hívás,
    majd 7a/7b.
  - **`fast`**: hívd a `qa-tester`-t `local` target móddal, és add át
    `LOCAL_GATE_MODE=fast`-ot (és a `LOCAL_GATE_BROWSER_TARGET` értékét). A subagent
    build + unit teszt + lint kört futtat (a lint **kötelező**, nem feltételes — hiányzó
    `lint` script blocker, lásd `qa-tester.md` 1. szakasz), dev-szervert/böngészőt nem
    indít. A vizuális AC-k ellenőrizetlenül maradnak — a `qa-tester` ezt tételesen visszajelzi, és
    ez a korlát a 7a-ra (MR-leírás) és a 9. code review körre is öröklődik. A zöld/piros
    kimenet kezelése onnantól ugyanaz, mint `full`-nál (7a / 7b).
  - **`none`**: az A7 **teljesen kimarad** — a `qa-tester`-t **meg sem hívod**. A 7a0
    csomag-verzió kapun át egyből a **7a**-ra mész: **push + MR-nyitás feltétel nélkül**
    (ma ez csak a "7a — zöld" ágon történik). Push **előtt** elemezd a jelenlegi
    `.gitlab-ci.yml`-t a `config.md` `PIPELINE_GATE_BLOCKING_JOBS` szabálya szerint (a
    `rule` érték: minden job, ami nem `deploy`/`post-deploy`/`.pre` stage-ben van ÉS nincs
    `allow_failure: true` — vagy az explicit job-lista, ha az van beállítva). Ha erre a
    pipeline-típusra (MR-pipeline) **egyetlen blokkoló job sem futna** (mind `when: never`
    / `allow_failure` / deploy-stage), **egy sorban figyelmeztesd** a felhasználót, hogy
    ezen a ticketen semmilyen automata kapu nem fut merge előtt. A `LOCAL_GATE_BROWSER_TARGET`
    `none` alatt figyelmen kívül marad — ez nem hiba.
- **7a0 — Csomag-verzió kapu** (push **előtt**; ha az A6 commitjai a `dev-workflow-manifest.json` `versioned`
  útvonalait érintik — a gyakorlatban `workflow-meta` ticketnél): olvasd be a [`workflow-meta.md`](workflow-meta.md)
  „7a0” szakaszát és kövesd (VERSION + CHANGELOG emelés, `verify-dev-workflow-version-bump.sh`); csak annak
  `exit 0`-ja után menj a 7a push-ra. Ha a commitok nem érintenek ilyen útvonalat, ez a kapu nem csinál semmit.
- **Lokál qa-tester (`LOCAL_PHASES`, LOCAL-5)**: ha az A5a-ban a `qa-tester` szintje `local` **és** a
  `LOCAL_GATE_MODE` `fast`, a kaput nem a `qa-tester` subagent végzi — olvasd be a
  [`local-execution.md`](local-execution.md) „A7 — lokál qa-tester” szakaszát és kövesd (`LOCAL_EXECUTOR_HOST=subagent`
  mellett a [`local-runner`](../../agents/local-runner.md) `qa-fast` móddal). `full` módban és az A8 `test-env`
  hívásnál **mindig** a Claude-os `qa-tester` fut. Egyébként a lenti, subagentes bullet érvényes.
- **(`full`/`fast` mód — `none` alatt ez a bullet kimarad, lásd a GATE-2 elágazást fent;
  lokál `fast` kapunál a fenti "Lokál qa-tester" bullet fut ehelyett.)**
  Hívd meg a `qa-tester` subagentet `local` target móddal, az A5a-ban meghatározott
  `qa-tester` szintet hívásidejű modell-argumentumként átadva (lásd A5a) — ugyanezt a
  szintet add át a lenti A8-nál (`test-env` target móddal) is, nem kell újra feloldani.
  `fast` módban add át a `LOCAL_GATE_MODE=fast`-ot (és a `LOCAL_GATE_BROWSER_TARGET`
  értékét) is a hívásban.
- **7a — zöld** (`full`/`fast` módban a `qa-tester` zöld kimenete után; **`none` módban
  feltétel nélkül**, közvetlenül a GATE-2 elágazásból — lásd fent): az első push előtt
  futtasd a `bash .claude/skills/dev-workflow/scripts/check-protected-ref.sh <branch-név>`
  ellenőrzést (`PIPELINE_GATE_PROTECTED_REF_CHECK`: `warn` — a figyelmeztetést add tovább a
  felhasználónak, és folytasd; `stop` — 2-es kilépőkódnál állj meg, és kérdezd meg, átnevezed-e
  a branchet a védett mintára). Utána pushold fel a branch-et
  `bash .claude/skills/dev-workflow/scripts/push-as-ai.sh <branch-név>`-vel (nem sima
  `git push origin`-nel) — ez a `config.md` "AI-identitás" szekciójában rögzített
  AI-userhez tartozó tokennel hitelesít, hogy a push is az AI-user alatt jelenjen meg. Ha
  a szkript a `GITLAB_TOKEN_AI` hiányára vagy a projekt-tagság hiányára (403) fut hibába,
  ne találgass tovább — jelezd a felhasználónak, mi a hiba, és kérdezd meg, pusholjon-e
  helyette a saját identitásával (sima `git push origin <branch-név>`), amíg az AI-user
  oldali beállítás nincs kész. Ezután nyiss MR-t/PR-t (a ticket AC-jét/linkjét
  belefoglalva a leírásba). **Ha a GATE-2 mód `fast` vagy `none`** (lásd a "GATE-2 — lokál
  kapu mód feloldása" elágazást fent): az MR-leírásba kerüljön be egy rövid, tételes lista
  a lokálisan **nem ellenőrzött** vizuális/interakciós AC-kről — `fast` módban a
  `qa-tester` visszajelzésében kapott listát, `none` módban minden olyan AC-t, aminek
  böngészős ellenőrzés kellett volna. Ha a ticketen rajta van a `WORKFLOW_META_LABEL`
  (`workflow-meta`), az MR-re/PR-re is kerüljön fel ugyanez a GitLab-label (pl.
  `glab mr create ... --label workflow-meta`) — ez teszi a listanézetben is
  megkülönböztethetővé a dev-workflow eszköztárat módosító MR-eket az alkalmazáskódot
  módosítóktól, ugyanúgy, ahogy a Jira-oldalon a label ezt már jelzi. Ha a `config.md`
  `JIRA_AUTO_DONE_ON_MERGE` flag `true`, az
  MR leírásába **kötelezően** kerüljön bele egy GitLab closing-kulcsszó + a ticket-kulcs
  (pl. `Closes <TICKET-KULCS>`) — sima mention/link **nem** elég ehhez az
  automatizációhoz, a GitLab csak explicit closing-kulcsszóra vált Jira-státuszt merge
  után (lásd `jira-automation-setup.md` 1. pont 9. lépése). **Ha a lezárásra kerülő
  ticket (ez a ticket, vagy batch módban a szülő Story) maga is Story, és van nyitott
  (nem Done/Closed/`REVIEW_STATUS_NAME`) sub-taskja**, jelezd ezt itt, a push/MR
  lépésben — sorold fel a nyitott sub-task(ok) kulcsát és státuszát. Ez **nem blokkolja**
  a push-t/MR-t, csak figyelmeztetés (lásd a 8c "minden gyerek kész" szabályát lent,
  ami ugyanerre a feltételre épül). **Workflow-meta ticketnél**
  (`WORKFLOW_META_LABEL`, lásd fent) a pipeline-eredmény kapu (lásd "7a1") is kimarad —
  nincs futtatható alkalmazáskód, amit a CI ellenőrizne, menj közvetlenül a **9.
  lépésre**. Egyébként: ha a `config.md` `PIPELINE_GATE_POSITION` értéke
  `before-review`, most fusson le a **"7a1 — Pipeline-eredmény kapu (GATE-1)"**
  szakasz, és csak annak zöld/jóváhagyott kimenete után folytasd a **9. lépéssel**. Ha
  `after-review`, hagyd ki most, és menj egyenesen a **9. lépésre** — a kapu ott, a 9.
  lépés után fut (lásd "9a").
- **7a1 — Pipeline-eredmény kapu (GATE-1, csak ha `PIPELINE_GATE_POSITION=before-review`
  és nem workflow-meta ticket)**: lásd lent, a 9. lépés utáni "9a — Pipeline-eredmény
  kapu" szakaszt — a kapu mechanikája ugyanaz, csak a pozíciója más; ott van kifejtve,
  ide csak visszamutat, hogy ne duplikálódjon a leírás. **Batch módban** ez a kapu is
  **egyszer** fut, az egy MR pipeline-jára.
- **7b — piros**: kövesd a [`retry-and-escalation.md`](retry-and-escalation.md) "Javítókör
  mechanika" szekcióját (`implementer` javít → `qa-tester` újra ellenőriz, max
  `MAX_LOCAL_FIX_RETRIES`-ig — a 2.+ `implementer`-kör hívási módja a `config.md`
  "AGENT_CONTINUATION_MODE értékek" szerint alakul, lásd ott). Ha zöldre vált, ugyanúgy
  7a. Ha a limit kimerül nyitott blocker/majorral: a `retry-and-escalation.md` szerint
  mégis pusholj + nyiss MR-t "⚠️ Manuális javítás szükséges" jelöléssel, hozz létre
  fix-ticketet, és **állj meg**.
- **7c**: ha 7b-nél megállt a folyamat és a felhasználó kézzel javított, a folytatás a
  (3) belépési ponttal ("folytasd a 8-tól") indítható újra.

### 9 — Code review

> 📊 Lépés eleje: hívd meg a `mcp__ccd_session__mark_chapter` tool-t
> `dev-workflow-execute / 9 — Code review` címkével (ha a tool nem elérhető, hagyd ki és
> folytasd).

- Push/MR után hívd meg a `code-reviewer` subagentet a diffen/MR-en,
  **a meghívási promptban add át a Jira ticket AC-it/scope-ját is** (a
  [`tracker-adapter.md`](tracker-adapter.md) "ticket beolvasása" műveletének eredményét)
  — a subagentnek nincs tracker MCP-eszköze (gépenként változó hex-ID, nem committolható
  portábilisan a `tools:` mezőbe), ezt nem tudja maga beolvasni. Add át az A5a-ban meghatározott `code-reviewer` szintet hívásidejű modell-
  argumentumként — a lenti javítóköri `code-reviewer`/`implementer` újrahívásoknál is
  ugyanezt a szintet (illetve az `implementer` szintjét) használd, nem kell újra feloldani.
- **Ha a GATE-2 mód `fast` vagy `none`** (lásd az A7 "GATE-2 — lokál kapu mód feloldása"
  elágazását): a meghívási promptban **jelezd tételesen**, mely AC-k maradtak lokálisan
  ellenőrizetlenül (vizuális/interakciós — `fast` módban a `qa-tester` visszajelzéséből,
  `none` módban a böngészős ellenőrzést igénylő AC-k), hogy a `code-reviewer` tudatosan
  ezekre nézzen a diffből.
- A `code-reviewer` minden körben automatikusan posztol GitLab-kommentet (soronkénti
  diff-komment blocker/major találatokhoz, legfeljebb a `config.md`
  `CODE_REVIEW_MAX_INLINE_COMMENTS` darabig + egy összesített komment) — ez a subagent
  saját, feltétel nélküli lépése. **A 2.+ javítókörben add át neki az előző körök
  inline posztolt találatainak listáját** (`fájl:sor` + egysoros leírás), hogy ne posztolja
  őket újra inline — minden felesleges komment egy GitLab-kérés. **Jira-kommentet viszont te posztolj** a subagent
  válaszában visszaadott, kész szöveggel — a [`tracker-adapter.md`](tracker-adapter.md)
  "komment írása" műveletével —, közvetlenül utána — ez ugyanúgy feltétel nélküli/
  automatikus lépés, csak a hex-ID-korlát miatt nálad, nem a subagentnél fut.
- **Ebben a pipeline-ban felülírjuk a [`../../agents/code-reviewer.md`](../../agents/code-reviewer.md) saját "kérj emberi jóváhagyást"
  szabályát**, mert ez a szakasz nincs a felhasználó által megjelölt kézi
  jóváhagyási pontok között: blocker/major találat esetén automatikusan jóváhagyottnak
  tekintve hívd az `implementer`-t a javításra, majd újra a
  `code-reviewer`-t — a [`retry-and-escalation.md`](retry-and-escalation.md) "Javítókör
  mechanika" szerint, **saját, A7-től független számlálóval**, ugyanazzal a
  `MAX_LOCAL_FIX_RETRIES` limittel. A 2.+ `implementer`-kör itt is a `config.md`
  "AGENT_CONTINUATION_MODE értékek" szerint hívódik — `same-thread` esetén a `SendMessage`
  tool-lal folytatva az előző kör `implementer`-szálát (`agentId`), friss `Agent`-hívás
  helyett (lásd `retry-and-escalation.md` "Javítókör mechanika" 3. pontja).
- Minor/nitpick találat nem blokkol — csak Jira kommentbe kerül.
- Ha a kör kimerül nyitott blocker/majorral: `retry-and-escalation.md` szerinti
  eszkaláció (fix-ticket, `MANUAL_DEV_ASSIGNEE`), **állj meg**.
- Ha elfogadva (vagy csak minor/nitpick maradt): **workflow-meta ticketnél**
  (`WORKFLOW_META_LABEL`, lásd A7 és A8 kivétele) a pipeline-eredmény kapu (9a) is
  kimarad — állítsd a ticketet közvetlenül `REVIEW_STATUS_NAME` státuszra (ugyanúgy,
  mint A8a írja), és állj meg — a teszt-env/pipeline-futtatás és a merge ilyenkor
  szándékosan a felhasználó kézi lépése marad. Egyébként: ha `PIPELINE_GATE_POSITION=
  before-review`, a kapu már lefutott (7a1) — folytasd **A8**-cal. Ha `after-review`,
  most fusson le a lenti **"9a — Pipeline-eredmény kapu"**, és csak annak zöld/jóváhagyott
  kimenete után folytasd **A8**-cal.

### 9a — Pipeline-eredmény kapu (GATE-1)

> 📊 Lépés eleje: hívd meg a `mcp__ccd_session__mark_chapter` tool-t
> `dev-workflow-execute / 9a — Pipeline-eredmény kapu` címkével (ha a tool nem elérhető,
> hagyd ki és folytasd).

Ez a szakasz a `PIPELINE_GATE_POSITION` szerint **vagy** a 7a után (before-review),
**vagy** a 9. lépés után (after-review) fut le — pontosan egyszer egy adott push/MR-re,
nem mindkét helyen. Nem fut workflow-meta ticketnél (lásd fent). **Batch módban
(`STORY_BATCH_MODE=on`)** ez a kapu is **egyszer** fut, az egy MR pipeline-jára (a
7a1-gyel szimmetrikusan).

- Futtasd egyetlen blokkoló hívással:
  `bash .claude/skills/dev-workflow/scripts/wait-for-pipeline.sh <branch-név>`. A szkript
  a `PIPELINE_GATE_BLOCKING_JOBS`, `PIPELINE_GATE_TIMEOUT_MINUTES`,
  `PIPELINE_GATE_POLL_SECONDS` és a `GITLAB_RATE_LIMIT_*` értékeket maga olvassa ki a
  `config.md`-ből — env-változót csak akkor adj át, ha egy futásra szándékosan felül akarod
  bírálni. A szkript maga blokkol, pollingol, és GitLab rate limitnél (429) magától,
  visszalépéssel újrapróbál — ne indíts hozzá ismételt, külön tool-köröket.
- **Kilépőkód 0 (zöld)**: minden blokkoló job sikeres. Folytasd tovább (7a1 esetén 9.
  lépéssel, 9a esetén A8-cal).
- **Kilépőkód 1 (fail closed)**: a szkript nem tudta értelmezni a választ, vagy nincs
  `glab`/hitelesítés, vagy nincs pipeline az MR-hez, vagy a GitLab rate limitje (429) a
  `GITLAB_RATE_LIMIT_RETRIES` újrapróbálás után sem oldódott fel. Ne találgass, ne engedj tovább —
  mutasd meg a nyers hibaüzenetet a felhasználónak, és kérdezd meg, hogyan tovább (pl.
  `glab auth status` ellenőrzése, vagy a kapu kihagyása egyszeri jóváhagyással).
- **Kilépőkód 2 (piros)**: a `config.md` `PIPELINE_GATE_ON_RED` szerint járj el:
  - `retry`: kövesd a [`retry-and-escalation.md`](retry-and-escalation.md) "Javítókör
    mechanika" szekcióját (`implementer` javít → új push → a kapu újra fut), max
    `MAX_LOCAL_FIX_RETRIES`-ig, **saját, a 7b/9-től és A8b-től független számlálóval**.
  - `once-then-escalate`: kövesd a `retry-and-escalation.md` "once-then-escalate
    szemantika" szakaszát (pontosan egy javítási kísérlet, utána fix-ticket).
  - `escalate`: azonnal `retry-and-escalation.md` szerinti fix-ticket, retry kör nélkül.
  - Mindhárom ágnál: a fix-ticket létrehozása **nem** akadályozza meg a push-t/MR-t (az
    már megtörtént) — csak a folyamat áll meg ezen a ticketen, a
    `retry-and-escalation.md` "A folyamat leállítása" szerint.
- **Kilépőkód 3 (timeout)**: a `config.md` `PIPELINE_GATE_ON_TIMEOUT` szerint járj el:
  - `ask`: állj meg, mutasd meg a kapu utolsó ismert job-állapotait a felhasználónak, és
    kérdezd meg, várjon-e tovább, tekintse-e pirosnak, vagy hagyja-e ki a kaput ehhez a
    körhöz.
  - `auto`: kezeld úgy, mintha a kilépőkód 2 (piros) lenne — fusson a
    `PIPELINE_GATE_ON_RED` szerinti ág, kérdés nélkül.
- **Kilépőkód 4 (nincs alkalmas runner)**: egy blokkoló job a
  `PIPELINE_GATE_STUCK_GRACE_SECONDS` óta elakadt (a GitLab szerint egyetlen online runner
  sem veheti fel). Nem javítókör és nem timeout — a kód javítása nem segít. Állj meg, mutasd
  meg a szkript diagnózisát (elakadt jobok, illeszkedik-e a branch a védett mintákra), és
  kérdezd meg a felhasználót: átnevezed-e a branchet egy védett mintára (új push, új MR),
  vagy ő védi a mintát / állítja be a runnert, és utána újrafuttatod a kaput.

### A8 — Teszt-env ellenőrzés

A teljes A8 (deploy-ellenőrzés, `test-env` `qa-tester`, 8a zöld / 8b piros / 8c kapcsolódó ticketek, futási
metrika) a [`test-env.md`](test-env.md)-ben van — **ide érve olvasd be és kövesd**. Ide ugrik a (3) „folytasd a
8-tól” belépési pont is. **Workflow-meta ticketnél** az A8 kimarad (lásd a 9. lépés végén a kivételt).

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
kapukhoz) a különálló [`review-feedback.md`](review-feedback.md) fájlban van —
szándékosan kiszervezve, hogy normál A-ági/B-ági köröknél ne kelljen betölteni. Olvasd be
azt a fájlt, amint a (6) belépési pont irányít, és onnantól azt kövesd (R6 végén
visszatér ide, A7-re).

---

## Általános szabályok

- Minden fázisváltás előtt röviden jelezd a felhasználónak, melyik szakaszba lépsz be —
  ez egy hosszan futó, több session-ön átívelő folyamat, mindig legyen világos, hol tart.
- Soha ne lépj át egy "workflow megáll" ponton automatikusan — azok szándékos kézi
  jóváhagyási/pihenő pontok. **Kivétel az E-ág (epic-mód)**: ott az `EPIC_APPROVAL_MODE`
  szerinti jóváhagyás előre lefedi az A6 terv-jóváhagyást és a merge-et (lásd
  [`epic-mode.md`](epic-mode.md) E3 és „Megállási pontok”); minden más megállás érvényes. **Ezek egyben jó `/clear` pontok is** — a Jira ticket(ek)
  státusza és a git branch/commit-history hordozza az állapotot, nem a beszélgetés; ha a
  felhasználó egy ilyen ponton `/clear`-el, elég a ticket kulcsát megadnia a folytatáshoz.
- **Követ-jelentés (`KOVET_REPORT`, alap `auto`)**: a futás befejező pontján (8a/8b, workflow-meta
  megállás, eszkaláció, epic E7) egyszer olvasd be és kövesd a [`kovet-report.md`](kovet-report.md)-t;
  a story-runner nem; Sling nélkül csendben kimarad.
- Ha bármelyik subagent olyan hibát jelez, amit ez a skill nem tud kategorizálni
  (nem a megszokott blocker/major/minor formátum), ne találgass — mutasd meg a
  felhasználónak nyers formában, és kérdezz, hogyan tovább.
