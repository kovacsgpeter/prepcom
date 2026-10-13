# Ellenőrzés — 2026. október 13.

## Számítások

`node --test tests/model.test.mjs tests/plot.test.mjs tests/food.test.mjs tests/crops.test.mjs tests/wood.test.mjs tests/explain.test.mjs tests/labor.test.mjs` — **63 teszt**, nincs kihagyott teszt. A konkrét esetek:

- Induló keret zárt elszámolása, tartalékkal és vételi járulékos költségekkel.
- Régi JSON telekár nélkül továbbra is betölthető; ár nélkül a vételár ismeretlen, nem nulla.
- Kézi egységárból vételár, járulékok és teljes finanszírozási hiány számítása.
- Túltervezett költségkeretnél a rendelkezésre álló vételárkeret 0, a telek nélküli hiány külön mutatható.
- Rögzített ház, állatállomány és tartalék megőrzése a háromszög minden csúcsán.
- Egész állat- és faszám; tört m² megengedett.
- Megadott takarmányterület egyszeri beszámítása, a gabona és szálastakarmány külön kezelése.
- Gazdálkodási változtatás csak engedélyezett megoldásokkal.
- Földkeret-nézetben rögzített kívánt tartalék.
- Egyenlő telekrészek mellett 10/20/30 M Ft családi keretből 30 M Ft közös vételárkorlát, automatikus összeadás nélkül.
- Közös jelölés önmagában nem von össze tételeket; jóváhagyás után egyszer szerepelnek.
- Összevont takarmányterület hozama nem használódik fel kétszer két család állataihoz.
- Közös szerszám és tároló költsége / területe egyszer számít.
- Csak egy család által javasolt közös tevékenység is közös döntést kér.
- A belső munkadíjak összege nulla; fedezetlen munka nem válik elvégzett munkává. Külső segítség külön opció.
- Hibás összegek, darabszámok, háromszögsúlyok és veszélyes forrás-URL-ek elutasítása.
- Hibás közös arányok, mennyiségek és túlzott óravállalások elutasítása.
- Háromszögpontok vetítése és geometriai visszaalakítás.

A térkép további öt tesztje: családi területek egyszeri teljes lefedése; összevont közös tároló és takarmányterület helyes területösszege; arányos, nem átfedő téglalapok és változatlan tételazonosítók; biztonságosan escape-elt címkék és üres terület kezelése; egycsaládos reveal a saját közös pillanatképre hivatkozik.

## Böngésző

`tests/browser.cjs` — **8 sikeres munkafolyamat**, Chromium, asztali 1440 px és mobil 390 px szélesség:

1. Keret csúszka és számmező szinkronja, egérrel mozgatott háromszög, pénzügyi nézetváltás.
2. Családi JSON letöltés és visszatöltés, a források megőrzésével.
3. Két család betöltése, ismétlődő terv kiszűrése, hat színes pont, közös tétel, 60/40 vételárrész, havi pénz- és óravállalás, kézi földár, telekdiagram.
4. Közös munkamenet mentése és teljes visszatöltése az egyeztetésekkel együtt.
5. Kilenc kutatási adattábla közvetlen hivatkozásokkal; forrás szerkesztése és exportja; hibás családi import elutasítása a jelenlegi terv megtartásával.
6. Régi, telekár nélküli és fedezethiányos JSON; 0-ra korlátozott vételárkeret, külön hiány; kézi telekár és törlése; koppintható és Esc-kel bezárható súgók; csúcsleírás megnyitása a terv módosítása nélkül; külön Útmutató fül.
7. Mind a négy nézet mobilon az oldal vízszintes túllógása nélkül; helyi mentés visszaállítása újratöltés után; nincs böngészős futásidejű hiba.

8. Családi / háromcsaládos előnézet, ház-, üvegház- és gyümölcsfa-rajzok; közös blokk; kattintható és billentyűzettel kiválasztható zónák; a jelenlegi közös terv megnyitása; saját JSON-import a helyi családi mentés felülírása nélkül; mobilos előnézet túllógás nélkül.

