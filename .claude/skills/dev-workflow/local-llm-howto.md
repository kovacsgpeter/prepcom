# Helyi LLM beüzemelése a dev-workflow-hoz — lépésről lépésre

Ez a fájl **nem hot-path olvasmány** — egyetlen skill sem olvassa be futás közben. Emberi
útmutató ahhoz, hogy a gépeden ténylegesen fusson egy helyi (nem-Claude) LLM, amit a
[`scripts/call-local-model.sh`](scripts/call-local-model.sh) hívni tud. Az adapter adja az
`EXECUTOR_LADDER` `local` szintjének tényleges végrehajtását (lásd [`config.md`](config.md)
"OFFLOAD_PROFILE és OFFLOAD_PHASE_MATRIX" és "LOCAL_PHASES és a lokál fázis-bekötés").

Ha nem futtatsz helyi LLM-et, ettől a workflow **semmit nem veszít**: a `local` szint sosem a
szállított alapértelmezés (`OFFLOAD_PROFILE=off`), és minden fázisnál van Claude-alapú
fallback.

> ⚠️ **Kétféle "local"**: az A7 `qa-tester` "`local` target mód" a *helyi környezetet*
> (dev-szerver a saját gépen) jelenti, nem a helyi LLM-et. Ez a doksi a helyi **LLM**-ről szól.

## 1. Mely fázisok futhatnak helyben

| Fázis | Hol | Mit csinál a helyi modell | Mit csinál a fő szál (Claude) |
|---|---|---|---|
| `implementer` | execute A6 | teljes fájltartalmakat ír a jóváhagyott terv alapján | összeállítja a promptot, kiírja a fájlokat, futtatja a teszt/lintet, commitol; piros esetén Claude-os fallback |
| `repo-scanner` | intake 2.a | `path:line:quote` leleteket ad a kapott számozott fájlsorokból | `git grep`-pel jelölteket gyűjt, a leleteket sor- és idézet-egyezésre ellenőrzi |
| `qa-tester` | execute A7, **csak `fast` kapu** | AC-lefedettséget és hibaleírást ad a kapott parancs-eredményekből | lefuttatja a build/teszt/lint parancsokat; **bármely nem 0 exit kód = `fail`** a modell véleményétől függetlenül; a vizuális AC-k `unverified`-ek maradnak |

**Nem fut helyben**: `code-reviewer`, `figma-designer`, `architect`, az A8 `test-env` kör és
minden böngészős AC-ellenőrzés. A Story és Bug típusú ticket sosem megy helyre (vétó).

## 2. Hardver és modell

Tájékoztató alap: egy **RTX 3090 (24 GB VRAM)** a `qwen3.6:27b` (Q4_K_M, kb. 17 GB súly)
modellt 32768 tokenes kontextussal teljes egészében VRAM-ban futtatja (kb. 21 GB használat) —
ha a modell a rendszer-RAM-ba is kilóg, drasztikusan lassabb. Kisebb VRAM-nál válassz
kisebb/erősebben kvantált modellt; GPU nélkül is fut, csak lényegesen lassabban (emeld a
`LOCAL_MODEL_TIMEOUT`-ot).

Mérések ezen a konfiguráción (kis minta, tájékoztató; részletek a `config.md`-ben):
`think:false` mellett az implementer architect-tervvel 25 s alatt hibátlan, a repo-scanner
15–36 s, a qa-tester 14–17 s. A `qwen3-coder:30b` gyorsabb (kb. 2×), de a nehezebb
implementer-feladatot nem tudta megbízhatóan.

## 3. Ollama telepítése és a modell létrehozása

1. Telepítsd az Ollamát: **https://ollama.com/download**. Windowson natívan vagy WSL2-ben is
   fut; WSL2-ből a Windows-oldali Claude a `localhost:11434` címen éri el (WSL2 localhost-
   továbbítás).
