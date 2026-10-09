// Page wiring: the control panel, generating puzzles, the stats panel, the toolbar, and
// keeping puzzles: Set as start, the saved-puzzles list, and share links (#p=<code>).
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const fmt = n => n.toLocaleString('en-US');
  const view = new BoardView($('board'));
  const game = new Game(view, onGameChange);
  let side = 'right', running = false, stopRequested = false, current = null;

  const setStatus = text => { $('progText').textContent = text; };
  const setSaveNote = text => { $('saveNote').textContent = text; };

  // ---- controls ----
  const isSideways = () => side === 'top' || side === 'bottom';
  const trickWord = v => (v < 34 ? 'Low' : v < 67 ? 'Medium' : 'High');

  function syncOutputs() {
    const max = isSideways() ? +$('width').value : +$('height').value;
    $('exit').max = max;
    if (+$('exit').value > max) $('exit').value = max;
    $('exitLabel').textContent = isSideways() ? 'Exit column' : 'Exit row';
    for (const id of ['width', 'height', 'exit', 'cars', 'trucks', 'target']) $(id + 'Out').textContent = $(id).value;
    $('trickOut').textContent = trickWord(+$('trick').value);
    for (const r of document.querySelectorAll('input[type=range]')) {
      r.style.setProperty('--p', (100 * (r.value - r.min) / (r.max - r.min)) + '%');
    }
  }

  function setSide(name) {
    side = name;
    for (const b of $('side').querySelectorAll('button')) {
      b.classList.toggle('on', b.dataset.side === name);
      b.setAttribute('aria-pressed', b.dataset.side === name);
    }
    syncOutputs();
  }

  for (const id of ['width', 'height', 'exit', 'cars', 'trucks', 'target', 'trick']) $(id).addEventListener('input', syncOutputs);
  $('side').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) setSide(b.dataset.side);
  });

  // The engine always has the exit on the right, so a top/bottom exit swaps width and height.
  function settings() {
    const w = +$('width').value, h = +$('height').value;
    return {
      W: isSideways() ? h : w, H: isSideways() ? w : h, exitRow: +$('exit').value - 1,
      nCars: +$('cars').value, nTrucks: +$('trucks').value,
      target: +$('target').value, trickiness: +$('trick').value / 100, timeLimit: 12000,
    };
  }

  // Point the board and vehicle sliders at a loaded puzzle, so Generate makes more like it.
  function syncPanelTo(data) {
    const p = data.puzzle, sideways = data.side === 'top' || data.side === 'bottom';
    setSide(data.side);
    $('width').value = sideways ? p.H : p.W;
    $('height').value = sideways ? p.W : p.H;
    syncOutputs();
    $('exit').value = p.exitRow + 1;
    $('cars').value = p.cars.filter((c, i) => i > 0 && c.len === 2).length;
    $('trucks').value = p.cars.filter(c => c.len === 3).length;
    syncOutputs();
  }

  // ---- generating ----
  async function generate() {
    if (running) { stopRequested = true; return; }
    running = true;
    stopRequested = false;
    const s = settings(), shownSide = side;
    $('generate').textContent = 'Stop';
    $('generate').classList.add('busy');
    $('bar').style.width = '0%';
    setStatus('Searching...');
    const result = await Generator.generate(s, {
      onProgress: p => {
        $('bar').style.width = Math.min(100, 100 * p.best / s.target) + '%';
        setStatus(`Searching... ${fmt(p.tried)} layouts tried, best so far ${p.best} moves`);
      },
      shouldStop: () => stopRequested,
    });
    running = false;
    $('generate').textContent = 'Generate puzzle';
    $('generate').classList.remove('busy');
    if (result.error) {
      $('bar').style.width = '0%';
      setStatus(result.error);
      return;
    }
    $('bar').style.width = '100%';
    const secs = (result.elapsed / 1000).toFixed(1);
    setStatus(result.reached
      ? `Found in ${secs} s · ${fmt(result.tried)} layouts tried`
      : `Best found in ${secs} s: ${result.par} moves (asked for ${s.target}) · ${fmt(result.tried)} layouts tried`);
    show(Object.assign({ side: shownSide }, result));
  }

  // ---- showing a puzzle ----
  // How the start ranks for a random solver among positions on this layout with the same par.
  function trickRank(data) {
    const { dist, h, startState: s } = data;
    let count = 0, below = 0;
    for (let t = 0; t < dist.length; t++) {
      if (dist[t] !== dist[s]) continue;
      count++;
      if (h[t] < h[s]) below++;
    }
    return { count, frac: count > 1 ? below / (count - 1) : null };
  }

  function show(data) {
    current = data;
    current.code = Puzzles.encode(data.puzzle, data.start, data.side);
    game.load(data);
    const r = data.h[data.startState];
    const rank = trickRank(data);
    $('statPar').textContent = data.par;
    $('statStates').textContent = fmt(data.graph.n);
    $('statRandom').textContent = '~' + fmt(r >= 1000 ? Math.round(r / 100) * 100 : Math.round(r / 10) * 10);
    $('statTrick').textContent = rank.frac === null ? '-' : Math.round(rank.frac * 100) + '%';
    $('statNote').textContent = rank.count > 1
      ? `Trickiness compares this start with the ${fmt(rank.count - 1)} other starts on this layout that also need ${data.par} moves.`
      : `No other start on this layout needs exactly ${data.par} moves.`;
    $('linkBox').hidden = true;
    const hash = '#p=' + current.code;
    if (location.hash !== hash) {
      try { history.replaceState(null, '', hash); } catch (e) { location.replace(hash); }
    }
    renderSaved();
  }

  // Load a puzzle from its code. Returns false (and says why) if it can't be played.
  function loadCode(code) {
    const rec = Puzzles.decode(code);
    if (!rec) { setStatus('That link does not hold a valid puzzle.'); return false; }
    const graph = Engine.explore(rec.puzzle, rec.start, 400000);
    if (!graph) { setStatus('That puzzle has too many positions to analyse.'); return false; }
    const dist = Engine.distances(graph);
    if (dist[0] < 0) { setStatus('That layout cannot be solved.'); return false; }
    if (dist[0] === 0) { setStatus('That layout is already solved.'); return false; }
    const data = { puzzle: rec.puzzle, graph, dist, h: Engine.randomSolver(graph), start: rec.start, startState: 0, par: dist[0], side: rec.side };
    $('bar').style.width = '0%';
    syncPanelTo(data);
    show(data);
    return true;
  }

  function codeFromHash() {
    const m = /[#&]p=([^&]+)/.exec(location.hash);
    return m ? decodeURIComponent(m[1]) : '';
  }

  window.addEventListener('hashchange', () => {
    const code = codeFromHash();
    if (code && current && code !== current.code && loadCode(code)) setStatus('Puzzle loaded from the link');
  });

  // ---- set as start ----
  $('setStart').addEventListener('click', () => {
    const s = game.state();
    if (s < 0 || current.dist[s] <= 0) return;
    show(Object.assign({}, current, { start: Uint8Array.from(game.pos), startState: s, par: current.dist[s] }));
    $('bar').style.width = '0%';
    setStatus(`Start set to the position on the board: par ${current.par}`);
  });

  // ---- saved puzzles (kept in this browser's localStorage) ----
  const STORE = 'rh-saved';
  function readSaved() {
    try {
      const list = JSON.parse(localStorage.getItem(STORE) || '[]');
      return Array.isArray(list) ? list.filter(e => e && typeof e.code === 'string' && Puzzles.decode(e.code)) : [];
    } catch (e) { return []; }
  }
  function writeSaved(list) {
    try { localStorage.setItem(STORE, JSON.stringify(list)); return true; } catch (e) { return false; }
  }

  function renderSaved() {
    const list = readSaved(), ul = $('savedList');
    ul.innerHTML = '';
    if (!list.length) {
      ul.innerHTML = '<li class="empty">Nothing saved yet.</li>';
      return;
    }
    for (const entry of list) {
      const rec = Puzzles.decode(entry.code), p = rec.puzzle;
      const sideways = rec.side === 'top' || rec.side === 'bottom';
      const li = document.createElement('li');
      if (current && entry.code === current.code) li.className = 'current';
      const load = document.createElement('button');
      load.type = 'button';
      load.className = 'load';
      const when = new Date(entry.saved).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      load.innerHTML = BoardView.thumb(p, rec.start, rec.side) +
        `<span><b>Par ${Number(entry.par) || '?'}</b> · ${sideways ? p.H : p.W}×${sideways ? p.W : p.H}, exit ${rec.side}<small>Saved ${when}</small></span>`;
      load.addEventListener('click', () => { if (loadCode(entry.code)) setStatus('Loaded a saved puzzle'); });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'del';
      del.setAttribute('aria-label', 'Delete this saved puzzle');
      del.innerHTML = '&times;';
      del.addEventListener('click', () => {
        writeSaved(readSaved().filter(e => e.code !== entry.code));
        renderSaved();
      });
      li.append(load, del);
      ul.append(li);
    }
  }

  $('save').addEventListener('click', () => {
    const list = readSaved();
    if (list.some(e => e.code === current.code)) { setSaveNote('This puzzle is already saved.'); return; }
    list.unshift({ code: current.code, par: current.par, saved: Date.now() });
    if (!writeSaved(list.slice(0, 60))) {
      setSaveNote('This browser is blocking storage, so puzzles cannot be saved here. Copy link still works.');
      return;
    }
    setSaveNote('Saved.');
    renderSaved();
  });

  // ---- share link ----
  $('share').addEventListener('click', async () => {
    const url = location.href.split('#')[0] + '#p=' + current.code;
    const local = location.protocol === 'file:'
      ? ' It points at the file on this computer; once the site is online, links work for anyone.' : '';
    try {
      await navigator.clipboard.writeText(url);
      setSaveNote('Link copied.' + local);
    } catch (e) {
      $('linkBox').hidden = false;
      $('linkBox').value = url;
      $('linkBox').select();
      setSaveNote('Copy the link below.' + local);
    }
  });

  // ---- toolbar ----
  function onGameChange(st) {
    $('moves').textContent = st.moves;
    $('movesWord').textContent = st.moves === 1 ? 'move' : 'moves';
    $('par').textContent = 'Par ' + st.par;
    $('undo').disabled = !st.canUndo || st.playing;
    $('reset').disabled = st.moves === 0 && !st.won;
    $('setStart').disabled = !st.canUndo || st.playing;
    $('hint').disabled = st.won || st.playing;
    $('solve').disabled = st.won;
    $('solve').innerHTML = st.playing ? '&#x25A0; Stop' : '&#x25B6; Show solution';
    const banner = $('banner');
    banner.hidden = !st.won;
    if (st.won) {
      let text = `Solved in ${st.moves} ${st.moves === 1 ? 'move' : 'moves'} · par ${st.par}`;
      if (st.watched) text += ' · solution shown';
      else if (st.hints) text += ` · ${st.hints} ${st.hints === 1 ? 'hint' : 'hints'}`;
      banner.textContent = text;
    }
  }

  let letters = false;
  try { letters = localStorage.getItem('rh-letters') === '1'; } catch (e) { /* storage blocked */ }
  function setLetters(on) {
    letters = on;
    view.setLetters(on);
    $('letters').setAttribute('aria-pressed', on);
    try { localStorage.setItem('rh-letters', on ? '1' : '0'); } catch (e) { /* storage blocked */ }
  }

  $('generate').addEventListener('click', generate);
  $('undo').addEventListener('click', () => game.undo());
  $('reset').addEventListener('click', () => game.reset());
  $('hint').addEventListener('click', () => game.hint());
  $('solve').addEventListener('click', () => game.toggleSolution());
  $('letters').addEventListener('click', () => setLetters(!letters));

  // ---- start up: a puzzle from the link if there is one, else the classic ----
  syncOutputs();
  setLetters(letters);
  const linked = codeFromHash();
  if (linked && loadCode(linked)) setStatus('Puzzle loaded from the link');
  else {
    const problem = linked ? $('progText').textContent : '';
    loadCode(Puzzles.CLASSIC);
    setStatus(problem || 'Showing the starter puzzle');
  }
})();
