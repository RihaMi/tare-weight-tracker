import { commit, profile, unit } from '../app';
import { MEASURES, newId, type Entry, type Measures } from '../data/schema';
import { calc, sortedEntries } from '../lib/calc';
import { newMilestones } from '../lib/insights';
import { milestoneLabel, milestonesFor } from './views/insights';
import { todayISO } from '../lib/dates';
import type { LinkedWeighIn } from '../lib/logLink';
import { CM_IN, disp, fmtW, fromDisp, isMetric, splitStone } from '../lib/units';
import { $, armOrRun } from './dom';
import { t } from '../i18n';
import { measureLabel } from './views/body';

// The "Log weight" dialog, also used to edit or delete a weigh-in.

let editing: string | null = null;
const dlg = () => $<HTMLDialogElement>('#entryDlg');

function weightInputs(kg: number | null): void {
  const u = unit(), w = $('#eWeightWrap');
  if (u === 'st') {
    const s = kg != null ? splitStone(kg) : null;
    w.innerHTML = `<div class="fields big-in">
      <label class="f">${t('entry.stones')}<input id="eSt" type="number" inputmode="numeric" min="2" max="60" value="${s?.st ?? ''}" required></label>
      <label class="f">${t('entry.pounds')}<input id="eLb" type="number" inputmode="decimal" min="0" max="13.9" step="0.1" value="${s ? s.lb.toFixed(1) : ''}"></label></div>`;
  } else {
    w.innerHTML = `<div class="big-in"><label class="f">${t('common.weightUnit', { unit: u })}<input id="eW" type="number" inputmode="decimal" step="0.1" min="20" max="${u === 'kg' ? 400 : 900}" value="${kg != null ? disp(kg, u).toFixed(1) : ''}" required></label></div>`;
  }
}

function checkExists(): void {
  const d = $<HTMLInputElement>('#eDate').value;
  $('#eExists').hidden = !(d && d !== editing && profile().entries.some(e => e.date === d));
}

/**
 * Opens the form: empty for a new weigh-in, filled in to edit `date`, or filled
 * in from a link (`linked`), in which case it asks to confirm and Save is focused.
 */
export function openEntry(date?: string | null, focusMeasures = false, linked?: LinkedWeighIn): void {
  const p = profile(), u = unit();
  const ex = date ? p.entries.find(e => e.date === date) : undefined;
  editing = ex ? ex.date : null;
  $('#entryTitle').textContent = t(ex ? 'entry.editTitle' : linked ? 'entry.confirmTitle' : 'entry.title');
  const dateIn = $<HTMLInputElement>('#eDate');
  dateIn.value = ex ? ex.date : linked?.date ?? todayISO();
  dateIn.max = todayISO();
  weightInputs(ex ? ex.kg : linked?.kg ?? sortedEntries(p).at(-1)?.kg ?? null);
  $<HTMLTextAreaElement>('#eNote').value = ex?.note ?? linked?.note ?? '';
  $('#eMeas').innerHTML = MEASURES.map(([k]) => {
    const l = measureLabel(k);
    const v = ex?.measures?.[k];
    return `<label class="f">${l} (${isMetric(u) ? 'cm' : 'in'})<input id="m_${k}" type="number" inputmode="decimal" step="0.1" min="1" value="${v != null ? (isMetric(u) ? v : (v / CM_IN).toFixed(1)) : ''}"></label>`;
  }).join('');
  $<HTMLDetailsElement>('#eMeasDetails').open = focusMeasures || !!ex?.measures;
  const del = $<HTMLButtonElement>('#eDelete');
  del.hidden = !ex; del.dataset.armed = ''; del.classList.remove('armed'); del.textContent = t('entry.delete');
  checkExists();
  dlg().showModal();
  setTimeout(() => {
    if (linked) { $<HTMLButtonElement>('#entryForm button[type=submit]').focus(); return; }
    const target = focusMeasures ? $<HTMLInputElement>('#m_waist') : ($<HTMLInputElement>('#eW') ?? $<HTMLInputElement>('#eSt'));
    target?.select();
  }, 30);
}

function submit(ev: SubmitEvent): void {
  ev.preventDefault();
  const u = unit();
  const date = $<HTMLInputElement>('#eDate').value;
  let kg: number;
  if (u === 'st') kg = fromDisp(parseFloat($<HTMLInputElement>('#eSt').value) * 14 + parseFloat($<HTMLInputElement>('#eLb').value || '0'), 'lb');
  else kg = fromDisp(parseFloat($<HTMLInputElement>('#eW').value), u);
  const err = $('#eError');
  if (!date || !isFinite(kg) || kg < 20 || kg > 400) {
    err.hidden = false;
    err.textContent = t('entry.invalid', { min: fmtW(20, u), max: fmtW(400, u) });
    return;
  }
  err.hidden = true;
  const measures: Measures = {};
  for (const [k] of MEASURES) {
    const v = parseFloat($<HTMLInputElement>('#m_' + k).value);
    if (isFinite(v) && v > 0) measures[k] = +(isMetric(u) ? v : v * CM_IN).toFixed(1);
  }
  const p = profile();
  const before = milestonesFor(p, calc(p)).achieved;
  const old = p.entries.find(e => e.date === (editing ?? date));
  p.entries = p.entries.filter(e => e.date !== date && e.date !== editing);
  const e: Entry = { id: old?.id ?? newId('e_'), date, kg: Math.round(kg * 100) / 100, updatedAt: Date.now() };
  const note = $<HTMLTextAreaElement>('#eNote').value.trim();
  if (note) e.note = note.slice(0, 500);
  if (Object.keys(measures).length) e.measures = measures;
  p.entries.push(e);
  p.entries.sort((a, b) => (a.date < b.date ? -1 : 1));
  p.updatedAt = Date.now();
  const wasEditing = editing;
  const r = calc(p);
  const reached = newMilestones(before, milestonesFor(p, r).achieved);
  dlg().close();
  commit(reached.length
    ? t('entry.milestone', { label: milestoneLabel(reached[reached.length - 1], r.dir, u) })
    : wasEditing ? t('entry.updated') : t('entry.logged', { w: fmtW(e.kg, u) }));
}

export function initEntryDialog(): void {
  $('#eDate').addEventListener('input', checkExists);
  $('#entryClose').addEventListener('click', () => dlg().close());
  $('#entryCancel').addEventListener('click', () => dlg().close());
  $('#entryForm').addEventListener('submit', submit as EventListener);
  $('#eDelete').addEventListener('click', ev => {
    armOrRun(ev.currentTarget as HTMLButtonElement, t('entry.confirmDelete'), () => {
      const p = profile();
      p.entries = p.entries.filter(e => e.date !== editing);
      p.updatedAt = Date.now();
      dlg().close();
      commit(t('entry.deleted'));
    });
  });
}
