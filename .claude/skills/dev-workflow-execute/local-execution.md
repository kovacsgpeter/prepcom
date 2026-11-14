# dev-workflow-execute — helyi modell ágai

Az [`SKILL.md`](SKILL.md) A6 és A7 lépéséből kiszervezve (ORD-498): csak akkor olvasd be, ha az A5a-ban
feloldott `implementer` vagy `qa-tester` szint `local`. A szöveg változatlan; a hivatkozott lépésszámok
(A5a, A6, A7, 7a, 7b, 9) a `SKILL.md`-re vonatkoznak.

## A6 — lokál implementer (`implementer` szint `local`, LOCAL-4)

- **Ha az A5a-ban feloldott `implementer` szint `local`** (COCALC-387, LOCAL-4 — a
  hard-clamp innen kezdve fel van oldva ennél a fázisnál): a lenti "közvetlen
  végrehajtás" és a terv-kör 4. lépése ("hívd meg az `implementer`-t `execute` móddal")
  ebben az esetben **nem** az `implementer` subagentet indítja, hanem a hívó fő szál
  (te) magad hívod a lokál adaptert:
  1. Állítsd össze egy ideiglenes, **nem committolt** fájlba a promptot: a
     [`local-prompts/implementer.md`](../dev-workflow/local-prompts/implementer.md) sablon
     tartalma (ez adja a várt JSON pontos formáját), utána ticket ID, AC-lista, a
     jóváhagyott terv (ha volt terv-kör), a repo-konvenciók és az érintett fájlok jelenlegi
     tartalma (amit előzőleg beolvastál).
  2. Hívd meg: `bash .claude/skills/dev-workflow/scripts/call-local-model.sh --schema
     .claude/skills/dev-workflow/schemas/implementer-response.v1.schema.json --prompt-file
     <az összeállított fájl> --phase implementer`.
  3. **Siker esetén** (exit 0): írd ki a validált válasz `fileContents` mezőjének minden
     bejegyzését a `filesWritten`-ben szereplő, hozzá tartozó útvonalra (`Write` tool —
     csak azokra az útvonalakra írj, amik a `filesWritten` listában szerepelnek, ne
     találgass más útvonalat), futtasd a projekt teszt- és lint-parancsát (mint az
     `implementer.md` "3. Helyi minőségi ellenőrzés" lépése), és **csak zöld esetén**
     commitolj `commit-as-ai.sh`-val a válasz `commitMessage` mezőjével (vagy — ha az
     hiányzik — a `docs/conventions.md` "Commit-forma" szerinti, ticket-kulcsot
     hivatkozó saját üzenettel).
  4. **Bukás esetén** (a szkript nem 0-val zár — validációs hiba, kemény hiba, circuit
     breaker —, vagy a 3. pontban futtatott teszt/lint piros): **ne próbálkozz tovább
     csendben a lokál modellel** — hívd meg helyette a rendes `implementer` subagentet
     `execute` móddal, a fázis mátrixa szerinti eggyel magasabb `EXECUTOR_LADDER`
     szinten (ugyanaz a szint, amit a `resolve-executor-level.sh` adna, ha ennél a
     fázisnál még nem lenne lokál-szerződés — jellemzően `haiku`/`sonnet`), és jelezd ezt
     egy sorban a felhasználónak. Ez a bukás **nem** számít bele a `MAX_LOCAL_FIX_RETRIES`
     javítókör-számlálóba — lásd [`retry-and-escalation.md`](retry-and-escalation.md)
     "Lokál bukás nem fogyaszt javítókört".

## A6 — `LOCAL_EXECUTOR_HOST=subagent` (ORD-365)

- **`LOCAL_EXECUTOR_HOST=subagent` (ORD-365)** — oldd fel a `config.md` `LOCAL_EXECUTOR_HOST`
  értékét (COCALC-216 konvenció: `WORKFLOW_PROFILE` → explicit felülírás → preset-tábla;
  fallback `main`). `main` mellett a fenti 1–4. lépés változatlanul a fő szálé. `subagent`
  mellett a `local` szintű `execute`-hívást (és a hozzá tartozó javítóköröket) **nem a fő
  szál** végzi, hanem a [`local-runner`](../../agents/local-runner.md) subagent, `implement`
  móddal, sub-taskonként egy hívás (batch módban a lenti végrehajtási sorrendben). Bemenete a
  `local-runner.md` „Bemenet” szakasza szerint: a sub-task kulcsa és AC-i, a jóváhagyott terv
  (a `LOCAL_RUN_DIR`-be mentve is), a munkafa abszolút útvonala és a `LOCAL_MODEL_*`
  beállítások. A fő szál csak az összefoglalót kapja; a visszatérési állapot szerint:
  - `OK` → a következő sub-task, majd A7;
  - `LOCAL_UNREACHABLE` → **az execute-futás megáll**, és jelzed a felhasználónak (a helyi
    modell nem érhető el); **nem** esel vissza a felhős `implementer`-re;
  - `PLAN_DEVIATION` → megállás és kérdés (a terv nem tartható).
  A rossz válaszok visszaesését a local-runner maga végzi — a rossz válaszok nyitotta circuit
  breakert is, ami nem elérhetetlenség (ORD-375) —, naplózva a
  `<LOCAL_RUN_DIR>/local-stats.md`-be; ez sem fogyaszt javítókört.

