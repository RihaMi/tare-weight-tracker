// Figures are set in the monospaced font so digits line up. Words and units next to them
// ("kg", "%", "days", "to go") are set in the body font instead: monospaced letters read like a
// typewriter. The decimal comma and the thousands space are drawn narrower too, since in a
// monospaced font they take a whole digit's width ("84 , 1", "2 170").

const FIGURES = '.num, .mono, .reading, .kcal, .ruler-labels b, .stat .v, .kv dd, .row .w, .row .c, .mcard .v, .ledger dd, .macros b, .week-table .num';
// With the spaces around it, which would otherwise be a whole digit wide ("18 of 31").
const WORD = /(\s?(?:\p{L}[\p{L}.]*|%)\s?)/u;
const SEPARATOR = /(?<=\d)([.,\s])(?=\d)/u;

function split(el: Element, pattern: RegExp, cls: string): void {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  for (const text of texts) {
    if (text.parentElement?.closest('.in-words, .sep')) continue;
    const parts = text.data.split(pattern);
    if (parts.length < 2) continue;
    // split() with a capturing group puts the matches at the odd places.
    text.replaceWith(...parts
      .map((s, i) => (i % 2 ? Object.assign(document.createElement('span'), { className: cls, textContent: s }) : s))
      .filter(s => s !== ''));
  }
}

function setFigures(root: Element): void {
  const all = [...(root.matches(FIGURES) ? [root] : []), ...root.querySelectorAll(FIGURES)];
  for (const el of all) {
    split(el, WORD, 'in-words');
    split(el, SEPARATOR, 'sep');
  }
}

/** Keeps the figures in `root` set this way as screens render and update. */
export function initFigures(root: Element): void {
  setFigures(root);
  new MutationObserver(records => {
    for (const r of records) for (const n of r.addedNodes) {
      if (n instanceof Element) setFigures(n.closest(FIGURES) ?? n);
      else if (n.parentElement?.closest(FIGURES)) setFigures(n.parentElement.closest(FIGURES)!);
    }
  }).observe(root, { childList: true, subtree: true });
}
