---
name: dev-workflow-scoping
description: >
  A dev-workflow rendszer valódi indító lépése. Használd, ha a felhasználó azt mondja,
  hogy "szeretnék fejleszteni valamit a <repo/jira projekt>-ben", vagy egy nyers, még
  tervezési fázisban lévő ötletet ír le, aminél nem egyértelmű, hogy egy story-ról van-e
  szó, vagy az valójában több különálló story-ra bomlik. Felméri a scope-ot, szükség
  esetén több story-ra bontja az ötletet, és minden azonosított story-ra meghívja a
  `dev-workflow-intake` skillt. Ha a felhasználó explicit jelzi, hogy az ötlet biztosan
  egyetlen, jól körülhatárolt story, közvetlenül a `dev-workflow-intake` skillt használd
  helyette. (A fenti mondat csak példa — a kanonikus, szerkeszthető változat a
  ../dev-workflow/config.md "Indító parancsok" táblázatában van, közeli parafrázis is elég a triggerhez.)
---

# dev-workflow — scoping (1. belépési pont)

## Konfiguráció

Olvasd be először [`../dev-workflow/config.md`](../dev-workflow/config.md)-t (rövid, csak értékek; egy kulcs jelentése a [`../dev-workflow/config-reference.md`](../dev-workflow/config-reference.md) azonos című szakaszában — csak azt a szakaszt olvasd be, a referenciát egészben soha). Ebből a
skillből releváns: `PREFERRED_INTERVIEW_MODEL` (lásd lent a modell-kérdés), `REPO_MAP` (a
`<repo/jira projekt>` feloldásához, amit ez a skill csak továbbad a `dev-workflow-intake`
skillnek), és a "Munkamódprofil (WORKFLOW_PROFILE)" szekció `INTERVIEW_EXPLANATION_STYLE`
kapcsolója — ez egyrészt a `dev-workflow-intake`-en és a `story-interview`-n keresztül hat
a tényleges interjú-kérdésekre (lásd `dev-workflow-intake/SKILL.md`), másrészt **ez a skill
saját maga is olvassa**, a lenti "2. Bontási javaslat" döntési pontjához (2. eset). A
`DISCOVERY_DEPTH` kapcsoló is releváns — ez dönti el, a lenti "1. Kezdeti scope-felmérés"
lépés meghívja-e a [`../dev-workflow-discovery/SKILL.md`](../dev-workflow-discovery/SKILL.md)
skillt, mielőtt a tényleges scope-felmérésbe kezdene.

Kanonikus indító mondat: **"szeretnék fejleszteni valamit a `<repo/jira projekt>`-ben"**
(vagy egy szabadon elmondott, még kialakulatlan ötlet).

Ez a skill **nem csinál DoR-interjút és nem hoz létre ticketet saját maga** — kizárólag azt
dönti el, hány önálló story-ra bomlik az ötlet, utána storyonként átadja a munkát a
[`../dev-workflow-intake/SKILL.md`](../dev-workflow-intake/SKILL.md) skillnek.

> 💡 **Modell-kérdés (tedd fel egyszer, session elején)**: ez és a rá épülő
> `intake`/`story-interview` fázis az, ahol a modellminőség ténylegesen számít
> (scope-bontás, AC-pontosság) — a végrehajtási (`execute`) fázis subagentjei ellenben fix
> Sonneten futnak. Ha a session jelenleg nem a `config.md` `PREFERRED_INTERVIEW_MODEL`
> értékén fut (jelenleg Opus 5, de ezt mindig a config.md-ből olvasd, ne feltételezd),
> kérdezd meg **explicit, igen/nem formában**: *"Erre az interjú/scope-bontási fázisra
> átválthatunk `<PREFERRED_INTERVIEW_MODEL>`-re (a heti kereteden belül) — mehet, vagy
> maradjunk a jelenlegin?"* Ne csak javasold — várd meg a konkrét választ, mielőtt
> bármit tennél. Nemleges válasz esetén ne kérdezd meg újra ugyanebben a session-ben, és a
> `execute` fázisra se javasold a visszaváltást proaktívan.

## 1. Kezdeti scope-felmérés

> 📊 Lépés eleje: hívd meg a `mcp__ccd_session__mark_chapter` tool-t
> `dev-workflow-scoping / 1 — Kezdeti scope-felmérés` címkével (ha a tool nem elérhető,
> hagyd ki és folytasd).

