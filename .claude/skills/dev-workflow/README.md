# dev-workflow

Jira + Git (+ Figma) alapú, félig-automata fejlesztési workflow Claude Code skillekkel.
Egy ötletből interjú → Jira ticket(ek) → (opcionális Figma design + review kör) → branch →
TDD implementáció → helyi teszt/lint gate → code review → push/MR → CI teszt-env →
automata AC-ellenőrzés → ticket lezárás/eszkalálás.

**Mielőtt használod**: nyisd meg a [`config.md`](config.md)-t, és töltsd ki/pontosítsd a
benne lévő placeholder értékeket (repo párosítás, Jira project key-ek, assignee nevek,
teszt-env URL-ek, Jira státusznevek, Figma fájl-hivatkozás). Minden más fájl innen olvassa
a beállításokat — itt kell egyszer módosítani.

## Csomag-határ és verziózás

A dev-workflow csomag pontos határát (mi számít verziózott csomag-tartalomnak, mi
repo-lokális kivétel, mi csak minta) a repo-gyökér
[`dev-workflow-manifest.json`](../../../dev-workflow-manifest.json) rögzíti, a
csomag jelenlegi verzióját a repo-gyökér [`VERSION`](../../../VERSION), a
verziótörténetet a repo-gyökér [`CHANGELOG.md`](../../../CHANGELOG.md) — ez a README
nem duplikálja a tartalmukat, csak mutat rájuk. A manifest formai konzisztenciáját a
[`ci/verify-dev-workflow-manifest.sh`](../../../ci/verify-dev-workflow-manifest.sh)
ellenőrzi.

A `CHANGELOG.md` **hatóköre** a manifest `versioned` halmaza mínusz a
`repo_local_exceptions` (`config.md`, `history.md`, `.claude/launch.json`): a
`repo_local_exceptions`-t vagy az alkalmazáskódot érintő változás nem kap
changelog-sort. A `changelog` skill (`../changelog/SKILL.md`) `collect.js`
adatgyűjtője ezt a szűrést automatikusan elvégzi (COCALC-243). A `VERSION` és a
`CHANGELOG.md` a publikált csomag-archívum gyökerén is ott van **olvasható
referenciaként**, de a telepítő a fogyasztó repo `CHANGELOG.md`-jét **nem** teríti
és **nem** írja felül — a fogyasztó a telepített verziót a `.dev-workflow-version`
bélyegből ismeri.

Egy **másik (fogyasztó) repóba** ezt a csomagot a
[`.claude/tools/dev-workflow-install/install-or-upgrade.sh`](../../tools/dev-workflow-install/install-or-upgrade.sh)
telepíti/frissíti (GitLab Package Registry, group deploy token) — a szkript fejléc-
kommentje írja le a szükséges env változókat és az első, üres repóba szükséges egyszeri
kézi bootstrap-letöltést. A szkript saját önellenőrzése:
[`ci/verify-dev-workflow-installer.sh`](../../../ci/verify-dev-workflow-installer.sh).

## Repólokális felülírások (overrides.yaml)

Az agent- és skill-fájlokat a telepítő minden frissítéskor a csomag állapotára állítja
vissza. Ha egy fogyasztó repó egy agent (`.claude/agents/<név>.md`) vagy skill
(`.claude/skills/<név>/SKILL.md`) frontmatterét vagy törzsét helyben módosítani akarja,
ezt az `.claude/skills/dev-workflow/overrides.yaml` fájlban deklarálja; a telepítő a
csomag másolása után alkalmazza (ORD-384, 4.28.0). Friss telepítésnél a fájl az
`overrides.template.yaml` sablonból jön létre, az `overrides/` mappa pedig üresen
(`.gitkeep`). Az `overrides.yaml` és az `overrides/` repó-lokális kivétel: a telepítő soha
nem írja felül és nem módosítja őket. A séma: [`schemas/overrides.v1.json`](schemas/overrides.v1.json).

**Formátum (szűk YAML-részhalmaz).** Csak blokk-mapping, 2 szóköz behúzás, `#` megjegyzés és
skalár érték (sima vagy idézőjeles). Nincs flow-mapping (`{}`), lista, horgony és többsoros
skalár; hibás fájlnál az egész fájl kimarad, figyelmeztetéssel. Az érték nyers token kerül
a fájlba, idézőjelekkel együtt.

