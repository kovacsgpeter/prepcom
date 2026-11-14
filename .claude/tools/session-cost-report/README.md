# session-cost-report

Utólagos, **offline** elemző eszköz: beolvassa a Claude Code egy session-jének helyben
tárolt transcriptjét (`.jsonl`), és fázisonkénti (Skill-/Agent-hívás szerinti) token- és
dollár-bontást ad, JSON + önálló HTML riport formájában.

**Ez nem a dev-workflow része, nem fut az agent-loop-ban** — nem terheli a workflow
futását egyetlen extra tokennel sem. A Claude Code már amúgy is lementi a teljes
transcriptet minden session-höz; ez a script csak utólag olvassa be és bontja szét,
amikor te kíváncsi vagy rá.

## Miért így, és miért nem a workflow-ba építve

- A futó agent nem tudja megbízhatóan lekérdezni a saját token/cost-adatait menet közben
  — nincs erre eszköze. Ha a skill "logolná" ezt, vagy találgatna (haszontalan adat),
  vagy meg kellene állnia minden fázishatáron, hogy megkérdezzen téged — ez pont az
  ellenkezője annak, amit a dev-workflow-3-0 többi optimalizációja (kevesebb megszakítás,
  kevesebb tool-kör) elér.
- A pontos token/cost-adat **már ott van** a Claude Code saját, helyi
  session-naplójában (lásd lent) — csak utólag kell kibontani belőle, nulla extra
  költségért.

## Honnan jön az adat

A Claude Code minden session-t elment ide:

```
~/.claude/projects/<projekt-útvonal-szlugosítva>/<session-id>.jsonl
```

