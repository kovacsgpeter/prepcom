# session-cost-report (Codex)

Offline elemző a Codex Desktop/CLI helyi JSONL transcriptjeihez. A
`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` rekordjaiból turnonkénti tokenbontást,
valamint JSON és önálló HTML riportot készít. Nem hív modellt és nem küld adatot
hálózatra.

## Adatforrás és számítás

- A `turn_context` rekord adja a turn azonosítóját, cwd-jét, modelljét és reasoning
  effortját.
- Az `event_msg` / `token_count` rekord `total_token_usage` mezője kumulatív. A script
  az egymást követő állapotok különbségét számolja, így nem számolja többször ugyanazt
  a használatot.
- A cached input és a cache-write az input részhalmaza; az API-becslés az uncached,
  cached és cache-write részt külön árazza. A reasoning token az output részhalmaza,
  ezért csak információként jelenik meg, nem kerül még egyszer felszámításra.
- A stabil szegmentálási egység a Codex-turn. A skillen belüli A1/A2 jellegű lépések
  nem különíthetők el megbízhatóan a transcriptből. A külön subagent transcriptjei
  sem kerülnek automatikusan a fő session riportjába.

## Session kiválasztása

Explicit `--session` nélkül a script rekurzívan megkeresi a legfrissebb olyan Codex
sessiont, amelynek legalább egy `turn_context.payload.cwd` értéke megegyezik a
`--project` útvonallal (alapból az aktuális mappa). Ha ugyanabban a repóban több Codex
task fut, ez nem feltétlenül az éppen látható task lesz; ilyenkor adj meg explicit
`--session` fájlt, és mindig ellenőrizd a riportban szereplő session ID-t.

## Használat

```text
node analyze.js
node analyze.js --project "F:\dev\repos\<repo>"
node analyze.js --session "C:\Users\<user>\.codex\sessions\...\rollout-....jsonl"
node analyze.js --out "C:\temp\codex-cost-report"
```

Node.js 18+ elég, nincs npm-függőség. A kimenet `report.json` és `report.html`; az
alapértelmezett cél `./cost-reports/<session-id>/`.

## Az ár jelentése

A `pricing.json` az OpenAI nyilvános API listaárait tartalmazza. Ezekből a script
**API-egyenértékű becslést** készít. Ez nem a Codex Desktop/ChatGPT Plus, Pro, Business
vagy Enterprise csomag tényleges költsége, számlája vagy rate-limit elszámolása. Ha a
transcript modellje nem található az árlistában, a riport nem talál ki fallback árat:
az érintett összeg `null`, az ismeretlen modell pedig külön fel van sorolva.

Árforrások:

- <https://developers.openai.com/api/docs/models/gpt-5.6-sol>
- <https://developers.openai.com/api/docs/models/gpt-5.6-terra>
- <https://developers.openai.com/api/docs/models/gpt-5.6-luna>
