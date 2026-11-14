# Retry- és eszkalációs logika (közös referencia)

Ezt a fájlt az [`execute/SKILL.md`](SKILL.md) négy pontja használja: A7b (helyi qa-tester
javítókör), 9. lépés (code review javítókör), A8b (teszt-env hiba, közvetlen eszkaláció
retry nélkül) és a `PIPELINE_GATE_POSITION` szerinti helyen futó pipeline-eredmény kapu
(GATE-1, `wait-for-pipeline.sh` — lásd "once-then-escalate szemantika" lent).

## Konfiguráció

Olvasd be előbb [`../dev-workflow/config.md`](../dev-workflow/config.md)-t (rövid, csak értékek; egy kulcs jelentése a [`../dev-workflow/config-reference.md`](../dev-workflow/config-reference.md) azonos című szakaszában — csak azt a szakaszt olvasd be, a referenciát egészben soha). Ez a fájl a `MAX_LOCAL_FIX_RETRIES`,
`MANUAL_DEV_ASSIGNEE` és a `PIPELINE_GATE_ON_RED`/`PIPELINE_GATE_ON_TIMEOUT` változókat
használja. A `STORY_BATCH_MODE` (`config-reference.md` "STORY_BATCH_MODE értékek") értékét a hívó
`SKILL.md` már feloldotta — ha `on`, lásd lent a "Batch mód" bekezdést a "Fix-ticket
létrehozása" szekcióban (story-szintű eszkaláció, egy fix-ticket). Az
`AGENT_CONTINUATION_MODE` (`config-reference.md` "AGENT_CONTINUATION_MODE értékek") azt szabja meg,
hogyan hívd a 2.+ `implementer`-kört lent, a "Javítókör mechanika" 3. pontjában.

## Javítókör mechanika (A7b és 9. lépés)

Mindkét kapunak **saját, egymástól független számlálója** van (ne oszd meg a kettő
között), de mindkettő ugyanazt a `MAX_LOCAL_FIX_RETRIES` limitet olvassa a
`config.md`-ből.

`LOCAL_GATE_MODE=fast` (GATE-2) esetén az A7b javítókör-számláló ugyanúgy külön, saját
számlálóként él, és ugyanazt a `MAX_LOCAL_FIX_RETRIES` limitet használja, mint `full`
módban — csak **kevesebb jelforrásból** dolgozik: nincs böngészős AC-hiba, a kört csak a
build / unit teszt / lint kimenete táplálja (a lint **kötelező**, nem feltételes — lásd
`qa-tester.md` 1. szakasz, COCALC-264). `LOCAL_GATE_MODE=none` esetén A7b nincs (az A7
teljesen kimarad) — a lokál kaput ilyenkor a `PIPELINE_GATE_POSITION` szerinti helyen
futó pipeline-eredmény kapu (GATE-1) helyettesíti, a maga külön számlálójával.

**Edge case — lint/formázó ütközés végtelen javítókörben**: ha a lint-szabályok és egy
formázó (pl. prettier/eslint autoformat) ellentmondanak egymásnak — az egyik javítás
zölddé teszi a lintet, de pirosra váltja a formázást (vagy fordítva) —, az `implementer`
A7b-javításai elméletileg örökké ping-pongolhatnának a kettő között. Ezt a jelenséget a
`MAX_LOCAL_FIX_RETRIES` limit zárja le: a számláló ugyanúgy nő minden körben, és a
limit elérésekor a kör a lenti "Fix-ticket létrehozása" ágra eszkalál, nem fut tovább
vég nélkül.