```yaml
version: 1
agents:
  implementer:
    frontmatter:
      model: opus
      tools: Read, Grep, Bash(git status:*, git diff:*)
skills:
  dev-workflow-execute:
    body:
      file: execute-body.md
      base_sha256: <a csomag törzsének sha256-ja, 64 kisbetűs hex>
```

- **Frontmatter-felülírás:** csak a felsorolt kulcsok cserélődnek (a meglévő kulcs teljes
  blokkja egy sorra), az új kulcs a záró `---` elé kerül; a fájl többi része bájtra azonos.
  A `name` kulcs nem írható felül.
- **Törzs-felülírás:** a `body.file` az `overrides/` mappában lévő, csak törzset tartalmazó
  (frontmatter nélküli) fájl; relatív útvonal, `..` és abszolút út nélkül. A
  `base_sha256` annak a csomag-törzsnek a hash-e, amelyre a felülírást írtad. Ha a hash
  egyezik, a fájl törzse a felülírás lesz.
- **Ütközés:** ha a csomag törzse közben megváltozott (a hash nem egyezik), a csomag törzse
  marad, mellé `<fájl>.override-conflict` kerül a helyi törzzsel, a kimenet `diff -u`-t,
  `OVERRIDE ÜTKÖZÉS` és `FIGYELEM` sort ad, a telepítés sikeres marad. Feloldás: nézd át a
  diffet, frissítsd az `overrides/` törzsfájlt, állítsd a `base_sha256`-ot a kiírt új
  hash-re, és futtasd újra a telepítőt; a feloldott ütközés `.override-conflict` fájlját a
  telepítő törli.
- **Hibás bejegyzés** (ismeretlen név, hiányzó törzsfájl, rossz kulcs) kimarad `FIGYELEM:`
  sorral; a többi bejegyzés érvényesül. Idempotens: a második futás ugyanazt adja.
- **Node 22 kell a telepítőben.** Ha nincs `node`, a telepítő figyelmeztet, kihagyja a
  felülírásokat, és sikeresen fut tovább.
- **Első frissítés 4.28.0-ra:** ezen az egy futáson a fogyasztó régi telepítője fut, ami még
  nem ismeri az `overrides.yaml`-t, ezért nem alkalmazza; a felülírások a következő futástól
  érvényesek (adatvesztés nincs).

Önellenőrzés: [`ci/verify-dev-workflow-overrides.sh`](../../../ci/verify-dev-workflow-overrides.sh).

## Új gépre telepítés

Mielőtt bármelyik subagent (implementer, qa-tester, code-reviewer, figma-designer) MCP-
eszközt (Figma/Jira) hívna ezen a gépen, futtasd le egyszer:

```
bash .claude/skills/dev-workflow/scripts/setup-mcp-allowlist.sh
```

Ez a gépen már jóváhagyott Figma/Jira MCP hex-ID-kből felírja/kiegészíti a repo-lokális,
nem verziózott `.claude/settings.local.json`-t, hogy a subagentek ne akadjanak el
interaktív MCP-jóváhagyási promptokon. Ha a szkript azt jelzi, hogy egy szolgáltatáshoz
még nincs hex-ID (mert még sosem lett kézzel meghívva egy eszköze ezen a gépen), hívj meg
kézzel egy Figma- vagy Jira-MCP eszközt, fogadd el a jóváhagyási promptot, majd futtasd
újra a szkriptet. Lásd `config.md` "AI-identitás" szekció "A három csatorna..." táblázat
"MCP allow-list" sorát.

**`TRACKER_BACKEND=openproject` esetén** a tracker nem MCP-connector, hanem a
`.claude/tools/openproject/op.js` CLI (Node 18+). Gépenként egyszer írd a példány címét
(`config.md` `OPENPROJECT_URL`) és a workflow technikai felhasználójának API tokenjét a
felhasználói könyvtárba — ezek nem kerülnek a repóba:

```
mkdir -p ~/.config/openproject
printf '%s' '<OPENPROJECT_URL>' > ~/.config/openproject/url
printf '%s' '<API token>'       > ~/.config/openproject/token
node .claude/tools/openproject/op.js whoami      # ellenőrzés
```

A gépnek el kell érnie a példányt (pl. ugyanazon a Tailscale-hálózaton legyen).

