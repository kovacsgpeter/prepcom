#!/usr/bin/env node
"use strict";
/**
 * OpenProject tracker-CLI — a `tracker-adapter.md` absztrakt műveleteinek
 * `TRACKER_BACKEND=openproject` leképezése (az OpenProject API v3 fölött).
 *
 * A Community kiadás beépített MCP-szervere Enterprise-licenchez kötött, ezért a
 * workflow ezt a szkriptet hívja Bash-ből (fő szál és subagentek egyaránt).
 *
 * Tiszta Node core (18+, globális fetch), nincs npm-függőség. Az élő API a
 * `run(argv, deps)` belépőn keresztül injektálható (teszthez).
 *
 * Kapcsolat (a példány címe repo-lokális adat: config.md `OPENPROJECT_URL`):
 *   OPENPROJECT_URL        a példány címe; ha nincs, a ~/.config/openproject/url fájlból olvas
 *   OPENPROJECT_API_TOKEN  API token; ha nincs, a ~/.config/openproject/token fájlból olvas
 *
 * Wiki (COCALC-913): az API v3 wiki oldalt nem tud létrehozni/frissíteni, ezért a `wiki`
 * alparancsok a web-konténerben futó `rails runner`-en át dolgoznak — helyben
 * `docker exec -i <konténer>`, ha a konténer ezen a gépen fut, különben `ssh <host>` után
 * ugyanez. Minden felhasználói adat (cím, szöveg) base64-JSON-ként stdin-en megy, a
 * parancssorba nem kerül. Beállítások (env var, különben ~/.config/openproject/<fájl>):
 *   OPENPROJECT_WIKI_SSH_HOST   (wiki_ssh_host)   pl. felhasznalo@openproject-host; csak ha a konténer nem helyi
 *   OPENPROJECT_WIKI_CONTAINER  (wiki_container)  alap: openproject-web-1
 *   OPENPROJECT_WIKI_LOGIN      (wiki_login)      a műveletet végző felhasználó; alap: claude-agent
 *
 * Kilépőkód: 0 = siker; 1 = API-/üzleti hiba (pl. nem létező ticket, ismeretlen
 * státusz); 2 = használati hiba.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const LABELS_FIELD = "Labels";
const JIRA_KEY_FIELD = "Jira key";

const HELP = `OpenProject tracker-CLI (tracker-adapter.md, TRACKER_BACKEND=openproject)

  node op.js whoami
  node op.js get <KULCS> [--scope all|description|status|comments] [--json]
  node op.js create --project <P> --type <típus> --subject <cím>
                    [--description <szöveg> | --description-file <fájl>]
                    [--labels a,b] [--parent <KULCS>] [--assignee <login|név|me>] [--status <név>]
  node op.js update <KULCS> [--subject <cím>] [--description <szöveg> | --description-file <fájl>]
                    [--labels a,b] [--add-labels a,b] [--remove-labels a,b] [--assignee <login|név|me|none>]
                    [--parent <KULCS|none>]
  node op.js transition <KULCS> <státusznév>
  node op.js comment <KULCS> (--text <szöveg> | --file <fájl> | --stdin)
  node op.js link <FORRÁS> <CÉL> [--type blocks|relates|follows|precedes|duplicates|includes|requires]
  node op.js search [--project <P>] [--status a,b] [--not-status a,b] [--label a,b] [--not-label a,b]
                    [--assignee <login|név|me>] [--type a,b] [--parent <KULCS>]
                    [--updated-before-days <N>] [--sort priority|updated|id] [--limit <N>] [--json]
  node op.js done-on-merge --message <merge-commit üzenet> [--done-status Done] [--dry-run]
  node op.js wiki list --project <P> [--json]
  node op.js wiki get --project <P> --page <cím> [--json]
  node op.js wiki put --project <P> --page <cím> [--parent <cím>] [--file <md>]   (--file nélkül: stdin)

A <KULCS> a projekt-előtagos azonosító (pl. COCALC-241). Az ismétlődő értékek
(státusz, label, típus) vesszővel választhatók el.

A wiki-parancsok a web-konténerben futó rails runner-en át dolgoznak (helyben docker exec,
különben ssh: OPENPROJECT_WIKI_SSH_HOST); a "wiki put" cím szerint idempotens
(létrehoz vagy frissít), és kiírja az oldal URL-jét.`;

class UsageError extends Error {}

function parseArgs(argv) {
  const positional = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        opts[key] = true;
      } else {
        opts[key] = next;
        i++;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, opts };
}

const list = (v) => (v === undefined || v === true ? [] : String(v).split(",").map((s) => s.trim()).filter(Boolean));

function readSetting(env, readFile, envName, fileName, what) {
  if (env[envName]) return env[envName].trim();
  const file = path.join(env.HOME || env.USERPROFILE || os.homedir(), ".config", "openproject", fileName);
  try {
    return readFile(file).trim();
  } catch {
    throw new UsageError(`Nincs ${what}: állítsd be az ${envName} változót, vagy írd ide: ${file}`);
  }
}

function readOptionalSetting(env, readFile, envName, fileName, fallback) {
  if (env[envName] && env[envName].trim()) return env[envName].trim();
  const file = path.join(env.HOME || env.USERPROFILE || os.homedir(), ".config", "openproject", fileName);
  try {
    return readFile(file).trim() || fallback;
  } catch {
    return fallback;
  }
}

function makeClient({ baseUrl, token, fetchImpl }) {
  const auth = "Basic " + Buffer.from(`apikey:${token}`).toString("base64");
  async function request(method, href, body) {
    const url = href.startsWith("http") ? href : baseUrl + (href.startsWith("/api/") ? href : `/api/v3${href}`);
    const res = await fetchImpl(url, {
      method,
      headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/hal+json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const msg = (data && (data.message || (data._embedded && data._embedded.errors || []).map((e) => e.message).join("; "))) || res.statusText;
      const err = new Error(`OpenProject ${res.status} (${method} ${href}): ${msg}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }
  return {
    get: (href) => request("GET", href),
    post: (href, body) => request("POST", href, body),
    patch: (href, body) => request("PATCH", href, body)
  };
}

/** Lekérdezés-szintű gyorsítótár a név → href feloldásokhoz. */
function makeResolver(api) {
  const cache = {};
  const memo = (key, fn) => (cache[key] ||= fn());

  const statuses = () => memo("statuses", async () => (await api.get("/statuses"))._embedded.elements);
  const priorities = () => memo("priorities", async () => (await api.get("/priorities"))._embedded.elements);
  const projectTypes = (p) => memo(`types:${p}`, async () => (await api.get(`/projects/${encodeURIComponent(p)}/types`))._embedded.elements);
  const form = (p) => memo(`form:${p}`, async () => (await api.post(`/projects/${encodeURIComponent(p)}/work_packages/form`, {}))._embedded.schema);

  async function byName(items, name, what) {
    const hit = items.find((x) => x.name.toLowerCase() === String(name).toLowerCase());
    if (!hit) throw new Error(`Ismeretlen ${what}: "${name}". Lehetséges értékek: ${items.map((x) => x.name).join(", ")}`);
    return hit;
  }

  async function customFieldKey(project, fieldName) {
    const schema = await form(project);
    const key = Object.keys(schema).find((k) => k.startsWith("customField") && schema[k].name === fieldName);
    if (!key) throw new Error(`A(z) "${fieldName}" egyedi mező nincs bekapcsolva a(z) ${project} projektben`);
    return key;
  }

  async function labelOptions(project) {
    const schema = await form(project);
    const key = await customFieldKey(project, LABELS_FIELD);
    const allowed = (schema[key]._embedded && schema[key]._embedded.allowedValues) || [];
    return { key, options: allowed.map((o) => ({ name: o.value, href: o._links.self.href })) };
  }

  async function labelHrefs(project, names) {
    const { key, options } = await labelOptions(project);
    const hrefs = [];
    for (const n of names) {
      const hit = options.find((o) => o.name.toLowerCase() === n.toLowerCase());
      if (!hit) {
        throw new Error(`Ismeretlen label: "${n}". Lehetséges értékek: ${options.map((o) => o.name).join(", ")} ` +
          "(új labelt az OpenProject admin a Labels egyedi mező értékei közé vehet fel)");
      }
      hrefs.push(hit.href);
    }
    return { key, hrefs };
  }

  async function principal(who) {
    if (who === "me") return (await api.get("/users/me"))._links.self.href;
    const filters = JSON.stringify([{ any_name_attribute: { operator: "~", values: [who] } }]);
    const res = await api.get(`/principals?pageSize=50&filters=${encodeURIComponent(filters)}`);
    const els = res._embedded.elements;
    const exact = els.filter((u) => u.login === who || u.name === who);
    const pick = exact.length ? exact : els;
    if (pick.length !== 1) {
      throw new Error(`A(z) "${who}" felhasználó nem egyértelmű vagy nem létezik (${pick.map((u) => u.login || u.name).join(", ") || "nincs találat"})`);
    }
    return pick[0]._links.self.href;
  }

  return {
    statuses,
    status: async (name) => byName(await statuses(), name, "státusz"),
    priority: async (name) => byName(await priorities(), name, "prioritás"),
    type: async (project, name) => byName(await projectTypes(project), name, `típus a(z) ${project} projektben`),
    customFieldKey,
    labelHrefs,
    principal
  };
}

