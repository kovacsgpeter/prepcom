# dev-workflow-execute — A8 teszt-env ellenőrzés

Az [`SKILL.md`](SKILL.md) A8 lépése (ORD-498): a 9 / 9a után, vagy közvetlenül a (3) „folytasd a 8-tól”
belépési pontról olvasd be. A szöveg változatlan; a lépésszámok a `SKILL.md`-re vonatkoznak.

> 📊 Lépés eleje: hívd meg a `mcp__ccd_session__mark_chapter` tool-t
> `dev-workflow-execute / A8 — Teszt-env ellenőrzés` címkével (ha a tool nem elérhető,
> hagyd ki és folytasd).

*(Ide ugrik közvetlenül a (3) "folytasd a 8-tól" belépési pont is — ha onnan jöttél, a
push/MR és a code review már megtörtént korábban, ne csináld újra, csak ha a felhasználó
kifejezetten jelzi, hogy új push történt azóta.)*

**Workflow-meta ticket kivétel**: ha a ticketen rajta van a `config.md`
`WORKFLOW_META_LABEL`, ez a teljes lépés kimarad — lásd a 9. lépés végén a kivételt
(közvetlen `REVIEW_STATUS_NAME` átállítás A8 helyett). Ne indíts pipeline-t/deploy-t
ilyen ticketnél, még akkor sem, ha a `TEST_ENV_MR_DEPLOY_MODE` egyébként `manual`-ként
megengedné.

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
    `POLL=$(bash .claude/skills/dev-workflow/scripts/config-value.sh TEST_ENV_DEPLOY_POLL_SECONDS 45)`
    és `TEST_ENV_DEPLOY_WAIT_MINUTES` (alapérték 10) — a ciklust ennyi perc után szakítsd
    meg, és jelezd, hogy a deploy nem készült el. Ne köss be rövidebb időközt: minden
    `glab ci status` több GitLab API-kérés, a sűrű lekérdezés rate limitet (429) okoz.
    Minden külön "kész van már?" tool-hívás egy felesleges LLM-kört fizettet ki.
- Hívd meg a `qa-tester` subagentet `test-env` target móddal, **csak a
  fenti ellenőrzés után**, ha a cél tényleg a jelenlegi branch/commit állapotát tükrözi —
  ugyanazt az A5a-ban meghatározott `qa-tester` szintet add át hívásidejű modell-
  argumentumként, mint A7-nél. **Batch módban (`STORY_BATCH_MODE=on`)** a `test-env`
  `qa-tester` hívás AC-listája is a bevont sub-taskok AC-jeinek **uniója** (ugyanúgy, mint
  A7-nél), egyszer az egy deployolt build ellen.
