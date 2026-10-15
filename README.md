# Gyökér — családi és közösségi birtoktervező

Magyar nyelvű statikus döntési segéd: minimum–kívánt igények, házépítés, földterület, induló és havi költségek, munka, víz; családi JSON-mentés és több család közös „reveal party” összesítése. Nincs backend, build vagy futásidejű külső függőség.

## Elindítás

```sh
cd /workspace/prepcom
python3 -m http.server 8000 --bind 127.0.0.1
```

ES-modulokat használ, ezért HTTP-kiszolgálóról kell megnyitni, nem az `index.html` dupla kattintásával.

GitHub Pages: a repository **Settings → Pages** beállításában válaszd a közzétenni kívánt ágat és a **/ (root)** könyvtárat. Az `index.html`, `.mjs` és CSS fájlokat együtt kell közzétenni. A `.nojekyll` jelzi, hogy nincs Jekyll-generálás. Az oldal a main ágon van; az ágfrissítéseket a beállított GitHub Pages automatikusan publikálja. A publikálás állapota a GitHub Actions / Pages felületen ellenőrizhető.

## Használat

0. Az **Útmutató** fül részletes, példákkal illusztrált használati leírást ad. A **?** súgók rámutatással, billentyűzet-fókusszal és koppintással nyithatók. A háromszögcsúcsok nevét kattintva vagy Enterrel a csúcsok részletes jelentése olvasható, a terv módosítása nélkül.
1. Add meg a családot, keretet, munkaórát, a ház és tevékenységek minimum–kívánt mennyiségeit. A rögzítés a kívánt értéket tartja meg.
2. A háromszögek pontjai húzhatók, és billentyűzettel használható csúszkákat is kapnak. A két pénzügyi nézet közül az aktív érvényesül, a gazdálkodási háromszög az engedélyezett megoldásokat módosítja.
3. Opcionálisan adj meg a családi nézetben **Telekár · Ft/m²** árat. A 0 vagy üres mező ismeretlen árat jelent. A telekigényhez szükséges vételár és vásárlási járulékok külön jelennek meg; mellettük a teljes terv költsége, a rendelkezésre álló keret és a finanszírozási hiány. A vételárkeret kijelzése nem lehet negatív: fedezethiánynál 0 Ft, külön hiányjelzéssel. A régi, telekár nélküli JSON-ok változatlanul betölthetők.
4. Ments családi JSON-t. Az összes alapadat és hozzáadott forrás bekerül. A böngésző helyi tárhelye kényelmi mentés; a hordozható biztonsági másolat a JSON.
5. A reveal partyn tölts be családi JSON-okat, és egyeztesd az összevonásokat. A közösnek jelölt tétel nem vonódik össze automatikusan. Kezdetben a telek vételárrésze és a közös költségek egyenlően oszlanak meg; a vételárrész és a közös óravállalás módosítható.
6. Opcionálisan adj meg havi pénzvállalásokat és egy konkrét telek Ft/m² árát. Ár nélkül nincs megvásárolható maximális hektárbecslés. Az alternatív pénzügyi kiegyenlítés csak lehetőségként jelenik meg.
7. A közös munkamenet JSON-ja az egyeztetésekkel együtt visszatölthető. Új család hozzáadásakor, eltávolításakor vagy frissítésekor az egyeztetések visszaállnak. Kattints a család pontjára, ha a jelenlegi családi tervvel szeretnéd frissíteni.

Legfeljebb 24 család és 2 MB-os JSON-fájlok kezelhetők. Azonos tartalmú családi terveket az import nem ad hozzá kétszer. A fájlok nem kerülnek szerverre; személyes pénzügyi adatokat tartalmazhatnak.

## Számítás és korlátok

