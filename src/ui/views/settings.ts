import { app, commit } from '../../app';
import type { BadgeMode } from '../../data/schema';
import { addDays, todayISO } from '../../lib/dates';
import { dailyReminderICS, isPastTime } from '../../lib/ics';
import { hashPin, isValidPin, verifyPin } from '../../lib/pin';
import { badgeSupported, updateBadge } from '../badge';
import { $, download, toast } from '../dom';

// App-wide settings: PIN lock, daily reminder and icon badge. Shown under Profile & goal.

type PinMode = 'idle' | 'set' | 'change' | 'remove';
let pinMode: PinMode = 'idle';

const LOCK_OPTIONS: ReadonlyArray<readonly [number, string]> = [[0, 'Immediately'], [1, 'After 1 minute'], [5, 'After 5 minutes'], [15, 'After 15 minutes']];

const pinInput = (id: string, label: string) =>
  `<label class="f">${label}<input id="${id}" type="password" inputmode="numeric" autocomplete="off" maxlength="6" pattern="[0-9]*"></label>`;

function pinForm(): string {
  if (pinMode === 'idle') return '';
  const fields = pinMode === 'set' ? pinInput('pinNew', 'New PIN (4–6 digits)') + pinInput('pinRepeat', 'Repeat new PIN')
    : pinMode === 'change' ? pinInput('pinCur', 'Current PIN') + pinInput('pinNew', 'New PIN (4–6 digits)') + pinInput('pinRepeat', 'Repeat new PIN')
    : pinInput('pinCur', 'Current PIN');
  const label = pinMode === 'set' ? 'Turn on PIN lock' : pinMode === 'change' ? 'Change PIN' : 'Turn off PIN lock';
  return `<form id="pinForm" class="form pin-form" novalidate>
    <div class="fields">${fields}</div>
    <p class="warnbox" id="pinErr" role="alert" hidden></p>
    <div class="actions start"><button type="submit" class="btn primary">${label}</button><button type="button" class="btn" id="pinCancel">Cancel</button></div>
  </form>`;
}

