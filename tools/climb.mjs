// Walks the proven route step by step and reports exactly where a button-pressing player stalls.
import { newGame, step, RULES, TPS } from '../src/sim.mjs';
import { PLATFORMS } from '../src/level.mjs';

const ROUTE = PLATFORMS.filter((b) => b.spine);
const onLedge = (p, b) => Math.abs(p.y + RULES.body.h - b.y) < 3 &&
  p.x + RULES.body.w > b.x && p.x < b.x + b.w;

/** From a REAL standing position on `a`, is there a jump that lands on `b`? */
function solve(state, a, b) {
  for (let fi = 0; fi <= 8; fi++) {
    const frac = fi / 8;
    const stance = a.x + 1 + Math.max(0, a.w - RULES.body.w - 2) * frac;
    for (let c = 2; c <= 14; c++) {
      for (const lean of [1, -1, 0]) {
        const s = newGame();
        s.p.x = stance; s.p.y = a.y - RULES.body.h;
        s.p.vx = 0; s.p.vy = 0; s.p.onGround = true;
        s.p.charging = true; s.p.charge = Math.round(RULES.charge * c / 14); s.p.lean = lean;
        step(s, { hold: false, left: lean < 0, right: lean > 0 });
        for (let i = 0; i < 170; i++) {
          step(s, {}); s.events.length = 0;
          if (s.p.onGround) { if (onLedge(s.p, b)) return { frac, charge: c / 14, lean }; break; }
        }
      }
    }
  }
  return null;
}

// walk the whole route, actually playing it
const state = newGame();
let at = 0, stalled = null, ticks = 0;
while (at < ROUTE.length - 1) {
  const a = ROUTE[at], b = ROUTE[at + 1];
  const plan = solve(state, a, b);
  if (!plan) { stalled = { at, a, b, why: 'no jump from any stance' }; break; }

  // put the climber exactly where the plan wants them and play the jump for real
  state.p.x = a.x + 1 + Math.max(0, a.w - RULES.body.w - 2) * plan.frac;
  state.p.y = a.y - RULES.body.h;
  state.p.vx = 0; state.p.vy = 0; state.p.onGround = true;
  state.p.charging = false; state.p.charge = 0;

  const want = Math.round(RULES.charge * plan.charge);
  for (let i = 0; i < want; i++) { step(state, { hold: true, left: plan.lean < 0, right: plan.lean > 0 }); ticks++; }
  step(state, { hold: false, left: plan.lean < 0, right: plan.lean > 0 }); ticks++;
  let landedOn = -1;
  for (let i = 0; i < 180; i++) {
    step(state, {}); state.events.length = 0; ticks++;
    if (state.p.onGround) { landedOn = ROUTE.findIndex((r) => onLedge(state.p, r)); break; }
  }
  if (landedOn !== at + 1) { stalled = { at, a, b, why: `landed on route index ${landedOn}` }; break; }
  at++;
  if (state.over) break;
}

console.log(`climbed ${at} of ${ROUTE.length - 1} steps in ${(ticks / TPS).toFixed(1)}s of play`);
if (stalled) {
  console.log(`stalled at step ${stalled.at}: ${stalled.why}`);
  console.log(`  from x ${stalled.a.x} y ${stalled.a.y} w ${stalled.a.w}`);
  console.log(`  to   x ${stalled.b.x} y ${stalled.b.y} w ${stalled.b.w}` +
              `  (${stalled.a.y - stalled.b.y}px up, ${stalled.b.x - stalled.a.x}px across)`);
} else {
  console.log(state.over === 'win' ? 'reached the lamp — the climb completes' : 'reached the top ledge');
}
