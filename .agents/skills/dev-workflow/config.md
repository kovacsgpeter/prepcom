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

## Munkanyelv (WORKING_LANGUAGE)

| Változó | Érték |
|---|---|
| `WORKING_LANGUAGE` | `magyar` |

## Modell-stratégia fázisonként

| Változó | Érték |
|---|---|
| `PREFERRED_INTERVIEW_MODEL` | `gpt-5.6-sol` (`high` reasoning) |

## Indító parancsok (kanonikus mondatok)

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

## Jira / assignee

| Változó | Érték |
|---|---|
| `ASSIGNEE_FOR_PICKUP` | `<ASSIGNEE_FOR_PICKUP>` ✅ *(accountId `<ASSIGNEE_ACCOUNT_ID>`)* |
| `CODEX_WORK_LABEL` | `codex` |
| `CODEX_CREATED_LABEL` | `codex-created` |
| `MANUAL_DEV_ASSIGNEE` | `<MANUAL_ASSIGNEE_NAME>` |
| `MANUAL_REVIEWER_ASSIGNEE` | `<MANUAL_ASSIGNEE_NAME>` |
| `INITIAL_STATUS_NAME` | `To Do` |
| `REVIEW_STATUS_NAME` | `review` ✅ *(kisbetűs Jira státusznév, `id: 10003`, API-val megerősítve)* |

## AI-identitás (GitLab commit/push/review szerzőség)

| Változó | Érték |
|---|---|
| `AI_GIT_NAME` | `<AI_GIT_NAME>` |
| `AI_GIT_EMAIL` | `<AI_GIT_EMAIL>` |
| `AI_GITLAB_USERNAME` | `<AI_GIT_NAME>` |
| `AI_GITLAB_TOKEN_ENV_VAR` | `GITLAB_TOKEN_AI` |

## Repók és projektek

| Logikai név | Repo path/URL | Alap branch | Jira project key |
|---|---|---|---|
| `<LOGICAL_REPO_NAME>` | `.` *(aktív Git workspace gyökere)* | `master` | `<JIRA_PROJECT_KEY>` |

## Ticket formátum

| Változó | Érték |
|---|---|
| `TICKET_NATURE_TAGS` | `feature`, `fix`, `build`, `refactoring`, `chore` |
| `TICKET_INFOBOX_FIELDS` | `típus`, `dátum`, `story felelős` `manual dor` |
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

## GitLab-API terhelés (rate limit)

| Kapcsoló | Érték |
|---|---|
| `GITLAB_RATE_LIMIT_RETRIES` | `5` |
| `GITLAB_RATE_LIMIT_BACKOFF_SECONDS` | `20` |
| `CODE_REVIEW_MAX_INLINE_COMMENTS` | `5` |
| `TEST_ENV_DEPLOY_POLL_SECONDS` | `45` |
| `TEST_ENV_DEPLOY_WAIT_MINUTES` | `10` |

## Teszt-adat generálás

| Változó | Érték |
|---|---|
| `TEST_DATA_DIR` | `test-data/` (repo gyökeréhez képest) |

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

## Helyi végrehajtó (LOCAL_EXECUTOR_HOST)

| Kapcsoló | Érték |
|---|---|
| `LOCAL_EXECUTOR_HOST` | `main` |
| `LOCAL_RUN_DIR` | `../{repo}-local-run` |
| `LOCAL_CONVENTIONS_FILE` | `{task_dir}/conventions.md` |
| `LOCAL_FORMAT_CMD` | `-` |
| `LOCAL_CHECK_CMD` | `-` |
| `LOCAL_CHECK_DB_CMD` | `-` |

## CI-készenlét (CI_READINESS_*)

| Kapcsoló | Érték |
|---|---|
| `CI_READINESS_CHECK` | `on` |
| `CI_READINESS_CHECKED` | `-` |
| `CI_READINESS_MINUTES_LIMIT` | `auto` |

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
