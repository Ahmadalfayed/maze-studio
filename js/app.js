/**
 * app.js — ربط الواجهة بالمنطق: الإعدادات، التوليد (فوري/متحرك)، الحل المتحرك،
 * اللعب، الإحصاءات، السمة، الحفظ المحلي، والتصدير.
 */
(function (MS) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const STORE_KEY = 'mazeStudio.v1';

  const PALETTES = {
    light: { wall: '#1e293b', bg: '#ffffff', path: '#f97316', start: '#10b981', end: '#ef4444', player: '#6366f1' },
    dark: { wall: '#e2e8f0', bg: '#0f172a', path: '#fb923c', start: '#34d399', end: '#f87171', player: '#a5b4fc' }
  };
  const EXTRA = { light: { visit: '#38bdf8', current: '#f59e0b' }, dark: { visit: '#0ea5e9', current: '#fbbf24' } };

  /** مستويات الصعوبة: الحجم + الخوارزمية + التضفير + حجم الخلية */
  const PRESETS = {
    easy: { width: 10, height: 10, rings: 6, algorithm: 'backtracker', braid: 40, cellSize: 34, wallWidth: 4, note: 'سهل: 10×10، ممرات طويلة (DFS)، 40% أقل طرقاً مسدودة.' },
    medium: { width: 18, height: 18, rings: 10, algorithm: 'kruskal', braid: 15, cellSize: 26, wallWidth: 3, note: 'متوسط: 18×18، Kruskal، تضفير 15%.' },
    hard: { width: 30, height: 30, rings: 16, algorithm: 'prim', braid: 5, cellSize: 18, wallWidth: 2, note: 'صعب: 30×30، Prim (تفرعات كثيرة)، تضفير 5%.' },
    expert: { width: 50, height: 50, rings: 26, algorithm: 'wilson', braid: 0, cellSize: 13, wallWidth: 2, note: 'خبير: 50×50، Wilson المنتظمة، متاهة مثالية بلا حلقات.' }
  };

  const DEFAULTS = {
    preset: 'medium', shape: 'square', algorithm: 'kruskal', width: 18, height: 18, rings: 10, braid: 15,
    seed: '', placement: 'corners', openings: true, cellSize: 26, wallWidth: 3,
    colors: Object.assign({}, PALETTES.light), animate: false, speed: 55, theme: null,
    maskType: 'heart', maskText: 'وطن', maskThreshold: 50, maskInvert: false, maskJoin: 'bridge'
  };

  const state = {
    s: null,           // الإعدادات الحالية
    maze: null,        // المتاهة النهائية
    genGrid: null,     // الشبكة أثناء التوليد المتحرك
    overlay: {},       // عناصر مؤقتة للرسم (marks/current/explored/partialPath)
    showSolution: false,
    anim: null,
    layout: null,
    maskImage: null    // صورة القناع المرفوعة (لا تُحفظ محلياً)
  };

  /* ----------------------------- التخزين ----------------------------- */
  function load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { saved = {}; }
    const s = Object.assign({}, DEFAULTS, saved);
    s.colors = Object.assign({}, DEFAULTS.colors, saved.colors || {});
    if (!s.theme) s.theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    if (!s.seed) s.seed = MS.randomSeedString();
    return s;
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state.s)); } catch (e) { /* قد يكون التخزين معطّلاً */ } }

  /* ------------------------------ أدوات ------------------------------ */
  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }
  const fmtTime = (ms) => { const s = Math.floor(ms / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  const clampInt = (v, lo, hi, def) => { v = parseInt(v, 10); return isNaN(v) ? def : Math.min(hi, Math.max(lo, v)); };
  const colorsFull = () => Object.assign({}, state.s.colors, EXTRA[state.s.theme] || EXTRA.light);
  /** نسخة من الإعدادات للتوليد مع الصورة المرفوعة */
  const genSettings = () => Object.assign({}, state.s, { maskImage: state.maskImage });
  const view = () => ({ cellSize: state.s.cellSize, wallWidth: state.s.wallWidth, colors: colorsFull() });

  /* ------------------------------ الرسم ------------------------------ */
  const canvas = $('mazeCanvas');
  const ctx = canvas.getContext('2d');

  function currentGrid() { return state.maze ? state.maze.grid : state.genGrid; }

  function render() {
    const g = currentGrid();
    if (!g) return;
    const s = state.s, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const L = MS.layout(g, s.cellSize, s.wallWidth);
    if (canvas.width !== Math.round(L.W * dpr) || canvas.height !== Math.round(L.H * dpr)) {
      canvas.width = Math.round(L.W * dpr); canvas.height = Math.round(L.H * dpr);
      state.layout = L; fitCanvas();
    }
    state.layout = L;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ov = state.overlay;
    const opts = {
      cellSize: s.cellSize, wallWidth: s.wallWidth, colors: colorsFull(),
      maze: state.maze, openings: state.maze ? state.maze.openings : null,
      showSolution: state.showSolution && !play.active,
      marks: ov.marks, current: ov.current, explored: ov.explored, partialPath: ov.partialPath
    };
    if (play.active && state.maze) { opts.trail = play.trail; opts.player = play.pos; }
    MS.paintMaze(new MS.CanvasPainter(ctx), g, opts);
  }

  /** ملاءمة حجم العرض للمساحة المتاحة مع الحفاظ على النسبة */
  function fitCanvas() {
    const L = state.layout;
    if (!L) return;
    const wrap = $('canvasWrap');
    const availW = Math.max(120, wrap.clientWidth - 40);
    const availH = Math.max(240, window.innerHeight * 0.78);
    const k = Math.min(1, availW / L.W, availH / L.H);
    canvas.style.width = Math.floor(L.W * k) + 'px';
    canvas.style.height = Math.floor(L.H * k) + 'px';
  }

  /* --------------------------- الإحصاءات --------------------------- */
  const SHAPE_NAMES = { square: 'مربعة', polar: 'دائرية', hex: 'سداسية', tri: 'مثلثية', masked: 'شكل مخصّص', weave: 'منسوجة' };
  function updateStats() {
    const m = state.maze;
    if (!m) { $('mazeChip').textContent = 'جارٍ التوليد…'; ['sDims', 'sCells', 'sDead', 'sSol', 'sLoops', 'sTime'].forEach((id) => { $(id).textContent = '…'; }); return; }
    const st = m.stats;
    $('sDims').textContent = (m.shape === 'polar' ? SHAPE_NAMES[m.shape] + ' • ' + m.grid.describe() : SHAPE_NAMES[m.shape] + ' • ' + m.grid.cols + '×' + m.grid.rows);
    $('sDims').title = $('sDims').textContent;
    $('sAlgo').textContent = MS.ALGORITHMS[m.algorithm].name;
    $('sSeed').textContent = m.seed;
    $('sCells').textContent = st.cells.toLocaleString('en');
    $('sDead').textContent = st.deadEnds + ' (' + Math.round(100 * st.deadEnds / st.cells) + '%)';
    $('sSol').textContent = st.solutionLength + ' خلية';
    $('sLoops').textContent = st.loops === 0 ? '0 (مثالية)' : String(st.loops);
    $('sTime').textContent = st.timeMs < 1 ? '< 1 م.ث' : Math.round(st.timeMs) + ' م.ث';
    const shapeLbl = m.shape === 'masked' ? (MS.MASK_TYPES[state.s.maskType] || '').replace(/\s*\(.*\)/, '') : SHAPE_NAMES[m.shape];
    $('mazeChip').textContent = shapeLbl + ' • ' + m.grid.cols + '×' + m.grid.rows + ' • ' + MS.ALGORITHMS[m.algorithm].name;
    if (m.shape === 'masked' && m.maskInfo) {
      const mi = m.maskInfo, parts = [];
      if (mi.note) parts.push(mi.note);
      if (mi.parts > 1) parts.push('عدد الأجزاء: ' + mi.parts + (mi.bridged ? ' — أُضيفت ' + mi.bridged + ' خلية جسور لوصلها.' : mi.removed ? ' — حُذفت ' + mi.removed + ' خلية خارج الجزء الأكبر.' : ''));
      $('maskNote').textContent = parts.join(' ');
    } else $('maskNote').textContent = '';
  }
  function setStatus(t) { $('status').textContent = t || ''; }

  /* ----------------------------- الحركة ----------------------------- */
  function cancelAnim() {
    if (state.anim) { cancelAnimationFrame(state.anim.raf); state.anim = null; }
    state.overlay = {};
    setStatus('');
  }
  /** خطوات لكل إطار حسب السرعة (1..100) — أسية لتغطية مدى واسع */
  const rate = () => 0.15 * Math.pow(1.085, state.s.speed);

  /** حلقة رسوم عامة: step() تُرجع false عند الانتهاء */
  function runAnim(step, onDone, label) {
    let acc = 0;
    setStatus(label);
    const frame = () => {
      acc += rate();
      let alive = true;
      while (acc >= 1 && alive) { alive = step(); acc -= 1; }
      render();
      if (alive) state.anim.raf = requestAnimationFrame(frame);
      else { state.anim = null; setStatus(''); onDone(); }
    };
    state.anim = { raf: requestAnimationFrame(frame) };
  }

  /* ----------------------------- التوليد ----------------------------- */
  function generate(opts) {
    opts = opts || {};
    cancelAnim();
    if (play.active) play.stop();
    hideWin();
    const s = state.s;
    if (opts.newSeed) { s.seed = MS.randomSeedString(); $('seed').value = s.seed; }
    save();
    const settings = genSettings();
    const animate = opts.animate !== undefined ? opts.animate : s.animate;
    const t0 = performance.now();
    const prep = MS.prepare(settings);
    if (!animate) {
      MS.runAll(prep.gen);
      state.maze = MS.finalize(prep, settings, t0);
      state.genGrid = null;
      render(); updateStats();
      return;
    }
    state.maze = null; state.genGrid = prep.grid;
    updateStats();
    $('sAlgo').textContent = MS.ALGORITHMS[prep.algorithm].name;
    $('sSeed').textContent = settings.seed;
    render();
    runAnim(() => {
      const r = prep.gen.next();
      if (r.done) return false;
      const v = r.value || {};
      state.overlay = { current: v.cur, marks: v.mark };
      return true;
    }, () => {
      state.overlay = {};
      state.maze = MS.finalize(prep, settings);
      state.maze.stats.timeMs = 0;
      state.genGrid = null;
      render(); updateStats();
      $('sTime').textContent = 'متحرك';
    }, 'جارٍ التوليد…');
  }

  /* ------------------------------ الحل ------------------------------ */
  function setSolution(on) {
    state.showSolution = on;
    $('btnSolution').setAttribute('aria-pressed', on ? 'true' : 'false');
    $('btnSolution').querySelector('.lbl').textContent = on ? 'إخفاء الحل' : 'إظهار الحل';
    render();
  }
  function animateSolve() {
    if (!state.maze) return;
    cancelAnim();
    if (play.active) play.stop();
    setSolution(false);
    const m = state.maze, gen = MS.solveSteps(m.grid, m.start, m.end);
    runAnim(() => {
      const r = gen.next();
      if (r.done) return false;
      state.overlay = { explored: r.value.visited, partialPath: r.value.path };
      return true;
    }, () => { state.overlay = {}; setSolution(true); }, 'جارٍ الحل (بحث بالعرض BFS)…');
  }

  /* ------------------------------ اللعب ------------------------------ */
  const play = new MS.PlayMode({
    canvas: canvas,
    getMaze: () => state.maze,
    getLayout: () => state.layout,
    render: render,
    onUpdate: (p) => {
      $('hud').hidden = !p.active;
      $('btnPlay').hidden = p.active;
      $('hudTime').textContent = fmtTime(p.elapsed || 0);
      $('hudMoves').textContent = p.moves || 0;
    },
    onWin: (p) => {
      const opt = state.maze.solution.length - 1;
      const eff = p.moves > 0 ? Math.round(100 * opt / p.moves) : 100;
      $('winText').textContent = 'الزمن: ' + fmtTime(p.elapsed) + ' • الخطوات: ' + p.moves + ' • أقصر حل: ' + opt + ' خطوة • الكفاءة: ' + eff + '%';
      $('winOverlay').hidden = false;
    }
  });
  function startPlay() {
    if (!state.maze) return;
    cancelAnim();
    hideWin();
    play.start();
    canvas.focus && canvas.focus();
    toast('ابدأ الحل! الأسهم/WASD أو السحب بالفأرة');
  }
  function hideWin() { $('winOverlay').hidden = true; }

  /* --------------------------- مزامنة الواجهة --------------------------- */
  function fillAlgorithms() {
    const sel = $('algorithm'), shape = state.s.shape;
    sel.innerHTML = '';
    for (const key in MS.ALGORITHMS) {
      const a = MS.ALGORITHMS[key], ok = a.shapes.indexOf(shape) >= 0;
      const o = document.createElement('option');
      o.value = key; o.textContent = a.name + (ok ? '' : (shape === 'weave' ? ' — غير متاحة للمنسوجة' : ' — للمربعة فقط'));
      o.disabled = !ok;
      sel.appendChild(o);
    }
    if (MS.resolveAlgorithm(state.s.algorithm, shape) !== state.s.algorithm) state.s.algorithm = 'backtracker';
    sel.value = state.s.algorithm;
    $('algoNote').textContent = shape === 'square' ? 'جميع الخوارزميات متاحة للشكل المربع.'
      : shape === 'weave' ? 'المتاهة المنسوجة تستخدم Kruskal مع جسور موضوعة مسبقاً (الممر يعبر من تحت الآخر).'
      : 'خوارزميات Eller والشجرة الثنائية وSidewinder والتقسيم العودي تعتمد على صفوف وأعمدة كاملة فهي للمربعة فقط.';
  }

  function syncUI() {
    const s = state.s;
    $('shape').value = s.shape;
    fillAlgorithms();
    [['width', s.width], ['height', s.height], ['rings', s.rings]].forEach(([k, v]) => { $(k).value = v; $(k + 'R').value = v; });
    const polar = s.shape === 'polar';
    $('triNote').hidden = s.shape !== 'tri';
    $('maskBox').hidden = s.shape !== 'masked';
    $('maskType').value = s.maskType;
    $('maskTextRow').hidden = s.maskType !== 'text';
    $('maskImageRow').hidden = s.maskType !== 'image';
    if (document.activeElement !== $('maskText')) $('maskText').value = s.maskText;
    $('maskThreshold').value = s.maskThreshold; $('maskThresholdOut').textContent = s.maskThreshold + '%';
    $('maskInvert').checked = s.maskInvert;
    $('maskJoin').value = s.maskJoin;
    $('rowWidth').hidden = polar; $('rowHeight').hidden = polar; $('rowRings').hidden = !polar;
    $('braid').value = s.braid; $('braidOut').textContent = s.braid + '%';
    $('seed').value = s.seed;
    $('placement').value = s.placement;
    $('openings').checked = s.openings;
    $('cellSize').value = s.cellSize; $('cellSizeOut').textContent = s.cellSize + 'px';
    $('wallWidth').value = s.wallWidth; $('wallWidthOut').textContent = s.wallWidth + 'px';
    const cmap = { cWall: 'wall', cBg: 'bg', cPath: 'path', cStart: 'start', cEnd: 'end', cPlayer: 'player' };
    for (const id in cmap) $(id).value = s.colors[cmap[id]];
    $('animateGen').checked = s.animate;
    $('speed').value = s.speed; $('speedOut').textContent = s.speed;
    document.querySelectorAll('#presets button').forEach((b) => b.classList.toggle('active', b.dataset.preset === s.preset));
    $('presetNote').textContent = PRESETS[s.preset] ? PRESETS[s.preset].note : 'إعدادات مخصصة.';
    document.documentElement.setAttribute('data-theme', s.theme);
    const card = $('canvasCard');
    card.style.setProperty('--c-start', s.colors.start);
    card.style.setProperty('--c-end', s.colors.end);
  }

  function applyPreset(name) {
    const p = PRESETS[name];
    if (!p) return;
    Object.assign(state.s, { preset: name, width: p.width, height: p.height, rings: p.rings, braid: p.braid, cellSize: p.cellSize, wallWidth: p.wallWidth });
    // الأقنعة تحتاج دقة أعلى ليظهر الشكل: نضاعف الأبعاد (والنص يأخذ أبعاده حسب طول الكلمة)
    if (state.s.shape === 'masked') {
      if (state.s.maskType === 'text') Object.assign(state.s, textSize(), { cellSize: Math.min(p.cellSize, 14) });
      else Object.assign(state.s, { width: Math.min(120, p.width * 2), height: Math.min(120, p.height * 2), cellSize: Math.max(8, Math.round(p.cellSize / 1.6)) });
    }
    state.s.algorithm = MS.resolveAlgorithm(p.algorithm, state.s.shape);
    syncUI();
    generate({ newSeed: true });
  }

  /** تغيير إعداد: rebuild=true يعيد بناء المتاهة بنفس البذرة، وإلا يعيد الرسم فقط */
  function change(patch, rebuild, keepPreset) {
    Object.assign(state.s, patch);
    if (!keepPreset) state.s.preset = 'custom';
    syncUI();
    save();
    if (rebuild) generate({ animate: false }); else { render(); }
  }

  /* ----------------------------- السمة ----------------------------- */
  function toggleTheme() {
    const s = state.s, from = s.theme, to = from === 'dark' ? 'light' : 'dark';
    // إذا كانت الألوان افتراضية للسمة الحالية، ننتقل لألوان السمة الجديدة
    const isDefault = Object.keys(PALETTES[from]).every((k) => s.colors[k].toLowerCase() === PALETTES[from][k]);
    s.theme = to;
    if (isDefault) s.colors = Object.assign({}, PALETTES[to]);
    syncUI(); save(); render();
  }

  /* ----------------------------- الأحداث ----------------------------- */
  function bind() {
    document.querySelectorAll('#presets button').forEach((b) => b.addEventListener('click', () => applyPreset(b.dataset.preset)));
    $('shape').addEventListener('change', (e) => {
      const patch = { shape: e.target.value };
      if (patch.shape === 'masked' && state.s.maskType === 'text') Object.assign(patch, textSize());
      change(patch, true, true);
    });

    // أقنعة الأشكال
    const mt = $('maskType');
    for (const k in MS.MASK_TYPES) { const o = document.createElement('option'); o.value = k; o.textContent = MS.MASK_TYPES[k]; mt.appendChild(o); }
    mt.value = state.s.maskType;
    mt.addEventListener('change', (e) => {
      const v = e.target.value, patch = { maskType: v };
      if (v === 'text') Object.assign(patch, textSize());
      else if (state.s.maskType === 'text') Object.assign(patch, { width: 32, height: 32 });
      change(patch, true, true);
    });
    let textTimer = null;
    $('maskText').addEventListener('input', (e) => {
      clearTimeout(textTimer);
      textTimer = setTimeout(() => change({ maskText: e.target.value }, true, true), 250);
    });
    $('maskThreshold').addEventListener('input', (e) => change({ maskThreshold: clampInt(e.target.value, 5, 95, 50) }, true, true));
    $('maskInvert').addEventListener('change', (e) => change({ maskInvert: e.target.checked }, true, true));
    $('maskJoin').addEventListener('change', (e) => change({ maskJoin: e.target.value }, true, true));
    $('maskFile').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => { state.maskImage = img; $('maskFileName').textContent = f.name; change({ maskType: 'image' }, true, true); toast('تم تحميل الصورة كقناع'); };
        img.onerror = () => toast('تعذّر قراءة الصورة');
        img.src = reader.result;
      };
      reader.readAsDataURL(f);
    });

    // التبويبات
    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((x) => { x.classList.toggle('active', x === t); x.setAttribute('aria-selected', x === t ? 'true' : 'false'); });
      document.querySelectorAll('.tab-pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === t.dataset.tab));
    }));
    $('algorithm').addEventListener('change', (e) => change({ algorithm: e.target.value }, true));

    const dim = (key, lo, hi) => {
      const handler = (e) => change({ [key]: clampInt(e.target.value, lo, hi, state.s[key]) }, true);
      $(key).addEventListener('change', handler);
      $(key + 'R').addEventListener('input', handler);
    };
    dim('width', 2, 120); dim('height', 2, 120); dim('rings', 3, 60);
    $('braid').addEventListener('input', (e) => change({ braid: clampInt(e.target.value, 0, 100, 0) }, true));

    $('seed').addEventListener('change', (e) => { const v = e.target.value.trim() || MS.randomSeedString(); change({ seed: v }, true, true); });
    $('btnDice').addEventListener('click', () => generate({ newSeed: true }));
    $('btnCopySeed').addEventListener('click', () => {
      const v = state.s.seed;
      const done = () => toast('تم نسخ البذرة: ' + v);
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(v).then(done, () => { $('seed').select(); document.execCommand('copy'); done(); });
      else { $('seed').select(); document.execCommand('copy'); done(); }
    });

    $('placement').addEventListener('change', (e) => change({ placement: e.target.value }, true, true));
    $('openings').addEventListener('change', (e) => change({ openings: e.target.checked }, true, true));
    $('cellSize').addEventListener('input', (e) => change({ cellSize: clampInt(e.target.value, 6, 60, 20) }, false, true));
    $('wallWidth').addEventListener('input', (e) => change({ wallWidth: clampInt(e.target.value, 1, 12, 2) }, false, true));
    const cmap = { cWall: 'wall', cBg: 'bg', cPath: 'path', cStart: 'start', cEnd: 'end', cPlayer: 'player' };
    for (const id in cmap) $(id).addEventListener('input', (e) => { state.s.colors[cmap[id]] = e.target.value; save(); syncUI(); render(); });
    $('btnResetColors').addEventListener('click', () => change({ colors: Object.assign({}, PALETTES[state.s.theme]) }, false, true));
    $('animateGen').addEventListener('change', (e) => change({ animate: e.target.checked }, false, true));
    $('speed').addEventListener('input', (e) => change({ speed: clampInt(e.target.value, 1, 100, 50) }, false, true));

    $('btnNew').addEventListener('click', () => generate({ newSeed: true }));
    $('btnSolution').addEventListener('click', () => setSolution(!state.showSolution));
    $('btnAnimSolve').addEventListener('click', animateSolve);
    $('btnPlay').addEventListener('click', startPlay);
    $('btnStopPlay').addEventListener('click', () => play.stop());
    $('btnRestart').addEventListener('click', startPlay);
    $('btnWinNew').addEventListener('click', () => generate({ newSeed: true }));
    $('btnWinAgain').addEventListener('click', startPlay);
    $('btnWinClose').addEventListener('click', () => { hideWin(); play.stop(); });
    $('btnTheme').addEventListener('click', toggleTheme);
    $('btnSidebar').addEventListener('click', () => { document.body.classList.toggle('sidebar-hidden'); setTimeout(fitCanvas, 50); });

    // التصدير
    $('btnPNG').addEventListener('click', () => {
      if (!state.maze) return;
      MS.Export.exportPNG(state.maze, view(), parseInt($('pngScale').value, 10), $('exportSolution').checked)
        .then((r) => toast('تم حفظ ' + r.name + ' (' + r.width + '×' + r.height + ')'));
    });
    $('btnSVG').addEventListener('click', () => {
      if (!state.maze) return;
      const r = MS.Export.exportSVG(state.maze, view(), $('exportSolution').checked);
      toast('تم حفظ ' + r.name);
    });
    $('btnPrint').addEventListener('click', () => {
      if (!state.maze) return;
      preparePrintCurrent();
      setTimeout(() => window.print(), 60);
    });
    $('btnBook').addEventListener('click', () => {
      const n = prepareBook();
      toast('تم تجهيز ' + n + ' صفحة للطباعة');
      setTimeout(() => window.print(), 80);
    });

    window.addEventListener('resize', fitCanvas);
  }

  /** تجهيز صفحة طباعة للمتاهة الحالية (+ صفحة الحل اختيارياً) */
  function preparePrintCurrent() {
    return MS.Export.buildPrint([{ maze: state.maze, label: 'المتاهة' }], {
      title: $('bookTitle').value || 'متاهة', perPage: 1, answers: $('printAnswers').checked,
      cover: false, bw: $('printBW').checked, view: view()
    });
  }
  /** تجهيز كتاب متاهات مرقّمة */
  function prepareBook() {
    const count = clampInt($('batchCount').value, 1, 100, 8);
    $('batchCount').value = count;
    const items = MS.Export.buildBatch(genSettings(), count);
    return MS.Export.buildPrint(items, {
      title: $('bookTitle').value || 'كتاب المتاهات', perPage: parseInt($('perPage').value, 10),
      answers: $('printAnswers').checked, cover: $('bookCover').checked, bw: $('printBW').checked, view: view()
    });
  }

  /* ------------------------------ البدء ------------------------------ */
  /** أبعاد مناسبة لقناع نصي حسب طول الكلمة */
  function textSize() {
    const n = Math.max(2, Array.from((state.s.maskText || 'وطن').trim()).length);
    return { width: Math.min(120, Math.max(40, n * 16)), height: 26 };
  }

  function init() {
    state.s = load();
    syncUI();
    bind();
    // ننتظر جاهزية الخط المضمَّن (مهم لقناع النص) بحد أقصى ثانية ونصف
    const fontReady = (document.fonts && document.fonts.load)
      ? Promise.race([document.fonts.load('900 40px Cairo', 'وطن abc'), new Promise((r) => setTimeout(r, 1500))]).catch(() => {})
      : Promise.resolve();
    fontReady.then(() => { generate({ animate: false }); fitCanvas(); });
  }

  // واجهة صغيرة للاختبار الآلي
  MS.app = {
    state: state, generate: generate, render: render, setSolution: setSolution, animateSolve: animateSolve,
    startPlay: startPlay, play: play, change: change, applyPreset: applyPreset, toggleTheme: toggleTheme,
    preparePrintCurrent: preparePrintCurrent, prepareBook: prepareBook, view: view, genSettings: genSettings
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window.MS = window.MS || {});
