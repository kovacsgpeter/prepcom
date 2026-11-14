#!/usr/bin/env node
/*
 * ui-contract.js — a frontend "UI-szerződés" kinyerése és a UI-változási keret
 * (UI_CHANGE_BUDGET) gépi ellenőrzése. Bevezetve: COCALC-899 (dev-workflow 4.21.0), a
 * `ux-designer` képességhez.
 *
 * Miért: egy UX-újratervezés akkor olcsó és biztonságos, ha a meglévő komponens-
 * osztályok publikus felülete (mezők, getterek, metódusok, @Input/@Output), a service-ek
 * és a backend-API változatlan marad, és a változás a sablonra/stílusra korlátozódik. Ez a
 * szkript (1) kigyűjti ezt a szerződést, hogy a tervező csak meglévő képességekre
 * építsen, és (2) egy diffről megmondja, melyik változási szintbe esik, hogy az
 * implementáció ne lépje túl a ticketen rögzített keretet.
 *
 * Változási szintek (a ticket "UI-változás kerete" mezője ezekre képeződik le):
 *   T0  sablon/stílus — *.html/*.scss/*.css/asset, komponens-metaadat (imports,
 *       templateUrl, styleUrl), komment/formázás                 → template-only
 *   T1  vékony TS — új prezentációs tag (getter/mező/metódus inject nélkül), új
 *       prezentációs komponens, útvonal-változás, csak szöveg-literál módosul  → thin-ts
 *   T2  FE-logika — meglévő tag módosul/törlődik, új service-függés, service/modell/
 *       segéd-TS, függőség (package.json), build-konfig                        → logic
 *   T3  API/backend — bármi a backend-könyvtár alatt                           → free
 *
 * Alparancsok:
 *   extract       --app-dir <dir> [--backend-dir <dir>] [--tokens <scss>]
 *                 [--only <szövegrész>] [--format md|json]
 *   check-budget  --budget template-only|thin-ts|logic|free [--base <git ref>]
 *                 [--frontend-dir <dir>] [--backend-dir <dir>] [--worktree]
 *                 [--format text|json]
 *   classify      --path <repo-relatív út> [--old <fájl>] [--new <fájl>]   (önteszt-hook)
 *
 * Kilépőkódok: 0 = rendben / a kereten belül; 1 = kereten kívül; 2 = használati vagy
 * környezeti hiba (pl. feloldhatatlan git-bázis). A 2-es kód NEM "átment": a hívó
 * ilyenkor jelezze, hogy a keret nem ellenőrizhető.
 *
 * Ismert korlátok (szándékos, függőség-mentes heurisztika — nincs TypeScript-csomag):
 *   - pontosvesszővel lezárt osztálytagokat feltételez (ESLint/Prettier-alap);
 *   - a route-ok közül csak a lapos `{ path: ..., component: ... }` objektumokat olvassa;
 *   - a sablon-azonosítók felismerése közelítő (kifejezés-tokenek, nem teljes parse).
 *   Bizonytalan esetben inkább a magasabb szintre sorol, sosem az alacsonyabbra.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MASK = '\u0001';
const TIERS = ['T0', 'T1', 'T2', 'T3'];
const TIER_LABEL = {
  T0: 'sablon/stílus',
  T1: 'vékony TS',
  T2: 'FE-logika',
  T3: 'API/backend',
};
const BUDGETS = { 'template-only': 0, 'thin-ts': 1, logic: 2, free: 3 };

const LIFECYCLE = new Set([
  'ngOnInit', 'ngOnChanges', 'ngDoCheck', 'ngAfterContentInit', 'ngAfterContentChecked',
  'ngAfterViewInit', 'ngAfterViewChecked', 'ngOnDestroy',
]);
const MODIFIERS = new Set([
  'public', 'private', 'protected', 'readonly', 'static', 'async', 'override', 'abstract',
  'declare', 'accessor',
]);
const COSMETIC_META = new Set(['imports', 'templateUrl', 'template', 'styleUrl', 'styleUrls', 'styles', 'standalone']);
const DI_META = new Set(['providers', 'viewProviders']);
const MARKUP_EXT = new Set(['.html', '.scss', '.css', '.sass', '.less']);
// Statikus, a böngészőnek kiszolgált tartalom (kép, betű, letölthető minta-/dokumentum-fájl).
// A `.json` szándékosan nincs itt: az a frontend gyökerén build-/projekt-konfig.
const ASSET_EXT = new Set([
  '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.woff', '.woff2', '.ttf',
  '.otf', '.md', '.txt', '.csv', '.xls', '.xlsx', '.pdf', '.webmanifest',
]);

function die(msg, code = 2) {
  process.stderr.write(`ui-contract: ${msg}\n`);
  process.exit(code);
}

function normalizeEol(s) {
  return s.replace(/\r\n?/g, '\n');
}

function collapse(s) {
  return s.replace(new RegExp(`${MASK}+`, 'g'), '').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Szkenner: két, a forrással azonos hosszú változat. `masked`: kommentek szóközre,
// string-/template-/regex-literálok tartalma MASK-ra cserélve (a zárójel-párosítás és a
// tag-bontás ezen fut). `nocom`: csak a kommentek eltávolítva (összehasonlításhoz).
// ---------------------------------------------------------------------------
const REGEX_PREV_CHARS = new Set('(,=:[!&|?{};+-*%<>~^'.split(''));
const REGEX_PREV_WORDS = new Set([
  'return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'throw', 'else', 'do',
  'yield', 'await',
]);

function scan(src) {
  const n = src.length;
  const masked = src.split('');
  const nocom = src.split('');
  const stack = [{ mode: 'code', braces: 0, inTpl: false }];
  let lastSig = '';
  let lastWord = '';
  let i = 0;
  const blank = (k) => {
    if (masked[k] !== '\n') masked[k] = MASK;
  };
  const uncomment = (k) => {
    if (src[k] !== '\n') {
      masked[k] = ' ';
      nocom[k] = ' ';
    }
  };

  while (i < n) {
    const top = stack[stack.length - 1];
    const c = src[i];

    if (top.mode === 'tpl') {
      if (c === '\\') {
        blank(i);
        if (i + 1 < n) blank(i + 1);
        i += 2;
        continue;
      }
      if (c === '`') {
        stack.pop();
        lastSig = 'x';
        lastWord = '';
        i++;
        continue;
      }
      if (c === '$' && src[i + 1] === '{') {
        i += 2;
        stack.push({ mode: 'code', braces: 0, inTpl: true });
        lastSig = '{';
        continue;
      }
      blank(i);
      i++;
      continue;
    }

    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') uncomment(i++);
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const endIdx = src.indexOf('*/', i + 2);
      const stop = endIdx < 0 ? n : endIdx + 2;
      while (i < stop) uncomment(i++);
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < n && src[i] !== c && src[i] !== '\n') {
        if (src[i] === '\\') {
          blank(i);
          i++;
        }
        if (i < n) blank(i);
        i++;
      }
      i++;
      lastSig = 'x';
      lastWord = '';
      continue;
    }
    if (c === '`') {
      stack.push({ mode: 'tpl' });
      i++;
      continue;
    }
    if (c === '/') {
      if (lastSig === '' || REGEX_PREV_CHARS.has(lastSig) || REGEX_PREV_WORDS.has(lastWord)) {
        i++;
        let inClass = false;
        while (i < n && src[i] !== '\n') {
          const d = src[i];
          if (d === '\\') {
            blank(i);
            i++;
            if (i < n) blank(i);
            i++;
            continue;
          }
          if (d === '[') inClass = true;
          else if (d === ']') inClass = false;
          else if (d === '/' && !inClass) break;
          blank(i);
          i++;
        }
        i++;
        while (i < n && /[a-z]/i.test(src[i])) i++;
        lastSig = 'x';
        lastWord = '';
        continue;
      }
      lastSig = '/';
      lastWord = '';
      i++;
      continue;
    }
    if (top.inTpl) {
      if (c === '{') top.braces++;
      else if (c === '}') {
        if (top.braces === 0) {
          stack.pop();
          i++;
          continue;
        }
        top.braces--;
      }
    }
    if (/[A-Za-z_$#]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w$]/.test(src[j])) j++;
      lastWord = src.slice(i, j);
      lastSig = 'a';
      i = j;
      continue;
    }
    if (!/\s/.test(c)) {
      lastSig = c;
      lastWord = '';
    }
    i++;
  }
  return { masked: masked.join(''), nocom: nocom.join('') };
}

