# dev-workflow-execute — batch mód (`STORY_BATCH_MODE=on`)

Az [`SKILL.md`](SKILL.md) „A-ág — Batch mód” szakaszából és a lépésenkénti „Batch módban” bekezdésekből
kiszervezve (ORD-498): csak `STORY_BATCH_MODE=on` mellett olvasd be, az A4 előtt. Minden szakasz a
`SKILL.md` azonos nevű lépésének kiegészítése; a szöveg változatlan. Az A8 batch-szabályai a
[`test-env.md`](test-env.md)-ben vannak.

## Áttekintés (`off` / `on`, B-ág és egy-repó határ)

- **`off` (alap)**: az egész A-ág változatlan — minden lenti lépés pontosan a mai módon
  fut, ticketenként (jellemzően Sub-taskonként) egyszer. A lenti "batch módban"
  bekezdéseket hagyd figyelmen kívül.
- **`on`**: az A-ág egységnyi munkája a **szülő Story + minden nyitott sub-taskja**, nem
  egy darab ticket. A lépések így módosulnak (a részletek az egyes lépéseknél):
  - **A4** feloldja a szülő Story-t és a **nem-Done/Closed** sub-taskjait mint egy bevont
    halmazt; ha nincs sub-task (vagy 0 nyitott marad), a batch mód **no-op** — a mai
    egy-ticket út fut tovább, egysoros jelzéssel.
  - **A5** egyetlen branchet hoz létre a **szülő Story** kulcsán/jellegén; az "In Progress"
    a szülő Story-ra **és** minden bevont sub-taskra megtörténik.
  - **A5a** egyszer fut, a bevont ticketek közül a **legmagasabb** `Komplexitás` értékére;
    `STORY_BATCH_EXECUTOR_SCOPE=per-subtask` mellett az `implementer` szintje ezen felül
    sub-taskonként oldódik fel (lásd A5a).
  - **A6** egyetlen közös terv-jóváhagyási kört futtat az **összevont** (sub-taskonként
    csoportosított) AC-listára; jóváhagyás után sub-taskonként külön `implementer`
    `execute` hívás, sub-taskonként **külön commit-csoport** (a commit-üzenet a sub-task
    kulcsát hivatkozza).
  - **A7 / 7a / 7a1 / 9 / 9a / A8** **pontosan egyszer** fut, a teljes összevont diffre; a
    `qa-tester` / `code-reviewer` AC-listája a bevont sub-taskok AC-jeinek **uniója**; az
    egy MR/PR a szülő Story-t **és** minden sub-task kulcsát hivatkozza.
  - **7b / 9 piros ág**: a `retry-and-escalation.md` szerinti eszkaláció **story-szintű** —
    egy fix-ticket a szülő Story-ra linkelve, a nyitott blocker/major pontok összevont
    listájával (lásd `retry-and-escalation.md` "Batch mód").
  - **A8a**: zöld kimenet után **minden bevont sub-task ÉS a szülő Story** kerül
    `REVIEW_STATUS_NAME` státuszra.
- **B-ág határ**: ha a szülő Story-nak van kitöltött "Oldalnév" mezője és nincs hozzá
  jóváhagyott/lezárt design, az A4 elágazás ugyanúgy a [`design-branch.md`](design-branch.md)
  B4-re irányít, mint `off` módban — a batch összevonás **csak** az A-ági
  implementációs/kapu-körre vonatkozik.
- **Egy-repó határ**: egy batch-kör egy branchet használ, ezért minden bevont sub-tasknak
  ugyanabba a `REPO_MAP`-sorba kell esnie. Ha nem (FE/BE külön repo), **állj meg** érthető
  hibával (`"a STORY_BATCH_MODE nem tud egy branchen két repót átfogni — futtasd a
  sub-taskokat külön, off módban"`), branch létrehozása nélkül.

## A4 — Pickup

