// Puzzle records: the vehicle palette (each letter has its own colour), the classic test
// puzzle, and the short text code used for saved puzzles and share links.
//
// A code is written in the engine's canonical frame (exit on the right):
//   <W><H><side><exitRow>.<vehicle><vehicle>...
// side is r/l/t/b, the side the exit is drawn on. Each vehicle is four characters:
// letter, kind (a = horizontal 2, b = horizontal 3, c = vertical 2, d = vertical 3),
// lane (its row or column) and position along the lane. The red car comes first.
(function (root) {
  'use strict';
  const Engine = root.Engine || require('./engine.js');

  const COLORS = {
    R: '#d7263d',
    Y: '#f2c12e', C: '#5bc0eb', M: '#7b2d6e', N: '#2a2a2e', B: '#1f4e9c', O: '#f28c28',
    G: '#1d6b3c', P: '#f2a1c0', S: '#8fd17e', X: '#8e5bd6', Z: '#d8c69c',
    A: '#20b2aa', D: '#a0522d', E: '#c0c6cf', F: '#b5e61d', H: '#e8a0ff', I: '#ff7f50',
    Q: '#87ceeb', U: '#808000', W: '#ffd1a1',
    J: '#2f9e8f', K: '#5a6b7b', L: '#c46b2f', T: '#4b3a8c', V: '#9c1f6e',
  };
  // Letters handed out to generated puzzles, the classic set's colours first.
  const CAR_LETTERS = 'COGPSZMNADEFHIQUW';
  const TRUCK_LETTERS = 'YBXJKLTV';
  const SIDE_CODES = { right: 'r', left: 'l', top: 't', bottom: 'b' };
  const SIDE_NAMES = { r: 'right', l: 'left', t: 'top', b: 'bottom' };
  const KINDS = 'abcd';

  // The test puzzle from the original Python code.
  const CLASSIC = '66r2.Ra21Yb03Ca14Ma34Na42Bb51Oc01Gc04Pc13Sc20Xd31Zc54';

  function vehicle(letter, len, horiz, fixed) {
    return { len, horiz, fixed, letter, color: COLORS[letter] || '#9aa3b4' };
  }

  // Give a generated puzzle's vehicles their letters and colours. Car 0 is the red car.
  function paint(cars) {
    let car = 0, truck = 0;
    return cars.map((c, i) => {
      const letter = i === 0 ? 'R' : (c.len === 3 ? TRUCK_LETTERS[truck++] : CAR_LETTERS[car++]) || '?';
      return vehicle(letter, c.len, c.horiz, c.fixed);
    });
  }

  function encode(puzzle, start, side) {
    let code = `${puzzle.W}${puzzle.H}${SIDE_CODES[side] || 'r'}${puzzle.exitRow}.`;
    puzzle.cars.forEach((c, i) => {
      code += c.letter + KINDS[(c.horiz ? 0 : 2) + (c.len === 3 ? 1 : 0)] + c.fixed + start[i];
    });
    return code;
  }

  // Returns { puzzle, start, side }, or null unless the code describes a legal layout with
  // the red car first, lying in the exit row.
  function decode(code) {
    const m = /^([3-9])([3-9])([rltb])(\d)\.((?:[A-Z?][a-d]\d\d)+)$/.exec(String(code || '').trim());
    if (!m) return null;
    const W = +m[1], H = +m[2], exitRow = +m[4];
    if (exitRow >= H) return null;
    const cars = [], start = [];
    for (let i = 0; i < m[5].length; i += 4) {
      const k = KINDS.indexOf(m[5][i + 1]);
      cars.push(vehicle(m[5][i], k % 2 ? 3 : 2, k < 2, +m[5][i + 2]));
      start.push(+m[5][i + 3]);
    }
    const red = cars[0];
    if (red.letter !== 'R' || !red.horiz || red.len !== 2 || red.fixed !== exitRow) return null;
    const puzzle = { W, H, exitRow, cars };
    const pos = Uint8Array.from(start);
    if (!Engine.isValid(puzzle, pos)) return null;
    return { puzzle, start: pos, side: SIDE_NAMES[m[3]] };
  }

  function classic() {
    return decode(CLASSIC);
  }

  const Puzzles = { CLASSIC, COLORS, classic, paint, encode, decode };
  if (typeof module === 'object' && module.exports) module.exports = Puzzles;
  else root.Puzzles = Puzzles;
})(typeof globalThis !== 'undefined' ? globalThis : this);