A szlugosítás szabálya (megfigyelt minta): a projekt cwd-jében minden `:` és `\`/`/`
karakter `-`-ra cserélődik. Pl. `C:\code\my-project\sub-modul` →
`C--code-my-project-sub-modul`.

Minden sor egy JSON rekord. A script két dolgot keres bennük:
1. **`"type":"assistant"`** rekordok, amiknek van `message.usage` mezője — ez tartalmazza
   a ténylegesen elszámolt token-számokat (`input_tokens`, `output_tokens`,
   `cache_creation_input_tokens`, `cache_read_input_tokens`) és a modellt
   (`message.model`, pl. `claude-sonnet-5`). Minden ilyen rekord egy valódi,
   API-szinten elszámolt hívás — a script ezekből számol dollárt.
2. **`tool_use` blokkok `"name":"Skill"` vagy `"name":"Agent"` névvel** — ezeket
   tekinti fázishatárnak. A `Skill` hívás `input.skill` mezője (pl.
   `dev-workflow-execute`), az `Agent` hívás `input.description`/`input.subagent_type`
   mezője adja a fázis címkéjét.
3. **`tool_use` blokkok `"name":"mcp__ccd_session__mark_chapter"` névvel**
   (COCALC-215 / MEAS-1 óta) — ezeket is fázishatárnak tekinti, a `Skill`/`Agent`
   mellett. A címkét közvetlenül a hívás `input.title` mezője adja, hiányzó/sérült
   `title` esetén a script nem áll el, hanem `(névtelen fejezet)` felirattal esik
   vissza.

## Fő szál vs. subagent bontás és párhuzamos subagentek (COCALC-280 / LOCAL-3)

Minden fázis-szegmens a `report.json`-ban a mai `summary` mellett két további bontást is
kap:

- **`mainThread`** — a szegmensbe eső, `isSidechain: false` (a fő session) hívások összege.
- **`subagent`** — a szegmensbe eső, `isSidechain: true` (bármely delegált subagent saját)
  hívások összege.

A kettő token- és dollár-szinten összeadva a `summary`-t adja ki. A `report.html`
"Fő szál" és "Subagent" oszlopa ugyanezt jeleníti meg fázisonként. Ez teszi
értelmezhetővé, hogy egy fázis költsége a fő szál orchestrálásából vagy a ténylegesen
delegált munkából jön-e — az `OFFLOAD_PHASE_MATRIX` (COCALC-278) routing-döntéseihez ez az
elsődleges bemenet.

**Párhuzamos subagentek**: ha egyetlen assistant üzenet egynél több `Agent` tool-hívást
indít (párhuzamos delegálás), az időbélyeg-vödrös szegmentálás ezeket **egy** szegmensbe
vonja (mert azonos időbélyeggel nyílnak, és a subagentek sidechain-rekordjai nem
hordoznak agent-azonosítót, amivel szét lehetne őket választani). Ilyenkor a szegmens
címke-előtagja `Párhuzamos subagentek (N): …`, és a `report.json`-ban a
`phases[].parallelSubagents` mező `N` (> 1). A `subagent` bontás ezeknél az **összevont**
párhuzamos ágakat fedi — a script a parancssori kimenetben és a HTML-ben is jelzi ezt.

## `--aggregate <mappa>` — több session összesítése (COCALC-280 / LOCAL-3)

```bash
node analyze.js --aggregate "F:\dev\repos\<repo>\cost-reports"
```

Végigjárja a megadott mappa-fát, összegyűjti az összes `report.json`-t, és **fázis-címke
szerint** összesíti őket egy `aggregate.json` + `aggregate.html` párba (a `--out`
mappába, alap: `./cost-reports/aggregate/`). A fázisok a **cipelt kontextus**
(`input + cacheRead`) szerint csökkenő sorrendben kerülnek a kimenetbe — ez táplálja a
[`../../skills/dev-workflow/offload-measurements.md`](../../skills/dev-workflow/offload-measurements.md)
Claude-baseline rangsorát.

Hibatűrés:

- Hiányzó / sérült / séma-idegen (`phases[]` tömb nélküli) `report.json` **kihagyásra
  kerül**, a script nem hasal el, a kihagyottak számát és okát kiírja (`reportsSkipped`,
  `skipped[]`).
- **Üres vagy 0 feldolgozható elemű** mappánál beszédes hibaüzenettel lép ki (1-es
  kóddal), nem ír üres riportot.
- **Eltérő fázis-címke-halmazok** a session-ök között (pl. a COCALC-215 `mark_chapter`
  bevezetése előtti/utáni riportok keveredése, eltérő granularitással) → a script **nem
  fésüli össze csendben**: `labelSetConsistent: false` és egy `labelSetNote` sorolja fel,
  mely címkék szerepeltek csak a riportok egy részében.
- **Séma-verzió eltérés**: a `mainThread`/`subagent` mező nélküli (COCALC-280 előtti)
  riportokat a script "ismeretlen bontás"-ként kezeli — az adott fázis `mainThread` /
  `subagent` mezője `null` lesz, ha egyetlen riport sem hozott bontást hozzá, **nem**
  nullázott összeg; a `breakdownCoverage` mutatja, hány riport tartalmazott bontást.

> ⚠️ Az `--aggregate` **nem verziózott baseline-store** — minden futás a talált
> `report.json`-ok pillanatképét összesíti, történeti nyilvántartás nélkül. Lásd
> `dev-workflow/offload-measurements.md` "Ismert korlát".

## Hogyan szegmentál fázisokra — és mi a korlátja

A script **időrendben egyesíti** az összes assistant-hívást (a fő szálét és bármilyen
subagent/sidechain-ét is, ha van), és mindegyiket ahhoz a legutóbbi Skill/Agent/
mark_chapter-markerhez sorolja, ami előtte történt. Ez azt jelenti:

- **A teljes (`total`) összeg mindig 100%-ban pontos** — ez egyszerű összegzés, nincs
  benne heurisztika.
- **A fázisbontás annyira pontos, amennyire a workflow ténylegesen külön Skill/Agent/
  mark_chapter hívásokra tagolja magát.** A dev-workflow-3-0 csomagban ez elég jól
  illeszkedik a gyakorlatban fontos egységekhez: minden `dev-workflow-*` skill-indítás,
  minden `implementer`/`qa-tester`/`code-reviewer`/`figma-designer` subagent-hívás, és
  (COCALC-215 óta) a `SKILL.md`-kbe írt `mark_chapter`-hívások is külön szegmensként
  jelennek meg — ez utóbbi finomítja a fentebb említett korlátot, mert egy Skill-hívás
  *belüli* lépéseket (pl. `execute/SKILL.md` A4 pickup vs. A5 branch) is külön
  szegmensre bont, ha a lépés eleje meghívja a `mark_chapter` tool-t.
- **Lépés-szintű címke-konvenció (`mark_chapter`)**: a workflow skill-lépései a
  `<skill-név> / <lépés-azonosító> — <rövid cím>` formátumú címkével jelölik magukat
  (pl. `dev-workflow-execute / A4 — Pickup`), ez kerül a `mark_chapter` hívás
  `input.title` mezőjébe. Ha egy skill-lépés valamiért nem hívja meg a `mark_chapter`-t
  (a tool nem elérhető, vagy a lépés ezt szándékosan kihagyja), az adott munka a
  legutóbbi korábbi markerhez (vagy a "session eleje" bucket-hez) sorolódik — ez nem
  hiba, csak durvább bontást ad az adott szakaszra.
- **Amit NEM lát**: olyan finomságú lépéshatárokat, amikhez nincs se Skill/Agent-hívás,
  se `mark_chapter`-jelölés (pl. egy SKILL.md-lépésen belüli, tovább nem jelölt
  al-lépés). Ha ennél is finomabb bontás kell, a `PHASE_TOOL_NAMES` és a marker-logika
  tovább bővíthető az `analyze.js`-ben (pl. szövegmintázat-keresés az asszisztens
  válaszaiban), de ez már kevésbé megbízható, mert a modell prózájára támaszkodna.

## Elvárt vs. tényleges modell (COCALC-273, MEAS-2)

Ha egy `Agent` tool-hívás `input`-ja tartalmaz egy `model` mezőt (a
`dev-workflow-execute/SKILL.md` A5a lépése ezt adja át hívásidejűleg, a
`COMPLEXITY_EXECUTOR_MAP` szerint feloldott `EXECUTOR_LADDER`-szintként, lásd
`../../skills/dev-workflow/config.md` "Komplexitás → végrehajtó-szint routing"
szekció), a script a szegmensbe eső **sidechain** (a subagent saját) rekordok tényleges
modelljét összeveti ezzel az elvárt aliassal (substring-egyezés, mert az alias — pl.
`sonnet` — és a tényleges API modell-id — pl. `claude-sonnet-5` — nem szó szerint
egyezik). Az eredmény minden fázis-szegmensnél megjelenik:

- `report.json` `phases[].modelCheck` mezőjében (`status`: `"match"` / `"mismatch"` /
  `"not-checkable"`, `expected`, `actual`), és
- `report.html` "Modell-egyezés" oszlopában.

**Ez sosem állítja meg a futást** — ha egy `Agent`-hívásnak nincs `model` mezője (régebbi
session, vagy olyan hívás, ami nem a COMPLEXITY_EXECUTOR_MAP-ből jön), a `modelCheck`
egyszerűen `null`; ha van elvárt modell, de a szegmensben nincs sidechain-rekord, a
státusz `"not-checkable"` — egyik eset sem hiba, csak azt jelenti, hogy abból a
session-ből nem dönthető el az egyezés. A parancssori kimenet egy összesítő
figyelmeztetést ír ki, ha van legalább egy `"mismatch"` szegmens.

## Subagent-naplók, streaming-duplikátumok, modellárak (ORD-366)

- **Subagent-naplók.** A fő naplóval (`<session-id>.jsonl`) együtt a script beolvassa a
  `<session-id>/subagents/*.jsonl` fájlokat is (a Claude Code itt tárolja a delegált
  subagentek saját hívásait). Ezek rekordjai mindig subagent-hívásnak számítanak. Az
  `agent-<id>.meta.json` (ha van) adja a subagent típusát (`agentType`) és rövid leírását
  (`description`); csak ez a két címke és a számok kerülnek a riportba, a napló tartalma
  (prompt, kód) nem. A `report.json` új mezői: `mainThreadTotal`, `subagentTotal`,
  `subagents[]` (subagentenként hívásszám és költség), `subagentLogsFound`.
- **Streaming-duplikátumok.** A streamelt válasz több naplósorban jelenik meg ugyanazzal a
  `message.id`-vel és `requestId`-val. Ezek egy hívásnak számítanak (a legtöbb output tokent
  hordozó, azaz a végső sor usage-a számít); az eldobott sorok számát a
  `duplicatesDropped` mutatja. A `<synthetic>` modellű rekord nem API-hívás, kimarad.
- **Modellárak.** A `pricing.json` `models` kulcsai a naplóban szereplő pontos modell-id-k
  (`claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-fable-5-1`, ...);
  ha a pontos id hiányzik, a `families` (opus / sonnet / haiku / fable) alapján, a modell-id
  családneve szerint számol. Csak a ténylegesen ismeretlen család megy az
  `unknownModelFallback` árra, és ezt a riport jelzi (`unknownModels`, parancssori
  figyelmeztetés, figyelmeztető sáv a HTML-ben), nem csendben számol.
- **CommonJS.** Az `analyze.js` CommonJS; a mappában lévő `package.json` (`"type":
  "commonjs"`) miatt akkor is fut, ha a hívó repó gyökér `package.json`-ja `"type":
  "module"`. Ezt a fájlt ne töröld.

Önteszt (a CI `session-cost-report-test` jobja is ezt futtatja): `node
.claude/tools/session-cost-report/analyze.test.js`.

## Az árak megbízhatósága

A `pricing.json` tartalmazza a modellenkénti $/millió token árakat: az Anthropic első féltől
származó API-árait (globális routing), az 5 perces (`cacheWrite`) és az 1 órás
(`cacheWrite1h`) cache-írást külön, a Claude Haiku 5.5-nél a 100 000 token fölötti
promptok magasabb árát is (`longContext`). A forrás a `source` mezőben, az ellenőrzés napja
a `verifiedDate`-ben van (`"verified": true`). A költségszámítás közös modulja a `pricing.js` (`analyze.js` és a futási-metrika gyűjtő is ezt használja): a `usage.cache_creation` 5 perces / 1 órás bontását külön áron számolja (bontás hiányában mindet `cacheWrite` áron), és a `longContext` blokkal rendelkező modellnél a küszöb fölötti promptot a `longContext` árral. Ha `"verified": false`, a script minden
futásnál figyelmeztet, és a HTML riport tetején is megjelenik a figyelmeztető sáv.

Árváltozáskor (új modell, árcsökkentés):

1. Ellenőrizd a tényleges árakat a [pricing oldalon](https://platform.claude.com/docs/en/about-claude/pricing),
   vagy a szervezet admin-paneljén (egyedi szerződés esetén ez a mérvadó).
2. Írd át a `pricing.json` `models` és `families` szekcióját.
3. Frissítsd a `verifiedDate`-et (vagy állítsd `"verified": false`-ra, ha nem ellenőrizted).

A **token-számok** (input/output/cache-write/cache-read) ettől függetlenül mindig
pontosak — azok közvetlenül a Claude Code saját naplójából jönnek, nincs bennük
becslés.

## Használat

```bash
# Az aktuális projekt (a jelenlegi mappa) legutóbb módosított session-je
node analyze.js

# Konkrét session-fájl
node analyze.js --session "C:\Users\<te>\.claude\projects\<projekt-slug>\<session-id>.jsonl"

# Másik projekt legutóbbi session-je
node analyze.js --project "F:\dev\repos\<repo>"

# Kimeneti mappa megadása (alap: ./cost-reports/<session-id>/)
node analyze.js --out "F:\dev\repos\<repo>\tools\session-cost-report\reports\2026-08-19"

# Több korábbi report.json fázis-címke szerinti összesítése (lásd "--aggregate" fent)
node analyze.js --aggregate "F:\dev\repos\<repo>\cost-reports"
```

Node.js kell hozzá (18+ elég, semmilyen npm-csomagot nem igényel — tiszta Node core
modulokkal íródott). A kimenet két fájl: `report.json` (gépi feldolgozáshoz) és
`report.html` (nyisd meg böngészőben — önálló, offline fájl, nincs benne külső
hivatkozás).

## Skill-wrapper

A [`../../skills/session-cost-report/SKILL.md`](../../skills/session-cost-report/SKILL.md)
egy vékony wrapper, hogy természetes mondattal is elindítható legyen ("mennyibe kerültek
eddig az egyes fázisok ebben a session-ben?") — Claude ilyenkor a Bash tool-lal futtatja
le ezt a scriptet, és megnyitja/összefoglalja a HTML riportot.
