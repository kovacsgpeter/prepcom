# NFR-modell — átvételi fixture

Ez egy **elkülönített, kitalált példa-pár** a tervezésidejű NFR-modell (lásd
[`nfr-catalog.md`](nfr-catalog.md)) átvételi próbájához. Nem valódi ticket, nem hivatkozik
konkrét repóra vagy kódra — a [`threat-model-fixture.md`](threat-model-fixture.md) mintáját
követi, két oldalról: **(a)** egy pozitív példa, ami több katalógus-kategóriát is aktivál,
és **(b)** egy negatív példa, ami tudatosan egyet sem — a katalógus-vezérelt előszűrésnek
(`NFR_INTAKE=auto`) ugyanúgy nem szabad téves pozitívot adnia egy tisztán backend/
konfigurációs storynál, mint ahogy a valódi hiányt sem szabad elhallgatnia egy UI-t érintő
storynál.

A [`../../../ci/verify-nfr-config.sh`](../../../ci/verify-nfr-config.sh) önellenőrző
szkript ezt a fájlt gépileg annyiban ellenőrzi, hogy mindkét "Várt minimum" szakasz
kizárólag az `nfr-catalog.md`-ben **ténylegesen létező** kategórianevekre hivatkozik
(a negatív példánál értelemszerűen egyre sem). A tényleges "a modell tényleg felhozza/nem
hozza fel" elvárás **manuális próba** (lásd `dev-workflow-intake/SKILL.md` "2.d" lépés és a
ticket Teszterv "Manuális" pontja).

## Példa-story A — UI-t érintő, új interaktív elemet bevezető (kitalált)

**Típus:** Story
**Cím:** Egyedi dátumválasztó widget a rendezvény időpontjának kiválasztásához

**Kontextus:** A szervező jelenleg egy sima szöveges dátummezőbe gépeli be a rendezvény
időpontját, ami gyakran elgépeléshez vezet. Szeretne helyette egy egyedi, kattintható
dátumválasztó widgetet, ami csak azokat a napokat ajánlja fel, amikor a helyszín ténylegesen
szabad — ezt a widget egy hálózati hívással kéri le a backendtől, az adott hónapra.

**Acceptance Criteria (funkcionális, kivonat):**
1. A szervező egy egyedi dátumválasztó widgeten keresztül választja ki a rendezvény
   időpontját, szöveges gépelés helyett.
2. A widget megnyitásakor lekéri a backendtől az adott hónapban szabad napok listáját.
3. A szervező csak szabad napot választhat ki; a foglalt napok a widgeten letiltott
   állapotban jelennek meg.
4. Ha a szabad napok lekérése sikertelen, vagy egyetlen szabad nap sincs az adott hónapban,
   a widget ezt érthetően jelzi, és javasolja a következő hónapra lapozást.

**Edge case-ek:** lassú/sikertelen hálózati hívás; teljesen betelt hónap; a hónap-váltás
gyors, egymást követő kattintása.

## Várt minimum — Példa A

A fenti storyból (**új, egyedi vezérlő** bevezetése + a vezérlőhöz kötött **hálózati
adatbetöltés, ami üres vagy hibás eredményt is adhat**) az NFR-modellnek `checklist` **és**
`hybrid` módban is legalább az alábbi két katalógus-kategóriát fel kell hoznia, és
mindegyikhez vagy javasolt `[nfr]` jelölésű AC-t, vagy tudatosan elvetett szempontként
rögzített indoklást kell adnia:

- Akadálymentesség
- Hibatűrés és üres állapot

`llm` módban ez a minimum **nem garantált** (a katalógus nélkül fut) — az átvételi elvárás
tudatosan csak a `checklist` és a `hybrid` stratégiára köt.

## Miért ez a kettő (Példa A)

- **Akadálymentesség** — a story kifejezetten **új, egyedi vezérlőt** (dátumválasztó)
  vezet be szöveges mező helyett: ez az `nfr-catalog.md` "Akadálymentesség" kategóriájának
  szó szerinti kiváltó jele (billentyűzet-kezelhetőség, fókuszjelzés, ARIA-szerep).
- **Hibatűrés és üres állapot** — a widget **új adatbetöltést** (hálózati hívás) végez, és
  az AC4 explicit kimondja, hogy az eredmény lehet üres (nincs szabad nap) vagy a hívás
  hibázhat — ez pontosan a kategória kiváltó jele.

Jellemzően felmerülhet még a "Böngésző- és eszköz-mátrix" kategória is (ha a widget új
CSS-technikát vagy böngésző-API-t használna) — ez a story leírásából nem dönthető el
egyértelműen, ezért nem kötelező minimum, de helyes, ha a modell jelzi.

## Példa-story B — tisztán backend/konfigurációs, UI nélküli (kitalált)

**Típus:** Task
**Cím:** Napi cron-job az elavult ideiglenes exportfájlok törlésére

**Kontextus:** Egy exportgenerálási folyamat a backend egy ideiglenes könyvtárába írja
a köztes fájlokat, amiket eddig soha semmi nem takarított. Egy éjszakai, ütemezett
háttérfolyamat (cron-job) fusson le naponta egyszer, ami törli a 30 napnál régebbi
ideiglenes exportfájlokat a szerver lemezéről. Nincs hozzá felhasználó felé megjelenő
felület, végpont vagy visszajelzés — kizárólag szerveroldali karbantartás.

**Acceptance Criteria (funkcionális, kivonat):**
1. A háttérfolyamat naponta egyszer, éjfélkor lefut, és törli a 30 napnál régebbi
   ideiglenes exportfájlokat.
2. A törlés eredménye (törölt fájlok száma) a szerver naplójába kerül.
3. A háttérfolyamat egy törött/hozzáférhetetlen fájl esetén nem áll le, csak azt a fájlt
   hagyja ki, és ezt is naplózza.

**Edge case-ek:** üres ideiglenes könyvtár; egy fájl, amire nincs törlési jogosultság;
a folyamat két egymást követő futása közötti átfedés.

## Várt minimum — Példa B

Ez a story **kizárólag** szerveroldali, UI nélküli karbantartást ír le: nincs benne új
interaktív elem, nincs felhasználó felé megjelenő szöveg vagy formátum, nincs felhasználó
által kezdeményezett, adatmennyiséghez kötött renderelés, nincs új CSS-technika vagy
böngésző-API, és a "hibatűrés" itt egy belső, naplózott hibaágra vonatkozik, nem egy
felhasználó felé megjelenő üres/hiba-állapotra.

**Várt eredmény:** az NFR-modellnek `checklist` **és** `hybrid` módban is **egyetlen kategória sem aktivál** — sem az öt `nfr-catalog.md` kategória egyike, sem katalóguson
kívüli szempont nem eredményezhet `[nfr]` jelölésű AC-t. A DoR Spec "Nem-funkcionális
követelmények" mezője `N/A (nem talált relevánsat)`, "Nem-funkcionális megfontolások"
szekció nélkül.