const projectOfKey = (key) => {
  const m = /^([A-Za-z][A-Za-z0-9_]*)-\d+$/.exec(key);
  if (!m) throw new UsageError(`Érvénytelen ticket-kulcs: "${key}" (várt forma: PROJEKT-123)`);
  return m[1].toUpperCase();
};

async function readText(opts, deps, textKey, fileKey) {
  if (typeof opts[textKey] === "string") return opts[textKey];
  if (typeof opts[fileKey] === "string") return deps.readFile(opts[fileKey]);
  if (opts.stdin) return deps.readStdin();
  return undefined;
}

function summarize(wp) {
  const l = wp._links;
  return {
    key: wp.displayId,
    id: wp.id,
    subject: wp.subject,
    status: l.status && l.status.title,
    type: l.type && l.type.title,
    priority: l.priority && l.priority.title,
    assignee: (l.assignee && l.assignee.title) || null,
    parent: l.parent && l.parent.href ? l.parent.title : null,
    updatedAt: wp.updatedAt
  };
}

function labelsOf(wp, labelKey) {
  const v = labelKey && wp._links[labelKey];
  return Array.isArray(v) ? v.map((x) => x.title) : [];
}

async function cmdGet(api, r, key, opts, baseUrl) {
  const scope = typeof opts.scope === "string" ? opts.scope : "all";
  const wp = await api.get(`/work_packages/${encodeURIComponent(key)}`);
  const project = projectOfKey(wp.displayId || key);
  const labelKey = await r.customFieldKey(project, LABELS_FIELD).catch(() => null);
  const jiraKey = await r.customFieldKey(project, JIRA_KEY_FIELD).catch(() => null);
  if (wp._links.parent && wp._links.parent.href) {
    wp._links.parent.title = `${(await api.get(wp._links.parent.href)).displayId} ${wp._links.parent.title}`;
  }
  const out = { ...summarize(wp), labels: labelsOf(wp, labelKey), jiraKey: (jiraKey && wp[jiraKey]) || null,
    url: `${baseUrl}/wp/${wp.displayId}` };

  if (scope === "all" || scope === "description") out.description = (wp.description && wp.description.raw) || "";
  if (scope === "all") {
    const kids = await api.get(`/work_packages?pageSize=200&filters=${encodeURIComponent(JSON.stringify([{ parent: { operator: "=", values: [String(wp.id)] } }, { status_id: { operator: "*", values: [] } }]))}`);
    out.children = kids._embedded.elements.map(summarize).map(({ key: k, subject, status, type }) => ({ key: k, subject, status, type }));
    const rels = await api.get(`/work_packages/${wp.id}/relations`);
    out.relations = [];
    for (const rel of rels._embedded.elements) {
      const outgoing = rel._links.from.href.endsWith(`/${wp.id}`);
      const other = outgoing ? rel._links.to : rel._links.from;
      const otherKey = (await api.get(other.href)).displayId;
      out.relations.push({ type: outgoing ? rel.type : rel.reverseType, key: otherKey, subject: other.title });
    }
  }
  if (scope === "all" || scope === "comments") {
    const acts = await api.get(`/work_packages/${wp.id}/activities`);
    const users = {};
    const comments = [];
    for (const a of acts._embedded.elements) {
      if (!a.comment || !a.comment.raw) continue;
      const href = a._links.user && a._links.user.href;
      if (href && !(href in users)) users[href] = (await api.get(href).catch(() => ({ name: href }))).name;
      comments.push({ author: users[href] || null, createdAt: a.createdAt, text: a.comment.raw });
    }
    out.comments = comments;
  }
  return out;
}

