# Privát hirdetésbeolvasó — scope és működési szerződés

Állapot: tervezet, 2026. október 15. Nem kész backend vagy ellenőrzött szervertelepítés.

A helyben kiadható prompt: [private-backend-prompt.md](private-backend-prompt.md). A Jira-ba másolható bontás: [private-backend-jira.md](private-backend-jira.md). Az architektúra előzménye: [private-backend.md](private-backend.md).

## 1. Cél és meglévő rendszer

A csapat egyik tagja megnyitja a Gyökér privát példányát, beilleszt egy támogatott ingatlanhirdetés-linket, és kap egy ellenőrizhető ingatlanadatlapot. Jóváhagyás után a meglévő kalkulátor az ingatlanra illeszti az egyéni vagy Reveal party családi terveket. A termelőegységek és önellátási célok változtatására az elemzés helyben újraszámol.

A backend feladata a hirdetés elérhető adatainak **AI nélküli kinyerése** és azok eredetének jelölése. A családszámot, CAPEX-et, OPEX-et, tőkeköltséget, területet, munkaórát és vizet továbbra is a meglévő JavaScript-modell számolja. Nem készül második, eltérő szerveroldali számítási motor.

Meglévő illesztési pontok a `kovacsgpeter/prepcom` repóban:

| Fájl | Szerep |
| --- | --- |
| `property-view.mjs` | Konkrét ingatlan adatlap, helyi mentés, eredmények |
| `property-analysis.mjs` | Teljes ingatlanvétel, közös tervek, ismétlés és rögzített gazdaság |
| `model.mjs` | Családi és egyeztetett csoportos számítás |
| `property-references.mjs` | Három beküldött hirdetési pillanatkép; nem élő letöltések |
| `tests/property-analysis.test.mjs` | Ingatlanelemzés számítási próbái |
| `tests/property-browser.cjs` | Felület, mentések és importok böngészőpróbája |

## 2. Első verzió: benne van / későbbre marad

Az MVP része:

- Saját Linux szerveren Docker Compose szolgáltatás; a helyi felmérés igazolja az operációs rendszert és meglévő eszközöket.
- Tailscale csak a csapatnak, a meglévő tailnet hozzáférési szabályaival.
- Ugyanazon privát HTTPS-cím alatt statikus frontend és `/api/` backend.
- Első adapter: `ingatlan.com`, a ténylegesen hozzáférhető oldalakhoz. A támogatott URL-formákat a technikai próba pontosítja.
- Egyszerre egy hirdetés beolvasása, teljes vételár és teljes telekterület felismerése, forrásjelölés.
- Hiányos, ellentmondó, eltűnt és blokkolt hirdetések kezelése, kézi adatbevitel megtartása.
- Beolvasási előnézet és kifejezett alkalmazás a meglévő ingatlanadatlapra.
- Helyben futó determinisztikus tesztek, Docker-próba és két eszköz közötti privát elérési próba.

Későbbre marad:

- Más hirdetési portálok adapterei, tömeges keresés, értesítések és ingatlanadatbázis.
- AI, CAPTCHA-megoldás, botvédelem megkerülése, fizetős proxy, bejelentkezett böngésző cookie-jainak átvétele.
- Headless böngészős letöltés; csak külön indokolt második körben mérlegelendő.
- Automatikus jogi minősítés, családi lakóegységszám vagy termőhelyi alkalmasság megállapítása.
- Hirdetési adatokból meglévő házépítési költség automatikus elengedése.
- Nyilvános API, Tailscale Funnel, routeres portnyitás és első körben Pages → privát API kapcsolat.
- Saját felhasználói fiókok, családi JSON-ok szerveroldali tárolása, Jira-integráció.

## 3. Felhasználói folyamat

