---
name: gitlab-branch-review
description: Strukturált, csak-olvasó code review egy adott branch-en/merge requesten — vagy egy megadott Jira ticket szám alapján feloldott branch-en, vagy (ha nincs ticket szám megadva) a jelenleg checkoutolt branch-en. Elkészíti a review-t helyesség/tesztlefedettség/hibakezelés/biztonság/olvashatóság/konvenció szempontok szerint, súlyozott találatokkal, és jóváhagyás után soronkénti (inline diff) kommentekként **és** egy összesített kommentként is kiposztolja a hozzá tartozó GitLab merge requestre. Használd, ha a felhasználó azt mondja "reviewold le a [TICKET]-t", "futtass code review-t ezen a branch-en", "nézd át amit pusholtam", "code review kell erre az MR-re", vagy hasonlót — akár ticket szám megadásával, akár anélkül.
---

# GitLab branch/MR code review

Ez a skill **önállóan hívható**, nem függ a `dev-workflow-execute` állapotgéptől — nem
kell hozzá aktív ticket-pickup vagy folyamatban lévő implementáció. Ugyanakkor a review
kritériumai megegyeznek a `agents/code-reviewer.md` subagent szempontjaival,
hogy a két hely ne térjen el egymástól.

**Csak review-t készítesz, kódot nem módosítasz.** A kód tényleges átírása mindig külön,
jóváhagyás utáni lépés — ez a skill kizárólag olvas (git, GitLab, opcionálisan Jira) és
egy strukturált review-t posztol.

## Konfiguráció

Olvasd be előbb [`../dev-workflow/config.md`](../dev-workflow/config.md)-t (rövid, csak értékek; egy kulcs jelentése a [`../dev-workflow/config-reference.md`](../dev-workflow/config-reference.md) azonos című szakaszában — csak azt a szakaszt olvasd be, a referenciát egészben soha). Ebből
relevánsak:
- `REPO_MAP` — az alap branch (amihez a diffet képezzük) és a Jira project key forrása,
  ugyanazzal a feloldási logikával, mint a [`../jira-ticket/SKILL.md`](../jira-ticket/SKILL.md)
  "Célprojekt feloldása" lépésében: ha egy sor van, azt használd; ha több, a jelenlegi
  repo path alapján válassz; ha egyik sem egyértelmű, kérdezz rá — **ne találgass**
  alap branch-et vagy project key-t.
- `BRANCH_NAME_PATTERN` — a ticket kulcs branch-névből való kinyeréséhez (lásd lent).
- "AI-identitás" szekció — a 6. lépésben posztolt GitLab-kommentek ez alapján mennek ki
  az AI-user nevében, nem a te saját GitLab-fiókoddal.
- "CODE_REVIEW_DEFAULT_EFFORT értékek" — `medium` vagy `full` effort-szinten menj-e a "4.
  Review szempontok" lépésen (hacsak a felhasználó explicit nem kért más szintet — az
  felülírja a config.md szerinti alapértelmezést).

Ne írj be sehova szó szerint konkrét branch-nevet, project key-t vagy repo-utat ebbe a
fájlba — mindig a fenti configból told fel, hogy más repóba átmásolva ne kelljen ide
nyúlni, csak a configba.

## A folyamat

1. **Branch feloldása** (lásd lent) — ticket szám alapján vagy a jelenlegi branch.
2. **MR feloldása** (`glab mr list --source-branch=<branch>`) — ha nincs MR, jelezd és
   kérdezd meg, mehet-e a review MR/GitLab-komment nélkül (csak git diff alapján, csak
   chatben).
3. **Diff és kontextus begyűjtése** — MR-diff (ha van MR) vagy `git diff <alap>...<branch>`,
   plusz Jira AC-kontextus, ha a branch-névből kiolvasható egy ticket kulcs.
4. **Strukturált review elkészítése** a lenti szempontok szerint.
5. **Megmutatás és jóváhagyás** — mutasd meg a teljes review-t a chatben, kérj rövid
   megerősítést, mielőtt bármit posztolnál.
6. **GitLab komment** — jóváhagyás után, ha van MR, posztold soronkénti (inline diff)
   kommentekként a konkrét találatokhoz **és** egy összesített kommentként is.

## 1. Branch feloldása

- **Ha a felhasználó megadott egy Jira ticket számot** (pl. `PROJ-153`):
  1. `git fetch --all --quiet`, hogy a remote branch-ek is láthatók legyenek.
  2. Keress a `git branch -a` listában olyan branch-et, ami tartalmazza a ticket kulcsot
     (a `BRANCH_NAME_PATTERN` `{type}/{ticket_key}_{...}` szerint ez a második
     path-szegmens `/` után, `_` előtt).
  3. Ha pontosan egy találat van, azt használd. Ha **több** találat van, mutasd meg a
     listát és kérdezd meg, melyiket akarja. Ha **nincs** találat, jelezd, hogy nem
     találtál branch-et ehhez a ticket számhoz, és kérdezd meg a pontos branch-nevet.
