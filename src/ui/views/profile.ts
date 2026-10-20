import { app, commit, go, profile, unit } from '../../app';
import { mergeEntries, parseBackup, restoredData, toBackupJSON, toCSV } from '../../data/backup';
import { guessUnit, readImportFile, toEntries, type ImportPreview, type WeightUnit } from '../../data/importers';
import { DataError, blankProfile, type AppData, type Frame, type Profile } from '../../data/schema';
import { t, tn, type Key } from '../../i18n';
import { calc, idealKg } from '../../lib/calc';
import { ACTIVITY } from '../../lib/calories';
import { addDays, fmtDate, todayISO } from '../../lib/dates';
import { CM_IN, deltaUnit, disp, fmtW, fromDisp, isMetric } from '../../lib/units';
import { $, armOrRun, download, esc, pickFile, pickTextFile, toast } from '../dom';
import { isIOSBrowserTab } from '../../lib/backupNudge';
import { resetCalories } from './calories';
import { activityKey } from './overview';
import { bindSettings, settingsCard } from './settings';
import { commitWithUndo } from '../undo';
import { applyTheme } from '../theme';

let pendingRestore: { data: AppData; name: string } | null = null;
let pendingImport: { name: string; preview: ImportPreview; unit: WeightUnit } | null = null;

const counts = (d: AppData) => ({
  profiles: tn('backup.profiles', d.profiles.length),
  entries: tn('backup.entries', d.profiles.reduce((n, x) => n + x.entries.length, 0)),
});

/** A data error in the reader's language; anything else gets a generic message. */
export const fileError = (e: unknown): string => (e instanceof DataError ? t(`error.${e.code}` as Key) : t('common.fileUnreadable'));

export function profileView(): string {
  const p = profile(), u = unit();
  const hIn = p.heightCm ? p.heightCm / CM_IN : null;
  const goalDisp = p.goalKg != null ? +disp(p.goalKg, u).toFixed(1) : '';
  return `<section class="card"><form id="profForm" class="form" novalidate>
    <div class="card-head flush"><h2>${t(p.sample ? 'profile.example' : 'profile.title')}</h2></div>
    <div class="fields">
      <label class="f">${t('profile.name')}<input id="pName" value="${esc(p.name)}" maxlength="40" required></label>
      <label class="f">${t('common.sex')}<select id="pSex"><option value="f" ${p.sex === 'f' ? 'selected' : ''}>${t('common.female')}</option><option value="m" ${p.sex === 'm' ? 'selected' : ''}>${t('common.male')}</option></select></label>
      <label class="f">${t('profile.birthYear')}<input id="pYear" type="number" inputmode="numeric" min="1900" max="${new Date().getFullYear()}" value="${p.birthYear ?? ''}"></label>
      ${isMetric(u)
        ? `<label class="f">${t('common.heightCm')}<input id="pCm" type="number" inputmode="decimal" min="90" max="250" step="0.5" value="${p.heightCm ?? ''}"></label>`
        : `<div class="f"><span>${t('common.height')}</span><div class="inline-in"><input id="pFt" type="number" min="3" max="8" aria-label="${esc(t('common.feet'))}" value="${hIn ? Math.floor(hIn / 12) : ''}"><span>ft</span><input id="pIn" type="number" min="0" max="11.9" step="0.1" aria-label="${esc(t('common.inches'))}" value="${hIn ? (hIn % 12).toFixed(1) : ''}"><span>in</span></div></div>`}
      <label class="f">${t('profile.frame')}<select id="pFrame">${(['small', 'medium', 'large'] as Frame[]).map(f => `<option value="${f}" ${p.frame === f ? 'selected' : ''}>${t(`frameLabel.${f}` as Key)}</option>`).join('')}</select></label>
      <label class="f">${t('profile.activity')}<select id="pAct">${ACTIVITY.map(([v]) => `<option value="${v}" ${p.activity === v ? 'selected' : ''}>${t(activityKey(v))}: ${t(activityKey(v, '.d')).toLowerCase()}</option>`).join('')}</select></label>
    </div>
    <div class="card-head flush gap-top"><h2>${t('common.goal')}</h2><button type="button" class="btn" id="suggestBtn">${t('profile.suggest')}</button></div>
    <div class="fields">
      <label class="f">${t('profile.goalWeight', { unit: deltaUnit(u) })}<input id="pGoal" type="number" inputmode="decimal" step="0.1" min="20" value="${goalDisp}"></label>
      <label class="f">${t('profile.goalDate')}<input id="pGoalDate" type="date" value="${p.goalDate ?? ''}"></label>
    </div>
    <p class="note" id="suggestNote" hidden></p>
    <div class="actions">
      <button type="button" class="btn danger spacer btn-wrap" id="delProfile" ${app.data.profiles.length < 2 && !p.sample ? 'hidden' : ''}>${t('profile.delete')}</button>
      <button type="submit" class="btn primary">${t('profile.save')}</button>
    </div>
  </form></section>

  <section class="card">
    <div class="card-head"><h2>${t('backup.title')}</h2></div>
    <p class="note flush ${app.store.kind === 'memory' ? 'warnbox' : ''}">${t(`store.${app.store.kind}` as Key)} ${t('backup.intro')}</p>
    ${isIOSBrowserTab() ? `<p class="warnbox">${t('backup.ios')}</p>` : ''}
    <div class="backup-grid">
      <div class="bk">
        <h3>${t('backup.full')}</h3>
        <p class="note flush">${t('backup.fullText', counts(app.data))} ${app.data.settings.lastBackupAt ? t('backup.last', { date: fmtDate(todayISOFrom(app.data.settings.lastBackupAt), { day: 'numeric', month: 'long', year: 'numeric' }) }) : t('backup.none')}</p>
        <div class="actions start"><button type="button" class="btn primary" id="bkDownload">${t('backup.download')}</button><button type="button" class="btn" id="bkRestore">${t('backup.restore')}</button></div>
        <div id="restoreConfirm" hidden></div>
      </div>
      <div class="bk">
        <h3>${t('backup.csv')}</h3>
        <p class="note flush">${t('backup.csvText', { name: esc(p.name) })}</p>
        <div class="actions start"><button type="button" class="btn" id="csvDownload">${t('backup.csvDownload')}</button><button type="button" class="btn" id="csvImport">${t('backup.csvImport')}</button></div>
        <div id="importConfirm" hidden></div>
        <details class="how"><summary>${t('backup.moveHow')}</summary><p class="note">${t('backup.moveHowText')}</p></details>
      </div>
    </div>
  </section>
  ${settingsCard()}`;
}

