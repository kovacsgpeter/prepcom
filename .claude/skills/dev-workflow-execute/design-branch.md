# dev-workflow-execute — B-ág (design-igényes feladat)

Ezt a fájlt csak akkor olvasd be, ha ténylegesen a B-ágra kerülsz — vagyis:
- az `A4` pickup lépés arra jutott, hogy a ticketnek van "Oldalnév" mezője, de nincs még
  jóváhagyott/lezárt design hozzá,
- vagy a felhasználó a (4) "nézd meg, hogy lereviewztem-e a design terved" (**B6**),
- vagy az (5) "workflow-t folytasd implementációval" (**B7**),
- vagy a (10) "csináld meg előre az összes képernyőtervet" (**B8**, design-előfutás)
  belépési ponttal indított.

Tiszta backend vagy már jóváhagyott-design ticketeknél (A-ág végig) **ne olvasd be** —
szándékosan van kiszervezve ide, hogy ne terhelje feleslegesen a kontextust azokban az
esetekben, amikor a B-ág egyáltalán nem releváns.

## Konfiguráció

A [`../dev-workflow/config.md`](../dev-workflow/config.md)-t a hívó
[`SKILL.md`](SKILL.md) már beolvasta — innen releváns a "Design-review ciklus" szekció
(`FIRST_REVIEW_REQUESTED_STATUS`, `FIRST_REVIEW_DONE_STATUS`,
`SECOND_REVIEW_REQUESTED_STATUS`, `SECOND_REVIEW_DONE_STATUS`, `FIGMA_FILE_REF`, a
tényleges Jira átmenet-gráf) és a `JIRA_ISSUE_TYPE_MAP` (`web-design`, `design-review`
típusokhoz).

**`figma-designer` végrehajtó-szintje (COCALC-273, MEAS-2; bővítve COCALC-278, LOCAL-2)**:
ha az A4→B4 útvonalon kerültél ide (`SKILL.md` A5a **előtt**), futtasd le itt, B4 elején,
az A5a lépés komplexitás-beolvasási és `resolve-executor-level.sh --phase figma-designer
--offload-profile <config.md OFFLOAD_PROFILE> --clamp-direction <config.md
OFFLOAD_CLAMP_DIRECTION>` hívását (lásd `SKILL.md` A5a) — ha már lefutott (pl. B6/B7
belépési pont, ahol A5a a normál A-ági sorrendben már megtörtént korábban ezen a
ticketen), a cache-elt eredményt használd újra, ne futtasd le kétszer. A
`figma-designer` a `config-reference.md` "OFFLOAD_PROFILE és OFFLOAD_PHASE_MATRIX" mátrixában
minden preseten `sonnet`/`opus`-ra van korlátozva (⛔ kizárva a `local`/`haiku`
szintekről, mert Figma MCP-t vezérel) — a mátrix-clamp emiatt erre a fázisra a
gyakorlatban no-op, de a hívásnak konzisztensen kell mennie a többi fázissal.

## B4 — Web-design ticket + Figma terv

- Hozz létre egy Jira ticketet [`../dev-workflow/jira-ticket-template.md`](../dev-workflow/jira-ticket-template.md)
  "Web-design ticket" szekciója szerint: Jira issue type `web-design` (a
  `JIRA_ISSUE_TYPE_MAP` szerint), linkelve az implementációs tickethez. **A `labels`
  mezőbe a sablon szerinti `CLAUDE_CREATED_LABEL` mellé tedd bele a `config.md`
  `CLAUDE_WORK_LABEL` értékét is** — mivel ez a ticket egy már `CLAUDE_WORK_LABEL`-lel
  ellátott implementációs ticketből ágazik le (az A4 pickup csak ilyet választhatott ki),
  a leágazó design-ticketek örökre kapják ugyanezt a tulajdonjelölést, nem kell rá kézzel
  visszamenni Jira-ba.
- **"In Progress"-re állítás**: ha a `config.md` `JIRA_AUTO_INITIAL_STATUS_ON_CREATE`
  flag `true`, a Jira Automation ezt már elvégezte a ticket létrehozásakor — csak
  ellenőrizd a [`tracker-adapter.md`](tracker-adapter.md) "ticket beolvasása" műveletével,
  és csak akkor hívd a "státuszváltás" műveletet, ha mégsem történt meg. Ha a flag
  `false` (alapállapot), a ticket a workflow kezdő állapotában (`INITIAL_STATUS_NAME`)
  jön létre, és külön "státuszváltás" művelettel kell "In Progress"-re állítanod (nincs
  mód a létrehozással egy lépésben a célállapotba kerülni).
