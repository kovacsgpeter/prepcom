#!/usr/bin/env node
/**
 * dev-workflow (ORD-384, 4.28.0)
 *
 * Alkalmazza a felülírásokat az `overrides.yaml` alapján.
 *
 * Használat:
 *   node apply-overrides.js --target-dir <könyvtár>
 *
 * Kilépési kódok:
 *   0: lefutott, hibás bejegyzéssel is
 *   2: hiányzó argumentum
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const { parseOverridesYaml } = require('./overrides-yaml.js');
const {
  splitMarkdown,
  replaceFrontmatterKeys,
  isSafeFrontmatterValue,
  sha256Hex,
  isSafeName,
  isSafeRelativePath,
} = require('./overrides-markdown.js');

/**
 * Meghatározza a célfájl elérési útját.
 * @param {string} targetDir
 * @param {string} kind - 'agents' vagy 'skills'
 * @param {string} name
 * @returns {string}
 */
function resolveEntryPath(targetDir, kind, name) {
  if (kind === 'agents') {
    return path.join(targetDir, '.claude', 'agents', name + '.md');
  }
  if (kind === 'skills') {
    return path.join(targetDir, '.claude', 'skills', name, 'SKILL.md');
  }
  throw new Error('Ismeretlen kind: ' + kind);
}

/**
 * Alkalmazza a felülírásokat.
 * @param {string} targetDir
 * @param {function} log
 * @param {function} warn
 * @returns {{ applied: number, conflicts: number, skipped: number }}
 */
