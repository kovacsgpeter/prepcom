#!/usr/bin/env node
/**
 * dev-workflow (ORD-384, 4.28.0)
 *
 * Markdown frontmatter műveletek: szétválasztás, kulcsok cseréje, ellenőrzések.
 *
 * Használat:
 *   node overrides-markdown.js
 *
 * Kilépési kódok:
 *   0: siker
 *   1: hiba
 */

'use strict';

const crypto = require('crypto');

/**
 * Bontja a markdown szöveget head (frontmatter) és body részre.
 * @param {string} text
 * @returns {{ ok: true, head: string, body: string, eol: string, bom: string } | { ok: false, error: string }}
 */
function splitMarkdown(text) {
  if (typeof text !== 'string') {
    return { ok: false, error: 'bemenet nem string' };
  }

  // BOM külön tárolása (a hívó visszaírja, hogy a fájl bájtazonos maradjon)
  let cleanText = text;
  let bom = '';
  if (cleanText.charCodeAt(0) === 0xFEFF) {
    bom = '﻿';
    cleanText = cleanText.slice(1);
  }

  // Sorokra bontás sorvégek megtartásával
  const lines = cleanText.split(/(?<=\n)/);

  // Az első sor pontosan '---' kell legyen (sorvég nélkül)
  if (lines.length === 0 || lines[0].replace(/\r?\n$/, '') !== '---') {
    return { ok: false, error: 'nincs nyitó --- az első sorban' };
  }

  // EOL meghatározása: ha az első sor \r\n-re végződik, akkor CRLF, különben LF
  const firstLine = lines[0];
  const eol = firstLine.endsWith('\r\n') ? '\r\n' : '\n';

  // Záró --- keresése
  let closingIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].replace(/\r?\n$/, '') === '---') {
      closingIndex = i;
      break;
    }
  }

  if (closingIndex === -1) {
    return { ok: false, error: 'nincs záró ---' };
  }

  // head: az első --- sortól a záró --- sorig (sorvégével együtt, ha van)
  const head = lines.slice(0, closingIndex + 1).join('');
  // body: minden utána
  const body = lines.slice(closingIndex + 1).join('');

  return { ok: true, head, body, eol, bom };
}

/**
 * Cseréji a frontmatter kulcsokat.
 * @param {string} head
 * @param {string} eol
 * @param {object} values - { kulcs: nyersÉrték }
 * @returns {string}
 */
function replaceFrontmatterKeys(head, eol, values) {
  if (typeof head !== 'string' || typeof eol !== 'string' || typeof values !== 'object') {
    return head;
  }

  // Sorokra bontás sorvégek megtartásával
  const lines = head.split(/(?<=\n)/);

  if (lines.length === 0) {
    return head;
  }

  // Az első és utolsó sor a --- határolók
  const firstLine = lines[0];
  const lastLine = lines[lines.length - 1];

  // Köztes sorok feldolgozása
  const middleLines = lines.slice(1, lines.length - 1);
  const resultLines = [];
  const keysToReplace = Object.keys(values);
  const replacedKeys = new Set();

  let i = 0;
  while (i < middleLines.length) {
    const line = middleLines[i];
    // Sorvég eltávolítása a feldolgozáshoz
    const lineContent = line.replace(/\r?\n$/, '');
    const lineEol = line.endsWith('\r\n') ? '\r\n' : line.endsWith('\n') ? '\n' : '';

    // Ellenőrizzük, hogy ez egy kulcssor-e
    let matchedKey = null;
    for (const key of keysToReplace) {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp('^' + escapedKey + ':');
      if (regex.test(lineContent)) {
        matchedKey = key;
        break;
      }
    }

    if (matchedKey !== null) {
      // Ez egy kulcssor, cseréljük le
      replacedKeys.add(matchedKey);
      resultLines.push(matchedKey + ': ' + values[matchedKey] + eol);

      // Kihagyjuk a folytatósorokat (behúzott sorok)
      i++;
      while (i < middleLines.length) {
        const nextLine = middleLines[i];
        const nextContent = nextLine.replace(/\r?\n$/, '');
        // Folytatósor: behúzott sor, vagy 0. oszlopos YAML-lista elem (`- elem`)
        const isContinuation = /^\s/.test(nextContent) || /^-\s/.test(nextContent);
        if (nextContent === '' || !isContinuation || nextContent === '---') {
          break;
        }
        i++;
      }
    } else {
      // Nem kulcssor, megtartjuk
      resultLines.push(line);
      i++;
    }
  }

  // Új kulcsok hozzáadása a záró --- elé
  for (const key of keysToReplace) {
    if (!replacedKeys.has(key)) {
      resultLines.push(key + ': ' + values[key] + eol);
    }
  }

  // Összeállítás
  return firstLine + resultLines.join('') + lastLine;
}

/**
 * Ellenőrzi, hogy a nyers frontmatter-érték beírható-e YAML-hibát okozva nélkül.
 * Idézőjeles érték (`"..."` / `'...'`) elfogadott; idézőjel nélküli érték nem tartalmazhat
 * `: ` vagy ` #` részt, nem végződhet `:`-ra, és nem kezdődhet indikátor-karakterrel.
 * @param {*} val
 * @returns {boolean}
 */
function isSafeFrontmatterValue(val) {
  if (typeof val !== 'string') {
    return true;
  }
  if (/^(["']).*\1$/s.test(val)) {
    return true;
  }
  if (val.includes(': ') || val.includes(' #') || val.endsWith(':')) {
    return false;
  }
  if (/^[`@%&*!{\[,?|>]/.test(val)) {
    return false;
  }
  return true;
}

/**
 * SHA-256 hash számítása hex formátumban.
 * @param {string} text
 * @returns {string}
 */
function sha256Hex(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Ellenőrzi, hogy a név biztonságos-e.
 * @param {string} name
 * @returns {boolean}
 */
function isSafeName(name) {
  if (typeof name !== 'string') {
    return false;
  }
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    return false;
  }
  if (name === '.' || name === '..') {
    return false;
  }
  return true;
}

/**
 * Ellenőrzi, hogy az elérési út biztonságos relatív út-e.
 * @param {string} p
 * @returns {boolean}
 */
function isSafeRelativePath(p) {
  if (typeof p !== 'string' || p === '') {
    return false;
  }
  if (p.includes('\\')) {
    return false;
  }
  if (p.startsWith('/')) {
    return false;
  }
  if (/^[A-Za-z]:/.test(p)) {
    return false;
  }
  if (p.includes('\0')) {
    return false;
  }

  const segments = p.split('/');
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') {
      return false;
    }
  }

  return true;
}

// Exportok
module.exports = {
  splitMarkdown,
  replaceFrontmatterKeys,
  isSafeFrontmatterValue,
  sha256Hex,
  isSafeName,
  isSafeRelativePath,
};