- A háromszög súlyai preferenciák. Az elmozdulás a minimumtól a kívánt értékig `min(1, 2 × súly)`. Állat-, fa- és bokorszám felfelé kerekítődik. A rögzített értékek változatlanok. A modell jelez túl költséges vagy túl sok munkát igénylő terveket; nem ígér optimális vagy biztosan megvalósítható birtokot.
- A saját takarmány éves igényéből levonjuk a megadott takarmányterület termését, gabona és szálastakarmány szerint külön. Csak a hiányhoz adunk földet. A képlet száraz takarmány-egyenértékes közelítés, nem takarmányadag-terv, és nem talaj- vagy vetésforgómodell.
- A tervezés, szakértők, költözés, melléképületek, közművek, eszközök, egyéb kiadások és tartalék külön megadhatók. A telek vételárkerete a százalékos és fix vásárlási költségkerettel is számol. Az illetékjogosultság, mentesség és a mezőgazdasági föld vásárlásának szabályai nincsenek modellezve.
- A közös tétel az érintett családi tételeket váltja ki. Az eltérő fajlagos becslések maximumával számol; ez konzervatív keret, nem műszaki méretezés. A közös közműrendszer kapacitását külön ellenőrizni kell, a változó fogyasztási költséget a havi díjakban kell aktualizálni.
- A belső munkadíj egyenlege nulla. Csak a vállalt közös munka oszlik el: a fedezetlen órák láthatók, és csak külön választással kerülnek külső segítségként a költségbe. A szezonális csúcsok összeadott becslések, nem havi naptár; a csúcsidőszaki munkamegosztás külön feladat.
- A családi és közös telekábra felülnézeti, területarányos térkép: ház és udvar, üvegház, gyümölcsfák, bokrok, ágyások, állatok, külön takarmányterület és infrastruktúra. A rajzok jelképesek; a valós mennyiségeket a feliratok adják. A családok színes határvonallal és névvel, a közös területek külön blokkal szerepelnek. Nem valós telekrajz, tulajdonjogi javaslat vagy beépítési terv.

## Adatok és források

Az **Alapadatok** nézetben minden együttható látható és módosítható, forráslinkkel, dátummal, körülményekkel. Forrás nélküli értékek: **becslés**. Beküldött, de önállóan nem ellenőrzött adatok: **megadott forrás, ellenőrizendő**. Számmódosításnál a korábbi forrással ellátott adat ismét becsléssé minősül, mert a cikk nem feltétlenül igazolja az új értéket.

- `data.mjs`: bővíthető tevékenységkatalógus, költség- és technológiai alapértékek.
- `research.mjs`: a felhasznált gyűjtési adatokhoz rendelt közvetlen forráslinkek és átváltások.
- `research-document.mjs`: az `Epitesi_arak_es_allattartas.docx` kilenc adattáblája és 51 egyedi hivatkozása. Az oldalon az eredeti adatok akkor is megjelennek, ha nem kerültek be a számításba.
- `model.mjs`: számítás, közös egyeztetés, JSON-validálás és háromszög-geometria.
- `plot.mjs`, `plot.css`: közös térképrenderelő, területarányos elrendezés és rajzos SVG-elemek.
- `plot-preview.html`, `plot-preview.mjs`: külön előnézet családi és háromcsaládos mintával, helyi mentett tervek megnyitásával és saját családi JSON betöltésével. A JSON-import nem módosítja a kalkulátor helyi mentését.
- `app.mjs`, `index.html`, `style.css`: böngészős felület, helyi mentés és import/export.

A kutatási források eredeti oldalait a környezet hálózati korlátozása miatt nem lehetett önállóan ellenőrizni. Nem tekintjük garantált mai építési árnak a nettó vagy régi árakat; nincs automatikus 5%-os áfaalkalmazás. A külföldi állattartási irányértékek nem magyar szabályozási minimumok. A juh üzemi munkaadata és az észak-dakotai legelő hektár/hó adata nem került automatikusan a háztáji modellbe.

További adatkutatás: konyhakerti és gyümölcsös munka/víz; állatonkénti munka; helyi takarmányhozam és ár; konkrét közműkapacitás és díj; építési ajánlatok alapterület- és áfatartalma. A számított eredményt ezek tisztázásáig tervezési becslésként kell kezelni. A kézzel megadott telekárat is felhasználói feltételezésként kezeljük, nem piaci adatkutatásként.

## Ellenőrzés

```sh
node --test tests/model.test.mjs tests/plot.test.mjs tests/food.test.mjs tests/crops.test.mjs tests/wood.test.mjs tests/explain.test.mjs tests/labor.test.mjs
```

