# ux-designer — újratervezési módszertan (redesign mód)

Ezt a fájlt a [`../../agents/ux-designer.md`](../../agents/ux-designer.md) `redesign`
módja olvassa be. A cél egy olyan új flow és képernyőkészlet, ami (1) bizonyítottan
jobb a jelenleginél, és (2) a lehető legnagyobb részben a meglévő kódra épül: a
komponensek publikus felületére, a service-ekre és a backend-API-ra. Így az
implementáció zöme sablon- és stílusmunka (T0) marad.

## Változási szintek (a `ui-contract.js` definíciója szerint)

| Szint | Mit jelent | Ticket-keret (`UI-változás kerete`) |
|---|---|---|
| **T0** | Csak sablon és stílus: `*.html`, `*.scss`, asset, komponens-metaadat (`imports`). Meglévő publikus tagra köt. | `template-only` |
| **T1** | Vékony TS: új prezentációs tag (getter, UI-állapot mező, metódus) inject nélkül, új prezentációs komponens, útvonal-változás, csak szöveg-literál. | `thin-ts` |
| **T2** | FE-logika: meglévő tag módosul vagy törlődik, új service-függés, service-, modell- vagy segéd-TS, új függőség. | `logic` |
| **T3** | Backend vagy API változás. | `free` |

A szintet a `check-budget` az implementáció után gépileg ellenőrzi, ezért a spec-ben
rögzített szintnek valósnak kell lennie, nem kívánságnak.

## 1. Bemenetek összegyűjtése

- A legutóbbi audit-riport: találatok (`UX-nn`), flow-térkép, ami jól működik.
- A UI-szerződés (`ui-contract.js extract`).
- A design-elvek (`UX_DESIGN_PRINCIPLES_FILE`).
- A felhasználó céljai és korlátai. Ha a hívó nem adta át, ezeket kérd el, és ne
  találd ki őket:
  - **Fő feladat (JTBD)**: "Amikor …, szeretném …, hogy …" — fő szereplőnként egy.
  - **Siker-mérce**: mit mérnénk (pl. az első kész eredményig eltelt idő, a lépések
    száma, a befejezési arány).
  - **Ami nem változhat**: üzleti szabály, jogi szöveg, fizetési lépés stb.
  - **Preferált keret**: `template-only` / `thin-ts` / `logic` / `free`. Ha nincs
    megadva, a `UI_CHANGE_BUDGET_DEFAULT` érvényes, de a tervezés **akkor is** T0-ra
    optimalizál.

## 2. Jelenlegi flow

Vedd át az audit flow-térképét (mermaid). Minden csomópont egy útvonal vagy állapot,
minden él egy felhasználói akció. A fájdalompontokat `UX-nn` hivatkozással jelöld.
Számold meg a fő feladat lépéseit: ez a kiinduló mérőszám.

## 3. Célflow

Tervezési elvek, ebben a sorrendben:

1. **Első érték gyorsan.** A fő feladathoz vezető kötelező lépések száma csökkenjen.
   Ami elhalasztható (beállítás, regisztráció, testreszabás), az kerüljön az első
   eredmény utánra (progresszív feltárás).
2. **Egy elsődleges akció képernyőnként.** A többi akció másodlagos vizuális súlyt kap.
3. **Hibamegelőzés és helyreállítás**: a gyakori hibát a felület előzze meg, a ritkából
   veszteség nélkül lehessen visszajönni.
4. **Csúcs és vég**: a flow csúcspontja (pl. az eredmény megjelenése) és vége (letöltés,
   megosztás) legyen a legcsiszoltabb pont.

Kimenet: a célflow mermaid-diagramja, és egy **változáslista** a jelenlegihez képest
(összevont, szétválasztott, megszűnő és új képernyők, áthelyezett lépések). Minden tétel
mellett: melyik `UX-nn` találatot vagy design-elvet oldja meg, és a lépésszám változása.

**Flow-változás T0-ban.** Sok flow-változás nem igényel TS-t. Ha egy meglévő
gyerek-komponens bemenetei a szülő meglévő tagjaiból kiszolgálhatók, a komponens áthelyezése
egy másik oldal sablonjába T0. Két oldal összevonása vagy egy lépés áthelyezése gyakran
csak sablonmunka. Az útvonal-tábla változása T1.

## 4. Képernyőnkénti UX-spec

Minden célflow-beli képernyőhöz egy fejezet. A fejezet címe **pontosan az oldalnév**
(`PAGE_NAME_SEPARATOR`-ral összefűzve), mert ugyanez lesz a Figma frame neve és a
ticket "Oldalnév" mezője. Erre a fejezetre hivatkozik majd a ticket és a
`figma-designer`.

