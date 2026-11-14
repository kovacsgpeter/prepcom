#!/usr/bin/env node
/**
 * dev-workflow (ORD-379, 4.28.0)
 *
 * Tesztek a ci/check-frontmatter.cjs modulhoz.
 */

'use strict';

const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { checkFrontmatter, checkToml, checkTree } = require('./check-frontmatter.cjs');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`FAILED: ${name}`);
    console.error(e.message);
    console.error(e.stack);
  }
}

function has(errors, code) {
  return errors.some(e => e.includes(code));
}

// --- checkFrontmatter tesztek ---

test('érvényes blokkskalár-description rendben', () => {
  const text = `---
name: x
description: >
  sor1
  sor2
---
törzs
`;
  const errors = checkFrontmatter(text, { requiredKeys: ['name', 'description'] });
  assert.strictEqual(errors.length, 0);
});

test('érvényes idézőjeles description rendben', () => {
  const text = `---
name: x
description: "szöveg: kettősponttal # és hash"
---
törzs
`;
  const errors = checkFrontmatter(text, { requiredKeys: ['name', 'description'] });
  assert.strictEqual(errors.length, 0);
});

test('idézőjel nélküli ": " a descriptionben FM_PLAIN_COLON_SPACE', () => {
  const text = `---
name: x
description: Egy szöveg: másik
---
törzs
`;
  const errors = checkFrontmatter(text, { requiredKeys: ['name', 'description'] });
  assert.ok(has(errors, 'FM_PLAIN_COLON_SPACE'));
});

test('idézőjel nélküli " #" FM_PLAIN_HASH', () => {
  const text = `---
name: x
description: valami # megjegyzés
---
törzs
`;
  const errors = checkFrontmatter(text, { requiredKeys: ['name', 'description'] });
  assert.ok(has(errors, 'FM_PLAIN_HASH'));
});

test('plain érték \'*\'-gal kezdve FM_PLAIN_START', () => {
  const text = `---
name: x
description: *csillag
---
törzs
`;
  const errors = checkFrontmatter(text, { requiredKeys: ['name', 'description'] });
  assert.ok(has(errors, 'FM_PLAIN_START'));
});

test('nem zárt idézőjel FM_QUOTE_UNCLOSED', () => {
  const text = `---
name: x
description: "nyitva
---
törzs
`;
  const errors = checkFrontmatter(text, { requiredKeys: ['name', 'description'] });
  assert.ok(has(errors, 'FM_QUOTE_UNCLOSED'));
});

test('záró idézőjel utáni szöveg FM_QUOTE_UNCLOSED', () => {
  const text = `---
name: x
description: "zárt" még szöveg
---
törzs
`;
  const errors = checkFrontmatter(text, { requiredKeys: ['name', 'description'] });
  assert.ok(has(errors, 'FM_QUOTE_UNCLOSED'));
});

test('ismétlődő kulcs FM_KEY_DUP', () => {
  const text = `---
name: x
name: y
description: d
---
törzs
`;
  const errors = checkFrontmatter(text, { requiredKeys: ['name', 'description'] });
  assert.ok(has(errors, 'FM_KEY_DUP'));
});

test('hiányzó description FM_KEY_REQUIRED', () => {
  const text = `---
name: x
---
törzs
`;
  const errors = checkFrontmatter(text, { requiredKeys: ['name', 'description'] });
  assert.ok(has(errors, 'FM_KEY_REQUIRED'));
});

test('hiányzó záró --- FM_MISSING', () => {
  const text = `---
name: x
description: d
törzs
`;
  const errors = checkFrontmatter(text, { requiredKeys: ['name', 'description'] });
  assert.ok(has(errors, 'FM_MISSING'));
});

test('üres blokkskalár FM_BLOCK_EMPTY', () => {
  const text = `---
name: x
description: >
---
törzs
`;
  const errors = checkFrontmatter(text, { requiredKeys: ['name', 'description'] });
  assert.ok(has(errors, 'FM_BLOCK_EMPTY'));
});

test('tools sor Bash(git log:*, git show:*) rendben', () => {
  const text = `---
name: x
description: d
tools: Read, Grep, Bash(git log:*, git show:*)
---
törzs
`;
  const errors = checkFrontmatter(text, { requiredKeys: ['name', 'description'] });
  assert.strictEqual(errors.length, 0);
});

test('name eltér a fájlnévtől FM_NAME_MISMATCH', () => {
  const text = `---
name: x
description: d
---
törzs
`;
  const errors = checkFrontmatter(text, { requiredKeys: ['name', 'description'], expectedName: 'masik' });
  assert.ok(has(errors, 'FM_NAME_MISMATCH'));
});

test('tabulátoros behúzás FM_TAB', () => {
  const text = `---
name: x
description: >
\tsor
---
törzs
`;
  const errors = checkFrontmatter(text, { requiredKeys: ['name', 'description'] });
  assert.ok(has(errors, 'FM_TAB'));
});

// --- checkToml tesztek ---

test('érvényes toml rendben', () => {
  const text = `name = "x"
description = "y"
developer_instructions = """
szöveg
"""
`;
  const errors = checkToml(text);
  assert.strictEqual(errors.length, 0);
});

test('toml páratlan """ TOML_TRIPLE_QUOTE', () => {
  const text = `name = "x"
description = "y"
developer_instructions = """
szöveg
`;
  const errors = checkToml(text);
  assert.ok(has(errors, 'TOML_TRIPLE_QUOTE'));
});

test('toml hiányzó description TOML_KEY_REQUIRED', () => {
  const text = `name = "x"
developer_instructions = """
szöveg
"""
`;
  const errors = checkToml(text);
  assert.ok(has(errors, 'TOML_KEY_REQUIRED'));
});

// --- checkTree tesztek ---

test('checkTree üres root NO_TARGETS', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfm-'));
  try {
    const errors = checkTree(tmpDir);
    assert.ok(has(errors, 'NO_TARGETS'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('checkTree valódi fa hibamentes', () => {
  const root = path.resolve(__dirname, '..');
  const errors = checkTree(root);
  assert.strictEqual(errors.length, 0);
});

// --- Összegzés ---

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
