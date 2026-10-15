# Csak a csapatnak elérhető hirdetésbeolvasó

Ez a szolgáltatás javasolt kialakítása; a repositoryban jelenleg nincs működő hirdetésbeolvasó API, és személyes szerverre sem telepítettünk semmit. A statikus kalkulátor kézi adatokkal és a beküldött referenciahirdetésekkel önállóan használható.

A megvalósítás előkészítéséhez elkészült a [részletes scope és API-szerződés](private-backend-scope.md), a [helyben kiadható fejlesztési prompt](private-backend-prompt.md) és a [Jira-ba másolható taskbontás](private-backend-jira.md). A prompt alapállapota csak helyi felmérés; implementálás és privát telepítés külön választható fázis.

## Ajánlott megoldás

A GitHub Pages marad a nyilvános kalkulátor. A csapatnak a saját szerveren ugyanennek a felületnek egy privát példánya és a beolvasó API **egy HTTPS-címen** fusson:

```text
Csapattag böngészője + Tailscale
        ↓ privát HTTPS
Tailscale Serve
        ↓ 127.0.0.1:8080
Docker szolgáltatás / reverse proxy
        ├── /       statikus Gyökér-felület
        └── /api/   hirdetésbeolvasó backend
```

A böngésző innen a relatív `/api/listing` útvonalat hívja, és JSON-választ kap. A kalkuláció továbbra is a böngészőben maradhat: az API-nak csak a hirdetés adatait kell kinyernie. A családi JSON-okat, pénzügyeket és közös döntéseket emiatt nem kell elküldeni a szervernek.

A szerver Docker-portját csak localhostra kell kötni, például `127.0.0.1:8080:80`; a routeren nem szükséges publikus portnyitás. A már beállított Tailscale-gépen a helyi szolgáltatás például `tailscale serve --bg http://127.0.0.1:8080` paranccsal tehető elérhetővé a tailneten. A pontos beállítást a telepített Tailscale verzió `serve --help` kimenetével kell egyeztetni. A Tailscale hozzáférési szabályai csak a csapatnak engedjék a szolgáltatást. A csapattag eszközének csatlakoznia kell a tailnethez. **Tailscale Funnel nem kell**, az nyilvános hozzáférésre való.

A webes gyökérbe csak a publikus HTML / CSS / JavaScript / képállományok kerüljenek; `.git`, feltöltött privát JSON, környezeti beállítás vagy szerveres titok ne. A privát frontend frissítése külön telepítési lépés lesz, a Pages frissítése nem frissíti magától.

## Hívhatja közvetlenül a GitHub Pages is?

Igen, ha a felhasználó böngészője eléri a privát szervert, van érvényes HTTPS, a backend kifejezetten engedi a Pages eredetét CORS-szal, és a böngésző helyi hálózati hozzáférési szabályai is megengedik a kérést. Ez böngészőtől és beállításoktól is függ. A nyilvános Pages látogatói önmagában ettől nem kapnak tailnet-hozzáférést. Azonos privát eredetű frontend + API esetén a külön eredetből adódó akadályok elmaradnak, ezért a csapatnak ezt javasoljuk.

## AI nélküli adatkinyerés

Szerveroldali HTTP-letöltésből a hirdetés strukturált JSON-LD adatai, metaadatai vagy HTML-elemei feldolgozhatók determinisztikus kóddal. Ez nem univerzális: weboldalanként adapter és karbantartás kell. Belépés, botvédelem, dinamikus tartalom vagy nem hozzáférhető oldal esetén a szolgáltatás érthető hibát adjon, és maradjon a kézi adatlap. A három eddigi hirdetés itt csak felhasználó által beküldött pillanatkép, nem élő lekérdezés.

Javasolt API: `POST /api/listing`, törzs `{ "url": "https://ingatlan.com/..." }`. A válaszban a forrás URL-je, lekérdezési időpont, hirdetésazonosító, település, teljes irányár, teljes terület, épületre vonatkozó adatok és a kinyerés állapota szerepeljen. Ismeretlen érték `null` legyen, ne nulla. A jogilag elhelyezhető családi otthonok számát és a valóban megfelelő termőterületet a hirdetés szövege alapján ne állítsuk automatikusan igazoltnak.

A szerver csak támogatott hirdetési domaineket és megfelelő HTTPS URL-eket töltsön le, az átirányításokat is ellenőrizve. Belső hálózati / localhost célokat, tetszőleges portokat és túl nagy / túl lassú válaszokat utasítson el. A csapaton belüli hozzáférés nem helyettesíti a szerveroldali URL-ellenőrzést.

A kinyert adatokat a felhasználó ellenőrizze és fogadja el a konkrét ingatlan adatlapján. Ezután a már megvalósított helyi elemző számolhat a teljes vételárral, családokkal és a használathoz nem rendelt területtel.

A tényleges telepítéshez a szerver operációs rendszere, Docker- és Tailscale-állapota, a hozzáférési szabályok és a választott privát gépnév szükséges. Ezek ebben a munkamenetben nem álltak rendelkezésre.
