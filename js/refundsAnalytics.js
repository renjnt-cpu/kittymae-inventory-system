// Refund Management -- the Analytics tab: how fast refunds are handled, the month-against-month report, and the
// breakdowns by reason, branch, method and age. Everything is computed in the browser from the requests already loaded.
import { esc, money, moneyShort, plural, kpiCard, hbars, columnPairs, changeText, REFUND_COLORS, COLORS } from './refundsUi.js?v=20261004f';
import { refundPerformance, monthReport, monthlySeries, groupTotals, agingBuckets, MONTHS, monthName, addMonths, yearOf, monthOf } from './refundsLogic.js?v=20261004f';
import { filterBarHtml, bindFilterBar, scopedLive, scopedPeriod, periodLabel, scopeLabel } from './refundsFilters.js?v=20261004f';

const $ = (id) => document.getElementById(id);
const AGE_COLORS = ['#9aa4ad', '#e0a030', '#e07b30', '#d9602a', '#a31515'];
export const newAnalyticsState = (today) => ({ y: yearOf(today), m: monthOf(today) });

const days = (n) => n === null ? '<span class="muted">not enough data</span>' : n + ' days';

function groupTable(g, firstLabel, ctx, opts = {}) {
  if (!g.length) return '<p class="muted">Nothing to show for these filters.</p>';
  const total = g.reduce((s, e) => s + e.requested, 0);
  return '<div class="table-scroll table-2col"><table class="bl-table rf-mini"><thead><tr><th>' + esc(firstLabel) + '</th><th>Requests</th><th>Requested</th><th>% of total</th><th>Approved</th><th>Refunded</th><th>Still owed</th><th>Pending</th><th>Completed</th><th>Rejected</th></tr></thead><tbody>' +
    g.map((e) => '<tr><td data-label="' + esc(firstLabel) + '"><b>' + esc(e.label) + '</b></td><td data-label="Requests">' + e.count + '</td><td data-label="Requested">' + money(e.requested) + '</td><td data-label="% of total">' + (total ? Math.round((e.requested / total) * 100) : 0) + '%</td>' +
      '<td data-label="Approved">' + money(e.approved) + '</td><td data-label="Refunded">' + money(e.refunded) + '</td><td data-label="Still owed">' + money(e.remaining) + '</td><td data-label="Pending">' + e.pending + '</td><td data-label="Completed">' + e.completed + '</td><td data-label="Rejected">' + e.rejected + '</td></tr>').join('') + '</tbody></table></div>';
}