1. Az adott kapu (qa-tester AC-check vagy code-reviewer) talál blocker/major problémát.
2. Számláló +1 (első kör = 1).
3. Ha a számláló **a limiten belül van**: a hívás előtt kérdezd meg a
   [`tracker-adapter.md`](tracker-adapter.md) "terv beolvasása" műveletét — ha van korábban
   mentett, jóváhagyott terv ezen a ticketen, add át azt is kontextusként az
   `implementer`-nek, hogy a javítás a korábban jóváhagyott iránnyal konzisztens maradjon,
   ne az elejétől találja ki. Ezután az `implementer` subagentet **`execute` móddal,
   terv-kör nélkül** hívd (a talált blocker/major problémalista már önmagában elég szűk
   scope, nem kell hozzá külön `plan` jóváhagyás — lásd `SKILL.md` A6). Javítja a kódot a
   talált problémák alapján, majd a kapu újra lefut (qa-tester újra ellenőriz /
   code-reviewer újra review-z).
   - **Hogyan hívd** (`AGENT_CONTINUATION_MODE`, lásd `config.md` "AGENT_CONTINUATION_MODE
     értékek"): ha ez az **első** `implementer`-hívás ebben a javítókörben (számláló == 1),
     mindig friss `Agent`-hívás, függetlenül a kapcsoló értékétől — jegyezd meg a válasz
     `agentId`-ját. A **második és minden további** hívásnál (számláló >= 2), ha
     `AGENT_CONTINUATION_MODE=same-thread`, a `SendMessage` tool-lal folytasd a megjegyzett
     `agentId` szálát (add át ugyanúgy az újonnan talált problémalistát, mint egy friss
     hívásnál) — friss `Agent`-hívás helyett. Ha `AGENT_CONTINUATION_MODE=off`, minden
     kör friss `Agent`-hívás marad (a kapcsoló bevezetése előtti, mai viselkedés). Ez a
     szabály **mindkét** javítókörre vonatkozik, ahol ez a 3. pont fut (A7b és 9. lépés).
4. Ismételd, amíg a kapu zöldre nem vált, vagy a számláló el nem éri a limitet.
5. Ha a limit **elérve** és még mindig van nyitott blocker/major: lásd "Eszkaláció"
   szekció lent — de a kód pusholása/MR-je **ekkor is megtörténik** (nem blokkoljuk a
   push-t, csak jelöljük, hogy kézi javítás kell).

Minor/nitpick szintű találatok **soha nem** számítanak bele a retry-be — ezeket csak
Jira kommentbe/ticketre írd fel, ne blokkold miattuk a folyamatot.

## Hol jöhetne szóba `SendMessage`-folytatás a pipeline egészében (felmérés, COCALC-306)

> ℹ️ Ez a szakasz **felméri**, a `dev-workflow-execute` pipeline mely pontjain indul
> **ugyanahhoz a tickethez, több lépésben** új subagent — nem csak ott, ahol az
> `AGENT_CONTINUATION_MODE` ma ténylegesen bekötve van (fenti "Javítókör mechanika" 3.
> pontja). Cél: látható legyen, hol lenne **elvileg** alkalmazható a `same-thread` minta,
> és hol nem — utóbbinál miért nem, hogy egy jövőbeli ticket ne próbálja meg vakon
> ráerőltetni ott is, ahol a pipeline saját szerkezete (agent-típusváltás, közbeeső emberi
> szünet, tudatosan izolált scope) ezt kizárja.

| Pont | Két (vagy több) hívás egymáshoz képest | Alkalmas-e `SendMessage`-folytatásra? |
|---|---|---|
| **A6 — `plan`→`execute` váltás** | `implementer` `plan` módban, jóváhagyás után **ugyanaz** a ticket `execute` módban, közvetlenül utána, emberi szünet nélkül (csak egy rövid jóváhagyó kérdés a chatben). | **Igen, elvileg alkalmas** (azonos agent-típus, azonos ticket, nincs közbeeső session-törés) — **de ma nincs bevezetve**: az `AGENT_CONTINUATION_MODE` ma csak a lenti "Javítókör mechanika" 3. pontjára (A7b/9. lépés) vonatkozik, az A6 plan→execute váltás továbbra is két külön `Agent`-hívás. Jövőbeli ticket hatóköre. |
| **A7b — `qa-tester` javítókör, `implementer` 2.+ hívása** | Ugyanaz az `implementer`, ugyanaz a ticket, több retry-kör egymás után, emberi szünet nélkül. | **Igen, és be is van vezetve** — lásd fent "Javítókör mechanika" 3. pont, `AGENT_CONTINUATION_MODE=same-thread`. |
| **9. lépés — `code-reviewer`↔`implementer` javítókör, `implementer` 2.+ hívása** | Ugyanaz, mint A7b, csak a hívó kapu a `code-reviewer`. | **Igen, be van vezetve** — ugyanaz a 3. pont. A **`code-reviewer`** saját maga viszont minden körben **friss** `Agent`-hívással indul (nem folytatott szálon) — minden körben egy **más** diffet kell frissen, elfogultság nélkül megítélnie; a korábbi kör saját véleményének "megőrzése" itt kifejezetten nem kívánt. Nincs bevezetve, és nem is javasolt bevezetni `code-reviewer`-re anélkül, hogy ezt a kockázatot külön megvizsgálnánk. |
| **B-ág — `figma-designer` `new`→`revise` (B4→B6, [`design-branch.md`](design-branch.md))** | Ugyanaz a `figma-designer`, ugyanaz a ticket, **de** a kettő között kötelező, tetszőleges hosszúságú **emberi review-kör** van (Jira-státuszváltás, a felhasználó kézzel néz át és kommentel) — a `design-branch.md` B5 explicit "jó `/clear` pont"-ként említi ezt a szünetet. | **Nem alkalmas.** Nincs garancia, hogy a B6-ot ugyanaz az élő session/agentId dolgozza fel, mint ami a B4-et indította — a review-kör hossza (órák/napok) és a szándékos `/clear` javaslat miatt a folytatáshoz szükséges `agentId` gyakorlatilag sosem lesz megbízhatóan elérhető. |
| **R5 — `review-feedback.md` `implementer`-hívása** | A "dolgozd fel a review kommentjeimet" belépési pont jellemzően egy **új session eleje** (a felhasználó külön, később indítja) — nincs a folyamatban korábbi, ugyanebben a session-ben élő `implementer`-agentId. | **Nem alkalmas** (nincs mit folytatni — ez mindig az adott javítókör **első** `implementer`-hívása, ugyanúgy, mint a "Javítókör mechanika" 3. pontjának `számláló == 1` ága). |
| **Batch mód — sub-taskonkénti `implementer`-hívások (A6 batch ág, `SKILL.md` "3. pont")** | Egymás után több `implementer`-hívás, **de** mindegyik **más** sub-task saját AC-ivel, saját commit-csoportjával. | **Nem javasolt**, bár technikailag azonos agent-típus: a cél itt kifejezetten a sub-taskok **egymástól izolált** scope-ja (ne szivárogjon át egyik sub-task döntése/kontextusa a másikba) — ez pont ellentétes azzal, amit a `same-thread` mód szándékosan elér (a korábbi kör kontextusának megtartása). |

## Lokál bukás nem fogyaszt javítókört (COCALC-278, LOCAL-2)

Ha egy `OFFLOAD_PROFILE` szerint `local` szintre feloldott fázis ténylegesen a
`call-local-model.sh` (COCALC-220) hívásán megy, és az a saját
`LOCAL_MODEL_FALLBACK_POLICY` szerinti fallback-ágra fut (a helyi modell nem elérhető,
nem válaszol séma-helyesen, vagy a circuit breaker nyitva van) — ez **nem** számít bele a
fenti "Javítókör mechanika" `MAX_LOCAL_FIX_RETRIES` számlálójába, **egyik** kapunál sem
(A7b, 9. lépés). A fázis ilyenkor a `resolve-executor-level.sh` által adott, eggyel
magasabb `EXECUTOR_LADDER` szinten (jellemzően Claude-on, `haiku`/`sonnet`) fut újra —
ez a helyi-vs-Claude végrehajtó-választás sikertelensége, nem az adott javítási kísérlet
tartalmi bukása, ezért a két számláló (javítókör vs. lokál-fallback) fogalmilag
független. A tényleges fallback-mechanikát maga a `call-local-model.sh` adja (lásd a
szkript fejléc-kommentjét és a `config.md` "WORKFLOW_PROFILE" preset-táblájának
`LOCAL_MODEL_*` sorait) — ez a szakasz csak azt mondja ki, hogy a hívó `SKILL.md`-nek nem
kell (és nem szabad) emiatt a `MAX_LOCAL_FIX_RETRIES` limitet csökkentenie.

## `once-then-escalate` szemantika (a `PIPELINE_GATE_ON_RED` egyik értéke, GATE-1)

Ez a szemantika **nem ugyanaz**, mint a fenti "Javítókör mechanika" `retry` ága (ami a
`MAX_LOCAL_FIX_RETRIES`-ig ismétel) — a `once-then-escalate` egy önálló, szigorúbb
retry-mód, kifejezetten a pipeline-eredmény kapuhoz (`wait-for-pipeline.sh`,
`PIPELINE_GATE_ON_RED=once-then-escalate`, `balanced` profil alapértéke):

1. A kapu pirosat jelez (a `wait-for-pipeline.sh` 2-es kilépőkóddal tér vissza).
2. **Pontosan egy** automatikus javítási kísérlet: hívd meg az `implementer`et `execute`
   móddal a kapu kimenetében visszaadott, csonkolt blokkoló job-lista alapján (ugyanúgy,
   mint a "Javítókör mechanika" 3. pontja — ha van korábban mentett terv, add át
   kontextusként), majd pushold a javítást és futtasd újra a kaput.
3. Ha a kapu **másodszorra is** pirosat jelez (vagy időközben timeoutol, és a
   `PIPELINE_GATE_ON_TIMEOUT=auto` ezt az ágat választja), **ne próbálkozz harmadszor** —
   azonnal a lenti "Fix-ticket létrehozása" szekció szerint eszkalálj, függetlenül attól,
   hogy a `MAX_LOCAL_FIX_RETRIES` limit még engedne-e további köröket. Ez a `once` szó
   lényege: legfeljebb egy kísérlet, nem a limitig ismétlő `retry`.
4. Ha a kapu már az **első** kísérlet előtt (az implementer hívása nélkül) timeoutol és a
   `PIPELINE_GATE_ON_TIMEOUT=ask`, ne alkalmazd automatikusan ezt az ágat — kérdezd meg a
   felhasználót, mielőtt bármit tennél (lásd `config.md` "PIPELINE_GATE_* kapcsolók" —
   `ask` vs `auto`).

## Eszkaláció — push/MR jelölés (csak A7b és 9. lépés kimerülésekor)

- A commit üzenetbe és/vagy a PR/MR leírásába kerüljön be egyértelműen: **"⚠️ Manuális
  javítás szükséges"** + rövid indoklás (melyik kapu nem ment zöldre, hányadik körben állt
  meg).
