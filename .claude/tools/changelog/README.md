# changelog — release-adatgyűjtő szkript

Utólagos, **offline** adatgyűjtő: két release/tag között összeszedi a GitLab-ba
merge-elt MR-eket, a forrás-branch nevéből jelleget + Jira-ticketkulcsot fejt, és
egy géppel feldolgozható, **jelleg szerint csoportosított JSON**-t ad stdout-ra
(vagy `--out <fájl>`-ba). Ez a JSON a későbbi changelog-szöveg-generátor bemenete.

**Ez nem a dev-workflow része, nem fut az agent-loop-ban.** Kézzel vagy CI-ból
indítható. Tiszta Node core (18+), **nincs npm-függőség** — a
`../session-cost-report/` mintáját követi.

## Mit csinál, lépésről lépésre

1. Beolvassa a `../../skills/dev-workflow/config.md` kapcsolóit:
   `CHANGELOG_MODE`, `CHANGELOG_STYLE`, `TICKET_NATURE_TAGS`. A
   `CHANGELOG_MODE`/`CHANGELOG_STYLE` kulcs a valódi `config.md`-ben két táblában
   is szerepel (a `WORKFLOW_PROFILE` preset-tábla + a dedikált `### CHANGELOG_MODE`
   szekció) — a kiolvasás a **dedikált szekcióra** van horgonyozva. Ismeretlen/
   hiányzó `CHANGELOG_MODE`/`CHANGELOG_STYLE` → visszaesés az alapértelmezésre
   (`offline` / `hu-dev`) + stderr-figyelmeztetés, nem néma hiba.
   A **branch-minta rögzített** (`<jelleg>/<TICKETKULCS>_<összefoglaló>`) — a
   `BRANCH_NAME_PATTERN` / `BRANCH_NAME_WORD_SEPARATOR` kulcsokat a szkript
   szándékosan **nem** olvassa, csak a `natureTags` halmazt veszi a configból.
2. Meghatározza a **release-tartományt** (`git tag -l 'v*' --sort=-v:refname`):
   - `≥ 2` tag → `előző..utolsó`
   - `1` tag → `<repo-gyökér>..tag`
   - `0` tag → `<repo-gyökér>..HEAD`
   - a `<repo-gyökér>` = `git rev-list --max-parents=0 HEAD`
   - `--from <ref>` / `--to <ref>` bármelyik oldalt felülbírálja.
3. Kigyűjti a tartomány **merge-commitjait**
   (`git log --first-parent --merges --pretty=%H <tartomány>`).
4. Lekéri a merge-elt MR-eket (`glab mr list --merged --all -F json`), és
   **metszetet** képez: csak azok az MR-ek maradnak, amelyek `merge_commit_sha`-ja
   a 3. lépés SHA-halmazában van. Ez determinisztikus (ugyanaz az elv, mint a
   `ci/release-version-bump.sh` / a `.gitlab-ci.yml` prepare-release jobjában).
5. Minden MR forrás-branch nevéből jelleget + ticketkulcsot fejt a rögzített
   `<jelleg>/<TICKETKULCS>_<összefoglaló>` minta szerint (a `jelleg` a config
   `natureTags` egyike). A mintát nem követő név (ismeretlen prefix, hiányzó
   ticketkulcs) → `egyéb` csoport, `ticketKey: null` — nem szakítja meg a futást.
6. **Útvonal-szűrés a csomag-határra** (COCALC-243): minden bent maradt MR
   merge-commitjának fájllistáját (`git diff --name-only <sha>^1 <sha>`) a
   repo-gyökér `dev-workflow-manifest.json` ellen méri. Csak az az MR marad,
   amelyik **legalább egy** `versioned` útvonalat érint; a `repo_local_exceptions`
   (`config.md`, `history.md`, `.claude/launch.json`) és a nem csomag-részt
   (alkalmazáskód, gyökér-fájlok) érintő MR-ek kiesnek. A kiesőket a
   `excludedNonVersioned` tömb sorolja fel (nem néma dobás). A manifest
   olvasásának/JSON-parse hibája esetén a szűrés **kimarad** (fail-open, minden
   MR bekerül), stderr-figyelmeztetéssel — nem néma hiba. A logika a
   `lib/manifest.js`-ben van (`loadManifest` / `isVersionedPath`), injektálható
   `manifestText` / `manifestPath` deps-szel. **Konvenció:** a manifest `versioned`
   listájának **könyvtár**-bejegyzései kötelezően záró `/`-rel szerepelnek (pl.
   `".claude/skills/"`); `/` nélkül a bejegyzés pontos fájl-egyezésként viselkedne.
   Ezt a `ci/verify-dev-workflow-manifest.sh` formai ellenőrzés kikényszeríti.
