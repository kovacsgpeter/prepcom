# dev-workflow — execute, E-ág: epic-mód

> ℹ️ **Bevezetve (4.23.4, az ordoviii-ben fejlesztve)**: az E-ág egy teljes
> **epicet** visz végig storynként: storynként saját branch → implementáció → helyi kapu →
> push + MR → zöld pipeline → code review → **merge** → a következő story a friss masterről.
> Az egymástól független storyk párhuzamosan, külön git worktree-ben futhatnak, a merge
> viszont mindig sorban történik. A kapcsolók a [`../dev-workflow/config.md`](../dev-workflow/config.md)
> "Epic-mód (E-ág)" szakaszában vannak (`EPIC_*`); itt csak a lépések
> vannak. Egy story belseje (a Story + a sub-taskjai) **pontosan a mai batch-út**
> (`STORY_BATCH_MODE=on`, [`SKILL.md`](SKILL.md) "A-ág — Batch mód"); az E-ág csak a storyk
> sorrendjét, a worktree-ket, a megállási pontokat és a merge-et teszi hozzá.

**Belépési pont (14):** „csináld meg az `<EPIC-KULCS>` epicet storynként” — közeli parafrázis
is elég („vidd végig az epicet”, „az ORD-2 epicet egyben, storynként mergelve”). Ha az epic
kulcsa nem derül ki, kérdezz rá; ne válassz magadtól epicet.

## E1 — Epic beolvasása és a story-halmaz

> 📊 Lépés eleje: `mcp__ccd_session__mark_chapter` → `dev-workflow-execute / E1 — Epic beolvasása`
> (ha a tool nem elérhető, hagyd ki).

- **CI-készenlét (az epic beolvasása előtt):** ha a `CI_READINESS_CHECK` nem `off`, MINDIG futtasd a
  `bash .claude/skills/dev-workflow/scripts/check-ci-readiness.sh`-t (a repó gyökeréből; a Codex-tükörben `.agents/...`),
  a `CI_READINESS_CHECKED` értékétől függetlenül. `HIBA` (1-es kilépőkód) esetén állj meg: se story-branch,
  se worktree (E4) nem készül; jelentsd a kimenetet és a javítási lépéseket. Hibátlan futásnál a
  `CI_READINESS_CHECKED` sorát írd át a mai dátumra.
- Olvasd be az epicet a [`tracker-adapter.md`](tracker-adapter.md) "ticket beolvasása"
  műveletével (OpenProjecten: `OP get <EPIC> --json`): a gyerek-ticketek a storyk, a storyk saját `relations`
  listája (`blocks` / `blocked` / `follows` / `precedes`) a függőségek. Minden story-ra
  külön "ticket beolvasása" kell (a sub-taskok, a kapcsolatok és az „Oldalnév” mező
  miatt).
- **Bevont storyk**: azok a gyerekek, amelyek típusa `Story`, státusza `INITIAL_STATUS_NAME`
  (vagy félbehagyott `In Progress`, lásd lent), rajta van a `CLAUDE_WORK_LABEL`, és **nincs**
  rajta `WORKFLOW_FLAGGED_LABEL`. A `REVIEW_STATUS_NAME`, `Done`, `Closed` státuszú storyk
  kimaradnak (a `review`-ban lévő storyhoz már van MR; azt nem az E-ág mergeli, csak
  felsorolja). A kihagyott storykat okkal együtt sorold fel.
- **Félbehagyott futás folytatása**: ha egy bevont story `In Progress`, és van hozzá távoli
  branch/MR (`glab mr list --source-branch ...`), az E-ág **onnan folytatja**, ahol a
  story tart (nyitott MR → E6 merge-sor; branch MR nélkül → 7a push + MR). Kétes esetben
  kérdezz.
- **Design-kapu**: ha egy storynak van kitöltött „Oldalnév” mezője, és nincs hozzá
  jóváhagyott/lezárt design (ugyanaz a feltétel, mint az A4 elágazásnál), a story
  **design-blokkolt**: az E-ág nem indít rá Figma-kört, mert a design-review emberi lépés.
  A story és a tőle (tranzitívan) függő storyk kimaradnak; a végén javasold a 10.
  belépési pontot („csináld meg előre az összes képernyőtervet”).
