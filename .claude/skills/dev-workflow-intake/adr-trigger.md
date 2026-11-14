# dev-workflow-intake — 2.e — ADR-trigger (architektúra-jellegű döntés azonosítása): részletek

Az [`SKILL.md`](SKILL.md) „2.e — ADR-trigger (architektúra-jellegű döntés azonosítása)” lépéséből kiszervezve (ORD-498): csak akkor olvasd be,
ha a „Hogyan szűr” legalább egy architektúra-jellegű jelet talált. A szöveg változatlan; a lépésszámok a `SKILL.md`-re vonatkoznak.

## Hogyan kérdez

Minden azonosított döntési pontra **külön, explicit** jóváhagyást kérj — nincs
`notify`/`auto` szint, ez mindig `ask`-szerű viselkedés, függetlenül a `WORKFLOW_PROFILE`
értékétől. Fogalmazd meg röviden, mi a döntés (leendő ADR-cím szintjén), és kérdezz
igen/nem formában: *"Ez architektúra-jellegű döntésnek tűnik — felírjam ADR-ként a
Confluence-be?"*

Jóváhagyás esetén:
1. Nézd meg a `config.md` `CONFLUENCE_ADR_PARENT_ID` alatti meglévő al-oldalak listáját
   (Confluence MCP-vel) — a **folytatólagos sorszám** a meglévő `ADR-####` címek közül a
   legnagyobb szám **+1** (lásd `adr-template.md` "Sorszámozás és oldalcím" — a sorszám
   soha nem szabadul fel újra, `superseded` oldalak sorszáma is számít a maximumba). Ha
   nincs egyetlen meglévő ADR-oldal sem, a sorszám `ADR-0001`.
2. Töltsd ki az [`../dev-workflow/adr-template.md`](../dev-workflow/adr-template.md)
   nyolc kötelező szekcióját angolul (lásd `config.md` "WORKING_LANGUAGE" szekció
   kivétele) — Status alapból `proposed`, kivéve, ha a felhasználó explicit jelzi, hogy a
   döntés már véglegesnek/elfogadottnak tekintendő (`accepted`); a "Related tickets"
   szekcióba a jelenlegi (vagy granuláris bontásnál a szülő) ticket kulcsa kerül.
3. Hozd létre az oldalt a `CONFLUENCE_SPACE_KEY` space-ben, a `CONFLUENCE_ADR_PARENT_ID`
   alatt, `ADR-<sorszám>: <rövid, leíró cím>` címmel.
4. A tracker "komment írása" műveletével rögzíts egy rövid Jira-kommentet a ticketen az
   új ADR linkjével és sorszámával — ez adja a kétirányú megtalálhatóságot (ticket → ADR
   és ADR → ticket a "Related tickets" szekción keresztül).

## Az elvetett döntés nyoma

Ha a felhasználó egy azonosított döntési pontra **elutasítja** az ADR-létrehozást, **nem**
keletkezik Confluence-oldal, de a döntés nem tűnhet el nyomtalanul — egymondatos
indoklással bekerül a ticket egyik meglévő mezőjébe:

- **"## Boundaries"** ("Mindig csináld" alpont), ha a döntés maga véglegesnek tűnik, csak
  a Confluence-dokumentáció igénye hiányzik (pl. "nem kell külön ADR, ez házon belüli
  konvenció, de kövessük ezt mostantól").
- **"## Open Questions"** ("tudatosan nyitva hagyva" jelöléssel), ha maga a döntés is
  bizonytalan/vitatott, és később még felülvizsgálandó.

Ez a mező-választás a jóváhagyó jelzésétől függ — ha kétséges, kérdezz rá, melyik
illik jobban.