Futtatás: indítsd az útmutató szerinti HTTP-kiszolgálót, majd Playwrightot tartalmazó Node-környezetből:

```sh
node tests/browser.cjs
```

Opcionális tesztbeállítások: `GYOKER_PLAYWRIGHT_MODULE` egy telepített Playwright modul útvonala; `GYOKER_CHROMIUM_EXECUTABLE` a Chromium bináris; `GYOKER_BASE_URL` a tesztkiszolgáló címe. A teszt külön ideiglenes könyvtárba menti a JSON-okat és képernyőképeket. A weboldal működéséhez Playwright nem szükséges.

## Mit nem igazolnak ezek a próbák?

Az adatok agronómiai vagy építőipari helyességét, a forráscikkek aktuális tartalmát, helyi jogi megfelelést, valós közműkapacitást, illetve GitHub Pages publikálást. A feltöltött családi exporttal külön is ellenőriztük a hiánykijelzést és a kézi telekárszámítást; a felhasználó JSON-ját nem tettük a repositoryba.

A Word-dokumentumból származó számok és hivatkozások felhasználói gyűjtésként szerepelnek; a hálózati szabályok miatt az eredeti weboldalakat nem ellenőriztük önállóan. A forrás nélküli együtthatók tervezési próbaértékek.

## Önellátási mód és kompatibilitás

A 11 új számítási teszt a hat kért termékcsoportot, a felfelé kerekítést és többletet, nulla célt, létszámos / kézi fogyasztást, azonos termék közös igényét, rögzített célokat, egyszer számított közös termelést, konzervatív eltérő hozamokat, a közös termelési hiányt, takarmányterület-beszámítást és hibás importokat ellenőrzi.

Külön, helyi összehasonlítás készült a publikált `280ebbd46e8102ff6824a2fd48ab49a70268dcd1` számítási modelljével: **98 egyező eredmény**. A régi mintatervet és a felhasználó privát JSON-ját mindkét pénzügyi móddal, háromszögcsúcsokkal és középponttal, 0 / 50 / 100% takarmánnyal, minimum- és aktuális tervként vetettük össze; két közösségi eset is szerepelt. Minden korábban létező eredménymező egyezett, az új mezőket nem tekintettük eltérésnek. A privát terv és a régi modell ideiglenes összehasonlítási másolata nincs a repositoryban.

Az új export séma 2-es, a régi 1-es import támogatott. A korábbi helyi mentési kulcsokat megőrizzük; az új mentés külön kulcsra kerül. A régi kliens az új exportot verzióhiba miatt visszautasítja, és nem számol belőle kézi mennyiségekkel.

A fogyasztási és hozamszámok agronómiai hitelességét ezek a tesztek nem igazolják.

Az új `tests/food-browser.cjs` az önellátási módváltást, fogyasztás-felülírást, éves hozam módosítását, egész állatot és többletet, nulla célt, szinkronizált százalékcsúszkát, takarmányterület változását, kézi értékek megőrzését, forrás mentését, 2-es JSON-exportot, közös élelmiszer-összegzést, mobilos megjelenést, újratöltést és a régi családi / közösségi helyi mentés megőrzését ellenőrzi. A külön Újdonságok oldal menülinkjét, hét bejegyzését, a publikálási állapotot és mobilos túllógásmentességét is vizsgálja.

## Új növények — kompatibilitás a publikált önellátási változattal

Hat új modellteszt ellenőrzi a korábbi élelmiszerprofil bővítését, a saját együtthatók megőrzését, ismételt import változatlanságát, hibás profilok elutasítását, a külön burgonya- és csemegekukorica-igényt, kajszifák egészre kerekítését, kukoricahozam egyszeri takarmánybeszámítását és az új tevékenységek családi / közös térképét.

A publikált `96ab1a0492f33c40cca008965e27ff5e17acaade` modellel **146 helyi összehasonlítás** készült: korábbi mintaterv, privát felhasználói export, saját fogyasztást és hozamot használó önellátási terv, két pénzügyi mód, csúcsok és középpont, 0 / 50 / 100% takarmány, minimum- és aktuális terv, valamint két közösségi eset. Minden korábbi eredménymező egyezett a konyhakert szándékosan pontosított megnevezésétől eltekintve. A privát export nem került a repositoryba.

