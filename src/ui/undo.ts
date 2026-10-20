import { commit } from '../app';
import { t } from '../i18n';
import { runToastAction, toast } from './dom';

// Undo for deletes. Each delete saves straight away, then offers Undo for a few
// seconds in the message box (or Ctrl+Z / ⌘Z). Undo puts back exactly what was
// removed, with the same ids, rather than restoring a snapshot of everything,
// so a change made meanwhile in another window isn't lost.

/**
 * Saves, then shows `message` with Undo. `undo` puts things back and returns
 * false if it no longer can (e.g. the date was logged again in the meantime).
 */
export function commitWithUndo(message: string, undo: () => boolean): void {
  commit();
  toast(message, {
    label: t('undo.label'),
    hint: t(/Mac|iPhone|iPad/.test(navigator.platform) ? 'undo.hintMac' : 'undo.hint'),
    run: () => { if (undo()) commit(t('undo.done')); else toast(t('undo.cant')); },
  });
}

/** Ctrl+Z / ⌘Z undoes the last delete while its message is showing, unless you're typing in a field. */
export function initUndoShortcut(): void {
  document.addEventListener('keydown', ev => {
    if (ev.key.toLowerCase() !== 'z' || !(ev.ctrlKey || ev.metaKey) || ev.shiftKey || ev.altKey) return;
    const el = ev.target as HTMLElement;
    if (el.closest('input, textarea, select, [contenteditable]')) return;
    if (runToastAction()) ev.preventDefault();
  });
}