- Hívd meg a `figma-designer` subagentet `new` móddal a ticket
  ID-vel (első kör, ha korábban még nem futott ezen a ticketen), a fenti
  "`figma-designer` végrehajtó-szintje" szerint feloldott szintet hívásidejű modell-
  argumentumként átadva.
- Ha a `figma-designer` válasza `FIGMA_TOOLS_MISSING`-gel kezdődik, ÁLLJ MEG: jelezd a
  felhasználónak egy sorban, a web-design ticket maradjon az állapotában (ne lépjen
  `DESIGN_TICKET_CLOSE_STATUS`-ra), és NE hívj helyette general-purpose agentet. A
  felhasználó a connector rendbetétele után kéri az újrafuttatást.
- **UX-spec átadása (COCALC-899, 4.21.0)**: ha az implementációs ticket "## Design"
  szekciója UX-specre hivatkozik (`<UX_OUTPUT_DIR>/redesign-….md#<oldalnév>`, a
  [`../ux-designer/SKILL.md`](../ux-designer/SKILL.md) redesign-ágából), olvasd be a
  hivatkozott fejezetet, és add át a `figma-designer`-nek a ticket mellett. A
  "UI-változás kerete" mezőt is add át. A spec a tartalom, az állapotok és a
  mikroszöveg elsődleges forrása, a szerződés-leképezése pedig megmondja, milyen adatot
  és akciót tervezhet.
- **Miután a `figma-designer` visszaadta a záró összefoglalót** (mit vett át
  változatlanul a meglévő design systemből, mit hozott létre újonnan): vezesd ezt át a
  web-design ticket leírásának "## Kiindulási állapot" szekciójába —
  "Mi létezik már" = a változatlanul átvett design system elemek (komponensek,
  színek/tipográfia-tokenek, meglévő minta-frame-ek), "Követendő minta" = az átvett
  design system konvenció, "Mi hiányzik ténylegesen" = az újonnan létrehozott elemek. Ez
  **nem indít új Figma-vizsgálatot** — kizárólag a subagent már megkapott válaszának
  átvezetése a ticket leírásába, ne hívd emiatt újra a `figma-designer`-t.
- Ha a `figma-designer` végzett, állítsd a web-design ticketet a `config.md`
  `DESIGN_TICKET_CLOSE_STATUS` értékére (**ne** "Done"-ra — a web-design/design-review
  ticketek nem tényleges munkatermékek, hanem folyamat-nyomkövető ticketek, a "Done"
  a valódi implementációs ticketeknek van fenntartva). A "státuszváltás" művelet
  ellenőrzi a ténylegesen elérhető átmenetet a ticket jelenlegi státuszából.

## B4a — UX-kritika (`UX_CRITIQUE_GATE`)

> ℹ️ **Bevezetve (COCALC-899, 4.21.0)** — kapcsolója a `config.md` "UX-designer (UX_*)"
> szakaszában van; hiányzó sor esetén `advisory`, csendben.

A B4 után, a B5 előtt fut, oldalanként. Célja, hogy a kézi reviewer egy már
rubrika szerint átnézett tervet kapjon, és a rejtett TS/API-igény (a terv olyan adatot
vagy akciót mutat, amire a UX-spec nem nevez meg forrást) még a review előtt
kiderüljön.

- **`off`**: kihagyod, jön a B5.
- **`advisory`** *(alap)*: hívd meg a `ux-designer` subagentet `critique` móddal,
  `figma` célponttal (oldalnév = a frame neve). Add át a UX-spec fejezetet (ha a ticket
  hivatkozik rá), a ticket AC-it és a "UI-változás kerete" mezőt. A végrehajtó-szintet
  ugyanúgy oldd fel, mint a `figma-designer`-ét, csak `--phase ux-designer`-rel. A
  verdiktet és a találat-táblát a B5-ben létrehozott design-review ticket leírásába tedd,
  "## UX-kritika (automatikus)" szakaszként. A folyamatot nem állítja meg.
