---
name: dev-workflow-discovery
description: >
  A dev-workflow lánc legelső, opcionális belépési pontja — egy nyers, még
  körvonalazatlan ötletet keretez fel (probléma, szereplők, "miért most", siker-metrika,
  kötő korlátok, "Not doing" lista, feltételezés-térkép), mielőtt a `dev-workflow-scoping`
  vagy a `dev-workflow-intake` elkezdené a tényleges scope-olást/DoR-interjút. Használd,
  ha a felhasználó azt mondja: "keretezzük fel ezt az ötletet, mielőtt nekilátnánk
  scope-olni", vagy egy közeli parafrázisát ("segíts kikeretezni ezt, mielőtt bármit
  eldöntenénk", "gondoljuk át előbb, mi ez az ötlet valójában"). Hívható önállóan is,
  vagy a `dev-workflow-scoping` skill hívja meg automatikusan a `DISCOVERY_DEPTH`
  kapcsoló szerint. (A kanonikus, szerkeszthető mondat a
  ../dev-workflow/config.md "Indító parancsok" táblázatában van, közeli parafrázis is
  elég a triggerhez.)
---

# dev-workflow-discovery — ötlet-keretezés a lánc elején

## Cél

Ez a skill **kizárólag** a nyers, még körvonalazatlan ötlet → kereteket kapott,
scope-olásra/DoR-interjúra alkalmas "Discovery Brief" átalakulásért felel. **Nem** bontja
storykra az ötletet (az a `dev-workflow-scoping` dolga), és **nem** gyűjt AC-listát vagy
edge case-eket (az a `story-interview`/`dev-workflow-intake` dolga). A kimenete egy
önmagában értelmezhető Discovery Brief, amit a `dev-workflow-scoping` a "1. Kezdeti
scope-felmérés" lépésének bemeneteként használ.

Ezt a szétválasztást szándékosan tartsd be: ha a felhasználó menet közben már konkrét
story-bontásba vagy AC-részletekbe menne, jegyezd meg, de tereld vissza a keretező
kérdésekre — a bontás/AC-gyűjtés a lánc következő lépéseinek felelőssége.

## Konfiguráció

Olvasd be [`../dev-workflow/config.md`](../dev-workflow/config.md)-t (rövid, csak értékek; egy kulcs jelentése a [`../dev-workflow/config-reference.md`](../dev-workflow/config-reference.md) azonos című szakaszában — csak azt a szakaszt olvasd be, a referenciát egészben soha). Ebből a skillből a
`DISCOVERY_DEPTH` kapcsoló releváns — ez dönti el, `light` vagy `full` mélységben fut a
keretezés (`off` esetén ez a skill a `dev-workflow-scoping`-on keresztül automatikusan
nem is indul el, lásd lent "Használat subagentként"). A kapcsoló három értékének
(`off`/`light`/`full`) tényleges jelentése és a preset-tábla bekötése a **COCALC-368**
sub-task tárgya — ez a skill csak a hivatkozást készíti elő, nem várja meg azt: ha a
`config.md`-ben a kapcsoló még nincs kifejtve, vedd `light`-nak és jelezd egy rövid,
egysoros megjegyzéssel (a többi kapcsoló fallback-jelzésének mintájára).

Kanonikus indító mondat: **"keretezzük fel ezt az ötletet, mielőtt nekilátnánk
scope-olni"** (vagy egy szabadon elmondott, még nyers ötlet, amivel a felhasználó
explicit keretezést kér, mielőtt bármi mást eldöntenétek).

## 1. Ötlet-keretezés (light mód alapja)

> 📊 Lépés eleje: hívd meg a `mcp__ccd_session__mark_chapter` tool-t
> `dev-workflow-discovery / 1 — Ötlet-keretezés` címkével (ha a tool nem elérhető, hagyd
> ki és folytasd).

- Kérd el az ötletet, ha még nem kaptad meg (szöveg, kép, vázlat — ugyanazok a bemenetek,
  mint amiket a `story-interview` elfogad).
- **Interjú-stílus** (a `story-interview` COCALC-354 hipotézis-vezérelt technikájának
  mintájára): kis kötegben kérdezz (max 2-3 kérdés/kör), és minden kérdéskört indíts egy
  hipotézissel és egy konkrét tippel/javasolt megfogalmazással, amit a felhasználó csak
  jóváhagy vagy módosít — ne üres kérdést tegyél fel, hanem konkrét kiindulást ajánlj fel.
