// Checks the engine against the numbers the Python analysis produced for the classic
// test puzzle, then smoke-tests the generator. Run: node tests/engine.test.js
const assert = require('node:assert/strict');
const Engine = require('../js/engine.js');
const Generator = require('../js/generator.js');
const Puzzles = require('../js/puzzles.js');

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ok   ' + name); }
  catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

(async () => {
  const { puzzle, start } = Puzzles.classic();
  const graph = Engine.explore(puzzle, start);
  const dist = Engine.distances(graph);
  const h = Engine.randomSolver(graph);

  await test('classic layout is valid', () => assert.ok(Engine.isValid(puzzle, start)));
  await test('classic graph has 10,548 positions, 4,255 solved', () => {
    assert.equal(graph.n, 10548);
    assert.equal(graph.solvedCount, 4255);
  });
  await test('classic par is 26, the most in its graph', () => {
    assert.equal(dist[0], 26);
    assert.equal(Math.max(...dist), 26);
  });
  await test('random solver from the start matches Python (3617.907)', () => {
    assert.ok(Math.abs(h[0] - 3617.9065716846962) < 0.01, 'got ' + h[0]);
  });
  await test('slide ranges: red is stuck, orange can go up 1 or down 1', () => {
    const grid = Engine.fillGrid(puzzle, start, Engine.newGrid(puzzle));
    assert.deepEqual(Engine.slideRange(puzzle, grid, start, 0), [1, 1]);
    assert.deepEqual(Engine.slideRange(puzzle, grid, start, 6), [0, 2]);
  });
  await test('following bestMove from the start solves in exactly 26 moves', () => {
    let s = 0, moves = 0;
    while (dist[s] > 0) { s = Engine.bestMove(graph, dist, h, s).state; moves++; }
    assert.equal(moves, 26);
    assert.ok(Engine.isSolved(puzzle, Engine.positionOf(graph, s)));
  });
  await test('every classic state looks itself up (numeric keys)', () => {
    for (let s = 0; s < graph.n; s++) assert.equal(Engine.stateOf(graph, Engine.positionOf(graph, s)), s);
  });
  await test('string keys give the same graph as numeric keys', () => {
    const g = Engine.explore(puzzle, start, 0, { stringKeys: true });
    assert.equal(typeof g.index.keys().next().value, 'string');
    assert.equal(g.n, graph.n);
    assert.equal(g.solvedCount, graph.solvedCount);
    assert.equal(Engine.distances(g)[0], 26);
    for (let s = 0; s < g.n; s++) assert.equal(Engine.stateOf(g, Engine.positionOf(g, s)), s);
  });
  await test('a crowded 8x8 board switches to string keys', () => {
    let layout = null;
    for (let i = 0; i < 5000 && !layout; i++) layout = Generator.randomLayout({ W: 8, H: 8, exitRow: 3, nCars: 14, nTrucks: 6 });
    assert.ok(layout, 'could not place a crowded layout');
    assert.equal(Engine.keyer({ W: 8, H: 8, exitRow: 3, cars: layout.cars }).numeric, false);
    assert.equal(Engine.keyer(puzzle).numeric, true);
  });
  await test('a too-small state cap gives up instead of running away', () => {
    assert.equal(Engine.explore(puzzle, start, 500), null);
  });

  await test('generator hits a target of 12 on 6x6 and the start really has par 12', async () => {
    const r = await Generator.generate({ W: 6, H: 6, exitRow: 2, nCars: 8, nTrucks: 3, target: 12, trickiness: 0.7, timeLimit: 8000 });
    assert.ok(!r.error, r.error);
    assert.equal(r.par, 12);
    assert.ok(Engine.isValid(r.puzzle, r.start));
    const fresh = Engine.explore(r.puzzle, r.start);
    assert.equal(Engine.distances(fresh)[0], 12);
    assert.equal(r.puzzle.cars.length, 12);
    assert.equal(r.puzzle.cars.filter(c => c.len === 3).length, 3);
  });
  await test('generator works on a non-square board with the exit in another row', async () => {
    const r = await Generator.generate({ W: 7, H: 5, exitRow: 1, nCars: 7, nTrucks: 2, target: 6, trickiness: 0, timeLimit: 8000 });
    assert.ok(!r.error, r.error);
    assert.equal(r.par, 6);
    assert.ok(Engine.isValid(r.puzzle, r.start));
    assert.equal(r.puzzle.cars[0].fixed, 1);
  });
  await test('generator reports vehicles that cannot fit', async () => {
    const r = await Generator.generate({ W: 4, H: 4, exitRow: 1, nCars: 14, nTrucks: 6, target: 5, trickiness: 0.5, timeLimit: 500 });
    assert.match(r.error, /do not fit/);
  });

  await test('the classic puzzle encodes to its known code', () => {
    assert.equal(Puzzles.encode(puzzle, start, 'right'), Puzzles.CLASSIC);
    assert.equal(puzzle.cars[0].color, '#d7263d');
    assert.equal(puzzle.cars.find(c => c.letter === 'X').color, '#8e5bd6');
  });
  await test('a generated puzzle survives encode then decode, on every side', async () => {
    const r = await Generator.generate({ W: 7, H: 5, exitRow: 3, nCars: 6, nTrucks: 2, target: 5, trickiness: 0.5, timeLimit: 8000 });
    assert.ok(!r.error, r.error);
    for (const side of ['right', 'left', 'top', 'bottom']) {
      const back = Puzzles.decode(Puzzles.encode(r.puzzle, r.start, side));
      assert.equal(back.side, side);
      assert.deepEqual([back.puzzle.W, back.puzzle.H, back.puzzle.exitRow], [7, 5, 3]);
      assert.deepEqual(Array.from(back.start), Array.from(r.start));
      assert.deepEqual(back.puzzle.cars.map(c => [c.len, c.horiz, c.fixed, c.letter, c.color]),
        r.puzzle.cars.map(c => [c.len, c.horiz, c.fixed, c.letter, c.color]));
    }
    assert.equal(new Set(r.puzzle.cars.map(c => c.letter)).size, r.puzzle.cars.length, 'letters repeat');
  });
  await test('decode rejects broken codes', () => {
    for (const bad of ['', 'hello', '66r2.', '66r2.Ra21Ya21', '66r2.Ra31', '66r2.Ra25', '66r6.Ra61', '66r2.Yb03Ra21', '66x2.Ra21']) {
      assert.equal(Puzzles.decode(bad), null, bad);
    }
  });

  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exit(failures ? 1 : 0);
})();