- **Discovery-hívás a `DISCOVERY_DEPTH` szerint** — ezt a döntést tedd meg **mielőtt**
  bármilyen scope-kérdést feltennél:
  - Ha a hívás már egy korábban elkészült Discovery Brief-fel érkezik (akár mert a
    felhasználó közvetlenül a `dev-workflow-discovery` skillt hívta előbb, akár mert egy
    korábbi kör már lefuttatta), **ne futtasd újra** a discovery skillt, függetlenül a
    `DISCOVERY_DEPTH` értékétől — ebből a Brief-ből indulj, és lépj tovább a lenti
    kérdésekre.
  - Egyébként (nincs még Discovery Brief) nézd meg a `DISCOVERY_DEPTH` értékét:
    - `off`: ne hívd meg a discovery skillt, és ne is jelezd ezt — a viselkedés
      változatlan marad ahhoz képest, mintha a `DISCOVERY_DEPTH` kapcsoló nem is létezne.
    - `light`/`full`: hívd meg a
      [`../dev-workflow-discovery/SKILL.md`](../dev-workflow-discovery/SKILL.md) skillt
      subagentként, add át neki a `discovery_depth` paramétert, és a kapott Discovery
      Brief-fel folytasd ezt a lépést.
- Kérd el az ötletet, ha még nem kaptad meg (szöveg, kép, draw.io, Figma — ugyanazok a
  bemenetek, mint amiket a `story-interview` elfogad) — kivéve, ha ez már a fenti
  Discovery Brief-ből megvan.
- Tegyél fel **kevés, nagyvonalú** kérdést (ne menj bele AC-részletekbe — az az `intake`
  dolga): mi a fő cél, kik a szereplők/flow-k, van-e benne több, egymástól függetlenül
  szállítható/tesztelhető rész.
- Döntsd el, az ötlet melyik kategóriába esik:
  1. **Egyértelműen egy story** — konkrét, egy user-flow-t vagy egy jól körülhatárolt
     funkciót ír le.
  2. **Egyértelműen több story** — a felhasználó több, egymástól elválasztható célt
     sorol fel, vagy a scope túl nagy egyetlen story-hoz (pl. egy egész új modul).
  3. **Még bizonytalan / tervezési fázisban van** — a felhasználó maga sem tudja
     pontosan, mennyi munkáról van szó, vagy az ötlet még alakul.

## 2. Bontási javaslat

> 📊 Lépés eleje: hívd meg a `mcp__ccd_session__mark_chapter` tool-t
> `dev-workflow-scoping / 2 — Bontási javaslat` címkével (ha a tool nem elérhető, hagyd
> ki és folytasd).

