/**
 * maze.js — منطق المتاهة: الحل (BFS)، الطرق المسدودة، التضفير (إزالة الطرق المسدودة)،
 * اختيار البداية/النهاية، فتحات الإطار، التحقق من الصحة، وبناء متاهة كاملة من الإعدادات.
 */
(function (MS) {
  'use strict';

  /** بحث بالعرض من خلية: يُرجع المسافات والسوابق */
  function bfs(g, start) {
    const n = g.size, dist = new Int32Array(n).fill(-1), prev = new Int32Array(n).fill(-1);
    const q = new Int32Array(n);
    let head = 0, tail = 0;
    q[tail++] = start; dist[start] = 0;
    while (head < tail) {
      const u = q[head++];
      for (const v of g.cells[u].links) if (dist[v] < 0) { dist[v] = dist[u] + 1; prev[v] = u; q[tail++] = v; }
    }
    return { dist: dist, prev: prev, order: q.subarray(0, tail) };
  }

  /** أقصر مسار بين خليتين (مصفوفة معرّفات) أو [] إن لم يوجد */
  function solve(g, start, end) {
    const { dist, prev } = bfs(g, start);
    if (dist[end] < 0) return [];
    const path = [];
    for (let u = end; u !== -1; u = prev[u]) path.push(u);
    return path.reverse();
  }

  /** حل متحرك: يُرجع طبقات BFS واحدة تلو الأخرى ثم المسار */
  function* solveSteps(g, start, end) {
    const n = g.size, dist = new Int32Array(n).fill(-1), prev = new Int32Array(n).fill(-1);
    let layer = [start]; dist[start] = 0;
    const visited = [start];
    while (layer.length && dist[end] < 0) {
      const nextLayer = [];
      for (const u of layer) for (const v of g.cells[u].links) if (dist[v] < 0) {
        dist[v] = dist[u] + 1; prev[v] = u; nextLayer.push(v); visited.push(v);
      }
      layer = nextLayer;
      yield { phase: 'explore', visited: visited };
    }
    const path = [];
    if (dist[end] >= 0) for (let u = end; u !== -1; u = prev[u]) path.push(u);
    path.reverse();
    for (let k = 1; k <= path.length; k++) yield { phase: 'trace', visited: visited, path: path.slice(0, k) };
  }

  function deadEnds(g) { return g.cells.filter((c) => c.links.size === 1).map((c) => c.id); }

  /** التضفير: إزالة نسبة p من الطرق المسدودة بفتح جدار إضافي (ينشئ حلقات) */
  function braid(g, p, rng) {
    if (p <= 0) return 0;
    const dead = rng.shuffle(deadEnds(g));
    let removed = 0;
    for (const id of dead) {
      const c = g.cells[id];
      if (c.links.size !== 1 || rng.next() >= p) continue;
      const unl = c.nb.filter((n) => !c.links.has(n) && (!g.canLink || g.canLink(id, n)));
      if (!unl.length) continue;
      const best = unl.filter((n) => g.cells[n].links.size === 1); // نفضّل وصل طريقين مسدودين معاً
      g.link(id, best.length ? rng.pick(best) : rng.pick(unl));
      removed++;
    }
    return removed;
  }

  /** أبعد خليتين تقريباً (قطر الشجرة عبر BFS مرتين) */
  function farthestPair(g) {
    let r = bfs(g, 0), a = 0;
    for (let i = 0; i < g.size; i++) if (r.dist[i] > r.dist[a]) a = i;
    r = bfs(g, a);
    let b = a;
    for (let i = 0; i < g.size; i++) if (r.dist[i] > r.dist[b]) b = i;
    return [a, b];
  }

  /** خلايا الحدود الخارجية (لها جدار خارجي) */
  function boundaryCells(g) {
    const geo = g.geom();
    return g.cells.filter((c) => geo[c.id].edges.some((e) => e.n === null)).map((c) => c.id);
  }

  /** اختيار البداية والنهاية حسب الخيار */
  function chooseEnds(g, mode, rng) {
    switch (mode) {
      case 'farthest': return farthestPair(g);
      case 'edgemid': return g.edgeMid();
      case 'random': {
        const n = g.baseSize || g.size; // نتجنب الخلايا السفلية في المنسوجة
        const a = rng.int(n);
        let b = rng.int(n - 1); if (b >= a) b++;
        return [a, b];
      }
      case 'boundary': {
        // نقطتان على الإطار الخارجي بأطول مسافة بينهما
        const bc = boundaryCells(g);
        const s = bc[rng.int(bc.length)];
        const d = bfs(g, s).dist;
        let best = s;
        for (const id of bc) if (d[id] > d[best]) best = id;
        return [s, best];
      }
      default: return g.corners();
    }
  }

  /**
   * فتحات الإطار: لخلية على الحد نفتح الجدار الخارجي الأبعد عن مركز المتاهة.
   * تُرجع Map: معرّف الخلية → فهرس الجدار المحذوف
   */
  function computeOpenings(g, ids) {
    const geo = g.geom(), b = g.bounds(), cx = b.w / 2, cy = b.h / 2;
    const out = new Map();
    for (const id of ids) {
      let bestI = -1, bestD = -1;
      geo[id].edges.forEach((e, i) => {
        if (e.n !== null) return;
        let mx, my;
        if (e.seg.line) { mx = (e.seg.line[0] + e.seg.line[2]) / 2; my = (e.seg.line[1] + e.seg.line[3]) / 2; }
        else { const a = e.seg.arc, am = (a.a0 + a.a1) / 2; mx = a.cx + a.r * Math.cos(am); my = a.cy + a.r * Math.sin(am); }
        const d = Math.hypot(mx - cx, my - cy);
        if (d > bestD + 1e-6) { bestD = d; bestI = i; }
      });
      if (bestI >= 0) out.set(id, bestI);
    }
    return out;
  }

  /** التحقق: كل الخلايا قابلة للوصول، وجود حل، وهل المتاهة "مثالية" (شجرة بلا حلقات) */
  function validate(g, start, end) {
    const { dist } = bfs(g, start);
    let reachable = 0;
    for (let i = 0; i < g.size; i++) if (dist[i] >= 0) reachable++;
    // تأكد من تناظر الروابط وأنها بين جيران فعليين فقط
    let symmetric = true;
    for (const c of g.cells) for (const l of c.links) if (!g.cells[l].links.has(c.id) || c.nb.indexOf(l) < 0) symmetric = false;
    const edges = g.edgeCount();
    return {
      cells: g.size,
      reachable: reachable,
      allReachable: reachable === g.size,
      solvable: dist[end] >= 0,
      solutionLength: dist[end] + 1,
      edges: edges,
      perfect: reachable === g.size && edges === g.size - 1,
      symmetric: symmetric
    };
  }

  /** تقدير عدد الخطوات للتوليد الفوري (يشغّل المولّد حتى النهاية) */
  function runAll(gen) { let r = gen.next(); while (!r.done) r = gen.next(); }

  /** التحقق من دعم الخوارزمية للشكل (مع بديل افتراضي) */
  function resolveAlgorithm(algo, shape) {
    const a = MS.ALGORITHMS[algo];
    if (a && a.shapes.indexOf(shape) >= 0) return algo;
    return shape === 'weave' ? 'kruskal' : 'backtracker';
  }

  /** إنشاء الشبكة والمولّد (تُستخدم للتوليد المتحرك) */
  function prepare(settings) {
    const algo = resolveAlgorithm(settings.algorithm, settings.shape);
    const grid = MS.createGrid(settings.shape, settings);
    const rng = MS.createRng(settings.seed + '|' + settings.shape + '|' + algo);
    const gen = MS.ALGORITHMS[algo].fn(grid, rng);
    return { grid: grid, rng: rng, gen: gen, algorithm: algo };
  }

  /** إنهاء المتاهة بعد التوليد: تضفير، بداية/نهاية، فتحات، حل، إحصاءات */
  function finalize(prep, settings, t0) {
    const g = prep.grid, rng = prep.rng;
    const deadBefore = deadEnds(g).length;
    braid(g, (settings.braid || 0) / 100, rng);
    const [start, end] = chooseEnds(g, settings.placement, rng);
    const openings = settings.openings ? computeOpenings(g, [start, end]) : new Map();
    const solution = solve(g, start, end);
    const dead = deadEnds(g).length;
    return {
      grid: g, start: start, end: end, openings: openings, solution: solution, maskInfo: g.maskInfo || null,
      algorithm: prep.algorithm, seed: settings.seed, shape: settings.shape,
      stats: {
        cells: g.size, deadEnds: dead, deadBefore: deadBefore,
        loops: g.edgeCount() - (g.size - 1),
        solutionLength: solution.length,
        timeMs: t0 !== undefined ? (performance.now() - t0) : 0
      }
    };
  }

  /** بناء متاهة كاملة فورياً من الإعدادات */
  function build(settings) {
    const t0 = performance.now();
    const prep = prepare(settings);
    runAll(prep.gen);
    return finalize(prep, settings, t0);
  }

  Object.assign(MS, {
    bfs: bfs, solve: solve, solveSteps: solveSteps, deadEnds: deadEnds, braid: braid,
    chooseEnds: chooseEnds, computeOpenings: computeOpenings, validate: validate,
    prepare: prepare, finalize: finalize, build: build, runAll: runAll, resolveAlgorithm: resolveAlgorithm
  });
})(window.MS = window.MS || {});
