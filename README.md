# The Far Light

**[Play it](https://www.aedinlai.com/far-light/)** · [all four games](https://www.aedinlai.com/games/)

Something answered the lighthouse from across the water. You are going up to see.

One verb: hold to wind up, lean with the arrows, let go. **No mid-air control and no coyote time** —
both were tried and removed on purpose, and `DESIGN.md` says why. A missed jump costs you the climb.

Twelve screens of generated tower. Every ledge on the route is proven reachable by a solver that
**imports the real physics** rather than reimplementing it — an earlier version reimplemented it,
drifted, and certified an unclimbable tower as climbable.

## Run it

No build step and no dependencies. Serve the folder and open it:

```sh
python3 -m http.server 8000
```

Add `?dev` for a state hook on `window` and palette validation in the console.

## How it is checked

`tools/` holds the harnesses. They are the point of the project as much as the game is, and
`DESIGN.md` records what each of them caught.

```sh
node tools/stress.mjs     # soak, with invariants on every tick
node tools/robust.mjs     # restarts, resizes, backgrounding, audio-node leaks
```

One lesson is worth stating here rather than only in the design document: **a test that passes may
simply never have run.** Several harnesses in this project reported success while exercising almost
nothing — one pressed no buttons for three hundred runs, another never climbed past the first of
eleven screens. They now report how much they actually did, and fail loudly when that is near zero.


## The design document

[`DESIGN.md`](DESIGN.md) is the real record: the plot, the decisions and the reasoning behind them, and a candid log of every bug with the check that now prevents it. Most of those bugs were found by review rather than by the test suite, because **no tool in this repository imports `render.mjs` or `main.mjs`** — the simulation is well covered and the half of the code a player actually experiences is not.
