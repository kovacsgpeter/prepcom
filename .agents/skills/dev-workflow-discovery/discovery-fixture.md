# Discovery-fixture — átvételi próba

Ez egy **elkülönített, kitalált példa-ötlet** a `dev-workflow-discovery` skill (lásd
[`SKILL.md`](SKILL.md)) `light` és `full` módjának átvételi próbájához. Nem valódi
ticket, nem hivatkozik konkrét repóra vagy kódra — az ötlet szándékosan **nyers és
alulspecifikált**: a kitalált felhasználó maga sem tudja pontosan, mit akar, csak egy
homályos érzést fogalmaz meg.

A [`../../../ci/verify-discovery-config.sh`](../../../ci/verify-discovery-config.sh)
önellenőrző szkript ezt a fájlt gépileg annyiban ellenőrzi, hogy a "Várt minimum" szakasz
kizárólag a `SKILL.md`-ben **ténylegesen dokumentált** elem-/lencse-nevekre hivatkozik. A
tényleges interjú-viselkedés (hipotézis+tipp, "ne kérdezz vissza olyat, ami már megvan",
a negatív kimenetel érvényes lezárásként kezelése, a klaszterezés és a stressz-teszt
tényleges lefolyása) **manuális próba** (lásd `SKILL.md` "1. Ötlet-keretezés" és "2.
Alternatíva-generálás és stressz-teszt" szekció, illetve a `dev-workflow-scoping/SKILL.md`
"1. Kezdeti scope-felmérés" lépés discovery-hívása).

## Példa-ötlet (kitalált, szándékosan nyers)

**Kiinduló leírás (a felhasználótól):** "Valahogy jó lenne tudni, hogy a résztvevőknek
tetszett-e a wordcloud, amit a rendezvény végén generáltunk nekik. Nem tudom pontosan,
hogyan kellene ezt megcsinálni, csak érzésre jó lenne valamilyen visszajelzést kapni
tőlük, mielőtt eldöntjük, érdemes-e egyáltalán továbbfejleszteni ezt az egész
wordcloud-funkciót."

Ez a leírás szándékosan **nem tartalmazza**: a siker mércéjét, a kötő korlátokat, hogy mi
NEM tartozik bele, sem azt, hogy kik pontosan a szereplők (a szervező? a résztvevők? mind
a kettő?) — ezeket a `light` mód interjú-kérdéseinek kell kihoznia, kis kötegben,
hipotézis+tipp formában, anélkül hogy olyat kérdezne vissza, ami már ebből a leírásból is
kiolvasható (pl. hogy a wordcloud-funkcióról van szó, és hogy a kiváltó ok a
"megéri-e továbbfejleszteni" kérdés).

## Várt minimum — `light` mód

A `dev-workflow-discovery` skillnek a fenti ötletből a hét light-elem mindegyikét fel
kell hoznia és rögzítenie kell a Discovery Brief blokkban:

- **Problémaállítás (How Might We):** egy konkrét "Hogyan tudnánk...?" mondat, ami a
  "tetszett-e a résztvevőknek" bizonytalanságból indul ki.
- **Szereplők:** legalább a résztvevők és a szervező tisztázva, mint két különböző
  érintett kör.
- **Miért most:** a kiváltó ok explicit kimondva (a wordcloud-funkció
  továbbfejlesztéséről szóló döntés megalapozása).
- **Siker mércéje:** konkrét, a leírásból hiányzó mérce megkérdezve és rögzítve (pl.
  hány visszajelzés, milyen formában).
- **Kötő korlátok:** legalább egy konkrét korlát megkérdezve és rögzítve (pl. a
  rendezvény végén, a wordcloud megjelenítése után azonnal kell felajánlani).
- **Not doing:** legalább egy tudatosan kizárt irány, indoklással (pl. "nem építünk
  teljes, névvel azonosított elégedettség-felmérést, csak gyors, anonim jelzést").
- **Feltételezés-térkép:** mindhárom alpont kitöltve (mire fogadunk; mi dönthetné meg;
  mit hagyunk tudatosan figyelmen kívül).

## Várt minimum — `full` mód

`full` módban a fentiek mellett a `dev-workflow-discovery` skillnek legalább **5 irányt**
kell generálnia, **2-3 klaszterbe** rendezve, a `SKILL.md`-ben ténylegesen nevesített öt
lencse közül többet felhasználva — pl.:

- **Egyszerűsítés** — egyetlen emoji-alapú reakciógomb a wordcloud alatt, azonnali
  visszajelzésként.
- **Inverzió** — ahelyett hogy a résztvevőktől kérnénk visszajelzést, a szervező nézi meg
  utólag, kattintott-e valaki a letöltés/megosztás gombra (közvetett jelzés).
- **Constraint-elvétel** — ha nem kellene azonnalinak lennie, egy rövid, utólagos e-mailes
  mini-kérdőív is elég lehetne.
- **Közönségváltás** — ne a résztvevőktől, hanem a szervezőtől kérjünk visszajelzést arról,
  hogy a résztvevők reakciója alapján ő mit tapasztalt.
- **10x skálázás** — ha ez sok rendezvényen, sok résztvevővel menne, egy aggregált,
  rendezvények közötti trend-nézet érné meg, nem az egyedi visszajelzés.

A generált irányoknak **2-3 klaszterbe** kell rendeződniük (pl. "közvetlen, azonnali
jelzés" vs. "közvetett/utólagos jelzés" vs. "szervező-oldali mérés"), és a kiválasztott
(vagy kombinált) irányra irányonkénti stressz-tesztet kell futtatni a `SKILL.md`-ben
nevesített három szemponttal (valódi fájdalom, megvalósíthatóság a meglévő stackkel,
differenciáló érv).

## Negatív kimenetel is elfogadható próba

Ha az interjú/stressz-teszt során az derül ki, hogy egyetlen irány sem old meg valódi
fájdalmat (pl. a szervező jelzi, hogy ez csak "jó lenne, ha lenne" ötlet, tényleges döntés
emiatt eddig sem született), ez **is** érvényes, sikeres próba-kimenetel — a Discovery
Brief-nek ekkor indoklással kell rögzítenie a "nem érdemes megcsinálni" döntést, és a
folyamat nem léphet tovább a `dev-workflow-scoping` felé (lásd `SKILL.md` "Kilépési
feltétel").
