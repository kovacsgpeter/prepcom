"use strict";
/**
 * changelog adatgyűjtő — dev-workflow csomag-határ (manifest) kiolvasása (COCALC-243).
 *
 * A repo-gyökér `dev-workflow-manifest.json`-ból beolvassa a `versioned` és a
 * `repo_local_exceptions` listát, és eldönti egy repo-relatív útvonalról, hogy a
 * VERZIÓZOTT csomag-tartalom része-e. Ezt használja a `collect.js` arra, hogy a
 * changelog-adatba CSAK azok az MR-ek kerüljenek be, amelyek ténylegesen a
 * verziózott csomagrészt (skillek, subagentek, eszközök) érintik — a repo-lokális
 * állapotot (`config.md`, `history.md`, `.claude/launch.json`) és a nem csomag-részt
 * (alkalmazáskód, gyökér-fájlok) érintő MR-ek kiesnek. Lásd COCALC-243 AC3/AC5.
 *
 * Tiszta Node core, nincs npm-függőség. A manifest szöveg/útvonal injektálható
 * (teszthez), alapból a repo-gyökér `dev-workflow-manifest.json`-t olvassa.
 *
 * KONVENCIÓ: a `versioned` (és `repo_local_exceptions`) lista **könyvtár**-bejegyzései
 * KÖTELEZŐEN záró `/`-rel szerepelnek (pl. `".claude/skills/"`). Záró `/` nélkül az
 * `isVersionedPath` pontos fájl-egyezésként kezeli a bejegyzést, és egyetlen, a
 * könyvtár alatti diff-sorra sem talál — ezt a `ci/verify-dev-workflow-manifest.sh`
 * formai ellenőrzés is kikényszeríti (könyvtárnak látszó, kiterjesztés nélküli,
 * `/`-re nem végződő bejegyzés → hiba).
 */

const fs = require("fs");
const path = require("path");

// Ez a fájl a .claude/tools/changelog/lib/ alatt van -> négy szinttel feljebb a
// repo-gyökér, ott a dev-workflow-manifest.json.
const DEFAULT_MANIFEST_PATH = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "dev-workflow-manifest.json"
);

/**
 * @param {object} [opts]
 * @param {string} [opts.manifestPath]  A dev-workflow-manifest.json útvonala.
 * @param {string} [opts.manifestText]  Nyers manifest-tartalom — ha meg van adva,
 *                                      ezt használja fájlolvasás helyett (teszthez).
 * @param {(msg:string)=>void} [opts.warn]  Figyelmeztetés-csatorna (default: stderr).
 * @returns {{versioned:string[], repoLocalExceptions:string[]}|null}
 *          `null`, ha a manifest nem olvasható / nem érvényes JSON — a hívó ilyenkor
 *          az útvonal-szűrést kihagyja (fail-open), nem szakítja meg a futást.
 */
function loadManifest(opts = {}) {
  const warn = opts.warn || ((m) => process.stderr.write(m + "\n"));

  let text = opts.manifestText;
  if (text == null) {
    const p = opts.manifestPath || DEFAULT_MANIFEST_PATH;
    try {
      text = fs.readFileSync(p, "utf8");
    } catch (e) {
      warn(
        "figyelem: a dev-workflow-manifest.json nem olvasható (" +
          p +
          "): " +
          e.message +
          " — az útvonal-szűrés kimarad, minden MR bekerül"
      );
      return null;
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    warn(
      "figyelem: a dev-workflow-manifest.json nem érvényes JSON (" +
        e.message +
        ") — az útvonal-szűrés kimarad, minden MR bekerül"
    );
    return null;
  }

  const versioned = Array.isArray(parsed.versioned) ? parsed.versioned.slice() : [];
  const repoLocalExceptions = Array.isArray(parsed.repo_local_exceptions)
    ? parsed.repo_local_exceptions.slice()
    : [];

  return { versioned, repoLocalExceptions };
}

/**
 * Igaz, ha a `relPath` a VERZIÓZOTT csomag-tartalom része a manifest szerint:
 *   - a `repo_local_exceptions` egyik pontos útvonalával egyező, vagy egy `/`-re végződő
 *     (könyvtár-) bejegyzésének prefixe alá eső (ORD-506, az installer ORD-384
 *     szemantikája) -> mindig false (akkor is, ha egyébként egy `versioned` könyvtár-prefix
 *     alá esne);
 *   - a `versioned` lista egy fájl-bejegyzésével pontosan egyező -> true;
 *   - a `versioned` lista egy `/`-re végződő könyvtár-bejegyzésének prefixe alá eső
 *     -> true;
 *   - egyébként false.
 *
 * A könyvtár-bejegyzés felismerése KIZÁRÓLAG a záró `/` alapján történik (lásd a fenti
 * KONVENCIÓ-t) — egy `/` nélküli bejegyzés mindig pontos fájl-egyezésként viselkedik.
 *
 * A `relPath` normalizálva lesz: `\` -> `/`, vezető `./` levágva.
 *
 * @param {string} relPath
 * @param {{versioned:string[], repoLocalExceptions:string[]}} manifest
 * @returns {boolean}
 */
function isVersionedPath(relPath, manifest) {
  if (!relPath || !manifest) return false;
  const p = String(relPath).replace(/\\/g, "/").replace(/^\.\//, "");

  const exceptions = manifest.repoLocalExceptions || [];
  for (const e of exceptions) {
    if (typeof e !== "string" || e.length === 0) continue;
    if (e.endsWith("/") ? p.startsWith(e) : p === e) return false;
  }

  const versioned = manifest.versioned || [];
  for (const v of versioned) {
    if (typeof v !== "string" || v.length === 0) continue;
    if (v.endsWith("/")) {
      if (p === v.slice(0, -1) || p.startsWith(v)) return true;
    } else if (p === v) {
      return true;
    }
  }
  return false;
}

module.exports = { loadManifest, isVersionedPath, DEFAULT_MANIFEST_PATH };
