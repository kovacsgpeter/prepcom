# Jira-bontás — privát hirdetésbeolvasó

Állapot: előzetes backlog, nem létrehozott Jira-ticketek. A `GY-BE-*` jelölések ideiglenes hivatkozások; Jira-import után a valódi kulcsokra cserélhetők. A méret relatív terjedelem, nem napra vállalt becslés; a helyi felmérés után módosítandó.

Kapcsolódó [scope és API](private-backend-scope.md), [lokális prompt](private-backend-prompt.md).

## Epic

**Cím:** Gyökér — csapaton belüli ingatlanhirdetés-beolvasó Tailscale-en

**Cél:** Támogatott URL-ből ellenőrizhető ingatlanadatlap, majd meglévő családi / Reveal party elemzés a teljes ingatlanra. Saját Docker-szerver, privát Tailscale HTTPS, AI nélkül.

**Siker:** Másik csapateszközről élő hirdetés importálható, az ellenőrzött adat alkalmazása a korábbi modellt használja. A teljes vételár, családi megosztás, kihasználatlan terület és többi igény helyesen jelenik meg; a régi tervek és a publikus Pages működnek.

## Áttekintő sorrend

| Task | Eredmény | Függőség | Méret |
| --- | --- | --- | --- |
| GY-BE-01 | Helyi felmérés és végleges MVP | — | S |
| GY-BE-02 | Élő portál-hozzáférés technikai próba | 01 | S–M |
| GY-BE-03 | API-séma és adatminőségi szerződés | 01 | S |
| GY-BE-04 | Backendváz, konfiguráció, health | 03 | S–M |
| GY-BE-05 | Korlátozott és védett HTTP-letöltés | 04 | M |
| GY-BE-06 | Ingatlan.com parser és normalizálás | 02, 03 | M |
| GY-BE-07 | Privát frontend előnézet és alkalmazás | 03, 04; integrációhoz 05, 06 | M |
| GY-BE-08 | Docker Compose, statikus csomag, proxy | 04; kiadáshoz 05–07 | M |
| GY-BE-09 | Tailscale privát telepítés és hozzáférés | 01, 08 | M |
| GY-BE-10 | Végponttól végpontig és regresszió | 05–09 | M |
| GY-BE-11 | Üzemeltetés, frissítés, rollback, átadás | 09, 10 | S–M |

A 02 és 03 a felmérés után egymástól függetlenül végezhető. A 06 offline része és a 07 mockolt felülete a teljes élő integráció előtt is elkészíthető. **A 02 eredménye döntési pont:** ha a portál nem tölthető le, nincs kész élő importer; az offline / kézi részek külön lezárhatók, a sikerígéretet nem lehet ezekre átnevezni.

## GY-BE-01 — Helyi infrastruktúra és végleges scope

**Típus:** Spike · **Méret:** S · **Függőség:** nincs

**Leírás:** Olvasási műveletekkel mérd fel a checkoutot, a tényleges célgépet, Docker / Compose / Node / Tailscale állapotot, meglévő Serve-útvonalakat és telepítési lehetőségeket. Pontosítsd az MVP-t a scope alapján.

**Eredmény:** Helyi környezeti leltár és rövid döntési dokumentum. Privát nevek / címek helyi mellékletben; publikus dokumentációban csak helyőrzők.

**Elfogadási feltételek:**

- Tények, feltételezések és hiányzó hozzáférések elkülönítve.
- Azonosított célgép, szabad loopback-port, telepítési útvonal és a meglévő szolgáltatásokat megőrző terv.
- Rögzített első adapter, API- és frontendhatár, pontosítandó technológiai verziók.
- Nincs telepítés, hálózati letöltés, konfigurációmódosítás vagy titokkiírás.
- A valóban szükséges döntési kérdések rövidek, ajánlott alapértékkel.

**Ellenőrzés:** Leltár és terv összevetése a helyi állapottal; a scoping után nincs nem szándékolt fájl- vagy szolgáltatásváltozás.

## GY-BE-02 — Ingatlan.com hozzáférhetőség és parserstratégia

**Típus:** Spike · **Méret:** S–M · **Függőség:** 01

**Leírás:** Külön engedélyezett implementálási feladatként, a tényleges szerverről, normál HTTP-kéréssel vizsgáld a támogatandó portált és a rendelkezésre álló strukturált / HTML adatot. A három korábbi hirdetés azonosítója: 35589984, 35567099, 35570089. Ezek ma lehetnek eltűnt vagy megváltozott oldalak.