A tesztek a pénzügyi korlátokat, zárt költségelszámolást, darabszámokat, takarmány beszámítását, közös tételeket, munkadíj-egyenleget, importvalidálást és a geometriai vezérlőt ellenőrzik. A felület asztali és mobil Chromium böngészőben is ellenőrzött; a részletek a `VALIDATION.md` fájlban.

## A birtoktérkép előnézete

Nyisd meg a `plot-preview.html` oldalt ugyanazon a HTTP-kiszolgálón vagy a GitHub Pagesen. A külön előnézet családi és háromcsaládos fiktív mintát, valamint a böngészőben mentett saját családi / közös tervet mutatja. Saját családi JSON is betölthető feltöltés és a helyi mentés felülírása nélkül. A térkép számozott zónái és a jelmagyarázat kattintással, koppintással vagy billentyűzettel kiválaszthatók.

A zónák téglalap-elrendezése megőrzi a számított területarányokat; a kis rajzok nem méretarányos épület- vagy állatrajzok. Közös térképnél az egyeztetett takarmánytermést és tárolóterületet egyszer számoljuk. A nulla területű közös eszközök a térkép alatti szövegben szerepelnek. A teljesen izometrikus, térhatású birtoknézet későbbi fejlesztés; a jelenlegi nézet felülnézeti.

## Önellátási mód

Tej, tojás, hús, zöldség, gyümölcs, élelmezési gabona és méz éves saját fedezetét is meg lehet adni. A család létszámából becsült fogyasztás termékenként saját éves értékre cserélhető. A célmennyiség / felhasználható éves hozam adja a szükséges állat-, növény- vagy m²-mennyiséget. Állatot, fát és bokrot felfelé egészre kerekítünk; a cél feletti és a teljes családi fogyasztás feletti többlet külön látszik. A cél rögzített marad a háromszögeken is. A kézi mód korábbi minimum / kívánt / rögzítés értékei visszaváltáskor megmaradnak.

A `food.mjs` fogyasztási és hozamértékei **forrás nélküli tervezési próbaértékek**, nem igazolt országos átlagok. Minden szám szerkeszthető és külön forrásolható az Alapadatok fülön. Az éves fedezet nem tápanyag-fedezet, folyamatos napi ellátás vagy frissen telepített gyümölcsös azonnali termése. Húsnál a megújított állomány éves termelési profilját kell megadni. A többlet nem automatikus árbevétel; a megélhetési kiadás nem csökken tőle.

A takarmányarány külön bemenet: a tényleges saját arányból kiszámolt éves igényből előbb levonjuk a megadott takarmányföld termését, majd a hiány / hozam adja a további földet. A felület a tartási helyet, a már felvett takarmányföldet és a további földet külön megmutatja, valamint jelzi a háromszög által módosított tényleges arányt.

A régi, 1-es JSON betölthető, kézi módban marad, és a korábbi számítási eredményei megmaradnak. Az új export 2-es verziójú; az 1-es formátumot támogató régi kliens ezt elutasítja, így nem értelmezi félre az önellátási célt. A jelenlegi böngészős mentés `gyoker-family-v5` / `gyoker-group-v5` kulcsokra kerül; a korábbi v4, v3, v2 és v1 mentést csak olvassuk az átálláshoz, és nem írjuk felül. A külön térképelőnézet mind az öt mentési verzióból tud olvasni.

Az új önellátási és mentésátállási böngészőpróba: `node tests/food-browser.cjs`, ugyanazokkal a Playwright-beállításokkal, mint a meglévő felületteszt.

## Újdonságok oldal

A `release-notes.html` a kalkulátor felső menüjéből érhető el. Minden bejegyzés dátumot és publikálási állapotot, a megoldott problémát, használati lépéseket és korlátokat tartalmaz. A publikált bejegyzésekhez a Git-commit rövid azonosítója is szerepel. Az önellátási fejlesztés saját bejegyzést kapott. Új kiadáskor a dátumot és publikálási állapotot is frissíteni kell.

## Új növények és korábbi tervek bővítése

