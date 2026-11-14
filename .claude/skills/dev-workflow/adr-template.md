# ADR-sablon (Architecture Decision Record)

Ez a formátumot használja minden dev-workflow skill, amikor egy architekturális döntést
Confluence-oldalként rögzít — a (jövőbeli) intake ADR-létrehozás lépés (COCALC-376) tölti
ki ezt a sablont, amikor egy ticket AC-je vagy interjú-kör olyan döntést azonosít, amit
érdemes a kódtól/tickettől függetlenül, önállóan is megtalálhatóvá tenni (lásd
`config.md` "Confluence-írás (CONFLUENCE_* kapcsolók)" szekció).

## Konfiguráció

Olvasd be előbb [`config.md`](config.md)-t (rövid, csak értékek; egy kulcs jelentése a [`config-reference.md`](config-reference.md) azonos című szakaszában — csak azt a szakaszt olvasd be, a referenciát egészben soha). Ez a sablon a következő változókat
használja: `CONFLUENCE_SPACE_KEY`, `CONFLUENCE_ADR_PARENT_ID`, `WORKING_LANGUAGE`
(a lenti "Nyelv" szekció kivétele szerint).

## Miért ez a sablon léte

A felhasználói fájdalom, amire ez a sablon válaszol: ugyanazt a döntést többször újra
megvitatják a csapatban, mert csak a végeredmény van valahol leírva (vagy sehol), az
**elvetett** opciók és az elvetés indoka nincs rögzítve. Emiatt a sablon
legfontosabb szekciója az "Elvetett alternatívák" — ez nem elhagyható, még akkor sem, ha
rövid.

## Kötelező szekciók

Minden ADR-oldal a következő nyolc szekciót tartalmazza, ebben a sorrendben. Egyik sem
maradhat ki (ha egy szekcióra ténylegesen nincs tartalom — pl. nincs kapcsolódó ticket —,
ezt explicit ki kell mondani a szekcióban, pl. "Nincs kapcsolódó ticket", nem szabad
kihagyni magát a szekciót).

1. **Sorszám és cím** — lásd lent "Sorszámozás és oldalcím".
2. **Státusz** — `proposed` / `accepted` / `superseded`, lásd lent "Életciklus".
3. **Context** — milyen helyzetben, milyen kényszerek (technikai, időbeli, szervezeti)
   mellett született a döntés. Ez adja meg, *miért* egyáltalán döntést kellett hozni.
