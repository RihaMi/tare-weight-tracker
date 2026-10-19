import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { app, commit, go, isTab, profile, type Tab } from './app';
import { sampleProfile } from './data/sample';
import { blankProfile, freshData, type Unit } from './data/schema';
import { createSaver, loadData, openStore } from './data/storage';
import { drawChart } from './ui/chart';
import { $, esc, toast } from './ui/dom';
import { initEntryDialog, openEntry } from './ui/entryDialog';
import { bodyView } from './ui/views/body';
import { bindCalories, caloriesView, resetCalories } from './ui/views/calories';
import { historyView, toggleWeeks } from './ui/views/history';
import { overviewView } from './ui/views/overview';
import { bindProfile, profileView } from './ui/views/profile';
import { resetSettingsForm } from './ui/views/settings';
import { updateBadge } from './ui/badge';
import { initLock, isLocked, showLock } from './ui/lock';
import { isPastTime } from './lib/ics';
import { todayISO } from './lib/dates';
import { resolveLang, setLang, t, translateStatic, type Key } from './i18n';
import type { SampleText } from './data/sample';

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
  if (box) drawChart(box, profile(), app.data.unit, app.chartRange);
}

function reminderBanner(): string {
  const rem = app.data.settings.reminder, p = profile();
  if (!rem.enabled || !isPastTime(rem.time) || p.entries.some(e => e.date === todayISO())) return '';
  const text = app.data.profiles.length > 1 ? t('reminder.bannerFor', { name: esc(p.name) }) : t('reminder.banner');
  return `<div class="banner remind"><span>${text}</span>
    <button class="btn primary" data-act="log">${t('reminder.log')}</button></div>`;
}

function render(): void {
  if (isLocked()) return; // never put data on the page behind the lock screen
  renderHeader();
  const view = $('#view');
  view.innerHTML = (app.tab === 'profile' ? '' : reminderBanner() + sampleBanner()) + VIEWS[app.tab]();
  if (app.tab === 'overview') drawOverviewChart();
  if (app.tab === 'calories') bindCalories();
  if (app.tab === 'profile') bindProfile(); else resetSettingsForm();
  updateBadge();
}

let hiddenAt = 0;
function lockNow(): void {
  $<HTMLDialogElement>('#entryDlg').close();
  $('#view').innerHTML = '';
  $('#profileSel').innerHTML = '';
  showLock(render);
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
    if (!document.hidden && !isLocked() && !$<HTMLDialogElement>('#entryDlg').open) render();
  });
}

function newProfile(): void {
  const np = blankProfile(t(app.data.profiles.some(p => !p.sample) ? 'profile.newName' : 'profile.defaultName'));
  app.data.profiles.push(np);
  app.data.activeId = np.id;
  resetCalories();
  commit();
  go('profile');
  setTimeout(() => $<HTMLInputElement>('#pName')?.select(), 30);
}

function bindGlobalEvents(): void {
  $('#logBtn').addEventListener('click', () => openEntry());
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
    const row = target.closest<HTMLElement>('[data-edit]');
    if (row) { openEntry(row.dataset.edit); return; }
    const a = target.closest<HTMLElement>('[data-act]');
    if (!a) return;
    switch (a.dataset.act) {
      case 'log': openEntry(); break;
      case 'logMeas': openEntry(null, true); break;
      case 'newProfile': newProfile(); break;
      case 'toggleWeeks': toggleWeeks(); render(); break;
      case 'clearSample':
        app.data.profiles = app.data.profiles.filter(p => !p.sample);
        if (!app.data.profiles.length) app.data.profiles.push(blankProfile(t('profile.defaultName')));
        app.data.activeId = app.data.profiles[0].id;
        resetCalories();
        commit(t('sample.removed'));
        break;
    }
  });
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
  return { name: t('sample.name'), notes };
}

/** Sets the language from settings, translates the static page and re-renders. */
function applyLanguage(): void {
  setLang(resolveLang(app.data.settings.lang));
  translateStatic();
  // The example profile follows the language, unless it was renamed.
  const sample = app.data.profiles.find(p => p.sample);
  if (sample) {
    const text = sampleText();
    sample.name = text.name;
    for (const e of sample.entries) {
      const d = Number(e.id.replace('sample_', ''));
      const k = Object.keys(text.notes).map(Number).find(n => Math.abs(n - d) <= 1);
      if (e.note && k != null) e.note = text.notes[k];
    }
  }
}

async function start(): Promise<void> {
  const store = await openStore();
  const { data, imported } = await loadData(store);
  app.store = store;
  app.sampleText = sampleText;
  app.applyLanguage = applyLanguage;
  setLang(resolveLang(data?.settings.lang ?? 'auto'));
  app.data = data ?? freshData([sampleProfile(undefined, sampleText())]);
  applyLanguage();
  app.persist = createSaver(store, () => toast(t('app.saveFailed')));
  const h = location.hash.slice(1);
  app.tab = isTab(h) ? h : 'overview';
  app.chartRange = 90;
  app.render = render;
  if (!data) void app.persist(app.data);
  void navigator.storage?.persist?.();
  initEntryDialog();
  initLock();
  bindGlobalEvents();
  setupInstall();
  setupAutoLock();
  const afterUnlock = () => {
    render();
    if (imported) toast(t('app.importedLegacy'));
  };
  if (app.data.settings.pin) showLock(afterUnlock); else afterUnlock();
  if (import.meta.env.PROD) setupUpdates();
}

void start();
