# Candidate env védelem — egyszeri, kézi GitLab-admin beállítás (COCALC-339)

Ez a fájl **nem hot-path olvasmány** — egyetlen skill sem olvassa be futás közben, és
**nem is automatizálható CI-configból**. Ez egy emberi útmutató, tisztán GitLab UI/
admin-teendő: ha végigcsinálod, egy véletlen kattintás (pl. valaki lenyomja a
`stop-candidate-env` vagy `promote-to-test-env` manuális gombját, akinek ehhez nem
kellene jogosultsága legyen) nem tudja idő előtt leállítani/felülírni a candidate,
illetve a közös `:4200` teszt-envet.

> ℹ️ **Miért releváns most**: a `CANDIDATE_ENV_LIFETIME` alapértéke COCALC-339-cel
> `pipeline`-ról `mr-open`-ra váltott (lásd `config.md` "`CANDIDATE_ENV_LIFETIME` — a
> candidate env élettartama" szekció) — a candidate env mostantól alapból túléli a
> pipeline-t, tehát tovább van kitéve annak, hogy valaki véletlenül leállítsa, mielőtt a
> reviewer megnézte volna. Ez a ticket **csak dokumentálja** a lenti admin-lépést, **nem
> kényszeríti ki** — a beállítást a GitLab admin/Maintainer végzi el egyszer, kézzel.

## A lépés: Protected Environments a `candidate/*` mintára

1. A cél **GitLab projekt** → **Settings → CI/CD → Protected environments**.
2. **Environment**: add meg a `candidate/*` mintát (wildcard — minden
   `candidate/<MR-IID>` dinamikus environmentre vonatkozik, nem kell MR-enként külön
   felvenni).
3. **Allowed to deploy**: szűkítsd **Maintainers**-re (vagy egy dedikált, kis
   csoportra) — ez vonatkozik mind a deploy-ra (`open-candidate-env`,
   `frontend-deploy`/`backend-deploy` candidate-ága), mind a **stop**-ra
   (`stop-candidate-env`, `environment: action: stop`). GitLab verziótól függően külön
   "Allowed to deploy" és "Approvers"/"Required approvals" mező is lehet — ha van
   "Required approvals", azt hagyd `0`-n, hacsak nem akarsz explicit jóváhagyási kört
   minden candidate-deploy elé (ez a ticket csak a jogosultság-szűkítést kéri, nem a
   jóváhagyási workflow-t).
4. Ismételd meg a `production` environmentre is (ha még nincs védve) — ez a
   `promote-to-test-env` (`environment: name: production`) jogosultságát szűkíti, ami a
   közös `:4200` teszt-envet írja felül. Enélkül bárki, akinek van MR-hez hozzáférése,
   egy kattintással felülírhatná a megosztott teszt-envet egy még nem review-zott
   candidate build-del.
5. Mentsd el, majd teszteld: egy nem-Maintainer szerepkörű teszt-userrel (vagy egy másik
   projekttag fiókjával) nyiss egy eldobható MR-t, és ellenőrizd, hogy a
   `stop-candidate-env` / `promote-to-test-env` manuális gombja számára **nem**
   kattintható (vagy kattintás után jogosultság-hibát ad).

## Mit NEM old meg ez a lépés

- **Nem** akadályozza meg, hogy egy Maintainer véletlenül kattintson — csak azt szűkíti,
  *ki* kattinthat egyáltalán. Ha ennél szigorúbb védelem kell (pl. kötelező jóváhagyás
  minden candidate-stopra), az a fenti 3. pont "Required approvals" mezőjével bővíthető
  — ez a ticket (COCALC-339) ezt nem követeli meg.
- **Nem** helyettesíti az `auto_stop_in: 3 days` időalapú tartalék-GC-t (lásd
  `config.md` "`mr-open` + `on_stop` korlát" figyelmeztetése) — az a runner-offline
  esetre véd, ez a lépés a jogosulatlan/véletlen kattintásra.
- **Nem** verziózható/nem automatizálható — GitLab projekt-beállítás, nincs
  `.gitlab-ci.yml`-ből vagy más repo-fájlból kikényszeríthető megfelelője.