**Eredmény:** Dátummal és módszerrel ellátott hozzáférhetőségi jegyzőkönyv; adapterstratégia és go/no-go javaslat. Teszt-fixture-höz szintetikus vagy megfelelően használható, személyes adattól tisztított minta.

**Elfogadási feltételek:**

- A HTTP-státusz és a tényleges tartalom együtt értékelt; botoldal nem siker.
- Legalább egy valódi, hozzáférhető hirdetés esetén a teljes ár és telekterület kézzel ellenőrzött. Ha ez nem teljesül, az eredmény kifejezetten akadály / no-go.
- Látszik, mely URL-formák és mezők támogatása reális, hogyan kezelhető a hiány / eltérés.
- Nincs CAPTCHA-megoldás, hitelesítő cookie importja vagy botvédelmi megkerülés.
- Live adat nem kerül automatikusan a három beépített pillanatkép helyére.

**Ellenőrzés:** Megismételhető, korlátozott letöltési próba; külön felsorolás az aktív, eltűnt és blokkolt példákról.

## GY-BE-03 — Verziózott API és forrásbizonyíték

**Típus:** Task · **Méret:** S · **Függőség:** 01

**Leírás:** Rögzítsd géppel ellenőrizhető OpenAPI / JSON-sémában a health, listing, ok / partial / error válaszokat. A scope konkrét mezőit és normalizálási szabályait használd.

**Eredmény:** Verziózott szerződés, példák és API-ellenőrzési tesztek.

**Elfogadási feltételek:**

- Teljes forintár, telekterület, hely, épületállítás, időpont, adapterverzió és mezőeredet szerepel.
- `null`, közelítő méret, hiány, deviza és ellentmondás kezelése egyértelmű.
- Hiányzó telekterület nem helyettesül házterülettel; fajlagos ár nem lesz teljes ár.
- Nincs automatikus jogi / termőhelyi megfelelőségi vagy lakóegységszám-állítás.
- Stabil hibakódok és magyar üzenetek, ellenőrizhető HTTP-státuszok.

**Ellenőrzés:** Pozitív, részleges és hibás példák sémavalidálása; hibás pozitív számok / típusok elutasítása.

## GY-BE-04 — Backendváz és működési állapot

**Típus:** Task · **Méret:** S–M · **Függőség:** 03

**Leírás:** Hozz létre elkülönített backendkönyvtárat támogatott, rögzített runtime-mal és lockfile-lal. Legyen health végpont, konfigurációvalidálás, request ID, hibakeret és adapter-interfész. Az upstream-kliens tesztben cserélhető legyen.

**Eredmény:** Helyben indítható API, dokumentált konfiguráció és automatizált API-próba.

**Elfogadási feltételek:**

- A health ténylegesen válaszol és jelzi a backend / frontend verziót.
- Hibás konfiguráció érthető indulási hibát ad titokkiírás nélkül.
- Ismeretlen domain és hibás törzs kontrollált hibát kap; nincs nyitott tetszőleges proxy.
- A frontend modellje nincs átmásolva és nincs családi tervet tároló endpoint.
- Tesztek nem igényelnek éles hirdetési hozzáférést.

**Ellenőrzés:** Lokális indítás, health kérés, API-séma és hibakezelési próbák.

## GY-BE-05 — Védett letöltés, korlátok és cache

**Típus:** Task · **Méret:** M · **Függőség:** 04

**Leírás:** Implementáld a scope szerinti host / útvonal / port ellenőrzést, DNS- és átirányítás-kezelést, SSRF-védelmet, idő- és méretkorlátokat, globális limitet, párhuzamosságot és memóriacache-t. Kliensenkénti limit csak igazolt kliensazonosítással.

**Eredmény:** Korlátozott HTTP-kliens és determinisztikus tesztkészlet, rövid fenyegetési / korlátdokumentációval.

**Elfogadási feltételek:**

- Localhost, privát, metadata, link-local és tailnet címek tiltva, IPv4 / IPv6 esetén is.
- A redirect-lánc minden tagja validált; DNS-rebinding nem irányíthat tiltott címre.
- URL-userinfo, nem engedett port / séma, domain-utánzat elutasítva.
- Idő-, kitömörített válaszméret-, redirect-, párhuzamossági és rate limit tesztelt.
- Cache-hit az eredeti letöltési idővel jelenik meg; cache-méret korlátos, blokkoló hiba nem marad bent teljes TTL-re.
- Külső URL vagy adat nem kerül shell-parancsba; napló nem tartalmaz nyers HTML-t vagy titkot.

