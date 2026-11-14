# dev-workflow-intake — 2.d — Nem-funkcionális követelmények (katalógus-vezérelt): részletek

Az [`SKILL.md`](SKILL.md) „2.d — Nem-funkcionális követelmények (katalógus-vezérelt)” lépéséből kiszervezve (ORD-498): csak akkor olvasd be,
ha a „Mikor fut” szerint az NFR-modell fut. A szöveg változatlan; a lépésszámok a `SKILL.md`-re vonatkoznak.

## Hogyan szűr — `NFR_STRATEGY`

A `config.md` `NFR_STRATEGY` értéke szerint (lásd `config.md` "### NFR_STRATEGY
értékek"):

- **`checklist`**: kizárólag az `nfr-catalog.md` öt kategóriáját járd végig; katalóguson
  kívüli szempontot ne vegyél fel.
- **`hybrid`** (alapérték): az öt kategória **plusz** felvehetsz katalóguson kívüli
  szempontot is, de **kötelező** hozzá egymondatos indoklás.
- **`llm`**: tisztán a saját ítéleted, a katalógus csak informális támpont.

Minden relevánsnak ítélt kategóriához dönts: (a) javasolsz egy **konkrét, ellenőrizhető,
`[nfr]` prefix tokennel jelölt** AC-t (verifikációs jelöléssel a végén, a
`dor-checklist.md` formátuma szerint), vagy (b) tudatosan elvetett szempontként rögzíted
egymondatos indoklással. A javasolt AC szövege **kategória-szintű** legyen — ne
tartalmazzon implementációs részletet.

## Hogyan kérdez — `NFR_AUTONOMY`

A `config.md` `NFR_AUTONOMY` értéke szerint (lásd `config.md` "### NFR_AUTONOMY
értékek"):

- **`ask`** (alapérték): minden javasolt nem-funkcionális AC-re **külön** kérj
  jóváhagyást, mielőtt bekerülne az AC-listába.
- **`notify`**: vedd fel a javasolt nem-funkcionális AC-ket, de **tételesen listázd** a
  felhasználónak (mit vettél fel, melyik kategóriából, miért).
- **`auto`**: vedd fel a nem-funkcionális AC-ket, ne kérdezz külön.

## Az elvetett szempont nyoma

- Ha egy azonosított szempontból **nem** lesz AC, az **egymondatos indoklással** a ticket
  "Nem-funkcionális megfontolások" szekciójába kerül. Ezt **mindhárom** autonómia-szint
  betartja — az `auto` **sem** hagyhatja el.
- A "Nem-funkcionális megfontolások" szekció a már felvett `[nfr]` AC-ket **nem**
  duplikálja, csak hivatkozik rájuk (pl. "lásd AC7").
- A teljes eredményt a `story-interview` DoR Spec "Nem-funkcionális követelmények"
  mezőjébe szintetizáld: mely kategóriák voltak relevánsak, melyikből lett AC (AC-szám),
  melyik lett tudatosan elvetve (indoklással).
