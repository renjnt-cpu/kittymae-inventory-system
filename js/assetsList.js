// Assets & Supplies Custodian -- the Assets tab: every asset in one register, with saved views, search, filters, sorting, paging and export.
// The table collapses to one card per asset on a phone (the app-wide .table-scroll rule), and the sort control is a field + direction pair
// rather than clickable headers so it still works there. Only ASSETS are listed here -- supplies have their own tab.
import { esc, plural, statusBadge, conditionBadge, chips, branchChip, dt, dash, money, opts, field } from './assetsUi.js?v=20261007b';
import { SAVED_VIEWS, viewById, matchesQuery, SORT_FIELDS, SORT_COMPARATORS, BLANK_Q, STATUSES, CONDITIONS, OWNERSHIP, COMPANIES, uniqueSorted, sum } from './assetsLogic.js?v=20261007b';
import { actionButtons, bindActions } from './assetsActions.js?v=20261007b';
import { exportAssetList } from './assetsReports.js?v=20261007b';
import { applySort, sortControlHtml, wireSortControl } from './uiKit.js?v=20261007b';

const $ = (id) => document.getElementById(id);
export const newAssetsState = () => ({ view: 'active', q: { ...BLANK_Q }, sort: { field: 'asset_number', dir: 'asc' }, page: 1, pageSize: 50, allCols: false, more: false, sel: new Set() });

/** The assets the table shows: saved view + the filters. */
export function visibleAssets(ctx) {
  const t = ctx.ui.assets, v = viewById(t.view);
  return ctx.assets.filter((a) => v.test(a, ctx) && matchesQuery(a, t.q));
}

const td = (label, html, cls) => '<td' + (label ? ' data-label="' + label + '"' : '') + (cls ? ' class="' + cls + '"' : '') + '>' + html + '</td>';
export function assetColumns(ctx, all, select, sel) {
  const c = ctx.caps;
  const idCell = (a) => '<button type="button" class="bl-link" data-act="view" data-id="' + a.id + '">' + esc(a.asset_number) + '</button><div class="bl-sub"><b>' + esc(a.name) + '</b></div>' +
    '<div class="muted bl-sub">' + esc([a.asset_tag, a.serial_number ? 'S/N ' + a.serial_number : ''].filter(Boolean).join(' · ')) + '</div>';
  const state = (a) => statusBadge(a.status) + ' ' + conditionBadge(a.condition) + chips(a._att.filter((x) => x.code !== 'aging'), 2);
  const actions = (a) => td('', actionButtons(ctx, a), 'full-row');
  const check = select ? [{ h: '<input type="checkbox" id="ac-sel-all" aria-label="Select every row on this page">', cell: (a) => td('', '<input type="checkbox" data-sel="' + a.id + '"' + (sel.has(a.id) ? ' checked' : '') + ' aria-label="Select ' + esc(a.asset_number) + '">', 'ac-selcell') }] : [];
  if (!all) return [...check,
    { h: 'Asset', cell: (a) => td('Asset', idCell(a), 'full-row') },
    { h: 'Category', cell: (a) => td('Category', dash(a._category)) },
    { h: 'Status', cell: (a) => td('Status', state(a)) },
    { h: 'Holder / where', cell: (a) => td('Holder / where', esc(a._where) + (a.department ? '<div class="muted bl-sub">' + esc(a.department) + '</div>' : '')) },
    { h: 'Branch', cell: (a) => td('Branch', branchChip(ctx, a.branch_id)) },
    { h: 'Warranty', cell: (a) => td('Warranty', a.warranty_end ? dt(a.warranty_end) + (a._warranty === 'expired' ? ' <span class="muted">ended</span>' : a._warranty === 'soon' ? ' <b class="lv-neg">soon</b>' : '') : '<span class="muted">—</span>') },
    { h: '', cell: actions }];
  return [...check,
    { h: 'Asset No.', cell: (a) => td('Asset No.', '<button type="button" class="bl-link" data-act="view" data-id="' + a.id + '">' + esc(a.asset_number) + '</button>') },
    { h: 'Name', cell: (a) => td('Name', esc(a.name)) }, { h: 'Tag', cell: (a) => td('Tag', dash(a.asset_tag)) }, { h: 'Category', cell: (a) => td('Category', dash(a._category)) },
    { h: 'Brand', cell: (a) => td('Brand', dash(a.brand)) }, { h: 'Model', cell: (a) => td('Model', dash(a.model)) }, { h: 'Serial no.', cell: (a) => td('Serial no.', dash(a.serial_number)) },
    { h: 'Status', cell: (a) => td('Status', statusBadge(a.status)) }, { h: 'Condition', cell: (a) => td('Condition', conditionBadge(a.condition)) },
    { h: 'Holder', cell: (a) => td('Holder', dash(a._holder)) }, { h: 'Where', cell: (a) => td('Where', esc(a._where)) }, { h: 'Branch', cell: (a) => td('Branch', branchChip(ctx, a.branch_id)) },
    { h: 'Department', cell: (a) => td('Department', dash(a.department)) }, { h: 'Company', cell: (a) => td('Company', dash(a.company)) }, { h: 'Ownership', cell: (a) => td('Ownership', dash(a.ownership_status)) },
    { h: 'Custodian', cell: (a) => td('Custodian', dash(a.custodian_id ? ctx.names[a.custodian_id] : a.custodian_label)) },
    { h: 'Purchased', cell: (a) => td('Purchased', dt(a.purchase_date)) }, { h: 'Age', cell: (a) => td('Age', a._age === null ? '—' : a._age.toFixed(1) + ' yrs') },
    { h: 'Warranty ends', cell: (a) => td('Warranty ends', dt(a.warranty_end)) }, { h: 'Next maintenance', cell: (a) => td('Next maintenance', dt(a.next_maintenance_due)) },
    ...(c.viewCost ? [{ h: 'Purchase price', cell: (a) => td('Purchase price', money(a._price)) }, { h: 'Repair cost', cell: (a) => td('Repair cost', a._repairCost ? money(a._repairCost) : '—') }] : []),
    { h: 'Last movement', cell: (a) => td('Last movement', dt(a.last_movement_at)) }, { h: '', cell: actions }];
}
const rowClass = (a) => 'ac-row-' + String(a.status).replace(/[^A-Za-z]+/g, '').toLowerCase();
export const assetTableHtml = (rows, cols, t) => '<div class="table-scroll table-2col bl-tablewrap"><table class="bl-table ac-table"><thead><tr>' + cols.map((c2) => '<th>' + c2.h + '</th>').join('') + '</tr></thead><tbody>' +
  rows.map((a) => '<tr data-row="' + a.id + '" class="' + rowClass(a) + '">' + cols.map((c2) => c2.cell(a)).join('') + '</tr>').join('') + '</tbody></table></div>';

