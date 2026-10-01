/**
 * masks.js — أقنعة الأشكال للشبكة المربعة.
 * القناع مصفوفة 0/1 (rows×cols): الخلية = 1 تدخل المتاهة.
 * الأنواع: قلب، نجمة، دائرة، معيّن، سداسي، هلال، نص (عربي/لاتيني عبر Canvas)، صورة (عتبة أبيض/أسود).
 * بعد الرسم: يُقص القناع على حدوده ثم تُوصل الأجزاء المنفصلة بممرات قصيرة
 * (أو يُكتفى بأكبر جزء) لضمان متاهة واحدة مثالية قابلة للحل.
 */
(function (MS) {
  'use strict';

  /* ---------------- أشكال هندسية: دوال (u,v) ∈ [-1,1] → داخل/خارج ---------------- */
  function pointInPoly(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  const STAR = (() => {
    const p = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.42 : 1, a = -Math.PI / 2 + i * Math.PI / 5;
      p.push([r * Math.cos(a), r * Math.sin(a) + 0.1]);
    }
    return p;
  })();
  const SHAPES = {
    heart: (u, v) => { const x = u * 1.22, y = -v * 1.22 + 0.2, a = x * x + y * y - 1; return a * a * a - x * x * y * y * y <= 0; },
    star: (u, v) => pointInPoly(u, v, STAR),
    circle: (u, v) => u * u + v * v <= 1,
    diamond: (u, v) => Math.abs(u) + Math.abs(v) <= 1,
    hexagon: (u, v) => Math.abs(v) <= 0.866 && Math.abs(u) * 0.866 + Math.abs(v) * 0.5 <= 0.866,
    crescent: (u, v) => u * u + v * v <= 1 && ((u + 0.42) * (u + 0.42) + (v + 0.12) * (v + 0.12) > 0.72)
  };

  /** رسم شكل هندسي داخل شبكة مع الحفاظ على النسبة */
  function geometricMask(type, rows, cols) {
    const f = SHAPES[type] || SHAPES.heart, data = new Uint8Array(rows * cols);
    const half = Math.min(rows, cols) / 2;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const u = (c + 0.5 - cols / 2) / half, v = (r + 0.5 - rows / 2) / half;
      data[r * cols + c] = f(u, v) ? 1 : 0;
    }
    return data;
  }

  /** عيّنات بكسلات Canvas إلى خلايا: الخلية داخل القناع إن غطّى الحبر نسبة ≥ thr منها */
  function sampleCanvas(ctx, rows, cols, k, test, thr) {
    const img = ctx.getImageData(0, 0, cols * k, rows * k).data, W = cols * k;
    const data = new Uint8Array(rows * cols);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      let hit = 0;
      for (let y = 0; y < k; y++) for (let x = 0; x < k; x++) {
        const i = ((r * k + y) * W + (c * k + x)) * 4;
        if (test(img[i], img[i + 1], img[i + 2], img[i + 3])) hit++;
      }
      data[r * cols + c] = hit / (k * k) >= thr ? 1 : 0;
    }
    return data;
  }

  const FONT_STACK = 'Cairo, "Noto Sans Arabic", "Segoe UI", Tahoma, Arial, sans-serif';

  /** قناع نصي: يُرسم النص بخط عريض ويُكبَّر ليملأ الشبكة */
  function textMask(text, rows, cols) {
    const k = 8, W = cols * k, H = rows * k;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const isRtl = /[\u0590-\u08FF]/.test(text);
    ctx.direction = isRtl ? 'rtl' : 'ltr';
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = '900 100px ' + FONT_STACK;
    let m = ctx.measureText(text);
    let tw = (m.actualBoundingBoxLeft + m.actualBoundingBoxRight) || m.width;
    let th = (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) || 100;
    const size = Math.max(4, 100 * Math.min((W * 0.96) / tw, (H * 0.94) / th));
    ctx.font = '900 ' + size.toFixed(1) + 'px ' + FONT_STACK;
    m = ctx.measureText(text);
    tw = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    th = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    // نضع مربع حدود النص في المنتصف تماماً
    const x = (W - tw) / 2 + m.actualBoundingBoxLeft, y = (H - th) / 2 + m.actualBoundingBoxAscent;
    ctx.fillStyle = '#000';
    ctx.fillText(text, x, y);
    return sampleCanvas(ctx, rows, cols, k, (r, g, b, a) => a > 110, 0.42);
  }

  /** قناع من صورة: البكسلات الداكنة (أو الفاتحة عند العكس) تدخل المتاهة */
  function imageMask(img, rows, cols, threshold, invert) {
    const k = 4, W = cols * k, H = rows * k;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const s = Math.min(W / iw, H / ih), dw = iw * s, dh = ih * s;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    const t = threshold * 2.55;
    return sampleCanvas(ctx, rows, cols, k, (r, g, b, a) => {
      // نعامل الشفافية كأبيض
      const al = a / 255, lum = (0.299 * r + 0.587 * g + 0.114 * b) * al + 255 * (1 - al);
      return invert ? lum >= t : lum < t;
    }, 0.5);
  }

  /** قص القناع على مربع الحدود (مع هامش 0) */
  function trim(data, rows, cols) {
    let r0 = rows, r1 = -1, c0 = cols, c1 = -1;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (data[r * cols + c]) {
      if (r < r0) r0 = r; if (r > r1) r1 = r; if (c < c0) c0 = c; if (c > c1) c1 = c;
    }
    if (r1 < 0) return null;
    const R = r1 - r0 + 1, C = c1 - c0 + 1, out = new Uint8Array(R * C);
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) out[r * C + c] = data[(r + r0) * cols + (c + c0)];
    return { data: out, rows: R, cols: C };
  }

  /** تسمية الأجزاء المتصلة (جوار رباعي) */
  function components(data, rows, cols) {
    const lab = new Int32Array(rows * cols).fill(-1), sizes = [];
    const q = new Int32Array(rows * cols);
    for (let i = 0; i < data.length; i++) {
      if (!data[i] || lab[i] >= 0) continue;
      const id = sizes.length; let h = 0, t = 0, n = 0;
      q[t++] = i; lab[i] = id;
      while (h < t) {
        const u = q[h++], r = (u / cols) | 0, c = u % cols; n++;
        const nb = [r > 0 ? u - cols : -1, r < rows - 1 ? u + cols : -1, c > 0 ? u - 1 : -1, c < cols - 1 ? u + 1 : -1];
        for (const v of nb) if (v >= 0 && data[v] && lab[v] < 0) { lab[v] = id; q[t++] = v; }
      }
      sizes.push(n);
    }
    return { lab: lab, sizes: sizes };
  }

  /**
   * وصل الأجزاء: من الجزء الأكبر نبحث بالعرض عبر الخلايا الفارغة عن أقرب جزء آخر،
   * ونحوّل خلايا الطريق إلى ممر. نكرر حتى يصبح القناع جزءاً واحداً.
   * يُرجع عدد خلايا الجسور المضافة.
   */
  function bridge(data, rows, cols) {
    let added = 0;
    for (let guard = 0; guard < 500; guard++) {
      const { lab, sizes } = components(data, rows, cols);
      if (sizes.length <= 1) break;
      let main = 0; sizes.forEach((s, i) => { if (s > sizes[main]) main = i; });
      const prev = new Int32Array(rows * cols).fill(-2), q = new Int32Array(rows * cols);
      let h = 0, t = 0, hit = -1;
      for (let i = 0; i < data.length; i++) if (lab[i] === main) { prev[i] = -1; q[t++] = i; }
      while (h < t && hit < 0) {
        const u = q[h++], r = (u / cols) | 0, c = u % cols;
        const nb = [r > 0 ? u - cols : -1, r < rows - 1 ? u + cols : -1, c > 0 ? u - 1 : -1, c < cols - 1 ? u + 1 : -1];
        for (const v of nb) {
          if (v < 0 || prev[v] !== -2) continue;
          prev[v] = u;
          if (data[v] && lab[v] !== main) { hit = v; break; }
          q[t++] = v;
        }
      }
      if (hit < 0) break;
      for (let u = prev[hit]; u >= 0 && prev[u] !== -1; u = prev[u]) { if (!data[u]) { data[u] = 1; added++; } }
    }
    return added;
  }

  /** الإبقاء على أكبر جزء فقط */
  function keepLargest(data, rows, cols) {
    const { lab, sizes } = components(data, rows, cols);
    let main = 0; sizes.forEach((s, i) => { if (s > sizes[main]) main = i; });
    let removed = 0;
    for (let i = 0; i < data.length; i++) if (data[i] && lab[i] !== main) { data[i] = 0; removed++; }
    return removed;
  }

  /**
   * بناء القناع من الإعدادات:
   * { maskType, width, height, maskText, maskImage, maskThreshold, maskInvert, maskJoin }
   */
  function buildMask(o) {
    const rows = Math.max(2, o.height | 0), cols = Math.max(2, o.width | 0);
    let data, note = '', type = o.maskType || 'heart';
    if (type === 'text') data = textMask((o.maskText || '').trim() || 'وطن', rows, cols);
    else if (type === 'image') {
      if (o.maskImage) data = imageMask(o.maskImage, rows, cols, o.maskThreshold || 50, !!o.maskInvert);
      else { data = geometricMask('heart', rows, cols); note = 'لم تُرفع صورة بعد — عُرض شكل القلب.'; }
    } else data = geometricMask(type, rows, cols);

    let t = trim(data, rows, cols);
    if (!t || t.data.reduce((a, b) => a + b, 0) < 2) {
      t = trim(geometricMask('heart', rows, cols), rows, cols);
      note = 'القناع فارغ (جرّب عتبة أخرى أو حجماً أكبر) — عُرض شكل القلب.';
    }
    const parts = components(t.data, t.rows, t.cols).sizes.length;
    let bridged = 0, removed = 0;
    if (o.maskJoin === 'largest') removed = keepLargest(t.data, t.rows, t.cols);
    else bridged = bridge(t.data, t.rows, t.cols);
    const t2 = trim(t.data, t.rows, t.cols);
    return { data: t2.data, rows: t2.rows, cols: t2.cols, parts: parts, bridged: bridged, removed: removed, note: note };
  }

  MS.buildMask = buildMask;
  MS.MASK_TYPES = {
    heart: 'قلب ❤', star: 'نجمة ★', circle: 'دائرة', diamond: 'معيّن ◆', hexagon: 'سداسي ⬢', crescent: 'هلال ☾',
    text: 'نص (عربي/لاتيني)', image: 'صورة مرفوعة'
  };
})(window.MS = window.MS || {});
