# Definition of Ready checklist (típus-független alapstruktúra)

Ezt a fájlt a [`SKILL.md`](SKILL.md) hivatkozza az interjú checklistjeként. Eszköz- és
projekt-független — ha egy konkrét projektnek további, saját kritériumai vannak, azokat a
hívó skill (pl. a dev-workflow `intake/SKILL.md`) egészítse ki, ne írja át ezt a fájlt
projekt-specifikusra.

A típus (Story / Bug / Task) meghatározása az első lépés — ha nem egyértelmű a
bemenetből, kérdezz rá kötelezően, mert ez szabja meg a további checklistet.

## Kontextus — hat nevesített sor (közös alapstruktúra minden típusra)

A "Kontextus" DoR-pont mindhárom típusnál (Story/Bug/Task) ugyanarra a hat nevesített
sorra bomlik — az alábbi [`SKILL.md`](SKILL.md) "Kimeneti formátum" blokkja és a
dev-workflow `jira-ticket-template.md` törzse is ezt a hat nevet használja. Az, hogy egy
adott típusnál melyik sor **kötelező** vagy **elhagyható** (N/A-ra jelölhető, egymondatos
indoklással), típusonként eltér — lásd az egyes típusok "Kontextus" pontjánál lent.

- **Eredmény** — mi az elérni kívánt végállapot
- **Kinek** — ki használja / kit érint
- **Miért most** — miért ez a prioritás most
- **Siker mércéje** — mi mutatja, hogy sikeres volt
- **Kötő korlát** — mi köti a megoldást (határidő, technikai korlát, jogszabály stb.)
- **Scope-on kívül** — mi NEM tartozik bele

Ha egy sor egy adott típusnál nem alkalmazandó, **N/A**-ra kerül, egymondatos
indoklással — nem hagyható ki szótlanul.

## Story
- **Cím** — rövid, felhasználói szempontú
- **Kontextus** — mind a hat sor kötelező (lásd fent "Kontextus — hat nevesített sor"):
  Eredmény, Kinek, Miért most, Siker mércéje, Kötő korlát, Scope-on kívül. Csak akkor
  jelölhető N/A egy sor, ha a story tartalma alapján tényleg nincs értelmezhető válasz
  (pl. nincs explicit kizárt rész) — ezt is indokolni kell.
