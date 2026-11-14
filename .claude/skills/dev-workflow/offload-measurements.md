# Offload-mérőműszer — fázis-rangsor, golden-set keret és élesedési küszöbök

> Bevezetve: **COCALC-280 (LOCAL-3)**. Ez a fájl az `OFFLOAD_PROFILE` (COCALC-278) keret
> **mérési módszertana és baseline-je** — nem hot-path olvasmány, egyetlen skill sem
> olvassa be automatikusan. Akkor nézd meg, ha egy `OFFLOAD_PROFILE`/`OFFLOAD_AUTO_PROMOTE`
> döntést kell alátámasztani vagy rekonstruálni.

## Miért a műszer készült el, nem az éles kör

Lásd a részletes indoklást a [`history.md`](history.md) "Offload-mérőműszer az éles kör
helyett (2026-08-26)" bejegyzésében. Röviden: (1) nincs futó lokál LLM-végpont, amin a
`repo-scanner` `local` szintje ténylegesen kiértékelhető lenne; (2) egy értelmes golden
set nagyobb kódbázist kíván, mint a wordcloud. Ezért ez a ticket a **keretet** (fázis-
rangsor mérése, golden-set séma, élesedési küszöbök, önpromóció) szállította, a tényleges
golden-set tartalom feltöltése és az éles kör külön, későbbi munka.

## A két mérőeszköz

| Eszköz | Mit mér | Kimenet |
|---|---|---|
| [`../../tools/session-cost-report/analyze.js`](../../tools/session-cost-report/analyze.js) `--aggregate` | Fázisonként **cipelt kontextus** (`input + cacheRead` token) több session `report.json`-jából összesítve | `aggregate.json` + `aggregate.html`, fázisok cipelt kontextus szerint csökkenő sorrendben |
| [`scripts/compare-scan-quality.sh`](scripts/compare-scan-quality.sh) | Egy golden set és egy tényleges `repo-scanner`-kimenet közti **recall / precision / érvénytelen-fájlút-szám** | egy JSON sor + `pass`/`fail` verdikt (a `OFFLOAD_ACCEPTANCE_*` küszöbök szerint) |

## Claude-baseline fázis-rangsor (cipelt kontextus szerint)

Az `OFFLOAD_PHASE_MATRIX` (COCALC-278) mind az 5 routolható fázisára, a mai
Claude-on-futó (nem offloadolt) viselkedés baseline-je, a fázis természetéből adódó
**cipelt kontextus** szerint rendezve (a legtöbbet cipelőtől a legkevesebbig — minél
több a cipelt kontextus, annál drágább egy fázist erősebb modellen tartani, és annál
nagyobb a nyeresége egy sikeres offloadnak):

| # | Fázis | Cipelt kontextus (baseline, jelleg) | Miért itt van a rangsorban |
|---|---|---|---|
| 1 | `implementer` | **magas** | Teljes érintett fájlok beolvasása + diff-kontextus + tesztfájlok; iteratív TDD-körök halmozzák a cache-read-et. |
| 2 | `code-reviewer` | **magas** | A teljes MR-diff + a környező, nem változott kód beolvasása a review-hoz; hasonló nagyságrend, mint az `implementer`. |
| 3 | `repo-scanner` | **közepes** | Célzott `Grep`/`Glob` + a találati fájlok részleges beolvasása; párhuzamos példányoknál példányonként közepes, összegezve nő. |
| 4 | `qa-tester` | **közepes–alacsony** | Böngésző-interakció + a teszt-scenárió leírása; kevesebb forrásfájl-beolvasás, mint a kód-fázisoknál. |
| 5 | `figma-designer` | **alacsony** | Figma MCP-hívások strukturált válaszai + a cél-komponens; a legkevesebb repo-kód-kontextus. ⛔ Offload amúgy is kizárt (Figma MCP-t vezérel). |

> ⚠️ **A fenti oszlop "jelleg" szintű, nem valós session-mérésből származó szám.** A repóban
> ma **nincs** `cost-reports/` mappa valós `report.json`-okkal, amit az `--aggregate`
> összesíthetne. A rangsor a fázisok ismert munkaprofiljából adódik; a konkrét
> token-számok felvétele az első valós, `analyze.js`-szel elemzett session-ök után
> lehetséges (lásd "Frissítés" lent). A rendezési mechanizmus (`carriedContext =
> input + cacheRead`, csökkenő) fixture-rel igazolt — lásd a lenti bemutató példát.

### Bemutató példa (fixture-alapú, a mechanizmus igazolására)

A `analyze.js` fixture-mappáján futtatva
(`node analyze.js --aggregate .claude/tools/session-cost-report/fixtures/aggregate`) a
kimenet fázisai a cipelt kontextus szerint csökkenő sorrendben állnak:

| Fázis-címke | Cipelt kontextus (`input + cacheRead`) | Riport db |
|---|---|---|
| `Agent: implementer` | 28 000 | 1 |
| `Skill: dev-workflow-execute` | 9 000 | 2 |
| `Agent: qa-tester` | 7 000 | 1 |

