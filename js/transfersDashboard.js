// Transfers -- the Dashboard tab: KPI cards, "Transfer attention needed" (waiting too long for approval, approved but not released, in
// transit too long, partly received, open discrepancies, not enough stock), what is on its way right now, what each branch has received,
// movement analytics and charts. Two groups of numbers on purpose: "transfers in this period" follows the Month / Year filter,
// "right now" never does (a transfer that has been in transit for 6 days is late whatever month it was requested).
import { esc, qty, fmtDate, kpiCard, donut, hbars, pairColumns, statusColor, routeText, plural, COLORS } from './transfersUi.js?v=20261007f';
import { transferKpis, receivedByBranch, movementStats, monthlySeries, attentionScore, STATUSES, sum } from './transfersLogic.js?v=20261007f';
import { filterBarHtml, bindFilterBar, scopedLive, scopedPeriod, periodLabel, scopeLabel } from './transfersFilters.js?v=20261007f';
import { alertRow, bindActions } from './transfersActions.js?v=20261007f';

const SECTIONS = [
  { id: 'approval', title: 'A · Waiting too long for approval', tone: 'orange', empty: 'No request is waiting for a decision for longer than the limit.' },
  { id: 'release', title: 'B · Approved but not yet released', tone: 'orange', empty: 'Every approved transfer has been released on time.' },
  { id: 'transit', title: 'C · In transit for too long', tone: 'red', empty: 'Nothing has been on the road for longer than the limit.' },
  { id: 'partial', title: 'D · Partly received — pieces still expected', tone: 'orange', empty: 'No transfer is waiting on its last pieces.' },
  { id: 'discrepancy', title: 'E · Open discrepancies', tone: 'red', empty: 'No missing or damaged item is waiting to be resolved.' },
  { id: 'stock', title: 'F · Not enough stock at the source', tone: 'red', empty: 'Every pending transfer can be filled from the source branch’s stock.' },
];

function alertSection(ctx, s, rows) {
  const items = rows.filter((t) => t._attention.some((a) => a.code === s.id)).sort((a, b) => attentionScore(b) - attentionScore(a));
  const head = '<div class="bl-alert-head bl-tone-' + s.tone + '"><h4>' + esc(s.title) + '</h4><span>' + items.length + '</span></div>';
  if (!items.length) return '<div class="bl-alert" id="tf-al-' + s.id + '">' + head + '<p class="muted bl-alert-empty">' + esc(s.empty) + '</p></div>';
  const row = (t) => alertRow(ctx, t);
  const shown = items.slice(0, 5), rest = items.slice(5);
  return '<div class="bl-alert" id="tf-al-' + s.id + '">' + head + shown.map(row).join('') + (rest.length ? '<details class="bl-rest"><summary>Show ' + rest.length + ' more</summary>' + rest.map(row).join('') + '</details>' : '') + '</div>';
}

function onItsWayHtml(ctx, live) {
  const list = live.filter((t) => ['In Transit', 'Partially Received'].includes(t.status)).sort((a, b) => b._stageDays - a._stageDays || a.transfer_number.localeCompare(b.transfer_number));
  const total = sum(list, (t) => t._outstanding);
  return '<div class="card bl-panel"><h3 class="bl-h">On its way right now</h3>' + (list.length ? '<div class="bl-big">' + qty(total) + ' <span class="muted">pcs</span></div><div class="muted">across ' + plural(list.length, 'transfer') + ' released and not yet fully received</div><ul class="bl-recent">' +
    list.slice(0, 8).map((t) => '<li><div><button type="button" class="bl-link" data-act="view" data-id="' + t.id + '">' + esc(t.transfer_number) + '</button> <span class="tf-routeline">' + routeText(ctx, t) + '</span><div class="muted">' + esc(plural(t._stageDays, 'day')) + ' since release' + (t.release_courier ? ' · ' + esc(t.release_courier) : '') + '</div></div><b>' + qty(t._outstanding) + ' pcs</b></li>').join('') + '</ul>' +
    (list.length > 8 ? '<p class="muted">Showing 8 of ' + list.length + ' — open “In Transit” in the Transfers tab for the rest.</p>' : '') : '<p class="lv-pos">Nothing is on the road — every released transfer has been received. ✓</p>') + '</div>';
}

