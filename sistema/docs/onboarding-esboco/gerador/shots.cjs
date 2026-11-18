// node shots.cjs a|b [only=3,5]  -> prints em shots/onboarding-v2
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const v = process.argv[2];
const only = (process.argv[3] || '').split(',').filter(Boolean).map(Number);
const SRC = 'file://' + path.join(__dirname, `../onboarding/slides-${v}.html`);
const OUT = path.join(__dirname, '../shots/onboarding-v2');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })).newPage();
  await p.goto(SRC); await p.evaluate(() => document.fonts.ready);
  // checagem de transbordo: elementos que passam da borda do slide
  const issues = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('.slide').forEach((s, i) => {
      const r = s.getBoundingClientRect();
      s.querySelectorAll('*').forEach((e) => {
        if (e.closest('svg') && e.tagName !== 'svg') return;
        const q = e.getBoundingClientRect();
        if (!q.width) return;
        if (q.bottom > r.bottom - 30 || q.right > r.right + 1 || e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow === 'visible' && e.children.length === 0)
          if (!e.matches('.art,.art *,.band,.left,.s1 .l,.chev')) out.push(`s${i + 1} ${e.tagName}.${e.className.baseVal ?? e.className} b=${Math.round(q.bottom - r.top)} r=${Math.round(q.right)}`);
      });
    });
    return out;
  });
  console.log(issues.slice(0, 30).join('\n') || 'sem transbordo');
  const els = await p.$$('.slide');
  for (let i = 0; i < els.length; i++) {
    if (only.length && !only.includes(i + 1)) continue;
    await els[i].screenshot({ path: `${OUT}/${v}-${String(i + 1).padStart(2, '0')}.png` });
  }
  if (!only.length) {
    const imgs = els.map((_, i) => `<img src="file://${OUT}/${v}-${String(i + 1).padStart(2, '0')}.png">`).join('');
    await p.setContent(`<style>body{margin:0;background:#cfd2d8;padding:24px;display:grid;grid-template-columns:repeat(4,1fr);gap:20px;width:1920px;box-sizing:border-box}img{width:100%;display:block;box-shadow:0 1px 3px rgba(0,0,0,.2)}</style>${imgs}`);
    await p.waitForLoadState('load');
    await p.screenshot({ path: `${OUT}/${v}-todos.png`, fullPage: true });
    const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
    await m.goto(SRC); await m.evaluate(() => document.fonts.ready);
    const ov = await m.evaluate(() => document.documentElement.scrollWidth);
    console.log('celular scrollWidth', ov);
    await m.screenshot({ path: `${OUT}/${v}-celular.png`, clip: { x: 0, y: 0, width: 390, height: 2400 }, fullPage: true });
  }
  await b.close();
})();
