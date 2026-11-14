"use strict";
/**
 * changelog adatgyűjtő — release-tartomány meghatározása (COCALC-241).
 *
 * A tartomány `<from>..<to>` alakú git revízió-tartomány, amiből a merge-elt
 * MR-eket gyűjtjük. Szabály (a config.md / ci/release-version-bump.sh logikájával
 * konzisztensen):
 *
 *   - >= 2 tag  ->  előző..utolsó        (a `v*` tagek `-v:refname` szerint csökkenő)
 *   - 1 tag     ->  <gyökér>..tag        (a `v*` tag az egyetlen)
 *   - 0 tag     ->  <gyökér>..HEAD
 *
 * ahol `<gyökér>` = `git rev-list --max-parents=0 HEAD` (a repo első commitja).
 * A `--from <ref>` / `--to <ref>` bármelyik oldalt felülbírálja.
 *
 * A git-futtató injektálható (teszthez); alapból a valódi `git`-et hívja.
 */

const { execFileSync } = require("child_process");

function defaultGit(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 64 }).trim();
}

function splitLines(s) {
  return String(s || "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function rootCommit(git) {
  const lines = splitLines(git(["rev-list", "--max-parents=0", "HEAD"]));
  // Több gyökér-commit (ritka, pl. összefésült history) esetén a legrégebbit
  // (utolsó sor) vesszük — az fedi le a teljes történetet.
  return lines.length ? lines[lines.length - 1] : "HEAD";
}

/**
 * @param {object} [opts]
 * @param {string} [opts.from]  Explicit kezdő-ref (felülbírálja a tag-alapú számítást).
 * @param {string} [opts.to]    Explicit záró-ref.
 * @param {(args:string[])=>string} [opts.git]  Injektálható git-futtató.
 * @returns {{from:string, to:string, fromKind:('explicit'|'tag'|'root'), range:string}}
 */
function resolveRange(opts = {}) {
  const git = opts.git || defaultGit;
  const explicitFrom = opts.from != null && opts.from !== "";
  const explicitTo = opts.to != null && opts.to !== "";

  let tags = [];
  try {
    tags = splitLines(git(["tag", "-l", "v*", "--sort=-v:refname"]));
  } catch (e) {
    tags = [];
  }

  let to;
  if (explicitTo) to = opts.to;
  else if (tags.length >= 1) to = tags[0];
  else to = "HEAD";

  let from;
  let fromKind;
  if (explicitFrom) {
    from = opts.from;
    fromKind = "explicit";
  } else if (tags.length >= 2) {
    from = tags[1];
    fromKind = "tag";
  } else {
    from = rootCommit(git);
    fromKind = "root";
  }

  return { from, to, fromKind, range: from + ".." + to };
}

module.exports = { resolveRange, defaultGit };