function receivedByBranchHtml(ctx, period) {
  const rows = receivedByBranch(period, ctx.branches).filter((r) => r.count || r.openDiscs);
  return '<div class="card bl-panel"><h3 class="bl-h">Received by branch <span class="muted">· ' + esc(periodLabel(ctx)) + '</span></h3>' + (rows.length ? '<div class="table-scroll table-2col"><table class="lv-mini"><thead><tr><th>Branch</th><th>Transfers</th><th>SKUs</th><th>Pieces</th><th>Last receipt</th><th>Open issues</th></tr></thead><tbody>' +
    rows.map((r) => '<tr><td data-label="Branch"><b>' + esc(r.branch.name) + '</b></td><td data-label="Transfers">' + r.count + '</td><td data-label="SKUs">' + r.skus + '</td><td data-label="Pieces"><b>' + qty(r.units) + '</b></td><td data-label="Last receipt">' + (r.lastReceipt ? esc(fmtDate(r.lastReceipt)) : '—') + '</td><td data-label="Open issues">' + (r.openDiscs ? '<b class="lv-neg">' + r.openDiscs + '</b>' : '—') + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="muted">Nothing has been received in this period.</p>') + '</div>';
}

function analyticsHtml(ctx, live) {
  const m = movementStats(live, ctx), name = (id) => (ctx.branchById[id] || {}).name || '—';
  const row = (label, v, sub) => '<li><span>' + esc(label) + '</span><span><b>' + v + '</b>' + (sub ? ' <span class="muted">' + sub + '</span>' : '') + '</span></li>';
  return '<div class="card bl-panel"><h3 class="bl-h">Movement analytics</h3><ul class="rf-liab">' + row('Transfers requested this month', m.monthTransfers) + row('Pieces released this month', qty(m.monthUnits)) + row('Open transfers', m.open) +
    row('Most-moved SKU', m.topSkus[0] ? esc(m.topSkus[0].sku) : '—', m.topSkus[0] ? qty(m.topSkus[0].units) + ' pcs' : '') +
    row('Busiest source branch', m.topSource ? esc(name(m.topSource.id)) : '—', m.topSource ? qty(m.topSource.units) + ' pcs' : '') + row('Busiest destination', m.topDest ? esc(name(m.topDest.id)) : '—', m.topDest ? qty(m.topDest.units) + ' pcs' : '') +
    row('Receipts that came up short', m.finishedCount ? m.discRate + '%' : '—', m.finishedCount ? m.discCount + ' of ' + m.finishedCount + ' completed' : '') + '</ul></div>';
}

function chartsHtml(ctx, live, period) {
  const counts = {};
  period.forEach((t) => { counts[t.status] = (counts[t.status] || 0) + 1; });
  const statusItems = STATUSES.filter((s) => counts[s]).map((s) => ({ label: s, value: counts[s], color: statusColor(s) }));
  const series = monthlySeries(live, ctx, 6).map((m) => ({ label: m.label, a: m.a, b: m.b }));
  const m = movementStats(period, ctx);
  const routes = {};
  period.filter((t) => t._sentPcs > 0).forEach((t) => { const k = t._from + ' → ' + t._to; routes[k] = (routes[k] || 0) + t._sentPcs; });
  const topRoutes = Object.entries(routes).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([label, value]) => ({ label, value }));
  const topSkus = m.topSkus.map((s) => ({ label: s.sku, value: s.units, sub: '(' + s.transfers + ')' }));
  return '<div class="bl-charts">' +
    '<div class="card bl-panel"><h3 class="bl-h">Transfers by status <span class="muted">· ' + esc(periodLabel(ctx)) + '</span></h3>' + donut(statusItems, { center: period.length, centerSub: 'transfers' }) + '</div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Pieces released vs received <span class="muted">· last 6 months</span></h3>' + pairColumns(series, { aLabel: 'Released', bLabel: 'Received' }) + '</div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Busiest routes <span class="muted">· pieces released</span></h3>' + hbars(topRoutes, { format: (v) => qty(v), color: '#7b5fb5' }) + '</div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Most-moved SKUs <span class="muted">· pieces released</span></h3>' + hbars(topSkus, { format: (v) => qty(v), color: COLORS.auto }) + '</div></div>';
}

export function renderDashboard(ctx, panel) {
  const live = scopedLive(ctx), period = scopedPeriod(ctx);
  const kp = transferKpis(period, ctx), lk = transferKpis(live, ctx);
  const tone0 = (n, t) => (n === 0 ? 'green' : t);
  panel.innerHTML = '<div id="tf-dash">' + filterBarHtml(ctx) +
    '<div class="bl-kpi-group"><h3 class="bl-h">Transfers · ' + esc(periodLabel(ctx)) + ' <span class="muted">' + esc(scopeLabel(ctx)) + '</span></h3><div class="bl-kpis">' +
      kpiCard({ label: 'Total transfers', value: kp.total, sub: kp.drafts ? kp.drafts + ' draft' + (kp.drafts === 1 ? '' : 's') + ' included' : 'all statuses', tone: 'blue', go: 'view:all', hint: 'Open these transfers' }) +
      kpiCard({ label: 'Received', value: kp.received, sub: 'completed transfers', tone: 'green', go: 'view:received' }) +
      kpiCard({ label: 'Cancelled / Rejected', value: kp.closed, sub: 'never moved any stock', tone: kp.closed ? 'gray' : 'gray', go: 'view:closed' }) +
    '</div></div>' +
    '<div class="bl-kpi-group"><h3 class="bl-h">Right now <span class="muted">as of today, any month · ' + esc(scopeLabel(ctx)) + '</span></h3><div class="bl-kpis">' +
      kpiCard({ label: 'Requested', value: lk.requested, sub: 'waiting for a decision', tone: tone0(lk.requested, 'yellow'), go: 'view:requested' }) +
      kpiCard({ label: 'Awaiting approval', value: lk.waiting, sub: 'past the ' + ctx.settings.approval_days + '-day limit', tone: tone0(lk.waiting, 'orange'), go: 'view:waiting' }) +
      kpiCard({ label: 'Ready for release', value: lk.ready, sub: 'approved, not yet released', tone: tone0(lk.ready, 'blue'), go: 'view:ready' }) +
      kpiCard({ label: 'In transit', value: lk.transit, sub: lk.pcsInTransit ? qty(lk.pcsInTransit) + ' pcs on the way' : 'nothing on the road', tone: tone0(lk.transit, 'blue'), go: 'view:transit' }) +
      kpiCard({ label: 'Partially received', value: lk.partial, sub: lk.partial ? qty(lk.pcsPartial) + ' pcs still expected' : 'none waiting on pieces', tone: tone0(lk.partial, 'orange'), go: 'view:partial' }) +
      kpiCard({ label: 'Discrepancies', value: lk.discrepancies, sub: lk.discrepancies ? qty(lk.discQty) + ' pcs unresolved' : 'none open', tone: tone0(lk.discrepancies, 'red'), go: 'view:disc' }) +
    '</div></div>' +
    '<div class="bl-dash-grid"><div class="bl-dash-main"><div class="card bl-panel"><h3 class="bl-h">Transfer attention needed</h3>' + SECTIONS.map((s) => alertSection(ctx, s, live)).join('') + '</div></div>' +
    '<div class="bl-dash-side">' + onItsWayHtml(ctx, live) + receivedByBranchHtml(ctx, period) + analyticsHtml(ctx, live) + '</div></div>' + chartsHtml(ctx, live, period) + '</div>';

  const root = panel.querySelector('#tf-dash');
  bindFilterBar(ctx, root, () => ctx.rerender());
  root.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', () => ctx.applyView(el.dataset.go.replace('view:', ''))));
  bindActions(ctx, root);
}