**Ellenőrzés:** Injektált DNS / HTTP válaszokkal negatív tesztek, timeout és túlméretes tartalom; éles belső hálózati célokat nem kell megtámadni.

## GY-BE-06 — Ingatlan.com adapter, mezők és normalizálás

**Típus:** Task · **Méret:** M · **Függőség:** 02, 03; élő bekötéshez 05

**Leírás:** A technikai próba szerinti strukturált adatokból / címkézett HTML-ből reprodukálhatóan nyerd ki a mezőket. A parser kizárólag a védett HTTP-kliensen át kaphat élő tartalmat.

**Eredmény:** Verziózott adapter, szintetikus / sanitizált fixture-ök és mezőszintű bizonyítékok.

**Elfogadási feltételek:**

- Magyar számok, szóközök, tizedesvessző, millió Ft és hektár támogatása tesztelt.
- Telek- és házterület, teljes és fajlagos ár nem keveredik.
- Hiányzó, közelítő vagy ellentmondó adat megfelelő `partial` / warning eredményt ad.
- Pince vagy melléképület nem lesz automatikusan lakóház; beépítési százalék nem lesz családszám.
- A felismerhetetlen / botvédelmi oldal nem sikeres beolvasás.
- Minden visszaadott kinyert mező származása ellenőrizhető.

**Ellenőrzés:** Offline példák: teljes adat, hiányzó ár, közelítő hektár, más deviza, épületterület-csapda, több helyrajzi szám, eltérő forrásérték, botoldal. Élő próba külön, a 02 eredményének megfelelően.

## GY-BE-07 — Privát felületi import és forrásmegőrzés

**Típus:** Story · **Méret:** M · **Függőség:** 03, 04; teljes integrációhoz 05, 06

**Felhasználói igény:** Csapattagként linkből szeretnék adatlapot kapni, ellenőrizni és alkalmazni, hogy ne kelljen kézzel minden hirdetési adatot átmásolnom a terveimhez.

**Eredmény:** Privát kiadásban URL-input, betöltési állapot, előnézet, javítás, alkalmazás / megszakítás; kompatibilis forrásmentés és riport.

**Elfogadási feltételek:**

- Kizárólag relatív `/api/` hívás; a publikus kiadásban nincs automatikus privát API-hívás vagy kliensbe tett titok.
- Előnézetig változatlan az aktuális ingatlan; hiányzó pozitív telekterület pótlásáig nem alkalmazható.
- Új ingatlanra nem maradnak észrevétlenül a korábbi termő- / lakókorlátok. A kizárt terület 0 alapja is „nincs megadva” jelzést kap.
- Hiba, megszakítás és API-kiesés mellett a kézi mód és a korábbi tervek működnek.
- Az élő forrás és letöltési idő megmarad mentés / reload / összegző riport esetén; saját felülírás látható.
- A családi / közös JSON-formátum és számítási eredmény szükségtelen változtatás nélkül megmarad.
- Állat / m² / cél módosítása helyben újraszámol, nem indít új letöltést.
- Mobilon is használható és a kinyert szövegek nem futtathatók HTML-ként.

**Ellenőrzés:** Mockolt API-val böngészőteszt minden állapotra, tárolt adatok előtte / utána összevetése, rosszindulatú szövegminta, 390 px mobilnézet; az új integráció után korábbi ingatlanpróba.

## GY-BE-08 — Docker Compose és azonos eredetű proxy

**Típus:** Task · **Méret:** M · **Függőség:** 04; teljes kiadáshoz 05–07

**Leírás:** Készíts reprodukálható API + reverse proxy kiadást, engedett statikus fájlokból csomagolt frontenddel. A publikus Pages továbbra is build nélkül kiszolgálható maradjon.

**Eredmény:** Dockerfile-ok, Compose, privát példakonfiguráció, build / indítás dokumentáció, healthcheck.

**Elfogadási feltételek:**

- A proxy csak loopbackre kötött, az API nincs külön hostportra publikálva.
- `/` a kiválasztott frontend, `/api/` a belső API; verziópár ellenőrizhető.
- `.git`, `.env`, privát JSON, teljes checkout és teszt-fixture nem kiszolgálható.
- API lehetőség szerint nem rootként fut, szükségtelen jogosultság és Docker socket nélkül.
- Naplózás korlátos, konténerek egészségi állapota és újraindítása beállított.
- Nincs wildcard CORS, idegen `Origin` elutasítva; proxyban sincs ezt felülíró engedély.
- Nem foglalja el a meglévő szolgáltatások portját.