- **Függőségi gráf**: él `A → B`, ha A `blocks` B-t (vagy B `follows` A-t). Az epicen kívüli,
  még nem Done blokkoló az adott storyt **külső blokkoltnak** jelöli (kimarad, a végén
  jelezve). Kör esetén állj meg, és nevezd meg a kört alkotó storykat.

## E2 — Hullámok és párhuzamosság

- Rendezd a bevont storykat topologikus sorrendbe; azonos szinten a prioritás, utána a
  kulcs dönt. Egy **hullám** azokból a storykból áll, amelyeknek minden epicen belüli
  előfeltétele már az előző hullámokban van.
- **Ütközés-becslés**: két azonos hullámbeli story csak akkor futhat párhuzamosan, ha a
  terveik (E3) **nem érintenek közös fájlt** a megosztott „forró pontok” közül:
  a csomag-lockfájlok (`*lock*`, pl. `pnpm-lock.yaml`, `package-lock.json`), a gyökér
  build-manifest (pl. `package.json`, `pom.xml`), a `CLAUDE.md` / `AGENTS.md`, a CI-fájl,
  valamint az `EPIC_SERIAL_PATHS` kapcsolóban felsorolt minták (ide valók a repó sémái és
  migrációi). Az `EPIC_SERIAL_PATHS` mintáiba eső migrációt hozó storyk **mindig
  sorosak** egymással (a sorszámozott migrációk ütköznének). Ütközésnél a később rendezett
  story a következő hullámba csúszik.
- A tényleges párhuzamosságot az `EPIC_PARALLEL_MODE` és az `EPIC_MAX_PARALLEL` adja
  (lásd config): `serial` mellett minden hullám egy story széles.

## E3 — Epic-terv és jóváhagyás

> 📊 `mark_chapter` → `dev-workflow-execute / E3 — Epic-terv`.

- Storynként készítsd el az A6 szerinti tervet (a `ARCHITECT_INTAKE` szerint az
  `architect` subagenttel, a story és sub-taskjai összevont AC-listájára — ugyanúgy, mint
  batch módban). A tervek egymástól függetlenek, ezért **párhuzamosan** kérheted őket
  (egy üzenetben több `architect` hívás, `EPIC_MAX_PARALLEL`-től függetlenül, mert
  csak-olvasók).
- Mutasd meg **egy** üzenetben: a bevont / kihagyott storyk listája okkal, a hullámok
  (melyik story melyikkel párhuzamos és miért), storynként a terv fájl-szintű vázlata, a
  becsült forró pont-ütközések, és az érvényes `EPIC_APPROVAL_MODE` szerint a hátralévő
  megállási pontok.
- **Becslés (ORD-377)**: ha a `bash .claude/skills/dev-workflow/scripts/config-value.sh RUN_METRICS off`
  értéke `collect+estimate`, a storynkénti terv után állítsd elő a `stories.json`-t (storynként:
  `story` és `features`: komplexitás, AC-szám, sub-taskok típusa/executor-címkéje, design, a
  `plan_steps` a terv `plan-meta` sorából), és futtasd:
  `node .claude/skills/dev-workflow/scripts/estimate-run.js --epic <EPIC> --stories-file <json> --warn-only`.
  A kimenetet (storynkénti blokk, epic-összeg, `epic_overhead`) másold be az epic-terv üzenetbe.
  Storynként futtasd a `--story <STORY> --features-file <json> --plan-file <terv> --out <LOCAL_RUN_DIR>/<STORY>-estimate.json --warn-only`
  hívást is, hogy a gyűjtő (E6) megtalálja. Hiba esetén csak figyelmeztetés: az epic-terv
  mutatása nem áll meg.
- **`EPIC_APPROVAL_MODE` szerint:**
  - `upfront` *(alap)*: ez az **egyetlen** jóváhagyás. Az „igen” lefedi minden bevont
    story A6 terv-jóváhagyását, az E6 merge-et és a storynkénti 8a státuszváltást. Ezután
    az E-ág csak a lenti „Megállási pontok” esetén áll meg.
  - `per-story`: itt csak a sorrendet és a hullámokat hagyatod jóvá; az A6
    terv-jóváhagyás storynként megmarad (a story indulásakor), a merge autonóm.
  - `pre-merge`: mint `upfront`, de minden story merge-e előtt (E6, a zöld pipeline és a
    review után) megállsz egy „mergeljem a `<STORY>` MR-t?” kérdéssel.
