# dev-workflow — execute, E-ág: story-runner (EPIC_STORY_HOST=subagent)

> ℹ️ **Bevezetve (ORD-365, 4.25.0)**, az ORD-2 epic-futás kísérletéből, 1:1-ben (felosztás,
> feladatleírás, parancsok, szabályok, napló). Csak `EPIC_STORY_HOST=subagent` mellett él
> (lásd [`../dev-workflow/config-reference.md`](../dev-workflow/config-reference.md) „EPIC_STORY_HOST értékek”);
> `main` mellett az [`epic-mode.md`](epic-mode.md) E4–E6 változatlanul a fő szálon fut.

**Miért:** a fő szálas story-kör (és benne a helyi modell vezérlése) storyként több száz
fordulóval növeli a fő szál kontextusát. A story-runner a kört a saját kontextusában viszi,
a fő szál storyként csak egy legfeljebb 25 soros összefoglalót kap.

## Felosztás

**Fő szál** (storyként):
1. a takarítás és a friss `origin/<EPIC_BASE_BRANCH>`;
2. az `architect` tervfrissítése (a mentett tervet a friss alaphoz igazítja), a terv mentése a
   tracker „terv mentése” műveletével **és** a `<LOCAL_RUN_DIR>/<STORY>-plan.md` fájlba;
3. a branchnév képzése (`BRANCH_NAME_PATTERN`, `TICKET_NATURE_TAGS`) és a slot kiosztása, a
   story-runner indítása a lenti sablonnal;
4. az összefoglaló **független** ellenőrzése (lent „Az eredmény ellenőrzése”);
5. az új kötelező titok kérdése, ha a story ilyet vezet be (név szerint, érték nélkül);
6. merge: `merge-as-ai.sh <iid> <sha>` (E6);
7. a story és a sub-taskok Done-ra (`done-on-merge` vagy egyenként);
8. a munkafa eltávolítása (`epic-worktree.sh remove <slot>`);
9. az epic-komment (`## Epic-futás — <dátum>`) frissítése.

**Story-runner** (`general-purpose` subagent, `sonnet`; egy story):
1. munkafa (`epic-worktree.sh add <slot> <branch>`);
2. branch (a fő száltól kapott név, nem változtatja);
3. In Progress (a story és a bevont sub-taskok);
4. sub-taskonként a helyi lépések (a [`local-runner.md`](../../agents/local-runner.md)
   „Parancsok” szerint, **maga futtatja**, nem indít hozzá local-runnert) és a felhős szintű
   sub-taskok;
5. a helyi kapu (A7, `qa-tester` subagent);
6. push és MR;
7. várakozás a pipeline-ra;
8. a code review (9, `code-reviewer` subagent);
9. a javító körök;
10. `review` státusz.

**Merge-et nem csinál.**

## Story-runner feladatleírás (sablon; helyettesítsd a `<…>` részeket)

```
Te vagy a story-runner a(z) <EPIC> epic <STORY> storyjára (repo: <FŐ MUNKAFA>, munkafa: <WORKTREE>, slot <SLOT>).
Előbb olvasd be: <FŐ MUNKAFA>/CLAUDE.md (vagy AGENTS.md), <FŐ MUNKAFA>/.claude/skills/dev-workflow-execute/story-runner-brief.md
(„Parancsok”, „Szabályok”), <FŐ MUNKAFA>/.claude/agents/local-runner.md, a konvenció-fájl: <LOCAL_CONVENTIONS_FILE>,
a frissített terv: <LOCAL_RUN_DIR>/<STORY>-plan.md és a ticketek: <TICKET-OLVASÓ PARANCS> <STORY> (és a sub-taskok).
Feladat: a story teljes köre a dev-workflow-execute A5–A8a szerint, batch módban (STORY_BATCH_MODE=on,
STORY_BATCH_EXECUTOR_SCOPE=<SCOPE>), DE merge nélkül. A branch neve: <BRANCH> (ne változtasd). Végrehajtó-szintek:
<SZINTEK>. Minden local szintű implementációs részlépést előbb a helyi modell (<LOCAL_MODEL_NAME>) kap meg, a
local-runner.md „Parancsok” szerint, amit te magad futtatsz. Ha az exit 2 vagy a health check bukik: AZONNAL állj meg,
és add vissza: LOCAL_UNREACHABLE — KIVÉVE, ha a hívás stderr-jében „circuit breaker nyitva” áll: az nem
elérhetetlenség (a korábbi rossz válaszok nyitották), hanem visszaesés, a sub-task hátralévő részlépéseire is. Exit 1 vagy 3/4/5, illetve piros teszt / típus / lint esetén: kis hibát javíts,
nagyobbnál írd meg te (visszaesés), és naplózd a <LOCAL_RUN_DIR>/local-stats.md-be (meglévő táblaformátum).
A helyi kaput (A7) a qa-tester, a code reviewt (9) a code-reviewer subagenttel futtasd; ha subagentet nem tudsz
indítani, állj meg, és add vissza: SUBAGENT_UNAVAILABLE (a kaput és a reviewt ne végezd el magad).
Ha a wait-for-pipeline.sh 4-es kóddal tér vissza (nincs alkalmas runner): ne javíts és ne várj tovább, állj meg,
és add vissza: PIPELINE_NO_RUNNER, a szkript diagnózisával.
Minden subagent-hívásod (qa-tester, code-reviewer) `description`-je tartalmazza a story-azonosítót (<STORY>), pl. „code-review <STORY>” — a futási metrika (ORD-376) ebből rendeli a storyhoz.
A tapasztalatokat (mi tért el a sablontól, mi működött) írd a <LOCAL_RUN_DIR>/run-notes.md-be.
Visszaadandó (max. 25 sor): MR IID és a head SHA, a pipeline verdiktje, a review-döntés és a nyitott minor
tételek, a sub-taskok helyben / visszaeséssel számai, a felhasználónak jelzendő döntések, az új kötelező titkok
(név, érték nélkül), és hogy a munkafa tiszta-e.
```

