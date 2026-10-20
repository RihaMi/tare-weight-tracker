import { app } from '../app';
import { sampleProfile } from '../data/sample';
import { freshData } from '../data/schema';
import { lockoutMs, verifyPin } from '../lib/pin';
import { $, armOrRun } from './dom';
import { t } from '../i18n';

// Full-screen PIN prompt. Nothing from the user's data is rendered while it shows.

const FAILS_KEY = 'tare.pinFails';
interface Fails { n: number; until: number }

function readFails(): Fails {
  try { const f = JSON.parse(localStorage.getItem(FAILS_KEY) ?? ''); if (typeof f?.n === 'number') return f; } catch { /* none */ }
  return { n: 0, until: 0 };
}
function writeFails(f: Fails): void { try { localStorage.setItem(FAILS_KEY, JSON.stringify(f)); } catch { /* best effort */ } }

export interface LockOptions {
  /** Number of PIN digits (dots shown). Defaults to the PIN saved in settings. */
  length?: number;
  /** Checks a PIN; defaults to the hash in settings. When data is encrypted, decrypting it is the check. */
  verify?: (pin: string) => Promise<boolean>;
}

let entered = '';
let busy = false;
let onUnlock: (() => void) | null = null;
let options: LockOptions = {};
let countdown: number | undefined;

export const isLocked = (): boolean => !$('#lock').hidden;

const pinLength = (): number => options.length ?? app.data.settings.pin?.length ?? 4;

function drawDots(): void {
  $('#pinDots').innerHTML = Array.from({ length: pinLength() }, (_, i) => `<span class="${i < entered.length ? 'on' : ''}"></span>`).join('');
}

function message(text: string, isError = false): void {
  const m = $('#lockMsg');
  m.textContent = text;
  m.classList.toggle('err', isError);
}

function waitingFor(): number { return Math.max(0, readFails().until - Date.now()); }

function showWait(): void {
  clearInterval(countdown);
  const tick = () => {
    const ms = waitingFor();
    if (ms <= 0) { clearInterval(countdown); message(''); return; }
    message(t('lock.wait', { s: Math.ceil(ms / 1000) }), true);
  };
  tick();
  countdown = window.setInterval(tick, 1000);
}

const defaultVerify = async (pin: string): Promise<boolean> => {
  const stored = app.data.settings.pin;
  return !!stored && verifyPin(pin, stored);
};

async function check(): Promise<void> {
  if (busy) return;
  busy = true;
  $('.lock-box').classList.add('busy');
  const ok = await (options.verify ?? defaultVerify)(entered).catch(() => false);
  $('.lock-box').classList.remove('busy');
  busy = false;
  if (ok) {
    writeFails({ n: 0, until: 0 });
    entered = '';
    hideLock();
    return;
  }
  const f = readFails();
  f.n++;
  f.until = Date.now() + lockoutMs(f.n);
  writeFails(f);
  entered = '';
  drawDots();
  const box = $('.lock-box');
  box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
  if (waitingFor() > 0) showWait(); else message(t('lock.wrong'), true);
}

function press(key: string): void {
  if (busy || waitingFor() > 0) return;
  const len = pinLength();
  if (key === 'back') entered = entered.slice(0, -1);
  else if (/^\d$/.test(key) && entered.length < len) entered += key;
  drawDots();
  if (entered.length === len) void check();
}

function hideLock(): void {
  clearInterval(countdown);
  $('#lock').hidden = true;
  document.querySelector('.wrap')?.removeAttribute('inert');
  const cb = onUnlock; onUnlock = null; options = {};
  cb?.();
}

/** Shows the lock screen; `then` runs once the right PIN is entered. */
export function showLock(then: () => void, opts: LockOptions = {}): void {
  onUnlock = then;
  options = opts;
  entered = '';
  $('#forgotPanel').hidden = true;
  $('#keypad').hidden = false;
  $('#lock').hidden = false;
  document.querySelector('.wrap')?.setAttribute('inert', '');
  drawDots();
  if (waitingFor() > 0) showWait(); else message('');
  $<HTMLButtonElement>('#keypad button[data-key="1"]').focus();
}

export function initLock(): void {
  $('#keypad').addEventListener('click', ev => {
    const b = (ev.target as Element).closest<HTMLButtonElement>('button[data-key]');
    if (b) press(b.dataset.key!);
  });
  document.addEventListener('keydown', ev => {
    if (!isLocked() || !$('#forgotPanel').hidden) return;
    if (/^\d$/.test(ev.key)) { press(ev.key); ev.preventDefault(); }
    else if (ev.key === 'Backspace') { press('back'); ev.preventDefault(); }
  });
  $('#forgotPin').addEventListener('click', () => { $('#forgotPanel').hidden = false; $('#keypad').hidden = true; });
  $('#forgotCancel').addEventListener('click', () => { $('#forgotPanel').hidden = true; $('#keypad').hidden = false; });
  $('#forgotErase').addEventListener('click', ev => {
    armOrRun(ev.currentTarget as HTMLButtonElement, t('lock.eraseConfirm'), () => {
      app.key = null;
      app.data = freshData([sampleProfile(undefined, app.sampleText())]);
      void app.persist(app.data); // no PIN and no key: saved unencrypted, replacing the encrypted copy
      writeFails({ n: 0, until: 0 });
      hideLock();
    });
  });
}