- Ez nem akadályozza meg a push-t/MR-t — a cél, hogy bárki, aki ránéz a PR-ra, azonnal
  lássa, hogy nem minden automata ellenőrzés ment át.

## Fix-ticket létrehozása (A7b, 9. lépés és A8b közös formátuma)

Hozz létre egy új Jira ticketet a [`../dev-workflow/jira-ticket-template.md`](../dev-workflow/jira-ticket-template.md)
sablon szerint, a [`tracker-adapter.md`](tracker-adapter.md) "ticket létrehozása"
műveletével. Két külön mező van, ne keverd össze:

- **Jira issue type**: `Bug` (a `config.md` `JIRA_ISSUE_TYPE_MAP` szerint — ez a valódi
  Jira mező, amit a "ticket létrehozása" művelet állít be).
- **Infobox "Típus" mező**: `fix` (a `TICKET_NATURE_TAGS` enumból — ez csak a leírásban
  megjelenő szöveges cimke, nem a Jira issue type).
- **Story felelős**: `MANUAL_DEV_ASSIGNEE` (config)
- **Kontextus** helyett strukturált összefoglaló:

```
## Nem zöld ellenőrzés

**Forrás ticket:** <eredeti ticket kulcs>
**Melyik kapu:** helyi qa-tester AC-check / code review / teszt-env AC-check / pipeline-eredmény kapu (GATE-1)
**Hányadik körben állt meg:** N/MAX_LOCAL_FIX_RETRIES (ha releváns — A8b-nél nincs kör)

### Nyitva maradt problémák
- <probléma 1 — melyik AC-t/review-pontot érinti, mi történt>
- <probléma 2 — ...>

**Branch/PR:** <link, ha van>
```

