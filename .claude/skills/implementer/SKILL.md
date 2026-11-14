---
name: implementer
description: >
  TDD-alapú implementáció önállóan, a dev-workflow-execute pipeline-tól függetlenül is
  hívható. Használd, ha a felhasználó azt kéri, hogy "implementáld ezt a ticketet",
  "írd meg ezt TDD-vel", "implementáld ezt az AC-listát" — akár Jira ticket ID-vel, akár
  csak leírt Acceptance Criteria-kkal, anélkül hogy a teljes dev-workflow pickup/branch/
  code-review pipeline-t futtatnád. Ugyanazt a logikát követi, mint a
  `dev-workflow-execute` A6 lépése.
---

# implementer — önállóan hívható belépési pont

Ez ugyanaz a munka, amit a `dev-workflow-execute` pipeline A6 lépése is végez — az
egyetlen, teljes utasítássor a
[`../../agents/implementer.md`](../../agents/implementer.md)
fájlban van (nem duplikáljuk, hogy ne essen szét a két hívási mód). **Olvasd be azt a
fájlt, és kövesd szó szerint** (kontextus-összegyűjtés, TDD-ciklus, helyi minőségi
ellenőrzés, visszajelzés-formátum — minden onnan jön).

## Konfiguráció

Olvasd be [`../dev-workflow/config.md`](../dev-workflow/config.md)-t (rövid, csak értékek; egy kulcs jelentése a [`../dev-workflow/config-reference.md`](../dev-workflow/config-reference.md) azonos című szakaszában — csak azt a szakaszt olvasd be, a referenciát egészben soha) is — ugyanazokat a
változókat használod, mint pipeline-hívásnál (`PAGE_NAME_SEPARATOR`, `FIGMA_FILE_REF`,
`TEST_DATA_DIR`).

## Eltérések önálló híváskor (nem a pipeline-ból jöttél)

- **Branch/repo**: ha a felhasználó nem adott meg explicit branch-et vagy repót, dolgozz
  a jelenleg checkoutolt branch-en/repóban, és **jelezd ezt neki**, mielőtt bármit
  módosítasz — ne találgass, ha ez nem egyértelmű.
- **Ticket vagy AC-lista**: ha nincs Jira ticket ID, kérj közvetlenül AC-listát a
  felhasználótól (az [`../../agents/implementer.md`](../../agents/implementer.md) "1. Kontextus összegyűjtése" lépése ezt már kezeli,
  ha nincs Jira ID — nem kötelező Jira).
- **`plan`/`execute` mód**: ha a felhasználó nem jelez módot és a kérés több AC-t vagy
  fájlt érint, ajánlj fel előbb egy `plan` kört (rövid terv, jóváhagyás), mielőtt
  nekiállnál kódot írni — lásd [`../../agents/implementer.md`](../../agents/implementer.md) "0. `plan` mód". Triviális, egyfájlos
  kérésnél mehet egyenesen `execute` móddal.
- **Push/MR/Jira-státuszváltás**: ez pipeline-hívásnál sem az implementer dolga, önálló
  híváskor sem — ha a felhasználó ezt is kéri, kérdezd meg explicit, mit szeretne
  (pusholjál, nyiss MR-t, változtass Jira-státuszt), mielőtt megtennéd. Ha nem kéri,
  csak a commitokig menj el, és jelezd, hogy push/MR nem történt.
