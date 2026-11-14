---
name: story-interview
description: Projekt- és eszköz-független Definition of Ready (DoR) interjú skill. Egy kezdeti, gyakran hiányos ötletet (szöveg, kép, draw.io diagram, Figma-export vagy ezek kombinációja) strukturált, DoR-kész specifikációvá alakít — anélkül, hogy bármilyen konkrét projekt-menedzsment eszközbe (Jira, Linear, GitHub Issues stb.) írna. Használd, ha a felhasználó egy story/bug/task ötletet ír le, vázlatot, mockupot vagy diagramot ad, és azt szeretné, hogy pontosítsd és DoR-formátumba hozd, mielőtt bárhova bekerülne. Szólóban is hívható, és más workflow-ba (pl. egy Jira-specifikus ticket-létrehozó skillbe) is beilleszthető subagentként.
---

# story-interview — általános Definition of Ready interjú

## Cél

Ez a skill **kizárólag** a nyers ötlet → DoR-kész specifikáció átalakulásért felel. **Nem** hoz létre semmilyen ticketet, issue-t vagy rekordot semmilyen külső rendszerben. A kimenete egy önmagában értelmezhető, szabványos struktúrájú specifikáció, amit egy másik, eszköz-specifikus skill (pl. `jira-create-story`, `linear-create-issue` stb.) tud tovább dolgozni.

Ezt a szétválasztást szándékosan tartsd be: ha a felhasználó menet közben konkrét projekt-menedzsment eszközt említ ("tedd be Jirába", "hozz létre issue-t"), jegyezd meg célként, de a tényleges létrehozást utasítsd el ebben a skillben — jelezd, hogy ahhoz egy másik, eszköz-specifikus skill/subagent kell, és a kész specifikációt add át annak (vagy írd le, hogy a felhasználó melyik skillt hívja ezután).

## Elfogadott bemenetek

A felhasználó bármelyik formában (vagy ezek kombinációjában) indíthat:

1. **Szöveg** — szabad szöveges ötlet, vázlat, egy mondat is elég induláshoz.
2. **Kép** — screenshot, mockup, UI-terv, kézzel rajzolt vázlat. Nézd meg vizuálisan (a kép natívan elérhető a kontextusban, ha fel lett töltve), és vonj le belőle konkrét, ellenőrizhető állításokat (elrendezés, mezők, állapotok, hibaüzenetek helye). Ne találgass olyat, ami a képen nem látszik — kérdezz rá.
3. **draw.io diagram** (`.drawio` / `.xml`) — folyamatábra, állapotgép, architektúra-vázlat. Olvasd be a fájlt (a Filesystem eszközzel, ha elérhető), értelmezd a csomópontokat és éleket mint folyamat-lépéseket/állapot-átmeneteket, és ebből vezesd le az AC-jelölteket (pl. minden elágazás egy edge case-t vagy egy külön AC-t jelenthet).
4. **Figma-export/link** — ha van Figma MCP-hozzáférés, olvasd ki a releváns frame-et/komponenst; ha nincs, kérj a felhasználótól exportált képet vagy szöveges leírást a frame tartalmáról. Ne feltételezz Figma-hozzáférést alapból — ellenőrizd, mielőtt támaszkodnál rá.
5. **Vegyes** — pl. szöveg + mockup kép együtt. Ilyenkor a szöveg adja a "miért"-et, a kép/diagram a "mit és hogyan"-t; a kettőt együtt vesd össze, és ha ellentmondanak egymásnak, kérdezz rá explicit.

Ha a bemenet forrása nem egyértelmű (pl. csak egy fájlnevet kapsz, de nincs melléje kontextus), kérdezz rá, mielőtt nekiállnál értelmezni.

## DoR checklist

A típus (Story / Bug / Task) meghatározása az első lépés — ha nem egyértelmű a bemenetből, kérdezz rá kötelezően, mert ez szabja meg a további checklistet.

A tényleges, típusonkénti checklist (Story / Bug / Task kötelező mezői) külön fájlban van, hogy más skillek is hivatkozhassanak rá anélkül, hogy duplikálnák: lásd [`dor-checklist.md`](dor-checklist.md). Ezt kövesd az interjú során — ha egy pont nyilvánvalóan nem releváns (pl. nincs API-érintettség), mondd ki a feltételezést, és lépj tovább, ne erőltesd a kérdést.

