# Repository instructions for Codex

> Claude-futásnál a [CLAUDE.md](CLAUDE.md) a mérvadó — ez a fájl Codex-futásra vonatkozik.

## Dev workflow

- A repo Codex workflow-jai a `.agents/skills/` alatt vannak. A részletes állapotgépet
  mindig az aktivált skillből és a `.agents/skills/dev-workflow/config.md` fájlból olvasd;
  ne duplikáld vagy találd ki ezeket a szabályokat.
- A Claude workflow az üzleti viselkedés kanonikus referenciája, de normál Codex-futásban
  a `.agents` portot használd. A `.claude` fákat csak paritásellenőrzéskor módosítsd.
- Az execute pipeline implementer → QA → code review → test-env lépései közös munkafát
  használnak. Delegáld őket a `.codex/agents/` alatti megfelelő custom agentnek, és
  sorosan várd meg mindegyik eredményét; író agenteket ne futtass párhuzamosan.
- Tartsd meg a skillek jóváhagyási és megállási pontjait. Külső írás, deploy, fallback
  user-identitású push vagy bizonytalan Jira-tranzíció előtt kérj jóváhagyást, ha a skill
  ezt előírja.
- A skill által készített commit, push és GitLab review/comment a
  `.agents/skills/dev-workflow/scripts/` AI-identitású wrappereivel fusson.

## Project checks

A beégetett teszt-/build-parancsok a [CLAUDE.md](CLAUDE.md) "Beégetett parancsok"
szakaszában vannak, egyetlen helyen — onnan olvasandók.

- Ne módosíts vagy írj felül a feladathoz nem tartozó, már meglévő munkafaváltozásokat.
