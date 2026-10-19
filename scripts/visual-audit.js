// Visual audit for Tare. Paste into the browser console on a running app
// (npm run preview), then run:  await tareAudit()
// Optional: await tareAudit({ tabs: ['current'] }) to check only the open screen.
//
// For every screen it reports:
//   - the page scrolling sideways
//   - elements sticking out of the screen
//   - text cut off by its box
//   - text below WCAG AA contrast (4.5:1, or 3:1 for large text)
// Repeat at different window sizes, in light and dark mode, and in each language.

window.tareAudit = async function tareAudit(opts = {}) {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const parse = c => {
    const m = c.match(/rgba?\(([^)]+)\)/) || c.match(/color\(srgb ([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    const srgb = c.startsWith('color(');
    return { rgb: p.slice(0, 3).map(v => (srgb ? v * 255 : v)), a: p[3] ?? 1 };
  };
  const lum = ([r, g, b]) => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const blend = (fg, bg) => fg.rgb.map((v, i) => v * fg.a + bg[i] * (1 - fg.a));
  const bgOf = el => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let base = parse(getComputedStyle(document.body).backgroundColor)?.rgb ?? [255, 255, 255];
    for (const l of layers.reverse()) base = blend(l, base);
    return base;
  };
  const desc = el => (el.id ? '#' + el.id : el.tagName.toLowerCase()) +
    (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');

  const out = {};
  for (const tab of opts.tabs ?? ['overview', 'history', 'body', 'calories', 'profile']) {
    if (tab !== 'current') { location.hash = tab; await wait(450); }
    const vw = document.documentElement.clientWidth, issues = new Set();
    if (document.documentElement.scrollWidth > vw + 1) issues.add(`PAGE SCROLLS SIDEWAYS (${document.documentElement.scrollWidth}px > ${vw}px)`);
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('[hidden], svg, script, style, noscript')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const inScroller = el.closest('.table-wrap, .tabs');
      if (!inScroller && (r.right > vw + 1 || r.left < -1)) issues.add(`off-screen: ${desc(el)} (${Math.round(r.left)}..${Math.round(r.right)})`);
      const ownText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (!ownText) continue;
      if (!inScroller && el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'visible') issues.add(`text cut off: ${desc(el)} "${el.textContent.trim().slice(0, 40)}"`);
      if (el.tagName === 'OPTION' || el.closest('.faint')) continue;
      const fg = parse(cs.color);
      if (!fg) continue;
      const bg = bgOf(el), c = blend(fg, bg);
      const L1 = lum(c), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700;
      const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
      if (ratio < need) issues.add(`low contrast ${ratio.toFixed(2)} (needs ${need}): ${desc(el)} "${el.textContent.trim().slice(0, 30)}"`);
    }
    out[tab] = [...issues];
  }
  return out;
};
