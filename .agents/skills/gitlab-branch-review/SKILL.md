---
name: gitlab-branch-review
description: Strukturált, csak-olvasó code review egy adott branch-en/merge requesten — vagy egy megadott Jira ticket szám alapján feloldott branch-en, vagy (ha nincs ticket szám megadva) a jelenleg checkoutolt branch-en. Elkészíti a review-t helyesség/tesztlefedettség/hibakezelés/biztonság/olvashatóság/konvenció szempontok szerint, súlyozott találatokkal, és jóváhagyás után valódi GitLab review-ként, soronkénti draft diff-kommentekkel és a döntésnek megfelelő reviewer state-tel publikálja. Használd, ha a felhasználó azt mondja "reviewold le a [TICKET]-t", "futtass code review-t ezen a branch-en", "nézd át amit pusholtam", "code review kell erre az MR-re", vagy hasonlót — akár ticket szám megadásával, akár anélkül.
---

# GitLab branch/MR code review

Ez a skill **önállóan hívható**, nem függ a `dev-workflow-execute` állapotgéptől — nem
kell hozzá aktív ticket-pickup vagy folyamatban lévő implementáció. Ugyanakkor a review
kritériumai megegyeznek a `dev-workflow-execute/code-reviewer.md` subagent szempontjaival,
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
- `AI_GITLAB_USERNAME`, `AI_GITLAB_TOKEN_ENV_VAR` és a
  `.agents/skills/dev-workflow/scripts/glab-note-as-ai.sh` wrapper — minden review-
  publikálást ezen keresztül végezz, hogy a GitLab-művelet a konfigurált AI-felhasználóhoz
  tartozzon. Ha az AI-token nem érhető el, állj meg és kérj jóváhagyást a felhasználói
  identitásra való visszaeséshez.

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
6. **GitLab review** — jóváhagyás után, ha van MR, készíts draft inline diff-note-okat,
   majd egyetlen review-ként publikáld őket az összesítéssel és a döntésnek megfelelő
   reviewer state-tel.

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
    kulcs, hívd meg `getAccessibleAtlassianResources`-t (cloudId), majd `getJiraIssue`-t a
    ticket AC-jeinek beolvasásához — ez adja a "helyesség" szempont alapját.
  - Ha nincs kiolvasható ticket kulcs, vagy a Jira-hívás hitelesítési hibát ad, **ne állj
    el a review-tól** — folytasd általános (AC nélküli) code review-ként, és jelezd ezt
    explicit a review elején ("Nincs elérhető Jira AC-kontextus, általános review
    következik").
  - Ha van projekt-szintű `AGENTS.md`, vedd figyelembe a benne rögzített konvenciókat
    (branch-elnevezés, teszt-parancs, Definition of Done) a "konvenciók" szemponthoz.

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
- **Konvenciók** — megfelel-e a `AGENTS.md`-ben (ha van) rögzített stílusnak/mintáknak.

## 5. Kimeneti formátum

Minden észrevételt ebben a formában sorolj fel:

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

## 6. Megmutatás, jóváhagyás, GitLab review

- Mutasd meg a teljes, összesített review-t a chatben (minden észrevétel + döntés).
- Kérj rövid megerősítést ("posztoljam a GitLab MR-re?"), mielőtt bármit kiposztolnál —
  a review megjelenítése a chatben mindig megtörténik, a GitLab-posztolás **csak
  jóváhagyás után**.
- Ha van MR és a felhasználó jóváhagyta, a GitLab
  [Draft Notes API](https://docs.gitlab.com/api/draft_notes/) használatával egyetlen,
  összefogott review-t publikálj. Az alábbi összes író `glab api` és fallback
  `glab mr note create` hívást a
  `bash .agents/skills/dev-workflow/scripts/glab-note-as-ai.sh ...` wrapperen keresztül
  futtasd:
  1. Kérd le az MR diff refjeit (`base_sha`, `start_sha`, `head_sha`), a meglévő
     discussionöket és a saját draft note-okat. Ha más, korábban létrehozott saját
     draft is van, **ne** hívd meg a `bulk_publish` végpontot, mert az mindet
     publikálná; mutasd meg őket és kérj döntést. Ha ugyanaz a finding már szerepel
     ugyanazon a fájlon/soron egy lényegében azonos discussionben, ne duplikáld, csak
     hivatkozz rá az összesítésben.
  2. Minden konkrét sorhoz köthető blocker/major (opcionálisan minor) findingot hozz
     létre publikálatlan diff note-ként:
     `POST /projects/:id/merge_requests/:iid/draft_notes`. A `position` objektum
     tartalmazza a három diff SHA-t, az `old_path`/`new_path` mezőket,
     `position_type: text` értéket és a megfelelő `new_line` vagy `old_line` mezőt.
     Az AI-wrapperen át hívott `glab api` használatakor a teljes `position` objektumot egyetlen JSON értékként
     add át (`--field "position=$positionJson"`); a különálló
     `position[base_sha]` alakú flagek ennél a kliensnél általános note-ot
     eredményezhetnek.
  3. Minden létrehozott draft válaszában ellenőrizd, hogy a `position.new_path` és a
     várt sor nem `null` és pontosan egyezik a finding helyével. Hibás pozíciónál ne
     publikálj: töröld kizárólag az adott futásban létrehozott hibás saját draftot,
     javítsd a payloadot, majd ellenőrizd újra.
  4. Egyetlen
     `POST /projects/:id/merge_requests/:iid/draft_notes/bulk_publish` hívással
     publikáld a draftokat. A `note` legyen a teljes összesítés. A `reviewer_state`
     értéke:
     - `requested_changes`, ha a döntés ❌ **Javításra szorul**;
     - `reviewed`, ha a döntés ⚠️ **Javítással elfogadható** vagy ✅ **Elfogadva**.
     A `reviewed` nem formális approval; `glab mr approve` csak akkor fusson, ha a
     felhasználó azt külön jóváhagyta.
  5. Nitpick-szintű findinghoz ne hozz létre külön inline note-ot — elég az
     összesítésben, hogy elkerüld a komment-spamet.
  6. **Inline korlát**: egy review-ban legfeljebb a `config.md` "GitLab-API terhelés"
     táblájának `CODE_REVIEW_MAX_INLINE_COMMENTS` értéke (alapérték 5) draft diff note
     készüljön, súlyosság szerinti sorrendben (blocker, major, ...). A korláton túli
     finding csak az összesítésben szerepel, és jelezd benne, hogy a korlát miatt nem kapott
     inline note-ot. `0` esetén csak az összesítés (`note`) publikálódik. Minden draft note
     külön GitLab-kérés, a túl sok a rate limitet (429) eléri.
- Ha a Draft Notes API vagy a `reviewer_state` nem támogatott, ne állítsd, hogy valódi
  review vagy Request changes készült. Jelezd a korlátot, és csak külön felhasználói
  jóváhagyással ess vissza az AI-wrapperen át futtatott azonnali
  `glab mr note create --file ... --line ...` inline threadekre és az összesített
  kommentre.
- Ha nincs MR (lásd 2. lépés), csak a chatben mutasd meg a review-t, és mondd ki, hogy
  GitLab-komment MR hiányában nem történt.
- A publikálás után olvasd vissza a discussionöket és a reviewer state-et. Add vissza
  az MR linkjét, az inline diff-threadek számát és a tényleges review outcome-ot
  (`requested_changes` vagy `reviewed`).

## Kilépési feltétel

Ez a skill soha nem módosít kódot és nem hoz létre/zár le MR-t vagy ticketet — kizárólag
review-t készít, és (jóváhagyás után) draft inline note-okkal valódi review-ként
publikálja egy már létező GitLab merge requestre. Ha a felhasználó a talált problémák tényleges javítását
kéri, azt jelezd külön lépésként, ne ess bele automatikusan a kódmódosításba.
