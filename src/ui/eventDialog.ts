import { app, commit, profile } from '../app';
import { EVENT_KINDS, newId, type EventKind, type WeightEvent } from '../data/schema';
import { t } from '../i18n';
import { isISODate, todayISO } from '../lib/dates';
import { eventDeleted } from '../lib/deletions';
import { $, armOrRun, esc } from './dom';
import { commitWithUndo } from './undo';
import { eventKindLabel } from './views/events';

// Adding, editing and deleting an event. Built on first use, like the share dialog.

let editing: WeightEvent | null = null;

function dialog(): HTMLDialogElement {
  let d = document.querySelector<HTMLDialogElement>('#eventDlg');
  if (d) return d;
  d = document.createElement('dialog');
  d.id = 'eventDlg';
  d.setAttribute('aria-labelledby', 'eventTitle');
  document.body.append(d);
  return d;
}

const byStart = (a: WeightEvent, b: WeightEvent) => (a.start < b.start ? -1 : 1);

/** Opens the event form: empty for a new event, or filled in to edit the event with `id`. */
export function openEvent(id?: string): void {
  const p = profile(), d = dialog();
  editing = id ? p.events.find(e => e.id === id) ?? null : null;
  const ev = editing;
  d.innerHTML = `<form class="form" id="eventForm" novalidate>
    <div class="card-head flush"><h2 id="eventTitle">${t(ev ? 'event.titleEdit' : 'event.titleNew')}</h2>
      <button type="button" class="btn ghost" id="eventClose">${t('common.close')}</button></div>
    <div class="fields">
      <label class="f">${t('event.kind')}<select id="evKind">${EVENT_KINDS.map(k => `<option value="${k}" ${(ev?.kind ?? 'medication') === k ? 'selected' : ''}>${eventKindLabel({ kind: k })}</option>`).join('')}</select></label>
      <label class="f">${t('event.label')}<input id="evLabel" maxlength="60" required value="${esc(ev?.label ?? '')}" placeholder="${esc(t('event.labelPlaceholder'))}"></label>
      <label class="f">${t('event.start')}<input id="evStart" type="date" required value="${ev?.start ?? todayISO()}"></label>
      <label class="f">${t('event.end')}<input id="evEnd" type="date" value="${ev?.end ?? ''}"></label>
    </div>
    <p class="note flush">${t('event.endNote')}</p>
    <p class="warnbox" id="evError" role="alert" hidden></p>
    <div class="actions">
      ${ev ? `<button type="button" class="btn danger spacer btn-wrap" id="evDelete">${t('event.delete')}</button>` : ''}
      <button type="button" class="btn" id="evCancel">${t('common.cancel')}</button>
      <button type="submit" class="btn primary">${t('common.save')}</button>
    </div>
  </form>`;
  $('#eventClose').addEventListener('click', () => d.close());
  $('#evCancel').addEventListener('click', () => d.close());
  $('#evStart').addEventListener('input', () => { $<HTMLInputElement>('#evEnd').min = $<HTMLInputElement>('#evStart').value; });
  $<HTMLInputElement>('#evEnd').min = ev?.start ?? todayISO();
  $('#eventForm').addEventListener('submit', ev2 => { ev2.preventDefault(); save(); });
  $('#evDelete')?.addEventListener('click', e => armOrRun(e.currentTarget as HTMLButtonElement, t('event.confirmDelete'), remove));
  d.showModal();
  setTimeout(() => $<HTMLInputElement>('#evLabel').focus(), 30);
}

function save(): void {
  const label = $<HTMLInputElement>('#evLabel').value.trim();
  const start = $<HTMLInputElement>('#evStart').value, end = $<HTMLInputElement>('#evEnd').value || null;
  if (!label || !isISODate(start) || (end && (!isISODate(end) || end < start))) {
    const err = $('#evError'); err.hidden = false; err.textContent = t('event.invalid');
    return;
  }
  const p = profile();
  const ev: WeightEvent = { id: editing?.id ?? newId('ev_'), kind: $<HTMLSelectElement>('#evKind').value as EventKind, label: label.slice(0, 60), start, end, updatedAt: Date.now() };
  p.events = [...p.events.filter(e => e.id !== ev.id), ev].sort(byStart);
  p.updatedAt = Date.now();
  dialog().close();
  commit(t('events.saved'));
}

function remove(): void {
  const p = profile(), gone = editing!;
  p.events = p.events.filter(e => e.id !== gone.id);
  eventDeleted(p, gone.id);
  p.updatedAt = Date.now();
  dialog().close();
  commitWithUndo(t('events.deleted'), () => {
    const owner = app.data.profiles.find(x => x.id === p.id);
    if (!owner || owner.events.some(e => e.id === gone.id)) return false;
    owner.events = [...owner.events, { ...gone, updatedAt: Date.now() }].sort(byStart);
    return true;
  });
}
