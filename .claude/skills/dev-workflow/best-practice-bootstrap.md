# best-practice-bootstrap — stack-felismerésen alapuló best practice kivonat

Kézzel indítható, önálló lépés (nem függ a `dev-workflow-execute` állapotgéptől). Nem
módosít alkalmazáskódot, nem commitol automatikusan más fájlt, mint amit maga generál.

Indító mondat: lásd `config.md` "Indító parancsok" táblázat 7. sora ("ismerd fel a repo
stackjeit és generálj best practice kivonatot" — közeli parafrázisa is elég).

## Konfiguráció

Olvasd be előbb [`config.md`](config.md)-t (rövid, csak értékek; egy kulcs jelentése a [`config-reference.md`](config-reference.md) azonos című szakaszában — csak azt a szakaszt olvasd be, a referenciát egészben soha). Releváns változók: `STACK_DETECTION_MAP`,
`BEST_PRACTICE_DOCS_DIR` (lásd ott "Stack-felismerés (best practice bootstrap)" szekció).

## 1. Stack-felismerés

A `STACK_DETECTION_MAP` minden sorára:
- Nézd meg, létezik-e a repóban a sorban megjelölt build/manifest fájl (pl.
  `frontend/package.json`, `backend/build.gradle.kts` — ha a repo monorepo felépítésű,
  több alkalmazás-alkönyvtárral, mindegyiket nézd, ne csak a gyökeret; egyszerű,
  egy-alkalmazásos repóban a gyökér is elég lehet).
- Ha létezik, **olvasd be**, és nézd meg, tartalmazza-e a sorban megjelölt jelzőt (pl. az
  `@angular/core` függőséget, az `org.springframework.boot` plugin/dependency-t).
- Ha mindkét feltétel teljesül, a sor stack-slugja **felismert stack**.
- Ha a manifest fájl nem létezik, vagy létezik de a jelző hiányzik, azt a sort **csendben
  hagyd ki** — ez nem hiba, csak azt jelenti, hogy az a stack nincs jelen ebben a repóban.
- Ne olvasd be a teljes forrásfát ehhez a lépéshez — kizárólag a build/manifest fájlokat
  nézd, ez a felismerés célzott, nem egy teljes kódfelderítés.

## 2. Generálás, csak a hiányzókhoz

Minden felismert stack-slughoz:
- Ellenőrizd, létezik-e már `<BEST_PRACTICE_DOCS_DIR>/best-practices-<slug>.md`.
- **Ha már létezik** (akár `draft`, akár `jóváhagyott` státusszal) — **soha ne írd
  felül**. Jelezd a végső összefoglalóban, hogy ez a stack már dokumentálva van, és a
  fájl jelenlegi státuszát (a fejléc "Státusz:" sorából).
- **Ha nem létezik**, generálj egy új draft fájlt a saját (a repo stackjéhez tartozó,
  jelen tudásod szerinti) iparági best practice ismereteid alapján. A fájl:
  - Fejlécben: `Státusz: draft` sor, és `<Stack> <verzió> · <dátum (ÉÉÉÉ-HH-NN)>` sor
    (pl. `Angular 19 · 2026-08-25`) — a verziót a repo tényleges manifestjéből olvasd ki
    (pl. `package.json` `@angular/core` verziószáma, `build.gradle.kts`
    `org.springframework.boot` plugin verziója), ne találgasd.
  - Tartalmazza a **teljes** releváns iparági ajánlást — nem csak azt, amit a repo kódja
    ma ténylegesen teljesít. Minden szabály mellett tüntesd fel a **forrást** (pl.
    "angular.dev style guide", "Google Java Style Guide", "Spring Boot dokumentáció").
  - Minden szabály mellett explicit mondd ki: **új vagy érdemben módosított fájlra
    kötelező, meglévő kódot emiatt nem írunk át**.
  - Amit a repo ma sehol nem teljesít, kapjon explicit **"célállapot, még nem élő"**
    jelölést.
  - Ne mondjon ellent a [`../../../docs/conventions.md`](../../../docs/conventions.md)-nek
    — ütközés esetén a repo saját konvenciója erősebb, ezt a fájl elején explicit mondd
    ki.
  - Zárd egy megjegyzéssel: ez a fájl `draft` állapotban van, a négy fogyasztó
    (`implementer`, `code-reviewer` subagent, `code-reviewer` skill,
    `gitlab-branch-review` skill) csak `Státusz: jóváhagyott` fájlt vesz figyelembe, ezt
    figyelmen kívül hagyja, amíg valaki ember jóvá nem hagyja (státuszt `jóváhagyott`-ra
    nem írja át).

## 3. Visszajelzés

Adj egy **rövid összefoglalót**:
- Mely stackek lettek felismerve, melyikhez generálódott új fájl, melyik volt már
  meglévő (és milyen státusszal).
- Mely `STACK_DETECTION_MAP` sorokhoz nem volt manifest-egyezés (nem generált semmit).
- A generált fájlok pontos elérési útja — az embernek ezeket kell átolvasnia és
  `jóváhagyott`-ra állítania, mielőtt a fogyasztók figyelembe veszik őket.

## Karbantartás

Aki a `package.json` vagy `build.gradle.kts` (vagy más manifest) major verzióját emeli,
köteles átnézni az érintett `best-practices-<slug>.md` fájlt — lásd
[`../../../docs/conventions.md`](../../../docs/conventions.md) "Karbantartás" szakaszát.
