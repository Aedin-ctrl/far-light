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
const br = await chromium.launch({ channel:'chrome', headless:true });
const pg = await br.newPage({ viewport:{ width:1100, height:760 } });
const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
pg.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await pg.goto(`http://127.0.0.1:${srv.address().port}/?dev`, { waitUntil:'load' });
await pg.waitForTimeout(700);
await pg.keyboard.press('Space');
await pg.waitForTimeout(500);
// stand on the lamp ledge
await pg.evaluate(() => {
  const s = window.__farlight.state;
  const top = [...document.querySelectorAll('x')]; // noop
});
await pg.evaluate(async () => {
  const m = await import('./src/level.mjs');
  const s = window.__farlight.state;
  s.p.x = m.TOP.x + 10; s.p.y = m.TOP.y - 12; s.p.vx = 0; s.p.vy = 0; s.p.onGround = true;
});
await pg.waitForTimeout(1400);
await pg.screenshot({ path:'out/win.png' });
console.log(await pg.evaluate(()=>window.__farlight.state.over), errs.length?errs.join('|'):'no errors');
await br.close(); srv.close();
