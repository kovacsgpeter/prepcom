#!/usr/bin/env node
"use strict";
/**
 * Plain-assert tesztek a changelog adatgyűjtő szkripthez (COCALC-241).
 *
 * Nem használ teszt-keretrendszert (jest/mocha) — egyszerű assert-alapú futtató,
 * kézzel írt fixture-ökön keresztül, a session-cost-report/analyze.test.js
 * stílusában. Az élő GitLab/Jira SOSEM hívódik: minden bemenet injektált
 * (git-runner, glab-fixture, fetch-mock).
 *
 * Futtatás:  node collect.test.js
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { loadConfig } = require("./lib/config");
const { resolveRange } = require("./lib/range");
const { parseBranch } = require("./lib/branch-parse");
const { listMergedMRs } = require("./lib/glab");
const { fetchTicketTitle, enrichWithJira } = require("./lib/jira");
const { groupByNature } = require("./lib/group");
const { loadManifest, isVersionedPath } = require("./lib/manifest");
const { run } = require("./collect");

const FIXTURES_DIR = path.join(__dirname, "fixtures");

let passed = 0;
let failed = 0;
const pending = [];

function record(name, err) {
  if (err) {
    console.error(`  NOT OK - ${name}`);
    console.error(err);
    failed++;
  } else {
    console.log(`  ok - ${name}`);
    passed++;
  }
}

function test(name, fn) {
  let r;
  try {
    r = fn();
  } catch (e) {
    record(name, e);
    return;
  }
  if (r && typeof r.then === "function") {
    pending.push(r.then(() => record(name), (e) => record(name, e)));
  } else {
    record(name);
  }
}

// --- helpers ---------------------------------------------------------------

// Injektálható git-runner: (args[]) -> stdout. A `matchers` egy [minta, kimenet]
// lista; az első olyan sor nyer, amelynek `minta`-ja az `args.join(" ")`-ben
// előfordul. Nincs találat -> dobás (a teszt hibát jelez, ha váratlan git-hívás jön).
function fakeGit(matchers) {
  return (args) => {
    const key = args.join(" ");
    for (const [pat, out] of matchers) {
      if (key.includes(pat)) return typeof out === "function" ? out(args) : out;
    }
    throw new Error("váratlan git-hívás: git " + key);
  };
}

function tmpFile(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "changelog-test-"));
  return path.join(dir, name);
}

// ========================================================================
// lib/config.js
// ========================================================================

const CONFIG_MD_MIN = [
  "| Változó | Jelenlegi érték | Leírás |",
  "|---|---|---|",
  "| `CHANGELOG_MODE` | `offline` | Azt dönti el, honnan jön a ticket-lista. |",
  "| `CHANGELOG_STYLE` | `hu-dev` | A changelog-sorok nyelvét dönti el. |",
  "| `TICKET_NATURE_TAGS` | `feature`, `fix`, `build`, `refactoring`, `chore` | jelleg. |",
].join("\n");

// A valódi config.md alakja: előbb a WORKFLOW_PROFILE preset-tábla (5 cellás,
// cheap/balanced/genius oszlopok), majd a dedikált `### CHANGELOG_MODE` szekció
// 3 cellás "Jelenlegi érték" sora — SZÁNDÉKOSAN eltérő értékkel, hogy kiderüljön,
// melyiket olvassa a szkript (M2).
const CONFIG_MD_TWO_TABLE = [
  "## Munkamódprofil (WORKFLOW_PROFILE)",
  "",
  "| Egyedi kapcsoló | `cheap` | `balanced` | `genius` | Bevezető |",
  "|---|---|---|---|---|",
  "| `CHANGELOG_MODE` | `offline` | `offline` | `offline` | Itt (COCALC-240) |",
  "| `CHANGELOG_STYLE` | `hu-dev` | `hu-dev` | `hu-dev` | Itt (COCALC-240) |",
  "",
  "### CHANGELOG_MODE",
  "",
  "> ℹ️ magyarázó blokk",
  "",
  "| Változó | Jelenlegi érték | Leírás |",
  "|---|---|---|",
  "| `CHANGELOG_MODE` | `enriched` | Azt dönti el, honnan jön a ticket-lista. |",
  "",
  "### CHANGELOG_STYLE",
  "",
  "| Változó | Jelenlegi érték | Leírás |",
  "|---|---|---|",
  "| `CHANGELOG_STYLE` | `en-standard` | A changelog-sorok nyelvét dönti el. |",
  "",
  "## Ticket formátum",
  "",
  "| `TICKET_NATURE_TAGS` | `feature`, `fix`, `build`, `refactoring`, `chore` | jelleg. |",
].join("\n");

test("config: a config.md tábláiból kiolvassa a mode/style/natureTags értékeket", () => {
  const cfg = loadConfig({ configText: CONFIG_MD_MIN, warn: () => {} });
  assert.strictEqual(cfg.mode, "offline");
  assert.strictEqual(cfg.style, "hu-dev");
  assert.deepStrictEqual(cfg.natureTags, ["feature", "fix", "build", "refactoring", "chore"]);
  // a kivezetett kulcsok nincsenek a visszatérési értékben (minor #1)
  assert.ok(!("branchNamePattern" in cfg));
  assert.ok(!("branchNameWordSeparator" in cfg));
});

test("config (M2): kéttáblás config.md -> a dedikált `### CHANGELOG_MODE` szekció értékét olvassa, nem a preset-tábla cheap-oszlopát", () => {
  const cfg = loadConfig({ configText: CONFIG_MD_TWO_TABLE, warn: () => {} });
  assert.strictEqual(cfg.mode, "enriched");
  assert.strictEqual(cfg.style, "en-standard");
  assert.deepStrictEqual(cfg.natureTags, ["feature", "fix", "build", "refactoring", "chore"]);
});

test("config: ismeretlen CHANGELOG_MODE -> offline visszaesés + figyelmeztetés", () => {
  const text = CONFIG_MD_MIN.replace("`offline` | Azt", "`csimbumm` | Azt");
  const warnings = [];
  const cfg = loadConfig({ configText: text, warn: (m) => warnings.push(m) });
  assert.strictEqual(cfg.mode, "offline");
  assert.ok(
    warnings.some((w) => /CHANGELOG_MODE/.test(w) && /csimbumm/.test(w)),
    JSON.stringify(warnings)
  );
});

test("config: hiányzó tábla -> minden alapértelmezésre esik, nem dob", () => {
  const cfg = loadConfig({ configText: "# üres\n", warn: () => {} });
  assert.strictEqual(cfg.mode, "offline");
  assert.strictEqual(cfg.style, "hu-dev");
  assert.deepStrictEqual(cfg.natureTags, ["feature", "fix", "build", "refactoring", "chore"]);
});

test("config: a repóban lévő valódi config.md beolvasható és offline módot ad", () => {
  const cfg = loadConfig({ warn: () => {} });
  assert.ok(["offline", "enriched", "standalone"].includes(cfg.mode));
  assert.ok(cfg.natureTags.includes("feature"));
});

// ========================================================================
// lib/range.js
// ========================================================================

test("range: 0 tag -> <gyökér>..HEAD, fromKind=root", () => {
  const git = fakeGit([
    ["tag -l v*", ""],
    ["rev-list --max-parents=0", "root0000000000000000000000000000000000000"],
  ]);
  const r = resolveRange({ git });
  assert.strictEqual(r.from, "root0000000000000000000000000000000000000");
  assert.strictEqual(r.to, "HEAD");
  assert.strictEqual(r.fromKind, "root");
  assert.strictEqual(r.range, "root0000000000000000000000000000000000000..HEAD");
});

test("range: 1 tag -> <gyökér>..tag, fromKind=root", () => {
  const git = fakeGit([
    ["tag -l v*", "v0.1.0"],
    ["rev-list --max-parents=0", "root111"],
  ]);
  const r = resolveRange({ git });
  assert.strictEqual(r.from, "root111");
  assert.strictEqual(r.to, "v0.1.0");
  assert.strictEqual(r.fromKind, "root");
});

test("range: >=2 tag -> előző..utolsó, fromKind=tag", () => {
  const git = fakeGit([["tag -l v*", "v1.3.0\nv1.2.0\nv1.1.0"]]);
  const r = resolveRange({ git });
  assert.strictEqual(r.from, "v1.2.0");
  assert.strictEqual(r.to, "v1.3.0");
  assert.strictEqual(r.fromKind, "tag");
});

test("range: --from/--to felülbírál, fromKind=explicit", () => {
  const git = fakeGit([["tag -l v*", "v1.3.0\nv1.2.0"]]);
  const r = resolveRange({ from: "abc123", to: "def456", git });
  assert.strictEqual(r.from, "abc123");
  assert.strictEqual(r.to, "def456");
  assert.strictEqual(r.fromKind, "explicit");
});

// ========================================================================
// lib/branch-parse.js
// ========================================================================

const NATURE_TAGS = ["feature", "fix", "build", "refactoring", "chore"];

test("branch-parse: mind az 5 jelleg-tag felismerve, ticketkulccsal", () => {
  const cases = {
    "feature/COCALC-101_uj_export_gomb": ["feature", "COCALC-101"],
    "fix/COCALC-102_null_pointer": ["fix", "COCALC-102"],
    "build/COCALC-103_ci_cache_kulcs": ["build", "COCALC-103"],
    "refactoring/COCALC-104_service_bontas": ["refactoring", "COCALC-104"],
    "chore/COCALC-105_dep_bump": ["chore", "COCALC-105"],
  };
  for (const [branch, [nature, key]] of Object.entries(cases)) {
    const r = parseBranch(branch, { natureTags: NATURE_TAGS });
    assert.strictEqual(r.nature, nature, branch);
    assert.strictEqual(r.ticketKey, key, branch);
  }
});

test("branch-parse: '-' elválasztó a ticketkulcs után is elfogadott", () => {
  const r = parseBranch("feature/COCALC-200-uj-oldal", { natureTags: NATURE_TAGS });
  assert.strictEqual(r.nature, "feature");
  assert.strictEqual(r.ticketKey, "COCALC-200");
});

test("branch-parse: nem támogatott jelleg-prefix (hotfix/) -> egyéb, ticketKey null", () => {
  const r = parseBranch("hotfix/COCALC-6_gyorsjavitas", { natureTags: NATURE_TAGS });
  assert.strictEqual(r.nature, "egyéb");
  assert.strictEqual(r.ticketKey, null);
});

test("branch-parse: ticketkulcs nélküli név -> egyéb, ticketKey null, nem dob", () => {
  const r = parseBranch("fix/skill-portability-check", { natureTags: NATURE_TAGS });
  assert.strictEqual(r.nature, "egyéb");
  assert.strictEqual(r.ticketKey, null);
});

test("branch-parse: teljesen minta-idegen név -> egyéb, ticketKey null", () => {
  const r = parseBranch("wip", { natureTags: NATURE_TAGS });
  assert.deepStrictEqual(r, { nature: "egyéb", ticketKey: null });
});

// ========================================================================
// lib/glab.js
// ========================================================================

test("glab: fixture-útról olvas JSON-t, nem hív külső parancsot", () => {
  const fx = path.join(FIXTURES_DIR, "glab-mr-list.json");
  const mrs = listMergedMRs({ fixturePath: fx });
  assert.ok(Array.isArray(mrs));
  assert.ok(mrs.length >= 6);
  assert.ok(mrs[0].source_branch);
});

test("glab: CHANGELOG_GLAB_FIXTURE env is rövidre zár", () => {
  const prev = process.env.CHANGELOG_GLAB_FIXTURE;
  process.env.CHANGELOG_GLAB_FIXTURE = path.join(FIXTURES_DIR, "glab-mr-list.json");
  try {
    const mrs = listMergedMRs({});
    assert.ok(Array.isArray(mrs) && mrs.length >= 6);
  } finally {
    if (prev === undefined) delete process.env.CHANGELOG_GLAB_FIXTURE;
    else process.env.CHANGELOG_GLAB_FIXTURE = prev;
  }
});

test("glab: injektált exec kimenetét parse-olja", () => {
  const mrs = listMergedMRs({
    exec: () => JSON.stringify([{ source_branch: "feature/COCALC-1_x", title: "T", web_url: "u" }]),
  });
  assert.strictEqual(mrs.length, 1);
  assert.strictEqual(mrs[0].source_branch, "feature/COCALC-1_x");
});

test("glab: érvénytelen JSON kimenet -> beszédes hiba", () => {
  assert.throws(
    () => listMergedMRs({ exec: () => "nem json" }),
    /nem érvényes JSON/
  );
});

// ========================================================================
// lib/jira.js
// ========================================================================

function fakeFetchOk(map) {
  return async (url) => {
    const m = url.match(/issue\/([A-Z0-9-]+)\?/);
    const key = m ? m[1] : null;
    if (key && map[key]) {
      return { ok: true, json: async () => ({ fields: { summary: map[key] } }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

test("jira: fetchTicketTitle a summary mezőt adja vissza", async () => {
  const title = await fetchTicketTitle("COCALC-101", {
    fetchImpl: fakeFetchOk({ "COCALC-101": "Új export gomb" }),
    baseUrl: "https://example.atlassian.net",
    token: "t",
  });
  assert.strictEqual(title, "Új export gomb");
});

test("jira: enrichWithJira minden ticketKey-hez ticketTitle-t tesz", async () => {
  const mrs = [
    { ticketKey: "COCALC-101", nature: "feature", branch: "b1", title: "t1", url: "u1" },
    { ticketKey: "COCALC-102", nature: "fix", branch: "b2", title: "t2", url: "u2" },
  ];
  const res = await enrichWithJira(mrs, {
    fetchImpl: fakeFetchOk({ "COCALC-101": "Egy", "COCALC-102": "Kettő" }),
    baseUrl: "https://example.atlassian.net",
    token: "t",
    warn: () => {},
  });
  assert.strictEqual(res.jiraFallback, false);
  assert.strictEqual(res.mrs[0].ticketTitle, "Egy");
  assert.strictEqual(res.mrs[1].ticketTitle, "Kettő");
});

test("jira: hiányzó baseUrl/token -> jiraFallback true, nincs ticketTitle", async () => {
  const mrs = [{ ticketKey: "COCALC-101", nature: "feature", branch: "b", title: "t", url: "u" }];
  const res = await enrichWithJira(mrs, { fetchImpl: fakeFetchOk({}), warn: () => {} });
  assert.strictEqual(res.jiraFallback, true);
  assert.ok(!("ticketTitle" in res.mrs[0]));
});

test("jira: fetch dobás az első hívásnál -> teljes visszaesés (jiraFallback), nem dob tovább", async () => {
  const mrs = [
    { ticketKey: "COCALC-101", nature: "feature", branch: "b1", title: "t1", url: "u1" },
    { ticketKey: "COCALC-102", nature: "fix", branch: "b2", title: "t2", url: "u2" },
  ];
  const res = await enrichWithJira(mrs, {
    fetchImpl: async () => {
      throw new Error("ECONNREFUSED");
    },
    baseUrl: "https://example.atlassian.net",
    token: "t",
    warn: () => {},
  });
  assert.strictEqual(res.jiraFallback, true);
  assert.ok(res.mrs.every((m) => !("ticketTitle" in m)));
});

test("jira: egyedi 404 csak azt az MR-t hagyja cím nélkül, nem teljes fallback", async () => {
  const mrs = [
    { ticketKey: "COCALC-101", nature: "feature", branch: "b1", title: "t1", url: "u1" },
    { ticketKey: "COCALC-777", nature: "fix", branch: "b2", title: "t2", url: "u2" },
  ];
  const res = await enrichWithJira(mrs, {
    fetchImpl: fakeFetchOk({ "COCALC-101": "Egy" }),
    baseUrl: "https://example.atlassian.net",
    token: "t",
    warn: () => {},
  });
  assert.strictEqual(res.jiraFallback, false);
  assert.strictEqual(res.mrs[0].ticketTitle, "Egy");
  assert.ok(!("ticketTitle" in res.mrs[1]));
});

// --- M1: HTTP-hiba (401/403/5xx) billenti a jiraFallback-et ---

function fakeFetchStatus(status) {
  return async () => ({ ok: false, status, json: async () => ({}) });
}

test("jira (M1): fetchTicketTitle 404-re null-t ad (nem dob)", async () => {
  const title = await fetchTicketTitle("COCALC-1", {
    fetchImpl: fakeFetchStatus(404),
    baseUrl: "https://example.atlassian.net",
    token: "t",
  });
  assert.strictEqual(title, null);
});

test("jira (M1): fetchTicketTitle 401-re dob, a hibán jiraHttpStatus mezővel", async () => {
  await assert.rejects(
    fetchTicketTitle("COCALC-1", {
      fetchImpl: fakeFetchStatus(401),
      baseUrl: "https://example.atlassian.net",
      token: "t",
    }),
    (e) => e.jiraHttpStatus === 401 && /HTTP 401/.test(e.message)
  );
});

test("jira (M1): minden kérés 401 (lejárt token) -> jiraFallback:true + warn, nincs ticketTitle", async () => {
  const mrs = [
    { ticketKey: "COCALC-101", nature: "feature", branch: "b1", title: "t1", url: "u1" },
    { ticketKey: "COCALC-102", nature: "fix", branch: "b2", title: "t2", url: "u2" },
  ];
  const warnings = [];
  const res = await enrichWithJira(mrs, {
    fetchImpl: fakeFetchStatus(401),
    baseUrl: "https://example.atlassian.net",
    token: "lejart",
    warn: (m) => warnings.push(m),
  });
  assert.strictEqual(res.jiraFallback, true);
  assert.ok(res.mrs.every((m) => !("ticketTitle" in m)));
  assert.ok(warnings.some((w) => /jiraFallback/i.test(w)), JSON.stringify(warnings));
});

test("jira (M1): 5xx a lista közepén is teljes jiraFallback (nem csak az az MR marad cím nélkül)", async () => {
  const mrs = [
    { ticketKey: "COCALC-101", nature: "feature", branch: "b1", title: "t1", url: "u1" },
    { ticketKey: "COCALC-102", nature: "fix", branch: "b2", title: "t2", url: "u2" },
  ];
  const fetchImpl = async (url) => {
    if (/COCALC-101/.test(url)) {
      return { ok: true, json: async () => ({ fields: { summary: "Egy" } }) };
    }
    return { ok: false, status: 503, json: async () => ({}) };
  };
  const res = await enrichWithJira(mrs, {
    fetchImpl,
    baseUrl: "https://example.atlassian.net",
    token: "t",
    warn: () => {},
  });
  assert.strictEqual(res.jiraFallback, true);
  assert.ok(res.mrs.every((m) => !("ticketTitle" in m)));
});

// ========================================================================
// lib/group.js
// ========================================================================

test("group: mind a 6 kulcs jelen van, üresen is", () => {
  const g = groupByNature([], { natureTags: NATURE_TAGS });
  assert.deepStrictEqual(Object.keys(g), [
    "feature",
    "fix",
    "build",
    "refactoring",
    "chore",
    "egyéb",
  ]);
  for (const k of Object.keys(g)) assert.deepStrictEqual(g[k], []);
});

test("group: jelleg szerint sorolja az MR-eket", () => {
  const mrs = [
    { ticketKey: "COCALC-1", nature: "feature", branch: "b", title: "t", url: "u" },
    { ticketKey: "COCALC-2", nature: "fix", branch: "b", title: "t", url: "u" },
    { ticketKey: null, nature: "egyéb", branch: "b", title: "t", url: "u" },
    { ticketKey: "COCALC-3", nature: "feature", branch: "b", title: "t", url: "u" },
  ];
  const g = groupByNature(mrs, { natureTags: NATURE_TAGS });
  assert.strictEqual(g.feature.length, 2);
  assert.strictEqual(g.fix.length, 1);
  assert.strictEqual(g["egyéb"].length, 1);
  assert.strictEqual(g.build.length, 0);
});

// ========================================================================
// lib/manifest.js  (COCALC-243)
// ========================================================================

const MANIFEST_JSON = JSON.stringify({
  versioned: [".claude/skills/", ".claude/tools/", ".claude/agents/", "AGENTS.md"],
  repo_local_exceptions: [
    ".claude/skills/dev-workflow/config.md",
    ".claude/launch.json",
  ],
});

test("manifest: loadManifest a versioned + repo_local_exceptions listát adja", () => {
  const m = loadManifest({ manifestText: MANIFEST_JSON, warn: () => {} });
  assert.deepStrictEqual(m.versioned, [
    ".claude/skills/",
    ".claude/tools/",
    ".claude/agents/",
    "AGENTS.md",
  ]);
  assert.deepStrictEqual(m.repoLocalExceptions, [
    ".claude/skills/dev-workflow/config.md",
    ".claude/launch.json",
  ]);
});

test("manifest: érvénytelen JSON -> null + figyelmeztetés (nem dob)", () => {
  const warnings = [];
  const m = loadManifest({ manifestText: "{ ez nem json", warn: (x) => warnings.push(x) });
  assert.strictEqual(m, null);
  assert.ok(warnings.some((w) => /manifest/i.test(w)), JSON.stringify(warnings));
});

test("manifest: olvashatatlan útvonal -> null + figyelmeztetés (nem dob)", () => {
  const warnings = [];
  const m = loadManifest({
    manifestPath: path.join(os.tmpdir(), "nincs-ilyen-manifest-" + Date.now() + ".json"),
    warn: (x) => warnings.push(x),
  });
  assert.strictEqual(m, null);
  assert.ok(warnings.some((w) => /nem olvasható/i.test(w)), JSON.stringify(warnings));
});

test("manifest: a repóban lévő valódi dev-workflow-manifest.json beolvasható", () => {
  const m = loadManifest({ warn: () => {} });
  assert.ok(m && Array.isArray(m.versioned) && m.versioned.length > 0);
  assert.ok(m.versioned.includes(".claude/skills/"));
});

test("isVersionedPath: könyvtár-prefix egyezés a versioned listából", () => {
  const m = loadManifest({ manifestText: MANIFEST_JSON, warn: () => {} });
  assert.strictEqual(isVersionedPath(".claude/skills/dev-workflow-execute/SKILL.md", m), true);
  assert.strictEqual(isVersionedPath(".claude/tools/changelog/collect.js", m), true);
});

test("isVersionedPath: pontos fájl-egyezés (AGENTS.md)", () => {
  const m = loadManifest({ manifestText: MANIFEST_JSON, warn: () => {} });
  assert.strictEqual(isVersionedPath("AGENTS.md", m), true);
});

test("isVersionedPath: repo_local_exceptions fájl NEM verziózott, még ha versioned prefix alatt is van", () => {
  const m = loadManifest({ manifestText: MANIFEST_JSON, warn: () => {} });
  assert.strictEqual(isVersionedPath(".claude/skills/dev-workflow/config.md", m), false);
  assert.strictEqual(isVersionedPath(".claude/launch.json", m), false);
});

test("isVersionedPath: `/`-re végződő repo_local_exceptions könyvtár-kivétel (ORD-506)", () => {
  const m = loadManifest({
    manifestText: JSON.stringify({ versioned: [".claude/skills/"], repo_local_exceptions: [".claude/skills/local-skill/"] }),
    warn: () => {},
  });
  assert.strictEqual(isVersionedPath(".claude/skills/local-skill/SKILL.md", m), false);
  assert.strictEqual(isVersionedPath(".claude/skills/local-skill/sub/tool.mjs", m), false);
  assert.strictEqual(isVersionedPath(".claude/skills/local-skill-x/SKILL.md", m), true);
  assert.strictEqual(isVersionedPath(".claude/skills/dev-workflow/SKILL.md", m), true);
});

test("isVersionedPath: versioned listán kívüli útvonal (frontend/, README.md, gyökér-JSON) -> false", () => {
  const m = loadManifest({ manifestText: MANIFEST_JSON, warn: () => {} });
  assert.strictEqual(isVersionedPath("frontend/src/app/app.component.ts", m), false);
  assert.strictEqual(isVersionedPath("README.md", m), false);
  assert.strictEqual(isVersionedPath("dev-workflow-manifest.json", m), false);
});

test("isVersionedPath: './' prefix és '\\\\' elválasztó normalizálva", () => {
  const m = loadManifest({ manifestText: MANIFEST_JSON, warn: () => {} });
  assert.strictEqual(isVersionedPath("./.claude/tools/changelog/lib/manifest.js", m), true);
  assert.strictEqual(isVersionedPath(".claude\\tools\\changelog\\collect.js", m), true);
});

// ========================================================================
// collect.js — integráció (mock git + glab-fixture + mock fetch)
// ========================================================================

const GIT_MATCHERS_6 = [
  ["tag -l v*", "v1.2.0\nv1.1.0"],
  ["rev-list --max-parents=0", "root999"],
  [
    "log --first-parent --merges",
    "sha_feat\nsha_fix\nsha_build\nsha_refactoring\nsha_chore\nsha_egyeb",
  ],
];

function captureStream() {
  const chunks = [];
  return {
    write: (s) => {
      chunks.push(s);
      return true;
    },
    text: () => chunks.join(""),
  };
}

test("collect: offline mód — jelleg szerint csoportosított JSON, range-en kívüli MR kiszűrve", async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  const code = await run([], {
    git: fakeGit(GIT_MATCHERS_6),
    glabFixturePath: path.join(FIXTURES_DIR, "glab-mr-list.json"),
    configText: CONFIG_MD_MIN,
    stdout,
    stderr,
  });
  assert.strictEqual(code, 0);
  const out = JSON.parse(stdout.text());
  assert.strictEqual(out.mode, "offline");
  assert.strictEqual(out.mrCount, 6);
  assert.deepStrictEqual(out.range, { from: "v1.1.0", to: "v1.2.0", fromKind: "tag" });
  assert.strictEqual(out.groups.feature.length, 1);
  assert.strictEqual(out.groups.feature[0].ticketKey, "COCALC-101");
  assert.strictEqual(out.groups.feature[0].branch, "feature/COCALC-101_uj_export_gomb");
  assert.ok(out.groups.feature[0].url);
  assert.strictEqual(out.groups["egyéb"].length, 1);
  assert.strictEqual(out.groups["egyéb"][0].ticketKey, null);
  // offline -> nincs ticketTitle
  assert.ok(!("ticketTitle" in out.groups.feature[0]));
  // range-en kívüli (sha_OUTSIDE) MR nincs benne
  const allKeys = Object.values(out.groups)
    .flat()
    .map((m) => m.ticketKey);
  assert.ok(!allKeys.includes("COCALC-999"));
});

test("collect: minden MR-objektum tartalmazza a kötelező mezőket (ticketKey, nature, branch, title, url)", async () => {
  const stdout = captureStream();
  const code = await run([], {
    git: fakeGit(GIT_MATCHERS_6),
    glabFixturePath: path.join(FIXTURES_DIR, "glab-mr-list.json"),
    configText: CONFIG_MD_MIN,
    stdout,
    stderr: captureStream(),
  });
  assert.strictEqual(code, 0);
  const out = JSON.parse(stdout.text());
  for (const mr of Object.values(out.groups).flat()) {
    for (const f of ["ticketKey", "nature", "branch", "title", "url"]) {
      assert.ok(f in mr, `hiányzó mező: ${f} — ${JSON.stringify(mr)}`);
    }
  }
});

test("collect: nincs merge-elt MR a tartományban -> üres de érvényes JSON + stderr jelzés, exit 0", async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  const code = await run([], {
    git: fakeGit([
      ["tag -l v*", "v1.2.0\nv1.1.0"],
      ["rev-list --max-parents=0", "root999"],
      ["log --first-parent --merges", ""],
    ]),
    glabFixturePath: path.join(FIXTURES_DIR, "glab-mr-list.json"),
    configText: CONFIG_MD_MIN,
    stdout,
    stderr,
  });
  assert.strictEqual(code, 0);
  const out = JSON.parse(stdout.text());
  assert.strictEqual(out.mrCount, 0);
  assert.deepStrictEqual(Object.keys(out.groups), [
    "feature",
    "fix",
    "build",
    "refactoring",
    "chore",
    "egyéb",
  ]);
  for (const k of Object.keys(out.groups)) assert.deepStrictEqual(out.groups[k], []);
  const errText = stderr.text();
  assert.ok(/nincs merge-commit-alapú MR/i.test(errText), errText);
  assert.ok(/squash\/ff-merge/i.test(errText), errText);
});

test("collect: enriched mód -> ticketTitle mező bekerül (mockolt fetch)", async () => {
  const stdout = captureStream();
  const code = await run([], {
    git: fakeGit(GIT_MATCHERS_6),
    glabFixturePath: path.join(FIXTURES_DIR, "glab-mr-list.json"),
    configText: CONFIG_MD_MIN.replace("`offline` | Azt", "`enriched` | Azt"),
    env: { JIRA_BASE_URL: "https://example.atlassian.net", JIRA_API_TOKEN: "t" },
    fetchImpl: fakeFetchOk({
      "COCALC-101": "Új export gomb",
      "COCALC-102": "NullPointer javítás",
      "COCALC-103": "CI cache kulcs",
      "COCALC-104": "Service bontás",
      "COCALC-105": "Dep bump",
    }),
    stdout,
    stderr: captureStream(),
  });
  assert.strictEqual(code, 0);
  const out = JSON.parse(stdout.text());
  assert.strictEqual(out.mode, "enriched");
  assert.strictEqual(out.groups.feature[0].ticketTitle, "Új export gomb");
  // a ticketkulcs nélküli egyéb MR-nek nincs ticketTitle-je
  assert.ok(!("ticketTitle" in out.groups["egyéb"][0]));
  assert.ok(!("jiraFallback" in out));
});

test("collect: standalone mód Jira-hibával -> offline eredmény + jiraFallback:true, exit 0", async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  const code = await run([], {
    git: fakeGit(GIT_MATCHERS_6),
    glabFixturePath: path.join(FIXTURES_DIR, "glab-mr-list.json"),
    configText: CONFIG_MD_MIN.replace("`offline` | Azt", "`standalone` | Azt"),
    env: { JIRA_BASE_URL: "https://example.atlassian.net", JIRA_API_TOKEN: "t" },
    fetchImpl: async () => {
      throw new Error("ECONNREFUSED");
    },
    stdout,
    stderr,
  });
  assert.strictEqual(code, 0);
  const out = JSON.parse(stdout.text());
  assert.strictEqual(out.jiraFallback, true);
  assert.ok(Object.values(out.groups).flat().every((m) => !("ticketTitle" in m)));
});

test("collect: --out <fájl> -> a JSON fájlba kerül, stdout üres marad", async () => {
  const outPath = tmpFile("changelog.json");
  const stdout = captureStream();
  const code = await run(["--out", outPath], {
    git: fakeGit(GIT_MATCHERS_6),
    glabFixturePath: path.join(FIXTURES_DIR, "glab-mr-list.json"),
    configText: CONFIG_MD_MIN,
    stdout,
    stderr: captureStream(),
  });
  assert.strictEqual(code, 0);
  assert.strictEqual(stdout.text().trim(), "");
  const written = JSON.parse(fs.readFileSync(outPath, "utf8"));
  assert.strictEqual(written.mrCount, 6);
});

test("collect: --from/--to felülbírálja a tartományt", async () => {
  const stdout = captureStream();
  const code = await run(["--from", "aaa", "--to", "bbb"], {
    git: fakeGit([
      ["tag -l v*", "v9.9.9"],
      ["rev-list --max-parents=0", "rootX"],
      ["--pretty=%H aaa..bbb", "sha_feat"],
    ]),
    glabFixturePath: path.join(FIXTURES_DIR, "glab-mr-list.json"),
    configText: CONFIG_MD_MIN,
    stdout,
    stderr: captureStream(),
  });
  assert.strictEqual(code, 0);
  const out = JSON.parse(stdout.text());
  assert.deepStrictEqual(out.range, { from: "aaa", to: "bbb", fromKind: "explicit" });
  assert.strictEqual(out.mrCount, 1);
});

test("collect (N1): deps.now injektálva -> a generatedAt a rögzített időbélyeget adja (determinisztikus)", async () => {
  const stdout = captureStream();
  const fixed = new Date("2020-01-02T03:04:05.000Z");
  const code = await run([], {
    git: fakeGit(GIT_MATCHERS_6),
    glabFixturePath: path.join(FIXTURES_DIR, "glab-mr-list.json"),
    configText: CONFIG_MD_MIN,
    now: () => fixed,
    stdout,
    stderr: captureStream(),
  });
  assert.strictEqual(code, 0);
  const out = JSON.parse(stdout.text());
  assert.strictEqual(out.generatedAt, "2020-01-02T03:04:05.000Z");
});

test("collect (N2): ismeretlen `--` kapcsoló -> stderr-figyelmeztetés, a futás egyébként normál (exit 0, érvényes JSON)", async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  const code = await run(["--form", "v1.0.0"], {
    git: fakeGit(GIT_MATCHERS_6),
    glabFixturePath: path.join(FIXTURES_DIR, "glab-mr-list.json"),
    configText: CONFIG_MD_MIN,
    stdout,
    stderr,
  });
  assert.strictEqual(code, 0);
  assert.ok(
    /ismeretlen kapcsoló: --form \(kihagyva\)/.test(stderr.text()),
    stderr.text()
  );
  const out = JSON.parse(stdout.text());
  assert.strictEqual(out.mrCount, 6);
});

test("collect (N2): ismert kapcsolók és --help NEM triggerelnek ismeretlen-kapcsoló figyelmeztetést", async () => {
  const stderrKnown = captureStream();
  await run(["--from", "aaa", "--to", "bbb"], {
    git: fakeGit([
      ["tag -l v*", ""],
      ["rev-list --max-parents=0", "rootX"],
      ["--pretty=%H aaa..bbb", ""],
    ]),
    glabFixturePath: path.join(FIXTURES_DIR, "glab-mr-list.json"),
    configText: CONFIG_MD_MIN,
    stdout: captureStream(),
    stderr: stderrKnown,
  });
  assert.ok(!/ismeretlen kapcsoló/.test(stderrKnown.text()), stderrKnown.text());

  const stdoutHelp = captureStream();
  const stderrHelp = captureStream();
  const codeHelp = await run(["--help"], { stdout: stdoutHelp, stderr: stderrHelp });
  assert.strictEqual(codeHelp, 0);
  assert.ok(!/ismeretlen kapcsoló/.test(stderrHelp.text()), stderrHelp.text());
  assert.ok(/changelog adatgyűjtő/.test(stdoutHelp.text()));
});

// ========================================================================
// collect.js — útvonal-szűrés a manifest 'versioned' halmazára (COCALC-243)
// ========================================================================

const GIT_MATCHERS_FILTER = [
  ["tag -l v*", "v1.2.0\nv1.1.0"],
  ["rev-list --max-parents=0", "root999"],
  [
    "log --first-parent --merges",
    "sha_feat\nsha_fix\nsha_build\nsha_refactoring\nsha_chore\nsha_egyeb",
  ],
  // per-MR merge-commit diff (git diff --name-only <sha>^1 <sha>)
  ["diff --name-only sha_feat", ".claude/skills/dev-workflow-execute/SKILL.md"],
  ["diff --name-only sha_fix", ".claude/skills/dev-workflow/config.md"],
  [
    "diff --name-only sha_build",
    ".claude/skills/dev-workflow/config.md\nfrontend/src/app/app.component.ts",
  ],
  [
    "diff --name-only sha_refactoring",
    ".claude/tools/changelog/collect.js\nfrontend/src/app/util.ts",
  ],
  ["diff --name-only sha_chore", "README.md"],
  ["diff --name-only sha_egyeb", "backend/build.gradle.kts"],
];

const FILTER_MANIFEST = JSON.stringify({
  versioned: [".claude/skills/", ".claude/tools/", ".claude/agents/", "AGENTS.md"],
  repo_local_exceptions: [".claude/skills/dev-workflow/config.md", ".claude/launch.json"],
});

test("collect (COCALC-243): csak a versioned csomag-útvonalat érintő MR marad; csak-config.md és vegyes config.md+frontend kiesik", async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  const code = await run([], {
    git: fakeGit(GIT_MATCHERS_FILTER),
    glabFixturePath: path.join(FIXTURES_DIR, "glab-mr-list.json"),
    configText: CONFIG_MD_MIN,
    manifestText: FILTER_MANIFEST,
    stdout,
    stderr,
  });
  assert.strictEqual(code, 0);
  const out = JSON.parse(stdout.text());
  // KEEP: sha_feat (.claude/skills/...) és sha_refactoring (.claude/tools/... + frontend/)
  assert.strictEqual(out.mrCount, 2);
  assert.strictEqual(out.groups.feature.length, 1);
  assert.strictEqual(out.groups.feature[0].ticketKey, "COCALC-101");
  assert.strictEqual(out.groups.refactoring.length, 1);
  assert.strictEqual(out.groups.refactoring[0].ticketKey, "COCALC-104");
  // FILTER: fix (csak config.md), build (config.md + frontend), chore (README.md), egyéb (backend)
  assert.strictEqual(out.groups.fix.length, 0);
  assert.strictEqual(out.groups.build.length, 0);
  assert.strictEqual(out.groups.chore.length, 0);
  assert.strictEqual(out.groups["egyéb"].length, 0);
  // a kiszűrt MR-ek jelezve az outputban (nem néma dobás)
  assert.ok(Array.isArray(out.excludedNonVersioned));
  assert.strictEqual(out.excludedNonVersioned.length, 4);
  const exBranches = out.excludedNonVersioned.map((m) => m.branch).sort();
  assert.deepStrictEqual(exBranches, [
    "build/COCALC-103_ci_cache_kulcs",
    "chore/COCALC-105_dependency_bump",
    "fix/COCALC-102_null_pointer_a_feltoltesnel",
    "hotfix-no-ticket",
  ]);
  // stderr-figyelmeztetés is (nem néma)
  assert.ok(/kihagyva a csomag-naplóból/i.test(stderr.text()), stderr.text());
});

test("collect (COCALC-243): ha minden range-beli MR kiesik a szűrésen -> mrCount 0, megkülönböztetett stderr (NEM a squash/ff üzenet)", async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  const code = await run([], {
    git: fakeGit(GIT_MATCHERS_FILTER),
    glabFixturePath: path.join(FIXTURES_DIR, "glab-mr-list.json"),
    configText: CONFIG_MD_MIN,
    manifestText: JSON.stringify({ versioned: [".nincs-ilyen/"], repo_local_exceptions: [] }),
    stdout,
    stderr,
  });
  assert.strictEqual(code, 0);
  const out = JSON.parse(stdout.text());
  assert.strictEqual(out.mrCount, 0);
  assert.strictEqual(out.excludedNonVersioned.length, 6);
  const err = stderr.text();
  assert.ok(/útvonal-szűrés után/i.test(err), err);
  assert.ok(!/squash\/ff-merge/i.test(err), err);
});

test("collect (COCALC-243): olvashatatlan/érvénytelen manifest -> fail-open, minden MR bekerül + 'nem olvasható vagy érvénytelen' figyelmeztetés", async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  const code = await run([], {
    git: fakeGit(GIT_MATCHERS_6),
    glabFixturePath: path.join(FIXTURES_DIR, "glab-mr-list.json"),
    configText: CONFIG_MD_MIN,
    manifestText: "{ ez nem valid json",
    stdout,
    stderr,
  });
  assert.strictEqual(code, 0);
  const out = JSON.parse(stdout.text());
  assert.strictEqual(out.mrCount, 6);
  assert.ok(!("excludedNonVersioned" in out));
  assert.ok(/nem olvasható vagy érvénytelen/i.test(stderr.text()), stderr.text());
  assert.ok(/útvonal-szűrés kimarad/i.test(stderr.text()), stderr.text());
});

test("collect (COCALC-243): érvényes manifest, de ÜRES 'versioned' lista -> fail-open + külön ('üres') figyelmeztetés, nem a 'nem olvasható' szöveg", async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  const code = await run([], {
    git: fakeGit(GIT_MATCHERS_6),
    glabFixturePath: path.join(FIXTURES_DIR, "glab-mr-list.json"),
    configText: CONFIG_MD_MIN,
    manifestText: JSON.stringify({ versioned: [], repo_local_exceptions: [] }),
    stdout,
    stderr,
  });
  assert.strictEqual(code, 0);
  const out = JSON.parse(stdout.text());
  assert.strictEqual(out.mrCount, 6);
  assert.ok(!("excludedNonVersioned" in out));
  const err = stderr.text();
  assert.ok(/'versioned' listája üres/i.test(err), err);
  assert.ok(!/nem olvasható vagy érvénytelen/i.test(err), err);
});

test("collect (COCALC-243): a merge-commit diff hibája -> az MR fail-open bekerül, figyelmeztetéssel", async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  // nincs 'diff --name-only' matcher -> a git-hívás dob minden MR-nél
  const code = await run([], {
    git: fakeGit(GIT_MATCHERS_6),
    glabFixturePath: path.join(FIXTURES_DIR, "glab-mr-list.json"),
    configText: CONFIG_MD_MIN,
    manifestText: FILTER_MANIFEST,
    stdout,
    stderr,
  });
  assert.strictEqual(code, 0);
  const out = JSON.parse(stdout.text());
  assert.strictEqual(out.mrCount, 6);
  assert.ok(!("excludedNonVersioned" in out));
  assert.ok(/nem állapíthatók meg/i.test(stderr.text()), stderr.text());
});

// --- futtatás vége -------------------------------------------------------

Promise.all(pending).then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
});
