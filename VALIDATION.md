# Ellenőrzés — 2026. október 13.

## Számítások

`node --test tests/model.test.mjs` — **18 teszt**, nincs kihagyott teszt. A konkrét esetek:

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

## Böngésző

`tests/browser.cjs` — **7 sikeres munkafolyamat**, Chromium, asztali 1440 px és mobil 390 px szélesség:

1. Keret csúszka és számmező szinkronja, egérrel mozgatott háromszög, pénzügyi nézetváltás.
2. Családi JSON letöltés és visszatöltés, a források megőrzésével.
3. Két család betöltése, ismétlődő terv kiszűrése, hat színes pont, közös tétel, 60/40 vételárrész, havi pénz- és óravállalás, kézi földár, telekdiagram.
4. Közös munkamenet mentése és teljes visszatöltése az egyeztetésekkel együtt.
5. Kilenc kutatási adattábla közvetlen hivatkozásokkal; forrás szerkesztése és exportja; hibás családi import elutasítása a jelenlegi terv megtartásával.
6. Régi, telekár nélküli és fedezethiányos JSON; 0-ra korlátozott vételárkeret, külön hiány; kézi telekár és törlése; koppintható és Esc-kel bezárható súgók; csúcsleírás megnyitása a terv módosítása nélkül; külön Útmutató fül.
7. Mind a négy nézet mobilon az oldal vízszintes túllógása nélkül; helyi mentés visszaállítása újratöltés után; nincs böngészős futásidejű hiba.

Futtatás: indítsd az útmutató szerinti HTTP-kiszolgálót, majd Playwrightot tartalmazó Node-környezetből:

```sh
node tests/browser.cjs
```

Opcionális tesztbeállítások: `GYOKER_PLAYWRIGHT_MODULE` egy telepített Playwright modul útvonala; `GYOKER_CHROMIUM_EXECUTABLE` a Chromium bináris; `GYOKER_BASE_URL` a tesztkiszolgáló címe. A teszt külön ideiglenes könyvtárba menti a JSON-okat és képernyőképeket. A weboldal működéséhez Playwright nem szükséges.

## Mit nem igazolnak ezek a próbák?

Az adatok agronómiai vagy építőipari helyességét, a forráscikkek aktuális tartalmát, helyi jogi megfelelést, valós közműkapacitást, illetve GitHub Pages publikálást. A feltöltött családi exporttal külön is ellenőriztük a hiánykijelzést és a kézi telekárszámítást; a felhasználó JSON-ját nem tettük a repositoryba.

A Word-dokumentumból származó számok és hivatkozások felhasználói gyűjtésként szerepelnek; a hálózati szabályok miatt az eredeti weboldalakat nem ellenőriztük önállóan. A forrás nélküli együtthatók tervezési próbaértékek.
