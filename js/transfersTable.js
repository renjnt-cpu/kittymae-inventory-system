// Transfers -- the Transfers tab: every transfer in one report table, with saved views, search, filters, sorting, paging and export.
// The table collapses to one card per transfer on a phone (the app-wide .table-scroll rule), and the sort control is a field + direction
// pair rather than clickable headers so it still works there.
import { manilaDate } from './leaveUi.js?v=20261008b';
import { esc, qty, fmtDate, plural, statusBadge, priorityBadge, routeText, tagBadge } from './transfersUi.js?v=20261008b';
import { SAVED_VIEWS, viewById, matchesScope, inPeriod, matchesQuery, SORT_FIELDS, SORT_COMPARATORS, STATUSES, PRIORITIES, sum, uniqueSorted } from './transfersLogic.js?v=20261008b';
import { filterBarHtml, bindFilterBar, periodLabel } from './transfersFilters.js?v=20261008b';
import { exportTransferList } from './transfersExport.js?v=20261008b';
import { actionButtons, bindActions } from './transfersActions.js?v=20261008b';
import { applySort, sortControlHtml, wireSortControl } from './uiKit.js?v=20261008b';

const $ = (id) => document.getElementById(id);
const BLANK_Q = { search: '', status: '', priority: '', category: '', sku: '', reqFrom: '', reqTo: '', requestedBy: '', receivedBy: '' };
export const newTableState = () => ({ view: 'all', q: { ...BLANK_Q }, sort: { field: 'attention', dir: 'desc' }, page: 1, pageSize: 50, allCols: false, more: false });

/** The transfers the table shows: global filters + saved view + the extra filters. */
export function visibleRows(ctx) {
  const t = ctx.ui.table, v = viewById(t.view), f = ctx.filters;
  return ctx.transfers.filter((x) => matchesScope(x, f) && (v.live || inPeriod(x, f)) && v.test(x) && matchesQuery(x, t.q));
}