const PAIRS = { '(': ')', '[': ']', '{': '}' };

function matchBracket(text, openIdx) {
  const open = text[openIdx];
  const close = PAIRS[open];
  let depth = 0;
  for (let k = openIdx; k < text.length; k++) {
    const ch = text[k];
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return k;
    }
  }
  return -1;
}

function topLevelAssignIndex(maskedText) {
  let depth = 0;
  for (let k = 0; k < maskedText.length; k++) {
    const ch = maskedText[k];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === '=' && depth === 0) {
      const prev = maskedText[k - 1];
      const next = maskedText[k + 1];
      if (next === '>' || next === '=' || prev === '=' || prev === '!' || prev === '<' || prev === '>') continue;
      return k;
    }
  }
  return -1;
}

// Egy tag fejében a `{` akkor nyit metódustörzset, ha nem egy típus-annotáció része
// (pl. `): Promise<{ id: string }>` vagy `): { a: number }`): a paraméterlista utáni
// részben nincs nyitott generikus `<`, és nem `:`/`|`/`&`/`,`/`<` előzi meg.
function opensBody(headMasked) {
  const rest = headMasked.trim();
  if (/[:|&,<]$/.test(rest)) return false;
  let depth = 0;
  let lastClose = -1;
  for (let k = 0; k < rest.length; k++) {
    const ch = rest[k];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) lastClose = k;
    }
  }
  const tail = lastClose < 0 ? rest : rest.slice(lastClose + 1);
  const opens = (tail.match(/</g) || []).length;
  const closes = (tail.match(/[^=]>/g) || []).length;
  return opens <= closes;
}

function skipLeadingDecorators(maskedText) {
  // Visszaadja: { names: [...], offset } — az offset a dekorátorok utáni első pozíció.
  const names = [];
  let k = 0;
  for (;;) {
    while (k < maskedText.length && /\s/.test(maskedText[k])) k++;
    if (maskedText[k] !== '@') break;
    const dm = /^@([\w$.]+)/.exec(maskedText.slice(k));
    names.push(dm ? dm[1] : '?');
    k += dm ? dm[0].length : 1;
    let q = k;
    while (q < maskedText.length && /\s/.test(maskedText[q])) q++;
    if (maskedText[q] === '(') {
      const cl = matchBracket(maskedText, q);
      k = cl < 0 ? maskedText.length : cl + 1;
    }
  }
  return { names, offset: k };
}

