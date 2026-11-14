---
name: code-reviewer
description: >
  Strukturált, read-only code review, önállóan is hívható a dev-workflow-execute
  pipeline-tól függetlenül. Használd, ha a felhasználó azt kéri, hogy "review-zd le ezt
  a diffet/branch-et/MR-t", "nézd át ezt a kódot" — akár Jira ticket ID/AC-lista
  kontextussal, akár anélkül. Csak javasol, semmit nem módosít explicit jóváhagyás
  nélkül. Ugyanazt a logikát követi, mint a `dev-workflow-execute` 9. lépése.
---

# code-reviewer — önállóan hívható belépési pont

Ez ugyanaz a munka, amit a `dev-workflow-execute` pipeline 9. lépése is végez — az
egyetlen, teljes utasítássor a
[`../../agents/code-reviewer.md`](../../agents/code-reviewer.md)
fájlban van (nem duplikáljuk). **Olvasd be azt a fájlt, és kövesd szó szerint.**

## Konfiguráció

Olvasd be [`../dev-workflow/config.md`](../dev-workflow/config.md)-t (rövid, csak értékek; egy kulcs jelentése a [`../dev-workflow/config-reference.md`](../dev-workflow/config-reference.md) azonos című szakaszában — csak azt a szakaszt olvasd be, a referenciát egészben soha) is — ugyanazokat a
változókat használod, mint pipeline-hívásnál (elsősorban az "AI-identitás" szekciót az 5b
lépés GitLab-kommentjéhez, **és** a "CODE_REVIEW_DEFAULT_EFFORT értékek" szekciót a "2.
Review szempontok"/"3. Strukturált review kimenet" effort-szintjéhez — ez önálló híváskor
is ugyanúgy érvényes). Ha a hívás önállóan, nem a `dev-workflow-execute` pipeline-ból
jön, a `WORKFLOW_PROFILE`/egyedi kapcsoló-preset-tábla ekkor még jellemzően nem releváns
(ez a skill maga nem deklarál saját egyedi kapcsolót) — csak akkor nézz utána, ha a
[`../../agents/code-reviewer.md`](../../agents/code-reviewer.md)-ben hivatkozott valamelyik kapcsoló épp
releváns lenne.

## Eltérések önálló híváskor (nem a pipeline-ból jöttél)

- **Nincs Jira ticket / AC-lista**: a [`../../agents/code-reviewer.md`](../../agents/code-reviewer.md) "1. Kontextus összegyűjtése"
  lépése Jira ticketet feltételez az AC-khez — ha nincs, kérdezd meg a felhasználót, mi
  a diff/branch célja, vagy dolgozz tisztán a diff tartalmából (helyesség, tesztlefedettség,
  hibakezelés, biztonság, olvashatóság, konvenciók — ezek Jira nélkül is értékelhetők).
- **Konvenció-forrás Jira nélkül is**: a "Konvenciók" review-szempont ellenőrzéséhez
  önálló híváskor is olvasd be a [`docs/conventions.md`](../../../docs/conventions.md)-t
  (elnevezés, tesztstílus, commit-forma, API-teszt konvenció) és a
  [`docs/architecture.md`](../../../docs/architecture.md)-t (struktúra) — ezek Jira ticket
  hiányában is érvényes, kódbázis-szintű elvárások. Ugyanígy, ha az érintett réteghez
  létezik `Státusz: jóváhagyott` `docs/best-practices-<slug>.md` fájl (pl.
  `docs/best-practices-angular.md`, `docs/best-practices-java-spring.md`), olvasd be azt
  is — `draft` státuszú fájlt hagyj figyelmen kívül, hiányzó fájl esetén ne akadj el.
- **Diff hivatkozás**: ha a felhasználó nem ad meg explicit branch/commit-tartományt,
  kérdezd meg, vagy — ha egyértelmű a kontextusból (pl. egy nyitott feature branch-en
  vagytok) — használd `git diff <base>...HEAD`-et, de mondd ki, melyik tartományt
  választottad.
- **Jóváhagyás kérése változatlanul érvényes**: a [`../../agents/code-reviewer.md`](../../agents/code-reviewer.md) "4. Jóváhagyás
  kérése — NE HAJTS VÉGRE SEMMIT" szabálya **önálló híváskor is szigorúan érvényes**
  (ezzel ellentétben a pipeline-beli 9. lépés a `execute/SKILL.md`-ben *felülírja* ezt
  automatizált javítókörré — az a felülírás **csak** a pipeline-kontextusban él, önálló
  híváskor ne alkalmazd).
- **Jira komment**: a "5. Jira komment" lépés csak akkor releváns, ha van Jira ticket —
  ha nincs, hagyd ki.
- **GitLab komment**: az "5b. GitLab komment" lépés (soronkénti + összesített) **ugyanúgy
  automatikus, önálló híváskor is** — ez review-dokumentálás, nem a 4. lépésben
  védett kódmódosítás. Csak akkor marad el, ha nincs a branch-hez tartozó MR (a lépés
  saját maga kezeli ezt az esetet).
