# dev-workflow-execute — követ-jelentés (KOVET_REPORT)

Az [`SKILL.md`](SKILL.md) „Általános szabályok” szakaszából hivatkozva (SLING-192): az execute-futás
**befejező pontján** egyszer olvasd be és kövesd. A lépés egy napi követ-jelentést küld a
[Slingnek](https://gitlab.com/constructioncalculator/sling) (`sling daily report`). Ha a gépen nincs
Sling, csendben kimarad, így a csomag Sling nélküli repókban változatlanul működik.

## Mikor fut

Pontosan **egyszer** futásonként, az utolsó lépés után, mielőtt a futást lezáró üzenetet megírnád:

- **egyedi ticket és batch mód**: a [`test-env.md`](test-env.md) 8a (zöld) vagy 8b (piros) vége, a
  workflow-meta ticket 9. lépés utáni megállása, illetve egy eszkalációs megállás fix-ticket után
  (A7b, 9, A8b, és a pipeline-kapu piros ága, lásd [`retry-and-escalation.md`](retry-and-escalation.md));
  a B-ág (B7 → A5) és az R-ág (R6 → A7) ugyanezekhez a pontokhoz tér vissza, külön befejező pontjuk nincs;
- **epic mód**: csak az [`epic-mode.md`](epic-mode.md) E7 zárásánál, egyszer az egész epicre. A
  story-runner subagentek **nem** futtatják.

Közbülső megállásnál (terv-jóváhagyás, push előtti várakozás, pipeline-kérdés) **nem** fut.

## Lépések

1. Oldd fel a kapcsolót: `bash .claude/skills/dev-workflow/scripts/config-value.sh KOVET_REPORT auto`.
   - `off`: a lépés kimarad, jelzés nélkül.
2. **Elérhetőség**, ebben a sorrendben (az első találat nyer):
   - a `sling` parancs a PATH-on van (`command -v sling`) → `sling daily report`;
   - a `kovet-jelentes` skill szerepel a session elérhető skilljei között (a Sling hook-telepítője
     rakja le a Claude config-könyvtár `skills/` mappájába) → a skill „Elküldés” szakaszában álló
     parancsot használd szó szerint (ez a futó Sling abszolút útja, pl. `"…\python.exe" -m sling daily report`).
   - Egyik sincs: `auto` esetén a lépés **jelzés nélkül** kimarad; `on` esetén egyetlen sor
     figyelmeztetés: „KOVET_REPORT=on, de a sling CLI nem érhető el — a követ-jelentés kimaradt.”
3. **Töltsd ki a négy mezőt** (mindegyik rövid, magyar mondatok listája; üres lista is érvényes):
   - `done`: ami ebben a futásban elkészült (ticket-kulcs, commit-SHA, MR-link, státuszváltás);
   - `unfinished`: ami nyitva maradt (nyitott blocker/major, fix-ticket, kézi lépés, push/merge);
   - `raised`: felmerült kérdés, kockázat, döntés, ami nem veszhet el;
   - `tomorrow`: a javasolt következő lépés(ek).

   Kizárólag a **saját** futás munkájáról, forrásolható tételekkel írj; ne találgass, ne másolj
   be nyers kimenetet, és ne írj bele titkot (token, jelszó, hitelesítő URL). A Sling korlátai:
   mezőnként legfeljebb 50 elem, elemenként legfeljebb 500 karakter, a teljes JSON 64 KiB alatt, és
   csak ez a négy kulcs szerepelhet.
4. **Küldés** egyetlen hívással, a JSON a stdin-re megy; ha ismered a session azonosítóját, add át
   `--session <id>`-vel:

   ```bash
   sling daily report --session <session-id> <<'JSON'
   {"done": ["…"], "unfinished": ["…"], "raised": ["…"], "tomorrow": ["…"]}
   JSON
   ```

5. **Hiba**: nem nulla kilépőkódnál olvasd el a (kitakart) hibaüzenetet, és egyszer javítsd a
   JSON-t. Ha másodszor is hibás, egy sorban jelezd, és lépj tovább. A követ-jelentés hibája
   **soha** nem változtat a ticket státuszán vagy a futás kimenetén.
