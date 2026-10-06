// Bills Management -- the Calendar tab (month / week / agenda) and the Cash Planning tab (what has to be
// paid, week by week, with the recurring bills that are still to be created counted in as "projected").
import { esc, money, moneyShort, fmtDate, daysText, statusBadge, prioBadge, tagBadge, kpiCard, stackedColumns, openDrawer, closeDrawer, plural, COLORS } from './billsUi.js?v=20261006d';
import { matchesScope, monthCells, weekDates, groupByDue, weekday, addDays, ymd, yearOf, monthOf, monthName, addMonths, weekBuckets, projectTemplates, PRIORITIES, sum, daysBetween, PRIORITY_RANK } from './billsLogic.js?v=20261006d';
import { exportPlan } from './billsExport.js?v=20261006d';

const $ = (id) => document.getElementById(id);
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SLUG = { Paid: 'paid', 'Auto-Debited': 'auto', Unpaid: 'unpaid', 'Partially Paid': 'partial', 'Due Soon': 'soon', 'Due Today': 'today', Overdue: 'overdue', Cancelled: 'gray' };
const dayLabel = (d) => DOW[weekday(d)] + ', ' + fmtDate(d);
export const newCalState = (today) => ({ view: 'month', y: yearOf(today), m: monthOf(today), anchor: today, paid: 'all', overdueOnly: false, recurringOnly: false });

