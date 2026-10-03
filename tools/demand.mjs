// How much does the climb actually ask of the one verb?
//
// If a full charge wins almost every step, the wind-up is decoration. This measures, for each step
// of the route, whether a maximum charge makes it and how wide the usable charge window is.
import { newGame, step, RULES } from '../src/sim.mjs';
import { PLATFORMS } from '../src/level.mjs';

const ROUTE = PLATFORMS.filter((b) => b.spine).sort((a, b) => b.y - a.y);
const onLedge = (p, b) => Math.abs(p.y + RULES.body.h - b.y) < 3 &&
  p.x + RULES.body.w > b.x && p.x < b.x + b.w;

function lands(a, b, chargeTicks, lean, frac) {
  const s = newGame();
  s.p.x = a.x + 1 + Math.max(0, a.w - RULES.body.w - 2) * frac;
  s.p.y = a.y - RULES.body.h;
  s.p.vx = 0; s.p.vy = 0; s.p.onGround = true;
  s.p.charging = true; s.p.charge = chargeTicks; s.p.lean = lean;
  step(s, { hold: false, left: lean < 0, right: lean > 0 });
  for (let i = 0; i < 170; i++) {
    step(s, {}); s.events.length = 0;
    if (s.p.onGround) return onLedge(s.p, b);
  }
  return false;
}

let fullWins = 0, total = 0;
const windows = [];
for (let i = 1; i < ROUTE.length; i++) {
  const a = ROUTE[i - 1], b = ROUTE[i];
  total++;
  let full = false;
  for (let f = 0; f <= 4 && !full; f++) {
    for (const lean of [1, -1, 0]) if (lands(a, b, RULES.charge, lean, f / 4)) { full = true; break; }
  }
  if (full) fullWins++;

  // the widest run of consecutive charge ticks that works, over all stances and leans
  let best = 0;
  for (let f = 0; f <= 4; f++) {
    for (const lean of [1, -1, 0]) {
      let run = 0;
      for (let c = 2; c <= RULES.charge; c++) {
        if (lands(a, b, c, lean, f / 4)) { run++; best = Math.max(best, run); } else run = 0;
      }
    }
  }
  windows.push(best);
}
windows.sort((x, y) => x - y);
const pct = (n) => ((n / total) * 100).toFixed(0) + '%';
console.log(`${total} steps on the route`);
console.log(`  a FULL charge makes          ${fullWins} of them  (${pct(fullWins)})`);
console.log(`  usable charge window: min ${windows[0]} ticks, median ${windows[windows.length >> 1]}, max ${windows[windows.length - 1]}`);
console.log(`  steps needing a window of 8 ticks or less: ${windows.filter((w) => w <= 8).length}`);
