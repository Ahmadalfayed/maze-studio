/**
 * rng.js — مولّد أرقام عشوائية قابل لإعادة الإنتاج (Seeded PRNG)
 * يعتمد على تجزئة نص البذرة (cyrb53 مختصر) ثم خوارزمية mulberry32.
 * نفس البذرة + نفس الإعدادات = نفس المتاهة دائماً.
 */
(function (MS) {
  'use strict';

  /** يحوّل أي نص إلى عدد صحيح 32-بت بشكل حتمي */
  function hashSeed(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h1 ^ h2) >>> 0;
  }

  /** ينشئ مولّداً عشوائياً من بذرة نصية */
  function createRng(seed) {
    let a = hashSeed(String(seed));
    const next = function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      next: next,
      /** عدد صحيح في المجال [0, n) */
      int: function (n) { return Math.floor(next() * n); },
      /** عنصر عشوائي من مصفوفة */
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },
      /** true باحتمال p */
      bool: function (p) { return next() < (p === undefined ? 0.5 : p); },
      /** خلط المصفوفة في مكانها (Fisher–Yates) */
      shuffle: function (arr) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
      }
    };
  }

  /** بذرة جديدة سهلة القراءة (8 رموز) */
  function randomSeedString() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const buf = new Uint32Array(8);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(buf);
    else for (let i = 0; i < 8; i++) buf[i] = Math.floor(Math.random() * 1e9);
    let s = '';
    for (let i = 0; i < 8; i++) s += chars[buf[i] % chars.length];
    return s;
  }

  MS.createRng = createRng;
  MS.hashSeed = hashSeed;
  MS.randomSeedString = randomSeedString;
})(window.MS = window.MS || {});
