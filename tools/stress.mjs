// Thousands of minutes of climbing, with no browser.
//
//   node tools/stress.mjs --seeds 400
//   node tools/stress.mjs --policy all
//
// The solver proves the tower CAN be climbed. This proves the physics never puts the climber
// somewhere the game cannot get them out of — inside a ledge, through the floor, outside the
// shaft, or stuck in a wind-up that cannot be released. None of those throw an exception, and all
// of them are what a player would call the game being broken.

import { newGame, step, RULES, TPS, chargeOf } from '../src/sim.mjs';
import { checkInvariants, makeWatchdog } from '../src/invariants.mjs';
import { makeRng } from '../src/rng.mjs';
import { TOP, PLATFORMS } from '../src/level.mjs';

// the route, and a workable jump for each step of it, computed once
const ROUTE = PLATFORMS.filter((b) => b.spine);
const PLAN = [];
{
  const fly = (a, b, charge, lean, frac) => {
    const s = newGame();
    s.p.x = a.x + 1 + Math.max(0, a.w - RULES.body.w - 2) * frac;
    s.p.y = a.y - RULES.body.h;
    s.p.vx = 0; s.p.vy = 0; s.p.onGround = true;
    s.p.charging = true; s.p.charge = Math.max(1, Math.round(RULES.charge * charge)); s.p.lean = lean;
    step(s, { hold: false, left: lean < 0, right: lean > 0 });
    for (let i = 0; i < 170; i++) {
      step(s, {}); s.events.length = 0;
      if (s.p.onGround) {
        return Math.abs(s.p.y + RULES.body.h - b.y) < 3 &&
               s.p.x + RULES.body.w > b.x && s.p.x < b.x + b.w;
      }
    }
    return false;
  };
  PLAN.push(null);
  for (let i = 1; i < ROUTE.length; i++) {
    // try every stance across the ledge, not just the middle — ten of these steps need the
    // climber to be standing at a particular end of the ledge before they wind up, which is
    // exactly the kind of thing a player works out and a naive test does not
    let found = null;
    for (let fi = 0; fi <= 6 && !found; fi++) {
      const frac = fi / 6;
      for (let c = 2; c <= 14 && !found; c++) {
        for (const lean of [1, -1, 0]) {
          if (fly(ROUTE[i - 1], ROUTE[i], c / 14, lean, frac)) {
            found = { charge: c / 14, lean, frac };
            break;
          }
        }
      }
    }
    PLAN.push(found);
  }
  const missing = PLAN.filter((x, i) => i > 0 && !x).length;
  console.log(`route: ${ROUTE.length} steps, ${missing} with no workable jump`);
}

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const SEEDS = Number(arg('--seeds', 200));
const TICKS = Number(arg('--ticks', TPS * 60 * 6));

/** Mashes everything at random. Finds the states a careful player never visits. */
function mash(rng, held) {
  if (rng.chance(0.06)) held.hold = !held.hold;
  if (rng.chance(0.08)) held.left = !held.left;
  if (rng.chance(0.08)) held.right = !held.right;
  return { ...held };
}

/** Holds the button forever and never releases, which should simply never jump. */
function holdForever() { return { hold: true, left: false, right: true }; }

/** Taps as fast as possible: a new jump every other tick. */
function spam(rng, held, tick) {
  return { hold: tick % 3 !== 0, left: rng.chance(0.3), right: rng.chance(0.5) };
}

/** Tries to climb: full charges, leaning the way the next ledge is. */
function climber(rng, held, tick, state) {
  const p = state.p;
  const charging = p.charging;
  const full = chargeOf(state) > 0.82;
  return {
    hold: !(charging && full),
    left: p.x > 150 && rng.chance(0.8),
    right: p.x <= 150 && rng.chance(0.8),
  };
}

/**
 * Follows the proven route: aim at the next ledge up, wind up the amount the solver found works,
 * lean the right way, release. This is the policy that answers "can the tower actually be climbed
 * by pressing buttons", as opposed to the solver's answer, which is about geometry.
 */
