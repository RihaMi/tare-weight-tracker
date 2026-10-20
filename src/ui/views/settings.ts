import { app, commit } from '../../app';
import type { BadgeMode, Lang, Theme } from '../../data/schema';
import { applyTheme } from '../theme';
import { detectLang, t, type Key } from '../../i18n';
import { addDays, todayISO } from '../../lib/dates';
import { dailyReminderICS, isPastTime } from '../../lib/ics';
import { hashPin, isValidPin, verifyPin } from '../../lib/pin';
import { badgeSupported, updateBadge } from '../badge';
import { $, download, esc, toast } from '../dom';

// App-wide settings: language, PIN lock, daily reminder and icon badge. Shown under Profile & goal.

type PinMode = 'idle' | 'set' | 'change' | 'remove';
let pinMode: PinMode = 'idle';

const LOCK_OPTIONS: ReadonlyArray<readonly [number, Key]> = [[0, 'settings.lock0'], [1, 'settings.lock1'], [5, 'settings.lock5'], [15, 'settings.lock15']];
/** Language names are always shown in their own language. */
const LANG_NAMES: Record<'en' | 'cs', string> = { en: 'English', cs: 'Čeština' };

const pinInput = (id: string, label: Key) =>
  `<label class="f">${t(label)}<input id="${id}" type="password" inputmode="numeric" autocomplete="off" maxlength="6" pattern="[0-9]*"></label>`;

function pinForm(): string {
  if (pinMode === 'idle') return '';
  const fields = pinMode === 'set' ? pinInput('pinNew', 'settings.pinNew') + pinInput('pinRepeat', 'settings.pinRepeat')
    : pinMode === 'change' ? pinInput('pinCur', 'settings.pinCurrent') + pinInput('pinNew', 'settings.pinNew') + pinInput('pinRepeat', 'settings.pinRepeat')
    : pinInput('pinCur', 'settings.pinCurrent');
  const label = t(pinMode === 'set' ? 'settings.pinDoSet' : pinMode === 'change' ? 'settings.pinDoChange' : 'settings.pinDoRemove');
  return `<form id="pinForm" class="form pin-form" novalidate>
    <div class="fields">${fields}</div>
    <p class="warnbox" id="pinErr" role="alert" hidden></p>
    <div class="actions start"><button type="submit" class="btn primary">${label}</button><button type="button" class="btn" id="pinCancel">${t('common.cancel')}</button></div>
  </form>`;
}

