// Finds a seed whose tower the solver proves climbable from the floor to the lamp room.
//
//   node tools/seed.mjs 1 400
//
// Generate-and-verify, rather than trying to make the generator correct by construction. A
// switchback climb has to pass back over itself, so "never lid anything" is not a rule a real
// tower can obey — but "this particular tower is climbable" is something that can be checked
// exactly, by playing it.
import { buildTower } from '../src/level.mjs';
import { RULES, newGame, step } from '../src/sim.mjs';

const WORLD_H = 12 * 240;
const from = Number(process.argv[2] || 1);
const to = Number(process.argv[3] || 300);

function reachable(plats) {
  const ledgeUnder = (x, y) => plats.findIndex(
    (b) => Math.abs(y + RULES.body.h - b.y) < 2 && x + RULES.body.w > b.x && x < b.x + b.w);

  const fly = (fx, fy, charge, lean) => {
    const s = newGame();
    s.p.x = fx; s.p.y = fy; s.p.vx = 0; s.p.vy = 0; s.p.onGround = true;
    for (let i = 0; i < charge; i++) step(s, { left: lean < 0, right: lean > 0, hold: true });
    step(s, { left: lean < 0, right: lean > 0, hold: false });
    // A jump lasts at most about a second; anything beyond two is a fall, and a fall to the floor
    // of a twelve-screen tower is under 150 ticks. 400 was simply wasted work, and this search
    // runs it several million times.
    for (let i = 0; i < 160; i++) {
      step(s, {});
      if (s.p.onGround) return s.p;
    }
    return null;
  };

  const start = plats.findIndex((b) => b.y === WORLD_H - 26);
  if (start < 0) return { got: new Set(), top: Infinity };
  const lampY = Math.min(...plats.map((b) => b.y));
  const got = new Set([start]);
  const frontier = [start];
  while (frontier.length) {
    if (got.has(plats.findIndex((b) => b.y === lampY))) break;   // already there; stop searching
    const li = frontier.pop();
    const b = plats[li];
    for (let s = 0; s < 5; s++) {
      const x = b.x + 1 + (Math.max(0, b.w - RULES.body.w - 2) * s) / 4;
      for (let c = 1; c <= 9; c++) {
        for (const lean of [-1, 0, 1]) {
          const land = fly(x, b.y - RULES.body.h, Math.round((RULES.charge * c) / 9), lean);
          if (!land) continue;
          const to2 = ledgeUnder(land.x, land.y);
          if (to2 < 0 || got.has(to2)) continue;
          got.add(to2);
          frontier.push(to2);
        }
      }
    }
  }
  const top = Math.min(...[...got].map((i) => plats[i].y));
  return { got, top };
}

let best = null;
for (let seed = from; seed <= to; seed++) {
  const plats = buildTower(seed);
  const lamp = Math.min(...plats.map((b) => b.y));
  const { got, top } = reachable(plats);
  const solved = top <= lamp + 1;
  if (solved) {
    console.log(`seed ${seed}: CLIMBABLE — ${got.size}/${plats.length} ledges, top ledge y ${top}`);
    best = seed;
    break;
  }
  if (!best && (seed - from) % 20 === 0) {
    console.log(`  seed ${seed}: reached y ${top} of ${lamp} (${got.size}/${plats.length})`);
  }
}
if (best === null) console.log('no climbable seed in that range');
process.exit(best === null ? 1 : 0);