export function pagerHtml(t, total, pages, prefix = 'ac') {
  if (total <= 25) return '';
  const from = (t.page - 1) * t.pageSize + 1, to = Math.min(total, t.page * t.pageSize);
  return '<div class="bl-pager"><span class="muted">Showing ' + from + '–' + to + ' of ' + total + '</span><div class="bl-btnrow">' +
    '<button type="button" class="btn small secondary" data-page="-1"' + (t.page <= 1 ? ' disabled' : '') + '>← Previous</button><span>Page ' + t.page + ' of ' + pages + '</span>' +
    '<button type="button" class="btn small secondary" data-page="1"' + (t.page >= pages ? ' disabled' : '') + '>Next →</button>' +
    '<select id="' + prefix + '-pagesize" aria-label="Rows per page">' + [25, 50, 100].map((n) => '<option value="' + n + '"' + (t.pageSize === n ? ' selected' : '') + '>' + n + ' per page</option>').join('') + '</select></div></div>';
}
export const exportMenu = (extra) => '<details class="bl-menu bl-exportmenu"><summary class="btn small secondary">Export ▾</summary><div class="bl-menu-pop"><button type="button" data-exp="csv">CSV</button><button type="button" data-exp="xlsx">Excel (.xlsx)</button><button type="button" data-exp="pdf">PDF</button>' + (extra || '') + '</div></details>';

