---
name: session-cost-report
description: >
  Turnonkénti token/cost riport generálása egy Codex session-ről, offline, a
  helyben tárolt session-transcriptből. Használd, ha a felhasználó azt kérdezi, hogy
  "mennyibe kerültek eddig az egyes fázisok/lépések", "mutass egy cost breakdown-t/
  diagramot erről a session-ről", "melyik lépés vitte a legtöbb tokent" — akár a
  jelenlegi, akár egy másik projekt/session-re vonatkozóan. Nem futtat semmit a
  dev-workflow pipeline-ból, kizárólag a már meglévő session-naplót elemzi.
---

# session-cost-report — önállóan hívható belépési pont

Ez egy **offline elemző eszköz**, nem a dev-workflow-execute pipeline része — a teljes
logika és a "hogyan működik" leírás a
[`../../tools/session-cost-report/README.md`](../../tools/session-cost-report/README.md)
fájlban van. **Olvasd be azt, mielőtt futtatnád a scriptet**, hogy pontosan tudd, mit
csinál és mik a korlátai (különösen azt, hogy a dollárösszeg csak API-egyenértékű
becslés, nem a Codex-előfizetés tényleges díja).

## Futtatás

1. Azonosítsd, melyik session-t/projektet kell elemezni:
   - Ha a felhasználó "ezt a beszélgetést" / "ezt a session-t" mondja, és ismert az
     aktuális task transcriptfájlja vagy ID-je, add át explicit `--session` értékként.
     Ha nem ismert, használd az aktuális projekt legutóbbi sessionjét, de a válaszban
     nevezd meg a kiválasztott session ID-t, mert ugyanabban a repóban több task is
     futhat párhuzamosan.
   - Ha konkrét projektet/session-t/fájlt említ, azt add meg paraméterként.
2. Futtasd terminálból:
   ```
   node "<a dev-workflow csomag tools/session-cost-report mappájának abszolút útja>/analyze.js" [--project <cwd>] [--session <jsonl>] [--out <mappa>]
   ```
3. A script kimenete egy `report.json` és egy `report.html` a megadott (vagy alap
   `./cost-reports/<session-id>/`) mappában.

## Visszajelzés a felhasználónak

- **Ne csak a fájlutat add vissza** — foglald össze szövegben is a lényeget: teljes
  tokenszám, melyik turn/szegmens vitte a legtöbbet (top 2-3), és az API-egyenértékű
  becslést, ha minden modellhez van ismert ár.
- Mondd ki explicit, hogy a Codex előfizetéses/rate-limit alapú használata nem azonos
  az API tokenárazással; a riport dollárértéke összehasonlító becslés, nem számla.
- Ha a HTML riportot meg tudod nyitni/megjeleníteni a felhasználónak (böngésző-eszköz,
  vagy a fájl elküldése), tedd meg — ez adja a diagram-nézetet.
- Ha a script hibát ad (pl. nem talál session-fájlt), ne találgass — mutasd meg a nyers
  hibaüzenetet, és kérdezd meg, melyik projektről/session-ről van szó.
