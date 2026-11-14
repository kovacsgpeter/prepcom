# Definition of Ready checklist (típus-független alapstruktúra)

Ezt a fájlt a [`SKILL.md`](SKILL.md) hivatkozza az interjú checklistjeként. Eszköz- és
projekt-független — ha egy konkrét projektnek további, saját kritériumai vannak, azokat a
hívó skill (pl. a dev-workflow `intake/SKILL.md`) egészítse ki, ne írja át ezt a fájlt
projekt-specifikusra.

A típus (Story / Bug / Task) meghatározása az első lépés — ha nem egyértelmű a
bemenetből, kérdezz rá kötelezően, mert ez szabja meg a további checklistet.

## Story
- **Cím** — rövid, felhasználói szempontú
- **Kontextus / "miért"** — milyen problémát old meg, kinek, miért most
- **Érintett réteg(ek)** — frontend / backend / mindkettő. Ha mindkettő, ez jelzi, hogy a
  ticketből FE/BE split lesz (lásd a dev-workflow `jira-ticket-template.md` "FE/BE split
  esetén" szekcióját) — ne hagyd nyitva, kérdezz rá, ha nem egyértelmű.
- **Technológia / architektúra** — melyik konkrét nyelv/framework/adattárolás érintett
  rétegenként (pl. "Angular" nem elég, ha a repóban több FE-stack is elképzelhető lenne).
  Ha az érintett repóban **már van kialakult konvenció** (meglévő forráskód, build/manifest
  fájl — pl. `package.json`, `pom.xml`, `angular.json`), ellenőrizd azt, és csak
  megerősítésre kérdezz rá a felhasználótól ("ez a repo Angular/Java-t használ, ez alapján
  megyünk?"). Ha a repó **üres vagy új** (nincs még kialakult stack), ez zöldmezős döntés —
  **kötelezően kérdezz rá explicit**: frontend framework, backend nyelv/framework,
  adattárolás típusa, és van-e speciális hosting/deploy elképzelés vagy meglévő
  shared-komponens-könyvtár, amit újra kell használni. Ne találgass és ne örökölj csendben
  egy másik projekt konvencióját anélkül, hogy megerősítetted volna.
- **Acceptance criteria** — konkrét, ellenőrizhető lista (min. 2-3 tétel). Formátum és
  jelölés minden tételnél:
  - **Given/When/Then csak ott kötelező, ahol a tétel tényleg viselkedést/folyamatot ír
    le** (pl. "Given bejelentkezett felhasználó, When rossz jelszót ad meg, Then
    hibaüzenet jelenik meg az email mező alatt"). Egyszerű, strukturális/tartalmi
    kritériumoknál (pl. "a form mezői: email, jelszó, 'Emlékezz rám' checkbox") elég egy
    sima, ellenőrizhető mondat — ne erőltess rá mesterséges Given/When/Then-t.
  - **Minden tétel végére írj egy verifikációs jelölést zárójelben**: `(automata)`,
    `(manuális)` vagy `(mindkettő)` — aszerint, hogy automata (unit/integrációs) teszttel,
    csak böngészőben/manuálisan, vagy mindkettővel ellenőrizhető. Erre épül közvetlenül a
    dev-workflow `implementer` subagentje (mihez írjon automata tesztet) és a `qa-tester`
    subagentje (mit néz meg böngészőben).
  - **Méret-figyelmeztetés**: ha a lista **8 tételnél hosszabbra nőne**, és a tételek
    logikailag szét is választhatók (pl. két különböző user-flow keveredik bele egy
    story-ba), állj meg, és jelezd a felhasználónak, hogy ez valószínűleg **több különálló
    story** — javasold, hogy a `dev-workflow-scoping` skillel bontsák szét, mielőtt tovább
    mennétek egy ticketként. Ne döntsd el egyedül — kérdezd meg, akarja-e a bontást, vagy
    tudatosan egyben tartja.
- **Edge case-ek** — hibás input, üres állapot, jogosultság hiánya stb. (külön szekció,
  nem az AC lista része — de minden ide felvett edge case-hez érdemes eldönteni, kell-e
  hozzá is külön AC, ha ellenőrizhető állítás)
- **API-kontraktus** — ha releváns: endpoint, request/response váz, hibakódok
- **UI-referencia** — ha van vizuális bemenet (kép/Figma/draw.io), hivatkozz rá konkrétan (melyik elem mit csinál)
- **Teszterv** — foglald össze az AC-listában megjelölt `(automata)`/`(manuális)`/
  `(mindkettő)` jelölések alapján, mit fed le összesítve az automata teszt-kör, és mit
  kell böngészőben végigmenni; ha van speciális teszt-adat vagy környezet-előkészítés
  igénye, azt is itt említsd. Ez a mező kerül át változtatás nélkül a ticket "Teszterv"
  szekciójába, és ez alapján dolgozik a dev-workflow `qa-tester` subagentje.
- **Függőségek** — blokkol/blokkolva van-e mástól

## Bug
- **Cím** — mi romlott el, tömören
- **Reprodukciós lépések** — számozott lista
- **Elvárt vs. tényleges viselkedés**
- **Érintett réteg(ek)** — frontend / backend / mindkettő (melyik repóban van a hiba, vagy
  hol látszik és hol a valódi oka, ha eltér)
- **Környezet** — verzió, platform, environment
- **Súlyosság** — kritikus / közepes / kisebb, van-e workaround
- **Bizonyíték** — log, screenshot, error message, ha van
- **Teszterv** — hogyan igazolható, hogy a hiba javítva van (a reprodukciós lépések alapján
  ismételve), és kell-e hozzá új regressziós teszt

## Task
- **Cím** — a konkrét elvégzendő munka
- **Érintett réteg(ek)** — frontend / backend / mindkettő / nem kód-szintű (ha releváns)
- **Technológia / architektúra** — ha kód-szintű és a repó/terület stackje nem egyértelmű,
  ugyanúgy tisztázd, mint a Story "Technológia / architektúra" pontjánál fentebb
- **"Done" definíció** — ez a task acceptance criteria-ja, ne maradjon üres; ha listaszerű,
  ugyanazt a formátum- és verifikációs-jelölés elvet kövesd, mint a Story "Acceptance
  criteria" pontjánál (Given/When/Then csak ahol indokolt, `(automata)`/`(manuális)`/
  `(mindkettő)` jelölés tételenként)
- **Kontextus** — miért kell, mihez kapcsolódik
- **Teszterv** — hogyan ellenőrizhető, hogy a "Done" definíció teljesült
- **Függőségek**

Ha egy pont nyilvánvalóan nem releváns (pl. nincs API-érintettség), mondd ki a
feltételezést, és lépj tovább — ne erőltesd a kérdést.
