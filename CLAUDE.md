# prepcom — Claude útmutató

> Codex-futásnál az [AGENTS.md](AGENTS.md) a mérvadó; a Claude workflow az alábbi szabályokat használja.

## Projekt

„Gyökér": magyar nyelvű, statikus családi és közösségi birtoktervező (minimum–kívánt igények,
házépítés, földterület, költségek, munka, víz; családi JSON-mentés és „reveal party" összesítés).
Nincs backend, build vagy futásidejű külső függőség. A termék nyelve magyar, a kód azonosítói
angolok. Részletek: [README.md](README.md), [VALIDATION.md](VALIDATION.md), [docs/](docs/).

- **Tracker:** OpenProject, projekt `PREP` (a kulcs feltételezés, lásd `config.md`); self-hosted,
  URL = `OPENPROJECT_URL` a Doppler `prepcom` / `dev` configban, tailneten
  (`TRACKER_BACKEND=openproject`). Az olvasás/írás: `node .claude/tools/openproject/op.js`,
  `claude-agent` felhasználóként.
- **GitLab:** `constructioncalculator/prepcom`, alap branch `main` (a projekt létrehozása még hátra van).
- **Dev workflow:** [.claude/skills/dev-workflow/config.md](.claude/skills/dev-workflow/config.md)
  (Codex port: `.agents/skills/dev-workflow/config.md` — a két config értékeit tartsd szinkronban).
- **Secrets:** Doppler projekt `prepcom`, config `dev`. A workflow indítása:
  `doppler run -p prepcom -c dev -- claude`, hogy az AI-identitású wrapperek lássák a `GITLAB_TOKEN_AI`-t.

## Stack

Vanilla ES-modulok (`*.mjs`) + HTML/CSS, buildlépés nélkül · Node beépített tesztfutója
(`node:test`) · Node 22+ · böngészős ellenőrzések (`tests/*-browser.cjs`).

```text
index.html, *.mjs, *.css   az alkalmazás (model, data, app, plot, property, research, ...)
tests/*.test.mjs           unit tesztek (node:test)
tests/*-browser.cjs        böngészős ellenőrzések, kézzel futnak
docs/                      scope, privát backend terv, Jira-bontás
ci/                        a dev-workflow csomag CI-ellenőrző szkriptjei
```

## Beégetett parancsok

Csak a ténylegesen lefuttatott (vagy zöld CI-pipeline által igazolt) parancs szerepelhet itt.

| Cél | Parancs |
|---|---|
| Helyi szerver (ES-modulok miatt HTTP kell) | `python3 -m http.server 8000 --bind 127.0.0.1` |
| Unit tesztek | `node --test tests/*.test.mjs` |
| Egy teszt | `node --test tests/food.test.mjs` |
| Böngészős ellenőrzés | `node tests/<név>-browser.cjs` — Playwright kell hozzá (`GYOKER_PLAYWRIGHT_MODULE`), helyi szerverrel; CI-ban nem fut, itt nem ellenőriztem |
| CI-szintaxis (helyben) | `sh ci/verify-gitlab-ci-syntax.sh` |
| CI-készenlét (runner, tagek) | `bash .claude/skills/dev-workflow/scripts/check-ci-readiness.sh` |

Nincs formázó/linter: a `LOCAL_FORMAT_CMD` üres, a `LOCAL_CHECK_CMD` a unit tesztek.

## Szabályok

- A régi, telekár nélküli és korábbi sémájú családi JSON-oknak változatlanul be kell tölthetőnek
  maradniuk (`validatePlan` migráció).
- A fájlok nem kerülnek szerverre; személyes pénzügyi adatot a repóba, tesztfixture-be ne tegyél.
- Pages/publikus oldal: az `index.html`, `.mjs` és CSS fájlokat együtt kell közzétenni (`.nojekyll`).
- A privát hirdetésbeolvasó backend terve: [docs/private-backend.md](docs/private-backend.md);
  addig nem része a repónak, amíg nincs jóváhagyva.

## Worktree

- Ne módosítsd és ne írd felül a feladathoz nem tartozó, már meglévő munkafaváltozásokat.
- Commit, push és GitLab-komment kizárólag az AI-identitású wrapperekkel
  (`.claude/skills/dev-workflow/scripts/`: `commit-as-ai.sh`, `push-as-ai.sh`, `glab-note-as-ai.sh`);
  merge csak epic-módban, `merge-as-ai.sh`-val (zöld head pipeline a várt SHA-n).
- Epic-mód: a főmunkafát sosem váltja; a storyk `../prepcom-wt<slot>` worktree-kben futnak.
