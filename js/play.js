/**
 * play.js — وضع اللعب التفاعلي.
 * التحكم: الأسهم أو WASD (تُطابق الاتجاه مع أقرب جار مفتوح، فيعمل على كل الأشكال)،
 * والسحب بالفأرة/اللمس (يتحرك اللاعب نحو المؤشر عبر الممرات المفتوحة فقط).
 * التراجع لخطوة سابقة يحذفها من الأثر. مؤقّت وعدّاد حركات ورسالة فوز.
 */
(function (MS) {
  'use strict';

  const KEYS = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
    W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0]
  };

  class PlayMode {
    /**
     * @param {object} o - { canvas, getMaze(), getLayout(), render(), onUpdate(state), onWin(state) }
     */
    constructor(o) {
      this.o = o;
      this.active = false;
      this.dragging = false;
      this._tick = null;
      this._onKey = this._onKey.bind(this);
      this._down = this._down.bind(this);
      this._move = this._move.bind(this);
      this._up = this._up.bind(this);
      document.addEventListener('keydown', this._onKey);
      o.canvas.addEventListener('pointerdown', this._down);
      o.canvas.addEventListener('pointermove', this._move);
      window.addEventListener('pointerup', this._up);
      window.addEventListener('pointercancel', this._up);
    }

    start() {
      const mz = this.o.getMaze();
      if (!mz) return;
      this.active = true; this.won = false;
      this.pos = mz.start; this.trail = [mz.start];
      this.moves = 0; this.t0 = null; this.elapsed = 0;
      clearInterval(this._tick);
      this._tick = setInterval(() => { if (this.t0 !== null && !this.won) { this.elapsed = performance.now() - this.t0; this.o.onUpdate(this); } }, 200);
      this.o.canvas.classList.add('playing');
      this.o.onUpdate(this);
      this.o.render();
    }

    stop() {
      this.active = false; this.dragging = false;
      clearInterval(this._tick);
      this.o.canvas.classList.remove('playing');
      this.o.onUpdate(this);
      this.o.render();
    }

    /** الانتقال إلى جار مفتوح */
    moveTo(target) {
      const mz = this.o.getMaze();
      if (!this.active || this.won || !mz || !mz.grid.isLinked(this.pos, target)) return false;
      if (this.t0 === null) this.t0 = performance.now();
      const tl = this.trail;
      if (tl.length > 1 && tl[tl.length - 2] === target) tl.pop(); // تراجع
      else tl.push(target);
      this.pos = target;
      this.moves++;
      if (target === mz.end) {
        this.won = true;
        this.elapsed = performance.now() - this.t0;
        clearInterval(this._tick);
        this.o.render();
        this.o.onUpdate(this);
        this.o.onWin(this);
        return true;
      }
      return true;
    }

    /** حركة باتجاه شاشة (dx,dy): نختار الجار المفتوح الأقرب لهذا الاتجاه */
    moveDir(dx, dy) {
      const mz = this.o.getMaze();
      if (!mz) return false;
      const g = mz.grid, geo = g.geom(), p = geo[this.pos].center;
      let best = -1, bestDot = 0.35;
      for (const n of g.cells[this.pos].links) {
        const q = geo[n].center, vx = q[0] - p[0], vy = q[1] - p[1], len = Math.hypot(vx, vy) || 1;
        const dot = (vx * dx + vy * dy) / len;
        if (dot > bestDot + 1e-9) { bestDot = dot; best = n; }
      }
      return best >= 0 ? this.moveTo(best) : false;
    }

    _onKey(e) {
      if (!this.active || this.won) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' && t.type !== 'range' && t.type !== 'checkbox' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const k = KEYS[e.key];
      if (!k) { if (e.key === 'Escape') this.stop(); return; }
      e.preventDefault();
      if (this.moveDir(k[0], k[1])) { this.o.render(); this.o.onUpdate(this); }
    }

    _unitsFromEvent(e) {
      const c = this.o.canvas, rect = c.getBoundingClientRect(), L = this.o.getLayout();
      const x = (e.clientX - rect.left) * (L.W / rect.width), y = (e.clientY - rect.top) * (L.H / rect.height);
      return MS.toUnits(L, x, y);
    }

    _down(e) {
      if (!this.active || this.won) return;
      this.dragging = true;
      try { this.o.canvas.setPointerCapture(e.pointerId); } catch (err) { /* تجاهل */ }
      this._follow(e);
      e.preventDefault();
    }
    _move(e) { if (this.dragging) { this._follow(e); e.preventDefault(); } }
    _up() { this.dragging = false; }

    /** يتقدّم اللاعب خطوة بخطوة نحو المؤشر ما دام ذلك يقرّبه منه */
    _follow(e) {
      const mz = this.o.getMaze();
      if (!mz) return;
      const [ux, uy] = this._unitsFromEvent(e), geo = mz.grid.geom();
      const d = (id) => { const c = geo[id].center; return Math.hypot(c[0] - ux, c[1] - uy); };
      let moved = false;
      for (let guard = 0; guard < 64 && !this.won; guard++) {
        let best = -1, bestD = d(this.pos);
        for (const n of mz.grid.cells[this.pos].links) { const dn = d(n); if (dn < bestD - 1e-6) { bestD = dn; best = n; } }
        if (best < 0) break;
        this.moveTo(best); moved = true;
      }
      if (moved) { this.o.render(); this.o.onUpdate(this); }
    }
  }

  MS.PlayMode = PlayMode;
})(window.MS = window.MS || {});