function renderTicket(t) {
  const lines = [`# ${t.key} — ${t.subject}`, ""];
  lines.push(`| Mező | Érték |`, `|---|---|`);
  for (const [k, v] of [["Státusz", t.status], ["Típus", t.type], ["Prioritás", t.priority], ["Felelős", t.assignee || "—"],
    ["Szülő", t.parent || "—"], ["Labelek", t.labels.join(", ") || "—"], ["Jira key", t.jiraKey || "—"], ["Frissítve", t.updatedAt], ["Link", t.url]]) {
    lines.push(`| ${k} | ${v} |`);
  }
  if (t.description !== undefined) lines.push("", "## Leírás", "", t.description || "_(üres)_");
  if (t.children && t.children.length) {
    lines.push("", "## Gyerek ticketek", "", ...t.children.map((c) => `- ${c.key} [${c.status}] (${c.type}) ${c.subject}`));
  }
  if (t.relations && t.relations.length) {
    lines.push("", "## Kapcsolatok", "", ...t.relations.map((x) => `- ${x.type} ${x.key} ${x.subject}`));
  }
  if (t.comments) {
    lines.push("", `## Kommentek (${t.comments.length})`);
    for (const c of t.comments) lines.push("", `### ${c.author} — ${c.createdAt}`, "", c.text);
  }
  return lines.join("\n");
}