A burgonya, csemegekukorica, étkezési szemes kukorica, takarmánykukorica és kajszibarackfa külön tevékenység. A burgonya és a friss, morzsolt csemegekukorica saját éves fogyasztási profilt kap; az étkezési szemes kukorica a gabonaigényből, a kajszi a közös gyümölcsigényből részesedik. A takarmánykukorica szárított szemtermése kizárólag a gabonatakarmány igényébe kerül, étkezési termelésként nem számítjuk be újra. Nem silókukorica.

A konyhakert neve „Konyhakert / háztáji zöldséges”, és paradicsomos-paprikás vegyes kertet jelent. A külön felvett burgonya- és kukoricaágyásokat a vegyes kert területéből ki kell hagyni; a saját vegyes zöldségfogyasztásból is ki kell venni e külön termékeket. A meglévő kertmennyiséget nem bontjuk fel automatikusan. Fajonkénti zöldségcél és gyógynövényes kert későbbi bővítés; a tűzifa-terület külön modulban elkészült.

Minden új terület-, költség-, víz-, munka-, hozam- és fogyasztási együttható módosítható, forrás nélküli próbaérték. Ezek szakmai helyességét a tesztek nem igazolják. A kajszi hozama termő korú fára vonatkozik.

Korábbi JSON betöltésekor kizárólag a hiányzó új katalóguselemeket és profilokat adjuk hozzá, és a konyhakert alapmegnevezését pontosítjuk. Egyetlen új tevékenység sem kerül automatikusan a tervbe. A korábbi saját számokat és forrásokat megtartjuk; a módosított, ismét exportált terv visszatölthető. Az élelmiszerprofil `profileVersion: 2`; az előző, verziójelölés nélküli profilból csak az új termékek hiányzó adatait pótoljuk, hibás régi értékeket nem javítunk hallgatólagosan.

Az új böngészős ellenőrzés `node tests/crops-browser.cjs`: régi v2 mentések átállása, új választási lehetőségek, önellátási célok, takarmány és étkezési kukorica szétválasztása, mentés-visszatöltés, közös leltár és mobilos megjelenítés.

## Tűzifa-termelés

A Faanyag kategória Tűzifa-termő terület tevékenysége m²-ben kézi mennyiséget vagy az éves faigény saját fedezeti százalékát fogadja. A `wood.mjs` külön modell: tömör m³ anyagtérfogattal számol, nem rakott vagy ömlesztett m³-rel, és nem keveri a fát az élelmiszer-önellátásba. A termőterület = éves saját cél / (éves fanövedék × hasznosítható hányad). A vágásforduló nem egy újabb területszorzó, hanem az éves korosztályos vágási terület és az egyszeri, fordulónkénti termés meghatározója.

Új telepítésnél az első kitermelési várakozást és a szárítást összeadjuk. Meglévő állománynál már korosztályokra osztott, kitermelhető területet feltételezünk; a friss termés szárítási ideje ott is számít. Az éves átlag nem garantálja a mai ellátást vagy egykorú állomány mindenéves kitermelését. A kezdeti 6 tömör m³/év igény, 4 tömör m³/ha/év növedék, 85% hasznosítható hányad és 20 éves forduló egyaránt **forrás nélküli próbaérték**, nem erdészeti ajánlás. Minden együttható külön szerkeszthető és forrásolható a családi kártyán és az Alapadatok fülön. A fafaj, termőhely és gazdálkodási lehetőség helyi ellenőrzést igényel.

A száradó és száraz készlet = saját éves termelés × (szárítási évek + tartalékévek). Rakott térfogati szorzóból és rakási magasságból külön fatárolóterületet adunk hozzá, külön kialakítási kerettel. Meglévő alap tároló és induló száraz készlet külön jelölhető. Az új telepítés és a száraz készlet beszerzése induló költség; a kitermelés és feldolgozás anyag/gép költsége és saját órája éves átlagként havi igény. Az új, egykorú állomány nagy kitermelése a munkacsúcsban is szerepel. Kertöntözés és általános gépesítés nem csökkenti a faanyag munkáját és nem ad öntözési beruházást a fás területhez.

A várakozás alatti további vásárlás többéves összegét tájékoztatóan mutatjuk. A havi fűtési keretben az éves vásárlási szükségletet figyelembe vesszük: a meglévő kereten felüli különbözetet adjuk hozzá, és automatikusan nem csökkentjük a keretet. Ez háztartási pénzigény, a közös terület összevonása nem vonja össze a családok fűtési keretét.