**Ellenőrzés:** Tiszta build, izolált indulás szabad porton, statikus és API-kérés, tiltott fájlok negatív próbája, újraindítás. A teszt után csak a saját tesztkonténerek takarítása.

## GY-BE-09 — Privát Tailscale-telepítés és csapatjogosultság

**Típus:** Task · **Méret:** M · **Függőség:** 01, 08 · **Éles végrehajtáshoz:** `DEPLOY_ALLOWED: true`

**Leírás:** A tényleges célgépen a kész kiadást a meglévő Tailscale Serve és hozzáférési szabályok közé illeszd a többi szolgáltatás megőrzésével.

**Eredmény:** Működő privát HTTPS-cím, minimális csapatelérés, dokumentált visszaállítás és helyi konfiguráció.

**Elfogadási feltételek:**

- Másik jogosult tailnet-eszközről frontend és API is elérhető ugyanazon eredeten.
- A jogosulatlan teszteszköz nem éri el; a meglévő széles allow-szabályok is értékeltek.
- Nincs publikus bind / routerport / Funnel; a Serve meglévő szolgáltatásai működnek.
- Privát cím, auth key és más titok nem kerül publikus repóba vagy klienskódba.
- A rendszer által közvetített kliensazonosítás dokumentált; tetszőleges forwarded header nem elég jogosultsághoz.
- Hiányzó tailnet-admin jog vagy második eszköz konkrét függőségként szerepel, nem teljesített próbaként.

**Ellenőrzés:** Pozitív és negatív elérési próba, meglévő szolgáltatások ellenőrzése, a használt Serve-konfiguráció és portkötések vizsgálata.

## GY-BE-10 — Teljes munkafolyamat és visszafelé kompatibilitás

**Típus:** Task · **Méret:** M · **Függőség:** 05–09

**Leírás:** Különítsd el az offline automatikus próbákat az engedélyezett élő és tailnet-próbáktól. Ellenőrizd a teljes link → előnézet → adatlap → családi / közös elemzés utat.

**Eredmény:** Reprodukálható tesztparancsok, eredményjegyzék és nem futtatott ellenőrzések listája.

**Elfogadási feltételek:**

- Meglévő modelltesztek és releváns böngészőpróbák sikeresek; az importáló új állapotai is teszteltek.
- Teljes vételár egyszer, családi arányok és közös döntések megmaradnak; nincs automatikus pénzügyi kiegyenlítés.
- A még használathoz nem rendelt rész, egész csoportismétlés és legnagyobb család szerinti összevetés változatlan logikájú.
- A rögzített gazdaság termelőegységei nem nőnek automatikusan a családszámmal.
- Ismeretlen termőterület / lakóegység nem válik igazolt megfelelőséggé.
- A publikus statikus oldal, a régi JSON-ok és az API nélküli kézi mód működnek.
- Legalább egy élő hirdetés adatai ellenőrzöttek a célgépről; a tailnet-elérés külön igazolt. Ha bármelyik blokkolt, a kapcsolódó készállapot nyitva marad.

**Ellenőrzés:** `node --test tests/*.test.mjs`, az implementációhoz választott backendtesztek, releváns Playwright-próbák, Docker-próba, külön kézi élő / második eszközös ellenőrzés. Privát családi export nem kerül teszt-fixture-ként repóba.

## GY-BE-11 — Üzemeltetési leírás, frissítés és rollback

**Típus:** Task · **Méret:** S–M · **Függőség:** 09, 10

**Leírás:** Add át a csapatnak az indítás, ellenőrzés, naplózás, hibafelismerés, frissítés és előző verzióra visszaállítás rövid leírását. A privát kiadás a Pages-től külön verziózható.

**Eredmény:** Kipróbált runbook, konfigurációminta és kiadási ellenőrzőlista.

**Elfogadási feltételek:**

- Azonosítható a telepített backend és frontend commit; frissítés után ellenőrizhető.
- A szolgáltatás újraindítás után elérhető; a memóriacache elvesztése nem számít adatvesztési hibának.
- Az előző verziópárra rollback kipróbált, nem csak leírt parancs.
- Külön szerepel az API-kiesés, Tailscale-elérési hiba és upstream blokkolás felismerése.
- A felhasználói leírás szerint a hirdetésadat ellenőrzendő, a kézi mód megmarad, a családi JSON saját helyi mentés.
- Elmaradt élő vagy hozzáférési próba látható nyitott pont; nem hirdetünk teljes készállapotot.

**Ellenőrzés:** A dokumentáció követése egy frissítési / rollback-próbán, utána privát frontend + health + egy kontrollált importellenőrzés.