- **1. eset (egy story)**: ne kérdezz tovább, adj egy rövid megerősítést ("Ez egy
  story-nak tűnik: `<cím>` — mehet így az interjúra?"), és lépj a 3. lépésre 1 story-val.
- **2. eset (több story)**: javasolj egy konkrét bontást — minden darabhoz rövid cím + 1-2
  mondatos cél —, és **kérj jóváhagyást**, mielőtt bármelyikre elindítanád az interjút. Ha a
  felhasználó módosít (összevon, szétválaszt, átnevez), frissítsd és erősíttesd meg újra.
  **Kifejtettség (`INTERVIEW_EXPLANATION_STYLE`)**: `verbose` esetén (ez az alapértelmezés)
  minden javasolt story mellé írj egy rövid indoklást is, hogy *miért* ide került (pl. miért
  külön szállítható/tesztelhető rész, vagy miért van köztük függőség); `terse` esetén elég a
  jelenlegi tömör cím + 1-2 mondatos cél, indoklás nélkül.
- **3. eset (bizonytalan)**: tegyél fel célzott kérdéseket, amíg legalább annyi kirajzolódik,
  hogy 1. vagy 2. esetbe tudod sorolni. Ha a felhasználó "csináljunk egyet és a többit majd
  utólag" választ ad, az is jó válasz — vedd egy story-nak, és jegyezd meg, hogy explicit
  jelezte, hogy a többi rész később, külön jön.
- Ökölszabály a bontáshoz: két rész akkor legyen külön story, ha külön-külön is
  tesztelhető/szállítható, és nincs köztük olyan szoros, egy commit-on belüli összefüggés,
  ami miatt értelmetlen lenne külön ticketre venni őket. Ha bizonytalan vagy, inkább kérdezz
  rá a felhasználóra, mint hogy némán eldöntsd.

## 3. Storyonkénti feldolgozás

> 📊 Lépés eleje: hívd meg a `mcp__ccd_session__mark_chapter` tool-t
> `dev-workflow-scoping / 3 — Storyonkénti feldolgozás` címkével (ha a tool nem
> elérhető, hagyd ki és folytasd).

A jóváhagyott bontás minden egyes story-jára, **sorban** (ne párhuzamosan, hogy a
függőségeket menet közben tudd kezelni):

- Hívd meg a [`../dev-workflow-intake/SKILL.md`](../dev-workflow-intake/SKILL.md) 1–4. lépését (repo/projekt
  feloldás → DoR-interjú → ticket összeállítás → FE/BE split, ha kell → létrehozás
  Jira-ban) **erre az egy story-ra**, azzal a kiegészítéssel, hogy az `intake` 5. lépésének
  (Visszajelzés) záró "következő parancs" emlékeztetőjét **ne írja ki** — csak a létrehozott
  ticket kulcs(oka)t jelentse vissza neked. A teljes összesítést te adod a végén (4. lépés).
- Ha egy story a korábban létrehozott story(k) valamelyikétől függ (pl. B story a design-t
  vagy egy API-t az A story-ból várja), a ticket "Függőségek" mezőjében és Jira
  linkkel/dependency-vel (`createIssueLink`) kösd össze — ugyanúgy, ahogy az `intake` már
  teszi FE/BE splitnél.
- Ha egy story maga is FE/BE split alá esik az `intake` 3a lépése szerint, az simán
  megtörténik ott — a scoping ebbe nem szól bele.

## 4. Végösszefoglaló

> 📊 Lépés eleje: hívd meg a `mcp__ccd_session__mark_chapter` tool-t
> `dev-workflow-scoping / 4 — Végösszefoglaló` címkével (ha a tool nem elérhető, hagyd
> ki és folytasd).

Az összes story feldolgozása után:
- Sorold fel az összes létrehozott ticket kulcsát, csoportosítva story szerint (és
  storyn belül FE/BE szerint, ha volt split).
- Mutasd meg a story-k közötti függőségi sorrendet, ha volt ilyen.
- Emlékeztető a következő lépésre: *"A ticket(ek) készen állnak. Ha implementálni akarod,
  indítsd a `dev-workflow-execute` skillt ezzel: 'vedd magadhoz azt a ticketet, ami soron
  következik'."*
- 💡 **Ez jó pont a `/clear`-re**, mielőtt az `execute`-tal folytatod (akár most, akár egy
  következő session-ben) — a teljes spec (interjú, elvetett opciók, scope-döntések) innentől
  a Jira ticket(ek)ben él, az `execute` onnan olvassa vissza a ticket ID/kulcs alapján, nem
  kell hozzá a beszélgetés-előzmény.

## Kilépési feltétel

Ez a skill soha nem hoz létre ticketet közvetlenül és soha nem implementál — kizárólag a
scope-ot dönti el, és storyonként átadja a munkát az `intake` skillnek. Ha csak egyetlen,
egyértelmű story derül ki, ne bonyolítsd túl a folyamatot — egy gyors megerősítés után
azonnal add át az `intake`-nek.

## Red Flags

- A felhasználó egy mondatban 3-4 különálló funkciót sorol fel, de a skill mégis "ez egy
  story" döntést hoz kérdés nélkül, az "1. eset" ágára ugorva.
- A "2. Bontási javaslat" bontására a felhasználó csak annyit mond "oké" — ez nem konkrét
  jóváhagyás arra, hogy pontosan melyik darabokra bomlik az ötlet.
- A `PREFERRED_INTERVIEW_MODEL`-re váltás kérdésére a felhasználó korábban ugyanebben a
  session-ben nemmel válaszolt, de a skill mégis újra megkérdezi.
- Két story közötti függőség (pl. B a design-t vagy egy API-t A-ból várja) csak szövegesen
  kerül rögzítésre, Jira-link (`createIssueLink`) nélkül.
- A felhasználó "csináljunk egyet, a többit majd utólag" mondatát a skill nem jegyzi meg
  explicit — elveszik, hogy a többi rész tudatosan később jön, nem elfelejtve maradt.
- Egy egész új modul méretű scope egyetlen story-ként megy tovább kérdés nélkül, mert
  "gyorsabb lesz" — a "2. eset" bontási kritériuma (külön szállítható/tesztelhető részek)
  nincs végiggondolva.

## Tipikus kifogások

- **"Egyértelmű ez az egész, ugorjunk rögtön az interjúra."** — Ha a felhasználó explicit
  egy story-nak jelöli, a skill nem erőlteti a bontást; de ha a leírásban több, egymástól
  független cél is van, ezt egy rövid visszakérdezéssel kell tisztázni, nem hallgatólagosan
  eldönteni.
- **"Nem kell külön kérdezni a modellváltásról, úgyis mindegy."** — Az interjú/scope-
  bontási fázisban a modellminőség számít legtöbbet (scope-bontás, AC-pontosság), ezért ez
  explicit igen/nem kérdés, nem mellékes formalitás.
- **"A story-k közötti függőségeket úgyis tudjuk fejben tartani."** — A Jira-linkek
  nélkül a végrehajtási sorrend elveszik a következő session-ben, ahol már nincs meg ez a
  beszélgetés-előzmény — az `execute` csak a ticketből olvas vissza, a chatből nem.