A `tests/crops-browser.cjs` külön bizonyítja a korábbi v2 családi és közösségi helyi mentések változatlan megőrzését, az új v3 munkapéldányba való átállást, mind az öt új választási lehetőséget, az önellátási módot, külön burgonyafogyasztás felülírását, kukorica felhasználási célok szétválasztását, JSON-exportot és újratöltést, közös leltárt, valamint a mobilos oldalt és Újdonságok bejegyzést. A korábbi `tests/browser.cjs` és `tests/food-browser.cjs` teljesen sikeres maradt. Egyik böngészőpróba sem jelzett futási hibát.

## Tűzifa-modul

11 új modellteszt ellenőrzi a fenntartható hozamból számított területet, a forduló egyszeri alkalmazását, száradási és készletigényt, külön tárolóterületet és induló beszerzési keretet, meglévő állományt és készletet, kertautomatizálástól független erdészeti munkát, rögzített célt / kézi területet / nulla célt, kitermelési munkacsúcsot, egyszer elszámolt konzervatív közös hozamot és hiányt, pontos családi/közös térképet, korábbi terv megőrzését, import- és forrásvalidálást, valamint a fűtési keret egyszeri kiegészítését. A fűtési keret hiánypótlása háztartási tétel marad közös terület mellett is.

A publikált `0ee6aa8474254f32dd20173adc9ae0793df3e774` modellhez képest 146 összehasonlításban minden korábbi eredménymező azonos maradt, a korábbi növényprofilt és a privát családi exportot is beleértve. Az új modul nélkül a tűzifa-összegzés üres, a tervben új tevékenység nem jelenik meg.

A `tests/wood-browser.cjs` bizonyítja a v3 családi és közösségi helyi mentés változatlan megőrzését, a v4 munkapéldányt, a tűzifa cél- és hozamszámítását, a forduló változtatásakor állandó területet, meglévő állomány és tárolás jelölését, forrásszerkesztést, 3-as családi / közös JSON-exportot és közös visszatöltést, a túl kicsi közös terület hiányjelzését, valamint a mobilos felületet és Újdonságok oldalt. A három korábbi böngészőpróba is sikeres. A helyi tesztkiszolgálót üres HTTP-válasz után újraindítottuk fájlba irányított naplóval; a funkcionális próbák ezután sikeresek.

A próbák nem igazolják az erdészeti és fűtéstechnikai együtthatók szakmai helyességét. Ezek mindenhol módosítható, forrás nélküli próbaértékként szerepelnek.

## Költség, terület és feladatonkénti munka

12 új teszt ellenőrzi a költségbontások zárt összegét saját építési munkával, beszerzés kihagyásával, öntözéssel, gépesítéssel, további takarmánnyal és tűzifakészlettel; a tervezési 80 M Ft × 6% = 4,8 M Ft példát; a tényleges költségből számolt biztonsági keretet; mindkét területnézet 100%-os egyszeri elszámolását; közös terület és korrigált takarmány / tároló megjelenítését; a próbák változatlanul hagyott bemeneteit; üres tervet; valamint feladatokra osztott átlag-, éves és csúcsórák pontos összegét családi / közös használatnál, saját takarmány és tűzifafeldolgozás mellett is.

A publikált `5943984b7ae39ef9864fbee373dabaca15c53c0e` számítási modellhez képest **194 helyi összehasonlításban minden korábbi eredménymező egyezett**. Korábbi mintaterv, privát export, önellátási és tűzifás terv, két pénzügyi mód, csúcsok / középpont, takarmányarányok, minimum / aktuális terv és két közösségi eset szerepelt. Csak az új magyarázati bemenetek jelennek meg új eredménymezőként; a terv vagy export számai nem módosulnak.

