---
name: changelog
description: >
  A CHANGELOG.md következő szakaszának megfogalmazása és a fájl tetejére szúrása,
  egyetlen LLM-körben, a changelog-adatgyűjtő szkript (collect.js) offline JSON-jából.
  Használd, ha a felhasználó azt kéri, hogy "generálj changelogot", "mi készült el a
  legutóbbi kiadás óta", "állítsd össze a CHANGELOG új szakaszát", "írd meg a
  changelog-bejegyzést a legutóbbi release-hez", "frissítsd a CHANGELOG.md-t a
  legutóbbi verzió óta". Nem futtat semmit a dev-workflow-execute pipeline-ból —
  kizárólag a collect.js kimenetét fogalmazza emberi szöveggé, és jóváhagyás után
  szúrja be a CHANGELOG.md-be.
---

# changelog — önállóan hívható belépési pont

Ez egy **offline changelog-fogalmazó eszköz**, nem a dev-workflow-execute pipeline
része. A bemeneti adatot a `../../tools/changelog/collect.js` adatgyűjtő szkript
állítja elő (két release/tag közötti merge-elt MR-ek, jelleg szerint csoportosított
JSON) — **olvasd be a
[`../../tools/changelog/README.md`](../../tools/changelog/README.md)-t, mielőtt
futtatnád a szkriptet**, hogy pontosan tudd a JSON-sémát, a kilépőkódokat és az
üres-tartomány viselkedést.

> ℹ️ **A `CHANGELOG.md` a dev-workflow *csomag* naplója** (semver `## [x.y.z]`
> szakaszok, a repo-gyökér `VERSION` mellett — lásd `dev-workflow-manifest.json`).
> Nincs külön termék-changelog: a `collect.js` a COCALC-243 óta már a manifest
> `versioned` halmazára szűri a bevont MR-eket (a `repo_local_exceptions` és a nem
> csomag-részt érintő MR-ek kiesnek, `excludedNonVersioned`-be kerülnek), így a
> beszúrandó szakasz eleve csak csomag-hatókörű tételeket tartalmaz. Ez a skill
> **nem** módosítja a fájl fejlécét (bevezető + "Mi számít MAJOR változásnak"),
> csak beszúr a tetejére.

## Futtatás

### 1. Tartomány meghatározása

