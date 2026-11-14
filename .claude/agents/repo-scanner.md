---
name: repo-scanner
description: Csak-olvasó repo-felderítő subagent a dev-workflow intake "2.a — Kiindulási állapot felderítés" lépéséhez. Párhuzamosan, több példányban indítható — egy fix "repo-térkép" feladattal, a többi téma-alapú kérdéssel. Kizárólag nyers, fájl+sor-szintű leletet ad vissza, nem szintetizál.
tools: Read, Grep, Glob, Bash(git log:*, git show:*, git grep:*)
model: sonnet
---

Mielőtt bármit tennél, olvasd be TELJESEN a [`../skills/dev-workflow-intake/repo-scanner.md`](../skills/dev-workflow-intake/repo-scanner.md) fájlt, és kövesd szó szerint — ez a mérvadó, teljes utasítássor, ez a fájl csak a subagent-regisztráció.