export function settingsCard(): string {
  const s = app.data.settings;
  const on = !!s.pin;
  const langOpts: Array<[Lang, string]> = [['auto', t('settings.langAuto', { lang: LANG_NAMES[detectLang()] })], ['en', LANG_NAMES.en], ['cs', LANG_NAMES.cs]];
  const themeOpts: Array<[Theme, Key]> = [['auto', 'settings.themeAuto'], ['light', 'settings.themeLight'], ['dark', 'settings.themeDark']];
  const badgeOpts: Array<[BadgeMode, Key]> = [['off', 'settings.badgeOff'], ['remaining', 'settings.badgeRemaining'], ['reminder', 'settings.badgeReminder']];
  return `<section class="card" id="settingsCard">
    <div class="card-head"><h2>${t('settings.title')}</h2><span class="muted small">${t('settings.sub')}</span></div>
    <div class="settings">
      <div class="setting">
        <div class="setting-text"><h3>${t('settings.language')}</h3><p class="note flush">${t('settings.languageText')}</p></div>
        <div class="setting-ctl">
          <select id="langSel" aria-label="${esc(t('settings.language'))}">${langOpts.map(([v, l]) => `<option value="${v}" ${s.lang === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        </div>
      </div>
      <div class="setting">
        <div class="setting-text"><h3>${t('settings.theme')}</h3><p class="note flush">${t('settings.themeText')}</p></div>
        <div class="setting-ctl">
          <div class="seg" role="group" aria-label="${esc(t('settings.theme'))}" id="themeSeg">${themeOpts.map(([v, l]) => `<button type="button" data-theme-opt="${v}" aria-pressed="${s.theme === v}">${t(l)}</button>`).join('')}</div>
        </div>
      </div>
      <div class="setting">
        <div class="setting-text"><h3>${t('settings.pin')}</h3>
          <p class="note flush">${on ? t('settings.pinOn', { n: s.pin!.length }) : t('settings.pinOff')} ${t('settings.pinNote')}</p></div>
        <div class="setting-ctl">${on
          ? `<button type="button" class="btn" data-pin="change">${t('settings.pinChange')}</button><button type="button" class="btn danger" data-pin="remove">${t('settings.pinTurnOff')}</button>`
          : `<button type="button" class="btn primary" data-pin="set">${t('settings.pinSet')}</button>`}</div>
        ${pinForm()}
        ${on ? `<label class="f inline-f">${t('settings.autoLock')}
          <select id="autoLock">${LOCK_OPTIONS.map(([v, l]) => `<option value="${v}" ${s.autoLockMinutes === v ? 'selected' : ''}>${t(l)}</option>`).join('')}</select></label>` : ''}
      </div>
      <div class="setting">
        <div class="setting-text"><h3>${t('settings.quickLog')}</h3><p class="note flush">${t('settings.quickLogText')}</p></div>
        <div class="setting-ctl"><label class="switch"><input type="checkbox" id="quickLogOn" ${s.quickLog ? 'checked' : ''}><span>${t('settings.quickLogOn')}</span></label></div>
      </div>
      <div class="setting">
        <div class="setting-text"><h3>${t('settings.reminder')}</h3><p class="note flush">${t('settings.reminderText')}</p></div>
        <div class="setting-ctl">
          <label class="switch"><input type="checkbox" id="remOn" ${s.reminder.enabled ? 'checked' : ''}><span>${t('settings.remindMe')}</span></label>
          <input type="time" id="remTime" value="${s.reminder.time}" aria-label="${esc(t('settings.reminderTime'))}">
          <button type="button" class="btn" id="remIcs">${t('settings.addCalendar')}</button>
        </div>
      </div>
      <div class="setting">
        <div class="setting-text"><h3>${t('settings.badge')}</h3>
          <p class="note flush">${t(badgeSupported() ? 'settings.badgeOk' : 'settings.badgeNo')}${on ? t('settings.badgeHidden') : ''}</p></div>
        <div class="setting-ctl">
          <select id="badgeMode" aria-label="${esc(t('settings.badge'))}">
            ${badgeOpts.map(([v, l]) => `<option value="${v}" ${s.badge === v ? 'selected' : ''}>${t(l)}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>
  </section>`;
}

function rerenderCard(): void {
  $('#settingsCard').outerHTML = settingsCard();
  bindSettings();
}

async function submitPin(ev: SubmitEvent): Promise<void> {
  ev.preventDefault();
  const val = (id: string) => ($<HTMLInputElement>('#' + id)?.value ?? '').trim();
  const err = $('#pinErr');
  const fail = (k: Key) => { err.hidden = false; err.textContent = t(k); };
  const s = app.data.settings;
  if (pinMode !== 'set' && !(s.pin && (await verifyPin(val('pinCur'), s.pin)))) { fail('settings.pinWrongCurrent'); return; }
  if (pinMode === 'remove') {
    s.pin = null; pinMode = 'idle';
    commit(t('settings.pinTurnedOff'));
    return;
  }
  if (!isValidPin(val('pinNew'))) { fail('settings.pinInvalid'); return; }
  if (val('pinNew') !== val('pinRepeat')) { fail('settings.pinMismatch'); return; }
  const wasOn = !!s.pin;
  s.pin = await hashPin(val('pinNew'));
  pinMode = 'idle';
  commit(t(wasOn ? 'settings.pinChanged' : 'settings.pinTurnedOn'));
}

export function bindSettings(): void {
  const card = $('#settingsCard');
  $('#langSel').addEventListener('change', ev => {
    app.data.settings.lang = (ev.target as HTMLSelectElement).value as Lang;
    app.applyLanguage();
    commit(t('settings.langChanged'));
  });
  $('#themeSeg').addEventListener('click', ev => {
    const b = (ev.target as Element).closest<HTMLButtonElement>('[data-theme-opt]');
    if (!b) return;
    app.data.settings.theme = b.dataset.themeOpt as Theme;
    applyTheme(app.data.settings.theme);
    commit(t('settings.themeSaved'));
  });
  card.querySelectorAll<HTMLButtonElement>('[data-pin]').forEach(b => b.addEventListener('click', () => {
    pinMode = b.dataset.pin as PinMode;
    rerenderCard();
    (document.querySelector<HTMLInputElement>('#pinCur') ?? document.querySelector<HTMLInputElement>('#pinNew'))?.focus();
  }));
  $('#pinForm')?.addEventListener('submit', ev => void submitPin(ev as SubmitEvent));
  $('#pinCancel')?.addEventListener('click', () => { pinMode = 'idle'; rerenderCard(); });
  $('#autoLock')?.addEventListener('change', ev => {
    app.data.settings.autoLockMinutes = +(ev.target as HTMLSelectElement).value;
    commit(t('settings.autoLockSaved'));
  });
  $('#quickLogOn').addEventListener('change', ev => {
    app.data.settings.quickLog = (ev.target as HTMLInputElement).checked;
    commit(t('settings.quickLogSaved'));
  });
  $('#remOn').addEventListener('change', ev => {
    app.data.settings.reminder.enabled = (ev.target as HTMLInputElement).checked;
    commit(t(app.data.settings.reminder.enabled ? 'settings.reminderOn' : 'settings.reminderOff'));
  });
  $('#remTime').addEventListener('change', ev => {
    const v = (ev.target as HTMLInputElement).value;
    if (!/^\d{2}:\d{2}$/.test(v)) return;
    app.data.settings.reminder.time = v;
    commit(t('settings.reminderTimeSaved'));
  });
  $('#remIcs').addEventListener('click', () => {
    const time = $<HTMLInputElement>('#remTime').value || app.data.settings.reminder.time;
    const start = isPastTime(time) ? addDays(todayISO(), 1) : todayISO();
    download('tare-daily-reminder.ics', dailyReminderICS({
      startDate: start, time, title: t('settings.icsTitle'), description: t('settings.icsText'),
      uid: `tare-daily-${Date.now()}@tare`,
    }), 'text/calendar');
    toast(t('settings.icsDownloaded'));
  });
  $('#badgeMode').addEventListener('change', ev => {
    app.data.settings.badge = (ev.target as HTMLSelectElement).value as BadgeMode;
    commit(t('settings.badgeSaved'));
    updateBadge();
  });
}

/** Resets the PIN form when leaving the screen. */
export const resetSettingsForm = (): void => { pinMode = 'idle'; };