- **Ha nincs megadva ticket szám**: a jelenlegi repo aktuális branch-e
  (`git branch --show-current`).
- Akárhogy is dőlt el, **mondd ki explicit**, melyik branch-en fogsz dolgozni, mielőtt
  továbblépnél.

## 2. MR feloldása (glab)

- `glab mr list --source-branch=<branch> --all` — keresd meg a branch-hez tartozó merge
  requestet.
- Ha **több** MR is van ugyanahhoz a branch-hez (pl. lezárt + új), az **open** státuszút
  részesítsd előnyben; ha ez sem egyértelmű, kérdezz rá.
- Ha **nincs** MR ehhez a branch-hez: jelezd ezt a felhasználónak, és kérdezd meg, hogy
  mehet-e a review pusztán `git diff` alapján, csak a chatben megjelenítve (GitLab-komment
  ekkor nyilván kimarad — nincs hova posztolni).

## 3. Diff és kontextus begyűjtése

- **Diff forrása**:
  - Ha van MR: `glab mr diff <branch>` — ez pontosan azt mutatja, ami az MR-ben van.
  - Ha nincs MR: `git diff <alap_branch>...<branch>`, ahol `<alap_branch>` a `config.md`
    `REPO_MAP`-jából feloldott alap branch.
- **Jira-kontextus** (opcionális, csak ha van ticket kulcs):
  - Ha a branch nevéből (vagy a felhasználó eredeti megadásából) kiolvasható egy ticket
    kulcs, a [`../dev-workflow-execute/tracker-adapter.md`](../dev-workflow-execute/tracker-adapter.md)
    "ticket beolvasása" műveletével olvasd be a ticket AC-jeit — ez adja a "helyesség"
    szempont alapját.
  - Ha nincs kiolvasható ticket kulcs, vagy a "ticket beolvasása" hitelesítési hibát ad, **ne állj
    el a review-tól** — folytasd általános (AC nélküli) code review-ként, és jelezd ezt
    explicit a review elején ("Nincs elérhető Jira AC-kontextus, általános review
    következik").
  - Ha van projekt-szintű `CLAUDE.md`, vedd figyelembe a benne rögzített konvenciókat
    (branch-elnevezés, teszt-parancs, Definition of Done) a "konvenciók" szemponthoz.
  - Ha az érintett réteghez létezik `Státusz: jóváhagyott` `docs/best-practices-<slug>.md`
    fájl (pl. `docs/best-practices-angular.md`, `docs/best-practices-java-spring.md`),
    olvasd be azt is a "konvenciók" szemponthoz — `draft` státuszú fájlt hagyj figyelmen
    kívül, hiányzó fájl esetén ne akadj el.

## 4. Review szempontok

Menj végig ezeken, AC-nként (ha van AC-kontextus) és általánosan is:
- **Helyesség** — a kód tényleg azt csinálja, amit az AC előír (ha van AC)? Van olyan
  eset, amit az AC lefed, de a kód nem kezel?
- **Tesztlefedettség** — minden AC-hez (vagy, AC hiányában, minden érdemi
  viselkedés-változáshoz) van automata teszt? A tesztek tényleg a viselkedést
  ellenőrzik, nem csak lefutnak?
- **Hibakezelés / edge case-ek** — null/üres input, hálózati hiba, race condition,
  jogosultsági eset stb.
- **Biztonság** — input-validáció, secret-ek nincsenek kódba égetve, jogosultság-ellenőrzés
  megvan-e.
- **Olvashatóság / karbantarthatóság** — elnevezések, függvényméret, duplikáció, felesleges
  komplexitás.
- **Konvenciók** — megfelel-e a `CLAUDE.md`-ben (ha van) rögzített stílusnak/mintáknak,
  és — ha van hozzá `jóváhagyott` státuszú fájl — az érintett réteg
  `docs/best-practices-<slug>.md` kivonatának (lásd fent "3. Diff és kontextus
  begyűjtése").

## 5. Kimeneti formátum

**Effort-szint szerinti szűrés** (`CODE_REVIEW_DEFAULT_EFFORT`, lásd `config.md`
"CODE_REVIEW_DEFAULT_EFFORT értékek"): `full` esetén minden alább talált észrevétel
bekerül, súlyosságtól függetlenül (a mai, kapcsoló előtti viselkedés). `medium` esetén
csak a **blocker/major** észrevételek, **plusz** az egyértelmű, nem vitatható minor/
nitpick tételek kerülnek a listába — a spekulatív minor/nitpick találatokat hagyd ki.

Minden (a fenti szűrésen átjutó) észrevételt ebben a formában sorolj fel:

```
### 🔍 Review észrevétel
**Fájl / sor:** <path:line>
**Kategória:** helyesség / tesztlefedettség / hibakezelés / biztonság / olvashatóság / konvenció
**Probléma:** <mit találtál>
**Javasolt javítás:** <konkrét, alkalmazható javaslat — ha releváns, kódrészlettel>
**Súlyosság:** blocker / major / minor / nitpick
```

A végén adj egy **összesített döntést**:
- ✅ **Elfogadva** — nincs blocker/major észrevétel, mehet tovább
- ⚠️ **Javítással elfogadható** — csak minor/nitpick észrevételek, de érdemes megfontolni
- ❌ **Javításra szorul** — van blocker/major észrevétel, ezeket mielőbb kezelni kell

## 6. Megmutatás, jóváhagyás, GitLab komment

- Mutasd meg a teljes, összesített review-t a chatben (minden észrevétel + döntés).
- Kérj rövid megerősítést ("posztoljam a GitLab MR-re?"), mielőtt bármit kiposztolnál —
  a review megjelenítése a chatben mindig megtörténik, a GitLab-posztolás **csak
  jóváhagyás után**.
- Ha van MR és a felhasználó jóváhagyta, posztold **kétféleképp együtt**:
  1. **Soronkénti (inline diff) komment minden olyan blocker/major (opcionálisan
     minor) észrevételhez, aminek van konkrét `<path:line>` hivatkozása**:
     ```
     bash .claude/skills/dev-workflow/scripts/glab-note-as-ai.sh mr note create <branch> --file <path> --line <line> -m "<az adott
     észrevétel szövege>"
     ```
     Törölt/régi oldali sornál `--old-line`-t használj `--line` helyett, tartományhoz
     `--line 10:15` formátumot. ⚠️ Ez a `glab` funkció **kísérleti** (a `glab mr note
     create --help` szerint "not ready for production use", bármikor instabillá
     válhat/eltűnhet) — ha egy hívás hibázik, ne állj le, csak jegyezd fel, melyik
     találatnál nem sikerült, és a 2. pont összesített kommentje úgyis tartalmazza.
  2. **Egy összesített komment mindig**, az összes találattal és a döntéssel (ez a
     korábbi, egyetlen viselkedés — most az inline kommentek *mellett* fut, nem
     helyettük):
     ```
     bash .claude/skills/dev-workflow/scripts/glab-note-as-ai.sh mr note create <branch> --unique -m "<a teljes review markdown szövege>"
     ```
     A `--unique` flag megakadályozza, hogy ismételt futtatásnál duplikált komment
     keletkezzen ugyanazzal a tartalommal. Mindkét hívás a `GITLAB_TOKEN_AI`-vel
     hitelesített AI-user nevében posztol, lásd `config.md` "AI-identitás" szekció.
  - Nitpick-szintű találatokhoz ne hozz létre külön inline kommentet — elég az
    összesítettben, hogy elkerüld a komment-spamet.
  - **Inline komment-korlát**: egy posztolásban legfeljebb a `config.md` "GitLab-API
    terhelés" táblájának `CODE_REVIEW_MAX_INLINE_COMMENTS` értéke (alapérték 5) inline
    kommentet hozz létre, súlyosság szerinti sorrendben (blocker, major, ...). A korláton
    túli találat csak az összesített kommentben szerepel, és jelezd benne, hogy a korlát
    miatt nem kapott inline kommentet. `0` esetén csak az összesített komment készül.
    Minden komment egy külön GitLab-kérés, a túl sok a rate limitet (429) eléri.
- Ha nincs MR (lásd 2. lépés), csak a chatben mutasd meg a review-t, és mondd ki, hogy
  GitLab-komment MR hiányában nem történt.
- A posztolás után add vissza a komment(ek)/MR linkjét a felhasználónak, és jelezd, hány
  inline komment sikerült ténylegesen soronkénti diff-kommentként.

## Kilépési feltétel

Ez a skill soha nem módosít kódot és nem hoz létre/zár le MR-t vagy ticketet — kizárólag
review-t készít, és (jóváhagyás után) soronkénti + összesített kommentet posztol egy már
létező GitLab merge requestre. Ha a felhasználó a talált problémák tényleges javítását
kéri, azt jelezd külön lépésként, ne ess bele automatikusan a kódmódosításba.