1. A csapattag a Tailscale-re csatlakoztatott eszközön megnyitja a privát Gyökér-oldalt.
2. Elkészíti az egyéni tervét, vagy betölti a családi / közösségi JSON-okat és egyezteti a Reveal party döntéseit.
3. A **Konkrét ingatlan** fülön beilleszti a hirdetés URL-jét, majd a **Hirdetés beolvasása** gombra kattint.
4. Előnézet jelenik meg: teljes ár, telekterület, település, épületre vonatkozó hirdetési állítások, forrás, letöltési időpont, bizonytalanságok. A meglévő adatlap ekkor még változatlan.
5. A felhasználó javíthatja a mezőket, majd az **Adatok alkalmazása** gombbal egyben átveszi az új ingatlant. Az alkalmazáshoz pozitív teljes telekterület kell; az ismeretlen ár maradhat ismeretlen.
6. Az ingatlan váltásakor a korábbi birtok termőterülete, kizárt része és lakóegységkorlátja nem öröklődhet át észrevétlenül. Alap: `productiveArea=null`, `maxHomes=null`, `excludedArea=0` külön „nincs megadott kizárás” jelzéssel. A nullás kizárás nem az egész birtok igazolt használhatósága. A felhasználó ezeket az új ingatlanhoz ellenőrzi és tölti ki.
7. A korábbi vételi költségkeret, kamat és többletfenntartási beállítás megtartható, de az előnézet jelezze, hogy ezek saját elemzési feltételezések, nem a hirdetés adatai.
8. A meglévő elemző megmutatja a családi igényeket, a még használathoz nem rendelt részt, a teljes vételi tőkét és a családonkénti költségeket. A későbbi tervmódosítás nem kér új hirdetésletöltést.

Hiba vagy megszakítás esetén sem a családi / közös terv, sem az aktuális ingatlanadatlap nem módosul. A kézi mód akkor is elérhető, ha az API nem működik.

## 4. Telepítési felépítés

```text
Csapattag böngészője, Tailscale
    → privát HTTPS: https://<gépnév>.<tailnet>.ts.net
    → Tailscale Serve a hoston
    → 127.0.0.1:<szabad-port>
    → Docker reverse proxy
         /       → a Gyökér kiválasztott verziójának statikus fájljai
         /api/   → backend a belső Docker-hálózaton
                      → kizárólag támogatott nyilvános hirdetési célok
```

Javasolt egyszerű stack: az adott időpontban támogatott Node.js LTS, Fastify, HTML-parser és JSON-séma-validálás; reverse proxyként nginx. A lokális scoping rögzítse a pontos verziókat és lockfile-t, vagy indokolja a már meglévő környezethez jobban illő alternatívát. A framework választása nem termékkövetelmény.

A host-port kizárólag loopbacken figyel; az API konténerének nincs külön publikált portja. A Tailscale az első verzióban a hoston marad. Külön Tailscale-konténer és auth key-kezelés nem szükséges. A Serve meglévő konfigurációját előbb fel kell mérni; más működő szolgáltatás gyökerét vagy útvonalát tilos felülírni. A port és a végleges cím helyben dől el, nem szükségszerűen 8080.

A privát példány és a GitHub Pages kiadása külön művelet. A privát image tartalmazzon egy rögzített frontend-commitot, a backend saját verziója legyen lekérdezhető. Visszaálláskor az előző frontend + backend páros álljon vissza. A statikus kiszolgálás csak engedett publikus állományokat tartalmazhat: nincs teljes munkakönyvtár-mount, `.git`, `.env`, privát mentés vagy teszt-fixture.

## 5. API v1 — javasolt szerződés

### Állapot

`GET /api/health`

Válasz `200`: szolgáltatásállapot, backendverzió és a telepített frontend commitja. Nem indít hirdetésletöltést és nem ad ki konfigurációs titkokat.

### Egy hirdetés beolvasása

`POST /api/listing`, `Content-Type: application/json`

```json
{"url":"https://ingatlan.com/35570089"}
```

Szemléltető sikeres válasz; az itt megadott értékek a felhasználó által korábban beküldött példából származnak, nem igazolt élő API-válasz:

```json
{
  "schemaVersion": 1,
  "requestId": "<kérésazonosító>",
  "status": "ok",
  "source": {
    "requestedUrl": "https://ingatlan.com/35570089",
    "canonicalUrl": "https://ingatlan.com/35570089",
    "provider": "ingatlan.com",
    "listingId": "35570089",
    "fetchedAt": "<UTC ISO-8601 időpont>",
    "adapterVersion": "<verzió>",
    "cacheHit": false
  },
  "listing": {
    "location": "Ecseg",
    "totalPriceHuf": 40000000,
    "plotAreaM2": 11541,
    "buildingPresence": "present",
    "buildingNote": "A hirdetés pincét említ; lakóházat ebből nem állapítunk meg."
  },
  "evidence": {
    "totalPriceHuf": {
      "method": "labelled_html",
      "locator": "<mezőcímke vagy DOM-szelektor>",
      "raw": "40 millió Ft",
      "approximate": false
    },
    "plotAreaM2": {
      "method": "labelled_html",
      "locator": "<telekterület mező>",
      "raw": "11 541 m²",
      "approximate": false
    }
  },
  "warnings": [],
  "requiresReview": true
}
```

A fenti példában az evidence csak két mező formáját mutatja; a tényleges szerződés minden nem null kinyert mezőhöz kérjen bizonyítékot vagy származtatási hivatkozást. A gépi időpont és azonosítók nem igényelnek HTML-bizonyítékot.

Mezőszabályok:

- `totalPriceHuf`: az egész hirdetett ingatlancsomag pozitív ára forintban, vagy `null`. Ft/m², „-tól”, ártartomány vagy más deviza nem kezelhető észrevétlenül fix teljes forintárként. Az MVP nem vált devizát; ilyenkor kézi adat és figyelmeztetés kell.
- `plotAreaM2`: pozitív teljes telekterület vagy `null`. A lakóház alapterülete nem helyettesítheti. Ha csak „közel 20 ha” érhető el, 200 000 m² csak `approximate=true` jelöléssel jelenhet meg. A forrásszöveg maradjon látható. Ellentmondó számoknál nincs önkényes választás.
- `location`: hirdetés szerinti település / településrész vagy `null`; geokódolás nem szükséges.
- `buildingPresence`: `present`, `absent` vagy `unknown`. Nem jelenti lakhatásra alkalmas épület meglétét. A `buildingNote` egyértelmű forrásadat vagy rövid idézet lehet.
- A jogilag elhelyezhető lakóegységek száma és megfelelő termőterület **nem API által igazolt adat**. Az MVP ne töltse ki a kalkulátor `maxHomes` és `productiveArea` mezőit szöveges következtetésekből. Beépítési százalék nem családszám.
- Bizonyíték rövid szöveg legyen, ne teljes hirdetésarchívum. A kinyerési módszer nem forrásellenőrzöttségi fok: JSON-LD adat is csak hirdetői állítás.
- A normalizálás legyen dokumentált és reprodukálható. Kötelező a magyar szóköz / tizedesvessző / millió / hektár kezelése a kifejezetten támogatott mezőkben.
- `status=ok`: teljes ár és telekterület is egyértelműen kinyert. `status=partial`: a hirdetés felismerhető, de valamelyik alapadat hiányzik vagy bizonytalan. Minden esetben kell emberi ellenőrzés.
- A `warnings` elemei stabil kódot, magyar üzenetet és érintett mezőt kapjanak. Például `APPROXIMATE_AREA`, `MISSING_PRICE`, `CONFLICTING_AREA`.

### Hibák

Stabil formátum: `schemaVersion`, `requestId`, `status="error"`, valamint `error: {code, message, retryable}`. Nem kell stack trace, helyi fájlút vagy nyers upstream válasz a kliensnek.

| HTTP | Kód | Jelentés |
| --- | --- | --- |
| 400 | `INVALID_URL` | Hibás vagy nem megengedett URL-forma |
| 422 | `UNSUPPORTED_PROVIDER` | Érvényes URL, de még nincs hozzá adapter |
| 404 | `LISTING_NOT_FOUND` | A forrás szerint nem található / megszűnt hirdetés |
| 502 | `UPSTREAM_BLOCKED` | A hirdetési oldal megtagadta a letöltést; nem a csapat jogosultsága hibás |
| 502 | `EXTRACTION_FAILED` | Letöltés sikerült, de nem felismerhető hirdetés vagy feldolgozási hiba |
| 504 | `UPSTREAM_TIMEOUT` | Időkorláton belül nem érkezett használható válasz |
| 429 | `RATE_LIMITED` | A saját szolgáltatás korlátja; `Retry-After` megadva |

