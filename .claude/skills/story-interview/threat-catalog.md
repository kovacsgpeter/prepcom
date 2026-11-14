# Kockázat-katalógus (tervezésidejű fenyegetés-modellezés)

Ezt a fájlt a [`SKILL.md`](SKILL.md) "DoR checklist" és a
[`../dev-workflow-intake/SKILL.md`](../dev-workflow-intake/SKILL.md) "2.c —
Fenyegetés-modellezés" lépése hivatkozza. Eszköz- és projektfüggetlen: nincs benne
konkrét nyelv, keretrendszer vagy repóra szabott érték — ha egy konkrét projektnek saját
kockázati kategóriái vannak, azokat a hívó skill a `hybrid`/`llm` stratégiával veszi fel,
ne írja át ezt a fájlt projekt-specifikusra.

## Mire való

A cél a **tervezés fázisában** felszínre hozni azokat a kockázatokat, amelyek egy story
leírásából már láthatók, és ezekből **ellenőrizhető biztonsági Acceptance Criteria-t**
javasolni, mielőtt bármi kódba kerülne. Ez a katalógus **nem támad, nem elemez kódot, és
nem sorol fel konkrét sebezhetőségeket** — kizárólag kategória-szintű, tervezői döntést
segítő jelzéseket ad.

**Kimenet-korlát (kötelező).** A fenyegetés-modell minden kimenete — a DoR Spec
"Biztonsági kockázatok" mezője, a ticket "Biztonsági megfontolások" szekciója, a javasolt
AC-k szövege — csak **kategória-szintű** megállapítást tartalmazhat. Nem kerülhet bele
konkrét sebezhetőség-részlet, kihasználási lépés, payload vagy bármilyen titok (kulcs,
jelszó, token). Ha egy megfogalmazás ilyet igényelne, általánosítsd a kategória szintjére.

## Elhatárolás — mit NEM érint

- **Nem** a `code-reviewer.md` "Biztonság" review-kategóriája (az utólagos, kód-szintű
  ellenőrzés külön eszköz tulajdona) — ez a katalógus tervezésidejű, kód nélkül fut.
- **Nem** a `gitlab-branch-review` skill, és **nem** a futásidejű biztonsági szonda lánca.
- A biztonsági AC-k a normál AC-listában élnek, `[biztonsági]` jelöléssel (lásd
  [`dor-checklist.md`](dor-checklist.md)) — az `implementer` és a `qa-tester` külön logika
  nélkül dolgozik velük, ugyanúgy, mint a funkcionális AC-kkel.
- **Nem** ide tartoznak a nem-funkcionális szempontok (akadálymentesség, teljesítmény,
  i18n/l10n, böngésző- és eszköz-mátrix, hibatűrés és üres állapot) — ezek az
  [`nfr-catalog.md`](nfr-catalog.md) katalógusban élnek, nem itt.

## Hogyan használd

Minden kategóriánál három rögzített alcím van:

- **Mikor releváns** — kiváltó jelek a story leírásában. Ha ezek közül bármelyik
  megjelenik (szó szerint vagy tartalmilag), a kategória releváns, és meg kell vizsgálni.
  Ez a lista a `THREAT_MODEL_INTAKE=auto` olcsó előszűrő jelzőszó-forrása is — bővíthető,
  ha téves negatívot tapasztalsz (edge case: `auto` téves negatív).
- **Minta-AC** — egy eszközfüggetlen, ellenőrizhető példamondat. Ez sablon, nem
  szó szerint másolandó — a story konkrétumaira kell szabni, de a jellegét (mit garantál,
  hogyan ellenőrizhető) tartsd meg.
- **Katalóguson kívüli megfontolás** — a `hybrid`/`llm` stratégiának szánt horog: ha a
  modell a kategórián túlmutató, de ide tartozó kockázatot lát, ezen a helyen, kötelező
  egymondatos indoklással veheti fel.

## Kategóriák

### Validálatlan input