// Az osztálytörzs tagokra bontása: pontosvessző, illetve metódus-/getter-/konstruktor-
// törzs záró kapcsos zárójele zár le egy tagot. Tulajdonság-inicializáló ({...}, () => {...})
// nem zár le, az a pontosvesszőig tart.
function splitMembers(masked, start, end) {
  const out = [];
  let memberStart = start;
  let i = start;
  const push = (s, e) => {
    if (masked.slice(s, e).trim()) out.push({ start: s, end: e });
  };
  while (i < end) {
    const ch = masked[i];
    if (ch === '(' || ch === '[') {
      const cl = matchBracket(masked, i);
      if (cl < 0 || cl > end) break;
      i = cl + 1;
      continue;
    }
    if (ch === '{') {
      const cl = matchBracket(masked, i);
      if (cl < 0 || cl > end) break;
      const head = masked.slice(memberStart, i);
      const rest = head.slice(skipLeadingDecorators(head).offset).trim();
      const methodLike =
        rest === 'static' ||
        (rest.includes('(') && topLevelAssignIndex(rest) < 0 && opensBody(rest));
      i = cl + 1;
      if (methodLike) {
        push(memberStart, i);
        memberStart = i;
      }
      continue;
    }
    if (ch === ';') {
      push(memberStart, i + 1);
      memberStart = i + 1;
      i++;
      continue;
    }
    i++;
  }
  if (memberStart < end) push(memberStart, end);
  return out;
}