async function cmdCreate(api, r, opts, deps) {
  for (const req of ["project", "type", "subject"]) {
    if (typeof opts[req] !== "string") throw new UsageError(`Hiányzó kapcsoló: --${req}`);
  }
  const project = opts.project.toUpperCase();
  const body = { subject: opts.subject, _links: { type: { href: (await r.type(project, opts.type))._links.self.href } } };
  const description = await readText(opts, deps, "description", "description-file");
  if (description !== undefined) body.description = { format: "markdown", raw: description };
  if (opts.status) body._links.status = { href: (await r.status(opts.status))._links.self.href };
  if (opts.priority) body._links.priority = { href: (await r.priority(opts.priority))._links.self.href };
  if (opts.assignee) body._links.assignee = { href: await r.principal(opts.assignee) };
  if (opts.parent) body._links.parent = { href: `/api/v3/work_packages/${(await api.get(`/work_packages/${encodeURIComponent(opts.parent)}`)).id}` };
  const labels = list(opts.labels);
  if (labels.length) {
    const { key, hrefs } = await r.labelHrefs(project, labels);
    body._links[key] = hrefs.map((href) => ({ href }));
  }
  const wp = await api.post(`/projects/${encodeURIComponent(project)}/work_packages`, body);
  return { key: wp.displayId, url: `${deps.baseUrl}/wp/${wp.displayId}`, status: wp._links.status.title };
}

async function patchWp(api, key, build) {
  const wp = await api.get(`/work_packages/${encodeURIComponent(key)}`);
  const body = { lockVersion: wp.lockVersion, _links: {} };
  await build(body, wp);
  if (!Object.keys(body._links).length) delete body._links;
  return api.patch(`/work_packages/${wp.id}`, body);
}

async function parentHref(api, parentKey) {
  try {
    return `/api/v3/work_packages/${(await api.get(`/work_packages/${encodeURIComponent(parentKey)}`)).id}`;
  } catch (e) {
    if (e.status === 404) throw new Error(`Nem létező szülő-ticket: ${parentKey}`);
    throw e;
  }
}

async function cmdUpdate(api, r, key, opts, deps) {
  if (opts.parent === true) throw new UsageError("A --parent után ticket-kulcs vagy none kell");
  const project = projectOfKey(key);
  const description = await readText(opts, deps, "description", "description-file");
  const updated = await patchWp(api, key, async (body, wp) => {
    if (typeof opts.subject === "string") body.subject = opts.subject;
    if (description !== undefined) body.description = { format: "markdown", raw: description };
    if (opts.assignee === "none") body._links.assignee = { href: null };
    else if (typeof opts.assignee === "string") body._links.assignee = { href: await r.principal(opts.assignee) };
    if (opts.parent === "none") body._links.parent = { href: null };
    else if (typeof opts.parent === "string") body._links.parent = { href: await parentHref(api, opts.parent) };
    if (opts.labels !== undefined || opts["add-labels"] !== undefined || opts["remove-labels"] !== undefined) {
      const labelKey = await r.customFieldKey(project, LABELS_FIELD);
      let names = opts.labels !== undefined ? list(opts.labels) : labelsOf(wp, labelKey);
      names = names.concat(list(opts["add-labels"]).filter((n) => !names.includes(n)));
      const remove = list(opts["remove-labels"]).map((n) => n.toLowerCase());
      names = names.filter((n) => !remove.includes(n.toLowerCase()));
      const { hrefs } = await r.labelHrefs(project, names);
      body._links[labelKey] = hrefs.map((href) => ({ href }));
    }
  });
  return { key: updated.displayId, status: updated._links.status.title };
}

async function cmdTransition(api, r, key, statusName) {
  if (!statusName) throw new UsageError("Hiányzó cél-státusz");
  const target = await r.status(statusName);
  const updated = await patchWp(api, key, async (body) => {
    body._links.status = { href: target._links.self.href };
  });
  return { key: updated.displayId, status: updated._links.status.title };
}

async function cmdComment(api, key, opts, deps) {
  const text = await readText(opts, deps, "text", "file");
  if (!text || !text.trim()) throw new UsageError("Üres komment: add meg --text, --file vagy --stdin kapcsolóval");
  const wp = await api.get(`/work_packages/${encodeURIComponent(key)}`);
  await api.post(`/work_packages/${wp.id}/activities`, { comment: { raw: text } });
  return { key: wp.displayId, commented: true };
}