**Mikor releváns** (kiváltó jelek): a story bármilyen felhasználói vagy külső bemenetet
fogad (űrlapmező, query paraméter, útvonal-szegmens, fejléc, üzenetsor-üzenet, webhook);
"a felhasználó megadja", "beírja", "kiválasztja", "megküldi"; szabad szöveges mező;
numerikus vagy dátum-bevitel; keresőmező; szűrő- vagy rendezési paraméter.

**Minta-AC:** Given érvénytelen vagy hiányzó kötelező mezőt tartalmazó kérés, When a
végpont feldolgozza, Then elutasítja a kérést kliens-hibával (nem 5xx-szel), a választ
nem szennyezi a nyers bemenet, és a rendszer állapota változatlan marad. (automata)

**Katalóguson kívüli megfontolás:** nincs — ha a modell ide sorolható, de a mintától
eltérő kockázatot lát, itt vegye fel egymondatos indoklással.

### Hiányzó vagy hibás jogosultság-ellenőrzés

**Mikor releváns** (kiváltó jelek): a story szerep-, tulajdonos- vagy bérlő-függő
viselkedést ír le ("csak a saját", "admin", "megosztott", "jogosult"); azonosítóval
címzett erőforrás lekérése/módosítása/törlése; listázás, ahol a találatokat szűrni kell a
hívó jogosultságára; állapotváltás, amit csak bizonyos szerep indíthat. Auth nélküli
repóban is rögzítendő — ilyenkor a megállapítás jellemzően "nincs mit védeni", de a
döntést tudatosan ki kell mondani.

**Minta-AC:** Given egy erőforrásra nem jogosult hívó, When az erőforrást azonosítóval
kéri le vagy módosítja, Then a válasz "nem található" vagy "tiltott" a jogosultsági
modell szerint, és nem szivárog ki, hogy az erőforrás létezik-e. (automata)

**Katalóguson kívüli megfontolás:** nincs — ha a modell ide sorolható, de a mintától
eltérő kockázatot lát, itt vegye fel egymondatos indoklással.

### Méret-, mennyiség- és rátakorlát hiánya

**Mikor releváns** (kiváltó jelek): kollekció, lista, tömeges művelet, "bármennyi",
"összes", ismételhető hívás; feltöltés vagy import; szabad szöveges mező felső határ
nélkül; oldalazás nélküli lekérés; ciklus/rekurzió a bemenet méretével arányosan;
költséges downstream hívás kérésenként.

**Minta-AC:** Given a dokumentált felső korlátot meghaladó méretű vagy darabszámú bemenet,
When a művelet fut, Then a rendszer a korlátnál elutasít egyértelmű hibával, a
feldolgozás nem indul el, és egyetlen kérés sem köt le aránytalan erőforrást. (mindkettő)

**Katalóguson kívüli megfontolás:** nincs — ha a modell ide sorolható, de a mintától
eltérő kockázatot lát, itt vegye fel egymondatos indoklással.

### Fájlfeltöltés és -feldolgozás

**Mikor releváns** (kiváltó jelek): "feltölt", "csatol", "importál", "beolvas fájlból";
CSV/XLS/JSON/XML/kép/PDF fogadása; fájlnév vagy útvonal a bemenetben; kicsomagolás,
transzformáció, előnézet-generálás; a feltöltött tartalom későbbi megjelenítése vagy
letöltése.

**Minta-AC:** Given nem engedélyezett típusú, hibás szerkezetű vagy a méretkorlátot
meghaladó fájl, When a felhasználó feltölti, Then a rendszer a feldolgozás előtt
elutasítja, a fájlnevet nem használja fel útvonal-összeállításhoz, és a tárolt tartalmat
nem szolgálja ki végrehajtható vagy a böngészőben aktív tartalomként. (mindkettő)

**Katalóguson kívüli megfontolás:** nincs — ha a modell ide sorolható, de a mintától
eltérő kockázatot lát, itt vegye fel egymondatos indoklással.

### Érzékeny adat tárolása, naplózása és továbbítása

