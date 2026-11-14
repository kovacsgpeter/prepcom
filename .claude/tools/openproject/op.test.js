#!/usr/bin/env node
"use strict";
/**
 * Plain-assert tesztek az OpenProject tracker-CLI-hez (op.js).
 *
 * Nem használ teszt-keretrendszert — a changelog/collect.test.js stílusában. Az élő
 * OpenProject SOSEM hívódik: a fetch egy kézzel írt, útvonal-alapú mock.
 *
 * Futtatás:  node op.test.js
 */

const assert = require("assert");
const { run, parseArgs, keysFromMergeMessage, WIKI_RUBY, WIKI_RUNNER_CMD } = require("./op");

const BASE = "https://op.example";

function mockApi(routes) {
  const calls = [];
  const fetch = async (url, init) => {
    const u = new URL(url);
    const method = (init && init.method) || "GET";
    const body = init && init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: u.pathname, query: u.searchParams, body });
    const handler = routes[`${method} ${u.pathname}`];
    if (!handler) return { ok: false, status: 404, statusText: "Not Found", text: async () => JSON.stringify({ message: `nincs mock: ${method} ${u.pathname}` }) };
    const res = typeof handler === "function" ? handler({ body, query: u.searchParams }) : handler;
    const status = res && res.__status ? res.__status : 200;
    return { ok: status < 400, status, statusText: "", text: async () => JSON.stringify(res) };
  };
  return { fetch, calls };
}

const statuses = { _embedded: { elements: [
  { id: 2, name: "To Do", _links: { self: { href: "/api/v3/statuses/2" } } },
  { id: 3, name: "In Progress", _links: { self: { href: "/api/v3/statuses/3" } } },
  { id: 4, name: "review", _links: { self: { href: "/api/v3/statuses/4" } } }
] } };
const types = { _embedded: { elements: [
  { id: 1, name: "Task", _links: { self: { href: "/api/v3/types/1" } } },
  { id: 2, name: "Sub-task", _links: { self: { href: "/api/v3/types/2" } } }
] } };
const form = { _embedded: { schema: {
  customField1: { name: "Jira key" },
  customField2: { name: "Labels", _embedded: { allowedValues: [
    { value: "claude", _links: { self: { href: "/api/v3/custom_options/10" } } },
    { value: "claude-created", _links: { self: { href: "/api/v3/custom_options/11" } } },
    { value: "workflow-flagged", _links: { self: { href: "/api/v3/custom_options/12" } } }
  ] } }
} } };
const wp = (over = {}) => ({
  id: 77, displayId: "PROJ-77", subject: "Teszt", lockVersion: 3, updatedAt: "2026-10-23T10:00:00Z",
  description: { raw: "leírás" }, customField1: "PROJ-77",
  _links: {
    self: { href: "/api/v3/work_packages/77" },
    status: { title: "To Do" }, type: { title: "Task" }, priority: { title: "Medium" },
    assignee: { title: "Claude Agent" }, parent: { href: null },
    customField2: [{ title: "claude" }]
  },
  ...over
});