async function cmdLink(api, from, to, opts) {
  if (!from || !to) throw new UsageError("A link-hez forrás és cél ticket-kulcs kell");
  const type = typeof opts.type === "string" ? opts.type : "relates";
  const a = await api.get(`/work_packages/${encodeURIComponent(from)}`);
  const b = await api.get(`/work_packages/${encodeURIComponent(to)}`);
  await api.post(`/work_packages/${a.id}/relations`, { type, _links: { to: { href: `/api/v3/work_packages/${b.id}` } } });
  return { from: a.displayId, to: b.displayId, type };
}

async function cmdSearch(api, r, opts) {
  const filters = [];
  const project = typeof opts.project === "string" ? opts.project.toUpperCase() : null;
  const statusNames = list(opts.status);
  const notStatus = list(opts["not-status"]);
  if (statusNames.length) filters.push({ status_id: { operator: "=", values: await Promise.all(statusNames.map(async (s) => String((await r.status(s)).id))) } });
  else filters.push({ status_id: { operator: "*", values: [] } });
  if (notStatus.length) filters.push({ status_id: { operator: "!", values: await Promise.all(notStatus.map(async (s) => String((await r.status(s)).id))) } });
  if (opts.assignee) {
    const href = await r.principal(opts.assignee);
    filters.push({ assignee: { operator: "=", values: [href.split("/").pop()] } });
  }
  if (opts.parent) {
    const p = await api.get(`/work_packages/${encodeURIComponent(opts.parent)}`);
    filters.push({ parent: { operator: "=", values: [String(p.id)] } });
  }
  const types = list(opts.type);
  if (types.length) {
    if (!project) throw new UsageError("A --type szűréshez --project is kell");
    filters.push({ type_id: { operator: "=", values: await Promise.all(types.map(async (t) => String((await r.type(project, t)).id))) } });
  }
  for (const [flag, operator] of [["label", "="], ["not-label", "!"]]) {
    const names = list(opts[flag]);
    if (!names.length) continue;
    if (!project) throw new UsageError(`A --${flag} szűréshez --project is kell`);
    const { key, hrefs } = await r.labelHrefs(project, names);
    filters.push({ [key]: { operator, values: hrefs.map((h) => h.split("/").pop()) } });
  }
  if (opts["updated-before-days"] !== undefined) {
    filters.push({ updatedAt: { operator: "<t-", values: [String(parseInt(opts["updated-before-days"], 10))] } });
  }
  const sortMap = { priority: [["priority", "desc"], ["id", "asc"]], updated: [["updatedAt", "desc"]], id: [["id", "asc"]] };
  const sortBy = sortMap[opts.sort || "priority"];
  if (!sortBy) throw new UsageError(`Ismeretlen --sort érték: ${opts.sort}`);
  const limit = opts.limit ? parseInt(opts.limit, 10) : 100;
  const base = project ? `/projects/${encodeURIComponent(project)}/work_packages` : "/work_packages";
  const res = await api.get(`${base}?pageSize=${limit}&filters=${encodeURIComponent(JSON.stringify(filters))}&sortBy=${encodeURIComponent(JSON.stringify(sortBy))}`);
  return res._embedded.elements.map(summarize);
}

const CLOSED_STATUSES = ["done", "closed", "old"];

/**
 * Merge-commit üzenetből a lezárandó ticket-kulcsok: a "Merge branch '<jelleg>/<KULCS>_…'"
 * forrás-branch kulcsa + minden "Closes|Fixes|Resolves <KULCS>" closing-kulcsszó.
 */
function keysFromMergeMessage(message) {
  const keys = new Set();
  const branch = /Merge branch '[^'/]+\/([A-Z][A-Z0-9_]*-\d+)[_'-]/.exec(message);
  if (branch) keys.add(branch[1]);
  const re = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+([A-Z][A-Z0-9_]*-\d+)\b/gi;
  for (let m; (m = re.exec(message));) keys.add(m[1].toUpperCase());
  return [...keys];
}

/**
 * A `JIRA_AUTO_DONE_ON_MERGE` OpenProject-megfelelője (CI-job a default branchen). A már
 * lezárt ticketet békén hagyja, és a "minden gyerek kész" szabály szerint nyitott
 * gyerekkel rendelkező szülőt NEM zár le (csak jelzi).
 */
