# dev-workflow

Jira + Git (+ Figma) alapú, félig automata fejlesztési workflow Codex skillekkel.
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

Egy **másik (fogyasztó) repóba** ezt a csomagot a
[`.claude/tools/dev-workflow-install/install-or-upgrade.sh`](../../../.claude/tools/dev-workflow-install/install-or-upgrade.sh)
telepíti/frissíti (GitLab Package Registry, group deploy token) — a szkript fejléc-
kommentje írja le a szükséges env változókat és az első, üres repóba szükséges egyszeri
kézi bootstrap-letöltést. A szkript saját önellenőrzése:
[`ci/verify-dev-workflow-installer.sh`](../../../ci/verify-dev-workflow-installer.sh).

## Indító parancsok

A mondatok szerkeszthető, kanonikus forrása a [`config.md`](config.md) "Indító parancsok"
táblázata — az alábbi lista azt tükrözi, itt csak dokumentációs célból van megismételve.

| # | Mondat | Mit csinál | Melyik fájl |
|---|---|---|---|
| 1 | "szeretnék fejleszteni valamit a `<repo/jira projekt>`-ben" | Felméri, hogy az ötlet 1 story vagy több — utóbbi esetén storyonként lefuttatja az interjút és a ticket-létrehozást (FE/BE split, ha kell), a végén összesít | [`../dev-workflow-scoping/SKILL.md`](../dev-workflow-scoping/SKILL.md) → storyonként [`../dev-workflow-intake/SKILL.md`](../dev-workflow-intake/SKILL.md) |
| 2 | "vedd magadhoz azt a ticketet, ami soron következik" | A configolt assignee-re és `codex` labelre szűrt, priority + függőség szerint soron következő ticket felvétele, branch, TDD implementáció, teszt/lint/code-review kapuk, push, MR | [`../dev-workflow-execute/SKILL.md`](../dev-workflow-execute/SKILL.md) — A4 |
| 3 | "folytasd a 8-tól" | Teszt-env ellenőrzés folytatása egy már pusholt/kézzel javított ticketnél | [`../dev-workflow-execute/SKILL.md`](../dev-workflow-execute/SKILL.md) — A8 |
| 4 | "nézd meg, hogy lereviewztem-e a design terved" | Design-review-kör ellenőrzése és javítása a reviewer Jira-kommentjei alapján | [`../dev-workflow-execute/SKILL.md`](../dev-workflow-execute/SKILL.md) → [`design-branch.md`](../dev-workflow-execute/design-branch.md) — B6 |
| 5 | "workflow-t folytasd implementációval" | Jóváhagyott Figma design után implementáció indítása | [`../dev-workflow-execute/SKILL.md`](../dev-workflow-execute/SKILL.md) → [`design-branch.md`](../dev-workflow-execute/design-branch.md) — B7 → A5 |
| 6 | "dolgozd fel a review kommentjeimet" | Review-státuszú ticket Jira-/GitLab-kommentjeinek feldolgozása, tisztázás, jóváhagyott javítás, majd vissza a kapukhoz | [`../dev-workflow-execute/SKILL.md`](../dev-workflow-execute/SKILL.md) → [`review-feedback.md`](../dev-workflow-execute/review-feedback.md) — R1 → A7 |
| 10 | "csináld meg előre az összes képernyőtervet" | Design-előfutás: az összes design-érintett ticket képernyőterve oldalnév szerint deduplikálva, jóváhagyás után sorosan B4→B5, egyetlen review-megállással | [`../dev-workflow-execute/SKILL.md`](../dev-workflow-execute/SKILL.md) → [`design-branch.md`](../dev-workflow-execute/design-branch.md) — B8 |
| 11 | "nézd át UX-szemmel az appot" | UX-audit: a futó app böngészős bejárása, user-flow térkép, Nielsen + WCAG 2.2 AA szerinti, súlyozott találatok | [`../ux-designer/SKILL.md`](../ux-designer/SKILL.md) — audit |
| 12 | "gondold újra a flow-t és tervezz új képernyőket" | UX-redesign: célflow és képernyőnkénti UX-spec a meglévő UI-szerződésre építve (T0–T3 szintek, TS/API-delta), jóváhagyás után story-javaslatok a scopingnak | [`../ux-designer/SKILL.md`](../ux-designer/SKILL.md) — redesign |
| 13 | "kritizáld ezt a képernyőtervet" | UX-kritika: Figma-terv vagy élő oldal a UX-spec és a rubrika ellen, verdikttel (a pipeline-ban a B4a hívja) | [`../ux-designer/SKILL.md`](../ux-designer/SKILL.md) — critique |
| 14 | "csináld meg az `<EPIC-KULCS>` epicet storynként" | Epic-mód — csak a Claude-workflow-ban (E-ág); a Codex-portban nincs | [`.claude/skills/dev-workflow-execute/epic-mode.md`](../../../.claude/skills/dev-workflow-execute/epic-mode.md) |

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
(2) execute: pickup (A4, codex label + priority + függőség alapján)
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
- [`../dev-workflow-execute/SKILL.md`](../dev-workflow-execute/SKILL.md) — 2–6. indító
  parancs, a fő állapotgép, de **csak az A-ágat** (kód implementáció) tartalmazza.