4. **Decision** — maga a meghozott döntés, tömören, egyértelműen kimondva.
5. **Rejected alternatives** — a mérlegelt, de elvetett opciók, **kategóriánként
   egymondatos indoklással**, hogy miért lettek elvetve. Ez a sablon legfontosabb
   szekciója (lásd fent "Miért ez a sablon léte") — sosem maradhat üres, ha volt
   ténylegesen mérlegelt alternatíva; ha a döntés triviális volt és nem volt komoly
   versengő opció, ezt is explicit ki kell mondani ("Nem volt érdemi versengő opció —
   ...").
6. **Consequences** — mit nyerünk a döntéssel, és mit fizetünk érte (trade-off, jövőbeli
   korlátozás, technikai adósság, migrációs teher stb.). Mindkét oldal kötelező — egy
   döntésnek mindig van ára, még ha kicsi is.
7. **Date** — a döntés (nem a leírás) dátuma, ÉÉÉÉ-HH-NN formátumban.
8. **Related tickets** — a döntéshez vezető vagy rá hivatkozó Jira ticket-kulcsok. Ha
   nincs kapcsolódó ticket, ezt is ki kell mondani ("No related ticket").

## Életciklus

Egy ADR státusza a fenti 2. szekcióban mindig a három érték egyike:

| Státusz | Jelentés |
|---|---|
| `proposed` | A döntés fel van vetve, de még nincs végleges/elfogadott — vitatható, módosítható. |
| `accepted` | A döntés érvényben van, a kódbázis/architektúra ez alapján épül. |
| `superseded` | A döntést egy **későbbi** ADR felülírta — az eredeti döntés már nem érvényes, de a dokumentum megmarad történeti kontextusnak. |

**Alapszabály: egy ADR-t soha nem törlünk, és tartalmilag soha nem írunk felül.** Ha egy
korábbi döntés megváltozik, az nem az eredeti ADR szerkesztésével történik (a "Decision"
vagy "Context" szekció visszamenőleges átírásával), hanem egy **új** ADR létrehozásával,
ami a régit `superseded` állapotba viszi. Ennek az a célja, hogy a döntés-történet
olvasható maradjon — az, hogy *miért* döntöttünk korábban másképp, ugyanolyan értékes
infó, mint a jelenlegi döntés maga.

### Felülírás — kétirányú hivatkozás

Amikor egy új ADR felülír egy régebbit, a szabály **kétirányú**:

- Az **eredeti** ADR státusza `superseded`-re változik, és a "Related tickets" szekciója
  (vagy egy külön, a Státusz mellé írt sor) hivatkozik az őt felülíró új ADR-re
  (pl. "Superseded by ADR-0007").
- Az **új** ADR "Context" vagy "Related tickets" szekciója visszahivatkozik az általa
  felülírt ADR-re (pl. "Supersedes ADR-0003").

Ha csak az egyik irányú hivatkozás készül el, az olvasó az egyik dokumentumból nem tudja
megtalálni a másikat — mindkét irányt kötelező megírni ugyanabban a műveletben.

## Sorszámozás és oldalcím

- A sorszám **folyamatos és nem újrahasznosított**: `ADR-0001`, `ADR-0002`, ... — a
  négyjegyű, nullákkal kitöltött formátum biztosítja, hogy Confluence-listázáskor (ABC/
  névsorrend szerint) is helyes időrendi sorrendben jelenjenek meg. Egy `superseded` ADR
  sorszáma **sem** szabadul fel újrafelhasználásra — a következő új ADR mindig a
  legmagasabb eddig kiosztott sorszám + 1.
- Az oldalcím formátuma: `ADR-<sorszám>: <rövid, leíró cím>` (pl.
  `ADR-0001: Client-side wordcloud rendering instead of server-side image generation`) —
  ez teszi az oldalt kereshetővé és azonosíthatóvá a Confluence space
  (`CONFLUENCE_SPACE_KEY`) listanézetében, a `CONFLUENCE_ADR_PARENT_ID` alatt, anélkül,
  hogy meg kellene nyitni a tartalmát.

## Nyelv

Az ADR-oldal nyelve **mindig angol**, függetlenül a `config.md` `WORKING_LANGUAGE`
értékétől (ami a ticketek/interjú/kommentek nyelvét szabja meg, jelenleg `magyar`) — ez a
`config.md` "WORKING_LANGUAGE" szekciójában rögzített, tudatos kivétel
(COCALC-374/COCALC-372). Az ADR célközönsége és a Confluence-tartalom szerepe eltér a
ticket/interjú célközönségétől, ezért ez a mondat innen nem törölhető anélkül, hogy egy
jövőbeli futás tévesen magyarul ne írná az ADR-eket.

## Minta-ADR

A lenti, teljesen kitöltött példa a fenti nyolc szekció tényleges, angol nyelvű
használatát mutatja be — nem placeholder szöveg, hanem egy hihető, a wordcloud repo
kontextusába illő döntés.

---

### ADR-0001: Client-side wordcloud rendering instead of server-side image generation

**Status:** `accepted`

**Context:**
The wordcloud app lets a user upload a CSV/XLS file of (property, count) pairs and
generates a Mentimeter-style wordcloud the user can download as a gift. Early in the
project we had to decide where the wordcloud layout and rendering happens: on the
backend (Spring Boot generates a raster/vector image and returns it), or on the
frontend (Angular computes the layout and renders it directly in the browser, e.g. to
canvas/SVG). The constraint driving the decision: the backend already has a tight
scope (parse upload, persist saved wordclouds), and the team wanted to avoid adding an
image-rendering dependency (e.g. a JVM charting/graphics library) purely for this one
feature.

**Decision:**
The wordcloud layout is computed and rendered entirely client-side, in the Angular
frontend (see `frontend/src/app/components/wordcloud/wordcloud-layout.ts`). The backend
only ever handles parsed (property, count) data — it never generates or returns an
image.

**Rejected alternatives:**
- **Server-side image generation (Spring Boot + a JVM graphics/charting library):**
  rejected because it would add a new backend dependency and rendering-performance
  concern for a purely presentational feature, with no benefit for a single-user,
  browser-based tool.
- **Server-side layout, client-side rendering (backend computes word positions, frontend
  just draws them):** rejected because it splits a single cohesive concern (layout +
  render) across two layers for no clear gain, and would require a new API contract to
  be kept in sync every time the layout algorithm changes.

**Consequences:**
We gain a simpler backend (no rendering/imaging dependency, no extra API surface for
layout data) and instant, dependency-free re-rendering on window resize or data changes
in the browser. We pay for this with the layout computation being duplicated if a
future requirement needs a server-generated image (e.g. an emailed PDF export) — that
would require either reimplementing the layout logic on the backend or extracting it
into a shared/portable format, which does not exist today.

**Date:** 2026-01-15

**Related tickets:** COCALC-140

---
