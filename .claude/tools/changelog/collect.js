#!/usr/bin/env node
"use strict";
/**
 * changelog adatgyűjtő szkript (COCALC-241).
 *
 * Két release/tag közötti merge-elt MR-eket gyűjti a GitLab-ból (`glab`), a
 * forrás-branch nevéből jelleget + ticketkulcsot fejt, jelleg szerint csoportosít,
 * és egy géppel feldolgozható JSON-t ad stdout-ra (vagy `--out <fájl>`-ba).
 * `enriched` / `standalone` módban a Jira REST API-ból ticket-címmel is dúsít.
 *
 * Tiszta Node core (18+), nincs npm-függőség. Az élő git / glab / Jira mind
 * injektálható a `run(argv, deps)` belépőn keresztül (teszthez).
 *
 * Használat:
 *   node collect.js                       # utolsó két release közötti tartomány, stdout
 *   node collect.js --from v1.2.0 --to HEAD
 *   node collect.js --out changelog-data.json
 *   node collect.js --config <config.md útja>
 *
 * Kilépőkód: mindig 0, hacsak a git/glab hívás használhatatlan hibát nem ad
 * (a Jira-hiba nem végzetes: jiraFallback jelzéssel, offline eredménnyel folytat).
 */

const fs = require("fs");

const { loadConfig } = require("./lib/config");
const { resolveRange, defaultGit } = require("./lib/range");
const { parseBranch } = require("./lib/branch-parse");
const { listMergedMRs } = require("./lib/glab");
const { enrichWithJira } = require("./lib/jira");
const { groupByNature } = require("./lib/group");
const { loadManifest, isVersionedPath } = require("./lib/manifest");

const HELP = [
  "changelog adatgyűjtő (COCALC-241)",
  "",
  "  node collect.js [--from <ref>] [--to <ref>] [--out <fájl>] [--config <config.md>]",
  "",
  "  --from <ref>    tartomány kezdete (default: előző release tag / repo-gyökér)",
  "  --to <ref>      tartomány vége (default: utolsó release tag / HEAD)",
  "  --out <fájl>    a JSON-t fájlba írja stdout helyett",
  "  --config <út>   a dev-workflow config.md alternatív útja",
  "  -h, --help      ez a súgó",
  "",
].join("\n");

function parseArgs(argv) {
  const args = { from: null, to: null, out: null, config: null, help: false, unknown: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from") args.from = argv[++i];
    else if (a === "--to") args.to = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--config") args.config = argv[++i];
    else if (a === "-h" || a === "--help") args.help = true;
    else if (a.startsWith("-")) args.unknown.push(a);
    // Nem '-' kezdetű (pozicionális) argumentum nincs — csendben átugorjuk.
  }
  return args;
}

