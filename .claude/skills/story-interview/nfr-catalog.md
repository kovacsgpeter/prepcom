# NFR-katalógus (tervezésidejű nem-funkcionális szempontok)

> ℹ️ Ez a katalógus a [`threat-catalog.md`](threat-catalog.md) négyszekciós szerkezetét
> követi, de nem biztonsági fenyegetéseket, hanem nem-funkcionális (NFR) szempontokat
> rendszerez. A workflow interjú-lépéseibe (`SKILL.md`, `../dev-workflow-intake/SKILL.md`)
> való tényleges bekötés egy következő, ezt a fájlt már meglévőként feltételező sub-task
> feladata (COCALC-360 batch) — ez a fájl önmagában a katalógus tartalmát adja.

## Mire való

A cél a **tervezés fázisában** felszínre hozni azokat a nem-funkcionális szempontokat,
amelyek egy story leírásából már láthatók, és ezekből **ellenőrizhető nem-funkcionális
Acceptance Criteria-t** javasolni, mielőtt bármi kódba kerülne. Ez a katalógus **nem mér
és nem ellenőriz** — nem futtat Lighthouse-t, axe-et vagy bármilyen más futásidejű
NFR-vizsgálatot, és nem is helyettesíti azt — kizárólag kategória-szintű, tervezői
döntést segítő jelzéseket ad.

## Elhatárolás — mit NEM érint

- **Nem** ide tartoznak az adatvédelmi/GDPR-jellegű szempontok (adatmegőrzési idő,
  felhasználói tájékoztatás, harmadik félnek történő adattovábbítás) — ezek a
  [`threat-catalog.md`](threat-catalog.md) "Érzékeny adat tárolása, naplózása és
  továbbítása" kategóriájához tartoznak, nem ide.
- **Nem** futásidejű NFR-vizsgálat vagy mérőeszköz (Lighthouse, axe, terheléses teszt) —
  ez a katalógus kizárólag tervezésidejű, kód nélkül használható jelzés-lista.
- **Nem** a `code-reviewer.md` review-kategóriái (az utólagos, kód-szintű ellenőrzés külön
  eszköz tulajdona) — ez a katalógus tervezésidejű.
- A nem-funkcionális AC-k a normál AC-listában élnek, a többi AC-vel azonos formában — az
  `implementer` és a `qa-tester` külön logika nélkül dolgozik velük.

## Hogyan használd

Minden kategóriánál három rögzített alcím van, a `threat-catalog.md` mintáját követve:

- **Mikor releváns** — szűk, konkrét kiváltó esemény a story leírásában, nem általános
  "ha UI-t érint" jellegű feltétel. Ha ez megjelenik (szó szerint vagy tartalmilag), a
  kategória releváns, és meg kell vizsgálni.
- **Minta-AC** — egy eszközfüggetlen, ellenőrizhető példamondat. Ez sablon, nem szó
  szerint másolandó — a story konkrétumaira kell szabni, de a jellegét (mit garantál,
  hogyan ellenőrizhető) tartsd meg.
- **Katalóguson kívüli megfontolás** — horog: ha a kategórián túlmutató, de ide tartozó
  NFR-szempont merül fel, ezen a helyen, kötelező egymondatos indoklással vehető fel.

## Kategóriák

### Akadálymentesség

**Mikor releváns** (kiváltó jel): a story **új** interaktív elemet vezet be — új
űrlapmező, egyedi vezérlő (pl. egyedi legördülő, csúszka, dátumválasztó), modal/dialog,
vagy olyan felületi elem, amit billentyűzettel kell tudni kezelni. **Nem** aktivál puszta
vizuális/stílus módosítás vagy meglévő elem szövegcseréje.

**Minta-AC:** Given az új [vezérlő neve], When a felhasználó kizárólag billentyűzettel
navigál rá és használja, Then a fókusz vizuálisan jelzett, a vezérlő szerepe/állapota
képernyőolvasóval felismerhető (megfelelő ARIA-attribútum vagy natív szemantika), és a
művelet Enter/Space-szel aktiválható. (manuális)

