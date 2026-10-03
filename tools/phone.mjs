// Can this be climbed with a thumb?
//
// Two touch schemes have shipped and both made the game uncompletable, in opposite directions —
// the first let you jump but never walk, the second let you walk but never LEAN, and measured
// against the real physics zero of the seventy-six route steps are makeable with no lean. So the
// question this asks is not "does a tap do something" but "can the input scheme produce the state
// a jump needs": a charge, and a lean, at the same time.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const T = { '.html': 'text/html', '.mjs': 'text/javascript' };
const srv = createServer((q, s) => {
  let p = join(ROOT, decodeURI(q.url.split('?')[0]));
  try { if (statSync(p).isDirectory()) p = join(p, 'index.html'); } catch {}
  if (!existsSync(p)) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'Content-Type': T[extname(p)] || 'application/octet-stream' });
  s.end(readFileSync(p));
});
await new Promise((r) => srv.listen(0, r));

const br = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
                                  isMobile: true, hasTouch: true });
const pg = await ctx.newPage();
const errs = [];
pg.on('pageerror', (e) => errs.push(e.message));
await pg.goto(`http://127.0.0.1:${srv.address().port}/?dev`, { waitUntil: 'load' });
await pg.waitForTimeout(700);
await pg.touchscreen.tap(195, 400);
await pg.waitForTimeout(500);

const box = await pg.locator('#screen').boundingBox();
const pt = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });

/** press, hold, read the state at full charge, release, read the jump */
async function attempt(label, pts, ms = 700) {
  await pg.evaluate(({ pts }) => {
    const c = document.getElementById('screen');
    pts.forEach((p, i) => c.dispatchEvent(new PointerEvent('pointerdown', {
      clientX: p.x, clientY: p.y, bubbles: true, pointerId: i + 1,
      pointerType: 'touch', isPrimary: i === 0, buttons: 1 })));
  }, { pts });
  await pg.waitForTimeout(ms);
  const wound = await pg.evaluate(() => {
    const s = window.__farlight.state;
    return { charge: s.p.charge, lean: s.p.lean, charging: s.p.charging };
  });
  await pg.evaluate(({ pts }) => {
    const c = document.getElementById('screen');
    pts.forEach((p, i) => c.dispatchEvent(new PointerEvent('pointerup', {
      clientX: p.x, clientY: p.y, bubbles: true, pointerId: i + 1, pointerType: 'touch' })));
  }, { pts });
  await pg.waitForTimeout(120);
  const fired = await pg.evaluate(() => {
    const s = window.__farlight.state;
    return { vx: Math.round(s.p.vx), vy: Math.round(s.p.vy), jumps: s.jumps };
  });
  console.log(`${label.padEnd(34)} at full charge ${JSON.stringify(wound)}  ->  ${JSON.stringify(fired)}` +
              (Math.abs(fired.vx) > 4 ? '   leaned' : '   DEAD VERTICAL'));
  await pg.waitForTimeout(1400);
  return Math.abs(fired.vx) > 4;
}

const leaned = [];
leaned.push(await attempt('one thumb, bottom-left pad', [pt(0.15, 0.9)]));
leaned.push(await attempt('one thumb, bottom-right pad', [pt(0.85, 0.9)]));
leaned.push(await attempt('two fingers: middle + right', [pt(0.5, 0.5), pt(0.9, 0.9)]));
const centre = await attempt('one thumb, dead centre', [pt(0.5, 0.5)]);

console.log(`\n${leaned.filter(Boolean).length} of 3 lean attempts produced horizontal velocity` +
            (centre ? '  *** the centre leans too, which it should not ***' : '; the centre stays vertical, as it should'));
console.log(errs.length ? errs.join('\n') : 'no page errors');
await br.close(); srv.close();
process.exit(leaned.every(Boolean) && !centre ? 0 : 1);
