// Refund Management -- the Dashboard tab: KPI cards, "Refund attention needed" (old pending, approved but unpaid, partial
// balances, high amounts, missing proof, waiting too long), what the company still owes, aging, and charts.
// Two groups of numbers on purpose: "requests in this period" follows the Month / Year filter, "right now" never does
// (a refund that has been waiting 20 days is waiting whatever month it was requested).
import { esc, money, moneyShort, fmtDate, plural, kpiCard, donut, hbars, columnPairs, statusBadge, priorityBadge, agingBadge, flagBadges, proofBadge, REFUND_COLORS, statusColor, COLORS } from './refundsUi.js?v=20261007h';
import { refundKpis, buildAlerts, liability, agingBuckets, monthlySeries, groupTotals, statusCounts, agingKey, STATUSES, daysBetween } from './refundsLogic.js?v=20261007h';
import { filterBarHtml, bindFilterBar, scopedLive, scopedPeriod, periodLabel, scopeLabel } from './refundsFilters.js?v=20261007h';
import { alertRow, bindActions } from './refundsActions.js?v=20261007h';

const AGE_COLORS = ['#9aa4ad', '#e0a030', '#e07b30', '#d9602a', '#a31515'];
// seven cards share one row on a laptop: a six-figure amount gets a slightly smaller number so it never wraps
const big = (n) => (n >= 100000 ? '<span class="rf-kpi-long">' + money(n) + '</span>' : money(n));

function badgesFor(r) {
  return statusBadge(r.status) + (r.priority !== 'Normal' ? ' ' + priorityBadge(r.priority) : '') + (r._open ? ' ' + agingBadge(agingKey(r._age), r._age) : '') + flagBadges(r);
}
function targetNote(ctx, r) {
  if (!r.target_payment_date) return '';
  const d = daysBetween(ctx.today, r.target_payment_date);
  return 'Target date ' + esc(fmtDate(r.target_payment_date)) + (d < 0 ? ' — <b class="lv-neg">' + plural(-d, 'day') + ' late</b>' : d === 0 ? ' — today' : ' — in ' + plural(d, 'day'));
}
const AMOUNTS = {
  pending: (ctx, r) => [money(r._req), 'requested · waiting ' + plural(r._age, 'day')],
  waiting: (ctx, r) => [money(r._remaining), 'to refund · approved ' + (r.approved_date ? esc(fmtDate(r.approved_date)) : 'earlier')],
  partial: (ctx, r) => [money(r._remaining), 'left of ' + money(r._appr) + ' · paid ' + money(r._effPaid)],
  high: (ctx, r) => [money(r._exposure), r._awaiting ? 'requested' : 'still to refund'],
  proof: (ctx, r) => [money(r._effPaid), 'refunded · ' + r._livePays.filter((p) => !r._files.some((f) => f.payment_id === p.id)).length + ' of ' + r._livePays.length + ' payments have no proof'],
  long: (ctx, r) => [money(r._exposure), 'open for ' + plural(r._age, 'day')],
};
const NOTES = { waiting: targetNote, partial: targetNote, long: () => '' };

function alertSection(ctx, { id, title, tone, items, empty }) {
  const total = items.reduce((s, r) => s + (r._exposure || r._effPaid || 0), 0);
  const head = '<div class="bl-alert-head bl-tone-' + tone + '"><h4>' + esc(title) + '</h4><span>' + (items.length ? items.length + (id === 'proof' ? '' : ' · ' + money(total)) : '0') + '</span></div>';
  if (!items.length) return '<div class="bl-alert" id="rf-al-' + id + '">' + head + '<p class="muted bl-alert-empty">' + esc(empty) + '</p></div>';
  const row = (r) => alertRow(ctx, r, { badges: badgesFor(r) + (id === 'proof' ? ' ' + proofBadge(r._proof) : ''), amount: AMOUNTS[id === 'old' ? 'pending' : id](ctx, r), note: (NOTES[id] || (() => ''))(ctx, r) });
  const shown = items.slice(0, 5), rest = items.slice(5);
  return '<div class="bl-alert" id="rf-al-' + id + '">' + head + shown.map(row).join('') +
    (rest.length ? '<details class="bl-rest"><summary>Show ' + rest.length + ' more</summary>' + rest.map(row).join('') + '</details>' : '') + '</div>';
}

