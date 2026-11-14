#!/usr/bin/env node
/**
 * dev-workflow (ORD-379, 4.28.0)
 *
 * Ellenőrzi az agent- és skill-fájlok frontmatterjét (.claude/agents, .claude/skills,
 * .agents/skills) és a .codex/agents TOML-fájlokat.
 *
 * Használat:
 *   node ci/check-frontmatter.cjs [--root <könyvtár>]
 *
 * Kilépési kódok:
 *   0: minden fájl rendben
 *   1: van hiba
 *   2: használati hiba vagy nem létező root
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Kivonja a frontmatter részt a szövegből.
 * @param {string} text
 * @returns {{ ok: boolean, lines?: string[], startLine?: number, error?: string }}
 */
function extractFrontmatter(text) {
  // CRLF-t LF-re konvertáljuk a feldolgozás előtt
  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  if (lines.length === 0 || lines[0] !== '---') {
    return { ok: false, error: 'FM_MISSING' };
  }

  let endLine = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      endLine = i;
      break;
    }
  }

  if (endLine === -1) {
    return { ok: false, error: 'FM_MISSING' };
  }

  // A frontmatter sorai a 1. és endLine-1. index között vannak
  const fmLines = lines.slice(1, endLine);

  return {
    ok: true,
    lines: fmLines,
    startLine: 2, // 1-alapú sorszám, az első frontmatter sor a fájl 2. sora
  };
}

/**
 * Ellenőrzi a frontmatter tartalmát.
 * @param {string} text
 * @param {{ requiredKeys?: string[], expectedName?: string }} options
 * @returns {string[]} Hibasorok listája
 */
