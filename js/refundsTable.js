// Refund Management -- the Requests tab: every refund request in one report table, with saved views, search, filters,
// sorting, paging and export. The table collapses to one card per request on a phone (the app-wide .table-scroll rule),
// and the sort control is a field + direction pair rather than clickable headers so it still works there.
import { esc, money, fmtDate, plural, statusBadge, approvalBadge, paymentBadge, priorityBadge, agingBadge, proofBadge, flagBadges } from './refundsUi.js?v=20261007a';
import { SAVED_VIEWS, viewById, matchesScope, inPeriod, matchesQuery, SORT_FIELDS, SORT_COMPARATORS, STATUSES, APPROVAL_STATUSES, PAYMENT_STATUSES, PRIORITIES, agingKey, sum, uniqueSorted } from './refundsLogic.js?v=20261007a';
import { filterBarHtml, bindFilterBar, periodLabel } from './refundsFilters.js?v=20261007a';
import { exportRefundList } from './refundsExport.js?v=20261007a';
import { actionButtons, bindActions } from './refundsActions.js?v=20261007a';
import { applySort, sortControlHtml, wireSortControl } from './uiKit.js?v=20261007a';

const $ = (id) => document.getElementById(id);
const BLANK_Q = { search: '', status: '', approval: '', payment: '', proof: '', priority: '', reason: '', reqFrom: '', reqTo: '', apprFrom: '', apprTo: '', payFrom: '', payTo: '', min: '', max: '', age: '', high: false, requestedBy: '', approvedBy: '' };
export const newTableState = () => ({ view: 'all', q: { ...BLANK_Q }, sort: { field: 'attention', dir: 'desc' }, page: 1, pageSize: 50, allCols: false, more: false });

/** The refunds the table shows: global filters + saved view + the extra filters. */
export function visibleRows(ctx) {
  const t = ctx.ui.table, v = viewById(t.view), f = ctx.filters;
  return ctx.refunds.filter((r) => matchesScope(r, f) && (v.live || inPeriod(r, f)) && v.test(r) && matchesQuery(r, t.q));
}

