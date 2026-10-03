# THE FAR LIGHT

> At the end of Filament the Far Light takes current, throws its beam out over the water, and
> something out there answers with a light of its own.
>
> This is you climbing up to see what.

A one-verb precision climber, in the same world and on the same engine as
[Filament](../Filament/DESIGN.md). Built second, in an evening, on infrastructure that already
existed — which is the whole argument for having built the first one properly.

---

## 1. The one verb

Hold the button. Let go. That is the entire control scheme.

- **Hold** to wind up. The charge builds over ~0.55s and the lineman crouches lower as it grows.
- **Steer while charging.** Whichever way you are leaning when you *release* is the way you go.
- **Release** to jump. No air control at all — once you are off the ground the jump is cast.
- **Walls bounce you.** Hitting a wall mid-flight reverses you at 70% speed, which is the single
  most important rule in the game: it is how you reach places you cannot jump to directly, and it
  is how a good jump becomes a disaster.
- **Falling costs nothing but height.** There is no damage, no lives, no checkpoints, no score.
  The punishment for a bad jump is being somewhere you already were, which is Jump King's whole
  idea and it is a good one.

Nothing else. No double jump, no wall-grab, no ledge-assist. Every metre you gain is a jump you
aimed.

## 2. The climb

A tower in cross-section, climbed one screenful at a time. The camera does not scroll smoothly —
it snaps a whole screen when you cross a floor boundary, which is what makes falling two screens
feel like falling two screens.

**Twelve screens**, each hand-laid as a small set of platforms rather than generated, because a
precision platformer lives entirely on whether a specific jump is possible and that is not
something to leave to a seed. Roughly:

| screens | what they teach |
|---|---|
| 1–2 | the charge. Wide platforms, short gaps, nothing punishing. You cannot fall below screen 1. |
| 3–4 | the bounce. The first gap that cannot be crossed without using a wall. |
| 5–7 | commitment. Long drops below you, so a missed jump costs real height. |
| 8–10 | precision. Narrow ledges, tight ceilings, jumps that need a part-charge rather than a full one. |
| 11–12 | the lamp room, and what is outside it. |

## 3. The look

The same hard constraints as Filament, using the same `pixel.mjs`: **256 × 240, 25 colours, 8 × 8
grid, no alpha**, and an indexed framebuffer so the palette budget holds by construction.

The difference is vertical. Filament is a long horizontal coast at night; this is a tall stone
shaft with the sea outside the windows, getting lighter as you climb — the palette rotates from
near-black at the base to dawn at the top, so **height is legible as colour**. By the lamp room you
are above the weather.

## 4. What it reuses

| from Filament | unchanged? |
|---|---|
| `pixel.mjs` — indexed framebuffer, sprites, dither, lamps, font | yes, verbatim |
| `rng.mjs` — seeded streams | yes, verbatim |
| the fixed-timestep loop, input handling, integer scaling, visibility pause | same shape, rewritten for one verb |
| the WebAudio APU | same voices, new sounds |

Everything else is new: physics, collision, the tower, the climb.

## 5. Scope

One sitting. It is a demo like Filament is a demo — a complete arc with a beginning, a middle and
an ending, built so the systems under it could carry more.

## 6. Log

**2026-10-02 23:45** — Started after Filament shipped and deployed. The point of this one is partly
the game and partly the proof: the second game on a renderer you own is an evening, not a week.

---

# 7. Building the tower: four attempts

The climb is the whole game, and whether a specific jump is possible is not something that can be
eyeballed. This took four goes, and each failure was a different shape of the same mistake —
*believing* a level was climbable instead of *proving* it.

### Attempt 1 — hand-authored, twelve screens

Each screen laid out by hand in its own local coordinates. It looked right. The solver found that
the top ledge of one screen sat **184 pixels below** the bottom ledge of the next, and the jump
reaches 69. Authoring screens separately and hoping the seams line up does not work, and nothing
short of playing the whole thing would ever have shown it.

### Attempt 2 — generated under a rule: never place a ledge above another

The thinking: if a ledge sits directly above you, jumping up hits its **underside** and you drop
back, so forbid that and the climb is safe. True as far as it goes, and it produced a route that
fled to the far wall whenever it was boxed in, leaving a 164px gap nobody could cross.

The flaw is structural: **a switchback climb must pass back over itself**. That is what a switchback
is. A rule banning it bans climbing a narrow shaft at all.

### Attempt 3 — search random seeds until one is climbable

Right in spirit — whether a tower is climbable is a question to be answered by playing it, not by a
rule — and far too slow. Minutes per seed, with no guarantee any seed in range works.

### Attempt 4 — generate, verify, repair

What it does now, in `tools/maketower.mjs`:

1. **Generate** a candidate step: a rise, a width, a position anywhere in the shaft.
2. **Verify** it by flying every stance, charge and lean through the real physics. First candidate
   that actually works, wins. There is deliberately *no rule* about where a ledge may go relative
   to the one below — there is a function right here that knows.