function monthPanel(ctx, live, A) {
  const prev = addMonths(A.y, A.m, -1);
  const cur = monthReport(live, ctx, A.y, A.m), pre = monthReport(live, ctx, prev.y, prev.m);
  const ys = [...new Set([yearOf(ctx.today), ...ctx.refunds.map((r) => yearOf(r.requested_date))])].sort((a, b) => b - a);
  const row = (label, a, b, fmt, ch) => '<tr><td data-label="">' + esc(label) + '</td><td data-label="' + esc(monthName(A.m)) + '"><b>' + fmt(a) + '</b></td><td data-label="' + esc(monthName(prev.m)) + '">' + (b === null ? '—' : fmt(b)) + '</td><td data-label="Change">' + ch + '</td></tr>';
  const n = (v) => String(v), m = (v) => money(v), d = (v) => v === null ? '—' : v + ' days', p = (v) => v + '%';
  const series = monthlySeries(live, ctx, 12).map((x) => ({ label: x.label, a: x.requested, b: x.refunded }));
  return '<div class="card bl-panel"><div class="bl-sethead"><h3 class="bl-h">Monthly report</h3><div class="bl-inline"><select id="rf-an-m" aria-label="Month">' + MONTHS.map((x, i) => '<option value="' + (i + 1) + '"' + (A.m === i + 1 ? ' selected' : '') + '>' + x + '</option>').join('') + '</select>' +
    '<select id="rf-an-y" aria-label="Year">' + ys.map((y) => '<option' + (A.y === y ? ' selected' : '') + '>' + y + '</option>').join('') + '</select></div></div>' +
    '<p class="muted">Requests made in ' + esc(monthName(A.m) + ' ' + A.y) + ' compared with ' + esc(monthName(prev.m) + ' ' + prev.y) + ', for ' + esc(scopeLabel(ctx)) + '. “Refunded” is what has been paid out so far on those requests.</p>' +
    '<div class="table-scroll table-2col"><table class="bl-table rf-mini"><thead><tr><th></th><th>' + esc(monthName(A.m)) + '</th><th>' + esc(monthName(prev.m)) + '</th><th>Change</th></tr></thead><tbody>' +
      row('Refund requests', cur.requests, pre.requests, n, changeText(cur.requests, pre.requests, { inverse: true })) +
      row('Amount requested', cur.requested, pre.requested, m, changeText(cur.requested, pre.requested, { inverse: true, money: true })) +
      row('Amount approved', cur.approved, pre.approved, m, changeText(cur.approved, pre.approved, { inverse: true, money: true })) +
      row('Amount refunded', cur.paid, pre.paid, m, changeText(cur.paid, pre.paid, { money: true })) +
      row('Remaining balance', cur.remaining, pre.remaining, m, changeText(cur.remaining, pre.remaining, { inverse: true, money: true })) +
      row('Rejected requests', cur.rejected, pre.rejected, n, changeText(cur.rejected, pre.rejected, { inverse: true })) +
      row('Completed refunds', cur.completed, pre.completed, n, changeText(cur.completed, pre.completed)) +
      row('Completion rate', cur.completionRate, pre.completionRate, p, changeText(cur.completionRate, pre.completionRate)) +
      row('Average days to complete', cur.avgProcessing, pre.avgProcessing, d, cur.avgProcessing === null || pre.avgProcessing === null ? '<span class="muted">—</span>' : changeText(cur.avgProcessing, pre.avgProcessing, { inverse: true })) +
    '</tbody></table></div>' +
    '<p class="muted">Oldest unresolved request right now: ' + (cur.oldestOpen ? '<button type="button" class="bl-link" data-act="view" data-id="' + cur.oldestOpen.id + '">' + esc(cur.oldestOpen.refund_request_number) + ' · ' + esc(cur.oldestOpen.customer_name) + '</button> — ' + plural(cur.oldestOpen._age, 'day') + ' old.' : 'none — everything is settled.') + '</p>' +
    '<h4 class="rf-sub">Last 12 months</h4>' + columnPairs(series, { format: moneyShort, aLabel: 'Requested', bLabel: 'Refunded (paid out)' }) + '</div>';
}

