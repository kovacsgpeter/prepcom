#!/usr/bin/env node
/**
 * dev-workflow session-cost-report — Claude Code session JSONL-t elemez, és
 * fázisonkénti (Skill/Agent tool-hívás szerinti) token/cost bontást ad, JSON +
 * önálló HTML riport formájában.
 *
 * Nem fut az agent-loop részeként, nem terheli a workflow-t -- utólagos,
 * offline elemzés a Claude Code által amúgy is lementett transcripten.
 *
 * Használat: lásd README.md. Röviden:
 *   node analyze.js                         # auto: aktuális projekt legutóbbi session-je
 *   node analyze.js --session <path.jsonl>  # konkrét session fájl
 *   node analyze.js --project <cwd>         # más projekt (aktuális session-je)
 *   node analyze.js --out <dir>             # kimeneti mappa (alap: ./cost-reports/<session-id>/)
 *   node analyze.js --aggregate <mappa>    # több korábbi report.json fázis-címke szerinti
 *                                            összesítése (COCALC-280 / LOCAL-3, lásd README.md)
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");
const {
  loadPricing,
  costOfRecord,
  dedupeKeyOf,
  dedupeRecords,
} = require("./pricing");

function parseArgs(argv) {
  const args = { session: null, project: process.cwd(), out: null, aggregate: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--session") args.session = argv[++i];
    else if (a === "--project") args.project = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--aggregate") args.aggregate = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

function slugifyProjectPath(p) {
  // A Claude Code ~/.claude/projects/ mappastruktúrája ezt a konvenciót
  // követi (megfigyelve): minden ':' és '/'/'\\' karakter '-'-ra cserélve.
  return p.replace(/[:\\/]/g, "-");
}

function findProjectDir(cwd) {
  const base = path.join(os.homedir(), ".claude", "projects");
  const slug = slugifyProjectPath(cwd);
  const dir = path.join(base, slug);
  if (fs.existsSync(dir)) return dir;
  return null;
}

function findLatestSessionFile(projectDir) {
  const files = fs
    .readdirSync(projectDir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => {
      const full = path.join(projectDir, f);
      return { full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return files.length ? files[0].full : null;
}

// Phase-jelölők, amiket a script megbízhatónak tekint: a Skill és Agent
// tool-hívások (strukturált adat, nem a modell prózájából kitalálva), és
// (COCALC-215 / MEAS-1 óta) a mark_chapter MCP-hívás, ami lépés-szintű,
// explicit fázishatárt jelöl a SKILL.md-kbe írt utasítások alapján.
// Ha a te workflow-csomagod más eszközzel indít fázisokat, itt bővítsd.
const PHASE_TOOL_NAMES = new Set(["Skill", "Agent", "mcp__ccd_session__mark_chapter"]);

function labelForToolUse(block) {
  if (block.name === "Skill") {
    const skill = block.input && (block.input.skill || block.input.name);
    return `Skill: ${skill || "(ismeretlen)"}`;
  }
  if (block.name === "Agent") {
    const desc =
      (block.input && (block.input.description || block.input.subagent_type)) ||
      "(névtelen agent)";
    return `Agent: ${desc}`;
  }
  if (block.name === "mcp__ccd_session__mark_chapter") {
    // Sérült/hiányos input (pl. az input mező teljesen hiányzik) nem állítja
    // meg az elemzést -- csendben visszaesik a fallback feliratra.
    const title = block.input && block.input.title;
    return title || "(névtelen fejezet)";
  }
  return null;
}

// COCALC-273 (MEAS-2) AC12: az `Agent` tool-hívás `input.model` mezője (ha jelen van --
// a harness ma már rögzíti, ha a hívó fél hívásidejű modell-argumentumot adott át, lásd
// a dev-workflow-execute/SKILL.md "A5a" lépését) az "elvárt" modellt jelöli erre a
// fázisra. Más tool-nevekhez (Skill, mark_chapter) nincs értelmezhető "elvárt modell".
function expectedModelForToolUse(block) {
  if (block.name === "Agent" && block.input && typeof block.input.model === "string") {
    return block.input.model;
  }
  return undefined;
}

// ORD-366: egy .jsonl fájl beolvasása. A `source` a rekordok eredetét jelöli (a fő session-
// napló vagy egy subagent-napló); a subagent-naplók rekordjai mindig sidechain-nek számítanak.
function parseSession(filePath, source) {
  const src = source || { kind: "main" };
  return new Promise((resolve, reject) => {
    const assistantRecords = [];
    const markers = [];
    const seenToolUseIds = new Set();
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });

    rl.on("line", (line) => {
      if (!line.trim()) return;
      let rec;
      try {
        rec = JSON.parse(line);
      } catch (e) {
        return; // csendben átugorja a nem-JSON/sérült sorokat
      }

      // A <synthetic> rekord nem valódi API-hívás (a harness írja), nem számít bele.
      if (
        rec.type === "assistant" &&
        rec.message &&
        rec.message.usage &&
        rec.message.model !== "<synthetic>"
      ) {
        // ORD-366: streaming-duplikátumok kulcsa (pricing.js).
        const dedupeKey = dedupeKeyOf(rec);
        assistantRecords.push({
          timestamp: rec.timestamp,
          model: rec.message.model || "(ismeretlen)",
          usage: rec.message.usage,
          isSidechain: src.kind === "subagent" ? true : !!rec.isSidechain,
          agentId: src.kind === "subagent" ? src.agentId : null,
          dedupeKey,
        });

        // Ugyanebben az üzenetben lévő tool_use blokkok jelölhetnek új fázist
        // (a hívás elindítása pillanatában, mielőtt a subagent eredménye
        // visszaérne -- ezért a marker időbélyege ennek az üzenetnek az ideje).
        if (Array.isArray(rec.message.content)) {
          // COCALC-280 (LOCAL-3) AC2: ha EGY assistant üzenet egynél több `Agent`
          // tool_use blokkot indít, az párhuzamos subagent-indítás. Az időbélyeg-vödrös
          // szegmentálás ilyenkor összemosná a párhuzamos ágakat egy szegmensbe (mert
          // azonos időbélyeggel nyílnak) -- ezt a `parallelGroupSize` jelöléssel visszük
          // tovább, hogy a szegmentáló explicit jelezni tudja.
          const agentBlockCount = rec.message.content.filter(
            (b) => b.type === "tool_use" && b.name === "Agent"
          ).length;
          for (const block of rec.message.content) {
            if (block.type === "tool_use" && PHASE_TOOL_NAMES.has(block.name)) {
              // ORD-366: ugyanaz a tool_use blokk a streaming-duplikátum sorokban többször
              // is előfordulhat -- az azonos tool_use id-jű blokk csak egyszer jelöl fázist.
              if (block.id) {
                if (seenToolUseIds.has(block.id)) continue;
                seenToolUseIds.add(block.id);
              }
              const label = labelForToolUse(block);
              if (label) {
                markers.push({
                  timestamp: rec.timestamp,
                  label,
                  expectedModel: expectedModelForToolUse(block),
                  parallelGroupSize: block.name === "Agent" ? agentBlockCount : 1,
                });
              }
            }
          }
        }
      }
    });

    rl.on("close", () => resolve({ assistantRecords, markers }));
    rl.on("error", reject);
  });
}

// ORD-366: a session mappájában (`<session-id>/subagents/`) tárolt subagent-naplók
// megkeresése. Az `agent-<id>.meta.json` (ha van) adja a subagent típusát és rövid leírását
// -- csak ez a két címke kerül a riportba, a napló tartalma nem.
function findSubagentLogs(sessionFile) {
  const dir = path.join(
    path.dirname(sessionFile),
    path.basename(sessionFile, ".jsonl"),
    "subagents"
  );
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .sort()
    .map((f) => {
      const agentId = f.replace(/^agent-/, "").replace(/\.jsonl$/, "");
      let meta = {};
      try {
        meta = JSON.parse(
          fs.readFileSync(path.join(dir, f.replace(/\.jsonl$/, ".meta.json")), "utf8")
        );
      } catch (e) {
        // hiányzó/sérült meta: a subagent típusa/leírása ismeretlen marad
      }
      return {
        file: path.join(dir, f),
        agentId,
        agentType: typeof meta.agentType === "string" ? meta.agentType : null,
        description: typeof meta.description === "string" ? meta.description : null,
      };
    });
}

// A fő napló + a subagent-naplók együtt, deduplikálva.
async function loadSession(sessionFile) {
  const main = await parseSession(sessionFile, { kind: "main" });
  const subagentLogs = findSubagentLogs(sessionFile);
  let all = main.assistantRecords;
  const markers = [...main.markers];
  for (const sa of subagentLogs) {
    const parsed = await parseSession(sa.file, { kind: "subagent", agentId: sa.agentId });
    all = all.concat(parsed.assistantRecords);
    markers.push(...parsed.markers);
  }
  const { records, duplicatesDropped } = dedupeRecords(all);
  return { assistantRecords: records, markers, subagentLogs, duplicatesDropped };
}

// COCALC-280 (LOCAL-3) AC2: az azonos időbélyeggel, egyetlen assistant üzenetből
// induló, párhuzamos `Agent`-hívásokból képzett markereket EGY szegmensbe vonja össze,
// és a szegmensre `parallelSubagents` számot tesz. Enélkül külön (de üres vagy
// félig-önkényesen feltöltött) szegmensekre esnének szét, jelzés nélkül.
//
// Fontos (COCALC-280 M1 code review): csak a valóban párhuzamos (`parallelGroupSize > 1`)
// markereket vonjuk össze. Ha ugyanabban az üzenetben egy `mark_chapter` (COCALC-215
// fázishatár, `parallelGroupSize === 1`) IS van, azt NEM szippantjuk be a párhuzamos
// csoportba -- különben elveszne a fázishatár és a `parallelSubagents` túlszámolna. A
// nem-párhuzamos marker(ek) megtartják a saját fázishatár-címkéjüket; a párhuzamosság-
// jelzést az időbélyeg-csoport UTOLSÓ nem-párhuzamos markerére tesszük, mert a
// szegmentáló az utána jövő rekordokat (köztük a párhuzamos ágak sidechain-rekordjait)
// ahhoz sorolja.
function collapseParallelMarkers(sortedMarkers) {
  const out = [];
  let i = 0;
  while (i < sortedMarkers.length) {
    // Az azonos időbélyegű markerek egy csoportba (jellemzően egyetlen assistant üzenet
    // tool_use blokkjai). A `sortedMarkers` stabil rendezésű, tehát a csoporton belül a
    // sorrend a content-sorrend.
    let k = i;
    while (
      k < sortedMarkers.length &&
      sortedMarkers[k].timestamp === sortedMarkers[i].timestamp
    ) {
      k++;
    }
    const tsGroup = sortedMarkers.slice(i, k);
    i = k;

    const parallel = tsGroup.filter((mm) => (mm.parallelGroupSize || 1) > 1);
    const others = tsGroup.filter((mm) => (mm.parallelGroupSize || 1) === 1);

    if (parallel.length === 0) {
      for (const mm of tsGroup) out.push({ ...mm, parallelSubagents: 1 });
      continue;
    }

    const count = Math.max(
      parallel.length,
      ...parallel.map((mm) => mm.parallelGroupSize || 1)
    );
    const parallelExpected = Array.from(
      new Set(parallel.map((mm) => mm.expectedModel).filter(Boolean))
    );
    const parallelLabelSuffix = `párhuzamos subagentek (${count}): ${parallel
      .map((mm) => mm.label)
      .join(" + ")}`;

    if (others.length === 0) {
      // Csak párhuzamos Agent-markerek -- önálló "Párhuzamos" szegmens.
      out.push({
        timestamp: tsGroup[0].timestamp,
        label: `Párhuzamos subagentek (${count}): ${parallel.map((mm) => mm.label).join(" + ")}`,
        // Ha a párhuzamos ágak eltérő elvárt modellt kaptak, nincs egyértelmű "elvárt
        // modell" a szegmensre -- ilyenkor a modell-egyezés ellenőrzés kimarad.
        expectedModel: parallelExpected.length === 1 ? parallelExpected[0] : undefined,
        parallelSubagents: count,
      });
    } else {
      // Van azonos időbélyegű, NEM párhuzamos marker is (pl. mark_chapter ugyanabból az
      // üzenetből). A fázishatár-címkéjüket megtartjuk; a párhuzamosság-jelzést az
      // utolsóra tesszük (az "birtokolja" az utána jövő rekordokat).
      others.forEach((mm, idx) => {
        if (idx === others.length - 1) {
          out.push({
            timestamp: mm.timestamp,
            label: `${mm.label} — ${parallelLabelSuffix}`,
            expectedModel: mm.expectedModel,
            parallelSubagents: count,
          });
        } else {
          out.push({ ...mm, parallelSubagents: 1 });
        }
      });
    }
  }
  return out;
}

function segmentByPhase(assistantRecords, markers) {
  const sortedRecords = [...assistantRecords].sort((a, b) =>
    a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0
  );
  const sortedMarkers = collapseParallelMarkers(
    [...markers].sort((a, b) =>
      a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0
    )
  );

  const segments = [];
  let current = {
    label: "(fázis-jelölő előtt / session eleje)",
    records: [],
    expectedModel: undefined,
    parallelSubagents: 1,
  };
  let markerIdx = 0;

  for (const rec of sortedRecords) {
    while (
      markerIdx < sortedMarkers.length &&
      sortedMarkers[markerIdx].timestamp <= rec.timestamp
    ) {
      if (current.records.length > 0 || segments.length > 0 || current.label !== sortedMarkers[markerIdx].label) {
        segments.push(current);
      }
      current = {
        label: sortedMarkers[markerIdx].label,
        records: [],
        expectedModel: sortedMarkers[markerIdx].expectedModel,
        parallelSubagents: sortedMarkers[markerIdx].parallelSubagents || 1,
      };
      markerIdx++;
    }
    current.records.push(rec);
  }
  segments.push(current);

  // Üres/haszontalan darabok kiszűrése (pl. a legelső "session eleje" bucket,
  // ha rögtön az első üzenet is markerrel indul).
  return segments.filter((s) => s.records.length > 0);
}

function summarize(pricing, records) {
  const summary = {
    callCount: records.length,
    input: 0,
    output: 0,
    cacheWrite: 0,
    cacheRead: 0,
    cost: 0,
    byModel: {},
    unknownModelSeen: false,
    unknownModels: [],
  };
  for (const rec of records) {
    const c = costOfRecord(pricing, rec);
    summary.input += c.input;
    summary.output += c.output;
    summary.cacheWrite += c.cacheWrite;
    summary.cacheRead += c.cacheRead;
    summary.cost += c.cost;
    if (c.unknownModel) {
      summary.unknownModelSeen = true;
      if (!summary.unknownModels.includes(rec.model)) summary.unknownModels.push(rec.model);
    }
    summary.byModel[rec.model] = summary.byModel[rec.model] || { callCount: 0, cost: 0 };
    summary.byModel[rec.model].callCount++;
    summary.byModel[rec.model].cost += c.cost;
  }
  return summary;
}

// COCALC-273 (MEAS-2) AC12: fázisonkénti "elvárt vs. tényleges modell" ellenőrzés. Az
// "elvárt" modell a szegmenst nyitó `Agent` tool-hívás `input.model` mezője (lásd
// `expectedModelForToolUse`) -- ez a hívó fél (dev-workflow-execute/SKILL.md A5a) által a
// COMPLEXITY_EXECUTOR_MAP alapján feloldott, hívásidejűleg átadott szint. A "tényleges"
// modell(ek) a szegmensbe eső **sidechain** (a subagent saját, `isSidechain: true`)
// rekordok modellje -- a szegmens első rekordja maga a főszál Agent-hívása (más modellel
// futhat, pl. Opus az interjú-fázisban), azt szándékosan NEM vesszük figyelembe itt.
// Az `Agent` tool_use `input.model` mezője a rövid aliast tartalmazza (pl. "sonnet",
// "haiku"), a tényleges API-hívások `message.model` mezője viszont a teljes modell-id-t
// (pl. "claude-sonnet-5", "claude-haiku-4-5") -- ezért NEM string-egyenlőséggel, hanem
// "az elvárt alias szerepel-e a tényleges modell-id-ben" (kis- és nagybetűtől független
// substring) összevetéssel dönt a "match" vs "mismatch" -- ez a legegyszerűbb, még
// megbízható heurisztika, ami nem igényel modell-id -> alias fordítótáblát.
function modelMatchesExpected(actualModel, expectedAlias) {
  return actualModel.toLowerCase().includes(expectedAlias.toLowerCase());
}

function computeModelCheck(segment) {
  if (!segment.expectedModel) {
    return null; // nincs mit ellenőrizni (nem Agent-hívás, vagy nem volt `model` bemenet)
  }
  const actualModels = Array.from(
    new Set(segment.records.filter((r) => r.isSidechain).map((r) => r.model))
  );
  if (actualModels.length === 0) {
    // A harness nem rögzítette a subagent saját (sidechain) hívásait ebben a
    // szegmensben -- ez NEM hibaállapot, csak azt jelenti, hogy ebből a session-ből
    // nem ellenőrizhető a tényleges modell (pl. a subagent egyáltalán nem hívott API-t,
    // vagy a napló-formátum eltér a vártól). A futást ez sosem akasztja meg.
    return { expected: segment.expectedModel, actual: [], status: "not-checkable" };
  }
  const status = actualModels.every((m) => modelMatchesExpected(m, segment.expectedModel))
    ? "match"
    : "mismatch";
  return { expected: segment.expectedModel, actual: actualModels, status };
}

function fmtUsd(n) {
  return "$" + n.toFixed(4);
}

function fmtTokens(n) {
  return n.toLocaleString("en-US");
}

function renderHtml(report) {
  const maxCost = Math.max(...report.phases.map((p) => p.summary.cost), 0.0001);
  const barRows = report.phases
    .map((p) => {
      const pct = (p.summary.cost / report.total.cost) * 100;
      const widthPct = (p.summary.cost / maxCost) * 100;
      return `
        <div class="row">
          <div class="row-label" title="${escapeHtml(p.label)}">${escapeHtml(p.label)}</div>
          <div class="row-bar-track">
            <div class="row-bar" style="width:${widthPct.toFixed(2)}%"></div>
          </div>
          <div class="row-value">${fmtUsd(p.summary.cost)} <span class="row-pct">(${pct.toFixed(1)}%)</span></div>
        </div>`;
    })
    .join("\n");

  const tableRows = report.phases
    .map((p) => {
      const mc = p.modelCheck;
      let modelCheckCell = "—";
      if (mc) {
        if (mc.status === "match") {
          modelCheckCell = `✅ ${escapeHtml(mc.expected)}`;
        } else if (mc.status === "mismatch") {
          modelCheckCell = `⚠️ kért: ${escapeHtml(mc.expected)}, tényleges: ${escapeHtml(mc.actual.join(", "))}`;
        } else {
          modelCheckCell = `❔ kért: ${escapeHtml(mc.expected)} (nem ellenőrizhető)`;
        }
      }
      const parallelBadge =
        p.parallelSubagents > 1
          ? ` <strong title="Az időbélyeg-vödrös szegmentálás a párhuzamos subagenteket egy szegmensbe vonja — a subagent-oszlop összevont.">⚠️ ${p.parallelSubagents} párhuzamos subagent</strong>`
          : "";
      const mt = p.mainThread ? fmtUsd(p.mainThread.cost) : "—";
      const sa = p.subagent ? fmtUsd(p.subagent.cost) : "—";
      return `
        <tr>
          <td>${escapeHtml(p.label)}${parallelBadge}</td>
          <td class="num">${p.summary.callCount}</td>
          <td class="num">${fmtTokens(p.summary.input)}</td>
          <td class="num">${fmtTokens(p.summary.output)}</td>
          <td class="num">${fmtTokens(p.summary.cacheWrite)}</td>
          <td class="num">${fmtTokens(p.summary.cacheRead)}</td>
          <td class="num">${fmtUsd(p.summary.cost)}</td>
          <td class="num">${mt}</td>
          <td class="num">${sa}</td>
          <td>${modelCheckCell}</td>
        </tr>`;
    })
    .join("\n");

  const warning = report.pricingVerified
    ? ""
    : `<div class="warning">⚠️ A <code>pricing.json</code> "verified": false -- a lenti $ értékek PÉLDA-árak, nincsenek megerősítve a te szerződésed/csomagod tényleges díjszabásához. Ellenőrizd a console.anthropic.com árazási oldalán, majd írd át a <code>pricing.json</code>-t, és állítsd "verified": true-ra.</div>`;

  const unknownModelWarning =
    report.unknownModels && report.unknownModels.length > 0
      ? `<div class="warning">⚠️ Ismeretlen modell (nincs a <code>pricing.json</code>-ban, a tartalék-árral számolva): ${escapeHtml(report.unknownModels.join(", "))}.</div>`
      : "";

  const subagentRows = (report.subagents || [])
    .slice()
    .sort((x, y) => y.summary.cost - x.summary.cost)
    .map(
      (sa) => `
        <tr>
          <td>${escapeHtml(sa.agentType || "(ismeretlen típus)")}</td>
          <td>${escapeHtml(sa.description || "")}</td>
          <td class="num">${sa.summary.callCount}</td>
          <td class="num">${fmtUsd(sa.summary.cost)}</td>
        </tr>`
    )
    .join("\n");
  const subagentTable = subagentRows
    ? `
  <table>
    <caption>Subagentek (a session subagents/ naplóiból): ${report.subagentTotal.callCount} hívás, ${fmtUsd(report.subagentTotal.cost)}; fő szál: ${report.mainThreadTotal.callCount} hívás, ${fmtUsd(report.mainThreadTotal.cost)}</caption>
    <thead><tr><th>Típus</th><th>Leírás</th><th class="num">Hívás</th><th class="num">Cost</th></tr></thead>
    <tbody>${subagentRows}
    </tbody>
  </table>`
    : "";

  return `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8">
<title>Session cost report — ${escapeHtml(report.sessionId)}</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #ffffff; --fg: #1a1a1a; --muted: #666; --border: #e2e2e2;
    --bar: #5b8def; --warn-bg: #fff3cd; --warn-fg: #7a5b00;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #1a1a1a; --fg: #eaeaea; --muted: #999; --border: #333;
      --bar: #5b8def; --warn-bg: #3a2f00; --warn-fg: #ffd966; }
  }
  body { background: var(--bg); color: var(--fg); font-family: system-ui, sans-serif;
    max-width: 900px; margin: 2rem auto; padding: 0 1rem; }
  h1 { font-size: 1.3rem; }
  .meta { color: var(--muted); font-size: 0.85rem; margin-bottom: 1.5rem; }
  .warning { background: var(--warn-bg); color: var(--warn-fg); padding: 0.75rem 1rem;
    border-radius: 6px; margin-bottom: 1.5rem; font-size: 0.9rem; }
  .total { font-size: 1.1rem; margin-bottom: 1.5rem; }
  .row { display: grid; grid-template-columns: 220px 1fr 160px; align-items: center;
    gap: 0.75rem; margin-bottom: 0.5rem; font-size: 0.85rem; }
  .row-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row-bar-track { background: var(--border); border-radius: 4px; height: 14px; overflow: hidden; }
  .row-bar { background: var(--bar); height: 100%; }
  .row-value { text-align: right; white-space: nowrap; }
  .row-pct { color: var(--muted); }
  table { border-collapse: collapse; width: 100%; margin-top: 2rem; font-size: 0.82rem; }
  th, td { border-bottom: 1px solid var(--border); padding: 0.4rem 0.6rem; text-align: left; }
  td.num, th.num { text-align: right; }
  caption { text-align: left; color: var(--muted); margin-bottom: 0.5rem; font-size: 0.85rem; }
</style>
</head>
<body>
  <h1>Session cost report</h1>
  <div class="meta">Session: ${escapeHtml(report.sessionId)}<br>Fájl: ${escapeHtml(report.sourceFile)}<br>
  Generálva: ${escapeHtml(report.generatedAt)}</div>
  ${warning}
  ${unknownModelWarning}
  <div class="total">Összes: <strong>${fmtUsd(report.total.cost)}</strong>
    (${fmtTokens(report.total.input)} input / ${fmtTokens(report.total.output)} output /
    ${fmtTokens(report.total.cacheWrite)} cache-write / ${fmtTokens(report.total.cacheRead)} cache-read token,
    ${report.total.callCount} API-hívás)</div>

  <div class="chart">
  ${barRows}
  </div>

  <table>
    <caption>Fázisonkénti bontás (időrendi sorrendben, a Skill/Agent tool-hívások alapján szegmentálva)</caption>
    <thead>
      <tr>
        <th>Fázis</th><th class="num">Hívás</th><th class="num">Input</th><th class="num">Output</th>
        <th class="num">Cache-write</th><th class="num">Cache-read</th><th class="num">Cost</th>
        <th class="num">Fő szál</th><th class="num">Subagent</th>
        <th>Modell-egyezés</th>
      </tr>
    </thead>
    <tbody>
    ${tableRows}
    </tbody>
  </table>
  ${subagentTable}
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ---------------------------------------------------------------------------
// COCALC-280 (LOCAL-3) — `--aggregate <mappa>` mód
// ---------------------------------------------------------------------------
// Több korábban kiírt `report.json` fázis-címke szerinti összesítése. A cél a
// `dev-workflow/offload-measurements.md` Claude-baseline rangsorának táplálása:
// fázisonként a "cipelt kontextus" (input + cacheRead) szerint rendez.
//
// NEM verziózott baseline-store (lásd offload-measurements.md "Ismert korlát"): minden
// futás a talált `report.json`-ok pillanatképét összesíti, nincs történeti nyilvántartás.

const EMPTY_SUMMARY = () => ({
  callCount: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cost: 0,
});

function addInto(acc, s) {
  acc.callCount += s.callCount || 0;
  acc.input += s.input || 0;
  acc.output += s.output || 0;
  acc.cacheWrite += s.cacheWrite || 0;
  acc.cacheRead += s.cacheRead || 0;
  acc.cost += s.cost || 0;
}

function findReportJsonFiles(dir) {
  const out = [];
  // Szimlink-ciklus elleni védelem (COCALC-280 m2): egyrészt a szimlink-bejegyzéseket
  // nem követjük, másrészt a már bejárt valós (feloldott) útvonalakat egy Set-ben
  // tartjuk, hogy egy hard-link/junction-kör se okozzon végtelen rekurziót.
  const visited = new Set();
  const walk = (d) => {
    let real;
    try {
      real = fs.realpathSync(d);
    } catch (e) {
      return;
    }
    if (visited.has(real)) return;
    visited.add(real);
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const ent of entries) {
      const full = path.join(d, ent.name);
      if (ent.isSymbolicLink()) continue;
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && ent.name === "report.json") out.push(full);
    }
  };
  walk(dir);
  return out.sort();
}

// Egy beolvasott JSON akkor tekinthető a mi sémánknak, ha van `phases` tömbje, és
// minden eleme `label` + `summary` (callCount-tal). Ami nem ilyen -> "séma-idegen".
function isRecognizedReport(obj) {
  if (!obj || !Array.isArray(obj.phases)) return false;
  return obj.phases.every(
    (p) => p && typeof p.label === "string" && p.summary && typeof p.summary.callCount === "number"
  );
}

function aggregateReports(dir) {
  const files = findReportJsonFiles(dir);
  const skipped = [];
  const accepted = [];

  for (const f of files) {
    let raw;
    try {
      raw = fs.readFileSync(f, "utf8");
    } catch (e) {
      skipped.push({ file: f, reason: "nem olvasható" });
      continue;
    }
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch (e) {
      skipped.push({ file: f, reason: "sérült JSON" });
      continue;
    }
    if (!isRecognizedReport(obj)) {
      skipped.push({ file: f, reason: "séma-idegen (nincs értelmezhető phases[] tömb)" });
      continue;
    }
    accepted.push({ file: f, obj });
  }

  if (accepted.length === 0) {
    const detail =
      files.length === 0
        ? "egyetlen report.json sincs a mappa-fában"
        : `mind a(z) ${files.length} talált report.json kihagyva (${skipped
            .map((s) => s.reason)
            .join("; ")})`;
    const err = new Error(
      `Nem található egyetlen feldolgozható report.json sem itt: ${dir} — ${detail}. ` +
        `Az --aggregate egy nem üres, korábbi analyze.js-futások report.json-jait tartalmazó mappát vár.`
    );
    err.userFacing = true;
    throw err;
  }

  // Fázis-címke szerinti összesítés.
  //
  // COCALC-280 M2 code review: egy `report.json`-on belül UGYANAZ a `label` többször is
  // előfordulhat (a szegmentáló nem dedupál címkét -- pl. `Agent: implementer` több
  // TDD-körből). Ezért külön kell tartani:
  //   - `reportCount`      : hány KÜLÖN riportban szerepelt ez a címke (riportonként max 1),
  //   - `occurrenceCount`  : hány előfordulás összesen (a token-összegek ezekből jönnek).
  // A `labelSetConsistent` a per-riport címke-halmazok összevetéséből számol, nem az
  // előfordulásszámból -- különben egy riporton belüli ismétlődés hamis "eltérő
  // címkehalmaz" jelzést adna (cry-wolf a normál inputon).
  const byLabel = new Map();
  for (const { obj } of accepted) {
    const seenInThisReport = new Set();
    const breakdownInThisReport = new Map(); // label -> volt-e legalább egy bontásos előfordulás
    for (const p of obj.phases) {
      if (!byLabel.has(p.label)) {
        byLabel.set(p.label, {
          label: p.label,
          reportCount: 0,
          occurrenceCount: 0,
          summary: EMPTY_SUMMARY(),
          mainThread: EMPTY_SUMMARY(),
          subagent: EMPTY_SUMMARY(),
          reportsWithBreakdown: 0,
          reportsWithoutBreakdown: 0,
          parallelSubagentsSeen: 0,
        });
      }
      const agg = byLabel.get(p.label);
      agg.occurrenceCount++;
      if (!seenInThisReport.has(p.label)) {
        agg.reportCount++;
        seenInThisReport.add(p.label);
      }
      addInto(agg.summary, p.summary);
      // Séma-verzió eltérés: a mai riportokban még nincs mainThread/subagent mező.
      // Ezeket "ismeretlen bontás"-ként kezeljük -- NEM nullaként (AC "edge case").
      if (p.mainThread && p.subagent) {
        addInto(agg.mainThread, p.mainThread);
        addInto(agg.subagent, p.subagent);
        breakdownInThisReport.set(p.label, true);
      } else if (!breakdownInThisReport.has(p.label)) {
        breakdownInThisReport.set(p.label, false);
      }
      if (typeof p.parallelSubagents === "number" && p.parallelSubagents > 1) {
        agg.parallelSubagentsSeen++;
      }
    }
    // Bontás-lefedettség riportonként EGYSZER (nem előfordulásonként).
    for (const [label, hadBreakdown] of breakdownInThisReport) {
      const agg = byLabel.get(label);
      if (hadBreakdown) agg.reportsWithBreakdown++;
      else agg.reportsWithoutBreakdown++;
    }
  }

  const phases = Array.from(byLabel.values()).map((agg) => {
    const carriedContext = agg.summary.input + agg.summary.cacheRead;
    return {
      label: agg.label,
      reportCount: agg.reportCount,
      occurrenceCount: agg.occurrenceCount,
      carriedContext,
      summary: agg.summary,
      // Ha EGYETLEN riport sem hozott bontást ehhez a címkéhez, a mező null (ismeretlen),
      // nem nullázott összeg.
      mainThread: agg.reportsWithBreakdown > 0 ? agg.mainThread : null,
      subagent: agg.reportsWithBreakdown > 0 ? agg.subagent : null,
      breakdownCoverage: `${agg.reportsWithBreakdown}/${agg.reportCount} riport tartalmazott mainThread/subagent bontást`,
      parallelSubagentsSeenInReports: agg.parallelSubagentsSeen,
    };
  });

  // AC5: fázisonként rendezhető a cipelt kontextus (input + cacheRead) szerint — ez az
  // alap rendezés, csökkenő.
  phases.sort((a, b) => b.carriedContext - a.carriedContext);

  // Eltérő fázis-címkék session-ök között (COCALC-215 mark_chapter granularitás-váltás):
  // ne fésüljön össze csendben két más granularitású címkehalmazt -- jelezze. A `reportCount`
  // riportonként max 1 (lásd fent), tehát egy riporton belüli ismétlődő címke NEM billenti
  // ezt hamis "eltérő címkehalmaz"-ba. A `labelSetConsistent` egyetlen forrása a
  // `partialLabels` üressége -- így sosem generálódhat üres listás FIGYELEM-jelzés.
  const totalReports = accepted.length;
  const partialLabels = phases
    .filter((p) => p.reportCount < totalReports)
    .map((p) => `${p.label} (${p.reportCount}/${totalReports})`);
  const labelSetConsistent = partialLabels.length === 0;

  const total = EMPTY_SUMMARY();
  for (const p of phases) addInto(total, p.summary);

  return {
    mode: "aggregate",
    generatedAt: new Date().toISOString(),
    inputDir: path.resolve(dir),
    reportsFound: files.length,
    reportsAggregated: accepted.length,
    reportsSkipped: skipped.length,
    skipped,
    sortedBy: "carriedContext = input + cacheRead (cipelt kontextus), csökkenő",
    labelSetConsistent,
    labelSetNote: labelSetConsistent
      ? "Minden fázis-címke minden feldolgozott riportban szerepelt."
      : `FIGYELEM: eltérő fázis-címke-halmazok — az alábbi címkék csak a riportok egy részében szerepeltek, ` +
        `ez eltérő szegmentálási granularitásra utalhat (COCALC-215 mark_chapter előtti/utáni keveredés), ` +
        `az összesítés ezeket NEM fésülte össze: ${partialLabels.join("; ")}`,
    phases,
    total,
  };
}

function renderAggregateHtml(agg) {
  const rows = agg.phases
    .map((p) => {
      const mt = p.mainThread ? fmtUsd(p.mainThread.cost) : "ismeretlen";
      const sa = p.subagent ? fmtUsd(p.subagent.cost) : "ismeretlen";
      return `
        <tr>
          <td>${escapeHtml(p.label)}</td>
          <td class="num">${p.reportCount}</td>
          <td class="num">${fmtTokens(p.carriedContext)}</td>
          <td class="num">${fmtTokens(p.summary.input)}</td>
          <td class="num">${fmtTokens(p.summary.cacheRead)}</td>
          <td class="num">${fmtUsd(p.summary.cost)}</td>
          <td class="num">${mt}</td>
          <td class="num">${sa}</td>
        </tr>`;
    })
    .join("\n");
  const skippedNote = agg.reportsSkipped
    ? `<div class="warning">${agg.reportsSkipped} report.json kihagyva: ${escapeHtml(
        agg.skipped.map((s) => `${path.basename(path.dirname(s.file))} (${s.reason})`).join(", ")
      )}</div>`
    : "";
  const labelNote = agg.labelSetConsistent
    ? ""
    : `<div class="warning">${escapeHtml(agg.labelSetNote)}</div>`;
  return `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8">
<title>Session cost aggregate — ${escapeHtml(agg.inputDir)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1rem; }
  h1 { font-size: 1.3rem; }
  .meta { color: #666; font-size: 0.85rem; margin-bottom: 1.5rem; }
  .warning { background: #fff3cd; color: #7a5b00; padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1rem; font-size: 0.9rem; }
  table { border-collapse: collapse; width: 100%; margin-top: 1.5rem; font-size: 0.82rem; }
  th, td { border-bottom: 1px solid #e2e2e2; padding: 0.4rem 0.6rem; text-align: left; }
  td.num, th.num { text-align: right; }
  caption { text-align: left; color: #666; margin-bottom: 0.5rem; font-size: 0.85rem; }
</style>
</head>
<body>
  <h1>Session cost aggregate (COCALC-280 / LOCAL-3)</h1>
  <div class="meta">Bemeneti mappa: ${escapeHtml(agg.inputDir)}<br>
  Feldolgozva: ${agg.reportsAggregated} / talált: ${agg.reportsFound} report.json<br>
  Generálva: ${escapeHtml(agg.generatedAt)}<br>
  Rendezés: ${escapeHtml(agg.sortedBy)}</div>
  ${skippedNote}
  ${labelNote}
  <table>
    <caption>Fázisonkénti összesítés, cipelt kontextus (input + cache-read) szerint csökkenő sorrendben</caption>
    <thead>
      <tr>
        <th>Fázis-címke</th><th class="num">Riport db</th><th class="num">Cipelt kontextus</th>
        <th class="num">Input</th><th class="num">Cache-read</th><th class="num">Cost</th>
        <th class="num">Fő szál</th><th class="num">Subagent</th>
      </tr>
    </thead>
    <tbody>
    ${rows}
    </tbody>
  </table>
</body>
</html>`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(fs.readFileSync(path.join(__dirname, "README.md"), "utf8"));
    return;
  }

  // COCALC-280 (LOCAL-3): --aggregate mód — nem egy session-t elemez, hanem korábbi
  // report.json-okat összesít fázis-címke szerint.
  if (args.aggregate) {
    const agg = aggregateReports(args.aggregate);
    const outDir = args.out || path.join(process.cwd(), "cost-reports", "aggregate");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "aggregate.json"), JSON.stringify(agg, null, 2), "utf8");
    fs.writeFileSync(path.join(outDir, "aggregate.html"), renderAggregateHtml(agg), "utf8");
    console.log(
      `Kész (--aggregate). ${agg.reportsAggregated}/${agg.reportsFound} report.json összesítve, ` +
        `${agg.phases.length} fázis-címke.`
    );
    if (agg.reportsSkipped > 0) {
      console.log(`⚠️  ${agg.reportsSkipped} report.json kihagyva (hiányzó/sérült/séma-idegen).`);
    }
    if (!agg.labelSetConsistent) {
      console.log(
        "⚠️  Eltérő fázis-címke-halmazok a riportok között — lásd az aggregate.json " +
          '"labelSetNote" mezőjét (nem lettek csendben összefésülve).'
      );
    }
    console.log(`JSON:  ${path.join(outDir, "aggregate.json")}`);
    console.log(`HTML:  ${path.join(outDir, "aggregate.html")}`);
    return;
  }

  let sessionFile = args.session;
  if (!sessionFile) {
    const projectDir = findProjectDir(path.resolve(args.project));
    if (!projectDir) {
      console.error(
        "Nem található Claude Code projekt-mappa ehhez a cwd-hez. Add meg explicit a --session <fájl>-t."
      );
      process.exit(1);
    }
    sessionFile = findLatestSessionFile(projectDir);
    if (!sessionFile) {
      console.error(`Nincs .jsonl session-fájl itt: ${projectDir}`);
      process.exit(1);
    }
  }
  sessionFile = path.resolve(sessionFile);
  if (!fs.existsSync(sessionFile)) {
    console.error(`Nem található: ${sessionFile}`);
    process.exit(1);
  }

  const pricing = loadPricing();
  const { assistantRecords, markers, subagentLogs, duplicatesDropped } =
    await loadSession(sessionFile);

  if (assistantRecords.length === 0) {
    console.error("Nem található kiértékelhető (usage-adatot tartalmazó) assistant üzenet ebben a fájlban.");
    process.exit(1);
  }

  const segments = segmentByPhase(assistantRecords, markers);
  const phases = segments.map((s) => ({
    label: s.label,
    summary: summarize(pricing, s.records),
    // COCALC-280 (LOCAL-3) AC1: a mai `summary` mellett fő szál (isSidechain: false) és
    // subagent (isSidechain: true) bontás is. A kettő összege token-/cost-szinten a
    // `summary`-t adja ki -- a `parallelSubagents > 1` szegmenseknél a `subagent` bontás
    // az összevont párhuzamos ágakat fedi (lásd AC2), ezt a mező jelzi.
    mainThread: summarize(pricing, s.records.filter((r) => !r.isSidechain)),
    subagent: summarize(pricing, s.records.filter((r) => r.isSidechain)),
    parallelSubagents: s.parallelSubagents || 1,
    modelCheck: computeModelCheck(s),
  }));
  const total = summarize(pricing, assistantRecords);
  // ORD-366 AC2: fő szál / subagentek összesen, és subagentenkénti bontás (típus + rövid
  // leírás a meta-fájlból; tartalom nem kerül a riportba).
  const mainThreadTotal = summarize(pricing, assistantRecords.filter((r) => !r.isSidechain));
  const subagentTotal = summarize(pricing, assistantRecords.filter((r) => r.isSidechain));
  const subagents = subagentLogs
    .map((sa) => ({
      agentId: sa.agentId,
      agentType: sa.agentType,
      description: sa.description,
      summary: summarize(
        pricing,
        assistantRecords.filter((r) => r.agentId === sa.agentId)
      ),
    }))
    .filter((sa) => sa.summary.callCount > 0);

  const sessionId = path.basename(sessionFile, ".jsonl");
  const outDir = args.out || path.join(process.cwd(), "cost-reports", sessionId);
  fs.mkdirSync(outDir, { recursive: true });

  const report = {
    sessionId,
    sourceFile: sessionFile,
    generatedAt: new Date().toISOString(),
    pricingVerified: !!pricing.verified,
    total,
    mainThreadTotal,
    subagentTotal,
    subagents,
    subagentLogsFound: subagentLogs.length,
    duplicatesDropped,
    unknownModels: total.unknownModels,
    phases,
  };

  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(path.join(outDir, "report.html"), renderHtml(report), "utf8");

  console.log(`Kész. ${phases.length} fázis-szegmens, összesen ${fmtUsd(total.cost)} (${total.callCount} hívás).`);
  if (!pricing.verified) {
    console.log("⚠️  pricing.json \"verified\": false -- a $ értékek példa-árak, ellenőrizd őket.");
  }
  console.log(
    `Fő szál: ${mainThreadTotal.callCount} hívás ${fmtUsd(mainThreadTotal.cost)}; ` +
      `subagentek: ${subagentTotal.callCount} hívás ${fmtUsd(subagentTotal.cost)} ` +
      `(${subagentLogs.length} subagent-napló); eldobott streaming-duplikátum: ${duplicatesDropped}.`
  );
  if (total.unknownModels.length > 0) {
    console.log(
      `⚠️  Ismeretlen modell (nincs a pricing.json-ban, a tartalék-árral számolva): ` +
        `${total.unknownModels.join(", ")} -- vedd fel a pricing.json-ba.`
    );
  }
  const mismatches = phases.filter((p) => p.modelCheck && p.modelCheck.status === "mismatch");
  if (mismatches.length > 0) {
    console.log(
      `⚠️  ${mismatches.length} fázisnál eltér a kért (COMPLEXITY_EXECUTOR_MAP szerinti) és a ténylegesen ` +
        `használt modell -- lásd a report.json "modelCheck" mezőit és a report.html "Modell-egyezés" oszlopát.`
    );
  }
  const parallelPhases = phases.filter((p) => p.parallelSubagents > 1);
  if (parallelPhases.length > 0) {
    console.log(
      `⚠️  ${parallelPhases.length} fázis-szegmensben egynél több párhuzamos subagent futott — az ` +
        `időbélyeg-vödrös szegmentálás ezeket egy szegmensbe vonja, a "subagent" bontásuk összevont. ` +
        `Lásd a report.json "parallelSubagents" mezőit.`
    );
  }
  console.log(`JSON:  ${path.join(outDir, "report.json")}`);
  console.log(`HTML:  ${path.join(outDir, "report.html")}`);
}

main().catch((err) => {
  if (err && err.userFacing) {
    console.error(err.message);
  } else {
    console.error(err);
  }
  process.exit(1);
});
