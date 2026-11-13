#!/usr/bin/env node
// Fails when the first load of a web build includes the charts chunk: recharts belongs only to the
// pages with charts, never to the login, the site or Início (see the groups in vite.config.ts).
// The first load is what index.html references (entry module, modulepreloads, stylesheets) plus the
// static imports of those modules, followed transitively (dynamic `import()` is on demand).
//
//   pnpm --filter @effinance/web check:entry             # checks dist/ (after `build`)
//   pnpm --filter @effinance/web check:entry dist-demo   # checks the demo build
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

/** File name of the charts chunk (the `charts` group of vite.config.ts). */
export const CHARTS_CHUNK = /^charts-[\w-]+\.js$/;

const TAG = /<(script|link)\b([^>]*)>/gi;
const ATTR = /([\w:-]+)\s*=\s*"([^"]*)"/g;
// `import{a as b}from"./x.js"`, `import"./x.js"`, `export*from"./x.js"`: static only (`import(` has no quote next).
const STATIC_IMPORT = /(?:^|[;}\n])\s*(?:import|export)\s*(?:[\w$*{}\s,]*?\s*from\s*)?["']([^"']+\.js)["']/g;

function attrs(source) {
  const out = {};
  for (const [, name, value] of source.matchAll(ATTR)) out[name.toLowerCase()] = value;
  return out;
}

/** Path inside the build ("assets/x.js") of a URL of index.html ("/assets/x.js", "./assets/x.js"). */
function distPath(url) {
  if (/^[a-z]+:|^\/\//i.test(url)) return null;
  return posix.normalize(url.replace(/^\.?\//, '')).replace(/^\/+/, '');
}

/**
 * Files of the first load of the build in `distDir`: index.html's references and, transitively, the
 * static imports of its modules. `from` says who pulled each file in (null for index.html).
 */
export function initialFiles(distDir) {
  const html = readFileSync(join(distDir, 'index.html'), 'utf8');
  const from = new Map();
  const queue = [];
  const entries = [];
  const add = (file, parent) => {
    if (!file || from.has(file) || !existsSync(join(distDir, file))) return;
    from.set(file, parent);
    if (file.endsWith('.js')) queue.push(file);
  };
  for (const [, tag, source] of html.matchAll(TAG)) {
    const a = attrs(source);
    if (tag.toLowerCase() === 'script' && a.type === 'module' && a.src) {
      const file = distPath(a.src);
      if (file) entries.push(file);
      add(file, null);
    } else if (tag.toLowerCase() === 'link' && (a.rel === 'modulepreload' || a.rel === 'stylesheet') && a.href) {
      add(distPath(a.href), null);
    }
  }
  while (queue.length) {
    const file = queue.shift();
    const code = readFileSync(join(distDir, file), 'utf8');
    for (const [, spec] of code.matchAll(STATIC_IMPORT)) {
      if (spec.startsWith('.')) add(posix.normalize(posix.join(posix.dirname(file), spec)), file);
    }
  }
  return { entries, from };
}

/** Checks one build directory: `problems` is empty when the charts chunk stays out of the first load. */
export function checkEntryChunks(distDir) {
  const problems = [];
  if (!existsSync(join(distDir, 'index.html'))) {
    return { problems: [`${distDir}/index.html not found: build the web app first`], files: [], js: { raw: 0, gzip: 0 }, css: { raw: 0, gzip: 0 } };
  }
  const { entries, from } = initialFiles(distDir);
  if (entries.length === 0) problems.push('index.html has no <script type="module" src>: is this a Vite build?');
  const assets = existsSync(join(distDir, 'assets')) ? readdirSync(join(distDir, 'assets')) : [];
  if (!assets.some((f) => CHARTS_CHUNK.test(f))) {
    problems.push('no charts-*.js in assets/: the `charts` group of vite.config.ts was renamed or removed (update this check)');
  }
  for (const file of from.keys()) {
    if (!CHARTS_CHUNK.test(posix.basename(file))) continue;
    const chain = [file];
    for (let parent = from.get(file); parent; parent = from.get(parent)) chain.unshift(parent);
    problems.push(`the first load includes ${file} (${['index.html', ...chain].join(' -> ')})`);
  }
  const js = { raw: 0, gzip: 0 };
  const css = { raw: 0, gzip: 0 };
  for (const file of from.keys()) {
    const bytes = readFileSync(join(distDir, file));
    const bucket = file.endsWith('.css') ? css : js;
    bucket.raw += bytes.length;
    bucket.gzip += gzipSync(bytes).length;
  }
  return { problems, files: [...from.keys()], js, css };
}

const kb = (n) => `${(n / 1000).toFixed(1)} kB`;

function main(dirs) {
  const webDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
  let failed = false;
  for (const dir of dirs.length ? dirs : ['dist']) {
    const distDir = resolve(webDir, dir);
    const { problems, files, js, css } = checkEntryChunks(distDir);
    const scripts = files.filter((f) => f.endsWith('.js')).length;
    if (problems.length) {
      failed = true;
      console.error(`✗ ${dir}: charts chunk check failed`);
      for (const p of problems) console.error(`  - ${p}`);
    } else {
      console.log(`✓ ${dir}: first load without the charts chunk`);
    }
    if (files.length) console.log(`  ${scripts} JS files, ${kb(js.raw)} (gzip ${kb(js.gzip)}); CSS ${kb(css.raw)} (gzip ${kb(css.gzip)})`);
  }
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2));
