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

## Tracker-backend (TRACKER_BACKEND)

> ℹ️ **Bevezetve (COCALC-260)**: ez a kapcsoló mondja meg, **melyik ticket-tracker
> mögé** képződnek le a workflow absztrakt tracker-műveletei (`ticket beolvasása`,
> `ticket létrehozása`, `ticket módosítása`, `státuszváltás`, `komment írása`,
> `link létrehozása`, `keresés`, `terv mentése`/`terv beolvasása`, `komplexitás
> mentése`/`komplexitás beolvasása`). A ~12 hívó skill **csak** az absztrakt művelet
> nevét ismeri; a konkrét MCP-eszközökre való leképezés egyetlen helyen, a
> [`../dev-workflow-execute/tracker-adapter.md`](../dev-workflow-execute/tracker-adapter.md)-ben
> él — az a kapcsoló kanonikus doksija is (a fenti "Konvenció" 3. pontja itt
> teljesül: nem duplikáljuk ide a művelet-leképezéseket).

| Változó | Alapérték | Leírás |
|---|---|---|
| `TRACKER_BACKEND` | `jira` | A ticket-tracker backend, ami mögé a `tracker-adapter.md` a műveleteket leképezi. `jira` (alap): a jelenlegi Atlassian-MCP-alapú viselkedés — a kapcsoló bevezetése önmagában **semmit nem változtat**. Új backend felvételéhez lásd a `tracker-adapter.md` "Új tracker-backend felvétele" szekcióját (mely műveletet hova kell leképezni, mi a kötelező minimum, mi a fallback egy nem támogatott műveletnél). |
| `OPENPROJECT_WIKI_SSH_HOST` | - | Az `op.js wiki` parancsok SSH-célja (`<felhasználó>@<host>`), **ha az OpenProject web-konténer nem ezen a gépen fut** (a konténer-hoszton nincs rá szükség, ott helyi `docker exec` megy). Az `op.js` az env varból vagy a `~/.config/openproject/wiki_ssh_host` fájlból olvassa; ha egyik sincs és a konténer nem helyi, a wiki-parancs használati hibával áll meg. A távoli felhasználónak `docker exec`-jogosultság kell. `-` = nincs beállítva. |
| `OPENPROJECT_WIKI_CONTAINER` | `openproject-web-1` | Az OpenProject web-konténer neve, amiben a wiki-íráshoz/olvasáshoz a `rails runner` fut (az API v3 wiki oldalt nem tud írni). Env var vagy `~/.config/openproject/wiki_container`. |
| `OPENPROJECT_WIKI_LOGIN` | `claude-agent` | Az OpenProject-felhasználó (login), akinek a nevében a wiki-oldal létrejön/módosul (szerző, verziótörténet). Env var vagy `~/.config/openproject/wiki_login`. |

