'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { applyOverrides } = require('./apply-overrides.js');
const { sha256Hex } = require('./overrides-markdown.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error('FAIL: ' + name);
    console.error(e.message);
    console.error(e.stack);
  }
}

function makeFixture(opts) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ovr-'));
  const agentsDir = path.join(tmpDir, '.claude', 'agents');
  const skillsDir = path.join(tmpDir, '.claude', 'skills');
  const devWorkflowDir = path.join(skillsDir, 'dev-workflow');
  const overridesDir = path.join(devWorkflowDir, 'overrides');

  fs.mkdirSync(agentsDir, { recursive: true });
  fs.mkdirSync(path.join(skillsDir, 'demo'), { recursive: true });
  fs.mkdirSync(devWorkflowDir, { recursive: true });
  fs.mkdirSync(overridesDir, { recursive: true });

  // Agent file
  const agentContent = opts.agentContent || '---\nname: demo\ndescription: Teszt\nmodel: sonnet\ntools: Read,\n  Grep\n---\nEredeti torzs\n';
  fs.writeFileSync(path.join(agentsDir, 'demo.md'), agentContent, 'utf8');

  // Skill file
  const skillContent = opts.skillContent || '---\nname: demo\ndescription: Skill\n---\nSkill torzs\n';
  fs.writeFileSync(path.join(skillsDir, 'demo', 'SKILL.md'), skillContent, 'utf8');

  // Overrides YAML
  if (opts.yamlContent !== undefined) {
    fs.writeFileSync(path.join(devWorkflowDir, 'overrides.yaml'), opts.yamlContent, 'utf8');
  }

  // Override body files
  if (opts.overrideFiles) {
    for (const [filename, content] of Object.entries(opts.overrideFiles)) {
      fs.writeFileSync(path.join(overridesDir, filename), content, 'utf8');
    }
  }

  return tmpDir;
}

function run(dir, opts) {
  const logs = [];
  const warns = [];
  const result = applyOverrides(dir, (msg) => logs.push(msg), (msg) => warns.push(msg));
  return { result, logs, warns };
}

// --- Tesztek ---

