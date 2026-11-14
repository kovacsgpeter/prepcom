# dev-workflow — konfiguráció (értékek)

Ez a fájl a workflow **állítható értékeit** tartalmazza, és csak azokat. Minden skill és subagent ezt
olvassa be először; rövid, egészben beolvasható.

- **Egy érték jelentése**, a lehetséges értékek és a fallback-szabály a csomaggal szállított
  [`config-reference.md`](config-reference.md) **azonos című szakaszában** van. Abból csak azt a
  szakaszt olvasd be, amelyikre szükséged van, a referenciát egészben soha.
- **Feloldási sorrend** ([`scripts/config-value.sh`](scripts/config-value.sh)): környezeti változó >
  explicit sor ebben a fájlban > a preset-tábla `WORKFLOW_PROFILE` szerinti oszlopa > a hívó beégetett
  alapértéke. Egy kulcs, amelynek nincs saját sora, a preset-táblából kap értéket.
- **Szerkesztés:** az értéket itt írd át. Új kulcsot `Változó` / `Kapcsoló` fejlécű táblába vegyél fel
  (`` | `KULCS` | `érték` | ``). Repó-lokális kiegészítés (saját szakasz, megjegyzés) a fájl végére
  kerüljön; az upgrade nem nyúl hozzá.
- A `<...>` helyőrzőket (`<REPO_PATH>`, `<JIRA_PROJECT_KEY>`, `<LOGICAL_REPO_NAME>`, `<TEST_ENV_URL>`,
  `<AI_GIT_NAME>`, `<AI_GIT_EMAIL>`, `<ASSIGNEE_ACCOUNT_ID>`, `<MANUAL_ASSIGNEE_NAME>`,
  `<FIGMA_FILE_REF_VALUE>` stb.) a saját repód értékeire cseréld, mielőtt bármelyik dev-workflow skillt
  használnád.
- Váratlan tracker-/API-állapotnál a [`history.md`](history.md) segít (nem hot-path olvasmány).

> 🔧 **Csomag-karbantartóknak:** ez a `config.template.md`, a fogyasztóknál `config.md` néven,
> repó-lokálisan él (`repo_local_exceptions`). Upgrade-kor a
> [`merge-config-keys.sh`](../../tools/dev-workflow-install/merge-config-keys.sh) csak az új kulcsokat
> szúrja be alapértékkel. Új kulcs: ide a sor, a magyarázat a `config-reference.md` azonos című
> szakaszába (`ci/verify-config-split.sh` ellenőrzi). Kulcs átnevezésekor tegyél ide gépi hintet:
> `<!-- dev-workflow:rename RÉGI_KULCS -> ÚJ_KULCS since=X.Y.Z -->`

## Jira automatizálás (opcionális, egyszeri Jira/GitLab admin-beállítás)

| Változó | Érték |
|---|---|
| `JIRA_AUTO_DONE_ON_MERGE` | `❓ nincs megerősítve` |
| `JIRA_AUTO_INPROGRESS_ON_BRANCH` | `❓ nincs megerősítve` |
| `JIRA_AUTO_INITIAL_STATUS_ON_CREATE` | `❓ nincs megerősítve` |
| `JIRA_WORKFLOW_HAS_DIRECT_SECOND_REVIEW_TRANSITION` | `❓ nincs megerősítve` |

## Tracker-backend (TRACKER_BACKEND)

| Változó | Érték |
|---|---|
| `TRACKER_BACKEND` | `jira` |
| `OPENPROJECT_WIKI_SSH_HOST` | - |
| `OPENPROJECT_WIKI_CONTAINER` | `openproject-web-1` |
| `OPENPROJECT_WIKI_LOGIN` | `claude-agent` |

## Munkamódprofil (WORKFLOW_PROFILE)

| Változó | Érték |
|---|---|
| `WORKFLOW_PROFILE` | `balanced` |

### Preset-tábla