## Interjú-stílus

- Kis kötegekben kérdezz (max 2-3 kérdés/kör), sose egyszerre az összes hiányzó pontot.
- Ami már megvan a bemenetből (szöveg, kép, diagram elemzéséből), azt ne kérdezd vissza — abból indulj ki.
- Ahol ésszerű, ajánlj konkrét megfogalmazást vagy 2-3 opciót, amit a felhasználó csak jóváhagy vagy módosít.
- Ha "nem tudom" / "mindegy" választ kapsz egy pontra, tegyél ésszerű feltételezést, mondd ki explicit, és lépj tovább — ne ess neki újra.
- Magyarul folytasd, hacsak a felhasználó másképp nem kéri.

## Kimeneti formátum (eszköz-független, szabványos)

A specifikáció **mindig** ebben a szerkezetben készüljön el — ez a "szerződés" más skillek/subagentek felé:

```markdown
## DoR Spec

**Típus:** Story | Bug | Task
**Cím:** <rövid cím>

**Kontextus:**
<miért kell, mit old meg>

**Acceptance Criteria / Elvárt viselkedés:**
1. ...
2. ...

**Edge case-ek / szélsőértékek:**
- ...

**API-kontraktus:** (ha releváns, egyébként "N/A")
...

**UI-referencia:** (ha releváns, egyébként "N/A")
<hivatkozás a forrás-artifactra: kép leírása, draw.io csomópont, Figma frame neve>

**Függőségek:** (ha nincs, "Nincs ismert függőség")
...

**Feltételezések, amiket az interjú során tettem:**
- ...

**Forrás-artifactok:**
- <pl. "screenshot: login-mockup.png", "draw.io: checkout-flow.drawio", "szöveges leírás a felhasználótól">
```

Ezt a blokkot mindig **változtatás nélkül másolható, önálló Markdown egységként** add ki — ne keverd bele a saját kommentárodat középre. Ha kell köszönő szöveg vagy magyarázat, az a blokk elé vagy mögé kerüljön.

## Összegzés és jóváhagyás

Mielőtt a végleges "DoR Spec" blokkot lezártnak tekintenéd:
- Mutasd meg a felhasználónak a teljes tervezetet.
- Kérj rövid megerősítést ("mehet így, vagy módosítsunk valamit?").
- Ha módosít, frissítsd és erősíttesd meg újra.

Csak jóváhagyás után add ki a végleges blokkot "kész" státuszban.

## Kilépési feltétel

A DoR Spec csak akkor tekinthető késznek, ha:
- minden, a típushoz tartozó kötelező pont explicit ki van töltve (vagy tudatosan "N/A"-ra van jelölve indoklással),
- nincs nyitott, megválaszolatlan kérdés a felhasználó felé,
- a felhasználó jóváhagyta a végleges tervezetet.

Ne engedj át hiányos specifikációt csak azért, mert a felhasználó siettet — jelezd, mi hiányzik még, és miért fontos.

## Használat subagentként más workflow-ban

Ez a skill úgy lett tervezve, hogy egy másik (pl. eszköz-specifikus) skill vagy egy orchestrátor **subagentként hívja meg**:

- **Bemeneti szerződés:** bármilyen kombináció szöveg / kép / draw.io / Figma-hivatkozásból, plusz opcionálisan egy előre megadott típus (Story/Bug/Task), ha a hívó fél már tudja.
- **Kimeneti szerződés:** a fenti "DoR Spec" Markdown blokk, jóváhagyott állapotban.
- A hívó fél (pl. `jira-create-story`) felelőssége, hogy ezt a kimenetet a saját céleszközének (Jira mezők, Linear API stb.) megfelelő formára alakítsa át — ez a skill erről semmit nem tud és nem is kellene tudnia.
- Ha subagentként hívnak meg, és a hívó fél már megadott típust vagy részleges adatot, azzal indulj — ne kérdezz rá újra arra, amit már megkaptál a hívás paramétereiben.