## A7 — lokál qa-tester (`LOCAL_PHASES`, LOCAL-5)

- **Lokál qa-tester (`LOCAL_PHASES`, LOCAL-5)**: ha az A5a-ban a `qa-tester` szintje `local`
  (azaz az `OFFLOAD_PROFILE` engedi, és a `qa-tester` szerepel a `LOCAL_PHASES` listán),
  **és** a `LOCAL_GATE_MODE` `fast`, akkor a kaput a `qa-tester` subagent helyett a hívó fő
  szál (te) végzi, a helyi modell csak az AC-lefedettséget és a hibaleírást adja.
  `full` módban (böngészős kör) és az A8 `test-env` hívásnál **mindig** a Claude-os
  `qa-tester` fut — a helyi modell nem böngészik. Egyébként a lenti, subagentes bullet
  érvényes.
  1. **A parancsokat te futtatod, determinisztikusan** — a [`qa-tester.md`](../../agents/qa-tester.md)
     1. szakaszának `fast` ága szerint (build, unit teszt **`--reporter=verbose`-szal**, hogy a
     tesztcímek látszódjanak, és lint; a hiányzó lint script itt is blocker; a parancsokat a
     `package.json` `scripts` blokkjából vedd). Mindegyiknél rögzítsd a **kilépőkódot** és a
     kimenet végét (kb. 60 sor).
  2. Állítsd össze egy ideiglenes, **nem committolt** fájlba a promptot: a
     [`local-prompts/qa-tester.md`](../dev-workflow/local-prompts/qa-tester.md) sablon, majd
     `TICKET: …`, `GATE MODE: fast`, `ACCEPTANCE CRITERIA:` (soronként egy AC; batch módban az
     AC-k uniója), `COMMAND RESULTS:` (parancs, exit code, kimenet vége) és `CHANGE SUMMARY:`
     (`git diff --stat origin/<alap branch>...HEAD`). A prompt legfeljebb `LOCAL_PROMPT_MAX_CHARS`
     (alap 90000) karakter; ha nem fér bele, a Claude-os `qa-tester` fut.
  3. Hívd meg: `bash .claude/skills/dev-workflow/scripts/call-local-model.sh --schema
     .claude/skills/dev-workflow/schemas/qa-verdict.v1.schema.json --prompt-file <fájl> --phase qa-tester`.
  4. **Ezeket a szabályokat TE kényszeríted ki, a modell válaszától függetlenül**:
     (a) bármely parancs nem 0 kilépőkódja → az eredmény `fail`, és a hiba bekerül a hibák
     közé, akkor is, ha a modell `pass`-t mondott; (b) minden AC, amihez böngésző-/vizuális/
     interakciós ellenőrzés kellett volna (a `qa-tester.md` 3. szakasza), `unverified` marad,
     akkor is, ha a modell `pass`-t írt — ezeket tételesen add át a 9. lépés code reviewnak és
     az MR-leírásba (lásd 7a, `fast` mód); (c) egy `pass` AC `evidence`-e konkrét tesztcímet
     nevez meg — ha csak általános ("minden teszt zöld", "feltételezhetően"), kezeld
     `unverified`-ként; (d) az `acResults` minden AC-t pontosan egyszer tartalmaz, különben a
     válasz érvénytelen (→ 6. pont).
  5. A `bugs` elemeit a `qa-tester.md` 4. szakasza szerinti blokkokba alakítsd, a
     `jiraComment`-et pedig te írd ki a [`tracker-adapter.md`](tracker-adapter.md) "komment
     írása" műveletével (ahogy a subagent tenné). Zöld → **7a**; piros → **7b**, a javítókör
     mechanikája változatlan.
  6. **Bukás esetén** (a szkript nem 0-val zár — érvénytelen JSON, séma-hiba, időkorlát,
     breaker — vagy a (d) szabály sérül): hívd meg helyette a Claude-os `qa-tester`
     subagentet `local` target móddal, és jelezd egy sorban a felhasználónak. Ez **nem**
     számít bele a `MAX_LOCAL_FIX_RETRIES` számlálóba (lásd
     [`retry-and-escalation.md`](retry-and-escalation.md) "Lokál bukás nem fogyaszt
     javítókört").
  - **`LOCAL_EXECUTOR_HOST=subagent` (ORD-365)**: az 1–4. pontot (és az 5. pont verdiktjét) a
    [`local-runner`](../../agents/local-runner.md) subagent végzi `qa-fast` móddal; a fő szál a
    visszaadott verdikttel és komment-fájllal az 5. pont szerint folytat (a kommentet a fő
    szál írja ki, zöld → 7a, piros → 7b). `LOCAL_QA_FALLBACK` → a 6. pont (Claude-os
    `qa-tester`); `LOCAL_UNREACHABLE` → **megállás**, nem visszaesés. A böngészős `full` kört
    a local-runner nem veszi át. `main` mellett a fenti 1–6. pont változatlan.
