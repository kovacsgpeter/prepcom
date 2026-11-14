# ux-designer — értékelési rubrika (audit és critique)

Ezt a fájlt a [`ux-designer.md`](ux-designer.md) `audit` és
`critique` módja olvassa be. Itt van a súlyozás, a találat-szerződés, a verdikt, az
ellenőrzőlisták, a böngészős mérő-snippetek és a két kimeneti sablon.

## Súlyosság

A címkék a Nielsen-féle súlyossági skálára képeződnek le, hogy kívülről is összevethetők
legyenek.

| Címke | Nielsen | Mikor |
|---|---|---|
| **Blocker** | 4 | A felhasználó nem tudja befejezni a fő feladatot, adatot veszít, vagy WCAG A/AA-szintű akadály zárja ki (pl. billentyűzettel elérhetetlen fő CTA). |
| **High** | 3 | A feladat befejezhető, de jelentős hibával, kerülőúttal vagy bizalomvesztéssel. Ide tartozik a rejtett TS/API-igény a critique-ban. |
| **Medium** | 2 | Észrevehető súrlódás vagy következetlenség, ami lassít, de nem akaszt meg. |
| **Nit** | 1 | Kozmetikai vagy csiszolási kérdés. |

A súlyt a **felhasználói hatás** dönti el (milyen gyakran fordul elő × mennyire súlyos ×
megkerülhető-e), nem az, hogy a javítás mennyibe kerül. A költséget a szintbecslés (T0–T3)
mutatja, külön tengelyen.

## Találat-szerződés

Minden találat ugyanezekből a mezőkből áll:

| Mező | Tartalom |
|---|---|
| ID | `UX-01`, `UX-02`, … (redesignben és ticketekben erre hivatkozunk) |
| Cím | egy rövid mondat a problémáról, nem a megoldásról |
| Súly | Blocker / High / Medium / Nit |
| Kritérium | Nielsen `H1`–`H10`, WCAG-kritérium száma (pl. `1.4.3`), UX-törvény, vagy a design-elvek pontja |
| Hely | útvonal + elem (szöveg vagy szelektor) + viewport |
| Bizonyíték | mit figyeltél meg, reprodukálási lépésekkel; mért érték, ha van (pl. kontraszt 3.1:1) |
| Hatás | kit érint és hogyan (egy mondat) |
| Irány | egy mondat arról, merre van a javítás — auditban nem kész megoldás |
| Szint | becsült változási szint T0–T3, a felhasznált szerződés-taggal (pl. `T0 — ItemListComponent.isLoading már létezik`) |
| Biztosság | `ellenőrzött` (reprodukáltad/mérted) vagy `valószínű` (kódból/sablonból következtetve) |

Szabályok:

- Legfeljebb `UX_MAX_FINDINGS` találat. Az azonos gyökérokú találatokat vond össze.
- **Mérlegelt, de elvetett**: kötelező tábla azokról a jelöltekről, amiket megvizsgáltál,
  de nem vettél fel (ok: nem reprodukálható, szándékos döntés, a hatása elhanyagolható).
  Ettől lesz a riport ellenőrizhető, nem csak hosszú.
- **Nem ellenőrzött**: kötelező lista arról, amit nem tudtál megnézni, és miért (pl.
  "fizetési flow — mellékhatás", "a 375 px nézet — a böngésző nem méretezhető").
- Kezdd azzal, ami jól működik (2–4 pont). Ez nem udvariasság: ezeket a redesign ne
  rontsa el.

## Verdikt

Egyetlen verdikt, a vizsgált hatókörre korlátozva (ezt a hatókört ki is mondod):

- **Block** — van legalább egy Blocker, vagy critique-ban rejtett TS/API-igény, ami
  túllépi a ticket UI-változási keretét.
- **Needs changes** — nincs Blocker, de van High.
- **Approve** — legfeljebb Medium és Nit. A Medium tételek mehetnek follow-upba.

## Ellenőrzőlista — Nielsen-heurisztikák