- Ami már megvan a bemenetből (szöveg, kép, vázlat elemzéséből), azt **ne kérdezd
  vissza** — abból indulj ki, `light` és `full` módban egyaránt.
- Menj végig a hét light-elemen (kis kötegben, a fenti stílus szerint):
  1. **Problémaállítás "How Might We" formában** — fogalmazz meg egy konkrét "Hogyan
     tudnánk...?" mondatot tippként, és kérd a felhasználó jóváhagyását/pontosítását.
  2. **Szereplők** — kik használják/kiket érint közvetlenül.
  3. **"Miért most"** — a konkrét kiváltó esemény vagy prioritás; ha a válasz csak
     "ideje lenne már" jellegű, kérdezz rá az ok-okozatra (l. "Red Flags").
  4. **Siker mércéje** — mi mutatja meg, hogy sikeres volt.
  5. **Kötő korlátok** — mi köti a megoldást (határidő, technikai korlát, jogszabály
     stb.).
  6. **"Not doing" lista** — mit nem csinálunk, és miért; ha indoklás nélkül üresen
     maradna, kérdezz rá explicit (l. "Red Flags" — a rejtett scope-csúszás jele).
  7. **Feltételezés-térkép** — három alponttal: mire fogadunk (aminek igaznak kell
     lennie ahhoz, hogy az ötlet működjön), mi dönthetné meg (milyen jövőbeli
     esemény/adat cáfolná), mit hagyunk tudatosan figyelmen kívül.
- Ha a hét elem együttes átgondolása alapján már itt egyértelművé válik, hogy az ötletet
  ebben a formában nem érdemes megcsinálni (pl. nincs meggyőző "miért most", vagy a
  siker mércéje elérhetetlen), ez érvényes, lezárt kimenet — l. lent "Kilépési
  feltétel". Ha nem, folytasd a `DISCOVERY_DEPTH` szerint: `light` esetén ugorj a 3.
  lépésre, `full` esetén a 2. lépésre.

## 2. Alternatíva-generálás és stressz-teszt (csak `full` módban)

> 📊 Lépés eleje: hívd meg a `mcp__ccd_session__mark_chapter` tool-t
> `dev-workflow-discovery / 2 — Alternatíva-generálás és stressz-teszt` címkével (ha a
> tool nem elérhető, hagyd ki és folytasd).

Ez a lépés **kimarad**, ha a `DISCOVERY_DEPTH` `light` vagy `off` — ilyenkor ugorj
egyenesen a 3. lépésre (Discovery Brief összeállítása).

- Az 1. lépés hét eleme alapján generálj **5-8 alternatív irányt**, mindegyiket egy
  megnevezett lencsével jelölve:
  - **Inverzió** — mi lenne, ha az ellenkezőjét csinálnánk.
  - **Constraint-elvétel** — mi lenne, ha az egyik kötő korlát nem létezne.
  - **Egyszerűsítés** — mi a lehető legegyszerűbb verzió, ami még megoldja a problémát.
  - **Közönségváltás** — ugyanaz a probléma, más szereplőnek/közönségnek megoldva.
  - **10x skálázás** — mi változna, ha 10-szer akkora léptékben gondolkodnánk.
- **Klaszterezd** a generált irányokat **2-3 csoportba** (rokon irányok összevonása), és
  mutasd meg a felhasználónak csoportosítva, csoportonként 1-2 mondatos indoklással.
- **A felhasználó választ vagy vet el irányt(okat) — a modell csak javasol és indokol,
  nem dönt helyette** (l. "Red Flags" — az első felvetett irány azonnali jóváhagyása
  visszahárítás). Kérj explicit választást/kombinációt/elutasítást, mielőtt tovább
  mennél.
- A kiválasztott (vagy kombinált) irány(ok)ra futtass **irányonkénti stressz-tesztet**,
  három szemponttal:
  1. Valódi fájdalmat old-e meg (nem csak feltételezett problémát).
  2. Megvalósítható-e a meglévő stackkel (repo-szintű reália, nem elméleti).
  3. Miben más, mint a jelenlegi/elvetett irányok (differenciáló érv).
- Ha a stressz-teszt egyetlen irányt sem igazol vissza (mindegyik megbukik legalább egy
  szemponton, és a felhasználó sem tud rajta korrigálni), ez **érvényes, értékes
  eredmény, nem hiba** — a Brief indoklással rögzíti, hogy az ötletet ebben a formában
  nem érdemes megcsinálni, és a folyamat **nem lép tovább** a `dev-workflow-scoping`
  felé (l. lent "Kilépési feltétel").

