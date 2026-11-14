# tracker-adapter — a ticket-tracker műveletek absztrakciója (Jira- és OpenProject-leképezéssel)

> ℹ️ **Bevezetve (COCALC-259, PLAN-1)**: ez a fájl eredetileg két, egymástól független
> **absztrakt műveletet** dokumentált — "terv mentése" és "terv beolvasása" —, amiket az
> [`execute/SKILL.md`](SKILL.md) A6 lépése és a
> [`retry-and-escalation.md`](retry-and-escalation.md) hív. A két művelet célja, hogy a
> [`../../agents/implementer.md`](../../agents/implementer.md) `plan` módban jóváhagyott terve túlélje a session-eket/`/clear`-eket, és
> egy későbbi `execute`-hívás (akár normál A6 folytatás, akár javítókör) újra hozzáférjen
> hozzá, ne az elejétől találja ki az irányt.
>
> A "absztrakt" jelző szándékos: a **jelenlegi** leképezés Jira-kommentre (Művelet 1-2) és
> Jira-leírás-infobox-sorra (Művelet 3-4) épül (mert ma Jira a ticket-tracker), de a hívó
> félnek (`SKILL.md` A6, `dev-workflow-intake/SKILL.md`, `retry-and-escalation.md`) csak a
> műveletek bemenetét/kimenetét kell ismernie, nem a Jira-specifikus részleteket — ha
> valaha más tracker váltaná fel a Jirát, csak ez a fájl változna, a hívók nem.
>
> ℹ️ **Bővítve (COCALC-273, MEAS-2)**: Művelet 3-4 ("komplexitás mentése"/"komplexitás
> beolvasása") — ezek **nem** a fenti Jira-komment mintát követik, hanem a ticket
> leírásának infobox táblázatát (lásd [`jira-ticket-template.md`](../dev-workflow/jira-ticket-template.md)
> "Komplexitás" mező) — szándékosan **nem** Jira custom field, hogy a mező tracker-
> független, sablon-szintű maradjon (COCALC-273 AC9).
>
> ℹ️ **Bővítve (COCALC-260)**: Művelet 5-11 — a workflow **összes** tracker-hívása
> mostantól absztrakt művelet mögé kerül (`ticket beolvasása`, `ticket létrehozása`,
> `ticket módosítása`, `státuszváltás`, `komment írása`, `link létrehozása`, `keresés`).
> A ~12 hívó skill csak a művelet **nevét** és be-/kimenetét ismeri; az itteni
> "Jelenlegi Jira-leképezés" sorok az egyetlen hely, ahol konkrét MCP-eszköznév
> szerepel. Ezt a [`ci/verify-tracker-mcp-abstraction.sh`](../../../ci/verify-tracker-mcp-abstraction.sh)
> őr-szkript kényszeríti ki (blokkoló CI-job). A [`config.md`](../dev-workflow/config.md)
> `TRACKER_BACKEND` kapcsolója választja ki, melyik backend leképezése aktív
> (alap: `jira`); új backend felvételéhez lásd lent az "Új tracker-backend felvétele"
> szekciót.
>
> ℹ️ **Bővítve (COCALC-898)**: `TRACKER_BACKEND=openproject` — egy self-hosted OpenProject
> Community példány (a címe repo-lokális: `config.md` `OPENPROJECT_URL`).
> Minden művelet alatt egy **"OpenProject-leképezés"** bekezdés írja le a hívást. Az
> OpenProject Community beépített MCP-szervere Enterprise-licenchez kötött, ezért a
> leképezés **nem MCP-eszköz**, hanem a [`../../tools/openproject/op.js`](../../tools/openproject/op.js)
> Node CLI (tiszta Node 18+, nincs npm-függőség), amit a fő szál **és a subagentek is**
> Bash-ből hívnak — így a "subagentnek nincs tracker MCP-eszköze" korlát (Művelet 9)
> openproject backend mellett nem áll fenn. A lenti `OP` rövidítés jelentése:
> `node .claude/tools/openproject/op.js` (a repo gyökeréből).
>
> - **Kapcsolat:** `OPENPROJECT_URL` és `OPENPROJECT_API_TOKEN` env var, vagy ugyanezek a
>   `~/.config/openproject/url` és `~/.config/openproject/token` fájlban (gépenként egyszer). A token a workflow
>   technikai felhasználójáé (`claude-agent`, a Jira `ai_user` megfelelője).
> - **Ticket-kulcs:** az OpenProject szemantikus azonosítót használ (`<PROJECT_KEY>-123`) — a
>   Jiráról átköltöztetett ticketek a Jira-kulcsukat kapták, az újak ugyanabban a
>   sorozatban folytatódnak. Ticket-link: `<OPENPROJECT_URL>/wp/<KULCS>`.
> - **Státusz-, típus- és labelnevek** a Jirával azonosak (a migráció megtartotta őket),
>   a labelek a `Labels` egyedi mezőben élnek. Új label-értéket csak OpenProject admin
>   vehet fel — az `OP` ismeretlen labelre hibát ad a lehetséges értékek listájával.
> - **Hibakezelés:** kilépőkód `0` siker, `1` API-/üzleti hiba (stderr: `HIBA: …`, az
>   OpenProject üzenetével), `2` használati hiba. Elérhetetlen szerver (a gép nincs a
>   tailneten) = a Jira "nem elérhető tracker MCP" edge case-ének megfelelője.
> - **Wiki (COCALC-913):** `OP wiki list --project <P>`, `OP wiki get --project <P> --page <cím>
>   [--json]`, `OP wiki put --project <P> --page <cím> [--parent <cím>] [--file <md>]` (fájl
>   nélkül stdin; cím szerint idempotens: `created` / `updated` / `unchanged`, kiírja a
>   `<OPENPROJECT_URL>/projects/<P>/wiki/<slug>` URL-t). Az API v3 wiki oldalt nem tud írni,
>   ezért ez a web-konténerben futó `rails runner`-en megy: helyben `docker exec`, ha a konténer
>   ezen a gépen fut, különben `ssh` a `OPENPROJECT_WIKI_SSH_HOST`-ra (a többi beállítás:
>   `OPENPROJECT_WIKI_CONTAINER`, `OPENPROJECT_WIKI_LOGIN` — lásd `config.md`). API token nem kell
>   hozzá; egy hívás a Rails-indulás miatt ~30–40 s.

## Művelet 1 — "terv mentése"

**Bemenet:**
- Ticket ID.
- A jóváhagyott terv szövege (az [`../../agents/implementer.md`](../../agents/implementer.md) `plan` módú kimenete, a felhasználó
  jóváhagyása után).
- A felderített/érintett fájlok listája.
- Commit SHA (az a commit, ami a jóváhagyás pillanatában a branch feje volt).
- Dátum (`ÉÉÉÉ-HH-NN`).

**Jelenlegi Jira-leképezés:** `addCommentToJiraIssue` hívás a ticketre. A komment
felépítése:

```
## Terv (jóváhagyva) — <SHA>, <dátum>

<a jóváhagyott terv szövege>

### Felderített fájlok
- <fájl 1>
- <fájl 2>
...
```

A címsor mintázata (`## Terv (jóváhagyva) — <SHA>, <dátum>`) **fix** — ez azonosítja a
kommentet "terv beolvasása" művelet számára, ne térj el tőle. A teljes komment (terv +
fájllista együtt) sor-korlátja a [`../dev-workflow/config.md`](../dev-workflow/config.md)
`PLAN_SAVE_MAX_LINES` értéke (alap `40`, nem profilfüggő) — ha a terv hosszabb lenne, a
hívó félnek ([`../../agents/implementer.md`](../../agents/implementer.md) "0. `plan` mód"
szakasza, vagy [`../../agents/architect.md`](../../agents/architect.md)) már eleve max
~15 sorosra kell szorítania a tervet, ez a korlát csak megerősíti ezt a felső határt
kommentszinten is.

**OpenProject-leképezés:** "komment írása" (Művelet 9) ugyanezzel a komment-szöveggel:
`OP comment <KULCS> --file <terv.md>`.

## Művelet 2 — "terv beolvasása"

**Bemenet:** ticket ID.

**Jelenlegi Jira-leképezés:** `getJiraIssue` hívás a `comment` field-del. A visszakapott
kommentek közül azok jönnek szóba, amik `## Terv (jóváhagyva) —` prefixű címsorral
kezdődnek — ezek közül a **legutóbbi/legfrissebb** (létrehozás dátuma szerint) nyer.

**OpenProject-leképezés:** `OP get <KULCS> --scope comments --json` — a `comments`
tömbből a `## Terv (jóváhagyva) —` prefixű, legkésőbbi `createdAt`-ú elem nyer.

**Kimenet:** a legfrissebb jóváhagyott terv szövege + a hozzá tartozó SHA/dátum/fájllista,
vagy — ha egyetlen ilyen komment sincs a ticketen — egy explicit jelzés, hogy **nincs
korábban mentett terv** (ezt a hívó fél ne hibaként, hanem "nincs mit visszaadni, indulj a
felderítés/normál út szerint" jelzésként kezelje).

## Edge case-ek

- **A mentett tervben szereplő SHA már nem létezik** (pl. rebase, force-push, törölt
  branch) — ennek felismerése és kezelése (pl. felderítés-ágra esés) **nem** ennek az
  adapternek a feladata, hanem a hívó félé ([`../../agents/implementer.md`](../../agents/implementer.md) "1a. Frissesség-ellenőrzés
  (CODE_SCAN_VERIFY)" lépése). Az adapter csak visszaadja a mentett SHA-t, nem validálja.
- **Zöldmezős terület** (a tervezéskor még nem létezett semmilyen implementáció az érintett
  területen) — a mentett tervben ezt a "Felderített fájlok" lista helyén egy explicit
  "nincs meglévő implementáció" sor jelzi, ugyanazzal a mintával, mint a
  `jira-ticket-template.md` "Kiindulási állapot" szekciójának zöldmezős fallback-szövege
  ("Nincs meglévő implementáció ezen a területen").
- **Több jóváhagyott terv-komment van a ticketen** (pl. a terv menet közben módosult, és
  többször is jóváhagyásra került) — a "terv beolvasása" a **legutóbbit** adja vissza, a
  korábbiak **megmaradnak a ticketen előzményként** (nem törlődnek, nem íródnak felül) —
  ez a Jira-kommentek természetéből adódik, és szándékosan hasznos audit-nyom is (látszik,
  hogyan alakult a terv a jóváhagyási körök során).

## Művelet 3 — "komplexitás mentése"

> ℹ️ **Bevezetve (COCALC-273, MEAS-2)**.

**Bemenet:**
- Ticket ID.
- A becsült komplexitás-érték (`S`/`M`/`L`) + a becslés alapja (zárójeles szöveg), lásd
  [`../dev-workflow/config.md`](../dev-workflow/config.md) "Komplexitás → végrehajtó-szint
  routing" szekció.

**Jelenlegi Jira-leképezés:** ez **nem** külön hívás — a `dev-workflow-intake/SKILL.md`
"3. Ticket összeállítása" lépése a `Komplexitás` sort a `jira-ticket-template.md` infobox
táblázatába illeszti be, **a `createJiraIssue` hívás részeként**, a ticket leírásának
egyetlen, atomi létrehozásakor. Nincs külön `addCommentToJiraIssue`/mező-frissítő hívás —
ez szándékos egyszerűsítés: a mező csak egyszer, a ticket születésekor íródik, utólag
soha (lásd "Művelet 4" edge case-ei: az `execute` sosem ír vissza).

**OpenProject-leképezés:** ugyanígy — a `Komplexitás` sor a leírás infobox-táblázatában,
az `OP create … --description-file` hívás részeként.

**Kimenet:** nincs (mellékhatás: a ticket leírása tartalmazza a `Komplexitás` sort).

## Művelet 4 — "komplexitás beolvasása"

> ℹ️ **Bevezetve (COCALC-273, MEAS-2)**.

**Bemenet:** ticket ID, a hívó fázis neve (`implementer`/`qa-tester`/`code-reviewer`/
`figma-designer`), a ticket Jira issue type-ja (a vétó-modellhez).

**Jelenlegi Jira-leképezés:** `getJiraIssue` hívás (a `description` mezővel). A
visszakapott leírásból az infobox táblázat `Komplexitás` sorát kell kiolvasni.

**OpenProject-leképezés:** `OP get <KULCS> --scope description` — a leírás (Markdown)
infobox-táblázatának `Komplexitás` sora, ugyanazzal a parse-szabállyal. Az issue type a
kimenet `Típus` sora.

> ⚠️ **TODO / ismert hiányosság (COCALC-273 AC8)**: a (jövőbeli) COCALC-266 (GATE-3) fogja
> bevezetni az infobox-mezők **determinisztikus** kiolvasási szabályát (pl. explicit
> szöveg-alapú parse-kontraktus, ami minden infobox-mezőre egységesen alkalmazható). Amíg
> az nincs kész, ez a művelet egy **ideiglenes, egyszerű** olvasási módot ír elő: keresd
> meg a leírásban a `| Komplexitás |` sort tartalmazó táblázat-sort, és a `|` karakterek
> közötti második cella első token-je (`S`/`M`/`L`) az érték — minden más esetben
> (a sor hiányzik, a token nem `S`/`M`/`L`) a hívó fél a "Fallback-szabály" szerint jár el
> (lásd `config.md`). Ez a parse-mód **törékeny**, ha valaki kézzel, a formátumtól eltérően
> szerkeszti a táblázatot — ez tudatosan elfogadott korlát, amíg a GATE-3 nem old meg egy
> robusztusabb, általános megoldást.

**Kimenet:**
- A `Komplexitás` érték (`S`/`M`/`L`) + a hozzá tartozó `EXECUTOR_LADDER`-szint, a
  [`../dev-workflow/scripts/resolve-executor-level.sh`](../dev-workflow/scripts/resolve-executor-level.sh)
  szkript eredménye (bemenet: a kiolvasott érték, a hívó fázis neve, az issue type — a
  vétó-modellhez).
- Ha a mező hiányzik/érvénytelen: a szkript fallback-figyelmeztetéssel `sonnet`-et ad
  vissza minden fázisra — a hívó fél ezt kapja kimenetként, a futás nem akad el.

**A felhasználói felülbírálás** (COCALC-273 AC13): ha a felhasználó a Jira ticketen kézzel
átírja a `Komplexitás` mezőt, a következő "komplexitás beolvasása" hívás már ezt az új
értéket adja vissza — nincs külön szinkronizációs lépés, mert az `execute` sosem ír a
mezőbe, mindig csak olvas.

## Művelet 5 — "ticket beolvasása"

> ℹ️ **Bevezetve (COCALC-260)**.

**Bemenet:** ticket ID; opcionálisan a kért mező-scope (`leírás` / `státusz` /
`kommentek` / `mind` — alap: `mind`).

**Jelenlegi Jira-leképezés:** `getJiraIssue` hívás. A `kommentek` scope-hoz
`fields: ["comment"]` (a kommentek `fields.comment.comments` alatt: szerző, időbélyeg,
szöveg). Ha még nincs kéznél a cloudId, előbb `getAccessibleAtlassianResources`.

**OpenProject-leképezés:** `OP get <KULCS> [--scope all|description|status|comments]
[--json]`. Az alapkimenet Markdown (mező-tábla, `## Leírás`, `## Gyerek ticketek` a
gyerekek kulcsával és státuszával, `## Kapcsolatok`, `## Kommentek` szerzővel és
időbélyeggel); `--json` géppel feldolgozható alak. A gyerek-ticketek listája a "8c —
minden gyerek kész" ellenőrzést külön keresés nélkül kiszolgálja.

**Kimenet:** a ticket kért mezői — leírás (infobox + `## Kontextus`/`## Acceptance
Criteria`/`## Teszterv`/`## Függőségek`/`## Design` szekciók), aktuális státusznév,
issue type, labelek, felelős, és/vagy a kommentek listája.

**Edge case-ek:**
- **Hitelesítési hiba / a tracker MCP nem elérhető** — a hívó fél ne akadjon el:
  jelezze a felhasználónak (Jira esetén: a claude.ai connector-beállításban rendezhető),
  és ahol lehet, folytassa a beolvasott kontextus nélkül (pl. `gitlab-branch-review`
  általános, AC nélküli review-ként).
- **A "komment beolvasása" nincs külön műveletként** — a kommentek ennek a műveletnek a
  `kommentek` scope-jával jönnek (így a `terv beolvasása` és a `review-feedback` R2 is
  ezt használja, nem külön hívást).

## Művelet 6 — "ticket létrehozása"

> ℹ️ **Bevezetve (COCALC-260)**.

**Bemenet:** project key (a `REPO_MAP`-ból feloldva); issue type (a `config.md`
`JIRA_ISSUE_TYPE_MAP` / `JIRA_SUBTASK_ISSUE_TYPE_MAP` szerint); cím; a
[`jira-ticket-template.md`](../dev-workflow/jira-ticket-template.md) szerinti,
sablon-formátumú leírás; labelek (mindig a `CLAUDE_CREATED_LABEL`, plusz ami a hívási
kontextusból kell — pl. `CLAUDE_WORK_LABEL` a B4/B5 leágazó ticketeken); opcionálisan
`parent` (Sub-task szülője).

**Jelenlegi Jira-leképezés:** `createJiraIssue` hívás.
- **Preflight** (csak ha bizonytalan az elérhető issue type / kötelező mező):
  `getVisibleJiraProjects` és/vagy `getJiraProjectIssueTypesMetadata` a feloldott
  project key-re — ne találgass, a subtask-szintű típusok (`hierarchyLevel: -1`)
  projektenként eltérnek. cloudId-hoz `getAccessibleAtlassianResources`.
- A `createJiraIssue` mindig a `config.md` `INITIAL_STATUS_NAME` (`To Do`) állapotba
  hoz létre — a célállapotot külön "státuszváltás" művelet éri el utólag.

**OpenProject-leképezés:** `OP create --project <KEY> --type <típus> --subject <cím>
--description-file <leírás.md> --labels <CLAUDE_CREATED_LABEL>[,…] [--parent <KULCS>]
[--assignee <név|login|me>] [--status <név>]`. Preflight nem kell: ismeretlen típus /
label / felhasználó esetén az `OP` a lehetséges értékekkel hibázik, nem talál ki semmit.
Az új ticket alapból az OpenProject alapértelmezett státuszába (`To Do`, egyezik az
`INITIAL_STATUS_NAME`-mel) kerül; a `--status` kapcsolóval **rögtön a célállapotban** is
létrehozható (ez váltja ki a `JIRA_AUTO_INITIAL_STATUS_ON_CREATE` automatizmust). A
"Sub-task csak a szülő projektjében" korlát OpenProjectben nem áll fenn, de a konvenció
marad. Kimenet: JSON (`key`, `url`, `status`).

**Kimenet:** az új ticket kulcsa + linkje.

**Edge case-ek:**
- **A tracker nem ismeri az "issue type" fogalmát** (pl. GitHub Issues) — a preflight
  kimarad, a "jelleg" (`TICKET_NATURE_TAGS`) a leírás `## Kontextus` szekció első
  mondatába kerül, ahogy a `Sub-task`-fallbacknél ma is.
- **Hitelesítetlen / nem elérhető tracker MCP** — ne hagyd a felhasználót ticket-tervezet
  nélkül: add oda a teljes, jóváhagyott, sablon-formátumú szöveget kézi bemásolásra
  (lásd `jira-ticket/SKILL.md` "Ha az Atlassian MCP nincs hitelesítve").
- **Subtask csak a szülő projektjében** — a Sub-task-szintű típus csak a szülővel azonos
  tracker-projektben hozható létre (Jira technikai korlát).

## Művelet 7 — "ticket módosítása"

> ℹ️ **Bevezetve (COCALC-260)**.

**Bemenet:** ticket ID; a módosítandó mezők (felelős, labelek, leírás-szekció,
infobox-mező stb.).

**Jelenlegi Jira-leképezés:** `editJiraIssue` hívás a változó mezőkkel (parciális
frissítés). Ritkán használt út — a workflow ma szinte mindig új ticketet hoz létre
vagy státuszt vált, nem szerkeszt meglévő mezőt (kivétel: a `figma-designer`-lelet
átvezetése a web-design ticket "## Kiindulási állapot" szekciójába, `design-branch.md`
B4).

**OpenProject-leképezés:** `OP update <KULCS> [--subject …] [--description-file …]
[--labels a,b | --add-labels a,b | --remove-labels a,b] [--assignee <név|login|me|none>]
[--parent <KULCS|none>]`. A `--parent <KULCS>` a meglévő ticketet a megadott szülő (pl. epic)
alá teszi, a `--parent none` törli a szülőt; nem létező szülő-kulcsra a hívás PATCH nélkül
hibázik. A leírás **csak egészben** cserélhető (az OpenProjectben nincs szekció-szintű
szerkesztés): előbb `OP get … --scope description`, a szekció módosítása lokálisan, majd
a teljes leírás visszaírása — ez a fenti "teljes-leírás rewrite" fallback, kimondva.

**Kimenet:** nincs (mellékhatás: a ticket mezői frissülnek).

**Edge case — a backend nem támogat parciális mező-szerkesztést:** a fallback egy
teljes-leírás rewrite (a teljes `description` újraküldése a módosított szekcióval) —
ezt a hívó fél kimondja, nem hallgat róla. Ha a backend semmilyen utólagos szerkesztést
nem enged, a módosítás egy új "komment írása" művelettel dokumentálódik a ticketen, és
ezt a hívó fél jelzi a felhasználónak.

## Művelet 8 — "státuszváltás"

> ℹ️ **Bevezetve (COCALC-260)**.

**Bemenet:** ticket ID; a cél-státusz (a `config.md` státusznév-változóiból, pl.
`REVIEW_STATUS_NAME`, `FIRST_REVIEW_REQUESTED_STATUS`, `DESIGN_TICKET_CLOSE_STATUS`).

**Jelenlegi Jira-leképezés:** előbb `getTransitionsForJiraIssue` az aktuális státuszból
elérhető átmenet-ID-k lekérésére (**sosem** beégetett tranzíció-ID — az státuszfüggő,
lásd `history.md`), majd `transitionJiraIssue` a megfelelő ID-vel. Több hopos utak
(pl. `INITIAL_STATUS_NAME`→`In Progress`→`first_review_requested`) a `config.md`
"Design-review ciklus" átmenet-gráfja szerint, egymás utáni hívásokkal.
- A `config.md` `JIRA_AUTO_*` flag-jei `true` esetén az adott átmenetet a Jira
  Automation végzi — ilyenkor ez a művelet csak **ellenőrzi** a státuszt ("ticket
  beolvasása"), és csak fallbackként hív ténylegesen.

**OpenProject-leképezés:** `OP transition <KULCS> <cél-státusznév>` — egyetlen hívás,
nincs tranzíció-ID és nincs előzetes "elérhető átmenetek" lekérés: az OpenProject
workflow-ja minden státuszból minden státuszba enged (a Jira `old`/`Closed` stb. is
elérhető), így a többhopos utak (pl. `first_review_done`→`second_review_requested`)
közvetlenül egy hívással is mehetnek. A `JIRA_AUTO_*` flag-ek openproject backend mellett
**nem érvényesek** (nincs Jira Automation) — lásd `config.md` "Jira automatizálás"
szekció OpenProject-megjegyzését.

**Kimenet:** nincs (mellékhatás: a ticket új státuszban van), vagy — ha az átmenet az
aktuális státuszból nem elérhető — explicit jelzés a hívó félnek (ne találgasson).

**Edge case — a cél-tracker nem tranzíció-gráf alapú** (pl. GitHub: label-alapú
státusz): a leképezés nem tranzícióra, hanem **címke hozzáadás/eltávolításra** megy
(a "nyitott"/"folyamatban"/"review"/"kész" állapotokat egy-egy címke jelöli), és
nincs "elérhető átmenet" előfeltétel-ellenőrzés. A `JIRA_AUTO_*` flag-ek analógja
backendenként külön beállítás. Az adapter ezt **kimondja**, nem hallgat róla — ha egy
backend egyáltalán nem modellez státuszt, a "státuszváltás" no-op + a hívó fél jelzi a
felhasználónak, hogy a haladást kézzel kell követni.

## Művelet 9 — "komment írása"

> ℹ️ **Bevezetve (COCALC-260)**.

**Bemenet:** ticket ID; a komment szövege (kész, formázott — a hívó fél állítja elő,
pl. a `code-reviewer` review-döntése szó szerint).

**Jelenlegi Jira-leképezés:** `addCommentToJiraIssue` hívás. A subagentek
(`code-reviewer`, `qa-tester`) nem tudják maguk elvégezni (nincs tracker MCP-eszközük a
gépfüggő hex-ID miatt) — a **hívó fő szál** posztolja a subagent válaszában visszaadott
kész szöveggel, közvetlenül a subagent-hívás után; ez feltétel nélküli, automatikus
lépés (dokumentálás, nem kódmódosítás — nem kell hozzá külön jóváhagyás).

**OpenProject-leképezés:** `OP comment <KULCS> --file <komment.md>` (vagy `--text`,
`--stdin`). Mivel ez Bash-hívás, a `code-reviewer` / `qa-tester` subagent **maga is**
posztolhatja; a meglévő "fő szál posztol" szabály ettől még érvényes marad — openproject
backend mellett sem posztol kétszer ugyanazt a subagent és a fő szál.

**Kimenet:** nincs (mellékhatás: a komment felkerül a ticketre).

**Edge case:** ha a backend nem támogat kommentet, a fallback a leírás egy dedikált
`## Napló` szekciójába fűzött, időbélyeges bejegyzés ("ticket módosítása" művelettel) —
kimondva.

## Művelet 10 — "link létrehozása"

> ℹ️ **Bevezetve (COCALC-260)**.

**Bemenet:** a forrás ticket ID; a cél ticket ID (vagy külső URL); a kapcsolat típusa
(`blocks` / `relates to` / `web-design ↔ implementáció`).

**Jelenlegi Jira-leképezés:** `createJiraIssueLink` (ticket–ticket kapcsolat, pl. a
granuláris Story-bontás szülő/gyerek melletti "blocks" élek, vagy a design-review ticket
összekötése az implementációs + web-design tickettel, `design-branch.md` B5). Külső
URL-hez remote issue link. A `figma-designer` a review-linkeket ezzel olvassa vissza
(`getJiraIssueRemoteIssueLinks`, a "ticket beolvasása" `kommentek` scope-ja mellett).

**OpenProject-leképezés:** `OP link <FORRÁS> <CÉL> --type blocks|relates|follows|precedes|…`
(ticket–ticket). Az OpenProject nem enged körkörös függőséget (pl. gyerek `blocks`
szülő) — ilyenkor `1`-es kóddal hibázik, a hívó fél `relates`-re eshet vissza. **Külső
URL-linkhez** nincs külön művelet: a fallback a leírás `## Design` / `## Függőségek`
szekciója vagy egy komment (pl. Figma-link), kimondva. Visszaolvasás: "ticket
beolvasása" (`## Kapcsolatok` + kommentek).

**Kimenet:** nincs (mellékhatás: a link létrejön).

**Edge case — a backend nem ismer tipizált linket** (pl. GitHub: csak szabad-szöveges
kereszthivatkozás): a fallback a kapcsolat szöveges rögzítése mindkét ticket leírásának
`## Függőségek` szekciójában (`relates to <kulcs>` sor) — kimondva, nem néma kihagyás.
Az "Oldalnév"-egyezés (design ↔ implementáció) a linktől függetlenül is működik
(névegyezés az authoritatív, a link csak kényelmi — lásd `config-reference.md` "Oldalnév-konvenció").

## Művelet 11 — "keresés"

> ℹ️ **Bevezetve (COCALC-260)**.

**Bemenet:** a szűrőfeltételek — legalább: felelős (`ASSIGNEE_FOR_PICKUP` /
`MANUAL_REVIEWER_ASSIGNEE`), státusz(ok), label(ek) (`CLAUDE_WORK_LABEL`), opcionálisan
issue type és "régebbi mint N nap" (elakadt-ticket ellenőrzés); rendezés (pl. priority
csökkenő).

**Jelenlegi Jira-leképezés:** `searchJiraIssuesUsingJql` — a szűrők JQL-lé fordítva, pl.
`assignee = <ASSIGNEE_FOR_PICKUP> AND status = "<INITIAL_STATUS_NAME>" AND
labels = <CLAUDE_WORK_LABEL>`. A `labels = <CLAUDE_WORK_LABEL>` feltétel minden "melyik
ticketen dolgozzak" kérdésnél **kötelező** (A4 pickup, elakadt-ticket ellenőrzés, B6
design-review keresés) — lásd `config.md` "Jira label-rendszer".

**OpenProject-leképezés:** `OP search --project <KEY> [--status a,b] [--not-status a,b]
[--label a,b] [--not-label a,b] [--assignee <név|login|me>] [--type a,b] [--parent <KULCS>]
[--updated-before-days N] [--sort priority|updated|id] [--limit N] [--json]`. Pl. az A4
pickup: `OP search --project <PROJECT_KEY> --status "<INITIAL_STATUS_NAME>" --label
<CLAUDE_WORK_LABEL> --not-label <WORKFLOW_FLAGGED_LABEL> --assignee <ASSIGNEE_FOR_PICKUP>`. A `labels not in (...)` JQL-feltétel
megfelelője a `--not-label`; az elakadt-ticket "régebbi mint N nap" feltétele az
`--updated-before-days N`. Kimenet: tabulált sorok (`KULCS [státusz] prioritás típus
felelős cím`), üres találatnál `(nincs találat)`.

**Kimenet:** a találati ticketek listája (kulcs, cím, státusz, priority), a megadott
rendezésben; üres lista is érvényes eredmény (nem hiba).

**Edge case — a backend query-nyelve nem JQL** (pl. GitHub: `is:issue is:open
assignee:… label:…`): a backend **kötelező minimuma** egy `felelős + státusz + label`
szűrő kiszolgálása (enélkül az A4 pickup nem tud dolgozni). A JQL-specifikus, összetett
lekérdezések (dátum-aritmetika, tetszőleges mező) opcionálisak — ha a backend nem tudja,
a hívó fél leszűkíti a kliens-oldalon szűrhető minimumra, és ezt jelzi.

## Új tracker-backend felvétele

> ℹ️ **Bevezetve (COCALC-260, AC5)**: ez a szekció mondja meg, mit kell tenni, ha a
> `config.md` `TRACKER_BACKEND` kapcsolóját egy `jira`-tól eltérő értékre állítanád.

**Lépések:**
> ✅ **Kész backendek:** `jira` (alap, Atlassian MCP) és `openproject` (COCALC-898,
> `../../tools/openproject/op.js` CLI — a fenti "OpenProject-leképezés" bekezdések).

1. Vedd fel az új értéket a `config.md` `TRACKER_BACKEND` sor leírásába (elfogadott
   értékek), és — ha kell — a `config.md` státusznév- / label- / assignee-változóit
   igazítsd a backend fogalmaihoz.
2. **Minden** lenti műveletnél add hozzá az "Új backend-leképezés" alszekciót az
   adott `## Művelet N` blokkhoz (a "Jelenlegi Jira-leképezés" mintájára) — vagy, ha a
   backend nem támogatja, írd le **explicit** a fallbacket (soha ne hallgass róla).
3. A `.claude/skills/dev-workflow/scripts/setup-mcp-allowlist.sh` fájlban igazítsd az új backend
   connector-eszközneveire a permérence-szintű eszöz-konstansokat: `JIRA_TOOL_NAMES` → új
   backend neve alatti `*_TOOL_NAMES`, valamint az egyes subagent-igények (`IMPLEMENTER_*_TOOLS`,
   `FIGMA_DESIGNER_*_TOOLS`, `QA_TESTER_*_TOOLS`, `CODE_REVIEWER_*_TOOLS`) — különben az
   MCP allow-list generálása az öreg (Jira) eszközneveket őrizné. Nézd meg a `setup-mcp-allowlist.sh`
   60-71. sorait a tényleges konstans-sorrendhez.
4. Futtasd a [`ci/verify-tracker-mcp-abstraction.sh`](../../../ci/verify-tracker-mcp-abstraction.sh)
   őrt — a hívó skillek nem változnak, csak ez a fájl.

**Művelet → leképezés-tábla és a kötelező minimum:**

| Művelet | Kötelező? | Ha a backend nem támogatja (fallback) |
|---|---|---|
| `ticket beolvasása` | **igen** (kötelező minimum) | — nincs értelmes fallback, e nélkül a workflow nem indul |
| `ticket létrehozása` | **igen** (kötelező minimum) | — |
| `státuszváltás` | **igen** (kötelező minimum) | ha nincs státusz-fogalom: no-op + a felhasználó kézzel követi; label-alapú backend: címke csere |
| `komment írása` | **igen** (kötelező minimum) | leírás `## Napló` szekció, időbélyeges bejegyzés (`ticket módosítása`) |
| `keresés` | **igen** (kötelező minimum — az A4 pickup függ tőle) | legalább `felelős + státusz + label` szűrő; összetett lekérdezés kliens-oldalon |
| `ticket módosítása` | opcionális | teljes-leírás rewrite; végső esetben `komment írása` |
| `link létrehozása` | opcionális | szöveges `relates to <kulcs>` a `## Függőségek` szekcióban |
| `terv mentése` / `terv beolvasása` | opcionális (a terv-jóváhagyási kör csak akkor perzisztál) | ha nincs komment: a leírás egy `## Terv (jóváhagyva) — <SHA>, <dátum>` szekciója (`ticket módosítása`) |
| `komplexitás mentése` / `komplexitás beolvasása` | opcionális (hiánya = minden fázis `sonnet`, lásd `config.md` fallback-szabály) | a `Komplexitás` sor az infobox táblázatban marad; ha nincs strukturált leírás, a fázis-routing a `sonnet` alapértéket használja |

**A kötelező minimum tehát:** `ticket beolvasása`, `ticket létrehozása`, `státuszváltás`,
`komment írása`, `keresés`. Ez az öt művelet elég ahhoz, hogy az `intake` → `execute`
alapkör végigfusson; a többi művelet hiánya fokozatosan degradál (dokumentált
fallbackekkel), nem blokkol.