| # | Heurisztika | Mit nézz meg konkrétan egy webappban |
|---|---|---|
| H1 | A rendszer állapotának láthatósága | Van-e visszajelzés 400 ms-on belül (Doherty-küszöb)? Betöltés, mentés, generálás alatt látszik-e, hogy történik valami? |
| H2 | Egyezés a valós világgal | A felhasználó szavait használja-e a felület, nem a belső/fejlesztői fogalmakat? |
| H3 | Irányítás és szabadság | Van-e visszavonás, mégse, vissza? Elhagyható-e egy flow adatvesztés nélkül? |
| H4 | Konzisztencia és szabványok | Ugyanaz a fogalom, gomb és ikon mindenhol ugyanazt jelenti? Követi-e a megszokott webes mintákat (Jakob-törvény)? |
| H5 | Hibamegelőzés | Megelőzi-e a felület a hibát (formátum-segítség, letiltott állapot, megerősítés romboló műveletnél)? |
| H6 | Felismerés felidézés helyett | Láthatók-e a lehetőségek, vagy emlékezni kell rájuk? |
| H7 | Rugalmasság és hatékonyság | Van-e gyorsút a visszatérő felhasználónak? Nem kényszerít-e felesleges lépésekre? |
| H8 | Esztétikus, minimalista dizájn | Egy elsődleges akció képernyőnként? Nincs-e versengő vizuális zaj? A tartalom a főszereplő? |
| H9 | Hibák felismerése és helyreállítás | A hibaüzenet érthetően megmondja, mi történt és mit tehet a felhasználó? |
| H10 | Súgó és dokumentáció | Ott van-e a segítség, ahol szükség van rá (pl. a fájlformátum leírása a feltöltésnél)? |

Hasznos UX-törvények az indokláshoz: Hick (kevesebb választás → gyorsabb döntés), Fitts
(a fő CTA legyen nagy és közel), Miller/csoportosítás, Tesler (a komplexitást a rendszer
viselje), Von Restorff (a fő akció emelkedjen ki), csúcs–vég szabály (a flow csúcspontja
és vége határozza meg az élményt), esztétikai–használhatósági hatás.

## Ellenőrzőlista — WCAG 2.2 AA (böngészőből ellenőrizhető rész)

| Kritérium | Mit és hogyan |
|---|---|
| 1.1.1 Nem szöveges tartalom | Képek/ikonok `alt` vagy `aria-label`; dekoratív elem `aria-hidden` (`read_page`) |
| 1.3.1 Információ és kapcsolatok | Címsor-hierarchia (h1 → h2), listák, űrlap-címkék szemantikusan |
| 1.4.3 Kontraszt (minimum) | Szöveg 4.5:1, nagy szöveg (≥ 24 px vagy ≥ 18.66 px félkövér) 3:1 — kontraszt-snippet |
| 1.4.10 Újratördelés | 320 px szélességen nincs vízszintes görgetés (`resize_window` 320 széles) |
| 1.4.11 Nem szöveges kontraszt | Vezérlők határa és fókuszjelzése 3:1 |
| 2.1.1 Billentyűzet | Minden funkció elérhető `Tab`/`Enter`/`Space` billentyűvel |
| 2.4.3 Fókusz-sorrend | A `Tab` sorrend követi a vizuális sorrendet |
| 2.4.7 Látható fókusz | Van látható fókuszjelzés minden interaktív elemen |
| 2.4.11 Fókusz nincs eltakarva | A fókuszált elemet nem takarja ragadós fejléc, süti-sáv vagy dialógus |
| 2.5.8 Célméret (minimum) | Az interaktív elem legalább 24×24 CSS px, vagy elég térköz veszi körül — célméret-snippet |
| 3.3.1 Hiba azonosítása | A hiba szövegesen is megjelenik, nem csak színnel |
| 3.3.2 Címkék vagy utasítások | Minden bemenetnek van látható címkéje |
| 3.3.7 Redundáns bevitel | Egy flow-n belül nem kell ugyanazt kétszer megadni |
| 3.3.8 Akadálymentes hitelesítés | A belépés nem követel kognitív tesztet (a közösségi belépés megfelel) |
| 4.1.2 Név, szerep, érték | Egyedi vezérlőknek van akadálymentes neve és szerepe |

## Ellenőrzőlista — vizuális és interakciós minőség

- **Hierarchia**: 3 másodperc alatt kiderül-e, mi ez az oldal és mi a fő teendő?
- **Design-system**: csak tokenből jövő szín, betű és méret? Ugyanaz a komponens
  ugyanúgy néz ki mindenhol?
- **Állapotok**: üres, betöltés, hiba és siker állapot minden adatfüggő képernyőn; a
  hover, fókusz, aktív és letiltott állapot minden vezérlőn.
- **Reszponzivitás**: a `UX_AUDIT_VIEWPORTS` minden méretén működik és olvasható, nincs
  átfedés vagy levágott tartalom; az érintési célok mobilon kényelmesek.