## 3. Discovery Brief összeállítása

> 📊 Lépés eleje: hívd meg a `mcp__ccd_session__mark_chapter` tool-t
> `dev-workflow-discovery / 3 — Discovery Brief összeállítása` címkével (ha a tool nem
> elérhető, hagyd ki és folytasd).

A keretezés eredménye egy "Discovery Brief" nevű Markdown blokk — a `story-interview`
"DoR Spec" blokkjának mintájára, **változtatás nélkül másolható, önálló egységként**:

```markdown
## Discovery Brief

**Cím:** <rövid, leíró cím>

**Problémaállítás (How Might We):** <"Hogyan tudnánk...?" mondat>
**Szereplők:** <kik érintettek/használják>
**Miért most:** <a konkrét kiváltó esemény/prioritás>
**Siker mércéje:** <mi mutatja meg, hogy sikeres volt>
**Kötő korlátok:** <mi köti a megoldást>
**Not doing:** <mit nem csinálunk, és miért>

**Feltételezés-térkép:**
- Mire fogadunk: ...
- Mi dönthetné meg: ...
- Mit hagyunk tudatosan figyelmen kívül: ...

**Generált irányok:** (csak `full` módban; `light` módban a mező teljesen kimarad, nem
üres helyfoglalóként)
1. <irány neve> (<lencse>) — <1 mondatos leírás>
...

**Választott irány:** (csak `full` módban)
<a kiválasztott/kombinált irány, a stressz-teszt eredményével>

**Elvetett irányok indoklása:** (csak `full` módban)
- <irány> — <miért esett ki>

**Döntés:** `folytatható` | `nem érdemes megcsinálni (indoklással)`

**Forrás-artifactok:**
- <pl. "szöveges leírás a felhasználótól", "screenshot: ...">
```

Ezt a blokkot mindig változtatás nélkül másolható, önálló Markdown egységként add ki — ha
kell köszönő szöveg vagy magyarázat, az a blokk elé vagy mögé kerüljön, ne középre keverve.

### Leképezés a DoR Spec Kontextusára

A Brief hat keretező mezője **közvetlenül** a `story-interview` DoR Spec hat elemű
Kontextusát tölti, amikor a `dev-workflow-scoping`/`dev-workflow-intake` a Brief-ből
indul:

| Discovery Brief mező | DoR Spec Kontextus-sor |
|---|---|
| Problémaállítás (How Might We) | **Eredmény** |
| Szereplők | **Kinek** |
| Miért most | **Miért most** |
| Siker mércéje | **Siker mércéje** |
| Kötő korlátok | **Kötő korlát** |
| Not doing | **Scope-on kívül** |

A feltételezés-térkép, a generált irányok és a döntés-mező nem képződik le közvetlenül
egyetlen Kontextus-sorra sem — ezek a ticket "Kiindulási állapot" vagy "Boundaries"
szekciójába kerülhetnek, ha a hívó fél relevánsnak ítéli, de ez már a
`dev-workflow-scoping`/`dev-workflow-intake` felelőssége, nem ennek a skillnek.

## 4. Confluence-publikálás

> 📊 Lépés eleje: hívd meg a `mcp__ccd_session__mark_chapter` tool-t
> `dev-workflow-discovery / 4 — Confluence-publikálás` címkével (ha a tool nem elérhető,
> hagyd ki és folytasd).

A jóváhagyott Discovery Brief-et a COCALC-372 ADR-infrastruktúráján publikáld, a
`dev-workflow-intake/SKILL.md` "2.e — ADR-trigger" "Hogyan kérdez" lépésének mintáját
követve, egy lényegi eltéréssel: a Brief **nem sorszámozott**, hanem **cím-alapú**
(nincs még Jira-ticket ilyenkor, amihez sorszámot lehetne kötni):

1. Nézd meg a `config.md` `CONFLUENCE_BRIEF_PARENT_ID` alatti meglévő al-oldalak
   listáját (Confluence MCP-vel), hogy legyen-e névütközés.
2. Hozd létre az oldalt a `CONFLUENCE_SPACE_KEY` space-ben, a `CONFLUENCE_BRIEF_PARENT_ID`
   alatt, `Discovery Brief: <rövid, leíró cím>` címmel. Ha ez a cím már foglalt, egészítsd
   ki a létrehozás dátumával a disambiguáláshoz: `Discovery Brief: <cím> (ÉÉÉÉ-HH-NN)`.