Részleges adat lehet HTTP 200 `partial` válasszal. A tisztán blokkoló / bejelentkezési / CAPTCHA-oldal nem részleges siker. Túl nagy saját kérés 413; nem JSON kérés 415. Ezeket az OpenAPI-séma rögzítse.

## 6. Frontendhez illesztés és kompatibilitás

| API / saját adat | Meglévő kalkulátormező | Szabály |
| --- | --- | --- |
| `listing.totalPriceHuf` | `property.price` | Teljes ár, `null` esetén ismeretlen |
| `listing.plotAreaM2` | `property.area` | Csak pozitív értékkel alkalmazható |
| `source` + `evidence` | új, elkülönített proveniencia | Ne legyen statikus referenciahirdetésnek álcázva |
| kézzel ellenőrzött termőterület | `property.productiveArea` | Ismeretlen marad, amíg a felhasználó meg nem adja |
| kézzel ellenőrzött lakóegységkorlát | `property.maxHomes` | Ismeretlen marad, amíg a felhasználó meg nem adja |

A jelenlegi `referenceId` / `referenceEdited` a három beépített referenciára készült. A lokális implementáló tervezzen kompatibilis kiegészítést élő beolvasás forrásadatainak, a kézi módosítás jelölésének és az összegző riport forrástartalmának. Ne írja felül a beépített referenciákat és ne módosítsa szükségtelenül a családi / közösségi sémákat vagy a jelenlegi `gyoker-family-v5`, `gyoker-group-v5` mentéseket.

A publikus Pages-verzió ne küldjön automatikusan kérést privát címre. A beolvasó a privát példányban jelenjen meg, telepítési konfigurációval engedélyezve; a frontendben ne legyen titkos API-kulcs. A hiányzó vagy elérhetetlen backend nem blokkolhatja az oldal betöltését. Az API-válasz szövegét adatként kell megjeleníteni, nem HTML-ként végrehajtani.

A privát számításoknál megőrzendő:

- A teljes ingatlant kell megvenni; nem csökken a vételár a kisebb kihasználtságtól.
- A vételi költség egyszer szerepel; a családi arányok és közös döntések megmaradnak.
- Az MNB-ráta szerkeszthető elemzési feltevés; a backend nem frissíti magától.
- A területarányos kihasználatlan tőke diagnosztika, nem újabb levonás.
- A csoport ismétlése egész csoportcsomagokra számol, nem talál ki tört családokat.
- A legnagyobb család önálló területigénye külön összehasonlítás.
- A rögzített gazdaságban az állat- és növénymennyiség nem nő automatikusan a családszámmal.

## 7. Üzemeltetési alapok

Kezdő, helyben felülvizsgálandó korlátok: 4 KiB kérés, 2 MiB kitömörített letöltött tartalom, 10 másodperc teljes upstream művelet DNS-sel és átirányításokkal együtt, legfeljebb 3 átirányítás és 2 párhuzamos upstream kérés. Legfeljebb 5 kérés / perc valóban azonosított tailnet-kliensenként, plusz globális 30 / perc korlát. A kliensazonosítás a Serve / proxy tényleges viselkedésétől függ: a scoping mutassa meg, mi az igazolt kliensazonosító; tetszőleges `X-Forwarded-For` nem tekinthető hitelesnek. Az MVP globális korláttal indulhat, ha a kliensenkénti korlát még nem megalapozott.

Egyszerű memóriacache megengedett, javasolt 24 óra TTL-lel és legfeljebb 100 bejegyzéssel. A cache-hit adja vissza az eredeti letöltési időpontot; ne keltsen friss lekérdezés látszatát. A cache nem tartós adattár, újraindításkor elveszhet. Frissítés kérését is korlátozni kell. Blokkoló hibát ne cache-eljen teljes napra. SQL-adatbázis nem indokolt az MVP-hez.

