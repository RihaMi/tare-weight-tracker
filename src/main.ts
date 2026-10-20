import './fonts.css';
import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { app, commit, isTab, profile, type Tab } from './app';
import { sampleProfile } from './data/sample';
import { blankProfile, freshData, type Unit } from './data/schema';
import { createSaver, loadData, openStore } from './data/storage';
import { showStartupProblem } from './ui/startup';
import { autoBackupState, initAutoBackup, resumeAutoBackup, scheduleAutoBackup } from './ui/autoBackup';
import { openSetup, shouldOfferSetup } from './ui/setup';
import { drawChart } from './ui/chart';
import { $, esc, toast } from './ui/dom';
import { initEntryDialog, openEntry } from './ui/entryDialog';
import { openEvent } from './ui/eventDialog';
import { openShare } from './ui/shareCard';
import { bodyView } from './ui/views/body';
import { bindCalories, caloriesView, resetCalories } from './ui/views/calories';
import { historyView, toggleWeeks } from './ui/views/history';
import { overviewView, rememberChartTable } from './ui/views/overview';
import { bindProfile, downloadBackup, profileView, resetImport } from './ui/views/profile';
import { backupNudge } from './lib/backupNudge';
import { announceSaved, initTabSync } from './ui/sync';
import { keyInfoFor, newKeyInfo, seal, unseal, type Envelope } from './lib/crypto';
import { verifyPin } from './lib/pin';
import { migrate } from './data/schema';
import { resetSettingsForm } from './ui/views/settings';
import { updateBadge } from './ui/badge';
import { initLock, isLocked, showLock } from './ui/lock';
import { applyTheme } from './ui/theme';
import { commitWithUndo, initUndoShortcut } from './ui/undo';
import { isPastTime } from './lib/ics';
import { todayISO } from './lib/dates';
import { parseLogLink } from './lib/logLink';
import { resolveLang, setLang, t, tn, translateStatic, type Key } from './i18n';
import type { SampleText } from './data/sample';
import { en } from './i18n/en';
import { cs } from './i18n/cs';

/** The example profile's default name in every language, to tell whether someone renamed it. */
const SAMPLE_NAMES = new Set([en['sample.name'], cs['sample.name']].filter((v): v is string => typeof v === 'string'));

const VIEWS: Record<Tab, () => string> = { overview: overviewView, history: historyView, body: bodyView, calories: caloriesView, profile: profileView };

function sampleBanner(): string {
  if (!profile().sample) return '';
  return `<div class="banner"><span>${t('sample.banner')}</span>
    <span class="actions"><button class="btn" data-act="clearSample">${t('sample.remove')}</button><button class="btn primary" data-act="newProfile">${t('sample.create')}</button></span></div>`;
}