3. Az oldal tartalma a fenti Discovery Brief blokk **angol fordítása** — a `config.md`
   "WORKING_LANGUAGE" szekció kivétele szerint a Confluence-re írt dokumentumok (ADR-ek
   és Discovery Brief-ek) mindig angolul íródnak, függetlenül attól, hogy a keretező
   interjú (és maga a session-beli Brief-blokk) magyarul zajlott.
4. A publikált oldal linkjét vedd fel a Discovery Brief blokk "Forrás-artifactok" mezője
   alá, hogy a hívó fél (`dev-workflow-scoping`) tovább tudja vinni a lánc következő
   lépéseire — a link a `jira-ticket-template.md` "Forrás" infobox mezőjébe kerül majd,
   amikor a `dev-workflow-intake` létrehozza a ticket(ek)et (lásd `jira-ticket-template.md`
   "Forrás mező" szakasz). Mivel a Brief a ticket létrehozása **előtt** készül, itt még
   nincs mit visszaírni Jira-kommentbe (ellentétben a "2.e" ADR-eset kétirányú
   linkelésével) — a link egyszerűen a session kimenetének/Brief-nek a része marad,
   amíg a ticket létre nem jön.

### Fallback — ha a Confluence nem elérhető

Ha a Confluence MCP-hívás hibázik, vagy a `config.md` `CONFLUENCE_SPACE_KEY`/
`CONFLUENCE_BRIEF_PARENT_ID` kapcsolók bármelyike hiányzik/üres (lásd `config.md`
"Confluence-írás (CONFLUENCE_* kapcsolók)" fallback-szabálya): **ne akadj el**. A már
jóváhagyott Discovery Brief blokk a session kimenetében változatlanul megmarad, a
"Forrás-artifactok" mező alá pedig kerüljön egy explicit jelzés: "⚠️ Confluence-publikálás
nem sikerült — ez a tartalom egy Discovery Brief-nek szánt, jóváhagyott keretezés, amit
később, amint elérhető a Confluence, fel kell vinni `CONFLUENCE_BRIEF_PARENT_ID` alá." Ez
**nem** számít üres/el nem készült Brief-nek — a keretezés és a jóváhagyás megtörtént,
csak a Confluence-másolat marad el; a `dev-workflow-scoping` a Brief tartalmával
(Confluence-link nélkül) ugyanúgy folytathatja a munkát.

## Kimeneti szerződés

A skill kimenete a fenti "3. Discovery Brief összeállítása" Markdown blokk, jóváhagyott
állapotban, a "4. Confluence-publikálás" eredményével (Confluence-link, vagy sikertelen
publikálás esetén az explicit fallback-jelzés) a "Forrás-artifactok" mezőben. A hívó fél
(jellemzően `dev-workflow-scoping`) felelőssége, hogy ezt a kimenetet a saját "1. Kezdeti
scope-felmérés" lépésének bemeneteként használja, és hogy a Confluence-linket a lánc
további lépésein (`dev-workflow-intake` ticket-összeállítás) végigvigye a
`jira-ticket-template.md` "Forrás" infobox mezőjébe.

## Kilépési feltétel

A Discovery Brief csak akkor tekinthető késznek, ha a felhasználó **explicit**
jóváhagyta a végleges tervezetet — egy elmosódott félmondat, témaváltás vagy hallgatás
nem számít jóváhagyásnak (a `story-interview` "Összegzés és jóváhagyás" mintájára).

**Negatív kimenetel is érvényes lezárás**: ha a keretezés (1. lépés) vagy a stressz-teszt
(2. lépés, `full` módban) alapján az derül ki, hogy az ötletet ebben a formában **nem
érdemes megcsinálni**, ez nem hibaág — a Discovery Brief ezt a döntést indoklással
rögzíti, és a folyamat **nem lép tovább** a `dev-workflow-scoping` felé. Ez ugyanolyan
"kész" állapotnak számít, mint egy pozitív, scope-olásra továbbadott Brief — a
"kilépési feltétel" mindkét esetben a felhasználó explicit jóváhagyása marad, csak a
jóváhagyott tartalom más (itt: "ezt nem visszük tovább, mert...").

## Használat subagentként más workflow-ban

Ez a skill úgy lett tervezve, hogy egy másik skill vagy egy orchestrátor **subagentként
hívja meg**, a `story-interview` "Használat subagentként" szekciójának mintájára:

- **Bemeneti szerződés:** egy nyers, még körvonalazatlan ötlet (szöveg/kép/vázlat),
  plusz opcionálisan a `discovery_depth` (`light`/`full`) paraméter — a `config.md`
  `DISCOVERY_DEPTH` kapcsoló feloldott értéke. Szólóban hívva mindig a felhasználóval
  egyeztetett mélységben fut; ha a hívó fél nem adja át a paramétert, egysoros jelzéssel
  `light`-ra esik vissza.
- **Kimeneti szerződés:** a fenti "Discovery Brief" Markdown blokk, jóváhagyott
  állapotban (vagy — negatív kimenetel esetén — az indoklással lezárt, "nem érdemes
  megcsinálni" döntés, lásd "Kilépési feltétel").
- **Önálló hívhatóság**: ez a skill a `dev-workflow-scoping`-tól **függetlenül is**
  hívható — ha a felhasználó a kanonikus mondattal (vagy annak parafrázisával) közvetlenül
  ezt a skillt kéri, fusson le akkor is, ha a `DISCOVERY_DEPTH` kapcsoló jelenleg `off`-on
  áll. Az explicit, közvetlen hívás mindig felülírja a kapcsoló hallgatólagos
  alapértékét — az `off` érték csak azt dönti el, hogy a `dev-workflow-scoping`
  **automatikusan** meghívja-e ezt a skillt, nem azt, hogy a skill egyáltalán elérhető-e.
- Ha a `dev-workflow-scoping` hívja subagentként, és a hívás már egy korábban elkészült
  Discovery Brief-fel érkezik, ezt a skillt **nem kell újrafuttatni** — a hívó fél ebből
  az esetből indul (lásd `dev-workflow-scoping/SKILL.md` "1. Kezdeti scope-felmérés").

## Red Flags

- A felhasználó egyetlen mondatban leírja a megoldást, ahelyett hogy a problémát írná
  le — a "megoldás beugrás" jele, ami miatt a probléma-állítás ("How Might We" forma)
  explicit rákérdezést igényel, nem a felhasználó által már megnevezett megoldás
  visszaírását.
- A "miért most" kérdésre a válasz csak annyi, hogy "mert ideje lenne" — ez nem
  ok-okozati indoklás, hanem halogatás vagy trend-követés jele, érdemes rákérdezni a
  tényleges kiváltó eseményre.
- A "Not doing" lista indoklás nélkül üresen marad — ez rejtett scope-csúszás jele,
  nem tényleges "mindent megcsinálunk" döntés.
- A feltételezés-térkép egyetlen tétele sem dönthető meg semmilyen jövőbeli
  eseménnyel/adattal — ez arra utal, hogy az "ötlet" valójában már eldöntött döntés,
  aminek a keretezése csak formalitás, nem tényleges nyitott kérdés.
- `full` módban a felhasználó az első felvetett irányt azonnal jóváhagyja, anélkül hogy
  megnézné a többi generált alternatívát — ez visszahárítja a döntést a modellre,
  ahelyett hogy tényleges választás történne.
- A stressz-teszt minden irányra ugyanazt az általános, sablonos indoklást adja vissza
  ("megvalósítható, hasznos lenne") — ez arra utal, hogy a stressz-teszt formálisan
  lezajlott, de érdemben nem különböztette meg az irányokat.

## Tipikus kifogások

- **"Ez egy egyszerű ötlet, nem kell keretezni, ugorjunk a scope-olásra."** — Egy
  egyszerű ötletnek is van problémaállítása és "miért most"-ja; a keretezés nem hosszú
  interjút jelent, csak explicit, rögzített döntéseket, amik percek alatt kimondhatók
  (`light` módban).
- **"Majd menet közben kiderül, mi nem tartozik bele."** — A "Not doing" lista pont
  azért létezik, hogy ez a döntés ne menet közben, hallgatólagosan derüljön ki, hanem
  most, tudatosan, indoklással rögzüljön — ez véd a későbbi scope-vitáktól.
- **"Nem kell alternatívákat generálni, tudjuk, mit akarunk."** — Ez `light` módban
  helyénvaló válasz (a `light` mód nem generál alternatívát), de ha a felhasználó
  `full` mélységet kért, az alternatívák és a stressz-teszt éppen azt ellenőrzik, hogy a
  már kiválasztott irány valóban a legjobb-e — a végső döntés így is a felhasználóé
  marad, a modell csak javasol és indokol.