A `tests/explain-browser.cjs` ellenőrzi a négy lenyitható költségsort, a tervezési példát, a részösszegeket és forrásokat, az állat / takarmány területi arányát, a munkafeladatok óráit, a nyitott és bezárt részletek állapotának megtartását, a próbák mentést nem módosító működését, a 0,45 / 0,70-es hozamok és kukoricatermés jóváírásának magyarázatát, a közös terület és munka pontos elszámolását, mobilos felületet és Újdonságok oldalt. Mind a négy korábbi böngészőpróba is sikeres volt, futási hiba nélkül.

A részletes feladatarányok szakmai helyességét ezek a próbák nem igazolják: azok külön jelölt, forrás nélküli próbaelosztások. A költség- és területrészletek a korábbi modell értékeit magyarázzák, annak adatminőségi korlátait nem oldják fel.

## Blog, összehasonlító gazdasági elemzés és legelő

16 új teszttel összesen 79 modell-/térkép-/magyarázatteszt sikeres. A legelő szezonális beszámítása külön kezeli a hasznosítható szárazanyagkapacitást, az állatok teljes éves igényének legeltetési napok szerinti részét és az éves saját takarmánycélt. A próbák ellenőrzik a 0 / 365 napot, nulla területet, téli kiegészítést, gabonával való összekeverés elkerülését, 40%-os éves cél helyes beszámítását, közös / családi legelőt és állományt, konzervatív közös napokat, egyszer elszámolt területet, import- és forrásvalidálást, valamint a 4-es exportot. A legelő esőre alapozott kezdő modelljére a kerti automata öntözés nem kerül rá.

A Blog három változata azonos éves élelmiszercélt használ: saját takarmány, vásárolt takarmány és állat nélküli vásárolt élelmiszer. A tesztek ellenőrzik a közös fő kalkulátorból átvett föld-/CAPEX-/OPEX-/óraszámokat, a teljes CAPEX-ben szereplő földárat és vételi költségeket, a teljes tőkére egyszer számolt kamatot, saját idő értékét és eszközpótlást, hiánypótló élelmiszervásárlást, bevétel nélküli többletet, gazdasági határárat, nulla állományt és hibás bemeneteket. A három pontosan beküldött hirdetési link, ismeretlen fajlagos ár kezelése és az alsópetényi közelítő terület is ellenőrzött.

A korábbi publikált `3b9d0f9907d84df5e43206654357c993d427754b` modellhez képest **194 helyi számszerű összehasonlításban minden korábbi eredménymező változatlan**: mintaterv, privát felhasználói JSON, önellátási és tűzifás terv, két pénzügyi mód, háromszögcsúcsok / középpont, 0 / 50 / 100% takarmány, minimum / aktuális terv és közösségi esetek. Új legelőt nem aktiválunk betöltéskor; a privát export nem került a repositoryba.

Mind az öt korábbi böngészőpróba és a `tests/blog-browser.cjs` sikeres, futási hiba nélkül. Az új próba ellenőrzi a korábbi v4 családi / közösségi mentések változatlan megőrzését, v5 munkapéldányt, legeltetési napok változtatását és téli hiánymagyarázatot, családi térképet, 4-es családi / közösségi exportot és visszatöltést, KSH-alapárat és MNB-alapkamatot, földár CAPEX-re gyakorolt hatását, nulla kamatot, példaváltást és visszaállítást, élelmiszertöbbletet, három ingatlanreferenciát és fajlagos ár alkalmazását, a családi / közösségi mentéseket nem módosító blogszámítást, hét szakmai forrást, 390 px széles mobilnézetet és nyolc Újdonságok bejegyzést. A közös telekábra előnézete is a v5 mentésből olvas, korábbi kulcsokra visszaeséssel.

A tesztek számítási konzisztenciát és működést igazolnak, nem a szakmai próbaegyütthatók helyességét. A forrásdokumentumok önálló online ellenőrzése 403 hálózati tiltás miatt nem volt lehetséges. A KSH 2024-es, kerekített 2,4 M Ft/ha szántóátlagát, az 5,50%-os MNB-alapkamatot (2026.08.26., szeptemberi megerősítéssel), valamint a három hirdetés leírását és árait a felhasználó küldte be. Ezt a cikk nyíltan megkülönbözteti a saját ellenőrzéstől és a forrás nélküli költség-/munkabecslésektől. Alsópetény területe közelítő; a hirdetésárak nem tiszta szántóárak vagy lezárt tranzakciók.

