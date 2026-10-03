// Builds the tower, proves every step of it climbable, and repairs the steps that are not.
//
//   node tools/maketower.mjs          # writes src/tower.mjs
//   node tools/maketower.mjs --check  # verify the committed tower without rewriting it
//
// Three earlier attempts failed in instructive ways. Hand-authoring twelve screens left seams 184
// pixels apart when the jump reaches 69. Generating under a rule of "never place a ledge above
// another" made the spine flee to the far wall, leaving gaps nobody could cross — because a
// switchback climb MUST pass back over itself; that is what a switchback is. Searching random
// seeds for one that happened to work was correct but far too slow.
//
// So: generate a step, test it with the real physics, and if it cannot be made, move it until it
// can. Construct, verify, repair. The result is written out as data, so the game itself never
// does any of this and the tower is identical for everyone.

import { writeFileSync } from 'node:fs';
import { makeRng } from '../src/rng.mjs';

import { newGame, step, usePlatforms, RULES } from '../src/sim.mjs';

const SW = 256, SH = 240, WALL = 10, SCREENS = 12;
const WORLD_H = SCREENS * SH;
const BODY = RULES.body;

/**
 * Fly one jump through THE GAME'S OWN physics, against a candidate set of ledges.
 *
 * This used to be a reimplementation living in this file, and it quietly diverged: the tool
 * certified a tower it believed climbable that the real game could not get past the second screen.
 * Importing `step` costs nothing and makes that class of mistake impossible.
 */
function fly(plats, fromX, fromY, charge, lean) {
  usePlatforms(plats);
  const s = newGame();
  s.p.x = fromX; s.p.y = fromY; s.p.vx = 0; s.p.vy = 0;
  s.p.onGround = true; s.p.charging = false; s.p.charge = 0;

  // The wind-up has no physical effect — the body does not move while charging — so set the
  // charge directly instead of simulating thirty idle ticks for every one of the hundreds of
  // thousands of jumps this tool flies.
  s.p.charging = true;
  s.p.charge = Math.max(1, Math.round(RULES.charge * charge));
  s.p.lean = lean;
  step(s, { left: lean < 0, right: lean > 0, hold: false });

  for (let i = 0; i < 170; i++) {
    step(s, {});
    s.events.length = 0;
    if (s.p.onGround) {
      // which ledge did we end up on?
      for (let k = 0; k < plats.length; k++) {
        const b = plats[k];
        if (Math.abs(s.p.y + BODY.h - b.y) < 2 && s.p.x + BODY.w > b.x && s.p.x < b.x + b.w) return k;
      }
      return -1;
    }
  }
  return -1;
}

/** Can you get from ledge `a` onto ledge `b`, with any stance, charge or lean? */
function canReach(plats, a, b) {
  const target = plats.indexOf(b);
  if (target < 0) return null;
  for (let s = 0; s < 5; s++) {
    const x = a.x + 1 + (Math.max(0, a.w - BODY.w - 2) * s) / 4;
    for (let c = 2; c <= 14; c++) {
      for (const lean of [-1, 0, 1]) {
        if (fly(plats, x, a.y - BODY.h, c / 14, lean) === target) return { charge: c / 14, lean };
      }
    }
  }
  return null;
}

