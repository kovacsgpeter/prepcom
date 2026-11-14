# Fixture config (ORD-382)

| Logikai név | Repo path/URL | Alap branch | Jira project key |
|---|---|---|---|
| `app` | `grp/proj` | `master` | `APP` |

| Kapcsoló | Érték | Jelentés |
|---|---|---|
| `TICKET_NATURE_TAGS` | `feature`, `fix`, `build`, `refactoring`, `chore` | jelleg |
| `BRANCH_NAME_PATTERN` | `{type}/{ticket_key}_{harom_szavas_osszefoglalo}` | branch-név |
| `CI_READINESS_CHECK` | `on` | ellenőrzés |