export function liabilityHtml(ctx, li) {
  const row = (label, o, tone) => '<li><span>' + esc(label) + '</span><span><b class="' + (tone || '') + '">' + money(o.amount) + '</b> <span class="muted">· ' + o.count + '</span></span></li>';
  return '<div class="card bl-panel"><h3 class="bl-h">What we still owe customers</h3>' +
    (li.count ? '<div class="bl-big rf-owe">' + money(li.total) + '</div><div class="muted">across ' + plural(li.count, 'approved refund') + ' not yet fully paid</div>' +
      '<ul class="rf-liab"><li><span>Approved, nothing paid yet</span><span><b>' + money(li.unpaid.amount) + '</b> <span class="muted">· ' + li.unpaid.count + '</span></span></li>' +
      '<li><span>Partly paid, balance left</span><span><b>' + money(li.partial.amount) + '</b> <span class="muted">· ' + li.partial.count + '</span></span></li></ul>' +
      '<h4 class="rf-sub">Cash needed by target date</h4><ul class="rf-liab">' + row('Past the target date', li.late, li.late.count ? 'lv-neg' : '') + row('Within 7 days', li.week) + row('In 8–30 days', li.month) + row('Later', li.later) + row('No target date set', li.none) + '</ul>'
      : '<p class="lv-pos">Nothing is owed — every approved refund is paid in full. ✓</p>') + '</div>';
}

function agingHtml(rows) {
  const b = agingBuckets(rows);
  return '<div class="card bl-panel"><h3 class="bl-h">How long open requests have waited</h3>' +
    (b.some((x) => x.count) ? hbars(b.map((x, i) => ({ label: x.label, value: x.count, sub: x.count ? '· ' + moneyShort(x.amount) : '', color: AGE_COLORS[i] })), { format: String }) + '<p class="muted">Open = waiting for a decision, or approved and not fully paid.</p>' : '<p class="muted">No open requests.</p>') + '</div>';
}

function recentPaymentsHtml(ctx, rows) {
  const list = rows.flatMap((r) => r._livePays.map((p) => ({ r, p }))).sort((a, b) => String(b.p.payment_date).localeCompare(String(a.p.payment_date)) || b.p.id - a.p.id).slice(0, 8);
  return '<div class="card bl-panel"><h3 class="bl-h">Recent refund payments</h3>' + (list.length ? '<ul class="bl-recent">' + list.map(({ r, p }) =>
    '<li><div><button type="button" class="bl-link" data-act="view" data-id="' + r.id + '">' + esc(r.refund_request_number) + ' · ' + esc(r.customer_name) + '</button><div class="muted">' + esc(fmtDate(p.payment_date)) + ' · ' + esc(p.payment_method) + (p.processed_by_name ? ' · ' + esc(p.processed_by_name) : '') + '</div></div><b class="lv-pos">' + money(p.amount) + '</b></li>').join('') + '</ul>' : '<p class="muted">No refund payments recorded yet.</p>') + '</div>';
}

function chartsHtml(ctx, live, period) {
  const counts = statusCounts(period);
  const statusItems = STATUSES.filter((s) => counts[s]).map((s) => ({ label: s, value: counts[s], color: statusColor(s) }));
  const byReason = groupTotals(period, (r) => r.reason_category || 'No reason set', (r) => r.reason_category || 'No reason set').slice(0, 7).map((g) => ({ label: g.label, value: g.requested, sub: '(' + g.count + ')' }));
  const byBranch = groupTotals(period, (r) => r.branch_id || 0, (r) => r._branch).slice(0, 8).map((g) => ({ label: g.label, value: g.requested, sub: '(' + g.count + ')' }));
  const series = monthlySeries(live, ctx, 6).map((m) => ({ label: m.label, a: m.requested, b: m.refunded }));
  return '<div class="bl-charts">' +
    '<div class="card bl-panel"><h3 class="bl-h">Requests by status <span class="muted">· ' + esc(periodLabel(ctx)) + '</span></h3>' + donut(statusItems, { center: period.length, centerSub: 'requests' }) + '</div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Requested vs refunded <span class="muted">· last 6 months</span></h3>' + columnPairs(series, { format: moneyShort, aLabel: 'Requested', bLabel: 'Refunded (paid out)' }) + '</div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Refunds by reason <span class="muted">· amount requested</span></h3>' + hbars(byReason, { format: moneyShort, color: REFUND_COLORS.requested }) + '</div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Refunds by branch <span class="muted">· amount requested</span></h3>' + hbars(byBranch, { format: moneyShort, color: COLORS.auto }) + '</div></div>';
}