- **Batch mód (`STORY_BATCH_MODE=on`)** — lásd fent "A-ág — Batch mód". A fenti pickup és
  elakadt-ticket JQL változatlanul fut; miután kiválasztottál egy ticketet:
  - Ha a kiválasztott ticket egy **`Sub-task`** (vagy bármelyik subtask-szintű típus,
    `angular`/`java`/…), oldd fel a **szülő Story-t** (a `parent` mezőből), és a
    [`tracker-adapter.md`](tracker-adapter.md) "keresés" műveletével kérd le a szülő Story
    **összes** sub-taskját.
  - **Szülő Story szűrés**: a `CLAUDE_WORK_LABEL` / `WORKFLOW_FLAGGED_LABEL` szűrést a
    **szülő Story-ra** alkalmazd — ha a szülőn nincs `CLAUDE_WORK_LABEL`, vagy rajta van
    `WORKFLOW_FLAGGED_LABEL`, a batch mód nem indítható erre a Story-ra: essz vissza az
    eredetileg kiválasztott sub-task egy-ticket feldolgozására (A5), egysoros jelzéssel.
  - **Bevont halmaz** = a szülő Story + minden sub-taskja, amelyre **mind** igaz: (a) a
    státusza **nem** `Done`/`Closed`; (b) **nincs** rajta `WORKFLOW_FLAGGED_LABEL`
    (a `config.md` "Jira label-rendszer" szerint a flaggelt ticketet a workflow nem veszi
    fel, nem javítja — ez sub-task szinten is érvényes); (c) **nem** kizárólag `codex`
    label van rajta (ha van `CLAUDE_WORK_LABEL`, vagy egyáltalán nincs AI-ügynök label,
    bevonható; a `codex`-only sub-task nem). A **kihagyott** sub-taskokat (kulcs + ok)
    sorold fel egy rövid jelzésben a felhasználónak. Ha az eredetileg kiválasztott
    sub-task maga esik ki (b)/(c) miatt, az ellentmondás — jelezd és kérdezz, ne vond be
    csendben.
  - Ha a kiválasztott ticket **önálló `Story`/`Task`/`Bug`** (nincs sub-taskja), vagy a
    bevonás után **0 nyitott** sub-task marad → a batch mód **no-op**: folytasd a mai
    egy-ticket úton (A5), egy sorban jelezve, hogy nem volt mit összevonni.
  - **Egy-repó ellenőrzés**: ha a bevont sub-taskok a `REPO_MAP` szerint nem mind
    ugyanabba a repóba esnének, **állj meg** az "A-ág — Batch mód" szakaszban leírt
    hibával, branch nélkül.

## A5 — Branch

- **Batch módban (`STORY_BATCH_MODE=on`)**: **egyetlen** branchet hozol létre, a
  `BRANCH_NAME_PATTERN` szerint a **szülő Story** kulcsával és jellegével (nem
  sub-taskonként). A repót (`REPO_MAP`) az A4 egy-repó ellenőrzése már eldöntötte. Az "In
  Progress" tranzíciót a **szülő Story-ra és minden bevont sub-taskra** végezd el
  (a `JIRA_AUTO_INPROGRESS_ON_BRANCH` flaget figyelembe véve — a Jira Automation
  jellemzően csak a branch-névben szereplő szülő Story-t billenti át, a sub-taskokat
  neked kell).

## A5a — Végrehajtó-szint

- **Batch módban (`STORY_BATCH_MODE=on`)**: ezt a lépést **egyszer** futtasd a teljes
  bevont halmazra — a `--complexity` argumentumhoz a bevont ticketek (szülő Story +
  sub-taskok) `Komplexitás` mezői közül a **legmagasabbat** vedd (`L` > `M` > `S`; ha
  bármelyik hiányzik/érvénytelen, a szokásos `sonnet` fallback). A kapott
  végrehajtó-szint térkép az egész körre érvényes, minden sub-task `implementer`
  hívására.
  - **Kivétel — `STORY_BATCH_EXECUTOR_SCOPE=per-subtask`** (lásd `config.md`
    "STORY_BATCH_EXECUTOR_SCOPE értékek"): az `implementer` fázisra a szkriptet
    **minden bevont sub-taskra külön** is futtasd, a sub-task **saját** `Komplexitás`
    értékével és **saját** issue type-jával (a többi argumentum változatlan). Az eredmény
    sub-taskonkénti `implementer`-szint térkép; az A6 sub-taskonkénti `execute` hívása a
    sub-task saját szintjét használja (`local` esetén a lenti "közvetlen végrehajtás"
    lokál adapteres útját, sub-taskonként külön prompttal és külön commit-csoporttal).
    A többi fázis szintje a batch-körre feloldott érték marad. Ha bármely sub-task szintje
    `local`, a terv-kör és az `ARCHITECT_INTAKE=auto` úgy dönt, mintha az `implementer`
    szint `local` lenne. Írd ki egy sorban a sub-taskonkénti szinteket (pl.
    `implementer: ORD-71=local, ORD-72=local, ORD-73=haiku`).

