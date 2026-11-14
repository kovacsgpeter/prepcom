#!/usr/bin/env node
/* Offline Codex JSONL token report. Node.js core only. */

const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");

const USAGE_KEYS = [
  "input_tokens",
  "cached_input_tokens",
  "cache_write_input_tokens",
  "output_tokens",
  "reasoning_output_tokens",
  "total_tokens",
];

function parseArgs(argv) {
  const args = { session: null, project: process.cwd(), out: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--help" || flag === "-h") args.help = true;
    else if (["--session", "--project", "--out"].includes(flag)) {
      if (!argv[i + 1]) throw new Error(`Hiányzó érték: ${flag}`);
      args[flag.slice(2)] = argv[++i];
    } else throw new Error(`Ismeretlen argumentum: ${flag}`);
  }
  return args;
}

function normalizePath(value) {
  return path.resolve(value).replace(/[\\/]+$/, "").toLocaleLowerCase("en-US");
}

function listJsonlFiles(root) {
  if (!fs.existsSync(root)) return [];
  const result = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.startsWith("rollout-") && entry.name.endsWith(".jsonl")) {
        result.push({ file: full, mtime: fs.statSync(full).mtimeMs });
      }
    }
  }
  return result.sort((a, b) => b.mtime - a.mtime);
}

function sessionMatchesProject(file, project) {
  const target = normalizePath(project);
  const fd = fs.openSync(file, "r");
  try {
    const buffer = Buffer.alloc(256 * 1024);
    let carry = "";
    for (;;) {
      const bytes = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!bytes) break;
      const parts = (carry + buffer.toString("utf8", 0, bytes)).split(/\r?\n/);
      carry = parts.pop() || "";
      for (const line of parts) {
        if (!line.includes('"type":"turn_context"')) continue;
        try {
          const rec = JSON.parse(line);
          if (rec.type === "turn_context" && rec.payload && rec.payload.cwd && normalizePath(rec.payload.cwd) === target) return true;
        } catch (_) { /* sérült sort kihagyjuk */ }
      }
    }
    if (carry.includes('"type":"turn_context"')) {
      try {
        const rec = JSON.parse(carry);
        return !!(rec.payload && rec.payload.cwd && normalizePath(rec.payload.cwd) === target);
      } catch (_) { return false; }
    }
    return false;
  } finally {
    fs.closeSync(fd);
  }
}

function findLatestSession(project) {
  const root = path.join(os.homedir(), ".codex", "sessions");
  for (const candidate of listJsonlFiles(root)) {
    if (sessionMatchesProject(candidate.file, project)) return candidate.file;
  }
  return null;
}

function emptyUsage() {
  return Object.fromEntries(USAGE_KEYS.map((key) => [key, 0]));
}

function normalizedUsage(value) {
  const result = emptyUsage();
  for (const key of USAGE_KEYS) result[key] = Number(value && value[key]) || 0;
  return result;
}

function usageDelta(total, previous, last) {
  if (!previous || total.total_tokens < previous.total_tokens) return normalizedUsage(last || total);
  const delta = emptyUsage();
  for (const key of USAGE_KEYS) delta[key] = Math.max(0, total[key] - previous[key]);
  return delta;
}

function promptText(payload) {
  if (!payload || payload.type !== "message" || payload.role !== "user" || !Array.isArray(payload.content)) return null;
  return payload.content
    .filter((part) => part && part.type === "input_text" && typeof part.text === "string")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join(" ") || null;
}

function shortLabel(text) {
  const compact = String(text).replace(/\s+/g, " ").trim();
  return compact.length > 90 ? `${compact.slice(0, 87)}...` : compact;
}

