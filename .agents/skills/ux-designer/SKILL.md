---
name: ux-designer
description: >
  UX/UI-átvilágítás és -újratervezés a futó alkalmazás és a meglévő kód alapján, önállóan
  is hívható. Három belépési pont: "nézd át UX-szemmel az appot" (audit: böngészős
  bejárás, user-flow térkép, Nielsen-heurisztikák és WCAG 2.2 AA szerinti, súlyozott
  találatok), "gondold újra a flow-t és tervezz új képernyőket" (redesign: célflow és
  képernyőnkénti UX-spec, ami a meglévő komponens-felületre, service-ekre és API-ra
  épít, hogy a javítás nagyrészt HTML/SCSS maradjon, plusz story-javaslatok a
  dev-workflow-ba), "kritizáld ezt a képernyőtervet / oldalt" (critique: Figma-terv vagy
  élő oldal értékelése a UX-spec ellen, verdikttel). Közeli parafrázis is elég; a
  kanonikus mondatok a ../dev-workflow/config.md "Indító parancsok" táblázatában vannak.
---

# ux-designer — önállóan hívható belépési pont (Codex-port)

A teljes utasítássor a [`ux-designer.md`](ux-designer.md)
fájlban van (nem duplikáljuk). **Olvasd be azt a fájlt, és a választott módban kövesd
szó szerint.** Ez a fájl csak azt írja le, ami az önálló híváshoz pluszban kell: a
célpont feloldását, a kimenet mentését, a jóváhagyási kaput és az átadást a
dev-workflow-nak.

## Konfiguráció

Olvasd be [`../dev-workflow/config.md`](../dev-workflow/config.md)-t (rövid, csak értékek; egy kulcs jelentése a [`../dev-workflow/config-reference.md`](../dev-workflow/config-reference.md) azonos című szakaszában — csak azt a szakaszt olvasd be, a referenciát egészben soha), a "UX-designer
(UX_*)" szakaszt. Ebben a fájlban használt változók: `UX_OUTPUT_DIR`,
`UX_AUDIT_TARGET`, `UX_FRONTEND_DIR`, `UX_BACKEND_DIR`, `UI_CHANGE_BUDGET_BASE`,
`UI_CHANGE_BUDGET_DEFAULT`, `TEST_ENV_URLS`.

## A teljes lánc

| # | Lépés | Ki / mi | Kimenet |
|---|---|---|---|
| 1 | Átvilágítás | ez a skill, `audit` | `<UX_OUTPUT_DIR>/audit-<dátum>.md` |
| 2 | Új flow és képernyők | ez a skill, `redesign` | `<UX_OUTPUT_DIR>/redesign-<téma>.md` + jóváhagyás |
| 3 | Ticketek | `dev-workflow-scoping` a ticket-javaslatokból | storyk: Oldalnév, UI-változás kerete, UX-spec hivatkozás |
| 4 | Képernyőtervek | "csináld meg előre az összes képernyőtervet" (B8): `figma-designer` a UX-spec alapján, utána UX-kritika (B4a, `UX_CRITIQUE_GATE`), majd kézi design-review | Figma frame-ek oldalnév szerint |
| 5 | Implementáció | `dev-workflow-execute` A-ág: az `implementer` a ticket keretén belül dolgozik, a `ui-contract.js check-budget` push előtt ellenőrzi | MR |
| 6 | Ellenőrzés | `qa-tester`, és ha kell, `critique` `live` célponttal | AC-riport, kritika |

Bármelyik lépés önállóan is indítható. A 3–6. lépés a meglévő dev-workflow, ez a skill
csak a bemenetét készíti elő.

## 1. Audit

1. **Célpont** a `UX_AUDIT_TARGET` szerint:
   - `local-dev-server` *(alap)*: ha a lokál dev-szerver nem fut, indítsd el a projekt
     szokásos módján. a [`../dev-workflow-execute/qa-tester.md`](../dev-workflow-execute/qa-tester.md)
     szerint (a dev-szerver parancsa az `AGENTS.md`-ben van).
   - `test-env`: a `TEST_ENV_URLS` frontend-URL-je.
   - bármely `http(s)://…` érték: az adott URL.