const td = (label, html, cls) => '<td' + (label ? ' data-label="' + label + '"' : '') + (cls ? ' class="' + cls + '"' : '') + '>' + html + '</td>';
const dash = (v) => v ? esc(v) : '—';
function columns(ctx, all) {
  const nameCell = (r) => '<button type="button" class="bl-link" data-act="view" data-id="' + r.id + '">' + esc(r.customer_name) + '</button>';
  const idCell = (r) => '<button type="button" class="bl-link" data-act="view" data-id="' + r.id + '">' + esc(r.refund_request_number) + '</button>';
  const days = (r) => r._open ? agingBadge(agingKey(r._age), r._age) : '<span class="muted">—</span>';
  const actions = (r) => td('', actionButtons(ctx, r), 'full-row');
  if (!all) return [
    { h: 'Refund', cell: (r) => td('Refund', idCell(r) + '<div class="muted bl-sub">' + esc(r.customer_name) + (r.customer_contact ? ' · ' + esc(r.customer_contact) : '') + '</div>', 'full-row') },
    { h: 'Order ID', cell: (r) => td('Order ID', esc(r.order_reference || '—')) },
    { h: 'Branch', cell: (r) => td('Branch', esc(r._branch)) },
    { h: 'Reason', cell: (r) => td('Reason', esc(r.reason_category || '—')) },
    { h: 'Requested', cell: (r) => td('Requested', esc(fmtDate(r.requested_date))) },
    { h: 'Days pending', cell: (r) => td('Days pending', days(r), r._open ? '' : 'bl-empty') },
    { h: 'Amount', cell: (r) => td('Amount', '<b>' + money(r._req) + '</b>' + (r._appr !== null && Math.abs(r._appr - r._req) > 0.004 ? '<div class="muted bl-sub">approved ' + money(r._appr) + '</div>' : '')) },
    { h: 'Paid', cell: (r) => td('Paid', r._approved ? money(r._effPaid) + (r._over > 0 ? '<div class="muted bl-sub">recorded ' + money(r._paid) + '</div>' : r._remaining > 0 ? '<div class="muted bl-sub">left ' + money(r._remaining) + '</div>' : '') : '<span class="muted">—</span>') },
    { h: 'Status', cell: (r) => td('Status', statusBadge(r.status) + flagBadges(r)) },
    { h: 'Priority', cell: (r) => td('Priority', priorityBadge(r.priority)) },
    { h: 'Proof', cell: (r) => td('Proof', proofBadge(r._proof), r._proof === 'n/a' ? 'bl-empty' : '') },
    { h: '', cell: actions }];
  return [
    { h: 'Refund ID', cell: (r) => td('Refund ID', idCell(r)) },
    { h: 'Order ID', cell: (r) => td('Order ID', esc(r.order_reference || '—')) },
    { h: 'Customer', cell: (r) => td('Customer', nameCell(r), 'full-row') },
    { h: 'Contact', cell: (r) => td('Contact', dash(r.customer_contact)) },
    { h: 'Branch', cell: (r) => td('Branch', esc(r._branch)) },
    { h: 'Item', cell: (r) => td('Item', dash(r.item_description)) },
    { h: 'Reason', cell: (r) => td('Reason', esc(r.reason_category || '—')) },
    { h: 'Requested Date', cell: (r) => td('Requested Date', esc(fmtDate(r.requested_date))) },
    { h: 'Days Pending', cell: (r) => td('Days Pending', days(r)) },
    { h: 'Requested Amount', cell: (r) => td('Requested Amount', '<b>' + money(r._req) + '</b>') },
    { h: 'Approved Amount', cell: (r) => td('Approved Amount', money(r._appr)) },
    { h: 'Paid Amount', cell: (r) => td('Paid Amount', r._approved ? money(r._effPaid) : '—') },
    { h: 'Remaining Balance', cell: (r) => td('Remaining Balance', r._approved ? money(r._remaining) : '—') },
    { h: 'Refund Method', cell: (r) => td('Refund Method', dash(r.refund_method)) },
    { h: 'Status', cell: (r) => td('Status', statusBadge(r.status) + flagBadges(r)) },
    { h: 'Approval Status', cell: (r) => td('Approval Status', approvalBadge(r.approval_status)) },
    { h: 'Payment Status', cell: (r) => td('Payment Status', paymentBadge(r.payment_status)) },
    { h: 'Priority', cell: (r) => td('Priority', priorityBadge(r.priority)) },
    { h: 'Requested By', cell: (r) => td('Requested By', dash(r.created_by_name)) },
    { h: 'Approved By', cell: (r) => td('Approved By', dash(r.approved_by_name)) },
    { h: 'Processed By', cell: (r) => td('Processed By', dash(r._processedBy)) },
    { h: 'Proof Status', cell: (r) => td('Proof Status', proofBadge(r._proof)) },
    { h: '', cell: actions }];
}
const rowClass = (r) => 'rf-row-' + String(r.status).replace(/[^A-Za-z]+/g, '').toLowerCase() + (r.flagged ? ' rf-row-flagged' : '');
const tableHtml = (rows, cols) => '<div class="table-scroll table-2col bl-tablewrap"><table class="bl-table rf-table"><thead><tr>' + cols.map((c) => '<th>' + c.h + '</th>').join('') + '</tr></thead><tbody>' +
  rows.map((r) => '<tr data-row="' + r.id + '" class="' + rowClass(r) + '">' + cols.map((c) => c.cell(r)).join('') + '</tr>').join('') + '</tbody></table></div>';

const opt = (list, cur) => list.map((x) => '<option' + (cur === x ? ' selected' : '') + '>' + esc(x) + '</option>').join('');