- **Érintett réteg(ek)** — frontend / backend / mindkettő. Ha mindkettő, ez jelzi, hogy a
  ticketből FE/BE split lesz (lásd a dev-workflow `jira-ticket-template.md` "FE/BE split
  esetén" szekcióját) — ne hagyd nyitva, kérdezz rá, ha nem egyértelmű.
- **Technológia / architektúra** — melyik konkrét nyelv/framework/adattárolás érintett
  rétegenként (pl. "Angular" nem elég, ha a repóban több FE-stack is elképzelhető lenne).
  Ha az érintett repóban **már van kialakult konvenció** (meglévő forráskód, build/manifest
  fájl — pl. `package.json`, `pom.xml`, `angular.json`), ellenőrizd azt, és csak
  megerősítésre kérdezz rá a felhasználótól ("ez a repo Angular/Java-t használ, ez alapján
  megyünk?"). Ha a repó **üres vagy új** (nincs még kialakult stack), ez zöldmezős döntés —
  **kötelezően kérdezz rá explicit**: frontend framework, backend nyelv/framework,
  adattárolás típusa, és van-e speciális hosting/deploy elképzelés vagy meglévő
  shared-komponens-könyvtár, amit újra kell használni. Ne találgass és ne örökölj csendben
  egy másik projekt konvencióját anélkül, hogy megerősítetted volna.
- **Kiindulási állapot** — mi létezik már ebből a kódban? (a "Technológia / architektúra"
  pontnál már megnézett kódra épít; ha van részleges implementáció/minta, nevezd meg
  fájl/modul-szinten, zöldmezős esetén mondd ki azt is)
- **Acceptance criteria** — konkrét, ellenőrizhető lista (min. 2-3 tétel). Formátum és
  jelölés minden tételnél:
  - **Given/When/Then csak ott kötelező, ahol a tétel tényleg viselkedést/folyamatot ír
    le** (pl. "Given bejelentkezett felhasználó, When rossz jelszót ad meg, Then
    hibaüzenet jelenik meg az email mező alatt"). Egyszerű, strukturális/tartalmi
    kritériumoknál (pl. "a form mezői: email, jelszó, 'Emlékezz rám' checkbox") elég egy
    sima, ellenőrizhető mondat — ne erőltess rá mesterséges Given/When/Then-t.
  - **Minden tétel végére írj egy verifikációs jelölést zárójelben**: `(automata)`,
    `(manuális)` vagy `(mindkettő)` — aszerint, hogy automata (unit/integrációs) teszttel,
    csak böngészőben/manuálisan, vagy mindkettővel ellenőrizhető. Erre épül közvetlenül a
    dev-workflow `implementer` subagentje (mihez írjon automata tesztet) és a `qa-tester`
    subagentje (mit néz meg böngészőben).
  - **Biztonsági AC-jelölés**: ha egy tétel a tervezésidejű fenyegetés-modellből
    (lásd "Biztonsági kockázatok" pont lent) származik, a checkbox után **prefix
    tokenként** `[biztonsági]` áll — pl. `- [ ] [biztonsági] a feltöltött fájl mérete a
    dokumentált korlát fölött elutasításra kerül (automata)`. A tétel egyébként a fenti
    formátum- és verifikációs-jelölés elvet követi. Ez a token különbözteti meg a
    biztonsági AC-ket a funkcionális AC-ktől: a méret-figyelmeztetés és a
    `dev-workflow-intake` "Komplexitás" mezőbecslése kizárólag a funkcionális AC
    tételeket (a `[biztonsági]` tokent nem viselőket) számolja.
  - **NFR AC-jelölés**: ha egy tétel a tervezésidejű NFR-modellből (lásd "Nem-funkcionális
    követelmények" pont lent) származik, a checkbox után **prefix tokenként** `[nfr]` áll
    — pl. `- [ ] [nfr] a beküldő űrlap billentyűzettel teljesen kezelhető (manuális)`. A
    tétel egyébként a fenti formátum- és verifikációs-jelölés elvet követi. Ez a token
    különbözteti meg az NFR AC-ket a funkcionális AC-ktől: a méret-figyelmeztetés és a
    `dev-workflow-intake` "Komplexitás" mezőbecslése kizárólag a funkcionális AC
    tételeket (a `[nfr]` tokent nem viselőket) számolja.
  - **Méret-figyelmeztetés**: ha a **funkcionális** AC-tételek listája **8-nál
    hosszabbra nőne** (a `[biztonsági]` és `[nfr]` jelölésű tételek ebbe **nem**
    számítanak bele), és
    a tételek logikailag szét is választhatók (pl. két különböző user-flow keveredik bele
    egy story-ba), állj meg, és jelezd a felhasználónak, hogy ez valószínűleg **több
    különálló story** — javasold, hogy a `dev-workflow-scoping` skillel bontsák szét,
    mielőtt tovább mennétek egy ticketként. Ne döntsd el egyedül — kérdezd meg, akarja-e a
    bontást, vagy tudatosan egyben tartja.
    > ℹ️ **Kereszthivatkozás (COCALC-273, MEAS-2)**: ez a méret-jel a `dev-workflow-intake`
    > "Komplexitás" mezőbecslésének is bemenete — 8-nál több **funkcionális** AC-tétel
    > esetén a becsült komplexitás sosem lehet a legkisebb (`S`) szint, lásd
    > [`../dev-workflow/config.md`](../dev-workflow/config.md) "Komplexitás →
    > végrehajtó-szint routing" szekció.
- **Edge case-ek** — hibás input, üres állapot stb. (külön szekció, nem az AC lista
  része — de minden ide felvett edge case-hez érdemes eldönteni, kell-e hozzá is külön AC,
  ha ellenőrizhető állítás). A jogosultsági/biztonsági szélsőértékeket ne itt kezeld
  külön félmondattal — azokra a lenti **Biztonsági kockázatok** pont és a
  [`threat-catalog.md`](threat-catalog.md) katalógus a mérvadó, hogy ne éljen két,
  egymást nem ismerő biztonsági kérdés.
- **Biztonsági kockázatok** — a tervezésidejű fenyegetés-modell szerint (lásd
  [`threat-catalog.md`](threat-catalog.md) — 8 eszközfüggetlen kategória, kategóriánként
  kiváltó jellel és minta-AC-vel). A `dev-workflow-intake` "2.c" lépése a
  `THREAT_MODEL_INTAKE` kapcsoló szerint futtatja: felsorolja a story leírásából
  relevánsnak ítélt kategóriákat, kategóriánként vagy javasol egy `[biztonsági]` jelölésű
  AC-t, vagy tudatosan vállalt kockázatként rögzíti egymondatos indoklással. Auth nélküli
  repóban is végig kell menni rajta — ilyenkor a "jogosultság" kategória jellemzően
  "nincs mit védeni", de a döntést ki kell mondani. Ha nem futott: a DoR Spec mezőjébe
  `N/A (<ok>)` kerül.
- **Nem-funkcionális követelmények** — a tervezésidejű NFR-modell szerint (lásd
  [`nfr-catalog.md`](nfr-catalog.md) — 5 eszközfüggetlen kategória, kategóriánként
  kiváltó jellel és minta-AC-vel). A `dev-workflow-intake` vonatkozó lépése a
  `NFR_INTAKE` kapcsoló szerint futtatja: felsorolja a story leírásából relevánsnak
  ítélt kategóriákat, kategóriánként vagy javasol egy `[nfr]` jelölésű AC-t, vagy
  tudatosan elveti egymondatos indoklással. Végig kell menni rajta akkor is, ha a
  story felszínesen nem tűnik NFR-relevánsnak — ilyenkor a kategória jellemzően "nem
  releváns", de a döntést ki kell mondani. Ha nem futott: a DoR Spec mezőjébe `N/A
  (<ok>)` kerül.
- **API-kontraktus** — ha releváns: endpoint, request/response váz, hibakódok
- **UI-referencia** — ha van vizuális bemenet (kép/Figma/draw.io), hivatkozz rá konkrétan (melyik elem mit csinál)
- **Teszterv** — foglald össze az AC-listában megjelölt `(automata)`/`(manuális)`/
  `(mindkettő)` jelölések alapján, mit fed le összesítve az automata teszt-kör, és mit
  kell böngészőben végigmenni; ha van speciális teszt-adat vagy környezet-előkészítés
  igénye, azt is itt említsd. Ez a mező kerül át változtatás nélkül a ticket "Teszterv"
  szekciójába, és ez alapján dolgozik a dev-workflow `qa-tester` subagentje.
- **Függőségek** — blokkol/blokkolva van-e mástól

## Bug
- **Cím** — mi romlott el, tömören
- **Kontextus** — a hat sorból (lásd fent "Kontextus — hat nevesített sor") **Eredmény**,
  **Kinek** és **Miért most** kötelező (mi legyen az elvárt állapot a javítás után, kit
  érint a hiba, mekkora a súlyosság/mennyire sürgős); **Siker mércéje** elhagyható
  N/A-ra, ha a lenti "Teszterv" pont már ellenőrizhetően lefedi; **Kötő korlát** és
  **Scope-on kívül** tipikusan N/A ("nincs extra korlát a Súlyosság/Környezet mezőn túl" /
  "nincs tudatosan ki nem javított mellékhiba"), kivéve ha explicit van ilyen.
- **Reprodukciós lépések** — számozott lista
- **Elvárt vs. tényleges viselkedés**
- **Érintett réteg(ek)** — frontend / backend / mindkettő (melyik repóban van a hiba, vagy
  hol látszik és hol a valódi oka, ha eltér)
- **Környezet** — verzió, platform, environment
- **Súlyosság** — kritikus / közepes / kisebb, van-e workaround
- **Bizonyíték** — log, screenshot, error message, ha van
- **Biztonsági kockázatok** — a tervezésidejű fenyegetés-modell (lásd
  [`threat-catalog.md`](threat-catalog.md)) Bugnál is lefut, de a kérdés itt szűkebb:
  **nyit-e a javítás új kockázatot** (pl. a fix új bemenetet fogad, tágabb jogosultságot
  ad, vagy egy eddig kódolt kimenetet nyersen ír vissza). Ha igen, `[biztonsági]` jelölésű
  regressziós AC készül rá; ha nem, ezt egy mondattal rögzítsd. Ha nem futott: `N/A (<ok>)`.
- **Teszterv** — hogyan igazolható, hogy a hiba javítva van (a reprodukciós lépések alapján
  ismételve), és kell-e hozzá új regressziós teszt

## Task
- **Cím** — a konkrét elvégzendő munka
- **Érintett réteg(ek)** — frontend / backend / mindkettő / nem kód-szintű (ha releváns)
- **Technológia / architektúra** — ha kód-szintű és a repó/terület stackje nem egyértelmű,
  ugyanúgy tisztázd, mint a Story "Technológia / architektúra" pontjánál fentebb
- **Kiindulási állapot** — mi létezik már ebből a kódban? (a "Technológia / architektúra"
  pontnál már megnézett kódra épít; ha van részleges implementáció/minta, nevezd meg
  fájl/modul-szinten, zöldmezős esetén mondd ki azt is)
- **"Done" definíció** — ez a task acceptance criteria-ja, ne maradjon üres; ha listaszerű,
  ugyanazt a formátum- és verifikációs-jelölés elvet kövesd, mint a Story "Acceptance
  criteria" pontjánál (Given/When/Then csak ahol indokolt, `(automata)`/`(manuális)`/
  `(mindkettő)` jelölés tételenként, és `[biztonsági]` prefix token a
  fenyegetés-modellből származó tételeken)
- **Biztonsági kockázatok** — a tervezésidejű fenyegetés-modell (lásd
  [`threat-catalog.md`](threat-catalog.md)) Tasknál is lefut. Nem kód-szintű Tasknál
  (konvenció-/dokumentáció-/workflow-meta változás) jellemzően nincs releváns kockázat —
  ilyenkor `N/A (nem kód-szintű változtatás)`. Kód-szintű Tasknál a Story-val azonos módon
  fut: releváns kategóriák felsorolása, kategóriánként `[biztonsági]` jelölésű AC vagy
  tudatosan vállalt kockázat egymondatos indoklással. Ha nem futott: `N/A (<ok>)`.
- **Kontextus** — kód-szintű Tasknál mind a hat sor kötelező (lásd fent "Kontextus — hat
  nevesített sor"); nem kód-szintű Tasknál (konvenció-/dokumentáció-/workflow-meta
  változás) az **Eredmény**, **Kinek** és **Miért most** akkor is kötelező, a **Kötő
  korlát** és a **Scope-on kívül** sor elhagyható N/A-ra, ha nincs értelmezhető tartalom.
- **Teszterv** — hogyan ellenőrizhető, hogy a "Done" definíció teljesült
- **Függőségek**

Ha egy pont nyilvánvalóan nem releváns (pl. nincs API-érintettség), mondd ki a
feltételezést, és lépj tovább — ne erőltesd a kérdést.
