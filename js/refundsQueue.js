// Refund Management -- three working tabs built from the same data:
//   Approval Queue  every request still waiting for a decision, most urgent first, with Review / Approve / Reject on each
//   Payments        approved refunds that still owe money, what the company owes in total, and the payment ledger
//   Completed       refunds that were paid in full, with how long they took and whether proof is on file
import { esc, money, fmtDate, plural, kpiCard, statusBadge, priorityBadge, agingBadge, flagBadges, proofBadge, progressBar } from './refundsUi.js?v=20261007g';
import { agingKey, attentionScore, liability, inPeriod, sum, daysBetween, uniqueSorted } from './refundsLogic.js?v=20261007g';
import { filterBarHtml, bindFilterBar, scopedLive, scopedPeriod, periodLabel, scopeLabel } from './refundsFilters.js?v=20261007g';
import { actionButtons, alertRow, bindActions } from './refundsActions.js?v=20261007g';
import { liabilityHtml } from './refundsDashboard.js?v=20261007g';

// ================================================================ approval queue
const QUEUE_GROUPS = [
  { status: 'Pending Approval', title: 'Waiting for a first look', tone: 'yellow', empty: 'Nothing new is waiting.' },
  { status: 'Under Review', title: 'Being reviewed', tone: 'blue', empty: 'No request is being reviewed right now.' },
  { status: 'Needs Information', title: 'Needs more information', tone: 'orange', empty: 'No request is waiting on the requester.' },
  { status: 'On Hold', title: 'On hold', tone: 'orange', empty: 'No request is on hold.' },
];
export function renderQueue(ctx, panel) {
  const live = scopedLive(ctx).filter((r) => r._awaiting);
  const mgr = ctx.access.approve;
  const sorted = (st) => live.filter((r) => r.approval_status === st).sort((a, b) => attentionScore(b) - attentionScore(a) || a.id - b.id);
  const section = (g) => {
    const items = sorted(g.status), total = sum(items, (r) => r._req);
    const row = (r) => alertRow(ctx, r, {
      badges: statusBadge(r.status) + (r.priority !== 'Normal' ? ' ' + priorityBadge(r.priority) : '') + ' ' + agingBadge(agingKey(r._age), r._age) + flagBadges(r),
      amount: [money(r._req), 'requested ' + esc(fmtDate(r.requested_date))],
      note: (r.status_note ? esc(r.status_note) + ' · ' : '') + (r.notes ? esc(String(r.notes).slice(0, 140)) + (String(r.notes).length > 140 ? '…' : '') : '') + (r.created_by_name ? ' <span class="muted">— requested by ' + esc(r.created_by_name) + '</span>' : ''),
    });
    return '<div class="bl-alert"><div class="bl-alert-head bl-tone-' + g.tone + '"><h4>' + esc(g.title) + '</h4><span>' + (items.length ? items.length + ' · ' + money(total) : '0') + '</span></div>' +
      (items.length ? items.map(row).join('') : '<p class="muted bl-alert-empty">' + esc(g.empty) + '</p>') + '</div>';
  };
  panel.innerHTML = '<div id="rf-queue">' + filterBarHtml(ctx, { period: false }) +
    '<div class="bl-kpis">' +
      kpiCard({ label: 'Waiting for a decision', value: live.length, sub: money(sum(live, (r) => r._req)) + ' requested', tone: live.length ? 'yellow' : 'green' }) +
      kpiCard({ label: 'Waiting 7+ days', value: live.filter((r) => r._age >= 7).length, sub: 'should be decided soon', tone: live.some((r) => r._age >= 7) ? 'red' : 'green' }) +
      kpiCard({ label: 'High amount', value: live.filter((r) => r._high).length, sub: money(ctx.highAmount) + ' and up', tone: 'blue' }) +
      kpiCard({ label: 'Flagged', value: live.filter((r) => r.flagged).length, sub: 'marked for management', tone: live.some((r) => r.flagged) ? 'red' : 'gray' }) +
    '</div>' +
    (mgr ? '' : '<div class="msg lv-warn">Managers approve or reject refund requests. ' + (ctx.access.view_all ? 'You can see where each request stands here.' : 'Your own requests appear here while they wait.') + '</div>') +
    '<div class="card bl-panel"><h3 class="bl-h">Approval queue <span class="muted">· most urgent first · ' + esc(scopeLabel(ctx)) + '</span></h3>' + QUEUE_GROUPS.map(section).join('') + '</div></div>';
  const root = panel.querySelector('#rf-queue');
  bindFilterBar(ctx, root, () => ctx.rerender());
  bindActions(ctx, root);
}