const td = (label, html, cls) => '<td' + (label ? ' data-label="' + label + '"' : '') + (cls ? ' class="' + cls + '"' : '') + '>' + html + '</td>';
const dash = (v) => (v ? esc(v) : '—');
const dt = (iso) => (iso ? esc(fmtDate(iso)) : '—');
function columns(ctx, all) {
  const idCell = (t) => '<button type="button" class="bl-link" data-act="view" data-id="' + t.id + '">' + esc(t.transfer_number) + '</button>';
  const actions = (t) => td('', actionButtons(ctx, t), 'full-row');
  const state = (t) => statusBadge(t.status) + (t.priority === 'Urgent' || t.priority === 'High' ? ' ' + priorityBadge(t.priority) : '') + (t.return_of ? ' ' + tagBadge('Return', 'bl-tag-blue') : '');
  const disc = (t) => (t._openDiscs.length ? '<b class="lv-neg">' + t._openDiscs.length + ' open</b>' : t.has_discrepancy ? '<span class="muted">resolved</span>' : '<span class="muted">—</span>');
  if (!all) return [
    { h: 'Transfer ID', cell: (t) => td('Transfer ID', idCell(t) + '<div class="muted bl-sub">' + esc(t.reason || '') + '</div>', 'full-row') },
    { h: 'Route', cell: (t) => td('Route', routeText(ctx, t), 'tf-routecell') },
    { h: 'Status', cell: (t) => td('Status', state(t) + (t._attention.length ? '<div class="tf-whys">' + t._attention.slice(0, 2).map((a) => '<span class="tf-why tf-why-' + a.tone + '">' + esc(a.text) + '</span>').join('') + '</div>' : '')) },
    { h: 'SKUs', cell: (t) => td('SKUs', String(t._skus)) },
    { h: 'Pieces', cell: (t) => td('Pieces', '<b>' + qty(t._pcs) + '</b>' + (t._sentPcs && t._recPcs !== t._sentPcs ? '<div class="muted bl-sub">' + qty(t._sentPcs) + ' sent · ' + qty(t._recPcs) + ' received</div>' : '')) },
    { h: 'Requested', cell: (t) => td('Requested', dt(t._requestedOn) + '<div class="muted bl-sub">' + dash(t._requester) + '</div>') },
    { h: 'Approved by', cell: (t) => td('Approved by', t.approved_at ? dash(t._approver) + '<div class="muted bl-sub">' + dt(manilaDate(t.approved_at)) + '</div>' : '—') },
    { h: 'Released', cell: (t) => td('Released', t._shippedOn ? dt(t._shippedOn) : '—') },
    { h: 'Received', cell: (t) => td('Received', t._receivedOn ? dt(t._receivedOn) + '<div class="muted bl-sub">' + dash(t._receiver) + '</div>' : '—') },
    { h: 'Discrepancy', cell: (t) => td('Discrepancy', disc(t)) },
    { h: '', cell: actions }];
  return [
    { h: 'Transfer ID', cell: (t) => td('Transfer ID', idCell(t)) },
    { h: 'Source', cell: (t) => td('Source', esc(t._from)) }, { h: 'Destination', cell: (t) => td('Destination', esc(t._to)) },
    { h: 'Status', cell: (t) => td('Status', state(t)) }, { h: 'Priority', cell: (t) => td('Priority', priorityBadge(t.priority)) },
    { h: 'SKUs', cell: (t) => td('SKUs', String(t._skus)) }, { h: 'Requested pcs', cell: (t) => td('Requested pcs', qty(t._reqPcs)) },
    { h: 'Approved pcs', cell: (t) => td('Approved pcs', t.approved_at ? qty(t._apprPcs) : '—') }, { h: 'Released pcs', cell: (t) => td('Released pcs', t.shipped_at ? qty(t._sentPcs) : '—') },
    { h: 'Received pcs', cell: (t) => td('Received pcs', t._recPcs ? '<b>' + qty(t._recPcs) + '</b>' : '—') }, { h: 'Still expected', cell: (t) => td('Still expected', t._outstanding ? '<b class="lv-neg">' + qty(t._outstanding) + '</b>' : '—') },
    { h: 'Requested by', cell: (t) => td('Requested by', dash(t._requester)) }, { h: 'Requested date', cell: (t) => td('Requested date', dt(t._requestedOn)) },
    { h: 'Approved by', cell: (t) => td('Approved by', dash(t._approver)) }, { h: 'Approved date', cell: (t) => td('Approved date', t.approved_at ? dt(manilaDate(t.approved_at)) : '—') },
    { h: 'Released by', cell: (t) => td('Released by', dash(t._releaser)) }, { h: 'Release date', cell: (t) => td('Release date', dt(t._shippedOn)) },
    { h: 'Courier / tracking', cell: (t) => td('Courier / tracking', dash([t.release_courier, t.release_tracking].filter(Boolean).join(' · '))) },
    { h: 'Received by', cell: (t) => td('Received by', dash(t._receiver)) }, { h: 'Received date', cell: (t) => td('Received date', dt(t._receivedOn)) },
    { h: 'Discrepancy', cell: (t) => td('Discrepancy', disc(t)) }, { h: 'Reason', cell: (t) => td('Reason', dash(t.reason)) }, { h: '', cell: actions }];
}
const rowClass = (t) => 'tf-row-' + String(t.status).replace(/[^A-Za-z]+/g, '').toLowerCase() + (t._openDiscs.length ? ' tf-row-open' : '');
const tableHtml = (rows, cols) => '<div class="table-scroll table-2col bl-tablewrap"><table class="bl-table tf-table"><thead><tr>' + cols.map((c) => '<th>' + c.h + '</th>').join('') + '</tr></thead><tbody>' +
  rows.map((t) => '<tr data-row="' + t.id + '" class="' + rowClass(t) + '">' + cols.map((c) => c.cell(t)).join('') + '</tr>').join('') + '</tbody></table></div>';
const opt = (list, cur) => list.map((x) => '<option' + (cur === x ? ' selected' : '') + '>' + esc(x) + '</option>').join('');