Ez csak a rendezés és az összesítés helyességét demonstrálja — nem éles baseline-adat.

## Golden-set élesedési küszöbök

A `compare-scan-quality.sh` a golden set és a `repo-scanner`-kimenet közti egyezést
méri. A `pass`/`fail` verdikt a [`config.md`](config.md) "OFFLOAD_ACCEPTANCE_* és
OFFLOAD_AUTO_PROMOTE" szekció küszöbei szerint:

- `OFFLOAD_ACCEPTANCE_RECALL` (alap `0.8`) — e recall alatt `fail`.
- `OFFLOAD_ACCEPTANCE_MAX_INVALID_PATHS` (alap `0`) — ennél több érvénytelen (nem létező /
  rossz formátumú) fájlút esetén `fail`, a recalltól függetlenül.

**A küszöb-aszimmetria** (miért 0.8 a recallra, de 0 az érvénytelen utakra): egy hiányzó
leletet a hívó fő szál szintézise még pótolhat (több felderítő válaszát összeveti, a
ticket-kontextusból kiegészít); egy hamis fájlút viszont csendben félrevisz. A teljes
indoklás a `config.md` hivatkozott szekciójában.

**`OFFLOAD_AUTO_PROMOTE`** — `pass` esetén: `off` hallgat; `suggest` (alap) kiírja a
javasolt `OFFLOAD_PROFILE` értéket, de fájlt nem ír; `auto` átírja a `config.md`
`OFFLOAD_PROFILE` sorát a következő létra-fokra, **de csak ha az még `off`** — különben a
szándékos kézi beállítást tiszteletben tartva figyelmeztet és megáll (3-as kilépőkód).

## Ismert korlátok

### A `compare-scan-quality.sh` acceptance verdiktje: a **precision nincs kapuzva**

Az `acceptance` (`pass`/`fail`) döntés **kizárólag** a recallt (`OFFLOAD_ACCEPTANCE_RECALL`)
és az érvénytelen-fájlút-számot (`OFFLOAD_ACCEPTANCE_MAX_INVALID_PATHS`) nézi. A **precision
nincs kapuzva**: egy olyan `repo-scanner`-kimenet, ami sok *létező, de a feladathoz
irreleváns* fájlt is feljelent (alacsony precision), **0 érvénytelen út** és **küszöb feletti
recall** mellett `pass`-t kap — az irreleváns túljelentés így **láthatatlan** az élesedési
döntésnek. Ez tudatos: az érvénytelen (hallucinált) út a veszélyes jel (0 tűrés), a
létező-de-irreleváns túljelentést a hívó fő szál szintézise még kiszűrheti. A
`compare-scan-quality.sh` 0.5 alatti precision + `pass` esetén stderr-figyelmeztetést ad,
de ez **nem** befolyásolja a kilépőkódot. Ha a precisiont is kapuzni kell, az külön kapcsoló
(pl. `OFFLOAD_ACCEPTANCE_PRECISION`) bevezetése — ez a ticket nem teszi meg.

### Az `--aggregate` nem verziózott baseline-store

Az `analyze.js --aggregate` **minden futáskor a talált `report.json`-ok aktuális
pillanatképét** összesíti egy `aggregate.json`-ba. Nincs benne:

- **történeti nyilvántartás** — nem tudja, mi volt a baseline egy hete, nem képez idősort;
- **verziózás** — a kimenet felülíródik, a korábbi `aggregate.json` elvész, ha nem
  mented el kézzel;
- **bemenet-rögzítés** — ha közben új session-ök `report.json`-jai kerülnek a mappába
  (vagy régiek törlődnek), a következő futás már más számot ad, jelzés nélkül.

Ha verziózott, összehasonlítható baseline-idősor kell (pl. "romlott-e a helyi modell
felderítési minősége három hét alatt"), azt **külön kell felépíteni**: a releváns
`aggregate.json`-okat dátumozva, commitolva vagy egy dedikált store-ba menteni. Ez a
műszer erre nem alkalmas, és ezt a ticket (COCALC-280) tudatosan nem is oldja meg.

## Frissítés (amikor lesz valós session-adat)

1. Futtass néhány valós `dev-workflow-execute` kört, mindegyik után:
   `node .claude/tools/session-cost-report/analyze.js` (kiír egy
   `cost-reports/<session-id>/report.json`-t).
2. `node .claude/tools/session-cost-report/analyze.js --aggregate cost-reports` — az
   `aggregate.json` fázisai cipelt kontextus szerint rendezve.
3. Írd át a fenti "Claude-baseline fázis-rangsor" táblát a valós számokkal, és cseréld a
   "jelleg" oszlopot konkrét token-nagyságrendekre.
4. A golden set(ek) felvételéhez lásd [`golden-sets/README.md`](golden-sets/README.md).
