# Fenyegetés-modell — átvételi fixture

Ez egy **elkülönített, kitalált példa-story** a tervezésidejű fenyegetés-modell
(lásd [`threat-catalog.md`](threat-catalog.md)) átvételi próbájához. Nem valódi ticket,
nem hivatkozik konkrét repóra vagy kódra — kizárólag azt rögzíti, mit kell a
fenyegetés-modellnek felhoznia egy tipikus, több kockázati kategóriát érintő storynál.

A [`../../../ci/verify-threat-model-config.sh`](../../../ci/verify-threat-model-config.sh)
önellenőrző szkript ezt a fájlt gépileg annyiban ellenőrzi, hogy a "Várt minimum" szakasz
kizárólag a katalógusban **ténylegesen létező** kategórianevekre hivatkozik. A
"legalább három kategóriát felhoz" tényleges elvárás **manuális próba** (lásd
`dev-workflow-intake/SKILL.md` "2.c" lépés és a ticket Teszterv "Manuális" pontja).

## Példa-story (kitalált)

**Típus:** Story
**Cím:** Résztvevők tömeges importja táblázatból, névsor megjelenítéssel

**Kontextus:** A szervező egy rendezvényhez a résztvevőket egyesével viszi fel, ami
nagy létszámnál lassú. Szeretné, ha egy táblázat-fájlt (CSV vagy XLSX) feltöltve a
résztvevők egyszerre bekerülnének, és a feltöltés után egy névsor-nézeten látná az
importált neveket és megjegyzéseket.

**Acceptance Criteria (funkcionális, kivonat):**
1. A szervező feltölthet egy `.csv` vagy `.xlsx` fájlt a résztvevők adataival (név,
   e-mail, megjegyzés oszlopok).
2. Sikeres import után a rendszer visszajelzi az importált sorok számát.
3. A feltöltés után megnyíló névsor-nézet oszloponként listázza az importált neveket és
   megjegyzéseket.
4. Hibás szerkezetű sor esetén az import megáll, és a szervező látja, melyik sor volt
   hibás.

**Edge case-ek:** üres fájl; csak fejléc, adatsor nélkül; nagyon sok sor; ismétlődő
e-mail; a megjegyzés mezőben tetszőleges szabad szöveg.

## Várt minimum

A fenti storyból (fájlfeltöltés + tárolás + megjelenítés) a fenyegetés-modellnek
`checklist` **és** `hybrid` módban is legalább az alábbi három katalógus-kategóriát fel
kell hoznia, és mindegyikhez vagy javasolt biztonsági AC-t, vagy tudatosan vállalt
kockázatként rögzített indoklást kell adnia:

- Méret-, mennyiség- és rátakorlát hiánya
- Fájlfeltöltés és -feldolgozás
- Kimenet-kódolás és megjelenítés

`llm` módban ez a minimum **nem garantált** (a katalógus nélkül fut) — az átvételi
elvárás tudatosan csak a `checklist` és a `hybrid` stratégiára köt.

## Miért ez a három

- **Méret-, mennyiség- és rátakorlát hiánya** — a "tömeges import" és a "nagyon sok sor"
  edge case közvetlen kiváltó jel: kell felső korlát a fájlméretre és a sorok számára.
- **Fájlfeltöltés és -feldolgozás** — a `.csv`/`.xlsx` feltöltés és feldolgozás
  önmagában kiváltó jel: típus- és szerkezet-ellenőrzés a feldolgozás előtt.
- **Kimenet-kódolás és megjelenítés** — a szabad szöveges "megjegyzés" mező visszajelenik
  a névsor-nézeten, és tipikusan táblázat-exportba is kerülhet: kódolás a cél-kontextus
  szerint, képlet-injekció kizárása exportnál.

Jellemzően felmerül még a "Validálatlan input" (az oszlopok tartalma) és az "Érzékeny
adat tárolása, naplózása és továbbítása" (e-mail cím) kategória is — ezek felhozása
nem kötelező minimum, de helyes, ha a modell jelzi őket.