function checkFrontmatter(text, options = {}) {
  const { requiredKeys = [], expectedName } = options;
  const result = extractFrontmatter(text);

  if (!result.ok) {
    return ['1 FM_MISSING: hiányzó vagy érvénytelen frontmatter'];
  }

  const errors = [];
  const fmLines = result.lines;
  const startLine = result.startLine;

  // Kulcsok gyűjtése és ellenőrzés
  const keys = new Map(); // kulcs -> { lineIndex, value, hasBlockContent }
  let i = 0;

  // Tabulátor ellenőrzés a behúzásban (a blokkskalár törzsében is)
  fmLines.forEach((l, idx) => {
    if (/^[ \t]*\t/.test(l)) {
      errors.push(`${startLine + idx} FM_TAB: tabulátor a behúzásban`);
    }
  });

  while (i < fmLines.length) {
    const line = fmLines[i];
    const lineNum = startLine + i;

    // Nem behúzott sor
    if (!/^\s/.test(line) || line.trim().length === 0) {
      if (line.trim().length === 0) {
        i++;
        continue;
      }

      // Kulcs: érték alakú sor
      const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (!match) {
        errors.push(`${lineNum} FM_LINE_SHAPE: érvénytelen sor alak`);
        i++;
        continue;
      }

      const key = match[1];
      let value = match[2];

      // Duplikált kulcs ellenőrzés
      if (keys.has(key)) {
        errors.push(`${lineNum} FM_KEY_DUP: ismétlődő kulcs: ${key}`);
        i++;
        continue;
      }

      // Érték típusának meghatározása
      let isBlockScalar = false;
      let isQuoted = false;
      let quoteChar = null;

      if (/^[>|][-]?/.test(value)) {
        isBlockScalar = true;
      } else if (value.startsWith('"') || value.startsWith("'")) {
        isQuoted = true;
        quoteChar = value[0];
      }

      keys.set(key, { lineIndex: i, value, isBlockScalar, isQuoted, quoteChar });

      // Blokkskalár esetén a következő behúzott sorokat átugorjuk
      if (isBlockScalar) {
        let hasContent = false;
        i++;
        while (i < fmLines.length) {
          const nextLine = fmLines[i];
          if (nextLine.trim().length === 0) {
            i++;
            continue;
          }
          if (/^\s/.test(nextLine)) {
            if (nextLine.trim().length > 0) {
              hasContent = true;
            }
            i++;
          } else {
            break;
          }
        }
        if (!hasContent) {
          errors.push(`${lineNum} FM_BLOCK_EMPTY: üres blokkskalár`);
        }
        continue;
      }

      // Idézőjeles érték ellenőrzése
      if (isQuoted) {
        // Az érték a nyitó idézőjel után kezdődik
        let content = value.slice(1);
        let closed = false;

        if (quoteChar === '"') {
          // " esetén \\" nem záró
          for (let j = 0; j < content.length; j++) {
            if (content[j] === '\\' && j + 1 < content.length) {
              j++; // Skip escaped character
            } else if (content[j] === '"') {
              closed = true;
              // Ellenőrizzük, hogy nincs-e további szöveg a záró után
              const rest = content.slice(j + 1).trim();
              if (rest.length > 0) {
                errors.push(`${lineNum} FM_QUOTE_UNCLOSED: nem megfelelően záródó idézőjel`);
              }
              break;
            }
          }
        } else {
          // ' esetén '' escape
          for (let j = 0; j < content.length; j++) {
            if (content[j] === "'" && j + 1 < content.length && content[j + 1] === "'") {
              j++; // Skip escaped quote
            } else if (content[j] === "'") {
              closed = true;
              const rest = content.slice(j + 1).trim();
              if (rest.length > 0) {
                errors.push(`${lineNum} FM_QUOTE_UNCLOSED: nem megfelelően záródó idézőjel`);
              }
              break;
            }
          }
        }

        if (!closed) {
          errors.push(`${lineNum} FM_QUOTE_UNCLOSED: nem megfelelően záródó idézőjel`);
        }
        i++;
        continue;
      }

      // Plain skalár ellenőrzése
      if (value.length > 0) {
        // FM_PLAIN_START ellenőrzése az első karakterre
        const firstChar = value[0];
        const plainStartChars = ['@', '%', '&', '*', '!', '{', '[', ',', '?', '`'];
        if (plainStartChars.includes(firstChar)) {
          errors.push(`${lineNum} FM_PLAIN_START: plain skalár tiltott karakterrel kezdődik`);
        }

        // FM_PLAIN_COLON_SPACE és FM_PLAIN_HASH ellenőrzése
        if (value.includes(': ')) {
          errors.push(`${lineNum} FM_PLAIN_COLON_SPACE: kettőspont+szóköz a plain skalárban`);
        }
        if (value.includes(' #')) {
          errors.push(`${lineNum} FM_PLAIN_HASH: komment a plain skalárban`);
        }

        // Folytatósorok ellenőrzése
        i++;
        while (i < fmLines.length) {
          const nextLine = fmLines[i];
          if (nextLine.trim().length === 0) {
            i++;
            continue;
          }
          if (/^\s/.test(nextLine)) {
            const trimmed = nextLine.trim();
            if (trimmed.includes(': ')) {
              errors.push(`${startLine + i} FM_PLAIN_COLON_SPACE: kettőspont+szóköz a folytatósorban`);
            }
            if (trimmed.includes(' #')) {
              errors.push(`${startLine + i} FM_PLAIN_HASH: komment a folytatósorban`);
            }
            i++;
          } else {
            break;
          }
        }
        continue;
      }

      // Üres érték esetén a következő behúzott sorokat átugorjuk
      i++;
      while (i < fmLines.length) {
        const nextLine = fmLines[i];
        if (nextLine.trim().length === 0) {
          i++;
          continue;
        }
        if (/^\s/.test(nextLine)) {
          i++;
        } else {
          break;
        }
      }
      continue;
    }

    i++;
  }

  // Kötelező kulcsok ellenőrzése
  for (const key of requiredKeys) {
    if (!keys.has(key)) {
      errors.push(`${startLine} FM_KEY_REQUIRED: hiányzó kötelező kulcs: ${key}`);
    } else {
      const keyData = keys.get(key);
      // Üres érték ellenőrzése
      if (keyData.value.trim().length === 0 && !keyData.isBlockScalar) {
        // Ellenőrizzük, hogy van-e alatta behúzott sor vagy blokkskalár-jelölő
        let hasContent = false;
        let j = keyData.lineIndex + 1;
        while (j < fmLines.length) {
          const nextLine = fmLines[j];
          if (nextLine.trim().length === 0) {
            j++;
            continue;
          }
          if (/^\s/.test(nextLine)) {
            if (nextLine.trim().length > 0) {
              hasContent = true;
            }
            j++;
          } else {
            break;
          }
        }
        if (!hasContent) {
          errors.push(`${startLine + keyData.lineIndex} FM_KEY_REQUIRED: üres kötelező kulcs: ${key}`);
        }
      }
    }
  }

  // expectedName ellenőrzése
  if (expectedName) {
    const nameKey = keys.get('name');
    if (nameKey) {
      let nameValue = nameKey.value.trim();
      // Idézőjelek eltávolítása
      if ((nameValue.startsWith('"') && nameValue.endsWith('"')) ||
          (nameValue.startsWith("'") && nameValue.endsWith("'"))) {
        nameValue = nameValue.slice(1, -1);
      }
      if (nameValue !== expectedName) {
        errors.push(`${startLine + nameKey.lineIndex} FM_NAME_MISMATCH: a name érték nem egyezik a várttal`);
      }
    }
  }

  return errors;
}