function renderHeader(): void {
  const sel = $<HTMLSelectElement>('#profileSel');
  sel.innerHTML = app.data.profiles.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('') + `<option value="__new">${esc(t('header.newProfile'))}</option>`;
  sel.value = profile().id;
  document.querySelectorAll<HTMLButtonElement>('#unitSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.unit === app.data.unit)));
  document.querySelectorAll<HTMLAnchorElement>('.tabs a').forEach(a => {
    if (a.dataset.tab === app.tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

function drawOverviewChart(): void {
  const box = document.getElementById('chartBox');
  if (box) drawChart(box, profile(), app.data.unit, app.chartRange, document.getElementById('chartTable'));
}

function reminderBanner(): string {
  const rem = app.data.settings.reminder, p = profile();
  if (!rem.enabled || !isPastTime(rem.time) || p.entries.some(e => e.date === todayISO())) return '';
  const text = app.data.profiles.length > 1 ? t('reminder.bannerFor', { name: esc(p.name) }) : t('reminder.banner');
  return `<div class="banner remind"><span>${text}</span>
    <button class="btn primary" data-act="log">${t('reminder.log')}</button></div>`;
}

/** Stays until a save works again, so lost changes can't go unnoticed. */
function saveBanner(): string {
  if (!app.saveFailed) return '';
  return `<div class="banner backup" role="alert"><span>${t('app.saveFailedBanner')}</span>
    <span class="actions"><button class="btn" data-act="retrySave">${t('app.retrySave')}</button><button class="btn primary" data-act="backupNow">${t('backup.download')}</button></span></div>`;
}

function setSaveFailed(failed: boolean): void {
  if (app.saveFailed === failed) return;
  app.saveFailed = failed;
  toast(t(failed ? 'app.saveFailed' : 'app.savedAgain'));
  render();
}

/** A calm bar for errors nothing else handles, instead of the app quietly misbehaving. */
function setupErrorBar(): void {
  const show = () => { if (!document.body.classList.contains('halted')) $('#errorBar').hidden = false; };
  window.addEventListener('error', ev => {
    // Errors from browser extensions and harmless layout warnings aren't Tare's.
    if (ev.filename && new URL(ev.filename, location.href).origin !== location.origin) return;
    if (/ResizeObserver loop/.test(ev.message ?? '')) return;
    show();
  });
  window.addEventListener('unhandledrejection', ev => { if ((ev.reason as Error)?.name !== 'AbortError') show(); });
  $('#errorReload').addEventListener('click', () => location.reload());
  $('#errorClose').addEventListener('click', () => { $('#errorBar').hidden = true; });
}

function backupBanner(): string {
  const auto = autoBackupState();
  if (auto.kind === 'paused') {
    return `<div class="banner backup"><span>${t('autobackup.pausedBanner', { folder: esc(auto.folder) })}</span>
      <button class="btn primary" data-act="resumeAutoBackup">${t('autobackup.resume')}</button></div>`;
  }
  const n = backupNudge(app.data);
  if (!n) return '';
  const text = n.kind === 'never' ? t('backup.remindNever') : tn('backup.remindStale', n.days);
  return `<div class="banner backup"><span>${text}</span>
    <span class="actions"><button class="btn" data-act="backupLater">${t('backup.later')}</button><button class="btn primary" data-act="backupNow">${t('backup.download')}</button></span></div>`;
}

function render(): void {
  if (isLocked()) return; // never put data on the page behind the lock screen
  renderHeader();
  const view = $('#view');
  view.innerHTML = saveBanner() + (app.tab === 'profile' ? '' : reminderBanner() + (app.tab === 'overview' ? backupBanner() : '') + sampleBanner()) + VIEWS[app.tab]();
  if (app.tab === 'overview') drawOverviewChart();
  if (app.tab === 'calories') bindCalories();
  if (app.tab === 'profile') bindProfile(); else { resetSettingsForm(); resetImport(); }
  updateBadge();
}

/**
 * Quick log: open the entry form once a day when the active profile has no
 * weigh-in for today. Remembered per device so reloading doesn't reopen it.
 */
const QUICK_KEY = 'tare.quickLogDay';
function maybeQuickLog(): void {
  const p = profile(), today = todayISO();
  if (!app.data.settings.quickLog || p.sample || !p.entries.length || p.entries.some(e => e.date === today)) return;
  if (isLocked() || $<HTMLDialogElement>('#entryDlg').open) return;
  try { if (localStorage.getItem(QUICK_KEY) === today) return; localStorage.setItem(QUICK_KEY, today); } catch { /* still open it once now */ }
  openEntry();
}

/** Opened from the app icon's "Log weight" shortcut (?action=log). */
/** True when the app was opened to log a weight: the icon shortcut (?action=log) or a link with a weight (?log=84.2). */
const launchedToLog = (): boolean => {
  const params = new URLSearchParams(location.search);
  return params.get('action') === 'log' || params.has('log');
};

function handleLaunchAction(): void {
  const params = new URLSearchParams(location.search);
  const linked = parseLogLink(params, app.data.unit, todayISO());
  // Drop the link from the address bar, so a reload or bookmark can't log it twice.
  history.replaceState(null, '', location.pathname + '#' + app.tab);
  if (linked === null) toast(t('link.invalid'));
  openEntry(null, false, linked ?? undefined);
}

/**
 * Unlocks encrypted data with a PIN. Reads the latest saved copy first (another
 * window may have saved since this one started); decrypting it is the PIN check.
 */
async function unlockEncrypted(pin: string, fallback: Envelope): Promise<boolean> {
  const { locked } = await loadData(app.store);
  const env = locked ?? fallback;
  try {
    const key = await keyInfoFor(pin, env);
    app.data = migrate(await unseal(env, key));
    app.key = key;
  } catch {
    return false;
  }
  applyLanguage();
  applyTheme(app.data.settings.theme);
  resetCalories();
  return true;
}

/**
 * Unlocks data that's already loaded, checking the PIN hash. If the data isn't
 * encrypted yet (PIN set before encryption existed), this derives the key and
 * saves it encrypted from now on.
 */
async function unlockLoaded(pin: string): Promise<boolean> {
  const stored = app.data.settings.pin;
  if (!stored || !(await verifyPin(pin, stored))) return false;
  if (!app.key) {
    app.key = await newKeyInfo(pin);
    void app.persist(app.data);
  }
  return true;
}

let hiddenAt = 0;
function lockNow(env?: Envelope): void {
  $<HTMLDialogElement>('#entryDlg').close();
  $('#view').innerHTML = '';
  $('#profileSel').innerHTML = '';
  const then = () => { render(); maybeQuickLog(); };
  if (env) { app.key = null; showLock(then, { length: env.pinLength, verify: pin => unlockEncrypted(pin, env) }); }
  else showLock(then, { verify: unlockLoaded });
}

/** Locks again after Tare has been in the background for the chosen time. */
function setupAutoLock(): void {
  document.addEventListener('visibilitychange', () => {
    const s = app.data.settings;
    if (!s.pin || isLocked()) return;
    if (document.hidden) {
      hiddenAt = Date.now();
      if (s.autoLockMinutes === 0) lockNow(); // before the app switcher takes its snapshot
    } else if (hiddenAt && Date.now() - hiddenAt >= s.autoLockMinutes * 60_000) {
      lockNow();
    }
  });
  document.addEventListener('visibilitychange', () => {
    // Coming back after a while: refresh the reminder banner and badge.
    if (!document.hidden && !isLocked() && !$<HTMLDialogElement>('#entryDlg').open) { render(); maybeQuickLog(); }
  });
}

/** "Create my profile" and "+ New profile" open the short setup. */
function newProfile(): void {
  openSetup({ firstRun: false });
}

function bindGlobalEvents(): void {
  $('#logBtn').addEventListener('click', () => openEntry());
  // "toggle" doesn't bubble, so it's caught on the way down.
  document.addEventListener('toggle', ev => {
    const d = ev.target as HTMLDetailsElement;
    if (d.classList?.contains('chart-table')) rememberChartTable(d.open);
  }, true);
  $('#profileSel').addEventListener('change', ev => {
    const v = (ev.target as HTMLSelectElement).value;
    if (v === '__new') { newProfile(); return; }
    app.data.activeId = v;
    resetCalories();
    commit();
  });
  $('#unitSeg').addEventListener('click', ev => {
    const b = (ev.target as Element).closest<HTMLButtonElement>('button');
    if (!b) return;
    app.data.unit = b.dataset.unit as Unit;
    commit();
  });
  $('#view').addEventListener('click', ev => {
    const target = ev.target as Element;
    const rb = target.closest<HTMLButtonElement>('[data-range]');
    if (rb) {
      app.chartRange = +rb.dataset.range!;
      rb.parentElement!.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === rb)));
      drawOverviewChart();
      return;
    }
    const evBtn = target.closest<HTMLElement>('[data-event]');
    if (evBtn) { openEvent(evBtn.dataset.event); return; }
    const row = target.closest<HTMLElement>('[data-edit]');
    if (row) { openEntry(row.dataset.edit); return; }
    const a = target.closest<HTMLElement>('[data-act]');
    if (!a) return;
    switch (a.dataset.act) {
      case 'log': openEntry(); break;
      case 'addEvent': openEvent(); break;
      case 'share': void openShare(); break;
      case 'logMeas': openEntry(null, true); break;
      case 'newProfile': newProfile(); break;
      case 'toggleWeeks': toggleWeeks(); render(); break;
      case 'backupNow': downloadBackup(); break;
      case 'resumeAutoBackup': void resumeAutoBackup().then(ok => toast(t(ok ? 'autobackup.resumed' : 'autobackup.notAllowed'))); break;
      case 'retrySave': void app.persist(app.data); break;
      case 'backupLater':
        app.data.settings.backupSnoozeUntil = Date.now() + 7 * 864e5;
        commit();
        break;
      case 'clearSample': {
        const before = app.data.profiles, wasActive = app.data.activeId;
        const removed = before.filter(p => p.sample);
        app.data.profiles = before.filter(p => !p.sample);
        const filler = app.data.profiles.length ? null : blankProfile(t('profile.defaultName'));
        if (filler) app.data.profiles.push(filler);
        app.data.activeId = app.data.profiles[0].id;
        resetCalories();
        commitWithUndo(t('sample.removed'), () => {
          if (app.data.profiles.some(p => p.sample)) return false;
          if (filler) app.data.profiles = app.data.profiles.filter(x => x.id !== filler.id || x.entries.length);
          for (const p of removed) app.data.profiles.splice(Math.min(before.indexOf(p), app.data.profiles.length), 0, p);
          app.data.activeId = app.data.profiles.some(p => p.id === wasActive) ? wasActive : app.data.profiles[0].id;
          resetCalories();
          return true;
        });
        break;
      }
    }
  });
  $('#entryDlg').addEventListener('close', () => { if (renderWhenDialogCloses) { renderWhenDialogCloses = false; render(); } });
  window.addEventListener('popstate', () => {
    const h = location.hash.slice(1);
    app.tab = isTab(h) ? h : 'overview';
    render();
  });
  window.addEventListener('hashchange', () => {
    const h = location.hash.slice(1);
    if (isTab(h) && h !== app.tab) { app.tab = h; render(); window.scrollTo(0, 0); }
  });
  let resizeTimer: number | undefined;
  new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = window.setTimeout(drawOverviewChart, 60); }).observe($('#view'));
}

