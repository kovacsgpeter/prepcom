# Jira/GitLab automatizálás — egyszeri, admin-oldali beállítás

Ez a fájl **nem hot-path olvasmány** — egyetlen skill sem olvassa be futás közben. Ez egy
emberi útmutató: ha végigcsinálod a lenti beállításokat a Jira/GitLab admin-felületén, és
utána a `config.md` "Jira automatizálás" szekciójában a megfelelő flag-eket `true`-ra
állítod, a workflow skilljei kihagyják a most még kézzel/MCP-hívással elvégzett
állapotváltásokat — azokat innentől a Jira/GitLab integráció intézi szerveroldalon,
**nulla LLM-hívásért**, ahelyett hogy a skill minden futásnál újra meghívná a
`transitionJiraIssue`-t.

Fontos: ezek a funkciók GitLab/Jira kiadástól (self-hosted vs. Cloud, GitLab Free vs.
Premium) függően eltérően érhetők el — a lenti lépések iránymutatásnak szólnak, a pontos
menüpontokat a ti konkrét instance-otokon ellenőrizzétek.

## 1. MR merge → automatikus Jira-tranzíció (`JIRA_AUTO_DONE_ON_MERGE`)

Ez zárja be a korábban dokumentált rést: jelenleg a merge (MR elfogadása) nem
transzformálja automatikusan a Jira-státuszt `review`-ról `Done`-ra — ezt eddig a
skillnek/embernek kellett külön megtennie.

**GitLab-oldali beállítás** — élesben végigcsinálva és megerősítve (self-hosted GitLab,
Jira Cloud):

> ⚠️ **Ne a "GitLab for Jira Cloud app" integrációt keresd** (csoport-szintű, Atlassian
> Marketplace app, Development panel + JSM deployment gatinghez való — **nincs** benne
> "Enable Jira transitions" opció, ezt korábban tévesen kevertem össze vele). A helyes
> hely a **projekt-szintű, klasszikus "Jira issues" integráció** — külön menüpont a
> csoport-szintű app mellett.

1. A cél **GitLab projekt** (nem a csoport) → **Settings → Integrations → Jira issues**.
2. **Enable integration**: Active.
3. **Authentication method**: `Basic authentication` (Jira Cloudnál a `Personal access
   token` opció **nem** működik, az csak Data Center/Server-hez való).
4. **Email or username**: egy dedikált automatizációs Jira-fiók (nálunk `ai_user`)
   e-mail címe. **Api token or password**: ugyanennek a fióknak az API tokenje
   (`https://id.atlassian.com/manage-profile/security/api-tokens` → Create API token —
   a tokent csak a létrehozáskor látod, azonnal másold ki). Az e-mail és a token
   **ugyanahhoz a fiókhoz** kell tartozzon, különben a hitelesítés elbukik. Ennek a
   fióknak legyen jogosultsága a célprojektben a releváns Jira-átmenetekhez.
5. **Web URL**: a Jira instance URL-je (pl. `https://<szervezet>.atlassian.net`). **Jira
   API URL**: hagyd üresen, ha megegyezik a Web URL-lel.
6. **Trigger**: pipáld be **csak** a **"Merge request"**-et. ⚠️ **A "Commit"-ot NE
   pipáld be**: a TDD-implementáció több köztes commitot csinál ugyanahhoz a tickethez,
   és ha egy köztes commit üzenete véletlenül tartalmaz egy closing-kulcsszót (pl.
   "fix", "resolves" — hétköznapi angol szavakként, nem szándékos trigger-kifejezésként)
   a ticket-kulcs mellett, a "Commit" trigger **idő előtt**, a munka tényleges
   befejezése előtt transzformálná a Jira-ticketet.
7. **"Transition Jira issues to their final state"** → pipáld be **"Enable Jira
   transitions"**. Itt **nincs külön transition-ID mező** — a GitLab a Jira saját API-ján
   keresztül automatikusan megkeresi és alkalmazza a ticket aktuális státuszából induló
   megfelelő "lezáró" átmenetet, nem kell/nem is lehet ID-t megadni. A korábbi,
   `config.md`-ben dokumentált "az ID státuszfüggően eltér" probléma ezért **itt nem
   releváns** — a GitLab minden alkalommal újra lekérdezi az érvényes átmenetet.