2. **Hatókör**: ha a felhasználó nem mondta meg, kérdezd meg egy mondatban: az egész app
   vagy egy adott flow?
3. Kövesd az agent "0. Közös előkészítés" és "1. `audit` mód" szakaszát.
4. **Mentés**: `<UX_OUTPUT_DIR>/audit-<ÉÉÉÉ-HH-NN>[-<hatókör>].md`. A screenshotok a
   sessionben látszanak, fájlba nem kerülnek. A riport helyekkel és mért értékekkel
   hivatkozik rájuk.
5. **Zárás**: 3–5 soros összefoglaló, és következő lépésként a redesign felajánlása.

## 2. Redesign

1. **Alap-audit**: a `UX_OUTPUT_DIR` legfrissebb `audit-*.md` fájlja. Ha nincs, vagy
   egy hónapnál régebbi, ajánld fel előbb az auditot.
2. **Célok és korlátok**: egyetlen üzenetben kérdezd meg a
   [`redesign-method.md`](redesign-method.md) 1. pontjának négy kérdését (fő feladat,
   siker-mérce, ami nem változhat, preferált keret). Ha a felhasználó nem akar
   válaszolni, az alapértékekkel menj tovább, és ezt írd be a dokumentum "Célok és
   korlátok" részébe.
3. Kövesd az agent "0. Közös előkészítés" és "2. `redesign` mód" szakaszát.
4. **Mentés**: `<UX_OUTPUT_DIR>/redesign-<téma>.md`, "Állapot: javaslat".
5. **Jóváhagyási kapu**: mutasd az összefoglalót, a TS/API-deltát és a
   ticket-javaslatokat. A T3 (backend/API) tételeket tételesen kell jóváhagyni.
   **Jóváhagyás nélkül ne hozz létre ticketet.** A felhasználó kérésére módosítsd a
   dokumentumot, és mutasd újra.
6. **Átadás jóváhagyás után**: írd át az állapotot "jóváhagyva"-ra, és a
   ticket-javaslatok táblájával indítsd a `dev-workflow-scoping` skillt. Storyként minden
   sor a következőket viszi: cím, "Oldalnév", "UI-változás kerete", a "## Design"
   szekcióban a UX-spec hivatkozás (`<fájl>#<oldalnév>`), és az AC-váz. A scoping és az
   intake a szokásos DoR-interjút futtatja, de a spec-ből már kitöltött mezőket nem
   kérdezi újra.
7. **Következő lépés**: javasold a képernyőtervek előre elkészítését ("csináld meg
   előre az összes képernyőtervet").

## 3. Critique

- Önálló hívásnál kérdezd meg a célpontot (`figma` + oldalnév, vagy `live` + URL) és a
  UX-spec fejezetet. Ha nincs spec, a kritika csak a rubrika szerint készül, és ezt a
  riport kimondja.
- Kövesd az agent "0." és "3. `critique` mód" szakaszát.
- **Mentés**: `<UX_OUTPUT_DIR>/critique-<oldalnév>-<ÉÉÉÉ-HH-NN>.md`.
- A pipeline is hívja (a `dev-workflow-execute/design-branch.md` B4a lépése). Ott a
  kimenetet a hívó fél kezeli, ez a fájl nem.

## UI-változási keret kézi ellenőrzése

Egy branch változásairól (a repo gyökeréből):

```
node .agents/skills/dev-workflow/scripts/ui-contract.js check-budget --budget <template-only|thin-ts|logic|free> --base <UI_CHANGE_BUDGET_BASE> --frontend-dir <UX_FRONTEND_DIR> --backend-dir <UX_BACKEND_DIR> [--worktree]
```

Kilépőkód: 0 = kereten belül, 1 = kívül (fájlonként a szinttel és az okkal), 2 = nem
ellenőrizhető. A 2-es kód nem "átment".

## Eltérések a pipeline-hoz képest

- Jira-ticket nem kell; az audit és a redesign ticket nélkül is fut. Ticket csak a
  redesign 6. lépésében, jóváhagyás után, a scopingon keresztül születik.
- A dokumentumok a repóba kerülnek (`UX_OUTPUT_DIR`), de nem commitolódnak automatikusan:
  a commitról a felhasználó dönt.