export function renderDashboard(ctx, panel) {
  const live = scopedLive(ctx), period = scopedPeriod(ctx);
  const kp = refundKpis(period, ctx), lk = refundKpis(live, ctx), al = buildAlerts(live, ctx), li = liability(live, ctx);
  const dataCheck = ctx.access.pay ? live.filter((r) => r._over > 0).length : 0;
  const tone0 = (n, t) => n === 0 ? 'green' : t;
  const pctDone = kp.total ? Math.round((kp.completed / kp.total) * 100) : 0;
  panel.innerHTML = '<div id="rf-dash">' + filterBarHtml(ctx) +
    (dataCheck ? '<div class="msg lv-warn bl-nudge"><span><b>' + dataCheck + '</b> older refund' + (dataCheck === 1 ? ' has' : 's have') + ' more payments recorded than the approved amount. They are kept exactly as entered; totals count only the approved amount.</span> <button type="button" class="btn small" data-go="view:data">Show them</button></div>' : '') +
    '<div class="bl-kpi-group"><h3 class="bl-h">Requests · ' + esc(periodLabel(ctx)) + ' <span class="muted">' + esc(scopeLabel(ctx)) + '</span></h3><div class="bl-kpis">' +
      kpiCard({ label: 'Total requests', value: kp.total, sub: kp.monthCount + ' this month', tone: 'blue', go: 'view:all', hint: 'Open these requests' }) +
      kpiCard({ label: 'Amount requested', value: big(kp.requested), sub: 'cancelled not counted', tone: 'blue', go: 'view:all' }) +
      kpiCard({ label: 'Amount approved', value: big(kp.approved), sub: plural(ctx.refunds.filter((r) => period.includes(r) && r._approved).length, 'approved request'), tone: 'blue', go: 'view:approved' }) +
      kpiCard({ label: 'Total refunded', value: big(kp.refunded), sub: 'paid out to customers', tone: 'green', go: 'view:approved' }) +
      kpiCard({ label: 'Completed', value: kp.completed, sub: pctDone + '% of requests', tone: 'green', go: 'view:completed' }) +
      kpiCard({ label: 'Rejected', value: kp.rejected, sub: 'declined requests', tone: kp.rejected ? 'red' : 'gray', go: 'view:rejected' }) +
      kpiCard({ label: 'Cancelled', value: kp.cancelled, sub: 'withdrawn requests', tone: 'gray', go: 'view:cancelled' }) +
    '</div></div>' +
    '<div class="bl-kpi-group"><h3 class="bl-h">Right now <span class="muted">as of today, any month · ' + esc(scopeLabel(ctx)) + '</span></h3><div class="bl-kpis">' +
      kpiCard({ label: 'Pending approval', value: lk.awaiting, sub: money(lk.awaitingAmount) + ' requested', tone: tone0(lk.awaiting, 'yellow'), go: 'view:pending' }) +
      kpiCard({ label: 'Waiting for payment', value: lk.waiting, sub: 'approved, nothing paid yet', tone: tone0(lk.waiting, 'blue'), go: 'view:waiting' }) +
      kpiCard({ label: 'Partially refunded', value: lk.partial, sub: 'balance still owed', tone: tone0(lk.partial, 'orange'), go: 'view:partial' }) +
      kpiCard({ label: 'Remaining balance', value: big(li.total), sub: plural(li.count, 'refund') + ' still owed', tone: tone0(li.count, 'orange'), go: 'view:owed' }) +
      kpiCard({ label: 'Pending over 7 days', value: lk.old7, sub: 'open longer than a week', tone: tone0(lk.old7, 'red'), go: 'view:age7' }) +
      kpiCard({ label: 'Missing proof', value: al.proof.length, sub: 'refunds without proof', tone: tone0(al.proof.length, 'orange'), go: 'view:proof' }) +
    '</div></div>' +
    '<div class="bl-dash-grid"><div class="bl-dash-main"><div class="card bl-panel"><h3 class="bl-h">Refund attention needed</h3>' +
      alertSection(ctx, { id: 'old', title: 'A · Pending approval for 7+ days', tone: 'red', items: al.oldPending, empty: 'No request has been waiting for a decision for a week or more.' }) +
      alertSection(ctx, { id: 'waiting', title: 'B · Approved but not yet paid', tone: 'orange', items: al.waiting, empty: 'Every approved refund has at least one payment.' }) +
      alertSection(ctx, { id: 'partial', title: 'C · Partially refunded — balance remaining', tone: 'orange', items: al.partial, empty: 'No refund is waiting on its last instalment.' }) +
      alertSection(ctx, { id: 'high', title: 'D · High-amount refunds (' + money(ctx.highAmount) + ' and up, still open)', tone: 'blue', items: al.high, empty: 'No large refund is open.' }) +
      alertSection(ctx, { id: 'proof', title: 'E · Refunded without proof of payment', tone: 'yellow', items: al.proof, empty: 'Every refund payment has proof attached.' }) +
      alertSection(ctx, { id: 'long', title: 'F · Open for 30+ days', tone: 'red', items: al.long, empty: 'Nothing has been open for a month.' }) +
    '</div></div><div class="bl-dash-side">' + liabilityHtml(ctx, li) + agingHtml(live) + recentPaymentsHtml(ctx, live) + '</div></div>' +
    chartsHtml(ctx, live, period) + '</div>';

  const root = panel.querySelector('#rf-dash');
  bindFilterBar(ctx, root, () => ctx.rerender());
  root.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', () => ctx.applyView(el.dataset.go.replace('view:', ''))));
  bindActions(ctx, root);
}