function branchCategoryBar(ctx, extra) {
  const f = ctx.filters;
  return '<div class="card bl-filterbar"><div class="bl-filters">' +
    '<div class="field"><label>Branch</label><select data-flt="branch"><option value="">All branches</option><option value="none"' + (f.branch === 'none' ? ' selected' : '') + '>Not assigned yet</option>' +
      ctx.branches.map((b) => '<option value="' + b.id + '"' + (String(f.branch) === String(b.id) ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Category</label><select data-flt="category"><option value="">All categories</option>' +
      ctx.cats.filter((c) => c.active || String(f.category) === String(c.id)).map((c) => '<option value="' + c.id + '"' + (String(f.category) === String(c.id) ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select></div>' +
    (extra || '') + '</div></div>';
}
const bindBranchCategory = (ctx, root) => root.querySelectorAll('[data-flt]').forEach((el) => el.addEventListener('change', () => { ctx.filters[el.dataset.flt] = el.value; ctx.rerender(); }));

// ================================================================ calendar
function calBills(ctx) {
  const c = ctx.ui.cal, f = ctx.filters;
  return ctx.bills.filter((b) => !b.archived_at && b._eff !== 'Cancelled' && b.due_date && matchesScope(b, f) &&
    (c.paid === 'all' || (c.paid === 'unpaid' ? b._open : !b._open)) && (!c.overdueOnly || b._eff === 'Overdue') && (!c.recurringOnly || b.is_recurring));
}
const chip = (b) => '<button type="button" class="bl-cal-chip bl-cal-' + (SLUG[b._eff] || 'gray') + '" data-open="' + b.id + '" title="' + esc(b.name + ' · ' + b._eff + ' · ' + money(b._amount)) + '">' + esc(b.name) + (b._amount ? ' <b>' + moneyShort(b._amount) + '</b>' : '') + '</button>';
const dot = (b) => '<span class="bl-dot bl-cal-' + (SLUG[b._eff] || 'gray') + '"></span>';

function monthGridHtml(ctx, byDay, y, m) {
  const cells = monthCells(y, m);
  return '<div class="bl-cal-card card"><div class="bl-cal-grid">' + DOW.map((d) => '<div class="bl-cal-head">' + d + '</div>').join('') +
    cells.map((cell) => {
      const list = byDay[cell.date] || [];
      const tot = sum(list.filter((b) => b._open), (b) => b._remaining);
      return '<div class="bl-cal-cell' + (cell.inMonth ? '' : ' bl-cal-out') + (cell.date === ctx.today ? ' bl-cal-istoday' : '') + '" data-day="' + cell.date + '" tabindex="0" role="button" aria-label="' + esc(dayLabel(cell.date) + ', ' + plural(list.length, 'bill')) + '">' +
        '<div class="bl-cal-top"><span class="bl-cal-num">' + Number(cell.date.slice(8)) + '</span>' + (tot ? '<span class="bl-cal-tot">' + moneyShort(tot) + '</span>' : '') + '</div>' +
        '<div class="bl-cal-chips">' + list.slice(0, 3).map(chip).join('') + (list.length > 3 ? '<button type="button" class="bl-cal-more" data-day="' + cell.date + '">+' + (list.length - 3) + ' more</button>' : '') + '</div>' +
        '<div class="bl-cal-dots">' + list.slice(0, 6).map(dot).join('') + '</div></div>';
    }).join('') + '</div></div>';
}
function weekHtml(ctx, byDay) {
  const days = weekDates(ctx.ui.cal.anchor);
  return '<div class="bl-week">' + days.map((d) => {
    const list = byDay[d] || [];
    return '<div class="bl-week-col' + (d === ctx.today ? ' bl-cal-istoday' : '') + '" data-day="' + d + '"><div class="bl-week-head"><b>' + DOW[weekday(d)] + ' ' + Number(d.slice(8)) + '</b> <span class="muted">' + esc(monthName(monthOf(d)).slice(0, 3)) + '</span></div>' +
      (list.length ? list.map((b) => '<button type="button" class="bl-week-item bl-cal-' + (SLUG[b._eff] || 'gray') + '" data-open="' + b.id + '"><b>' + esc(b.name) + '</b><br><span>' + money(b._amount) + ' · ' + esc(b._branch) + '</span></button>').join('') : '<span class="muted bl-week-empty">Nothing due</span>') + '</div>';
  }).join('') + '</div>';
}
function agendaHtml(ctx, bills, from, to) {
  const list = bills.filter((b) => b.due_date >= from && b.due_date <= to).sort((a, b) => a.due_date.localeCompare(b.due_date) || b._remaining - a._remaining);
  if (!list.length) return '<p class="muted">No bills fall due in this period.</p>';
  const days = [...new Set(list.map((b) => b.due_date))];
  return days.map((d) => {
    const rows = list.filter((b) => b.due_date === d);
    return '<div class="bl-agenda-day"><h4>' + esc(dayLabel(d)) + (d === ctx.today ? ' <span class="bl-tag bl-tag-blue badge">Today</span>' : '') + ' <span class="muted">· ' + plural(rows.length, 'bill') + ' · ' + money(sum(rows, (b) => b._amount)) + '</span></h4>' +
      rows.map((b) => '<div class="bl-agenda-row" data-open="' + b.id + '" role="button" tabindex="0"><span class="bl-dot bl-cal-' + (SLUG[b._eff] || 'gray') + '"></span><div><b>' + esc(b.name) + '</b><div class="muted">' + esc(b._cat) + ' · ' + esc(b._branch) + '</div></div><div class="bl-agenda-right">' + statusBadge(b._eff) + '<b>' + money(b._amount) + '</b></div></div>').join('') + '</div>';
  }).join('');
}

function openDay(ctx, date, bills) {
  const list = bills.filter((b) => b.due_date === date).sort((a, b) => b._remaining - a._remaining);
  openDrawer('side', { title: dayLabel(date), sub: plural(list.length, 'bill') + ' · ' + money(sum(list, (b) => b._amount)),
    body: list.length ? list.map((b) => '<div class="bl-agenda-row" data-open="' + b.id + '" role="button" tabindex="0"><span class="bl-dot bl-cal-' + (SLUG[b._eff] || 'gray') + '"></span><div><b>' + esc(b.name) + '</b><div class="muted">' + esc(b._cat) + ' · ' + esc(b._branch) + '</div></div><div class="bl-agenda-right">' + statusBadge(b._eff) + '<b>' + money(b._amount) + '</b></div></div>').join('') : '<p class="muted">No bills fall due on this day.</p>', footer: '' });
  $('bl-side-body').querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', () => { closeDrawer('side'); ctx.openDetail(Number(el.dataset.open)); }));
}

export function renderCalendar(ctx, panel) {
  const c = ctx.ui.cal, bills = calBills(ctx), byDay = groupByDue(bills);
  const monthTitle = monthName(c.m) + ' ' + c.y;
  const title = c.view === 'week' ? fmtDate(weekDates(c.anchor)[0]) + ' – ' + fmtDate(weekDates(c.anchor)[6]) : monthTitle;
  const from = ymd(c.y, c.m, 1), to = addDays(addMonths(c.y, c.m, 1).y + '-' + String(addMonths(c.y, c.m, 1).m).padStart(2, '0') + '-01', -1);
  const monthBills = bills.filter((b) => b.due_date >= from && b.due_date <= to);
  panel.innerHTML = '<div id="bl-cal">' + branchCategoryBar(ctx,
    '<div class="field"><label>Payment</label><select id="bl-cal-paid"><option value="all">Paid and unpaid</option><option value="unpaid"' + (c.paid === 'unpaid' ? ' selected' : '') + '>Unpaid only</option><option value="paid"' + (c.paid === 'paid' ? ' selected' : '') + '>Paid only</option></select></div>' +
    '<div class="bl-checks"><label class="bl-chk"><input type="checkbox" id="bl-cal-over"' + (c.overdueOnly ? ' checked' : '') + '> Overdue only</label><label class="bl-chk"><input type="checkbox" id="bl-cal-rec"' + (c.recurringOnly ? ' checked' : '') + '> Recurring only</label></div>') +
    '<div class="bl-cal-bar"><div class="bl-cal-nav"><button type="button" class="btn small secondary" data-nav="-1" aria-label="Previous">‹</button><button type="button" class="btn small secondary" data-nav="0">Today</button><button type="button" class="btn small secondary" data-nav="1" aria-label="Next">›</button><h3 class="bl-cal-title">' + esc(title) + '</h3></div>' +
    '<div class="lv-seg" role="group" aria-label="Calendar view">' + [['month', 'Month'], ['week', 'Week'], ['agenda', 'Agenda']].map((v) => '<button type="button" class="lv-seg-btn' + (c.view === v[0] ? ' lv-seg-on' : '') + '" data-view="' + v[0] + '">' + v[1] + '</button>').join('') + '</div></div>' +
    '<div class="bl-cal-legend">' + [['paid', 'Paid'], ['unpaid', 'Unpaid'], ['soon', 'Due soon'], ['today', 'Due today'], ['overdue', 'Overdue'], ['partial', 'Partly paid']].map((x) => '<span><span class="bl-dot bl-cal-' + x[0] + '"></span> ' + x[1] + '</span>').join('') + '</div>' +
    (c.view === 'month' ? monthGridHtml(ctx, byDay, c.y, c.m) + '<div class="bl-cal-agenda card"><h3 class="bl-h">' + esc(monthTitle) + '</h3>' + agendaHtml(ctx, bills, from, to) + '</div>'
      : c.view === 'week' ? '<div class="card bl-panel">' + weekHtml(ctx, byDay) + '</div>'
      : '<div class="card bl-panel"><h3 class="bl-h">' + esc(monthTitle) + ' · ' + plural(monthBills.length, 'bill') + ' · ' + money(sum(monthBills, (b) => b._amount)) + '</h3>' + agendaHtml(ctx, bills, from, to) + '</div>') + '</div>';

  const root = $('bl-cal');
  bindBranchCategory(ctx, root);
  root.querySelectorAll('[data-view]').forEach((el) => el.addEventListener('click', () => { c.view = el.dataset.view; ctx.rerender(); }));
  $('bl-cal-paid').addEventListener('change', (e) => { c.paid = e.target.value; ctx.rerender(); });
  $('bl-cal-over').addEventListener('change', (e) => { c.overdueOnly = e.target.checked; ctx.rerender(); });
  $('bl-cal-rec').addEventListener('change', (e) => { c.recurringOnly = e.target.checked; ctx.rerender(); });
  root.querySelectorAll('[data-nav]').forEach((el) => el.addEventListener('click', () => {
    const n = Number(el.dataset.nav);
    if (n === 0) Object.assign(c, { y: yearOf(ctx.today), m: monthOf(ctx.today), anchor: ctx.today });
    else if (c.view === 'week') { c.anchor = addDays(c.anchor, 7 * n); c.y = yearOf(c.anchor); c.m = monthOf(c.anchor); }
    else { const t = addMonths(c.y, c.m, n); c.y = t.y; c.m = t.m; c.anchor = ymd(t.y, t.m, 1); }
    ctx.rerender();
  }));
  const open = (e) => {
    const b = e.target.closest('[data-open]');
    if (b) { e.stopPropagation(); ctx.openDetail(Number(b.dataset.open)); return true; }
    return false;
  };
  root.addEventListener('click', (e) => {
    if (open(e)) return;
    const d = e.target.closest('[data-day]');
    if (d) openDay(ctx, d.dataset.day, bills);
  });
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const t = e.target;
    if (t.matches('[data-open]') && t.tagName !== 'BUTTON') { e.preventDefault(); ctx.openDetail(Number(t.dataset.open)); }
    else if (t.matches('.bl-cal-cell')) { e.preventDefault(); openDay(ctx, t.dataset.day, bills); }
  });
}

// ================================================================ cash planning
export const newPlanState = () => ({ weeks: 8, projected: true });
const PR_SEG = PRIORITIES.map((p) => ({ key: p, label: p, color: COLORS[p] }));

export function renderPlanning(ctx, panel) {
  const p = ctx.ui.plan, f = ctx.filters;
  const real = ctx.bills.filter((b) => !b.archived_at && matchesScope(b, f));
  const until = addDays(ctx.today, p.weeks * 7 - 1);
  const tpls = ctx.data.templates.filter((t) => matchesScope({ branch_id: t.branch_id, category_id: t.category_id }, f));
  const projected = p.projected ? projectTemplates(tpls, ctx.bills, ctx, until) : [];
  const behind = tpls.filter((t) => t.active && !t.archived_at && t.next_due_date && t.next_due_date < ctx.today);
  const wk = weekBuckets([...real, ...projected], ctx.today, p.weeks);
  const must = (b) => b._prio === 'Critical' || b._prio === 'High';
  const first4 = wk.buckets.slice(0, 4);
  const mustPay = sum(wk.overdue.bills, (b) => b._remaining) + sum(wk.buckets.flatMap((k) => k.bills).filter(must), (b) => b._remaining);
  const thisWeek = wk.buckets[0] ? wk.buckets[0].total : 0;
  const horizon = sum(wk.buckets, (k) => k.total);
  const projTotal = sum(projected.filter((b) => b._days <= p.weeks * 7 - 1), (b) => b._remaining);

  const cols = [{ label: 'Overdue', total: wk.overdue.total, parts: wk.overdue.byPriority }, ...wk.buckets.map((k) => ({ label: 'Wk ' + k.index, total: k.total, parts: k.byPriority }))];
  let running = wk.overdue.total;
  const weekBlocks = [
    wk.overdue.count ? { title: 'Overdue — already due', range: 'pay as soon as possible', total: wk.overdue.total, count: wk.overdue.count, bills: wk.overdue.bills, cum: running } : null,
    ...wk.buckets.map((k) => { running += k.total; return { title: 'Week ' + k.index, range: fmtDate(k.from) + ' – ' + fmtDate(k.to), total: k.total, count: k.count, bills: k.bills, cum: running }; }),
  ].filter(Boolean);
  const day14 = Array.from({ length: 14 }, (_, i) => addDays(ctx.today, i)).map((d) => {
    const list = [...real, ...projected].filter((b) => b._open && b._remaining > 0 && b.due_date === d);
    return { d, count: list.length, total: sum(list, (b) => b._remaining), crit: list.some(must) };
  });
  const item = (b) => '<div class="bl-plan-item' + (b._projected ? ' bl-plan-proj' : '') + '"' + (b._projected ? '' : ' data-open="' + b.id + '" role="button" tabindex="0"') + '><div><b>' + esc(b.name) + '</b>' +
    (b._projected ? ' ' + tagBadge('Projected', 'bl-tag-gray') : '') + '<div class="muted">' + esc(b.due_date ? fmtDate(b.due_date) : 'No due date') + ' · ' + esc(b._cat) + ' · ' + esc(b._branch) + '</div></div><div class="bl-plan-right">' + prioBadge(b._prio) + '<b>' + money(b._remaining) + '</b></div></div>';

  panel.innerHTML = '<div id="bl-plan">' + branchCategoryBar(ctx,
    '<div class="field"><label>Look ahead</label><select id="bl-plan-weeks">' + [4, 8, 13].map((n) => '<option value="' + n + '"' + (p.weeks === n ? ' selected' : '') + '>' + n + ' weeks</option>').join('') + '</select></div>' +
    '<div class="bl-checks"><label class="bl-chk"><input type="checkbox" id="bl-plan-proj"' + (p.projected ? ' checked' : '') + '> Include recurring bills not created yet (projected)</label></div>' +
    '<div class="field"><label>&nbsp;</label><details class="bl-menu bl-exportmenu"><summary class="btn small secondary">Export plan ▾</summary><div class="bl-menu-pop"><button type="button" data-exp="csv">CSV</button><button type="button" data-exp="xlsx">Excel (.xlsx)</button><button type="button" data-exp="pdf">PDF</button></div></details></div>') +
    '<div class="bl-kpis">' +
      kpiCard({ label: 'Overdue now', value: money(wk.overdue.total), sub: plural(wk.overdue.count, 'bill'), tone: wk.overdue.count ? 'red' : 'green' }) +
      kpiCard({ label: 'Next 7 days', value: money(thisWeek), sub: 'today to ' + (wk.buckets[0] ? fmtDate(wk.buckets[0].to) : ''), tone: 'orange' }) +
      kpiCard({ label: 'Next 4 weeks', value: money(sum(first4, (k) => k.total)), sub: plural(sum(first4, (k) => k.count), 'bill'), tone: 'yellow' }) +
      kpiCard({ label: 'Whole look-ahead', value: money(horizon + wk.overdue.total), sub: 'overdue + ' + p.weeks + ' weeks' + (projTotal ? ' · ' + money(projTotal) + ' projected' : ''), tone: 'blue' }) +
      kpiCard({ label: 'Must pay first', value: money(mustPay), sub: 'overdue + Critical / High', tone: 'red', hint: 'Overdue bills plus anything marked Critical or High' }) + '</div>' +
    (behind.length ? '<div class="msg lv-warn bl-nudge"><span><b>' + plural(behind.length, 'recurring bill') + '</b> ' + (behind.length === 1 ? 'is' : 'are') + ' behind schedule (about ' + money(sum(behind, (t) => Number(t.default_amount || 0))) + ') — the bill was never created, so it is not counted below.</span> <button type="button" class="btn small" data-go-recurring="1">Review in Recurring</button></div>' : '') +
    '<div class="card bl-panel"><h3 class="bl-h">Cash needed by week <span class="muted">· split by priority</span></h3>' + stackedColumns(cols, PR_SEG, { format: moneyShort }) +
      (wk.later.count || wk.undated.count ? '<p class="muted">Not in the chart: ' + (wk.later.count ? plural(wk.later.count, 'bill') + ' (' + money(wk.later.total) + ') due after week ' + p.weeks : '') + (wk.later.count && wk.undated.count ? ' · ' : '') + (wk.undated.count ? plural(wk.undated.count, 'bill') + ' (' + money(wk.undated.total) + ') with no due date' : '') + '.</p>' : '') + '</div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Day by day · next 14 days</h3><div class="bl-days14">' + day14.map((x) =>
      '<div class="bl-day14' + (x.total ? ' bl-day14-on' : '') + (x.crit ? ' bl-day14-crit' : '') + (x.d === ctx.today ? ' bl-day14-today' : '') + '"><span class="muted">' + DOW[weekday(x.d)] + '</span><b>' + Number(x.d.slice(8)) + '</b><span>' + (x.total ? moneyShort(x.total) : '—') + '</span><span class="muted">' + (x.count ? plural(x.count, 'bill') : '') + '</span></div>').join('') + '</div></div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Week by week</h3>' + weekBlocks.map((k, i) =>
      '<details class="exp bl-weekblock"' + (i < 2 ? ' open' : '') + '><summary><span class="exp-arrow" aria-hidden="true">▸</span><span class="bl-wk-title"><b>' + esc(k.title) + '</b> <span class="muted">' + esc(k.range) + '</span></span><span class="bl-wk-total"><b>' + money(k.total) + '</b> <span class="muted">· ' + plural(k.count, 'bill') + ' · running total ' + money(k.cum) + '</span></span></summary>' +
        '<div class="exp-body">' + (k.bills.length ? k.bills.map(item).join('') : '<p class="muted">Nothing due this week.</p>') + '</div></details>').join('') + '</div></div>';

  const root = $('bl-plan');
  bindBranchCategory(ctx, root);
  const goRec = root.querySelector('[data-go-recurring]');
  if (goRec) goRec.addEventListener('click', () => ctx.showTab('recurring'));
  $('bl-plan-weeks').addEventListener('change', (e) => { p.weeks = Number(e.target.value); ctx.rerender(); });
  $('bl-plan-proj').addEventListener('change', (e) => { p.projected = e.target.checked; ctx.rerender(); });
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); if (b) ctx.openDetail(Number(b.dataset.open)); });
  root.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-open]')) { e.preventDefault(); ctx.openDetail(Number(e.target.dataset.open)); } });
  root.querySelectorAll('[data-exp]').forEach((el) => el.addEventListener('click', async () => {
    el.closest('details').open = false;
    const items = [];
    wk.overdue.bills.forEach((b) => items.push({ week: 'Overdue', b }));
    wk.buckets.forEach((k) => k.bills.forEach((b) => items.push({ week: 'Week ' + k.index, b })));
    try { await exportPlan(ctx, items, p.weeks, el.dataset.exp); } catch (err) { ctx.toast(err, true); }
  }));
}
