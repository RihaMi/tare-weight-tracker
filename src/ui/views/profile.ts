import { app, commit, go, profile, unit } from '../../app';
import { mergeEntries, parseBackup, parseCSV, restoredData, toBackupJSON, toCSV } from '../../data/backup';
import { DataError, blankProfile, type AppData, type Frame, type Profile } from '../../data/schema';
import { calc, idealKg } from '../../lib/calc';
import { ACTIVITY } from '../../lib/calories';
import { addDays, fmtDate, todayISO } from '../../lib/dates';
import { CM_IN, deltaUnit, disp, fromDisp, isMetric } from '../../lib/units';
import { $, armOrRun, download, esc, pickTextFile, toast } from '../dom';
import { resetCalories } from './calories';
import { bindSettings, settingsCard } from './settings';

const STORE_TEXT: Record<string, string> = {
  indexeddb: 'Saved on this device, in this browser.',
  localstorage: 'Saved on this device, in this browser (basic storage).',
  memory: "This browser isn't letting Tare save anything, so entries will be lost when you close the page. Download a backup before leaving.",
};

let pendingRestore: { data: AppData; name: string } | null = null;

export function profileView(): string {
  const p = profile(), u = unit();
  const hIn = p.heightCm ? p.heightCm / CM_IN : null;
  const goalDisp = p.goalKg != null ? +disp(p.goalKg, u).toFixed(1) : '';
  const entryCount = app.data.profiles.reduce((n, x) => n + x.entries.length, 0);
  return `<section class="card"><form id="profForm" class="form" novalidate>
    <div class="card-head flush"><h2>${p.sample ? 'Example profile' : 'Profile'}</h2></div>
    <div class="fields">
      <label class="f">Name<input id="pName" value="${esc(p.name)}" maxlength="40" required></label>
      <label class="f">Sex<select id="pSex"><option value="f" ${p.sex === 'f' ? 'selected' : ''}>Female</option><option value="m" ${p.sex === 'm' ? 'selected' : ''}>Male</option></select></label>
      <label class="f">Birth year<input id="pYear" type="number" inputmode="numeric" min="1900" max="${new Date().getFullYear()}" value="${p.birthYear ?? ''}"></label>
      ${isMetric(u)
        ? `<label class="f">Height (cm)<input id="pCm" type="number" inputmode="decimal" min="90" max="250" step="0.5" value="${p.heightCm ?? ''}"></label>`
        : `<div class="f"><span>Height</span><div class="inline-in"><input id="pFt" type="number" min="3" max="8" aria-label="Feet" value="${hIn ? Math.floor(hIn / 12) : ''}"><span>ft</span><input id="pIn" type="number" min="0" max="11.9" step="0.1" aria-label="Inches" value="${hIn ? (hIn % 12).toFixed(1) : ''}"><span>in</span></div></div>`}
      <label class="f">Body frame<select id="pFrame">${(['small', 'medium', 'large'] as Frame[]).map(f => `<option value="${f}" ${p.frame === f ? 'selected' : ''}>${f[0].toUpperCase() + f.slice(1)}</option>`).join('')}</select></label>
      <label class="f">Activity<select id="pAct">${ACTIVITY.map(([v, l, s]) => `<option value="${v}" ${p.activity === v ? 'selected' : ''}>${l}: ${s.toLowerCase()}</option>`).join('')}</select></label>
    </div>
    <div class="card-head flush gap-top"><h2>Goal</h2><button type="button" class="btn" id="suggestBtn">Suggest a goal</button></div>
    <div class="fields">
      <label class="f">Goal weight (${deltaUnit(u)})<input id="pGoal" type="number" inputmode="decimal" step="0.1" min="20" value="${goalDisp}"></label>
      <label class="f">Reach it by<input id="pGoalDate" type="date" value="${p.goalDate ?? ''}"></label>
    </div>
    <p class="note" id="suggestNote" hidden></p>
    <div class="actions">
      <button type="button" class="btn danger spacer" id="delProfile" ${app.data.profiles.length < 2 && !p.sample ? 'hidden' : ''}>Delete profile</button>
      <button type="submit" class="btn primary">Save profile</button>
    </div>
  </form></section>

  <section class="card">
    <div class="card-head"><h2>Backup &amp; data</h2></div>
    <p class="note flush ${app.store.kind === 'memory' ? 'warnbox' : ''}">${STORE_TEXT[app.store.kind]} Nothing is sent to a server. Download a backup now and then, and before clearing your browser data or switching devices.</p>
    <div class="backup-grid">
      <div class="bk">
        <h3>Full backup</h3>
        <p class="note flush">Every profile, weigh-in and setting (${app.data.profiles.length} ${app.data.profiles.length === 1 ? 'profile' : 'profiles'}, ${entryCount} weigh-ins) in one .json file.</p>
        <div class="actions start"><button type="button" class="btn primary" id="bkDownload">Download backup</button><button type="button" class="btn" id="bkRestore">Restore from backup…</button></div>
        <div id="restoreConfirm" hidden></div>
      </div>
      <div class="bk">
        <h3>Spreadsheet (CSV)</h3>
        <p class="note flush">${esc(p.name)}'s weigh-ins as a .csv file for Excel or Google Sheets. Import adds weigh-ins from a CSV with <code>date</code> and <code>weight_kg</code> (or <code>weight_lb</code>) columns.</p>
        <div class="actions start"><button type="button" class="btn" id="csvDownload">Download CSV</button><button type="button" class="btn" id="csvImport">Import CSV…</button></div>
      </div>
    </div>
  </section>
  ${settingsCard()}`;
}

