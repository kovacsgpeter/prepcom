# dev-workflow-execute — környezet-ellenőrzés (0. lépés részletei)

Ezt a fájlt a [`SKILL.md`](SKILL.md) csak akkor olvassa be, ha a `config.md` "Jira
automatizálás" táblázatában van még `❓ nincs megerősítve` flag, **vagy** a CI-készenlét
ellenőrzés még nem futott (`CI_READINESS_CHECK` nem `off`, és a `CI_READINESS_CHECKED`
értéke `-`). Ha mind a négy flag már `true`/`false`, és a CI-készenlét ellenőrzés kész vagy
kikapcsolt, ez a fájl feleslegessé válik, nem kell beolvasni. Az alábbi Jira-kérdések csak
a `❓` flagekre vonatkoznak; a "CI-készenlét (egyszeri)" szakasz a fájl végén van.

Kérdezd meg a felhasználót **egy kötegben**, ne egyenként, csak azokra a flag-ekre, amik
még `❓` állapotúak:

> *"Mielőtt elindítom a workflow-t — be van-e állítva nálatok Jira/GitLab oldalon
> valamelyik a `jira-automation-setup.md`-ben leírt automatizálások közül? (1) MR-merge
> → automatikus Jira `Done`; (2) branch-létrehozás → automatikus `In Progress`; (3)
> web-design/design-review ticket → automatikus kezdőállapot létrehozáskor; (4) van-e
> közvetlen Jira workflow-él `first_review_done`→`second_review_requested` között? Ha
> egyikre sem, mondd, hogy 'nincs', és mind a négyet `false`-ra állítom, marad a
> jelenlegi kézi működés."*

A válasz alapján **szerkeszd a `config.md` fájlt közvetlenül** (Edit tool-lal): minden
érintett sorban a `❓ nincs megerősítve` értéket írd át `true`-ra vagy `false`-ra. Ha a
felhasználó bizonytalan/nem tudja ("nem tudom", "majd megnézem") egy adott pontnál, azt
a flaget írd `false`-ra (biztonságos alapállapot, ugyanaz, mint a jelenlegi kézi
működés) — ne blokkolj a bizonytalanságon, és ne kérdezz vissza rá újra ugyanebben a
session-ben. Ezután soha többé ne kérdezz rá ugyanarra a flagre — a `config.md`
innentől az igazságforrás, ez a fájl feleslegessé válik.

## CI-készenlét (egyszeri)

Feltétel: a `CI_READINESS_CHECK` nem `off`, és a `CI_READINESS_CHECKED` értéke `-` (még nem futott).

Futtasd a repó gyökeréből: `bash .agents/skills/dev-workflow/scripts/check-ci-readiness.sh`
(a szkript csak olvas, a `REPO_MAP` minden repójára ellenőrzi a runnert és a CI-tageket, a védett
branch-mintákat és a compute-perc keretet).

- **Kilépőkód 0** (hibátlan, `FIGYELMEZTETÉS` lehet): mutasd meg röviden a figyelmeztetéseket, és a `config.md`
  `CI_READINESS_CHECKED` sorában a `-` értéket írd át a mai dátumra (`ÉÉÉÉ-HH-NN`, Edit tool).
- **Kilépőkód 1** (`HIBA`): mutasd meg a teljes kimenetet a javítási sorokkal, a dátumot **ne** írd be, és a
  futás addig megáll, amíg a felhasználó nem dönt: javítás után újrafuttatás, vagy kifejezett tovább-engedés
  (ekkor a dátum bekerül).
- **Kilépőkód 2** (használati hiba): jelezd, és a lépés ne akassza meg a futást.
