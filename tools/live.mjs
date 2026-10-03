import { chromium } from 'playwright-core';
const url = process.argv[2];
const br = await chromium.launch({ channel: 'chrome', headless: true });
const pg = await br.newPage({ viewport: { width: 1100, height: 760 } });
const errs = [];
pg.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
pg.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
pg.on('requestfailed', r => errs.push('FAILED: ' + r.url()));
await pg.goto(url, { waitUntil: 'load' });
await pg.waitForTimeout(1200);
await pg.keyboard.press('Space');
await pg.waitForTimeout(600);
for (let i = 0; i < 4; i++) {
  await pg.keyboard.down('ArrowRight'); await pg.keyboard.down('Space');
  await pg.waitForTimeout(400);
  await pg.keyboard.up('Space'); await pg.keyboard.up('ArrowRight');
  await pg.waitForTimeout(800);
}
const info = await pg.evaluate(() => {
  const c = document.getElementById('screen');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const cols = new Set();
  for (let i = 0; i < d.length; i += 4) cols.add((d[i] << 16) | (d[i+1] << 8) | d[i+2]);
  return { w: c.width, h: c.height, colours: cols.size };
});
console.log(url, JSON.stringify(info));
console.log(errs.length ? errs.slice(0, 6).join('\n') : 'no errors on the live page');
await br.close();