- **8a — zöld**: állítsd az eredeti ticket(ek)et `REVIEW_STATUS_NAME` státuszra. 💡 Ha
  több ticketet dolgozol fel egymás után, ez jó pont a `/clear`-re — a következő pickup
  (A4) a Jira ticketből olvas vissza mindent.
  - **Futási metrika (ORD-376)**: ha a `bash .claude/skills/dev-workflow/scripts/config-value.sh RUN_METRICS off`
    értéke nem `off`, a zöld kör után — nem epic-módban — rögzítsd a story metrikáját: a
    tracker-adapterrel állítsd elő a features-fájlt (komplexitás, AC-szám, sub-taskok
    típusa/executor-címkéje, design) egy ideiglenes JSON-ba, majd
    `node .claude/skills/dev-workflow/scripts/collect-run-metrics.js --story <ticket> --sessions <aktuális session id> --features-file <json> --plan-file <LOCAL_RUN_DIR>/<ticket>-plan.md --mr <iid> --warn-only`
    (epic nélkül). A session id a fő session transcript-fájl neve (`~/.claude/projects/<kódolt cwd>/`
    legutóbb módosított `.jsonl`-ja, kiterjesztés nélkül). A hiba csak figyelmeztetés.
    Workflow-meta ticketnél (nincs 8a, a merge kézi) nem fut. `collect+estimate` értéknél a
    gyűjtő automatikusan beolvassa a `<LOCAL_RUN_DIR>/<ticket>-estimate.json` fájlt. **Subagent-hívásnál** (implementer,
    architect, qa-tester, code-reviewer, local-runner) a `description` tartalmazza a
    story-azonosítót (pl. „code-review ORD-86”) — a gyűjtő ebből rendeli a storyhoz.
  - **Batch módban (`STORY_BATCH_MODE=on`)**: **minden bevont sub-task ÉS a szülő Story**
    `REVIEW_STATUS_NAME` státuszra kerül (nem csak az a sub-task, amit az A4 eredetileg
    kiválasztott). Az alábbi **8c szülő-lezárási ajánlat batch módban elmarad**, mert a
    szülő Story-t itt már explicit `REVIEW_STATUS_NAME`-re állítottad — a szülő végleges
    `Done`-ja továbbra is a `JIRA_AUTO_DONE_ON_MERGE` / kézi lezárás útján történik, merge
    után. Ez megelőzi, hogy a 8c "minden gyerek kész → zárd a szülőt" ága a batch-kör
    végén idő előtt lefusson. A `JIRA_AUTO_DONE_ON_MERGE=true` closing-kulcsszó csak a
    szülő Story-ra ment (7a) — ha a GitLab-Jira integráció a mention-elt sub-task
    kulcsokat nem billenti át merge-kor, azok kézi `Done`-ja is kellhet (ugyanaz az ismert
    rés, mint a `false`-ágnál). A lenti **8c "minden gyerek kész" szabálya batch módban
    is érvényes** — csak a 8c aktív ajánlat-felkínálása marad el (lásd fent), a nyitott
    sub-task elleni tiltás (ne váltson a szülő Done-ra, amíg van nyitott gyereke) nem.
  - `JIRA_AUTO_DONE_ON_MERGE=true` esetén a `review`→`Done` lépést a GitLab-Jira
    integráció intézi merge után; `false` esetén ez ismert rés marad (`history.md`) —
    jelezd a felhasználónak, hogy merge után kézzel kell lezárni.
  - **8c — kapcsolódó ticketek lezárása**: ha ez a ticket egy Sub-task, és a szülő
    Story minden gyereke Done/Closed/`REVIEW_STATUS_NAME`, ajánld fel (jóváhagyás
    után) a szülő lezárását — a [`tracker-adapter.md`](tracker-adapter.md) "státuszváltás"
    műveletével (az ellenőrzött átmenet-ID-vel), **ne találgass**, a "work is done and
    merged" ID státuszfüggő (`history.md`). Ha van
    hozzá design-review/web-design ticket (Oldalnév-egyezés/link) és az implementáció
    most fejeződött be, állítsd `DESIGN_TICKET_CLOSE_STATUS`-ra (nem `Done`-ra).
    **Ha NEM teljesül** a "minden gyerek kész" feltétel: a szülő lezárása **nem
    ajánlható fel** — egy sorban jelezd a nyitott (nem Done/Closed/`REVIEW_STATUS_NAME`
    státuszú) sub-taskok kulcsát és aktuális státuszát. Ez a "minden gyerek kész"
    követelmény **nem csak 8c-belső feltétel**: ugyanígy vonatkozik a workflow-n kívüli
    lezárási utakra is — a `JIRA_AUTO_DONE_ON_MERGE` automatizációra (lásd fent "7a" a
    merge-előtti jelzésről) és a szülő **kézi** lezárására is; egyik útnak sem szabad a
    szülőt Done-ra váltania, amíg van nyitott sub-taskja.
- **8b — piros**: `retry-and-escalation.md` szerinti fix-ticket (`MANUAL_DEV_ASSIGNEE`),
  **retry kör nélkül, azonnal** — a folyamat itt véget ér ezen a ticketen.
- **Befejező lépés (8a és 8b után)**: egyszer a [`kovet-report.md`](kovet-report.md) szerinti
  követ-jelentés (`KOVET_REPORT`); epic-módban itt nem, csak az E7-nél.
