/**
 * grids.js — الشبكات (الأشكال) المدعومة.
 * كل شبكة عبارة عن رسم بياني: خلايا + جيران + روابط (ممرات مفتوحة).
 * وتوفر هندسة "بوحدات" مستقلة عن الحجم: مركز الخلية، شكلها، وجدرانها.
 *
 *  - SquareGrid : شبكة مربعة (صفوف × أعمدة)، مع قناع اختياري للأشكال (قلب، نجمة، نص، صورة…)
 *  - WeaveGrid  : شبكة مربعة منسوجة (ممرات تعبر تحت بعضها)
 *  - PolarGrid  : شبكة دائرية (حلقات)
 *  - HexGrid    : شبكة سداسية (أعمدة مُزاحة)
 *  - TriGrid    : شبكة مثلثية
 *
 * صيغة الجدار (edge): { n: معرّف الجار أو null للحد الخارجي, seg: {line:[x1,y1,x2,y2]} | {arc:{cx,cy,r,a0,a1}} }
 * صيغة الشكل (shape): {poly:[[x,y],...]} | {sector:{cx,cy,r0,r1,a0,a1}} | {circle:{cx,cy,r}}
 */
(function (MS) {
  'use strict';

  const SQ3 = Math.sqrt(3);

  /** الفئة الأساسية: منطق الروابط والجيران المشترك */
  class Grid {
    constructor(type) {
      this.type = type;
      this.cells = [];
      this._geom = null;
    }
    get size() { return this.cells.length; }
    _newCell(props) {
      const c = Object.assign({ id: this.cells.length, nb: [], links: new Set() }, props);
      this.cells.push(c);
      return c;
    }
    link(a, b) { this.cells[a].links.add(b); this.cells[b].links.add(a); }
    unlink(a, b) { this.cells[a].links.delete(b); this.cells[b].links.delete(a); }
    isLinked(a, b) { return this.cells[a].links.has(b); }
    /** يربط كل خلية بجميع جيرانها (تستخدمه خوارزمية التقسيم العودي) */
    linkAll() { for (const c of this.cells) for (const n of c.nb) c.links.add(n); }
    clearLinks() { for (const c of this.cells) c.links.clear(); }
    edgeCount() { let s = 0; for (const c of this.cells) s += c.links.size; return s / 2; }

    /** حساب الهندسة مرة واحدة وتخزينها */
    geom() {
      if (!this._geom) {
        this._geom = this.cells.map((c) => ({
          center: this.center(c),
          shape: this.shape(c),
          edges: this.edges(c)
        }));
      }
      return this._geom;
    }
    /** وصلة مسار الحل بين خليتين متجاورتين (خط افتراضياً) */
    connector(a, b) {
      const g = this.geom();
      const p = g[a].center, q = g[b].center;
      return { line: [p[0], p[1], q[0], q[1]] };
    }
    /** مساعد: جدران المضلع مع ملكية الجدار للخلية ذات المعرّف الأصغر لتفادي التكرار */
    _polyEdges(cell, pts, nbs) {
      const out = [];
      for (let i = 0; i < pts.length; i++) {
        const n = nbs[i];
        if (n !== null && n < cell.id) continue; // الجدار المشترك تملكه الخلية الأصغر
        const p = pts[i], q = pts[(i + 1) % pts.length];
        out.push({ n: n, seg: { line: [p[0], p[1], q[0], q[1]] } });
      }
      return out;
    }
  }

  /* ------------------------------------------------------------------ */
  /**
   * الشبكة المربعة — تدعم قناعاً اختيارياً (mask): مصفوفة 0/1 بطول rows×cols،
   * الخلايا خارج القناع غير موجودة إطلاقاً، وحدودها تصبح جدراناً خارجية.
   */
  class SquareGrid extends Grid {
    constructor(rows, cols, mask) {
      super(mask ? 'masked' : 'square');
      this.rows = rows; this.cols = cols;
      this.index = new Int32Array(rows * cols).fill(-1); // (r,c) → معرّف الخلية أو -1
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (mask && !mask[r * cols + c]) continue;
        this.index[r * cols + c] = this._newCell({ r: r, c: c }).id;
      }
      const id = (r, c) => (r >= 0 && r < rows && c >= 0 && c < cols && this.index[r * cols + c] >= 0) ? this.index[r * cols + c] : null;
      for (const cell of this.cells) {
        const { r, c } = cell;
        cell.north = id(r - 1, c);
        cell.south = id(r + 1, c);
        cell.west = id(r, c - 1);
        cell.east = id(r, c + 1);
        cell.nb = [cell.north, cell.south, cell.east, cell.west].filter((x) => x !== null);
      }
      this.baseSize = this.cells.length;
    }
    at(r, c) { const i = (r >= 0 && r < this.rows && c >= 0 && c < this.cols) ? this.index[r * this.cols + c] : -1; return i >= 0 ? this.cells[i] : null; }
    bounds() { return { w: this.cols, h: this.rows }; }
    center(cell) { return [cell.c + 0.5, cell.r + 0.5]; }
    shape(cell) {
      const x = cell.c, y = cell.r;
      return { poly: [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]] };
    }
    /** كل خلية تملك جداريها الشمالي والغربي، والجنوبي/الشرقي فقط إن لم يوجد جار */
    edges(cell) {
      const x = cell.c, y = cell.r, out = [];
      out.push({ n: cell.north, seg: { line: [x, y, x + 1, y] } });
      out.push({ n: cell.west, seg: { line: [x, y, x, y + 1] } });
      if (cell.south === null) out.push({ n: null, seg: { line: [x, y + 1, x + 1, y + 1] } });
      if (cell.east === null) out.push({ n: null, seg: { line: [x + 1, y, x + 1, y + 1] } });
      return out;
    }
    corners() { return [0, this.baseSize - 1]; }
    /** أقرب خلية لمنتصف الصف الأعلى ← أقرب خلية لمنتصف الصف الأسفل */
    edgeMid() {
      const mid = (this.cols - 1) / 2, base = this.cells.slice(0, this.baseSize);
      const top = Math.min.apply(null, base.map((c) => c.r)), bot = Math.max.apply(null, base.map((c) => c.r));
      const pick = (row) => base.filter((c) => c.r === row).sort((a, b) => Math.abs(a.c - mid) - Math.abs(b.c - mid))[0].id;
      return [pick(top), pick(bot)];
    }
    describe() { return this.cols + ' × ' + this.rows; }
  }

  /**
   * المتاهة المنسوجة (Weave): ممرات تعبر من تحت بعضها كالجسور.
   * كل "تقاطع" خلية يمر فوقها ممر مستقيم، وتحتها خلية افتراضية (under) تصل الاتجاه الآخر.
   */
  class WeaveGrid extends SquareGrid {
    constructor(rows, cols) {
      super(rows, cols);
      this.type = 'weave';
      this.under = new Map(); // معرّف خلية التقاطع → معرّف الخلية السفلية
    }
    /** إنشاء تقاطع: overH = الممر العلوي أفقي */
    addCrossing(cellId, overH) {
      const c = this.cells[cellId];
      c.crossing = overH ? 'h' : 'v';
      const a = overH ? c.north : c.west, b = overH ? c.south : c.east;
      const u = this._newCell({ r: c.r, c: c.c, isUnder: true, over: cellId, north: null, south: null, east: null, west: null });
      u.nb = [a, b];
      this.cells[a].nb.push(u.id); this.cells[b].nb.push(u.id);
      if (overH) { this.link(c.west, cellId); this.link(cellId, c.east); } else { this.link(c.north, cellId); this.link(cellId, c.south); }
      this.link(a, u.id); this.link(u.id, b);
      this.under.set(cellId, u.id);
      this._geom = null;
      return u.id;
    }
    edges(cell) { return cell.isUnder ? [] : super.edges(cell); }
    /** الجدار مفتوح إن وُجد رابط مع الجار أو مع الخلية السفلية تحته */
    edgeOpen(cell, n) {
      if (cell.links.has(n)) return true;
      const un = this.under.get(n);
      if (un !== undefined && cell.links.has(un)) return true;
      const uc = this.under.get(cell.id);
      return uc !== undefined && this.cells[uc].links.has(n);
    }
    /** لا يُسمح بروابط إضافية (التضفير) على خلايا التقاطع */
    canLink(a, b) { const A = this.cells[a], B = this.cells[b]; return !(A.crossing || B.crossing || A.isUnder || B.isUnder); }
    /**
     * رسم "مُقحَم" (inset) خاص بالمنسوجة: كل خلية غرفة أصغر قليلاً، والممرات المفتوحة
     * تظهر كوصلات قصيرة. في خلية التقاطع يستمر جدارا الممر العلوي عبرها، بينما ينتهي
     * الممر السفلي عندهما — فيظهر بوضوح أنه يمر من تحت.
     * openings: Map خلية → فهرس الجدار الخارجي المفتوح (المدخل/المخرج)
     */
    customWalls(openings) {
      const out = [], k = 0.18, geo = this.geom();
      const L = (x1, y1, x2, y2) => out.push({ line: [x1, y1, x2, y2] });
      for (let id = 0; id < this.baseSize; id++) {
        const c = this.cells[id], X1 = c.c, X2 = c.c + k, X3 = c.c + 1 - k, X4 = c.c + 1, Y1 = c.r, Y2 = c.r + k, Y3 = c.r + 1 - k, Y4 = c.r + 1;
        // تحديد الجانب الخارجي المفتوح (إن وُجد) لهذه الخلية
        let openSide = null;
        if (openings && openings.has(id)) {
          const ln = geo[id].edges[openings.get(id)].seg.line;
          if (ln[1] === ln[3]) openSide = ln[1] === c.r ? 'n' : 's'; else openSide = ln[0] === c.c ? 'w' : 'e';
        }
        const open = (n, side) => (n === null ? openSide === side : (c.crossing ? true : this.edgeOpen(c, n)));
        if (open(c.north, 'n')) { L(X2, Y1, X2, Y2); L(X3, Y1, X3, Y2); } else L(X2, Y2, X3, Y2);
        if (open(c.south, 's')) { L(X2, Y3, X2, Y4); L(X3, Y3, X3, Y4); } else L(X2, Y3, X3, Y3);
        if (open(c.west, 'w')) { L(X1, Y2, X2, Y2); L(X1, Y3, X2, Y3); } else L(X2, Y2, X2, Y3);
        if (open(c.east, 'e')) { L(X3, Y2, X4, Y2); L(X3, Y3, X4, Y3); } else L(X3, Y2, X3, Y3);
        // جدارا الممر العلوي يعبران خلية التقاطع
        if (c.crossing === 'h') { L(X2, Y2, X3, Y2); L(X2, Y3, X3, Y3); }
        else if (c.crossing === 'v') { L(X2, Y2, X2, Y3); L(X3, Y2, X3, Y3); }
      }
      return out;
    }
    describe() { return this.cols + ' × ' + this.rows + ' • ' + this.under.size + ' جسر'; }
  }

  /* ------------------------------------------------------------------ */
  /** الشبكة الدائرية (القطبية) — عدد الخلايا يتضاعف في الحلقات الخارجية */
  class PolarGrid extends Grid {
    constructor(rings) {
      super('polar');
      this.rings = rings;
      this.counts = [1];
      for (let r = 1; r < rings; r++) {
        const prev = this.counts[r - 1];
        const est = (2 * Math.PI * r) / prev; // عرض الخلية التقريبي لو بقي العدد كما هو
        const ratio = Math.max(1, Math.round(est));
        this.counts.push(prev * ratio);
      }
      this.offsets = [];
      for (let r = 0; r < rings; r++) {
        this.offsets.push(this.cells.length);
        for (let i = 0; i < this.counts[r]; i++) this._newCell({ ring: r, idx: i });
      }
      for (const cell of this.cells) {
        const r = cell.ring, i = cell.idx, n = this.counts[r];
        cell.cw = cell.ccw = cell.inward = null;
        cell.outward = [];
        if (r > 0) {
          if (n > 1) {
            cell.cw = this.offsets[r] + ((i + 1) % n);
            cell.ccw = this.offsets[r] + ((i - 1 + n) % n);
          }
          const ratio = n / this.counts[r - 1];
          cell.inward = this.offsets[r - 1] + Math.floor(i / ratio);
        }
      }
      for (const cell of this.cells) if (cell.inward !== null) this.cells[cell.inward].outward.push(cell.id);
      for (const cell of this.cells) {
        const s = new Set();
        if (cell.cw !== null) s.add(cell.cw);
        if (cell.ccw !== null) s.add(cell.ccw);
        if (cell.inward !== null) s.add(cell.inward);
        cell.outward.forEach((o) => s.add(o));
        cell.nb = Array.from(s);
      }
    }
    bounds() { return { w: 2 * this.rings, h: 2 * this.rings }; }
    _angles(cell) {
      const n = this.counts[cell.ring], t = (2 * Math.PI) / n;
      // نبدأ من الأعلى (−π/2) ليكون الشكل متناسقاً بصرياً
      return [cell.idx * t - Math.PI / 2, (cell.idx + 1) * t - Math.PI / 2];
    }
    center(cell) {
      const R = this.rings;
      if (cell.ring === 0) return [R, R];
      const [a0, a1] = this._angles(cell), am = (a0 + a1) / 2, rad = cell.ring + 0.5;
      return [R + rad * Math.cos(am), R + rad * Math.sin(am)];
    }
    shape(cell) {
      const R = this.rings;
      if (cell.ring === 0) return { circle: { cx: R, cy: R, r: 1 } };
      const [a0, a1] = this._angles(cell);
      return { sector: { cx: R, cy: R, r0: cell.ring, r1: cell.ring + 1, a0: a0, a1: a1 } };
    }
    edges(cell) {
      const R = this.rings, r = cell.ring, out = [];
      if (r === 0) return out;
      const [a0, a1] = this._angles(cell);
      out.push({ n: cell.inward, seg: { arc: { cx: R, cy: R, r: r, a0: a0, a1: a1 } } });
      if (cell.ccw !== null) {
        const c = Math.cos(a0), s = Math.sin(a0);
        out.push({ n: cell.ccw, seg: { line: [R + r * c, R + r * s, R + (r + 1) * c, R + (r + 1) * s] } });
      }
      if (r === R - 1) out.push({ n: null, seg: { arc: { cx: R, cy: R, r: r + 1, a0: a0, a1: a1 } } });
      return out;
    }
    /** الحركة داخل نفس الحلقة تُرسم كقوس بدلاً من خط مستقيم */
    connector(a, b) {
      const A = this.cells[a], B = this.cells[b];
      if (A.ring === B.ring && A.ring > 0) {
        const [x0, x1] = this._angles(A), [y0, y1] = this._angles(B);
        const am = (x0 + x1) / 2;
        const t = (y1 - y0);
        const dir = (B.id === A.cw) ? 1 : -1;
        return { arc: { cx: this.rings, cy: this.rings, r: A.ring + 0.5, a0: am, a1: am + dir * ((x1 - x0) / 2 + t / 2) } };
      }
      return super.connector(a, b);
    }
    corners() {
      const last = this.rings - 1;
      return [0, this.offsets[last] + Math.floor(this.counts[last] / 2)];
    }
    edgeMid() { return this.corners(); }
    describe() { return this.rings + ' حلقة'; }
  }

  /* ------------------------------------------------------------------ */
  /** الشبكة السداسية (رؤوس مسطحة، الأعمدة الفردية مُزاحة للأسفل) */
  class HexGrid extends Grid {
    constructor(rows, cols) {
      super('hex');
      this.rows = rows; this.cols = cols;
      this.s = 1 / SQ3; // نصف القطر بحيث تكون المسافة بين الضلعين المتقابلين = 1
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) this._newCell({ r: r, c: c });
      const id = (r, c) => (r >= 0 && r < rows && c >= 0 && c < cols) ? r * cols + c : null;
      for (const cell of this.cells) {
        const { r, c } = cell, odd = c & 1;
        // ترتيب الجيران يطابق ترتيب أضلاع المضلع: SE, S, SW, NW, N, NE
        cell.dirs = odd
          ? [id(r + 1, c + 1), id(r + 1, c), id(r + 1, c - 1), id(r, c - 1), id(r - 1, c), id(r, c + 1)]
          : [id(r, c + 1), id(r + 1, c), id(r, c - 1), id(r - 1, c - 1), id(r - 1, c), id(r - 1, c + 1)];
        cell.nb = cell.dirs.filter((x) => x !== null);
      }
    }
    bounds() { const s = this.s; return { w: s * (1.5 * this.cols + 0.5), h: SQ3 * s * (this.rows + (this.cols > 1 ? 0.5 : 0)) }; }
    center(cell) {
      const s = this.s;
      return [s + 1.5 * s * cell.c, (SQ3 / 2) * s + SQ3 * s * (cell.r + 0.5 * (cell.c & 1))];
    }
    _pts(cell) {
      const [cx, cy] = this.center(cell), s = this.s, pts = [];
      for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i; pts.push([cx + s * Math.cos(a), cy + s * Math.sin(a)]); }
      return pts;
    }
    shape(cell) { return { poly: this._pts(cell) }; }
    edges(cell) { return this._polyEdges(cell, this._pts(cell), cell.dirs); }
    corners() { return [0, this.size - 1]; }
    edgeMid() { const c = Math.floor(this.cols / 2); return [c, (this.rows - 1) * this.cols + c]; }
    describe() { return this.cols + ' × ' + this.rows; }
  }

  /* ------------------------------------------------------------------ */
  /** الشبكة المثلثية: المثلث (r,c) رأسه للأعلى إذا كان (r+c) زوجياً */
  class TriGrid extends Grid {
    constructor(rows, cols) {
      super('tri');
      this.rows = rows; this.cols = cols;
      this.h = SQ3 / 2;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) this._newCell({ r: r, c: c, up: ((r + c) % 2) === 0 });
      const id = (r, c) => (r >= 0 && r < rows && c >= 0 && c < cols) ? r * cols + c : null;
      for (const cell of this.cells) {
        const { r, c } = cell;
        // ترتيب الأضلاع: للأعلى [يسار، قاعدة، يمين]، للأسفل [أعلى، يمين، يسار]
        cell.dirs = cell.up ? [id(r, c - 1), id(r + 1, c), id(r, c + 1)] : [id(r - 1, c), id(r, c + 1), id(r, c - 1)];
        cell.nb = cell.dirs.filter((x) => x !== null);
      }
    }
    bounds() { return { w: (this.cols + 1) * 0.5, h: this.rows * this.h }; }
    _pts(cell) {
      const x0 = cell.c * 0.5, y0 = cell.r * this.h, y1 = y0 + this.h;
      return cell.up ? [[x0 + 0.5, y0], [x0, y1], [x0 + 1, y1]] : [[x0, y0], [x0 + 1, y0], [x0 + 0.5, y1]];
    }
    center(cell) {
      const p = this._pts(cell);
      return [(p[0][0] + p[1][0] + p[2][0]) / 3, (p[0][1] + p[1][1] + p[2][1]) / 3];
    }
    shape(cell) { return { poly: this._pts(cell) }; }
    edges(cell) { return this._polyEdges(cell, this._pts(cell), cell.dirs); }
    corners() { return [0, this.size - 1]; }
    edgeMid() { const c = Math.floor(this.cols / 2); return [c, (this.rows - 1) * this.cols + c]; }
    describe() { return this.cols + ' × ' + this.rows; }
  }

  /** مصنع الشبكات */
  function createGrid(shape, opts) {
    switch (shape) {
      case 'polar': return new PolarGrid(opts.rings);
      case 'hex': return new HexGrid(opts.height, opts.width);
      case 'tri': return new TriGrid(opts.height, opts.width * 2); // مثلثان لكل وحدة عرض لتبقى النسبة متوازنة
      case 'weave': return new WeaveGrid(opts.height, opts.width);
      case 'masked': {
        const m = MS.buildMask(opts);
        const g = new SquareGrid(m.rows, m.cols, m.data);
        g.maskInfo = m;
        return g;
      }
      default: return new SquareGrid(opts.height, opts.width);
    }
  }

  MS.Grid = Grid;
  MS.SquareGrid = SquareGrid;
  MS.WeaveGrid = WeaveGrid;
  MS.PolarGrid = PolarGrid;
  MS.HexGrid = HexGrid;
  MS.TriGrid = TriGrid;
  MS.createGrid = createGrid;
})(window.MS = window.MS || {});