function readProfileForm(p: Profile): void {
  const u = unit();
  const num = (id: string): number | null => { const el = $<HTMLInputElement>('#' + id); if (!el || el.value === '') return null; const v = parseFloat(el.value); return isNaN(v) ? null : v; };
  p.name = $<HTMLInputElement>('#pName').value.trim() || 'Unnamed';
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
  const d = pendingRestore.data, n = d.profiles.reduce((s, p) => s + p.entries.length, 0);
  box.hidden = false;
  box.innerHTML = `<div class="warnbox">
    <p class="flush"><b>${esc(pendingRestore.name)}</b> has ${d.profiles.length} ${d.profiles.length === 1 ? 'profile' : 'profiles'} and ${n} weigh-ins. Restoring replaces everything currently in Tare on this device.</p>
    <div class="actions start"><button type="button" class="btn danger armed" id="restoreGo">Replace with backup</button><button type="button" class="btn" id="restoreCancel">Cancel</button></div></div>`;
  $('#restoreGo').addEventListener('click', () => {
    app.data = restoredData(pendingRestore!.data, app.data); pendingRestore = null; resetCalories();
    commit('Backup restored');
  });
  $('#restoreCancel').addEventListener('click', () => { pendingRestore = null; showRestoreConfirm(); });
}

const fileStamp = () => todayISO();
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'profile';

export function bindProfile(): void {
  const p = profile();
  bindSettings();
  $('#profForm').addEventListener('submit', ev => {
    ev.preventDefault();
    readProfileForm(p);
    resetCalories();
    commit('Profile saved');
  });

  $('#suggestBtn').addEventListener('click', () => {
    const tmp: Profile = structuredClone(p);
    readProfileForm(tmp);
    const r = calc(tmp), ideal = idealKg(tmp), note = $('#suggestNote');
    note.hidden = false;
    if (!ideal || r.cur == null) { note.textContent = 'Add your height and at least one weigh-in first.'; return; }
    const h2 = (tmp.heightCm! / 100) ** 2;
    const goal = Math.min(24.9 * h2, Math.max(18.5 * h2, ideal));
    const weeks = Math.ceil(Math.abs(r.cur - goal) / 0.5);
    $<HTMLInputElement>('#pGoal').value = disp(goal, unit()).toFixed(1);
    $<HTMLInputElement>('#pGoalDate').value = addDays(todayISO(), weeks * 7);
    note.textContent = `Based on the Devine formula for your height and frame, kept inside a healthy BMI. At a steady 0.5 kg (1.1 lb) a week that takes about ${weeks} weeks, until ${fmtDate(addDays(todayISO(), weeks * 7), { day: 'numeric', month: 'long', year: 'numeric' })}. Press Save profile to keep it.`;
  });

  $('#delProfile').addEventListener('click', ev => {
    armOrRun(ev.currentTarget as HTMLButtonElement, `Delete ${p.name} and all weigh-ins?`, () => {
      app.data.profiles = app.data.profiles.filter(x => x.id !== p.id);
      if (!app.data.profiles.length) app.data.profiles.push(blankProfile());
      app.data.activeId = app.data.profiles[0].id;
      resetCalories();
      commit('Profile deleted');
      go('overview');
    });
  });

  $('#bkDownload').addEventListener('click', () => {
    download(`tare-backup-${fileStamp()}.json`, toBackupJSON(app.data), 'application/json');
    toast('Backup downloaded');
  });
  $('#bkRestore').addEventListener('click', async () => {
    const file = await pickTextFile('.json,application/json');
    if (!file) return;
    try { pendingRestore = { data: parseBackup(file.text), name: file.name }; showRestoreConfirm(); }
    catch (e) { toast(e instanceof DataError ? e.message : 'That file could not be read.'); }
  });
  $('#csvDownload').addEventListener('click', () => {
    download(`tare-${slug(p.name)}-${fileStamp()}.csv`, toCSV(p), 'text/csv');
    toast('CSV downloaded');
  });
  $('#csvImport').addEventListener('click', async () => {
    const file = await pickTextFile('.csv,text/csv');
    if (!file) return;
    try {
      const { entries, skipped } = parseCSV(file.text);
      if (!entries.length) { toast('No usable weigh-ins found in that file.'); return; }
      const { added, replaced } = mergeEntries(p, entries);
      commit(`Imported ${added} new${replaced ? `, updated ${replaced}` : ''}${skipped ? `, skipped ${skipped} rows` : ''}`);
    } catch (e) { toast(e instanceof DataError ? e.message : 'That file could not be read.'); }
  });
}