- A jóváhagyott terveket storynként mentsd a "terv mentése" művelettel (ugyanúgy, mint
  A6-ban), hogy egy félbeszakadt futás `/clear` után is folytatható legyen.
- Az **epic-futás állapotát** az epicre írt egyetlen kommentben is rögzítsd (`## Epic-futás
  — <dátum>`: hullámok, mód, storynkénti státusz). Minden merge után frissítsd egy új
  kommenttel; ez a `/clear` utáni folytatás forrása.

## E4 — Worktree-k

- Az E-ág **mindig worktree-ben dolgozik**, a felhasználó munkafáját nem váltja át és nem
  stash-eli (lehet, hogy abban egy másik session dolgozik). Storynként:
  `bash .claude/skills/dev-workflow-execute/scripts/epic-worktree.sh add <slot> <branch-név>`
  — friss `origin/<alap>`-ról hoz létre branchet a `EPIC_WORKTREE_ROOT/<repó>-wt<slot>`
  mappában, és kiírja az útvonalat. A slot `1..EPIC_MAX_PARALLEL`; egy slot egyszerre egy
  storyé, merge után felszabadul.
- `EPIC_PARALLEL_MODE=isolated` esetén ugyanez a hívás a worktree-be `.env`-et is ír a fő
  munkafa `.env`-jéből, slotonként eltolt portokkal és saját `COMPOSE_PROJECT_NAME`-mel
  (lásd a szkript fejlécét), és a helyi kaput a worktree saját DB-konténereivel futtatod
  (`docker compose up -d db db-test mailpit` a worktree-ben). Más módban a worktree a fő
  `.env`-et másolja változatlanul (közös DB-konténerek).
- A branch neve a `BRANCH_NAME_PATTERN` szerint a story kulcsával és jellegével készül,
  mint batch módban. Az „In Progress” státuszváltás a story-ra és bevont sub-taskjaira a
  worktree létrehozása után történik (A5 szerint).
- **Subagent-hívásnál** a worktree abszolút útvonalát mindig add át, és írd elő, hogy a
  subagent minden fájlt ezen belül írjon, és minden parancsot ott futtasson
  (`cd <worktree> && ...`); a commit a worktree-ben a `commit-as-ai.sh`-val történik.

## E5 — Story-kör (implementáció → MR → review)

Storynként a mai batch-út fut a worktree-ben, ezekkel az eltérésekkel:

- **Ki vezeti a kört (`EPIC_STORY_HOST`, ORD-365)**: `main` *(alap)* — a fő szál, ahogy ez a
  szakasz és az E4 / E6 leírja. `subagent` — storyként egy **story-runner** subagent viszi a
  kört (munkafa, branch, In Progress, sub-taskok a helyi lépésekkel, A7, push + MR, pipeline,
  9 code review, javító körök, 8a `review` státusz), **merge nélkül**; a fő szálon a
  tervfrissítés, az indítás, az eredmény független ellenőrzése, a merge (E6), a lezárás és az
  epic-állapot marad. A felosztás, a feladatleírás-sablon, a parancsok és a szabályok:
  [`story-runner-brief.md`](story-runner-brief.md). Az alábbi pontok ilyenkor a
  story-runnerre vonatkoznak.

- **Subagent-hívások leírása (ORD-376)**: minden subagent-hívás `description`-je tartalmazza a
  story-azonosítót (pl. „Story-runner ORD-82”, „architect ORD-94”, „code-review ORD-86”) — a
  futási metrika gyűjtője ebből (és a `parentAgentId` láncból) rendeli a subagent tokenjeit a
  storyhoz.

- **A6**: `upfront`/`pre-merge` módban a terv-jóváhagyás kimarad (az E3 lefedte); az
  `implementer` a mentett, jóváhagyott tervet kapja. Ha az implementer a tervtől lényegesen
  eltérne (új forró pont, más fájlkör), a story megáll (lásd lent).
- **Végrehajtó-szint**: storynként az A5a dönt, pontosan a batch-út szerint
  (`STORY_BATCH_EXECUTOR_SCOPE`: `batch` — egy szint a bevont halmazra, `per-subtask` — az
  `implementer` szintje sub-taskonként, a sub-task saját `Komplexitás` értékével és issue
  type-jával; továbbá `OFFLOAD_PROFILE`, `LOCAL_PHASES`). Az E-ág ehhez nem tesz saját
  szabályt, tehát a batch-út routing-beállításai és javításai itt is érvényesek.