**Mikor releváns** (kiváltó jelek): személyes adat, e-mail, telefonszám, cím, fizetési
vagy egészségügyi adat, hitelesítő adat; "elmentjük", "eltároljuk", "naplózzuk",
"kiküldjük e-mailben", "exportáljuk"; harmadik félnek továbbított rekord; hibaüzenet vagy
naplóbejegyzés, ami a bemenetet visszhangozza; adatmegőrzési/megtartási időre vonatkozó
döntés ("meddig tároljuk", "automatikusan töröljük"); a felhasználó tájékoztatása az
adatkezelésről ("tájékoztatjuk", "hozzájárulást kérünk", "adatvédelmi nyilatkozat");
harmadik félnek történő adattovábbítás ("megosztjuk", "átadjuk", "alvállalkozó",
"integrációs partner").

**Minta-AC:** Given érzékeny mezőt tartalmazó művelet, When az lefut, Then a napló és a
hibaüzenetek nem tartalmazzák az érzékeny mező értékét, a tárolt adat köre a
funkcióhoz szükséges minimumra szorítkozik, a kimenő továbbítás csak a szükséges
mezőket viszi, a dokumentált megtartási idő lejárta után az adat törlődik vagy
anonimizálódik, a felhasználó az adatkezelésről érthető tájékoztatást kap, és harmadik
félnek történő továbbítás esetén annak célja és köre dokumentált. (automata)

**Katalóguson kívüli megfontolás:** nincs — ha a modell ide sorolható, de a mintától
eltérő kockázatot lát, itt vegye fel egymondatos indoklással.

### Külső hívás és harmadik féltől származó függőség

**Mikor releváns** (kiváltó jelek): kimenő HTTP-hívás, integráció, "API-t hívunk",
webhook fogadása; a bemenetből származó URL lekérése; új third-party könyvtár vagy
szolgáltatás bevezetése; a külső válasz beépítése a saját válaszba vagy tárolása.

**Minta-AC:** Given nem elérhető, lassú vagy váratlan szerkezetű külső válasz, When a
művelet fut, Then a hívásnak időkorlátja van, a hiba nem szivárog ki nyers formában a
felhasználóig, és a bemenetből származó cél-URL nem enged belső címekre irányuló
kérést. (automata)

**Katalóguson kívüli megfontolás:** nincs — ha a modell ide sorolható, de a mintától
eltérő kockázatot lát, itt vegye fel egymondatos indoklással.

### Titkok kezelése

**Mikor releváns** (kiváltó jelek): API-kulcs, token, jelszó, kapcsolati string,
tanúsítvány; "hitelesítünk a szolgáltatásnál", "beállítjuk a kulcsot"; új konfigurációs
érték, ami hitelesítő adat; titok, ami kérés/válasz payloadba, hibaüzenetbe vagy
kliensoldali kódba kerülhet.

**Minta-AC:** Given a funkcióhoz szükséges titok, When a kód fut, Then a titok
kizárólag futásidejű konfigurációból (környezeti változó vagy titok-tár) érkezik, nem
kerül verziókövetésbe, naplóba, hibaüzenetbe vagy kliensre küldött válaszba. (mindkettő)

**Katalóguson kívüli megfontolás:** nincs — ha a modell ide sorolható, de a mintától
eltérő kockázatot lát, itt vegye fel egymondatos indoklással.

### Kimenet-kódolás és megjelenítés

**Mikor releváns** (kiváltó jelek): felhasználói vagy külső eredetű adat visszajelenik a
felületen, e-mailben, dokumentumban, CSV/PDF exportban; "megjelenítjük", "listázzuk",
"visszaírjuk"; sablon vagy string-összefűzés, ami HTML-t, SQL-t, shell-parancsot,
lekérdezést vagy fájl-tartalmat állít elő a bemenetből.

**Minta-AC:** Given vezérlőkaraktereket vagy jelölőnyelvi szintaxist tartalmazó bemenet,
When az érték megjelenik vagy exportálódik, Then a cél-kontextusnak megfelelően kódolva
jelenik meg (nem értelmeződik kódként/jelölőként), és a formátum-specifikus injekció
(pl. képlet-injekció exportban) nem lehetséges. (mindkettő)

**Katalóguson kívüli megfontolás:** nincs — ha a modell ide sorolható, de a mintától
eltérő kockázatot lát, itt vegye fel egymondatos indoklással.
