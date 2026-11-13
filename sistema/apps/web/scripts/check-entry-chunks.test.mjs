// scripts/check-entry-chunks.mjs on tiny fake builds: the charts chunk must stay out of the first load
// (index.html's references and the static imports of its modules), whatever the base of the URLs.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkEntryChunks } from './check-entry-chunks.mjs';

const dirs = [];

/** A fake build: `files` maps "assets/x.js" to its code; `head` is what goes in index.html's head. */
function build(head, files) {
  const dir = mkdtempSync(join(tmpdir(), 'entry-chunks-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), `<!doctype html><html><head>${head}</head><body></body></html>`);
  for (const [name, code] of Object.entries(files)) writeFileSync(join(dir, name), code);
  return dir;
}

const CHARTS = { 'assets/charts-Ab12_x.js': 'export const chart=1;' };

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('checkEntryChunks', () => {
  it('passes when the charts chunk is only imported on demand, and sums the first load', () => {
    const dir = build('<script type="module" crossorigin src="/assets/index-1.js"></script><link rel="modulepreload" crossorigin href="/assets/react-1.js"><link rel="stylesheet" href="/assets/index-1.css">', {
      'assets/index-1.js': 'import{a as e}from"./react-1.js";const p=()=>import("./charts-Ab12_x.js");e(p);',
      'assets/react-1.js': 'export const a=1;',
      'assets/index-1.css': 'body{color:red}',
      ...CHARTS,
    });
    const result = checkEntryChunks(dir);
    expect(result.problems).toEqual([]);
    expect(result.files.sort()).toEqual(['assets/index-1.css', 'assets/index-1.js', 'assets/react-1.js']);
    expect(result.js.raw).toBeGreaterThan(0);
    expect(result.css.gzip).toBeGreaterThan(0);
  });

  it('fails when index.html preloads the charts chunk', () => {
    const dir = build('<script type="module" src="/assets/index-1.js"></script><link rel="modulepreload" href="/assets/charts-Ab12_x.js">', {
      'assets/index-1.js': 'console.log(1);',
      ...CHARTS,
    });
    expect(checkEntryChunks(dir).problems).toEqual(['the first load includes assets/charts-Ab12_x.js (index.html -> assets/charts-Ab12_x.js)']);
  });

  it('follows static imports without modulepreload links and says who pulled the chunk in', () => {
    const dir = build('<script type="module" src="./assets/index-1.js"></script>', {
      'assets/index-1.js': 'import"./vendor-1.js";export*from"./utils-1.js";',
      'assets/vendor-1.js': 'console.log(2);',
      'assets/utils-1.js': 'import{chart as c}from"./charts-Ab12_x.js";export const u=c;',
      ...CHARTS,
    });
    expect(checkEntryChunks(dir).problems).toEqual([
      'the first load includes assets/charts-Ab12_x.js (index.html -> assets/index-1.js -> assets/utils-1.js -> assets/charts-Ab12_x.js)',
    ]);
  });

  it('fails when there is no charts chunk at all (the group was renamed)', () => {
    const dir = build('<script type="module" src="/assets/index-1.js"></script>', { 'assets/index-1.js': 'console.log(1);' });
    expect(checkEntryChunks(dir).problems).toEqual([expect.stringContaining('no charts-*.js in assets/')]);
  });

  it('fails without a build', () => {
    expect(checkEntryChunks(join(tmpdir(), 'no-such-build-dir')).problems).toEqual([expect.stringContaining('index.html not found')]);
  });
});