3. **Repair**: every step is proven against the tower *as it stood when it was placed*, and a ledge
   added later can roof one that used to be fine. So the finished route is re-proven end to end,
   and anything broken is fixed — first by removing whatever decoration is in the way, then by
   moving the step itself, with the constraint that the step *after* it stays makeable too.
   Fixing one rung by shoving it somewhere that strands the next one just moves the hole up.
4. **Commit the result as data**, so the game never does any of this and everyone climbs the same
   tower.

### The bug underneath all of it

The tool carried its **own copy of the jump arithmetic**. It drifted from the game's, and it
certified a tower as fully climbable that the real game could not get past the second screen.

That is the oldest trap in verification: a checker that re-implements the thing it checks is
checking itself. `tools/maketower.mjs` now imports `step` from `src/sim.mjs` and runs candidate
towers through `usePlatforms`, so there is exactly one implementation of the jump and both the game
and the proof use it.

## 7.1 Other things the solver found

- **Ground has to be detected by probing a pixel below, not by overlap.** At rest the body sits
  exactly on top of a ledge and so does not overlap it at all — an overlap test says "airborne" on
  every tick you are not actively falling into something. The player left the ground the instant
  they stopped moving, which cancelled the wind-up one tick after it started. Every jump came out
  as a stumble and *nothing in the tower was reachable*.
- **Horizontal must resolve before vertical.** The other order clips corners: the vertical sweep
  tests against last tick's x, so a body arcing onto the left edge of a ledge is still left of it
  when the landing test runs, misses, and is then pushed into the ledge's side by the horizontal
  step — a bounce instead of a landing. Whole ledges were unreachable for that reason alone, and
  it would have felt like the game cheating.

---

# 8. Verification

Four things, each answering a different question.

| tool | question it answers | result |
|---|---|---|
| `tools/solve.mjs` | is every ledge reachable from the floor? | **94–103 of 103 ledges, all twelve screens, the lamp room reachable** |
| `tools/stress.mjs` | can the physics put the climber somewhere the game cannot get them out of? | **nothing broken in 1500 minutes of climbing**, across four policies: random mashing, holding the button forever, tapping every other tick, and trying to climb |
| the route plan inside `stress.mjs` | does every step of the route have a jump that makes it? | **88 of 88 steps**, once stance is allowed to vary — ten of them need the climber standing at a particular end of the ledge, which is the kind of thing a player works out and a naive test does not |
| `tools/climb.mjs` | can the whole thing actually be played to the end? | **all 87 steps, to the lamp, in 79.5 seconds of play** |

The last one is the one that matters. The solver's answer is about geometry; this one is a sequence
of button presses, run through the real simulation, that finishes the game.

### What the invariants watch

A platformer's dangerous failures are not crashes. They are the climber ending up somewhere the
game did not intend and cannot recover from, none of which throws:

- inside a ledge — the one failure a player would call "the game is broken"
- through the floor, or outside the shaft
- a speed the rules cannot produce
- winding up in mid-air
- and a watchdog for the soft-lock proper: nothing has moved in ten seconds and no button is down

---

# 9. What the climb actually asks of you

The route was measured after the council pointed out that it did not ask anything. Before:

| | before | after |
|---|---|---|
| step rise | min 8, **median 34, max 34** — effectively one value | min 18, **median 38, max 54** |
| mix | all one length | 31 short · 26 standard · 19 near the 69px apex |
| **a full charge makes** | **85% of steps** | **72%** |
| smallest usable charge window | **1 tick** (17ms — not aimable by a person) | **6 ticks** (100ms) |
| steps needing a window of 8 ticks or less | 3 | **24 of 76** |

The first version scored candidate ledges by preferring the biggest rise available, which pinned
every step in the tower to exactly 34px. A full charge was then the right answer five times out of
six, and the wind-up, the crouch and the whole one-verb skill were decoration on most of the climb.
Each step now draws a target rise from a mix and the generator aims for it.

**And the generator requires a step to be aimable, not merely solvable.** `canReach` demands a run
of at least three consecutive charge values that work from the same stance and lean, and records
the middle of that run as the plan. A step that works for exactly one value of a thirty-three-tick
wind-up is a seventeen-millisecond release: possible, and not a thing to ask of a person.

## 9.1 A bug the route measurements exposed

Four steps had rises of 13, 5, 0 and **minus seven** — a route that went sideways and occasionally
downhill. The generator read `plats[plats.length - 1]` as "the ledge we are standing on", but that
is the last thing *added*, and a decorative side ledge is pushed after the route ledge it hangs
off, ten to twenty-six pixels below it. So every step following a decoration was measured from the
decoration. The route ledge is tracked explicitly now.

Worth noting what caught it: not the solver, which was perfectly happy — those steps were all
reachable — but a tool written to answer a *design* question about how hard the climb was.

---

## The instruction line was printing over the game

Each page carries one line of non-game chrome: the controls, for anyone who lands on it cold. It
was `position: fixed; bottom: 6px` while the canvas was sized to `innerHeight - 8`.

Those two numbers are only compatible by luck. The canvas rounds down to a whole multiple of 240,
so the leftover slack is whatever the rounding happens to leave — and the line is about 17px tall.
A sweep of fourteen window heights found the line printing across the bottom of the game at **five
of them**, including 728, 740 and 760, which is to say on an ordinary laptop. It was in every
screenshot in `out/`, in all three games, and nobody had looked at the bottom fourteen pixels.

