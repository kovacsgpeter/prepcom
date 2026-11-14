---
name: session-cost-report
description: >
  Fázisonkénti token/cost riport generálása egy Claude Code session-ről, offline, a
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
csinál és mik a korlátai (pl. hogy az árak alapból nem megerősített példa-értékek).

## Futtatás

1. Azonosítsd, melyik session-t/projektet kell elemezni:
   - Ha a felhasználó "ezt a beszélgetést" / "ezt a session-t" mondja, az **aktuális**
     projekt legutóbbi session-fájlja kell — nincs szükség extra paraméterre.
   - Ha konkrét projektet/session-t/fájlt említ, azt add meg paraméterként.
2. Futtasd Bash tool-lal:
   ```
   node "<a dev-workflow csomag tools/session-cost-report mappájának abszolút útja>/analyze.js" [--project <cwd>] [--session <jsonl>] [--out <mappa>]
   ```
   A script a session mappájának `subagents/` naplóit is beolvassa (a riport külön mutatja a
   fő szálat és a subagenteket), a streaming-duplikátumokat egyszer számolja, és ESM-gyökerű
   repóban is fut (a tool-mappa `package.json`-ja `commonjs`; ezt ne töröld).
3. A script kimenete egy `report.json` és egy `report.html` a megadott (vagy alap
   `./cost-reports/<session-id>/`) mappában.

## Visszajelzés a felhasználónak

- **Ne csak a fájlutat add vissza** — foglald össze szövegben is a lényeget: teljes
  összeg, melyik fázis/szegmens vitte a legtöbbet (top 2-3), és ha `pricingVerified:
  false` szerepel a JSON-ban, **jelezd explicit**, hogy a $ értékek nincsenek
  megerősítve (lásd `pricing.json`), a token-számok viszont pontosak.
- Ha a HTML riportot meg tudod nyitni/megjeleníteni a felhasználónak (böngésző-eszköz,
  vagy a fájl elküldése), tedd meg — ez adja a diagram-nézetet.
- Ha a script hibát ad (pl. nem talál session-fájlt), ne találgass — mutasd meg a nyers
  hibaüzenetet, és kérdezd meg, melyik projektről/session-ről van szó.