**Katalóguson kívüli megfontolás:** nincs — ha a modell ide sorolható, de a mintától
eltérő NFR-szempontot lát, itt vegye fel egymondatos indoklással.

### Teljesítmény

**Mikor releváns** (kiváltó jel): a story konkrét adatmennyiséghez kötött renderelést
vagy számítást ír le — nagy lista/tábla megjelenítése, sok elem egyidejű renderelése,
nehéz kliensoldali művelet (pl. nagy fájl feldolgozása, komplex vizuális generálás).
**Nem** aktivál egy-egy elem megjelenítése vagy egyszerű CRUD-művelet.

**Minta-AC:** Given a dokumentált méretet meghaladó elemszámú bemenet, When a felület
megjeleníti vagy feldolgozza, Then a művelet a dokumentált időhatáron belül lezajlik, és
a felület eközben nem fagy be — hosszabb művelet esetén a felhasználó visszajelzést kap a
folyamatban lévő állapotról. (mindkettő)

**Katalóguson kívüli megfontolás:** nincs — ha a modell ide sorolható, de a mintától
eltérő NFR-szempontot lát, itt vegye fel egymondatos indoklással.

### i18n/l10n

**Mikor releváns** (kiváltó jel): a story **új**, felhasználó felé megjelenő szöveget,
dátum-, szám- vagy pénznem-formátumot vezet be, vagy új nyelvet/locale-t. **Nem** aktivál
belső naplózás vagy tisztán fejlesztői célú szöveg.

**Minta-AC:** Given az új, felhasználó felé megjelenő szöveg vagy formátum, When a
felület a támogatott locale-ok mindegyikén megjelenik, Then a szöveg fordítási kulcson
keresztül jelenik meg (nem hardkódolva), és a dátum/szám/pénznem formátuma az adott
locale konvencióját követi. (automata)

**Katalóguson kívüli megfontolás:** nincs — ha a modell ide sorolható, de a mintától
eltérő NFR-szempontot lát, itt vegye fel egymondatos indoklással.

### Böngésző- és eszköz-mátrix

**Mikor releváns** (kiváltó jel): a story **új** CSS-technikát (pl. grid, container
query, új layout-módszer) vagy **új** böngésző-API-t (pl. Clipboard API, File API, Web
Worker) vezet be, aminek a támogatottsága böngészőnként eltérhet. **Nem** aktivál egy már
használatban lévő technika további alkalmazása.

**Minta-AC:** Given az új CSS-technika vagy böngésző-API, When a funkciót a támogatott
böngésző-mátrix mindegyikén manuálisan ellenőrzik, Then a viselkedés konzisztens, és nem
támogatott böngészőben a funkció nem hibázik csendben, hanem érthető, degradált módon
viselkedik. (manuális)

**Katalóguson kívüli megfontolás:** nincs — ha a modell ide sorolható, de a mintától
eltérő NFR-szempontot lát, itt vegye fel egymondatos indoklással.

### Hibatűrés és üres állapot

**Mikor releváns** (kiváltó jel): a story **új** adatbetöltést vagy hálózati hívást
vezet be, vagy lista/kollekció megjelenítését, ahol az eredmény lehet üres, vagy a hívás
hibázhat. **Nem** aktivál olyan felületet, ami statikus, mindig rendelkezésre álló adatot
jelenít meg.

**Minta-AC:** Given a hívás sikertelen vagy a kollekció üres, When a felület ezt az
állapotot eléri, Then a felhasználó érthető, akcióra buzdító visszajelzést kap (nem üres
vagy törött felület, nem nyers hibaüzenet), és a felület állapota ettől konzisztens
marad. (mindkettő)

**Katalóguson kívüli megfontolás:** nincs — ha a modell ide sorolható, de a mintától
eltérő NFR-szempontot lát, itt vegye fel egymondatos indoklással.
