/**
 * algorithms.js — خوارزميات توليد المتاهات.
 * كل خوارزمية دالة مولّدة (generator) تُعدّل روابط الشبكة وتُرجع (yield)
 * خطوة بعد خطوة، مما يتيح التوليد المتحرك أو الفوري بنفس الكود.
 * القيمة المُرجعة: { cur: معرّف الخلية الحالية, mark: مصفوفة خلايا مميزة اختيارية }
 *
 * الخوارزميات العامة (تعمل على أي شكل): DFS، Prim، Kruskal، Wilson، Hunt&Kill، Aldous-Broder
 * الخاصة بالشبكة المربعة الكاملة: Binary Tree، Sidewinder، Eller، Recursive Division
 * المنسوجة (Weave): Kruskal فقط (بتقاطعات موضوعة مسبقاً)
 */
(function (MS) {
  'use strict';

  /** البحث بالعمق مع التراجع (Recursive Backtracker) — ممرات طويلة ملتوية */
  function* backtracker(g, rng) {
    const n = g.size, visited = new Uint8Array(n);
    const start = rng.int(n);
    const stack = [start];
    visited[start] = 1;
    while (stack.length) {
      const cur = stack[stack.length - 1];
      const un = g.cells[cur].nb.filter((i) => !visited[i]);
      if (!un.length) { stack.pop(); yield { cur: stack.length ? stack[stack.length - 1] : -1, mark: stack }; continue; }
      const nx = rng.pick(un);
      g.link(cur, nx);
      visited[nx] = 1;
      stack.push(nx);
      yield { cur: nx, mark: stack };
    }
  }

  /** خوارزمية Prim العشوائية — تفرعات كثيرة وطرق مسدودة قصيرة */
  function* prim(g, rng) {
    const n = g.size, state = new Uint8Array(n); // 0 خارج، 1 داخل المتاهة، 2 حدود
    const frontier = [];
    const add = (id) => {
      state[id] = 1;
      for (const nb of g.cells[id].nb) if (state[nb] === 0) { state[nb] = 2; frontier.push(nb); }
    };
    add(rng.int(n));
    while (frontier.length) {
      const k = rng.int(frontier.length);
      const c = frontier[k];
      frontier[k] = frontier[frontier.length - 1]; frontier.pop();
      const ins = g.cells[c].nb.filter((x) => state[x] === 1);
      g.link(c, rng.pick(ins));
      add(c);
      yield { cur: c, mark: frontier };
    }
  }

  /**
   * خوارزمية Kruskal العشوائية مع اتحاد-بحث (Union-Find).
   * على الشبكة المنسوجة: نضع أولاً تقاطعات (جسور) عشوائية ثم نكمل Kruskal على باقي الجدران.
   */
  function* kruskal(g, rng) {
    const parent = new Int32Array(g.size * 2 + 1).map((_, i) => i);
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const union = (a, b) => { parent[find(a)] = find(b); };
    if (g.type === 'weave') {
      const order = rng.shuffle(g.cells.filter((c) => c.north !== null && c.south !== null && c.east !== null && c.west !== null).map((c) => c.id));
      const target = Math.floor(g.baseSize * 0.09);
      let placed = 0;
      for (const id of order) {
        if (placed >= target) break;
        const c = g.cells[id];
        const nbs = [c.north, c.south, c.east, c.west];
        if (c.crossing || nbs.some((n) => g.cells[n].crossing)) continue;
        const overH = rng.bool();
        const [a1, a2] = overH ? [c.west, c.east] : [c.north, c.south]; // الممر العلوي يمر عبر الخلية
        const [b1, b2] = overH ? [c.north, c.south] : [c.west, c.east]; // الممر السفلي
        const fc = find(id), f1 = find(a1), f2 = find(a2), g1 = find(b1), g2 = find(b2);
        if (fc === f1 || fc === f2 || f1 === f2 || g1 === g2) continue;
        if ([fc, f1, f2].indexOf(g1) >= 0 || [fc, f1, f2].indexOf(g2) >= 0) continue;
        g.addCrossing(id, overH);
        union(a1, id); union(id, a2); union(b1, b2);
        placed++;
      }
      yield { cur: -1 };
    }
    const edges = [];
    for (const c of g.cells) {
      if (c.isUnder || c.crossing) continue;
      for (const nb of c.nb) if (c.id < nb && !g.cells[nb].crossing && !g.cells[nb].isUnder) edges.push([c.id, nb]);
    }
    rng.shuffle(edges);
    for (const [a, b] of edges) {
      const ra = find(a), rb = find(b);
      if (ra !== rb) { parent[ra] = rb; g.link(a, b); yield { cur: b }; }
    }
  }

  /** خوارزمية Wilson — مشي عشوائي مع محو الحلقات؛ تنتج شجرة منتظمة التوزيع (uniform) */
  function* wilson(g, rng) {
    const n = g.size, inMaze = new Uint8Array(n), next = new Int32Array(n).fill(-1);
    const order = rng.shuffle(Array.from({ length: n }, (_, i) => i));
    inMaze[order[0]] = 1;
    for (const s of order) {
      if (inMaze[s]) continue;
      // مشي عشوائي حتى الوصول للمتاهة؛ next[] يحفظ آخر خروج من كل خلية (محو الحلقات ضمنياً)
      let u = s, steps = 0;
      while (!inMaze[u]) {
        const v = rng.pick(g.cells[u].nb);
        next[u] = v; u = v;
        if (++steps % 8 === 0) yield { cur: u };
      }
      // تثبيت المسار المحو الحلقات
      u = s;
      const path = [];
      while (!inMaze[u]) { inMaze[u] = 1; g.link(u, next[u]); path.push(u); u = next[u]; }
      yield { cur: s, mark: path };
    }
  }

  /** الصيد والقتل (Hunt-and-Kill) — مشابه لـ DFS بدون مكدس */
  function* huntAndKill(g, rng) {
    const n = g.size, visited = new Uint8Array(n);
    let cur = rng.int(n); visited[cur] = 1;
    let remaining = n - 1;
    while (remaining > 0) {
      const un = g.cells[cur].nb.filter((i) => !visited[i]);
      if (un.length) {
        const nx = rng.pick(un); g.link(cur, nx); visited[nx] = 1; remaining--; cur = nx;
        yield { cur: cur };
      } else {
        // مرحلة الصيد: أول خلية غير مزارة بجوار خلية مزارة
        for (let i = 0; i < n; i++) {
          if (visited[i]) continue;
          const vs = g.cells[i].nb.filter((x) => visited[x]);
          if (vs.length) { g.link(i, rng.pick(vs)); visited[i] = 1; remaining--; cur = i; break; }
        }
        yield { cur: cur };
      }
    }
  }

  /* ---------------- خوارزميات خاصة بالشبكة المربعة ---------------- */

  /** الشجرة الثنائية: كل خلية تفتح شمالاً أو شرقاً — انحياز قطري واضح */
  function* binaryTree(g, rng) {
    for (const c of g.cells) {
      const opts = [c.north, c.east].filter((x) => x !== null);
      if (opts.length) g.link(c.id, rng.pick(opts));
      yield { cur: c.id };
    }
  }

  /** Sidewinder: تشغيلات أفقية تُغلق بفتحة شمالية عشوائية */
  function* sidewinder(g, rng) {
    for (let r = 0; r < g.rows; r++) {
      let run = [];
      for (let c = 0; c < g.cols; c++) {
        const cell = g.at(r, c);
        run.push(cell.id);
        const atEast = cell.east === null, atNorth = cell.north === null;
        const close = atEast || (!atNorth && rng.bool());
        if (close) {
          const m = g.cells[rng.pick(run)];
          if (m.north !== null) g.link(m.id, m.north);
          run = [];
        } else {
          g.link(cell.id, cell.east);
        }
        yield { cur: cell.id };
      }
    }
  }

  /** خوارزمية Eller: صفاً بصف مع مجموعات — ذاكرة خطية بعدد الأعمدة */
  function* eller(g, rng) {
    const cols = g.cols;
    let sets = new Array(cols).fill(0), nextSet = 1;
    for (let r = 0; r < g.rows; r++) {
      const last = r === g.rows - 1;
      for (let c = 0; c < cols; c++) if (!sets[c]) sets[c] = nextSet++;
      // الدمج الأفقي
      for (let c = 0; c < cols - 1; c++) {
        if (sets[c] !== sets[c + 1] && (last || rng.bool())) {
          g.link(g.at(r, c).id, g.at(r, c + 1).id);
          const old = sets[c + 1];
          for (let k = 0; k < cols; k++) if (sets[k] === old) sets[k] = sets[c];
          yield { cur: g.at(r, c + 1).id };
        }
      }
      if (last) break;
      // الوصلات العمودية: كل مجموعة تنزل مرة واحدة على الأقل
      const groups = new Map();
      for (let c = 0; c < cols; c++) { if (!groups.has(sets[c])) groups.set(sets[c], []); groups.get(sets[c]).push(c); }
      const nextSets = new Array(cols).fill(0);
      for (const [sid, members] of groups) {
        rng.shuffle(members);
        const k = 1 + rng.int(members.length);
        for (let i = 0; i < k; i++) {
          const c = members[i];
          g.link(g.at(r, c).id, g.at(r + 1, c).id);
          nextSets[c] = sid;
        }
        yield { cur: g.at(r + 1, members[0]).id };
      }
      sets = nextSets;
    }
  }

  /** التقسيم العودي: نبدأ بمساحة مفتوحة ونضيف جدراناً بفتحة واحدة (تنفيذ بمكدس) */
  function* recursiveDivision(g, rng) {
    g.linkAll();
    yield { cur: -1 };
    const stack = [[0, 0, g.rows, g.cols]];
    while (stack.length) {
      const [r0, c0, h, w] = stack.pop();
      if (h < 2 || w < 2) continue;
      const horizontal = h > w ? true : (w > h ? false : rng.bool());
      if (horizontal) {
        const k = rng.int(h - 1);           // الجدار أسفل الصف r0+k
        const gap = c0 + rng.int(w);
        for (let c = c0; c < c0 + w; c++) if (c !== gap) g.unlink(g.at(r0 + k, c).id, g.at(r0 + k + 1, c).id);
        stack.push([r0, c0, k + 1, w], [r0 + k + 1, c0, h - k - 1, w]);
        yield { cur: g.at(r0 + k, gap).id };
      } else {
        const k = rng.int(w - 1);           // الجدار يمين العمود c0+k
        const gap = r0 + rng.int(h);
        for (let r = r0; r < r0 + h; r++) if (r !== gap) g.unlink(g.at(r, c0 + k).id, g.at(r, c0 + k + 1).id);
        stack.push([r0, c0, h, k + 1], [r0, c0 + k + 1, h, w - k - 1]);
        yield { cur: g.at(gap, c0 + k).id };
      }
    }
  }

  /** سجل الخوارزميات: الاسم العربي + الأشكال المدعومة */
  const ALL = ['square', 'polar', 'hex', 'tri', 'masked'];
  const ALGORITHMS = {
    backtracker: { name: 'التراجع العودي (DFS)', fn: backtracker, shapes: ALL },
    prim: { name: 'خوارزمية Prim', fn: prim, shapes: ALL },
    kruskal: { name: 'خوارزمية Kruskal', fn: kruskal, shapes: ALL.concat(['weave']) },
    wilson: { name: 'خوارزمية Wilson (منتظمة)', fn: wilson, shapes: ALL },
    huntkill: { name: 'الصيد والقتل (Hunt & Kill)', fn: huntAndKill, shapes: ALL },
    eller: { name: 'خوارزمية Eller', fn: eller, shapes: ['square'] },
    binary: { name: 'الشجرة الثنائية (Binary Tree)', fn: binaryTree, shapes: ['square'] },
    sidewinder: { name: 'Sidewinder', fn: sidewinder, shapes: ['square'] },
    division: { name: 'التقسيم العودي (Recursive Division)', fn: recursiveDivision, shapes: ['square'] }
  };

  MS.ALGORITHMS = ALGORITHMS;
})(window.MS = window.MS || {});