A `wiki list|get|put` parancsokhoz (COCALC-913) a gépnek a web-konténert is el kell érnie:
az OpenProject-hoszton magától `docker exec`-kel megy, máshonnan SSH-val. Ehhez gépenként
egyszer (a host a `config.md` `OPENPROJECT_WIKI_SSH_HOST` sora):

```
printf '%s' '<felhasználó>@<openproject-host>' > ~/.config/openproject/wiki_ssh_host
ssh <felhasználó>@<openproject-host> true             # első kapcsolat / hostkulcs elfogadása
node .claude/tools/openproject/op.js wiki list --project <PROJECT_KEY>   # ellenőrzés
```

Az SSH nem-interaktívan (`BatchMode=yes`) fut; Tailscale SSH esetén a tailnet ACL-jének
engedélyeznie kell ezt a gépet → a távoli felhasználót (`check` mód helyett `accept`).

## Indító parancsok

A mondatok szerkeszthető, kanonikus forrása a [`config.md`](config.md) "Indító parancsok"
táblázata — az alábbi lista azt tükrözi, itt csak dokumentációs célból van megismételve.

| # | Mondat | Mit csinál | Melyik fájl |
|---|---|---|---|
| 1 | "szeretnék fejleszteni valamit a `<repo/jira projekt>`-ben" | Felméri, hogy az ötlet 1 story vagy több — utóbbi esetén storyonként lefuttatja az interjút és a ticket-létrehozást (FE/BE split, ha kell), a végén összesít | [`../dev-workflow-scoping/SKILL.md`](../dev-workflow-scoping/SKILL.md) → storyonként [`../dev-workflow-intake/SKILL.md`](../dev-workflow-intake/SKILL.md) |
| 2 | "vedd magadhoz azt a ticketet, ami soron következik" | A configolt assignee-re szűrt, priority + függőség szerint soron következő ticket felvétele, branch, TDD implementáció, teszt/lint/code-review kapuk, push, MR | [`../dev-workflow-execute/SKILL.md`](../dev-workflow-execute/SKILL.md) — A4 |
| 3 | "folytasd a 8-tól" | Teszt-env ellenőrzés folytatása egy már pusholt/kézzel javított ticketnél | [`../dev-workflow-execute/SKILL.md`](../dev-workflow-execute/SKILL.md) — A8 |
| 4 | "nézd meg, hogy lereviewztem-e a design terved" | Design-review-kör ellenőrzése és javítása a reviewer Jira-kommentjei alapján | [`../dev-workflow-execute/SKILL.md`](../dev-workflow-execute/SKILL.md) → [`design-branch.md`](../dev-workflow-execute/design-branch.md) — B6 |
| 5 | "workflow-t folytasd implementációval" | Jóváhagyott Figma design után implementáció indítása | [`../dev-workflow-execute/SKILL.md`](../dev-workflow-execute/SKILL.md) → [`design-branch.md`](../dev-workflow-execute/design-branch.md) — B7 → A5 |
| 6 | "dolgozd fel a review kommentjeimet" | Review-státuszú ticket Jira-/GitLab-kommentjeinek feldolgozása, tisztázó kérdések, jóváhagyott javítási terv alapján implementáció, majd vissza a szokásos kapukhoz | [`../dev-workflow-execute/SKILL.md`](../dev-workflow-execute/SKILL.md) → [`review-feedback.md`](../dev-workflow-execute/review-feedback.md) — R1 → A7 |
| 7 | "ismerd fel a repo stackjeit és generálj best practice kivonatot" | A repo stackjeinek felismerése build/manifest-fájlok alapján, és minden még dokumentálatlan stackhez `docs/best-practices-<slug>.md` draft generálása | [`best-practice-bootstrap.md`](best-practice-bootstrap.md) — kézzel indítható, önálló lépés |
| 8 | "vedd magadhoz a következő storyt gyorsmódban" | Mint a 2., de `STORY_BATCH_MODE=on`: a szülő Story + minden nyitott sub-taskja egyetlen körben — egy branch, egy MR, egy pipeline, egy code review, egy test-env kör (a sub-task határok csak commit-csoportok). Kevesebb CI/CD terhelés | [`../dev-workflow-execute/SKILL.md`](../dev-workflow-execute/SKILL.md) — A4 (batch) |
| 9 | "keretezzük fel ezt az ötletet, mielőtt nekilátnánk scope-olni" | Egy nyers ötlet felkeretezése (probléma, szereplők, siker-metrika, kötő korlátok, "Not doing" lista, feltételezés-térkép) a scoping/intake előtt; a scoping a `DISCOVERY_DEPTH` szerint automatikusan is hívja | [`../dev-workflow-discovery/SKILL.md`](../dev-workflow-discovery/SKILL.md) |
| 10 | "csináld meg előre az összes képernyőtervet" | Design-előfutás: az összes design-érintett ticket képernyőterve oldalnév szerint deduplikálva, jóváhagyás után sorosan B4→B5, egyetlen review-megállással | [`../dev-workflow-execute/SKILL.md`](../dev-workflow-execute/SKILL.md) → [`design-branch.md`](../dev-workflow-execute/design-branch.md) — B8 |
| 11 | "nézd át UX-szemmel az appot" | UX-audit: a futó app böngészős bejárása, user-flow térkép, Nielsen + WCAG 2.2 AA szerinti, súlyozott találatok | [`../ux-designer/SKILL.md`](../ux-designer/SKILL.md) — audit |
| 12 | "gondold újra a flow-t és tervezz új képernyőket" | UX-redesign: célflow és képernyőnkénti UX-spec a meglévő UI-szerződésre építve (T0–T3 szintek, TS/API-delta), jóváhagyás után story-javaslatok a scopingnak | [`../ux-designer/SKILL.md`](../ux-designer/SKILL.md) — redesign |
| 13 | "kritizáld ezt a képernyőtervet" | UX-kritika: Figma-terv vagy élő oldal a UX-spec és a rubrika ellen, verdikttel (a pipeline-ban a B4a hívja) | [`../ux-designer/SKILL.md`](../ux-designer/SKILL.md) — critique |
| 14 | "csináld meg az `<EPIC-KULCS>` epicet storynként" | Epic-mód: storynként branch → batch-kör → push + MR → zöld pipeline → review → merge → a következő story a friss masterről; független storyk párhuzamosan, worktree-ben. Kapcsolók: `EPIC_APPROVAL_MODE` (alap `upfront`: egy jóváhagyás az elején), `EPIC_PARALLEL_MODE` (alap `parallel`) | [`../dev-workflow-execute/epic-mode.md`](../dev-workflow-execute/epic-mode.md) |