The line is part of the layout now — a flex column, canvas then line — and `fit()` reserves its
**measured** height rather than a guessed constant, because it wraps to two rows on a narrow phone.

A related non-bug worth recording, because an hour went into it: a mobile harness reported the
canvas scaling at `3.99999609375` device pixels per source pixel and flagged it as fractional. It
was not. The browser rounds the CSS width it reports to three decimals, and the test was reading
that string back instead of the laid-out box. Measured from `getBoundingClientRect`, the scale is
exactly 4. The renderer's guarantee held; the instrument was wrong.

## A tap is not a hold

The same harness reported that Filament's monarch never moved and that The Far Light recorded zero
jumps, across twelve rounds of taps. Both games were fine. `touchscreen.tap()` is a pointerdown and
a pointerup in the same millisecond, which can land entirely between two ticks of a 60Hz simulation
— so the test said "nothing happened" about a game that works, and would have said exactly the same
about one that did not. Replaced with a real press-wait-release. Both games pass.

---

## The council pass, and the two claims that were not true

A reviewer with fresh eyes drove the live game in a real browser and measured the tower
independently. Most of what it found was in `main.mjs` and `render.mjs` — which no tool in this
repo imports, and which is therefore where everything serious was.

### The game was uncompletable on a phone. Again, and in the opposite direction.

The first touch scheme set `hold: true` for every touch, so you could jump and never walk. The fix
**partitioned** the screen into three exclusive zones — outer thirds walk, middle winds up — which
made `touch.hold` and `touch.left/right` mutually exclusive. And `sim.mjs` only writes the lean
*inside* the hold branch. So on a phone the lean was permanently 0 and every jump went dead
vertical. Measured against the real physics: **0 of 76 route steps are makeable with no lean.** Not
most of them. None. You cannot clear the first one.

One bug traded for its mirror image, both shipped, both invisible to every test that pressed a key.
Touches are now tracked per `pointerId` and the zones overlap, so one thumb can charge and lean at
once — verified by driving real pointer events and checking the horizontal velocity of the jump
that comes out.

### The soak harness had never climbed past screen 1

`tools/stress.mjs` reported *300 runs, 1800 minutes of climbing, nothing broken*. It also reported,
in a line nobody read, `reached screen 1 of 11 at best`.

The `router` policy stopped walking once it was within 1.5px of the stance its plan was solved for,
and several steps on this route have a stance band four to eight pixels wide — so it climbed to
route index 11, failed, fell to 6, climbed again, and repeated for the full three simulated
minutes, every run. **Every invariant in this project had therefore never once been evaluated on
five sixths of the tower**, while the summary line said *nothing broken*.

The tolerance is 0.4px now. The router reaches the lamp on every run, and the harness prints
`THE HARNESS BARELY CLIMBED` and exits non-zero if it ever stops short again. Re-run: **750 runs,
3,827 minutes, every screen, nothing broken** — which now means something.

### The shake was framerate-dependent

`camera.trauma` decayed inside `updateCamera`, which `render()` calls — so once per rendered frame
rather than once per tick. Measured: 34 sim ticks to decay at 60Hz, **0 ticks at an unlocked frame
rate**. The fall is the biggest reaction this game has and it was half as long at 120Hz and a third
as long at 144, which is most displays now. The two `cosmetic` draws for the shake offset were on
the same per-frame path, which quietly undid the argument for having a separate cosmetic stream at
all. Both are on the tick clock now: 34 ticks at 17 frames and at 778.

### Smaller, all real

- `fit()` computed the hint's reserved height and **never used it** — because the edit that was
  meant to patch the maths matched the words `innerHeight - 8` inside its own comment. The overlap
  went away, so the test passed, while the canvas was pushed up and clipped at the top at the same
  window heights as before. `tools/overlap.mjs` now checks clipping and the hint being off-screen,
  not just overlap.
- Hiding the tab set `paused` and nothing ever cleared it. The escape is the letter P, which is not
  in the hint line, not on the title screen, and not on a phone at all.
- `tools/robust.mjs`'s "backgrounding" test dispatched `visibilitychange` while `document.hidden`
  was still false, so the only branch it ever ran was the one that resumes. The test that existed
  to catch the bug above tested the opposite case.
- A pointer hold survived `blur`: alt-tab while charging and you came back wound to maximum.
- `restart()` never cleared the held keys, so pressing R — or holding space on the ending screen,
  which says *press space* — began the new run already at full charge.
- `music.reset()` was written for a real bug ("a second climb opens a fifth too high") and was
  never called by anything.
- The altimeter's never-reached marks were drawn in palette entry 2, which at the base of the tower
  is the same dark blue as the mortar behind them — invisible exactly where *how far is there to
  go* is worth knowing. The comment two lines above already said entry 3.
- `tools/maketower.mjs` set `lamp: true` on the final route ledge and then dropped it from its own
  serializer.
- Particles were handed the shake offset on top of a transform that already included it, so dust
  slid vertically against the ledges it was sitting on.