function setupInstall(): void {
  let deferred: (Event & { prompt: () => Promise<void> }) | null = null;
  const btn = $<HTMLButtonElement>('#installBtn');
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as typeof deferred; btn.hidden = false; });
  btn.addEventListener('click', async () => { if (!deferred) return; await deferred.prompt(); deferred = null; btn.hidden = true; });
  window.addEventListener('appinstalled', () => { btn.hidden = true; toast(t('app.installed')); });
}

function setupUpdates(): void {
  const updateSW = registerSW({
    onNeedRefresh() {
      const bar = $('#updateBar');
      bar.hidden = false;
      $('#updateGo').onclick = () => updateSW(true);
    },
    onOfflineReady() { toast(t('app.offlineReady')); },
  });
}

function sampleText(): SampleText {
  const notes: Record<number, string> = {};
  for (const d of [0, 9, 23, 41, 64, 88, 110]) notes[d] = t(`sample.note${d}` as Key);
  return { name: t('sample.name'), notes, events: { away: t('sample.eventAway'), runs: t('sample.eventRuns') } };
}

/** Another Tare window saved: take its data, and redraw unless the user is mid-entry. */
let renderWhenDialogCloses = false;
function onExternalChange(): void {
  applyLanguage();
  applyTheme(app.data.settings.theme);
  resetCalories();
  if ($<HTMLDialogElement>('#entryDlg').open) { renderWhenDialogCloses = true; return; }
  render();
  toast(t('app.synced'));
}

