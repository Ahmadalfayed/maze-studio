/**
 * render.js — الرسم بنظام "رسّام" مجرّد له واجهتان:
 *   CanvasPainter : للعرض على الشاشة وتصدير PNG
 *   SvgPainter    : لتصدير SVG وصفحات الطباعة
 * الدالة paintMaze ترسم المتاهة بنفس المنطق على أي رسّام.
 */
(function (MS) {
  'use strict';

  const fmt = (v) => (Math.round(v * 100) / 100).toString();

  /* --------------------------- رسّام Canvas --------------------------- */
  class CanvasPainter {
    constructor(ctx) { this.ctx = ctx; }
    begin(W, H, bg) {
      const c = this.ctx;
      c.save();
      c.clearRect(0, 0, W, H);
      if (bg) { c.fillStyle = bg; c.fillRect(0, 0, W, H); }
    }
    _shapePath(sh) {
      const c = this.ctx;
      c.beginPath();
      if (sh.poly) { sh.poly.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); }
      else if (sh.circle) c.arc(sh.circle.cx, sh.circle.cy, sh.circle.r, 0, Math.PI * 2);
      else if (sh.sector) {
        const s = sh.sector;
        c.arc(s.cx, s.cy, s.r1, s.a0, s.a1, false);
        c.arc(s.cx, s.cy, s.r0, s.a1, s.a0, true);
        c.closePath();
      }
    }
    fillShape(sh, color, alpha) {
      const c = this.ctx;
      c.globalAlpha = alpha === undefined ? 1 : alpha;
      c.fillStyle = color;
      this._shapePath(sh);
      c.fill();
      // حد رفيع بنفس اللون لإخفاء الفراغات بين الخلايا المتجاورة
      c.strokeStyle = color; c.lineWidth = 0.6; c.stroke();
      c.globalAlpha = 1;
    }
    strokeSegs(segs, color, width) {
      const c = this.ctx;
      c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath();
      for (const s of segs) {
        if (s.line) { c.moveTo(s.line[0], s.line[1]); c.lineTo(s.line[2], s.line[3]); }
        else { const a = s.arc; c.moveTo(a.cx + a.r * Math.cos(a.a0), a.cy + a.r * Math.sin(a.a0)); c.arc(a.cx, a.cy, a.r, a.a0, a.a1, a.a1 < a.a0); }
      }
      c.stroke();
    }
    strokePath(start, conns, color, width, alpha) {
      if (!conns.length && !start) return;
      const c = this.ctx;
      c.globalAlpha = alpha === undefined ? 1 : alpha;
      c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(start[0], start[1]);
      if (!conns.length) c.lineTo(start[0] + 0.01, start[1]);
      for (const s of conns) {
        if (s.line) c.lineTo(s.line[2], s.line[3]);
        else { const a = s.arc; c.arc(a.cx, a.cy, a.r, a.a0, a.a1, a.a1 < a.a0); }
      }
      c.stroke();
      c.globalAlpha = 1;
    }
    dot(x, y, r, color, ring) {
      const c = this.ctx;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
      c.fillStyle = color; c.fill();
      if (ring) { c.lineWidth = Math.max(1, r * 0.25); c.strokeStyle = ring; c.stroke(); }
    }
    end() { this.ctx.restore(); }
  }

  /* ---------------------------- رسّام SVG ---------------------------- */
  class SvgPainter {
    constructor() { this.parts = []; }
    begin(W, H, bg) {
      this.W = W; this.H = H;
      this.parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + fmt(W) + '" height="' + fmt(H) +
        '" viewBox="0 0 ' + fmt(W) + ' ' + fmt(H) + '">');
      if (bg) this.parts.push('<rect width="100%" height="100%" fill="' + bg + '"/>');
    }
    _arcTo(a, from, to) {
      const x = a.cx + a.r * Math.cos(to), y = a.cy + a.r * Math.sin(to);
      const large = Math.abs(to - from) > Math.PI ? 1 : 0, sweep = to > from ? 1 : 0;
      return 'A' + fmt(a.r) + ' ' + fmt(a.r) + ' 0 ' + large + ' ' + sweep + ' ' + fmt(x) + ' ' + fmt(y);
    }
    _shapeD(sh) {
      if (sh.poly) return 'M' + sh.poly.map((p) => fmt(p[0]) + ' ' + fmt(p[1])).join('L') + 'Z';
      if (sh.circle) {
        const c = sh.circle;
        return 'M' + fmt(c.cx - c.r) + ' ' + fmt(c.cy) + 'a' + fmt(c.r) + ' ' + fmt(c.r) + ' 0 1 0 ' + fmt(2 * c.r) + ' 0a' +
          fmt(c.r) + ' ' + fmt(c.r) + ' 0 1 0 ' + fmt(-2 * c.r) + ' 0Z';
      }
      const s = sh.sector;
      const p = (r, a) => fmt(s.cx + r * Math.cos(a)) + ' ' + fmt(s.cy + r * Math.sin(a));
      return 'M' + p(s.r1, s.a0) + this._arcTo({ cx: s.cx, cy: s.cy, r: s.r1 }, s.a0, s.a1) +
        'L' + p(s.r0, s.a1) + this._arcTo({ cx: s.cx, cy: s.cy, r: s.r0 }, s.a1, s.a0) + 'Z';
    }
    fillShape(sh, color, alpha) {
      this.parts.push('<path d="' + this._shapeD(sh) + '" fill="' + color + '"' +
        (alpha !== undefined && alpha < 1 ? ' fill-opacity="' + alpha + '"' : '') + ' stroke="' + color + '" stroke-width="0.6"/>');
    }
    strokeSegs(segs, color, width) {
      let d = '';
      for (const s of segs) {
        if (s.line) d += 'M' + fmt(s.line[0]) + ' ' + fmt(s.line[1]) + 'L' + fmt(s.line[2]) + ' ' + fmt(s.line[3]);
        else { const a = s.arc; d += 'M' + fmt(a.cx + a.r * Math.cos(a.a0)) + ' ' + fmt(a.cy + a.r * Math.sin(a.a0)) + this._arcTo(a, a.a0, a.a1); }
      }
      if (d) this.parts.push('<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + fmt(width) +
        '" stroke-linecap="round" stroke-linejoin="round"/>');
    }
    strokePath(start, conns, color, width, alpha) {
      if (!start) return;
      let d = 'M' + fmt(start[0]) + ' ' + fmt(start[1]);
      if (!conns.length) d += 'l0.01 0';
      for (const s of conns) {
        if (s.line) d += 'L' + fmt(s.line[2]) + ' ' + fmt(s.line[3]);
        else d += this._arcTo(s.arc, s.arc.a0, s.arc.a1);
      }
      this.parts.push('<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + fmt(width) +
        '" stroke-linecap="round" stroke-linejoin="round"' + (alpha !== undefined && alpha < 1 ? ' stroke-opacity="' + alpha + '"' : '') + '/>');
    }
    dot(x, y, r, color, ring) {
      this.parts.push('<circle cx="' + fmt(x) + '" cy="' + fmt(y) + '" r="' + fmt(r) + '" fill="' + color + '"' +
        (ring ? ' stroke="' + ring + '" stroke-width="' + fmt(Math.max(1, r * 0.25)) + '"' : '') + '/>');
    }
    end() { this.parts.push('</svg>'); return this.parts.join(''); }
  }

  /* ---------------------- تحويل الوحدات إلى بكسل ---------------------- */
  function layout(g, cellSize, wallWidth) {
    const b = g.bounds();
    const m = Math.ceil(wallWidth / 2 + Math.max(6, cellSize * 0.4));
    return { s: cellSize, m: m, W: Math.ceil(b.w * cellSize + 2 * m), H: Math.ceil(b.h * cellSize + 2 * m) };
  }
  function makeTransform(L) {
    const s = L.s, m = L.m;
    const P = (x, y) => [m + x * s, m + y * s];
    const seg = (sg) => sg.line
      ? { line: [m + sg.line[0] * s, m + sg.line[1] * s, m + sg.line[2] * s, m + sg.line[3] * s] }
      : { arc: { cx: m + sg.arc.cx * s, cy: m + sg.arc.cy * s, r: sg.arc.r * s, a0: sg.arc.a0, a1: sg.arc.a1 } };
    const shape = (sh) => {
      if (sh.poly) return { poly: sh.poly.map((p) => P(p[0], p[1])) };
      if (sh.circle) return { circle: { cx: m + sh.circle.cx * s, cy: m + sh.circle.cy * s, r: sh.circle.r * s } };
      const q = sh.sector;
      return { sector: { cx: m + q.cx * s, cy: m + q.cy * s, r0: q.r0 * s, r1: q.r1 * s, a0: q.a0, a1: q.a1 } };
    };
    return { P: P, seg: seg, shape: shape };
  }

  /** مقاطع الجدران المرئية (بالوحدات) */
  function wallSegments(g, openings) {
    if (g.customWalls) return g.customWalls(openings); // المنسوجة لها رسم خاص
    const geo = g.geom(), out = [];
    for (const c of g.cells) {
      const eds = geo[c.id].edges, skip = openings ? openings.get(c.id) : undefined;
      for (let i = 0; i < eds.length; i++) {
        const e = eds[i];
        if (e.n === null) { if (skip === i) continue; }
        else if (g.edgeOpen ? g.edgeOpen(c, e.n) : c.links.has(e.n)) continue;
        out.push(e.seg);
      }
    }
    return out;
  }

  /** رسم مسار (قائمة خلايا) كخط متصل */
  function drawCellPath(painter, g, T, ids, color, width, alpha) {
    if (!ids || !ids.length) return;
    const geo = g.geom();
    const c0 = geo[ids[0]].center;
    const conns = [];
    for (let i = 1; i < ids.length; i++) conns.push(T.seg(g.connector(ids[i - 1], ids[i])));
    painter.strokePath(T.P(c0[0], c0[1]), conns, color, width, alpha);
  }

  /**
   * رسم المتاهة كاملة.
   * opts: { cellSize, wallWidth, colors:{wall,bg,path,start,end,player,visit,current},
   *         maze (نتيجة build أو null أثناء التوليد), openings, showSolution, solution,
   *         marks (خلايا مميزة), current, explored, partialPath, trail, player, transparent }
   */
  function paintMaze(painter, g, opts) {
    const L = layout(g, opts.cellSize, opts.wallWidth);
    const T = makeTransform(L);
    const geo = g.geom(), col = opts.colors;
    painter.begin(L.W, L.H, opts.transparent ? null : col.bg);

    // خلايا مميزة أثناء التوليد/الاستكشاف
    if (opts.explored) for (const id of opts.explored) painter.fillShape(T.shape(geo[id].shape), col.path, 0.18);
    if (opts.marks) for (const id of opts.marks) painter.fillShape(T.shape(geo[id].shape), col.visit, 0.35);
    if (opts.current !== undefined && opts.current >= 0) painter.fillShape(T.shape(geo[opts.current].shape), col.current, 0.9);

    // البداية والنهاية
    const mz = opts.maze;
    if (mz) {
      painter.fillShape(T.shape(geo[mz.start].shape), col.start, 0.9);
      painter.fillShape(T.shape(geo[mz.end].shape), col.end, 0.9);
    }

    const pathW = Math.max(2, opts.cellSize * 0.28);
    if (mz && opts.showSolution) drawCellPath(painter, g, T, mz.solution, col.path, pathW, 0.95);
    if (opts.partialPath) drawCellPath(painter, g, T, opts.partialPath, col.path, pathW, 0.95);
    if (opts.trail && opts.trail.length > 1) drawCellPath(painter, g, T, opts.trail, col.player, pathW * 0.85, 0.55);

    // الجدران
    painter.strokeSegs(wallSegments(g, mz ? opts.openings : null).map(T.seg), col.wall, opts.wallWidth);

    // اللاعب
    if (opts.player !== undefined && opts.player >= 0) {
      const p = geo[opts.player].center, P = T.P(p[0], p[1]);
      painter.dot(P[0], P[1], Math.max(3, opts.cellSize * 0.3), col.player, '#ffffff');
    }
    const r = painter.end();
    return { layout: L, result: r };
  }

  /** تحويل إحداثيات بكسل إلى إحداثيات الوحدات (للمس/الفأرة) */
  function toUnits(L, x, y) { return [(x - L.m) / L.s, (y - L.m) / L.s]; }

  Object.assign(MS, {
    CanvasPainter: CanvasPainter, SvgPainter: SvgPainter, layout: layout, paintMaze: paintMaze,
    wallSegments: wallSegments, toUnits: toUnits
  });
})(window.MS = window.MS || {});