8. **Jira issue matching** (regex/prefix): hagyd üresen mindkettőt, hacsak nincs több
   Jira projekt kulcsa is jelen ugyanabban a repóban (lásd `config.md` `REPO_MAP` —
   egyetlen project key esetén nem szükséges).
9. **Kritikus, könnyen kihagyható lépés**: a fenti trigger **csak akkor** vált tranzíciót,
   ha az MR **leírása** egy GitLab closing-kulcsszót tartalmaz a ticket-kulcs mellett —
   pl. `Closes PROJ-123`, `Fixes PROJ-123`, `Resolves PROJ-123` (a teljes lista:
   Close/Closes/Closed/Closing, Fix/Fixes/Fixed/Fixing, Resolve/Resolves/Resolved/
   Resolving, Implement/Implements/Implemented/Implementing). Sima mention/link **nem**
   elég. Ez azt jelenti, hogy az `execute/SKILL.md` A7a lépésének (MR-leírás
   összeállítása) **explicit ilyen formulát kell beleírnia**, nem csak linkelnie a
   ticketet — ezt külön is javítani kell a skillben, ha ezt a flaget bekapcsolod (lásd
   `execute/SKILL.md` A7a).
10. Teszteld egy eldobható ticketen/MR-en, mielőtt élesben hagynád.

Ha ez működik, a `config.md`-ben állítsd `JIRA_AUTO_DONE_ON_MERGE: true`-ra — ettől kezdve
az `execute/SKILL.md` A8a lépése **nem** hív explicit `transitionJiraIssue`-t Done-ra
merge után, csak ellenőrzi, hogy megtörtént-e (fallback, ha nem, akkor mégis megteszi).

## 2. Branch létrehozás → In Progress (`JIRA_AUTO_INPROGRESS_ON_BRANCH`)

Jira Software Development-panel + Automation funkció, ha a Jira instance-otok támogatja:
1. Jira → projekt **Settings → Automation**.
2. Új szabály: **Trigger: "Branch created"** (a Development panelen keresztül, a
   GitLab-integráció adja az adatot, ha az megfelelően van linkelve).
3. **Action: Transition issue → In Progress.**
4. Publikáld, teszteld egy eldobható ticketen.

Ha működik: `config.md`-ben `JIRA_AUTO_INPROGRESS_ON_BRANCH: true`. Ettől kezdve az
`execute/SKILL.md` A5 lépésének "Állítsd a ticketet In Progress-re" sora **nem** hív
explicit tranzíciót, csak ellenőrzi.

## 3. Web-design / design-review ticket → automatikus kezdőállapot (`JIRA_AUTO_INITIAL_STATUS_ON_CREATE`)

Ugyanaz az Automation-mechanizmus, más triggerrel:
1. Jira → **Settings → Automation** → új szabály.
2. **Trigger: "Issue created"**, feltétel: **Issue Type = web-design** → **Action:
   Transition → In Progress**.
3. Külön szabály: **Issue Type = design-review** → **Action: Transition → In Progress**,
   majd (ha a workflow engedi egy szabályon belül láncolva) **→ first_review_requested**.
   Ha a workflow nem engedi egy szabályon belül a két hopot, csinálj két külön,
   egymást követő szabályt (mindkettő "Issue created" triggerrel, de a második egy
   "Status changed to In Progress" triggerrel folytatva).

Ha működik: `config.md`-ben `JIRA_AUTO_INITIAL_STATUS_ON_CREATE: true`. Ettől kezdve a
`design-branch.md` B4/B5 lépéseinek explicit `transitionJiraIssue` hívásai kihagyhatók
(csak létrehozás + ellenőrzés marad).

## 4. Workflow-séma javítása — `first_review_done` → `second_review_requested` közvetlen él

**Ez nem flag, hanem egyszeri, végleges Jira workflow-szerkesztés**, ami a
`config.md`/`history.md`-ben dokumentált két-hopos kerülőutat teljesen megszünteti (nem
csak kivált egy hívást, hanem eltünteti a problémát a gyökerénél):

1. Jira → projekt **Settings → Workflows** → a design-review issue type-hoz tartozó
   workflow szerkesztése (ehhez lehet, hogy inaktív másolatot kell csinálni, szerkeszteni,
   majd publikálni — Jira workflow-szerkesztés menete instance-függő).