/**
 * Ellenőrzi a TOML tartalmat.
 * @param {string} text
 * @returns {string[]} Hibasorok listája
 */
function checkToml(text) {
  const errors = [];
  const lines = text.split('\n');

  // Kötelező kulcsok ellenőrzése
  const requiredKeys = [
    { key: 'name', pattern: /^name\s*=/ },
    { key: 'description', pattern: /^description\s*=/ },
    { key: 'developer_instructions', pattern: /^developer_instructions\s*=\s*"/ },
  ];

  for (const req of requiredKeys) {
    let found = false;
    for (const line of lines) {
      if (req.pattern.test(line)) {
        found = true;
        break;
      }
    }
    if (!found) {
      errors.push(`1 TOML_KEY_REQUIRED: hiányzó kötelező kulcs: ${req.key}`);
    }
  }

  // Triple quote páros szám ellenőrzése
  const tripleQuotes = (text.match(/"""/g) || []).length;
  if (tripleQuotes % 2 !== 0) {
    errors.push('1 TOML_TRIPLE_QUOTE: páratlan számú triple quote');
  }

  // Duplikált kulcs ellenőrzése (csak a triple quote blokkon kívül)
  const keys = new Set();
  let inTripleQuote = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Triple quote blokk kezelés
    const tripleQuoteCount = (line.match(/"""/g) || []).length;
    if (tripleQuoteCount > 0) {
      inTripleQuote = !inTripleQuote;
      continue;
    }

    if (inTripleQuote) {
      continue;
    }

    // Kulcs = érték alakú sor
    const match = line.match(/^([A-Za-z0-9_-]+)\s*=/);
    if (match) {
      const key = match[1];
      if (keys.has(key)) {
        errors.push(`${lineNum} TOML_KEY_DUP: ismétlődő kulcs: ${key}`);
      } else {
        keys.add(key);
      }
    }
  }

  return errors;
}

/**
 * Listázza a célfájlokat.
 * @param {string} root
 * @returns {{ file: string, kind: 'agent'|'skill'|'toml', expectedName?: string }[]}
 */