export function renderAssets(ctx, panel) {
  const t = ctx.ui.assets, q = t.q, c = ctx.caps;
  const rows = applySort(visibleAssets(ctx), t.sort, SORT_COMPARATORS);
  const pages = Math.max(1, Math.ceil(rows.length / t.pageSize));
  if (t.page > pages) t.page = pages;
  const pageRows = rows.slice((t.page - 1) * t.pageSize, t.page * t.pageSize);
  const v = viewById(t.view);
  const cats = uniqueSorted(ctx.assets.map((a) => a._category)), depts = uniqueSorted([...ctx.assets.map((a) => a.department), ...ctx.departments]), companies = uniqueSorted([...COMPANIES, ...ctx.assets.map((a) => a.company)]);
  const holders = uniqueSorted(ctx.assets.filter((a) => a._holderId).map((a) => a._holderId)).map((id) => ({ value: id, label: ctx.names[id] || 'Unknown' })).sort((a, b) => a.label.localeCompare(b.label));
  const chipsOn = [];
  if (t.view !== 'active') chipsOn.push(['View', esc(v.label)]);
  if (q.search) chipsOn.push(['Search', '“' + esc(q.search) + '”']);
  [['status', 'Status'], ['condition', 'Condition'], ['category', 'Category'], ['department', 'Department'], ['company', 'Company'], ['ownership', 'Ownership'], ['warranty', 'Warranty']].forEach(([k, l]) => { if (q[k]) chipsOn.push([l, esc(q[k])]); });
  if (q.branch) chipsOn.push(['Branch', esc((ctx.branchById[q.branch] || {}).name || q.branch)]);
  if (q.holder) chipsOn.push(['Holder', esc(ctx.names[q.holder] || '')]);
  if (q.purchaseFrom || q.purchaseTo) chipsOn.push(['Purchased', esc((q.purchaseFrom || '…') + ' – ' + (q.purchaseTo || '…'))]);
  if (q.min !== '' || q.max !== '') chipsOn.push(['Value', esc((q.min || '0') + ' – ' + (q.max || '…'))]);
  const totalValue = c.viewCost ? sum(rows, (a) => a._price) : null;

  panel.innerHTML = '<div id="ac-tbl">' +
    '<div class="bl-views" role="group" aria-label="Saved views">' + SAVED_VIEWS.map((x) => '<button type="button" class="bl-chip' + (x.id === t.view ? ' bl-chip-on' : '') + '" data-view="' + x.id + '">' + esc(x.label) + '</button>').join('') + '</div>' +
    '<div class="card bl-toolbar"><div class="bl-toolrow">' +
      '<div class="field bl-grow"><label>Search</label><input type="search" id="ac-search" placeholder="Asset no., tag, serial, name, holder, branch…" value="' + esc(q.search) + '"></div>' +
      field('Branch', '<select data-q="branch">' + opts(ctx.branches.map((b) => ({ value: b.id, label: b.name })), q.branch, 'All branches') + '</select>') +
      sortControlHtml(SORT_FIELDS, t.sort, 'ac-sort-field', 'ac-sort-dir') +
      '<div class="field"><label>&nbsp;</label><div class="bl-btnrow"><button type="button" class="btn small secondary" id="ac-more-btn" aria-expanded="' + t.more + '">' + (t.more ? 'Hide filters' : 'More filters') + '</button>' +
        '<button type="button" class="btn small secondary" id="ac-cols-btn">' + (t.allCols ? 'Fewer columns' : 'All columns') + '</button>' + (c.canExport || c.reports ? exportMenu() : '') +
        '<button type="button" class="btn small secondary" id="ac-tags-btn"' + (t.sel.size ? '' : ' disabled') + '>Print tags (' + t.sel.size + ')</button>' +
        (c.canAdd ? '<button type="button" class="btn small" id="ac-add">+ Add Asset</button>' : '') + '</div></div></div>' +
      '<div class="bl-morefilters"' + (t.more ? '' : ' hidden') + '>' +
        field('Status', '<select data-q="status">' + opts(STATUSES, q.status, 'Any') + '</select>') + field('Condition', '<select data-q="condition">' + opts(CONDITIONS, q.condition, 'Any') + '</select>') +
        field('Category', '<select data-q="category">' + opts(cats, q.category, 'Any') + '</select>') + field('Department', '<select data-q="department">' + opts(depts, q.department, 'Any') + '</select>') +
        field('Holder', '<select data-q="holder">' + opts(holders, q.holder, 'Anyone') + '</select>') + field('Company', '<select data-q="company">' + opts(companies, q.company, 'Any') + '</select>') +
        field('Ownership', '<select data-q="ownership">' + opts(OWNERSHIP, q.ownership, 'Any') + '</select>') +
        field('Warranty', '<select data-q="warranty">' + opts([{ value: 'ok', label: 'In warranty' }, { value: 'soon', label: 'Ending soon' }, { value: 'expired', label: 'Ended' }, { value: 'none', label: 'No warranty recorded' }], q.warranty, 'Any') + '</select>') +
        field('Purchased from', '<input type="date" data-q="purchaseFrom" value="' + esc(q.purchaseFrom) + '">') + field('Purchased to', '<input type="date" data-q="purchaseTo" value="' + esc(q.purchaseTo) + '">') +
        (c.viewCost ? field('Value from (₱)', '<input type="number" min="0" step="0.01" data-q="min" value="' + esc(q.min) + '">') + field('Value to (₱)', '<input type="number" min="0" step="0.01" data-q="max" value="' + esc(q.max) + '">') : '') +
      '</div></div>' +
    (chipsOn.length ? '<div class="active-filters" role="status"><span class="active-filters-label">Active filters:</span>' + chipsOn.map((x) => '<span class="filter-chip">' + x[0] + ': <b>' + x[1] + '</b></span>').join('') + ' <button type="button" class="act-link" id="ac-clear-q">Clear</button></div>' : '') +
    '<div class="bl-summary"><b>' + plural(rows.length, 'asset') + '</b>' + (totalValue !== null && totalValue > 0 ? '<span>Purchase value <b>' + money(totalValue) + '</b></span>' : '') +
      '<span class="muted">' + esc(v.label) + (c.viewAll ? ' · all branches' : ' · your branch') + '</span></div>' +
    '<div id="ac-tbl-body"></div></div>';

  const body = $('ac-tbl-body');
  if (!rows.length) {
    body.innerHTML = '<div class="empty-state"><div class="empty-state-msg">' + (ctx.assets.length ? 'No assets match these filters.' : 'No assets yet — add the first one.') + '</div><div class="empty-state-actions">' +
      (ctx.assets.length ? '<button type="button" class="btn small secondary" id="ac-empty-clear">Clear filters</button>' : '') + (c.canAdd ? '<button type="button" class="btn small" id="ac-empty-add">+ Add Asset</button>' : '') + '</div></div>';
  } else body.innerHTML = assetTableHtml(pageRows, assetColumns(ctx, t.allCols, true, t.sel), t) + pagerHtml(t, rows.length, pages);

  const root = $('ac-tbl'), redraw = () => ctx.rerender();
  root.querySelectorAll('[data-view]').forEach((el) => el.addEventListener('click', () => { t.view = el.dataset.view; t.page = 1; redraw(); }));
  let st = null;
  $('ac-search').addEventListener('input', (e) => { clearTimeout(st); st = setTimeout(() => { q.search = e.target.value.trim(); t.page = 1; redraw(); const s = $('ac-search'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 300); });
  wireSortControl('ac-sort-field', 'ac-sort-dir', t.sort, () => { t.page = 1; redraw(); });
  $('ac-more-btn').addEventListener('click', () => { t.more = !t.more; redraw(); });
  $('ac-cols-btn').addEventListener('click', () => { t.allCols = !t.allCols; redraw(); });
  root.querySelectorAll('[data-q]').forEach((el) => el.addEventListener('change', () => { q[el.dataset.q] = el.value; t.page = 1; redraw(); }));
  const clear = () => { Object.assign(q, BLANK_Q); t.view = 'active'; t.page = 1; redraw(); };
  if ($('ac-clear-q')) $('ac-clear-q').addEventListener('click', clear);
  if ($('ac-empty-clear')) $('ac-empty-clear').addEventListener('click', clear);
  if ($('ac-add')) $('ac-add').addEventListener('click', () => ctx.openForm({}));
  if ($('ac-empty-add')) $('ac-empty-add').addEventListener('click', () => ctx.openForm({}));
  $('ac-tags-btn').addEventListener('click', () => ctx.print.tags([...t.sel]));
  root.querySelectorAll('[data-sel]').forEach((el) => el.addEventListener('change', () => { const id = Number(el.dataset.sel); if (el.checked) t.sel.add(id); else t.sel.delete(id); $('ac-tags-btn').disabled = !t.sel.size; $('ac-tags-btn').textContent = 'Print tags (' + t.sel.size + ')'; }));
  const all = $('ac-sel-all');
  if (all) all.addEventListener('change', () => { pageRows.forEach((a) => { if (all.checked) t.sel.add(a.id); else t.sel.delete(a.id); }); redraw(); });
  root.querySelectorAll('[data-exp]').forEach((el) => el.addEventListener('click', async () => {
    el.closest('details').open = false;
    try { await exportAssetList(ctx, rows, el.dataset.exp, v.label + ' assets'); } catch (err) { ctx.toast(err, true); }
  }));
  root.querySelectorAll('[data-page]').forEach((el) => el.addEventListener('click', () => { t.page = Math.max(1, Math.min(pages, t.page + Number(el.dataset.page))); redraw(); root.scrollIntoView({ block: 'start' }); }));
  if ($('ac-pagesize')) $('ac-pagesize').addEventListener('change', (e) => { t.pageSize = Number(e.target.value); t.page = 1; redraw(); });
  bindActions(ctx, root);
}