A konkrét hirdetésekhez két további teszt ellenőrzi a **teljes birtok vételét minden életmódváltozatban**: Alsópeténynél mindig 95 M Ft vételár, nem a szükséges terület × 475 Ft/m². A közös földvétel kiesik a saját és vásárolt takarmány különbségéből, de az induló tőkében és éves kamatban teljes egészében megmarad. A megvett méret, a közös ház/kert helyigénye, ismeretlen vagy elégtelen takarmányrész, a teljes terület elégtelensége, fix vételi költség és a birtok többletfenntartásának egyszeri alkalmazása is ellenőrzött. A böngészőpróba bizonyítja, hogy teljes birtokmódban az egységár átírása nem csökkenti a CAPEX-et, és minden oszlop ugyanazt a teljes irányárat tartalmazza. Összesen 81 modellteszt sikeres.

## Két új önellátási / ingatlanillesztési cikk

17 új modellteszt és az összes korábbi teszt sikeres: **98 teszt** összesen. Ellenőrzött a 2 felnőtt + 2 gyerek állandó családlétszám, a felhasználó által elfogadott termékcélok, nettó termelés, egészre kerekítés és bevétel nélküli többlet; a takarmányarány függetlensége az élelmiszer-önellátástól; ház-, kiszolgáló-, állattartási és termőterület pontos összege; hús és étkezési gabona külön hozzáadása; közös igényre újraszámított és külön családi állományok; vegyes célok; alacsonyabb hozam és nulla cél.

A fixingatlan-számítás próbái ellenőrzik, hogy a teljes irányár és vételi költség minden családszámnál egyszer kerül a beruházásba; ugyanaz a birtoktőke többfelé oszlik, nem lesz olcsóbb összesen. A valódi termőkeret és lakóegységszám a teljes m²-től független korlát; ismeretlen adatoknál az eredmény feltételes. Az átlagos munka mellett a csúcs, a pénzkeret, a választott illeszkedési küszöb és az 1–24-es keresési tartomány is korlátoz. A birtok többletfenntartása a havi igénybe és működési tartalékba pontosan egyszer kerül, a CAPEX-et nem növeli. A területarányos „még használathoz nem rendelt” érték csak tájékoztató bontás a teljes vételen belül. A modul nem módosítja a bemeneti profilokat, ingatlanadatokat vagy alkalmazás-alapértékeket.

A `tests/self-articles-browser.cjs` sikeres: négyfős forgatókönyvek, takarmányarány és mennyiségi többlet, sessionStorage alapú profilátvitel, fixingatlan-létszám, hiányzó termő- és lakóadat, lakóegységkorlát miatti kizárás, közös/külön állomány, vegyes célok és hibás létszámok, konkrét hirdetésre váltás, családi/közösségi mentések változatlansága, 390 px széles mobilnézet, bloglinkek és kilenc Újdonságok bejegyzés. A mobilpróbák két túlnyúlást találtak (hosszú átviteli gomb és checkbox szélesség); célzott CSS-javítás után mindkét oldalon 390 px maradt a dokumentum szélessége. A korábbi `tests/blog-browser.cjs` is sikeres, futási hiba nélkül.

A családi/csoportos fő számítási fájlok változatlanok. A két új cikk szerkeszthető számításai a meglévő próbaadatokat használják; a tesztek azok szakmai helyességét és ingatlanok jogi/termőhelyi alkalmasságát nem igazolják. A cikkek külön jelzik a forrásolt / beküldött és forrás nélküli becsléseket, az életkor nélküli gyermekfogyasztási közelítést, a két tejelő kecske választott példaállományát, a gabona és takarmány elkülönítését, valamint a hipotetikus egyenlő pénz- és munkakereteket.

A négy további korábbi böngészőpróba (`food-browser`, `crops-browser`, `wood-browser`, `explain-browser`) az új, kilencbejegyzéses Újdonságok oldallal is sikeres. A változásnál összesen hat böngészős programot futtattunk sikeresen.