// ================================================================ payments
export function renderPayments(ctx, panel) {
  const live = scopedLive(ctx), f = ctx.filters;
  const li = liability(live, ctx);
  const owed = li.upcoming.concat(li.none.rows).sort((a, b) => (a.target_payment_date || '9999').localeCompare(b.target_payment_date || '9999') || b._age - a._age);
  const ledger = live.flatMap((r) => r._pays.map((p) => ({ r, p }))).filter(({ p }) => inPeriod({ requested_date: p.payment_date }, f))
    .sort((a, b) => String(b.p.payment_date).localeCompare(String(a.p.payment_date)) || b.p.id - a.p.id);
  const paidInPeriod = sum(ledger.filter(({ p }) => !p.voided_at), ({ p }) => p.amount);
  const missing = live.filter((r) => r._missingProof && r.status !== 'Cancelled').length;
  const owedRow = (r) => '<tr data-row="' + r.id + '" class="rf-row-' + String(r.status).replace(/[^A-Za-z]+/g, '').toLowerCase() + '">' +
    '<td data-label="Refund" class="full-row"><button type="button" class="bl-link" data-act="view" data-id="' + r.id + '">' + esc(r.refund_request_number) + '</button><div class="muted bl-sub">' + esc(r.customer_name) + ' · ' + esc(r._branch) + '</div></td>' +
    '<td data-label="Method">' + esc(r.refund_method || '—') + '</td>' +
    '<td data-label="Approved"><b>' + money(r._appr) + '</b><div class="muted bl-sub">approved ' + (r.approved_date ? esc(fmtDate(r.approved_date)) : 'earlier') + '</div></td>' +
    '<td data-label="Paid">' + money(r._paid) + '</td>' +
    '<td data-label="Remaining"><b>' + money(r._remaining) + '</b>' + progressBar(r._appr ? Math.round((r._effPaid / r._appr) * 100) : 0, 'paid') + '</td>' +
    '<td data-label="Target date">' + (r.target_payment_date ? esc(fmtDate(r.target_payment_date)) + (daysBetween(ctx.today, r.target_payment_date) < 0 ? '<div class="lv-neg bl-sub">' + plural(-daysBetween(ctx.today, r.target_payment_date), 'day') + ' late</div>' : '') : '<span class="muted">not set</span>') + '</td>' +
    '<td data-label="Status">' + statusBadge(r.status) + flagBadges(r) + '</td><td data-label="" class="full-row">' + actionButtons(ctx, r) + '</td></tr>';
  const ledgerRow = ({ r, p }) => '<tr' + (p.voided_at ? ' class="bl-voided"' : '') + '><td data-label="Date">' + esc(fmtDate(p.payment_date)) + '</td>' +
    '<td data-label="Refund" class="full-row"><button type="button" class="bl-link" data-act="view" data-id="' + r.id + '">' + esc(r.refund_request_number) + '</button> <span class="muted">' + esc(r.customer_name) + '</span></td>' +
    '<td data-label="Amount"><b>' + money(p.amount) + '</b></td><td data-label="Method">' + esc(p.payment_method) + '</td><td data-label="Reference">' + esc(p.reference_number || '—') + '</td>' +
    '<td data-label="Processed by">' + esc(p.processed_by_name || '—') + '</td><td data-label="Proof">' + (p.voided_at ? '<span class="badge bl-st bl-st-gray">Voided</span>' : proofBadge(p.proof_verified_at ? 'Verified' : r._files.some((x) => x.payment_id === p.id) ? 'Proof Uploaded' : 'No Proof')) + '</td></tr>';
  panel.innerHTML = '<div id="rf-pays">' + filterBarHtml(ctx) +
    '<div class="bl-kpis">' +
      kpiCard({ label: 'Still owed to customers', value: money(li.total), sub: plural(li.count, 'approved refund'), tone: li.count ? 'orange' : 'green', hint: 'Approved amount minus what has been paid' }) +
      kpiCard({ label: 'Nothing paid yet', value: li.unpaid.count, sub: money(li.unpaid.amount), tone: li.unpaid.count ? 'blue' : 'green' }) +
      kpiCard({ label: 'Partly paid', value: li.partial.count, sub: money(li.partial.amount) + ' left', tone: li.partial.count ? 'orange' : 'green' }) +
      kpiCard({ label: 'Paid out · ' + periodLabel(ctx), value: money(paidInPeriod), sub: plural(ledger.filter(({ p }) => !p.voided_at).length, 'payment'), tone: 'green' }) +
      kpiCard({ label: 'Missing proof', value: missing, sub: 'refunds with no proof file', tone: missing ? 'orange' : 'green' }) +
    '</div>' +
    '<div class="bl-dash-grid"><div class="bl-dash-main">' +
      '<div class="card bl-panel"><h3 class="bl-h">Approved refunds still owed <span class="muted">· earliest target date first</span></h3>' +
        (owed.length ? '<div class="table-scroll table-2col bl-tablewrap"><table class="bl-table rf-table"><thead><tr><th>Refund</th><th>Method</th><th>Approved</th><th>Paid</th><th>Remaining</th><th>Target date</th><th>Status</th><th></th></tr></thead><tbody>' + owed.map(owedRow).join('') + '</tbody></table></div>'
          : '<p class="lv-pos">Nothing is owed — every approved refund is paid in full. ✓</p>') + '</div>' +
      '<div class="card bl-panel"><h3 class="bl-h">Refund payment ledger <span class="muted">· ' + esc(periodLabel(ctx)) + ' · voided payments stay listed, struck through</span></h3>' +
        (ledger.length ? '<div class="table-scroll table-2col bl-tablewrap"><table class="bl-table"><thead><tr><th>Date</th><th>Refund</th><th>Amount</th><th>Method</th><th>Reference</th><th>Processed by</th><th>Proof</th></tr></thead><tbody>' + ledger.slice(0, 200).map(ledgerRow).join('') + '</tbody></table></div>' +
          (ledger.length > 200 ? '<p class="muted">Showing the newest 200 payments.</p>' : '') : '<p class="muted">No payments in this period.</p>') + '</div>' +
    '</div><div class="bl-dash-side">' + liabilityHtml(ctx, li) + '</div></div></div>';
  const root = panel.querySelector('#rf-pays');
  bindFilterBar(ctx, root, () => ctx.rerender());
  bindActions(ctx, root);
}

