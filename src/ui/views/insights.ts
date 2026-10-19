import { unit } from '../../app';
import type { Profile, Unit } from '../../data/schema';
import { t, tn, type Key } from '../../i18n';
import type { Stats } from '../../lib/calc';
import { fmtDate, todayISO } from '../../lib/dates';
import { milestoneStepKg, milestones, streaks, weeklyAverages, weekStart, type Milestone, type NextMilestone } from '../../lib/insights';
import { LB, fmtDelta, fmtW } from '../../lib/units';

/** A milestone amount in the unit people think in: 5 kg, 10 lb, 1 st. */
export function fmtStep(kg: number, u: Unit): string {
  if (u === 'kg') return `${Math.round(kg)} kg`;
  if (u === 'lb') return `${Math.round(kg / LB)} lb`;
  return `${Math.round(kg / LB / 14)} st`;
}

const amountLabel = (amountKg: number, dir: number, u: Unit) => t(dir < 0 ? 'ms.lost' : 'ms.gained', { amount: fmtStep(amountKg, u) });

export function milestoneLabel(m: Milestone, dir: number, u: Unit): string {
  switch (m.kind) {
    case 'weight': return amountLabel(m.amountKg, dir, u);
    case 'progress': return t('ms.progress', { pct: m.pct });
    case 'goal': return t('ms.goal');
    case 'bmi': return m.category === 'normal' ? t('ms.bmiHealthy') : t('ms.bmi', { cat: t(`bmi.${m.category}` as Key).toLowerCase() });
  }
}

function nextLabel(n: NextMilestone, dir: number, u: Unit): string {
  if (n.kind === 'weight') return amountLabel(n.amountKg!, dir, u);
  if (n.kind === 'progress') return t('ms.progressShort', { pct: n.pct! });
  return t('ms.goalNext');
}

/** How far along the way to `next` the bar should be, 0..1. */
function nextFraction(n: NextMilestone, p: Profile, r: Stats, u: Unit): number {
  const span = n.kind === 'weight' ? milestoneStepKg(u) : r.hasGoal ? Math.abs(p.goalKg! - r.start!) * 0.25 : 1;
  return Math.min(1, Math.max(0, 1 - n.remainingKg / span));
}

export const milestonesFor = (p: Profile, r: Stats) => milestones({ entries: r.E, goalKg: p.goalKg, heightCm: p.heightCm, unit: unit() });

const msItem = (m: Milestone, dir: number, u: Unit, date: string) =>
  `<li><span class="ms-dot ${m.kind}"></span><span>${milestoneLabel(m, dir, u)}</span><span class="muted">${date}</span></li>`;

export function thisWeekCard(p: Profile, r: Stats): string {
  const u = unit(), today = todayISO();
  const weeks = weeklyAverages(r.E);
  const current = weeks.find(w => w.week === weekStart(today));
  const shown = current ?? weeks[0];
  const s = streaks(r.E, today);
  const { achieved, next } = milestonesFor(p, r);
  const recent = achieved.slice(-2).reverse();
  const tone = (v: number | null) => (v == null ? '' : r.dir * v > 0.05 ? 'good' : r.dir * v < -0.05 ? 'bad' : '');

  return `<section class="card"><div class="card-head"><h2>${t(current ? 'week.this' : 'week.last')}</h2>
      ${s.loggedToday ? `<span class="pill good">${t('week.weighedToday')}</span>` : `<button type="button" class="btn small-btn" data-act="log">${t('week.logToday')}</button>`}</div>
    <div class="stats">
      <div class="stat"><span class="v">${fmtW(shown.avg, u)}</span><span class="k">${tn('week.average', shown.n)}</span></div>
      <div class="stat"><span class="v ${tone(shown.change)}">${shown.change == null ? '—' : fmtDelta(shown.change, u)}</span><span class="k">${t('week.vsPrev')}</span></div>
      <div class="stat"><span class="v">${tn('week.days', s.days)}</span><span class="k">${t('week.dailyStreak', { n: s.longestDays })}</span></div>
      <div class="stat"><span class="v">${tn('week.weeks', s.weeks)}</span><span class="k">${t('week.weeksInRow')}</span></div>
    </div>
    ${next ? `<div class="next-ms">
      <div class="next-ms-head"><span><span class="eyebrow">${t('week.nextMilestone')}</span><b>${nextLabel(next, r.dir, u)}</b></span><span class="mono">${t('common.toGo', { w: fmtW(next.remainingKg, u) })}</span></div>
      <div class="ms-bar"><span style="width:${(nextFraction(next, p, r, u) * 100).toFixed(1)}%"></span></div>
    </div>` : ''}
    ${recent.length ? `<ul class="ms-list compact">${recent.map(m => msItem(m, r.dir, u, fmtDate(m.date))).join('')}</ul>` : ''}
  </section>`;
}

const WEEKS_SHOWN = 8;

export function weeklyCard(r: Stats, showAll: boolean): string {
  const u = unit(), weeks = weeklyAverages(r.E);
  if (weeks.length < 2) return '';
  const list = showAll ? weeks : weeks.slice(0, WEEKS_SHOWN);
  const max = Math.max(...weeks.map(w => Math.abs(w.change ?? 0)), 0.1);
  return `<section class="card"><div class="card-head"><h2>${t('weekly.title')}</h2><span class="muted small">${t('weekly.sub')}</span></div>
    <div class="table-wrap"><table class="week-table">
      <thead><tr><th>${t('weekly.week')}</th><th class="num">${t('weekly.avg')}</th><th class="num">${t('weekly.change')}</th><th class="bar-col" aria-hidden="true"></th><th class="num">${t('weekly.count')}</th></tr></thead>
      <tbody>${list.map(w => {
        const c = w.change, cls = c == null ? '' : r.dir * c > 0.05 ? 'good' : r.dir * c < -0.05 ? 'bad' : '';
        const width = c == null ? 0 : (Math.abs(c) / max) * 100;
        return `<tr><td>${fmtDate(w.week, { day: 'numeric', month: 'short', year: 'numeric' })}</td><td class="num">${fmtW(w.avg, u)}</td>
          <td class="num ${cls}">${c == null ? '—' : fmtDelta(c, u)}</td>
          <td class="bar-col" aria-hidden="true"><span class="wbar ${cls}" style="width:${width.toFixed(1)}%"></span></td>
          <td class="num">${w.n}</td></tr>`;
      }).join('')}</tbody></table></div>
    ${weeks.length > WEEKS_SHOWN ? `<div class="actions start"><button type="button" class="btn ghost small-btn" data-act="toggleWeeks">${showAll ? t('weekly.fewer') : t('weekly.all', { n: weeks.length })}</button></div>` : ''}
  </section>`;
}

export function milestonesCard(p: Profile, r: Stats): string {
  const u = unit();
  const { achieved, next } = milestonesFor(p, r);
  if (!achieved.length && !next) return '';
  const long = (s: string) => fmtDate(s, { day: 'numeric', month: 'short', year: 'numeric' });
  return `<section class="card"><div class="card-head"><h2>${t('milestones.title')}</h2><span class="muted small">${t('milestones.count', { n: achieved.length })}</span></div>
    ${achieved.length ? `<ul class="ms-list">${[...achieved].reverse().map(m => msItem(m, r.dir, u, long(m.date))).join('')}</ul>`
      : `<p class="note flush">${t('milestones.first')}</p>`}
    ${next ? `<p class="note">${t('milestones.next', { label: nextLabel(next, r.dir, u), w: fmtW(next.remainingKg, u) })}</p>` : ''}
  </section>`;
}