A közös terület termelése és tárolása egyszer szerepel. Eltérő hozamoknál a kisebb, költség/munka/tárolás esetén a magasabb fajlagos igény érvényesül. Az elfogadott túl kicsi területnél a saját cél hiányát jelezzük. A térképen fás termőterület és külön fatároló látszik.

Régi tervben a tűzifa-profil és választási lehetőség hozzáadódik, tevékenységet nem aktiválunk. Tűzifát tartalmazó családi vagy közös export **3-as séma**, a korábbi 1-es és 2-es import támogatott; a korábbi kliens a 3-as fájlt elutasítja. Tűzifa nélkül az export 2-es marad. A v4 helyi munkapéldány a v3 mentést is megőrzi. Az új böngészőpróba: `node tests/wood-browser.cjs`, az eddigi Playwright-beállításokkal.

## Költség-, terület- és munkamagyarázatok

A családi költségkártya Tervezés, Gazdaság indítása, Infrastruktúra, eszközök és Biztonsági keret sorai lenyithatók. A résztételek összege az eredeti költség, nem új levonás. A tervezés az alap építési ár százaléka, saját építési munka előtt; az induló biztonsági keret a tényleges induló kiadások százaléka. A talajvizsgálat és műszaki ellenőr az infrastruktúrában szerepel. A tervezési keretet szakági ajánlat nélkül nem bontjuk kitalált statikai / gépészeti részárakra. Gazdaságindításnál külön beszerzés / telepítés, további takarmányföld indítása, valamint tűzifánál fatároló és induló készlet látszik.

A `explain.mjs` a már kiszámított értékekből épít részleteket. A százalékos területábra a térképpel azonos teljes területből indul: tevékenységenként, illetve külön területrészenként is pontosan egyszer számol. Állat / takarmány és tűzifa / tároló a részletes nézetben külön szerepel. A családi próbák 0 / 100% saját takarmányt és önellátási célnál kisebb hozamot vizsgálnak, a mentett terv módosítása nélkül. A kézzel felvett takarmányföld e próbákban is megmarad. A reveal party a korrigált családi és egyszer elszámolt közös területet mutatja.

A takarmánymagyarázat a konkrét növény aktuális hozamát, termését és az automatikus terület hozamfeltételezését is kiírja. Az automatikus gabonaföld induló hozama 0,45 kg/m²/év, a takarmánykukoricáé 0,70; eltérő hozam mellett ugyanaz a kg-igény más teljes földet kérhet. Ez tömeg-egyenérték, nem energia-/fehérje-egyenérték vagy takarmányrecept. Gabona és szálastakarmány külön típus marad; az étkezési kukorica nem takarmány-jóváírás.

A `labor.mjs` a meglévő összes munkaórát feladatonként osztja szét. **A feladatarányok forrás nélküli próbaelosztások**, nem mért munkanapló. Minden táblázat havi éves átlagot, éves órát és arányosan osztott csúcsot mutat. Vetés, ültetés és trágyázás szezonális, nem minden hónapban elvégzendő feladat. Állatoknál etetés / gondozás / almozás / fejés vagy tojásgyűjtés jelenik meg. A további saját takarmányföld és a tűzifafeldolgozás külön munkacsoport. A gyümölcsös alapóra éves fenntartás és terméskezelés, a kezdeti telepítés saját munkáját külön nem méretezi. A ház saját építési munkája egyszeri, a havi gazdasági összegen kívül van.

A közös munka bontása a takarmány-jóváírásokkal korrigált sorokból indul, a közös feladatot egyszer mutatja. Eltérő fajlagos becsléseknél ugyanazt a konzervatív órakeretet bontja, mint az összesítés; az átlag és csúcs legnagyobb becslése eltérő családtól is származhat. A feladatok összege az eredeti óraszám, az elszámolás / óravállalás nem újabb fizikai feladat.

A JSON-formátum, helyi mentési kulcsok és korábbi numerikus eredmények változatlanok. Az új böngészőpróba `node tests/explain-browser.cjs`. A kinyitott családi részletek beviteli változtatáskor is nyitva maradnak; a bezárt összehasonlítás nem nyílik vissza automatikusan.