2. Töltsd le az alapmodellt: `ollama pull qwen3.6:27b`
3. Hozd létre a fázis-független modellt: `ollama create dw-27b -f
   .claude/skills/dev-workflow/local-prompts/dw-27b.Modelfile` (a `FROM qwen3.6:27b`,
   `num_ctx 32768`, `temperature 0.2` és egy általános system prompt van benne; a kimeneti
   formát a fázis sablonja írja elő, ezért egyetlen modell szolgál ki minden fázist).
4. Ellenőrizd: `curl http://localhost:11434/api/tags` — a lista tartalmazza a `dw-27b`-t.

**WSL2-ben futó Ollama esetén**: a WSL leáll, ha nincs nyitva egyetlen session sem (a
`wsl -l -v` `Stopped`-ot mutat), és ilyenkor a `localhost:11434` nem érhető el. Tartsd
életben egy háttérfolyamattal (PowerShell):

```powershell
Start-Process wsl -ArgumentList '-d','Ubuntu','--exec','sleep','infinity' -WindowStyle Hidden
```

Leállítás: `wsl --terminate Ubuntu`. Tartós megoldáshoz tedd egy parancsikonba a `shell:startup`
mappában.

## 4. Konfiguráció

Az adapter **env-változókból** olvassa a beállításait (alapértékek a [`config.md`](config.md)
preset-táblájában és a szkript fejléc-kommentjében). A legegyszerűbb tartós hely a
`.claude/settings.local.json` `env` blokkja (nem verziózott):

```json
{
  "env": {
    "LOCAL_MODEL_NAME": "dw-27b",
    "LOCAL_MODEL_DIALECT": "ollama",
    "LOCAL_MODEL_TIMEOUT": "600",
    "LOCAL_MODEL_THINK": "off"
  }
}
```

A `config.md`-ben (explicit felülírás, a `WORKFLOW_PROFILE` preset-tábla fölött) két dolog kell:

1. `OFFLOAD_PROFILE` = `max-local` — az `aggressive` az implementernek a gyakorlatban nem ad
   `local`-t (az `S` komplexitás `haiku`, az `M`/`L` `sonnet` szintet javasol, ami az
   `aggressive` halmazán belül marad). A `max-local` mellett a `code-reviewer` biztonságosan
   `sonnet`-re esik vissza.
2. `LOCAL_PHASES` = `implementer,repo-scanner,qa-tester` — a listán kívüli fázis `local`
   helyett Claude-on fut.

`OFFLOAD_PROFILE=off` (alap) mellett a helyi modell nem kap munkát.

## 5. Kipróbálás

A `--dry-run` csak az adapter-logikát ellenőrzi, nem a modellt (a fix dry-run válasz nem
implementer-alakú, ezért `implementer`-sémával hibát ad — ez nem hiba). A valódi próba:

```
bash .claude/skills/dev-workflow/scripts/call-local-model.sh \
  --schema .claude/skills/dev-workflow/schemas/implementer-response.v1.schema.json \
  --prompt 'Válaszolj egy {"status":"ok","summary":"teszt","filesWritten":[],"fileContents":{},"commitMessage":"test: teszt"} JSON objektummal, semmi mást ne írj.' \
  --phase implementer
```

Ha 0-val zár és a séma szerinti JSON-t adja, a lánc működik. A repó saját önellenőrzései
(Ollama nélkül futnak): `sh ci/verify-call-local-model.sh` és `sh ci/verify-offload-config.sh`.

## 6. Hogyan látom, hogy tényleg helyben futott

- A napló (`LOCAL_MODEL_LOG_FILE`, alapból `.claude/skills/dev-workflow/local-executor-log.jsonl`)
  minden hívásról egy sort ír `"phase"` mezővel (`implementer` / `repo-scanner` / `qa-tester`) és
  `"outcome"`-mal (`success`, `validation_failed`, `hard_error`, `breaker_open`). Prompt- és
  válasz-szöveget soha nem tartalmaz. Új mezők (ORD-376): `"ticket"` (`--ticket` /
  `LOCAL_MODEL_TICKET`), `"duration_ms"` és `"prompt_chars"`; az `"event":"fallback"` sorok (a
  local-runner írja) `"outcome"` nélküliek, a circuit breaker nem számolja őket. A `breaker_open`
  sorokat sem számolja (kihagyott hívások, nem kísérletek); a nyitott breaker
  `LOCAL_MODEL_BREAKER_COOLDOWN` másodperc után egy próbahívással magától visszazárhat.
