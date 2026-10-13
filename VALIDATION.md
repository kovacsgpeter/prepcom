# Ellenőrzés — 2026. október 13.

## Számítások

`node --test tests/model.test.mjs tests/plot.test.mjs tests/food.test.mjs` — **34 teszt**, nincs kihagyott teszt. A konkrét esetek:

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

Az új `tests/food-browser.cjs` az önellátási módváltást, fogyasztás-felülírást, éves hozam módosítását, egész állatot és többletet, nulla célt, szinkronizált százalékcsúszkát, takarmányterület változását, kézi értékek megőrzését, forrás mentését, 2-es JSON-exportot, közös élelmiszer-összegzést, mobilos megjelenést, újratöltést és a régi családi / közösségi helyi mentés megőrzését ellenőrzi. A külön Újdonságok oldal menülinkjét, négy bejegyzését, a publikálási állapotot és mobilos túllógásmentességét is vizsgálja.