async function cmdDoneOnMerge(api, r, opts, deps) {
  const message = typeof opts.message === "string" ? opts.message : "";
  const doneName = typeof opts["done-status"] === "string" ? opts["done-status"] : "Done";
  const results = [];
  for (const key of keysFromMergeMessage(message)) {
    let t;
    try {
      t = await cmdGet(api, r, key, { scope: "all" }, deps.baseUrl);
    } catch (e) {
      results.push({ key, action: "skip", reason: e.message });
      continue;
    }
    if (CLOSED_STATUSES.includes(String(t.status).toLowerCase())) {
      results.push({ key, action: "skip", reason: `már lezárt (${t.status})` });
      continue;
    }
    const open = (t.children || []).filter((c) => !CLOSED_STATUSES.includes(String(c.status).toLowerCase()));
    if (open.length) {
      results.push({ key, action: "skip", reason: `nyitott gyerek: ${open.map((c) => `${c.key} [${c.status}]`).join(", ")}` });
      continue;
    }
    if (opts["dry-run"]) {
      results.push({ key, action: "would-close", from: t.status });
      continue;
    }
    await cmdTransition(api, r, key, doneName);
    if (opts.comment !== false) {
      await api.post(`/work_packages/${t.id}/activities`, { comment: { raw: `Merge után automatikusan ${doneName} (CI: ${deps.env.CI_PIPELINE_URL || "done-on-merge"}).` } });
    }
    results.push({ key, action: "closed", from: t.status });
  }
  return results;
}

// ---------------------------------------------------------------------------------------
// Wiki (COCALC-913) — rails runner a web-konténerben
// ---------------------------------------------------------------------------------------

/**
 * A konténerben futó Ruby-program. Az első stdin-sor ez a program base64-ben (a rails
 * runner-nek csak egy fix, adatmentes bootstrap-kifejezés megy), a második sor a kérés
 * base64-JSON-ben. Az eredmény egyetlen `OPWIKI-RESULT <json>` sor a stdout-on.
 */
const WIKI_RUBY = String.raw`
emit = ->(obj) { $stdout.puts("OPWIKI-RESULT " + JSON.generate(obj)); $stdout.flush }
begin
  req = JSON.parse(STDIN.readline.unpack1("m").force_encoding("UTF-8"))
  user = User.find_by(login: req["login"])
  raise "Nincs ilyen OpenProject-felhasználó: #{req["login"]}" unless user
  User.current = user
  ident = req["project"].to_s
  project = Project.find_by(identifier: ident) || Project.where("lower(identifier) = ?", ident.downcase).first
  raise "Nem létező projekt: #{ident}" unless project
  raise "A wiki modul nincs bekapcsolva a(z) #{project.identifier} projektben" unless project.module_enabled?("wiki")
  find = ->(wiki, title) { wiki.pages.find_by(title: title) || wiki.pages.find_by(slug: WikiPage.slug(title)) }
  info = ->(pg) { { "title" => pg.title, "slug" => pg.slug, "parent" => pg.parent&.title,
                    "updatedAt" => pg.updated_at&.utc&.iso8601 } }
  wiki = project.wiki
  result =
    case req["op"]
    when "list"
      wiki ? wiki.pages.order(:title).map { |pg| info.(pg) } : []
    when "get"
      pg = wiki && find.(wiki, req["page"])
      raise "Nincs ilyen wiki oldal a(z) #{project.identifier} projektben: #{req["page"]}" unless pg
      info.(pg).merge("text" => pg.text.to_s)
    when "put"
      wiki ||= Wiki.create!(project: project, start_page: "Wiki")
      pg = find.(wiki, req["page"])
      action = pg ? "updated" : "created"
      pg ||= WikiPage.new(wiki: wiki, title: req["page"], author: user)
      if req["parent"]
        parent = find.(wiki, req["parent"])
        raise "Nem létező szülő-oldal a(z) #{project.identifier} wikijében: #{req["parent"]}" unless parent
        raise "Egy oldal nem lehet a saját szülője: #{req["parent"]}" if pg.persisted? && parent.id == pg.id
        pg.parent = parent
      end
      pg.text = req["text"]
      if pg.persisted? && !pg.changed?
        action = "unchanged"
      else
        pg.save!
      end
      info.(pg).merge("action" => action)
    else
      raise "Ismeretlen wiki-művelet: #{req["op"]}"
    end
  emit.({ "ok" => true, "project" => project.identifier, "result" => result })
rescue => e
  emit.({ "ok" => false, "error" => "#{e.class}: #{e.message}" })
end
`;

/** Fix, adatmentes rails runner kifejezés (nincs benne aposztróf — shellbe idézhető). */
const WIKI_BOOTSTRAP = 'eval(STDIN.readline.unpack1("m").force_encoding("UTF-8"))';
const WIKI_RUNNER_CMD = `cd /app && bundle exec rails runner '${WIKI_BOOTSTRAP}'`;
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const SAFE_SSH_HOST = /^[A-Za-z0-9_][A-Za-z0-9_.@:-]*$/;
const shQuote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