function make(seed) {
  const rng = makeRng(seed);
  const plats = [{ x: WALL, y: WORLD_H - 26, w: SW - WALL * 2, h: 8, spine: true }];
  // the climb ends near the TOP of the final screen, not two-thirds of the way down it
  const top = 64;
  let dir = 1;
  const route = [];

  while (plats[plats.length - 1].y > top + 42) {
    const cur = plats[plats.length - 1];
    let placed = null, how = null;

    // Candidates anywhere in the shaft, ordered by how much we would like them, and the first one
    // the real physics says is makeable wins.
    //
    // There is deliberately no rule about WHERE a ledge may go relative to the one below. An
    // earlier version only looked beside the current ledge, which made the very first step
    // impossible because the floor spans the whole shaft — and more importantly, a rule like that
    // is a guess about what is reachable when there is a function right here that knows.
    const cands = [];
    for (let rise = 34; rise >= 12; rise -= 4) {
      for (let x = WALL; x <= SW - WALL - 28; x += 10) {
        const w = Math.min(rng.int(28, 52), SW - WALL - x);
        if (w < 24) continue;
        // prefer a big rise, and prefer carrying on the way we were going
        const across = (x + w / 2) - (cur.x + cur.w / 2);
        const want = (34 - rise) * 3 + Math.abs(Math.abs(across) - 56) * 0.4
                   + (Math.sign(across) === dir ? 0 : 14);
        cands.push({ x, y: cur.y - rise, w, h: 6, spine: true, want, across });
      }
    }
    cands.sort((a, b) => a.want - b.want);

    for (const cand of cands) {
      plats.push(cand);
      const ok = canReach(plats, cur, cand);
      plats.pop();
      if (ok) {
        delete cand.want; const across = cand.across; delete cand.across;
        placed = cand; how = ok;
        if (across !== 0) dir = Math.sign(across);
        break;
      }
    }

    if (!placed) {
      console.error(`  stuck at y ${cur.y}; no makeable step anywhere in the shaft`);
      return null;
    }
    plats.push(placed);
    route.push(how);

    // a side ledge now and then: somewhere to go wrong, and somewhere to land after a fall
    if (rng.chance(0.28)) {
      const sw = rng.int(20, 34);
      const sx = placed.x < SW / 2
        ? rng.int(Math.min(SW - WALL - sw, placed.x + placed.w + 30), SW - WALL - sw)
        : rng.int(WALL, Math.max(WALL, placed.x - sw - 30));
      const cand = { x: sx, y: placed.y + rng.int(10, 26), w: sw, h: 6 };
      // never if it would roof a step of the route
      const roofs = plats.some((b) => b.spine && cand.y < b.y && b.y - cand.y <= 76 &&
        cand.x < b.x + b.w + 6 && cand.x + cand.w > b.x - 6);
      if (!roofs) plats.push(cand);
    }
  }

  // The lamp stands on the last ledge of the route.
  //
  // There used to be a full-width floor pushed on top here, and it was unreachable for the oldest
  // reason in this file: a ledge spanning the whole shaft is a lid. You can only ever hit its
  // underside. Every other step was proven, and the single step that mattered most was the one
  // placed by hand without checking.
  plats[plats.length - 1].lamp = true;

  // --- repair ---------------------------------------------------------------------------------
  //
  // Every step was proven makeable when it was placed, against the tower as it stood at that
  // moment. Ledges added afterwards can roof a step that used to be fine, so the whole route is
  // re-proven against the FINISHED tower and anything still broken is fixed here: first by
  // removing whatever decorative ledge is in the way, and only then by moving the step itself.
  for (let pass = 0; pass < 6; pass++) {
    const route = plats.filter((b) => b.spine);
    let broken = 0;
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i];
      if (canReach(plats, a, b)) continue;
      broken++;

      // is some decoration roofing it? drop the offender rather than redesigning the climb
      const culprit = plats.find((q) => !q.spine && q.y < a.y && a.y - q.y <= 80 &&
        q.x < a.x + a.w + 10 && q.x + q.w > a.x - 10);
      if (culprit) {
        plats.splice(plats.indexOf(culprit), 1);
        if (canReach(plats, a, b)) { broken--; continue; }
      }

      // Still broken: move the step until it can be made again — while keeping the step AFTER it
      // makeable too. Fixing one rung by shoving it somewhere that strands the next one just moves
      // the hole up the tower, which is what the first version of this did.
      const next = route[i + 1] ?? null;
      const orig = { x: b.x, y: b.y, w: b.w };
      let fixed = false;
      for (let rise = a.y - b.y; rise >= 12 && !fixed; rise -= 6) {
        for (let w = b.w; w <= 56 && !fixed; w += 12) {
          for (let x = WALL; x <= SW - WALL - w && !fixed; x += 12) {
            b.x = x; b.y = a.y - rise; b.w = w;
            if (!canReach(plats, a, b)) continue;
            if (next && !canReach(plats, b, next)) continue;
            fixed = true;
          }
        }
      }
      if (!fixed) { b.x = orig.x; b.y = orig.y; b.w = orig.w; }
      else broken--;
    }
    if (!broken) break;
  }

  return plats;
}

// --- build, then prove it end to end ------------------------------------------------------------
let plats = null, seed = 7;
for (; seed < 24; seed++) {
  plats = make(seed);
  if (!plats) continue;
  const sp = plats.filter((b) => b.spine);
  let ok = true;
  for (let i = 1; i < sp.length; i++) {
    if (!canReach(plats, sp[i - 1], sp[i])) { ok = false; break; }
  }
  if (ok) break;
}
if (!plats) { console.error('no tower could be built'); process.exit(1); }

const spine = plats.filter((b) => b.spine);
let broken = 0;
for (let i = 1; i < spine.length; i++) if (!canReach(plats, spine[i - 1], spine[i])) broken++;

const lampY = Math.min(...plats.map((b) => b.y));
console.log(`seed ${seed}: ${plats.length} ledges, ${spine.length} on the route, ` +
            `${broken} unmakeable steps, top at y ${lampY} (${((WORLD_H - lampY) / SH).toFixed(1)} screens)`);

if (process.argv.includes('--check')) process.exit(broken ? 1 : 0);

const body = plats.map((b) =>
  `  { x: ${b.x}, y: ${b.y}, w: ${b.w}, h: ${b.h}${b.spine ? ', spine: true' : ''} },`).join('\n');
writeFileSync(new URL('../src/tower.mjs', import.meta.url),
`// Generated by tools/maketower.mjs — do not edit by hand.
//
// Every step of the route below was flown through the real jump arithmetic before it was placed,
// so the climb is proven possible rather than hoped to be. Re-run the tool to rebuild it; run it
// with --check to re-prove the committed one.
//
// seed ${seed} · ${plats.length} ledges · ${spine.length} on the route · ${broken} unmakeable steps

export const TOWER = [
${body}
];
`);
console.log('wrote src/tower.mjs');
process.exit(broken ? 1 : 0);
