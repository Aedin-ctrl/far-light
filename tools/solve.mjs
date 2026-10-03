// Is the tower actually climbable?
//
//   node tools/solve.mjs
//
// A hand-authored precision platformer is exactly where "impossible" hides. One ledge placed four
// pixels too high and the climb has a ceiling nobody can pass, and no amount of playing the first
// three screens will ever reveal it. Filament had the same class of bug — a beacon further from
// its neighbour than cable could span — and it was invisible until something played the whole
// thing.
//
// So this plays the whole thing. It takes every ledge, fires jumps from across its width at every
// charge and lean the controls can produce, runs each one through the REAL physics from sim.mjs,
// and records where it lands. Repeat to a fixpoint and you have the set of ledges reachable from
// the ground — which either includes the lamp room or the level is broken.

import { PLATFORMS, SCREEN_COUNT, SH, SW, WALL, START, LAMP, screenOf, worldY } from '../src/level.mjs';
import { RULES, newGame, step } from '../src/sim.mjs';

const CHARGES = 14;          // how finely a human can meter the wind-up
const SPOTS = 9;             // stances across the width of a ledge
const LEANS = [-1, 0, 1];
const MAX_FLIGHT = 400;      // ticks before we call a jump lost

/** Fly one jump with the real simulation and report the ledge it ends on. */
function fly(fromX, fromY, charge, lean) {
  const s = newGame();
  s.p.x = fromX;
  s.p.y = fromY;
  s.p.vx = 0; s.p.vy = 0;
  s.p.onGround = true;
  s.p.charging = false;

  // wind up for exactly `charge` ticks, leaning, then release
  for (let i = 0; i < charge; i++) {
    step(s, { left: lean < 0, right: lean > 0, hold: true });
  }
  step(s, { left: lean < 0, right: lean > 0, hold: false });

  for (let i = 0; i < MAX_FLIGHT; i++) {
    step(s, { left: false, right: false, hold: false });
    if (s.p.onGround) return { x: s.p.x, y: s.p.y, ticks: i };
  }
  return null;
}

/** Which ledge is this body standing on? */
function ledgeUnder(x, y) {
  const { w, h } = RULES.body;
  for (let i = 0; i < PLATFORMS.length; i++) {
    const b = PLATFORMS[i];
    if (Math.abs(y + h - b.y) < 2 && x + w > b.x && x < b.x + b.w) return i;
  }
  return -1;
}

const reached = new Set();
const arrivedBy = new Map();

// the ledge you start on
const startLedge = ledgeUnder(START.x, START.y);
if (startLedge < 0) { console.error('the start position is not standing on anything'); process.exit(1); }
reached.add(startLedge);

// A frontier search, not a re-scan. Each ledge is only ever jumped FROM once, so this finishes
// instead of grinding over everything it already knows on every pass.
const frontier = [startLedge];
let explored = 0;
while (frontier.length) {
  const li = frontier.pop();
  explored++;
  const b = PLATFORMS[li];
  for (let s = 0; s < SPOTS; s++) {
    const x = b.x + 1 + ((Math.max(0, b.w - RULES.body.w - 2)) * s) / (SPOTS - 1);
    const y = b.y - RULES.body.h;
    for (let c = 1; c <= CHARGES; c++) {
      const charge = Math.round((RULES.charge * c) / CHARGES);
      for (const lean of LEANS) {
        const land = fly(x, y, charge, lean);
        if (!land) continue;
        const to = ledgeUnder(land.x, land.y);
        if (to < 0 || reached.has(to)) continue;
        reached.add(to);
        arrivedBy.set(to, { from: li, charge: c / CHARGES, lean });
        frontier.push(to);
      }
    }
  }
}
const pass = explored;

// --- report ------------------------------------------------------------------------------------
const perScreen = new Map();
for (let i = 0; i < PLATFORMS.length; i++) {
  const sc = screenOf(PLATFORMS[i].y);
  if (!perScreen.has(sc)) perScreen.set(sc, { total: 0, got: 0 });
  const e = perScreen.get(sc);
  e.total++;
  if (reached.has(i)) e.got++;
}

console.log(`${reached.size} of ${PLATFORMS.length} ledges reachable (explored ${pass})\n`);
let blocked = -1;
for (let sc = 0; sc < SCREEN_COUNT; sc++) {
  const e = perScreen.get(sc) ?? { total: 0, got: 0 };
  const ok = e.got > 0;
  if (!ok && blocked < 0) blocked = sc;
  console.log(`  screen ${String(sc).padStart(2)}  ${String(e.got).padStart(2)}/${String(e.total).padStart(2)} ledges` +
              `  ${ok ? 'reachable' : '*** UNREACHABLE ***'}`);
}

// and the lamp itself: can you stand somewhere that triggers the ending?
const canWin = [...reached].some((i) => {
  const b = PLATFORMS[i];
  const bodyY = b.y - RULES.body.h;
  return bodyY + RULES.body.h <= LAMP.y + 26 &&
         screenOf(bodyY + RULES.body.h / 2) >= 11;
});

console.log(`\nthe lamp room is ${canWin ? 'reachable — the tower can be climbed' : 'NOT REACHABLE'}`);
if (blocked >= 0) {
  console.log(`first unreachable screen: ${blocked}`);
  // the highest ledge we CAN stand on, and the lowest we cannot — the seam that is too far
  const got = [...reached].map((i) => PLATFORMS[i]).sort((a, b) => a.y - b.y)[0];
  const miss = PLATFORMS.filter((_, i) => !reached.has(i)).sort((a, b) => b.y - a.y)
    .find((b) => b.y < got.y + 60);
  console.log(`  highest reachable ledge: x ${got.x} y ${got.y} w ${got.w}`);
  if (miss) console.log(`  nearest unreachable:     x ${miss.x} y ${miss.y} w ${miss.w}` +
                        `  (${got.y - miss.y}px up, ${Math.abs(miss.x - got.x)}px across)`);
}
process.exit(canWin && blocked < 0 ? 0 : 1);
