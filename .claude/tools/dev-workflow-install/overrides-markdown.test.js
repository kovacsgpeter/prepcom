'use strict';

const assert = require('assert');
const { splitMarkdown, replaceFrontmatterKeys, sha256Hex, isSafeName, isSafeRelativePath } = require('./overrides-markdown.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`FAIL: ${name}`);
    console.error(e.message);
  }
}

// splitMarkdown tesztek
test('splitMarkdown: alap eset LF', () => {
  const text = '---\ntitle: Hello\n---\nBody';
  const result = splitMarkdown(text);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.eol, '\n');
  assert.strictEqual(result.head, '---\ntitle: Hello\n---\n');
  assert.strictEqual(result.body, 'Body');
  assert.strictEqual(result.head + result.body, text);
});

test('splitMarkdown: alap eset CRLF', () => {
  const text = '---\r\ntitle: Hello\r\n---\r\nBody';
  const result = splitMarkdown(text);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.eol, '\r\n');
  assert.strictEqual(result.head, '---\r\ntitle: Hello\r\n---\r\n');
  assert.strictEqual(result.body, 'Body');
  assert.strictEqual(result.head + result.body, text);
});

test('splitMarkdown: nincs nyitó ---', () => {
  const text = 'title: Hello\n---\nBody';
  const result = splitMarkdown(text);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, 'nincs nyitó --- az első sorban');
});

test('splitMarkdown: nincs záró ---', () => {
  const text = '---\ntitle: Hello\nBody';
  const result = splitMarkdown(text);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, 'nincs záró ---');
});

test('splitMarkdown: üres body', () => {
  const text = '---\ntitle: Hello\n---';
  const result = splitMarkdown(text);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.body, '');
  assert.strictEqual(result.head + result.body, text);
});

test('splitMarkdown: BOM', () => {
  const text = '\uFEFF---\ntitle: Hello\n---\nBody';
  const result = splitMarkdown(text);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.eol, '\n');
  assert.strictEqual(result.head, '---\ntitle: Hello\n---\n');
  assert.strictEqual(result.body, 'Body');
});

// replaceFrontmatterKeys tesztek
test('replaceFrontmatterKeys: kulcs csere', () => {
  const head = '---\ntitle: Old\nauthor: John\n---\n';
  const eol = '\n';
  const values = { title: 'New' };
  const result = replaceFrontmatterKeys(head, eol, values);
  assert.strictEqual(result, '---\ntitle: New\nauthor: John\n---\n');
});

test('replaceFrontmatterKeys: új kulcs hozzáadása', () => {
  const head = '---\ntitle: Old\n---\n';
  const eol = '\n';
  const values = { author: 'Jane' };
  const result = replaceFrontmatterKeys(head, eol, values);
  assert.strictEqual(result, '---\ntitle: Old\nauthor: Jane\n---\n');
});

test('replaceFrontmatterKeys: több kulcs csere és hozzáadás', () => {
  const head = '---\ntitle: Old\nauthor: John\n---\n';
  const eol = '\n';
  const values = { title: 'New', date: '2023' };
  const result = replaceFrontmatterKeys(head, eol, values);
  assert.strictEqual(result, '---\ntitle: New\nauthor: John\ndate: 2023\n---\n');
});

test('replaceFrontmatterKeys: CRLF', () => {
  const head = '---\r\ntitle: Old\r\n---\r\n';
  const eol = '\r\n';
  const values = { title: 'New' };
  const result = replaceFrontmatterKeys(head, eol, values);
  assert.strictEqual(result, '---\r\ntitle: New\r\n---\r\n');
});

// sha256Hex tesztek
test('sha256Hex: alap eset', () => {
  const hash = sha256Hex('hello');
  assert.strictEqual(hash, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
});

test('sha256Hex: üres string', () => {
  const hash = sha256Hex('');
  assert.strictEqual(hash, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

// isSafeName tesztek
test('isSafeName: érvényes név', () => {
  assert.strictEqual(isSafeName('file.txt'), true);
  assert.strictEqual(isSafeName('file-name'), true);
  assert.strictEqual(isSafeName('file_name'), true);
  assert.strictEqual(isSafeName('file.name'), true);
});

test('isSafeName: érvénytelen név', () => {
  assert.strictEqual(isSafeName('.'), false);
  assert.strictEqual(isSafeName('..'), false);
  assert.strictEqual(isSafeName('file name'), false);
  assert.strictEqual(isSafeName('file/name'), false);
  assert.strictEqual(isSafeName(''), false);
  assert.strictEqual(isSafeName(123), false);
});

// isSafeRelativePath tesztek
test('isSafeRelativePath: érvényes út', () => {
  assert.strictEqual(isSafeRelativePath('path/to/file'), true);
  assert.strictEqual(isSafeRelativePath('file.txt'), true);
});

test('isSafeRelativePath: érvénytelen út', () => {
  assert.strictEqual(isSafeRelativePath(''), false);
  assert.strictEqual(isSafeRelativePath('/absolute'), false);
  assert.strictEqual(isSafeRelativePath('C:\\path'), false);
  assert.strictEqual(isSafeRelativePath('path\\to\\file'), false);
  assert.strictEqual(isSafeRelativePath('path/./file'), false);
  assert.strictEqual(isSafeRelativePath('path/../file'), false);
  assert.strictEqual(isSafeRelativePath('path//file'), false);
  assert.strictEqual(isSafeRelativePath('path\0file'), false);
  assert.strictEqual(isSafeRelativePath(123), false);
});

test('splitMarkdown: a BOM külön kerül tárolásra', () => {
  const result = splitMarkdown('\uFEFF---\na: 1\n---\ntörzs\n');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.bom, '\uFEFF');
  assert.strictEqual(result.head, '---\na: 1\n---\n');
  assert.strictEqual(splitMarkdown('---\na: 1\n---\n').bom, '');
});

test('replaceFrontmatterKeys: a 0. oszlopos lista elemei nem maradnak árván', () => {
  const head = '---\ntools:\n- Read\n- Grep\nmodel: x\n---\n';
  assert.strictEqual(replaceFrontmatterKeys(head, '\n', { tools: 'Read' }), '---\ntools: Read\nmodel: x\n---\n');
});

test('isSafeFrontmatterValue: idézőjel nélküli veszélyes értékek', () => {
  const { isSafeFrontmatterValue } = require('./overrides-markdown.js');
  assert.strictEqual(isSafeFrontmatterValue('haiku'), true);
  assert.strictEqual(isSafeFrontmatterValue('"a: b"'), true);
  assert.strictEqual(isSafeFrontmatterValue("'a: b'"), true);
  assert.strictEqual(isSafeFrontmatterValue('a: b'), false);
  assert.strictEqual(isSafeFrontmatterValue('a #b'), false);
  assert.strictEqual(isSafeFrontmatterValue('a:'), false);
  for (const c of ['`', '@', '%', '&', '*', '!', '{', '[', ',', '?', '|', '>']) {
    assert.strictEqual(isSafeFrontmatterValue(c + 'x'), false, c);
  }
});

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