function parseMember(src, masked, nocom, s, e) {
  const m = masked.slice(s, e);
  const nc = nocom.slice(s, e);
  const { names: decorators, offset } = skipLeadingDecorators(m);
  let r = m.slice(offset).replace(/^\s+/, '');
  let rOffset = m.length - r.length;
  const mods = [];
  for (;;) {
    const wm = /^([A-Za-z]+)\s+(?=[#\w$])/.exec(r);
    if (!wm || !MODIFIERS.has(wm[1])) break;
    mods.push(wm[1]);
    r = r.slice(wm[0].length);
    rOffset += wm[0].length;
  }
  let kind;
  let name;
  let mm;
  if (/^constructor\s*\(/.test(r)) {
    kind = 'constructor';
    name = 'constructor';
  } else if ((mm = /^(get|set)\s+([#\w$]+)\s*\(/.exec(r))) {
    kind = mm[1] === 'get' ? 'getter' : 'setter';
    name = mm[2];
  } else if ((mm = /^([#\w$]+)\s*[?!]?\s*(<[^(]*>)?\s*\(/.exec(r))) {
    kind = 'method';
    name = mm[1];
  } else if ((mm = /^([#\w$]+)\s*[?!]?\s*(?=[:=;]|$)/.exec(r))) {
    kind = 'property';
    name = mm[1];
  } else {
    kind = 'unknown';
    name = collapse(r).slice(0, 40);
  }
  const visibility = mods.includes('private') || name.startsWith('#')
    ? 'private'
    : mods.includes('protected') ? 'protected' : 'public';

  const restNc = nc.slice(rOffset);
  let signature;
  let initMasked = '';
  let initNc = '';
  if (kind === 'property' || kind === 'unknown') {
    const ai = topLevelAssignIndex(r);
    if (ai >= 0) {
      initMasked = r.slice(ai + 1);
      initNc = restNc.slice(ai + 1);
    }
    signature = collapse(restNc).replace(/;$/, '');
  } else {
    // A törzs nyitó kapcsos zárójele előtti fej (paraméterek + visszatérési típus).
    let depth = 0;
    let cut = r.length;
    let seenParen = false;
    for (let k = 0; k < r.length; k++) {
      const ch = r[k];
      if (ch === '(') {
        depth++;
        seenParen = true;
      } else if (ch === ')') depth--;
      else if (ch === '{' && depth === 0 && seenParen && opensBody(r.slice(0, k))) {
        cut = k;
        break;
      }
    }
    signature = collapse(restNc.slice(0, cut)).replace(/;$/, '');
  }
  if (signature.length > 160) signature = `${signature.slice(0, 157)}...`;

  const tags = new Set();
  const initT = initMasked.trim();
  if (decorators.includes('Input') || /^(input|model)(\.required)?\s*[<(]/.test(initT)) tags.add('input');
  if (decorators.includes('Output') || /^(output|outputFromObservable)\s*[<(]/.test(initT) || /^new\s+EventEmitter\b/.test(initT)) tags.add('output');
  if (/^(signal|computed|linkedSignal|toSignal)\s*[<(]/.test(initT)) tags.add('signal');
  if (/\binject\s*[<(]/.test(initMasked)) tags.add('inject');
  if (decorators.some((d) => /^(ViewChild|ViewChildren|ContentChild|ContentChildren)$/.test(d)) ||
      /^(viewChild|viewChildren|contentChild|contentChildren)(\.required)?\s*[<(]/.test(initT)) tags.add('query');
  if (decorators.includes('HostListener') || decorators.includes('HostBinding')) tags.add('host');
  if (kind === 'method' && LIFECYCLE.has(name)) tags.add('lifecycle');

  const deps = [];
  if (tags.has('inject')) {
    const dm = /\binject\s*(?:<[^>]*>)?\(\s*([\w$.]+)/.exec(initNc);
    if (dm) deps.push(dm[1]);
  }
  if (kind === 'constructor') {
    const re = /(?:private|public|protected|readonly)\s+(?:readonly\s+)?([\w$]+)\s*\??\s*:\s*([\w$.]+)/g;
    let pm;
    while ((pm = re.exec(signature))) deps.push(pm[2]);
    if (deps.length) tags.add('inject');
  }

  return {
    kind,
    name,
    visibility,
    decorators,
    tags: [...tags],
    signature,
    deps,
    normFull: collapse(nc),
    normStruct: collapse(m),
  };
}

function parseMeta(src, masked, nocom, openParen, closeParen) {
  const meta = {};
  const objOpen = masked.indexOf('{', openParen);
  if (objOpen < 0 || objOpen > closeParen) return meta;
  const objClose = matchBracket(masked, objOpen);
  let k = objOpen + 1;
  let entryStart = k;
  const flush = (endIdx) => {
    const seg = masked.slice(entryStart, endIdx);
    const km = /^\s*([\w$]+)\s*:/.exec(seg);
    if (km) {
      const valStart = entryStart + km[0].length;
      meta[km[1]] = {
        raw: src.slice(valStart, endIdx).trim(),
        norm: collapse(nocom.slice(valStart, endIdx)),
      };
    }
  };
  while (k < objClose) {
    const ch = masked[k];
    if (ch === '(' || ch === '[' || ch === '{') {
      const cl = matchBracket(masked, k);
      k = cl < 0 ? objClose : cl + 1;
      continue;
    }
    if (ch === ',') {
      flush(k);
      entryStart = k + 1;
    }
    k++;
  }
  flush(objClose);
  return meta;
}

function stripQuotes(s) {
  return (s || '').trim().replace(/^['"`]|['"`]$/g, '');
}

// Egy TS-fájl szerkezete: az első dekorált osztály (Component/Injectable/Directive/Pipe)
// metaadata és tagjai, valamint az osztályon kívüli kód normalizált lenyomata.
function parseTs(srcRaw) {
  const src = normalizeEol(srcRaw);
  const { masked, nocom } = scan(src);
  const decoRe = /@(Component|Injectable|Directive|Pipe)\s*\(/g;
  const dm = decoRe.exec(masked);
  const outsideOf = (from, to) => {
    const strip = (t) => t.replace(/(^|\n)\s*import\b[\s\S]*?;/g, '\n');
    const nc = strip(nocom.slice(0, from) + nocom.slice(to));
    const mk = strip(masked.slice(0, from) + masked.slice(to));
    return { outsideNorm: collapse(nc), outsideStruct: collapse(mk) };
  };
  if (!dm) {
    return { kind: 'other', className: null, meta: {}, members: [], ...outsideOf(0, 0), wholeNorm: collapse(outsideOf(0, 0).outsideNorm) };
  }
  const kind = dm[1].toLowerCase();
  const openParen = masked.indexOf('(', dm.index);
  const closeParen = matchBracket(masked, openParen);
  const meta = parseMeta(src, masked, nocom, openParen, closeParen);
  const classRe = /\bclass\s+([A-Za-z_$][\w$]*)/g;
  classRe.lastIndex = closeParen;
  const cm = classRe.exec(masked);
  if (!cm) {
    return { kind, className: null, meta, members: [], ...outsideOf(0, 0) };
  }
  const braceOpen = masked.indexOf('{', cm.index + cm[0].length);
  const braceClose = matchBracket(masked, braceOpen);
  const members = splitMembers(masked, braceOpen + 1, braceClose)
    .map(({ start, end }) => parseMember(src, masked, nocom, start, end));
  return {
    kind,
    className: cm[1],
    meta,
    members,
    ...outsideOf(dm.index, braceClose + 1),
  };
}

// ---------------------------------------------------------------------------
// Változás-osztályozás
// ---------------------------------------------------------------------------
function memberKey(mb) {
  return `${mb.kind}:${mb.name}`;
}

function groupMembers(members) {
  const map = new Map();
  for (const mb of members) {
    const key = memberKey(mb);
    const prev = map.get(key);
    if (prev) {
      prev.normFull += ` | ${mb.normFull}`;
      prev.normStruct += ` | ${mb.normStruct}`;
      prev.tags = [...new Set([...prev.tags, ...mb.tags])];
    } else {
      map.set(key, { ...mb });
    }
  }
  return map;
}

function compareTs(oldSrc, newSrc) {
  const reasons = [];
  const a = parseTs(oldSrc);
  const b = parseTs(newSrc);
  if (a.kind !== b.kind) {
    reasons.push({ tier: 2, msg: `a fájl jellege változott (${a.kind} → ${b.kind})` });
    return reasons;
  }
  const keys = new Set([...Object.keys(a.meta), ...Object.keys(b.meta)]);
  for (const key of keys) {
    const av = a.meta[key] ? a.meta[key].norm : null;
    const bv = b.meta[key] ? b.meta[key].norm : null;
    if (av === bv) continue;
    if (COSMETIC_META.has(key)) reasons.push({ tier: 0, msg: `metaadat: ${key}` });
    else if (DI_META.has(key)) reasons.push({ tier: 2, msg: `DI-metaadat: ${key}` });
    else reasons.push({ tier: 1, msg: `metaadat: ${key}` });
  }
  const am = groupMembers(a.members);
  const bm = groupMembers(b.members);
  for (const [key, mb] of am) {
    const nb = bm.get(key);
    if (!nb) {
      reasons.push({ tier: 2, msg: `tag törölve/átnevezve: ${mb.name}` });
    } else if (nb.normFull !== mb.normFull) {
      if (nb.normStruct === mb.normStruct) reasons.push({ tier: 1, msg: `csak szöveg-literál módosult: ${mb.name}` });
      else reasons.push({ tier: 2, msg: `meglévő tag módosult: ${mb.name}` });
    }
  }
  for (const [key, mb] of bm) {
    if (am.has(key)) continue;
    if (mb.tags.includes('inject') || mb.kind === 'constructor') {
      reasons.push({ tier: 2, msg: `új service-függés: ${mb.name}` });
    } else if (mb.tags.includes('lifecycle') || mb.tags.includes('host')) {
      reasons.push({ tier: 2, msg: `új életciklus-/host-logika: ${mb.name}` });
    } else {
      reasons.push({ tier: 1, msg: `új prezentációs tag: ${mb.name}` });
    }
  }
  if (a.outsideNorm !== b.outsideNorm) {
    if (a.outsideStruct === b.outsideStruct) reasons.push({ tier: 1, msg: 'osztályon kívül csak szöveg-literál módosult' });
    else reasons.push({ tier: 2, msg: 'osztályon kívüli kód módosult (függvény/konstans/típus)' });
  }
  if (!reasons.length) reasons.push({ tier: 0, msg: 'csak komment/formázás/import' });
  return reasons;
}

function hasDi(parsed) {
  return parsed.members.some((mb) => mb.tags.includes('inject') || (mb.kind === 'constructor' && mb.deps.length)) ||
    Object.keys(parsed.meta).some((k) => DI_META.has(k));
}

function classifyChange(change, opts) {
  const p = change.path.replace(/\\/g, '/');
  const fdir = `${opts.frontendDir.replace(/\/+$/, '')}/`;
  const bdir = `${opts.backendDir.replace(/\/+$/, '')}/`;
  const ext = path.extname(p).toLowerCase();
  const base = path.basename(p);
  const reasons = [];
  let flag = null;

  const unchangedCode = ext === '.ts' && change.oldSrc != null && change.newSrc != null &&
    collapse(scan(normalizeEol(change.oldSrc)).nocom) === collapse(scan(normalizeEol(change.newSrc)).nocom);

  if (p.startsWith(bdir)) {
    reasons.push({ tier: 3, msg: 'backend/API változás' });
  } else if (!p.startsWith(fdir)) {
    return { path: p, status: change.status, tier: null, reasons: [{ tier: null, msg: 'a frontend/backend kereten kívül (figyelmen kívül hagyva)' }] };
  } else if (unchangedCode && !base.endsWith('.spec.ts')) {
    reasons.push({ tier: 0, msg: 'csak komment/formázás' });
  } else if (MARKUP_EXT.has(ext)) {
    reasons.push({ tier: 0, msg: 'sablon/stílus' });
  } else if (ASSET_EXT.has(ext)) {
    reasons.push({ tier: 0, msg: 'asset/szöveges fájl' });
  } else if (base.endsWith('.spec.ts')) {
    reasons.push({ tier: 0, msg: 'teszt módosult' });
    flag = 'test';
  } else if (base === 'package.json' || base === 'package-lock.json') {
    reasons.push({ tier: 2, msg: 'függőség-változás' });
  } else if (ext === '.ts' && /\.routes\.ts$/.test(base)) {
    reasons.push({ tier: 1, msg: 'útvonal-/flow-változás' });
  } else if (ext === '.ts') {
    const oldP = change.oldSrc != null ? parseTs(change.oldSrc) : null;
    const newP = change.newSrc != null ? parseTs(change.newSrc) : null;
    const isComponent = (oldP || newP).kind === 'component';
    if (!oldP && newP) {
      if (isComponent) reasons.push(hasDi(newP)
        ? { tier: 2, msg: 'új komponens service-függéssel' }
        : { tier: 1, msg: 'új prezentációs komponens' });
      else reasons.push({ tier: 2, msg: `új ${newP.kind === 'injectable' ? 'service' : 'TS-logika'}` });
    } else if (oldP && !newP) {
      if (isComponent) reasons.push(hasDi(oldP)
        ? { tier: 2, msg: 'service-függő komponens törölve' }
        : { tier: 1, msg: 'prezentációs komponens törölve' });
      else reasons.push({ tier: 2, msg: 'TS-logika törölve' });
    } else if (isComponent) {
      reasons.push(...compareTs(change.oldSrc, change.newSrc));
    } else {
      const a = scan(normalizeEol(change.oldSrc));
      const b = scan(normalizeEol(change.newSrc));
      if (collapse(a.nocom) === collapse(b.nocom)) reasons.push({ tier: 0, msg: 'csak komment/formázás' });
      else if (collapse(a.masked) === collapse(b.masked)) reasons.push({ tier: 1, msg: 'csak szöveg-literál módosult' });
      else reasons.push({ tier: 2, msg: oldP.kind === 'injectable' ? 'service módosult' : 'TS-logika módosult' });
    }
  } else if (ext === '.json' || /^tsconfig/.test(base) || base === 'angular.json') {
    reasons.push({ tier: 2, msg: 'build-/projekt-konfig' });
  } else {
    reasons.push({ tier: 2, msg: 'ismeretlen fájltípus (óvatos besorolás)' });
  }
  if (change.renamedFrom) reasons.push({ tier: 1, msg: `átnevezve (${change.renamedFrom})` });
  const tier = Math.max(...reasons.map((r) => r.tier));
  return { path: p, status: change.status, tier, reasons, flag };
}

// ---------------------------------------------------------------------------
// git-segédek
// ---------------------------------------------------------------------------
function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function gitShow(cwd, ref, p) {
  try {
    return git(['show', `${ref}:${p}`], cwd);
  } catch (e) {
    return null;
  }
}

function collectChanges(root, baseRef, worktree) {
  let mergeBase;
  try {
    mergeBase = git(['merge-base', baseRef, 'HEAD'], root).trim();
  } catch (e) {
    die(`a git-bázis nem oldható fel: "${baseRef}" (add meg --base-szel, pl. origin/master)`);
  }
  const diffArgs = ['diff', '--name-status', '-M', '-z', mergeBase];
  if (!worktree) diffArgs.push('HEAD');
  const parts = git(diffArgs, root).split('\0').filter((x) => x !== '');
  const changes = [];
  for (let k = 0; k < parts.length;) {
    const status = parts[k++];
    if (/^[RC]/.test(status)) {
      const from = parts[k++];
      const to = parts[k++];
      changes.push({ status: status[0], path: to, oldPath: from, renamedFrom: from });
    } else {
      changes.push({ status: status[0], path: parts[k++] });
    }
  }
  if (worktree) {
    const untracked = git(['ls-files', '--others', '--exclude-standard', '-z'], root)
      .split('\0').filter(Boolean);
    for (const p of untracked) changes.push({ status: 'A', path: p });
  }
  const readNew = (p) => {
    if (worktree) {
      const abs = path.join(root, p);
      return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
    }
    return gitShow(root, 'HEAD', p);
  };
  for (const ch of changes) {
    ch.oldSrc = ch.status === 'A' ? null : gitShow(root, mergeBase, ch.oldPath || ch.path);
    ch.newSrc = ch.status === 'D' ? null : readNew(ch.path);
  }
  return { mergeBase, changes };
}

// ---------------------------------------------------------------------------
// extract — a UI-szerződés
// ---------------------------------------------------------------------------
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function templateIdentifiers(tpl) {
  const exprs = [];
  const push = (re) => {
    let m;
    while ((m = re.exec(tpl))) exprs.push(m[1]);
  };
  push(/\{\{([\s\S]*?)\}\}/g);
  push(/\s[[(][^\]=)]*[\])]\s*=\s*"([^"]*)"/g);
  push(/\s\*\w+\s*=\s*"([^"]*)"/g);
  push(/@(?:if|else if|for|switch|case|defer)\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)/g);
  push(/@let\s+[\w$]+\s*=\s*([^;]*);/g);
  const ids = new Set();
  for (const ex of exprs) {
    const re = /(^|[^.\w$])([A-Za-z_$][\w$]*)/g;
    let m;
    while ((m = re.exec(ex))) ids.add(m[2]);
  }
  return ids;
}

function parseRoutes(appDir) {
  const routes = [];
  for (const f of walk(appDir).filter((x) => /\.routes\.ts$/.test(x))) {
    const src = normalizeEol(fs.readFileSync(f, 'utf8'));
    const nocom = scan(src).nocom;
    const re = /\{\s*path\s*:\s*(['"`])(.*?)\1([^{}]*)\}/g;
    let m;
    while ((m = re.exec(nocom))) {
      const rest = m[3];
      const comp = /component\s*:\s*([\w$]+)/.exec(rest);
      const lazy = /loadComponent\s*:[\s\S]*?\.then\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\.([\w$]+)/.exec(rest);
      const redirect = /redirectTo\s*:\s*(['"`])(.*?)\1/.exec(rest);
      routes.push({
        path: `/${m[2]}`,
        component: comp ? comp[1] : lazy ? lazy[1] : null,
        redirectTo: redirect ? `/${redirect[2]}` : null,
        file: f,
      });
    }
  }
  return routes;
}

function parseBackend(backendDir) {
  const endpoints = [];
  if (!backendDir || !fs.existsSync(backendDir)) return endpoints;
  for (const f of walk(backendDir).filter((x) => /Controller\.java$/.test(x))) {
    const src = scan(normalizeEol(fs.readFileSync(f, 'utf8'))).nocom;
    const classIdx = src.search(/\bclass\s+\w+/);
    if (classIdx < 0) continue;
    const head = src.slice(0, classIdx);
    const cls = /\bclass\s+(\w+)/.exec(src.slice(classIdx))[1];
    const firstStr = (args) => {
      const sm = /"([^"]*)"/.exec(args || '');
      return sm ? sm[1] : '';
    };
    const cm = /@RequestMapping\s*\(([^)]*)\)/.exec(head);
    const prefix = cm ? firstStr(cm[1]) : '';
    const body = src.slice(classIdx);
    const re = /@(Get|Post|Put|Patch|Delete|Request)Mapping\s*(?:\(([^)]*)\))?/g;
    let m;
    while ((m = re.exec(body))) {
      let verb = m[1].toUpperCase();
      if (verb === 'REQUEST') {
        const vm = /RequestMethod\.(\w+)/.exec(m[2] || '');
        verb = vm ? vm[1] : 'ANY';
      }
      const after = body.slice(re.lastIndex);
      const nm = /\b(?:public|protected|private)\b[^;{(]*?\b(\w+)\s*\(/.exec(after);
      endpoints.push({
        verb,
        path: `${prefix}${firstStr(m[2])}` || '/',
        handler: `${cls}.${nm ? nm[1] : '?'}`,
        file: f,
      });
    }
  }
  return endpoints;
}

function parseTokens(tokensFile) {
  if (!tokensFile || !fs.existsSync(tokensFile)) return [];
  const out = [];
  for (const line of normalizeEol(fs.readFileSync(tokensFile, 'utf8')).split('\n')) {
    const m = /^\s*(\$[\w-]+|--[\w-]+)\s*:\s*([^;]+);/.exec(line);
    if (m) out.push({ name: m[1], value: m[2].trim() });
  }
  return out;
}

function extract(opts) {
  const appDir = opts.appDir;
  if (!fs.existsSync(appDir)) die(`nincs ilyen --app-dir: ${appDir}`);
  const files = walk(appDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));
  const components = [];
  const services = [];
  const logic = [];
  for (const f of files) {
    const raw = fs.readFileSync(f, 'utf8');
    const parsed = parseTs(raw);
    const rel = path.relative(appDir, f).replace(/\\/g, '/');
    if (parsed.kind === 'component') {
      let tpl = '';
      let tplRef = null;
      if (parsed.meta.templateUrl) {
        tplRef = stripQuotes(parsed.meta.templateUrl.raw);
        const abs = path.join(path.dirname(f), tplRef);
        if (fs.existsSync(abs)) tpl = fs.readFileSync(abs, 'utf8');
      } else if (parsed.meta.template) {
        tplRef = '(inline)';
        tpl = stripQuotes(parsed.meta.template.raw);
      }
      const used = templateIdentifiers(tpl);
      const children = [...new Set([...tpl.matchAll(/<([a-z][\w]*-[\w-]+)/g)].map((m) => m[1]))];
      components.push({
        className: parsed.className,
        selector: parsed.meta.selector ? stripQuotes(parsed.meta.selector.raw) : null,
        file: rel,
        template: tplRef,
        templateLines: tpl ? normalizeEol(tpl).split('\n').length : 0,
        children,
        deps: parsed.members.flatMap((mb) => mb.deps),
        members: parsed.members.map((mb) => ({
          kind: mb.kind,
          name: mb.name,
          visibility: mb.visibility,
          tags: mb.tags,
          signature: mb.signature,
          usedInTemplate: used.has(mb.name),
        })),
      });
    } else if (parsed.kind === 'injectable') {
      const nocom = scan(normalizeEol(raw)).nocom;
      const http = [];
      const re = /\bhttp\s*\.\s*(get|post|put|patch|delete|request)\s*(?:<[\s\S]*?>)?\s*\(\s*([^,)]*)/g;
      let m;
      while ((m = re.exec(nocom))) http.push({ verb: m[1].toUpperCase(), url: stripQuotes(collapse(m[2])).slice(0, 120) });
      services.push({
        className: parsed.className,
        file: rel,
        deps: parsed.members.flatMap((mb) => mb.deps),
        methods: parsed.members
          .filter((mb) => mb.visibility === 'public' && (mb.kind === 'method' || mb.kind === 'getter'))
          .map((mb) => mb.signature),
        http,
      });
    } else {
      const exportsList = [...normalizeEol(raw).matchAll(/export\s+(?:abstract\s+)?(?:function|const|class|interface|type|enum)\s+([\w$]+)/g)].map((m) => m[1]);
      if (exportsList.length) logic.push({ file: rel, exports: exportsList });
    }
  }
  components.sort((x, y) => x.file.localeCompare(y.file));
  services.sort((x, y) => x.file.localeCompare(y.file));
  logic.sort((x, y) => x.file.localeCompare(y.file));
  const routes = parseRoutes(appDir).map((r) => ({
    ...r,
    file: path.relative(appDir, r.file).replace(/\\/g, '/'),
  }));
  const endpoints = parseBackend(opts.backendDir);
  const tokens = parseTokens(opts.tokens);
  let result = { appDir, routes, components, services, logic, endpoints, tokens };
  if (opts.only) {
    const q = opts.only.toLowerCase();
    const hit = (s) => (s || '').toLowerCase().includes(q);
    result = {
      ...result,
      routes: routes.filter((r) => hit(r.path) || hit(r.component)),
      components: components.filter((c) => hit(c.className) || hit(c.file) || hit(c.selector)),
      services: services.filter((s) => hit(s.className) || hit(s.file)),
      logic: logic.filter((l) => hit(l.file)),
    };
  }
  return result;
}

function extractToMarkdown(c) {
  const L = [];
  L.push('# UI-szerződés (ui-contract.js extract)');
  L.push('');
  L.push(`Forrás: \`${c.appDir}\` — ${c.routes.length} útvonal, ${c.components.length} komponens, ` +
    `${c.services.length} service, ${c.endpoints.length} backend-végpont, ${c.tokens.length} design-token.`);
  L.push('');
  L.push('Jelölés: ✓ = a jelenlegi sablon használja · `in`/`out` = @Input/@Output · ' +
    '`inject` = service-függés. Ami itt publikus tagként szerepel, arra egy új sablon ' +
    '**TS-módosítás nélkül** (T0) építhet.');
  L.push('');
  L.push('## Útvonalak');
  L.push('');
  L.push('| Útvonal | Komponens / átirányítás |');
  L.push('|---|---|');
  for (const r of c.routes) L.push(`| \`${r.path}\` | ${r.component ? `\`${r.component}\`` : `→ \`${r.redirectTo}\``} |`);
  L.push('');
  L.push('## Komponensek');
  for (const comp of c.components) {
    L.push('');
    L.push(`### ${comp.className} — \`${comp.selector || '?'}\``);
    L.push(`- Fájl: \`${comp.file}\` · sablon: ${comp.template ? `\`${comp.template}\` (${comp.templateLines} sor)` : '—'}`);
    if (comp.deps.length) L.push(`- Függőségek: ${comp.deps.map((d) => `\`${d}\``).join(', ')}`);
    if (comp.children.length) L.push(`- Gyerek-elemek a sablonban: ${comp.children.map((d) => `\`${d}\``).join(', ')}`);
    const pub = comp.members.filter((mb) => mb.visibility !== 'private' && !mb.tags.includes('inject'));
    const hidden = comp.members.length - pub.length;
    L.push(`- Publikus felület (${pub.length} tag${hidden ? `, + ${hidden} privát/inject` : ''}):`);
    for (const mb of pub) {
      const tagStr = mb.tags.filter((t) => t !== 'inject').map((t) => (t === 'input' ? 'in' : t === 'output' ? 'out' : t));
      L.push(`  - ${mb.usedInTemplate ? '✓' : '·'} \`${mb.signature}\`${tagStr.length ? ` _(${tagStr.join(', ')})_` : ''}`);
    }
  }
  L.push('');
  L.push('## Service-ek és HTTP-hívások');
  for (const s of c.services) {
    L.push('');
    L.push(`### ${s.className} — \`${s.file}\``);
    for (const h of s.http) L.push(`- HTTP ${h.verb} \`${h.url}\``);
    for (const m of s.methods) L.push(`- \`${m}\``);
  }
  if (c.logic.length) {
    L.push('');
    L.push('## Egyéb TS-logika (érintése T2)');
    L.push('');
    for (const l of c.logic) L.push(`- \`${l.file}\`: ${l.exports.join(', ')}`);
  }
  if (c.endpoints.length) {
    L.push('');
    L.push('## Backend-végpontok (érintésük T3)');
    L.push('');
    L.push('| Ige | Útvonal | Kezelő |');
    L.push('|---|---|---|');
    for (const e of c.endpoints) L.push(`| ${e.verb} | \`${e.path}\` | \`${e.handler}\` |`);
  }
  if (c.tokens.length) {
    L.push('');
    L.push('## Design-tokenek');
    L.push('');
    for (const t of c.tokens) L.push(`- \`${t.name}\`: \`${t.value}\``);
  }
  L.push('');
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const out = { _: [] };
  for (let k = 0; k < argv.length; k++) {
    const a = argv[k];
    if (a.startsWith('--')) {
      const key = a.slice(2).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      const next = argv[k + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else {
        out[key] = next;
        k++;
      }
    } else out._.push(a);
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  if (cmd === 'extract') {
    if (!args.appDir) die('extract: kötelező a --app-dir');
    const res = extract({ appDir: args.appDir, backendDir: args.backendDir, tokens: args.tokens, only: args.only });
    process.stdout.write(args.format === 'json' ? `${JSON.stringify(res, null, 2)}\n` : extractToMarkdown(res));
    return;
  }
  if (cmd === 'classify') {
    if (!args.path) die('classify: kötelező a --path');
    const read = (f) => (f && f !== true && fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);
    const oldSrc = read(args.old);
    const newSrc = read(args.new);
    if (oldSrc == null && newSrc == null) die('classify: legalább az egyik --old/--new fájl kell');
    const res = classifyChange(
      { path: args.path, status: oldSrc == null ? 'A' : newSrc == null ? 'D' : 'M', oldSrc, newSrc },
      { frontendDir: args.frontendDir || 'frontend', backendDir: args.backendDir || 'backend' },
    );
    process.stdout.write(`${JSON.stringify({ ...res, tier: res.tier == null ? null : TIERS[res.tier] })}\n`);
    return;
  }
  if (cmd === 'check-budget') {
    const budget = args.budget;
    if (!(budget in BUDGETS)) die(`check-budget: ismeretlen --budget "${budget}" (template-only|thin-ts|logic|free)`);
    let root;
    try {
      root = git(['rev-parse', '--show-toplevel'], process.cwd()).trim();
    } catch (e) {
      die('check-budget: nem git-munkakönyvtárban fut');
    }
    const baseRef = args.base || process.env.UI_CONTRACT_BASE || 'origin/master';
    const { mergeBase, changes } = collectChanges(root, baseRef, Boolean(args.worktree));
    const opts = { frontendDir: args.frontendDir || 'frontend', backendDir: args.backendDir || 'backend' };
    const results = changes.map((ch) => classifyChange(ch, opts));
    const relevant = results.filter((r) => r.tier != null);
    const maxTier = relevant.length ? Math.max(...relevant.map((r) => r.tier)) : -1;
    const allowed = BUDGETS[budget];
    const ok = maxTier <= allowed;
    if (args.format === 'json') {
      process.stdout.write(`${JSON.stringify({
        budget, allowedTier: TIERS[allowed], base: baseRef, mergeBase,
        maxTier: maxTier < 0 ? null : TIERS[maxTier], ok,
        files: relevant.map((r) => ({ ...r, tier: TIERS[r.tier], reasons: r.reasons.map((x) => ({ tier: TIERS[x.tier], msg: x.msg })) })),
      }, null, 2)}\n`);
    } else {
      const L = [];
      L.push(`UI-változási keret: ${budget} (megengedett: ${TIERS[allowed]} — ${TIER_LABEL[TIERS[allowed]]}-ig)`);
      L.push(`Bázis: ${baseRef} (merge-base ${mergeBase.slice(0, 10)})${args.worktree ? ' · working tree-vel' : ''}`);
      if (!relevant.length) L.push('Nincs frontend-/backend-változás.');
      for (const r of relevant.sort((x, y) => y.tier - x.tier || x.path.localeCompare(y.path))) {
        const top = r.reasons.filter((x) => x.tier === r.tier).map((x) => x.msg);
        const mark = r.tier > allowed ? '✗' : ' ';
        L.push(`${mark} ${TIERS[r.tier]} ${r.status} ${r.path} — ${[...new Set(top)].join('; ')}${r.flag === 'test' ? ' (⚠ teszt módosult: ellenőrizd, hogy nem gyengült-e)' : ''}`);
      }
      L.push(maxTier < 0
        ? 'Eredmény: kereten belül (nincs érintett fájl).'
        : `Eredmény: legmagasabb szint ${TIERS[maxTier]} (${TIER_LABEL[TIERS[maxTier]]}) → ${ok ? 'KERETEN BELÜL' : 'KERETEN KÍVÜL'}`);
      process.stdout.write(`${L.join('\n')}\n`);
    }
    process.exit(ok ? 0 : 1);
  }
  die('használat: ui-contract.js extract|check-budget|classify [opciók] — lásd a fájl fejlécét');
}

if (require.main === module) main();

module.exports = { scan, parseTs, compareTs, classifyChange, extract, templateIdentifiers, BUDGETS, TIERS };