## Blog és legeltetés

A **Blog** fül (`blog.html`) első cikke reprodukálható elemzést és szerkeszthető összehasonlítást ad: állat saját takarmánnyal, állat vett takarmánnyal, illetve állat nélkül vett élelmiszerrel. A teljes CAPEX a termelőeszközök mellett a föld vételárát és vételi költségét is tartalmazza. Az OPEX, éves saját óra, időérték, tőkeköltség és eszközpótlási tartalék külön látszik. A Blog tőke- és időértéke elemzési tétel; nem írja át a családi tervet.

A két kiinduló hivatalos adat felhasználói gyűjtésből származik: KSH országos szántóátlag, 2024, kerekített 2,4 M Ft/ha; MNB-alapkamat 5,50%, 2026.08.26-i hatállyal, szeptember 22-i megerősítéssel. A cikk dátumokat, közvetlen forráslinkeket és adatminőségi korlátokat közöl. Alsópetényi, pásztói és ecsegi ingatlanhirdetések teljes ingatlanvétellel számoló referenciaként választhatók. Mindhárom életmódban a teljes hirdetési irányár kerül a CAPEX-be; az állat nélküli változat is megveszi ugyanazt az ingatlant. Külön látszik a ténylegesen megvett és igényelt terület, a területi hiány és a teljes birtok fenntartására megadott keret. A csomagárból számolt Ft/m² csak összehasonlító mutató, nem egy olcsóbb résztelekvásárlás ára.

A **Legelő** a Növények kategória külön tevékenysége. A szerkeszthető éves hasznosítható szárazanyaghozam és legeltetési napok alapján számítjuk be a füvet; a téli / kiegészítő saját takarmányhoz további szálastakarmány-föld marad. Nem vált ki gabonát vagy teljes takarmányreceptet. A legelő m²-e, költsége és órája a családi és közös terület-/költség-/munkabontásba is bekerül.

A régi JSON-ok betölthetők. Legelő nélküli terv a korábbi exportverzióján marad; legelőt tartalmazó terv 4-es formátumú. Az új oldal v5 helyi munkapéldányt ír, a v4 és korábbi mentéseket megőrzi. A külön telekábra előnézete mindkét mentéstípusnál a v5 változatot részesíti előnyben.

További ellenőrzések:

```sh
node --test tests/*.test.mjs
GYOKER_PLAYWRIGHT_MODULE=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright node tests/blog-browser.cjs
```

## Önellátási szintek és a birtokhoz illeszkedő családszám

A Blog két további, kivonattal kezdődő cikke:

- `blog-onellatas.html`: minden változatban 2 felnőtt és 2 gyerek. Alapcél: 100% zöldség, 50% gyümölcs, 100% tojás és ivótej; a második szint 100% húst, a harmadik 80% étkezési gabonát is kér. Kecske- és sertésprofilt használ, értékesítési bevétel nélkül. Külön látszik a 0 / 50 / 100% saját takarmány, a termelőegységek egészre kerekítése és a cél feletti termelés. A legtöbb fogyasztási, hozam-, költség- és munkaérték próbaadat.
- `blog-birtok-meret.html`: a teljes eladó ingatlant veszi alapul, és 1–24 négyfős család terveit vizsgálja. Közös vagy családonként külön termelőegység, vegyes önellátási cél, teljes terület, használható termőterület, lakóegység-korlát, pénz és munkaátlag/csúcs is szerepel. A javaslat a választott területi illeszkedési küszöböt elérő legkisebb elfogadható vizsgált létszám; nem univerzális optimum. Ismeretlen termőterület vagy lakóhelyszám mellett feltételes.

A teljes ingatlanvétel és egyszeri vásárlási költség családonként oszlik, a ház, infrastruktúra és tartalék kerete is bekerül. A birtok többletfenntartása az OPEX-ben és működési tartalékban egyszer szerepel. A használathoz még nem rendelt terület egyszerű arányos vételár-/alternatívaköltség-jelzése nem külön levonás vagy igazolt résztelekérték.

