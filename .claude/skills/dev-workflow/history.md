# history

> ℹ️ **Ez egy sablon.** Friss dev-workflow-telepítésnél ez a fájl kerül a helyi
> `history.md` néven a helyére (lásd a repo-gyökér `dev-workflow-manifest.json`
> `repo_local_exceptions` listáját — a `history.md` szándékosan **nem** verziózott,
> repo-lokális fájl, nem a `versioned` csomag-tartalom része). Ne töltsd ki előre
> generikus vagy másik repóból átvett tapasztalattal — ez a projekt saját, dátumozott
> Jira/API-nyomozásainak és edge case-einek a helye, ahogy azok ebben a konkrét repóban
> felmerülnek.

## Hogyan használd

A `config.md` egyes szekciói (pl. "Jira automatizálás", "Design-review ciklus") innen
hivatkoznak ide, ha egy skill/subagent olyan Jira/API hibát vagy váratlan állapotot
tapasztal, amire a `config.md` táblázatai nem adnak egyértelmű választ. Amikor egy ilyen
nyomozás lezárul, egy rövid, dátumozott bekezdésben dokumentáld itt:

- mi volt a jelenség (pl. váratlan Jira transition-válasz, hiányzó issue type),
- mi derült ki a nyomozás során (API-válaszok, konkrét ID-k),
- mi lett a végleges, `config.md`-be beépített megoldás/kapcsoló, ha volt ilyen.

Ez a fájl **nem hot-path olvasmány** — egyetlen skill sem tölti be automatikusan minden
futásnál, csak hibaágban érdemes belenézni.