- **Párhuzamos implementáció**: egy hullám storyjainak `implementer` hívásai egy
  üzenetben, háttérben indulnak (legfeljebb `EPIC_MAX_PARALLEL`) — de csak a felhős
  (`haiku`/`sonnet`/`opus`) szintűek.
- **Helyi LLM-hívások (`EPIC_LOCAL_LLM_CONCURRENCY`)**: ha egy story `implementer` vagy
  `qa-tester` fázisa (`per-subtask` esetén egy sub-taskja) az A5a szerint `local`, azt a fő szál hívja a `call-local-model.sh`-val
  (A6, A7 „Lokál qa-tester”), nem subagent. Egyszerre legfeljebb
  `EPIC_LOCAL_LLM_CONCURRENCY` ilyen hívás futhat (alap: `1`, egy helyi GPU-n két nagy
  modell egyszerre lassú vagy instabil); a többi helyi hívás sorban vár, közben a felhős
  story-körök párhuzamosan haladnak. A helyi hívás bukása után a felhős visszaesés
  (A6/A7 szerint) a párhuzamos keretbe számít, nem a helyi keretbe.
  **`LOCAL_EXECUTOR_HOST=subagent` vagy `EPIC_STORY_HOST=subagent` (ORD-365)**: a helyi
  lépéseket nem a fő szál vezérli, hanem a [`local-runner`](../../agents/local-runner.md)
  subagent (A6 / A7 szerint), illetve `EPIC_STORY_HOST=subagent` mellett a story-runner maga,
  ugyanazzal a szerződéssel ([`story-runner-brief.md`](story-runner-brief.md)). Az
  `EPIC_LOCAL_LLM_CONCURRENCY` ilyenkor azt korlátozza, hány helyi lépést tartalmazó
  local-runner / story-runner fut egyszerre. A helyi modell elérhetetlensége
  (`LOCAL_UNREACHABLE`) ilyenkor az epic-futás megállása, nem felhős visszaesés.
- **A7 helyi kapu**: `parallel` módban a helyi kapuk **egymás után** futnak (közös
  db-test, Mailpit és Vite-port; a `resetTestData` ütközne): egyszerre csak egy `qa-tester`
  futhat. `isolated` módban párhuzamosak lehetnek, mert minden worktree saját
  portokat és konténereket kap. `serial` módban ez magától teljesül.
- **7a / 7a1 / 9 / 9a**: változatlanok (push a `push-as-ai.sh`-val, MR, pipeline-kapu,
  code review), egy kiegészítéssel: minden push után (az első MR-push és a javítókörök
  push-ai után is) a pipeline-kapu előtt fusson a `wait-for-mr-sha.sh <MR-iid> <HEAD-SHA>`
  (lásd E6 2. pont), különben a kapu az előző SHA pipeline-ját olvashatja. Az MR leírásában a „Merge: az E-ág automatikusan mergeli zöld pipeline és
  review után (`EPIC_APPROVAL_MODE=<mód>`)” sor jelzi a reviewernek, hogy nem kézi merge-re
  vár.
- **A8 teszt-env** (`EPIC_TEST_ENV`): `skip` *(alap)* — az E-ág kihagyja, egy sorban
  jelezve storynként (jellemzően a teszt-környezet az alap branch-ről deployol, merge után);
  `run` — az A8 a mai módon fut (a `TEST_ENV_MR_DEPLOY_MODE=manual` kérdése ilyenkor is
  megállás).
- **8a**: zöld kör után a story és a bevont sub-taskok `REVIEW_STATUS_NAME`-re kerülnek,
  majd a story az **E6 merge-sorba** áll.

## E6 — Merge-sor (mindig soros)

> 📊 `mark_chapter` → `dev-workflow-execute / E6 — Merge <STORY>`.

A merge-sor egyszerre egy MR-t mergel, a hullám-sorrend szerint (egy hullámon belül
abban a sorrendben, ahogy a storyk beálltak). Minden MR-re:

1. `git -C <worktree> fetch origin`. Ha az `origin/<alap>` nem őse a branchnek (közben
   mergelt egy másik story), frissítsd a branchet az `EPIC_REFRESH_MODE` szerint:
   - `merge` *(alap)* — force push nélkül:
     `git -C <worktree> merge --no-commit --no-ff origin/<alap>`, majd a worktree-ben
     `bash .claude/skills/dev-workflow/scripts/commit-as-ai.sh --no-edit` (a merge-commit az
     AI-identitással készül). **Merge-ütközés**: `git -C <worktree> merge --abort`, a story
     **megáll** (lásd „Megállási pontok”), a merge-sor a következő kész storyval folytatódik.
     Push: `bash .claude/skills/dev-workflow/scripts/push-as-ai.sh <branch>` (fast-forward,
     force push nélkül).
   - `rebase` — `git -C <worktree> rebase origin/<alap>`. **Rebase-ütközés**:
     `git rebase --abort`, a story **megáll**. Push:
     `bash .claude/skills/dev-workflow/scripts/push-as-ai.sh <branch> --force-with-lease`
     (az auto mód a force pusht letilthatja; akkor a `merge` mód a járható út).
   - A frissítés után, push előtt futtasd a gyors ellenőrzést a worktree-ben
     (`EPIC_REBASE_CHECK_CMD`, ha be van állítva; különben kimarad, és csak a CI dönt);
     hibánál a story megáll.
2. Várd meg az **új** pipeline-t, két lépésben:
   `bash .claude/skills/dev-workflow/scripts/wait-for-mr-sha.sh <MR-iid> <várt-SHA>` (megvárja,
   hogy az MR head-pipeline-ja a frissen pusholt SHA-ra jöjjön létre; 3 = timeout), és
   csak utána `bash .claude/skills/dev-workflow/scripts/wait-for-pipeline.sh <branch>`
   (kilépőkód: 0 zöld, 2 piros, 3 timeout, 4 nincs alkalmas runner, 1 fail closed). A `wait-for-pipeline.sh` a branch
   legfrissebb pipeline-ját olvassa: közvetlenül a push után az még az előző SHA futása
   lehet, és annak eredményét adná vissza (téves piros vagy zöld). Ha a branchre nem kellett
   új push (az alap nem mozdult), a `wait-for-mr-sha.sh` azonnal visszatér. Piros/timeout/fail closed esetén
   a `PIPELINE_GATE_ON_RED` / `PIPELINE_GATE_ON_TIMEOUT` szabálya érvényes. Ha ezek után
   sem zöld, a story megáll.
3. `pre-merge` módban itt kérdezz rá a merge-re.
4. Merge: `bash .claude/skills/dev-workflow/scripts/merge-as-ai.sh <MR-iid> <várt-SHA>`,
   ahol a várt SHA a worktree `git rev-parse HEAD`-je. A szkript csak akkor mergel, ha az
   MR head-pipeline-ja **erre a SHA-ra** fut és `success`, és a merge-et is ehhez a SHA-hoz
   köti (közben érkezett push esetén a GitLab elutasítja). Az MR forrásbranche merge után
   törlődik (`EPIC_MERGE_REMOVE_SOURCE_BRANCH`).
5. Merge után: a story és a bevont sub-taskok `Done`-ra (`OP done-on-merge --message
   "<merge-commit üzenet>"` vagy egyenként "státuszváltás"); a 8c szerinti design-ticket
   lezárás; `epic-worktree.sh remove <slot>` (worktree + helyi branch törlése, `isolated`
   módban a slot konténereinek leállítása); az epic-kommentbe új állapot.
   **Futási metrika (ORD-376)**: ha a `bash .claude/skills/dev-workflow/scripts/config-value.sh RUN_METRICS off`
   értéke nem `off`, a fő szál a merge után a story metrikáját is rögzíti. Előbb a tracker-adapterrel
   (komplexitás, AC-szám, sub-taskok típusa és executor-címkéje, design) egy ideiglenes JSON-ba
   állítja elő a features-fájlt, majd futtatja:
   `node .claude/skills/dev-workflow/scripts/collect-run-metrics.js --story <STORY> --epic <EPIC> --sessions <aktuális session id> --features-file <json> --plan-file <LOCAL_RUN_DIR>/<STORY>-plan.md --mr <iid> --warn-only`.
   Az aktuális session id a fő session transcript-fájl neve (a `~/.claude/projects/<kódolt cwd>/`
   mappában a legutóbb módosított `.jsonl`, kiterjesztés nélkül). A hiba csak figyelmeztetés, a
   merge-sort nem állítja meg. `collect+estimate` értéknél a gyűjtő automatikusan beolvassa a
   `<LOCAL_RUN_DIR>/<STORY>-estimate.json` fájlt (az E3 becslése), és a sor `estimate` mezőjébe teszi.
