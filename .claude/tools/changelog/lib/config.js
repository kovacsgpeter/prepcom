"use strict";
/**
 * changelog adatgyűjtő — config-kiolvasás (COCALC-241).
 *
 * A `.claude/skills/dev-workflow/config.md` markdown-tábláiból olvassa ki a
 * changelog-generáláshoz szükséges kapcsolókat. Nincs npm-függőség, tiszta Node core.
 *
 * Kiolvasott értékek:
 *   - CHANGELOG_MODE     -> mode        (offline | enriched | standalone)
 *   - CHANGELOG_STYLE    -> style       (hu-dev | hu-user | en-standard)
 *   - TICKET_NATURE_TAGS -> natureTags  (string tömb)
 *
 * A branch-minta (`BRANCH_NAME_PATTERN` / `BRANCH_NAME_WORD_SEPARATOR`) NEM innen
 * jön — az a `branch-parse.js` regexébe van rögzítve (a `<jelleg>/<TICKETKULCS>_<...>`
 * konvenció), csak a `natureTags` halmaz konfigurálható belőle.
 *
 * Ismeretlen / hiányzó CHANGELOG_MODE|CHANGELOG_STYLE esetén a definiált viselkedés:
 * visszaesés az alapértelmezésre (`offline` ill. `hu-dev`) + stderr-figyelmeztetés
 * (nem néma hiba) — a config.md "CHANGELOG_MODE" / "CHANGELOG_STYLE" szekcióival
 * összhangban.
 *
 * A CHANGELOG_MODE/CHANGELOG_STYLE kulcs a valódi config.md-ben KÉT táblában is
 * szerepel: a `WORKFLOW_PROFILE` preset-táblában (5 cellás: cheap/balanced/genius
 * oszlopok) és a dedikált `### CHANGELOG_MODE` szekció "Jelenlegi érték" sorában
 * (3 cellás). A kiolvasás a dedikált szekcióra van horgonyozva — a preset-tábla
 * cheap-oszlopát SOSEM olvassa (lásd `tableValue`).
 */

const fs = require("fs");
const path = require("path");

const VALID_MODES = ["offline", "enriched", "standalone"];
const VALID_STYLES = ["hu-dev", "hu-user", "en-standard"];
const DEFAULT_MODE = "offline";
const DEFAULT_STYLE = "hu-dev";
const DEFAULT_NATURE_TAGS = ["feature", "fix", "build", "refactoring", "chore"];

// Alapértelmezett config.md útvonal: a repo-gyökértől számítva. Ez a fájl a
// .claude/tools/changelog/lib/ alatt van -> négy szinttel feljebb a repo-gyökér.
const DEFAULT_CONFIG_PATH = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "skills",
  "dev-workflow",
  "config.md"
);

/**
 * Egy config-kulcs "jelenlegi érték"-ét adja vissza a config.md-ből.
 *
 * Ha van dedikált `### <KEY>` szekció (a valódi config.md ilyen a CHANGELOG_MODE /
 * CHANGELOG_STYLE kulcsokhoz), a keresést arra HORGONYOZZUK: a szekció-fejléc utáni
 * első `| \`KEY\` | \`érték\` |` sort vesszük — így a fájl elején lévő
 * `WORKFLOW_PROFILE` preset-tábla 5 cellás (cheap/balanced/genius) sora sosem nyer.
 * Dedikált szekció hiányában (pl. minimál teszt-fixture) a fájl első illeszkedő
 * sora a forrás.
 */
function tableValue(text, key) {
  const sectionRe = new RegExp("^#{2,4}\\s+" + escapeRe(key) + "\\s*$", "m");
  const sm = text.match(sectionRe);
  const haystack = sm ? text.slice(sm.index + sm[0].length) : text;
  const re = new RegExp("^\\|\\s*`" + escapeRe(key) + "`\\s*\\|\\s*`([^`]+)`\\s*\\|", "m");
  const m = haystack.match(re);
  return m ? m[1].trim() : null;
}

/**
 * Ugyanaz, de a második cella ÖSSZES backtick-elt tokenjét listaként adja vissza
 * (pl. `TICKET_NATURE_TAGS` -> több érték egy cellában).
 */
function tableValueList(text, key) {
  const re = new RegExp("^\\|\\s*`" + escapeRe(key) + "`\\s*\\|\\s*([^|]+)\\|", "m");
  const m = text.match(re);
  if (!m) return null;
  const tokens = m[1].match(/`([^`]+)`/g);
  if (!tokens) return null;
  return tokens.map((t) => t.replace(/`/g, "").trim()).filter(Boolean);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @param {object} [opts]
 * @param {string} [opts.configPath]  A config.md útvonala (default: repo-gyökér alatti).
 * @param {string} [opts.configText]  Nyers config.md tartalom — ha meg van adva, ezt
 *                                    használja fájlolvasás helyett (teszthez).
 * @param {(msg:string)=>void} [opts.warn]  Figyelmeztetés-csatorna (default: stderr).
 * @returns {{mode:string, style:string, natureTags:string[], warnings:string[]}}
 */
function loadConfig(opts = {}) {
  const warn = opts.warn || ((m) => process.stderr.write(m + "\n"));
  const warnings = [];
  const emit = (m) => {
    warnings.push(m);
    warn(m);
  };

  let text = opts.configText;
  if (text == null) {
    const p = opts.configPath || DEFAULT_CONFIG_PATH;
    try {
      text = fs.readFileSync(p, "utf8");
    } catch (e) {
      emit(
        "figyelem: a config.md nem olvasható (" +
          p +
          "): " +
          e.message +
          " — alapértelmezésekkel folytatom"
      );
      text = "";
    }
  }

  let mode = tableValue(text, "CHANGELOG_MODE");
  if (!mode) {
    emit("figyelem: CHANGELOG_MODE nincs a config.md-ben — 'offline' alapértelmezéssel folytatom");
    mode = DEFAULT_MODE;
  } else if (!VALID_MODES.includes(mode)) {
    emit(
      "figyelem: ismeretlen CHANGELOG_MODE érték ('" +
        mode +
        "') — 'offline' alapértelmezésre esem vissza"
    );
    mode = DEFAULT_MODE;
  }

  let style = tableValue(text, "CHANGELOG_STYLE");
  if (!style) {
    emit("figyelem: CHANGELOG_STYLE nincs a config.md-ben — 'hu-dev' alapértelmezéssel folytatom");
    style = DEFAULT_STYLE;
  } else if (!VALID_STYLES.includes(style)) {
    emit(
      "figyelem: ismeretlen CHANGELOG_STYLE érték ('" +
        style +
        "') — 'hu-dev' alapértelmezésre esem vissza"
    );
    style = DEFAULT_STYLE;
  }

  let natureTags = tableValueList(text, "TICKET_NATURE_TAGS");
  if (!natureTags || natureTags.length === 0) {
    emit(
      "figyelem: TICKET_NATURE_TAGS nincs a config.md-ben — beépített alapértelmezésre esem vissza"
    );
    natureTags = DEFAULT_NATURE_TAGS.slice();
  }

  return {
    mode,
    style,
    natureTags,
    warnings,
  };
}

module.exports = {
  loadConfig,
  VALID_MODES,
  VALID_STYLES,
  DEFAULT_MODE,
  DEFAULT_STYLE,
  DEFAULT_NATURE_TAGS,
};
