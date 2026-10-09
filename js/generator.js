// Puzzle generator: builds random layouts from the panel settings, then hill-climbs
// (relocating one vehicle at a time) until a layout's graph contains a position at the
// target par. Among the positions at that par it picks one by trickiness, using the
// random-solver score. Runs in short slices so the page stays responsive.
(function (root) {
  'use strict';
  const Engine = root.Engine || require('./engine.js');
  const Puzzles = root.Puzzles || require('./puzzles.js');


  const randInt = n => Math.floor(Math.random() * n);
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const yieldToPage = () => new Promise(resolve => setTimeout(resolve, 0));

  function mark(grid, W, car, p, value) {
    for (let k = 0; k < car.len; k++) {
      if (car.horiz) grid[car.fixed * W + p + k] = value;
      else grid[(p + k) * W + car.fixed] = value;
    }
  }

  // Find a random free lane spot for a vehicle of length len. Horizontal vehicles never go
  // in the exit row: only the red car can leave, so one there would block it forever.
  function place(s, grid, len) {
    for (let tries = 0; tries < 60; tries++) {
      const horiz = Math.random() < 0.5;
      const fixed = randInt(horiz ? s.H : s.W);
      const lim = horiz ? s.W : s.H;
      if ((horiz && fixed === s.exitRow) || len > lim) continue;
      const p = randInt(lim - len + 1);
      let free = true;
      for (let k = 0; k < len && free; k++) {
        free = grid[horiz ? fixed * s.W + p + k : (p + k) * s.W + fixed] < 0;
      }
      if (free) return { car: { len, horiz, fixed }, p };
    }
    return null;
  }

  function randomLayout(s) {
    const grid = new Int8Array(s.W * s.H).fill(-1);
    const red = { len: 2, horiz: true, fixed: s.exitRow };
    const cars = [red], pos = [randInt(s.W - 2)];
    mark(grid, s.W, red, pos[0], 0);
    const lens = [];
    for (let i = 0; i < s.nTrucks; i++) lens.push(3);
    for (let i = 0; i < s.nCars; i++) lens.push(2);
    for (const len of lens) {
      const spot = place(s, grid, len);
      if (!spot) return null;
      mark(grid, s.W, spot.car, spot.p, cars.length);
      cars.push(spot.car);
      pos.push(spot.p);
    }
    return { cars, pos: Uint8Array.from(pos) };
  }

  // Relocate one vehicle (or slide the red car along its row).
  function mutate(layout, s) {
    const cars = layout.cars.slice(), pos = Uint8Array.from(layout.pos);
    const grid = new Int8Array(s.W * s.H).fill(-1);
    cars.forEach((c, i) => mark(grid, s.W, c, pos[i], i));
    if (cars.length === 1 || Math.random() < 0.15) {
      mark(grid, s.W, cars[0], pos[0], -1);
      const p = randInt(s.W - 2);
      for (let k = 0; k < 2; k++) if (grid[s.exitRow * s.W + p + k] >= 0) return null;
      pos[0] = p;
      return { cars, pos };
    }
    const i = 1 + randInt(cars.length - 1);
    mark(grid, s.W, cars[i], pos[i], -1);
    const spot = place(s, grid, cars[i].len);
    if (!spot) return null;
    cars[i] = spot.car;
    pos[i] = spot.p;
    return { cars, pos };
  }

  // Choose the start: among positions needing exactly `target` moves, sorted from easiest
  // to hardest for a random solver, take the one at the trickiness fraction (0..1).
  function choose(graph, dist, h, target, trickiness) {
    const candidates = [];
    for (let s = 0; s < graph.n; s++) if (dist[s] === target) candidates.push(s);
    candidates.sort((a, b) => h[a] - h[b]);
    return candidates[Math.round(trickiness * (candidates.length - 1))];
  }

  // settings: { W, H, exitRow, nCars, nTrucks, target, trickiness, timeLimit, maxStates }
  // hooks: { onProgress({ tried, best, elapsed }), shouldStop() }
  async function generate(settings, hooks) {
    hooks = hooks || {};
    const s = settings;
    const t0 = now(), deadline = t0 + (s.timeLimit || 10000);
    const cap = s.maxStates || 150000;
    let current = null, best = null, tried = 0, stall = 0, placedAny = false, overCap = 0;
    let lastYield = now();

    while (now() < deadline && !(hooks.shouldStop && hooks.shouldStop())) {
      const restart = !current || stall > 250;
      if (restart) { current = null; stall = 0; }
      const layout = restart ? randomLayout(s) : mutate(current.layout, s);
      if (layout) {
        placedAny = true;
        tried++;
        const puzzle = { W: s.W, H: s.H, exitRow: s.exitRow, cars: layout.cars };
        const graph = Engine.explore(puzzle, layout.pos, cap);
        if (!graph) overCap++;
        if (graph && graph.solvedCount) {
          const dist = Engine.distances(graph);
          let top = 0;
          for (let i = 0; i < graph.n; i++) if (dist[i] > top) top = dist[i];
          const entry = { layout, puzzle, graph, dist, top };
          if (!current || top >= current.top) {
            stall = current && top > current.top ? 0 : stall + 1;
            current = entry;
          } else stall++;
          if (!best || top > best.top) best = entry;
          if (best.top >= s.target) break;
        } else stall++;
      }
      if (now() - lastYield > 30) {
        if (hooks.onProgress) hooks.onProgress({ tried, best: best ? best.top : 0, elapsed: now() - t0 });
        await yieldToPage();
        lastYield = now();
      }
    }

    const elapsed = now() - t0;
    if (!best || best.top < 1) {
      let error = 'No solvable puzzle found with these settings.';
      if (!placedAny) error = 'Those vehicles do not fit on this board. Try fewer, or a bigger board.';
      else if (overCap > tried / 2) error = 'Too many possible positions to search. Try more vehicles or a smaller board.';
      return { error, tried, elapsed };
    }
    const par = Math.min(s.target, best.top);
    const h = Engine.randomSolver(best.graph);
    const startState = choose(best.graph, best.dist, h, par, s.trickiness);
    const puzzle = Object.assign({}, best.puzzle, { cars: Puzzles.paint(best.puzzle.cars) });
    const graph = Object.assign({}, best.graph, { puzzle });
    return {
      puzzle, graph, dist: best.dist, h, par,
      start: Engine.positionOf(graph, startState), startState,
      reached: best.top >= s.target,
      tried, elapsed,
    };
  }

  const Generator = { generate, choose, randomLayout, mutate };
  if (typeof module === 'object' && module.exports) module.exports = Generator;
  else root.Generator = Generator;
})(typeof globalThis !== 'undefined' ? globalThis : this);
