#!/usr/bin/env node
/**
 * dev-workflow (ORD-377, 4.28.0)
 *
 * Egy belépési pont a CI-nak: lefuttatja az estimate/*.test.js fájlokat és (ha megvan) a
 * ../estimate-run.fixtures.test.js fixture-tesztet. Fájlonként egy sort ír, a végén összegzést.
 *
 * Használat:
 *   node run-all-tests.js
 *
 * Kilépési kódok:
 *   0: minden teszt átment
 *   1: legalább egy teszt sikertelen
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = __dirname;
const files = fs
  .readdirSync(dir)
  .filter((name) => name.endsWith('.test.js'))
  .sort()
  .map((name) => path.join(dir, name));

// A fixture-teszt a CLI mellett él; a 24. lépés előtt még nincs, ilyenkor kimarad.
const fixtureTest = path.join(dir, '..', 'estimate-run.fixtures.test.js');
if (fs.existsSync(fixtureTest)) files.push(fixtureTest);

let failed = 0;
for (const file of files) {
  const label = path.relative(path.join(dir, '..'), file).split(path.sep).join('/');
  const res = spawnSync(process.execPath, [file], { encoding: 'utf8' });
  const lastLine = (res.stdout || '').trim().split('\n').pop();
  if (res.status === 0) {
    console.log(`OK     ${label}: ${lastLine}`);
  } else {
    failed++;
    console.log(`HIBA   ${label}: kilépési kód ${res.status}`);
    if (res.stdout) process.stdout.write(res.stdout);
    if (res.stderr) process.stderr.write(res.stderr);
  }
}

console.log(`${files.length - failed}/${files.length} tesztfájl sikeres, ${failed} sikertelen`);
if (failed > 0) process.exit(1);