export function renderTable(ctx, panel) {
  const t = ctx.ui.table, q = t.q;
  const rows = applySort(visibleRows(ctx), t.sort, SORT_COMPARATORS);
  const live = rows.filter((x) => !['Cancelled', 'Rejected', 'Draft'].includes(x.status));
  const totals = { req: sum(live, (x) => x._reqPcs), sent: sum(live, (x) => x._sentPcs), rec: sum(live, (x) => x._recPcs), out: sum(live, (x) => x._outstanding), disc: sum(rows, (x) => x._openDiscs.length) };
  const pages = Math.max(1, Math.ceil(rows.length / t.pageSize));
  if (t.page > pages) t.page = pages;
  const pageRows = rows.slice((t.page - 1) * t.pageSize, t.page * t.pageSize);
  const v = viewById(t.view);
  const requesters = uniqueSorted(ctx.transfers.map((x) => x._requester)), receivers = uniqueSorted(ctx.transfers.map((x) => x._receiver));
  const cats = uniqueSorted(ctx.transfers.flatMap((x) => x._items.map((i) => i.category)));
  const chips = [];
  if (t.view !== 'all') chips.push(['View', esc(v.label) + (v.live ? ' (all periods)' : '')]);
  if (q.search) chips.push(['Search', '“' + esc(q.search) + '”']);
  [['status', 'Status'], ['priority', 'Priority'], ['category', 'Category'], ['sku', 'SKU'], ['requestedBy', 'Requested by'], ['receivedBy', 'Received by']].forEach(([k, l]) => { if (q[k]) chips.push([l, esc(q[k])]); });
  if (q.reqFrom || q.reqTo) chips.push(['Requested', esc((q.reqFrom ? fmtDate(q.reqFrom) : '…') + ' – ' + (q.reqTo ? fmtDate(q.reqTo) : '…'))]);

  panel.innerHTML = '<div id="tf-tbl">' + filterBarHtml(ctx) +
    '<div class="bl-views" role="group" aria-label="Saved views">' + SAVED_VIEWS.filter((x) => !x.hidden || x.id === t.view).map((x) => '<button type="button" class="bl-chip' + (x.id === t.view ? ' bl-chip-on' : '') + '" data-view="' + x.id + '">' + esc(x.label) + '</button>').join('') + '</div>' +
    '<div class="card bl-toolbar"><div class="bl-toolrow">' +
      '<div class="field bl-grow"><label>Search</label><input type="search" id="tf-search" placeholder="Transfer ID, SKU, item, branch, person…" value="' + esc(q.search) + '"></div>' +
      sortControlHtml(SORT_FIELDS, t.sort, 'tf-sort-field', 'tf-sort-dir') +
      '<div class="field"><label>&nbsp;</label><div class="bl-btnrow"><button type="button" class="btn small secondary" id="tf-more-btn" aria-expanded="' + t.more + '">' + (t.more ? 'Hide filters' : 'More filters') + '</button>' +
        '<button type="button" class="btn small secondary" id="tf-cols-btn">' + (t.allCols ? 'Fewer columns' : 'All columns') + '</button>' +
        '<details class="bl-menu bl-exportmenu"><summary class="btn small secondary">Export ▾</summary><div class="bl-menu-pop"><button type="button" data-exp="csv">CSV</button><button type="button" data-exp="xlsx">Excel (.xlsx)</button><button type="button" data-exp="pdf">PDF</button></div></details>' +
        '<button type="button" class="btn small" id="tf-add">+ New Transfer</button></div></div></div>' +
      '<div class="bl-morefilters"' + (t.more ? '' : ' hidden') + '>' +
        '<div class="field"><label>Status</label><select data-q="status"><option value="">Any</option>' + opt(STATUSES, q.status) + '</select></div>' +
        '<div class="field"><label>Priority</label><select data-q="priority"><option value="">Any</option>' + opt(PRIORITIES, q.priority) + '</select></div>' +
        '<div class="field"><label>Item category</label><select data-q="category"><option value="">Any</option>' + opt(cats, q.category) + '</select></div>' +
        '<div class="field"><label>SKU or item</label><input type="text" data-q="sku" placeholder="Contains…" value="' + esc(q.sku) + '"></div>' +
        '<div class="field"><label>Requested from</label><input type="date" data-q="reqFrom" value="' + esc(q.reqFrom) + '"></div>' +
        '<div class="field"><label>Requested to</label><input type="date" data-q="reqTo" value="' + esc(q.reqTo) + '"></div>' +
        '<div class="field"><label>Requested by</label><select data-q="requestedBy"><option value="">Anyone</option>' + opt(requesters, q.requestedBy) + '</select></div>' +
        '<div class="field"><label>Received by</label><select data-q="receivedBy"><option value="">Anyone</option>' + opt(receivers, q.receivedBy) + '</select></div>' +
      '</div></div>' +
    (chips.length ? '<div class="active-filters" role="status"><span class="active-filters-label">Active filters:</span>' + chips.map((x) => '<span class="filter-chip">' + x[0] + ': <b>' + x[1] + '</b></span>').join('') + ' <button type="button" class="act-link" id="tf-clear-q">Clear</button></div>' : '') +
    '<div class="bl-summary"><b>' + plural(rows.length, 'transfer') + '</b><span>Requested <b>' + qty(totals.req) + '</b> pcs</span><span>Released <b>' + qty(totals.sent) + '</b></span><span>Received <b class="lv-pos">' + qty(totals.rec) + '</b></span><span>Still expected <b>' + qty(totals.out) + '</b></span>' +
      (totals.disc ? '<span>Open discrepancies <b class="lv-neg">' + totals.disc + '</b></span>' : '') + '<span class="muted">' + esc(periodLabel(ctx)) + (v.live ? ' · view ignores the month' : '') + '</span></div>' +
    '<div id="tf-tbl-body"></div></div>';

  const body = $('tf-tbl-body');
  if (!rows.length) {
    body.innerHTML = '<div class="empty-state"><div class="empty-state-msg">' + (ctx.transfers.length ? 'No transfers match these filters.' : 'No transfers yet — create the first one.') + '</div><div class="empty-state-actions">' +
      (ctx.transfers.length ? '<button type="button" class="btn small secondary" id="tf-empty-clear">Clear filters</button>' : '') + '<button type="button" class="btn small" id="tf-empty-add">+ New Transfer</button></div></div>';
  } else body.innerHTML = tableHtml(pageRows, columns(ctx, t.allCols)) + pagerHtml(t, rows.length, pages);

  const root = $('tf-tbl'), redraw = () => ctx.rerender();
  bindFilterBar(ctx, root, () => { t.page = 1; redraw(); });
  root.querySelectorAll('[data-view]').forEach((el) => el.addEventListener('click', () => { t.view = el.dataset.view; t.page = 1; redraw(); }));
  let st = null;
  $('tf-search').addEventListener('input', (e) => { clearTimeout(st); st = setTimeout(() => { q.search = e.target.value.trim(); t.page = 1; redraw(); const s = $('tf-search'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 300); });
  wireSortControl('tf-sort-field', 'tf-sort-dir', t.sort, () => { t.page = 1; redraw(); });
  $('tf-more-btn').addEventListener('click', () => { t.more = !t.more; redraw(); });
  $('tf-cols-btn').addEventListener('click', () => { t.allCols = !t.allCols; redraw(); });
  root.querySelectorAll('[data-q]').forEach((el) => el.addEventListener('change', () => { q[el.dataset.q] = el.value; t.page = 1; redraw(); }));
  const clear = () => { Object.assign(q, BLANK_Q); t.view = 'all'; t.page = 1; redraw(); };
  if ($('tf-clear-q')) $('tf-clear-q').addEventListener('click', clear);
  if ($('tf-empty-clear')) $('tf-empty-clear').addEventListener('click', clear);
  $('tf-add').addEventListener('click', () => ctx.openForm({}));
  if ($('tf-empty-add')) $('tf-empty-add').addEventListener('click', () => ctx.openForm({}));
  root.querySelectorAll('[data-exp]').forEach((el) => el.addEventListener('click', async () => {
    el.closest('details').open = false;
    try { await exportTransferList(ctx, rows, el.dataset.exp, v.label + ' transfers'); } catch (err) { ctx.toast(err, true); }
  }));
  root.querySelectorAll('[data-page]').forEach((el) => el.addEventListener('click', () => { t.page = Math.max(1, Math.min(pages, t.page + Number(el.dataset.page))); redraw(); root.scrollIntoView({ block: 'start' }); }));
  if ($('tf-pagesize')) $('tf-pagesize').addEventListener('change', (e) => { t.pageSize = Number(e.target.value); t.page = 1; redraw(); });
  bindActions(ctx, root);
}

function pagerHtml(t, total, pages) {
  if (total <= 25) return '';
  const from = (t.page - 1) * t.pageSize + 1, to = Math.min(total, t.page * t.pageSize);
  return '<div class="bl-pager"><span class="muted">Showing ' + from + '–' + to + ' of ' + total + '</span><div class="bl-btnrow">' +
    '<button type="button" class="btn small secondary" data-page="-1"' + (t.page <= 1 ? ' disabled' : '') + '>← Previous</button><span>Page ' + t.page + ' of ' + pages + '</span>' +
    '<button type="button" class="btn small secondary" data-page="1"' + (t.page >= pages ? ' disabled' : '') + '>Next →</button>' +
    '<select id="tf-pagesize" aria-label="Rows per page">' + [25, 50, 100].map((n) => '<option value="' + n + '"' + (t.pageSize === n ? ' selected' : '') + '>' + n + ' per page</option>').join('') + '</select></div></div>';
}