function deps(fetch, extra = {}) {
  const out = [];
  return {
    out,
    d: {
      env: { OPENPROJECT_API_TOKEN: "t0k", OPENPROJECT_URL: BASE },
      fetch,
      readFile: () => { throw new Error("nincs fájl"); },
      readStdin: () => "stdin-szöveg",
      out: (s) => out.push(s),
      ...extra
    }
  };
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test("parseArgs: pozicionális, értékes és flag kapcsolók", () => {
  const { positional, opts } = parseArgs(["get", "PROJ-1", "--scope", "comments", "--json"]);
  assert.deepStrictEqual(positional, ["get", "PROJ-1"]);
  assert.deepStrictEqual(opts, { scope: "comments", json: true });
});

test("hiányzó token: érthető hibaüzenet", async () => {
  const { d } = deps(async () => assert.fail("nem hívhat API-t"));
  d.env = { OPENPROJECT_URL: BASE };
  await assert.rejects(run(["whoami"], d), /Nincs API token/);
});

test("hiányzó példány-cím: érthető hibaüzenet (nincs beégetett alapérték)", async () => {
  const { d } = deps(async () => assert.fail("nem hívhat API-t"));
  d.env = { OPENPROJECT_API_TOKEN: "t" };
  await assert.rejects(run(["whoami"], d), /Nincs OpenProject-cím/);
});

test("create: típus, label, felelős és szülő feloldása, Basic auth", async () => {
  const api = mockApi({
    "GET /api/v3/projects/PROJ/types": types,
    "POST /api/v3/projects/PROJ/work_packages/form": form,
    "GET /api/v3/users/me": { _links: { self: { href: "/api/v3/users/5" } } },
    "GET /api/v3/work_packages/PROJ-1": wp({ id: 1, displayId: "PROJ-1" }),
    "POST /api/v3/projects/PROJ/work_packages": ({ body }) => wp({ displayId: "PROJ-78", subject: body.subject })
  });
  const { d, out } = deps(api.fetch);
  const code = await run(["create", "--project", "proj", "--type", "Sub-task", "--subject", "Új", "--description", "D",
    "--labels", "claude-created,claude", "--assignee", "me", "--parent", "PROJ-1"], d);
  assert.strictEqual(code, 0);
  const post = api.calls.find((c) => c.method === "POST" && c.path === "/api/v3/projects/PROJ/work_packages");
  assert.deepStrictEqual(post.body, {
    subject: "Új",
    description: { format: "markdown", raw: "D" },
    _links: {
      type: { href: "/api/v3/types/2" },
      assignee: { href: "/api/v3/users/5" },
      parent: { href: "/api/v3/work_packages/1" },
      customField2: [{ href: "/api/v3/custom_options/11" }, { href: "/api/v3/custom_options/10" }]
    }
  });
  assert.strictEqual(JSON.parse(out[0]).url, `${BASE}/wp/PROJ-78`);
});

test("create: ismeretlen label → hiba a lehetséges értékekkel", async () => {
  const api = mockApi({
    "GET /api/v3/projects/PROJ/types": types,
    "POST /api/v3/projects/PROJ/work_packages/form": form
  });
  const { d } = deps(api.fetch);
  await assert.rejects(run(["create", "--project", "PROJ", "--type", "Task", "--subject", "x", "--labels", "nincs"], d),
    /Ismeretlen label: "nincs".*claude, claude-created, workflow-flagged/);
});

test("transition: státusz név szerint (kis-/nagybetű független), lockVersion-nel", async () => {
  const api = mockApi({
    "GET /api/v3/statuses": statuses,
    "GET /api/v3/work_packages/PROJ-77": wp(),
    "PATCH /api/v3/work_packages/77": ({ body }) => wp({ _links: { ...wp()._links, status: { title: "review" } }, __body: body })
  });
  const { d, out } = deps(api.fetch);
  await run(["transition", "PROJ-77", "REVIEW"], d);
  const patch = api.calls.find((c) => c.method === "PATCH");
  assert.deepStrictEqual(patch.body, { lockVersion: 3, _links: { status: { href: "/api/v3/statuses/4" } } });
  assert.strictEqual(JSON.parse(out[0]).status, "review");
});

test("transition: ismeretlen státusz → hiba, nincs PATCH", async () => {
  const api = mockApi({ "GET /api/v3/statuses": statuses });
  const { d } = deps(api.fetch);
  await assert.rejects(run(["transition", "PROJ-77", "Kész"], d), /Ismeretlen státusz: "Kész"/);
  assert.ok(!api.calls.some((c) => c.method === "PATCH"));
});

test("update: --add-labels / --remove-labels a meglévő labelekből számol", async () => {
  const api = mockApi({
    "POST /api/v3/projects/PROJ/work_packages/form": form,
    "GET /api/v3/work_packages/PROJ-77": wp(),
    "PATCH /api/v3/work_packages/77": wp()
  });
  const { d } = deps(api.fetch);
  await run(["update", "PROJ-77", "--add-labels", "workflow-flagged", "--remove-labels", "CLAUDE"], d);
  const patch = api.calls.find((c) => c.method === "PATCH");
  assert.deepStrictEqual(patch.body._links.customField2, [{ href: "/api/v3/custom_options/12" }]);
});

test("update: --parent szülőt állít, --parent none törli", async () => {
  const api = mockApi({
    "GET /api/v3/work_packages/PROJ-1": wp({ id: 1, displayId: "PROJ-1" }),
    "GET /api/v3/work_packages/PROJ-77": wp(),
    "PATCH /api/v3/work_packages/77": wp()
  });
  const { d } = deps(api.fetch);
  await run(["update", "PROJ-77", "--parent", "PROJ-1"], d);
  const set = api.calls.find((c) => c.method === "PATCH");
  assert.deepStrictEqual(set.body, { lockVersion: 3, _links: { parent: { href: "/api/v3/work_packages/1" } } });

  const clearApi = mockApi({
    "GET /api/v3/work_packages/PROJ-77": wp(),
    "PATCH /api/v3/work_packages/77": wp()
  });
  await run(["update", "PROJ-77", "--parent", "none"], deps(clearApi.fetch).d);
  const clear = clearApi.calls.find((c) => c.method === "PATCH");
  assert.deepStrictEqual(clear.body, { lockVersion: 3, _links: { parent: { href: null } } });
  assert.ok(!clearApi.calls.some((c) => c.path === "/api/v3/work_packages/none"), "a none nem ticket-kulcs: nem lehet GET-elni");
});

test("update: nem létező szülő-kulcs → érthető hiba, nincs PATCH", async () => {
  const api = mockApi({
    "GET /api/v3/work_packages/PROJ-77": wp(),
    "GET /api/v3/work_packages/PROJ-999": { __status: 404, message: "The requested resource could not be found." }
  });
  const { d } = deps(api.fetch);
  await assert.rejects(run(["update", "PROJ-77", "--parent", "PROJ-999"], d), /szülő.*PROJ-999/);
  assert.ok(!api.calls.some((c) => c.method === "PATCH"));
});

test("update: érték nélküli --parent → használati hiba, nincs API-hívás", async () => {
  const { d } = deps(async () => assert.fail("nem hívhat API-t"));
  await assert.rejects(run(["update", "PROJ-77", "--parent"], d), (e) => e.constructor.name === "UsageError");
});

test("comment: --stdin szövege megy az activities végpontra", async () => {
  const api = mockApi({
    "GET /api/v3/work_packages/PROJ-77": wp(),
    "POST /api/v3/work_packages/77/activities": {}
  });
  const { d } = deps(api.fetch);
  await run(["comment", "PROJ-77", "--stdin"], d);
  const post = api.calls.find((c) => c.method === "POST");
  assert.deepStrictEqual(post.body, { comment: { raw: "stdin-szöveg" } });
});

test("comment: üres szöveg → használati hiba (2-es kód ága)", async () => {
  const { d } = deps(async () => assert.fail("nem hívhat API-t"));
  await assert.rejects(run(["comment", "PROJ-77"], d), (e) => e.constructor.name === "UsageError");
});

test("search: státusz + label + not-label + felelős szűrők, prioritás szerint", async () => {
  const api = mockApi({
    "GET /api/v3/statuses": statuses,
    "POST /api/v3/projects/PROJ/work_packages/form": form,
    "GET /api/v3/principals": { _embedded: { elements: [{ login: "claude-agent", name: "Claude Agent", _links: { self: { href: "/api/v3/users/5" } } }] } },
    "GET /api/v3/projects/PROJ/work_packages": { _embedded: { elements: [wp()] } }
  });
  const { d, out } = deps(api.fetch);
  await run(["search", "--project", "PROJ", "--status", "To Do", "--label", "claude", "--not-label", "workflow-flagged",
    "--assignee", "claude-agent"], d);
  const q = api.calls.find((c) => c.path === "/api/v3/projects/PROJ/work_packages").query;
  assert.deepStrictEqual(JSON.parse(q.get("filters")), [
    { status_id: { operator: "=", values: ["2"] } },
    { assignee: { operator: "=", values: ["5"] } },
    { customField2: { operator: "=", values: ["10"] } },
    { customField2: { operator: "!", values: ["12"] } }
  ]);
  assert.deepStrictEqual(JSON.parse(q.get("sortBy")), [["priority", "desc"], ["id", "asc"]]);
  assert.match(out[0], /^PROJ-77\t\[To Do\]\tMedium\tTask\tClaude Agent\tTeszt$/);
});

test("search: --label --project nélkül → használati hiba", async () => {
  const api = mockApi({ "GET /api/v3/statuses": statuses });
  const { d } = deps(api.fetch);
  await assert.rejects(run(["search", "--label", "claude"], d), /--project is kell/);
});

test("get: leírás, gyerekek, kapcsolatok kulccsal, kommentek szerzővel", async () => {
  const api = mockApi({
    "GET /api/v3/work_packages/PROJ-77": wp(),
    "POST /api/v3/projects/PROJ/work_packages/form": form,
    "GET /api/v3/work_packages": { _embedded: { elements: [wp({ displayId: "PROJ-80", subject: "Gyerek" })] } },
    "GET /api/v3/work_packages/77/relations": { _embedded: { elements: [
      { type: "blocks", reverseType: "blocked", _links: { from: { href: "/api/v3/work_packages/77" }, to: { href: "/api/v3/work_packages/90", title: "Másik" } } }
    ] } },
    "GET /api/v3/work_packages/90": wp({ id: 90, displayId: "PROJ-90" }),
    "GET /api/v3/work_packages/77/activities": { _embedded: { elements: [
      { comment: { raw: "" }, _links: { user: { href: "/api/v3/users/5" } } },
      { comment: { raw: "Hello" }, createdAt: "2026-10-23T11:00:00Z", _links: { user: { href: "/api/v3/users/5" } } }
    ] } },
    "GET /api/v3/users/5": { name: "Claude Agent" }
  });
  const { d, out } = deps(api.fetch);
  await run(["get", "PROJ-77", "--json"], d);
  const t = JSON.parse(out[0]);
  assert.strictEqual(t.description, "leírás");
  assert.deepStrictEqual(t.labels, ["claude"]);
  assert.strictEqual(t.jiraKey, "PROJ-77");
  assert.deepStrictEqual(t.children.map((c) => c.key), ["PROJ-80"]);
  assert.deepStrictEqual(t.relations, [{ type: "blocks", key: "PROJ-90", subject: "Másik" }]);
  assert.deepStrictEqual(t.comments, [{ author: "Claude Agent", createdAt: "2026-10-23T11:00:00Z", text: "Hello" }]);
});

test("API-hiba: az OpenProject üzenete a státuszkóddal együtt jön vissza", async () => {
  const api = mockApi({ "GET /api/v3/work_packages/PROJ-1": { __status: 404, message: "nem található" } });
  const { d } = deps(api.fetch);
  await assert.rejects(run(["get", "PROJ-1"], d), /OpenProject 404 .*nem található/);
});

test("keysFromMergeMessage: branch-kulcs + closing-kulcsszavak, duplikáció nélkül", () => {
  const msg = "Merge branch 'feature/PROJ-206_flyway_migracio' into 'master'\n\nPROJ-206: x\n\nCloses PROJ-205, fixes ORD-7\nRelates PROJ-1\nSee merge request group/repo!12";
  assert.deepStrictEqual(keysFromMergeMessage(msg), ["PROJ-206", "PROJ-205", "ORD-7"]);
  assert.deepStrictEqual(keysFromMergeMessage("chore: sima commit, nincs kulcs"), []);
});

test("done-on-merge: lezárja a nyitottat, kihagyja a már lezártat és a nyitott gyerekes szülőt", async () => {
  const closedWp = wp({ id: 2, displayId: "PROJ-2", _links: { ...wp()._links, status: { title: "Done" } } });
  const openWp = wp({ id: 3, displayId: "PROJ-3", _links: { ...wp()._links, status: { title: "review" } } });
  const parentWp = wp({ id: 4, displayId: "PROJ-4", _links: { ...wp()._links, status: { title: "review" } } });
  const api = mockApi({
    "GET /api/v3/work_packages/PROJ-2": closedWp,
    "GET /api/v3/work_packages/PROJ-3": openWp,
    "GET /api/v3/work_packages/PROJ-4": parentWp,
    "POST /api/v3/projects/PROJ/work_packages/form": form,
    "GET /api/v3/work_packages": ({ query }) => {
      const parent = JSON.parse(query.get("filters"))[0].parent.values[0];
      return { _embedded: { elements: parent === "4" ? [wp({ displayId: "PROJ-5", _links: { ...wp()._links, status: { title: "In Progress" } } })] : [] } };
    },
    "GET /api/v3/work_packages/2/relations": { _embedded: { elements: [] } },
    "GET /api/v3/work_packages/3/relations": { _embedded: { elements: [] } },
    "GET /api/v3/work_packages/4/relations": { _embedded: { elements: [] } },
    "GET /api/v3/work_packages/2/activities": { _embedded: { elements: [] } },
    "GET /api/v3/work_packages/3/activities": { _embedded: { elements: [] } },
    "GET /api/v3/work_packages/4/activities": { _embedded: { elements: [] } },
    "GET /api/v3/statuses": { _embedded: { elements: [{ id: 9, name: "Done", _links: { self: { href: "/api/v3/statuses/9" } } }] } },
    "PATCH /api/v3/work_packages/3": wp({ displayId: "PROJ-3", _links: { ...wp()._links, status: { title: "Done" } } }),
    "POST /api/v3/work_packages/3/activities": {}
  });
  const { d, out } = deps(api.fetch);
  await run(["done-on-merge", "--message", "Merge branch 'fix/PROJ-3_x' into 'master'\n\nCloses PROJ-2\nCloses PROJ-4"], d);
  const res = JSON.parse(out[0]);
  assert.deepStrictEqual(res.map((x) => [x.key, x.action]), [["PROJ-3", "closed"], ["PROJ-2", "skip"], ["PROJ-4", "skip"]]);
  assert.match(res[2].reason, /nyitott gyerek: PROJ-5 \[In Progress\]/);
  assert.strictEqual(api.calls.filter((c) => c.method === "PATCH").length, 1);
});

// --- wiki (COCALC-913): az exec-réteg mock, rails runner/docker/ssh sosem fut -------------

/** exec-mock: `docker inspect` → running?; a futtató hívás a kérést dekódolja és `reply`-t ad. */
function mockExec({ running = true, reply, raw }) {
  const calls = [];
  const exec = (cmd, args, input) => {
    calls.push({ cmd, args, input });
    if (cmd === "docker" && args[0] === "inspect") return running ? { status: 0, stdout: "true\n" } : { status: 1, stdout: "", stderr: "No such object" };
    const [script, payload] = input.trim().split("\n").map((l) => Buffer.from(l, "base64").toString("utf8"));
    calls[calls.length - 1].script = script;
    calls[calls.length - 1].request = JSON.parse(payload);
    if (raw) return raw;
    return { status: 0, stdout: `DEPRECATION zaj\nOPWIKI-RESULT ${JSON.stringify(reply(JSON.parse(payload)))}\n`, stderr: "" };
  };
  return { exec, calls };
}

const wikiDeps = (exec, extra = {}) => deps(() => { throw new Error("a wiki nem hívhat fetch-et"); },
  { exec, env: { OPENPROJECT_URL: BASE + "/" }, ...extra });

test("wiki put: helyi docker exec, az adat csak stdin-en (base64-JSON), URL a sluggal", async () => {
  const title = `Döntés '$(rm -rf ~)' "x"`;
  const text = "# Cím\n\nidézőjel ' és $HOME `id`\n";
  const ex = mockExec({ reply: (req) => ({ ok: true, project: "EEAS", result: { title: req.page, slug: "dontes-rm-rf-x", parent: "Wiki", updatedAt: "2026-10-25T10:00:00Z", action: "created" } }) });
  const { d, out } = wikiDeps(ex.exec, { readFile: (f) => (f === "a.md" ? text : assert.fail(f)) });
  assert.strictEqual(await run(["wiki", "put", "--project", "EEAS", "--page", title, "--parent", "Wiki", "--file", "a.md"], d), 0);
  const call = ex.calls[1];
  assert.deepStrictEqual([call.cmd, call.args], ["docker", ["exec", "-i", "openproject-web-1", "bash", "-c", WIKI_RUNNER_CMD]]);
  assert.ok(!call.args.join(" ").includes("rm -rf") && !call.args.join(" ").includes("HOME"), "felhasználói adat nem kerülhet a parancssorba");
  assert.strictEqual(call.script, WIKI_RUBY);
  assert.deepStrictEqual(call.request, { login: "claude-agent", project: "EEAS", op: "put", page: title, text, parent: "Wiki" });
  assert.strictEqual(out[0], `created: ${BASE}/projects/EEAS/wiki/dontes-rm-rf-x`);
});

test("wiki put: stdin-ről olvas, --parent nélkül nem küld szülőt; üres szöveg → használati hiba", async () => {
  const ex = mockExec({ reply: () => ({ ok: true, project: "EEAS", result: { title: "T", slug: "t", parent: null, updatedAt: "x", action: "unchanged" } }) });
  const { d, out } = wikiDeps(ex.exec);
  await run(["wiki", "put", "--project", "EEAS", "--page", "T", "--json"], d);
  assert.strictEqual(ex.calls[1].request.text, "stdin-szöveg");
  assert.ok(!("parent" in ex.calls[1].request));
  assert.deepStrictEqual(JSON.parse(out[0]), { title: "T", slug: "t", parent: null, updatedAt: "x", action: "unchanged", url: `${BASE}/projects/EEAS/wiki/t` });
  const empty = wikiDeps(ex.exec, { readStdin: () => "  \n" });
  await assert.rejects(run(["wiki", "put", "--project", "EEAS", "--page", "T"], empty.d), /Üres oldal-szöveg/);
});

test("wiki: nem helyi konténer → ssh a beállított hostra, konténer/login a configból; token nem kell", async () => {
  const ex = mockExec({ running: false, reply: () => ({ ok: true, project: "EEAS", result: [
    { title: "Wiki", slug: "wiki", parent: null, updatedAt: "2026-10-01T00:00:00Z" },
    { title: "ADR", slug: "adr", parent: "Wiki", updatedAt: "2026-10-02T00:00:00Z" }] }) });
  const files = { wiki_ssh_host: "linux@op-host\n", wiki_container: "op-web", wiki_login: "bot" };
  const { d, out } = wikiDeps(ex.exec, { env: { OPENPROJECT_URL: BASE, HOME: "/h" },
    readFile: (f) => { const k = f.split(/[\\/]/).pop(); if (k in files) return files[k]; throw new Error("nincs"); } });
  await run(["wiki", "list", "--project", "EEAS"], d);
  assert.deepStrictEqual(ex.calls[0].args, ["inspect", "-f", "{{.State.Running}}", "op-web"]);
  const { cmd, args, request } = ex.calls[1];
  assert.strictEqual(cmd, "ssh");
  assert.deepStrictEqual(args.slice(0, 4), ["-o", "BatchMode=yes", "--", "linux@op-host"]);
  const boot = WIKI_RUNNER_CMD.split("'")[1];
  assert.strictEqual(args[4], `docker exec -i op-web bash -c 'cd /app && bundle exec rails runner '\\''${boot}'\\'''`);
  assert.deepStrictEqual(request, { login: "bot", project: "EEAS", op: "list" });
  assert.strictEqual(out[0], "Wiki\t—\t2026-10-01T00:00:00Z\nADR\tWiki\t2026-10-02T00:00:00Z");
});

test("wiki: nincs helyi konténer és nincs SSH-host → érthető használati hiba; rossz konténer/host elutasítva", async () => {
  const ex = mockExec({ running: false, reply: () => assert.fail("nem futhat") });
  await assert.rejects(run(["wiki", "list", "--project", "EEAS"], wikiDeps(ex.exec).d), /OPENPROJECT_WIKI_SSH_HOST/);
  const bad = wikiDeps(ex.exec, { env: { OPENPROJECT_URL: BASE, OPENPROJECT_WIKI_CONTAINER: "x; rm -rf /" } });
  await assert.rejects(run(["wiki", "list", "--project", "EEAS"], bad.d), /Érvénytelen OPENPROJECT_WIKI_CONTAINER/);
  const badHost = wikiDeps(ex.exec, { env: { OPENPROJECT_URL: BASE, OPENPROJECT_WIKI_SSH_HOST: "-oProxyCommand=x" } });
  await assert.rejects(run(["wiki", "list", "--project", "EEAS"], badHost.d), /Érvénytelen OPENPROJECT_WIKI_SSH_HOST/);
});

test("wiki get: alapból a nyers markdown; Ruby-oldali hiba és hiányzó eredmény-sor → hiba", async () => {
  const ex = mockExec({ reply: (req) => ({ ok: true, project: "EEAS", result: { title: req.page, slug: "x", parent: null, updatedAt: "t", text: "# szöveg" } }) });
  const { d, out } = wikiDeps(ex.exec);
  await run(["wiki", "get", "--project", "EEAS", "--page", "X"], d);
  assert.strictEqual(out[0], "# szöveg");
  assert.deepStrictEqual(ex.calls[1].request, { login: "claude-agent", project: "EEAS", op: "get", page: "X" });
  const err = mockExec({ reply: () => ({ ok: false, error: "RuntimeError: Nincs ilyen wiki oldal a(z) EEAS projektben: X" }) });
  await assert.rejects(run(["wiki", "get", "--project", "EEAS", "--page", "X"], wikiDeps(err.exec).d), /Nincs ilyen wiki oldal/);
  const crash = mockExec({ raw: { status: 1, stdout: "", stderr: "bundler: command not found\n" } });
  await assert.rejects(run(["wiki", "get", "--project", "EEAS", "--page", "X"], wikiDeps(crash.exec).d), /nincs eredmény \(kilépőkód 1\)\nbundler/);
  await assert.rejects(run(["wiki", "get", "--project", "EEAS"], wikiDeps(ex.exec).d), /Hiányzó kapcsoló: --page/);
  await assert.rejects(run(["wiki", "nope", "--project", "EEAS"], wikiDeps(ex.exec).d), /Ismeretlen wiki-alparancs/);
});

test("wiki: a rails runner bootstrap fix és aposztróf-mentes (shellbe idézhető)", () => {
  assert.match(WIKI_RUNNER_CMD, /^cd \/app && bundle exec rails runner '[^']+'$/);
  assert.match(WIKI_RUBY, /OPWIKI-RESULT/);
});

(async () => {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`ok   ${t.name}`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${t.name}\n     ${e.stack.split("\n").slice(0, 3).join("\n     ")}`);
    }
  }
  console.log(`\n${tests.length - failed}/${tests.length} teszt sikeres`);
  process.exit(failed ? 1 : 0);
})();