| Egyedi kapcsoló | `cheap` | `balanced` | `genius` |
|---|---|---|---|
| `PIPELINE_GATE_BLOCKING_JOBS` | `rule` | `rule` | `rule` |
| `PIPELINE_GATE_POSITION` | `before-review` | `before-review` | `after-review` |
| `PIPELINE_GATE_ON_RED` | `escalate` | `once-then-escalate` | `retry` |
| `PIPELINE_GATE_ON_TIMEOUT` | `ask` | `ask` | `auto` |
| `LOCAL_GATE_MODE` | `fast` | `full` | `full` |
| `LOCAL_GATE_BROWSER_TARGET` | `local-dev-server` | `local-dev-server` | `local-dev-server` |
| `AGENT_CONTINUATION_MODE` | `same-thread` | `same-thread` | `off` |
| `CODE_REVIEW_DEFAULT_EFFORT` | `medium` | `full` | `full` |
| `STORY_BATCH_MODE` | `off` | `off` | `off` |
| `STORY_BATCH_EXECUTOR_SCOPE` | `batch` | `batch` | `batch` |
| `LOCAL_ENV_ISOLATION` | `port-offset` | `port-offset` | `port-offset` |
| `CANDIDATE_ENV_LIFETIME` | `mr-open` | `mr-open` | `mr-open` |
| `CODE_SCAN_INTAKE` | `off` | `auto` | `always` |
| `CODE_SCAN_VERIFY` | `git-only` | `on` | `on` |
| `CODE_SCAN_STRATEGY` | `hybrid` | `hybrid` | `hybrid` |
| `CODE_SCAN_MAX_AGENTS` | `2` | `4` | `6` |
| `CODE_SCAN_MODEL` | `sonnet` | `sonnet` | `sonnet` |
| `INTERVIEW_EXPLANATION_STYLE` | `terse` | `verbose` | `verbose` |
| `INTERVIEW_DEPTH` | `fast` | `thorough` | `thorough` |
| `WORKING_LANGUAGE` | `magyar` | `magyar` | `magyar` |
| `CHANGELOG_MODE` | `offline` | `offline` | `offline` |
| `CHANGELOG_STYLE` | `hu-dev` | `hu-dev` | `hu-dev` |
| `COMPLEXITY_ESTIMATION` | `hybrid` | `hybrid` | `hybrid` |
| `EXECUTOR_LADDER` | `local`→`haiku`→`sonnet`→`opus` | `local`→`haiku`→`sonnet`→`opus` | `local`→`haiku`→`sonnet`→`opus` |
| `COMPLEXITY_EXECUTOR_MAP` | lásd `scripts/resolve-executor-level.sh` | lásd `scripts/resolve-executor-level.sh` | lásd `scripts/resolve-executor-level.sh` |
| `OFFLOAD_PROFILE` | `off` | `off` | `off` |
| `OFFLOAD_PHASE_MATRIX` | lásd `scripts/resolve-executor-level.sh` | lásd `scripts/resolve-executor-level.sh` | lásd `scripts/resolve-executor-level.sh` |
| `OFFLOAD_CLAMP_DIRECTION` | `up` | `up` | `up` |
| `OFFLOAD_ACCEPTANCE_RECALL` | `0.8` | `0.8` | `0.8` |
| `OFFLOAD_ACCEPTANCE_MAX_INVALID_PATHS` | `0` | `0` | `0` |
| `OFFLOAD_AUTO_PROMOTE` | `suggest` | `suggest` | `suggest` |
| `LOCAL_MODEL_ENDPOINT` | `http://localhost:11434` | `http://localhost:11434` | `http://localhost:11434` |
| `LOCAL_MODEL_NAME` | `llama3` | `llama3` | `llama3` |
| `LOCAL_MODEL_TIMEOUT` | `15` | `30` | `60` |
| `LOCAL_MODEL_DIALECT` | `auto` | `auto` | `auto` |
| `LOCAL_MODEL_FALLBACK_POLICY` | `validate-and-fallback` | `validate-and-fallback` | `retry-then-fallback` |
| `LOCAL_MODEL_BREAKER_THRESHOLD` | `1` | `2` | `3` |
| `LOCAL_MODEL_BREAKER_COOLDOWN` | `900` | `900` | `900` |
| `LOCAL_MODEL_MAX_RETRIES` | `0` | `1` | `3` |
| `LOCAL_MODEL_THINK` | `auto` | `auto` | `auto` |
| `LOCAL_MODEL_NUM_CTX` | *(nincs)* | *(nincs)* | *(nincs)* |
| `LOCAL_MODEL_FORMAT` | *(nincs)* | *(nincs)* | *(nincs)* |
| `LOCAL_PHASES` | `implementer,repo-scanner` | `implementer,repo-scanner` | `implementer,repo-scanner` |
| `LOCAL_PROMPT_MAX_CHARS` | `90000` | `90000` | `90000` |
| `LOCAL_EXECUTOR_HOST` | `main` | `main` | `main` |
| `RUN_METRICS` | `off` | `off` | `off` |
| `RUN_METRICS_STORE` | `~/.dev-workflow/metrics/runs.jsonl` | `~/.dev-workflow/metrics/runs.jsonl` | `~/.dev-workflow/metrics/runs.jsonl` |
| `RUN_METRICS_MIN_SAMPLES` | `3` | `3` | `3` |
| `RUN_METRICS_EXCLUDE_ANOMALIES` | `on` | `on` | `on` |
| `LOCAL_HW_PROFILE` | *(üres)* | *(üres)* | *(üres)* |
| `THREAT_MODEL_INTAKE` | `auto` | `auto` | `auto` |
| `THREAT_MODEL_STRATEGY` | `hybrid` | `hybrid` | `hybrid` |
| `THREAT_MODEL_AUTONOMY` | `ask` | `ask` | `ask` |
| `NFR_INTAKE` | `auto` | `auto` | `auto` |
| `NFR_STRATEGY` | `hybrid` | `hybrid` | `hybrid` |
| `NFR_AUTONOMY` | `ask` | `ask` | `ask` |
| `DISCOVERY_DEPTH` | `off` | `light` | `full` |
| `ARCHITECT_INTAKE` | `off` | `auto` | `always` |
| `ARCHITECT_TARGET_EXECUTOR` | `claude` | `claude` | `claude` |