- **`blocking`**: mint az `advisory`, de **Block** verdiktnél egyszer hívd meg a
  `figma-designer`-t `revise` móddal, a kritika találataival mint review-kommentekkel
  (ahogy a B6 teszi). Utána egyszer futtasd újra a kritikát. Ha még mindig Block, menj
  tovább a B5-re, és a design-review ticketben ezt jelöld ("UX-kritika: Block, egy
  automatikus javítókör után"). A döntés a kézi revieweré, több automatikus kör nincs.
- Ha a `ux-designer` nem tud lefutni (nincs Figma-hozzáférés, hiba), a B5 akkor is
  fut, és a ticketbe "UX-kritika: nem futott — <ok>" kerül. Ez nem Approve.

## B5 — Design-review ticket

- Hozz létre egy új Jira ticketet [`../dev-workflow/jira-ticket-template.md`](../dev-workflow/jira-ticket-template.md)
  "Design_review ticket" szekciója szerint: Jira issue type `design-review` (a
  `JIRA_ISSUE_TYPE_MAP` szerint), felelős `MANUAL_REVIEWER_ASSIGNEE`, kötelező "Oldalnév"
  mező (a `figma-designer` által használt pontos frame-névvel). **A `labels` mezőbe a
  sablon szerinti `CLAUDE_CREATED_LABEL` mellé kötelezően tedd bele a `config.md`
  `CLAUDE_WORK_LABEL` értékét is** — enélkül a B6 design-review-check (ami
  `labels = <CLAUDE_WORK_LABEL>` szűréssel keres) sosem találja meg ezt a saját maga által
  létrehozott ticketet, mert a `CLAUDE_CREATED_LABEL` önmagában nem elég (az csak eredetet
  jelöl, lásd `config.md` "Jira label-rendszer" szekció).
- **Kezdőállapot beállítása**: ha a `config.md` `JIRA_AUTO_INITIAL_STATUS_ON_CREATE` flag
  `true`, a Jira Automation a létrehozáskor rögtön `FIRST_REVIEW_REQUESTED_STATUS`-ra
  állítja a ticketet — csak ellenőrizd, ne hívj külön tranzíciót, csak ha mégsem történt
  meg. Ha a flag `false` (alapállapot): a ticket a workflow kezdő állapotában
  (`INITIAL_STATUS_NAME`) jön létre — a `FIRST_REVIEW_REQUESTED_STATUS`-t **két külön
  "státuszváltás" művelettel** kell elérni: előbb `In Progress`-be, onnan
  `first_review_requested`-be (nincs közvetlen `INITIAL_STATUS_NAME`→
  `first_review_requested` átmenet — lásd `config.md` "Design-review ciklus" szekció
  átmenet-gráfját).
- Linkeld az eredeti (implementációs) tickethez **és** a B4-nél létrehozott web-design
  tickethez.
- **A workflow itt megáll.** Jelezd a felhasználónak a ticket kulcsát és hogy a review
  kézi jóváhagyásra vár. 💡 Ez egy jó `/clear` pont — a review úgyis kézi, gyakran
  órák/napok múlva folytatódik (4. belépési pont), a ticket kulcsa elég a folytatáshoz.
  (**B8** design-előfutásban ez az oldalankénti megállás elmarad, lásd ott.)

## B6 — Design-review-check (4. belépési pont)

- Keresd meg a `FIRST_REVIEW_DONE_STATUS` vagy `SECOND_REVIEW_DONE_STATUS` státuszú,
  **`labels = <CLAUDE_WORK_LABEL>`** és **`labels not in (<WORKFLOW_FLAGGED_LABEL>)`**
  design-review ticket(ek)et (lásd `config.md` "Jira label-rendszer" — `codex`-nek szánt
  vagy label nélküli design-review ticketet ne vegyél figyelembe itt sem, és a flaggelt,
  `WORKFLOW_FLAGGED_LABEL`-lel félretett design-review ticketet se). Mindkét label-klóz
  **kötelező**; a `WORKFLOW_FLAGGED_LABEL`-re itt is érvényes a `config.md`-beli
  fallback-szabály (hiányzó sor → a `labels not in (...)` klóz elhagyása jelzéssel). Ha
  több is van, kérdezz rá, melyiket nézd meg, vagy dönts priority alapján, ha egyértelmű
  különbség van köztük — **kivéve** egy B8 design-előfutás után: akkor a lenti B8
  "B6 batch-kiegészítés" szerint dolgozd fel őket.
- **Elakadt design-review ticket ellenőrzés**: ezek a ticketek `MANUAL_REVIEWER_ASSIGNEE`-hez
  vannak rendelve, nem `ASSIGNEE_FOR_PICKUP`-hoz, ezért az A4 elakadt-ticket
  ellenőrzése **nem** kapja el őket. Külön JQL-lel nézd meg: van-e `design-review`
  típusú, `labels = <CLAUDE_WORK_LABEL>` **és** `labels not in (<WORKFLOW_FLAGGED_LABEL>)`
  (ugyanazzal a fallbackkel) ticket a `REPO_MAP`-ból feloldott Jira
  projektben, ami `STUCK_TICKET_THRESHOLD_DAYS`
  napnál régebb óta `In Progress`-ben (vagy bármilyen, nem `FIRST_REVIEW_REQUESTED_STATUS`/
  `FIRST_REVIEW_DONE_STATUS`/`SECOND_REVIEW_REQUESTED_STATUS`/`SECOND_REVIEW_DONE_STATUS`/
  végállapotú) státuszban ragadt — ez tipikusan kézi Jira-kattintás mellékhatása
  (pl. `second_review_requested`-ből visszaesik sima `In Progress`-be). Ha van
  találat, jelezd a felhasználónak, ne találgasd ki magadtól, mi történt vele.
- Olvasd be a reviewer Jira-kommentjeit.
- **Ha ez az első review-kör eredménye** (a ticket most vált `FIRST_REVIEW_DONE_STATUS`-ra):
  hívd meg a `figma-designer` subagentet `revise` móddal a
  kommentek alapján (ugyanazt a feloldott `figma-designer` szintet átadva, mint B4-nél),
  majd állítsd a ticketet `SECOND_REVIEW_REQUESTED_STATUS`-ra.
  - Ha a `config.md` `JIRA_WORKFLOW_HAS_DIRECT_SECOND_REVIEW_TRANSITION` flag `true`
    (vagyis felvettétek a közvetlen `first_review_done`→`second_review_requested` élt a
    Jira workflow-sémában, lásd `jira-automation-setup.md` 4. pontja): **egy**
    "státuszváltás" művelettel állítsd be közvetlenül.
  - Ha a flag `false` (alapállapot): ⚠️ **`FIRST_REVIEW_DONE_STATUS`-ból nincs közvetlen
    átmenet `SECOND_REVIEW_REQUESTED_STATUS`-ba** — ez **két hopot** igényel: előbb
    vissza `In Progress`-be, onnan tovább `SECOND_REVIEW_REQUESTED_STATUS`-ba. Ha a
    "státuszváltás" művelet az aktuális (`first_review_done`) státuszból nem
    listázza a második review átmenetet, ez **nem azt jelenti, hogy a státusz nem
    létezik** — először lépj `In Progress`-be, onnan ellenőrizd újra.
  - **A workflow itt megint megáll**, várva a második kézi review-t (mindkét esetben). 💡
    Ugyanúgy jó `/clear` pont, mint a B5 végén — a ticket kulcsa elég a folytatáshoz.
- **Ha ez már a második review-kör eredménye** (a ticket most vált
  `SECOND_REVIEW_DONE_STATUS`-ra): **nincs több automata Figma-kör** (a felhasználó terve
  szerint). Jelezd ezt a felhasználónak, és mondd el, hogy vagy kézzel javítja tovább a
  designt, vagy — ha jónak találja így — a (5) "workflow-t folytasd implementációval"
  paranccsal folytathatja.

## B8 — Design-előfutás (10. belépési pont)

> ℹ️ **Bevezetve (COCALC-398, 4.19.0)** — egy fogyasztó repó helyi bővítéséből
> visszavezetve a csomagba. Kapcsolói a `config.md` "Design-előfutás (B8)" szakaszában
> (`DESIGN_PREPASS_UNCERTAIN_CANDIDATES`, `DESIGN_PREPASS_MAX_PAGES`); hiányzó sor esetén
> a szállított alapérték (`ask`, ill. `10`) érvényes, csendben.

Az összes design-érintett ticket képernyőterve **előre, egy körben** — ahelyett, hogy
az A4 pickup ticketenként, lustán ugrana a B4-re. Hívás: "csináld meg előre az összes
képernyőtervet" (a pontos mondat a `config.md` "Indító parancsok" táblázatában). Hatókör:
a felhasználó által megadott epic / story-halmaz; ha nem adott meg, a `REPO_MAP`-ból
feloldott Jira projekt nyitott epicjei, megerősítéssel.

1. **Gyűjtés.** A [`tracker-adapter.md`](tracker-adapter.md) "keresés" műveletével keresd
   a hatókörbe eső, **`labels = <CLAUDE_WORK_LABEL>`** és **`labels not in
   (<WORKFLOW_FLAGGED_LABEL>)`** (a `config.md` fallback-szabályával) szűrésű, nem
   végállapotú, nem `web-design`/`design-review` típusú ticketeket:
   - **Biztos jelölt:** kitöltött "Oldalnév" mező, és nincs hozzá lezárt `web-design`
     vagy jóváhagyott `design-review` ticket.
   - **Bizonytalan jelölt:** nincs oldalnév, de az AC/leírás képernyőre, oldalra vagy
     UI-ra utal. A `DESIGN_PREPASS_UNCERTAIN_CANDIDATES` szerint kezeld (`ask`: külön
     listán mutasd, a felhasználó dönt és oldalnevet ad; `skip`: hagyd ki).
2. **Deduplikálás oldalnév szerint** (`PAGE_NAME_SEPARATOR` szerint normalizálva): azonos
   oldalnév = egy design; a többi ticketet a "link létrehozása" művelettel kösd a közös
   design-review tickethez.
3. **Jóváhagyási kapu.** Mutasd az oldalak számát, a hozzájuk tartozó ticketeket és a
   becsült Figma-köröket. Jóváhagyás nélkül ne hozz létre semmit. Legfeljebb
   `DESIGN_PREPASS_MAX_PAGES` oldal fut egy körben, a többi a következő körre marad.
4. **Végrehajtás, sorosan.** Oldalanként B4 → B4a → B5 a fenti szerint (a `figma-designer`
   végrehajtó-szintjét ticketenként a "Konfiguráció" szakasz szerint feloldva); a B5 végi
   megállás itt oldalanként elmarad. **Ne párhuzamosíts**: a design system közös,
   párhuzamos futás duplikált komponenseket hozna létre. Előbb az az oldal fusson,
   amelyik a legtöbb új alapelemet igényli; a többi ezeket újrahasznosítja. Egy oldal
   hibája nem állítja meg a kört: jelöld, és a végén listázd.
   A `FIGMA_TOOLS_MISSING` jelzés viszont az egész előfutást megállítja (a B4-hez
   hasonlóan), nem lép a következő oldalra.
5. **Egyetlen megállás.** Összesítő: a design-review ticketek kulcsai, oldalnevei és
   Figma-linkjei, és hogy melyik ticket ment ki. 💡 Jó `/clear` pont.

**B6 batch-kiegészítés:** ha az előfutás után több `FIRST_REVIEW_DONE_STATUS` ticket
van, a B6 ne kérdezzen rá egyenként: futtasd mindegyikre a `revise`-t és a státuszváltást,
és adj egy összesítőt. A második kör után továbbra sincs több automata Figma-kör.

**Az A-ággal:** a design nélküli ticketeket az A4 közben is felveheti. Az előfutás után
az A4 már jóváhagyott designt talál, így nem ugrik a B4-re.

## B7 — Folytatás implementációval (5. belépési pont)

- Keresd meg a hozzá tartozó, jóváhagyott design-review ticketet (vagy kérdezz rá, ha nem
  egyértelmű a kontextusból), és az ahhoz linkelt implementációs ticketet.
- Ugorj **A5**-re (branch + implementáció, [`SKILL.md`](SKILL.md)-ben) az implementációs
  tickettel — a design_review ticket "Oldalnév" mezője ekkor már ott van/propagálva van
  az implementációs ticketen is (ha nem, írd rá most, mielőtt az `implementer` subagent
  nekilátna).
