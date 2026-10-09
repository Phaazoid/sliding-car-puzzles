// Rush Hour engine: board model, legal moves, the full graph of reachable positions,
// par (fewest moves to solve) and the random-solver score used for trickiness.
//
// Everything here works in one canonical frame: the exit is on the RIGHT edge at row
// `exitRow`, and car 0 is the red car, lying horizontally in that row. The page rotates
// the board for display when the exit is on another side.
//
// A puzzle is { W, H, exitRow, cars: [{ len, horiz, fixed }] }, where `fixed` is the row
// (horizontal car) or column (vertical car) the car lives in. A position is a Uint8Array
// holding each car's coordinate along its lane. One move = sliding one car any distance,
// so every edge in the graph costs 1 and plain breadth-first search gives exact par.
(function (root) {
  'use strict';

  function key(pos) {
    return String.fromCharCode.apply(null, pos);
  }

  // grid[y * W + x] = index of the car on that cell, or -1 when empty.
  function fillGrid(puzzle, pos, grid) {
    grid.fill(-1);
    const W = puzzle.W, cars = puzzle.cars;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i], p = pos[i];
      for (let k = 0; k < c.len; k++) {
        if (c.horiz) grid[c.fixed * W + p + k] = i;
        else grid[(p + k) * W + c.fixed] = i;
      }
    }
    return grid;
  }

  function newGrid(puzzle) {
    return new Int8Array(puzzle.W * puzzle.H);
  }

  // How far car i can slide each way: [lowest, highest] reachable coordinate.
  function slideRange(puzzle, grid, pos, i) {
    const c = puzzle.cars[i], W = puzzle.W, p = pos[i];
    const lim = c.horiz ? W : puzzle.H;
    const occupied = c.horiz ? q => grid[c.fixed * W + q] >= 0 : q => grid[q * W + c.fixed] >= 0;
    let lo = p, hi = p;
    while (lo > 0 && !occupied(lo - 1)) lo--;
    while (hi + c.len < lim && !occupied(hi + c.len)) hi++;
    return [lo, hi];
  }

  function isSolved(puzzle, pos) {
    return pos[0] + puzzle.cars[0].len === puzzle.W;
  }

  // True when every car is on the board and no two cars overlap.
  function isValid(puzzle, pos) {
    const seen = new Uint8Array(puzzle.W * puzzle.H);
    for (let i = 0; i < puzzle.cars.length; i++) {
      const c = puzzle.cars[i], p = pos[i];
      if (p < 0 || p + c.len > (c.horiz ? puzzle.W : puzzle.H)) return false;
      if (c.fixed < 0 || c.fixed >= (c.horiz ? puzzle.H : puzzle.W)) return false;
      for (let k = 0; k < c.len; k++) {
        const cell = c.horiz ? c.fixed * puzzle.W + p + k : (p + k) * puzzle.W + c.fixed;
        if (seen[cell]) return false;
        seen[cell] = 1;
      }
    }
    return true;
  }

  // A function turning a position into a Map key. Usually a number: each car's coordinate
  // as one digit of a mixed-radix number (radix = how many spots its lane has), which a
  // single slide changes by (to - from) * radix[i]. Falls back to a string when the
  // number could exceed 2^53 (very crowded big boards).
  function keyer(puzzle) {
    const k = puzzle.cars.length, radix = new Float64Array(k);
    let span = 1;
    for (let i = 0; i < k; i++) {
      const c = puzzle.cars[i];
      radix[i] = span;
      span *= (c.horiz ? puzzle.W : puzzle.H) - c.len + 1;
    }
    if (span > Number.MAX_SAFE_INTEGER) return { numeric: false, radix, of: key };
    return {
      numeric: true, radix,
      of: pos => { let v = 0; for (let i = 0; i < k; i++) v += pos[i] * radix[i]; return v; },
    };
  }

  // Flood every position reachable from `start`. Returns null if there are more than
  // maxStates of them. States are numbered in discovery order; state 0 is `start`.
  // Adjacency is stored compactly: neighbours of s are adj[adjStart[s] .. adjStart[s+1]).
  // opts.stringKeys forces the string-key path (tests use it).
  function explore(puzzle, start, maxStates, opts) {
    const limit = maxStates || 1000000;
    const { W, H, cars } = puzzle, k = cars.length;
    const keys = opts && opts.stringKeys ? { numeric: false, of: key } : keyer(puzzle);
    const radix = keys.radix, numeric = keys.numeric;
    let store = new Uint8Array(1024 * k);
    const index = new Map();
    const adjStart = [];
    const adj = [];
    const grid = newGrid(puzzle);
    const cur = new Uint8Array(k);

    store.set(start, 0);
    index.set(keys.of(start), 0);
    let n = 1;
    for (let s = 0; s < n; s++) {
      adjStart.push(adj.length);
      cur.set(store.subarray(s * k, s * k + k));
      fillGrid(puzzle, cur, grid);
      const curKey = numeric ? keys.of(cur) : 0;
      for (let i = 0; i < k; i++) {
        const c = cars[i], p = cur[i];
        let lo = p, hi = p;
        if (c.horiz) {
          const row = c.fixed * W;
          while (lo > 0 && grid[row + lo - 1] < 0) lo--;
          while (hi + c.len < W && grid[row + hi + c.len] < 0) hi++;
        } else {
          const col = c.fixed;
          while (lo > 0 && grid[(lo - 1) * W + col] < 0) lo--;
          while (hi + c.len < H && grid[(hi + c.len) * W + col] < 0) hi++;
        }
        for (let q = lo; q <= hi; q++) {
          if (q === p) continue;
          let kk;
          if (numeric) kk = curKey + (q - p) * radix[i];
          else { cur[i] = q; kk = key(cur); cur[i] = p; }
          let t = index.get(kk);
          if (t === undefined) {
            if (n >= limit) return null;
            if ((n + 1) * k > store.length) {
              const bigger = new Uint8Array(store.length * 2);
              bigger.set(store);
              store = bigger;
            }
            t = n++;
            cur[i] = q;
            store.set(cur, t * k);
            cur[i] = p;
            index.set(kk, t);
          }
          adj.push(t);
        }
      }
    }
    adjStart.push(adj.length);

    const positions = store.slice(0, n * k);
    const solved = new Uint8Array(n);
    let solvedCount = 0;
    for (let s = 0; s < n; s++) {
      if (positions[s * k] + puzzle.cars[0].len === puzzle.W) { solved[s] = 1; solvedCount++; }
    }
    return {
      puzzle, n, k, positions, index, keyOf: keys.of, solved, solvedCount,
      adjStart: Int32Array.from(adjStart), adj: Int32Array.from(adj),
    };
  }

  function positionOf(graph, s) {
    return graph.positions.slice(s * graph.k, s * graph.k + graph.k);
  }

  function stateOf(graph, pos) {
    const s = graph.index.get(graph.keyOf(pos));
    return s === undefined ? -1 : s;
  }

  // Par for every state at once: one breadth-first search seeded with ALL solved states.
  // -1 means the state cannot reach a solved state.
  function distances(graph) {
    const { n, adj, adjStart, solved } = graph;
    const dist = new Int32Array(n).fill(-1);
    const queue = new Int32Array(n);
    let head = 0, tail = 0;
    for (let s = 0; s < n; s++) if (solved[s]) { dist[s] = 0; queue[tail++] = s; }
    while (head < tail) {
      const v = queue[head++];
      for (let e = adjStart[v]; e < adjStart[v + 1]; e++) {
        const w = adj[e];
        if (dist[w] < 0) { dist[w] = dist[v] + 1; queue[tail++] = w; }
      }
    }
    return dist;
  }

  // Expected number of moves a player making uniformly random legal moves needs to
  // reach a solved state, for every state. Solves h(v) = 1 + mean(h(neighbours)) with
  // h = 0 on solved states, rewritten as (D - A) h = deg over the unsolved states, which
  // is symmetric positive definite, so conjugate gradient converges. Returns null when
  // the graph has no solved state.
  function randomSolver(graph, maxIter, tolerance) {
    const { n, adj, adjStart, solved, solvedCount } = graph;
    if (!solvedCount) return null;
    const unknown = new Int32Array(n).fill(-1);
    const stateOfUnknown = [];
    for (let s = 0; s < n; s++) if (!solved[s]) { unknown[s] = stateOfUnknown.length; stateOfUnknown.push(s); }
    const m = stateOfUnknown.length;
    const h = new Float64Array(n);
    if (m === 0) return h;

    const deg = new Float64Array(m);
    for (let j = 0; j < m; j++) { const s = stateOfUnknown[j]; deg[j] = adjStart[s + 1] - adjStart[s]; }
    const apply = (v, out) => {
      for (let j = 0; j < m; j++) {
        const s = stateOfUnknown[j];
        let sum = deg[j] * v[j];
        for (let e = adjStart[s]; e < adjStart[s + 1]; e++) {
          const u = unknown[adj[e]];
          if (u >= 0) sum -= v[u];
        }
        out[j] = sum;
      }
    };
    const x = new Float64Array(m), r = Float64Array.from(deg), p = Float64Array.from(deg), Ap = new Float64Array(m);
    let rr = 0, bb = 0;
    for (let j = 0; j < m; j++) { rr += r[j] * r[j]; }
    bb = rr;
    const tol2 = Math.pow(tolerance || 1e-10, 2) * bb;
    const iters = maxIter || 20000;
    for (let it = 0; it < iters && rr > tol2; it++) {
      apply(p, Ap);
      let pAp = 0;
      for (let j = 0; j < m; j++) pAp += p[j] * Ap[j];
      const alpha = rr / pAp;
      let rrNew = 0;
      for (let j = 0; j < m; j++) { x[j] += alpha * p[j]; r[j] -= alpha * Ap[j]; rrNew += r[j] * r[j]; }
      const beta = rrNew / rr;
      for (let j = 0; j < m; j++) p[j] = r[j] + beta * p[j];
      rr = rrNew;
    }
    for (let j = 0; j < m; j++) h[stateOfUnknown[j]] = x[j];
    return h;
  }

  // The best next move from state s: a neighbour one move closer to solved, preferring
  // the one a random solver would find easiest to finish from. Returns
  // { state, car, to } or null when s is solved or cannot be solved.
  function bestMove(graph, dist, h, s) {
    if (dist[s] <= 0) return null;
    let best = -1;
    for (let e = graph.adjStart[s]; e < graph.adjStart[s + 1]; e++) {
      const w = graph.adj[e];
      if (dist[w] !== dist[s] - 1) continue;
      if (best < 0 || (h && h[w] < h[best])) best = w;
    }
    const k = graph.k;
    for (let i = 0; i < k; i++) {
      const to = graph.positions[best * k + i];
      if (to !== graph.positions[s * k + i]) return { state: best, car: i, to };
    }
    return null;
  }

  const Engine = {
    key, keyer, fillGrid, newGrid, slideRange, isSolved, isValid,
    explore, positionOf, stateOf, distances, randomSolver, bestMove,
  };
  if (typeof module === 'object' && module.exports) module.exports = Engine;
  else root.Engine = Engine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