- Ha a felhasználó explicit tartományt/kezdőpontot ad meg (pl. "a `v1.2.0` óta", "a
  `v1.2.0` és `v1.3.0` között", "ettől a committól"), add tovább a szkriptnek
  `--from <ref>` és/vagy `--to <ref>` kapcsolóként.
- Ha nem ad meg semmit, ne adj kapcsolót — a `collect.js` maga oldja fel a
  release-tartományt (`git tag -l 'v*'` alapján: ≥2 tag → előző..utolsó; 1 tag →
  repo-gyökér..tag; 0 tag → repo-gyökér..HEAD).

### 2. Az adatgyűjtő szkript futtatása

Bash tool-lal, a JSON-t ideiglenes fájlba írva (a scratchpad mappádba):

```
node "<a dev-workflow csomag tools/changelog mappájának abszolút útja>/collect.js" [--from <ref>] [--to <ref>] --out <scratchpad>/changelog-data.json
```

A `CHANGELOG_MODE` és a `CHANGELOG_STYLE` értékét **a szkript maga** olvassa a
`config.md`-ből — te ezeket ne add át kapcsolóként, és ne állítsd.

### 3. Kilépőkód kezelése

- `0` → folytasd a 4. lépéssel.
- `1` → a git vagy a `glab` hívás használhatatlan hibát adott. **Ne találgass**:
  mutasd meg a felhasználónak a szkript nyers stderr-kimenetét, és állj meg. Ne írj a
  `CHANGELOG.md`-be.

### 4. A JSON beolvasása és az üres-tartomány ág

Olvasd be az `--out` fájlt. Ha **`mrCount: 0`** (ilyenkor mind a 6 `groups` kulcs üres
tömb, és a szkript egy stderr-sort is adott — vagy nincs merge-commit-alapú MR a
tartományban [squash/ff-merge], vagy volt, de **mind kiesett a csomag-határ
útvonal-szűrésén** [COCALC-243], lásd `excludedNonVersioned`):

- Szólj a felhasználónak: nincs a csomag-naplóba tartozó változás a megadott
  tartományban, ezért **nem** generálsz és **nem** írsz szakaszt a `CHANGELOG.md`-be.
  Idézd a szkript stderr-üzenetét is (abból derül ki, melyik ág miatt üres).
- **Itt állj meg** — ne hozz létre üres blokkot, ne módosítsd a fájlt.

### 5. A verziószám és a dátum feloldása (a fejléchez)

- **Verziószám**:
  - Ha a JSON `range.to` mezője egy `v`-vel kezdődő verziócímke (nem `HEAD`, nem
    40-hexes commit-SHA) → az a címke, a `v` prefix levágva (pl. `v1.3.0` → `1.3.0`).
  - Egyébként (nincs feloldható tag; jellemzően `range.fromKind: "root"`, vagy
    `range.to` az `HEAD`) → a **repo-gyökér `VERSION` fájljának tartalma**.
  - **Ne** kérdezd meg interaktívan a verziót.
- **Dátum**: a JSON `generatedAt` mezőjének dátumrésze, `YYYY-MM-DD` formában.

> ℹ️ **Ismert korlát a `range.to` felismerésénél.** A `collect.js` JSON **nem ad
> `toKind` mezőt**, ezért a fenti döntés string-heurisztika (`v` prefix, nem `HEAD`,
> nem 40-hexes SHA). Az **alapút biztonságos** — a `collect.js` `resolveRange`-e
> tag hiányában is mindig `v*` taget vagy `HEAD`-et ad. Kockázat csak **explicit
> `--to <ref>`** esetén van: egy `v`-vel kezdődő branch- vagy ref-név fals pozitív
> lehet. Ilyenkor — ha a `--to` értéke nem egyértelműen `v<szám>.<szám>...` alakú
> verziócímke — ess vissza a repo-gyökér `VERSION` fájljára (vagy, ha ez sem
> egyértelmű, kérdezd meg a felhasználótól a verziót).

### 6. A szakasz megfogalmazása — egyetlen LLM-körben

A beolvasott JSON `groups` objektumából **egyetlen menetben**, az összes tételt együtt
feldolgozva fogalmazd meg a teljes szakaszt. **Ne** hívd a szkriptet vagy bármi mást
MR-enként/ticketenként külön — a `groups` már minden adatot tartalmaz.

A `groups` a `collect.js` útvonal-szűrése (COCALC-243) után már **csak
csomag-hatókörű** (a `dev-workflow-manifest.json` `versioned` halmazát érintő)
MR-eket tartalmaz. Az `excludedNonVersioned` tömb tételeit **ne** vedd be a
szakaszba — azok szándékosan kimaradtak (repo-lokális / alkalmazáskód-változás).

**A szakasz szerkezete:**

- Fejléc: `## [<verzió>] - <YYYY-MM-DD>` (az 5. lépés szerint feloldva).
- Törzs: **jelleg szerinti csoportosítás**, ebben a fix sorrendben, az üres csoportokat
  kihagyva: `feature`, `fix`, `build`, `refactoring`, `chore`, `egyéb`. A csoport-
  címkék nyelvét/formáját a `CHANGELOG_STYLE` prompt (7. lépés) adja meg.
- **Minden tétel mögött** ott a ticketkulcs és/vagy az MR-link, hogy visszakereshető
  legyen:
  - `ticketKey` megvan → a mondat végén zárójelben a ticketkulcs (`<PROJECT>-XXX`) **és**
    az MR-link: `... (<PROJECT>-XXX, [MR](<mr.url>))`.
  - `ticketKey: null` (az `egyéb` csoport tételei) → csak az MR-link:
    `... ([MR](<mr.url>))`.
  - Ha egy MR-objektumban van `ticketTitle` (`enriched`/`standalone` mód), azt
    felhasználhatod a pontosabb megfogalmazáshoz, de a mondat hangvételét továbbra is
    a `CHANGELOG_STYLE` prompt szabja meg.
- Ha a JSON-ban `jiraFallback: true` szerepel, a záró visszajelzésben (10. lépés)
  említsd meg, hogy a Jira-dúsítás nem sikerült, ezért a tételek a branch-névből /
  MR-címből készültek.

### 7. A CHANGELOG_STYLE szerinti prompt kiválasztása

Olvasd ki a `config.md` **`### CHANGELOG_STYLE`** dedikált szekciójából az értéket.
Ismeretlen/hiányzó érték → ess vissza `hu-dev`-re, és jelezd egy sorban a
felhasználónak. Ezután a lenti három promptblokk közül **szó szerint** alkalmazd a
megfelelőt a 6. lépés megfogalmazására — ezek **külön-külön megfogalmazott, statikus
utasítások**, nem egymás fordításai, és nem futásidejű improvizáció.

### 8. Beszúrási pont a CHANGELOG.md-ben

Nyisd meg a repo-gyökér `CHANGELOG.md`-t, és keresd meg az **első** olyan sort, ami
`## [` -tal kezdődik (ez az első meglévő verziószakasz). Az új szakasz **közvetlenül
ez elé** kerül, egy üres sorral elválasztva. Így a bevezető és a "## Mi számít MAJOR
változásnak" blokk sértetlen marad felül, és minden korábbi szakasz is érintetlen.

Ha egyetlen `## [` szakasz sincs a fájlban (üres napló), az új szakasz a
**"## Mi számít MAJOR változásnak" szekció teljes törzse után** kerül, egy üres
sorral elválasztva (ez a jelenlegi fájlban gyakorlatilag a fájl vége).

**Duplikált verzió-fejléc guard.** Mielőtt továbblépnél a jóváhagyásra (9. lépés),
keress a `CHANGELOG.md`-ben a most generált szakasz verziószámával azonos
`## [<verzió>]` kezdetű sort. Ha **van** ilyen, ne szúrj be némán — jelezd a
felhasználónak, hogy a `## [<verzió>]` szakasz már létezik, és kérdezd meg explicit,
melyik legyen:

- (a) megszakítás fájlmódosítás nélkül,
- (b) a meglévő `## [<verzió>]` szakasz cseréje az újonnan generáltra,
- (c) mégis beszúrás a meglévő szakasz elé (tudatos duplikátum).

Csak a válasz szerint folytasd — `(a)` esetén állj le a 9-10. lépés kihagyásával.

### 9. Jóváhagyás a fájlba írás előtt

**Mielőtt** bármit írnál a `CHANGELOG.md`-be, mutasd meg a felhasználónak:

- a teljes generált szakaszt (Markdown-blokként),
- hova kerülne (pl. "az első `## [4.3.0]` sor elé").

Kérj explicit jóváhagyást. Csak jóváhagyás után `Edit`-eld a `CHANGELOG.md`-t.
Elutasításnál ne írj — kérdezd meg, mit igazítsál (hangvétel, csoportosítás, egy-egy
tétel szövege), és a javított szakasszal kérj újra jóváhagyást.

### 10. Visszajelzés a felhasználónak

Röviden: melyik tartományra futott (`range.from`..`range.to`), hány MR-t dolgozott
fel (`mrCount`), melyik `CHANGELOG_STYLE`-lal, milyen verzió/dátum fejléccel, és hova
szúrta be. Ha `jiraFallback: true` volt, azt is jelezd. Ha az `excludedNonVersioned`
nem üres, említsd meg, hány MR maradt ki a csomag-határ szűrésén (nem csomag-hatókörű).

## CHANGELOG_STYLE promptok (statikus)

### `hu-dev` prompt

> Magyar nyelv, fejlesztői hangvétel. Minden tételt egy tömör, kijelentő magyar
> mondattal írj le, ami a lehető legközelebb marad a Jira ticket címéhez / a
> branch-név 3 szavas összefoglalójához / az MR-címhez — **tömöríts, ne értelmezz
> újra** (ez minimalizálja a hallucináció esélyét). Ne találj ki olyan hatást vagy
> részletet, ami nincs a bemeneti adatban. A csoport-alcímek magyarul, ` ### `
> szinten: `feature` → **Új funkciók**, `fix` → **Javítások**, `build` →
> **Build és CI**, `refactoring` → **Refaktor**, `chore` → **Karbantartás**,
> `egyéb` → **Besorolatlan**. Ne használj Keep a Changelog angol szekciócímeket.
> Minden tétel `-` listaelem, a mondat végén a 6. lépés szerinti zárójeles
> ticketkulcs + MR-link.

### `hu-user` prompt

> Magyar nyelv, a **végfelhasználó** szemszögéből újrafogalmazva, technikai zsargon
> nélkül. A kérdés, amire minden mondat válaszol: „mit vesz észre ebből a
> felhasználó?" A tisztán belső változásokat (`build`, `refactoring`, `chore`, és a
> felhasználó számára láthatatlan `fix`-ek) **vond össze** egyetlen összefoglaló
> mondatba csoportonként, vagy hagyd el, ha nincs felhasználói hatásuk — ne sorold
> fel tételesen. A `feature` és a felhasználó által érzékelhető `fix` tételek
> maradjanak külön, de közérthetően megfogalmazva. A csoport-alcímek magyarul,
> ` ### ` szinten: `feature` → **Újdonságok**, `fix` → **Javítottuk**, a belső
> csoportok egy közös **A motorháztető alatt** alcím alá. Minden tétel `-`
> listaelem; a visszakereshetőség végett a 6. lépés szerinti zárójeles ticketkulcs +
> MR-link az összevont mondatok végén is szerepeljen (több hivatkozás vesszővel
> elválasztva).

### `en-standard` prompt

> English language, [Keep a Changelog](https://keepachangelog.com/) tone and
> section names. Map the nature groups to Keep a Changelog sections (` ### `
> level): `feature` → **Added**, `fix` → **Fixed**, `refactoring` → **Changed**,
> `chore` → **Changed**, `build` → **Changed** (or a dedicated **Build** section if
> the project already uses one), `egyéb` → **Changed**. Merge entries that fall into
> the same section under one heading, preserving their original order. Each entry is
> a `-` bullet; keep the sentence close to the ticket title / branch summary / MR
> title (translate, do not reinterpret or invent impact). End every bullet with the
> parenthesised ticket key + MR link per step 6.

## Automatizált teszt

Ez a skill egyetlen Markdown prompt, futtatható logika nélkül — nincs értelmes
unit-teszt hozzá. A tényleges kód (`collect.js`) saját teszt-suite-ja külön él:
`node "<a dev-workflow csomag tools/changelog mappájának abszolút útja>/collect.test.js"`.
