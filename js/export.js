/**
 * export.js — التصدير: PNG عالي الدقة، SVG، وصفحات طباعة (PDF عبر نافذة الطباعة)
 * بما فيها كتاب متاهات مرقّمة مع صفحات الحلول.
 */
(function (MS) {
  'use strict';

  /** ألوان مناسبة للطباعة بالأبيض والأسود */
  const PRINT_COLORS = { wall: '#000000', bg: '#ffffff', path: '#d62828', start: '#b7e4c7', end: '#f4b6b6', player: '#4f46e5', visit: '#cccccc', current: '#999999' };

  /** تنزيل Blob كملف (يعمل من file:// أيضاً) */
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  function safeName(s) { return String(s).replace(/[^\w\-\u0600-\u06FF]+/g, '_').slice(0, 40) || 'maze'; }
  function baseName(maze) { return 'maze-' + maze.shape + '-' + safeName(maze.seed); }

  /** ينشئ خيارات الرسم لمتاهة جاهزة */
  function renderOpts(maze, view, showSolution, colors) {
    return {
      cellSize: view.cellSize, wallWidth: view.wallWidth, colors: colors || view.colors,
      maze: maze, openings: maze.openings, showSolution: !!showSolution
    };
  }

  /** PNG بدقة مضاعفة (scale) */
  function exportPNG(maze, view, scale, withSolution) {
    return new Promise((resolve) => {
      const o = renderOpts(maze, view, withSolution);
      o.cellSize *= scale; o.wallWidth *= scale;
      const L = MS.layout(maze.grid, o.cellSize, o.wallWidth);
      const canvas = document.createElement('canvas');
      canvas.width = L.W; canvas.height = L.H;
      MS.paintMaze(new MS.CanvasPainter(canvas.getContext('2d')), maze.grid, o);
      const name = baseName(maze) + (withSolution ? '-solution' : '') + '@' + scale + 'x.png';
      canvas.toBlob((blob) => { downloadBlob(blob, name); resolve({ name: name, size: blob.size, width: L.W, height: L.H }); }, 'image/png');
    });
  }

  /** نص SVG للمتاهة */
  function svgString(maze, view, withSolution, colors) {
    return MS.paintMaze(new MS.SvgPainter(), maze.grid, renderOpts(maze, view, withSolution, colors)).result;
  }

  function exportSVG(maze, view, withSolution) {
    const svg = '<?xml version="1.0" encoding="UTF-8"?>\n' + svgString(maze, view, withSolution);
    const name = baseName(maze) + (withSolution ? '-solution' : '') + '.svg';
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), name);
    return { name: name, size: svg.length };
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  /**
   * يبني صفحات الطباعة داخل #print-area.
   * items: [{ maze, label }]
   * o: { title, perPage, answers, cover, bw, view }
   */
  function buildPrint(items, o) {
    const area = document.getElementById('print-area');
    const colors = o.bw ? PRINT_COLORS : o.view.colors;
    const per = Math.max(1, o.perPage | 0);
    const pages = [];
    const shapeNames = { square: 'مربعة', polar: 'دائرية', hex: 'سداسية', tri: 'مثلثية', masked: 'شكل مخصّص', weave: 'منسوجة' };

    if (o.cover) {
      const m0 = items[0].maze;
      pages.push('<section class="print-page cover"><div class="cover-inner">' +
        '<div class="cover-maze">' + svgString(m0, o.view, false, colors) + '</div>' +
        '<h1>' + esc(o.title) + '</h1>' +
        '<p>' + items.length + ' متاهة • ' + (shapeNames[m0.shape] || '') + ' • ' + esc(MS.ALGORITHMS[m0.algorithm].name) + '</p>' +
        (o.answers ? '<p class="small">الحلول في نهاية الكتاب</p>' : '') +
        '</div></section>');
    }

    const chunk = (arr, n) => { const r = []; for (let i = 0; i < arr.length; i += n) r.push(arr.slice(i, i + n)); return r; };
    const pageHtml = (group, solution, pageTitle) =>
      '<section class="print-page per-' + per + '"><header class="ph"><span>' + esc(o.title) + '</span><span>' + pageTitle + '</span></header>' +
      '<div class="pgrid">' + group.map((it) =>
        '<figure class="pitem"><figcaption><b>' + esc(it.label) + '</b>' + (solution ? ' — الحل' : '') +
        '<small dir="ltr">' + esc(it.maze.seed) + '</small></figcaption>' +
        '<div class="psvg">' + svgString(it.maze, o.view, solution, colors) + '</div>' +
        (solution ? '' : '<div class="legend"><i style="background:' + colors.start + '"></i> البداية <i style="background:' + colors.end + '"></i> النهاية</div>') +
        '</figure>').join('') + '</div></section>';

    chunk(items, per).forEach((g) => pages.push(pageHtml(g, false, 'المتاهات')));
    if (o.answers) chunk(items, per).forEach((g) => pages.push(pageHtml(g, true, 'الحلول')));

    area.innerHTML = pages.join('');
    // ترقيم الصفحات في الترويسة
    area.querySelectorAll('.print-page:not(.cover) .ph').forEach((h, i, all) => {
      const s = document.createElement('span'); s.className = 'pnum'; s.textContent = 'صفحة ' + (i + 1) + ' / ' + all.length; h.appendChild(s);
    });
    return pages.length;
  }

  /** يولّد مجموعة متاهات بإعدادات معيّنة وبذور مشتقة */
  function buildBatch(settings, count) {
    const items = [];
    for (let i = 0; i < count; i++) {
      const s = Object.assign({}, settings, { seed: settings.seed + '-' + (i + 1) });
      items.push({ maze: MS.build(s), label: 'متاهة رقم ' + (i + 1) });
    }
    return items;
  }

  MS.Export = { exportPNG: exportPNG, exportSVG: exportSVG, svgString: svgString, buildPrint: buildPrint, buildBatch: buildBatch, downloadBlob: downloadBlob, PRINT_COLORS: PRINT_COLORS };
})(window.MS = window.MS || {});