// ================================================================ completed refunds
export function renderCompleted(ctx, panel) {
  const rows = scopedPeriod(ctx).filter((r) => r.status === 'Completed').sort((a, b) => String(b.completed_date || '').localeCompare(String(a.completed_date || '')) || b.id - a.id);
  const days = (r) => r.completed_date ? Math.max(daysBetween(r.requested_date, r.completed_date), 0) : null;
  const known = rows.filter((r) => days(r) !== null);
  const avg = known.length ? Math.round((sum(known, days) / known.length) * 10) / 10 : null;
  const noProof = rows.filter((r) => r._missingProof).length;
  panel.innerHTML = '<div id="rf-done">' + filterBarHtml(ctx) +
    '<div class="bl-kpis">' +
      kpiCard({ label: 'Completed refunds', value: rows.length, sub: esc(periodLabel(ctx)), tone: 'green' }) +
      kpiCard({ label: 'Total refunded', value: money(sum(rows, (r) => r._effPaid)), sub: 'paid in full', tone: 'green' }) +
      kpiCard({ label: 'Average time to complete', value: avg === null ? '—' : avg + ' days', sub: 'request to last payment', tone: 'blue' }) +
      kpiCard({ label: 'Without proof', value: noProof, sub: 'completed but no proof file', tone: noProof ? 'orange' : 'green' }) +
    '</div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Completed refunds <span class="muted">· ' + esc(scopeLabel(ctx)) + '</span></h3>' + (rows.length ?
      '<div class="table-scroll table-2col bl-tablewrap"><table class="bl-table"><thead><tr><th>Refund</th><th>Order ID</th><th>Reason</th><th>Refunded</th><th>Method</th><th>Requested</th><th>Completed</th><th>Days</th><th>Proof</th><th></th></tr></thead><tbody>' + rows.map((r) =>
        '<tr data-row="' + r.id + '"><td data-label="Refund" class="full-row"><button type="button" class="bl-link" data-act="view" data-id="' + r.id + '">' + esc(r.refund_request_number) + '</button><div class="muted bl-sub">' + esc(r.customer_name) + ' · ' + esc(r._branch) + '</div></td>' +
        '<td data-label="Order ID">' + esc(r.order_reference || '—') + '</td><td data-label="Reason">' + esc(r.reason_category || '—') + '</td>' +
        '<td data-label="Refunded"><b>' + money(r._effPaid) + '</b>' + (r._over > 0 ? '<div class="bl-sub"><span class="badge bl-tag rf-tag-flag">Check payments</span></div>' : '') + '</td>' +
        '<td data-label="Method">' + esc(uniqueSorted(r._livePays.map((p) => p.payment_method)).join(', ') || r.refund_method || '—') + '</td>' +
        '<td data-label="Requested">' + esc(fmtDate(r.requested_date)) + '</td><td data-label="Completed">' + (r.completed_date ? esc(fmtDate(r.completed_date)) : '—') + '</td>' +
        '<td data-label="Days">' + (days(r) === null ? '—' : days(r)) + '</td><td data-label="Proof">' + proofBadge(r._proof) + '</td>' +
        '<td data-label="" class="full-row">' + actionButtons(ctx, r) + '</td></tr>').join('') + '</tbody></table></div>'
      : '<div class="empty-state"><div class="empty-state-msg">No refund has been completed in this period.</div></div>') + '</div></div>';
  const root = panel.querySelector('#rf-done');
  bindFilterBar(ctx, root, () => ctx.rerender());
  bindActions(ctx, root);
}