export function settingsCard(): string {
  const s = app.data.settings;
  const on = !!s.pin;
  return `<section class="card" id="settingsCard">
    <div class="card-head"><h2>App settings</h2><span class="muted small">For everyone using Tare on this device</span></div>
    <div class="settings">
      <div class="setting">
        <div class="setting-text"><h3>PIN lock</h3>
          <p class="note flush">${on ? `On. Tare asks for your ${s.pin!.length}-digit PIN when it opens.` : 'Off. Anyone with this device can open Tare.'} The PIN keeps people out of the app. It doesn't encrypt your data.</p></div>
        <div class="setting-ctl">${on
          ? `<button type="button" class="btn" data-pin="change">Change PIN</button><button type="button" class="btn danger" data-pin="remove">Turn off</button>`
          : `<button type="button" class="btn primary" data-pin="set">Set a PIN</button>`}</div>
        ${pinForm()}
        ${on ? `<label class="f inline-f">Lock again when Tare is in the background
          <select id="autoLock">${LOCK_OPTIONS.map(([v, l]) => `<option value="${v}" ${s.autoLockMinutes === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
      </div>
      <div class="setting">
        <div class="setting-text"><h3>Daily reminder</h3>
          <p class="note flush">Shows a reminder in Tare after this time if you haven't weighed in yet. For an alert on your phone, add it to your calendar too.</p></div>
        <div class="setting-ctl">
          <label class="switch"><input type="checkbox" id="remOn" ${s.reminder.enabled ? 'checked' : ''}><span>Remind me</span></label>
          <input type="time" id="remTime" value="${s.reminder.time}" aria-label="Reminder time">
          <button type="button" class="btn" id="remIcs">Add to calendar</button>
        </div>
      </div>
      <div class="setting">
        <div class="setting-text"><h3>App icon badge</h3>
          <p class="note flush">${badgeSupported() ? 'Shown on the Tare icon when the app is installed.' : "This browser can't show icon badges. Install Tare in Chrome or Edge, or on iPhone, to use this."}${on ? ' Hidden while PIN lock is on.' : ''}</p></div>
        <div class="setting-ctl">
          <select id="badgeMode" aria-label="App icon badge">
            ${([['off', 'Nothing'], ['remaining', 'Weight left to goal'], ['reminder', "A dot until today's weigh-in"]] as Array<[BadgeMode, string]>)
              .map(([v, l]) => `<option value="${v}" ${s.badge === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>
  </section>`;
}

function rerenderCard(): void {
  const card = $('#settingsCard');
  card.outerHTML = settingsCard();
  bindSettings();
}

async function submitPin(ev: SubmitEvent): Promise<void> {
  ev.preventDefault();
  const val = (id: string) => ($<HTMLInputElement>('#' + id)?.value ?? '').trim();
  const err = $('#pinErr');
  const fail = (m: string) => { err.hidden = false; err.textContent = m; };
  const s = app.data.settings;
  if (pinMode !== 'set' && !(s.pin && (await verifyPin(val('pinCur'), s.pin)))) { fail('The current PIN is wrong.'); return; }
  if (pinMode === 'remove') {
    s.pin = null; pinMode = 'idle';
    commit('PIN lock turned off');
    return;
  }
  if (!isValidPin(val('pinNew'))) { fail('Use 4 to 6 digits for the PIN.'); return; }
  if (val('pinNew') !== val('pinRepeat')) { fail("The two new PINs don't match."); return; }
  const wasOn = !!s.pin;
  s.pin = await hashPin(val('pinNew'));
  pinMode = 'idle';
  commit(wasOn ? 'PIN changed' : 'PIN lock turned on');
}

export function bindSettings(): void {
  const card = $('#settingsCard');
  card.querySelectorAll<HTMLButtonElement>('[data-pin]').forEach(b => b.addEventListener('click', () => {
    pinMode = b.dataset.pin as PinMode;
    rerenderCard();
    (document.querySelector<HTMLInputElement>('#pinCur') ?? document.querySelector<HTMLInputElement>('#pinNew'))?.focus();
  }));
  $('#pinForm')?.addEventListener('submit', ev => void submitPin(ev as SubmitEvent));
  $('#pinCancel')?.addEventListener('click', () => { pinMode = 'idle'; rerenderCard(); });
  $('#autoLock')?.addEventListener('change', ev => {
    app.data.settings.autoLockMinutes = +(ev.target as HTMLSelectElement).value;
    commit('Auto-lock updated');
  });
  $('#remOn').addEventListener('change', ev => {
    app.data.settings.reminder.enabled = (ev.target as HTMLInputElement).checked;
    commit(app.data.settings.reminder.enabled ? 'Daily reminder on' : 'Daily reminder off');
  });
  $('#remTime').addEventListener('change', ev => {
    const v = (ev.target as HTMLInputElement).value;
    if (!/^\d{2}:\d{2}$/.test(v)) return;
    app.data.settings.reminder.time = v;
    commit('Reminder time saved');
  });
  $('#remIcs').addEventListener('click', () => {
    const time = $<HTMLInputElement>('#remTime').value || app.data.settings.reminder.time;
    const start = isPastTime(time) ? addDays(todayISO(), 1) : todayISO();
    download('tare-daily-reminder.ics', dailyReminderICS({
      startDate: start, time, title: 'Weigh in (Tare)', description: 'Step on the scale and log your weight in Tare.',
      uid: `tare-daily-${Date.now()}@tare`,
    }), 'text/calendar');
    toast('Calendar file downloaded. Open it to add the reminder.');
  });
  $('#badgeMode').addEventListener('change', ev => {
    app.data.settings.badge = (ev.target as HTMLSelectElement).value as BadgeMode;
    commit('Badge setting saved');
    updateBadge();
  });
}

/** Resets the PIN form when leaving the screen. */
export const resetSettingsForm = (): void => { pinMode = 'idle'; };