- Az Ollama oldalán: `ollama ps` — a modell `100% GPU`-n fut-e, és mennyi VRAM-ot foglal.
- A fő szál egy sorban jelzi, ha egy fázis a helyi hívás bukása miatt Claude-on futott újra.

## 7. Hibaelhárítás

| Tünet | Ok / teendő |
|---|---|
| `Failed to connect to localhost port 11434` | Az Ollama nem fut, vagy a WSL leállt — lásd a 3. pont WSL-keepalive részét. |
| `circuit breaker nyitva` | A napló utolsó `LOCAL_MODEL_BREAKER_THRESHOLD` valódi kísérlete (a `breaker_open` sorok nem számítanak) mind sikertelen, és a legutóbbi óta még nem telt el `LOCAL_MODEL_BREAKER_COOLDOWN` (alap 900) másodperc. Utána a breaker magától félig nyitott lesz: egy próbahívás megy, siker zárja, hiba újranyitja. Az üzenet megmondja, mennyi van még hátra. Ha a hibát már megoldottad, és nem akarsz várni: egy hívás erejéig `LOCAL_MODEL_BREAKER_COOLDOWN=0`. |
| Időkorlát (`hard_error`) | Gondolkodó modell + nagy prompt lassú: állítsd `LOCAL_MODEL_THINK=off`-ra, vagy emeld a `LOCAL_MODEL_TIMEOUT`-ot. |
| `validation_failed` / érvénytelen JSON | Gondolkodás mellett (`LOCAL_MODEL_THINK=on`) állítsd a `LOCAL_MODEL_FORMAT=json`-t; a fázis amúgy is Claude-ra esik vissza. |
| A fázis mindig Claude-on fut | Story/Bug típus (vétó), `OFFLOAD_PROFILE` nem `max-local`, a fázis nincs a `LOCAL_PHASES` listán, vagy a prompt nagyobb a `LOCAL_PROMPT_MAX_CHARS`-nál. A `resolve-executor-level.sh` stderr-je megmondja. |
| Lassú / RAM-ba kilógó modell | A kontextus (`num_ctx`) vagy a kvantálás túl nagy a VRAM-hoz: `ollama ps` mutatja a CPU/GPU arányt. |

## 8. Biztonsági megfontolások

- A `call-local-model.sh` minden hívás előtt figyelmeztet (stderr), ha a `LOCAL_MODEL_ENDPOINT`
  **nem** loopback címre mutat — ez nem hiba, csak tudatosító jelzés.
- A válaszban hivatkozott fájlutak (`filesWritten`, `findings[].path`) biztonsági ellenőrzésen
  mennek át: abszolút útvonal vagy a repo munkafáján kívülre mutató útvonal (symlinken át is)
  mindig elutasításra kerül.
- A napló kizárólag metaadatot tartalmaz.

## 9. Mit NEM old meg

- A `code-reviewer` helyi futtatását (nincs lokál-szerződése, mindig felfelé clampelt).
- A böngészős AC-ellenőrzést és az A8 `test-env` kört (azok Claude-on maradnak).
- A minőségmérést: a helyi repo-scanner élesítése előtt mérd le a `compare-scan-quality.sh` és a
  golden set segítségével ([`offload-measurements.md`](offload-measurements.md)); az
  implementernél és a qa-testernél a saját tesztek és a Claude-os code review a védőháló.
- A helyi szerver csapat-szintű üzemeltetését: ez az útmutató egyetlen fejlesztői gépre szól.
