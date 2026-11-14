# dev-workflow-execute — review-visszajelzés feldolgozása (6. belépési pont)

Ezt a fájlt csak akkor olvasd be, ha a felhasználó a (6) „dolgozd fel a review
kommentjeimet” (vagy közeli parafrázisa) belépési ponttal indított — lásd
[`SKILL.md`](SKILL.md) „Belépési pontok” táblázata. Tiszta A-ági/B-ági köröknél **ne
olvasd be** — szándékosan van kiszervezve, hogy ne terhelje a normál út kontextusát.

Ez a szakasz egy `REVIEW_STATUS_NAME` státuszban álló tickethez érkezett emberi
visszajelzéseket dolgozza fel, és ha van bennük tényleges javítási igény, jóváhagyás
után visszavezeti a folyamatot a megszokott A6→A9 kapukhoz.

## Konfiguráció

A [`../dev-workflow/config.md`](../dev-workflow/config.md)-t a hívó [`SKILL.md`](SKILL.md)
már beolvasta. Innen releváns: `REVIEW_STATUS_NAME`, `INITIAL_STATUS_NAME`, a Jira
átmenet-gráf, `MAX_LOCAL_FIX_RETRIES`, `REPO_MAP`, `BRANCH_NAME_PATTERN` és az
„AI-identitás” szekció.

## R1 — Ticket, branch, MR feloldása

- Ha nem derül ki egyértelműen, melyik ticketről van szó, kérdezz rá a kulcsára — ne
  találgass.
- `getJiraIssue`-val ellenőrizd a jelenlegi státuszt. Ha nem `REVIEW_STATUS_NAME`,
  jelezd ezt, és kérdezd meg, hogy a felhasználó mégis folytatni akarja-e.
- **Branch feloldása**: kövesd a
  [`../gitlab-branch-review/SKILL.md`](../gitlab-branch-review/SKILL.md) „Branch
  feloldása” lépését; keresd a ticket kulcsát a `BRANCH_NAME_PATTERN` szerint.
- **MR feloldása**: `glab mr list --source-branch=<branch> --all`. Ha nincs MR,
  jelezd; csak Jira-kommentekkel dolgozz tovább.

## R2 — Kommentek beolvasása

- **Jira**: `getJiraIssue` hívás `fields: ["comment"]`-mal — olvasd be a
  `fields.comment.comments` elemeit szerzővel és időbélyeggel együtt.
- **GitLab**: ha van MR, olvasd be a kommenteket `glab mr view <mr> --comments`
  segítségével. Ha az aktuális `glab` szintaxisa eltér, nézd meg a helpet; ne találgass.
- Röviden mutasd meg, mit találtál. Sok kommentnél a lényeget foglald össze, ne másold
  be szó szerint az összeset.

## R3 — Értelmezés és tisztázó kérdések

Minden kommentet sorolj be:

- **(a) Konkrét, egyértelmű javítási igény** — kerüljön a javítási listára.
- **(b) Kérdés vagy kétértelmű felvetés** — kérdezd meg a felhasználót; ne találgass.
- **(c) Elavult vagy már lezárt pont** — hagyd ki, de röviden indokold, miért.

Ne lépj R4-re, amíg nyitott tisztázó kérdés van. A puszta elfogadás vagy dicséret nem
javítási igény.

## R4 — Terv és jóváhagyás

- Állítsd össze a végleges listát a [`code-reviewer.md`](code-reviewer.md) 3. lépéséhez
  hasonlóan: terület/fájl, probléma, javasolt javítás, forrás és kommentelő.
- Mutasd meg a teljes listát, és kérj explicit jóváhagyást („mehet így, vagy
  módosítsunk?”).
- Jóváhagyás nélkül ne indíts implementációt.

## R5 — Ticket-státusz és implementáció

- Ha a ticket még `REVIEW_STATUS_NAME`-ben van, kérdezd le az elérhető Jira
  tranzíciókat; ne találgasd a visszautat. Ha van visszaút `In Progress`-be, használd,
  és a felderített átmenetet dokumentáld a `config.md` Jira átmenet-gráfjában a
  `history.md` dátumozott mintája szerint. Ha nincs, jelezd, és kérdezd meg, maradhat-e
  átmenetileg review státuszban.
- Delegáld a jóváhagyott javítási listát a `dev_workflow_implementer` custom agentnek
  `execute` módban. Ha a custom agent nem választható, indíts specializált subagentet,
  add át neki ezt a listát, és utasítsd a
  [`implementer.md`](implementer.md) teljes beolvasására. Új `plan` kör nem kell.

## R6 — Vissza a normál kapukhoz

- Futtasd az A7→9→A8 láncot a [`SKILL.md`](SKILL.md) szerint.
- A7a-nál a meglévő branch-re pusholj az AI-identitású wrapperrel; ne nyiss új MR-t,
  mert a branch és az MR már létezik az R1 lépésből.
- A code review és a teszt-env ellenőrzés a megszokott, egymástól független
  retry-számlálókat használja.
- A8a végén a ticket visszakerül `REVIEW_STATUS_NAME`-re.
- Írj rövid Jira zárókommentet arról, hogy mely R2-ben talált és jóváhagyott
  észrevételeket kezelte a kör; minden kör hagyjon nyomot akkor is, ha a javítás
  automatikusan megtörtént.
