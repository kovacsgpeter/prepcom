#!/usr/bin/env node
/**
 * dev-workflow (ORD-384, 4.28.0)
 *
 * Szűk YAML-részhalmaz parser, függőségmentes.
 * Csak sima kulcs-érték párokat és beágyazott objektumokat támogat.
 * Nincs lista, flow mapping, anchor, alias, tag, block scalar.
 */

'use strict';

/**
 * Parses a strict subset of YAML.
 * @param {string} text - The YAML text to parse.
 * @returns {{ ok: boolean, value?: object, error?: string }}
 */
function parseOverridesYaml(text) {
  // Normalize line endings
  const lines = text.split(/\r\n|\n|\r/);

  const stack = [{ indent: -2, obj: {} }]; // Root context
  let lastLineIndent = -2;
  let lastLineWasMappingOpener = true;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const lineNum = i + 1;

    // Check for tabs in indentation
    const leadingSpaces = rawLine.match(/^( *)/)[1];
    const indent = leadingSpaces.length;
    const rest = rawLine.slice(indent);

    if (rawLine.startsWith('\t') || (indent > 0 && rawLine.slice(0, indent).includes('\t'))) {
      return { ok: false, error: `${lineNum}. sor: tab behúzás` };
    }

    // Check for odd indentation
    if (indent % 2 !== 0) {
      return { ok: false, error: `${lineNum}. sor: páratlan behúzás` };
    }

    // Skip empty lines or lines with only whitespace
    if (rest.trim() === '') {
      continue;
    }

    // Skip comments (lines starting with # after optional indentation)
    if (rest.trim().startsWith('#')) {
      continue;
    }

    // Behúzás-ugrás ellenőrzése
    if (indent > lastLineIndent && !(lastLineWasMappingOpener && indent === lastLineIndent + 2)) {
      return { ok: false, error: `${lineNum}. sor: váratlan behúzás` };
    }

    // Process indentation stack
    // Pop stack until we find a parent with indent < current indent
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parentObj = stack[stack.length - 1].obj;

    // Parse key-value pair
    // Format: key: value or key:
    const match = rest.match(/^([A-Za-z0-9._-]+):\s*(.*)$/);
    if (!match) {
      return { ok: false, error: `${lineNum}. sor: érvénytelen sor alak` };
    }

    const key = match[1];
    let valueStr = match[2];

    // Handle inline comments
    // Only if there's a space before # and not inside quotes
    let commentIndex = -1;
    let inSingleQuote = false;
    let inDoubleQuote = false;
    for (let j = 0; j < valueStr.length; j++) {
      const char = valueStr[j];
      if (char === "'" && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote;
      } else if (char === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
      } else if (char === '#' && !inSingleQuote && !inDoubleQuote) {
        // Check if preceded by space
        if (j > 0 && valueStr[j - 1] === ' ') {
          commentIndex = j - 1;
          break;
        }
      }
    }

    if (commentIndex !== -1) {
      valueStr = valueStr.slice(0, commentIndex);
    }

    // Trim trailing whitespace
    valueStr = valueStr.trimEnd();

    // Reject __proto__ key
    if (key === '__proto__') {
      return { ok: false, error: `${lineNum}. sor: __proto__ kulcs nem megengedett` };
    }

    // Check for duplicate keys
    if (Object.prototype.hasOwnProperty.call(parentObj, key)) {
      return { ok: false, error: `${lineNum}. sor: duplikált kulcs` };
    }

    // If value is empty, it's a mapping opener
    if (valueStr === '') {
      const newChild = {};
      parentObj[key] = newChild;
      stack.push({ indent: indent, obj: newChild });
      lastLineIndent = indent;
      lastLineWasMappingOpener = true;
      continue;
    }

    // Check for unsupported features
    if (valueStr.startsWith('- ')) {
      return { ok: false, error: `${lineNum}. sor: lista nem támogatott` };
    }
    if (valueStr === '-') {
      return { ok: false, error: `${lineNum}. sor: lista nem támogatott` };
    }
    if (valueStr.startsWith('{')) {
      return { ok: false, error: `${lineNum}. sor: flow mapping nem támogatott` };
    }
    if (valueStr.startsWith('[')) {
      return { ok: false, error: `${lineNum}. sor: flow lista nem támogatott` };
    }
    if (valueStr.startsWith('|')) {
      return { ok: false, error: `${lineNum}. sor: blokk-skalár nem támogatott` };
    }
    if (valueStr.startsWith('>')) {
      return { ok: false, error: `${lineNum}. sor: blokk-skalár nem támogatott` };
    }
    if (valueStr.startsWith('&')) {
      return { ok: false, error: `${lineNum}. sor: horgony nem támogatott` };
    }
    if (valueStr.startsWith('*')) {
      return { ok: false, error: `${lineNum}. sor: alias nem támogatott` };
    }
    if (valueStr.startsWith('!')) {
      return { ok: false, error: `${lineNum}. sor: tag nem támogatott` };
    }

    // Check for quoted strings
    if (valueStr.startsWith("'") || valueStr.startsWith('"')) {
      const quoteChar = valueStr[0];
      if (valueStr.length < 2 || valueStr[valueStr.length - 1] !== quoteChar) {
        return { ok: false, error: `${lineNum}. sor: lezáratlan idézőjel` };
      }
      // Keep quotes as per spec: "Az érték nyers token: az idézőjelek megmaradnak."
      parentObj[key] = valueStr;
    } else {
      parentObj[key] = valueStr;
    }

    lastLineIndent = indent;
    lastLineWasMappingOpener = false;
  }

  return { ok: true, value: stack[0].obj };
}

module.exports = { parseOverridesYaml };
