// Bills Management -- the Bills tab: the monthly bills report table with saved views, search, filters,
// sorting, grouping, paging, bulk changes and export; plus the one-time "assign branches" helper.
// The table collapses to one card per bill on a phone (the app-wide .table-scroll rule), and the sort
// control is a field + direction pair rather than clickable headers so it still works there.
import { esc, money, fmtDate, fmtDateTime, daysShort, daysText, statusBadge, payBadge, prioBadge, tagBadge, openDrawer, closeDrawer, drawerBody, friendly, errorsText, plural } from './billsUi.js?v=20261006d';
import { SAVED_VIEWS, viewById, matchesScope, inPeriod, matchesStatus, matchesQuery, SORT_FIELDS, SORT_COMPARATORS, PRIORITIES, suggestBranch, sum, uniqueSorted, round2 } from './billsLogic.js?v=20261006d';
import { filterBarHtml, bindFilterBar, periodLabel } from './billsFilters.js?v=20261006d';
import { exportBillList } from './billsExport.js?v=20261006d';
import { applySort, sortControlHtml, wireSortControl } from './uiKit.js?v=20261006d';

const $ = (id) => document.getElementById(id);
export const newTableState = () => ({ view: 'all', q: { search: '', paymentStatus: '', recurring: '', priority: '', dueToday: false, dueWeek: false, overdueOnly: false, min: '', max: '', addedBy: '' },
  sort: { field: 'urgency', dir: 'desc' }, page: 1, pageSize: 50, group: 'none', allCols: false, selected: new Set(), more: false });

/** The bills the table shows: global filters + saved view + the extra filters. */
export function visibleRows(ctx) {
  const t = ctx.ui.table, v = viewById(t.view), f = ctx.filters, c = ctx.rules();
  return ctx.bills.filter((b) => {
    if (!matchesScope(b, f)) return false;
    if (!v.live && !inPeriod(b, f)) return false;
    if (v.id === 'archived') { if (!b.archived_at) return false; } else if (!matchesStatus(b, f)) return false;
    return v.test(b, c) && matchesQuery(b, t.q, c);
  });
}
function sortRows(rows, sort) {
  if (sort.field === 'due_date') { // a bill with no due date always goes last
    const dated = rows.filter((b) => b.due_date), undated = rows.filter((b) => !b.due_date);
    return [...applySort(dated, sort, SORT_COMPARATORS), ...undated];
  }
  return applySort(rows, sort, SORT_COMPARATORS);
}