/** Sets the language from settings, translates the static page and re-renders. */
function applyLanguage(): void {
  setLang(resolveLang(app.data.settings.lang));
  translateStatic();
  // The example profile follows the language, unless it was renamed.
  const sample = app.data.profiles.find(p => p.sample);
  if (sample) {
    const text = sampleText();
    if (SAMPLE_NAMES.has(sample.name)) sample.name = text.name;
    for (const e of sample.entries) {
      const d = Number(e.id.replace('sample_', ''));
      const k = Object.keys(text.notes).map(Number).find(n => Math.abs(n - d) <= 1);
      if (e.note && k != null) e.note = text.notes[k];
    }
    for (const ev of sample.events) {
      if (ev.id === 'sample_ev_away') ev.label = text.events.away;
      if (ev.id === 'sample_ev_runs') ev.label = text.events.runs;
    }
  }
}

async function start(): Promise<void> {
  setupErrorBar();
  const store = await openStore();
  const { data, imported, locked, problem } = await loadData(store);
  if (problem) {
    // Saved data that can't be used: stop here, so nothing is ever saved over it.
    setLang(resolveLang('auto'));
    translateStatic();
    showStartupProblem(problem, store);
    if (import.meta.env.PROD) setupUpdates(); // a newer version may be waiting
    return;
  }
  app.store = store;
  app.key = null;
  app.saveFailed = false;
  app.sampleText = sampleText;
  app.applyLanguage = applyLanguage;
  setLang(resolveLang(data?.settings.lang ?? 'auto'));
  // While encrypted data waits for the PIN, a placeholder keeps the app working. It is never saved.
  app.data = data ?? freshData([sampleProfile(undefined, sampleText())]);
  applyLanguage();
  applyTheme(app.data.settings.theme);
  // With a PIN (and its key, once unlocked) every save is encrypted.
  const save = createSaver(store, () => setSaveFailed(true), d => (d.settings.pin && app.key ? seal(d, app.key) : d), () => { setSaveFailed(false); scheduleAutoBackup(); });
  void initAutoBackup(() => render());
  app.persist = d => save(d).then(announceSaved);
  const h = location.hash.slice(1);
  app.tab = isTab(h) ? h : 'overview';
  app.chartRange = 90;
  app.render = render;
  const firstVisit = !data && !locked;
  if (firstVisit) void app.persist(app.data); // first run only: never write over encrypted data
  void navigator.storage?.persist?.();
  // Fonts used to come from Google and were cached separately; they're part of the app now.
  void globalThis.caches?.delete('google-fonts').catch(() => {});
  initEntryDialog();
  initLock();
  initUndoShortcut();
  bindGlobalEvents();
  initTabSync(onExternalChange, env => lockNow(env));
  setupInstall();
  setupAutoLock();
  const afterUnlock = () => {
    render();
    if (imported) toast(t('app.importedLegacy'));
    if (launchedToLog()) handleLaunchAction();
    else if (firstVisit && shouldOfferSetup()) openSetup({ firstRun: true });
    else maybeQuickLog();
  };
  if (locked) showLock(afterUnlock, { length: locked.pinLength, verify: pin => unlockEncrypted(pin, locked) });
  else if (app.data.settings.pin) showLock(afterUnlock, { verify: unlockLoaded });
  else afterUnlock();
  if (import.meta.env.PROD) setupUpdates();
}

start().catch(error => {
  try { setLang(resolveLang('auto')); translateStatic(); } catch { /* English is fine */ }
  showStartupProblem({ kind: 'crash', error }, null);
});
