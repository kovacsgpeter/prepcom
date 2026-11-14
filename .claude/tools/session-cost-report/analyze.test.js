#!/usr/bin/env node
/**
 * Plain-assert tesztek az analyze.js-hez (COCALC-215 / MEAS-1).
 *
 * Nem használ teszt-keretrendszert (jest/mocha) -- egyszerű assert-alapú
 * futtató, kézzel írt JSONL fixture-ökön keresztül, subprocess-ként hívva az
 * analyze.js-t (ugyanúgy, ahogy éles használatban is fut), és a kimeneti
 * report.json-t ellenőrizve.
 *
 * Futtatás: node analyze.test.js
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const FIXTURES_DIR = path.join(__dirname, "fixtures");
const ANALYZE_JS = path.join(__dirname, "analyze.js");

function runAnalyze(sessionFile) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-cost-report-test-"));
  try {
    execFileSync("node", [ANALYZE_JS, "--session", sessionFile, "--out", outDir], {
      encoding: "utf8",
    });
    return JSON.parse(fs.readFileSync(path.join(outDir, "report.json"), "utf8"));
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

// COCALC-280 (LOCAL-3): --aggregate mód futtatása, az aggregate.json visszaadva.
function runAggregate(dir) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-cost-report-agg-"));
  try {
    execFileSync("node", [ANALYZE_JS, "--aggregate", dir, "--out", outDir], { encoding: "utf8" });
    return {
      json: JSON.parse(fs.readFileSync(path.join(outDir, "aggregate.json"), "utf8")),
      htmlExists: fs.existsSync(path.join(outDir, "aggregate.html")),
    };
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

const AGGREGATE_FIXTURE_DIR = path.join(FIXTURES_DIR, "aggregate");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ok - ${name}`);
    passed++;
  } catch (e) {
    console.error(`  NOT OK - ${name}`);
    console.error(e);
    failed++;
  }
}

test("regresszió: mark_chapter nélküli, régi napló szegmentálása változatlan (Skill-marker)", () => {
  const report = runAnalyze(path.join(FIXTURES_DIR, "legacy-skill-agent.jsonl"));
  const labels = report.phases.map((p) => p.label);
  assert.deepStrictEqual(labels, [
    "(fázis-jelölő előtt / session eleje)",
    "Skill: dev-workflow-execute",
  ]);
});

test("mark_chapter: input.title alapján képzett címke önálló szegmenst nyit", () => {
  const report = runAnalyze(path.join(FIXTURES_DIR, "mark-chapter.jsonl"));
  const labels = report.phases.map((p) => p.label);
  assert.ok(
    labels.includes("dev-workflow-execute / A4 — Pickup"),
    `Várt címke nem található a szegmensek között: ${JSON.stringify(labels)}`
  );
});

test("mark_chapter: hiányzó/sérült input.title esetén '(névtelen fejezet)' feliratra esik vissza, nem áll el", () => {
  const report = runAnalyze(path.join(FIXTURES_DIR, "mark-chapter.jsonl"));
  const labels = report.phases.map((p) => p.label);
  assert.ok(
    labels.includes("(névtelen fejezet)"),
    `Fallback címke nem található a szegmensek között: ${JSON.stringify(labels)}`
  );
});

test("mark_chapter: a teljes (total) összeg a fázisbontástól függetlenül pontos marad", () => {
  const report = runAnalyze(path.join(FIXTURES_DIR, "mark-chapter.jsonl"));
  const sumFromPhases = report.phases.reduce((acc, p) => acc + p.summary.callCount, 0);
  assert.strictEqual(sumFromPhases, report.total.callCount);
});

test("COCALC-273 AC12: Agent input.model + sidechain-egyezés esetén 'match' státusz", () => {
  const report = runAnalyze(path.join(FIXTURES_DIR, "model-check.jsonl"));
  const phase = report.phases.find((p) => p.label.includes("implementer (S komplexitas)"));
  assert.ok(phase, "nem talalhato az implementer fazis-szegmens");
  assert.strictEqual(phase.modelCheck.status, "match");
  assert.strictEqual(phase.modelCheck.expected, "haiku");
});

test("COCALC-273 AC12: Agent input.model + eltérő sidechain-modell esetén 'mismatch' státusz", () => {
  const report = runAnalyze(path.join(FIXTURES_DIR, "model-check.jsonl"));
  const phase = report.phases.find((p) => p.label.includes("code-reviewer (S komplexitas)"));
  assert.ok(phase, "nem talalhato a code-reviewer fazis-szegmens");
  assert.strictEqual(phase.modelCheck.status, "mismatch");
  assert.deepStrictEqual(phase.modelCheck.actual, ["claude-sonnet-5"]);
});

test("COCALC-273 AC12: elvárt modell van, de nincs sidechain-rekord -- 'not-checkable', nem hiba", () => {
  const report = runAnalyze(path.join(FIXTURES_DIR, "model-check.jsonl"));
  const phase = report.phases.find((p) => p.label.includes("qa-tester (nincs sidechain naplo)"));
  assert.ok(phase, "nem talalhato a qa-tester fazis-szegmens");
  assert.strictEqual(phase.modelCheck.status, "not-checkable");
});

test("COCALC-273 AC12: Agent input.model hiányában a modelCheck null (nincs mit ellenőrizni)", () => {
  const report = runAnalyze(path.join(FIXTURES_DIR, "model-check.jsonl"));
  const phase = report.phases.find((p) => p.label.includes("legacy hivas model mezo nelkul"));
  assert.ok(phase, "nem talalhato a legacy fazis-szegmens");
  assert.strictEqual(phase.modelCheck, null);
});

// --- COCALC-280 (LOCAL-3) AC1-2: mainThread/subagent bontás + párhuzamos subagent jelzés ---

test("COCALC-280 AC1: minden fázis kap mainThread + subagent bontást, a kettő összege a summary", () => {
  const report = runAnalyze(path.join(FIXTURES_DIR, "model-check.jsonl"));
  for (const p of report.phases) {
    assert.ok(p.mainThread && p.subagent, `hiányzó bontás: ${p.label}`);
    assert.strictEqual(p.mainThread.callCount + p.subagent.callCount, p.summary.callCount, p.label);
    assert.strictEqual(p.mainThread.input + p.subagent.input, p.summary.input, p.label);
    assert.strictEqual(p.mainThread.cacheRead + p.subagent.cacheRead, p.summary.cacheRead, p.label);
  }
});

test("COCALC-280 AC1: az implementer szegmensben a sidechain rekord a subagent bontásba kerül", () => {
  const report = runAnalyze(path.join(FIXTURES_DIR, "model-check.jsonl"));
  const phase = report.phases.find((p) => p.label.includes("implementer (S komplexitas)"));
  assert.ok(phase, "nincs implementer szegmens");
  assert.strictEqual(phase.subagent.callCount, 1);
  assert.strictEqual(phase.subagent.input, 300);
  assert.strictEqual(phase.mainThread.callCount, 1); // maga az Agent-hívó fő szál üzenet
});

test("COCALC-280 AC2: egy üzenetből induló két párhuzamos Agent-hívás egy szegmensbe kerül, parallelSubagents=2", () => {
  const report = runAnalyze(path.join(FIXTURES_DIR, "parallel-subagents.jsonl"));
  const phase = report.phases.find((p) => (p.parallelSubagents || 1) > 1);
  assert.ok(
    phase,
    `nincs párhuzamosnak jelölt szegmens: ${JSON.stringify(report.phases.map((p) => [p.label, p.parallelSubagents]))}`
  );
  assert.strictEqual(phase.parallelSubagents, 2);
  assert.ok(phase.label.startsWith("Párhuzamos subagentek (2):"), phase.label);
  assert.strictEqual(phase.subagent.callCount, 2);
  assert.strictEqual(phase.subagent.input, 1100);
});

test("COCALC-280 AC2: a párhuzamos szegmens ellenére a total változatlanul pontos", () => {
  const report = runAnalyze(path.join(FIXTURES_DIR, "parallel-subagents.jsonl"));
  const sumCalls = report.phases.reduce((a, p) => a + p.summary.callCount, 0);
  assert.strictEqual(sumCalls, report.total.callCount);
  assert.strictEqual(report.total.callCount, 5);
});

test("COCALC-280 AC2: nem párhuzamos session minden szegmensén parallelSubagents=1", () => {
  const report = runAnalyze(path.join(FIXTURES_DIR, "model-check.jsonl"));
  for (const p of report.phases) assert.strictEqual(p.parallelSubagents, 1);
});

// --- COCALC-280 (LOCAL-3) AC3-5 + edge case-ek: --aggregate mód ---

test("COCALC-280 AC3: --aggregate fázis-címke szerint összesít, aggregate.json + aggregate.html készül", () => {
  const { json, htmlExists } = runAggregate(AGGREGATE_FIXTURE_DIR);
  assert.ok(htmlExists, "nincs aggregate.html");
  assert.strictEqual(json.mode, "aggregate");
  const labels = json.phases.map((p) => p.label);
  assert.ok(labels.includes("Skill: dev-workflow-execute"));
  assert.ok(labels.includes("Agent: implementer"));
  const dwe = json.phases.find((p) => p.label === "Skill: dev-workflow-execute");
  assert.strictEqual(dwe.reportCount, 2);
  assert.strictEqual(dwe.summary.callCount, 3); // 2 (session-a) + 1 (session-b)
});

test("COCALC-280 AC4: sérült / séma-idegen report.json kihagyva, számláló nő, nem hasal el", () => {
  const { json } = runAggregate(AGGREGATE_FIXTURE_DIR);
  assert.ok(json.reportsSkipped >= 2, `skipped=${json.reportsSkipped}`);
  const reasons = json.skipped.map((s) => s.reason).join("|");
  assert.ok(/sérült JSON/.test(reasons), reasons);
  assert.ok(/séma-idegen/.test(reasons), reasons);
  assert.strictEqual(json.reportsAggregated, 2);
});

test("COCALC-280 AC5: az összesített fázisok cipelt kontextus (input + cacheRead) szerint csökkenő sorrendben", () => {
  const { json } = runAggregate(AGGREGATE_FIXTURE_DIR);
  const cc = json.phases.map((p) => p.carriedContext);
  assert.deepStrictEqual(cc, [...cc].sort((a, b) => b - a));
  assert.strictEqual(json.phases[0].label, "Agent: implementer"); // 8000 + 20000 a legnagyobb
  assert.strictEqual(json.phases[0].carriedContext, 28000);
});

test("COCALC-280 edge: üres --aggregate mappa -> beszédes hiba, nincs üres riport", () => {
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-cost-report-empty-"));
  let threw = false;
  try {
    execFileSync("node", [ANALYZE_JS, "--aggregate", emptyDir], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    threw = true;
    assert.ok(
      /nem található egyetlen feldolgozható report\.json/i.test(String(e.stderr || e.stdout || "")),
      String(e.stderr || e.stdout)
    );
  } finally {
    fs.rmSync(emptyDir, { recursive: true, force: true });
  }
  assert.ok(threw, "üres mappánál hibával kellett volna kilépnie");
});

test("COCALC-280 edge: eltérő fázis-címke-halmazok jelezve (labelSetConsistent=false), nincs csendes összefésülés", () => {
  const { json } = runAggregate(AGGREGATE_FIXTURE_DIR);
  assert.strictEqual(json.labelSetConsistent, false);
  assert.ok(/eltérő fázis-címke/i.test(json.labelSetNote), json.labelSetNote);
});

test("COCALC-280 edge: séma-verzió eltérés -> hiányzó mainThread/subagent 'ismeretlen' (null), nem nulla", () => {
  const { json } = runAggregate(AGGREGATE_FIXTURE_DIR);
  const qa = json.phases.find((p) => p.label === "Agent: qa-tester");
  assert.ok(qa, "nincs qa-tester fázis");
  assert.strictEqual(qa.mainThread, null); // csak régi sémájú riportban szerepelt
  assert.ok(/0\/1/.test(qa.breakdownCoverage), qa.breakdownCoverage);
  const impl = json.phases.find((p) => p.label === "Agent: implementer");
  assert.notStrictEqual(impl.mainThread, null); // volt bontással érkező riport
});

// --- COCALC-280 M1 code review: mark_chapter + párhuzamos Agent egy üzenetből ---

test("COCALC-280 M1: mark_chapter + 2 párhuzamos Agent egy üzenetből (chapter marker a content végén) — a fázishatár megmarad, parallelSubagents pontosan 2", () => {
  const report = runAnalyze(path.join(FIXTURES_DIR, "parallel-plus-chapter.jsonl"));
  const chapterPhase = report.phases.find((p) => p.label.includes("dev-workflow-intake / 2.a"));
  assert.ok(
    chapterPhase,
    `a mark_chapter fázishatár elveszett: ${JSON.stringify(report.phases.map((p) => p.label))}`
  );
  // Nem szippantotta be a mark_chapter markert a párhuzamos csoportba -> nem 3.
  assert.strictEqual(chapterPhase.parallelSubagents, 2);
  const overcounted = report.phases.find((p) => (p.parallelSubagents || 1) > 2);
  assert.ok(!overcounted, "parallelSubagents túlszámolt (a mark_chapter marker beszippantva?)");
  // A párhuzamos ágak sidechain-rekordjai ehhez a (fázishatár-)szegmenshez tartoznak.
  assert.strictEqual(chapterPhase.subagent.callCount, 2);
  assert.strictEqual(chapterPhase.subagent.input, 850);
});

test("COCALC-280 M1: a párhuzamos + mark_chapter esetben is pontos a total", () => {
  const report = runAnalyze(path.join(FIXTURES_DIR, "parallel-plus-chapter.jsonl"));
  const sumCalls = report.phases.reduce((a, p) => a + p.summary.callCount, 0);
  assert.strictEqual(sumCalls, report.total.callCount);
  assert.strictEqual(report.total.callCount, 5);
});

// --- COCALC-280 M2 code review: reportCount riportonként, nem előfordulásonként ---

test("COCALC-280 M2: két riport AZONOS címkehalmazzal -> labelSetConsistent true (happy path)", () => {
  const { json } = runAggregate(path.join(FIXTURES_DIR, "aggregate-consistent"));
  assert.strictEqual(json.labelSetConsistent, true);
  assert.ok(!/FIGYELEM/.test(json.labelSetNote), json.labelSetNote);
  const impl = json.phases.find((p) => p.label === "Agent: implementer");
  assert.strictEqual(impl.reportCount, 2);
  assert.strictEqual(impl.occurrenceCount, 2);
});

test("COCALC-280 M2: riporton belül ismétlődő címke nem billenti hamis 'eltérő címkehalmaz'-ba", () => {
  const { json } = runAggregate(path.join(FIXTURES_DIR, "aggregate-repeated-label"));
  assert.strictEqual(json.labelSetConsistent, true);
  assert.ok(!/FIGYELEM/.test(json.labelSetNote), json.labelSetNote);
  const impl = json.phases.find((p) => p.label === "Agent: implementer");
  assert.strictEqual(impl.reportCount, 2); // 2 külön riport, nem 3 előfordulás
  assert.strictEqual(impl.occurrenceCount, 3); // 3 előfordulás összesen (s1-ben kétszer)
  assert.strictEqual(impl.summary.callCount, 9); // 3 + 2 (s1) + 4 (s2)
  assert.strictEqual(impl.carriedContext, 9000); // input 3000 + cacheRead 6000
  assert.ok(/2\/2/.test(impl.breakdownCoverage), impl.breakdownCoverage);
});

// --- ORD-366 ---

// AC1: a gyökér "type":"module" (ESM-repó) mellett is fut. A tool-mappa másolata egy
// ESM-gyökerű ideiglenes repóba kerül, onnan indul az analyze.js.
test("ORD-366 AC1: ESM-gyökerű (type: module) repóban is hiba nélkül fut", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-cost-report-esm-"));
  try {
    fs.writeFileSync(path.join(root, "package.json"), '{"name":"esm-repo","type":"module"}\n');
    const toolDir = path.join(root, ".claude", "tools", "session-cost-report");
    fs.mkdirSync(toolDir, { recursive: true });
    for (const f of ["analyze.js", "pricing.js", "pricing.json", "package.json"]) {
      fs.copyFileSync(path.join(__dirname, f), path.join(toolDir, f));
    }
    const outDir = path.join(root, "out");
    execFileSync(
      "node",
      [
        path.join(toolDir, "analyze.js"),
        "--session",
        path.join(FIXTURES_DIR, "dedupe.jsonl"),
        "--out",
        outDir,
      ],
      { encoding: "utf8", cwd: root }
    );
    assert.ok(fs.existsSync(path.join(outDir, "report.json")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("ORD-366 AC1: a tool-mappa package.json-ja commonjs", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
  assert.strictEqual(pkg.type, "commonjs");
});

// AC2: subagents/ naplók
test("ORD-366 AC2: a subagents/ naplók beleszámítanak, a fő szál és a subagentek külön látszanak", () => {
  const report = runAnalyze(path.join(FIXTURES_DIR, "subagent-session", "sess-sub.jsonl"));
  assert.strictEqual(report.subagentLogsFound, 2);
  // fő szál: 2 hívás; abc: 2 egyedi (a streaming-duplikátum nélkül); def: 1
  assert.strictEqual(report.mainThreadTotal.callCount, 2);
  assert.strictEqual(report.subagentTotal.callCount, 3);
  assert.strictEqual(report.total.callCount, 5);
  assert.strictEqual(report.subagentTotal.input, 1000 + 2000 + 300);
});

test("ORD-366 AC2: subagentenkénti bontás típussal és leírással (meta-fájlból), meta nélkül is működik", () => {
  const report = runAnalyze(path.join(FIXTURES_DIR, "subagent-session", "sess-sub.jsonl"));
  const abc = report.subagents.find((s) => s.agentId === "abc");
  assert.strictEqual(abc.agentType, "implementer");
  assert.strictEqual(abc.description, "Fix ORD-1 step 2");
  assert.strictEqual(abc.summary.callCount, 2);
  const def = report.subagents.find((s) => s.agentId === "def");
  assert.strictEqual(def.agentType, null);
  assert.strictEqual(def.summary.callCount, 1);
});

test("ORD-366 AC2: a naplóból nem kerül tartalom a riportba (csak számok és címkék)", () => {
  const report = runAnalyze(path.join(FIXTURES_DIR, "subagent-session", "sess-sub.jsonl"));
  assert.ok(!JSON.stringify(report).includes("a feladat szovege"));
});

test("ORD-366 AC2: subagent nélküli session változatlanul működik (subagents üres)", () => {
  const report = runAnalyze(path.join(FIXTURES_DIR, "dedupe.jsonl"));
  assert.strictEqual(report.subagentLogsFound, 0);
  assert.deepStrictEqual(report.subagents, []);
});

// AC3: streaming-duplikátumok
test("ORD-366 AC3: az azonos message.id + requestId sorok egyszer számítanak (a végső usage-szal)", () => {
  const report = runAnalyze(path.join(FIXTURES_DIR, "dedupe.jsonl"));
  // msg_1 (3 sor -> 1), msg_2, 2 azonosító nélküli; a <synthetic> kimarad
  assert.strictEqual(report.total.callCount, 4);
  assert.strictEqual(report.duplicatesDropped, 2);
  assert.strictEqual(report.total.output, 50 + 20 + 5 + 5);
  assert.strictEqual(report.total.input, 100 + 200 + 5 + 5);
  assert.strictEqual(report.total.cacheRead, 1000 + 2000);
});

test("ORD-366 AC3: a duplikált sorokban ismétlődő tool_use egyszer jelöl fázist", () => {
  const report = runAnalyze(path.join(FIXTURES_DIR, "dedupe.jsonl"));
  const skillPhases = report.phases.filter((p) => p.label === "Skill: dev-workflow-execute");
  assert.strictEqual(skillPhases.length, 1);
});

test("ORD-366 AC3: a subagent-napló streaming-duplikátuma sem számolódik kétszer", () => {
  const report = runAnalyze(path.join(FIXTURES_DIR, "subagent-session", "sess-sub.jsonl"));
  const abc = report.subagents.find((s) => s.agentId === "abc");
  assert.strictEqual(abc.summary.output, 100 + 200);
});

// AC4: modellárak
test("ORD-366 AC4: opus, sonnet, haiku, fable ismert modell-id-nek nem 0 $ és nem ismeretlen", () => {
  const pricing = JSON.parse(fs.readFileSync(path.join(__dirname, "pricing.json"), "utf8"));
  for (const id of [
    "claude-opus-5-5",
    "claude-sonnet-5-5",
    "claude-haiku-5-5",
    "claude-fable-5-1",
  ]) {
    assert.ok(pricing.models[id], `hiányzik a pricing.json models-ből: ${id}`);
    assert.ok(pricing.models[id].input > 0);
  }
  for (const fam of ["opus", "sonnet", "haiku", "fable"]) {
    assert.ok(pricing.families[fam], `hiányzik a pricing.json families-ből: ${fam}`);
  }
});

test("ORD-366 AC4: az opus / fable / haiku hívás ára > 0, csak az igazán ismeretlen család jelölt", () => {
  const report = runAnalyze(path.join(FIXTURES_DIR, "pricing-models.jsonl"));
  const pricing = JSON.parse(fs.readFileSync(path.join(__dirname, "pricing.json"), "utf8"));
  const by = report.total.byModel;
  assert.strictEqual(by["claude-opus-5-5"].cost, pricing.models["claude-opus-5-5"].input);
  assert.strictEqual(by["claude-fable-5-1"].cost, pricing.models["claude-fable-5-1"].input);
  // a fixture 1M tokenes promptja a Haiku 5.5 longContext küszöbe fölött van
  assert.strictEqual(
    by["claude-haiku-5-5"].cost,
    pricing.models["claude-haiku-5-5"].longContext.input
  );
  // ismeretlen verzió, de ismert család: a családár érvényes, nem jelölt ismeretlennek
  assert.strictEqual(by["claude-opus-9-9"].cost, pricing.families.opus.input);
  assert.deepStrictEqual(report.unknownModels, ["claude-mystery-9"]);
});

test("ORD-366 AC4: az ismeretlen modellt a CLI-kimenet és a HTML is jelzi, a pricingVerified is megmarad", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-cost-report-unk-"));
  try {
    const stdout = execFileSync(
      "node",
      [ANALYZE_JS, "--session", path.join(FIXTURES_DIR, "pricing-models.jsonl"), "--out", outDir],
      { encoding: "utf8" }
    );
    assert.ok(/claude-mystery-9/.test(stdout), stdout);
    const html = fs.readFileSync(path.join(outDir, "report.html"), "utf8");
    assert.ok(/Ismeretlen modell/.test(html));
    const json = JSON.parse(fs.readFileSync(path.join(outDir, "report.json"), "utf8"));
    assert.strictEqual(typeof json.pricingVerified, "boolean");
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test("ORD-376: az 1 órás cache-írás cacheWrite1h áron, az 5 perces cacheWrite áron számolódik", () => {
  const pricing = JSON.parse(fs.readFileSync(path.join(__dirname, "pricing.json"), "utf8"));
  const rate = pricing.models["claude-sonnet-5-5"];
  const report = runAnalyze(path.join(FIXTURES_DIR, "cache-1h.jsonl"));
  const expected = rate.cacheWrite + rate.cacheWrite1h; // 1M token mindkettőből
  assert.ok(Math.abs(report.total.byModel["claude-sonnet-5-5"].cost - expected) < 1e-9);
});

test("ORD-376: Haiku 5.5 longContext ára a 100 000 token fölötti promptnál érvényes", () => {
  const pricing = JSON.parse(fs.readFileSync(path.join(__dirname, "pricing.json"), "utf8"));
  const rate = pricing.models["claude-haiku-5-5"];
  const report = runAnalyze(path.join(FIXTURES_DIR, "long-context.jsonl"));
  // 150 000 token > küszöb: longContext ár; 50 000 token: normál ár
  const expected = (150000 * rate.longContext.input + 50000 * rate.input) / 1e6;
  assert.ok(Math.abs(report.total.byModel["claude-haiku-5-5"].cost - expected) < 1e-9);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
