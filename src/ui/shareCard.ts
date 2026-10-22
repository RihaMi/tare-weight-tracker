import { profile, unit } from '../app';
import { t, tn } from '../i18n';
import { fmtDate, todayISO } from '../lib/dates';
import { cardModel, chartRange, type CardModel, type CardPeriod } from '../lib/progressCard';
import { fmtDelta, fmtW } from '../lib/units';
import { $, esc, toast } from './dom';
import { milestoneLabel } from './views/insights';

// A picture of your progress to save or send. It's drawn on this device and
// only leaves it if you share it. Weights are left off unless you turn them on.

const W = 1080, H = 1350; // 4:5, the shape most apps show in full
const C = {
  bg: '#EDF0EF', card: '#FFFFFF', ink: '#111A18', muted: '#5B6965', line: '#E3E8E6',
  accent: '#2446D6', good: '#11734B', bad: '#B42F25', dots: 'rgba(91, 105, 101, .32)', chip: 'rgba(36, 70, 214, .10)',
};
const DISPLAY = '"Bricolage Grotesque", "Segoe UI", system-ui, sans-serif';
const BODY = 'Figtree, "Segoe UI", system-ui, sans-serif';

export interface CardOptions { showWeights: boolean }

type Ctx = CanvasRenderingContext2D;

/** Draws text in one line, shrinking it until it fits `maxW`. */
function text(ctx: Ctx, s: string, x: number, y: number, o: { size: number; weight: number; family?: string; color: string; maxW?: number; align?: CanvasTextAlign }): number {
  let size = o.size;
  const font = () => `${o.weight} ${size}px ${o.family ?? BODY}`;
  ctx.font = font();
  while (o.maxW && size > 12 && ctx.measureText(s).width > o.maxW) { size -= 2; ctx.font = font(); }
  ctx.fillStyle = o.color;
  ctx.textAlign = o.align ?? 'left';
  ctx.fillText(s, x, y);
  return ctx.measureText(s).width;
}

