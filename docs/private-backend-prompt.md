# Lokálisan kiadható fejlesztési prompt

Első körben a teljes alábbi blokkot add ki a lokális fejlesztői asszisztensnek a `prepcom` checkoutban. Alapállapotban **csak felmér és scope-ot készít**, nem telepít. A szerver részleteit nem kell előre kitalálnod: ami helyben kiolvasható, azt mérje fel.

A scope után ugyanazt a promptot használd `MODE: IMPLEMENT`, konkrét `TASKS` listával. A taskazonosítók a [Jira-bontásban](private-backend-jira.md) szerepelnek. Éles telepítés csak a telepítési task és `DEPLOY_ALLOWED: true` együttes megadásával tartozik a feladatba. Ez a prompt két külön munkafázist választ szét, nem kér ismételt jóváhagyást az egyes rutinlépésekhez.

```text
FELADAT: Gyökér privát ingatlanhirdetés-beolvasó, saját szerver + Docker + Tailscale

MODE: SCOPE
TASKS: []
DEPLOY_ALLOWED: false
REPOSITORY: a jelenlegi helyi kovacsgpeter/prepcom checkout
TARGET_HOST: a jelenlegi gép; előbb állapítsd meg, hogy ez a tényleges szerver-e

1. SZEREP ÉS CÉL

Mérd fel, majd a kiválasztott fázis szerint tervezd meg vagy valósítsd meg a
Gyökér csak saját csapatnak elérhető hirdetésbeolvasóját. Magyarul kommunikálj.
Kövesd a helyi AGENTS.md és a repository releváns útmutatóit.

A végső cél: a csapat beilleszt egy támogatott ingatlanhirdetési URL-t,
a backend AI nélkül adatokat nyer ki, a felhasználó előnézetben ellenőrzi,
majd alkalmazza az ingatlanadatokat. A családszámot, CAPEX-et, OPEX-et,
tőkeköltséget, földigényt, munkaórát és vizet a meglévő böngészős modell számolja.

2. ELSŐKÉNT OLVASD EL

- README.md
- docs/private-backend.md
- docs/private-backend-scope.md
- docs/private-backend-jira.md
- property-view.mjs, property-analysis.mjs, property-references.mjs
- model.mjs és a releváns tests/property-* próbák

A leírás javasolt szerződés, nem már elkészült backend. Ellenőrizd a checkout
aktuális állapotát és a helyi módosításokat; ne írd felül más munkáját.
Eltérés esetén mutasd meg a konkrét következményt és javasolj rendezést.

3. FÁZISOK

Ha MODE=SCOPE:
- Kizárólag helyi, olvasási műveletekkel mérd fel a helyzetet.
- Ne telepíts, ne frissíts csomagot, ne indíts konténert vagy új szolgáltatást.
- Ne módosíts Tailscale Serve-, hozzáférési, tűzfal- vagy routerbeállítást.
- Ne pusholj, ne publikálj és ne hozz létre Jira-ticketet.
- Ne kérj be jelszót, tokent vagy auth key-t; értéküket ne írd ki.
- A live hirdetésletöltési próbát tervezd meg külön taskként; ebben a fázisban
  ne végezz külső hálózati kérést.
- Adj áttekinthető scope-ot, API-javaslatot, függőségi sorrendet és Jira-taskokat.
- A helyben megállapítható dolgokra ne kérdezz rá. Csak valódi döntési vagy
  hozzáférési hiányosságot kérdezz, és közben végezd el a független felmérést.

Ha MODE=IMPLEMENT:
- Csak a TASKS listában kijelölt taskokat és azok kifejezetten szükséges
  előfeltételeit végezd el; a ki nem jelölt függőséget jelezd, ne bővíts csendben.
- A kijelölt munkát vidd végig kóddal, releváns tesztekkel és dokumentációval.
- Használj külön fejlesztési ágat, őrizd meg a meglévő lokális módosításokat.
- Éles deploy, hozzáférési szabály módosítása és Tailscale Serve átállítása
  kizárólag DEPLOY_ALLOWED=true és a kijelölt telepítési task esetén történhet.
- DEPLOY_ALLOWED=false mellett megengedett az izolált fejlesztési futtatás
  és Docker-próba szabad loopback-porton, a meglévő szolgáltatások érintése nélkül.
- A puszta implementálási kérés nem engedély main-pushra vagy Pages-kiadásra;
  készíts reviewzható diffet, és kövesd az ebben a lokális munkamenetben kapott
  külön publikálási utasításokat.
- Az engedélyezett rutinlépésekhez ne kérj újra és újra megerősítést.

4. HELYI FELMÉRÉS

Állapítsd meg és foglald össze, titkos értékek nélkül:
- Repo állapota, branch, commit, helyi változások, meglévő tesztparancsok.
- OS, CPU-architektúra, megfelelő Node LTS, Docker Engine / Compose elérhetőség.
- Ez a gép ténylegesen a célkiszolgáló-e, vagy csak fejlesztői gép.
- Tailscale telepítettsége, bejelentkezett állapota, a Serve jelenlegi használata.
- Van-e már más szolgáltatás a Serve gyökerén vagy tervezett útvonalán.
- Elérhető telepítési könyvtár, megfelelő szabad loopback-port.
- Ki állíthatja a tailnet hozzáférési szabályait, és kik a jogosult csapattagok.
- A kliensazonosítás mely része igazolt, melyik feltételezés.

Ne dumpold az environmentet vagy hitelesítési fájlokat. A privát gépnév, tailnetnév
és személyes útvonal csak helyi konfigurációba kerüljön, ne publikus commitba.

5. ELVÁRT ARCHITEKTÚRA

- GitHub Pages továbbra is működő nyilvános statikus kalkulátor.
- Saját szerveren a csapatnak a frontend és /api/ azonos privát HTTPS-eredet alatt.
- Tailscale Serve a hoston, mögötte loopbackre kötött Docker reverse proxy.
- Az API csak belső Docker-hálózaton; nincs külön publikus port.
- Nincs Tailscale Funnel és routeres portnyitás.
- A meglévő Serve konfigurációt ne reseteld és ne írd felül vakon.
- Első adapter ingatlan.com; további domainek külön későbbi taskok.
- A meglévő számítási modellt használd, ne másold át a backendbe.
- A backendnek ne küldj családi JSON-t vagy pénzügyi tervet.
- Javasolt stack Node LTS + Fastify + HTML-parser + JSON-séma; ha helyben más
  egyszerűbb és fenntarthatóbb, indokold. Nem kell adatbázis az MVP-hez.

6. API ÉS ADATMINŐSÉG

Alap szerződés:
- GET /api/health
- POST /api/listing, JSON body: {"url":"https://ingatlan.com/..."}
- Verziózott válasz: schemaVersion, requestId, status, source, listing,
  evidence, warnings, requiresReview.
- A pontos mezők és hibakódok a docs/private-backend-scope.md dokumentumban.

Teljes vételárat és teljes telekterületet keress. A ház alapterülete nem telekméret,
a fajlagos ár nem teljes vételár. Ismeretlen érték null; nem nulla és nem kitalált
becslés. Más devizát az MVP ne váltson automatikusan. A közelítő méret láthatóan
közelítő maradjon. Ellentmondó forrásértékekről figyelmeztetés kell.

Minden kinyert üzleti mezőhöz maradjon visszakövethető rövid forrásbizonyíték.
A hirdető állítása nem hatóságilag igazolt adat. Termőterületet, lakóegységszámot
és jogi alkalmasságot ne vezess le szabad szövegből vagy beépítési százalékból.

Előbb igazold külön technikai próbával az élő adatletöltés lehetőségét.
Ha normál letöltéssel blokkolt a portál, mutasd meg az eredményt és a határt;
ne kerülj meg botvédelmet és ne állítsd, hogy a linkbeolvasó kész. A független
API-, offline parser-, frontend- és Docker-munkát ettől még el lehet készíteni.

7. FRONTEND ÉS VISSZAFELÉ KOMPATIBILITÁS

- A beolvasó csak a privát kiadásban legyen engedélyezve; relatív /api/ hívással.
- A publikus Pages ne hívjon privát szervert magától és ne tartalmazzon titkot.
- A letöltés eredménye előnézet; csak explicit alkalmazás módosítja az adatlapot.
- Új ingatlannál a korábbi productiveArea / maxHomes korlát ne öröklődjön át
  észrevétlenül. Alapjuk null. Az excludedArea indulhat 0-ról, de jelezd,
  hogy ez meg nem adott kizárás, nem igazolt teljes használhatóság.
- Hiba / megszakítás esetén az aktuális ingatlan és családi tervek változatlanok.
- Megmarad a kézi mód és a három beküldött referencia.
- Élő forrás, letöltési idő és kézi felülírás jelölése a helyi mentésben és az
  összegző riportban is maradjon meg.
- Ne módosítsd szükségtelenül a családi / közösségi JSON-sémát, a korábbi
  mentési kulcsokat vagy a calculate / aggregate eredményeit.
- Az új állatok / m²-ek / önellátási célok változtatására a meglévő helyi
  elemzés számoljon újra; új hirdetésletöltés ne történjen.

8. BIZTONSÁG ÉS ÜZEMELTETÉS

A részletes korlátok a scope-dokumentumban vannak. Kiemelten:
- Csak támogatott HTTPS host, megengedett útvonal és port; URL-userinfo tiltva.
- SSRF-védelem DNS-, IPv4/IPv6-, átirányítás- és DNS-rebinding esetekre is.
- A tiltott címek közt a localhost, privát hálózat, metadata és tailnet címei is
  szerepeljenek; az API ne lehessen belső hálózati proxy.
- Teljes letöltési idő-, kitömörített méret-, párhuzamosság- és kéréskorlát.
- Ne bízz meg tetszőleges forwarded kliensazonosítóban.
- Csak szükséges csapatjogosultság a tényleges Tailscale elérési útvonalon;
  széles, már meglévő allow-szabályt is vegyél figyelembe.
- Nincs wildcard CORS, kliensben tárolt szolgáltatási titok vagy Docker socket.
- A kinyert szöveg adatként jelenjen meg; ne lehessen HTML-t / scriptet futtatni.
- Naplóba ne kerüljön titok, családi terv vagy teljes hirdetés-HTML.
- Statikus kiszolgálás csak engedett publikus fájlokból; nincs .git / .env / privát JSON.
- Verziózott kiadás, újraindíthatóság, frissítés és kipróbált rollback.

9. TESZTEK ÉS KÉSZ ÁLLAPOT

Legalább ezek legyenek tervezve, implementálási fázisban végrehajtva:
- Determinisztikus unit tesztek: URL, DNS, redirect, normalizálás, forrásmezők.
- Sanitizált szintetikus / jogszerűen használható offline HTML-fixture-ök;
  ingatlan.com élő működése nem lehet a szokásos tesztfutás előfeltétele.
- API-séma és ok / partial / hibakódok, request- és response-korlátok.
- Frontend előnézet / alkalmazás / megszakítás, hibánál változatlan adatok.
- Backend nélkül továbbra is működő kalkulátor és publikus Pages.
- Korábbi modelltesztek: node --test tests/*.test.mjs.
- Releváns korábbi böngészőpróbák és új importer-próba.
- Docker build + indulás + /api/health + statikus oldal + tiltott fájlok.
- Külön, engedélyezett élő hirdetéspróba a szerverről, ténylegesen ellenőrzött adatokkal.
- Külön tailnetteszt másik jogosult eszközről és hozzáférési negatív próba.
- Meglévő szolgáltatások megőrzése, restart, rollback, verziók ellenőrzése.

Ne írj sikeres élő beolvasást vagy távoli hozzáférési tesztet, ha nem futott le.
A hiányzó második eszköz vagy blokkolt upstream maradjon konkrétan jelzett hiány.

10. ELVÁRT VÁLASZ

SCOPE módban add vissza:
1. Mit találtál tényszerűen, és mit feltételezel még.
2. Javasolt MVP és későbbi scope, rövid indoklással.
3. Architektúra, API-szerződés és meglévő kódhoz illesztés.
4. Valódi döntési kérdések, ajánlott alapértékekkel.
5. Jira-ready tasklista: cél, eredmény, függőség, AC, ellenőrzés, durva S/M/L méret.
6. Megvalósítási sorrend és élő adatletöltési go/no-go pont.
7. Mit nem ellenőriztél / nem telepítettél.

IMPLEMENT módban add vissza:
1. Mi készült el a kijelölt taskokból, mely fájlokban.
2. Tesztparancsok és tényleges eredmények; külön a nem futtatott ellenőrzések.
3. Indítás / konfiguráció / privát telepítés lépései, titkos értékek nélkül.
4. Kompatibilitás, ismert korlátok, konkrét fennmaradó akadályok.
5. Következő task, ha van; az éles telepítést ne állítsd késznek puszta build alapján.
```

Példák a fejléc későbbi átállítására:

```yaml
# Csak a hozzáférhetőségi technikai próba; külső, támogatott hirdetési kérések megengedettek.
MODE: IMPLEMENT
TASKS: [GY-BE-02]
DEPLOY_ALLOWED: false
```

```yaml
# A jóváhagyott API-alap elkészítése, ha az előfeltételei már rendelkezésre állnak.
MODE: IMPLEMENT
TASKS: [GY-BE-03, GY-BE-04]
DEPLOY_ALLOWED: false
```

```yaml
# Kész és ellenőrzött Docker-kiadás privát telepítése a tényleges szerveren.
MODE: IMPLEMENT
TASKS: [GY-BE-09]
DEPLOY_ALLOWED: true
```
