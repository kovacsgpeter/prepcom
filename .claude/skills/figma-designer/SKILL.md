---
name: figma-designer
description: >
  Design system-alapú Figma-oldalterv készítés/javítás, önállóan is hívható a
  dev-workflow-execute pipeline-tól függetlenül. Használd, ha a felhasználó azt kéri,
  hogy "készíts egy Figma tervet ehhez", "tervezd meg ezt az oldalt Figmában", "javítsd a
  tervet a review-kommentek alapján" — akár Jira ticket ID-vel, akár csak leírt AC-kkal/
  UI-referenciával. Mindig előbb a meglévő design systemet nézi át, csak hiányzó elemet
  hoz létre újonnan. Ugyanazt a logikát követi, mint a `dev-workflow-execute` B4/B6
  lépése.
---

# figma-designer — önállóan hívható belépési pont

Ez ugyanaz a munka, amit a `dev-workflow-execute` pipeline B4 (`new`) és B6 (`revise`)
lépése is végez — az egyetlen, teljes utasítássor a
[`../../agents/figma-designer.md`](../../agents/figma-designer.md)
fájlban van (nem duplikáljuk). **Olvasd be azt a fájlt, és kövesd szó szerint.**

## Konfiguráció

Olvasd be [`../dev-workflow/config.md`](../dev-workflow/config.md)-t (rövid, csak értékek; egy kulcs jelentése a [`../dev-workflow/config-reference.md`](../dev-workflow/config-reference.md) azonos című szakaszában — csak azt a szakaszt olvasd be, a referenciát egészben soha) is — releváns
változók: `FIGMA_FILE_REF`, `PAGE_NAME_SEPARATOR`.

## Eltérések önálló híváskor (nem a pipeline-ból jöttél)

- **Mód**: ha a felhasználó nem mondja meg explicit, kérdezd meg: `new` (új oldalterv)
  vagy `revise` (meglévő terv javítása kommentek/visszajelzés alapján)?
- **Nincs Jira ticket**: a [`../../agents/figma-designer.md`](../../agents/figma-designer.md) "1. Kontextus összegyűjtése" lépése Jira
  ticketet feltételez az AC-khez/UI-referenciához — ha nincs, kérd el ezeket közvetlenül
  a felhasználótól (mit kell a tervnek lefednie, milyen állapotokat, van-e meglévő
  mockup/leírás).
- **Oldalnév**: a [`../../agents/figma-designer.md`](../../agents/figma-designer.md) szerint a frame/szekció neve kötelezően a ticket
  "Oldalnév" mezőjével egyezik — ha nincs Jira ticket, kérdezd meg a felhasználótól,
  milyen néven fusson a Figma-tervben (ugyanaz a `PAGE_NAME_SEPARATOR`-konvenció
  vonatkozik rá, ha több szavas).
