export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T => root.querySelector(sel) as T;

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

export interface ToastAction { label: string; hint: string; run: () => void }

let toastTimer: number | undefined;
let toastAction: (() => void) | null = null;

function hideToast(): void {
  $('#toast').classList.remove('show');
  toastAction = null;
}

/**
 * Shows a short message, optionally with a button (Undo). Screen readers get the
 * text from a separate status region, since the visible box is hidden between
 * messages; a box with a button is left visible to them so the button can be reached.
 */
export function toast(message: string, action?: ToastAction): void {
  const box = $('#toast');
  box.textContent = message;
  toastAction = action?.run ?? null;
  if (action) {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'toast-act', textContent: action.label });
    b.addEventListener('click', () => runToastAction());
    box.append(b);
  }
  box.classList.toggle('has-act', !!action);
  if (action) box.removeAttribute('aria-hidden'); else box.setAttribute('aria-hidden', 'true');
  $('#announce').textContent = action ? `${message}. ${action.hint}` : message;
  box.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(hideToast, action ? 6000 : 2400);
}

/** Runs the showing message's button action, if there is one. */
export function runToastAction(): boolean {
  const run = toastAction;
  if (!run) return false;
  clearTimeout(toastTimer);
  hideToast();
  run();
  return true;
}

export function download(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Opens the system file picker and resolves with the chosen file, or null if cancelled. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise(resolve => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept });
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/** Like pickFile, but resolves with the file's text. */
export async function pickTextFile(accept: string): Promise<{ name: string; text: string } | null> {
  const f = await pickFile(accept);
  return f ? { name: f.name, text: await f.text() } : null;
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
