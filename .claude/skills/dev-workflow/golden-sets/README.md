# dev-workflow golden-sets — séma és konvenció (COCALC-280 / LOCAL-3)

Ez a mappa a **golden set**-ek helye: dokumentált felderítő-feladatok, amelyekhez
fájl/szimbólum szinten rögzítve van, mit *kellene* egy `repo-scanner` futásnak
megtalálnia. A [`../scripts/compare-scan-quality.sh`](../scripts/compare-scan-quality.sh)
ezekhez méri egy tényleges `repo-scanner`-kimenet recall / precision / érvénytelen-
fájlút értékét, és ez az `OFFLOAD_PROFILE` (COCALC-278) keret élesedési feltétele — lásd
[`../config.md`](../config.md) "OFFLOAD_ACCEPTANCE_* és OFFLOAD_AUTO_PROMOTE" szekció, a
mérési módszertan pedig a [`../offload-measurements.md`](../offload-measurements.md)-ben.

> ⚠️ **A tényleges golden-set tartalom feltöltése NEM ennek a ticketnek (COCALC-280) a
> tárgya.** Itt csak a séma és **egy** példafájl van. A valós briefek + várt leletek
> felvétele egy nagyobb repón külön, későbbi munka (a LOCAL-3 ticket Kontextusa rögzíti,
> miért: nincs futó lokál végpont, és egy értelmes golden set nagyobb kódbázist kíván).

## Séma

Egy golden set egy JSON fájl, `*.json` kiterjesztéssel ebben a mappában:

```jsonc
{
  // Rövid feladat-leírás, pontosan az a szöveg, amit a repo-scanner subagent kapna
  // feladatként (mint egy ticket AC-halmaz vagy egy téma-kérdés). Ez a "brief".
  "brief": "string — kötelező",

  // Opcionális: melyik repóra/branch-re/commitra vonatkozik a golden set (dokumentációs
  // célból, a compare-scan-quality.sh nem használja).
  "repo": "string — opcionális",
  "ref": "string — opcionális (branch vagy commit SHA)",

  // A várt leletek listája. A compare-scan-quality.sh KIZÁRÓLAG a `path` mezőt veti
  // össze a scanner kimenetével (a `symbol`/`reason` ember-olvasásra és a későbbi,
  // szimbólum-szintű kiértékeléshez van). Nulla elem is érvényes: azt jelenti, hogy a
  // briefre a helyes válasz "nincs lelet" (ilyenkor a recall definíció szerint 1.0).
  "expectedFindings": [
    {
      // Repo-gyökérhez képest relatív fájlút. Sorszám-utótag (":42") megengedett, a
      // szkript levágja. Windows-abszolút út TILOS (a COCALC-270 nyers-lelet szerződés
      // is ezt írja elő) — a szkript az ilyet érvénytelennek számolja.
      "path": "frontend/src/app/parser/csv-parser.service.ts",
      // A várt szimbólum (osztály/függvény/metódus). Ember-olvasásra; a mai
      // compare-scan-quality.sh nem ellenőrzi.
      "symbol": "CsvParserService.parse",
      // Miért ez a lelet releváns a briefhez — 1 mondat.
      "reason": "itt van a jelenlegi CSV-fejléc-felismerés, ide kell az új elválasztó-heurisztika"
    }
  ]
}
```

## Illesztés a `repo-scanner` kimeneti szerződéséhez (COCALC-270)

A `repo-scanner` markdown kimenetének `## Leletek` szekciója soronként
`` - `<út>:<sor>` — "<idézet>" — <jelentés> `` formátumú. A `compare-scan-quality.sh` ebből
a **backtick-idézett első tokent** (az utat) olvassa ki, levágja a `:sor` utótagot, és a
`\` → `/` normalizálás után veti össze a golden set `expectedFindings[].path` halmazával:

- **recall** = (megtalált várt utak) / (összes várt út)
- **precision** = (a jelentett utak közül a vártak) / (összes jelentett út)
- **érvénytelen-fájlút-szám** = ahány jelentett út a repo-gyökérhez képest nem létező
  fájlra mutat, vagy abszolút/gyökér-kezdetű (rossz formátumú)

A `## Leletek` alatt a `Nincs lelet.` sor (vagy üres szekció) 0 jelentett utat jelent.

## Fájlok itt

| Fájl | Szerep |
|---|---|
| `repo-scanner-example.json` | **Séma-példa** — a fenti szerkezet kitöltve, illusztratív (nem valós) tartalommal. Ez nem éles golden set. |
| `fixtures/` | A `compare-scan-quality.sh` és a `ci/verify-offload-measurements.sh` determinisztikus önteszt-bemenetei (a repo-gyökér valós fájljaira mutatnak, hogy a `test -f` kiszámítható legyen). |
