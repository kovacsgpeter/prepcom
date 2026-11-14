# Retry- és eszkalációs logika (közös referencia)

Ezt a fájlt az [`execute/SKILL.md`](SKILL.md) három pontja használja: A7b (helyi qa-tester
javítókör), 9. lépés (code review javítókör) és A8b (teszt-env hiba, közvetlen eszkaláció
retry nélkül).

## Konfiguráció

Olvasd be előbb [`../dev-workflow/config.md`](../dev-workflow/config.md)-t (rövid, csak értékek; egy kulcs jelentése a [`../dev-workflow/config-reference.md`](../dev-workflow/config-reference.md) azonos című szakaszában — csak azt a szakaszt olvasd be, a referenciát egészben soha). Ez a fájl a `MAX_LOCAL_FIX_RETRIES` és
`MANUAL_DEV_ASSIGNEE` változókat használja.

## Javítókör mechanika (A7b és 9. lépés)

Mindkét kapunak **saját, egymástól független számlálója** van (ne oszd meg a kettő
között), de mindkettő ugyanazt a `MAX_LOCAL_FIX_RETRIES` limitet olvassa a
`config.md`-ből.

1. Az adott kapu (qa-tester AC-check vagy code-reviewer) talál blocker/major problémát.
2. Számláló +1 (első kör = 1).
3. Ha a számláló **a limiten belül van**: az `implementer` subagentet **`execute` móddal,
   terv-kör nélkül** hívd (a talált blocker/major problémalista már önmagában elég szűk
   scope, nem kell hozzá külön `plan` jóváhagyás — lásd `SKILL.md` A6). Javítja a kódot a
   talált problémák alapján, majd a kapu újra lefut (qa-tester újra ellenőriz /
   code-reviewer újra review-z).
4. Ismételd, amíg a kapu zöldre nem vált, vagy a számláló el nem éri a limitet.
5. Ha a limit **elérve** és még mindig van nyitott blocker/major: lásd "Eszkaláció"
   szekció lent — de a kód pusholása/MR-je **ekkor is megtörténik** (nem blokkoljuk a
   push-t, csak jelöljük, hogy kézi javítás kell).

Minor/nitpick szintű találatok **soha nem** számítanak bele a retry-be — ezeket csak
Jira kommentbe/ticketre írd fel, ne blokkold miattuk a folyamatot.

## Eszkaláció — push/MR jelölés (csak A7b és 9. lépés kimerülésekor)

- A commit üzenetbe és/vagy a PR/MR leírásába kerüljön be egyértelműen: **"⚠️ Manuális
  javítás szükséges"** + rövid indoklás (melyik kapu nem ment zöldre, hányadik körben állt
  meg).
- Ez nem akadályozza meg a push-t/MR-t — a cél, hogy bárki, aki ránéz a PR-ra, azonnal
  lássa, hogy nem minden automata ellenőrzés ment át.

## Fix-ticket létrehozása (A7b, 9. lépés és A8b közös formátuma)

Hozz létre egy új Jira ticketet a [`../dev-workflow/jira-ticket-template.md`](../dev-workflow/jira-ticket-template.md)
sablon szerint. Két külön mező van, ne keverd össze:

- **Jira issue type**: `Bug` (a `config.md` `JIRA_ISSUE_TYPE_MAP` szerint — ez a valódi
  Jira mező, amit `createJiraIssue`-nál be kell állítani).
- **Infobox "Típus" mező**: `fix` (a `TICKET_NATURE_TAGS` enumból — ez csak a leírásban
  megjelenő szöveges cimke, nem a Jira issue type).
- **Story felelős**: `MANUAL_DEV_ASSIGNEE` (config)
- **Kontextus** helyett strukturált összefoglaló:

```
## Nem zöld ellenőrzés

**Forrás ticket:** <eredeti ticket kulcs>
**Melyik kapu:** helyi qa-tester AC-check / code review / teszt-env AC-check
**Hányadik körben állt meg:** N/MAX_LOCAL_FIX_RETRIES (ha releváns — A8b-nél nincs kör)

### Nyitva maradt problémák
- <probléma 1 — melyik AC-t/review-pontot érinti, mi történt>
- <probléma 2 — ...>

**Branch/PR:** <link, ha van>
```

- **Acceptance Criteria** szekció: "A fenti nyitott problémák mindegyike javítva és
  ellenőrizve" (egy tételes lista, ami tükrözi a fenti problémákat).
- **Teszterv**: ugyanaz, mint az eredeti ticketé (ismételd meg a releváns AC-ket).
- **Függőségek**: az eredeti ticket kulcsa.

## A folyamat leállítása

Fix-ticket létrehozása után **a workflow megáll** — ne próbálj tovább automatikusan
javítani, ne lépj tovább a következő fázisra. Jelezd a felhasználónak a fix-ticket kulcsát
és egy rövid összefoglalót, mi nem ment át.
