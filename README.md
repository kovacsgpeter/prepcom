# Gyökér — családi és közösségi birtoktervező

Magyar nyelvű statikus döntési segéd: minimum–kívánt igények, házépítés, földterület, induló és havi költségek, munka, víz; családi JSON-mentés és több család közös „reveal party” összesítése. Nincs backend, build vagy futásidejű külső függőség.

## Elindítás

```sh
cd /workspace/prepcom
python3 -m http.server 8000 --bind 127.0.0.1
```

ES-modulokat használ, ezért HTTP-kiszolgálóról kell megnyitni, nem az `index.html` dupla kattintásával.

GitHub Pages: a repository **Settings → Pages** beállításában válaszd a közzétenni kívánt ágat és a **/ (root)** könyvtárat. Az `index.html`, `.mjs` és CSS fájlokat együtt kell közzétenni. A `.nojekyll` jelzi, hogy nincs Jekyll-generálás. Ez a munkamenet nem publikálta az oldalt, és nem módosított GitHub-beállításokat.

## Használat

1. Add meg a családot, keretet, munkaórát, a ház és tevékenységek minimum–kívánt mennyiségeit. A rögzítés a kívánt értéket tartja meg.
2. A háromszögek pontjai húzhatók, és billentyűzettel használható csúszkákat is kapnak. A két pénzügyi nézet közül az aktív érvényesül, a gazdálkodási háromszög az engedélyezett megoldásokat módosítja.
3. Ments családi JSON-t. Az összes alapadat és hozzáadott forrás bekerül. A böngésző helyi tárhelye kényelmi mentés; a hordozható biztonsági másolat a JSON.
4. A reveal partyn tölts be családi JSON-okat, és egyeztesd az összevonásokat. A közösnek jelölt tétel nem vonódik össze automatikusan. Kezdetben a telek vételárrésze és a közös költségek egyenlően oszlanak meg; a vételárrész és a közös óravállalás módosítható.
5. Opcionálisan adj meg havi pénzvállalásokat és egy konkrét telek Ft/m² árát. Ár nélkül nincs megvásárolható maximális hektárbecslés. Az alternatív pénzügyi kiegyenlítés csak lehetőségként jelenik meg.
6. A közös munkamenet JSON-ja az egyeztetésekkel együtt visszatölthető. Új család hozzáadásakor, eltávolításakor vagy frissítésekor az egyeztetések visszaállnak. Kattints a család pontjára, ha a jelenlegi családi tervvel szeretnéd frissíteni.

Legfeljebb 24 család és 2 MB-os JSON-fájlok kezelhetők. Azonos tartalmú családi terveket az import nem ad hozzá kétszer. A fájlok nem kerülnek szerverre; személyes pénzügyi adatokat tartalmazhatnak.

## Számítás és korlátok

- A háromszög súlyai preferenciák. Az elmozdulás a minimumtól a kívánt értékig `min(1, 2 × súly)`. Állat-, fa- és bokorszám felfelé kerekítődik. A rögzített értékek változatlanok. A modell jelez túl költséges vagy túl sok munkát igénylő terveket; nem ígér optimális vagy biztosan megvalósítható birtokot.
- A saját takarmány éves igényéből levonjuk a megadott takarmányterület termését, gabona és szálastakarmány szerint külön. Csak a hiányhoz adunk földet. A képlet száraz takarmány-egyenértékes közelítés, nem takarmányadag-terv, és nem talaj- vagy vetésforgómodell.
- A tervezés, szakértők, költözés, melléképületek, közművek, eszközök, egyéb kiadások és tartalék külön megadhatók. A telek vételárkerete a százalékos és fix vásárlási költségkerettel is számol. Az illetékjogosultság, mentesség és a mezőgazdasági föld vásárlásának szabályai nincsenek modellezve.
- A közös tétel az érintett családi tételeket váltja ki. Az eltérő fajlagos becslések maximumával számol; ez konzervatív keret, nem műszaki méretezés. A közös közműrendszer kapacitását külön ellenőrizni kell, a változó fogyasztási költséget a havi díjakban kell aktualizálni.
- A belső munkadíj egyenlege nulla. Csak a vállalt közös munka oszlik el: a fedezetlen órák láthatók, és csak külön választással kerülnek külső segítségként a költségbe. A szezonális csúcsok összeadott becslések, nem havi naptár; a csúcsidőszaki munkamegosztás külön feladat.
- A hipotetikus telek területarányos sávdiagram. Nem valós telekrajz, tulajdonjogi javaslat vagy beépítési terv.

## Adatok és források

Az **Alapadatok** nézetben minden együttható látható és módosítható, forráslinkkel, dátummal, körülményekkel. Forrás nélküli értékek: **becslés**. Beküldött, de önállóan nem ellenőrzött adatok: **megadott forrás, ellenőrizendő**. Számmódosításnál a korábbi forrással ellátott adat ismét becsléssé minősül, mert a cikk nem feltétlenül igazolja az új értéket.

- `data.mjs`: bővíthető tevékenységkatalógus, költség- és technológiai alapértékek.
- `research.mjs`: a felhasznált gyűjtési adatokhoz rendelt közvetlen forráslinkek és átváltások.
- `research-document.mjs`: az `Epitesi_arak_es_allattartas.docx` kilenc adattáblája és 51 egyedi hivatkozása. Az oldalon az eredeti adatok akkor is megjelennek, ha nem kerültek be a számításba.
- `model.mjs`: számítás, közös egyeztetés, JSON-validálás és háromszög-geometria.
- `app.mjs`, `index.html`, `style.css`: böngészős felület, helyi mentés és import/export.

A kutatási források eredeti oldalait a környezet hálózati korlátozása miatt nem lehetett önállóan ellenőrizni. Nem tekintjük garantált mai építési árnak a nettó vagy régi árakat; nincs automatikus 5%-os áfaalkalmazás. A külföldi állattartási irányértékek nem magyar szabályozási minimumok. A juh üzemi munkaadata és az észak-dakotai legelő hektár/hó adata nem került automatikusan a háztáji modellbe.

További adatkutatás: konyhakerti és gyümölcsös munka/víz; állatonkénti munka; helyi takarmányhozam és ár; konkrét közműkapacitás és díj; építési ajánlatok alapterület- és áfatartalma. A számított eredményt ezek tisztázásáig tervezési becslésként kell kezelni.

## Ellenőrzés

```sh
node --test tests/model.test.mjs
```

A tesztek a pénzügyi korlátokat, zárt költségelszámolást, darabszámokat, takarmány beszámítását, közös tételeket, munkadíj-egyenleget, importvalidálást és a geometriai vezérlőt ellenőrzik. A felület asztali és mobil Chromium böngészőben is ellenőrzött; a részletek a `VALIDATION.md` fájlban.