async function parseSession(file) {
  const turns = [];
  const byId = new Map();
  let current = null;
  let pendingPrompt = null;
  let previousTotal = null;
  let ignoredLines = 0;

  function ensureTurn(payload = {}) {
    const id = payload.turn_id || (current && current.id) || `unscoped-${turns.length + 1}`;
    if (!byId.has(id)) {
      const turn = {
        id,
        index: turns.length + 1,
        cwd: payload.cwd || null,
        model: payload.model || "(ismeretlen)",
        effort: payload.effort || null,
        prompt: pendingPrompt,
        records: [],
      };
      byId.set(id, turn);
      turns.push(turn);
      pendingPrompt = null;
    }
    current = byId.get(id);
    if (payload.cwd) current.cwd = payload.cwd;
    if (payload.model) current.model = payload.model;
    if (payload.effort) current.effort = payload.effort;
    if (!current.prompt && pendingPrompt) {
      current.prompt = pendingPrompt;
      pendingPrompt = null;
    }
    return current;
  }

  const stream = readline.createInterface({ input: fs.createReadStream(file, "utf8"), crlfDelay: Infinity });
  for await (const line of stream) {
    if (!line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); } catch (_) { ignoredLines += 1; continue; }

    if (rec.type === "response_item") {
      const text = promptText(rec.payload);
      if (text) pendingPrompt = shortLabel(text);
    } else if (rec.type === "turn_context") {
      ensureTurn(rec.payload || {});
    } else if (rec.type === "event_msg" && rec.payload && rec.payload.type === "token_count") {
      const info = rec.payload.info || {};
      const total = normalizedUsage(info.total_token_usage || info.last_token_usage);
      const delta = usageDelta(total, previousTotal, info.last_token_usage);
      previousTotal = total;
      const turn = current || ensureTurn();
      turn.records.push({ timestamp: rec.timestamp || null, model: turn.model, usage: delta });
    }
  }
  return { turns: turns.filter((turn) => turn.records.length), ignoredLines };
}

function loadPricing() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "pricing.json"), "utf8"));
}

function rateFor(pricing, model) {
  if (pricing.models[model]) return pricing.models[model];
  const key = Object.keys(pricing.models).find((candidate) => model.startsWith(`${candidate}-`));
  return key ? pricing.models[key] : null;
}

