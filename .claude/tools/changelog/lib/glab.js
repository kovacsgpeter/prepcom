"use strict";
/**
 * changelog adatgyűjtő — `glab` (GitLab CLI) wrapper (COCALC-241).
 *
 * A `glab mr list --merged --all -F json` kimenetét adja vissza parse-olva
 * (nyers MR-objektumok tömbje). Két rövidre záró út a teszthez / offline futáshoz:
 *
 *   - `fixturePath` opció VAGY `CHANGELOG_GLAB_FIXTURE` env  -> a megadott fájlból
 *     olvassa a JSON-t, `glab`-ot nem hív.
 *   - `exec` opció  -> injektált futtató (args[] -> stdout string), `glab` helyett.
 *
 * Élő `glab`-hiba vagy nem-JSON kimenet esetén beszédes hibát dob (a hívó
 * collect.js kezeli / jelenti).
 */

const fs = require("fs");
const { execFileSync } = require("child_process");

function defaultExec(args) {
  return execFileSync("glab", args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64,
  });
}

/**
 * @param {object} [opts]
 * @param {string} [opts.fixturePath]  JSON-fixture útja (default: CHANGELOG_GLAB_FIXTURE env).
 * @param {(args:string[])=>string} [opts.exec]  Injektált parancs-futtató.
 * @returns {Array<object>}  Nyers MR-objektumok.
 */
function listMergedMRs(opts = {}) {
  const fixturePath = opts.fixturePath || process.env.CHANGELOG_GLAB_FIXTURE || null;
  if (fixturePath) {
    let raw;
    try {
      raw = fs.readFileSync(fixturePath, "utf8");
    } catch (e) {
      throw new Error("a glab-fixture nem olvasható (" + fixturePath + "): " + e.message);
    }
    return parseJsonArray(raw, "glab-fixture (" + fixturePath + ")");
  }

  const exec = opts.exec || defaultExec;
  let out;
  try {
    out = exec(["mr", "list", "--merged", "--all", "-F", "json"]);
  } catch (e) {
    throw new Error("a `glab mr list` hívás sikertelen: " + (e.message || String(e)));
  }
  return parseJsonArray(out, "`glab mr list` kimenete");
}

function parseJsonArray(raw, label) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(label + " nem érvényes JSON: " + e.message);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(label + " nem tömb (várt: MR-objektumok listája)");
  }
  return parsed;
}

module.exports = { listMergedMRs };