test('frontmatter override changes only listed keys', () => {
  const yaml = `version: 1\nagents:\n  demo:\n    frontmatter:\n      model: haiku\n`;
  const dir = makeFixture({ yamlContent: yaml });
  try {
    const { result, logs } = run(dir);
    assert.strictEqual(result.applied, 1);
    assert.strictEqual(result.conflicts, 0);
    assert.strictEqual(result.skipped, 0);
    assert.ok(logs.some((l) => l.includes('OVERRIDE ALKALMAZVA (frontmatter)')));

    const content = fs.readFileSync(path.join(dir, '.claude', 'agents', 'demo.md'), 'utf8');
    assert.ok(content.includes('model: haiku'));
    assert.ok(content.includes('name: demo'));
    assert.ok(content.includes('description: Teszt'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('body override applies when hash matches', () => {
  const bodyText = 'Eredeti torzs\n';
  const hash = sha256Hex(bodyText);
  const newBody = 'Új törzs\n';
  const yaml = `version: 1\nagents:\n  demo:\n    body:\n      file: new-body.md\n      base_sha256: ${hash}\n`;
  const dir = makeFixture({
    yamlContent: yaml,
    overrideFiles: { 'new-body.md': newBody },
  });
  try {
    const { result, logs } = run(dir);
    assert.strictEqual(result.applied, 1);
    assert.strictEqual(result.conflicts, 0);
    assert.strictEqual(result.skipped, 0);
    assert.ok(logs.some((l) => l.includes('OVERRIDE ALKALMAZVA (törzs)')));

    const content = fs.readFileSync(path.join(dir, '.claude', 'agents', 'demo.md'), 'utf8');
    assert.ok(content.includes('Új törzs'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('body conflict keeps package body and writes override-conflict', () => {
  const bodyText = 'Eredeti torzs\n';
  const hash = sha256Hex(bodyText);
  const newBody = 'Új törzs\n';
  // Use a different hash to simulate conflict
  const wrongHash = sha256Hex('Másik törzs\n');
  const yaml = `version: 1\nagents:\n  demo:\n    body:\n      file: new-body.md\n      base_sha256: ${wrongHash}\n`;
  const dir = makeFixture({
    yamlContent: yaml,
    overrideFiles: { 'new-body.md': newBody },
  });
  try {
    const { result, logs, warns } = run(dir);
    assert.strictEqual(result.applied, 0);
    assert.strictEqual(result.conflicts, 1);
    assert.strictEqual(result.skipped, 0);
    assert.ok(logs.some((w) => w.includes('OVERRIDE ÜTKÖZÉS')));
    assert.ok(warns.some((w) => w.includes('FIGYELEM')));

    const conflictPath = path.join(dir, '.claude', 'agents', 'demo.md.override-conflict');
    assert.ok(fs.existsSync(conflictPath));
    const conflictContent = fs.readFileSync(conflictPath, 'utf8');
    assert.strictEqual(conflictContent, newBody);

    // Original file should remain unchanged
    const content = fs.readFileSync(path.join(dir, '.claude', 'agents', 'demo.md'), 'utf8');
    assert.ok(content.includes('Eredeti torzs'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('stale override-conflict removed after resolution', () => {
  const bodyText = 'Eredeti torzs\n';
  const hash = sha256Hex(bodyText);
  const newBody = 'Új törzs\n';
  const yaml = `version: 1\nagents:\n  demo:\n    body:\n      file: new-body.md\n      base_sha256: ${hash}\n`;
  const dir = makeFixture({
    yamlContent: yaml,
    overrideFiles: { 'new-body.md': newBody },
  });
  try {
    // Create a stale conflict file
    const conflictPath = path.join(dir, '.claude', 'agents', 'demo.md.override-conflict');
    fs.writeFileSync(conflictPath, 'Régi konfliktus\n', 'utf8');
    assert.ok(fs.existsSync(conflictPath));

    const { result, logs } = run(dir);
    assert.strictEqual(result.applied, 1);
    assert.ok(logs.some((l) => l.includes('OVERRIDE ÜTKÖZÉS FELOLDVA')));

    assert.ok(!fs.existsSync(conflictPath));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('unknown agent is skipped with warning', () => {
  const yaml = `version: 1\nagents:\n  unknown:\n    frontmatter:\n      model: haiku\n`;
  const dir = makeFixture({ yamlContent: yaml });
  try {
    const { result, warns } = run(dir);
    assert.strictEqual(result.applied, 0);
    assert.strictEqual(result.skipped, 1);
    assert.ok(warns.some((w) => w.includes('a célfájl nem létezik')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('missing body file skips body only', () => {
  const bodyText = 'Eredeti torzs\n';
  const hash = sha256Hex(bodyText);
  const yaml = `version: 1\nagents:\n  demo:\n    body:\n      file: missing.md\n      base_sha256: ${hash}\n`;
  const dir = makeFixture({ yamlContent: yaml });
  try {
    const { result, warns } = run(dir);
    assert.strictEqual(result.applied, 0);
    assert.strictEqual(result.skipped, 1);
    assert.ok(warns.some((w) => w.includes('törzsfájl nem létezik')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('invalid yaml skips whole file with warning', () => {
  const yaml = `version: 1\n  agents:\n    demo:\n      frontmatter:\n        model: haiku\n`;
  const dir = makeFixture({ yamlContent: yaml });
  try {
    const { result, warns } = run(dir);
    assert.strictEqual(result.applied, 0);
    assert.strictEqual(result.skipped, 1);
    assert.ok(warns.some((w) => w.includes('overrides.yaml hibás')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('name key in frontmatter is rejected', () => {
  const yaml = `version: 1\nagents:\n  demo:\n    frontmatter:\n      name: new-name\n`;
  const dir = makeFixture({ yamlContent: yaml });
  try {
    const { result, warns } = run(dir);
    assert.strictEqual(result.applied, 0);
    assert.strictEqual(result.skipped, 1);
    assert.ok(warns.some((w) => w.includes('frontmatter kulcs nem lehet name')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('path traversal in body.file rejected', () => {
  const bodyText = 'Eredeti torzs\n';
  const hash = sha256Hex(bodyText);
  const yaml = `version: 1\nagents:\n  demo:\n    body:\n      file: ../evil.md\n      base_sha256: ${hash}\n`;
  const dir = makeFixture({ yamlContent: yaml });
  try {
    const { result, warns } = run(dir);
    assert.strictEqual(result.applied, 0);
    assert.strictEqual(result.skipped, 1);
    assert.ok(warns.some((w) => w.includes('hibás törzs konfiguráció')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('second run is byte-identical', () => {
  const bodyText = 'Eredeti torzs\n';
  const hash = sha256Hex(bodyText);
  const newBody = 'Új törzs\n';
  const yaml = `version: 1\nagents:\n  demo:\n    body:\n      file: new-body.md\n      base_sha256: ${hash}\n`;
  const dir = makeFixture({
    yamlContent: yaml,
    overrideFiles: { 'new-body.md': newBody },
  });
  try {
    run(dir);
    const content1 = fs.readFileSync(path.join(dir, '.claude', 'agents', 'demo.md'), 'utf8');

    run(dir);
    const content2 = fs.readFileSync(path.join(dir, '.claude', 'agents', 'demo.md'), 'utf8');

    assert.strictEqual(content1, content2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('no overrides.yaml is silent no-op', () => {
  const dir = makeFixture({ yamlContent: undefined });
  try {
    const { result, logs, warns } = run(dir);
    assert.strictEqual(result.applied, 0);
    assert.strictEqual(result.conflicts, 0);
    assert.strictEqual(result.skipped, 0);
    assert.strictEqual(logs.length, 0);
    assert.strictEqual(warns.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CRLF target stays CRLF', () => {
  const agentContent = '---\r\nname: demo\r\ndescription: Teszt\r\nmodel: sonnet\r\ntools: Read,\r\n  Grep\r\n---\r\nEredeti torzs\r\n';
  const yaml = `version: 1\nagents:\n  demo:\n    frontmatter:\n      model: haiku\n`;
  const dir = makeFixture({ agentContent, yamlContent: yaml });
  try {
    run(dir);
    const content = fs.readFileSync(path.join(dir, '.claude', 'agents', 'demo.md'), 'utf8');
    assert.ok(content.includes('\r\n'));
    assert.ok(!content.includes('\n---\nEredeti'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('seeded overrides.yaml (version only) gives no warning', () => {
  const dir = makeFixture({ yamlContent: 'version: 1\n' });
  try {
    const { result, warns } = run(dir);
    assert.strictEqual(result.applied, 0);
    assert.ok(!warns.some((w) => w.includes('FIGYELEM')), warns.join('|'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('BOM target file stays byte-identical outside the changed key', () => {
  const agentContent = '\uFEFF---\nname: demo\nmodel: sonnet\n---\nEredeti torzs\n';
  const yaml = `version: 1\nagents:\n  demo:\n    frontmatter:\n      model: haiku\n`;
  const dir = makeFixture({ agentContent, yamlContent: yaml });
  try {
    const { result } = run(dir);
    assert.strictEqual(result.applied, 1);
    const content = fs.readFileSync(path.join(dir, '.claude', 'agents', 'demo.md'), 'utf8');
    assert.strictEqual(content, '\uFEFF---\nname: demo\nmodel: haiku\n---\nEredeti torzs\n');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('unquoted frontmatter value with ": " is skipped with warning, quoted one is applied', () => {
  const yaml = `version: 1\nagents:\n  demo:\n    frontmatter:\n      description: Teszt: rossz\n      model: haiku\n`;
  const dir = makeFixture({ yamlContent: yaml });
  try {
    const { result, warns } = run(dir);
    assert.strictEqual(result.applied, 1);
    assert.ok(warns.some((w) => w.includes('description') && w.includes('idézőjel')));
    const content = fs.readFileSync(path.join(dir, '.claude', 'agents', 'demo.md'), 'utf8');
    assert.ok(content.includes('model: haiku'));
    assert.ok(content.includes('description: Teszt\n'));
    assert.ok(!content.includes('rossz'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const yaml2 = `version: 1\nagents:\n  demo:\n    frontmatter:\n      description: "Teszt: jó"\n`;
  const dir2 = makeFixture({ yamlContent: yaml2 });
  try {
    run(dir2);
    const content = fs.readFileSync(path.join(dir2, '.claude', 'agents', 'demo.md'), 'utf8');
    assert.ok(content.includes('description: "Teszt: jó"'));
  } finally {
    fs.rmSync(dir2, { recursive: true, force: true });
  }
});

test('replacing a key with a column-0 YAML list leaves no orphan line', () => {
  const agentContent = '---\nname: demo\ntools:\n- Read\n- Grep\nmodel: sonnet\n---\nEredeti torzs\n';
  const yaml = `version: 1\nagents:\n  demo:\n    frontmatter:\n      tools: Read\n`;
  const dir = makeFixture({ agentContent, yamlContent: yaml });
  try {
    run(dir);
    const content = fs.readFileSync(path.join(dir, '.claude', 'agents', 'demo.md'), 'utf8');
    assert.strictEqual(content, '---\nname: demo\ntools: Read\nmodel: sonnet\n---\nEredeti torzs\n');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('body.file symlinked outside overrides/ is skipped', () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ovr-out-'));
  fs.writeFileSync(path.join(outside, 'secret.md'), 'Kívül\n', 'utf8');
  const hash = sha256Hex('Eredeti torzs\n');
  const yaml = `version: 1\nagents:\n  demo:\n    body:\n      file: link.md\n      base_sha256: ${hash}\n`;
  const dir = makeFixture({ yamlContent: yaml });
  try {
    try {
      fs.symlinkSync(path.join(outside, 'secret.md'), path.join(dir, '.claude', 'skills', 'dev-workflow', 'overrides', 'link.md'));
    } catch (e) {
      return; // nincs symlink-jog ezen a platformon: a teszt kimarad
    }
    const { result, warns } = run(dir);
    assert.strictEqual(result.applied, 0);
    assert.ok(warns.some((w) => w.includes('overrides/ könyvtáron kívülre')));
    const content = fs.readFileSync(path.join(dir, '.claude', 'agents', 'demo.md'), 'utf8');
    assert.ok(content.includes('Eredeti torzs'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('conflict diff compares package body with local body, without frontmatter', () => {
  const { spawnSync } = require('child_process');
  if (spawnSync('diff', ['--version']).status !== 0) return; // nincs diff ezen a gépen
  const wrongHash = sha256Hex('Másik torzs\n');
  const yaml = `version: 1\nagents:\n  demo:\n    body:\n      file: new-body.md\n      base_sha256: ${wrongHash}\n`;
  const dir = makeFixture({ yamlContent: yaml, overrideFiles: { 'new-body.md': 'Helyi torzs\n' } });
  try {
    const { logs } = run(dir);
    const diff = logs.find((l) => l.includes('@@')) || '';
    assert.ok(diff.includes('-Eredeti torzs'), diff);
    assert.ok(diff.includes('+Helyi torzs'), diff);
    assert.ok(!diff.includes('name: demo'), diff);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
  process.exit(1);
}