function summarize(pricing, records) {
  const result = {
    callCount: records.length,
    input: 0,
    uncachedInput: 0,
    cachedInput: 0,
    cacheWriteInput: 0,
    output: 0,
    reasoningOutput: 0,
    totalTokens: 0,
    apiEquivalentUsd: 0,
    knownPriceSubtotalUsd: 0,
    unknownModels: [],
    byModel: {},
  };
  const unknown = new Set();
  for (const record of records) {
    const usage = record.usage;
    const cached = usage.cached_input_tokens;
    const cacheWrite = usage.cache_write_input_tokens;
    const uncached = Math.max(0, usage.input_tokens - cached - cacheWrite);
    result.input += usage.input_tokens;
    result.uncachedInput += uncached;
    result.cachedInput += cached;
    result.cacheWriteInput += cacheWrite;
    result.output += usage.output_tokens;
    result.reasoningOutput += usage.reasoning_output_tokens;
    result.totalTokens += usage.total_tokens;

    const modelBucket = result.byModel[record.model] || { callCount: 0, input: 0, output: 0, apiEquivalentUsd: 0 };
    modelBucket.callCount += 1;
    modelBucket.input += usage.input_tokens;
    modelBucket.output += usage.output_tokens;
    const rate = rateFor(pricing, record.model);
    if (!rate) unknown.add(record.model);
    else {
      const cost = (uncached * rate.input + cached * rate.cachedInput + cacheWrite * rate.cacheWriteInput + usage.output_tokens * rate.output) / 1e6;
      result.knownPriceSubtotalUsd += cost;
      modelBucket.apiEquivalentUsd += cost;
    }
    result.byModel[record.model] = modelBucket;
  }
  result.unknownModels = [...unknown].sort();
  result.apiEquivalentUsd = unknown.size ? null : result.knownPriceSubtotalUsd;
  return result;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function fmtTokens(value) { return Number(value).toLocaleString("en-US"); }
function fmtUsd(value) { return value == null ? "n/a" : `$${value.toFixed(4)}`; }

function renderHtml(report) {
  const maxTokens = Math.max(1, ...report.turns.map((turn) => turn.summary.totalTokens));
  const totalTokens = Math.max(1, report.total.totalTokens);
  const rows = report.turns.map((turn) => {
    const width = (turn.summary.totalTokens / maxTokens) * 100;
    const pct = (turn.summary.totalTokens / totalTokens) * 100;
    return `<tr><td>${escapeHtml(turn.label)}</td><td><div class="track"><div class="bar" style="width:${width.toFixed(2)}%"></div></div></td><td class="num">${fmtTokens(turn.summary.totalTokens)} (${pct.toFixed(1)}%)</td><td class="num">${fmtUsd(turn.summary.apiEquivalentUsd)}</td></tr>`;
  }).join("\n");
  const unknown = report.total.unknownModels.length
    ? `<div class="warning">Ismeretlen árú modell(ek): ${escapeHtml(report.total.unknownModels.join(", "))}. Az összesített API-becslés ezért nem számítható.</div>`
    : "";
  return `<!doctype html>
<html lang="hu"><head><meta charset="utf-8"><title>Codex session cost report</title>
<style>body{font:15px system-ui,sans-serif;max-width:1000px;margin:2rem auto;padding:0 1rem;color:#202124}h1{font-size:1.5rem}.meta{color:#666}.warning{background:#fff4ce;padding:.8rem 1rem;border-radius:6px;margin:1rem 0}table{width:100%;border-collapse:collapse;margin-top:1.5rem}th,td{padding:.55rem;border-bottom:1px solid #ddd;text-align:left}.num{text-align:right;white-space:nowrap}.track{width:100%;min-width:180px;height:14px;background:#e8eaed;border-radius:7px;overflow:hidden}.bar{height:100%;background:#4285f4}@media(prefers-color-scheme:dark){body{background:#202124;color:#e8eaed}.meta{color:#aaa}th,td{border-color:#555}.warning{background:#594900}.track{background:#555}}</style>
</head><body><h1>Codex session token- és költségriport</h1>
<div class="meta">Session: ${escapeHtml(report.sessionId)}<br>Forrás: ${escapeHtml(report.sourceFile)}<br>Generálva: ${escapeHtml(report.generatedAt)}</div>
<div class="warning">A dollárérték nyilvános API-listaárból számolt összehasonlító becslés, nem a Codex/ChatGPT előfizetés tényleges díja vagy számlája.</div>${unknown}
<p><strong>Összes token:</strong> ${fmtTokens(report.total.totalTokens)} · input: ${fmtTokens(report.total.input)} · output: ${fmtTokens(report.total.output)} · cached input: ${fmtTokens(report.total.cachedInput)} · reasoning output: ${fmtTokens(report.total.reasoningOutput)} · API-egyenérték: ${fmtUsd(report.total.apiEquivalentUsd)}</p>
<table><thead><tr><th>Turn</th><th>Relatív terhelés</th><th class="num">Token</th><th class="num">API-egyenérték</th></tr></thead><tbody>${rows}</tbody></table>
</body></html>`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { process.stdout.write(fs.readFileSync(path.join(__dirname, "README.md"), "utf8")); return; }

  let sessionFile = args.session ? path.resolve(args.session) : findLatestSession(args.project);
  if (!sessionFile) throw new Error(`Nem található a projekthez tartozó Codex session: ${path.resolve(args.project)}`);
  if (!fs.existsSync(sessionFile)) throw new Error(`Nem található session-fájl: ${sessionFile}`);

  const pricing = loadPricing();
  const parsed = await parseSession(sessionFile);
  if (!parsed.turns.length) throw new Error("A sessionben nem található kiértékelhető token_count rekord.");

  const allRecords = parsed.turns.flatMap((turn) => turn.records);
  const turns = parsed.turns.map((turn) => ({
    id: turn.id,
    label: `Turn ${turn.index}: ${turn.prompt || "(nincs elérhető prompt-címke)"} [${turn.model}${turn.effort ? `/${turn.effort}` : ""}]`,
    cwd: turn.cwd,
    model: turn.model,
    effort: turn.effort,
    summary: summarize(pricing, turn.records),
  }));
  const sessionId = path.basename(sessionFile, ".jsonl");
  const outDir = path.resolve(args.out || path.join(process.cwd(), "cost-reports", sessionId));
  fs.mkdirSync(outDir, { recursive: true });
  const report = {
    schemaVersion: 1,
    sessionId,
    sourceFile: sessionFile,
    generatedAt: new Date().toISOString(),
    segmentation: "Codex turn_context turnok; külön subagent sessionök nélkül",
    pricing: {
      sourceVerified: !!pricing.sourceVerified,
      verifiedDate: pricing.verifiedDate || null,
      billingEquivalent: false,
      note: "API-egyenértékű becslés; nem Codex/ChatGPT előfizetési díj.",
    },
    ignoredMalformedLines: parsed.ignoredLines,
    total: summarize(pricing, allRecords),
    turns,
  };
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(path.join(outDir, "report.html"), renderHtml(report), "utf8");
  console.log(`Kész: ${turns.length} turn, ${fmtTokens(report.total.totalTokens)} token, API-egyenérték: ${fmtUsd(report.total.apiEquivalentUsd)}.`);
  console.log("Megjegyzés: ez nem a Codex/ChatGPT előfizetés tényleges díja.");
  console.log(`JSON: ${path.join(outDir, "report.json")}`);
  console.log(`HTML: ${path.join(outDir, "report.html")}`);
}

main().catch((error) => { console.error(`Hiba: ${error.message}`); process.exitCode = 1; });