7. `enriched` / `standalone` módban a Jira REST API-ból ticket-címmel dúsít
   (`ticketTitle` mező). A két mód viselkedése **azonos**.
8. Jelleg szerint csoportosítja az MR-eket, és kiírja a JSON-t.

## Használat

```bash
# utolsó két release közötti tartomány, JSON a stdout-ra
node collect.js

# explicit tartomány
node collect.js --from v1.2.0 --to HEAD

# fájlba írás
node collect.js --out changelog-data.json

# alternatív config.md
node collect.js --config /más/út/config.md
```

| Kapcsoló | Jelentés |
|---|---|
| `--from <ref>` | tartomány kezdete (default: előző release tag / repo-gyökér) |
| `--to <ref>` | tartomány vége (default: utolsó release tag / HEAD) |
| `--out <fájl>` | a JSON-t fájlba írja stdout helyett |
| `--config <út>` | a dev-workflow `config.md` alternatív útja |
| `-h`, `--help` | súgó |

Ismeretlen `--` kapcsoló (pl. elgépelt `--form`) nem szakítja meg a futást: egysoros
`figyelmeztetés: ismeretlen kapcsoló: … (kihagyva)` megy a stderr-re, a többi
feldolgozás normálisan folytatódik (exit 0).

## Környezeti változók

| Változó | Mikor kell | Leírás |
|---|---|---|
| `JIRA_BASE_URL` | `enriched` / `standalone` mód | pl. `https://<cég>.atlassian.net` — a Jira REST API bázis-URL-je. |
| `JIRA_API_TOKEN` | `enriched` / `standalone` mód | Jira personal access token (Bearer). **Soha ne kerüljön be a repóba vagy egy Jira/GitLab kommentbe** — a `GITLAB_TOKEN_AI` mintájára env-ből jön. |
| `CHANGELOG_GLAB_FIXTURE` | teszt / offline próba | Ha be van állítva, a `glab mr list` hívás helyett a megadott JSON-fájlból olvas. |

A `glab`-nak telepítve és bejelentkezve kell lennie (`glab auth status`), hacsak a
`CHANGELOG_GLAB_FIXTURE` nincs beállítva.

## Kimeneti JSON séma

```jsonc
{
  "range": { "from": "v1.1.0", "to": "v1.2.0", "fromKind": "tag" },
  //  fromKind: "tag" | "root" | "explicit"
  "mrCount": 6,
  "generatedAt": "2026-08-27T13:00:00.000Z",
  "mode": "offline",              // offline | enriched | standalone
  "jiraFallback": true,           // CSAK ha enriched/standalone volt, de a Jira-dúsítás
                                  // nem teljesíthető: hálózati hiba VAGY 401/403/5xx
                                  // (pl. lejárt token) -> offline eredmény, exit 0.
                                  // Egyedi 404 NEM billenti (csak az az MR lesz cím nélkül).
  "excludedNonVersioned": [       // CSAK ha az útvonal-szűrés legalább 1 MR-t kihagyott.
    { "ticketKey": "COCALC-210", "branch": "chore/COCALC-210_config_tuning",
      "url": "https://.../merge_requests/210" }
  ],
  "groups": {
    "feature":     [ /* MR-ek */ ],
    "fix":         [],
    "build":       [],
    "refactoring": [],
    "chore":       [],
    "egyéb":       []             // a mintát nem követő / ticketkulcs nélküli MR-ek
  }
}
```

Egy MR-objektum a `groups.*` tömbökben:

```jsonc
{
  "ticketKey": "COCALC-101",     // vagy null (egyéb csoport)
  "nature": "feature",
  "branch": "feature/COCALC-101_uj_export_gomb",
  "title": "Új export gomb a fejlécben",
  "url": "https://gitlab.example.com/.../merge_requests/101",
  "ticketTitle": "Új export gomb"  // CSAK enriched/standalone módban, ha a Jira
                                   // lekérés sikeres volt erre a ticketre
}
```

- Mind a 6 `groups` kulcs **mindig** jelen van, üresen is.
- `mrCount` a **szűrés utáni** (a csomag-naplóba ténylegesen bekerülő) MR-ek száma.
- `excludedNonVersioned` csak akkor van jelen, ha az útvonal-szűrés legalább egy
  MR-t kihagyott — a `groups`-ba ezek nem kerülnek be.
- Üres tartomány → mind a 6 csoport `[]`, `mrCount: 0`, ember-olvasható sor a
  stderr-re ("nincs merge-commit-alapú MR a tartományban … — squash/ff-merge
  esetén ez várható, lásd README Korlátok"), érvényes JSON a stdout-ra, **exit 0**.
- Ha volt range-beli MR, de **mind** kiesett az útvonal-szűrésen → `mrCount: 0`,
  külön stderr-sor ("a tartomány minden MR-je kiesett az útvonal-szűrés után …"),
  **nem** a squash/ff-üzenet, **exit 0**.

## Kilépőkód

- `0` — normál lefutás (az üres tartomány és a Jira-visszaesés is ide tartozik).
- `1` — a git vagy a `glab` hívás használhatatlan hibát adott (pl. `glab` nincs
  telepítve és nincs fixture), vagy váratlan kivétel.

## Korlátok

- A "merge-elt MR" felismerése merge-commit-alapú: ha a projekt valaha
  squash-only vagy fast-forward merge-re vált, a merge-halmaz kiürül, és az
  MR-listát a GitLab API más mezőjéből kellene előállítani (ugyanaz a korlát,
  mint a `ci/release-version-bump.sh`-nál).
- A Jira-dúsítás Bearer-tokenes REST-hívást használ (`/rest/api/3/issue/{key}`).
  Basic-auth (email:token) párosítás jelenleg nincs támogatva.
- Az útvonal-szűrés (6. lépés) merge-commit-diff alapú: squash/ff-merge esetén a
  merge-halmaz amúgy is kiürül (lásd fentebb), tehát a szűrésnek sincs bemenete.
  Ha egy merge-commit szülője nem elérhető (pl. sekély klón), az adott MR
  **fail-open** bekerül, stderr-figyelmeztetéssel.
- A szkript nem generál changelog-**szöveget**, csak a strukturált adatot — a
  megfogalmazás (`CHANGELOG_STYLE`) egy későbbi generátor-lépés dolga.

## Tesztek

```bash
node collect.test.js
```

Keretrendszer nélküli, `node:assert`-alapú futtató (a
`../session-cost-report/analyze.test.js` stílusában). Minden bemenet injektált —
az élő git / `glab` / Jira **sosem** hívódik.

A belépő a `collect.js` `run(argv, deps)` függvénye; a `deps` objektum injektálható
mezői (mind opcionális, alapból az éles megfelelő):

| `deps` mező | Alap | Mit vált ki |
|---|---|---|
| `git` | valódi `git` | `(args[]) => stdout` — a tag-/root-/merge-commit lekérdezések |
| `glabExec` / `glabFixturePath` | valódi `glab` / `CHANGELOG_GLAB_FIXTURE` env | az MR-lista forrása |
| `fetchImpl` | globális `fetch` | a Jira REST-hívások |
| `env` | `process.env` | `JIRA_BASE_URL` / `JIRA_API_TOKEN` olvasása |
| `configText` / `configPath` | repo-gyökér alatti `config.md` | a config-kiolvasás bemenete |
| `manifestText` / `manifestPath` | repo-gyökér `dev-workflow-manifest.json` | az útvonal-szűrés csomag-határa (`versioned` / `repo_local_exceptions`) |
| `now` | `() => new Date()` | a kimenet `generatedAt` mezője (determinisztikus snapshot-teszthez rögzíthető) |
| `stdout` / `stderr` | `process.stdout` / `process.stderr` | a JSON- és figyelmeztetés-csatorna |
