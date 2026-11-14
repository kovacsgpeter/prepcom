---
name: dev-workflow-scoping
description: >
  A dev-workflow rendszer valódi indító lépése. Használd, ha a felhasználó azt mondja,
  hogy "szeretnék fejleszteni valamit egy repo/Jira projektben", vagy egy nyers, még
  tervezési fázisban lévő ötletet ír le, aminél nem egyértelmű, hogy egy story-ról van-e
  szó, vagy az valójában több különálló story-ra bomlik. Felméri a scope-ot, szükség
  esetén több story-ra bontja az ötletet, és minden azonosított story-ra meghívja a
  `dev-workflow-intake` skillt. Ha a felhasználó explicit jelzi, hogy az ötlet biztosan
  egyetlen, jól körülhatárolt story, közvetlenül a `dev-workflow-intake` skillt használd
  helyette. (A fenti mondat csak példa — a kanonikus, szerkeszthető változat a
  ../dev-workflow/config.md "Indító parancsok" táblázatában van, közeli parafrázis is elég a triggerhez.)
---

# dev-workflow — scoping (1. belépési pont)

Kanonikus indító mondat: **"szeretnék fejleszteni valamit a `<repo/jira projekt>`-ben"**
(vagy egy szabadon elmondott, még kialakulatlan ötlet).

Ez a skill **nem csinál DoR-interjút és nem hoz létre ticketet saját maga** — kizárólag azt
dönti el, hány önálló story-ra bomlik az ötlet, utána storyonként átadja a munkát a
[`../dev-workflow-intake/SKILL.md`](../dev-workflow-intake/SKILL.md) skillnek.

> 💡 **Modell-kérdés (tedd fel egyszer, session elején)**: ez és a rá épülő
> `intake`/`story-interview` fázis az, ahol a modellminőség ténylegesen számít
> (scope-bontás, AC-pontosság). A végrehajtási (`execute`) fázisok külön Codex custom
> agentprofilokon futnak. Ha a session jelenleg nem a `config.md`
> `PREFERRED_INTERVIEW_MODEL` profilján fut, mindig a configból olvasd az aktuális értéket,
> kérdezd meg **explicit, igen/nem formában**: *"Erre az interjú/scope-bontási fázisra
> átválthatunk `<PREFERRED_INTERVIEW_MODEL>`-re (a heti kereteden belül) — mehet, vagy
> maradjunk a jelenlegin?"* Ne csak javasold — várd meg a konkrét választ, mielőtt
> bármit tennél. Nemleges válasz esetén ne kérdezd meg újra ugyanebben a session-ben, és a
> `execute` fázisra se javasold a visszaváltást proaktívan.

## 1. Kezdeti scope-felmérés

- Kérd el az ötletet, ha még nem kaptad meg (szöveg, kép, draw.io, Figma — ugyanazok a
  bemenetek, mint amiket a `story-interview` elfogad).
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

- **1. eset (egy story)**: ne kérdezz tovább, adj egy rövid megerősítést ("Ez egy
  story-nak tűnik: `<cím>` — mehet így az interjúra?"), és lépj a 3. lépésre 1 story-val.
- **2. eset (több story)**: javasolj egy konkrét bontást — minden darabhoz rövid cím + 1-2
  mondatos cél —, és **kérj jóváhagyást**, mielőtt bármelyikre elindítanád az interjút. Ha a
  felhasználó módosít (összevon, szétválaszt, átnevez), frissítsd és erősíttesd meg újra.
- **3. eset (bizonytalan)**: tegyél fel célzott kérdéseket, amíg legalább annyi kirajzolódik,
  hogy 1. vagy 2. esetbe tudod sorolni. Ha a felhasználó "csináljunk egyet és a többit majd
  utólag" választ ad, az is jó válasz — vedd egy story-nak, és jegyezd meg, hogy explicit
  jelezte, hogy a többi rész később, külön jön.
- Ökölszabály a bontáshoz: két rész akkor legyen külön story, ha külön-külön is
  tesztelhető/szállítható, és nincs köztük olyan szoros, egy commit-on belüli összefüggés,
  ami miatt értelmetlen lenne külön ticketre venni őket. Ha bizonytalan vagy, inkább kérdezz
  rá a felhasználóra, mint hogy némán eldöntsd.

## 3. Storyonkénti feldolgozás

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

Az összes story feldolgozása után:
- Sorold fel az összes létrehozott ticket kulcsát, csoportosítva story szerint (és
  storyn belül FE/BE szerint, ha volt split).
- Mutasd meg a story-k közötti függőségi sorrendet, ha volt ilyen.
- Emlékeztető a következő lépésre: *"A ticket(ek) készen állnak. Ha implementálni akarod,
  indítsd a `dev-workflow-execute` skillt ezzel: 'vedd magadhoz azt a ticketet, ami soron
  következik'."*
- 💡 **Ez biztonságos új-task/session pont**, mielőtt az `execute`-tal folytatod — a
  teljes spec (interjú, elvetett opciók, scope-döntések) innentől
  a Jira ticket(ek)ben él, az `execute` onnan olvassa vissza a ticket ID/kulcs alapján, nem
  kell hozzá a beszélgetés-előzmény.

## Kilépési feltétel

Ez a skill soha nem hoz létre ticketet közvetlenül és soha nem implementál — kizárólag a
scope-ot dönti el, és storyonként átadja a munkát az `intake` skillnek. Ha csak egyetlen,
egyértelmű story derül ki, ne bonyolítsd túl a folyamatot — egy gyors megerősítés után
azonnal add át az `intake`-nek.