function splitLines(s) {
  return String(s || "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * @param {string[]} argv  process.argv.slice(2)
 * @param {object} [deps]
 *   git             (args[]) => stdout string            (default: valódi git)
 *   glabExec        (args[]) => stdout string            (default: valódi glab)
 *   glabFixturePath JSON-fixture útja                    (default: CHANGELOG_GLAB_FIXTURE env)
 *   fetchImpl       fetch-kompatibilis függvény          (default: globális fetch)
 *   env             környezeti változók objektuma        (default: process.env)
 *   configText      nyers config.md tartalom             (default: fájlból)
 *   configPath      config.md útja                       (default: repo-gyökér alatti)
 *   manifestText    nyers dev-workflow-manifest.json      (default: fájlból)
 *   manifestPath    dev-workflow-manifest.json útja       (default: repo-gyökér alatti)
 *   now             () => Date  a generatedAt forrása     (default: () => new Date())
 *   stdout / stderr  { write(str) } stream-szerű         (default: process.stdout/stderr)
 * @returns {Promise<number>}  kilépőkód
 */
async function run(argv, deps = {}) {
  const git = deps.git || defaultGit;
  const env = deps.env || process.env;
  const now = deps.now || (() => new Date());
  const stdout = deps.stdout || process.stdout;
  const stderr = deps.stderr || process.stderr;
  const warn = (m) => stderr.write(m + "\n");

  const args = parseArgs(argv || []);
  if (args.help) {
    stdout.write(HELP);
    return 0;
  }
  for (const u of args.unknown) {
    warn("figyelmeztetés: ismeretlen kapcsoló: " + u + " (kihagyva)");
  }

  const cfg = loadConfig({
    configText: deps.configText,
    configPath: args.config || deps.configPath,
    warn,
  });

  const range = resolveRange({ from: args.from, to: args.to, git });

  // Merge-commit SHA-k a tartományban (commit-gráf alapú, determinisztikus).
  let mergeShas = [];
  try {
    mergeShas = splitLines(
      git(["log", "--first-parent", "--merges", "--pretty=%H", range.range])
    );
  } catch (e) {
    warn(
      "figyelem: a merge-commitok lekérdezése sikertelen (" +
        (e.message || String(e)) +
        ") — üres merge-halmazzal folytatom"
    );
  }
  const shaSet = new Set(mergeShas);

  // Merge-elt MR-ek a GitLab-ból, majd metszet a tartomány merge-commitjaival.
  const rawMrs = listMergedMRs({
    exec: deps.glabExec,
    fixturePath: deps.glabFixturePath,
  });

  const inRange = rawMrs.filter((mr) => {
    const sha = mr.merge_commit_sha || mr.mergeCommitSha || null;
    return sha && shaSet.has(sha);
  });

  const inRangeMapped = inRange.map((mr) => {
    const branch = mr.source_branch || mr.sourceBranch || "";
    const parsed = parseBranch(branch, { natureTags: cfg.natureTags });
    return {
      sha: mr.merge_commit_sha || mr.mergeCommitSha || null,
      mr: {
        ticketKey: parsed.ticketKey,
        nature: parsed.nature,
        branch: branch,
        title: mr.title || "",
        url: mr.web_url || mr.webUrl || "",
      },
    };
  });

  // Útvonal-szűrés (COCALC-243): a changelog CSAK a dev-workflow-manifest.json
  // `versioned` halmazát érintő MR-eket tartalmazza — a `repo_local_exceptions`
  // (config.md, history.md, .claude/launch.json) és a nem csomag-részt (alkalmazás-
  // kód, gyökér-fájlok) érintő MR-ek kiesnek. A manifest a merge-commit
  // `git diff --name-only <sha>^1 <sha>` fájllistája ellen dönt.
  const manifest = loadManifest({
    manifestText: deps.manifestText,
    manifestPath: deps.manifestPath,
    warn,
  });

  const excludedNonVersioned = [];
  let mrs;
  if (manifest && manifest.versioned && manifest.versioned.length) {
    mrs = [];
    for (const { sha, mr } of inRangeMapped) {
      if (!sha) {
        // Merge-commit SHA nélkül nincs mihez diffelni — fail-open, bekerül.
        mrs.push(mr);
        continue;
      }
      let changed;
      try {
        changed = splitLines(git(["diff", "--name-only", sha + "^1", sha]));
      } catch (e) {
        warn(
          "figyelem: a(z) " +
            sha +
            " merge-commit változott fájljai nem állapíthatók meg (" +
            (e.message || String(e)) +
            ") — az MR szűrés nélkül bekerül"
        );
        mrs.push(mr);
        continue;
      }
      if (changed.some((p) => isVersionedPath(p, manifest))) {
        mrs.push(mr);
      } else {
        excludedNonVersioned.push({
          ticketKey: mr.ticketKey,
          branch: mr.branch,
          url: mr.url,
        });
      }
    }
    if (excludedNonVersioned.length) {
      warn(
        excludedNonVersioned.length +
          " MR kihagyva a csomag-naplóból (csak nem-verziózott / repo-lokális útvonalat érint): " +
          excludedNonVersioned.map((m) => m.branch).join(", ")
      );
    }
  } else {
    if (manifest === null) {
      warn(
        "figyelem: a dev-workflow-manifest.json nem olvasható vagy érvénytelen — " +
          "az útvonal-szűrés kimarad, minden MR bekerül"
      );
    } else {
      warn(
        "figyelem: a dev-workflow-manifest.json 'versioned' listája üres — " +
          "az útvonal-szűrés kimarad, minden MR bekerül"
      );
    }
    mrs = inRangeMapped.map((x) => x.mr);
  }

  // Jira-dúsítás (enriched / standalone — azonos viselkedés).
  let jiraFallback = false;
  if (cfg.mode !== "offline") {
    const res = await enrichWithJira(mrs, {
      fetchImpl: deps.fetchImpl,
      baseUrl: env.JIRA_BASE_URL,
      token: env.JIRA_API_TOKEN,
      warn,
    });
    mrs = res.mrs;
    jiraFallback = res.jiraFallback;
  }

  const groups = groupByNature(mrs, { natureTags: cfg.natureTags });

  const output = {
    range: { from: range.from, to: range.to, fromKind: range.fromKind },
    mrCount: mrs.length,
    generatedAt: now().toISOString(),
    mode: cfg.mode,
  };
  if (jiraFallback) output.jiraFallback = true;
  if (excludedNonVersioned.length) output.excludedNonVersioned = excludedNonVersioned;
  output.groups = groups;

  if (mrs.length === 0) {
    if (inRange.length === 0) {
      warn(
        "nincs merge-commit-alapú MR a tartományban (" +
          range.range +
          ") — squash/ff-merge esetén ez várható, lásd README Korlátok"
      );
    } else {
      warn(
        "a tartomány minden MR-je kiesett az útvonal-szűrés után (egyik sem érint " +
          "verziózott csomag-útvonalat) — nem generálódik changelog-szakasz"
      );
    }
  }

  const json = JSON.stringify(output, null, 2);
  if (args.out) {
    fs.writeFileSync(args.out, json + "\n");
    warn("a kimenet ide íródott: " + args.out);
  } else {
    stdout.write(json + "\n");
  }
  return 0;
}

module.exports = { run, parseArgs };

if (require.main === module) {
  run(process.argv.slice(2), {})
    .then((code) => process.exit(code))
    .catch((e) => {
      process.stderr.write("HIBA: " + (e && e.stack ? e.stack : String(e)) + "\n");
      process.exit(1);
    });
}
