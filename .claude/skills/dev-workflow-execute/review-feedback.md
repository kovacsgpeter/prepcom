# dev-workflow-execute — review-visszajelzés feldolgozása (6. belépési pont)

Ezt a fájlt csak akkor olvasd be, ha a felhasználó a (6) "dolgozd fel a review
kommentjeimet" (vagy közeli parafrázisa) belépési ponttal indított — lásd
[`SKILL.md`](SKILL.md) "Belépési pontok" táblázata. Tiszta A-ági/B-ági köröknél **ne
olvasd be** — szándékosan van kiszervezve, hogy azokban az esetekben ne terhelje
feleslegesen a kontextust.

Ez a szakasz egy `REVIEW_STATUS_NAME` státuszban álló tickethez érkezett emberi
visszajelzéseket (Jira- és/vagy GitLab MR-kommentek) dolgozza fel, és ha van bennük
tényleges javítási igény, jóváhagyás után visszavezeti a folyamatot a megszokott
A6→A9 kapukhoz — ugyanoda térve vissza, ahonnan egy normál A-ági kör is indul/végződik.

## Konfiguráció

A [`../dev-workflow/config.md`](../dev-workflow/config.md)-t a hívó [`SKILL.md`](SKILL.md)
már beolvasta — innen releváns: `REVIEW_STATUS_NAME`, `INITIAL_STATUS_NAME`, a Jira
átmenet-gráf ("Design-review ciklus" szekció alján — bár elsősorban a B-ághoz készült, a
`review`→`Done` él onnan derül ki), `MAX_LOCAL_FIX_RETRIES`, `REPO_MAP`,
`BRANCH_NAME_PATTERN`.

## R1 — Ticket, branch, MR feloldása

- Ha a beszélgetésből nem derül ki egyértelműen, melyik ticketről van szó, kérdezz rá a
  kulcsára — ne találgass.
- A [`tracker-adapter.md`](tracker-adapter.md) "ticket beolvasása" műveletével ellenőrizd
  a jelenlegi státuszt. Ha nem `REVIEW_STATUS_NAME`, jelezd
  ezt a felhasználónak (lehet, hogy rossz ticketet adott meg, vagy tudatosan egy másik
  státuszú ticketen is futtatni akarja ezt) — kérdezd meg, folytassa-e mégis.
- **Branch feloldása**: ugyanaz a logika, mint a
  [`../gitlab-branch-review/SKILL.md`](../gitlab-branch-review/SKILL.md) "1. Branch
  feloldása" lépése — `git branch -a` a ticket kulcs alapján (`BRANCH_NAME_PATTERN`). Ha
  nincs egyértelmű találat, kérdezz rá.
- **MR feloldása**: `glab mr list --source-branch=<branch> --all`. Ha nincs MR, jelezd —
  GitLab-kommentek beolvasása ekkor kimarad, csak Jira-kommentekkel dolgozol tovább.

## R2 — Kommentek beolvasása

- **Jira**: a [`tracker-adapter.md`](tracker-adapter.md) "ticket beolvasása" művelete a
  `kommentek` scope-pal — a kommentek szerzővel, időbélyeggel, szöveggel jönnek vissza.
- **GitLab** (ha van MR): `glab mr view <mr> --comments`. Ha ez a flag hibázik/nem
  létezik a telepített `glab` verzióban, nézd meg a `glab mr view --help`-et az aktuális
  szintaxisért — ne találgass, és ha máshogy sem megy, jelezd és folytasd csak
  Jira-kommentekkel.
- Mutasd meg a felhasználónak röviden, mit találtál (hány komment, kitől, mikor) — ne
  másold be szó szerint az összeset, ha sok van, csak a lényeget.

## R3 — Értelmezés és tisztázó kérdések

- Minden kommentet sorolj be:
  - **(a) konkrét, egyértelmű javítási igény** — mehet a listára.
  - **(b) kérdés/kétértelmű felvetés**, ami tisztázást igényel.
  - **(c) láthatóan elavult/lezárt** (pl. a kommentelő később visszaigazolt, vagy a kód
    azóta nyilvánvalóan változott ezen a ponton) — nem kerül a listára, de említsd meg,
    hogy miért hagytad ki.
