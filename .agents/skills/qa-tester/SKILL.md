---
name: qa-tester
description: >
  Automata teszt futtatás és/vagy böngészőben manuális AC-ellenőrzés, önállóan is
  hívható a dev-workflow-execute pipeline-tól függetlenül. Használd, ha a felhasználó
  azt kéri, hogy "teszteld le ezt lokálban", "ellenőrizd az AC-ket a teszt-környezeten",
  "nézd meg böngészőben, hogy működik-e" — akár Jira ticket ID-vel, akár csak leírt
  Acceptance Criteria-kkal. Csak tesztel és jelent, nem javít kódot. Ugyanazt a logikát
  követi, mint a `dev-workflow-execute` A7/A8 lépése.
---

# qa-tester — önállóan hívható belépési pont

Ez ugyanaz a munka, amit a `dev-workflow-execute` pipeline A7 (local) és A8 (test-env)
lépése is végez — az egyetlen, teljes utasítássor a
[`../dev-workflow-execute/qa-tester.md`](../dev-workflow-execute/qa-tester.md) fájlban
van (nem duplikáljuk). **Olvasd be azt a fájlt, és kövesd szó szerint.**

## Konfiguráció

Olvasd be [`../dev-workflow/config.md`](../dev-workflow/config.md)-t (rövid, csak értékek; egy kulcs jelentése a [`../dev-workflow/config-reference.md`](../dev-workflow/config-reference.md) azonos című szakaszában — csak azt a szakaszt olvasd be, a referenciát egészben soha) is — releváns
változók: `TEST_ENV_URLS` (csak `test-env` módhoz kell), `TEST_DATA_DIR` (fájl-feltöltést/
importot érintő AC-knél).

## Eltérések önálló híváskor (nem a pipeline-ból jöttél)

- **Target mód**: ha a felhasználó nem mondja meg explicit, kérdezd meg: `local` (saját
  gépen indított dev szerver) vagy `test-env` (a `config.md` `TEST_ENV_URLS` alatti,
  már deployolt környezet)?
- **Ticket vagy AC-lista**: ha nincs Jira ticket ID, kérj közvetlenül AC-listát a
  felhasználótól — nem kötelező Jira.
- **Jira komment**: a `qa-tester.md` "5. Jira komment" lépése csak akkor releváns, ha
  tényleg van Jira ticket ID — ha nincs, hagyd ki, és a talált hibákat/eredményt csak a
  chat-válaszban add vissza, strukturáltan (ugyanazzal a formátummal, mint a Jira
  kommenthez).
- **Ne javíts kódot** — ez önálló híváskor is áll: ha hibát találsz, jelentsd, és ha a
  felhasználó javítást is kér, irányítsd az `implementer` skillhez/subagenthez, ne
  csináld meg te.