- **Acceptance Criteria** szekció: "A fenti nyitott problémák mindegyike javítva és
  ellenőrizve" (egy tételes lista, ami tükrözi a fenti problémákat).
- **Teszterv**: ugyanaz, mint az eredeti ticketé (ismételd meg a releváns AC-ket).
- **Függőségek**: az eredeti ticket kulcsa.

### Batch mód (STORY_BATCH_MODE=on)

Ha a futás batch módban ment (lásd `SKILL.md` "A-ág — Batch mód"), az eszkaláció
**story-szintű**, nem sub-taskonként:

- **Egy** fix-ticket készül, a **szülő Story-ra** linkelve (`Függőségek` szekció: a szülő
  Story kulcsa; a "Nem zöld ellenőrzés" blokk `Forrás ticket` mezője is a szülő Story).
- A "Nyitva maradt problémák" lista **összevonja** az összes bevont sub-task nyitott
  blocker/major pontjait, mindegyiknél jelezve, **melyik sub-taskhoz** és melyik AC-hez
  tartozik.
- A `MAX_LOCAL_FIX_RETRIES` számláló a bevont halmazra **egy közös** számláló (a
  kapunként külön számláló elve megmarad: A7b vs. 9. lépés vs. GATE-1 külön, de mindegyik
  a teljes körre egy, nem sub-taskonként).
- A push/MR **nem** blokkolódik (az egy MR már megnyílt) — csak a folyamat áll meg ezen a
  Story-n; a "⚠️ Manuális javítás szükséges" jelölés az egy MR leírásába kerül.

## A folyamat leállítása

Fix-ticket létrehozása után **a workflow megáll** — ne próbálj tovább automatikusan
javítani, ne lépj tovább a következő fázisra. Jelezd a felhasználónak a fix-ticket kulcsát
és egy rövid összefoglalót, mi nem ment át.