A helyőrzők: `<LOCAL_RUN_DIR>` és `<LOCAL_CONVENTIONS_FILE>` a `config.md` értékei
feloldva (abszolút útvonal); `<TICKET-OLVASÓ PARANCS>` a [`tracker-adapter.md`](tracker-adapter.md)
„ticket beolvasása” művelete a tracker-backend szerint; `<SZINTEK>` az A5a térképe (pl.
`implementer: PROJ-11=local, PROJ-12=haiku; qa-tester=haiku; code-reviewer=sonnet`);
`<LOCAL_MODEL_NAME>` és a többi `LOCAL_MODEL_*` a config / env értéke.

## Parancsok (a munkafából futtatva)

- **Munkafa:** `bash .claude/skills/dev-workflow-execute/scripts/epic-worktree.sh add|remove <slot> …`
  (a fő repóból). Törölni csak ezzel szabad, `rm -rf`-fel soha. `remove` után a csak
  függőség-mappát (pl. `node_modules`) tartalmazó maradványt a fő szál törli.
- **Helyi lépések** (prompt, hívás, válasz alkalmazása, ellenőrzés, commit, napló, kilépési
  kódok): [`local-runner.md`](../../agents/local-runner.md) „Parancsok”, „Eredmény-kezelés”,
  „Napló”.
- **Push és MR:**
  - az első push előtt `bash .claude/skills/dev-workflow/scripts/check-protected-ref.sh <branch>`
    (`PIPELINE_GATE_PROTECTED_REF_CHECK`; `stop` módban a 2-es kód → `PIPELINE_NO_RUNNER`,
    push nélkül; `warn` módban a figyelmeztetés az összefoglalóba kerül);
  - `bash .claude/skills/dev-workflow/scripts/push-as-ai.sh <branch>`;
  - `bash .claude/skills/dev-workflow/scripts/glab-note-as-ai.sh mr create …` (a leírásban az
    E5 „Merge: az E-ág automatikusan mergeli …” sora);
  - várakozás: `wait-for-mr-sha.sh <iid> <sha>`, majd
    `PIPELINE_GATE_TIMEOUT_MINUTES=<perc> wait-for-pipeline.sh <branch>` (exit 3 = időtúllépés,
    exit 4 = nincs alkalmas runner → `PIPELINE_NO_RUNNER`).
- **Merge** (csak a fő szál): `merge-as-ai.sh <iid> <sha>`, majd a tracker `done-on-merge`
  (vagy egyenkénti státuszváltás).

## Szabályok

- A fő munkafát ne módosítsd (más session dolgozhat benne).
- Titkot ne generálj és ne írj ki. A repó `CLAUDE.md` / `AGENTS.md` tiltásai (megosztott
  adatbázis, staging-parancsok stb.) a story-runnerre is vonatkoznak.
- A story végén állítsd le a saját háttérfolyamataidat (dev szerver, beragadt shell), különben
  a munkafa nem törölhető.
- Láncban a commit csak zöld ellenőrzés után futhat; a commit-üzenet csak a már alkalmazott
  változtatást írhatja le.
- **Branchnév:** csak a `BRANCH_NAME_PATTERN` / `TICKET_NATURE_TAGS` szerinti, a fő száltól
  kapott név. Ha a CI-runner csak védett refeken fut, más előtagnál a jobok azonnal
  elakadnak (ORD-2 kísérlet: egy nem a konvenció szerinti előtagú branch pipeline-ja nem
  indult el).
- Force push a story-runnerben soha. Az E6 merge-sor frissítése a fő szálé: `EPIC_REFRESH_MODE=merge`
  *(alap)* mellett force push nélkül (merge-commit, fast-forward push), `rebase` mellett
  `--force-with-lease`-szel.

## Az eredmény ellenőrzése (fő szál)

A fő szál **nem csak az összefoglalóra** hagyatkozik — a story-runner maga vezeti a QA-kapukat,
ezért merge előtt függetlenül ellenőriz:
1. `git -C <worktree> rev-parse HEAD` egyezik a visszaadott head SHA-val, és a munkafa tiszta;
2. a pipeline erre a SHA-ra zöld (`wait-for-mr-sha.sh`, majd `wait-for-pipeline.sh`; a
   `merge-as-ai.sh` is ehhez köti a merge-et);
3. a `code-reviewer` MR-kommentjéből (nem az összefoglalóból) a döntés és a nyitott
   blocker/major tételek: ha van nyitott blocker/major, a story **megáll** (E „Megállási
   pontok”).

A visszatérési állapotok: `LOCAL_UNREACHABLE` → az epic-futás megáll (a helyi modell nem
érhető el, nem esik csendben Claude-ra); `SUBAGENT_UNAVAILABLE` → a story megáll (a fő szál
`EPIC_STORY_HOST=main` szerint folytathatja, a felhasználó döntésével); `PIPELINE_NO_RUNNER`
→ az epic-futás megáll (a CI-runner hiánya / a nem védett ref minden storyt érint, a
felhasználó dönt, lásd `epic-mode.md` „Megállási pontok”); minden más
nem kategorizálható hiba → a story megáll.

## Futás-jegyzet

A story-runner storyként egy szakaszt ír a `<LOCAL_RUN_DIR>/run-notes.md`-be:

```
## <STORY> — <dátum>
- Eltérés a sablontól / a parancsoktól:
- Ami jól működött:
- Ami nem működött, és mire változott:
- Fő szál költsége / kontextusnövekedés (ha ismert):
```