function applyOverrides(targetDir, log, warn) {
  const dir = path.join(targetDir, '.claude', 'skills', 'dev-workflow');
  const yamlPath = path.join(dir, 'overrides.yaml');

  if (!fs.existsSync(yamlPath)) {
    return { applied: 0, conflicts: 0, skipped: 0 };
  }

  const yamlText = fs.readFileSync(yamlPath, 'utf8');
  const parsed = parseOverridesYaml(yamlText);

  if (!parsed.ok) {
    warn('FIGYELEM: overrides.yaml hibás (' + parsed.error + '), a felülírások kimaradtak');
    return { applied: 0, conflicts: 0, skipped: 1 };
  }

  const root = parsed.value;

  // Version check
  if (root.version !== '1') {
    warn('FIGYELEM: overrides.yaml version nem 1, a felülírások kimaradtak');
    return { applied: 0, conflicts: 0, skipped: 1 };
  }

  // Unknown root keys warning
  const allowedRootKeys = ['version', 'agents', 'skills'];
  for (const key of Object.keys(root)) {
    if (!allowedRootKeys.includes(key)) {
      warn('FIGYELEM: ismeretlen gyökérkulcs: ' + key);
    }
  }

  let applied = 0;
  let conflicts = 0;
  let skipped = 0;

  const kinds = ['agents', 'skills'];

  for (const kind of kinds) {
    const section = root[kind];
    if (section === undefined) {
      continue;
    }
    if (typeof section !== 'object' || section === null || Array.isArray(section)) {
      warn('FIGYELEM: ' + kind + ' szekció nem objektum, kihagyva');
      continue;
    }

    const names = Object.keys(section).sort();

    for (const name of names) {
      const entry = section[name];

      // 1. isSafeName check
      if (!isSafeName(name)) {
        warn('FIGYELEM: ' + kind + '.' + name + ': nem biztonságos név, kihagyva');
        skipped++;
        continue;
      }

      // Entry must be object
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        warn('FIGYELEM: ' + kind + '.' + name + ': bejegyzés nem objektum, kihagyva');
        skipped++;
        continue;
      }

      // 2. Target file existence
      const targetPath = resolveEntryPath(targetDir, kind, name);
      if (!fs.existsSync(targetPath)) {
        warn('FIGYELEM: ' + kind + '.' + name + ': a célfájl nem létezik, kihagyva');
        skipped++;
        continue;
      }

      let validFrontmatter = null;
      let validBody = null;

      // 3. Frontmatter validation
      if (entry.frontmatter && typeof entry.frontmatter === 'object' && !Array.isArray(entry.frontmatter)) {
        const fm = Object.assign({}, entry.frontmatter);
        const fmKeys = Object.keys(fm);
        let fmValid = true;
        for (const k of fmKeys) {
          if (k === 'name') {
            warn('FIGYELEM: ' + kind + '.' + name + ': frontmatter kulcs nem lehet name, kihagyva');
            fmValid = false;
            break;
          }
          if (!/^[A-Za-z0-9_-]+$/.test(k)) {
            warn('FIGYELEM: ' + kind + '.' + name + ': hibás frontmatter kulcs, kihagyva');
            fmValid = false;
            break;
          }
          const val = fm[k];
          if (typeof val === 'string' && val === '') {
            warn('FIGYELEM: ' + kind + '.' + name + ': frontmatter érték nem lehet üres string, kihagyva');
            fmValid = false;
            break;
          }
          if (!isSafeFrontmatterValue(val)) {
            warn('FIGYELEM: ' + kind + '.' + name + ': a(z) ' + k + ' frontmatter érték idézőjel nélkül nem írható be biztonságosan (": ", " #", záró ":" vagy indikátor-karakter az elején), a kulcs kimaradt; tedd idézőjelbe');
            delete fm[k];
          }
        }
        if (fmValid) {
          if (Object.keys(fm).length > 0) {
            validFrontmatter = fm;
          }
        }
      }

      // 4. Body validation
      if (entry.body && typeof entry.body === 'object' && !Array.isArray(entry.body)) {
        const bFile = entry.body.file;
        const bSha = entry.body.base_sha256;

        if (typeof bFile === 'string' && typeof bSha === 'string') {
          // Strip quotes
          const cleanFile = bFile.replace(/^(['"])(.*)\1$/, '$2');
          const cleanSha = bSha.replace(/^(['"])(.*)\1$/, '$2');

          if (isSafeRelativePath(cleanFile) && /^[0-9a-f]{64}$/.test(cleanSha)) {
            const bodyFilePath = path.join(dir, 'overrides', cleanFile);
            if (fs.existsSync(bodyFilePath)) {
              // symlink-védelem: a feloldott útnak az overrides/ gyökér valódi útján belül kell lennie
              let realBody = null;
              let realRoot = null;
              try {
                realBody = fs.realpathSync(bodyFilePath);
                realRoot = fs.realpathSync(path.join(dir, 'overrides'));
              } catch (e) {
                realBody = null;
              }
              if (realBody !== null && realBody.startsWith(realRoot + path.sep)) {
                validBody = {
                  file: cleanFile,
                  sha: cleanSha,
                  content: fs.readFileSync(realBody, 'utf8'),
                };
              } else {
                warn('FIGYELEM: ' + kind + '.' + name + ': a törzsfájl az overrides/ könyvtáron kívülre mutat, törzs-felülírás kihagyva');
              }
            } else {
              warn('FIGYELEM: ' + kind + '.' + name + ': törzsfájl nem létezik, törzs-felülírás kihagyva');
            }
          } else {
            warn('FIGYELEM: ' + kind + '.' + name + ': hibás törzs konfiguráció, törzs-felülírás kihagyva');
          }
        } else {
          warn('FIGYELEM: ' + kind + '.' + name + ': hibás törzs konfiguráció, törzs-felülírás kihagyva');
        }
      }

      // 5. If neither valid, skip
      if (!validFrontmatter && !validBody) {
        skipped++;
        continue;
      }

      // 6. Read target file
      const targetContent = fs.readFileSync(targetPath, 'utf8');
      const splitResult = splitMarkdown(targetContent);
      if (!splitResult.ok) {
        warn('FIGYELEM: ' + kind + '.' + name + ': markdown szétválasztás hiba, kihagyva');
        skipped++;
        continue;
      }

      let newHead = splitResult.head;
      let newBody = splitResult.body;
      let headApplied = false;
      let bodyApplied = false;
      let conflictDetected = false;

      // 7. Apply frontmatter
      if (validFrontmatter) {
        newHead = replaceFrontmatterKeys(newHead, splitResult.eol, validFrontmatter);
        const keys = Object.keys(validFrontmatter).join(',');
        log('OVERRIDE ALKALMAZVA (frontmatter): ' + kind + '.' + name + ' ' + keys);
        headApplied = true;
      }

      // 8. Apply body
      if (validBody) {
        const currentBodyHash = sha256Hex(splitResult.body);
        if (currentBodyHash === validBody.sha) {
          newBody = validBody.content;
          log('OVERRIDE ALKALMAZVA (törzs): ' + kind + '.' + name);
          bodyApplied = true;

          // Remove old conflict file if exists
          const conflictPath = targetPath + '.override-conflict';
          if (fs.existsSync(conflictPath)) {
            fs.unlinkSync(conflictPath);
            log('OVERRIDE ÜTKÖZÉS FELOLDVA: ' + kind + '.' + name + ' (a régi .override-conflict törölve)');
          }
        } else {
          // Conflict
          conflictDetected = true;
          conflicts++;

          // Write conflict file
          const conflictPath = targetPath + '.override-conflict';
          fs.writeFileSync(conflictPath, validBody.content, 'utf8');

          // Diff: a csomag törzse (frontmatter nélkül) a helyi (felülírt) törzzsel szemben
          const tmpBase = path.join(os.tmpdir(), 'override-body-' + process.pid + '-' + Date.now());
          const tmpPkg = tmpBase + '-csomag.tmp';
          const tmpLocal = tmpBase + '-helyi.tmp';
          let diffResult = {};
          try {
            fs.writeFileSync(tmpPkg, splitResult.body, 'utf8');
            fs.writeFileSync(tmpLocal, validBody.content, 'utf8');
            diffResult = spawnSync('diff', ['-u', tmpPkg, tmpLocal], {
              encoding: 'utf8',
              timeout: 5000,
            });
          } finally {
            fs.rmSync(tmpPkg, { force: true });
            fs.rmSync(tmpLocal, { force: true });
          }

          if (diffResult.stdout && diffResult.stdout.trim() !== '') {
            log(diffResult.stdout);
          }

          log('OVERRIDE ÜTKÖZÉS: ' + kind + '.' + name);
          warn('FIGYELEM: ' + kind + '.' + name + ': a csomag törzse megváltozott, a felülírás nem alkalmazva; frissítsd a felülírást kézzel és állítsd a base_sha256-ot az új csomagtörzs hash-ére: ' + currentBodyHash);
        }
      }

      // 9. Write target file only if changed
      const newContent = splitResult.bom + newHead + newBody;
      if (newContent !== targetContent) {
        fs.writeFileSync(targetPath, newContent, 'utf8');
      }

      if (headApplied || bodyApplied) {
        applied++;
      }
    }
  }

  return { applied, conflicts, skipped };
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  let targetDir = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--target-dir' && i + 1 < args.length) {
      targetDir = args[i + 1];
      i++;
    }
  }

  if (!targetDir) {
    process.stderr.write('Használat: node apply-overrides.js --target-dir <könyvtár>\n');
    process.exit(2);
  }

  const result = applyOverrides(targetDir, console.log, console.log);
  process.exit(0);
}

module.exports = { applyOverrides, resolveEntryPath };