const td = (label, html, cls) => '<td' + (label ? ' data-label="' + label + '"' : '') + (cls ? ' class="' + cls + '"' : '') + '>' + html + '</td>';
function columns(ctx, all) {
  const w = ctx.canWrite;
  const nameCell = (b) => '<button type="button" class="bl-link" data-act="view" data-id="' + b.id + '">' + esc(b.name) + '</button>' +
    (all ? '' : (b.account_name || b.account_number ? '<div class="muted bl-sub">' + esc([b.account_name, b.account_number].filter(Boolean).join(' · ')) + '</div>' : '')) + (b.snoozed_until && b.snoozed_until >= ctx.today ? ' ' + tagBadge('Snoozed', 'bl-tag-gray') : '');
  const actions = (b) => {
    const own = ctx.access.branch_only && b.branch_id && b.branch_id === ctx.access.branch_id;
    const menu = [];
    if (w) menu.push(['edit', 'Edit'], ['upload', 'Upload Proof'], ['snooze', 'Snooze Reminder'], ['dup', 'Duplicate Next Month']);
    else if (own) menu.push(['upload', 'Upload Proof']);
    return '<div class="bl-rowact"><button type="button" class="btn small secondary" data-act="view" data-id="' + b.id + '">View</button>' +
      (w && b._open && b._remaining > 0 ? '<button type="button" class="btn small" data-act="pay" data-id="' + b.id + '">Pay</button>' : '') +
      (menu.length ? '<details class="bl-menu"><summary class="btn small secondary" aria-label="More actions">⋯</summary><div class="bl-menu-pop">' + menu.map((m) => '<button type="button" data-act="' + m[0] + '" data-id="' + b.id + '">' + m[1] + '</button>').join('') + '</div></details>' : '') + '</div>';
  };
  const sel = w ? [{ h: '<input type="checkbox" id="bl-sel-all" aria-label="Select all on this page">', cell: (b) => td('', '<input type="checkbox" data-sel="' + b.id + '"' + (ctx.ui.table.selected.has(b.id) ? ' checked' : '') + ' aria-label="Select bill ' + b.id + '">', 'bl-col-sel full-row') }] : [];
  const rec = (b) => b.is_recurring ? '<span title="Repeats ' + esc(b.recurring_frequency || '') + '">↻ ' + esc(b.recurring_frequency || 'Yes') + '</span>' : '—';
  const proof = (b) => b._proof ? '<span title="Has a proof file">📎' + (b._files.length > 1 ? ' ' + b._files.length : '') + '</span>' : '—';
  if (!all) return [...sel,
    { h: 'Bill', cell: (b) => td('Bill', nameCell(b), 'full-row') },
    { h: 'Category', cell: (b) => td('Category', esc(b._cat)) },
    { h: 'Branch', cell: (b) => td('Branch', esc(b._branch)) },
    { h: 'Amount', cell: (b) => td('Amount', '<b>' + money(b._amount) + '</b>' + (b._paid > 0 && b._remaining > 0 ? '<div class="muted bl-sub">paid ' + money(b._paid) + ' · left ' + money(b._remaining) + '</div>' : '')) },
    { h: 'Due', cell: (b) => td('Due', esc(b.due_date ? fmtDate(b.due_date) : '—') + (b._open && b._days !== null ? '<div class="muted bl-sub">' + esc(daysText(b)) + '</div>' : '')) },
    { h: 'Status', cell: (b) => td('Status', statusBadge(b._eff) + (b.payment_status === 'Partially Paid' && b._eff !== 'Partially Paid' ? ' ' + payBadge('Partially Paid') : '') + (b.payment_type === 'Auto-Debit' && b._eff !== 'Auto-Debited' ? ' ' + tagBadge('Auto-debit', 'bl-tag-blue') : '')) },
    { h: 'Priority', cell: (b) => td('Priority', prioBadge(b._prio)) },
    { h: 'Repeats', cell: (b) => td('Repeats', rec(b), b.is_recurring ? '' : 'bl-empty') },
    { h: 'Proof', cell: (b) => td('Proof', proof(b), b._proof ? '' : 'bl-empty') },
    { h: '', cell: (b) => td('', actions(b), 'full-row') }];
  return [...sel,
    { h: 'Bill ID', cell: (b) => td('Bill ID', '#' + b.id) },
    { h: 'Bill Name', cell: (b) => td('Bill Name', nameCell(b), 'full-row') },
    { h: 'Category', cell: (b) => td('Category', esc(b._cat)) },
    { h: 'Branch', cell: (b) => td('Branch', esc(b._branch)) },
    { h: 'Account Name', cell: (b) => td('Account Name', esc(b.account_name || '—')) },
    { h: 'Account Number', cell: (b) => td('Account Number', esc(b.account_number || '—')) },
    { h: 'Amount', cell: (b) => td('Amount', '<b>' + money(b._amount) + '</b>') },
    { h: 'Paid', cell: (b) => td('Paid', money(b._paid)) },
    { h: 'Due Date', cell: (b) => td('Due Date', esc(b.due_date ? fmtDate(b.due_date) : '—')) },
    { h: 'Days', cell: (b) => td('Days', esc(b._open && b._days !== null ? daysText(b) : '—')) },
    { h: 'Status', cell: (b) => td('Status', statusBadge(b._eff)) },
    { h: 'Payment Status', cell: (b) => td('Payment Status', payBadge(b.payment_status)) },
    { h: 'Recurring', cell: (b) => td('Recurring', rec(b)) },
    { h: 'Priority', cell: (b) => td('Priority', prioBadge(b._prio)) },
    { h: 'Added By', cell: (b) => td('Added By', esc(b.created_by_name || '—')) },
    { h: 'Last Updated', cell: (b) => td('Last Updated', esc(b.updated_at ? fmtDate(String(b.updated_at).slice(0, 10)) : '—')) },
    { h: 'Proof', cell: (b) => td('Proof', proof(b), b._proof ? '' : 'bl-empty') },
    { h: '', cell: (b) => td('', actions(b), 'full-row') }];
}
const tableHtml = (ctx, rows, cols) => '<div class="table-scroll table-2col bl-tablewrap"><table class="bl-table"><thead><tr>' + cols.map((c) => '<th>' + c.h + '</th>').join('') + '</tr></thead><tbody>' +
  rows.map((b) => '<tr data-row="' + b.id + '" class="bl-row-' + b._eff.replace(/\s+/g, '').toLowerCase() + '">' + cols.map((c) => c.cell(b)).join('') + '</tr>').join('') + '</tbody></table></div>';