export function renderAnalytics(ctx, panel) {
  const live = scopedLive(ctx), period = scopedPeriod(ctx);
  const A = ctx.ui.analytics, perf = refundPerformance(live, ctx);
  const byReason = groupTotals(period, (r) => r.reason_category || 'No reason set', (r) => r.reason_category || 'No reason set');
  const byBranch = groupTotals(period, (r) => r.branch_id || 0, (r) => r._branch);
  const byMethod = groupTotals(period, (r) => r.refund_method || 'Not set', (r) => r.refund_method || 'Not set');
  const aging = agingBuckets(live);
  const topReason = byReason[0];
  panel.innerHTML = '<div id="rf-an">' + filterBarHtml(ctx) +
    '<div class="bl-kpi-group"><h3 class="bl-h">How refunds are being handled <span class="muted">· all requests, ' + esc(scopeLabel(ctx)) + '</span></h3><div class="bl-kpis">' +
      kpiCard({ label: 'Average approval time', value: perf.avgApproval === null ? '—' : perf.avgApproval + ' days', sub: perf.approvalSample ? 'from ' + plural(perf.approvalSample, 'request') : 'older requests have no approval date', tone: 'blue' }) +
      kpiCard({ label: 'Average time to complete', value: perf.avgCompletion === null ? '—' : perf.avgCompletion + ' days', sub: 'from ' + plural(perf.completionSample, 'completed refund'), tone: 'blue' }) +
      kpiCard({ label: 'Average age of pending', value: perf.pendingAge === null ? '—' : perf.pendingAge + ' days', sub: plural(perf.pendingCount, 'request') + ' waiting for a decision', tone: perf.pendingAge !== null && perf.pendingAge >= 7 ? 'orange' : 'green' }) +
      kpiCard({ label: 'Completed', value: perf.completedPct + '%', sub: 'of all requests', tone: 'green' }) +
      kpiCard({ label: 'Rejected', value: perf.rejectedPct + '%', sub: 'of all requests', tone: perf.rejectedPct ? 'red' : 'gray' }) +
      kpiCard({ label: 'Partially refunded', value: perf.partialPct + '%', sub: 'of all requests', tone: perf.partialPct ? 'orange' : 'gray' }) +
      kpiCard({ label: 'Still owed', value: money(perf.liability), sub: 'approved, not yet paid', tone: perf.liability ? 'orange' : 'green' }) +
    '</div></div>' +
    monthPanel(ctx, live, A) +
    '<div class="card bl-panel"><h3 class="bl-h">Refunds by reason <span class="muted">· ' + esc(periodLabel(ctx)) + '</span></h3>' +
      (topReason ? '<p>Most common: <b>' + esc(topReason.label) + '</b> — ' + plural(topReason.count, 'request') + ', ' + money(topReason.requested) + '.</p>' : '') +
      hbars(byReason.slice(0, 10).map((g) => ({ label: g.label, value: g.requested, sub: '(' + g.count + ')' })), { format: moneyShort, color: REFUND_COLORS.requested }) + groupTable(byReason, 'Reason', ctx) + '</div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Refunds by branch <span class="muted">· ' + esc(periodLabel(ctx)) + '</span></h3>' +
      hbars(byBranch.slice(0, 12).map((g) => ({ label: g.label, value: g.requested, sub: '(' + g.count + ')' })), { format: moneyShort, color: COLORS.auto }) + groupTable(byBranch, 'Branch', ctx) + '</div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Refunds by method <span class="muted">· ' + esc(periodLabel(ctx)) + '</span></h3>' +
      hbars(byMethod.slice(0, 12).map((g) => ({ label: g.label, value: g.requested, sub: '(' + g.count + ')' })), { format: moneyShort, color: '#7b5fb5' }) + groupTable(byMethod, 'Method', ctx) + '</div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Aging of open requests <span class="muted">· days since requested</span></h3>' +
      (aging.some((a) => a.count) ? hbars(aging.map((a, i) => ({ label: a.label, value: a.count, sub: a.count ? '· ' + moneyShort(a.amount) : '', color: AGE_COLORS[i] })), { format: String }) +
        '<div class="table-scroll table-2col"><table class="bl-table rf-mini"><thead><tr><th>Age</th><th>Open requests</th><th>Money at stake</th></tr></thead><tbody>' + aging.map((a) => '<tr><td data-label="Age"><b>' + esc(a.label) + '</b></td><td data-label="Open requests">' + a.count + '</td><td data-label="Money at stake">' + money(a.amount) + '</td></tr>').join('') + '</tbody></table></div>'
        : '<p class="muted">No open requests.</p>') + '<p class="muted">Money at stake = the requested amount while waiting for a decision, the unpaid balance once approved.</p></div></div>';
  const root = panel.querySelector('#rf-an');
  bindFilterBar(ctx, root, () => ctx.rerender());
  $('rf-an-m').addEventListener('change', (e) => { A.m = Number(e.target.value); ctx.rerender(); });
  $('rf-an-y').addEventListener('change', (e) => { A.y = Number(e.target.value); ctx.rerender(); });
  root.addEventListener('click', (e) => { const el = e.target.closest('[data-act="view"]'); if (el) ctx.openDetail(Number(el.dataset.id)); });
}