- **Mikroszöveg**: rövid, egyértelmű, egységes hangnem és terminológia; a gombfelirat
  igével mondja meg, mi történik.
- **Teljesítmény-érzet**: van-e skeleton vagy jelzés a lassú műveleteknél? A konzol
  hibamentes?

## Mérő-snippetek (`javascript_tool`)

A snippetek közelítőek: háttérkép, gradiens vagy átlátszó réteg esetén a kontraszt kézi
ellenőrzést igényel. Ilyenkor a találat biztossága `valószínű`.

**Kontraszt (1.4.3):**

```js
(() => {
  const lum = (r, g, b) => [r, g, b].map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
    .reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
  const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number);
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c.length >= 3 && (c[3] === undefined || c[3] > 0)) return c; } return [255, 255, 255]; };
  const out = [];
  document.querySelectorAll('body *').forEach((el) => {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return;
    const a = lum(...parse(cs.color).slice(0, 3)); const b = lum(...bgOf(el).slice(0, 3));
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const size = parseFloat(cs.fontSize); const large = size >= 24 || (parseInt(cs.fontWeight, 10) >= 700 && size >= 18.66);
    if (ratio < (large ? 3 : 4.5)) out.push({ text: el.textContent.trim().slice(0, 40), ratio: ratio.toFixed(2), min: large ? 3 : 4.5, cls: String(el.className).slice(0, 60) });
  });
  return out.slice(0, 30);
})()
```

**Célméret (2.5.8):**

```js
[...document.querySelectorAll('a,button,input,select,textarea,[role=button],[tabindex]')]
  .map((e) => ({ e, r: e.getBoundingClientRect() }))
  .filter(({ r }) => r.width > 0 && (r.width < 24 || r.height < 24))
  .map(({ e, r }) => ({ tag: e.tagName, text: (e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) }))
  .slice(0, 30)
```

**Akadálymentes név nélküli vezérlők (4.1.2, 3.3.2):**

```js
[...document.querySelectorAll('button,a[href],input,select,textarea,[role=button]')]
  .filter((e) => !(e.innerText || '').trim() && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby') && !e.getAttribute('title') && !(e.id && document.querySelector(`label[for="${e.id}"]`)) && !e.closest('label'))
  .map((e) => ({ tag: e.tagName, type: e.getAttribute('type'), cls: String(e.className).slice(0, 60) }))
  .slice(0, 30)
```

## Audit-riport sablon

````markdown
# UX-audit — <hatókör> (<dátum>)

**Célpont:** <URL> · **Viewportok:** <lista> · **Verdikt:** <Block | Needs changes | Approve> (a fenti hatókörre)

## Összefoglaló
<3–5 mondat: a legfontosabb megállapítás, a találatok száma súlyosság szerint, a javasolt következő lépés>

## Ami jól működik
- …

## Flow-térkép (jelenlegi)
```mermaid
flowchart LR
  A["/ — Kezdőlap"] -->|fájl feltöltése| B["Előnézet"]
  …
```
<a fájdalompontokat a csomópontokon `UX-nn` hivatkozással jelöld; a nem bejárt (mellékhatásos) lépéseket szaggatott éllel>

## Találatok
| ID | Súly | Cím | Kritérium | Hely | Szint |
|---|---|---|---|---|---|
| UX-01 | High | … | H1 | `/` · feltöltés · 375 px | T0 |

### UX-01 — <cím>
- **Bizonyíték:** …
- **Hatás:** …
- **Irány:** …
- **Szint:** T0 — <szerződés-tag> · **Biztosság:** ellenőrzött

## Mérlegelt, de elvetett
| Jelölt | Miért nem került be |
|---|---|

## Nem ellenőrzött
- …
````

## Kritika-sablon

```markdown
# UX-kritika — <oldalnév> (<figma | live>, <dátum>)

**Verdikt:** <Block | Needs changes | Approve> · **Hatókör:** <egy képernyő, állapotai>
**Spec:** <redesign-dokumentum és fejezet> · **UI-változás kerete:** <a ticketből>

## Spec-megfelelés
| Spec-elem (állapot/blokk/szöveg) | Megvan? | Megjegyzés |
|---|---|---|

## Szerződés-hűség
<a terv minden adata és akciója visszavezethető-e a spec szerződés-leképezésére; az
eltéréseket rejtett TS/API-igényként sorold fel, szinttel>

## Találatok
<a találat-szerződés szerint, súly szerint rendezve>

## Mérlegelt, de elvetett
## Nem ellenőrzött
```
