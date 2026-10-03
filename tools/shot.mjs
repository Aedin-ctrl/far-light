import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;
const T = { '.html':'text/html', '.mjs':'text/javascript' };
const srv = createServer((q,s)=>{ let p=join(ROOT,decodeURI(q.url.split('?')[0]));
  try{ if(statSync(p).isDirectory()) p=join(p,'index.html'); }catch{}
  if(!existsSync(p)){s.writeHead(404);return s.end();}
  s.writeHead(200,{'Content-Type':T[extname(p)]||'application/octet-stream'}); s.end(readFileSync(p)); });
await new Promise(r=>srv.listen(0,r));
const base = `http://127.0.0.1:${srv.address().port}`;
const br = await chromium.launch({ channel:'chrome', headless:true });
const pg = await br.newPage({ viewport:{ width:1100, height:760 } });
const errs = [];
pg.on('pageerror', e=>errs.push('PAGEERROR: '+e.message));
pg.on('console', m=>{ if(m.type()==='error') errs.push('CONSOLE: '+m.text()); });
await pg.goto(base+'/?dev', { waitUntil:'load' });
await pg.waitForTimeout(900);
await pg.screenshot({ path:'out/title.png' });
await pg.keyboard.press('Space');
await pg.waitForTimeout(500);
// wind up and jump a few times
for (let i=0;i<5;i++){
  await pg.keyboard.down('ArrowRight');
  await pg.keyboard.down('Space'); await pg.waitForTimeout(420);
  await pg.keyboard.up('Space'); await pg.keyboard.up('ArrowRight');
  await pg.waitForTimeout(900);
}
await pg.screenshot({ path:'out/play.png' });
for (const s of [4, 8, 11]) {
  await pg.evaluate((n)=>window.__farlight.warp(n), s);
  await pg.waitForTimeout(700);
  await pg.screenshot({ path:`out/screen${s}.png` });
}
const info = await pg.evaluate(()=>{ const s=window.__farlight.state;
  return { tick:s.tick, screen:s.screen, jumps:s.jumps, falls:s.falls,
           x:Math.round(s.p.x), y:Math.round(s.p.y), onGround:s.p.onGround, over:s.over }; });
console.log(JSON.stringify(info));
console.log(errs.length ? errs.slice(0,8).join('\n') : 'no console errors');
await br.close(); srv.close();