6. A merge után felszabadult storyk (amelyeknek ez volt az utolsó előfeltétele) a
   **friss** `origin/<alap>`-ról indulnak (E4). A még futó, párhuzamos storyk nem állnak
   meg: az ő frissítésük (merge vagy rebase) a saját merge-ük előtt, az 1. pontban történik.

## Megállási pontok

Az E-ág (bármely `EPIC_APPROVAL_MODE` mellett) **megállítja az adott storyt**, ha:
a 7b/9a piros ág a retry után is piros (fix-ticket a `retry-and-escalation.md` szerint);
a code review blocker/major találata a javítókör után is nyitott; merge- vagy
rebase-ütközés az E6 frissítésében; a gyors ellenőrzés a frissítés után bukik; az implementer a tervtől lényegesen eltér; vagy
bármelyik subagent nem kategorizálható hibát ad. `EPIC_STORY_HOST=subagent` mellett
továbbá: a story-runner `SUBAGENT_UNAVAILABLE`-t ad, vagy a fő szál független ellenőrzése
(a head SHA, a pipeline vagy a `code-reviewer` MR-kommentjének nyitott blocker/major tétele)
nem egyezik az összefoglalóval. A `LOCAL_UNREACHABLE` (a helyi modell nem érhető el) az
**egész** epic-futást megállítja, `EPIC_ON_STORY_FAILURE`-tól függetlenül. Ugyanígy a
**nincs alkalmas runner** eset (a `wait-for-pipeline.sh` 4-es kódja, a story-runnertől
`PIPELINE_NO_RUNNER`, illetve `PIPELINE_GATE_PROTECTED_REF_CHECK=stop` mellett a
`check-protected-ref.sh` 2-es kódja): a CI-runner hiánya vagy a branch-minta minden storyt
érint, ezért a futás megáll, és a felhasználó dönt. Ugyanez a **CI-készenlét HIBA az E1-ben**
(a `check-ci-readiness.sh` 1-es kódja: hiányzó runner-tag vagy védett branch-minta): se story-branch,
se worktree nem készül, a felhasználó dönt — ez a felügyelet nélküli éjszakai futás fő esete.

Megálláskor `EPIC_ON_STORY_FAILURE` szerint:
- `continue-independent` *(alap)*: a tőle (tranzitívan) függő storyk is kimaradnak, a
  többi folytatódik; a végén egy összesítés sorolja fel a megállt storykat okkal, a
  worktree-jük megmarad.
- `stop-epic`: az egész epic-futás megáll a többi, még nem indult story előtt (a már futó
  story-kör befejeződik az MR-ig, de nem mergel).

A **felhasználó által megadott** állj („állj”, „várj”) mindig az egész futást állítja meg
a következő biztonságos pontnál (subagent vége, merge előtt).

## E7 — Zárás

- **Futási metrika (ORD-376)**: ha a `RUN_METRICS` (`config-value.sh RUN_METRICS off`) nem `off`,
  az epic saját overhead-je is sorba kerül:
  `node .claude/skills/dev-workflow/scripts/collect-run-metrics.js --kind epic_overhead --epic <EPIC> --sessions <aktuális session id> --warn-only`
  (a session id forrása: lásd E6). A hiba csak figyelmeztetés.
- Összesítés: mergelt storyk (MR-link, merge-commit), megállt storyk (ok, worktree-útvonal,
  fix-ticket), kihagyott storyk (design-, külső vagy függőségi blokk), és ha az epic
  minden storyja Done, ajánld fel az epic lezárását (a 8c „minden gyerek kész” szabálya
  szerint, jóváhagyással).
- A fő munkafát az E-ág nem váltotta át; ha a felhasználó azon a mastert akarja, jelezd,
  hogy `git pull` kell (ne futtasd magadtól, ha a munkafa nem tiszta).
- **Követ-jelentés**: legvégül egyszer, az egész epicre a [`kovet-report.md`](kovet-report.md)
  szerint (`KOVET_REPORT`); a story-runnerek nem futtatják.
