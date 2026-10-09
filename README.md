# Sliding Car Puzzles

A sliding-car puzzle game for the browser that **generates** puzzles to order:
pick the board size, where the exit is, how many cars and trucks, how many moves the
solution should take, and how hidden that solution should be.

## Playing it

- **Online:** https://phaazoid.github.io/sliding-car-puzzles/
- **From a copy of this repository:** double-click `index.html`. There is no build step,
  server or library; it is plain HTML, CSS and JavaScript.
- **As one file to send someone:** `node tools/build-single.js` writes
  `dist/sliding-car-puzzles.html`, the whole game in a single file that runs when
  double-clicked, with no internet connection needed.

Engine tests (needs [Node.js](https://nodejs.org)):

```
node tests/engine.test.js
```

They check the engine against the numbers from the original Python analysis of the
starter puzzle (10,548 positions, 4,255 solved, par 26) and smoke-test the generator.

## How difficulty works

The engine maps every position reachable from a layout: a graph where each edge is one
move (sliding one vehicle any distance). Two numbers come out of that graph:

- **Par**: the fewest moves to solve, found for every position at once by one
  breadth-first search starting from all the solved positions together.
- **Random solver**: the average number of moves someone making random legal moves would
  need. It is high when the way forward is hidden: big regions of the graph with only a
  few positions that lead on. Positions with the same par can differ several-fold here.

The generator builds random layouts from the panel settings and keeps relocating one
vehicle at a time until a layout's graph contains a position at the requested par. The
**Moves to solve** slider sets that par; **Trickiness** then picks, among positions with
that par, one from the easy end (obvious path) to the hard end (hidden path) by the random
solver score. If the target isn't reached within 12 seconds, it shows the best it found.

## Keeping puzzles

- **Set as start** (toolbar) makes the position on the board the puzzle's start. Par and
  the stats update, and Reset comes back to it.
- **Save puzzle** adds the puzzle's start to the Saved puzzles list in the panel. The list
  lives in this browser (localStorage), so it survives closing the page but not clearing
  site data, and it isn't shared between browsers.
- **Copy link** copies the page address. Every puzzle's layout is written into the address
  after `#p=`, so opening the link loads that exact puzzle. On your own computer the link
  points at the file; once the site is online, it works for anyone.

A layout code reads `<width><height><exit side><exit row>.` followed by four characters per
vehicle: letter, kind (`a`/`b` horizontal car/truck, `c`/`d` vertical car/truck), lane
and position. The starter puzzle is
`66r2.Ra21Yb03Ca14Ma34Na42Bb51Oc01Gc04Pc13Sc20Xd31Zc54`.

## Files

| File | What it does |
| --- | --- |
| `js/engine.js` | Board model, legal moves, the position graph, par, random solver, hints |
| `js/puzzles.js` | Vehicle letters and colours, the starter puzzle, layout codes |
| `js/generator.js` | Random layouts, hill-climbing toward a target par, picking the start |
| `js/render.js` | Draws the board as SVG and rotates it for the exit side |
| `js/game.js` | Dragging, the move counter, undo/reset, hints, solution playback |
| `js/app.js` | The control panel, toolbar, saved puzzles and links |

The engine always works with the exit on the right; `render.js` rotates the picture for
an exit on another side.

Moves count the way the original Python did: sliding the same vehicle again straight
after counts as the same move.

## Publishing

The site is served by GitHub Pages straight from the root of the `main` branch, so pushing
to `main` updates it within a minute or two.
