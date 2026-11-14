# dev-workflow-intake — 2.a — Kiindulási állapot felderítés: részletek

Az [`SKILL.md`](SKILL.md) „2.a — Kiindulási állapot felderítés” lépéséből kiszervezve (ORD-498): csak akkor olvasd be,
ha a felderítés fut (`auto` találat vagy `always`; `off` mellett nem kell). A szöveg változatlan; a lépésszámok a `SKILL.md`-re vonatkoznak.

## Orchestrálás `CODE_SCAN_STRATEGY` szerint

Minden felderítő subagent a `repo-scanner` (`.claude/agents/repo-scanner.md` →
[`repo-scanner.md`](repo-scanner.md)) — csak-olvasó, a kimeneti szerződését (fájl+sor+
idézett mondat, "ezt kerestem"/"nem találtam" blokk) ott dokumentálva. A `CODE_SCAN_MODEL`
értékét add át neki modellként, a `CODE_SCAN_MAX_AGENTS` értéke a ténylegesen elindítható
felderítők **felső korlátja** (a fix repo-térkép felderítőt is beleszámítva) — nézd meg a
`config.md` `CODE_SCAN_STRATEGY` kapcsolójának értékét:

- **`hybrid`** (alapérték): indíts **egyszerre, párhuzamosan** 1 fix "repo-térkép" feladatú
  `repo-scanner`-t (stack, mappastruktúra, belépési pontok, tesztek helye — mindig ugyanaz
  a feladat-leírás, függetlenül a story tartalmától) **és** 2-3, a story kezdeti
  leírásából levezetett téma-kérdéssel induló `repo-scanner`-t, a `CODE_SCAN_MAX_AGENTS`
  korlátig (pl. `CODE_SCAN_MAX_AGENTS=4` → 1 repo-térkép + max 3 téma-alapú).
- **`dynamic`**: indíts **kizárólag** téma-alapú `repo-scanner`-eket (a fix repo-térkép
  feladat itt **nem** indul) — legfeljebb `CODE_SCAN_MAX_AGENTS` darabot, párhuzamosan.
  ⚠️ Ebben a módban nincs biztonsági háló: ha egyik téma-alapú felderítő sem talál semmit,
  nincs tartalék forrás az alap stack/mappastruktúra-képre (lásd `config.md`
  "CODE_SCAN_STRATEGY értékek").
- **`layered`**: **két hullámban, szekvenciálisan** fuss:
  1. Indíts **egyedül** 1 fix repo-térkép feladatú `repo-scanner`-t, és várd meg az
     eredményét.
  2. A repo-térkép leletei alapján állítsd össze (finomítsd) a második hullám téma-alapú
     kérdéseit — ha a repo-térkép szerint egy tervezett kérdéshez kapcsolódó
     terület/technológia nincs is jelen a repóban, azt a kérdést ne indítsd el, vagy
     fogalmazd át. Csak ezután indítsd el a második hullám `repo-scanner`-eit,
     párhuzamosan egymással, legfeljebb `CODE_SCAN_MAX_AGENTS - 1` darabot (a repo-térkép
     felderítőt is beleszámítva a korlátba).

## Kötelező fájlút-validáció (minden ágon)

Minden `repo-scanner` válasz "Leletek" szekciójának minden sorára, **mielőtt** bármit
felhasználnál a "Kiindulási állapot" mező kitöltéséhez:

- Ellenőrizd `test -f`-fel (repo-gyökérhez képest relatív útvonalként), hogy a lelet
  fájlútja **ténylegesen létezik**. A `ci/verify-repo-scan-config.sh` erre a
  validációs logikára ad automata önellenőrzést a `validate-scan-paths.sh` szkripten
  keresztül — ugyanazt a szabályt kövesd itt, kézzel/Bash-sel.
- **Dobd el** a nem létező útra hivatkozó leletsort a szintézisből — ne vedd bele a
  ticket "Kiindulási állapot" szekciójába.