### INTERVIEW_EXPLANATION_STYLE

| Változó | Érték |
|---|---|
| `INTERVIEW_EXPLANATION_STYLE` | `verbose` |

### WORKING_LANGUAGE

| Változó | Érték |
|---|---|
| `WORKING_LANGUAGE` | `magyar` |

### CHANGELOG_MODE

| Változó | Érték |
|---|---|
| `CHANGELOG_MODE` | `offline` |

### CHANGELOG_STYLE

| Változó | Érték |
|---|---|
| `CHANGELOG_STYLE` | `hu-dev` |

### PIPELINE_GATE_* kapcsolók

| Kapcsoló | Érték |
|---|---|
| `PIPELINE_GATE_TIMEOUT_MINUTES` | `15` |
| `PIPELINE_GATE_POLL_SECONDS` | `45` |
| `PIPELINE_GATE_STUCK_GRACE_SECONDS` | `120` |
| `PIPELINE_GATE_PROTECTED_REF_CHECK` | `warn` |
| `CI_READINESS_CHECK` | `on` |
| `CI_READINESS_CHECKED` | `-` |
| `CI_READINESS_MINUTES_LIMIT` | `auto` |

### GitLab-API terhelés (rate limit)

| Kapcsoló | Érték |
|---|---|
| `GITLAB_RATE_LIMIT_RETRIES` | `5` |
| `GITLAB_RATE_LIMIT_BACKOFF_SECONDS` | `20` |
| `CODE_REVIEW_MAX_INLINE_COMMENTS` | `5` |
| `TEST_ENV_DEPLOY_POLL_SECONDS` | `45` |
| `TEST_ENV_DEPLOY_WAIT_MINUTES` | `10` |

## Modell-stratégia fázisonként

| Változó | Érték |
|---|---|
| `PREFERRED_INTERVIEW_MODEL` | `Opus 5` |

## Komplexitás → végrehajtó-szint routing

| Változó | Érték |
|---|---|
| `COMPLEXITY_ESTIMATION` | `hybrid` |
| `EXECUTOR_LADDER` | `local` → `haiku` → `sonnet` → `opus` |
| `COMPLEXITY_EXECUTOR_MAP` | lásd [`scripts/resolve-executor-level.sh`](scripts/resolve-executor-level.sh) |

### LOCAL_EXECUTOR_HOST értékek

| Kapcsoló | Érték |
|---|---|
| `LOCAL_RUN_DIR` | `../{repo}-local-run` |
| `LOCAL_CONVENTIONS_FILE` | `{task_dir}/conventions.md` |
| `LOCAL_FORMAT_CMD` | `-` |
| `LOCAL_CHECK_CMD` | `-` |
| `LOCAL_CHECK_DB_CMD` | `-` |

### RUN_METRICS értékek