## Folyamat dióhéjban

```
(1) scoping: 1 story-e vagy több?
                     │
        ┌────────────┴────────────┐
        ▼ 1 story                 ▼ N story (jóváhagyott bontás)
   intake (1x)              intake (Nx, sorban, összekötve)
                     │
                     ▼
              Jira ticket(ek) [To Do]
                     │
                     ▼
(2) execute: pickup (A4, priority + függőség alapján)
                     │
        ┌────────────┴────────────┐
        ▼ (van design-igény,      ▼ (nincs design-igény,
        nincs jóváhagyott terv)   vagy már jóváhagyott)
   B-ág: figma design            A-ág: branch (A5)
   → web-design + design-review  → implementer (A6, TDD)
   → workflow megáll             → qa-tester lokál (A7)
        │                          → code review (9)
   (4) review-check (B6)          → push + MR
   → max 2 automata kör           → qa-tester teszt-env (A8)
        │                          → REVIEW_STATUS_NAME vagy fix-ticket
   (5) folytasd implementációval
        └──────────────► A5 (A-ág folytatása)
```

Bármelyik minőségi kapu (helyi teszt, code review, teszt-env) piros eredménye esetén
`MAX_LOCAL_FIX_RETRIES` javítókör fut, utána — ha még mindig piros — fix-ticket készül
`MANUAL_DEV_ASSIGNEE`-nek, és a folyamat megáll az adott ticketen. Innen a (3) paranccsal
folytatható, ha a felhasználó kézzel javított.

### Opcionális UX-előszakasz (11–13)

Egy meglévő app UX-újragondolásához a fenti lánc elé kerül:

```
(11) audit ─► (12) redesign ─► jóváhagyás ─► (1) scoping a ticket-javaslatokból
     │              │                         (storyk: Oldalnév + UI-változás kerete + UX-spec)
     │              └─ a UI-szerződésre épít: ui-contract.js extract (T0 = csak HTML/SCSS)
     ▼
(10) design-előfutás: B4 (figma-designer a UX-spec szerint) → B4a UX-kritika → B5 review
     ▼
A-ág: implementer a ticket keretén belül → ui-contract.js check-budget kapu push előtt
```

## Fájlok

- [`config.md`](config.md) — az egyetlen érték-forrás (4.30.0 óta rövid: csak kulcsok és értékek,
  kb. 15–20 KB). Minden skill/subagent ezt olvassa be elsőként; a subagentek az értékeket a
  hívótól kapják a prompt `Konfiguráció:` blokkjában.
- [`config-reference.md`](config-reference.md) — a kulcsok jelentése, a lehetséges értékek, a
  preset- és fallback-szabályok (a csomag része, upgrade-kor frissül). Szakaszcímei egyeznek a
  `config.md`-éivel; **csak a szükséges szakaszt** olvasd be belőle, egészben soha.
- [`history.md`](history.md) — a `config.md` korábbi, dátumozott nyomozás-/tapasztalat-
  bekezdései. **Nem hot-path olvasmány** — egyetlen skill sem tölti be automatikusan,
  csak akkor érdemes belenézni, ha egy skill/subagent olyan Jira/API hibát tapasztal, amit
  a `config.md` táblázatai nem magyaráznak.
- [`jira-ticket-template.md`](jira-ticket-template.md) — közös ticket-fejléc (infobox) + AC
  + teszterv formátum, beleértve a design ticketeknél kötelező "Oldalnév" mezőt.
- [`jira-automation-setup.md`](jira-automation-setup.md) — egyszeri, emberi Jira/GitLab
  admin-beállítási útmutató, amivel több `transitionJiraIssue` MCP-hívás kiváltható
  szerveroldali automatizálással (lásd `config.md` "Jira automatizálás" szekció flag-jei).
  **Nem hot-path olvasmány**, egyetlen skill sem tölti be automatikusan.
- [`../dev-workflow-scoping/SKILL.md`](../dev-workflow-scoping/SKILL.md) — 1. indító
  parancs, felméri hány story-ra bomlik az ötlet, storyonként meghívja az `intake`-et.
- [`../dev-workflow-intake/SKILL.md`](../dev-workflow-intake/SKILL.md) — a `scoping` által
  storyonként hívott motor (közvetlenül is hívható, ha egyértelműen egy story-ról van szó);
  a meglévő [`../story-interview/SKILL.md`](../story-interview/SKILL.md) skillt hívja az
  interjúhoz.
- [`../dev-workflow-execute/SKILL.md`](../dev-workflow-execute/SKILL.md) — 2–5. indító
  parancs, a fő állapotgép, de **csak az A-ágat** (kód implementáció) tartalmazza.
- [`../dev-workflow-execute/design-branch.md`](../dev-workflow-execute/design-branch.md)
  — a B-ág (web-design ticket, Figma terv, design-review ciklus). Külön fájlba
  szervezve, hogy tiszta backend/már-jóváhagyott-design ticketeknél az `execute` skill ne
  töltse be feleslegesen — csak akkor olvassa be, ha a ticket ténylegesen design-igényes.
- [`../dev-workflow-execute/review-feedback.md`](../dev-workflow-execute/review-feedback.md)
  — az R-ág (6. indító parancs): egy `review`-státuszú tickethez érkezett Jira-/GitLab-
  kommentek feldolgozása, tisztázó kérdések, jóváhagyott javítási terv alapján
  implementáció, majd visszatérés a szokásos A7→9→A8 kapukhoz. Külön fájlba szervezve,
  hogy normál A-ági/B-ági köröknél ne kelljen betölteni.
- Feltételes execute-ágak (4.31.0, ORD-498), mindegyiket csak a feltétele teljesülésekor tölti be az `execute`:
  [`batch-mode.md`](../dev-workflow-execute/batch-mode.md) (`STORY_BATCH_MODE=on`),
  [`local-execution.md`](../dev-workflow-execute/local-execution.md) (`implementer` / `qa-tester` szint `local`),
  [`workflow-meta.md`](../dev-workflow-execute/workflow-meta.md) (7a0 csomag-verzió kapu),
  [`test-env.md`](../dev-workflow-execute/test-env.md) (A8, illetve a 3. indító parancs).