export function renderTable(ctx, panel) {
  const t = ctx.ui.table, q = t.q;
  const rows = applySort(visibleRows(ctx), t.sort, SORT_COMPARATORS);
  const live = rows.filter((r) => r.status !== 'Cancelled'), ap = rows.filter((r) => r._approved);
  const totals = { requested: sum(live, (r) => r._req), approved: sum(ap, (r) => r._appr), paid: sum(ap, (r) => r._effPaid), left: sum(ap, (r) => r._remaining) };
  const pages = Math.max(1, Math.ceil(rows.length / t.pageSize));
  if (t.page > pages) t.page = pages;
  const pageRows = rows.slice((t.page - 1) * t.pageSize, t.page * t.pageSize);
  const v = viewById(t.view);
  const reasons = uniqueSorted([...ctx.reasons.map((x) => x.name), ...ctx.refunds.map((r) => r.reason_category)]);
  const requesters = uniqueSorted(ctx.refunds.map((r) => r.created_by_name)), approvers = uniqueSorted(ctx.refunds.map((r) => r.approved_by_name));
  const chips = [];
  if (t.view !== 'all') chips.push(['View', esc(v.label) + (v.live ? ' (all periods)' : '')]);
  if (q.search) chips.push(['Search', '“' + esc(q.search) + '”']);
  [['status', 'Status'], ['approval', 'Approval'], ['payment', 'Payment'], ['proof', 'Proof'], ['priority', 'Priority'], ['reason', 'Reason'], ['requestedBy', 'Requested by'], ['approvedBy', 'Approved by']].forEach(([k, l]) => { if (q[k]) chips.push([l, esc(q[k])]); });
  if (q.reqFrom || q.reqTo) chips.push(['Requested', esc((q.reqFrom ? fmtDate(q.reqFrom) : '…') + ' – ' + (q.reqTo ? fmtDate(q.reqTo) : '…'))]);
  if (q.apprFrom || q.apprTo) chips.push(['Approved', esc((q.apprFrom ? fmtDate(q.apprFrom) : '…') + ' – ' + (q.apprTo ? fmtDate(q.apprTo) : '…'))]);
  if (q.payFrom || q.payTo) chips.push(['Paid', esc((q.payFrom ? fmtDate(q.payFrom) : '…') + ' – ' + (q.payTo ? fmtDate(q.payTo) : '…'))]);
  if (q.min !== '') chips.push(['Min', money(q.min)]);
  if (q.max !== '') chips.push(['Max', money(q.max)]);
  if (q.age) chips.push(['Pending', q.age + '+ days']);
  if (q.high) chips.push(['Only', 'high amount']);

  panel.innerHTML = '<div id="rf-tbl">' + filterBarHtml(ctx) +
    '<div class="bl-views" role="group" aria-label="Saved views">' + SAVED_VIEWS.filter((x) => !x.hidden || x.id === t.view).map((x) =>
      '<button type="button" class="bl-chip' + (x.id === t.view ? ' bl-chip-on' : '') + '" data-view="' + x.id + '">' + esc(x.label) + '</button>').join('') + '</div>' +
    '<div class="card bl-toolbar"><div class="bl-toolrow">' +
      '<div class="field bl-grow"><label>Search</label><input type="search" id="rf-search" placeholder="Refund no., order ID, customer, contact, item…" value="' + esc(q.search) + '"></div>' +
      sortControlHtml(SORT_FIELDS, t.sort, 'rf-sort-field', 'rf-sort-dir') +
      '<div class="field"><label>&nbsp;</label><div class="bl-btnrow"><button type="button" class="btn small secondary" id="rf-more-btn" aria-expanded="' + t.more + '">' + (t.more ? 'Hide filters' : 'More filters') + '</button>' +
        '<button type="button" class="btn small secondary" id="rf-cols-btn">' + (t.allCols ? 'Fewer columns' : 'All columns') + '</button>' +
        '<details class="bl-menu bl-exportmenu"><summary class="btn small secondary">Export ▾</summary><div class="bl-menu-pop"><button type="button" data-exp="csv">CSV</button><button type="button" data-exp="xlsx">Excel (.xlsx)</button><button type="button" data-exp="pdf">PDF</button></div></details>' +
        '<button type="button" class="btn small" id="rf-add">+ New Refund Request</button></div></div></div>' +
      '<div class="bl-morefilters"' + (t.more ? '' : ' hidden') + '>' +
        '<div class="field"><label>Status</label><select data-q="status"><option value="">Any</option>' + opt(STATUSES, q.status) + '</select></div>' +
        '<div class="field"><label>Approval status</label><select data-q="approval"><option value="">Any</option>' + opt(APPROVAL_STATUSES, q.approval) + '</select></div>' +
        '<div class="field"><label>Payment status</label><select data-q="payment"><option value="">Any</option>' + opt(PAYMENT_STATUSES, q.payment) + '</select></div>' +
        '<div class="field"><label>Proof</label><select data-q="proof"><option value="">Any</option>' + opt(['Verified', 'Proof Uploaded', 'Partial Proof', 'No Proof'], q.proof) + '</select></div>' +
        '<div class="field"><label>Priority</label><select data-q="priority"><option value="">Any</option>' + opt(PRIORITIES, q.priority) + '</select></div>' +
        '<div class="field"><label>Reason</label><select data-q="reason"><option value="">Any</option>' + opt(reasons, q.reason) + '</select></div>' +
        '<div class="field"><label>Requested from</label><input type="date" data-q="reqFrom" value="' + esc(q.reqFrom) + '"></div>' +
        '<div class="field"><label>Requested to</label><input type="date" data-q="reqTo" value="' + esc(q.reqTo) + '"></div>' +
        '<div class="field"><label>Approved from</label><input type="date" data-q="apprFrom" value="' + esc(q.apprFrom) + '"></div>' +
        '<div class="field"><label>Approved to</label><input type="date" data-q="apprTo" value="' + esc(q.apprTo) + '"></div>' +
        '<div class="field"><label>Paid from</label><input type="date" data-q="payFrom" value="' + esc(q.payFrom) + '"></div>' +
        '<div class="field"><label>Paid to</label><input type="date" data-q="payTo" value="' + esc(q.payTo) + '"></div>' +
        '<div class="field"><label>Min amount</label><input type="number" data-q="min" min="0" step="0.01" value="' + esc(q.min) + '"></div>' +
        '<div class="field"><label>Max amount</label><input type="number" data-q="max" min="0" step="0.01" value="' + esc(q.max) + '"></div>' +
        '<div class="field"><label>Pending at least</label><select data-q="age"><option value="">Any time</option>' + [3, 7, 14, 30].map((n) => '<option value="' + n + '"' + (String(q.age) === String(n) ? ' selected' : '') + '>' + n + '+ days</option>').join('') + '</select></div>' +
        '<div class="field"><label>Requested by</label><select data-q="requestedBy"><option value="">Anyone</option>' + opt(requesters, q.requestedBy) + '</select></div>' +
        '<div class="field"><label>Approved by</label><select data-q="approvedBy"><option value="">Anyone</option>' + opt(approvers, q.approvedBy) + '</select></div>' +
        '<div class="bl-checks bl-span-all"><label class="bl-chk"><input type="checkbox" data-qb="high"' + (q.high ? ' checked' : '') + '> High-amount refunds only (' + money(ctx.highAmount) + ' and up)</label></div>' +
      '</div></div>' +
    (chips.length ? '<div class="active-filters" role="status"><span class="active-filters-label">Active filters:</span>' + chips.map((x) => '<span class="filter-chip">' + x[0] + ': <b>' + x[1] + '</b></span>').join('') + ' <button type="button" class="act-link" id="rf-clear-q">Clear</button></div>' : '') +
    '<div class="bl-summary"><b>' + plural(rows.length, 'request') + '</b><span>Requested <b>' + money(totals.requested) + '</b></span><span>Approved <b>' + money(totals.approved) + '</b></span><span>Refunded <b class="lv-pos">' + money(totals.paid) + '</b></span><span>Still owed <b>' + money(totals.left) + '</b></span><span class="muted">' + esc(periodLabel(ctx)) + (v.live ? ' · view ignores the month' : '') + '</span></div>' +
    '<div id="rf-tbl-body"></div></div>';

  const body = $('rf-tbl-body');
  if (!rows.length) {
    body.innerHTML = '<div class="empty-state"><div class="empty-state-msg">' + (ctx.refunds.length ? 'No refund requests match these filters.' : 'No refund requests yet — create the first one.') + '</div><div class="empty-state-actions">' +
      (ctx.refunds.length ? '<button type="button" class="btn small secondary" id="rf-empty-clear">Clear filters</button>' : '') + '<button type="button" class="btn small" id="rf-empty-add">+ New Refund Request</button></div></div>';
  } else body.innerHTML = tableHtml(pageRows, columns(ctx, t.allCols)) + pagerHtml(t, rows.length, pages);

  const root = $('rf-tbl'), redraw = () => ctx.rerender();
  bindFilterBar(ctx, root, () => { t.page = 1; redraw(); });
  root.querySelectorAll('[data-view]').forEach((el) => el.addEventListener('click', () => { t.view = el.dataset.view; t.page = 1; redraw(); }));
  let st = null;
  $('rf-search').addEventListener('input', (e) => { clearTimeout(st); st = setTimeout(() => { q.search = e.target.value.trim(); t.page = 1; redraw(); const s = $('rf-search'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 300); });
  wireSortControl('rf-sort-field', 'rf-sort-dir', t.sort, () => { t.page = 1; redraw(); });
  $('rf-more-btn').addEventListener('click', () => { t.more = !t.more; redraw(); });
  $('rf-cols-btn').addEventListener('click', () => { t.allCols = !t.allCols; redraw(); });
  root.querySelectorAll('[data-q]').forEach((el) => el.addEventListener('change', () => { q[el.dataset.q] = el.value; t.page = 1; redraw(); }));
  root.querySelectorAll('[data-qb]').forEach((el) => el.addEventListener('change', () => { q[el.dataset.qb] = el.checked; t.page = 1; redraw(); }));
  const clear = () => { Object.assign(q, BLANK_Q); t.view = 'all'; t.page = 1; redraw(); };
  if ($('rf-clear-q')) $('rf-clear-q').addEventListener('click', clear);
  if ($('rf-empty-clear')) $('rf-empty-clear').addEventListener('click', clear);
  $('rf-add').addEventListener('click', () => ctx.openForm({}));
  if ($('rf-empty-add')) $('rf-empty-add').addEventListener('click', () => ctx.openForm({}));
  root.querySelectorAll('[data-exp]').forEach((el) => el.addEventListener('click', async () => {
    el.closest('details').open = false;
    try { await exportRefundList(ctx, rows, el.dataset.exp, v.label + ' refunds'); } catch (err) { ctx.toast(err, true); }
  }));
  root.querySelectorAll('[data-page]').forEach((el) => el.addEventListener('click', () => { t.page = Math.max(1, Math.min(pages, t.page + Number(el.dataset.page))); redraw(); root.scrollIntoView({ block: 'start' }); }));
  if ($('rf-pagesize')) $('rf-pagesize').addEventListener('change', (e) => { t.pageSize = Number(e.target.value); t.page = 1; redraw(); });
  bindActions(ctx, root);
}

function pagerHtml(t, total, pages) {
  if (total <= 25) return '';
  const from = (t.page - 1) * t.pageSize + 1, to = Math.min(total, t.page * t.pageSize);
  return '<div class="bl-pager"><span class="muted">Showing ' + from + '–' + to + ' of ' + total + '</span><div class="bl-btnrow">' +
    '<button type="button" class="btn small secondary" data-page="-1"' + (t.page <= 1 ? ' disabled' : '') + '>← Previous</button><span>Page ' + t.page + ' of ' + pages + '</span>' +
    '<button type="button" class="btn small secondary" data-page="1"' + (t.page >= pages ? ' disabled' : '') + '>Next →</button>' +
    '<select id="rf-pagesize" aria-label="Rows per page">' + [25, 50, 100].map((n) => '<option value="' + n + '"' + (t.pageSize === n ? ' selected' : '') + '>' + n + ' per page</option>').join('') + '</select></div></div>';
}