```markdown
## <oldalnev>

- **Útvonal:** `/…` (meglévő | új | összevont: `/a` + `/b`)
- **Cél:** <egy mondat> · **Elsődleges akció:** <ige + tárgy>
- **Megoldott találatok:** UX-03, UX-07

### Tartalom-hierarchia
1. <blokk> — <mi és miért itt>
2. …

### Állapotok
| Állapot | Mi látszik | Forrás (szerződés-tag) |
|---|---|---|
| üres | … | `Komponens.items.length === 0` |
| betöltés | … | `Komponens.isLoading` |
| hiba | … | `Komponens.loadError` |
| siker | … | … |
| kijelentkezett / jogosultság nélkül | … | `Komponens.isLoggedIn` |

### Viewportok
- desktop: … · tablet: … · mobil: … (mi rendeződik át, mi rejtőzik el)

### Komponensek
- Design-system elemek: <token/komponens nevek>
- Újrahasznosított Angular-komponens: `<app-…>` (bemenetei: …)
- Új prezentációs komponens (T1): <név, bemenetek, kimenetek> — csak ha indokolt

### Mikroszöveg
| Hely | Szöveg |
|---|---|
| Címsor | … |
| Elsődleges gomb | … |
| Hibaüzenet | … |

### Akadálymentesség
- <fókusz-sorrend, címkék, élő régió a státuszüzenetekhez, célméret>

### Szerződés-leképezés
| UI-elem | Adat / akció forrása | Szint | Megjegyzés |
|---|---|---|---|
| Lista elemei | `Komponens.items` | T0 | meglévő tag |
| "Megnyitás" gomb | `[routerLink]` meglévő útvonalra | T0 | |
| Elem-számláló | új getter: `get itemCount()` | T1 | egy sor, inject nélkül |

**A képernyő szintje:** <a táblázat legmagasabb szintje> → **UI-változás kerete:** <template-only | thin-ts | logic | free>
```

Hogyan maradj T0-ban (minták):

- **Állapot megjelenítése**: a meglévő boolean/null tagokra kötött `@if`, nem új mező.
- **Elrendezés és sorrend**: CSS grid/flex `order`, `grid-template-areas`, media query,
  nem TS-ben átrendezett lista.
- **Elrejtés vagy összecsukás**: natív `<details>`/`<summary>` vagy CSS, ha nem kell
  állapotot megőrizni.
- **Szöveg**: a sablonban. TS-ben lévő szöveg (pl. hibaüzenet) módosítása T1.
- **Akadálymentesség**: `aria-*`, `role`, `<label for>`, szemantikus elemek a sablonban.
- **Meglévő akciók új vezérlőn**: a meglévő publikus metódus hívása új gombról
  (`(click)="meglevoMetodus()"`).
- **Navigáció**: `routerLink` meglévő útvonalra.

Ha egy elem csak T1+ szinten valósítható meg, nézd meg a T0-alternatívát is, és ha az
UX-szempontból elfogadható, válaszd azt. A T1+ változatot a "Később" listára teheted.

## 5. TS/API-delta

Egyetlen táblázat a teljes redesign minden T1+ tételéről. Ez a lista a "számla": amit a
redesign a sablonmunkán felül kér.

| Tétel | Szint | Képernyő | Miért nem T0? | Olcsóbb alternatíva | Megoldott találat |
|---|---|---|---|---|---|

Szabályok:

- T2 tétel csak akkor maradhat bent, ha legalább High súlyú találatot old meg, vagy a
  célflow fő útjának része. Különben a "Később" listára kerül.
- T3 (backend/API) tétel csak a felhasználó explicit jóváhagyásával. Jelöld
  "jóváhagyásra vár"-ként, és ne számolj vele a ticket-javaslatokban, amíg nincs
  jóváhagyva.

## 6. Ticket-javaslatok

Képernyőnként egy story, oldalnév szerint deduplikálva. A sorrend: a legtöbb találatot
megoldó T0-képernyők elöl (gyors, biztonságos nyereség), utána a T1, végül a jóváhagyott
T2/T3. Formátum (ezt kapja meg a `dev-workflow-scoping`, onnan az `intake` írja Jirába):

| # | Story-cím | Oldalnév | UI-változás kerete | Megoldott találatok | UX-spec | Függőség |
|---|---|---|---|---|---|---|
| 1 | … | `…` | template-only | UX-01, UX-04 | `<UX_OUTPUT_DIR>/redesign-<slug>.md#<oldalnev>` | — |

A story AC-váza a spec "Állapotok" és "Tartalom-hierarchia" részéből jön: állapotonként
egy Given/When/Then.

## 7. Önellenőrzés

- Minden flow-változás és képernyő hivatkozik találatra vagy design-elvre?
- Minden UI-elemnek van forrása a szerződés-leképezésben, vagy szerepel a TS/API-deltában?
- A képernyő szintje egyezik a szerződés-leképezés legmagasabb sorával?
- A fejezetcímek pontosan oldalnevek (`PAGE_NAME_SEPARATOR`)?
- Javult a fő feladat lépésszáma, vagy indokolt, miért nem?
- A "Mérlegelt, de elvetett" és a "Később" lista ki van töltve?

## Redesign-dokumentum sablon

````markdown
# UX-redesign — <téma> (<dátum>)

**Alap-audit:** <fájl> · **Preferált keret:** <…> · **Állapot:** javaslat (jóváhagyásra vár)

## Összefoglaló
<5–8 mondat: mi változik és miért, a fő feladat lépésszáma előtte → utána, a szintek
eloszlása (pl. 6 képernyő: 4 × T0, 1 × T1, 1 × T2), mi kér jóváhagyást>

## Célok és korlátok
## Jelenlegi flow
## Célflow
## Változáslista
## Képernyők
<képernyőnként a 4. pont sablonja>
## TS/API-delta
## Ticket-javaslatok
## Később
## Mérlegelt, de elvetett
## Nyitott kérdések
````