/** The Tare mark: a scale with a needle. */
function mark(ctx: Ctx, x: number, y: number, s: number): void {
  const k = s / 24;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = C.ink;
  ctx.beginPath(); ctx.roundRect(2, 5, 20, 16, 5); ctx.stroke();
  ctx.strokeStyle = C.accent;
  ctx.beginPath(); ctx.arc(12, 11, 4, Math.PI, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(12, 11); ctx.lineTo(14, 9); ctx.stroke();
  ctx.restore();
}

function span(m: CardModel): string {
  return m.days < 14 ? tn('share.inDays', m.days) : tn('share.inWeeks', Math.round(m.days / 7));
}

export function drawCard(canvas: HTMLCanvasElement, m: CardModel, o: CardOptions): void {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const u = unit();
  const L = 116, R = W - 116, inner = R - L;

  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.card; ctx.beginPath(); ctx.roundRect(48, 48, W - 96, H - 96, 44); ctx.fill();

  // Header: the mark and name, and the dates covered.
  ctx.textBaseline = 'middle';
  mark(ctx, L, 112, 56);
  text(ctx, 'Tare', L + 72, 142, { size: 46, weight: 800, family: DISPLAY, color: C.ink });
  const dates = `${fmtDate(m.from, { day: 'numeric', month: 'short', year: 'numeric' })} – ${fmtDate(m.to, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  text(ctx, dates, R, 142, { size: 30, weight: 500, color: C.muted, align: 'right', maxW: inner - 260 });

  // The headline: how much changed, and over how long.
  ctx.textBaseline = 'alphabetic';
  text(ctx, t('share.heading'), L, 268, { size: 34, weight: 600, color: C.muted, maxW: inner });
  const toward = m.dir * m.changeKg;
  const tone = toward > 0.05 ? C.good : toward < -0.05 ? C.bad : C.ink;
  text(ctx, fmtDelta(m.changeKg, u), L - 6, 448, { size: 200, weight: 800, family: DISPLAY, color: tone, maxW: inner });
  text(ctx, `${span(m)} · ${tn('backup.entries', m.count)}`, L, 520, { size: 38, weight: 500, color: C.ink, maxW: inner });

  // The chart: the smoothed trend over the daily weigh-ins.
  const top = 600, bottom = 960;
  const { lo, hi } = chartRange(m);
  const X = (x: number) => L + x * inner;
  const Y = (kg: number) => top + ((hi - kg) / (hi - lo)) * (bottom - top);
  ctx.strokeStyle = C.line; ctx.lineWidth = 2;
  for (let i = 0; i <= 3; i++) { const y = top + (i / 3) * (bottom - top); ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke(); }
  if (m.goalKg != null) {
    const gy = Y(m.goalKg);
    ctx.save(); ctx.setLineDash([14, 12]); ctx.strokeStyle = C.good; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(L, gy); ctx.lineTo(R, gy); ctx.stroke(); ctx.restore();
    const label = o.showWeights ? `${t('common.goal')} ${fmtW(m.goalKg, u)}` : t('common.goal');
    const below = gy - top < 50;
    text(ctx, label, R, below ? gy + 40 : gy - 16, { size: 28, weight: 700, color: C.good, align: 'right' });
  }
  ctx.fillStyle = C.dots;
  const r = m.points.length > 200 ? 4 : 6;
  for (const p of m.points) { ctx.beginPath(); ctx.arc(X(p.x), Y(p.kg), r, 0, Math.PI * 2); ctx.fill(); }
  const grad = ctx.createLinearGradient(0, top, 0, bottom);
  grad.addColorStop(0, 'rgba(36, 70, 214, .20)'); grad.addColorStop(1, 'rgba(36, 70, 214, 0)');
  ctx.beginPath();
  m.trend.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.kg)) : ctx.moveTo(X(p.x), Y(p.kg))));
  ctx.lineTo(X(1), bottom); ctx.lineTo(X(0), bottom); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath();
  m.trend.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.kg)) : ctx.moveTo(X(p.x), Y(p.kg))));
  ctx.strokeStyle = C.accent; ctx.lineWidth = 8; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
  const end = m.trend[m.trend.length - 1];
  ctx.beginPath(); ctx.arc(X(end.x), Y(end.kg), 14, 0, Math.PI * 2); ctx.fillStyle = C.card; ctx.fill();
  ctx.beginPath(); ctx.arc(X(end.x), Y(end.kg), 9, 0, Math.PI * 2); ctx.fillStyle = C.accent; ctx.fill();
  if (o.showWeights) {
    // Start weight above the line's start (there's room above the chart), latest below the line's end, where the line isn't.
    const sy = Y(m.trend[0].kg), ey = Y(end.kg);
    text(ctx, fmtW(m.startKg, u), L, Math.max(sy - 24, top - 16), { size: 30, weight: 700, color: C.ink });
    text(ctx, fmtW(m.curKg, u), R, bottom - ey > 100 ? ey + 56 : ey - 28, { size: 30, weight: 700, color: C.accent, align: 'right' });
  }

  // Three numbers along the bottom.
  const cols: Array<[string, string]> = [];
  if (m.goalKg != null) {
    cols.push(m.reached ? ['✓', t('share.goalDone')] : [`${Math.round(m.progress! * 100)}${t('share.pctSuffix')}`, o.showWeights ? t('share.ofGoalW', { w: fmtW(m.goalKg, u) }) : t('share.ofGoal')]);
  }
  cols.push([fmtDelta(m.perWeekKg, u, 2), t('share.perWeek')]);
  cols.push([tn('week.days', m.longestStreak), t('share.streak')]);
  if (cols.length < 3) cols.unshift([String(m.count), t('share.weighIns')]);
  const colW = inner / 3;
  cols.forEach(([v, k], i) => {
    const x = L + i * colW;
    text(ctx, v, x, 1066, { size: 52, weight: 800, family: DISPLAY, color: C.ink, maxW: colW - 24 });
    text(ctx, k, x, 1108, { size: 26, weight: 500, color: C.muted, maxW: colW - 24 });
  });

  // Up to two recent milestones as chips. BMI ones hint at weight, so they wait for "Show my weight".
  let cx = L;
  for (const ms of m.recent.filter(x => o.showWeights || x.kind !== 'bmi').slice(0, 2)) {
    const label = '★ ' + milestoneLabel(ms, m.dir, u);
    ctx.font = `600 28px ${BODY}`;
    const w = Math.min(ctx.measureText(label).width + 44, R - cx);
    if (w < 160) break;
    ctx.fillStyle = C.chip; ctx.beginPath(); ctx.roundRect(cx, 1150, w, 60, 30); ctx.fill();
    ctx.textBaseline = 'middle';
    text(ctx, label, cx + 22, 1181, { size: 28, weight: 600, color: C.accent, maxW: w - 44 });
    ctx.textBaseline = 'alphabetic';
    cx += w + 14;
  }

  text(ctx, t('share.footer'), L, 1262, { size: 26, weight: 500, color: C.muted, maxW: inner / 2 });
  text(ctx, fmtDate(todayISO(), { day: 'numeric', month: 'long', year: 'numeric' }), R, 1262, { size: 26, weight: 500, color: C.muted, align: 'right', maxW: inner / 2 });
}

// ---- The dialog ----

let showWeights = false;
let blob: Blob | null = null;
let url = '';

/** Waits for the app's fonts, but not for long: on a slow connection the picture is drawn with system fonts instead. */
async function loadFonts(): Promise<void> {
  const fonts = Promise.all([`800 100px ${DISPLAY}`, `500 30px ${BODY}`, `600 30px ${BODY}`, `700 30px ${BODY}`].map(f => document.fonts.load(f)));
  try { await Promise.race([fonts, new Promise(res => setTimeout(res, 1500))]); } catch { /* system fonts are fine */ }
}

async function redraw(m: CardModel): Promise<void> {
  const canvas = document.createElement('canvas');
  await loadFonts();
  drawCard(canvas, m, { showWeights });
  blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
  if (!blob) { toast(t('share.failed')); return; }
  if (url) URL.revokeObjectURL(url);
  url = URL.createObjectURL(blob);
  $<HTMLImageElement>('#shareImg').src = url;
}

const fileName = () => `tare-progress-${todayISO()}.png`;

function dialog(): HTMLDialogElement {
  let d = document.querySelector<HTMLDialogElement>('#shareDlg');
  if (d) return d;
  d = document.createElement('dialog');
  d.id = 'shareDlg';
  d.className = 'share-dlg';
  d.setAttribute('aria-labelledby', 'shareTitle');
  document.body.append(d);
  d.addEventListener('close', () => { if (url) { URL.revokeObjectURL(url); url = ''; } blob = null; });
  return d;
}

/** Opens the picture of your progress, or of one period such as a year. */
export async function openShare(period?: CardPeriod): Promise<void> {
  const m = cardModel(profile(), unit(), todayISO(), period);
  if (!m) return;
  const d = dialog();
  const canShare = (() => {
    try { return !!navigator.canShare?.({ files: [new File([new Uint8Array(1)], 'x.png', { type: 'image/png' })] }); } catch { return false; }
  })();
  d.innerHTML = `<div class="share-body">
    <div class="card-head flush"><h2 id="shareTitle">${t('share.title')}</h2><button type="button" class="btn ghost" id="shareClose">${t('common.close')}</button></div>
    <img id="shareImg" class="share-img" alt="${esc(t('share.alt'))}" width="${W}" height="${H}">
    <label class="switch"><input type="checkbox" id="shareWeights" ${showWeights ? 'checked' : ''}><span>${t('share.showWeights')}</span></label>
    <p class="note flush">${t('share.privacy')}</p>
    <div class="actions">
      <button type="button" class="btn ${canShare ? '' : 'primary'}" id="shareDownload">${t('share.download')}</button>
      ${canShare ? `<button type="button" class="btn primary" id="shareGo">${t('share.share')}</button>` : ''}
    </div>
  </div>`;
  $('#shareClose').addEventListener('click', () => d.close());
  $<HTMLInputElement>('#shareWeights').addEventListener('change', ev => {
    showWeights = (ev.target as HTMLInputElement).checked;
    void redraw(m);
  });
  $('#shareDownload').addEventListener('click', () => {
    if (!blob) return;
    const a = Object.assign(document.createElement('a'), { href: url, download: fileName() });
    document.body.append(a); a.click(); a.remove();
    toast(t('share.downloaded'));
  });
  $('#shareGo')?.addEventListener('click', async () => {
    if (!blob) return;
    try { await navigator.share({ files: [new File([blob], fileName(), { type: 'image/png' })], title: t('share.title') }); }
    catch (e) { if ((e as Error).name !== 'AbortError') toast(t('share.failed')); }
  });
  d.showModal();
  await redraw(m);
}