function router(rng, held, tick, state, memo) {
  const p = state.p;
  if (!p.onGround) return { hold: false, left: false, right: false };

  // which route ledge are we on, and which is next?
  const route = ROUTE;
  let here = -1;
  for (let i = 0; i < route.length; i++) {
    const b = route[i];
    if (Math.abs(p.y + RULES.body.h - b.y) < 3 && p.x + RULES.body.w > b.x && p.x < b.x + b.w) { here = i; break; }
  }
  // Off the route — landed on a side ledge, or fell. Get back on: aim for the highest route
  // ledge that is still below us and hop toward it. A player does this without thinking; a test
  // that cannot do it stalls on the first miss and tells you nothing about the rest of the climb.
  if (here < 0) {
    const below = route.filter((b) => b.y >= p.y).sort((a, b) => a.y - b.y)[0];
    if (!below) return { hold: false, left: false, right: false };
    const toward = below.x + below.w / 2 - (p.x + RULES.body.w / 2);
    if (Math.abs(toward) < 6) return { hold: false, left: false, right: false };
    return { hold: p.charge < Math.round(RULES.charge * 0.45),
             left: toward < 0, right: toward > 0 };
  }
  if (here + 1 >= route.length) return { hold: false, left: false, right: false };

  const plan = PLAN[here + 1];
  if (!plan) return { hold: false, left: false, right: false };

  // walk to the stance the plan needs before winding up
  const a = route[here];
  const stance = a.x + 1 + Math.max(0, a.w - RULES.body.w - 2) * plan.frac;
  // Stand WHERE THE PLAN SAYS, not within a pixel and a half of it.
  //
  // The plan's charge and lean were solved for an exact stance, and several steps on this route
  // have a stance band only four to eight pixels wide — so landing 1.5px off made the next jump
  // impossible. The router climbed to route index 11, failed, fell back to 6, climbed again, and
  // repeated for the full three simulated minutes. Three hundred runs and 1,800 minutes of
  // "nothing broken" were 1,800 minutes of flailing at the bottom of the tower: every invariant in
  // the project had never once run on screens 2 through 11.
  if (!p.charging && Math.abs(p.x - stance) > 0.4) {
    return { hold: false, left: p.x > stance, right: p.x < stance };
  }
  const want = Math.round(RULES.charge * plan.charge);
  return { hold: p.charge < want, left: plan.lean < 0, right: plan.lean > 0 };
}

const POLICIES = { mash, holdForever, spam, climber, router };
const wanted = arg('--policy', 'all');
const names = wanted === 'all' ? Object.keys(POLICIES) : [wanted];

let runs = 0, fails = 0, ticks = 0, wins = 0, bestScreen = 0;
const t0 = Date.now();

for (const name of names) {
  const policy = POLICIES[name];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const state = newGame();
    const rng = makeRng(seed * 2654435761);
    const watch = makeWatchdog();
    const held = { hold: false, left: false, right: false };
    const memo = {};
    let broke = null, high = 0;

    for (let i = 0; i < TICKS; i++) {
      const input = policy(rng, held, i, state, memo);
      Object.assign(held, input);
      step(state, input);
      const pressed = input.hold || input.left || input.right;
      state.events.length = 0;
      ticks++;

      const bad = [...checkInvariants(state), ...watch(state, pressed)];
      if (bad.length) { broke = { tick: state.tick, bad }; break; }
      high = Math.max(high, state.screen);
      if (state.over) { wins++; break; }
    }
    bestScreen = Math.max(bestScreen, high);
    runs++;
    if (broke) {
      fails++;
      console.log(`\nFAIL  ${name} seed ${seed} at tick ${broke.tick} (${(broke.tick / TPS).toFixed(1)}s)`);
      for (const b of broke.bad.slice(0, 4)) console.log('   ' + b);
      if (fails >= 6) break;
    }
  }
  if (fails >= 6) break;
}

const secs = (Date.now() - t0) / 1000;
console.log(`\n${runs} runs, ${(ticks / TPS / 60).toFixed(0)} minutes of climbing in ${secs.toFixed(1)}s`);
console.log(`  reached screen ${bestScreen} of 11 at best, ${wins} reached the lamp`);

// Coverage, stated out loud.
//
// "Nothing broken" is a claim about the code that ran. For three hundred runs this harness never
// climbed past screen 1, so every invariant in the project — inside a ledge, through the floor,
// out of the shaft, winding up in mid-air — had never once been evaluated on five sixths of the
// tower, and the summary line said `nothing broken` the whole time.
if (bestScreen < 8) {
  console.log(`  *** THE HARNESS BARELY CLIMBED: screen ${bestScreen} of 11 is not coverage ***`);
}
console.log(fails ? `\n${fails} FAILURES` : '\nnothing broken');
process.exit(fails || bestScreen < 8 ? 1 : 0);