- [`../dev-workflow-execute/design-branch.md`](../dev-workflow-execute/design-branch.md)
  — a B-ág (web-design ticket, Figma terv, design-review ciklus). Külön fájlba
  szervezve, hogy tiszta backend/már-jóváhagyott-design ticketeknél az `execute` skill ne
  töltse be feleslegesen — csak akkor olvassa be, ha a ticket ténylegesen design-igényes.
- [`../dev-workflow-execute/review-feedback.md`](../dev-workflow-execute/review-feedback.md)
  — az R-ág: emberi Jira-/GitLab-review visszajelzés feldolgozása és visszatérés az
  A7→9→A8 kapukhoz.
- [`../dev-workflow-execute/env-bootstrap.md`](../dev-workflow-execute/env-bootstrap.md)
  — a Jira Automation flag-ek session eleji, egyszeri megkérdezése (`execute/SKILL.md`
  "0. lépés"). Miután minden flag megerősítést nyert a `config.md`-ben, ez a fájl
  véglegesen feleslegessé válik — az `execute` innentől soha nem olvassa be újra.
- [`../dev-workflow-execute/implementer.md`](../dev-workflow-execute/implementer.md),
  [`../dev-workflow-execute/qa-tester.md`](../dev-workflow-execute/qa-tester.md),
  [`../dev-workflow-execute/code-reviewer.md`](../dev-workflow-execute/code-reviewer.md),
  [`../dev-workflow-execute/figma-designer.md`](../dev-workflow-execute/figma-designer.md)
  — subagentek, a pipeline (`execute`/`design-branch.md`) ezeket hívja. Ez az egyetlen
  forrás — az alábbi önálló wrapperek ide mutatnak, nem duplikálják.
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
  pipeline része**: offline eszköz, ami egy Codex session helyben tárolt
  transcriptjéből turnonkénti token/cost riportot (JSON + HTML diagram) generál,
  utólag, nulla extra modell-token költségért. Lásd a
  `tools/session-cost-report/README.md`-t a pontos működésért.

> ⚠️ **2026-08-18 — struktúra-javítás**: korábban `scoping/`, `intake/`, `execute/`
> almappaként éltek ez alatt a `dev-workflow/` mappa alatt (két szinttel a
> `.agents/skills/` alatt) — ez azt eredményezte, hogy a skill-felderítés nem találta
> meg őket (a Codex a `.agents/skills/<név>/SKILL.md` belépési pontokat keresi). Emiatt
> lettek kilapítva a `dev-workflow-scoping/`, `dev-workflow-intake/`, `dev-workflow-execute/`
> saját, közvetlenül a `skills/` alatti mappákba — ez a `dev-workflow/` mappa mostantól csak
> a megosztott, nem önállóan induló referencia-fájlokat tartalmazza (`README.md`,
> `config.md`, `history.md`, `jira-automation-setup.md`, `jira-ticket-template.md`).

## Kapcsolódó, korábbi anyagok (nem része ennek a csomagnak)

A korábbi, különálló pure-code/design workflow próbálkozásokat ez az egységes csomag
kiváltja; a jelenlegi `.agents/skills` fa a Codex által használt változat.