Külső URL-letöltésnél kötelező az SSRF elleni védelem: támogatott HTTPS host + útvonal + 443 port, userinfo nélkül; DNS-feloldásnál és minden átirányításnál tiltott localhost, privát / link-local / metadata / tailnet címek, IPv4 és IPv6 változatokkal. A tényleges kapcsolat ne választhasson más, tiltott címet új feloldással: DNS-rebinding elleni megoldás és teszt kell. A fejlesztési teszt ne élő belső címeket támadjon, hanem injektált DNS / HTTP klienst használjon. A kliens által küldött hostnév nem lehet shell-parancs része.

A tailnethez tartozás önmagában nem azonos a csapattagsággal. A hozzáférési szabályoknál a Serve HTTPS célját ténylegesen elérő, szükséges csoport kapjon jogot; egy korábbi széles allow-szabály is számít. Az egyszerű MVP kizárólag a csapatnak szánt tailnetelérést használja; nincs nyilvános port, automatikus Funnel, konténerbe mountolt Docker socket vagy böngészőben tárolt szolgáltatási titok. A `/api/` csak azonos eredetű böngészőhívást fogadjon, a nem megengedett `Origin` legyen elutasítva, és ne legyen `Access-Control-Allow-Origin: *`.

Napló: kérésazonosító, adapter, állapot, időtartam, stabil hibakód. Ne logoljon családi JSON-t, pénzügyi adatot, cookie-t, tokent, teljes HTML-t vagy tetszőleges URL-queryt. A HTTP- és alkalmazásnaplók mérete is legyen korlátos. A szolgáltatás induljon újra host-újraindítás után, és dokumentáltan állítható legyen le / vissza az előző verzióra.

## 8. A scoping kimenete és a kész állapot

A helyi scoping előbb csak olvasás: repó, OS / architektúra, Docker Compose, Tailscale, meglévő Serve-szolgáltatások, szabad loopback-port, kívánt telepítési könyvtár és frissítési mód. Titkos értékeket ne írjon ki és privát hostnevet ne tegyen publikus commitba. A hálózati próbát a helyi felhasználó külön megvalósítási feladata engedélyezze; a puszta scoping nem indít letöltéseket vagy telepítést.

A technikai első próba a letölthetőséget vizsgálja. Ha az ingatlan.com a saját szerverről sem elérhető normál módon, a csapat külön dönt a további adapterről vagy megmarad a kézi / referencia mód. Egy offline parser és kézi adatlap önmagában nem teljesíti az „élő linkbeolvasó kész” állítást. Az érintetlen Docker / API / frontend munkák ettől még elkészíthetők.

Az MVP akkor teljes:

1. Egy csapattag másik, Tailscale-es eszközről eléri a privát oldalt és API-t; az erre nem jogosult ellenőrző eszköz nem éri el.
2. Legalább egy ténylegesen hozzáférhető támogatott hirdetést élőben beolvas; a kézzel ellenőrzött teljes ár / telekterület és a forrás megegyezik. A három ismert hirdetés külön eredménylistát kap, nem feltételezzük, hogy mind még aktív.
3. A részleges / hibás / blokkolt beolvasás megfelelően jelzett, és nem módosít meglévő adatot.
4. Alkalmazás után a régi kalkulátor számol; a családi JSON-ok és közös döntések változatlanok. A kézi mód backend nélkül is működik.
5. A URL-, DNS-, átirányítás-, mennyiség-, bizonyíték- és korlátkezelés tesztjei, továbbá a releváns korábbi próbák sikeresek.
6. A privát kiadás verziója, újraindítása, frissítése és visszaállítása dokumentált és kipróbált. A nyilvános Pages nem változik privát szolgáltatássá.

A helyi scoping a nyitott kérdéseket „akadályozza az indulást” és „megvalósítás közben eldönthető” csoportban adja vissza, javasolt alapértékekkel. Az elkészült leírást Jira-taskokra lehet bontani; a jelen dokumentáció nem hoz létre Jira-ticketeket.