## A6 — Implementáció

- **Batch módban (`STORY_BATCH_MODE=on`)**:
  1. **Egy** közös terv-jóváhagyási kört futtass (a batch mindig a "több AC, több fájl"
     eset — a terv-kör nem hagyható ki): a terv-készítő hívás (a fenti `ARCHITECT_INTAKE`
     elágazás szerint `implementer plan` vagy `architect`) bemenete az **összevont**
     AC-lista, **sub-taskonként csoportosítva** (melyik AC melyik sub-taskhoz tartozik),
     a bevonás dependency-sorrendjében. "Terv beolvasása" / "terv mentése" a **szülő
     Story-ra** történik (egy mentett terv az egész körre).
  2. Határozd meg a sub-taskok **végrehajtási sorrendjét** a köztük lévő "blocks"/"is
     blocked by" Jira-linkek szerint (a blokkoló előbb; jellemzően BE → FE). Ha nincs
     ilyen link vagy körkörös, a Jira sub-task **rangsort** használd, és jelezd egy
     sorban, hogy link hiányában a rang döntött.
  3. A jóváhagyott terv mentése után **sub-taskonként** hívd az `implementer`-t `execute`
     móddal (a sub-task saját AC-ivel + a közös jóváhagyott tervvel + a branch/repo
     hivatkozással), a fenti sorrendben. Minden sub-task a saját **külön
     commit-csoportját** kapja — az `implementer` funkcionális egységenként commitol, és
     a commit-üzenetek az adott **sub-task kulcsát** hivatkozzák (nem a szülő Story-ét).
  4. Ha egy sub-task `implementer` köre blocker/majorral bukik, a
     [`retry-and-escalation.md`](retry-and-escalation.md) "Javítókör mechanika" a
     szokásos — de a számláló **story-szintű** (a bevont halmazra egy közös
     `MAX_LOCAL_FIX_RETRIES` számláló, nem sub-taskonként).

## A7 — Helyi AC-ellenőrzés

- **Batch módban (`STORY_BATCH_MODE=on`)**: az A7 **pontosan egyszer** fut, a bevont
  halmaz **összes commitjának** összevont diffjére (nem sub-taskonként). A `qa-tester`
  `local` hívás AC-listája a bevont sub-taskok AC-jeinek **uniója**. A `LOCAL_GATE_MODE`
  ág (`full`/`fast`/`none`) és a `workflow-meta` kivétel ugyanúgy alkalmazandó, csak a
  teljes körre egyszer.

## 7a — zöld (push + MR)

**Batch módban (`STORY_BATCH_MODE=on`)**: **egy** push és **egy** MR/PR az egész bevont
halmazra. Az MR leírása hivatkozza a **szülő Story-t és minden bevont sub-task
kulcsát**; a `JIRA_AUTO_DONE_ON_MERGE=true` closing-kulcsszó a **szülő Story-ra** megy
(`Closes <SZÜLŐ-STORY>`), a sub-taskok sima mention/link formában (azokat az A8a
billenti át, lásd ott). Ha a bevont halmazon `workflow-meta` label van, a
`--label workflow-meta` ugyanúgy felkerül.

## 7b — piros

**Batch módban** az eszkaláció **story-szintű**: egy fix-ticket a **szülő Story-ra**
linkelve, a nyitott blocker/major pontok összevont listájával (lásd
[`retry-and-escalation.md`](retry-and-escalation.md) "Batch mód").

## 9 — Code review

- **Batch módban (`STORY_BATCH_MODE=on`)**: **egy** code review kör az egy MR teljes
  összevont diffjére. A `code-reviewer`-nek átadott AC/scope a bevont sub-taskok
  AC-jeinek **uniója** (sub-taskonként csoportosítva, hogy lássa, melyik commit-csoport
  melyik sub-taskhoz tartozik). A Jira-kommentet a **szülő Story-ra** posztold (egy
  komment az egész körről). A javítóköri számláló story-szintű, ahogy A6/7b-nél.