- Feltételes intake-részletek (4.31.0, ORD-498), csak ha az adott lépés fut:
  [`code-scan.md`](../dev-workflow-intake/code-scan.md) (2.a), [`threat-model.md`](../dev-workflow-intake/threat-model.md)
  (2.c), [`nfr.md`](../dev-workflow-intake/nfr.md) (2.d), [`adr-trigger.md`](../dev-workflow-intake/adr-trigger.md) (2.e).
- [`../dev-workflow-execute/env-bootstrap.md`](../dev-workflow-execute/env-bootstrap.md)
  — a Jira Automation flag-ek session eleji, egyszeri megkérdezése (`execute/SKILL.md`
  "0. lépés"). Miután minden flag megerősítést nyert a `config.md`-ben, ez a fájl
  véglegesen feleslegessé válik — az `execute` innentől soha nem olvassa be újra.
- [`../../agents/implementer.md`](../../agents/implementer.md),
  [`../../agents/qa-tester.md`](../../agents/qa-tester.md),
  [`../../agents/code-reviewer.md`](../../agents/code-reviewer.md),
  [`../../agents/figma-designer.md`](../../agents/figma-designer.md)
  — subagentek, a pipeline (`execute`/`design-branch.md`) ezeket hívja. A `.claude/agents/`
  lesz az egyetlen forrás — az alábbi önálló wrapperek ide mutatnak, nem duplikálják.
- [`../implementer/SKILL.md`](../implementer/SKILL.md),
  [`../qa-tester/SKILL.md`](../qa-tester/SKILL.md),
  [`../code-reviewer/SKILL.md`](../code-reviewer/SKILL.md),
  [`../figma-designer/SKILL.md`](../figma-designer/SKILL.md) — vékony, önállóan hívható
  wrapper-skillek a fentiekhez, hogy a pipeline-tól függetlenül, közvetlen mondattal is
  elindíthatók legyenek (pl. "review-zd le ezt a diffet", Jira ticket nélkül is).
- [`../dev-workflow-execute/retry-and-escalation.md`](../dev-workflow-execute/retry-and-escalation.md)
  — közös javítókör- és eszkalációs logika.
- [`../session-cost-report/SKILL.md`](../session-cost-report/SKILL.md) +
  [`../../tools/session-cost-report/`](../../tools/session-cost-report/) — **nem a
  pipeline része**: offline eszköz, ami egy Claude Code session helyben tárolt
  transcriptjéből fázisonkénti token/cost riportot (JSON + HTML diagram) generál, utólag,
  nulla extra token-költségért. Lásd a `tools/session-cost-report/README.md`-t a pontos
  működésért.

> ⚠️ **2026-08-18 — struktúra-javítás**: korábban `scoping/`, `intake/`, `execute/`
> almappaként éltek ez alatt a `dev-workflow/` mappa alatt (két szinttel a
> `.claude/skills/` alatt) — ez azt eredményezte, hogy a skill-felderítés **egyáltalán nem
> találta meg őket** (a Claude Code csak a pontosan egy szinttel mélyebben lévő
> `.claude/skills/<név>/SKILL.md` fájlokat listázza automatikusan induláskor). Emiatt
> lettek kilapítva a `dev-workflow-scoping/`, `dev-workflow-intake/`, `dev-workflow-execute/`
> saját, közvetlenül a `skills/` alatti mappákba — ez a `dev-workflow/` mappa mostantól csak
> a megosztott, nem önállóan induló referencia-fájlokat tartalmazza (`README.md`,
> `config.md`, `history.md`, `jira-automation-setup.md`, `jira-ticket-template.md`).

## Kapcsolódó, korábbi anyagok (nem része ennek a csomagnak)

A repóban maradt korábbi próbálkozások, amiket ez a csomag kivált — nyugodtan törölhetők,
ha ezt az újat használod:
- `claude/pure-code-workflow/` (`SKILL.md`, `qa-tester.md`, `code-reviewer.md` — ezek
  tartalma átkerült ide, generalizálva/kiegészítve)
- `claude/design-workflow/frontend-dev-workflow.plugin`
- `claude/workflow-creating-tasklist.md` (a régi meta-terv, amit a mostani, részletesebb
  terv felülír)