| Kapcsoló | Érték |
|---|---|
| `RUN_METRICS_STORE` | `~/.dev-workflow/metrics/runs.jsonl` |
| `RUN_METRICS_MIN_SAMPLES` | `3` |
| `RUN_METRICS_EXCLUDE_ANOMALIES` | `on` |
| `LOCAL_HW_PROFILE` | *(üres)* |

### KOVET_REPORT értékek

| Kapcsoló | Érték |
|---|---|
| `KOVET_REPORT` | `auto` |

### OFFLOAD_ACCEPTANCE_* és OFFLOAD_AUTO_PROMOTE

| Kapcsoló | Érték |
|---|---|
| `OFFLOAD_ACCEPTANCE_RECALL` | `0.8` |
| `OFFLOAD_ACCEPTANCE_MAX_INVALID_PATHS` | `0` |

## Indító parancsok (kanonikus mondatok)

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

## Jira / assignee

| Változó | Érték |
|---|---|
| `ASSIGNEE_FOR_PICKUP` | `<ASSIGNEE_FOR_PICKUP>` ✅ *(accountId `<ASSIGNEE_ACCOUNT_ID>`)* |
| `MANUAL_DEV_ASSIGNEE` | `<MANUAL_ASSIGNEE_NAME>` |
| `MANUAL_REVIEWER_ASSIGNEE` | `<MANUAL_ASSIGNEE_NAME>` |
| `INITIAL_STATUS_NAME` | `To Do` |
| `REVIEW_STATUS_NAME` | `review` ✅ *(kisbetűs Jira státusznév, `id: 10003`, API-val megerősítve)* |

## Jira label-rendszer (AI-ügynök szerinti szűrés)

| Változó | Érték |
|---|---|
| `CLAUDE_WORK_LABEL` | `claude` |
| `CLAUDE_CREATED_LABEL` | `claude-created` |
| `WORKFLOW_META_LABEL` | `workflow-meta` ✅ *(bevezetve 2026-08-23, a `dev-workflow-backlog-intake-runbook.md` 26 ticketjén már rajta van)* |
| `WORKFLOW_FLAGGED_LABEL` | `workflow-flagged` |

## AI-identitás (GitLab commit/push/review szerzőség)

| Változó | Érték |
|---|---|
| `AI_GIT_NAME` | `<AI_GIT_NAME>` |
| `AI_GIT_EMAIL` | `<AI_GIT_EMAIL>` |
| `AI_GITLAB_USERNAME` | `<AI_GIT_NAME>` |
| `AI_GITLAB_TOKEN_ENV_VAR` | `GITLAB_TOKEN_AI` |

## Confluence-írás (CONFLUENCE_* kapcsolók)

| Változó | Érték |
|---|---|
| `CONFLUENCE_SPACE_KEY` | *(üres — repó-specifikus, kitöltendő)* |
| `CONFLUENCE_ADR_PARENT_ID` | *(üres — repó-specifikus, kitöltendő)* |
| `CONFLUENCE_BRIEF_PARENT_ID` | *(üres — repó-specifikus, kitöltendő)* |

## Repók és projektek

| Logikai név | Repo path/URL | Alap branch | Jira project key |
|---|---|---|---|
| `<LOGICAL_REPO_NAME>` | `<REPO_PATH>` | `master` | `<JIRA_PROJECT_KEY>` |

## Ticket formátum

| Változó | Érték |
|---|---|
| `TICKET_NATURE_TAGS` | `feature`, `fix`, `build`, `refactoring`, `chore` |
| `TICKET_INFOBOX_FIELDS` | `típus`, `dátum`, `story felelős`, `komplexitás` |
| `PAGE_NAME_SEPARATOR` | `_` |

## Jira issue type-ok (valódi Jira mező)

| `JIRA_SUBTASK_ISSUE_TYPE_MAP` kulcs | Jira issue type | Használat |
|---|---|---|
| `frontend` | `angular` | Frontend-réteghez tartozó implementációs részfeladat. |
| `backend` | `java` | Backend-réteghez tartozó implementációs részfeladat. |
| `fallback` | `Sub-task` | Egyéb/nem támogatott réteg, illetve ha a konfigurált rétegtípus az adott Jira projektben nem érhető el subtask-szinten. |

## Branch-elnevezés

