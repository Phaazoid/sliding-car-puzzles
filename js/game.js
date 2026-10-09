// Play controller: dragging vehicles, the move counter, undo and reset, hints,
// solution playback, and winning. Moves follow the original rule: sliding the same
// vehicle again straight after counts as the same move.
(function (root) {
  'use strict';
  const Engine = root.Engine;

  function Game(view, onChange) {
    this.view = view;
    this.onChange = onChange || function () {};
    this.data = null;
    this.drag = null;
    this.timer = null;
    const host = view.host;
    host.addEventListener('pointerdown', e => this.pointerDown(e));
    host.addEventListener('pointermove', e => this.pointerMove(e));
    host.addEventListener('pointerup', e => this.pointerUp(e));
    host.addEventListener('pointercancel', e => this.pointerUp(e, true));
  }

  // data: { puzzle, graph, dist, h, start, par, side }
  Game.prototype.load = function (data) {
    this.stopSolution();
    this.data = data;
    this.view.load(data.puzzle, data.side);
    this.grid = Engine.newGrid(data.puzzle);
    this.reset();
  };

  Game.prototype.reset = function () {
    this.stopSolution();
    this.pos = Uint8Array.from(this.data.start);
    this.moves = 0;
    this.lastCar = -1;
    this.history = [];
    this.hints = 0;
    this.watched = false;
    this.won = false;
    this.view.clearHint();
    this.view.clearLane();
    this.view.groups.forEach(g => g.classList.remove('leaving', 'dragging'));
    this.view.place(this.pos);
    this.changed();
  };

  Game.prototype.state = function () {
    return Engine.stateOf(this.data.graph, this.pos);
  };

  Game.prototype.changed = function () {
    const s = this.state();
    this.onChange({
      moves: this.moves, par: this.data.par, won: this.won, playing: !!this.timer,
      canUndo: this.history.length > 0 && !this.won, left: s >= 0 ? this.data.dist[s] : -1,
      hints: this.hints, watched: this.watched,
    });
  };

  Game.prototype.apply = function (car, to) {
    this.history.push({ pos: Uint8Array.from(this.pos), moves: this.moves, lastCar: this.lastCar });
    this.pos[car] = to;
    if (car !== this.lastCar) this.moves++;
    this.lastCar = car;
    this.view.clearHint();
    this.view.moveCar(car, to);
    if (Engine.isSolved(this.data.puzzle, this.pos)) {
      this.won = true;
      this.stopSolution();
      setTimeout(() => this.view.leave(), 200);
    }
    this.changed();
  };

  Game.prototype.undo = function () {
    if (!this.history.length || this.won) return;
    this.stopSolution();
    const last = this.history.pop();
    this.pos = last.pos;
    this.moves = last.moves;
    this.lastCar = last.lastCar;
    this.view.clearHint();
    this.view.place(this.pos);
    this.changed();
  };

  Game.prototype.nextMove = function () {
    const s = this.state();
    return s < 0 ? null : Engine.bestMove(this.data.graph, this.data.dist, this.data.h, s);
  };

  Game.prototype.hint = function () {
    if (this.won || this.timer) return;
    const m = this.nextMove();
    if (!m) return;
    this.hints++;
    this.view.showHint(m.car, this.pos[m.car], m.to);
    this.changed();
  };

  Game.prototype.toggleSolution = function () {
    if (this.timer) { this.stopSolution(); this.changed(); return; }
    if (this.won) return;
    this.watched = true;
    const step = () => {
      const m = this.nextMove();
      if (!m) { this.stopSolution(); this.changed(); return; }
      this.apply(m.car, m.to);
    };
    this.timer = setInterval(step, 550);
    step();
  };

  Game.prototype.stopSolution = function () {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  };

  // --- dragging ---

  Game.prototype.pointerDown = function (e) {
    if (!this.data || this.won || this.timer || this.drag) return;
    const car = this.view.carAt(e);
    if (car < 0) return;
    e.preventDefault();
    Engine.fillGrid(this.data.puzzle, this.pos, this.grid);
    const [lo, hi] = Engine.slideRange(this.data.puzzle, this.grid, this.pos, car);
    this.drag = { car, lo, hi, from: this.pos[car], at: this.pos[car], start: this.view.pointerCells(e), step: this.view.stepOf(car), id: e.pointerId };
    try { this.view.host.setPointerCapture(e.pointerId); } catch (err) { /* pointer already released */ }
    this.view.setDragging(car, true);
    this.view.showLane(car, lo, hi);
  };

  Game.prototype.pointerMove = function (e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const [x, y] = this.view.pointerCells(e);
    const along = (x - d.start[0]) * d.step[0] + (y - d.start[1]) * d.step[1];
    d.at = Math.max(d.lo, Math.min(d.hi, d.from + along));
    this.view.moveCar(d.car, d.at);
  };

  Game.prototype.pointerUp = function (e, cancelled) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    this.view.setDragging(d.car, false);
    this.view.clearLane();
    const to = cancelled ? d.from : Math.round(d.at);
    if (to !== d.from) this.apply(d.car, to);
    else this.view.moveCar(d.car, d.from);
  };

  root.Game = Game;
})(typeof globalThis !== 'undefined' ? globalThis : this);