function wikiSettings(env, readFile) {
  const container = readOptionalSetting(env, readFile, "OPENPROJECT_WIKI_CONTAINER", "wiki_container", "openproject-web-1");
  const login = readOptionalSetting(env, readFile, "OPENPROJECT_WIKI_LOGIN", "wiki_login", "claude-agent");
  const sshHost = readOptionalSetting(env, readFile, "OPENPROJECT_WIKI_SSH_HOST", "wiki_ssh_host", "");
  if (!SAFE_NAME.test(container)) throw new UsageError(`Érvénytelen OPENPROJECT_WIKI_CONTAINER: "${container}"`);
  if (sshHost && !SAFE_SSH_HOST.test(sshHost)) throw new UsageError(`Érvénytelen OPENPROJECT_WIKI_SSH_HOST: "${sshHost}"`);
  return { container, login, sshHost };
}

/** Helyben fut-e a konténer (docker inspect); ha nincs docker, az is "nem". */
function localContainerRunning(exec, container) {
  const res = exec("docker", ["inspect", "-f", "{{.State.Running}}", container], "");
  return res.status === 0 && String(res.stdout).trim() === "true";
}

/** A Ruby-programot és a kérést a konténerben futtatja, a strukturált eredményt adja vissza. */
function runWikiRuby(deps, settings, request) {
  const { container, sshHost } = settings;
  const input = Buffer.from(WIKI_RUBY, "utf8").toString("base64") + "\n" +
    Buffer.from(JSON.stringify(request), "utf8").toString("base64") + "\n";
  let cmd, args, where;
  if (localContainerRunning(deps.exec, container)) {
    [cmd, args, where] = ["docker", ["exec", "-i", container, "bash", "-c", WIKI_RUNNER_CMD], `helyi ${container}`];
  } else if (sshHost) {
    const remote = `docker exec -i ${container} bash -c ${shQuote(WIKI_RUNNER_CMD)}`;
    [cmd, args, where] = ["ssh", ["-o", "BatchMode=yes", "--", sshHost, remote], `${sshHost}:${container}`];
  } else {
    throw new UsageError(`A(z) "${container}" konténer nem fut ezen a gépen, és nincs OPENPROJECT_WIKI_SSH_HOST ` +
      "(pl. felhasznalo@openproject-host) a távoli eléréshez");
  }
  const res = deps.exec(cmd, args, input);
  const line = String(res.stdout || "").split("\n").reverse().find((l) => l.startsWith("OPWIKI-RESULT "));
  if (!line) {
    const tail = String(res.stderr || res.error || "").trim().split("\n").slice(-5).join("\n");
    throw new Error(`OpenProject wiki (${where}): nincs eredmény (kilépőkód ${res.status})${tail ? `\n${tail}` : ""}`);
  }
  const data = JSON.parse(line.slice("OPWIKI-RESULT ".length));
  if (!data.ok) throw new Error(`OpenProject wiki (${where}): ${data.error}`);
  return data;
}

const wikiUrl = (baseUrl, project, slug) => `${baseUrl}/projects/${encodeURIComponent(project)}/wiki/${encodeURIComponent(slug)}`;

async function cmdWiki(sub, opts, deps) {
  if (typeof opts.project !== "string") throw new UsageError("Hiányzó kapcsoló: --project");
  const settings = wikiSettings(deps.env, deps.readFile);
  const base = { login: settings.login, project: opts.project };
  switch (sub) {
    case "list": {
      const { project, result } = runWikiRuby(deps, settings, { ...base, op: "list" });
      return result.map((p) => ({ ...p, url: wikiUrl(deps.baseUrl, project, p.slug) }));
    }
    case "get": {
      if (typeof opts.page !== "string") throw new UsageError("Hiányzó kapcsoló: --page");
      const { project, result } = runWikiRuby(deps, settings, { ...base, op: "get", page: opts.page });
      return { ...result, url: wikiUrl(deps.baseUrl, project, result.slug) };
    }
    case "put": {
      if (typeof opts.page !== "string") throw new UsageError("Hiányzó kapcsoló: --page");
      if (opts.parent !== undefined && typeof opts.parent !== "string") throw new UsageError("A --parent után oldalcím kell");
      const text = typeof opts.file === "string" ? deps.readFile(opts.file) : deps.readStdin();
      if (!text || !text.trim()) throw new UsageError("Üres oldal-szöveg: add meg --file kapcsolóval vagy stdin-en");
      const req = { ...base, op: "put", page: opts.page, text };
      if (typeof opts.parent === "string") req.parent = opts.parent;
      const { project, result } = runWikiRuby(deps, settings, req);
      return { ...result, url: wikiUrl(deps.baseUrl, project, result.slug) };
    }
    default:
      throw new UsageError(`Ismeretlen wiki-alparancs: ${sub || "(hiányzik)"} (list | get | put)`);
  }
}