- A **(b) kategóriás pontokat tedd fel a felhasználónak ebben a session-ben**, egyenként
  vagy csoportosítva — ne találgasd ki, mit gondolt a kommentelő. Addig ne lépj tovább
  R4-re, amíg nincs nyitott kérdés.
- Ha egy komment egyértelműen nem igényel kódváltozást (pl. csak elfogadás/dicséret), ne
  vedd fel a javítási listába.

## R4 — Terv összeállítása és jóváhagyás

- Állítsd össze a végleges javítandó pontok listáját a
  [`../../agents/code-reviewer.md`](../../agents/code-reviewer.md) 3. lépésének formátumához hasonlóan: terület/fájl,
  probléma, javasolt javítás, forrás (Jira-komment / GitLab-komment), kommentelő.
- Mutasd meg a teljes listát a felhasználónak, kérj explicit jóváhagyást ("mehet így, vagy
  módosítsunk?"). Ha módosít, vidd vissza a visszajelzést, pontosítsd a listát.
- Jóváhagyás nélkül **ne hívd meg az implementer-t** — ugyanaz a szabály, mint A6
  terv-jóváhagyási körénél.

## R5 — Ticket-státusz vissza + implementáció

- Ha a ticket még `REVIEW_STATUS_NAME`-ben van, a [`tracker-adapter.md`](tracker-adapter.md)
  "státuszváltás" műveletével ellenőrizd, van-e út vissza `In Progress`-be (vagy bármibe,
  ami jelzi, hogy megint dolgoznak rajta). A `config.md`-ben jelenleg csak a `review`→`Done` él van
  mérve/dokumentálva, a visszaút nincs felderítve — **ne találgass**, nézd meg élesben.
  - Ha találsz visszautat: állítsd be, és **dokumentáld az eredményt a `config.md`
    "Design-review ciklus" szekció átmenet-gráfjában** (kövesd a fájl saját, dátumozott
    konvencióját — lásd `history.md` mintáit), hogy legközelebb ne kelljen újra
    felderíteni.
  - Ha nincs visszaút: jelezd a felhasználónak, és kérdezd meg, hagyjátok-e így (a
    Jira-státusz átmenetileg nem fogja tükrözni, hogy folyik a munka, amíg vissza nem ér
    `review`-ba az R6 végén).
- Hívd meg az `implementer` subagentet **`execute` móddal**, átadva a
  jóváhagyott javítási listát (ugyanaz a hívásminta, mint A6 "közvetlen végrehajtás" ága —
  a lista már eleve szűk scope, nem kell hozzá újabb `plan` kör).

## R6 — Vissza a normál kapukhoz

- Innentől pontosan az A7→9→A8 lánc fut, változtatás nélkül — lásd [`SKILL.md`](SKILL.md).
  **Egy eltérés**: A7a-nál ("pushold fel a branchet, nyiss MR-t") itt **nincs új
  MR-nyitás** — a meglévő MR-re pushold az új commitokat (a branch és az MR már létezik
  az R1 lépésből).
- A 9. lépés (code review) és A8 (teszt-env ellenőrzés) ugyanazokkal a
  [`retry-and-escalation.md`](retry-and-escalation.md) szabályokkal fut, mint egy normál
  A-ági körben (saját, független retry-számlálókkal).
- A8a végén a ticket visszakerül `REVIEW_STATUS_NAME`-re, mint egy normál kör végén — ez a
  pont, ahonnan ez a szakasz elindult.
- **Zárókomment**: A8a után írj egy rövid Jira kommentet, ami felsorolja, mely R2-ben
  talált review-észrevételek lettek kezelve ebben a körben — ugyanaz az elv, mint a code
  review automata kommentjénél ([`../../agents/code-reviewer.md`](../../agents/code-reviewer.md) 5. lépés): minden
  kör hagyjon nyomot, még akkor is, ha a javítás automatikusan megtörtént.