function groupOf(group, b) {
  return group === 'category' ? b._cat : group === 'branch' ? b._branch : group === 'status' ? b._eff : group === 'priority' ? b._prio : '';
}

export function renderTable(ctx, panel) {
  const t = ctx.ui.table, w = ctx.canWrite, c = ctx.rules();
  const rows = sortRows(visibleRows(ctx), t.sort);
  const counted = rows.filter((b) => !b.archived_at && b._eff !== 'Cancelled');
  const totals = { total: sum(counted, (b) => b._amount), paid: sum(counted, (b) => Math.min(b._paid, b._amount ?? b._paid)), left: sum(counted.filter((b) => b._open), (b) => b._remaining) };
  const pages = Math.max(1, Math.ceil(rows.length / t.pageSize));
  if (t.page > pages) t.page = pages;
  const pageRows = t.group !== 'none' ? rows : rows.slice((t.page - 1) * t.pageSize, t.page * t.pageSize);
  const cols = columns(ctx, t.allCols);
  const q = t.q, v = viewById(t.view);
  const addedBy = uniqueSorted(ctx.bills.map((b) => b.created_by_name));
  const chips = [];
  if (t.view !== 'all') chips.push(['View', v.label + (v.live ? ' (all periods)' : '')]);
  if (q.search) chips.push(['Search', '“' + esc(q.search) + '”']);
  if (q.paymentStatus) chips.push(['Payment', q.paymentStatus]);
  if (q.recurring) chips.push(['Repeats', q.recurring === '1' ? 'recurring only' : 'one-time only']);
  if (q.priority) chips.push(['Priority', q.priority]);
  if (q.dueToday) chips.push(['Due', 'today']);
  if (q.dueWeek) chips.push(['Due', 'this week']);
  if (q.overdueOnly) chips.push(['Only', 'overdue']);
  if (q.min !== '') chips.push(['Min', money(q.min)]);
  if (q.max !== '') chips.push(['Max', money(q.max)]);
  if (q.addedBy) chips.push(['Added by', esc(q.addedBy)]);
  const bulk = w && t.selected.size > 0;

  panel.innerHTML = '<div id="bl-tbl">' + filterBarHtml(ctx, { status: true }) +
    '<div class="bl-views" role="group" aria-label="Saved views">' + SAVED_VIEWS.filter((x) => !x.hidden || x.id === t.view).map((x) =>
      '<button type="button" class="bl-chip' + (x.id === t.view ? ' bl-chip-on' : '') + '" data-view="' + x.id + '">' + esc(x.label) + '</button>').join('') + '</div>' +
    '<div class="card bl-toolbar"><div class="bl-toolrow">' +
      '<div class="field bl-grow"><label>Search</label><input type="search" id="bl-search" placeholder="Name, account, note, branch, bill number…" value="' + esc(q.search) + '"></div>' +
      sortControlHtml(SORT_FIELDS, t.sort, 'bl-sort-field', 'bl-sort-dir') +
      '<div class="field"><label>Group by</label><select id="bl-group">' + [['none', 'No grouping'], ['category', 'Category'], ['branch', 'Branch'], ['status', 'Status'], ['priority', 'Priority']].map((g) => '<option value="' + g[0] + '"' + (t.group === g[0] ? ' selected' : '') + '>' + g[1] + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>&nbsp;</label><div class="bl-btnrow"><button type="button" class="btn small secondary" id="bl-more-btn" aria-expanded="' + t.more + '">' + (t.more ? 'Hide filters' : 'More filters') + '</button>' +
        '<button type="button" class="btn small secondary" id="bl-cols-btn">' + (t.allCols ? 'Fewer columns' : 'All columns') + '</button>' +
        '<details class="bl-menu bl-exportmenu"><summary class="btn small secondary">Export ▾</summary><div class="bl-menu-pop"><button type="button" data-exp="csv">CSV</button><button type="button" data-exp="xlsx">Excel (.xlsx)</button><button type="button" data-exp="pdf">PDF</button></div></details>' +
        (ctx.canAdd ? '<button type="button" class="btn small" id="bl-add">+ Add Bill</button>' : '') + '</div></div></div>' +
      '<div class="bl-morefilters"' + (t.more ? '' : ' hidden') + '>' +
        '<div class="field"><label>Payment status</label><select data-q="paymentStatus"><option value="">Any</option>' + ['Unpaid', 'Partially Paid', 'Paid'].map((s) => '<option' + (q.paymentStatus === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></div>' +
        '<div class="field"><label>Recurring</label><select data-q="recurring"><option value="">Any</option><option value="1"' + (q.recurring === '1' ? ' selected' : '') + '>Recurring only</option><option value="0"' + (q.recurring === '0' ? ' selected' : '') + '>One-time only</option></select></div>' +
        '<div class="field"><label>Priority</label><select data-q="priority"><option value="">Any</option>' + PRIORITIES.map((p) => '<option' + (q.priority === p ? ' selected' : '') + '>' + p + '</option>').join('') + '</select></div>' +
        '<div class="field"><label>Min amount</label><input type="number" data-q="min" min="0" step="0.01" value="' + esc(q.min) + '"></div>' +
        '<div class="field"><label>Max amount</label><input type="number" data-q="max" min="0" step="0.01" value="' + esc(q.max) + '"></div>' +
        '<div class="field"><label>Added by</label><select data-q="addedBy"><option value="">Anyone</option>' + addedBy.map((n) => '<option' + (q.addedBy === n ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select></div>' +
        '<div class="bl-checks bl-span-all"><label class="bl-chk"><input type="checkbox" data-qb="dueToday"' + (q.dueToday ? ' checked' : '') + '> Due today</label><label class="bl-chk"><input type="checkbox" data-qb="dueWeek"' + (q.dueWeek ? ' checked' : '') + '> Due this week</label><label class="bl-chk"><input type="checkbox" data-qb="overdueOnly"' + (q.overdueOnly ? ' checked' : '') + '> Overdue only</label></div>' +
      '</div></div>' +
    (chips.length ? '<div class="active-filters" role="status"><span class="active-filters-label">Active filters:</span>' + chips.map((x) => '<span class="filter-chip">' + x[0] + ': <b>' + x[1] + '</b></span>').join('') + ' <button type="button" class="act-link" id="bl-clear-q">Clear</button></div>' : '') +
    '<div class="bl-summary"><b>' + plural(rows.length, 'bill') + '</b><span>Total <b>' + money(totals.total) + '</b></span><span>Paid <b class="lv-pos">' + money(totals.paid) + '</b></span><span>Outstanding <b>' + money(totals.left) + '</b></span><span class="muted">' + esc(periodLabel(ctx)) + (v.live ? ' · view ignores the month' : '') + '</span></div>' +
    (bulk ? bulkBar(ctx, t) : '') +
    '<div id="bl-tbl-body"></div></div>';

  // ---- the table (or the grouped tables) ----
  const body = $('bl-tbl-body');
  if (!rows.length) {
    body.innerHTML = '<div class="empty-state"><div class="empty-state-msg">' + (ctx.bills.length ? 'No bills match these filters.' : 'No bills yet — add the first one.') + '</div><div class="empty-state-actions">' +
      (ctx.bills.length ? '<button type="button" class="btn small secondary" id="bl-empty-clear">Clear filters</button>' : '') + (ctx.canAdd ? '<button type="button" class="btn small" id="bl-empty-add">+ Add Bill</button>' : '') + '</div></div>';
  } else if (t.group === 'none') {
    body.innerHTML = tableHtml(ctx, pageRows, cols) + pagerHtml(t, rows.length, pages);
  } else {
    const groups = [];
    pageRows.forEach((b) => { const k = groupOf(t.group, b); let g = groups.find((x) => x.k === k); if (!g) groups.push(g = { k, rows: [] }); g.rows.push(b); });
    const openAll = groups.length <= 4 || rows.length <= 40;
    body.innerHTML = groups.map((g) => {
      const live = g.rows.filter((b) => !b.archived_at && b._eff !== 'Cancelled');
      return '<details class="card exp bl-group"' + (openAll ? ' open' : '') + '><summary><span class="exp-arrow" aria-hidden="true">▸</span>' + esc(g.k || '—') + ' <span class="exp-count">(' + g.rows.length + ') — ' + money(sum(live, (b) => b._amount)) + '</span></summary><div class="exp-body">' + tableHtml(ctx, g.rows, cols) + '</div></details>';
    }).join('');
  }

  // ---- events ----
  const root = $('bl-tbl');
  const redraw = () => ctx.rerender();
  bindFilterBar(ctx, root, () => { t.selected.clear(); t.page = 1; redraw(); });
  root.querySelectorAll('[data-view]').forEach((el) => el.addEventListener('click', () => { t.view = el.dataset.view; t.page = 1; t.selected.clear(); redraw(); }));
  let st = null;
  $('bl-search').addEventListener('input', (e) => { clearTimeout(st); st = setTimeout(() => { q.search = e.target.value.trim(); t.page = 1; redraw(); const s = $('bl-search'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 300); });
  wireSortControl('bl-sort-field', 'bl-sort-dir', t.sort, () => { t.page = 1; redraw(); });
  $('bl-group').addEventListener('change', (e) => { t.group = e.target.value; t.page = 1; redraw(); });
  $('bl-more-btn').addEventListener('click', () => { t.more = !t.more; redraw(); });
  $('bl-cols-btn').addEventListener('click', () => { t.allCols = !t.allCols; redraw(); });
  root.querySelectorAll('[data-q]').forEach((el) => el.addEventListener('change', () => { q[el.dataset.q] = el.value; t.page = 1; redraw(); }));
  root.querySelectorAll('[data-qb]').forEach((el) => el.addEventListener('change', () => { q[el.dataset.qb] = el.checked; t.page = 1; redraw(); }));
  const clear = () => { Object.assign(q, newTableState().q); t.view = 'all'; t.page = 1; redraw(); };
  if ($('bl-clear-q')) $('bl-clear-q').addEventListener('click', clear);
  if ($('bl-empty-clear')) $('bl-empty-clear').addEventListener('click', clear);
  if ($('bl-add')) $('bl-add').addEventListener('click', () => ctx.openForm({}));
  if ($('bl-empty-add')) $('bl-empty-add').addEventListener('click', () => ctx.openForm({}));
  root.querySelectorAll('[data-exp]').forEach((el) => el.addEventListener('click', async () => {
    el.closest('details').open = false;
    try { await exportBillList(ctx, rows, el.dataset.exp, viewById(t.view).label + ' bills'); } catch (err) { ctx.toast(err, true); }
  }));
  root.querySelectorAll('[data-page]').forEach((el) => el.addEventListener('click', () => { t.page = Math.max(1, Math.min(pages, t.page + Number(el.dataset.page))); redraw(); root.scrollIntoView({ block: 'start' }); }));
  if ($('bl-pagesize')) $('bl-pagesize').addEventListener('change', (e) => { t.pageSize = Number(e.target.value); t.page = 1; redraw(); });

  // selection + bulk change
  if (w) {
    root.querySelectorAll('[data-sel]').forEach((el) => el.addEventListener('change', () => { const id = Number(el.dataset.sel); if (el.checked) t.selected.add(id); else t.selected.delete(id); redraw(); }));
    const all = $('bl-sel-all');
    if (all) {
      all.checked = pageRows.length > 0 && pageRows.every((b) => t.selected.has(b.id));
      all.addEventListener('change', () => { pageRows.forEach((b) => (all.checked ? t.selected.add(b.id) : t.selected.delete(b.id))); redraw(); });
    }
    if ($('bl-sel-filtered')) $('bl-sel-filtered').addEventListener('click', () => { rows.slice(0, 300).forEach((b) => t.selected.add(b.id)); redraw(); });
    if ($('bl-sel-clear')) $('bl-sel-clear').addEventListener('click', () => { t.selected.clear(); redraw(); });
    if ($('bl-bulk-apply')) $('bl-bulk-apply').addEventListener('click', async () => {
      const p = {};
      if ($('bl-bulk-branch').value !== '') p.branch_id = $('bl-bulk-branch').value === 'none' ? null : Number($('bl-bulk-branch').value);
      if ($('bl-bulk-cat').value) p.category_id = Number($('bl-bulk-cat').value);
      if ($('bl-bulk-prio').value) p.priority = $('bl-bulk-prio').value;
      if (!Object.keys(p).length) { ctx.toast('Choose a branch, category or priority to apply first.', true); return; }
      const ids = [...t.selected];
      try {
        const res = await ctx.api.bulkUpdate(ids, p);
        if (res && res.ok === false) throw new Error(errorsText(res));
        t.selected.clear(); ctx.toast('Updated ' + plural(res.updated, 'bill') + '.'); await ctx.refresh();
      } catch (err) { ctx.toast(err, true); }
    });
  }

  // row actions
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const id = Number(el.dataset.id);
    const run = {
      view: () => ctx.openDetail(id), pay: () => ctx.openPayment(id), edit: () => ctx.openForm({ id }), upload: () => ctx.openUpload(id), snooze: () => ctx.openSnooze(id),
      dup: async () => {
        const res = await ctx.api.duplicateBill(id); if (res && res.ok === false) throw new Error(errorsText(res));
        await ctx.refresh(); const nb = ctx.byId.get(res.id);
        ctx.toast('Duplicated' + (nb && nb.due_date ? ' — the copy is due ' + fmtDate(nb.due_date) : '') + '.'); ctx.openDetail(res.id);
      },
    }[el.dataset.act];
    if (run) { e.preventDefault(); const menu = el.closest('details.bl-menu'); if (menu) menu.open = false; Promise.resolve(run()).catch((err) => ctx.toast(err, true)); }
  });
}

function bulkBar(ctx, t) {
  return '<div class="bl-bulk" role="region" aria-label="Change selected bills"><b>' + t.selected.size + ' selected</b>' +
    '<div class="field"><label>Branch</label><select id="bl-bulk-branch"><option value="">— no change —</option><option value="none">Not assigned</option>' + ctx.branches.map((b) => '<option value="' + b.id + '">' + esc(b.name) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Category</label><select id="bl-bulk-cat"><option value="">— no change —</option>' + ctx.cats.filter((c) => c.active).map((c) => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Priority</label><select id="bl-bulk-prio"><option value="">— no change —</option><option value="auto">Automatic</option>' + PRIORITIES.map((p) => '<option>' + p + '</option>').join('') + '</select></div>' +
    '<div class="bl-btnrow"><button type="button" class="btn small" id="bl-bulk-apply">Apply</button><button type="button" class="btn small secondary" id="bl-sel-filtered">Select all filtered</button><button type="button" class="btn small secondary" id="bl-sel-clear">Clear</button></div></div>';
}
function pagerHtml(t, total, pages) {
  if (total <= 25) return '';
  const from = (t.page - 1) * t.pageSize + 1, to = Math.min(total, t.page * t.pageSize);
  return '<div class="bl-pager"><span class="muted">Showing ' + from + '–' + to + ' of ' + total + '</span><div class="bl-btnrow">' +
    '<button type="button" class="btn small secondary" data-page="-1"' + (t.page <= 1 ? ' disabled' : '') + '>← Previous</button><span>Page ' + t.page + ' of ' + pages + '</span>' +
    '<button type="button" class="btn small secondary" data-page="1"' + (t.page >= pages ? ' disabled' : '') + '>Next →</button>' +
    '<select id="bl-pagesize" aria-label="Rows per page">' + [25, 50, 100].map((n) => '<option value="' + n + '"' + (t.pageSize === n ? ' selected' : '') + '>' + n + ' per page</option>').join('') + '</select></div></div>';
}

// ================================================================ one-time branch assignment
/** Lists the bills that have no branch, grouped by name (the same utility bill month after month is one decision),
 * with a suggested branch where the bill's text names exactly one branch. Nothing is saved until Apply. */
export function openAssignBranches(ctx) {
  const open = ctx.bills.filter((b) => !b.archived_at && !b.branch_id);
  if (!open.length) { ctx.toast('Every bill already has a branch.'); return; }
  const groups = {};
  open.forEach((b) => { const k = b.name.trim().toLowerCase(); (groups[k] = groups[k] || { name: b.name, rows: [] }).rows.push(b); });
  const list = Object.values(groups).sort((a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name));
  const personal = (g) => g.rows.every((b) => b._personal);
  list.forEach((g) => { g.suggest = personal(g) ? null : suggestBranch(g.rows[0], ctx.branches); });
  const opts = (sel) => '<option value="">Leave unassigned</option>' + ctx.branches.map((b) => '<option value="' + b.id + '"' + (sel === b.id ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('');
  openDrawer('side', {
    title: 'Assign Branches', sub: plural(open.length, 'bill') + ' with no branch',
    body: '<div id="bl-side-msg"></div><div id="ba-errors"></div><p class="muted">Pick the branch each bill belongs to so branch reports are accurate. Bills with the same name are grouped — one choice covers all of them. A suggestion is only filled in when the bill’s text names exactly one branch. Personal bills can stay unassigned. Nothing is saved until you press Apply.</p>' +
      '<div class="bl-assign">' + list.map((g, i) => '<div class="bl-assign-row"><div><b>' + esc(g.name) + '</b><div class="muted">' + plural(g.rows.length, 'bill') + ' · ' + esc(g.rows[0]._cat) + ' · ' + money(sum(g.rows, (b) => b._amount)) + (g.suggest ? ' · <span class="lv-pos">suggested</span>' : '') + '</div></div>' +
        '<select data-grp="' + i + '" aria-label="Branch for ' + esc(g.name) + '">' + opts(g.suggest) + '</select></div>').join('') + '</div>',
    footer: '<button type="button" class="btn" id="ba-apply">Apply</button><button type="button" class="btn secondary" id="ba-cancel">Cancel</button>',
  });
  $('ba-cancel').addEventListener('click', () => closeDrawer('side'));
  $('ba-apply').addEventListener('click', async () => {
    const byBranch = {};
    drawerBody('side').querySelectorAll('[data-grp]').forEach((el) => { if (el.value) (byBranch[el.value] = byBranch[el.value] || []).push(...list[Number(el.dataset.grp)].rows.map((b) => b.id)); });
    const branches = Object.keys(byBranch);
    if (!branches.length) { $('ba-errors').innerHTML = '<div class="msg error">Choose a branch for at least one group first.</div>'; return; }
    const btn = $('ba-apply'); btn.disabled = true; let n = 0;
    try {
      for (const br of branches) {
        const ids = byBranch[br];
        for (let i = 0; i < ids.length; i += 250) {
          const res = await ctx.api.bulkUpdate(ids.slice(i, i + 250), { branch_id: Number(br) });
          if (res && res.ok === false) throw new Error(errorsText(res));
          n += res.updated;
        }
      }
      closeDrawer('side'); ctx.toast('Assigned a branch to ' + plural(n, 'bill') + '.'); await ctx.refresh();
    } catch (err) { $('ba-errors').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; btn.disabled = false; if (n) await ctx.refresh(); }
  });
}