async function run(argv, deps) {
  const { positional, opts } = parseArgs(argv);
  const [cmd, ...rest] = positional;
  if (!cmd || opts.help || cmd === "help") {
    deps.out(HELP);
    return 0;
  }
  const print = (obj, render) => deps.out(opts.json || !render ? JSON.stringify(obj, null, 2) : render(obj));
  if (cmd === "wiki") {
    // A wiki nem az API v3-at használja: token nem kell, a cím csak az URL-ekhez.
    const baseUrl = readSetting(deps.env, deps.readFile, "OPENPROJECT_URL", "url", "OpenProject-cím").replace(/\/+$/, "");
    const res = await cmdWiki(rest[0], opts, { ...deps, baseUrl });
    if (rest[0] === "list") {
      print(res, (rows) => rows.length ? rows.map((p) => `${p.title}\t${p.parent || "—"}\t${p.updatedAt}`).join("\n") : "(nincs wiki oldal)");
    } else if (rest[0] === "get") {
      print(res, (p) => p.text);
    } else {
      print(res, (p) => `${p.action}: ${p.url}`);
    }
    return 0;
  }
  const token = readSetting(deps.env, deps.readFile, "OPENPROJECT_API_TOKEN", "token", "API token");
  const baseUrl = readSetting(deps.env, deps.readFile, "OPENPROJECT_URL", "url", "OpenProject-cím").replace(/\/+$/, "");
  const api = makeClient({ baseUrl, token, fetchImpl: deps.fetch });
  const r = makeResolver(api);
  const ctx = { ...deps, baseUrl };

  switch (cmd) {
    case "whoami": {
      const me = await api.get("/users/me");
      print({ login: me.login, name: me.name, admin: me.admin });
      return 0;
    }
    case "get":
      if (!rest[0]) throw new UsageError("Hiányzó ticket-kulcs");
      print(await cmdGet(api, r, rest[0], opts, baseUrl), renderTicket);
      return 0;
    case "create":
      print(await cmdCreate(api, r, opts, ctx));
      return 0;
    case "update":
      if (!rest[0]) throw new UsageError("Hiányzó ticket-kulcs");
      print(await cmdUpdate(api, r, rest[0], opts, ctx));
      return 0;
    case "transition":
      if (!rest[0]) throw new UsageError("Hiányzó ticket-kulcs");
      print(await cmdTransition(api, r, rest[0], rest.slice(1).join(" ")));
      return 0;
    case "comment":
      if (!rest[0]) throw new UsageError("Hiányzó ticket-kulcs");
      print(await cmdComment(api, rest[0], opts, ctx));
      return 0;
    case "link":
      print(await cmdLink(api, rest[0], rest[1], opts));
      return 0;
    case "done-on-merge":
      print(await cmdDoneOnMerge(api, r, opts, ctx));
      return 0;
    case "search":
      print(await cmdSearch(api, r, opts), (rows) => rows.length
        ? rows.map((x) => `${x.key}\t[${x.status}]\t${x.priority}\t${x.type}\t${x.assignee || "—"}\t${x.subject}`).join("\n")
        : "(nincs találat)");
      return 0;
    default:
      throw new UsageError(`Ismeretlen parancs: ${cmd}`);
  }
}

module.exports = { run, parseArgs, renderTicket, keysFromMergeMessage, HELP, WIKI_RUBY, WIKI_RUNNER_CMD };

if (require.main === module) {
  const deps = {
    env: process.env,
    fetch: globalThis.fetch,
    readFile: (f) => fs.readFileSync(f, "utf8"),
    readStdin: () => fs.readFileSync(0, "utf8"),
    exec: (cmd, args, input) => {
      const r = require("child_process").spawnSync(cmd, args, { input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 10 * 60 * 1000 });
      return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "", error: r.error && r.error.message };
    },
    out: (s) => process.stdout.write(s.endsWith("\n") ? s : s + "\n")
  };
  run(process.argv.slice(2), deps).then(
    (code) => { process.exitCode = code; },
    (err) => {
      process.stderr.write(`HIBA: ${err.message}\n`);
      if (err instanceof UsageError) process.stderr.write(`\n${HELP}\n`);
      process.exitCode = err instanceof UsageError ? 2 : 1;
    }
  );
}
