'use strict';

const assert = require('assert');
const { parseOverridesYaml } = require('./overrides-yaml');

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
  }
}

test('empty file returns empty object', () => {
  const result = parseOverridesYaml('');
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.value, {});
});

test('comments only returns empty object', () => {
  const result = parseOverridesYaml('# comment\n# another comment');
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.value, {});
});

test('simple key-value pair', () => {
  const result = parseOverridesYaml('key: value');
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.value, { key: 'value' });
});

test('key with empty value creates empty object', () => {
  const result = parseOverridesYaml('key:');
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.value, { key: {} });
});

test('nested key-value pairs', () => {
  const yaml = `
parent:
  child: value
`;
  const result = parseOverridesYaml(yaml);
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.value, { parent: { child: 'value' } });
});

test('quoted string value', () => {
  const result = parseOverridesYaml('key: "value"');
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.value, { key: '"value"' });
});

test('single quoted string value', () => {
  const result = parseOverridesYaml("key: 'value'");
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.value, { key: "'value'" });
});

test('unquoted string with inline comment', () => {
  const result = parseOverridesYaml('key: value # comment');
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.value, { key: 'value' });
});

test('quoted string with inline comment inside quotes is ignored', () => {
  const result = parseOverridesYaml('key: "value # not a comment"');
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.value, { key: '"value # not a comment"' });
});

test('tab indentation error', () => {
  const result = parseOverridesYaml('\tkey: value');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, '1. sor: tab behúzás');
});

test('odd indentation error', () => {
  const result = parseOverridesYaml(' key: value');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, '1. sor: páratlan behúzás');
});

test('duplicate key error', () => {
  const yaml = `
key: value1
key: value2
`;
  const result = parseOverridesYaml(yaml);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, '3. sor: duplikált kulcs');
});

test('__proto__ key error', () => {
  const result = parseOverridesYaml('__proto__: value');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, '1. sor: __proto__ kulcs nem megengedett');
});

test('list error', () => {
  const result = parseOverridesYaml('key: - item');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, '1. sor: lista nem támogatott');
});

test('flow mapping error', () => {
  const result = parseOverridesYaml('key: {a: b}');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, '1. sor: flow mapping nem támogatott');
});

test('flow list error', () => {
  const result = parseOverridesYaml('key: [a, b]');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, '1. sor: flow lista nem támogatott');
});

test('block scalar error', () => {
  const result = parseOverridesYaml('key: |');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, '1. sor: blokk-skalár nem támogatott');
});

test('anchor error', () => {
  const result = parseOverridesYaml('key: &anchor value');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, '1. sor: horgony nem támogatott');
});

test('alias error', () => {
  const result = parseOverridesYaml('key: *anchor');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, '1. sor: alias nem támogatott');
});

test('tag error', () => {
  const result = parseOverridesYaml('key: !tag value');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, '1. sor: tag nem támogatott');
});

test('unquoted string with no colon error', () => {
  const result = parseOverridesYaml('invalid line');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, '1. sor: érvénytelen sor alak');
});

test('invalid key characters error', () => {
  const result = parseOverridesYaml('invalid-key: value');
  assert.strictEqual(result.ok, true); // Hyphen is allowed in key
  assert.deepStrictEqual(result.value, { 'invalid-key': 'value' });
});

test('invalid key characters error 2', () => {
  const result = parseOverridesYaml('invalid key: value');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, '1. sor: érvénytelen sor alak');
});

test('deeper nesting', () => {
  const yaml = `
a:
  b:
    c: value
`;
  const result = parseOverridesYaml(yaml);
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.value, { a: { b: { c: 'value' } } });
});

test('indentation jump error', () => {
  const yaml = `
a: value
    b: value
`;
  const result = parseOverridesYaml(yaml);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, '3. sor: váratlan behúzás');
});

test('mixed indentation levels', () => {
  const yaml = `
a:
  b: value
c: value
`;
  const result = parseOverridesYaml(yaml);
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.value, { a: { b: 'value' }, c: 'value' });
});

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
