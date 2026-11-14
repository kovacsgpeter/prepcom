# dev-workflow-execute — workflow-meta kapuk

Az [`SKILL.md`](SKILL.md) A7 lépéséből kiszervezve (ORD-498): csak akkor olvasd be, ha az A6 commitjai a
`dev-workflow-manifest.json` `versioned` útvonalait érintik (a gyakorlatban `workflow-meta` ticketnél).

## 7a0 — Csomag-verzió kapu

- **7a0 — Csomag-verzió kapu (csak `workflow-meta` ticketnél — pontosabban minden
  ticketnél, aminek a commitjai a lenti útvonalakat érintik, de a gyakorlatban ez a
  workflow-meta ág; push ELŐTT fut)**: mielőtt a `push-as-ai.sh`-t hívnád, ellenőrizd
  (`git diff --name-only origin/<REPO_MAP alap branch>...HEAD`), hogy az A6 commitjai
  érintenek-e a repo-gyökér [`dev-workflow-manifest.json`](../../../dev-workflow-manifest.json)
  `versioned` listájába eső útvonalat (jelenleg `.claude/skills/`, `.agents/skills/`,
  `.codex/agents/`, `.claude/agents/`, `.claude/tools/`, `.agents/tools/`, `AGENTS.md` —
  **a listát a manifestből olvasd, ne hardcode-old**). Ha igen, és a repo-gyökér
  `VERSION` fájl **nem nőtt** a bázishoz (`origin/<REPO_MAP alap branch>`) képest:
  - Emeld a `VERSION`-t a [`CHANGELOG.md`](../../../CHANGELOG.md) "Mi számít MAJOR
    változásnak" szekciója szerint: egy meglévő kapcsoló/flag **átnevezése** vagy
    **megszűnése**, illetve új **kötelező** `config.md` mező bevezetése → **MAJOR**;
    minden más (új opcionális eszköz/kapcsoló, meglévő skill-lépés finomítása,
    dokumentációs pontosítás) → **MINOR** vagy **PATCH** a szokásos semver-elvek szerint.
  - Írj hozzá `CHANGELOG.md` szakaszt a fájl tetejére: `## [<új VERSION>] - <ÉÉÉÉ-HH-NN>`,
    Keep a Changelog forma (`### Added`/`### Changed`/…), a ticket-kulcs hivatkozásával.
  - A `VERSION` + `CHANGELOG.md` módosítást **külön**, `build(<TICKET-KULCS>): …` típusú
    commitként commitold ugyanazzal a `commit-as-ai.sh`-val, majd futtasd le lokálisan a
    `bash ci/verify-dev-workflow-version-bump.sh`-t — **csak `exit 0` után** menj a 7a
    push-ra.
  - Ha a bázison már van kiadatlan (branchen élő, még nem mergelt) `VERSION`-emelés,
    ne emelj újra: fűzd a mostani változást ugyanahhoz a kiadatlan `CHANGELOG.md`
    szakaszhoz.
  Ez a kapu azért van a skillben (és nem csak a CI-ra bízva), hogy a verzióemelés a push
  **előtt** megtörténjen, ne egy piros `dev-workflow-version-check` pipeline-körrel
  később — a CI job innentől csak a védőháló. A `.agents`/`.codex` tükör szinkronban
  tartása külön ticket (COCALC-244) hatóköre, ez a kapu csak a `VERSION`/`CHANGELOG.md`
  emelését kényszeríti ki.