function listTargets(root) {
  const targets = [];

  // .claude/agents/*.md
  const agentsDir = path.join(root, '.claude', 'agents');
  if (fs.existsSync(agentsDir)) {
    const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const expectedName = path.basename(file, '.md');
      targets.push({
        file: path.posix.join('.claude', 'agents', file),
        kind: 'agent',
        expectedName,
      });
    }
  }

  // .claude/skills/*/SKILL.md
  const skillsDir1 = path.join(root, '.claude', 'skills');
  if (fs.existsSync(skillsDir1)) {
    const skillDirs = fs.readdirSync(skillsDir1).filter(f => {
      const fullPath = path.join(skillsDir1, f);
      return fs.statSync(fullPath).isDirectory();
    });
    for (const dir of skillDirs) {
      const skillFile = path.join(skillsDir1, dir, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        targets.push({
          file: path.posix.join('.claude', 'skills', dir, 'SKILL.md'),
          kind: 'skill',
          expectedName: dir,
        });
      }
    }
  }

  // .agents/skills/*/SKILL.md
  const skillsDir2 = path.join(root, '.agents', 'skills');
  if (fs.existsSync(skillsDir2)) {
    const skillDirs = fs.readdirSync(skillsDir2).filter(f => {
      const fullPath = path.join(skillsDir2, f);
      return fs.statSync(fullPath).isDirectory();
    });
    for (const dir of skillDirs) {
      const skillFile = path.join(skillsDir2, dir, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        targets.push({
          file: path.posix.join('.agents', 'skills', dir, 'SKILL.md'),
          kind: 'skill',
          expectedName: dir,
        });
      }
    }
  }

  // .codex/agents/*.toml
  const tomlDir = path.join(root, '.codex', 'agents');
  if (fs.existsSync(tomlDir)) {
    const files = fs.readdirSync(tomlDir).filter(f => f.endsWith('.toml'));
    for (const file of files) {
      targets.push({
        file: path.posix.join('.codex', 'agents', file),
        kind: 'toml',
      });
    }
  }

  // Rendezés
  targets.sort((a, b) => a.file.localeCompare(b.file));

  return targets;
}

/**
 * Ellenőrzi a fájlfa tartalmát.
 * @param {string} root
 * @returns {string[]} Hibasorok listája
 */
function checkTree(root) {
  const targets = listTargets(root);

  if (targets.length === 0) {
    return ['NO_TARGETS: nincs ellenőrizendő fájl'];
  }

  const errors = [];

  for (const target of targets) {
    const fullPath = path.join(root, target.file);
    let content;
    try {
      content = fs.readFileSync(fullPath, 'utf-8');
    } catch (e) {
      errors.push(`${target.file}:1 FILE_READ_ERROR: nem olvasható a fájl`);
      continue;
    }

    let fileErrors = [];
    if (target.kind === 'agent' || target.kind === 'skill') {
      fileErrors = checkFrontmatter(content, {
        requiredKeys: ['name', 'description'],
        expectedName: target.expectedName,
      });
    } else if (target.kind === 'toml') {
      fileErrors = checkToml(content);
    }

    for (const error of fileErrors) {
      errors.push(`${target.file}:${error}`);
    }
  }

  return errors;
}

// Exportok
module.exports = {
  extractFrontmatter,
  checkFrontmatter,
  checkToml,
  listTargets,
  checkTree,
};

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  let root = '.';

  // Argumentumok feldolgozása
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root') {
      if (i + 1 >= args.length) {
        console.error('Hiányzó --root érték');
        process.exit(2);
      }
      root = args[i + 1];
      i++;
    } else {
      console.error(`Ismeretlen kapcsoló: ${args[i]}`);
      process.exit(2);
    }
  }

  // Root létezés ellenőrzése
  if (!fs.existsSync(root)) {
    console.error(`Nem létező root: ${root}`);
    process.exit(2);
  }

  const errors = checkTree(root);

  if (errors.length === 0) {
    const targets = listTargets(root);
    console.log(`rendben: ${targets.length} fájl`);
    process.exit(0);
  } else {
    for (const error of errors) {
      console.error(error);
    }
    process.exit(1);
  }
}