2. Vegyél fel egy új tranzíciót: **`first_review_done` → `second_review_requested`**.
3. Publikáld a workflow-t (ez migrálhat folyamatban lévő ticketeket, óvatosan, lehetőleg
   kevés aktív design-review ticket mellett csináld).

Ha ez megtörtént, a `config.md`-ben állítsd `JIRA_WORKFLOW_HAS_DIRECT_SECOND_REVIEW_TRANSITION: true`-ra
— ettől kezdve a `design-branch.md` B6 lépése **egy** hívással állítja be a
`second_review_requested` státuszt, nem kell előbb visszalépnie `In Progress`-be.

## 5. Atlassian site-költözés után (új `*.atlassian.net`)

Egy Jira/Confluence cloud-to-cloud migráció a ticketeket, státuszokat, transition-öket és
a Confluence-oldalakat átviszi (a ticketkulcsok maradnak), a **külső integrációk** viszont
a régi site-ra mutatnak tovább, a workflow site-függő ID-jai pedig megváltozhatnak. A
teendők, ebben a sorrendben:

1. **GitLab "Jira issues" integráció** (GitLab projekt → **Settings → Integrations → Jira
   issues**): a **Web URL**-t írd át az új site-ra. Az URL módosításakor a GitLab
   biztonsági okból **eldobja a tárolt API tokent**, ezért az **Api token or password**
   mezőt újra ki kell tölteni — ugyanannak a fióknak az Atlassian API tokenjével (a token
   fiók-, nem site-szintű; ha lejárt, a fenti 1. pont 4. lépése szerint generálj újat, és
   tárold a titokkezelőben, pl. Dopplerben, ne a repóban). Ha a "Transition Jira issues to
   their final state" alatt **egyedi transition ID-k** vannak megadva (*Use custom
   transitions*), egyeztesd őket az új site `getTransitionsForJiraIssue` kimenetével. Végül
   **Test settings**, majd **Save changes**.
2. **GitLab for Jira Cloud app**: az új Jira site-on telepítsd (Jira → **Apps → Explore
   more apps** → "GitLab for Jira Cloud"), és az app konfigurációs oldalán linkeld újra a
   GitLab-csoportot (namespace). Enélkül üres a Development panel (branch/MR/pipeline), és
   a 2. pont "Branch created" triggere sem sül el. Ellenőrzés: egy új branch/MR után a
   ticket Development paneljén megjelenik.
3. **Jira Automation szabályok** (projekt → **Settings → Automation**): nézd meg, hogy a
   2–3. pont szabályai átjöttek-e és **Enabled** állapotúak-e; ha nem, vedd fel újra őket.
4. **Confluence ↔ Jira projekt összekötés**: a Jira projekt oldalsávján (**Project
   pages** / **Add shortcut**) csatold a projekt Confluence space-ét, hogy onnan egy
   kattintással elérhető legyen.
5. **A workflow `config.md`-je**: frissítsd a site-függő értékeket — a site/cloudId sort,
   a `REVIEW_STATUS_NAME` státusz-ID-ját, a `CONFLUENCE_*` space- és oldal-ID-kat —, és a
   dokumentációk `.../browse/<KULCS>` linkjeinek hostnevét. A státusz- és transition-
   neveket egy-egy ticketen `getTransitionsForJiraIssue`-val ellenőrizd. Amíg az 1–3. pont
   nincs kész, a `JIRA_AUTO_*` flagekre épülő lépések a fallbackjükkel (állapot-
   ellenőrzés, majd explicit `transitionJiraIssue`) dolgoznak.
6. **Atlassian MCP-hozzáférés**: a `getAccessibleAtlassianResources` mutatja, mely
   site-ok látszanak. Ha a régi és az új is, a hívásokban mindig a `config.md` szerinti
   site-ot add meg `cloudId`-ként.

## Sorrend-javaslat

Kezdd az 1. ponttal (MR merge → Done) — ez a leggyakoribb, minden ticketnél lefutó
esemény, itt a legnagyobb a megtakarítás. utána a 4. pont (workflow-séma javítás) jó
befektetés, mert nem is beállítás-függő flag-kockázatot hordoz, hanem véglegesen
egyszerűsíti a gráfot. A 2-3. pontok kisebb, ritkábban előforduló megtakarítások (branch-
és ticket-létrehozáskori tranzíciók) — ha időd engedi, azokat is érdemes, de nem
sürgősek.
