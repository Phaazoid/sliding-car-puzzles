// Board view: draws the tray once per puzzle and one <g> per vehicle, moved with CSS
// transforms so slides animate. The engine works with the exit on the right; this file
// rotates that frame for whichever side the exit is on.
(function (root) {
  'use strict';
  const S = 100, M = 30, EXTRA = 120; // cell size, tray rim, room beyond the exit (user units)
  let uid = 0;

  // map: display cell of canonical cell (x, y). hStep / vStep: display direction of a
  // canonical +1 step for a horizontal / vertical vehicle. swap: display is H wide, W tall.
  const SIDES = {
    right:  { map: (x, y, W) => [x, y],         hStep: [1, 0],  vStep: [0, 1], swap: false, out: [1, 0] },
    left:   { map: (x, y, W) => [W - 1 - x, y], hStep: [-1, 0], vStep: [0, 1], swap: false, out: [-1, 0] },
    top:    { map: (x, y, W) => [y, W - 1 - x], hStep: [0, -1], vStep: [1, 0], swap: true,  out: [0, -1] },
    bottom: { map: (x, y, W) => [y, x],         hStep: [0, 1],  vStep: [1, 0], swap: true,  out: [0, 1] },
  };

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const ch = [n >> 16, (n >> 8) & 255, n & 255].map(c => Math.round(f > 0 ? c + (255 - c) * f : c * (1 + f)));
    return '#' + ch.map(c => c.toString(16).padStart(2, '0')).join('');
  }
  function lum(hex) {
    const n = parseInt(hex.slice(1), 16);
    return (0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255;
  }
  const rect = (x, y, w, h, r, a) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ${a || ''}/>`;

  // Display rectangle [x, y, w, h] in cells of vehicle i at canonical coordinate p (may be fractional).
  function rectIn(side, puzzle, i, p) {
    const c = puzzle.cars[i], W = puzzle.W, map = side.map;
    const a = c.horiz ? map(p, c.fixed, W) : map(c.fixed, p, W);
    const b = c.horiz ? map(p + c.len - 1, c.fixed, W) : map(c.fixed, p + c.len - 1, W);
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(a[0] - b[0]) + 1, Math.abs(a[1] - b[1]) + 1];
  }

  // Tray, play area, exit gap and empty cells, for a board drawn with rim width m.
  // Colours come from the stylesheet (.tray-rim, .tray-inner, .tray-cell).
  function trayMarkup(puzzle, side, m) {
    const W = puzzle.W, DW = side.swap ? puzzle.H : W, DH = side.swap ? W : puzzle.H;
    const [ex, ey] = side.map(W - 1, puzzle.exitRow, W), [ox, oy] = side.out;
    const gap = ox ? [ox > 0 ? m + DW * S - 2 : -2, m + ey * S + 6, m + 4, S - 12]
      : [m + ex * S + 6, oy > 0 ? m + DH * S - 2 : -2, S - 12, m + 4];
    const parts = [
      rect(0, 0, DW * S + 2 * m, DH * S + 2 * m, m * .8, 'class="tray-rim"'),
      rect(m, m, DW * S, DH * S, S * .08, 'class="tray-inner"'),
      `<rect x="${gap[0]}" y="${gap[1]}" width="${gap[2]}" height="${gap[3]}" class="tray-inner"/>`,
    ];
    for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) {
      parts.push(rect(m + x * S + S * .06, m + y * S + S * .06, S * .88, S * .88, S * .1, 'class="tray-cell"'));
    }
    return parts.join('');
  }

  function BoardView(host) {
    this.host = host;
  }

  // A small still picture of a layout, for the saved-puzzles list.
  BoardView.thumb = function (puzzle, pos, sideName) {
    const side = SIDES[sideName] || SIDES.right, m = 24;
    const DW = side.swap ? puzzle.H : puzzle.W, DH = side.swap ? puzzle.W : puzzle.H;
    const parts = [`<svg xmlns="http://www.w3.org/2000/svg" class="thumb" viewBox="0 0 ${DW * S + 2 * m} ${DH * S + 2 * m}" aria-hidden="true">`,
      trayMarkup(puzzle, side, m)];
    puzzle.cars.forEach((c, i) => {
      const [x, y, w, h] = rectIn(side, puzzle, i, pos[i]);
      parts.push(rect(m + x * S + 8, m + y * S + 8, w * S - 16, h * S - 16, 18, `fill="${c.color}"`));
    });
    return parts.join('') + '</svg>';
  };

  BoardView.prototype.load = function (puzzle, sideName) {
    const side = SIDES[sideName] || SIDES.right;
    const { W, H } = puzzle;
    const DW = side.swap ? H : W, DH = side.swap ? W : H;
    const TW = DW * S + 2 * M, TH = DH * S + 2 * M;
    const id = 'rh' + (++uid);
    Object.assign(this, { puzzle, side, DW, DH, TW, TH, id });

    const vb = side.swap ? [0, -EXTRA, TW, TH + 2 * EXTRA] : [-EXTRA, 0, TW + 2 * EXTRA, TH];
    const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" class="board-svg"><defs>`];
    puzzle.cars.forEach((c, i) => out.push(
      `<linearGradient id="${id}g${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(c.color, .28)}"/><stop offset="1" stop-color="${shade(c.color, -.12)}"/></linearGradient>`));
    out.push(`<marker id="${id}ah" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#fff"/></marker></defs>`);

    out.push(trayMarkup(puzzle, side, M));
    const [ex, ey] = side.map(W - 1, puzzle.exitRow, W);
    const [ox, oy] = side.out, edge = side.out[0] ? [ox > 0 ? TW : 0, M + ey * S + S / 2] : [M + ex * S + S / 2, oy > 0 ? TH : 0];
    for (let i = 0; i < 2; i++) {
      const d = S * .35 + i * S * .3, ax = edge[0] + ox * d, ay = edge[1] + oy * d, a = S * .18;
      out.push(`<path class="exit-arrow" d="M${ax - ox * a - oy * a} ${ay - oy * a + ox * a} L${ax} ${ay} L${ax - ox * a + oy * a} ${ay - oy * a - ox * a}" fill="none" stroke="#f2c12e" stroke-width="${S * .07}" stroke-linecap="round" stroke-linejoin="round" opacity="${.9 - i * .35}"/>`);
    }
    out.push('<g class="lane"></g><g class="cars">');
    puzzle.cars.forEach((c, i) => out.push(this.carMarkup(i)));
    out.push('</g><g class="overlay"></g></svg>');

    this.host.innerHTML = out.join('');
    this.svg = this.host.querySelector('svg');
    this.laneLayer = this.svg.querySelector('.lane');
    this.overlay = this.svg.querySelector('.overlay');
    this.groups = Array.from(this.svg.querySelectorAll('.car'));
  };

  // Display rectangle [x, y, w, h] in cells of vehicle i at canonical coordinate p (may be fractional).
  BoardView.prototype.rectOf = function (i, p) {
    return rectIn(this.side, this.puzzle, i, p);
  };

  // Display direction of a canonical +1 step for vehicle i.
  BoardView.prototype.stepOf = function (i) {
    return this.puzzle.cars[i].horiz ? this.side.hStep : this.side.vStep;
  };

  BoardView.prototype.carMarkup = function (i) {
    const c = this.puzzle.cars[i], [, , dw, dh] = this.rectOf(i, 0), along = dw > dh;
    const P = S * .07, w = dw * S - 2 * P, h = dh * S - 2 * P, r = S * .2;
    const step = this.stepOf(i), frontAtEnd = step[0] + step[1] > 0;
    const parts = [`<g class="car${i === 0 ? ' red' : ''}" data-car="${i}">`];
    parts.push(rect(P + 2, P + 4, w, h, r, 'class="shadow" fill="rgba(0,0,0,.38)"'));
    parts.push(rect(P, P, w, h, r, `fill="url(#${this.id}g${i})"`));
    parts.push(rect(P + S * .08, P + S * .06, w - S * .16, Math.min(w, h) * .28, r * .6, 'fill="#fff" opacity=".16"'));
    // windows (a..b in cells along the vehicle), mirrored when the front faces the start
    const win = (a, b, fill) => {
      if (!frontAtEnd) [a, b] = [c.len - b, c.len - a];
      return along ? rect(P + a * S - P, P + S * .2 - P, (b - a) * S, h - S * .4 + 2 * P, S * .07, fill)
        : rect(P + S * .2 - P, P + a * S - P, w - S * .4 + 2 * P, (b - a) * S, S * .07, fill);
    };
    if (c.len === 2) { parts.push(win(.22, .44, 'fill="rgba(12,16,24,.5)"')); parts.push(win(1.08, 1.42, 'fill="rgba(12,16,24,.5)"')); }
    else { parts.push(win(.14, 1.98, 'fill="#fff" opacity=".13"')); parts.push(win(2.2, 2.55, 'fill="rgba(12,16,24,.5)"')); }
    parts.push(rect(P - 4, P - 4, w + 8, h + 8, r + 4, 'class="ring" fill="none" stroke="#fff" stroke-width="4"'));
    const tc = lum(c.color) > .6 ? '#1b1f27' : '#fff';
    parts.push(`<text class="letter" x="${P + w / 2}" y="${P + h / 2}" text-anchor="middle" dominant-baseline="central" font-size="${S * .4}" font-weight="700" fill="${tc}">${c.letter}</text>`);
    parts.push('</g>');
    return parts.join('');
  };

  BoardView.prototype.moveCar = function (i, p) {
    const [x, y] = this.rectOf(i, p);
    this.groups[i].style.transform = `translate(${M + x * S}px, ${M + y * S}px)`;
  };

  BoardView.prototype.place = function (pos) {
    for (let i = 0; i < pos.length; i++) this.moveCar(i, pos[i]);
  };

  BoardView.prototype.setDragging = function (i, on) {
    this.groups[i].classList.toggle('dragging', on);
  };

  BoardView.prototype.cellsRect = function (layer, i, from, to, attrs) {
    const parts = [];
    const c = this.puzzle.cars[i], W = this.puzzle.W;
    for (let q = from; q <= to; q++) {
      const [x, y] = c.horiz ? this.side.map(q, c.fixed, W) : this.side.map(c.fixed, q, W);
      parts.push(rect(M + x * S + S * .05, M + y * S + S * .05, S * .9, S * .9, S * .12, attrs));
    }
    layer.innerHTML = parts.join('');
  };

  // Light up every cell vehicle i can occupy, from coordinate lo to hi.
  BoardView.prototype.showLane = function (i, lo, hi) {
    this.cellsRect(this.laneLayer, i, lo, hi + this.puzzle.cars[i].len - 1,
      'fill="rgba(110,231,150,.22)" stroke="rgba(110,231,150,.85)" stroke-width="3" stroke-dasharray="9 7"');
  };

  BoardView.prototype.clearLane = function () {
    this.laneLayer.innerHTML = '';
  };

  // Dashed outline where vehicle i should go, and an arrow from where it is now.
  BoardView.prototype.showHint = function (i, from, to) {
    const P = S * .07, [gx, gy, gw, gh] = this.rectOf(i, to), [cx, cy, cw, ch] = this.rectOf(i, from);
    const centre = (x, y, w, h) => [M + (x + w / 2) * S, M + (y + h / 2) * S];
    const [x1, y1] = centre(cx, cy, cw, ch), [x2, y2] = centre(gx, gy, gw, gh);
    const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    this.overlay.innerHTML =
      rect(M + gx * S + P, M + gy * S + P, gw * S - 2 * P, gh * S - 2 * P, S * .2, 'fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="12 9"') +
      `<line x1="${x1 + ux * S * .1}" y1="${y1 + uy * S * .1}" x2="${x2 - ux * S * .25}" y2="${y2 - uy * S * .25}" stroke="#fff" stroke-width="${S * .08}" stroke-linecap="round" marker-end="url(#${this.id}ah)"/>`;
    this.groups[i].classList.add('hinted');
  };

  BoardView.prototype.clearHint = function () {
    this.overlay.innerHTML = '';
    for (const g of this.groups) g.classList.remove('hinted');
  };

  // The red car drives out through the exit.
  BoardView.prototype.leave = function () {
    this.groups[0].classList.add('leaving');
    this.moveCar(0, this.puzzle.W + 1.5);
  };

  BoardView.prototype.setLetters = function (on) {
    this.host.classList.toggle('show-letters', on);
  };

  // Pointer position in display cells (fractional), and the vehicle under the pointer.
  BoardView.prototype.pointerCells = function (evt) {
    const pt = this.svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const p = pt.matrixTransform(this.svg.getScreenCTM().inverse());
    return [(p.x - M) / S, (p.y - M) / S];
  };

  BoardView.prototype.carAt = function (evt) {
    const g = evt.target.closest && evt.target.closest('.car');
    return g ? Number(g.dataset.car) : -1;
  };

  root.BoardView = BoardView;
})(typeof globalThis !== 'undefined' ? globalThis : this);
