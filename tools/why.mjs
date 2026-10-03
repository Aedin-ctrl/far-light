import { PLATFORMS, SW, WALL } from '../src/level.mjs';
import { RULES, newGame, step } from '../src/sim.mjs';

const srcY = Number(process.argv[2] || 1055);
const src = PLATFORMS.find((b) => b.y === srcY && b.x === Number(process.argv[3] || 55));
console.log('source', JSON.stringify(src));
console.log('ledges within 70px above/below and anywhere across:');
for (const b of PLATFORMS.filter((b) => Math.abs(b.y - src.y) < 80).sort((a, b) => a.y - b.y)) {
  console.log(`   x ${String(b.x).padStart(3)}..${String(b.x + b.w).padStart(3)}  y ${b.y}` +
    `  ${b === src ? '<- source' : (b.y < src.y ? `(${src.y - b.y}px up)` : `(${b.y - src.y}px down)`)}`);
}

function fly(fromX, charge, lean) {
  const s = newGame();
  s.p.x = fromX; s.p.y = src.y - RULES.body.h; s.p.vx = 0; s.p.vy = 0;
  s.p.onGround = true;
  for (let i = 0; i < charge; i++) step(s, { left: lean < 0, right: lean > 0, hold: true });
  step(s, { left: lean < 0, right: lean > 0, hold: false });
  let maxUp = 0, bonked = false, bounced = false;
  for (let i = 0; i < 400; i++) {
    step(s, {});
    maxUp = Math.max(maxUp, src.y - s.p.y);
    for (const e of s.events) { if (e.type === 'bonk') bonked = true; if (e.type === 'bounce') bounced = true; }
    s.events.length = 0;
    if (s.p.onGround) return { x: s.p.x, y: s.p.y, maxUp, bonked, bounced };
  }
  return null;
}

const results = new Map();
for (let spot = 0; spot < 9; spot++) {
  const x = src.x + 1 + ((src.w - RULES.body.w - 2) * spot) / 8;
  for (let c = 1; c <= 14; c++) {
    const r = fly(x, Math.round((RULES.charge * c) / 14), 1);
    if (!r) continue;
    const key = `land y ${Math.round(r.y + RULES.body.h)} x ${Math.round(r.x)}${r.bonked ? ' BONKED' : ''}${r.bounced ? ' bounced' : ''}`;
    results.set(key, (results.get(key) || 0) + 1);
  }
}
console.log('\njumping RIGHT, all stances and charges:');
for (const [k, n] of [...results].sort()) console.log(`  x${n}  ${k}`);