| Változó | Érték |
|---|---|
| `BRANCH_NAME_PATTERN` | `{type}/{ticket_key}_{harom_szavas_osszefoglalo}` |
| `BRANCH_NAME_WORD_SEPARATOR` | `_` |

## Minőségi kapuk / retry

| Változó | Érték |
|---|---|
| `MAX_LOCAL_FIX_RETRIES` | `7` |
| `PLAN_SAVE_MAX_LINES` | `40` |

## Teszt-adat generálás

| Változó | Érték |
|---|---|
| `TEST_DATA_DIR` | `test-data/` (repo gyökeréhez képest) |

## Stack-felismerés (best practice bootstrap)

| Változó | Érték |
|---|---|
| `BEST_PRACTICE_DOCS_DIR` | `docs/` |

## Ticket-életciklus higiénia

| Változó | Érték |
|---|---|
| `STUCK_TICKET_THRESHOLD_DAYS` | `3` |
| `DESIGN_TICKET_CLOSE_STATUS` | `Closed` |

## Design-előfutás (B8)

| Változó | Érték |
|---|---|
| `DESIGN_PREPASS_UNCERTAIN_CANDIDATES` | `ask` |
| `DESIGN_PREPASS_MAX_PAGES` | `10` |

## UX-designer (UX_*)

| Változó | Érték |
|---|---|
| `UX_DESIGN_PRINCIPLES_FILE` | `docs/design-principles.md` |
| `UX_OUTPUT_DIR` | `docs/ux` |
| `UX_FRONTEND_DIR` | `frontend` |
| `UX_FRONTEND_APP_DIR` | `frontend/src/app` |
| `UX_BACKEND_DIR` | `backend` |
| `UX_DESIGN_TOKENS_FILE` | `frontend/src/styles/_design-tokens.scss` |
| `UX_AUDIT_TARGET` | `local-dev-server` |
| `UX_AUDIT_VIEWPORTS` | `1440x900,768x1024,375x812` |
| `UX_MAX_FINDINGS` | `15` |
| `UX_CRITIQUE_GATE` | `advisory` |
| `UI_CHANGE_BUDGET_DEFAULT` | `free` |
| `UI_CHANGE_BUDGET_BASE` | `origin/master` |

## Epic-mód (E-ág)

| Kapcsoló | Érték |
|---|---|
| `EPIC_APPROVAL_MODE` | `upfront` |
| `EPIC_PARALLEL_MODE` | `parallel` |
| `EPIC_MAX_PARALLEL` | `2` |
| `EPIC_LOCAL_LLM_CONCURRENCY` | `1` |
| `EPIC_ON_STORY_FAILURE` | `continue-independent` |
| `EPIC_BASE_BRANCH` | `master` |
| `EPIC_WORKTREE_ROOT` | `..` |
| `EPIC_WORKTREE_SETUP_CMD` | `-` |
| `EPIC_REBASE_CHECK_CMD` | `-` |
| `EPIC_TEST_ENV` | `skip` |
| `EPIC_MERGE_REMOVE_SOURCE_BRANCH` | `true` |
| `EPIC_SHA_WAIT_SECONDS` | `300` |
| `EPIC_SERIAL_PATHS` | `-` |
| `EPIC_STORY_HOST` | `main` |
| `EPIC_REFRESH_MODE` | `merge` |
| `EPIC_PORT_STEP` | `10` |
| `EPIC_ISOLATED_PORTS` | `-` |

## Teszt-environment

| Logikai név | URL | `TEST_ENV_MR_DEPLOY_MODE` |
|---|---|---|
| `<LOGICAL_REPO_NAME>` | `<TEST_ENV_URL>` | `<TEST_ENV_MR_DEPLOY_MODE>` — a konkrét deploy-viselkedést lásd a lenti `TEST_ENV_MR_DEPLOY_MODE` értéktáblában. |

## Design-review ciklus (B ág)

| Változó | Érték |
|---|---|
| `FIRST_REVIEW_REQUESTED_STATUS` | `first_review_requested` ✅ |
| `FIRST_REVIEW_DONE_STATUS` | `first_review_done` ✅ |
| `SECOND_REVIEW_REQUESTED_STATUS` | `second_review_requested` ✅ |
| `SECOND_REVIEW_DONE_STATUS` | `second_review_done` ✅ |
| `FIGMA_FILE_REF` | `<FIGMA_FILE_REF_VALUE>` |
