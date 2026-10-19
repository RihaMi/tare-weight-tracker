export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T => root.querySelector(sel) as T;

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

let toastTimer: number | undefined;
export function toast(message: string): void {
  const t = $('#toast');
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 2400);
}

export function download(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Opens the system file picker and resolves with the chosen file's text, or null if cancelled. */
export function pickTextFile(accept: string): Promise<{ name: string; text: string } | null> {
  return new Promise(resolve => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept });
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      resolve(f ? { name: f.name, text: await f.text() } : null);
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/** Two-step confirm on a button: first click arms it, second click runs. */
export function armOrRun(btn: HTMLButtonElement, armedLabel: string, run: () => void): void {
  if (btn.dataset.armed !== '1') {
    btn.dataset.armed = '1';
    btn.dataset.label = btn.textContent ?? '';
    btn.classList.add('armed');
    btn.textContent = armedLabel;
    setTimeout(() => {
      if (!btn.isConnected || btn.dataset.armed !== '1') return;
      btn.dataset.armed = '';
      btn.classList.remove('armed');
      btn.textContent = btn.dataset.label ?? '';
    }, 5000);
    return;
  }
  run();
}

export const sparkline = (vals: number[]): string => {
  if (vals.length < 2) return '';
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1, W = 200, H = 36;
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${((i / (vals.length - 1)) * W).toFixed(1)},${(4 + (1 - (v - min) / span) * (H - 8)).toFixed(1)}`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" vector-effect="non-scaling-stroke"/></svg>`;
};
