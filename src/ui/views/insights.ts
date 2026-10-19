import { unit } from '../../app';
import type { Profile, Unit } from '../../data/schema';
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

export function milestoneLabel(m: Milestone, dir: number, u: Unit): string {
  switch (m.kind) {
    case 'weight': return `${fmtStep(m.amountKg, u)} ${dir < 0 ? 'lost' : 'gained'}`;
    case 'progress': return `${m.pct}% of the way to your goal`;
    case 'goal': return 'Goal reached';
    case 'bmi': return `BMI now ${m.category === 'Normal' ? 'in the healthy range' : m.category.toLowerCase()}`;
  }
}

function nextLabel(n: NextMilestone, dir: number, u: Unit): string {
  if (n.kind === 'weight') return `${fmtStep(n.amountKg!, u)} ${dir < 0 ? 'lost' : 'gained'}`;
  if (n.kind === 'progress') return `${n.pct}% of the way`;
  return 'Your goal';
}

/** How far along the way to `next` the bar should be, 0..1. */
function nextFraction(n: NextMilestone, p: Profile, r: Stats, u: Unit): number {
  const span = n.kind === 'weight' ? milestoneStepKg(u) : r.hasGoal ? Math.abs(p.goalKg! - r.start!) * 0.25 : 1;
  return Math.min(1, Math.max(0, 1 - n.remainingKg / span));
}

export const milestonesFor = (p: Profile, r: Stats) => milestones({ entries: r.E, goalKg: p.goalKg, heightCm: p.heightCm, unit: unit() });

export function thisWeekCard(p: Profile, r: Stats): string {
  const u = unit(), today = todayISO();
  const weeks = weeklyAverages(r.E);
  const current = weeks.find(w => w.week === weekStart(today));
  const shown = current ?? weeks[0];
  const s = streaks(r.E, today);
  const { achieved, next } = milestonesFor(p, r);
  const recent = achieved.slice(-2).reverse();
  const tone = (v: number | null) => (v == null ? '' : r.dir * v > 0.05 ? 'good' : r.dir * v < -0.05 ? 'bad' : '');

  return `<section class="card"><div class="card-head"><h2>${current ? 'This week' : 'Last logged week'}</h2>
      ${s.loggedToday ? '<span class="pill good">Weighed in today</span>' : '<button type="button" class="btn small-btn" data-act="log">Log today</button>'}</div>
    <div class="stats">
      <div class="stat"><span class="v">${fmtW(shown.avg, u)}</span><span class="k">Average, ${shown.n} ${shown.n === 1 ? 'weigh-in' : 'weigh-ins'}</span></div>
      <div class="stat"><span class="v ${tone(shown.change)}">${shown.change == null ? '—' : fmtDelta(shown.change, u)}</span><span class="k">vs. previous week</span></div>
      <div class="stat"><span class="v">${s.days} ${s.days === 1 ? 'day' : 'days'}</span><span class="k">Daily streak · best ${s.longestDays}</span></div>
      <div class="stat"><span class="v">${s.weeks} ${s.weeks === 1 ? 'week' : 'weeks'}</span><span class="k">Weeks in a row</span></div>
    </div>
    ${next ? `<div class="next-ms">
      <div class="next-ms-head"><span><span class="eyebrow">Next milestone</span><b>${nextLabel(next, r.dir, u)}</b></span><span class="mono">${fmtW(next.remainingKg, u)} to go</span></div>
      <div class="ms-bar"><span style="width:${(nextFraction(next, p, r, u) * 100).toFixed(1)}%"></span></div>
    </div>` : ''}
    ${recent.length ? `<ul class="ms-list compact">${recent.map(m => `<li><span class="ms-dot ${m.kind}"></span><span>${milestoneLabel(m, r.dir, u)}</span><span class="muted">${fmtDate(m.date)}</span></li>`).join('')}</ul>` : ''}
  </section>`;
}

const WEEKS_SHOWN = 8;

export function weeklyCard(r: Stats, showAll: boolean): string {
  const u = unit(), weeks = weeklyAverages(r.E);
  if (weeks.length < 2) return '';
  const list = showAll ? weeks : weeks.slice(0, WEEKS_SHOWN);
  const max = Math.max(...weeks.map(w => Math.abs(w.change ?? 0)), 0.1);
  return `<section class="card"><div class="card-head"><h2>Weekly averages</h2><span class="muted small">Smooths out day-to-day water swings</span></div>
    <div class="table-wrap"><table class="week-table">
      <thead><tr><th>Week of</th><th class="num">Average</th><th class="num">Change</th><th class="bar-col" aria-hidden="true"></th><th class="num">Weigh-ins</th></tr></thead>
      <tbody>${list.map(w => {
        const c = w.change, cls = c == null ? '' : r.dir * c > 0.05 ? 'good' : r.dir * c < -0.05 ? 'bad' : '';
        const width = c == null ? 0 : (Math.abs(c) / max) * 100;
        return `<tr><td>${fmtDate(w.week, { day: 'numeric', month: 'short', year: 'numeric' })}</td><td class="num">${fmtW(w.avg, u)}</td>
          <td class="num ${cls}">${c == null ? '—' : fmtDelta(c, u)}</td>
          <td class="bar-col" aria-hidden="true"><span class="wbar ${cls}" style="width:${width.toFixed(1)}%"></span></td>
          <td class="num">${w.n}</td></tr>`;
      }).join('')}</tbody></table></div>
    ${weeks.length > WEEKS_SHOWN ? `<div class="actions start"><button type="button" class="btn ghost small-btn" data-act="toggleWeeks">${showAll ? 'Show fewer weeks' : `Show all ${weeks.length} weeks`}</button></div>` : ''}
  </section>`;
}

export function milestonesCard(p: Profile, r: Stats): string {
  const u = unit();
  const { achieved, next } = milestonesFor(p, r);
  if (!achieved.length && !next) return '';
  return `<section class="card"><div class="card-head"><h2>Milestones</h2><span class="muted small">${achieved.length} reached</span></div>
    ${achieved.length ? `<ul class="ms-list">${[...achieved].reverse().map(m => `<li><span class="ms-dot ${m.kind}"></span><span>${milestoneLabel(m, r.dir, u)}</span><span class="muted">${fmtDate(m.date, { day: 'numeric', month: 'short', year: 'numeric' })}</span></li>`).join('')}</ul>`
      : '<p class="note flush">Your first milestone is on its way.</p>'}
    ${next ? `<p class="note">Next: <b>${nextLabel(next, r.dir, u)}</b>, ${fmtW(next.remainingKg, u)} to go.</p>` : ''}
  </section>`;
}