function readProfileForm(p: Profile): void {
  const u = unit();
  const num = (id: string): number | null => { const el = $<HTMLInputElement>('#' + id); if (!el || el.value === '') return null; const v = parseFloat(el.value); return isNaN(v) ? null : v; };
  p.name = $<HTMLInputElement>('#pName').value.trim() || t('profile.unnamed');
  p.sex = $<HTMLSelectElement>('#pSex').value === 'm' ? 'm' : 'f';
  p.birthYear = num('pYear');
  if (isMetric(u)) p.heightCm = num('pCm');
  else { const ft = num('pFt'), inch = num('pIn') ?? 0; p.heightCm = ft != null ? +((ft * 12 + inch) * CM_IN).toFixed(1) : null; }
  p.frame = $<HTMLSelectElement>('#pFrame').value as Frame;
  p.activity = +$<HTMLSelectElement>('#pAct').value;
  const g = num('pGoal');
  p.goalKg = g == null ? null : +fromDisp(g, u).toFixed(2);
  p.goalDate = $<HTMLInputElement>('#pGoalDate').value || null;
  p.updatedAt = Date.now();
}

function showRestoreConfirm(): void {
  const box = $('#restoreConfirm');
  if (!pendingRestore) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<div class="warnbox">
    <p class="flush">${t('backup.confirm', { file: esc(pendingRestore.name), ...counts(pendingRestore.data) })}</p>
    <div class="actions start"><button type="button" class="btn danger armed btn-wrap" id="restoreGo">${t('backup.replace')}</button><button type="button" class="btn" id="restoreCancel">${t('common.cancel')}</button></div></div>`;
  $('#restoreGo').addEventListener('click', () => {
    app.data = restoredData(pendingRestore!.data, app.data); pendingRestore = null; resetCalories();
    app.applyLanguage();
    applyTheme(app.data.settings.theme);
    commit(t('backup.restored'));
  });
  $('#restoreCancel').addEventListener('click', () => { pendingRestore = null; showRestoreConfirm(); });
}

const IMPORT_TYPES = '.csv,.tsv,.txt,.xml,.zip,text/csv,text/plain,application/zip,application/xml,text/xml';
const longDate = (s: string) => fmtDate(s, { day: 'numeric', month: 'short', year: 'numeric' });

/** What a picked file holds, before anything is saved, so a wrong unit or date order shows up first. */
function showImportConfirm(reading?: string): void {
  const box = $('#importConfirm');
  if (!box) return;
  if (reading) { box.hidden = false; box.innerHTML = `<p class="note flush" role="status">${t('import.reading', { file: esc(reading) })}</p>`; return; }
  if (!pendingImport) { box.hidden = true; box.innerHTML = ''; return; }
  const { name, preview: pv, unit: fileUnit } = pendingImport;
  const u = unit(), p = profile();
  const { entries, outOfRange } = toEntries(pv, fileUnit);
  const kgs = entries.map(e => e.kg);
  const have = new Set(p.sample ? [] : p.entries.map(e => e.date));
  const replaces = entries.filter(e => have.has(e.date)).length;
  const units: WeightUnit[] = ['kg', 'lb', 'st'];
  box.hidden = false;
  box.innerHTML = `<div class="importbox">
    ${entries.length ? `<p class="flush">${t('import.summary', {
      file: esc(name), entries: tn('backup.entries', entries.length), from: longDate(entries[0].date), to: longDate(entries[entries.length - 1].date),
      min: fmtW(Math.min(...kgs), u), max: fmtW(Math.max(...kgs), u) })}</p>` : `<p class="flush">${t('backup.importNone')}</p>`}
    ${pv.sources?.length ? `<p class="note flush">${t('import.sources', { list: esc(pv.sources.slice(0, 4).join(', ')) })}</p>` : ''}
    ${pv.unit == null ? `<div class="import-unit"><span>${t('import.unitQ')}</span><div class="seg" role="group" aria-label="${esc(t('header.units'))}">${units.map(x => `<button type="button" data-import-unit="${x}" aria-pressed="${x === fileUnit}">${x}</button>`).join('')}</div></div>` : ''}
    ${replaces ? `<p class="note flush">${tn('import.replaces', replaces, { name: esc(p.name) })}</p>` : ''}
    ${pv.sameDay ? `<p class="note flush">${tn('import.sameDay', pv.sameDay)}</p>` : ''}
    ${pv.skipped ? `<p class="note flush">${tn('import.skipped', pv.skipped)}</p>` : ''}
    ${outOfRange ? `<p class="note flush">${tn('import.outOfRange', outOfRange)}</p>` : ''}
    ${p.sample && entries.length ? `<p class="note flush">${t('import.newProfile')}</p>` : ''}
    <div class="actions start">${entries.length ? `<button type="button" class="btn primary btn-wrap" id="importGo">${tn('import.go', entries.length)}</button>` : ''}<button type="button" class="btn" id="importCancel">${t('common.cancel')}</button></div>
  </div>`;
  box.querySelectorAll<HTMLButtonElement>('[data-import-unit]').forEach(b => b.addEventListener('click', () => {
    pendingImport!.unit = b.dataset.importUnit as WeightUnit;
    showImportConfirm();
    box.querySelector<HTMLButtonElement>(`[data-import-unit="${pendingImport!.unit}"]`)?.focus();
  }));
  $('#importGo')?.addEventListener('click', () => {
    let target = profile();
    // Real weigh-ins don't belong in the example profile.
    if (target.sample) {
      target = blankProfile(t(app.data.profiles.some(x => !x.sample) ? 'profile.newName' : 'profile.defaultName'));
      app.data.profiles.push(target);
      app.data.activeId = target.id;
      resetCalories();
    }
    const { added, replaced } = mergeEntries(target, entries);
    const left = pv.skipped + outOfRange;
    pendingImport = null;
    commit(t('backup.imported', { n: added }) + (replaced ? t('backup.importedUpdated', { n: replaced }) : '') + (left ? t('backup.importedSkipped', { n: left }) : ''));
  });
  $('#importCancel').addEventListener('click', () => { pendingImport = null; showImportConfirm(); });
}

/** Clears a half-finished import when leaving the screen. */
export const resetImport = (): void => { pendingImport = null; };

const fileStamp = () => todayISO();
const todayISOFrom = (ms: number) => todayISO(new Date(ms));

/** Downloads a full backup and remembers when, for the backup reminder. */
export function downloadBackup(): void {
  app.data.settings.lastBackupAt = Date.now();
  app.data.settings.backupSnoozeUntil = null;
  download(`tare-backup-${fileStamp()}.json`, toBackupJSON(app.data), 'application/json');
  commit(t('backup.downloaded'));
}
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'profile';

export function bindProfile(): void {
  const p = profile();
  bindSettings();
  $('#profForm').addEventListener('submit', ev => {
    ev.preventDefault();
    readProfileForm(p);
    resetCalories();
    commit(t('profile.saved'));
  });

  $('#suggestBtn').addEventListener('click', () => {
    const tmp: Profile = structuredClone(p);
    readProfileForm(tmp);
    const r = calc(tmp), ideal = idealKg(tmp), note = $('#suggestNote');
    note.hidden = false;
    if (!ideal || r.cur == null) { note.textContent = t('profile.suggestNeed'); return; }
    const h2 = (tmp.heightCm! / 100) ** 2;
    const goal = Math.min(24.9 * h2, Math.max(18.5 * h2, ideal));
    const weeks = Math.ceil(Math.abs(r.cur - goal) / 0.5);
    $<HTMLInputElement>('#pGoal').value = disp(goal, unit()).toFixed(1);
    $<HTMLInputElement>('#pGoalDate').value = addDays(todayISO(), weeks * 7);
    note.textContent = t('profile.suggestNote', { weeks, date: fmtDate(addDays(todayISO(), weeks * 7), { day: 'numeric', month: 'long', year: 'numeric' }) });
  });

  $('#delProfile').addEventListener('click', ev => {
    armOrRun(ev.currentTarget as HTMLButtonElement, t('profile.deleteConfirm', { name: p.name }), () => {
      const at = app.data.profiles.indexOf(p);
      app.data.profiles = app.data.profiles.filter(x => x.id !== p.id);
      // Deleting the last profile leaves an empty one in its place; Undo takes that away again if it's still empty.
      const filler = app.data.profiles.length ? null : blankProfile(t('profile.defaultName'));
      if (filler) app.data.profiles.push(filler);
      app.data.activeId = app.data.profiles[0].id;
      resetCalories();
      commitWithUndo(t('profile.deleted'), () => {
        if (app.data.profiles.some(x => x.id === p.id)) return false;
        if (filler) app.data.profiles = app.data.profiles.filter(x => x.id !== filler.id || x.entries.length);
        app.data.profiles.splice(Math.min(at, app.data.profiles.length), 0, p);
        app.data.activeId = p.id;
        resetCalories();
        return true;
      });
      go('overview');
    });
  });

  $('#bkDownload').addEventListener('click', downloadBackup);
  $('#bkRestore').addEventListener('click', async () => {
    const file = await pickTextFile('.json,application/json');
    if (!file) return;
    try { pendingRestore = { data: parseBackup(file.text), name: file.name }; showRestoreConfirm(); }
    catch (e) { toast(fileError(e)); }
  });
  $('#csvDownload').addEventListener('click', () => {
    download(`tare-${slug(p.name)}-${fileStamp()}.csv`, toCSV(p), 'text/csv');
    toast(t('backup.csvDownloaded'));
  });
  $('#csvImport').addEventListener('click', async () => {
    const file = await pickFile(IMPORT_TYPES);
    if (!file) return;
    pendingImport = null;
    showImportConfirm(file.name);
    try {
      // US-style month/day is only assumed when a file's dates could be read either way.
      const preview = await readImportFile(file, navigator.language === 'en-US');
      pendingImport = { name: file.name, preview, unit: guessUnit(preview) };
      showImportConfirm();
      $('#importConfirm')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch (e) { showImportConfirm(); toast(fileError(e)); }
  });
  showImportConfirm();
}