A `self-sufficiency.mjs` az alkalmazás meglévő `calculate` függvényét használja; a fő kalkulátort, JSON-formátumot és helyi mentéseket nem változtatja. A két cikk között csak a példa profilja kerül át a `gyoker-blog-self-profile` sessionStorage kulccsal. Ez ugyanazon böngésző-munkamenetre szól; nincs adatfeltöltés vagy családi mentés felülírása.

Ellenőrzés: `node --test tests/*.test.mjs`, valamint `tests/self-articles-browser.cjs` a korábban megadott Playwright-beállításokkal.

A blogkártyák és a cikkfejlécek közös szerzői jelvénye az `assets/gyoker-admin.svg`; a szerző neve **Gyökér admin**. Az „Első változat” pontos időpontja a cikket először felvevő Git-commit ideje, Europe/Budapest időzónára átszámítva, géppel olvasható `<time datetime>` jelöléssel. Ez ellenőrizhető verzióidőpont, nem a GitHub Pages telepítésének mért ideje. Az új cikkeknél a kártya és cikkfejléc szerzőjét, illetve időpontját együtt kell kitölteni.

## Konkrét ingatlan · a Reveal party utáni harmadik lépés

A **Konkrét ingatlan** fül a betöltött családok és egyeztetett közös tételek változatlan számításaiból indul. A teljes ingatlanár és az egyszeri vételi járulék kerül a CAPEX-be, a Reveal party vételi arányaival. A korábbi családi fix vételi díjakat nem vonja le még egyszer. A családi pénzek automatikus kiegyenlítése nincs.

A területarányos térkép külön zónája a **hasznosításra nem tervezett** és a **használatból kizárt** rész. A tervet túl kicsi ingatlannál nem zsugorítjuk észrevétlenül. A termőterület és lakóegységkorlát külön megadandó; ismeretlen esetben a becslés feltételes. A három beküldött hirdetés forráslinkje és bizonytalansága megmarad az adatlap mellett; a módosított referencia jelölést kap.

Az ismétlés teljes csoportcsomagokat számol; a tört maradékból nem talál ki új családi összetételt. Külön mutatja a legnagyobb **önálló** területigényű család tervének ismétlését. A területi ismétlési becslés nem automatikus pénzügyi vagy munkaügyi megfelelőség. A teljes vételár megoszlik, nem csökken a kisebb hasznosított földtől. A területarányos többletvétel és annak alternatívaköltsége elemzési bontás, nem további levonás.

Egyéni és mintacsalád mód is van: aktuális családi terv, betöltött helyi család vagy nyilvános 2 felnőtt + 2 gyerek példa választható. Privát családi JSON nem került a nyilvános mintába.

A **Rögzített gazdaság → családszám** mód a kijelölt terv termelőegységeit rögzíti, és a pozitív éves saját élelmiszercélok legszűkebb fedezetéből indul. A kézi mennyiségű termelőknél induló cél 100%, ami átírható; a nyilvános példa gyümölcscélja 50%. Az 1–24 család ellenőrzése közben a gazdaság állatai / m²-ei és takarmányigénye állandó; a ház, általános családi infrastruktúra és megélhetés nő a létszámmal. A mennyiségek és célok módosítására újraszámol, de az eredeti terv nem módosul. A visszaállító gomb az aktuális mintaterv mennyiségeit veszi át. Bevételt a többlettermelésből nem feltételez.

A `property-analysis.mjs` külön elemzőmodul a meglévő `calculate` / `aggregate` fölött. A családi és közösségi JSON-formátum és mentési kulcsok változatlanok. Az ingatlanadatlap és a rögzített gazdaság beállításai külön `gyoker-property-v1` helyi kulcson mentődnek. A letölthető `gyoker-property-summary` összegző riport külön dokumentum, nem visszatölthető családi / közösségi terv; a fő JSON-okat továbbra is külön kell menteni.

Most kézi / referenciaadatokkal működik, automatikus hirdetéslink-beolvasás nincs. A csak saját csapatnak szánt, Docker + Tailscale Serve alapú későbbi API javaslata: [Privát backend](docs/private-backend.md).

Célzott ellenőrzések:

```sh
node --test tests/*.test.mjs
GYOKER_PLAYWRIGHT_MODULE=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright node tests/property-browser.cjs
```
