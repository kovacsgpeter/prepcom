# dev-workflow-intake — 2.c — Fenyegetés-modellezés (katalógus-vezérelt): részletek

Az [`SKILL.md`](SKILL.md) „2.c — Fenyegetés-modellezés (katalógus-vezérelt)” lépéséből kiszervezve (ORD-498): csak akkor olvasd be,
ha a „Mikor fut” szerint a fenyegetés-modell fut. A szöveg változatlan; a lépésszámok a `SKILL.md`-re vonatkoznak.

## Hogyan szűr — `THREAT_MODEL_STRATEGY`

A `config.md` `THREAT_MODEL_STRATEGY` értéke szerint (lásd `config.md`
"### THREAT_MODEL_STRATEGY értékek"):

- **`checklist`**: kizárólag a `threat-catalog.md` 8 kategóriáját járd végig; katalóguson
  kívüli kockázatot ne vegyél fel.
- **`hybrid`** (alapérték): a 8 kategória **plusz** felvehetsz katalóguson kívüli
  kockázatot is, de **kötelező** hozzá egymondatos indoklás.
- **`llm`**: tisztán a saját ítéleted, a katalógus csak informális támpont — a
  `threat-model-fixture.md` "Várt minimum" elvárása ekkor nem garantált.

Minden relevánsnak ítélt kategóriához dönts: (a) javasolsz egy **konkrét, ellenőrizhető,
`[biztonsági]` prefix tokennel jelölt** AC-t (verifikációs jelöléssel a végén, a
`dor-checklist.md` formátuma szerint), vagy (b) tudatosan vállalt kockázatként rögzíted
egymondatos indoklással. A javasolt AC szövege **kategória-szintű** legyen — ne
tartalmazzon konkrét sebezhetőség-részletet, kihasználási lépést vagy titkot.

## Hogyan kérdez — `THREAT_MODEL_AUTONOMY`

A `config.md` `THREAT_MODEL_AUTONOMY` értéke szerint (lásd `config.md`
"### THREAT_MODEL_AUTONOMY értékek"):

- **`ask`** (alapérték): minden javasolt biztonsági AC-re **külön** kérj jóváhagyást,
  mielőtt bekerülne az AC-listába.
- **`notify`**: vedd fel a javasolt biztonsági AC-ket, de **tételesen listázd** a
  felhasználónak (mit vettél fel, melyik kategóriából, miért).
- **`auto`**: vedd fel a biztonsági AC-ket, ne kérdezz külön.

## Az elvetett kockázat nyoma (COCALC-275 AC10–11)

- Ha egy azonosított kockázatból **nem** lesz AC, az **egymondatos indoklással** a ticket
  "Biztonsági megfontolások" szekciójába kerül. Ezt **mindhárom** autonómia-szint betartja
  — az `auto` **sem** hagyhatja el.
- A "Biztonsági megfontolások" szekció a már felvett `[biztonsági]` AC-ket **nem**
  duplikálja, csak hivatkozik rájuk (pl. "lásd AC7").
- A teljes eredményt a `story-interview` DoR Spec "Biztonsági kockázatok" mezőjébe
  szintetizáld: mely kategóriák voltak relevánsak, melyikből lett AC (AC-szám), melyik
  lett tudatosan vállalva (indoklással).