**Fallback-szabály** (a `WORKFLOW_PROFILE` fallback-szabályának mintájára): ha egy
skill/adapter ismeretlen `TRACKER_BACKEND` értéket talál (elgépelés, még nem
implementált backend), vagy ha a sor hiányzik — **essen vissza `jira`-ra**, és ne
akadjon el, csak egy rövid egysoros jelzést adjon ("TRACKER_BACKEND ismeretlen,
jira alapértelmezéssel folytatom").

## Munkamódprofil (WORKFLOW_PROFILE)

> ℹ️ **Bevezetve (COCALC-216)**: ez a szekció egy **keret**, ami egyetlen helyen teszi
> állíthatóvá, "mennyire legyen a workflow takarékos vagy alapos" — anélkül, hogy minden
> egyedi kapcsolót (gate szigorúság, env-izoláció, kódbeolvasás mélysége stb.) külön-külön
> kelljen a felhasználónak beállítania. A profil csak egy **preset** — bármelyik egyedi
> kapcsoló explicit felülírható a profiltól függetlenül (lásd lent).

| Változó | Alapérték | Leírás |
|---|---|---|
| `WORKFLOW_PROFILE` | `balanced` | A workflow globális munkamódja. Lehetséges értékek: `cheap` (takarékos — kevesebb LLM-kör/MCP-hívás, olcsóbb modell preferálva, kevesebb automata ellenőrzés), `balanced` (jelenlegi alapértelmezett viselkedés — ez felel meg annak, ahogy a workflow ezen keret bevezetése *előtt* is működött), `genius` (alapos — több ellenőrzés, erősebb modell preferálva, mélyebb automata lefedettség, ahol ez értelmezhető). |

### Preset-tábla

Az alábbi tábla azt mondja meg, egy adott `WORKFLOW_PROFILE` érték mellett az egyes
**egyedi kapcsolók** milyen értéken álljanak, ha a felhasználó nem írta felül őket
explicit. A táblázat sorai közül több kapcsoló **még nincs implementálva** — ezeket a
hivatkozott ticket vezeti majd be; addig a sor csak helyfoglaló, a kapcsolót olvasó skill
még nem létezik.

| Egyedi kapcsoló | `cheap` | `balanced` | `genius` | Bevezető/gazda ticket |
|---|---|---|---|---|
| `PIPELINE_GATE_BLOCKING_JOBS` | `rule` | `rule` | `rule` | COCALC-261 (GATE-1) — lásd lent "PIPELINE_GATE_* kapcsolók". |
| `PIPELINE_GATE_POSITION` | `before-review` | `before-review` | `after-review` | COCALC-261 (GATE-1) — lásd lent. |
| `PIPELINE_GATE_ON_RED` | `escalate` | `once-then-escalate` | `retry` | COCALC-261 (GATE-1) — lásd lent. |
| `PIPELINE_GATE_ON_TIMEOUT` | `ask` | `ask` | `auto` | COCALC-261 (GATE-1) — lásd lent. |
| `LOCAL_GATE_MODE` | `fast` | `full` | `full` | COCALC-263 (GATE-2) — lásd lent "LOCAL_GATE_MODE értékek". |
| `LOCAL_GATE_BROWSER_TARGET` | `local-dev-server` | `local-dev-server` | `local-dev-server` | COCALC-263 (GATE-2) — lásd lent "LOCAL_GATE_BROWSER_TARGET értékek". |
| `AGENT_CONTINUATION_MODE` | `same-thread` | `same-thread` | `off` | COCALC-306 — lásd lent "AGENT_CONTINUATION_MODE értékek". `genius` a friss szálat (maximális elszigeteltség/áttekinthetőség köreként) részesíti előnyben, `cheap`/`balanced` a validált token-spórolást. |
| `CODE_REVIEW_DEFAULT_EFFORT` | `medium` | `full` | `full` | COCALC-306 — lásd lent "CODE_REVIEW_DEFAULT_EFFORT értékek". Explicit felhasználói kéréssel felülírható, a `WORKFLOW_PROFILE`-tól függetlenül is. |
| `STORY_BATCH_MODE` | `off` | `off` | `off` | COCALC-328 — nem thoroughness-függő, a `WORKFLOW_PROFILE` egyik értéke sem állítja, önálló tengely; lásd lent "STORY_BATCH_MODE értékek". |
| `STORY_BATCH_EXECUTOR_SCOPE` | `batch` | `batch` | `batch` | 4.23.4 (az ordoviii-ben fejlesztve) — nem thoroughness-függő, önálló tengely; csak `STORY_BATCH_MODE=on` mellett hat. Lásd lent "STORY_BATCH_EXECUTOR_SCOPE értékek". |
| `LOCAL_ENV_ISOLATION` | `port-offset` | `port-offset` | `port-offset` | COCALC-257 (ENV-1) — nem thoroughness-függő, minden profilon azonos; lásd lent "LOCAL_ENV_ISOLATION értékek". |
| `CANDIDATE_ENV_LIFETIME` | `mr-open` | `mr-open` | `mr-open` | COCALC-245, COCALC-339 — nem thoroughness-függő, minden profilon azonos. A candidate env mechanizmusa a repó saját `.gitlab-ci.yml`-jében él (a csomag `.gitlab-ci.template.yml`-je nem tartalmazza); a részleteket a repó `config.md`-je írja le, a védelmi beállítást a [`candidate-env-protection-setup.md`](candidate-env-protection-setup.md). |
| `CODE_SCAN_INTAKE` | `off` | `auto` | `always` | COCALC-219 (TPL-1), háromértékűre bővítve COCALC-270 (SCAN-1) — lásd lent "CODE_SCAN_INTAKE értékek". |
| `CODE_SCAN_VERIFY` | `git-only` | `on` | `on` | COCALC-259 (PLAN-1) — lásd lent "CODE_SCAN_VERIFY értékek". |
| `CODE_SCAN_STRATEGY` | `hybrid` | `hybrid` | `hybrid` | COCALC-270 (SCAN-1) — nem thoroughness-függő, minden profilon azonos; lásd lent "CODE_SCAN_STRATEGY értékek". |
| `CODE_SCAN_MAX_AGENTS` | `2` | `4` | `6` | COCALC-270 (SCAN-1), profilonként felülvizsgálva (COCALC-306) — **thoroughness-függő**: a `dev-workflow-intake/repo-scanner.md`-t indító felderítő subagentek felső korlátja (a fix repo-térkép felderítőt is beleszámítva). `cheap`: csak a fix repo-térkép + max 1 téma-alapú felderítő, a takarékos profil szellemében. `balanced`: a jelenlegi érték változatlan. `genius`: a mélyebb, több szempontú felderítés indokolja a magasabb korlátot. |
| `CODE_SCAN_MODEL` | `sonnet` | `sonnet` | `sonnet` | COCALC-270 (SCAN-1) — nem thoroughness-függő; a "Modell-stratégia fázisonként" szekció `execute`-sora szerinti mai subagent-modell, ha az változik, itt is át kell írni. |
| `INTERVIEW_EXPLANATION_STYLE` | `terse` | `verbose` | `verbose` | Ez a repóban már bevezetve — lásd lent. |
| `INTERVIEW_DEPTH` | `fast` | `thorough` | `thorough` | COCALC-355 — lásd lent "### INTERVIEW_DEPTH értékek". |
| `WORKING_LANGUAGE` | `magyar` | `magyar` | `magyar` | Itt vezetve be (COCALC-221) — lásd lent. |
| `CHANGELOG_MODE` | `offline` | `offline` | `offline` | Itt vezetve be (COCALC-240) |
| `CHANGELOG_STYLE` | `hu-dev` | `hu-dev` | `hu-dev` | Itt vezetve be (COCALC-240) |
| `COMPLEXITY_ESTIMATION` | `hybrid` | `hybrid` | `hybrid` | Itt vezetve be (COCALC-273) — nem thoroughness-függő, minden profilon azonos; lásd lent "Komplexitás → végrehajtó-szint routing". |
| `EXECUTOR_LADDER` | `local`→`haiku`→`sonnet`→`opus` | `local`→`haiku`→`sonnet`→`opus` | `local`→`haiku`→`sonnet`→`opus` | Itt vezetve be (COCALC-273) — nem thoroughness-függő; a sorrend maga rögzített, lásd lent. |
| `COMPLEXITY_EXECUTOR_MAP` | lásd `scripts/resolve-executor-level.sh` | lásd `scripts/resolve-executor-level.sh` | lásd `scripts/resolve-executor-level.sh` | Itt vezetve be (COCALC-273) — nem thoroughness-függő, minden profilon azonos szállított alapérték; lásd lent "Komplexitás → végrehajtó-szint routing". |
| `OFFLOAD_PROFILE` | `off` | `off` | `off` | Itt vezetve be (COCALC-278, LOCAL-2) — nem thoroughness-függő, a `WORKFLOW_PROFILE` egyik értéke sem állítja, önálló tengely; lásd lent "OFFLOAD_PROFILE és OFFLOAD_PHASE_MATRIX". |
| `OFFLOAD_PHASE_MATRIX` | lásd `scripts/resolve-executor-level.sh` | lásd `scripts/resolve-executor-level.sh` | lásd `scripts/resolve-executor-level.sh` | Itt vezetve be (COCALC-278) — nem thoroughness-függő, minden profilon azonos szállított alapérték; a mátrix maga a szkriptben van (ugyanaz az ok, mint a `COMPLEXITY_EXECUTOR_MAP`-nál), lásd lent. |
| `OFFLOAD_CLAMP_DIRECTION` | `up` | `up` | `up` | Itt vezetve be (COCALC-278) — nem thoroughness-függő; `down` csendben gyengíthet, lásd lent a figyelmeztetést. |
| `OFFLOAD_ACCEPTANCE_RECALL` | `0.8` | `0.8` | `0.8` | COCALC-280 (LOCAL-3) — nem thoroughness-függő, minden profilon azonos szállított alapérték; lásd lent "OFFLOAD_ACCEPTANCE_* és OFFLOAD_AUTO_PROMOTE". |
| `OFFLOAD_ACCEPTANCE_MAX_INVALID_PATHS` | `0` | `0` | `0` | COCALC-280 (LOCAL-3) — nem thoroughness-függő, minden profilon azonos szállított alapérték; lásd lent. |
| `OFFLOAD_AUTO_PROMOTE` | `suggest` | `suggest` | `suggest` | COCALC-280 (LOCAL-3) — nem thoroughness-függő, önálló tengely a `WORKFLOW_PROFILE`-tól; lásd lent. |
| `LOCAL_MODEL_ENDPOINT` | `http://localhost:11434` | `http://localhost:11434` | `http://localhost:11434` | COCALC-220 (LOCAL-1) — a helyi LLM-szerver base URL-je, nem thoroughness-függő, minden profilon azonos. |
| `LOCAL_MODEL_NAME` | `llama3` | `llama3` | `llama3` | COCALC-220 (LOCAL-1) — a hívandó helyi modell neve; profilonkénti konkrét modellválasztást (pl. kisebb vs. nagyobb modell) a `call-local-model.sh`-t ténylegesen bekötő LOCAL-2/LOCAL-3 ticket finomíthatja, addig egységes alapérték. |
| `LOCAL_MODEL_TIMEOUT` | `15` | `30` | `60` | COCALC-220 (LOCAL-1) — `curl --max-time` másodpercben; `cheap` gyorsan bukjon el és essen vissza, `genius` toleránsabb egy lassabb helyi válaszra. |
| `LOCAL_MODEL_DIALECT` | `auto` | `auto` | `auto` | COCALC-220 (LOCAL-1) — Ollama/OpenAI-kompatibilis dialektus auto-felismerése; nem thoroughness-függő. |
| `LOCAL_MODEL_FALLBACK_POLICY` | `validate-and-fallback` | `validate-and-fallback` | `retry-then-fallback` | COCALC-220 (LOCAL-1) — `genius` inkább újrapróbálkozik kemény hiba esetén, mielőtt fallbackelne, `cheap`/`balanced` egy kísérlet után dönt. |
| `LOCAL_MODEL_BREAKER_THRESHOLD` | `1` | `2` | `3` | COCALC-220 (LOCAL-1) — hány egymást követő sikertelen kísérlet után nyisson a circuit breaker; `cheap` gyorsan lemond a helyi modellről, `genius` tovább próbálkozik. Csak a valódi híváskísérletek (`success`, `validation_failed`, `hard_error`) számítanak: a nyitott breaker alatt írt `breaker_open` sorok kihagyott hívások, nem tartják nyitva a breakert. |
| `LOCAL_MODEL_BREAKER_COOLDOWN` | `900` | `900` | `900` | A nyitott circuit breaker lehűlési ideje másodpercben (env-változó, a `call-local-model.sh` olvassa; nem thoroughness-függő). A legutóbbi sikertelen kísérlet után ennyi idővel a breaker **félig nyitott** lesz, és egy próbahívást enged: siker zárja, hiba (új sikertelen kísérlet a naplóban) újabb lehűlésre nyitja. Nyitva a hibaüzenet megmondja, hány másodperc múlva jön a próbahívás. `0` = minden hívás próbahívás (a breaker nem blokkol); nem egész érték → exit 2. A próbahívás nincs zárolva: ha ugyanabba a naplóba párhuzamosan több hívás fut, a lejárat után mindegyik próbálkozhat. Előzmény: 2026-11-09-én két 11-06-i `validation_failed` miatt minden `repo-scanner`-hívás `breaker_open`-t kapott, mert a lejárat nélküli breaker a saját `breaker_open` soraival tartotta magát nyitva. |
| `LOCAL_MODEL_MAX_RETRIES` | `0` | `1` | `3` | COCALC-220 (LOCAL-1) — `retry-then-fallback` policy esetén ennyi újrapróbálkozás kemény hibánál; a policy-t magát a `LOCAL_MODEL_FALLBACK_POLICY` sor adja profilonként. |
| `LOCAL_MODEL_THINK` | `auto` | `auto` | `auto` | LOCAL-5 — a `call-local-model.sh` env-változója (pl. a `.claude/settings.local.json` `env` blokkjában állítható), nem thoroughness-függő. `auto` = a kérés nem küld `think` mezőt (a modell alapértelmezése érvényes); `off` = `"think": false` (gondolkodó modelleknél, pl. qwen3.6, gyors); `on` = `"think": true`. Lásd lent "### LOCAL_PHASES és a lokál fázis-bekötés". |
| `LOCAL_MODEL_NUM_CTX` | *(nincs)* | *(nincs)* | *(nincs)* | LOCAL-5 — env-változó. Ha szám, Ollamánál a kérés `options.num_ctx` értéke; egyébként a modell (Modelfile) értéke marad. |
| `LOCAL_MODEL_FORMAT` | *(nincs)* | *(nincs)* | *(nincs)* | LOCAL-5 — env-változó. `json` -> Ollamánál `"format": "json"` (a kimenet szintaktikailag érvényes JSON-ra kényszerítve). Gondolkodás bekapcsolt (`LOCAL_MODEL_THINK=on`) állapotban érdemes használni: nélküle az élő próbában érvénytelen escape-ű JSON jött. |
| `LOCAL_PHASES` | `implementer,repo-scanner` | `implementer,repo-scanner` | `implementer,repo-scanner` | LOCAL-5 — vesszős lista: mely fázisoknál engedett egyáltalán a `local` szint (`implementer`, `repo-scanner`, `qa-tester`; a `code-reviewer`-nek nincs lokál-szerződése). Az `OFFLOAD_PROFILE` keretén **belül** érvényes, nem nyit ki semmit `off` mellett. Lásd lent. |
| `LOCAL_PROMPT_MAX_CHARS` | `90000` | `90000` | `90000` | LOCAL-5 — a hívó fő szál által a helyi modellnek összeállított prompt karakter-felső korlátja (a modell kontextusa véges: 32768 token ≈ 90–100k karakter magyar/kód vegyes szövegnél). Ha nem fér bele, a fázis nem megy helyre, hanem Claude-on fut. |
| `LOCAL_EXECUTOR_HOST` | `main` | `main` | `main` | ORD-365 (4.25.0) — nem thoroughness-függő, önálló tengely: ki vezérli a `local` szintű lépéseket (A6 implementer, A7 lokál `fast` kapu) — a fő szál vagy egy `local-runner` subagent. Lásd lent "### LOCAL_EXECUTOR_HOST értékek". |
| `RUN_METRICS` | `off` | `off` | `off` | ORD-376 — nem thoroughness-függő; lásd ### RUN_METRICS értékek |
| `RUN_METRICS_STORE` | `~/.dev-workflow/metrics/runs.jsonl` | `~/.dev-workflow/metrics/runs.jsonl` | `~/.dev-workflow/metrics/runs.jsonl` | ORD-376 — nem thoroughness-függő; lásd ### RUN_METRICS értékek |
| `RUN_METRICS_MIN_SAMPLES` | `3` | `3` | `3` | ORD-376 — nem thoroughness-függő; lásd ### RUN_METRICS értékek |
| `RUN_METRICS_EXCLUDE_ANOMALIES` | `on` | `on` | `on` | ORD-376 — nem thoroughness-függő; lásd ### RUN_METRICS értékek |
| `LOCAL_HW_PROFILE` | *(üres)* | *(üres)* | *(üres)* | ORD-376 — nem thoroughness-függő; lásd ### RUN_METRICS értékek |
| `THREAT_MODEL_INTAKE` | `auto` | `auto` | `auto` | COCALC-275 (SKILL-2) — nem thoroughness-függő, minden profilon azonos szállított alapérték; lásd lent "### THREAT_MODEL_INTAKE értékek". |
| `THREAT_MODEL_STRATEGY` | `hybrid` | `hybrid` | `hybrid` | COCALC-275 (SKILL-2) — nem thoroughness-függő, minden profilon azonos szállított alapérték; lásd lent "### THREAT_MODEL_STRATEGY értékek". |
| `THREAT_MODEL_AUTONOMY` | `ask` | `ask` | `ask` | COCALC-275 (SKILL-2) — nem thoroughness-függő, minden profilon azonos szállított alapérték; lásd lent "### THREAT_MODEL_AUTONOMY értékek". |
| `NFR_INTAKE` | `auto` | `auto` | `auto` | Itt vezetve be (COCALC-362, a COCALC-360 sub-taskja) — nem thoroughness-függő, minden profilon azonos szállított alapérték; lásd lent "### NFR_INTAKE/NFR_STRATEGY/NFR_AUTONOMY értékek". |
| `NFR_STRATEGY` | `hybrid` | `hybrid` | `hybrid` | Itt vezetve be (COCALC-362, a COCALC-360 sub-taskja) — nem thoroughness-függő, minden profilon azonos szállított alapérték; lásd lent "### NFR_INTAKE/NFR_STRATEGY/NFR_AUTONOMY értékek". |
| `NFR_AUTONOMY` | `ask` | `ask` | `ask` | Itt vezetve be (COCALC-362, a COCALC-360 sub-taskja) — nem thoroughness-függő, minden profilon azonos szállított alapérték; lásd lent "### NFR_INTAKE/NFR_STRATEGY/NFR_AUTONOMY értékek". |
| `DISCOVERY_DEPTH` | `off` | `light` | `full` | COCALC-368 (a COCALC-366 sub-taskja) — lásd lent "### DISCOVERY_DEPTH értékek". |
| `ARCHITECT_INTAKE` | `off` | `auto` | `always` | COCALC-385 (a COCALC-383 sub-taskja) — lásd lent "### ARCHITECT_INTAKE értékek". |
| `ARCHITECT_TARGET_EXECUTOR` | `claude` | `claude` | `claude` | COCALC-398 (4.19.0) — nem thoroughness-függő, önálló tengely (milyen végrehajtóra szabja az `architect` a lépéslista részletességét), minden profilon azonos szállított alapérték; lásd lent "### ARCHITECT_TARGET_EXECUTOR értékek". |

Ahogy a fenti kapcsolókat bevezető ticketek elkészülnek, a hozzájuk tartozó sor
`*(még nincs implementálva)*` cellái konkrét értékre cserélendők, és a kapcsolót
implementáló skill saját "## Konfiguráció" szekciója innen, erről a táblázatról olvassa a
profil szerinti értéket (lásd lent "Konvenció" szakasz).

### Explicit egyedi felülbírálás

Ha egy felhasználó vagy egy skill egy konkrét kapcsolót **explicit** (nem a
`WORKFLOW_PROFILE` presetjén keresztül) állít be — pl. a config.md-ben közvetlenül felülírt
érték, vagy egy session-szintű, a felhasználó által kimondott kérés ("erre a ticketre
maradjunk `cheap`-en, de a gate-et vidd `genius`-ra") —, az az explicit érték **mindig
felülírja** a preset-táblából adódó értéket, a `WORKFLOW_PROFILE` globális beállításától
függetlenül. A preset csak a hallgatólagos alapértelmezést adja, nem korlátoz.

**Feloldási sorrend** (a [`scripts/config-value.sh`](scripts/config-value.sh) valósítja meg):
környezeti változó > explicit tábla-sor > a fenti preset-tábla a `WORKFLOW_PROFILE` szerinti
oszlopából > a hívó szkript beégetett alapértéke. Explicit forrás csak egy `Változó` /
`Kapcsoló` fejlécű tábla olyan sora, amelynek első cellájában a kulcs áll backtickben, és
amelyet **nem** követ üres első cellás folytatósor (az ilyen kulcssor értékfelsorolás, nem
beállított érték). A "Lehetséges érték" fejlécű táblák dokumentációk, nem források. A
preset-tábla cellája csak akkor érték, ha pontosan egy backticked tokent tartalmaz
(`*(nincs)*`, `lásd ...`, nyilas cella nem).

### Konvenció — hogyan deklarál egy skill egy egyedi kapcsolót

1. A kapcsolót bevezető ticket implementációja **ide**, a fenti preset-táblába vegye fel a
   sort (ha még csak helyfoglaló volt, cserélje ki a `*(még nincs implementálva)*` cellákat
   a tényleges cheap/balanced/genius értékekre; ha teljesen új kapcsoló, vegyen fel egy új
   sort és — ha van hozzá dedikált gazda-ticket a jövőben — hivatkozzon rá az utolsó
   oszlopban, egyébként írja, hogy "itt vezetve be").
2. A kapcsolót ténylegesen használó skill/subagent saját `## Konfiguráció` szekciójában
   sorolja fel, hogy ezt a kapcsolót olvassa, és utasítsa magát: "olvasd be a
   `WORKFLOW_PROFILE` értékét, nézd meg, van-e explicit felülírás erre a kapcsolóra, ha
   nincs, a preset-táblából vedd az értéket".
3. Ne duplikáld az egyes profil-értékek jelentését (mit csinál cheap/balanced/genius
   konkrétan az adott kapcsolónál) ebben a fájlban — az a kapcsolót bevezető skill saját
   dokumentációjába való, ez a fájl csak a *melyik profil melyik értéket adja* leképezést
   tartja.

### INTERVIEW_EXPLANATION_STYLE

> ℹ️ **Tudatos kivétel a fenti "Konvenció" 3. pontja alól**: ez a kapcsoló nem egy külön
> bevezető skillben dokumentálja, mit csinál konkrétan `verbose` vs `terse` — mert nincs
> önálló bevezető ticketje/skillje, maga ez a config.md a kanonikus doksija. A 3. pont
> ("ne duplikáld a profil-értékek jelentését ebben a fájlban") ezért itt nem alkalmazható:
> nincs hova kiszervezni.

| Változó | Alapérték | Leírás |
|---|---|---|
| `INTERVIEW_EXPLANATION_STYLE` | `verbose` | Az interjú-jellegű skillek (`story-interview`, és az őt hívó `dev-workflow-scoping`/`dev-workflow-intake`) döntési opcióinak kifejtettsége. `verbose` esetén minden felkínált döntési opció kap konkrét példát és a választás következményének 1 mondatos leírását; `terse` esetén elég a tömör, felsorolás-szintű opcialista, magyarázat nélkül. Ez egy önálló, a `WORKFLOW_PROFILE`-tól függetlenül is explicit állítható kapcsoló — a fenti preset-tábla csak a hallgatólagos alapértelmezését adja (`cheap` → `terse`, `balanced`/`genius` → `verbose`), de bármikor felülírható közvetlenül, a profil megváltoztatása nélkül is. |

### INTERVIEW_DEPTH értékek

> ℹ️ **Bevezetve (COCALC-355)**: a kapcsolót ténylegesen használó skill a
> [`../story-interview/SKILL.md`](../story-interview/SKILL.md) — az egyes értékek melletti
> tényleges interjú-viselkedés (hipotézis+konfidencia, tipp-kötelezettség, "want vs. should
> want" szonda) ott van kifejtve, itt csak az értékek jelentése (a fenti "Konvenció" 3.
> pontja szerint). Ez egy **önálló tengely**: a `WORKFLOW_PROFILE`-tól függetlenül is
> explicit állítható, és ha explicit be van állítva, **elsőbbséget élvez** a fenti
> preset-tábla szerinti hallgatólagos értékkel szemben (lásd fent "Explicit egyedi
> felülbírálás").

| Érték | Jelentés |
|---|---|
| `fast` | Rövidebb, kevesebb kérdéses interjú-kör — max 2-3 kérdés/kör, mindegyik kötelező konkrét tippel; a hipotézis+konfidencia jelzés csak a kör legelején, egyszer hangzik el; a "want vs. should want" szonda kimarad. Az explicit jóváhagyási kapu (a DoR Spec csak explicit jóváhagyás után zárható) ebben a módban is megmarad. |
| `thorough` | A mai, alapos interjú-viselkedés — minden kérdés-kör hipotézissel és konfidencia-becsléssel indul (70% alatt kimondva, mi hiányzik még), egyszerre egy kérdés megy ki kötelező tippel és egymondatos indoklással, és legalább egyszer elhangzik a "want vs. should want" szonda, ha a felhasználó best-practice indoklással él. |

**Fallback-szabály** (a `WORKFLOW_PROFILE` fallback-szabályának mintájára): ismeretlen/
elgépelt `INTERVIEW_DEPTH` érték → visszaesés `thorough`-ra, egysoros jelzéssel; hiányzó
érték esetén ez csendben történik. A skill nem akad el emiatt.

### DISCOVERY_DEPTH értékek

> ℹ️ **Bevezetve (COCALC-368, a COCALC-366 sub-taskja)**: a kapcsolót ténylegesen használó
> skill a [`../dev-workflow-discovery/SKILL.md`](../dev-workflow-discovery/SKILL.md) — az
> egyes értékek melletti tényleges keretező lépés-tartalom (a hét light-elem, a full mód
> alternatíva-generálása és stressz-tesztje) ott van kifejtve, itt csak az értékek
> jelentése (a fenti "Konvenció" 3. pontja szerint). Ez egy **önálló tengely**: a
> `WORKFLOW_PROFILE`-tól függetlenül is explicit állítható, és ha explicit be van
> állítva, **elsőbbséget élvez** a fenti preset-tábla szerinti hallgatólagos értékkel
> szemben (lásd fent "Explicit egyedi felülbírálás").

| Érték | Jelentés |
|---|---|
| `off` | A discovery skill nem fut — a `dev-workflow-scoping` "1. Kezdeti scope-felmérés" lépése a mai (a discovery skill bevezetése előtti) módon viselkedik, csendben, jelzés nélkül, mintha ez a kapcsoló nem is létezne. |
| `light` | Keretező kör fut: problémaállítás ("How Might We" formában), szereplők, "miért most", siker mércéje, kötő korlátok, "Not doing" lista (mit nem csinálunk és miért), feltételezés-térkép (mire fogadunk; mi dönthetné meg; mit hagyunk tudatosan figyelmen kívül). |
| `full` | Minden, ami a `light`-ban van, **plusz**: 5-8 alternatív irány generálása megnevezett lencsékkel (inverzió, constraint-elvétel, egyszerűsítés, közönségváltás, 10x skálázás), klaszterezés 2-3 irányba, és irányonkénti stressz-teszt (valódi fájdalmat old-e meg; megvalósítható-e a meglévő stackkel; miben más). |

**Fallback-szabály** (az `INTERVIEW_DEPTH` fallback-szabályának mintájára): ismeretlen/
elgépelt `DISCOVERY_DEPTH` érték → visszaesés `light`-ra, egysoros jelzéssel; hiányzó
sor esetén ez csendben történik. A `dev-workflow-scoping` skill nem akad el emiatt.

### WORKING_LANGUAGE

> ℹ️ **Tudatos kivétel a fenti "Konvenció" 3. pontja alól** (az `INTERVIEW_EXPLANATION_STYLE`
> mintájára): ennek a kapcsolónak sincs önálló bevezető ticketje/skillje, maga ez a
> config.md a kanonikus doksija.

| Változó | Alapérték | Leírás |
|---|---|---|
| `WORKING_LANGUAGE` | `magyar` | Az interjú-jellegű Jira-ticket-létrehozó skillek (`jira-ticket`) munkanyelve — ezen a nyelven folytatják az interjút és írják a ticket szövegét, hacsak a felhasználó explicit másképp nem kéri. Ez egy önálló, a `WORKFLOW_PROFILE`-tól függetlenül is explicit állítható kapcsoló — a fenti preset-tábla csak a hallgatólagos alapértelmezését adja (jelenleg minden profilon `magyar`), de bármikor felülírható közvetlenül, a profil megváltoztatása nélkül is. |

### CHANGELOG_MODE

> ℹ️ **Tudatos kivétel a fenti "Konvenció" 3. pontja alól** (a `WORKING_LANGUAGE`
> mintájára): ennek a kapcsolónak sincs önálló bevezető skillje — a hozzá tartozó
> changelog-generátor skill/szkript egy későbbi ticketben kerül bevezetésre, addig maga ez
> a config.md a kanonikus doksija.

| Változó | Alapérték | Leírás |
|---|---|---|
| `CHANGELOG_MODE` | `offline` | Azt dönti el, honnan jön a ticket-lista a changelog-generáláshoz. `offline` (alap): kizárólag lokális git + GitLab MR-adat; a changelog-sor a branch-név 3 szavas összefoglalójából épül — ez az alapértelmezés, mert a workflow Jira-hozzáférése az Atlassian MCP-n megy, ami csak az agentnek elérhető, egy önálló szkript nem éri el. `enriched`: az agent a futás során Atlassian MCP-vel (`searchJiraIssuesUsingJql`) hozzáteszi a valódi ticket-címeket. `standalone`: a szkript maga kérdezi a Jirát egy saját API tokennel — agent nélkül, CI-ból is futtathatóan; ehhez külön Jira API token szükséges, ami a `GITLAB_TOKEN_AI` mintájára env-változóból jön, sosem a repóból. Ismeretlen/elgépelt érték esetén a definiált viselkedés (a jövőbeli generátor kontraktusa): visszaesés az alapértelmezésre (`offline`), kiírt figyelmeztetéssel — nem néma hiba. |

### CHANGELOG_STYLE

> ℹ️ **Tudatos kivétel a fenti "Konvenció" 3. pontja alól** (a `WORKING_LANGUAGE`
> mintájára): ennek a kapcsolónak sincs önálló bevezető skillje — a hozzá tartozó
> changelog-generátor skill/szkript egy későbbi ticketben kerül bevezetésre, addig maga ez
> a config.md a kanonikus doksija.

| Változó | Alapérték | Leírás |
|---|---|---|
| `CHANGELOG_STYLE` | `hu-dev` | A changelog-sorok nyelvét és hangvételét dönti el. `hu-dev` (alap): magyar, fejlesztői hangvétel (feltehetően a ticket cím közeli másolata/tömörítése) — ez az alapértelmezés, mert ez áll legközelebb a Jira ticket címéhez (az LLM másol/tömörít, nem értelmez, így kisebb a hallucináció-esély), és a repó többi dokumentációja is magyar. `hu-user`: magyar, végfelhasználónak szóló, kevésbé technikai megfogalmazás. `en-standard`: angol, sztenderd changelog-hangvétel. Ismeretlen/elgépelt érték esetén a definiált viselkedés (a jövőbeli generátor kontraktusa): visszaesés az alapértelmezésre (`hu-dev`), kiírt figyelmeztetéssel — nem néma hiba. |

### CODE_SCAN_INTAKE értékek

> ℹ️ **Bevezetve (COCALC-219), háromértékűre bővítve (COCALC-270)**: a kapcsolót
> ténylegesen használó skill a `dev-workflow-intake/SKILL.md` "2.a — Kiindulási állapot
> felderítés" lépése — az orchestrálás lépésről lépésre ott van kidolgozva, itt csak az
> egyes értékek jelentése.

| Érték | Jelentés |
|---|---|
| `off` | Nincs kódfelderítés — a ticket "Kiindulási állapot" szekciója "Felderítés: kihagyva (CODE_SCAN_INTAKE=off)" jelzést kap. |
| `auto` | Olcsó, előzetes `Glob` fut a ticket témájára/kulcsszavaira, **mielőtt** bármelyik felderítő subagent elindulna. Ha ez nulla találatot ad, a subagentek el sem indulnak — a szekcióba a "Nincs meglévő implementáció ezen a területen" sor kerül, ugyanúgy, mintha a subagentek futottak volna és nem találtak volna semmit. Ha van legalább egy találat, ugyanaz az orchestrálás fut, mint `always`-nél. |
| `always` | A `CODE_SCAN_STRATEGY` szerinti felderítő subagentek mindig elindulnak, előzetes olcsó Glob-szűrés nélkül. |

### CODE_SCAN_STRATEGY értékek

> ℹ️ **Bevezetve (COCALC-270, SCAN-1)**: a kapcsolót ténylegesen használó skill a
> `dev-workflow-intake/SKILL.md` "2.a" lépése és az általa indított
> `dev-workflow-intake/repo-scanner.md` felderítő subagent — a tényleges orchestrálási
> lépések ott vannak kidolgozva. Ez a szekció **tudatos, részleges kivétel** a fenti
> "Konvenció" 3. pontja alól: a három érték *jelentését* (nem a lépésenkénti
> orchestrálást) itt is ki kell mondani, mert a `dynamic` érték biztonsági-háló-hiánya
> olyan figyelmeztetés, aminek a kapcsoló szintjén, a config.md-ben is szerepelnie kell,
> nem csak a hívó skill lépéseiben.

| Érték | Jelentés |
|---|---|
| `hybrid` | Egy fix "repo-térkép" felderítő (stack, mappastruktúra, belépési pontok, tesztek helye) **és** 2-3 téma-alapú felderítő **egyszerre, párhuzamosan** indul, előre rögzített kérdéslistával — a `CODE_SCAN_MAX_AGENTS` felső korláttal (a repo-térkép felderítőt is beleszámítva). |
| `dynamic` | **Csak** téma-alapú felderítők indulnak, a fix repo-térkép felderítő **nélkül**. ⚠️ Emiatt a hybrid módban meglévő biztonsági háló (a repo-térkép mindig lefut, függetlenül attól, hogy a téma-alapú kérdések célt találnak-e) `dynamic` módban **nincs meg** — ha egyik téma-alapú felderítő sem talál semmit, nincs tartalék forrás, ami legalább az alap stack/mappastruktúra-képet adná. |
| `layered` | Két hullámban, **szekvenciálisan** fut (nem párhuzamosan, mint a `hybrid`): (1) először kizárólag a fix repo-térkép felderítő fut önállóan; (2) ennek eredménye alapján a fő szál dönti el/finomítja, mely téma-alapú felderítők induljanak a második hullámban (pl. ha a repo-térkép szerint nincs is olyan terület, ami egy tervezett téma-kérdéshez kapcsolódna, azt a kérdést el sem indítja vagy átfogalmazza) — a második hullám tehát a repo-térkép leletére épül, nem előre rögzített kérdéslistára. A `CODE_SCAN_MAX_AGENTS` felső korlát itt is érvényes, a fix felderítőt beleszámítva. |

### CODE_SCAN_VERIFY értékek

> ℹ️ **Bevezetve (COCALC-259, PLAN-1)**: a kapcsolót ténylegesen használó skill a
> `agents/implementer.md` "1a. Frissesség-ellenőrzés (CODE_SCAN_VERIFY)"
> lépése — az orchestrálás lépésről lépésre ott van kidolgozva, itt csak az egyes értékek
> jelentése.

| Érték | Jelentés |
|---|---|
| `on` | `git diff` fut a ticket "Kiindulási állapot" szekciójában rögzített commit SHA és a jelenlegi állapot között, majd a diff által jelzett fájlok célzott LLM-újraolvasása történik — vagy, ha a ticketnek nincs "Kiindulási állapot" szekciója/SHA-ja, felderítés indul helyette. |
| `git-only` | Csak a `git diff --name-only` fut le (mely fájlok változtak a SHA óta), LLM-alapú újraolvasás **nélkül** — a terv a diff eredményét jelzi, és explicit megjegyzi, hogy a felderítés emiatt elavult lehet. |
| `off` | A mai mód — nincs frissesség-ellenőrzés, nincs felderítés a "Kiindulási állapot" szekció ellenőrzésére, a terv annyit használ, amennyit a ticket leírása eleve tartalmaz. |

### THREAT_MODEL_INTAKE értékek

> ℹ️ **Bevezetve (COCALC-275, SKILL-2)**: a kapcsolót ténylegesen használó skill a
> [`../story-interview/SKILL.md`](../story-interview/SKILL.md) DoR-interjú "Biztonsági
> kockázatok" lépése és az őt hívó
> [`../dev-workflow-intake/SKILL.md`](../dev-workflow-intake/SKILL.md) "2.c —
> Fenyegetés-modellezés" lépése — az orchestrálás lépésről lépésre ott van kidolgozva, itt
> csak az egyes értékek jelentése. A kockázati kategóriák forrása a
> [`../story-interview/threat-catalog.md`](../story-interview/threat-catalog.md).

| Érték | Jelentés |
|---|---|
| `off` | Nincs fenyegetés-modell — a DoR Spec "Biztonsági kockázatok" mezője `N/A (THREAT_MODEL_INTAKE=off)` jelzést kap, és a ticketre **nem** kerül "Biztonsági megfontolások" szekció. |
| `auto` | Olcsó, jel-alapú előszűrő fut a story leírásán a `threat-catalog.md` kategóriáinak "Mikor releváns" jelzőszavaival. Ha **egyetlen** kategória sem talál kiváltó jelet, a modell nem fut tovább — a DoR Spec mezője `N/A (nem talált relevánsat)`, szekció nélkül. Ha legalább egy kategória releváns, ugyanaz fut, mint `always`-nél, a `THREAT_MODEL_STRATEGY` szerint. |
| `always` | A fenyegetés-modell **mindig** lefut, előszűrés nélkül, a `THREAT_MODEL_STRATEGY` szerint. Ha a végén nincs egyetlen releváns kockázat sem, a DoR Spec mezője `N/A (nem talált relevánsat)` — szekció ekkor sem kerül a ticketre. |

**Fallback-szabály** (a `WORKFLOW_PROFILE` fallback-szabályának mintájára): ismeretlen/
elgépelt `THREAT_MODEL_INTAKE` érték → visszaesés a szállított alapértékre (`auto`), rövid
jelzéssel; hiányzó érték esetén ez csendben történik. A skill nem akad el emiatt.

### THREAT_MODEL_STRATEGY értékek

> ℹ️ **Bevezetve (COCALC-275, SKILL-2)**: a kapcsolót ténylegesen a
> [`../dev-workflow-intake/SKILL.md`](../dev-workflow-intake/SKILL.md) "2.c" lépése
> olvassa — az orchestrálás ott van, itt csak az értékek jelentése.

| Érték | Jelentés |
|---|---|
| `checklist` | A fenyegetés-modell **kizárólag** a `threat-catalog.md` nyolc kategóriáját járja végig — a modell nem vehet fel katalóguson kívüli kockázatot. |
| `hybrid` | A katalógus nyolc kategóriája **plusz** a modell felvehet katalóguson kívüli kockázatot is, de **kötelező** hozzá egymondatos indoklás (a kategória "Katalóguson kívüli megfontolás" horgánál). |
| `llm` | Tisztán modell-ítélet — a katalógus csak informális támpont. A `threat-model-fixture.md` "Várt minimum" elvárása ebben a módban **nem garantált** (tudatos; az átvételi próba csak `checklist`/`hybrid`-re köt). |

**Fallback-szabály**: ismeretlen/elgépelt `THREAT_MODEL_STRATEGY` érték → visszaesés a
szállított alapértékre (`hybrid`), rövid jelzéssel; hiányzó érték esetén csendben. A skill
nem akad el.

### THREAT_MODEL_AUTONOMY értékek

> ℹ️ **Bevezetve (COCALC-275, SKILL-2)**: a kapcsolót ténylegesen a
> [`../dev-workflow-intake/SKILL.md`](../dev-workflow-intake/SKILL.md) "2.c" lépése
> olvassa — az orchestrálás ott van, itt csak az értékek jelentése.

| Érték | Jelentés |
|---|---|
| `ask` | Minden javasolt biztonsági AC **külön jóváhagyást** kér a felhasználótól, mielőtt bekerülne az AC-listába. |
| `notify` | A modell felveszi a javasolt biztonsági AC-ket, de **tételesen listázza** őket a felhasználónak (mit vett fel és miért). |
| `auto` | A modell felveszi a biztonsági AC-ket, és **nem kérdez** külön. |

Mindhárom szint kötelezően betartja: ha egy azonosított kockázatból **nem** lesz AC, az
egymondatos indoklással a ticket "Biztonsági megfontolások" szekciójába kerül — ezt az
`auto` szint **sem** hagyhatja el.

**Fallback-szabály**: ismeretlen/elgépelt `THREAT_MODEL_AUTONOMY` érték → visszaesés a
szállított alapértékre (`ask`), rövid jelzéssel; hiányzó érték esetén csendben. A skill
nem akad el.

### NFR_INTAKE értékek

> ℹ️ **Bevezetve (COCALC-362, a COCALC-360 sub-taskja)**: a kapcsolót ténylegesen
> használó skill a [`../dev-workflow-intake/SKILL.md`](../dev-workflow-intake/SKILL.md)
> leendő "2.d" lépése és a [`../story-interview/SKILL.md`](../story-interview/SKILL.md) —
> ez a ticket (COCALC-362) csak a bekötést végzi, az orchestrálás lépésről lépésre a
> COCALC-364-ben kerül kidolgozásra, itt csak az egyes értékek jelentése. A kategóriák
> forrása az [`../story-interview/nfr-catalog.md`](../story-interview/nfr-catalog.md).

| Érték | Jelentés |
|---|---|
| `off` | Nincs NFR-modell — a DoR Spec vonatkozó mezője `N/A (NFR_INTAKE=off)` jelzést kap, és a ticketre **nem** kerül NFR-vonatkozó szekció. |
| `auto` | Olcsó, szűk jel-alapú előszűrő fut a story leírásán az `nfr-catalog.md` öt kategóriájának jelzőszavaival. Ha **egyetlen** kategória sem talál kiváltó jelet, a modell nem fut tovább — a mező `N/A (nem talált relevánsat)`, szekció nélkül. Ha legalább egy kategória releváns, ugyanaz fut, mint `always`-nél, a `NFR_STRATEGY` szerint. |
| `always` | Az NFR-modell **mindig** lefut, előszűrés nélkül, a `NFR_STRATEGY` szerint. Ha a végén nincs egyetlen releváns NFR sem, a mező `N/A (nem talált relevánsat)` — szekció ekkor sem kerül a ticketre. |

**Fallback-szabály** (a `WORKFLOW_PROFILE` fallback-szabályának mintájára): ismeretlen/
elgépelt `NFR_INTAKE` érték → visszaesés a szállított alapértékre (`auto`), rövid
jelzéssel; hiányzó érték esetén ez csendben történik. A skill nem akad el emiatt.

### NFR_STRATEGY értékek

> ℹ️ **Bevezetve (COCALC-362, a COCALC-360 sub-taskja)**: a kapcsolót ténylegesen
> használó skill a [`../dev-workflow-intake/SKILL.md`](../dev-workflow-intake/SKILL.md)
> leendő "2.d" lépése és a [`../story-interview/SKILL.md`](../story-interview/SKILL.md) —
> ez a ticket (COCALC-362) csak a bekötést végzi, az orchestrálás lépésről lépésre a
> COCALC-364-ben kerül kidolgozásra, itt csak az egyes értékek jelentése.

| Érték | Jelentés |
|---|---|
| `checklist` | Az NFR-modell **kizárólag** az `nfr-catalog.md` öt kategóriáját járja végig — a modell nem vehet fel katalóguson kívüli NFR-t. |
| `hybrid` | A katalógus öt kategóriája **plusz** a modell felvehet katalóguson kívüli NFR-t is, de **kötelező** hozzá egymondatos indoklás. |
| `llm` | Tisztán modell-ítélet — a katalógus csak informális támpont. Az `nfr-fixture.md` "Várt minimum" elvárása ebben a módban **nem garantált** (tudatos; az átvételi próba csak `checklist`/`hybrid`-re köt). |

**Fallback-szabály**: ismeretlen/elgépelt `NFR_STRATEGY` érték → visszaesés a szállított
alapértékre (`hybrid`), rövid jelzéssel; hiányzó érték esetén csendben. A skill nem akad
el.

### NFR_AUTONOMY értékek

> ℹ️ **Bevezetve (COCALC-362, a COCALC-360 sub-taskja)**: a kapcsolót ténylegesen
> használó skill a [`../dev-workflow-intake/SKILL.md`](../dev-workflow-intake/SKILL.md)
> leendő "2.d" lépése és a [`../story-interview/SKILL.md`](../story-interview/SKILL.md) —
> ez a ticket (COCALC-362) csak a bekötést végzi, az orchestrálás lépésről lépésre a
> COCALC-364-ben kerül kidolgozásra, itt csak az egyes értékek jelentése.

| Érték | Jelentés |
|---|---|
| `ask` | Minden javasolt NFR-AC **külön jóváhagyást** kér a felhasználótól, mielőtt bekerülne az AC-listába. |
| `notify` | A modell felveszi a javasolt NFR-AC-ket, de **tételesen listázza** őket a felhasználónak (mit vett fel és miért). |
| `auto` | A modell felveszi az NFR-AC-ket, és **nem kérdez** külön. |

**Fallback-szabály**: ismeretlen/elgépelt `NFR_AUTONOMY` érték → visszaesés a szállított
alapértékre (`ask`), rövid jelzéssel; hiányzó érték esetén csendben. A skill nem akad el.

### PIPELINE_GATE_* kapcsolók

> ℹ️ **Bevezetve (COCALC-261, GATE-1)**: a kapcsolókat ténylegesen használó szkript a
> [`scripts/wait-for-pipeline.sh`](scripts/wait-for-pipeline.sh), a hívó orchestrálás a
> [`dev-workflow-execute/SKILL.md`](../dev-workflow-execute/SKILL.md) A7a és 9. lépése, a
> retry-szemantika a [`dev-workflow-execute/retry-and-escalation.md`](../dev-workflow-execute/retry-and-escalation.md)-ban.

Az alábbi tábla **dokumentáció**: a felsorolt kapcsolók lehetséges értékeit írja le, nem
beállított érték. A kapcsoló tényleges értékét a "Preset-tábla" (a `WORKFLOW_PROFILE` szerint),
vagy egy explicit felülírás adja.

| Kapcsoló | Lehetséges érték | Jelentés |
|---|---|---|
| `PIPELINE_GATE_BLOCKING_JOBS` | `rule` | Blokkoló minden job, ami **nem** `deploy`/`post-deploy`/`.pre` stage-ben van **és** nincs `allow_failure`-re állítva — ez a jelenlegi `.gitlab-ci.yml`-en `angular-build`, `frontend-test`, `backend-build`, `backend-test`. Ha később egy új, nem-allow_failure, nem-deploy/post-deploy/`.pre`-stage job kerül be (pl. code-quality/security-scan), automatikusan blokkolóvá válik, kézi módosítás nélkül. |
| | *explicit lista* | Vesszővel elválasztott, konkrét job-név lista (pl. `angular-build,backend-test`) — ha meg van adva, ez felülírja a fenti szabályt, a stage/allow_failure figyelmen kívül marad. |
| `PIPELINE_GATE_POSITION` | `before-review` | A kapu az MR-nyitás után, a 9. code review lépés **előtt** fut. Kompromisszum: LLM-spórolás (ha a pipeline piros, nem indul felesleges review-kör), de a felhasználó tovább vár a review-ra. |
| | `after-review` | A kapu a 9. code review lépés **után** fut. Gyorsabb visszajelzés a review-ra, de piros build esetén elpazarol egy review-kört (a review lefutott, mielőtt kiderült, hogy a build amúgy is piros). Lokál LLM esetén ez nem drágább, mert a review-kör költsége akkor nem API-kredit-alapú. |
| `PIPELINE_GATE_ON_RED` | `retry` | Az `implementer` javít → új push → a kapu újra lefut, `MAX_LOCAL_FIX_RETRIES` limittel — **saját, az A7-től és a 9. lépéstől független számlálóval**. |
| | `once-then-escalate` | Pontosan **egy** automatikus javítási kísérlet, utána — ha még mindig piros — fix-ticket (lásd `retry-and-escalation.md` "once-then-escalate" szemantika). |
| | `escalate` | Azonnal fix-ticket, retry kör nélkül. |
| `PIPELINE_GATE_ON_TIMEOUT` | `ask` | A `PIPELINE_GATE_TIMEOUT_MINUTES` (javasolt alapérték: 15) letelte után a kapu megáll és megkérdezi a felhasználót, hogyan tovább. |
| | `auto` | A `PIPELINE_GATE_ON_RED` ága szerint jár el kérdés nélkül (a timeoutot lényegében pirosként kezeli). |

A következő kapcsolók valódi, beállított értékek (a `config-value.sh` ezeket explicit értékként olvassa):

| Kapcsoló | Érték | Jelentés |
|---|---|---|
| `PIPELINE_GATE_TIMEOUT_MINUTES` | `15` | Felső korlát percben: ennyit vár a `wait-for-pipeline.sh` a blokkoló job-ok lezárulására, mielőtt a `PIPELINE_GATE_ON_TIMEOUT` ágra lépne. Egy futás legrosszabb esetben `PIPELINE_GATE_TIMEOUT_MINUTES × 60 / PIPELINE_GATE_POLL_SECONDS` lekérdezést küld. |
| `PIPELINE_GATE_POLL_SECONDS` | `45` | Két pipeline-lekérdezés közti várakozás másodpercben. Egy pipeline percekig fut, a sűrű lekérdezés csak a GitLab rate limitjét (HTTP 429) terheli: emelve kevesebb kérés, lassabb reakció a zöldre/pirosra; csökkentve gyorsabb reakció, több kérés. Minimum `1`. |
| `PIPELINE_GATE_STUCK_GRACE_SECONDS` | `120` | Ha egy blokkoló job legalább ennyi másodperce **elakadt** (`PENDING`, és a GitLab `stuck` jelzése szerint egyetlen online runner sem veheti fel: nem védett ref egy csak védett refeken futó runnerrel, hiányzó runner-tag, offline runner), a `wait-for-pipeline.sh` 4-es kilépőkóddal áll le („nincs alkalmas runner”), nem várja ki a timeoutot. A sorban állás (a runner foglalt) nem elakadás, arra a timeout érvényes. `0` = kikapcsolva. |
| `PIPELINE_GATE_PROTECTED_REF_CHECK` | `warn` | Push előtt a [`scripts/check-protected-ref.sh`](scripts/check-protected-ref.sh) a GitLab-projekt védett branch-mintáival veti össze a branchet. `warn` — nem védett branchnél figyelmeztet, a push megy; `stop` — nem védett branchnél a lépés megáll (2-es kilépőkód), a felhasználó dönt; `off` — nem ellenőriz. Ha a minták nem kérdezhetők le, csak jelez, nem blokkol. |
| `CI_READINESS_CHECK` | `on` | Egyszeri CI-készenlét ellenőrzés a [`scripts/check-ci-readiness.sh`](scripts/check-ci-readiness.sh)-val: `on` — a bootstrap és a `dev-workflow-execute` 0. lépése (és epic-módban az E1) futtatja; `off` — nem fut, a szkript maga is kilép egy „kikapcsolva” sorral. |
| `CI_READINESS_CHECKED` | `-` | Az ellenőrzés utolsó hibátlan lefutásának dátuma (`ÉÉÉÉ-HH-NN`), a `dev-workflow-execute` 0. lépése írja be. `-` = még nem futott: ilyenkor a 0. lépés lefuttatja. Epic-módban az E1 ettől függetlenül minden indításkor ellenőriz. |
| `CI_READINESS_MINUTES_LIMIT` | `auto` | A megosztott runnerek havi compute-perc kerete a figyelmeztetéshez. `auto` — a `namespaces/<id>` válasz `shared_runners_minutes_limit` értéke, ha van és > 0; ha nincs, és a csoport `plan`-je `free`, akkor 400; egyébként a keret ismeretlen (egy `OK` info-sor, nincs figyelmeztetés). Szám — explicit keret (percben); `0` — nincs korlát. |

A `check-ci-readiness.sh` a `REPO_MAP` minden repójára három dolgot néz (csak olvas, `glab api` GET): (1) van-e online, nem szüneteltetett runner, amely a `.gitlab-ci.yml` tagjeit felveheti (saját runnernél a `default: tags` kötelező); (2) ha a runner csak védett refeken fut (`ref_protected`), védettek-e a `<TICKET_NATURE_TAGS>/*` branch-minták és az alap branch; (3) megosztott runnernél elfogyott-e a csoport havi compute-perc kerete (80% fölött figyelmeztet; a keretet a `CI_READINESS_MINUTES_LIMIT` adja, ismeretlen keretnél nincs figyelmeztetés). `HIBA` (1-es kilépőkód) a hiányzó tag vagy védett minta, a nem lekérdezhető adat csak `FIGYELMEZTETÉS`; a javítási parancsokat kiírja, de soha nem futtatja. A szükséges branch-minták forrása a `TICKET_NATURE_TAGS` (`<jelleg>/*`) és az alap branch; egy szűkebb védett minta (pl. `feature/ORD-*`) nem fedi le a `feature/*`-ot, ezért a szkript konzervatívan `HIBA`-t ad rá.

A `wait-for-pipeline.sh` maga nem kérdez vissza (nincs interaktív csatornája) — a fenti
`ask`/`auto` döntést a hívó `SKILL.md` lépés hozza meg a szkript kilépőkódja (0 zöld, 1
fail closed, 2 piros, 3 timeout, 4 nincs alkalmas runner) alapján. A 4-es kód nem javítókör
és nem timeout: a lépés megáll, és a felhasználó dönt (a branch átnevezése a védett
mintára, a minta védetté tétele, vagy a runner beállítása — ez nem a workflow hatásköre).

A `PIPELINE_GATE_TIMEOUT_MINUTES` és a `PIPELINE_GATE_POLL_SECONDS` nem
thoroughness-profil-függő (minden profilon azonos), ezért nincs soruk a preset-táblában.
A `wait-for-pipeline.sh` mindkettőt (és a lenti "GitLab-API terhelés" értékeit) maga
olvassa ki ebből a fájlból ([`scripts/config-value.sh`](scripts/config-value.sh)) — a hívó
`SKILL.md` lépésnek nem kell env-változóként átadnia őket; egy futásra az azonos nevű
környezeti változó felülbírálja a fájlbeli értéket.

### GitLab-API terhelés (rate limit)

> ℹ️ **Itt vezetve be (4.22.0)**: a GitLab.com felhasználónként és végpont-típusonként
> perc alapú rate limitet alkalmaz, túllépésnél HTTP 429-et ad ("Rate limit exceeded"). Az
> AI-identitású hívások (`push-as-ai.sh`, `glab-note-as-ai.sh`) mind ugyanazt a tokent
> használják (`AI_GITLAB_TOKEN_ENV_VAR`), tehát egy számlálóra terhelődnek — a párhuzamos
> session-ök és worktree-k kérései összeadódnak. Az alábbi értékeket a szkriptek maguk
> olvassák ki ebből a táblából ([`scripts/config-value.sh`](scripts/config-value.sh)), ezért
> elég itt átírni őket; egy futásra az azonos nevű környezeti változó felülbírálja. Egyik
> érték sem thoroughness-profil-függő (minden profilon azonos), ezért nincsenek a
> preset-táblában. Érvénytelen (nem egész szám) érték esetén a szkript egysoros jelzéssel a
> szállított alapértékre esik vissza.

| Kapcsoló | Érték | Jelentés |
|---|---|---|
| `GITLAB_RATE_LIMIT_RETRIES` | `5` | Hányszor próbálja újra a `wait-for-pipeline.sh` és a `glab-note-as-ai.sh` a hívást, ha a GitLab 429-et ad. `0` = nincs újrapróbálás (az első 429-nél azonnal hiba). Az újrapróbálások kimerülése után a `wait-for-pipeline.sh` fail closed (1-es kilépőkód), a `glab-note-as-ai.sh` a glab eredeti hibáját és kilépőkódját adja vissza. |
| `GITLAB_RATE_LIMIT_BACKOFF_SECONDS` | `20` | Lineáris visszalépés alapja: az n-edik újrapróbálás előtt `n × ennyi` másodpercet vár (az alapértékkel 20, 40, 60, 80, 100 mp, összesen legfeljebb 5 perc). A GitLab limitjei percenként nullázódnak, ezért az első 2–3 várakozás általában elég. |
| `CODE_REVIEW_MAX_INLINE_COMMENTS` | `5` | A `code-reviewer` és a `gitlab-branch-review` legfeljebb ennyi soronkénti (inline diff) MR-kommentet posztol egy review-körben: súlyosság szerint az első ennyi (blocker, major, ...) kap inline kommentet, a többi csak az összesített kommentben szerepel. `0` = nincs inline komment, csak az összesített. Minden inline komment egy külön kérés, a komment-létrehozás szigorúbb limitjét terheli. |
| `TEST_ENV_DEPLOY_POLL_SECONDS` | `45` | Az `execute` A8 lépésében a deploy lefutására várakozó `glab ci status` ciklus két lekérdezése közti idő másodpercben. |
| `TEST_ENV_DEPLOY_WAIT_MINUTES` | `10` | Ugyanennek a ciklusnak a felső korlátja percben; ennyi után a lépés megáll és jelzi, hogy a deploy nem készült el, nem vár tovább. |

### LOCAL_GATE_MODE értékek

> ℹ️ **Bevezetve (COCALC-263, GATE-2)**: ez a kapcsoló mondja meg, **mit futtasson** az
> execute A7 helyi AC-ellenőrzés kapuja. A kapcsolót ténylegesen olvasó helyek a
> [`../../agents/qa-tester.md`](../../agents/qa-tester.md) 1. és 3. szakasza (automata
> teszt-kör, illetve manuális böngésző-kör elágazása) és a
> [`../dev-workflow-execute/SKILL.md`](../dev-workflow-execute/SKILL.md) A7 lépése (a
> `qa-tester` `local` hívása előtti elágazás, illetve a `none` mód feltétel nélküli
> push-/MR-útvonala) — a lépésenkénti orchestrálás ott van kidolgozva, itt csak az egyes
> értékek jelentése (a fenti "Konvenció" 3. pontja szerint).

| Érték | Jelentés |
|---|---|
| `fast` | Build + unit teszt + lint — **kötelező**, nem feltételes (COCALC-264, a COCALC-224 után). Rétegenként: frontend → a `frontend/package.json` `scripts` blokkjának `lint` parancsa (ha a script hiányzik, ez maga **blocker**, ugyanúgy indítja a javítókört, mint egy piros teszt); backend → a `./gradlew(.bat) build` lánc, ami a Gradle `check` taskján át már ma is feltétel nélkül futtatja a checkstyle/spotless-t. **Nincs** dev-szerver, **nincs** böngésző. A vizuális/interakciós AC-ket ez a mód nem tudja ellenőrizni; a `qa-tester` a záró visszajelzésében tételesen kimondja, mely AC-k maradtak így ellenőrizetlenül (nem állítja, hogy minden AC teljesült). |
| `full` *(alap)* | A mai teljes böngészős AC-kör, változatlanul — build/unit után dev-szerver indul, és a `qa-tester` 3. szakasza minden AC-t végigtesztel böngészőben. A keret bevezetése ezen a módon **semmit nem változtat**. |
| `none` | Nincs lokál kapu: a `SKILL.md` A7 lépése teljesen kimarad (a `qa-tester` meg sem hívódik), és a folyamat feltétel nélkül a 7a0 → 7a útvonalra (push + MR-nyitás) megy — ma ez csak a "7a — zöld" ágon történik. Push **előtt** a skill a `PIPELINE_GATE_BLOCKING_JOBS` szabályát alkalmazza a jelenlegi `.gitlab-ci.yml`-re; ha erre a pipeline-típusra (MR-pipeline) egyetlen blokkoló job sem futna, egy sorban figyelmeztet, hogy semmilyen automata kapu nem fut merge előtt. |

`none` mód alatt a `LOCAL_GATE_BROWSER_TARGET` értéke **figyelmen kívül marad** — nincs
böngészős kör, amit irányítani lehetne —, és ez **nem hiba**.

**Fallback-szabály** (a `WORKFLOW_PROFILE` / `LOCAL_ENV_ISOLATION` fallback-szabályának
mintájára): ismeretlen/elgépelt `LOCAL_GATE_MODE` érték → visszaesés a `balanced` preset
értékére (`full`), egysoros jelzéssel; hiányzó érték esetén ez csendben történik. A skill
nem akad el emiatt.

### LOCAL_GATE_BROWSER_TARGET értékek

> ℹ️ **Bevezetve (COCALC-263, GATE-2)**: ez a kapcsoló **külön tengely** a
> `LOCAL_GATE_MODE`-tól — az egyik azt mondja meg, *mi* fusson a lokál kapuban, ez azt,
> *hol* fusson a böngészős kör. A kapcsolót ténylegesen olvasó helyek ugyanazok
> ([`../../agents/qa-tester.md`](../../agents/qa-tester.md) 3. szakasza,
> [`../dev-workflow-execute/SKILL.md`](../dev-workflow-execute/SKILL.md) A7) — az
> orchestrálás ott van, itt csak az értékek jelentése.

| Érték | Jelentés |
|---|---|
| `local-dev-server` *(alap)* | A böngészős kör a lokál dev-szerver ellen fut (a mai viselkedés). A dev-szerver indítása/portja a `qa-tester.md` 2. szakasza = COCALC-257 (ENV-1) hatóköre — ehhez a kapcsoló nem nyúl. |
| `candidate-env` | *(Dokumentált helyfoglaló, a `LOCAL_ENV_ISOLATION=compose` sor mintájára.)* Given `LOCAL_GATE_BROWSER_TARGET=candidate-env`, When a böngészős kör indulna (`LOCAL_GATE_MODE=full`), Then érthető, "még nincs implementálva" hibával megáll (`"a candidate-env elleni böngészős kör még nincs implementálva, lásd COCALC-245 és a follow-up COCALC-265"`), és **NEM** próbál nem létező URL-t böngészni. |

Ez a kapcsoló csak akkor lép működésbe, ha ténylegesen van böngészős kör
(`LOCAL_GATE_MODE=full`) — `fast` alatt nincs böngészős kör, `none` alatt figyelmen kívül
marad (lásd fent).

**Fallback-szabály**: ismeretlen/elgépelt `LOCAL_GATE_BROWSER_TARGET` érték → visszaesés
az alapértékre (`local-dev-server`), egysoros jelzéssel; hiányzó érték esetén csendben. A
skill nem akad el.

### AGENT_CONTINUATION_MODE értékek

> ℹ️ **Bevezetve (COCALC-306)**: ezt a kapcsolót ténylegesen a
> [`../dev-workflow-execute/retry-and-escalation.md`](../dev-workflow-execute/retry-and-escalation.md)
> "Javítókör mechanika" szakasza olvassa (a hívó helyek: `SKILL.md` "7b — piros" és "9 —
> Code review" javítóköre) — az orchestrálás lépésről lépésre ott van kidolgozva, itt csak
> az egyes értékek jelentése.

| Érték | Jelentés |
|---|---|
| `off` | A javítókör minden egyes `implementer`-hívása friss `Agent`-hívás — a subagent minden körben újraolvassa a `config.md`/`architecture.md`/`conventions.md`-et és a teljes ticket-kontextust. Ez a kapcsoló bevezetése előtti, mai viselkedés. |
| `same-thread` | A javítókör **első** `implementer`-hívása friss `Agent`-hívás (ez adja a folytatáshoz szükséges `agentId`-t); a **második és minden további** hívás ugyanabban a javítókörben a `SendMessage` tool-lal folytatja ezt a szálat (a korábbi hívás `agentId`-jára hivatkozva), friss `Agent`-hívás helyett. A subagent így megtartja az előző kör kontextusát (mit javított, miért), és nem olvassa újra a `config.md`/`architecture.md`/`conventions.md`-et minden retry-nél. |

Validált, éles mintán bizonyított mechanizmus, **nem kísérleti**: egy párhuzamos
munkamenet ugyanazt az `implementer` subagentet hívta újra 5x egymás után
`SendMessage`-dzsel, kontextus-vesztés nélkül.

**Token-megtakarítás mérése — miért nincs itt tényleges `analyze.js` szám (COCALC-306,
review-javítás)**: az `AGENT_CONTINUATION_MODE=same-thread` mechanizmus ezzel a tickettel
kerül bevezetésre — **nincs korábbi session, ami valaha `same-thread` módban futott
volna**, tehát nincs meglévő "előtte" (`off`) / "utána" (`same-thread`) session-pár, amit
az `analyze.js`-szel (lásd
[`../../tools/session-cost-report/README.md`](../../tools/session-cost-report/README.md))
ténylegesen összevetve lehetne lefuttatni ebben a körben. Egy hiteles mérés két,
**egyébként azonos ticketen/AC-listán, csak ebben a kapcsolóban eltérő** valós
javítókört igényelne — ez a ticket a kapcsolót és az orchesztrálást szállítja, a tényleges
mérés **külön, follow-up lépés/ticket hatóköre**, miután lesz legalább egy éles
`same-thread` módban lefutott javítókör `report.json`-ja.

**Mit lehet addig is tudni** (módszertan, nem mért érték — csak a nagyságrend
szemléltetésére, nem a `config.md` normatív állítása): az `implementer` subagent minden
friss `Agent`-hívásnál beolvassa a `../skills/dev-workflow/config.md`-t (jelenleg kb.
126 KB) és a `docs/architecture.md` + `docs/conventions.md` párost (együtt kb. 19,5 KB) —
ez retry-onként durván **150 KB nyers fájltartalom**, amit a `same-thread` mód a 2.+
körtől elvileg kihagyna, mert a subagent már a saját korábbi szálának kontextusában van.
A pontos token-/dollár-hatás a fenti okok miatt **nem számszerűsíthető megbízhatóan** e
körben.

**Frissítés (amikor lesz valós `same-thread` session-adat)**: fusd le
`node .claude/tools/session-cost-report/analyze.js` egy `off` és egy `same-thread` módban
lezajlott, egyébként hasonló javítókörön, majd `analyze.js --aggregate` a két
`report.json`-ra — a `byModel`/fázisonkénti bontásból cseréld ki ezt a szakaszt tényleges
számokra.

**Fallback-szabály** (a `WORKFLOW_PROFILE` fallback-szabályának mintájára): ismeretlen/
elgépelt `AGENT_CONTINUATION_MODE` érték → visszaesés `off`-ra, egysoros jelzéssel;
hiányzó érték esetén ez csendben történik. A skill nem akad el emiatt.

### CODE_REVIEW_DEFAULT_EFFORT értékek

> ℹ️ **Bevezetve (COCALC-306)**: ezt a kapcsolót az
> [`../../agents/code-reviewer.md`](../../agents/code-reviewer.md) "2. Review szempontok"
> lépése és a [`../gitlab-branch-review/SKILL.md`](../gitlab-branch-review/SKILL.md) "4.
> Review szempontok" lépése olvassa — mindkét hely ugyanazt az effort-skálát használja,
> hogy a pipeline-beli (9. lépés) és az önállóan hívható review ne térjen el egymástól
> (lásd `gitlab-branch-review/SKILL.md` fejléce: "a review kritériumai megegyeznek a
> `agents/code-reviewer.md` subagent szempontjaival"). A `medium` szint definícióját
> **tudatosan nem itt találjuk ki újra** — a beépített Claude Code `/code-review` skill
> saját effort-skálájára hivatkozunk (a `low`/`medium`, illetve `high`→`max` szintek
> leírása onnan származik); a dev-workflow ezt a meglévő skálát veszi át, nem definiál
> párhuzamos, dev-workflow-specifikus jelentést neki.

| Érték | Jelentés |
|---|---|
| `medium` | A beépített `/code-review` skill saját meghatározása szerint: "fewer, high-confidence findings" — kevesebb, de magas megbízhatóságú találat. A review-szempontok (helyesség/tesztlefedettség/hibakezelés/biztonság/olvashatóság/konvenció) ugyanazok maradnak, de a subagent csak azokat a találatokat sorolja fel (chatben és Jira/GitLab kommentben egyaránt), amikben ténylegesen magabiztos — lásd lent "Mit jelent gyakorlatban". |
| `full` | A kapcsoló bevezetése előtti, mai viselkedés — minden szempont, minden súlyossági szint (blocker/major/minor/nitpick), beleértve a bizonytalanabb, spekulatívabb találatokat is. Ez felel meg a beépített `/code-review` skill `high`→`max` szintjének ("broader coverage, may include uncertain findings"). |

**Mit jelent gyakorlatban**: mivel a `code-reviewer`/`gitlab-branch-review` saját maga dönti
el, mely találat "elég magabiztos" (ez szükségszerűen szubjektív határ, nem gépi szabály),
`medium` módban a subagent a minor/nitpick szintű, spekulatív találatokat kihagyja a
strukturált listából, és csak akkor tartja meg, ha **blocker/major** súlyosságú, **vagy**
minor/nitpick, de egyértelmű, nem vitatható (pl. konkrét elírás, nem stílus-preferencia).
`full` módban minden szint bekerül, a mai működés szerint — ez nem szűkíti a bejárt
kódot/AC-listát, csak a *jelentett* találatok szűrését.

**Explicit felülírás**: mindkét hely (pipeline 9. lépés és önálló `gitlab-branch-review`
hívás) fogadja el, ha a felhasználó explicit kér egy másik effort szintet ("legyél
alaposabb ezen a review-n", "csak a blockereket mutasd") — ez felülírja a `config.md`
szerinti alapértelmezést, ugyanúgy, mint minden más `WORKFLOW_PROFILE`-preset kapcsoló
(lásd fent "Explicit egyedi felülbírálás").

**Fallback-szabály**: ismeretlen/elgépelt `CODE_REVIEW_DEFAULT_EFFORT` érték → visszaesés
`full`-ra, egysoros jelzéssel; hiányzó érték esetén ez csendben történik. A skill nem
akad el emiatt.

### STORY_BATCH_MODE értékek

> ℹ️ **Bevezetve (COCALC-328)**: ez a kapcsoló azt mondja meg, hogy az `execute` A-ág
> **egy darab ticketet** dolgoz-e fel körönként (a mai viselkedés), vagy egy **szülő
> Story-t + minden nyitott sub-taskját együtt**, egyetlen implementációs körben — egy
> branchen, egy MR-ben, a sub-task határok csak commit-csoportként. A cél a redundáns
> CI/CD-terhelés csökkentése: N sub-task ma ≈ N pipeline + N MR + N review-kör, batch
> módban ez egy. **Önálló tengely** a `WORKFLOW_PROFILE`-tól (a `cheap`/`balanced`/`genius`
> egyike sem állítja). A kapcsolót ténylegesen olvasó helyek: a
> [`../dev-workflow-execute/SKILL.md`](../dev-workflow-execute/SKILL.md) A4 (pickup), A5
> (branch), A5a (végrehajtó-szint), A6 (implementáció), A7 (lokál kapu), 7a (push+MR),
> 7a1/7b (pipeline-kapu / piros ág), 9 (code review), 9a (pipeline-kapu), A8/A8a
> (test-env / státuszváltás) lépései, valamint a
> [`../dev-workflow-execute/retry-and-escalation.md`](../dev-workflow-execute/retry-and-escalation.md)
> "Fix-ticket létrehozása" szekciója — a lépésenkénti orchestrálás ott van kidolgozva, itt
> csak az egyes értékek jelentése (a fenti "Konvenció" 3. pontja szerint).

| Érték | Jelentés |
|---|---|
| `off` *(alap)* | A mai viselkedés, változatlanul — az A4 pickup egy darab ticketet (jellemzően egy Sub-taskot) vesz fel, és az egész A-ág (branch → implementáció → lokál kapu → push+MR → pipeline-kapu → code review → test-env → státuszváltás) **ticketenként egyszer** fut. A kapcsoló bevezetése ezen a módon semmit nem változtat. |
| `on` | Ha az A4 pickup egy több sub-taskos `Story` sub-taskját (vagy közvetlenül egy sub-taskos `Story`-t) venne fel, a workflow a **szülő Story-t és minden nem-Done/Closed sub-taskját** egyetlen egységként dolgozza fel: **egy** branch a szülő Story kulcsán/jellegén, **egy** közös terv-jóváhagyási kör az összevont AC-listára, majd sub-taskonként külön `implementer` `execute` hívás **külön commit-csoporttal** (a commit-üzenet a sub-task kulcsát hivatkozza), végül **egy** push / MR / pipeline-kapu / code review / test-env kör a teljes összevont diffre. A minőségi kapuk maguk (`LOCAL_GATE_MODE`, `PIPELINE_GATE_*`, code review) **változatlanok** — csak egyszer futnak, nem sub-taskonként. Sikeres kör végén minden bevont sub-task **és** a szülő Story `REVIEW_STATUS_NAME` státuszra kerül. |

**No-op ág:** ha az A4 által felvett ticketnek **nincs sub-taskja** (önálló `Story`/`Task`/
`Bug`), a batch mód `on` értéken sem csinál semmit — a folyamat pontosan a mai egy-ticket
úton fut tovább, egysoros jelzéssel. Ugyanez, ha a bevonás után **0 bevonható** sub-task
maradna: a szülő Story önálló ticketként megy tovább.

**Bevont halmaz szűrése:** a bevont halmazba csak az a sub-task kerül, amelynek státusza
nem `Done`/`Closed`, **nincs** rajta `WORKFLOW_FLAGGED_LABEL` (a "Jira label-rendszer"
szerint a flaggelt ticketet a workflow sub-task szinten sem veszi fel), és **nem**
kizárólag `codex` label van rajta. A `CLAUDE_WORK_LABEL` / `WORKFLOW_FLAGGED_LABEL`
szűrést a **szülő Story-ra** is alkalmazni kell (flaggelt vagy `claude` label nélküli
szülő → a batch mód nem indul, az eredeti sub-task megy egy-ticket úton). A kihagyott
sub-taskokat a workflow egy sorban felsorolja.

**B-ág határ:** a batch összevonás **kizárólag** az A-ági implementációs/kapu-körre
vonatkozik. Ha a szülő Story-nak van kitöltött "Oldalnév" mezője és nincs hozzá
jóváhagyott/lezárt design, a workflow ugyanúgy a [`../dev-workflow-execute/design-branch.md`](../dev-workflow-execute/design-branch.md)
B4-re irányít, mint `off` módban — a batch mód ezt nem kerüli meg.

**Egy-repó határ:** egy batch-kör **egy** branchet használ, ezért a bevont sub-taskoknak
ugyanabba a `REPO_MAP`-sorba (repóba) kell esniük. Ha a sub-taskok külön repóba esnének
(FE/BE külön `REPO_MAP` sor), a batch mód **érthető hibával megáll** (`"a STORY_BATCH_MODE
nem tud egy branchen két repót átfogni — futtasd a sub-taskokat külön, off módban"`), és
nem hoz létre branchet.

**Fallback-szabály** (a `LOCAL_GATE_MODE` / `WORKFLOW_PROFILE` fallback-szabályának
mintájára): ismeretlen/elgépelt `STORY_BATCH_MODE` érték → visszaesés `off`-ra, egysoros
jelzéssel; hiányzó érték esetén ez csendben történik (ez a szállított alapérték). A skill
nem akad el emiatt.

### STORY_BATCH_EXECUTOR_SCOPE értékek

> ℹ️ **Bevezetve (4.23.4, az ordoviii-ben fejlesztve)**. Batch módban (`STORY_BATCH_MODE=on`)
> az A5a a végrehajtó-szintet ma **egyszer**, a teljes bevont halmazra oldja fel. A kör egysége
> a szülő Story, ezért a Story/Bug vétó (lásd "OFFLOAD_PROFILE és OFFLOAD_PHASE_MATRIX") az
> összes sub-task `implementer`-hívását kizárja a `local` szintről. Ez a kapcsoló dönti el,
> hogy az `implementer` szintje a batch-körre vagy sub-taskonként oldódik-e fel.
> `STORY_BATCH_MODE=off` mellett hatástalan.

| Érték | Jelentés |
|---|---|
| `batch` *(alap)* | A mai viselkedés: az A5a egyszer fut, a bevont ticketek legmagasabb `Komplexitás` értékével és a szülő Story issue type-jával; a kapott szint minden sub-task `implementer`-hívására érvényes. |
| `per-subtask` | Az `implementer` fázis szintje **sub-taskonként** oldódik fel, a sub-task **saját** `Komplexitás` értékével és **saját** issue type-jával (így egy sub-task az `OFFLOAD_PROFILE` / `LOCAL_PHASES` keretén belül `local`-ra eshet). Minden más fázis (`architect`, `qa-tester`, `code-reviewer`, `figma-designer`) továbbra is egyszer, a batch-körre oldódik fel, mert azok a teljes összevont diffen / AC-unión futnak; a Story/Bug vétó rájuk változatlanul vonatkozik. Ha a bevont halmaz bármely sub-taskjának szintje `local`, az A6 terv-köre úgy fut, mintha az `implementer` szint `local` lenne (az `ARCHITECT_INTAKE=auto` ilyenkor az `architect`-et hívja). |

**Fallback-szabály**: ismeretlen/elgépelt érték → visszaesés `batch`-re, egysoros jelzéssel;
hiányzó érték esetén ez csendben történik.

### LOCAL_ENV_ISOLATION értékek

> ℹ️ **Bevezetve (COCALC-257, ENV-1)**: ha ugyanannak a repónak több lokális klónja fut
> egy gépen (párhuzamos AI-workflow), a lokál dev-szerver / backend / teszt-futtató
> portjai ütköznek. Ez a kapcsoló mondja meg, hogyan izoláljuk a klónokat. A kapcsolót
> ténylegesen olvasó hely a lokál kapu (`agents/qa-tester.md` "2. Elérés biztosítása"
> szakasz).

| Érték | Jelentés |
|---|---|
| `port-offset` *(alap)* | A lokál portokat klónonként eltoljuk egy, a repo gyökér **könyvtárnevéből** származó `WORKFLOW_INSTANCE` (N) alapján. A konkrét portképletet, a foglalt sávok kizárását és a könyvtárnév → N táblát a **repo-specifikus `config.md`** rögzíti (ez a template azt nem tartalmazza). Nincs kézi beállítás, nincs új verziókövetetlen fájl. |
| `compose` | *(Még nincs implementálva.)* Given `LOCAL_ENV_ISOLATION=compose`, When a lokál kapu indulna, Then érthető hibaüzenettel megáll (`"a compose-alapú izoláció még nincs implementálva, lásd COCALC-257"`), és **NEM** hoz létre `docker-compose.dev.yml`-t. |

**Fallback** (a lenti "Fallback-szabály" mintájára): ismeretlen/elgépelt
`LOCAL_ENV_ISOLATION` érték → visszaesés az alapértékre (`port-offset`), egysoros
figyelmeztetéssel; nem áll meg.

### Fallback-szabály

Ha egy skill/subagent olyan `WORKFLOW_PROFILE` értéket talál, ami nem `cheap`/`balanced`/
`genius` (elgépelés, régi/törölt érték), vagy ha maga a `WORKFLOW_PROFILE` sor hiányzik,
vagy ha egy konkrét egyedi kapcsolóra nincs sor/érték a preset-táblában: **essen vissza a
`balanced` szerinti értékre**, és **ne akadjon el** — csak egy rövid, egysoros jelzést
adjon a felhasználónak/hívó félnek (pl. "WORKFLOW_PROFILE nincs beállítva, balanced
alapértelmezéssel folytatom"), ne állítsa meg emiatt a folyamatot.

## Session-cost-report — lépés-szintű fázisjelölés (mark_chapter)

> ℹ️ **Bevezetve (COCALC-215, MEAS-1)**: a `.claude/tools/session-cost-report/analyze.js`
> a `Skill`/`Agent` tool-hívások mellett a `mcp__ccd_session__mark_chapter` hívást is
> fázishatárnak tekinti — ez teszi lehetővé, hogy egy `SKILL.md` egyetlen lépése (nem
> csak egy teljes Skill/subagent-hívás) is önálló szegmensként jelenjen meg a
> költségriportban. A pontos címke-konvenció, a szegmentálás korlátai és a fallback-
> viselkedés (hiányzó `title`) dokumentációja a
> [`../../tools/session-cost-report/README.md`](../../tools/session-cost-report/README.md)
> "Hogyan szegmentál fázisokra" szakaszában van — ne duplikáld itt, ez a sor csak
> mutató. A `mark_chapter`-t ténylegesen meghívó utasítások a `dev-workflow-execute`,
> `dev-workflow-scoping` és `dev-workflow-intake` skillek lépéseinek elején vannak
> elhelyezve.

## Modell-stratégia fázisonként

| Változó | Alapérték | Leírás |
|---|---|---|
| `PREFERRED_INTERVIEW_MODEL` | `Opus 5` | A `scoping`/`intake`/`story-interview` fázisra ajánlott modell — **nem** Fable 5, az kredites, külön fizetős keretből megy. Ha ez az érték változik (pl. új modell jelenik meg), **csak itt írd át** — a `scoping`/`intake` szövege innen olvassa, nincs máshol beégetve. |

| Fázis | Ajánlott modell | Indoklás |
|---|---|---|
| `scoping` / `intake` / `story-interview` (interjú, scope-bontás, DoR Spec) | Legerősebb csomagon belüli modell (`PREFERRED_INTERVIEW_MODEL`, jelenleg **Opus 5**) | Itt számít az ítélőképesség: rossz scope-bontás vagy hiányos AC végigfut a teljes lánc további részén. A skillek egyszer, explicit igen/nem kérdéssel rákérdeznek, ha a session nem ezen fut — a felhasználó elutasíthatja (pl. kredit/limit ok miatt), ilyenkor nem erőltetik újra. |
| `execute` (A-ág: implementer/qa-tester/code-reviewer; B-ág: figma-designer) | **Sonnet** alapból (rögzítve a subagent-fájlok `model:` frontmatterjében, ez a fallback szerepe) — **COCALC-273 (MEAS-2) óta ticket-szintűen felülírható**, lásd lent "Komplexitás → végrehajtó-szint routing" | Végrehajtás, nem tervezés — a subagentek szűk, jól definiált feladatot kapnak, itt a modellminőség kevésbé kritikus, mint a sebesség/költség. A `model:` mező technikai okból nem tud dinamikusan a config.md-ből olvasni (a harness a subagent indításakor, az utasítások futása előtt már beolvassa) — ez a fallback-forrás, amikor a lenti routing hiányzik/érvénytelen. A tényleges, ticket-szintű felülírás a subagent-indítás **hívásidejű modell-argumentumaként** megy, nem a frontmatter átírásával. |

## Komplexitás → végrehajtó-szint routing

> ℹ️ **Bevezetve (COCALC-273, MEAS-2)**: ez a szakasz egy **második, automatikus,
> ticket-szintű routing-tengelyt** vezet be, a `claude`/`codex` Jira label-rendszertől
> függetlenül (az változatlan — az egy kézi, ember hozta döntés, melyik AI-workflow
> dolgozzon a ticketen; ez a szakasz azon **belül**, automatikusan dönti el, a kiválasztott
> workflow melyik fázisa milyen "erősségű" modellen fusson). Az `intake` a ticket
> összeállításakor (DoR Spec jóváhagyása után) beírja a `Komplexitás` infobox-mezőt, az
> `execute` csak beolvassa (nem gondolkodik újra rajta) — a felhasználó a trackerben látja
> és bármikor kézzel felülírhatja, az `execute` a mezőt **soha nem írja felül**.
>
> **Precedencia**: az `OFFLOAD_PROFILE` fázis-tengelye (COCALC-278, LOCAL-2, lásd lent
> "OFFLOAD_PROFILE és OFFLOAD_PHASE_MATRIX") a keret — az mondja meg, egy adott fázis
> **egyáltalán mely szinteken futhat**. Az alábbi `COMPLEXITY_EXECUTOR_MAP` ezen a
> halmazon **belül** választ, sosem léphet ki belőle. Az `off` szállított alapértéken ez
> a megszorítás a legtöbb fázisnál gyakorlatban nem szűkít (a `COMPLEXITY_EXECUTOR_MAP`
> mai alapértéke amúgy sem ad `local`-t egyetlen fázisra sem) — a tényleges hatás akkor
> jelentkezik, ha valaki explicit `conservative`/`balanced`/`aggressive`/`max-local`-ra
> állítja.
>
> **Viszonya a (jövőbeli) COCALC-266 (GATE-3) `PLAN_ROUND_MODE`-hoz**: a `Komplexitás`
> mező a `PLAN_ROUND_MODE` szabályának egy **olvasható bemenete** lesz — ez a ticket nem
> vezeti be és nem módosítja azt a szabályt, a GATE-3 kizárólagos tulajdona marad.

| Változó | Alapérték | Leírás |
|---|---|---|
| `COMPLEXITY_ESTIMATION` | `hybrid` | `formula`: kizárólag számolható jelekből (AC-tételszám, érintett rétegek száma, van-e Oldalnév/design-ág) — nulla extra LLM-token, lásd [`scripts/estimate-complexity.sh`](scripts/estimate-complexity.sh). `hybrid` (alap): a fenti gépi becslés adja az alapot, amit az interjút vezető modell felülbírálhat, de akkor **kötelező egymondatos indoklás** a mező zárójeles részében. `llm`: tisztán modell-ítélet, a formula csak informális támpont. Nem `WORKFLOW_PROFILE`-függő (minden profilon `hybrid` az alap) — zöldmezős, kevés AC-jű, de fogalmilag nehéz ticketeknél a tisztán gépi `formula` alábecsülne, ezért nem ez az alapértelmezés. |
| `EXECUTOR_LADDER` | `local` → `haiku` → `sonnet` → `opus` | A végrehajtó-szintek sorrendje, a legolcsóbbtól a legerősebbig. A `local` szint (COCALC-220/LOCAL-1 `call-local-model.sh`-ja) **definiálva van, de a szállított alapértelmezésben egyetlen fázishoz sincs hozzárendelve** — a tényleges bekötés a LOCAL-2/LOCAL-3 ticket dolga. |
| `COMPLEXITY_EXECUTOR_MAP` | lásd [`scripts/resolve-executor-level.sh`](scripts/resolve-executor-level.sh) | Komplexitás (`S`/`M`/`L`) × fázis (`implementer`/`qa-tester`/`code-reviewer`/`figma-designer`/`architect`) → `EXECUTOR_LADDER` szint. **Szállított alapérték**: `S` esetén az `implementer` és a `code-reviewer` eggyel olcsóbb szinten fut (`sonnet`→`haiku`), a `qa-tester`, a `figma-designer` és az `architect` változatlan (`sonnet`); `M`/`L` esetén minden fázis a mai szinten (`sonnet`) marad. A táblázat maga a szkriptben van (markdown-táblázatot nem tud futásidőben beolvasni, ugyanaz az ok, mint az AI-identitás szkripteknél) — ha itt módosul az alapérték, a szkriptet is át kell vezetni. |

**Hogyan kerül a mezőbe az érték**: `intake/SKILL.md` "3. Ticket összeállítása" —
minden Story ÉS minden Sub-task **külön, saját** becslést kap (nem öröklés a szülőtől).
Az infobox `Komplexitás` mező formátuma: `<S|M|L> (<becslés alapja>)`, pl.
`M (5 AC, 2 réteg — gépi)` vagy `hybrid` felülbírálásnál `M → L (fogalmilag nehéz,
kevés AC ellenére — LLM felülbírálás)`.

**Hogyan olvassa vissza az `execute`**: a [`tracker-adapter.md`](../dev-workflow-execute/tracker-adapter.md)
"komplexitás beolvasása" művelete. **Tracker-független tárolás** (COCALC-273 AC9): a mező
az infobox táblázat része (nem Jira custom field, nem Jira-komment) — közvetlen Jira
MCP-hívás helyett mindig a tracker-adapter absztrakción megy.

**Vétó-modell** (COCALC-273 AC8): a tracker issue type csak **kizárni** tud — egy `Story`
vagy `Bug` sosem eshet az `EXECUTOR_LADDER` legolcsóbb (`local`) szintjére, akkor sem, ha
az infobox mező ezt sugallná; **engedélyezni** csak az infobox mező tud, az issue type
önmagában sosem old fel korlátozást. A [`scripts/resolve-executor-level.sh`](scripts/resolve-executor-level.sh)
ezt a szabályt is alkalmazza. ⚠️ A visszaolvasás determinisztikus szabályát a (jövőbeli)
COCALC-266 (GATE-3) fogja kimondani az infobox-mezők általános kiolvasására — addig a
`tracker-adapter.md`-ben dokumentált, ideiglenes, egyszerű olvasási mód érvényes (TODO,
lásd ott).

**Fallback-szabály** (COCALC-273 AC7, a `WORKFLOW_PROFILE` fallback-szabályának
mintájára): ha a `Komplexitás` mező hiányzik, üres, vagy nem `S`/`M`/`L` értéket
tartalmaz (elgépelés, `XL`, üres zárójel) — **minden fázis a mai szinten (`sonnet`)
fut**, és a `resolve-executor-level.sh` egy rövid figyelmeztetést ad stderr-re. Ez
**nem** akadályozza meg a futást — a harness nem érvényesíti a hívásidejű felülírást
(nincs saját hard-stop mechanizmusa erre), a futás így sem akad el, az esetleges eltérés
utólag a `analyze.js` byModel riportjában derül ki (lásd
[`../../tools/session-cost-report/README.md`](../../tools/session-cost-report/README.md)).
Ugyanez a fallback vonatkozik a nem az `intake`-ben született ticketekre is (web-design,
design-review, eszkalált fix-ticket) — ezek mező nélkül jönnek létre.

**Kereszthivatkozás** (COCALC-273 AC14): a becslés nem mondhat ellent a
[`../story-interview/dor-checklist.md`](../story-interview/dor-checklist.md) méret-
figyelmeztetésének — 8-nál több AC-tétel esetén a komplexitás nem lehet a legkisebb
(`S`) szint. Az `estimate-complexity.sh` súlyozása ezt strukturálisan is biztosítja
(az AC-tételszám önmagában már 8 fölött kizárja az `S`-t), és van rá explicit védelmi
háló is a szkriptben, ha a súlyozás később változna.

### OFFLOAD_PROFILE és OFFLOAD_PHASE_MATRIX

> ℹ️ **Bevezetve (COCALC-278, LOCAL-2)**: ez a szekció a fenti "Komplexitás →
> végrehajtó-szint routing" bevezetőjében már előre kimondott **keretet** valósítja meg
> — az `EXECUTOR_LADDER` `local` szintje a COCALC-220 (LOCAL-1) óta létezik, de a
> szállított alapértelmezésben egyetlen fázishoz sem volt hozzárendelve. Ez a kapcsoló
> mondja meg, **melyik fázis egyáltalán mely szinteken futhat** — a `COMPLEXITY_EXECUTOR_MAP`
> ezen a halmazon **belül** választ, sosem léphet ki belőle. A kapcsolót ténylegesen
> használó szkript a [`scripts/resolve-executor-level.sh`](scripts/resolve-executor-level.sh)
> — a hívó orchestrálás a [`dev-workflow-execute/SKILL.md`](../dev-workflow-execute/SKILL.md)
> A5a lépésében és a [`design-branch.md`](../dev-workflow-execute/design-branch.md) B4
> elején van.

**Precedencia** (4 lépés, a fenti "Komplexitás → végrehajtó-szint routing" bevezetőjében
már jelzett sorrend kifejtve):

1. Az `OFFLOAD_PROFILE` szerinti `OFFLOAD_PHASE_MATRIX`-sor a **keret** — megmondja, egy
   adott fázis mely `EXECUTOR_LADDER` szinteken futhat egyáltalán.
2. Ezen a halmazon belül választ a `COMPLEXITY_EXECUTOR_MAP` (COCALC-273), illetve egy
   fázis-specifikus felülbírálás (pl. `CODE_SCAN_MODEL`, COCALC-270 — lásd lent).
3. Ha a 2. lépés választása kívül esne a kereten, `OFFLOAD_CLAMP_DIRECTION` szerint a
   legközelebbi engedett szintre kerekít.
4. A `WORKFLOW_PROFILE` (COCALC-216) egyik fenti kulcsot sem állítja — ez egy tőle
   független tengely.

**`OFFLOAD_PHASE_MATRIX`** (szállított alapérték; `l`=local, `h`=haiku, `s`=sonnet,
`o`=opus — a tényleges halmazok a `resolve-executor-level.sh`-ban élnek, ez a táblázat a
kanonikus dokumentáció):

| Fázis | Lokál-szerződés | `off` | `conservative` | `balanced` | `aggressive` | `max-local` |
|---|---|---|---|---|---|---|
| `repo-scanner` | ✅ van (LOCAL-5, `LOCAL_PHASES`) | h/s/o | l/h/s | l/h/s | l/h | l |
| `code-reviewer` | ⏳ nincs még | h/s/o | h/s/o | l/h/s | l/h | l |
| `qa-tester` | ✅ van (LOCAL-5, csak `fast` kapu; `LOCAL_PHASES`) | h/s/o | h/s/o | l/h/s | l/h | l |
| `implementer` | ✅ van (COCALC-387) | h/s/o | h/s/o | h/s/o | l/s | l |
| `figma-designer` | ⛔ kizárva (Figma MCP-t vezérel) | s/o | s/o | s/o | s/o | s/o |
| `architect` | ⛔ kizárva (csak-olvasó tervező fázis, lásd `ARCHITECT_INTAKE`) | s/o | s/o | s/o | s/o | s/o |
| `ux-designer` | ⛔ kizárva (vizuális ítélet, böngésző- és Figma-MCP-t vezérel) | s/o | s/o | s/o | s/o | s/o |

A `⏳` sorra (**jelenleg csak a `code-reviewer`**; az `implementer`-nek a COCALC-387 óta,
a `repo-scanner`-nek és a `qa-tester`-nek a LOCAL-5 óta MÁR VAN lokál-szerződése) a
`local` szint a mátrix szerint néha engedélyezett lenne (pl. `balanced`/`aggressive`/
`max-local`), de a szkript **mindig felfelé clampeli**, függetlenül az
`OFFLOAD_CLAMP_DIRECTION`-től — a helyi végrehajtás megtagadása hard constraint, nem irány
kérdése, amíg a `call-local-model.sh` (COCALC-220) tényleges bekötése meg nem történik
hozzá. A ✅ sorokon a `local` szint csak akkor oldódik fel, ha a fázis szerepel a
`LOCAL_PHASES` listán (lásd lent "### LOCAL_PHASES és a lokál fázis-bekötés"). Ha emiatt
egy preset egyetlen engedett szintje használhatatlanná válna (pl. `max-local` + egy fázis,
ami nincs a listán, ahol az egyetlen engedett szint pont a `local`), a szkript az
`EXECUTOR_LADDER` alapszintjére (`sonnet`) esik vissza, jelzéssel.

**Kizárt fázisok** — ezekhez egyetlen legális "szint" a `claude-main` (a fő session,
nem delegálható subagentnek), a `resolve-executor-level.sh`-nak nincs is `--phase`
értéke rájuk:
- A4 pickup, A5 branch, A8a Jira-tranzíció, R-ág orkesztráció — fő session MCP-hívásai,
  nem delegálhatók subagentnek.
- `scoping`/`intake`/`story-interview` — a `PREFERRED_INTERVIEW_MODEL` szabálya (lásd
  fent "Modell-stratégia fázisonként") ott a legerősebb csomagon belüli modellt írja
  elő, ez a szekció nem írja felül.

**`OFFLOAD_CLAMP_DIRECTION`**: `up` (alapérték) a drágább/biztonságosabb irányba kerekít,
ha a `COMPLEXITY_EXECUTOR_MAP` választása kívül esik a kereten. ⚠️ `down` **felső
korlátként** viselkedik, és **csendben gyengíthet** (olcsóbb szintre kerekít, mint amit a
komplexitás-becslés indokolt volna) — ilyenkor is érvényben marad a COCALC-273 (AC8)
vétó-modellje: egy `Story`/`Bug` sosem eshet a legolcsóbb (`local`) szintre, a
`down`-irány sem írja felül ezt a védelmet.

**`CODE_SCAN_MODEL` (COCALC-270) mint fázis-specifikus felülbírálás**: a
"Modell-stratégia fázisonként" `execute`-sorában és a fenti "WORKFLOW_PROFILE"
preset-táblában szereplő `CODE_SCAN_MODEL` mostantól **fázis-specifikus felülbírálásnak**
minősül a fenti 2. precedencia-lépés értelmében — csak a `repo-scanner` sorhoz az
`OFFLOAD_PROFILE` mátrixa által engedett halmazon **belül** érvényes, nem léphet ki
belőle (pl. `off` + `CODE_SCAN_MODEL=local` esetén a keret nyer: a `repo-scanner`
Claude-on, `sonnet`-en fut, jelzéssel — lásd lent "Edge case-ek" a
`dev-workflow-execute/SKILL.md`-ben/`repo-scanner.md`-ben, ha a tényleges bekötés
megtörténik).

**Fallback-szabály** (COCALC-278 AC13, a `WORKFLOW_PROFILE`/`Komplexitás` mező
fallback-szabályának mintájára): ha egy skill/szkript olyan `OFFLOAD_PROFILE` értéket
talál, ami nem `off`/`conservative`/`balanced`/`aggressive`/`max-local` (elgépelés, régi/
törölt érték), vagy ha a mező teljesen hiányzik, essen vissza **`off`-ra** — hiányzó
mező esetén ez csendben történik (ez maga a szállított alapérték), explicit érvénytelen
érték esetén rövid figyelmeztetéssel (stderr). Egyik esetben sem akad el a futás.

### LOCAL_PHASES és a lokál fázis-bekötés

> ℹ️ **Bevezetve (LOCAL-5)**: a `local` szint három fázisnál tényleges végrehajtás —
> `implementer` (A6, COCALC-387), `repo-scanner` (intake 2.a) és `qa-tester` (execute A7,
> csak `fast` kapu). A bekötés közös eleme a [`scripts/call-local-model.sh`](scripts/call-local-model.sh)
> (`--phase` kapcsoló, fájlon át menő kérés- és válasz-törzs, `LOCAL_MODEL_THINK`/`NUM_CTX`/`FORMAT`),
> a fázisonkénti válasz-séma ([`schemas/`](schemas/)) és a prompt-sablon
> ([`local-prompts/`](local-prompts/)). A hívó (a fő szál) a gépi munkát végzi — a modell nem
> használ eszközt, kizárólag a promptban kapott szöveget látja.

| Fázis | Ki mit csinál | Séma | Sablon |
|---|---|---|---|
| `implementer` | A fő szál promptot állít össze (terv + fájlok), a modell teljes fájltartalmakat ad; a fő szál kiírja, teszteli, commitol | `implementer-response.v1` | `local-prompts/implementer.md` |
| `repo-scanner` | A fő szál `git grep`-pel jelölteket gyűjt és számozott sorokkal a promptba teszi; a modell `path:line:quote` leleteket ad; a fő szál `test -f` + sor/idézet egyezést ellenőriz | `repo-scan-response.v1` | `local-prompts/repo-scanner.md` |
| `qa-tester` | A fő szál lefuttatja a build/teszt/lint parancsokat (exit kód + kimenet vége); a modell AC-lefedettséget és hibaleírást ad; **bármely nem 0 exit kód `fail`**, a modell véleményétől függetlenül | `qa-verdict.v1` | `local-prompts/qa-tester.md` |

**Kapcsolók** (mind alapból a mai viselkedést adja; a `local` szintet az `OFFLOAD_PROFILE`
keret is engedni kell):

- `LOCAL_PHASES` — melyik fázisoknál oldódik fel a hard-clamp (lásd a `--local-phases`
  kapcsolót a `resolve-executor-level.sh`-ban). Alap: `implementer,repo-scanner`. A
  `qa-tester` kifejezetten ráírandó. Ismeretlen név figyelmen kívül marad, jelzéssel.
- `OFFLOAD_PROFILE` — az implementernek **csak a `max-local`** ad ténylegesen `local`-t: az
  `aggressive` halmaza `local sonnet`, és a `COMPLEXITY_EXECUTOR_MAP` az implementernek
  `haiku`/`sonnet` szintet javasol, ami `sonnet`-en marad (a `local`-hoz `down` clamp
  irány + `S` komplexitás kellene). A `max-local` mellett a `code-reviewer` és (a listán nem
  szereplő fázisok) biztonságosan `sonnet`-re esnek vissza.
- `LOCAL_MODEL_THINK` — gondolkodó modelleknél (pl. `qwen3.6:27b`) az `off` az ajánlott: az
  élő mérésekben az implementernél (architect-tervvel) ugyanazt a minőséget adta 25 s alatt,
  mint a gondolkodás 40–120 s alatt; a repo-scannernél és a qa-testernél a gondolkodás nem
  javította az eredményt, csak az időt többszörözte. `on` mellett `LOCAL_MODEL_FORMAT=json`
  ajánlott (enélkül egy futásban érvénytelen escape-ű JSON jött).
- `LOCAL_PROMPT_MAX_CHARS` — a prompt felső korlátja; a fázisok ennél nagyobb promptnál
  Claude-on futnak.

**Mérési eredmények** (RTX 3090, 24 GB; `dw-27b` = `qwen3.6:27b`, `num_ctx` 32768,
`think:false`; kis minta, tájékoztató): `repo-scanner` két feladaton 15–36 s, a leletek 8/8 ill.
7/8-a egyezett a fájl valódi sorával (a nem egyező leletet az idézet-ellenőrzés kiszűri);
`qa-tester` 14–17 s, a piros esetet (bukó teszt) `fail`-nek, a vizuális AC-t `unverified`-nek
minősítette, a zöld esetben minden `pass` konkrét tesztcímet nevezett meg. Az implementernél a
`dw-coder-27b` (`think:false`) architect-formátumú tervvel 3/3 hibátlan volt (25 s), a
`qwen3-coder:30b` 0/3 (12 s).

**Prompt-sablon és Modelfile**: a [`local-prompts/dw-27b.Modelfile`](local-prompts/dw-27b.Modelfile)
általános, fázis-független system promptot ad (`ollama create dw-27b -f …`); a kimeneti formát
a fázis sablonja írja elő, így egyetlen modell szolgál ki minden fázist. A korábbi,
implementer-specifikus system promptú modell (pl. `dw-coder`) a többi fázisra nem használható.

**Fallback-szabály**: a helyi hívás bukása (érvénytelen JSON, séma-hiba, időkorlát, breaker)
mindig Claude-os végrehajtáshoz vezet egysoros jelzéssel, és nem fogyaszt javítókört (lásd
`dev-workflow-execute/retry-and-escalation.md`).

### LOCAL_EXECUTOR_HOST értékek

> ℹ️ **Bevezetve (ORD-365, 4.25.0)**: az ORD-2 epic-futás mérése szerint a helyi modell
> fő szálas vezérlése (prompt, hívás, fájlírás, ellenőrzés, javítás, commit — storyként 10–25
> lépés) a fő szál kontextusát gyorsan növeli, és a helyi modell által megspórolt
> Claude-tokeneket jórészt felemészti. A `subagent` érték ezt a kört egy
> [`local-runner`](../../agents/local-runner.md) subagentbe teszi, ami csak rövid összefoglalót
> ad vissza. A preset-tábla sora fent van; egy futásra az azonos nevű környezeti változó
> felülbírálja.

| Érték | Jelentés |
|---|---|
| `main` *(alap)* | A mai viselkedés: a `local` szintű lépéseket a fő szál vezérli (`dev-workflow-execute/local-execution.md` „A6” és „A7 — lokál qa-tester” szakasza); a helyi hívás bukása (a kemény hibát is beleértve) a felhős `implementer` / `qa-tester` subagenthez vezet. |
| `subagent` | A `local` szintű lépéseket a `local-runner` subagent végzi (sub-taskonként), a [`local-runner.md`](../../agents/local-runner.md) szerződése szerint: rossz válasz → Claude-implementáció ugyanabban a subagentben, naplózva; **a helyi modell elérhetetlensége (`call-local-model.sh` exit 2: health check, hálózat, időkorlát) → megállás** (`LOCAL_UNREACHABLE`), nem csendes visszaesés. A nyitott circuit breaker (szintén exit 2, a stderr-ben „circuit breaker nyitva”) nem elérhetetlenség: a korábbi rossz válaszok nyitották, ezért visszaesés (ORD-375). A böngészős A7 kört és a 9. code reviewt nem veszi át. Epic-módban `EPIC_STORY_HOST=subagent` mellett a helyi lépéseket a story-runner maga futtatja ugyanígy. |

A local-runner (és a story-runner) repófüggő beállításai. A `-` érték „nincs beállítva”-t
jelent; a csomag-alapértékek a mai, kipróbált viselkedést adják:

| Kapcsoló | Érték | Jelentés |
|---|---|---|
| `LOCAL_RUN_DIR` | `../{repo}-local-run` | A futás munkamappája, a fő munkafához képest (vagy abszolút): ide kerülnek a lépésenkénti `task.md`-k, a promptok és a válaszok, a mentett tervek (`<KULCS>-plan.md`), a napló (`local-stats.md`) és a futás-jegyzet (`run-notes.md`). A `{repo}` a fő munkafa mappájának neve. A munkafán kívül van, így nem kerül commitba, és a worktree törlése után is megmarad. |
| `LOCAL_CONVENTIONS_FILE` | `{task_dir}/conventions.md` | A repó konvenciói a helyi modellnek (a `build-prompt.js` a task után fűzi a promptba). `{task_dir}` = a `task.md` mappája (jellemzően a `LOCAL_RUN_DIR`); relatív útvonal a munkafához képest. A fájl tartalma repófüggő (nyelv, formázás, tiltott minták, típus-szigorúság), a csomag nem szállítja. |
| `LOCAL_FORMAT_CMD` | `-` | A helyi válasz kiírása utáni formázás, `{files}` helyőrzővel a kiírt fájlokra. `-` = a repó `CLAUDE.md` / `AGENTS.md` formázó parancsa (az `implementer.md` „3. Helyi minőségi ellenőrzés” szerint). |
| `LOCAL_CHECK_CMD` | `-` | A commit előtti kötelező ellenőrzés (típus, lint, unit teszt). `-` = a repó `CLAUDE.md` / `AGENTS.md` parancsai, mint az `implementer.md` 3. lépésében. |
| `LOCAL_CHECK_DB_CMD` | `-` | Kiegészítő ellenőrzés az adatbázist érintő lépésnél (integrációs tesztek). `-` = a repó `CLAUDE.md` / `AGENTS.md` integrációs teszt-parancsa, ha van. |

**Fallback-szabály**: ismeretlen/elgépelt `LOCAL_EXECUTOR_HOST` érték → `main`, egysoros
jelzéssel.

### RUN_METRICS értékek

> ℹ️ **Bevezetve (ORD-376, 4.27.0)**: futási metrika. Merge-kor (és az epic végén) a
> `scripts/collect-run-metrics.js` egy sort ír a közös store-ba: a story tényleges
> token-/költség-felhasználását (fő szál és subagentek, fázisonként), a helyi modell hívásait és
> visszaeséseit, a CI-adatokat és a story jellemzőit. A sor sémája: `schemas/run-metrics.v1.json`.
> A sorba **csak számok, logikai értékek és azonosítók** kerülnek, szöveg (ticket-cím, komment,
> prompt, válasz) soha.

| Érték | Jelentés |
|---|---|
| `off` *(alap)* | Nincs gyűjtés; a hívási pontok kimaradnak. |
| `collect` | A hívási pontokon a gyűjtő lefut (hiba csak figyelmeztetés, `--warn-only`). |
| `collect+estimate` | Mint a `collect`, és a becslő (`scripts/estimate-run.js`, ORD-377) is lefut: az A6 terv-jóváhagyásban és az E3 epic-tervben megjelenik a P50/P80 becslés-blokk (költség, token, falióra, aktív idő), a story JSON-ja pedig a `<LOCAL_RUN_DIR>/<STORY>-estimate.json` fájlba kerül, amelyet a gyűjtő merge-kor a sor `estimate` mezőjébe olvas. |

| Kapcsoló | Alapérték | Jelentés |
|---|---|---|
| `RUN_METRICS_STORE` | `~/.dev-workflow/metrics/runs.jsonl` | A store útvonala (`~` a home-ra oldódik). Felhasználói szintű, **közös** a projektek között; a sorok `project` mezője (alapból a story-kulcs előtagja, pl. `ORD-82` → `ORD`; `--project`-tel felülírható) választja szét őket. A gyűjtő a store mappájába `.gitignore`-t (`*`) tesz, ha még nincs, így repón belüli útvonalnál sem kerül commitba (a fogyasztó saját `.gitignore`-ját nem írja). |
| `RUN_METRICS_MIN_SAMPLES` | `3` | Hány korábbi futás kell a becsléshez. A becslő hatókör-létrán lép: saját projekt (szigorú, majd laza ujjlenyomat), majd minden projekt (szigorú, majd laza); az első lépcső nyer, ahol az anomália-kizárás utáni minták száma legalább ennyi. Ha egyik sem elég, heurisztikus becslés (lépésenkénti átlag × lépésszám, P80 = P50 × 1,5; a `HEURISTIC_P80_FACTOR` hangolható konstans az `estimate/heuristic.js`-ben), alacsony megbízhatóság jelzéssel. A kalibráció is ennyi korábbi becslés–tényleges párnál kapcsol be. |
| `RUN_METRICS_EXCLUDE_ANOMALIES` | `on` | A becslés kizárja az anomáliás futásokat (`breaker_open`, `network_enotfound`, `context_compaction`, `invalid_json`, `unreachable`), és a kizárt futások gyakoriságát kockázatként mutatja (pl. „Kockázat: 1/6 hasonló futásban breaker_open (+40 p)”). `off` esetén a sorok bent maradnak a mintában, és kockázat nem jelenik meg. |
| `LOCAL_HW_PROFILE` | *(üres)* | A helyi modell gépének azonosítója a `fingerprint.gpu` mezőhöz; azonosító-minta (`^[A-Za-z0-9_.:/+-]{0,64}$`, szóköz nélkül), pl. `RTX_3090_24GB`. A `--gpu` kapcsoló felülírja. |

**Hívási pontok** (a `RUN_METRICS` ≠ `off` esetén; a hiba csak figyelmeztetés):

- **E6** (epic-mód, merge után): `collect-run-metrics.js --story <STORY> --epic <EPIC> --sessions <id> --features-file <json> --plan-file <terv> --mr <iid> --warn-only`;
- **E7** (epic-mód, zárás): `collect-run-metrics.js --kind epic_overhead --epic <EPIC> --sessions <id> --warn-only`;
- **8a — zöld** (nem epic-mód): mint az E6, `--story <ticket>`, epic nélkül. Workflow-meta ticketnél (nincs 8a, a merge kézi) nem fut.
- **A6 / E3 becslő-hívás** (`RUN_METRICS=collect+estimate`; a hiba csak figyelmeztetés): A6-ban `estimate-run.js --story <ticket> --features-file <json> --plan-file <terv> --out <LOCAL_RUN_DIR>/<ticket>-estimate.json --subtasks --warn-only`, E3-ban `estimate-run.js --epic <EPIC> --stories-file <json> --warn-only`, storynként `--story … --out <LOCAL_RUN_DIR>/<STORY>-estimate.json` is. A kimenet a terv-üzenetbe kerül. A gyűjtő az `--estimate-file` kapcsolóval, vagy ennek híján a terv melletti `<STORY>-estimate.json`-t olvassa be. A közös referencia-fixture: `schemas/fixtures/estimate/` (a számolási konvenciók a `README.md`-ben).

A subagent-hívások `description`-je tartalmazza a story-azonosítót — a gyűjtő ebből rendeli a
storyhoz a subagentek tokenjeit. A helyi modell hívásait a `call-local-model.sh` naplója
(`--ticket`), a visszaesések okát a `local-runner` gépi sora (`fallback_reason`) adja. Ha a
subagent `description`-je csak a sub-task kulcsot tartalmazza (pl. `Implement ORD-57`), a
storyhoz rendeléshez `--alias ORD-57=ORD-56` kell.

**Fő szálon futott storyk** (ORD-387): fő szálas futásban a storyk fő szála átfedhet, és a
sub-task kulcsú subagentek nem kerülnek a story-sorba. A `--window <STORY>=<ISO-tól>..<ISO-ig>`
(ismételhető, félig nyitott `[tól, ig)`, ezért az érintkező ablakok nem átfedők) explicit story-ablakot
ad a fő szálnak, és felülírja a `--since/--until` és a `mark_chapter` ablakot; átfedő ablakoknál a
gyűjtő hibával áll meg, sort nem ír. Az `--alias <SUBTASK>=<STORY>` (ismételhető) a sub-task kulccsal
indított subagentet rendeli a storyhoz. Az `epic_overhead` sor a storykhoz nem rendelt maradékot
kapja (ablakon kívüli fő szál, nem rendelt vagy nem listázott story-hoz tartozó subagent), így a
story-sorok és az overhead-sor összege a sessionök teljes költsége (kerekítési eltéréssel).
Tracker szülő-mező feloldás nincs, csak az `--alias`. Példa:
`collect-run-metrics.js --story ORD-A --sessions <id> --window ORD-A=<ISO>..<ISO> --window ORD-B=<ISO>..<ISO> --alias ORD-A1=ORD-A --warn-only`
(az `epic_overhead` hívás ugyanazokat a `--window`/`--alias` kapcsolókat és a `--stories ORD-A,ORD-B` listát kapja).

**Egyszeri betöltés**: `collect-run-metrics.js --backfill <epic-munkamappa>` korábbi epic-futások
visszamenőleges felvétele (ha a mappában van `metrics/runs.jsonl`, az importálódik és a költség a
mostani ártáblával újraszámolódik; egyébként a transcriptekből rekonstruálja, `--sessions`
kötelező). A visszamenőleges sorok `backfilled: true` jelölést kapnak.

**Fallback**: ismeretlen/elgépelt `RUN_METRICS` érték → `off`, egysoros jelzéssel.

**Codex-port**: a `.agents`/`.codex` port erre a funkcióra nem készül; a lemaradás szándékos (dokumentálva).

### KOVET_REPORT értékek

> ℹ️ **Bevezetve (SLING-192, 4.32.0)**: napi követ-jelentés a Slingnek. Az execute-futás befejező
> pontján (egyedi ticket és batch mód: 8a / 8b, workflow-meta megállás, eszkaláció; epic mód: csak
> az E7) a session egyszer kitölti a `done` / `unfinished` / `raised` / `tomorrow` mezőket, és
> `sling daily report`-tal elküldi a Sling helyi napi tárolójába. A lépés leírása:
> `dev-workflow-execute/kovet-report.md`. A Codex-port (`.agents/skills`) nem tartalmazza.

| Érték | Jelentés |
|---|---|
| `off` | A lépés nem fut. |
| `auto` *(alap)* | Ha a Sling elérhető (a `kovet-jelentes` skill telepítve van, vagy a `sling` a PATH-on), a jelentés elmegy; ha nem, a lépés **jelzés nélkül** kimarad — így a csomag Sling nélküli repókban változatlanul működik. |
| `on` | Mint az `auto`, de elérhetetlen Slingnél egy soros figyelmeztetés jelenik meg. |

| Kapcsoló | Alapérték | Jelentés |
|---|---|---|
| `KOVET_REPORT` | `auto` | A követ-jelentés lépés módja (`off` / `auto` / `on`). A jelentés hibája soha nem változtat a ticket státuszán vagy a futás kimenetén. |

### OFFLOAD_ACCEPTANCE_* és OFFLOAD_AUTO_PROMOTE

> ℹ️ **Bevezetve (COCALC-280, LOCAL-3)**: ez a szekció a fenti "OFFLOAD_PROFILE és
> OFFLOAD_PHASE_MATRIX" keret **élesedési feltételét** adja meg — mikor tekinthető egy
> helyi (`local`-szintű) felderítő fázis elég megbízhatónak ahhoz, hogy egy agresszívabb
> `OFFLOAD_PROFILE` szintre lépjünk. A kapcsolókat ténylegesen a
> [`scripts/compare-scan-quality.sh`](scripts/compare-scan-quality.sh) olvassa (a
> golden-set-alapú kiértékelő), önellenőrzése a
> [`../../../ci/verify-offload-measurements.sh`](../../../ci/verify-offload-measurements.sh).
> A mérési módszertan és a felvett Claude-baseline rangsor a
> [`offload-measurements.md`](offload-measurements.md)-ben van.

**Mit mér** — a `compare-scan-quality.sh` egy **golden set** (dokumentált feladat-brief +
fájl/szimbólum szinten rögzített, ellenőrzött várt leletek — lásd
[`golden-sets/README.md`](golden-sets/README.md)) és egy tényleges `repo-scanner`-kimenet
(COCALC-270 nyers-lelet szerződés) között három számot:

- **recall** — a várt leletek mekkora hányadát találta meg a scanner (0.0–1.0).
- **precision** — a scanner által jelentett utak mekkora hányada volt tényleg a várt
  halmazban (0.0–1.0).
- **érvénytelen-fájlút-szám** — hány olyan utat jelentett a scanner, ami a repóban
  egyáltalán nem létező fájlra mutat (halált — hallucinált út).

**Küszöbök és az aszimmetria indoka**:

| Kapcsoló | Szállított alapérték | Jelentés |
|---|---|---|
| `OFFLOAD_ACCEPTANCE_RECALL` | `0.8` | Ez alatti recall → a fázis **nem** élesíthető helyi szintre (a golden set kiértékelése "fail"). |
| `OFFLOAD_ACCEPTANCE_MAX_INVALID_PATHS` | `0` | Ennél több érvénytelen fájlút → "fail", **függetlenül** a recalltól. |

A két küszöb **szándékosan aszimmetrikus**: egy **hiányzó** leletet (alacsonyabb recall) a
fő szál szintézise még elkaphat — a `repo-scanner` kimenete a hívó fő szálhoz megy
be, ami több felderítő válaszát összeveti és a ticket-kontextusból pótolhatja a rést.
Egy **hamis fájlút** viszont csendben félrevisz: a fő szál `test -f`-fel validál ugyan,
de egy létező, csak *irreleváns* fájlra mutató hallucináció átcsúszhat, és a döntést
rossz irányba tereli. Ezért a recallra van tűrés (0.8), az érvénytelen utakra **nincs**
(0).

A **precision külön nincs kapuzva** — sok létező-de-irreleváns túljelentés (alacsony
precision) küszöb feletti recall + 0 érvénytelen út mellett `pass`. A
`compare-scan-quality.sh` ilyenkor stderr-figyelmeztetést ad, de a kilépőkód `pass` marad;
a részletes indoklás az [`offload-measurements.md`](offload-measurements.md) "Ismert
korlátok" szekciójában.

**`OFFLOAD_AUTO_PROMOTE`** — mi történjen, ha a kiértékelés "pass":

| Érték | Viselkedés |
|---|---|
| `off` | A szkript csak a három számot adja vissza, semmilyen javaslatot/írást nem tesz (hallgat). |
| `suggest` (alapérték) | Kiírja stderr-re a javasolt `OFFLOAD_PROFILE` értéket (a jelenlegiből egy lépéssel agresszívabbat), de **fájlt nem ír**. |
| `auto` | Átírja ebben a fájlban az `OFFLOAD_PROFILE` sort a javasolt értékre — **de csak akkor, ha az jelenleg `off`**. Ha a sor már nem `off` (valaki szándékosan beállította), a szkript **nem írja felül**, figyelmeztet és megáll (3-as kilépőkód). |

**Fallback-szabály** (COCALC-280, a `WORKFLOW_PROFILE`/`OFFLOAD_PROFILE` fallback-szabály
mintájára): ismeretlen/elgépelt `OFFLOAD_AUTO_PROMOTE` érték → visszaesés a szállított
alapértékre (`suggest`), rövid stderr-figyelmeztetéssel; hiányzó érték esetén ez csendben
történik. Ismeretlen `OFFLOAD_ACCEPTANCE_RECALL` (nem 0.0–1.0 közti szám) vagy
`OFFLOAD_ACCEPTANCE_MAX_INVALID_PATHS` (nem nemnegatív egész) → a szállított alapérték
(`0.8` ill. `0`), stderr-figyelmeztetéssel. Egyik esetben sem akad el a futás.

### ARCHITECT_INTAKE értékek

> ℹ️ **Bevezetve (COCALC-385, a COCALC-383 sub-taskja)**: a `CODE_SCAN_INTAKE`/
> `THREAT_MODEL_INTAKE` mintáját követő háromértékű kapcsoló — azt mondja meg, mikor
> készítse a ticket terv-jóváhagyási körének tervét a `../../agents/architect.md`
> subagent (fájl-szintű lépéslista, kész kód nélkül), és mikor az `implementer` saját
> `plan` módja (a mai viselkedés). Ez a ticket (COCALC-385) csak a kapcsolót és a
> `scripts/resolve-executor-level.sh` routing-bővítését vezeti be (az `architect` fázis
> `--phase` értékként való elfogadása, sosem `local`); a tényleges bekötés a hívó
> `../dev-workflow-execute/SKILL.md` A6 lépésébe a COCALC-386 dolga, itt csak az egyes
> értékek jelentése.

| Érték | Jelentés |
|---|---|
| `off` *(alap, `cheap`)* | Az architect fázis nem indul — az A6 terv-köre a mai módon, közvetlenül az `implementer` `plan` módjával megy. |
| `auto` *(alap, `balanced`)* | Ha az A5a-ban feloldott `implementer` végrehajtó-szint `local`, az architect fázis készíti a tervet (aminek a fájl-szintű lépéslistáját az `implementer` `execute` módban bemenetként kapja); minden más esetben a mai `implementer plan` mód fut. |
| `always` *(alap, `genius`)* | Az architect fázis **mindig** készíti a tervet, az `implementer` feloldott végrehajtó-szintjétől függetlenül. |

**Fallback-szabály** (a `CODE_SCAN_INTAKE`/`THREAT_MODEL_INTAKE` fallback-szabályának
mintájára): ismeretlen/elgépelt `ARCHITECT_INTAKE` érték → visszaesés `off`-ra, rövid
jelzéssel; hiányzó érték esetén ez csendben történik. A skill nem akad el emiatt.

### ARCHITECT_TARGET_EXECUTOR értékek

> ℹ️ **Bevezetve (COCALC-398, 4.19.0)** — egy fogyasztó repó helyi bővítéséből visszavezetve.
> A kapcsolót a `../../agents/architect.md` "2a" szakasza olvassa: azt mondja
> meg, **milyen végrehajtóra szabja** az `architect` a fájlszintű lépéslista részletességét.
> Független az `ARCHITECT_INTAKE`-től (az dönti el, hogy egyáltalán az `architect` készíti-e
> a tervet) és a `resolve-executor-level.sh` által feloldott végrehajtó-szinttől: csak a terv
> formáját szabja, a végrehajtást nem irányítja át.

| Érték | Jelentés |
|---|---|
| `claude` *(alap, minden profilon)* | A "2. Kimeneti szerződés" formátuma változatlanul (fájl, szekció, elvárt viselkedés, teszt). |
| `local-27b` | Egy kb. 27B paraméteres helyi modell (pl. Qwen, 24 GB VRAM) számára elvégezhető terv: lépésenként egy fájl és kb. 100 módosított sor, pontos szignatúrák és típusok, pontos tesztnevek és parancsok, kötelező sorrend — részletesen az `architect.md` "2a" szakaszában. |

A `local-27b` terv jellemzően hosszabb a `claude`-osnál; a `../dev-workflow-execute/tracker-adapter.md`
"terv mentése" műveletének `PLAN_SAVE_MAX_LINES` korlátja rá is vonatkozik — ha a terv
rendszeresen nem fér bele, a korlátot a repó `config.md`-jében érdemes emelni.

**Fallback-szabály**: ismeretlen/elgépelt érték vagy hiányzó sor → `claude`, rövid jelzéssel
(hiányzó sor esetén csendben). Az `architect` nem akad el emiatt.

## Indító parancsok (kanonikus mondatok)

Ez az egy hely, ahol a workflow 5 kézi belépési pontjának mondatait szerkesztheted. Két
dolgot fontos tudni a configolhatóságukról:

- **A skill-kiválasztás** (hogy egyáltalán melyik SKILL.md induljon el) a Claude Code
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
| 6 | "dolgozd fel a review kommentjeimet" | `execute/SKILL.md` → `review-feedback.md` — R1 (review-státuszú ticket emberi visszajelzéseinek feldolgozása, majd A7-re visszatérve a szokásos kapuk) |
| 7 | "ismerd fel a repo stackjeit és generálj best practice kivonatot" | `best-practice-bootstrap.md` — kézzel indítható, önálló lépés |
| 8 | "vedd magadhoz a következő storyt gyorsmódban" | `execute/SKILL.md` — A4 (pickup), `STORY_BATCH_MODE=on` explicit felülírással erre a futásra — a szülő Story + minden nyitott sub-taskja egyetlen körben (egy branch/MR/pipeline/review). Lásd "STORY_BATCH_MODE értékek". Közeli parafrázis is elég (pl. "…egyben", "…egy körben"). |
| 9 | "keretezzük fel ezt az ötletet, mielőtt nekilátnánk scope-olni" | `dev-workflow-discovery/SKILL.md` — a dev-workflow lánc opcionális, legelső belépési pontja; önállóan is hívható, vagy a `dev-workflow-scoping/SKILL.md` "1. Kezdeti scope-felmérés" lépése hívja meg automatikusan a `DISCOVERY_DEPTH` kapcsoló szerint. Közeli parafrázis is elég (pl. "segíts kikeretezni ezt, mielőtt bármit eldöntenénk"). |
| 10 | "csináld meg előre az összes képernyőtervet" | `execute/SKILL.md` → `design-branch.md` — B8 (design-előfutás: az összes design-érintett ticket képernyőterve előre, oldalnév szerint deduplikálva, jóváhagyás után sorosan B4 → B5, egyetlen megállással). Lásd "Design-előfutás (B8)". |
| 11 | "nézd át UX-szemmel az appot" | `ux-designer/SKILL.md` — audit: böngészős bejárás a `UX_AUDIT_TARGET` ellen, user-flow térkép, Nielsen + WCAG 2.2 AA szerinti, súlyozott találatok. Lásd "UX-designer (UX_*)". Közeli parafrázis is elég (pl. "csinálj UX-auditot"). |
| 12 | "gondold újra a flow-t és tervezz új képernyőket" | `ux-designer/SKILL.md` — redesign: célflow és képernyőnkénti UX-spec a meglévő UI-szerződésre építve (T0–T3 szintek, TS/API-delta), jóváhagyás után story-javaslatok a `dev-workflow-scoping`-nak. |
| 13 | "kritizáld ezt a képernyőtervet" | `ux-designer/SKILL.md` — critique: Figma-terv vagy élő oldal értékelése a UX-spec és a rubrika ellen, Block / Needs changes / Approve verdikttel. A pipeline-ban a `design-branch.md` B4a hívja. |
| 14 | "csináld meg az `<EPIC-KULCS>` epicet storynként" | `execute/SKILL.md` → `epic-mode.md` — E1 (epic-mód: storynként branch → MR → zöld pipeline → review → merge → a következő story a friss alap branch-ről; független storyk párhuzamosan, worktree-ben; `EPIC_*` kapcsolók, lásd „Epic-mód” szakasz) |

Ha átírod valamelyik mondatot, frissítsd a SKILL.md fájlok `description` mezőjében lévő
példamondatot is (ott csak illusztráció, de érdemes szinkronban tartani), és a
[`README.md`](README.md) indító parancsok táblázatát.

## Jira / assignee

| Változó | Alapérték | Leírás |
|---|---|---|
| `ASSIGNEE_FOR_PICKUP` | `<ASSIGNEE_FOR_PICKUP>` ✅ *(accountId `<ASSIGNEE_ACCOUNT_ID>`)* | Erre a névre szűrve válogat ticketet a pickup lépés (execute SKILL.md A4). |
| `MANUAL_DEV_ASSIGNEE` | `<MANUAL_ASSIGNEE_NAME>` | Az eszkalált fix-ticketek (7b/9/8b) felelőse — a te vagy egy kollégád Jira accountja. |
| `MANUAL_REVIEWER_ASSIGNEE` | `<MANUAL_ASSIGNEE_NAME>` | A design-review ticketek felelőse (aki a Figma-tervet review-zi). |
| `INITIAL_STATUS_NAME` | `To Do` | A Jira workflow kezdő státusza — a `createJiraIssue` mindig ide hoz létre, az A4 pickup JQL-je erre szűr. Ha a Jira projekt más néven hívja a kezdő oszlopot (pl. `Backlog`, `Open`), **itt írd át** — minden skill/subagent innen olvassa, sehol nincs máshol beégetve a `"To Do"` szó szerinti string. |
| `REVIEW_STATUS_NAME` | `review` ✅ *(kisbetűs Jira státusznév, `id: 10003`, API-val megerősítve)* | Jira státusz, ahova a ticket kerül, ha az implementáció minden kapun zöld volt (execute A8a). Az `In Progress`-ből induló saját (nem globális) átmenet neve "implementation is under review", `transition id: 7`. Ne exact-case string-matchelj a nagybetűs `Review`-ra — a `statusCategory.name` "In Progress", de a tényleges `status.name` `review`. |

## Jira label-rendszer (AI-ügynök szerinti szűrés)

> ✅ **Bevezetve (2026-08-21)**: a Jira ticketek mostantól egy AI-ügynök labelt is
> kaphatnak (`claude` vagy `codex`), amivel eldönthető, melyik AI-workflow dolgozzon
> rajta. Ez a repo `.claude/`-alatti workflow-ja **kizárólag** a `claude` labellel
> ellátott ticketeket veszi számításba, amikor munkát kezdene (pickup, elakadt-ticket
> ellenőrzés, design-review keresés) — a `codex` labelű vagy label nélküli ticketeket
> figyelmen kívül hagyja, ne is jelezze őket "elakadt"-ként vagy felvehetőként.
>
> ✅ **Bővítve**: egy külön, `WORKFLOW_FLAGGED_LABEL` (`workflow-flagged`) label
> bármelyik ticketet **teljesen kiveheti** az automatikus kezelésből — a workflow
> flaggelt ticketet nem vesz fel, nem javít, és "elakadt"-ként sem jelez, függetlenül
> attól, hogy egyébként `claude` labeles-e. Ez a "ezt a ticketet a workflow hagyja
> békén" kézi kapcsoló (pl. mert a ticket egy része csak merge után/manuálisan
> bizonyítható, vagy mert a felhasználó félretette).

| Változó | Alapérték | Leírás |
|---|---|---|
| `CLAUDE_WORK_LABEL` | `claude` | Elsődlegesen **kézzel** rakott Jira label (te teszed fel, amikor eldöntöd, hogy egy ticketen a claude-workflow dolgozzon) — **kivéve** a B4/B5-ben automatikusan létrejövő web-design/design-review ticketeket, amik egy már `CLAUDE_WORK_LABEL`-es implementációs ticketből ágaznak le, ezért ezt a workflow saját maga örökíti át rájuk (lásd `design-branch.md` B4/B5), különben a B6 design-review-check sosem találná meg a saját maga csinálta ticketet. Minden JQL, ami "melyik ticketen kezdjek dolgozni" kérdést tesz fel (A4 pickup, elakadt-ticket ellenőrzés, B6 design-review keresés), **kötelezően** `AND labels = <CLAUDE_WORK_LABEL>` feltétellel szűr. Ha egy ticketen nincs ez a label (pl. `codex` labelt kapott, vagy egyáltalán nincs label), a workflow **nem** veheti fel/nem kezelheti automatikus lépésben, még akkor sem, ha egyébként minden más feltételnek (assignee, státusz) megfelel. Ismert ticket-kulccsal induló belépési pontok (A8 folytatás, B7, review-feedback) **nem** ellenőrzik újra ezt a labelt — szándékos döntés, mert ott a ticket-kulcsot már a felhasználó/beszélgetés adta meg explicit módon. Ha egy ticketen **egyszerre** van `claude` és `codex` label is, mindkét workflow megtalálhatja és felveheti — ez tudatosan nincs kizárva, a felhasználó manuálisan figyel rá, hogy ne legyen egyszerre két label egy ticketen. |
| `CLAUDE_CREATED_LABEL` | `claude-created` | **Automatikusan**, minden `createJiraIssue` hívásnál rárakandó label — ez a workflow bármelyik ticket-létrehozó lépése (`jira-ticket-template.md`-t használó összes hely: intake, web-design/design-review ticket, fix-ticket eszkaláció, önálló `jira-ticket`) mindig ráteszi, hogy a ticket eredete (ki/mi hozta létre) utólag is látszódjon. **Ez nem ugyanaz, mint a `CLAUDE_WORK_LABEL`** — a `claude-created` csak eredetet jelöl, nem azt, hogy a Claude-workflow-nak kell rajta dolgoznia (egy `claude-created` ticketet is átvehet egy ember vagy a `codex` workflow, ha úgy döntenek). A két label egy ticketen egymástól függetlenül, akár egyszerre is jelen lehet. |
| `WORKFLOW_META_LABEL` | `workflow-meta` ✅ *(bevezetve 2026-08-23, a `dev-workflow-backlog-intake-runbook.md` 26 ticketjén már rajta van)* | Jelöli, hogy a ticket célja maga a `.claude/` alatti dev-workflow eszköztár (skill/config/sablon Markdown) módosítása, **nem alkalmazás-kód** — nincs futtatható/deployolható eredmény, amit tesztelni vagy test-env-ben megnézni lehetne. Ha az A4 pickup egy ilyen labelű ticketet vesz fel, az `execute/SKILL.md` **A7** (helyi AC-ellenőrzés, `qa-tester`) és **A8** (teszt-env/pipeline ellenőrzés) lépése kimarad — lásd ott a pontos elágazást. A push/MR-nyitás és a **9. lépés** (code review: lokál diff-átnézés, Jira- **és** GitLab MR-kommentek, lokál javítókör) változatlanul lefut, ez adja a minőségi kaput helyettük. Ettől függetlenül a `CLAUDE_WORK_LABEL`-t is meg kell kapnia a ticketnek, hogy az A4 egyáltalán felvegye — a két label együtt, egymástól függetlenül él a ticketen. |
| `WORKFLOW_FLAGGED_LABEL` | `workflow-flagged` | **Kézzel** rakott Jira label, ami a ticketet **kiveszi** minden automatikus workflow-lépésből. Minden JQL, ami "melyik ticketen dolgozzak / mi akadt el" kérdést tesz fel (A4 pickup, A4 elakadt-ticket ellenőrzés, `design-branch.md` B6 design-review keresés + elakadt design-review ellenőrzés) **kötelezően** `AND labels not in (<WORKFLOW_FLAGGED_LABEL>)` feltétellel is szűr, a kötelező `AND labels = <CLAUDE_WORK_LABEL>` mellett. Mivel a `labels = <CLAUDE_WORK_LABEL>` feltétel amúgy is garantálja, hogy a `labels` mező nem üres, a `not in (...)` kizárás itt nem ejt ki véletlenül label nélküli ticketeket — de **önállóan, `labels = <CLAUDE_WORK_LABEL>` nélkül ne** használd ezt a klózt (Jira JQL-ben a `labels not in (...)` a label nélküli ticketeket is kizárná). A flaggelt ticketet a workflow **nem veszi fel, nem javítja, és "elakadt"-ként sem jelzi** — akkor sem, ha minden más feltételnek (assignee, státusz, `claude` label) megfelel. Ismert ticket-kulccsal induló belépési pontok (A8 folytatás, B7, review-feedback) **nem** ellenőrzik ezt a labelt — ugyanaz a szándékos kivétel, mint a `CLAUDE_WORK_LABEL`-nél: ott a kulcsot a felhasználó explicit adta meg. A flag feloldása = a label kézi levétele a ticketről; utána a következő pickup újra számításba veszi. Független a `WORKFLOW_META_LABEL`-től és a `CLAUDE_WORK_LABEL`-től, akár együtt is állhat velük egy ticketen. **Fallback-szabály** (a `TRACKER_BACKEND` / `WORKFLOW_PROFILE` fallback-szabályának mintájára): ha ez a sor a `config.md`-ből **hiányzik** (pl. egy régebbi telepítés, amit még nem frissítettek — a `config.md` upgrade-kor nem íródik felül), a hívó skill a `labels not in (<WORKFLOW_FLAGGED_LABEL>)` klózt **teljesen hagyja el** (nem helyettesíti be üresre — az `labels not in ()` Jira JQL 400-at adna), és egy rövid egysoros jelzést ad ("`WORKFLOW_FLAGGED_LABEL` nincs a config.md-ben, a flag-szűrés kihagyva"). A flag-funkció ilyenkor inaktív, de a pickup nem akad el. |

## AI-identitás (GitLab commit/push/review szerzőség)

> ✅ **Tisztázva (2026-08-20)**: a felhasználó külön GitLab-usert (`<AI_GIT_NAME>`) hozott létre
> kifejezetten arra, hogy a skillek által generált munka (commit, push, review-komment) ne
> a felhasználó saját fiókja alatt jelenjen meg, hanem ez alatt. A szétválasztás három,
> egymástól független csatornán megy — mindegyiket **explicit, per-parancs felülírással**
> oldjuk meg (env var vagy hitelesített URL az adott hívásra), **nem** ambiens
> git-config/env-változó átírással — így a felhasználó saját, interaktív git/glab
> identitása soha nem sérül véletlenül, és nincs mit "visszaváltani" a skill futása után.

| Változó | Alapérték | Leírás |
|---|---|---|
| `AI_GIT_NAME` | `<AI_GIT_NAME>` | Commit author/committer név — a `commit-as-ai.sh` ezt írja a `GIT_AUTHOR_NAME`/`GIT_COMMITTER_NAME` env változókba. |
| `AI_GIT_EMAIL` | `<AI_GIT_EMAIL>` | A `<AI_GIT_NAME>` GitLab-user profiljában **megerősített** email — enélkül a GitLab nem tudja a commitot a fiókhoz kötni (blame/kontribúció-lista sem mutatná a userhez). |
| `AI_GITLAB_USERNAME` | `<AI_GIT_NAME>` | A GitLab `@handle` (a profil "Full name"-je `<AI_GITLAB_FULL_NAME>`, de a commit-szerzőséghez az `AI_GIT_NAME` értéket használjuk, nem ezt). |
| `AI_GITLAB_TOKEN_ENV_VAR` | `GITLAB_TOKEN_AI` | Annak a környezeti változónak a neve, amiben a `<AI_GIT_NAME>` fiókból generált Personal Access Token él (`api` + `write_repository` scope). Ezt a felhasználónak kell egyszer, saját maga beállítania (`setx GITLAB_TOKEN_AI "..."` egy saját terminálban) — **soha ne kerüljön be sehova ebbe a repóba vagy egy Jira/GitLab kommentbe.** |

**Előfeltétel a `<AI_GIT_NAME>` GitLab-user oldalán, mielőtt bármelyik szkript élesben futna:**
1. A fenti `AI_GIT_EMAIL` hozzáadva és megerősítve a profilban (commit-szerzőség
   egyeztetéshez).
2. Personal Access Token generálva `api` + `write_repository` scope-pal, elmentve a fenti
   env változóba.
3. A `<AI_GIT_NAME>` user felvéve a `REPO_MAP`-ben szereplő GitLab projekt(ek)be legalább
   **Developer** szerepkörrel — enélkül a push 403-mal elutasításra kerül.

**A három csatorna és a hozzá tartozó szkript** (mindegyiket repo-gyökérhez képest
`.claude/skills/dev-workflow/scripts/<név>`-ként kell hívni, függetlenül attól, melyik
skill-mappából indul a hívás — a Bash tool cwd-je mindig a repo gyökere, nem a skill saját
mappája):

| Csatorna | Szkript | Ki hívja | Mit vált ki |
|---|---|---|---|
| Commit-szerzőség | `commit-as-ai.sh` | `agents/implementer.md` (2. lépés, minden TDD-commit) | sima `git commit`-ot, `GIT_AUTHOR_*`/`GIT_COMMITTER_*` env-override-dal |
| Push | `push-as-ai.sh` | `dev-workflow-execute/SKILL.md` A7a | sima `git push origin <branch>`-et, `GITLAB_TOKEN_AI`-jal hitelesített ideiglenes remote URL-lel |
| GitLab MR-komment (review) | `glab-note-as-ai.sh` | `agents/code-reviewer.md` 5b, `gitlab-branch-review/SKILL.md` 6. lépés | sima `glab mr note create ...`-ot, `GITLAB_TOKEN_AI`-vel a `GITLAB_TOKEN` env-et felülírva erre az egy hívásra |
| MCP allow-list | `setup-mcp-allowlist.sh` | Egyszeri, **gépenkénti** onboarding — nem egy skill-lépés, a felhasználó futtatja kézzel új gépre települve | a `.claude/settings.local.json` kézi szerkesztését — a globális `settings.json`-ból kigyűjti a Figma/Jira MCP hex-ID-ket, kereszt-ellenőrzi a kapcsolat állapotát, és idempotensen felírja a 4 dev-workflow subagenshez szükséges `mcp__<hex>__<tool>` allow-list bejegyzéseket |
| Helyi LLM-hívás (végrehajtó-adapter) | `call-local-model.sh` | — (még senki; a LOCAL-2/LOCAL-3 köti be) | közvetlen Ollama-/OpenAI-kompatibilis HTTP-hívást (COCALC-220 / LOCAL-1) — dialektus-auto-detekció, séma-validációs horog, `LOCAL_MODEL_FALLBACK_POLICY` szerinti fallback-szerződés 3 megkülönböztetett kilépőkóddal, napló-alapú circuit breaker; lásd a szkript fejléc-kommentjét a teljes kontraktusért, és a lenti "WORKFLOW_PROFILE" preset-táblát a 7 konfigolható kapcsoló profilonkénti alapértékéért |

Ha a `<AI_GIT_NAME>` fiók adatai (név/email/username/token-env-változó neve) valaha változnak,
**csak itt írd át** — a szkriptek fejlécében lévő értékek ebből a táblázatból vannak
másolva (a szkriptek maguk nem tudnak markdown táblázatot beolvasni futásidőben, ezért a
konstansok duplikáltak — ha itt módosítod, frissítsd a három szkriptet is,
[`scripts/`](scripts/) alatt). A `setup-mcp-allowlist.sh` nem tartozik ebbe a kör(be) — az
nem AI-identitást, hanem gépenkénti MCP hex-ID-t kezel, lásd a fenti táblázat sorát.

**Manuális váltás** (amikor a felhasználó maga akar commitolni valamelyik identitással, a
skilltől függetlenül): lásd a repo-gyökér [`tools/switch-git-identity.ps1`](../../../tools/switch-git-identity.ps1)-t
— ez csak a lokális repó `user.name`/`user.email`-jét váltja a te vagy a `<AI_GIT_NAME>` értékre,
a push-hitelesítést nem (ahhoz a felhasználónak magának kell a megfelelő tokent/credential-t
használnia, vagy futtathatja a `push-as-ai.sh`-t is kézzel).

## GitLab Package Registry

| Env-változó | Leírás |
|---|---|
| `PACKAGE_REGISTRY_READ_USERNAME` | A group szintű Package Registry olvasási deploy token felhasználóneve. |
| `PACKAGE_REGISTRY_READ_TOKEN` | A group szintű Package Registry olvasási deploy token értéke. |
| `CI_JOB_TOKEN` | A CI pipeline-ból történő publikálás alapértelmezett (beépített GitLab CI) tokenje. |

A tokenek tényleges értéke nem kerülhet repóba, Jira-ticketbe,
GitLab-kommentbe, pipeline-logba vagy dokumentációba.

## Confluence-írás (CONFLUENCE_* kapcsolók)

> ℹ️ **Bevezetve (COCALC-374, a COCALC-372 sub-task-lánc tagja)**: ezek a kapcsolók adják
> meg, **hova** írjon a workflow Confluence-oldalt — ADR-eket a `dev-workflow-intake/
> SKILL.md` "2.e — ADR-trigger" lépése, Discovery Brief-eket a
> [`dev-workflow-discovery/SKILL.md`](../dev-workflow-discovery/SKILL.md) "4.
> Confluence-publikálás" lépése (COCALC-370). A Confluence-írás opcionális: a három
> érték üresen is szállítódik, ilyenkor a lenti fallback-szabály érvényes.

| Változó | Alapérték | Leírás |
|---|---|---|
| `CONFLUENCE_SPACE_KEY` | *(üres — repó-specifikus, kitöltendő)* | A Confluence space kulcsa, ahova a workflow ír. |
| `CONFLUENCE_ADR_PARENT_ID` | *(üres — repó-specifikus, kitöltendő)* | Az ADR-oldalak szülő-oldalának Confluence page ID-ja — minden generált ADR ez alá kerül. |
| `CONFLUENCE_BRIEF_PARENT_ID` | *(üres — repó-specifikus, kitöltendő)* | A Discovery Brief-oldalak szülő-oldalának Confluence page ID-ja — minden generált Discovery Brief ez alá kerül. |

> ℹ️ **Repó-specifikus értékek**: a Confluence space-t és a két szülő-oldalt a repó
> gazdájának kell (kézzel) létrehoznia, és az azonosítóikat ide beírnia. Más repó
> értékeit ne másold át — azok egy másik Confluence space-re mutatnak.

**Fallback-szabály** (a `TRACKER_BACKEND`/`WORKFLOW_FLAGGED_LABEL` fallback-szabály
mintájára): ha a fenti három kapcsoló közül **bármelyik hiányzik vagy üres**, a
Confluence-írás **kimarad** — a hívó lépés (intake ADR-létrehozás, discovery
Brief-publikálás) egy rövid egysoros jelzést ad (pl. "Confluence-írás kihagyva:
`CONFLUENCE_ADR_PARENT_ID` nincs beállítva"), és **nem akad el, nem hibázik**: az a
tartalom, amit egyébként a Confluence-oldal kapott volna, a Jira-ticket/komment
oldaláról változatlanul elkészül, csak a Confluence-másolat marad el.

## Repók és projektek

`REPO_MAP` — logikai név → repo elérési út/URL, alap branch, Jira project key. Ez a
repo-szintű másolat **csak** a saját repóját (<LOGICAL_REPO_NAME>) tartalmazza — egy **teljesen
másik, önálló alkalmazáshoz** (a "construction calculator" apphoz, aminek saját,
`<OTHER_REPO_NAME>`/`<OTHER_REPO_NAME>` nevű repói vannak) lesz saját,
oda konkretizált másolat, ha *azokban* is bevezetitek a workflow-t. Ne keverd össze a két
alkalmazást — a <LOGICAL_REPO_NAME> csak a Jira `<JIRA_PROJECT_KEY>` project key-t osztja meg azzal az appal,
a kódbázisuk teljesen független.

| Logikai név | Repo path/URL | Alap branch | Jira project key |
|---|---|---|---|
| `<LOGICAL_REPO_NAME>` | `<REPO_PATH>` | `master` | `<JIRA_PROJECT_KEY>` |

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
| `TICKET_INFOBOX_FIELDS` | `típus`, `dátum`, `story felelős`, `komplexitás` | A ticket fejlécében táblázatos/infobox formában megjelenő mezők — ez a lista a forrás, **nincs felső korlát** a mezők számára (lásd [jira-ticket-template.md](jira-ticket-template.md) "Fejléc infobox" szekció). Design-érintett ticketeknél **kötelezően** bekerül még egy `oldalnév` mező is. |
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
| `PLAN_SAVE_MAX_LINES` | `40` | COCALC-386, a COCALC-383 sub-taskja — a `../dev-workflow-execute/tracker-adapter.md` "Művelet 1 — terv mentése" sor-korlátja (terv + felderített fájllista együtt). Sima szám, **nem** profilfüggő preset-tábla sor (a `MAX_LOCAL_FIX_RETRIES` mintája) — a tárolás módja (Jira-komment, fix "## Terv (jóváhagyva) — <SHA>, <dátum>" címsor-minta) ettől függetlenül változatlan. |

## Teszt-adat generálás

| Változó | Alapérték | Leírás |
|---|---|---|
| `TEST_DATA_DIR` | `test-data/` (repo gyökeréhez képest) | Ide kerülnek az `implementer` által generált minta-adatfájlok (lásd `agents/implementer.md` "1b" lépés), ha az AC adatbevitelt/feltöltést/importot érint és a repóban még nincs erre már bevett konvenció (pl. a <LOGICAL_REPO_NAME> repóban a gyökérben lévő `<LOGICAL_REPO_NAME>_teszt_*.csv`/`.xlsx` fájlok — ha ilyen meglévő konvenciót talál, azt kövesse ez helyett). |

## Stack-felismerés (best practice bootstrap)

> ℹ️ **Bevezetve (COCALC-225)**: a kapcsolókat ténylegesen használó skill a
> [`best-practice-bootstrap.md`](best-practice-bootstrap.md) — kézzel indítható, a repo
> stackjeit build/manifest-fájlok alapján felismeri, és minden felismert, még
> dokumentálatlan stackhez legenerál egy `docs/best-practices-<slug>.md` draft fájlt. A
> négy fogyasztó (`implementer.md`, `code-reviewer.md`, `skills/code-reviewer/SKILL.md`,
> `gitlab-branch-review/SKILL.md`) csak a `Státusz: jóváhagyott` fájlokat veszi
> figyelembe, a `draft`-ot figyelmen kívül hagyja.

| Változó | Alapérték | Leírás |
|---|---|---|
| `BEST_PRACTICE_DOCS_DIR` | `docs/` | Ide kerülnek a generált `best-practices-<slug>.md` fájlok, repo gyökeréhez képest. |

`STACK_DETECTION_MAP` — build/manifest-minta → stack-slug leképezés. Új stack
hozzáadásához elég egy új sort felvenni, skill/szkript módosítás nélkül nem kell hozzá
más. Ismeretlen/nem egyező manifest esetén a bootstrap **csendben kihagyja** azt a
sort — nem blokkol, nem hallucinál stacket, amihez nincs manifest-egyezés (ugyanaz a
megengedő fallback-elv, mint a fenti "Fallback-szabály" szekcióban).

| Minta (build/manifest fájl + benne keresett jelző) | Stack-slug |
|---|---|
| `package.json` + `@angular/core` függőség | `angular` |
| `build.gradle.kts` vagy `pom.xml` + `org.springframework.boot` | `java-spring` |

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

> ℹ️ **Bevezetve (COCALC-899, 4.21.0)** — a [`../ux-designer/SKILL.md`](../ux-designer/SKILL.md) skill és a [`../../agents/ux-designer.md`](../../agents/ux-designer.md) subagent
> olvassa (11–13. indító mondat). A változási keretet a
> [`scripts/ui-contract.js`](scripts/ui-contract.js) ellenőrzi, az [`../../agents/implementer.md`](../../agents/implementer.md)
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
> [`../dev-workflow-execute/epic-mode.md`](../dev-workflow-execute/epic-mode.md); a szkriptek:
> [`../dev-workflow-execute/scripts/epic-worktree.sh`](../dev-workflow-execute/scripts/epic-worktree.sh),
> [`scripts/merge-as-ai.sh`](scripts/merge-as-ai.sh) és [`scripts/wait-for-mr-sha.sh`](scripts/wait-for-mr-sha.sh).
> Egy story belseje a batch-út (`STORY_BATCH_MODE=on`). A kapcsolók nem thoroughness-profil-függők,
> ezért nincsenek a preset-táblában; egy futásra az azonos nevű környezeti változó vagy a
> felhasználó mondata („…storynként jóváhagyással”, „…sorban, párhuzamosítás nélkül”) felülbírálja.
> A `-` érték „nincs beállítva”-t jelent.

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
> story-runner feladatleírása: [`../dev-workflow-execute/story-runner-brief.md`](../dev-workflow-execute/story-runner-brief.md).

| Érték | Jelentés |
|---|---|
| `main` *(alap)* | A mai viselkedés: a story körét a fő szál vezeti (`epic-mode.md` E4–E6). |
| `subagent` | Storyként egy **story-runner** subagent viszi a kört (munkafa, branch, In Progress, sub-taskonként az implementáció a helyi lépésekkel, helyi kapu, push + MR, pipeline, code review, javító körök, `review` státusz) — **merge nélkül**. A fő szálon csak a tervfrissítés, az indítás, az eredmény független ellenőrzése, a merge, a lezárás és az epic-állapot marad, így a fő szál kontextusa storyként csak egy rövid összefoglalóval nő. |

### EPIC_REFRESH_MODE értékek

> ℹ️ **Bevezetve (ORD-370, 4.26.0)**, az ORD-2 epic-futás tapasztalata alapján: az auto mód a
> force pusht letiltja, ezért a rebase utáni `--force-with-lease` push nem futott le.

| Érték | Jelentés |
|---|---|
| `merge` *(alap)* | `git merge --no-commit --no-ff origin/<alap>`, a merge-commit az AI-identitással (`commit-as-ai.sh`), utána fast-forward push — **force push nélkül**. Ütközésnél `git merge --abort`, a story megáll. A branch története merge-commitot kap; a végső merge (merge-commit, nem squash) ezt változatlanul viszi. |
| `rebase` | A korábbi viselkedés: `git rebase origin/<alap>`, utána `push-as-ai.sh <branch> --force-with-lease`. Ütközésnél `git rebase --abort`, a story megáll. Lineáris történet, de force push kell. |

**Fallback-szabály**: ismeretlen/elgépelt `EPIC_*` érték → visszaesés a fenti alapértékre,
egysoros jelzéssel; az E-ág nem akad el emiatt.

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
