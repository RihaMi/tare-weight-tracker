import { parseBackup } from '../data/backup';
import type { LoadProblem, Store } from '../data/storage';
import { t, type Key } from '../i18n';
import { todayISO } from '../lib/dates';
import { $, armOrRun, download, esc, pickTextFile } from './dom';

// Shown instead of the app when it can't start safely: saved data it can't read,
// storage it can't open, or an error while starting. Nothing here changes the
// saved data unless the person chooses to restore a backup or start over.

export type StartupProblem = LoadProblem | { kind: 'crash'; error: unknown };

export function showStartupProblem(problem: StartupProblem, store: Store | null): void {
  document.body.classList.add('halted');
  const raw = 'raw' in problem ? problem.raw : undefined;
  const canFix = problem.kind === 'damaged' && store;
  const detail = problem.kind === 'crash' ? String((problem.error as Error)?.message ?? problem.error) : '';
  $('#view').innerHTML = `<section class="card problem" role="alert">
    <h2>${t(`startup.${problem.kind}.title` as Key)}</h2>
    <p class="flush">${t(`startup.${problem.kind}.text` as Key)}</p>
    ${detail ? `<p class="note"><code>${esc(detail)}</code></p>` : ''}
    <div class="actions start">
      <button type="button" class="btn primary" id="spReload">${t('app.reload')}</button>
      ${raw !== undefined ? `<button type="button" class="btn" id="spDownload">${t('startup.download')}</button>` : ''}
      ${canFix ? `<button type="button" class="btn" id="spRestore">${t('backup.restore')}</button>
        <button type="button" class="btn danger btn-wrap" id="spErase">${t('startup.erase')}</button>` : ''}
    </div>
    <p class="warnbox" id="spErr" role="alert" hidden></p>
  </section>`;

  $('#spReload').addEventListener('click', () => location.reload());
  $('#spDownload')?.addEventListener('click', () =>
    download(`tare-saved-data-${todayISO()}.json`, JSON.stringify(raw, null, 2), 'application/json'));
  if (!canFix) return;
  const fail = (key: Key) => { const e = $('#spErr'); e.hidden = false; e.textContent = t(key); };
  $('#spRestore').addEventListener('click', async () => {
    const file = await pickTextFile('.json,application/json');
    if (!file) return;
    try { await store.save(parseBackup(file.text)); location.reload(); }
    catch { fail('startup.restoreFailed'); }
  });
  $('#spErase').addEventListener('click', ev => {
    armOrRun(ev.currentTarget as HTMLButtonElement, t('startup.eraseConfirm'), async () => {
      try { await store.clear(); location.reload(); } catch { fail('startup.eraseFailed'); }
    });
  });
}