- Ha egy adott `repo-scanner` **összes** lelete kiesett (érvénytelen útra hivatkozott),
  ezt **explicit jelezd** a "Kiindulási állapot" szekcióban (pl. "⚠️ egy felderítő
  válaszának minden lelete érvénytelen fájlútra hivatkozott, figyelmen kívül hagyva") — ne
  tűnjön csendben el.
- Ha **minden** felderítő minden lelete kiesett, a szekció ne maradjon üresen: essen
  vissza a "Nincs meglévő implementáció ezen a területen" jelzésre, **és** jelezd külön,
  hogy ez érvénytelen leletek miatti fallback, nem tényleges zöldmezős eredmény.

A megmaradt, validált leleteket szintetizáld a `story-interview` "Kiindulási állapot" DoR
Spec mezőjébe (mi létezik már, melyik fájlok, milyen mintát követnek, mi hiányzik
ténylegesen) — ezt add át a `story-interview` hívásnak.

## Lokál repo-scanner (`LOCAL_PHASES`, LOCAL-5)

> ℹ️ **Bevezetve (LOCAL-5)**: a felderítést a helyi modell is végezheti — csak akkor, ha az
> `OFFLOAD_PROFILE` ezt engedi, és a `repo-scanner` szerepel a `LOCAL_PHASES` listán. Az
> alapértelmezett `OFFLOAD_PROFILE=off` mellett semmi nem változik: a fenti Claude-os
> `repo-scanner` fut.

**Feloldás** — az intake-futás elején, egyszer: `bash
.claude/skills/dev-workflow/scripts/resolve-executor-level.sh --complexity "" --phase
repo-scanner --issue-type "" --offload-profile <OFFLOAD_PROFILE> --clamp-direction
<OFFLOAD_CLAMP_DIRECTION> --local-phases <LOCAL_PHASES>`. A `--complexity` és az
`--issue-type` itt szándékosan üres: az intake-nál a ticket még nem létezik, ezért nincs
komplexitás-becslés és nincs Story/Bug-vétó; a hiányzó komplexitás stderr-figyelmeztetését
csendben fogadd el. Ha a kimenet nem `local`, a fenti Claude-os `repo-scanner` megy,
változatlanul.

**Ha `local`** — a gépi részt a fő szál végzi, a modell csak olvas és jelent:
1. Minden felderítési feladatra külön (a fix repo-térkép és minden téma-kérdés) gyűjts
   jelölteket **gépileg**: repo-térkép esetén a `git ls-files` fa-nézete, a manifest-fájlok
   (`package.json`, workspace-konfig), a tesztek helye; téma-kérdésnél a kérdésből vett
   kulcsszavakra `git grep -n -i -F` (a keresési területre szűkítve), a találatok száma
   szerint rangsorolt fájlok.
2. Állítsd össze a promptot egy ideiglenes, **nem committolt** fájlba: a
   [`local-prompts/repo-scanner.md`](../dev-workflow/local-prompts/repo-scanner.md) sablon, majd
   `TASK: …`, `SEARCH AREA: …`, végül a jelölt fájlok `=== <útvonal> ===` fejléccel és `N: <sor>`
   számozott sorokkal (fájlonként legfeljebb ~200 sor, a találatok környékét előnyben
   részesítve). A prompt legfeljebb `LOCAL_PROMPT_MAX_CHARS` (alap 90000) karakter; a rangsor
   végéről hagyj ki fájlokat, amíg belefér. Ha így sem férnek bele az értelmes jelöltek, ne
   menj helyre: Claude-os `repo-scanner`.
3. Hívd meg: `bash .claude/skills/dev-workflow/scripts/call-local-model.sh --schema
   .claude/skills/dev-workflow/schemas/repo-scan-response.v1.schema.json --prompt-file <fájl>
   --phase repo-scanner`. A lokál hívások **egymás után** mennek, nem párhuzamosan (egy GPU
   van); a `CODE_SCAN_MAX_AGENTS` itt a hívások számának felső korlátja.
4. **Exit 0 esetén** alakítsd a választ a [`repo-scanner.md`](repo-scanner.md) nyers
   lelet-szerződésére (Feladat / Ezt kerestem / Leletek / Nem találtam), és futtasd rá a fenti
   "Kötelező fájlút-validáció" mellett a **sor- és idézet-ellenőrzést**: a lelet `path:line`
   sora létezik, és a `quote` (szóköz-normalizálva) szerepel abban a sorban. Amelyik nem
   egyezik, azt dobd el (a modell néha elvéti a sorszámot), és jelezd egy sorban a "Nem
   találtam" szekcióban, hány lelet esett ki.
5. **Bukás esetén** (exit ≠ 0: érvénytelen JSON, séma-hiba, időkorlát, breaker) **ne
   próbálkozz tovább csendben**: futtasd a Claude-os `repo-scanner`-t az adott feladatra, és
   jelezd egy sorban a felhasználónak.

**Minőségkapu**: a helyi felderítést élesítés előtt mérd le a `compare-scan-quality.sh` és a
golden set segítségével (`OFFLOAD_ACCEPTANCE_RECALL`, `OFFLOAD_ACCEPTANCE_MAX_INVALID_PATHS`,
lásd [`offload-measurements.md`](../dev-workflow/offload-measurements.md)). Ajánlott:
`LOCAL_MODEL_THINK=off` — az élő próbákban a gondolkodás nem javította a leletek pontosságát,
csak az időt többszörözte.
