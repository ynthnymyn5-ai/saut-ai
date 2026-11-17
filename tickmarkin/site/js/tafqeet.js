// Arabic amount-in-words for Kuwaiti dinars (1 dinar = 1000 fils). Shared by the browser and tests.
(function (root) {
  'use strict';
  const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
  const TEENS = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const HUNDREDS = ['', 'مئة', 'مئتان', 'ثلاثمئة', 'أربعمئة', 'خمسمئة', 'ستمئة', 'سبعمئة', 'ثمانمئة', 'تسعمئة'];

  function below1000(n) {
    const parts = [];
    const h = Math.floor(n / 100), r = n % 100;
    if (h) parts.push(HUNDREDS[h]);
    if (r) {
      if (r < 10) parts.push(ONES[r]);
      else if (r < 20) parts.push(TEENS[r - 10]);
      else parts.push(r % 10 ? ONES[r % 10] + ' و' + TENS[Math.floor(r / 10)] : TENS[Math.floor(r / 10)]);
    }
    return parts.join(' و');
  }
  function group(n, [one, two, plural, single]) {
    if (n === 1) return one;
    if (n === 2) return two;
    if (n >= 3 && n <= 10) return below1000(n) + ' ' + plural;
    return below1000(n) + ' ' + single;
  }
  function words(n) {
    if (n === 0) return 'صفر';
    const parts = [];
    const m = Math.floor(n / 1e6), t = Math.floor((n % 1e6) / 1000), r = n % 1000;
    if (m) parts.push(group(m, ['مليون', 'مليونان', 'ملايين', 'مليون']));
    if (t) parts.push(group(t, ['ألف', 'ألفان', 'آلاف', 'ألف']));
    if (r) parts.push(below1000(r));
    return parts.join(' و');
  }
  // counted noun agreement: 1, 2, 3–10, 11–99 (accusative), round hundreds/thousands
  function counted(n, f) {
    const last2 = n % 100;
    if (n === 1) return f.one;
    if (n === 2) return f.two;
    if (last2 >= 3 && last2 <= 10) return words(n) + ' ' + f.plural;
    // construct state before the noun: مئتان → مئتا دينار، ألفان → ألفا دينار
    if (last2 === 0) return words(n).replace(/(مئتا|ألفا|مليونا)ن$/, '$1') + ' ' + f.single;
    return words(n) + ' ' + f.acc;
  }
  const DINAR = { one: 'دينار كويتي واحد', two: 'ديناران كويتيان', plural: 'دنانير كويتية', single: 'دينار كويتي', acc: 'ديناراً كويتياً' };
  const FILS = { one: 'فلس واحد', two: 'فلسان', plural: 'فلوس', single: 'فلس', acc: 'فلساً' };

  function kwdInWords(amount) {
    const total = Math.round(Number(amount) * 1000);
    if (!Number.isFinite(total) || total <= 0) return '';
    const d = Math.floor(total / 1000), f = total % 1000;
    const parts = [];
    if (d) parts.push(counted(d, DINAR));
    if (f) parts.push(counted(f, FILS));
    return 'فقط ' + parts.join(' و') + ' لا غير';
  }
  root.kwdInWords = kwdInWords;
  if (typeof module !== 'undefined') module.exports = { kwdInWords };
})(typeof window !== 'undefined' ? window : globalThis);
