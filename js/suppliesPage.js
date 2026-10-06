// Assets & Supplies Custodian -- the Supplies tab. Supplies are quantity-based consumables (ink, paper, packaging ...): there is no holder and
// no serial number, only a stock level per branch, and every change to a level is one permanent row in the stock ledger (received, issued,
// transferred, adjusted, damaged, returned) with the balance before and after. Stock can never go below zero, and the same click twice never
// counts twice. A supply is never deleted -- it can be deactivated once its stock is zero.
import { esc, plural, field, opts, qty, dash, money, tagBadge, stockBadge, emptyBox, branchName, branchChip, openDrawer, closeDrawer, drawerBody, kv, setDetailHandlers, friendly, errorsText, val, categoryOptions, personOptions, branchOptions, fmtDateTime, actionPanel, isDrawerOpen } from './assetsUi.js?v=20261007a';
import { SUPPLY_TYPES, uniqueSorted, stockOf, dayOf } from './assetsLogic.js?v=20261007a';
import { exportSupplies } from './assetsReports.js?v=20261007a';
import { exportMenu, pagerHtml } from './assetsList.js?v=20261007a';
import { applySort, sortControlHtml, wireSortControl } from './uiKit.js?v=20261007a';
import { flagInvalid } from './uiKit.js?v=20261007a';

const $ = (id) => document.getElementById(id);
export const newSuppliesState = () => ({ q: '', category: '', branch: '', state: '', inactive: false, sort: { field: 'name', dir: 'asc' }, page: 1, pageSize: 50 });
const SORT_FIELDS = [{ key: 'name', label: 'Name' }, { key: 'code', label: 'Code' }, { key: 'category', label: 'Category' }, { key: 'total', label: 'Stock' }, { key: 'state', label: 'Stock level' }];
const SORTS = { name: (a, b) => a.name.localeCompare(b.name), code: (a, b) => a.supply_code.localeCompare(b.supply_code), category: (a, b) => a._category.localeCompare(b._category), total: (a, b) => a._total - b._total, state: (a, b) => ['out', 'out-some', 'low', 'ok', 'inactive'].indexOf(a._state) - ['out', 'out-some', 'low', 'ok', 'inactive'].indexOf(b._state) };
const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2));
/** the branches this person can move stock in (own branch, or all with the "every branch" permission) */
const myBranches = (ctx) => (ctx.caps.viewAll ? ctx.branches : ctx.branches.filter((b) => b.id === ctx.employee.branch_id));
const errBox = (html) => { const b = $('ac-sd-errors'); if (b) b.innerHTML = html ? '<div class="msg error">' + html + '</div>' : ''; if (html && drawerBody('side')) drawerBody('side').scrollTop = 0; };
const panel = (title, sub, body, footer) => openDrawer('side', { title, sub, body: '<div id="ac-side-msg"></div><div id="ac-sd-errors"></div>' + body, footer });
const supplyOptions = (ctx, sel, activeOnly = true) => '<option value="">Choose a supply…</option>' + ctx.supplyList.filter((s) => !activeOnly || s.active).map((s) => '<option value="' + s.id + '"' + (String(sel) === String(s.id) ? ' selected' : '') + '>' + esc(s.name) + ' (' + esc(s.unit) + ')</option>').join('');

export function visibleSupplies(ctx) {
  const t = ctx.ui.supplies, s = t.q.trim().toLowerCase();
  return ctx.supplyList.filter((x) => (t.inactive || x.active) && (!t.category || x._category === t.category) && (!t.state || (t.state === 'low' ? ['low'].includes(x._state) : t.state === 'out' ? ['out', 'out-some'].includes(x._state) : x._state === t.state)) &&
    (!t.branch || t.branch in x._per) && (!s || [x.name, x.supply_code, x._category, x.supplier, x.description].join(' ').toLowerCase().includes(s)));
}
const stockCell = (ctx, x, branch) => {
  if (branch) { const q = x._per[branch]; return q === undefined ? '<span class="muted">not stocked</span>' : '<b class="' + (q === 0 ? 'lv-neg' : x._threshold && q <= x._threshold ? 'lv-warn-text' : '') + '">' + qty(q) + '</b> ' + esc(x.unit); }
  const ids = Object.keys(x._per);
  return '<b>' + qty(x._total) + '</b> ' + esc(x.unit) + (ids.length ? '<div class="ac-perbranch">' + ids.map((b) => '<span class="ac-pb' + (x._per[b] === 0 ? ' ac-pb-out' : x._threshold && x._per[b] <= x._threshold ? ' ac-pb-low' : '') + '">' + esc(branchName(ctx, Number(b)) || 'Branch ' + b) + ' ' + qty(x._per[b]) + '</span>').join('') + '</div>' : '');
};

export function renderSupplies(ctx, panelEl) {
  const t = ctx.ui.supplies, c = ctx.caps;
  const rows = applySort(visibleSupplies(ctx), t.sort, SORTS), pages = Math.max(1, Math.ceil(rows.length / t.pageSize));
  if (t.page > pages) t.page = pages;
  const pageRows = rows.slice((t.page - 1) * t.pageSize, t.page * t.pageSize);
  const act = ctx.supplyList.filter((s) => s.active), low = act.filter((s) => s._state === 'low').length, out = act.filter((s) => ['out', 'out-some'].includes(s._state)).length;
  const cats = uniqueSorted(ctx.supplyList.map((s) => s._category));
  const tr = (x) => '<tr' + (!x.active ? ' class="ac-row-gone"' : '') + '><td data-label="Supply" class="full-row"><button type="button" class="bl-link" data-sup="' + x.id + '">' + esc(x.name) + '</button> <span class="muted">' + esc(x.supply_code) + '</span><div class="muted bl-sub">' + esc(x._category || '') + (x.supplier ? ' · ' + esc(x.supplier) : '') + '</div></td>' +
    '<td data-label="Stock" class="full-row">' + stockCell(ctx, x, t.branch ? Number(t.branch) : '') + '</td><td data-label="Minimum / reorder">' + (x.minimum_stock || x.reorder_level ? qty(x.minimum_stock) + ' / ' + qty(x.reorder_level) : '<span class="muted">not set</span>') + '</td><td data-label="Level">' + stockBadge(x._state) + '</td>' +
    (c.viewCost ? '<td data-label="Value">' + (x._value !== null ? money(x._value) : '—') + '</td>' : '') + '<td class="full-row"><div class="bl-rowact"><button type="button" class="btn small secondary" data-sup="' + x.id + '">View</button>' +
    (c.sIssue && x.active ? '<button type="button" class="btn small" data-issue="' + x.id + '">Issue</button>' : '') + '<details class="bl-menu"><summary class="btn small secondary" aria-label="More actions">⋯</summary><div class="bl-menu-pop">' +
    (c.sManage && x.active ? '<button type="button" data-sact="receive" data-id="' + x.id + '">Receive stock…</button>' : '') + (c.sAdjust && x.active ? '<button type="button" data-sact="adjust" data-id="' + x.id + '">Count / adjust…</button>' : '') + (c.sTransfer && x.active ? '<button type="button" data-sact="transfer" data-id="' + x.id + '">Move to another branch…</button>' : '') +
    (c.sManage ? '<button type="button" data-sact="edit" data-id="' + x.id + '">Edit details…</button>' : '') + '<button type="button" data-sact="ledger" data-id="' + x.id + '">Stock history</button></div></details></div></td></tr>';
  panelEl.innerHTML = '<div id="ac-sp"><div class="card bl-toolbar"><div class="bl-toolrow"><div class="field bl-grow"><label>Search</label><input type="search" id="ac-sp-q" placeholder="Name, code, supplier…" value="' + esc(t.q) + '"></div>' +
    field('Category', '<select id="ac-sp-cat">' + opts(cats, t.category, 'All') + '</select>') + field('Branch', '<select id="ac-sp-br">' + opts(ctx.branches.map((b) => ({ value: b.id, label: b.name })), t.branch, 'All branches') + '</select>') +
    field('Stock level', '<select id="ac-sp-state">' + opts([{ value: 'low', label: 'Low stock' }, { value: 'out', label: 'Out of stock' }, { value: 'ok', label: 'In stock' }, { value: 'inactive', label: 'Inactive' }], t.state, 'All') + '</select>') + sortControlHtml(SORT_FIELDS, t.sort, 'ac-sp-sort', 'ac-sp-dir') +
    '<div class="field"><label>&nbsp;</label><div class="bl-btnrow"><label class="lv-check"><input type="checkbox" id="ac-sp-inactive"' + (t.inactive ? ' checked' : '') + '> Show inactive</label>' + (c.canExport || c.reports ? exportMenu() : '') + (c.sManage ? '<button type="button" class="btn small secondary" id="ac-sp-recv">Receive stock</button><button type="button" class="btn small" id="ac-sp-add">+ Add Supply</button>' : '') + '</div></div></div></div>' +
    '<div class="bl-summary"><b>' + plural(rows.length, 'supply', 'supplies') + '</b><span>Low <b class="' + (low ? 'lv-neg' : '') + '">' + low + '</b></span><span>Out <b class="' + (out ? 'lv-neg' : '') + '">' + out + '</b></span><span class="muted">Low = at or below the higher of the minimum and the reorder level, at any branch.</span></div>' +
    (rows.length ? '<div class="table-scroll table-2col bl-tablewrap"><table class="bl-table"><thead><tr><th>Supply</th><th>Stock' + (t.branch ? ' at ' + esc(branchName(ctx, Number(t.branch))) : ' (all branches)') + '</th><th>Minimum / reorder</th><th>Level</th>' + (c.viewCost ? '<th>Value</th>' : '') + '<th></th></tr></thead><tbody>' + pageRows.map(tr).join('') + '</tbody></table></div>' + pagerHtml(t, rows.length, pages, 'ac-sp')
      : '<div class="empty-state"><div class="empty-state-msg">' + (ctx.supplyList.length ? 'No supply matches these filters.' : 'No supplies yet — add the first one.') + '</div>' + (c.sManage && !ctx.supplyList.length ? '<div class="empty-state-actions"><button type="button" class="btn small" id="ac-sp-add2">+ Add Supply</button></div>' : '') + '</div>') + '</div>';
  const root = $('ac-sp'), redraw = () => ctx.rerender();
  let st = null;
  $('ac-sp-q').addEventListener('input', (e) => { clearTimeout(st); st = setTimeout(() => { t.q = e.target.value; t.page = 1; redraw(); const s = $('ac-sp-q'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 300); });
  [['ac-sp-cat', 'category'], ['ac-sp-br', 'branch'], ['ac-sp-state', 'state']].forEach(([id, k]) => $(id).addEventListener('change', (e) => { t[k] = e.target.value; t.page = 1; redraw(); }));
  $('ac-sp-inactive').addEventListener('change', (e) => { t.inactive = e.target.checked; t.page = 1; redraw(); });
  wireSortControl('ac-sp-sort', 'ac-sp-dir', t.sort, () => { t.page = 1; redraw(); });
  ['ac-sp-add', 'ac-sp-add2'].forEach((id) => { if ($(id)) $(id).addEventListener('click', () => supplyActions.add(ctx)); });
  if ($('ac-sp-recv')) $('ac-sp-recv').addEventListener('click', () => supplyActions.receive(ctx));
  root.querySelectorAll('[data-sup]').forEach((el) => el.addEventListener('click', () => ctx.openSupply(Number(el.dataset.sup))));
  root.querySelectorAll('[data-issue]').forEach((el) => el.addEventListener('click', () => ctx.openIssueForm({ supply: Number(el.dataset.issue) })));
  root.querySelectorAll('[data-sact]').forEach((el) => el.addEventListener('click', () => { const m = el.closest('details'); if (m) m.open = false; const id = Number(el.dataset.id); if (el.dataset.sact === 'ledger') ctx.openSupply(id, { pane: 'ledger' }); else supplyActions[el.dataset.sact](ctx, id); }));
  root.querySelectorAll('[data-page]').forEach((el) => el.addEventListener('click', () => { t.page = Math.max(1, Math.min(pages, t.page + Number(el.dataset.page))); redraw(); }));
  if ($('ac-sp-pagesize')) $('ac-sp-pagesize').addEventListener('change', (e) => { t.pageSize = Number(e.target.value); t.page = 1; redraw(); });
  root.querySelectorAll('[data-exp]').forEach((el) => el.addEventListener('click', async () => { el.closest('details').open = false; try { await exportSupplies(ctx, rows, el.dataset.exp); } catch (err) { ctx.toast(err, true); } }));
}

// ================================================================ the supply card + its stock ledger
let ledger = { id: null, rows: [], loaded: false }, pane = 'stock';
export async function openSupplyCard(ctx, id, opts2 = {}) {
  const s = ctx.supplyById.get(id), c = ctx.caps;
  if (!s) { ctx.toast('That supply is no longer available.', true); return; }
  if (opts2.pane) pane = opts2.pane; else if (!opts2.keep) pane = 'stock';
  if (ledger.id !== id) ledger = { id, rows: [], loaded: false };
  const perBranch = Object.keys(s._per).map(Number).sort((a, b) => a - b).map((b) => '<tr><td data-label="Branch">' + branchChip(ctx, b) + '</td><td data-label="In stock"><b class="' + (s._per[b] === 0 ? 'lv-neg' : s._threshold && s._per[b] <= s._threshold ? 'lv-warn-text' : '') + '">' + qty(s._per[b]) + '</b> ' + esc(s.unit) + '</td><td data-label="Level">' + (s._per[b] === 0 ? stockBadge('out') : s._threshold && s._per[b] <= s._threshold ? stockBadge('low') : stockBadge('ok')) + '</td></tr>').join('');
  const stockPane = '<div class="drawer-section"><h4>Stock by branch</h4>' + (perBranch ? '<div class="table-scroll table-2col"><table class="lv-mini"><thead><tr><th>Branch</th><th>In stock</th><th>Level</th></tr></thead><tbody>' + perBranch + '</tbody></table></div><p><b>Total:</b> ' + qty(s._total) + ' ' + esc(s.unit) + '</p>' : '<p class="muted">No stock has been received yet.</p>') + '</div>' +
    '<div class="drawer-section"><h4>Details</h4>' + kv('Code', '<b>' + esc(s.supply_code) + '</b>') + kv('Category', esc(s._category || '—')) + kv('Unit', esc(s.unit)) + kv('Supplier', esc(s.supplier || '—')) + (s.description ? kv('Description', esc(s.description)) : '') + kv('Minimum stock', qty(s.minimum_stock)) + kv('Reorder level', qty(s.reorder_level)) +
    (c.viewCost ? kv('Unit cost', esc(money(s._cost)) + ' <span class="muted">· stock value ' + esc(money(s._value)) + '</span>') : '') + kv('Status', s.active ? 'Active' : 'Inactive') + '</div>';
  const ledgerPane = '<div class="drawer-section"><h4>Stock ledger</h4>' + (!ledger.loaded ? '<div class="muted">Loading…</div>' : ledger.rows.length ? '<div class="table-scroll table-2col"><table class="lv-mini"><thead><tr><th>When</th><th>What</th><th>Branch</th><th>Change</th><th>Before → after</th><th>Who / for</th></tr></thead><tbody>' + ledger.rows.map((x) =>
    '<tr><td data-label="When">' + esc(fmtDateTime(x.created_at)) + '</td><td data-label="What">' + esc(SUPPLY_TYPES[x.transaction_type] || x.transaction_type) + (x.reference_text ? '<div class="muted bl-sub">' + esc(x.reference_text) + '</div>' : '') + '</td><td data-label="Branch">' + esc(branchName(ctx, x.branch_id)) + '</td>' +
    '<td data-label="Change"><b class="' + (Number(x.quantity_change) < 0 ? 'lv-neg' : 'lv-pos') + '">' + (Number(x.quantity_change) > 0 ? '+' : '') + qty(x.quantity_change) + '</b></td><td data-label="Before → after">' + qty(x.balance_before) + ' → ' + qty(x.balance_after) + '</td>' +
    '<td data-label="Who / for" class="full-row">' + esc(ctx.names[x.performed_by] || '—') + (x.department || x.employee_id ? '<div class="muted bl-sub">for ' + esc([x.department, ctx.names[x.employee_id]].filter(Boolean).join(' · ')) + '</div>' : '') + (x.notes ? '<div class="muted bl-sub">' + esc(String(x.notes).slice(0, 120)) + '</div>' : '') + (x.override_reason ? '<div class="bl-sub"><b>Manager’s reason:</b> ' + esc(x.override_reason) + '</div>' : '') + '</td></tr>').join('') + '</tbody></table></div><p class="muted">Every stock change is one permanent row — nothing is edited and nothing is deleted. The newest 300 are shown.</p>' : '<p class="muted">No stock has moved yet.</p>') + '</div>';
  const body = '<div id="ac-detail-msg"></div><div class="bl-d-head"><div class="bl-d-badges">' + stockBadge(s._state) + '</div></div><div class="bl-sum ac-sum4"><div class="bl-sum-cell"><span class="muted">In stock (all branches)</span><b>' + qty(s._total) + ' ' + esc(s.unit) + '</b></div><div class="bl-sum-cell"><span class="muted">Category</span><b>' + esc(s._category || '—') + '</b></div>' +
    '<div class="bl-sum-cell"><span class="muted">Minimum</span><b>' + qty(s.minimum_stock) + '</b></div><div class="bl-sum-cell"><span class="muted">Reorder at</span><b>' + qty(s.reorder_level) + '</b></div></div>' +
    '<div class="ac-dtabs" role="tablist"><button type="button" class="ac-dtab' + (pane === 'stock' ? ' ac-dtab-on' : '') + '" data-act="pane" data-pane="stock">Stock &amp; details</button><button type="button" class="ac-dtab' + (pane === 'ledger' ? ' ac-dtab-on' : '') + '" data-act="pane" data-pane="ledger">Stock ledger</button></div>' +
    '<div id="ac-dpane">' + (pane === 'ledger' ? ledgerPane : stockPane) + '</div>';
  const foot = (c.sIssue && s.active ? '<button type="button" class="btn" data-act="issue">Issue</button>' : '') + (c.sManage && s.active ? '<button type="button" class="btn secondary" data-act="receive">Receive stock</button>' : '') + (c.sAdjust && s.active ? '<button type="button" class="btn secondary" data-act="adjust">Count / adjust</button>' : '') +
    (c.sTransfer && s.active ? '<button type="button" class="btn secondary" data-act="transfer">Move stock</button>' : '') + (c.sManage ? '<button type="button" class="btn secondary" data-act="edit">Edit</button>' : '') + '<button type="button" class="btn secondary" data-act="close">Close</button>';
  const keep = opts2.keep && isDrawerOpen('detail') ? drawerBody('detail').scrollTop : 0;
  openDrawer('detail', { title: s.name, sub: s.supply_code + ' · ' + (s.unit || ''), body, footer: foot });
  if (keep) drawerBody('detail').scrollTop = keep;
  ctx.detail = { kind: 'supply', id, reopen: () => { ledger = { id, rows: [], loaded: false }; return openSupplyCard(ctx, id, { keep: true }); } };
  const draw = () => { const p = $('ac-dpane'); if (p) p.innerHTML = pane === 'ledger' ? ledgerPane : stockPane; };
  const loadLedger = () => { if (ledger.loaded) return; ctx.api.listSupplyLedger({ supplyId: id, limit: 300 }).then(async (rows) => { await ctx.ensureNames(rows.map((r) => r.performed_by).concat(rows.map((r) => r.employee_id))); ledger = { id, rows, loaded: true }; if (ctx.detail && ctx.detail.id === id) openSupplyCard(ctx, id, { keep: true }); }).catch((err) => { ledger = { id, rows: [], loaded: true }; ctx.toast(err, true); }); };
  if (pane === 'ledger') loadLedger();
  setDetailHandlers({ close: () => ctx.closeDetail(), pane: (el) => { pane = el.dataset.pane; document.querySelectorAll('.ac-dtab').forEach((b) => b.classList.toggle('ac-dtab-on', b.dataset.pane === pane)); if (pane === 'ledger' && !ledger.loaded) loadLedger(); draw(); },
    issue: () => ctx.openIssueForm({ supply: id }), receive: () => supplyActions.receive(ctx, id), adjust: () => supplyActions.adjust(ctx, id), transfer: () => supplyActions.transfer(ctx, id), edit: () => supplyActions.edit(ctx, id) }, ctx.toast);
}

// ================================================================ actions
const done = async (ctx, msg) => { closeDrawer('side'); await ctx.afterChange(msg); };
export const supplyActions = {
  /** add a supply to the catalogue (optionally with the stock already on the shelf) */
  add: (ctx) => openSupplyForm(ctx, null),
  edit: (ctx, id) => openSupplyForm(ctx, id),

  receive(ctx, supplyId) {
    const brs = myBranches(ctx), key = newKey();
    panel('Receive Stock', 'Stock arriving from a supplier', '<p class="muted">Receiving adds to the branch’s stock and writes one ledger row per supply. Pressing the button twice never adds twice.</p>' +
      '<div class="bl-formgrid">' + field('Branch *', '<select id="ac-rc-br">' + branchOptions({ ...ctx, branches: brs }, ctx.employee.branch_id || (brs[0] || {}).id, brs.length > 1 ? 'Choose…' : undefined) + '</select>') + field('Date received', '<input type="date" id="ac-rc-on" value="' + esc(ctx.today) + '" max="' + esc(ctx.today) + '">') +
      field('Supplier', '<input type="text" id="ac-rc-sup" maxlength="100">') + field('Invoice no.', '<input type="text" id="ac-rc-inv" maxlength="60">') + field('PO no.', '<input type="text" id="ac-rc-po" maxlength="60">') + '</div><h4 class="rf-sub">Items received</h4><div id="ac-rc-lines"></div>' +
      '<p><button type="button" class="btn small secondary" id="ac-rc-add">+ Add another supply</button></p>' + field('Notes', '<input type="text" id="ac-rc-notes" maxlength="200">'), '<button type="button" class="btn" id="ac-rc-ok">Receive</button><button type="button" class="btn secondary" id="ac-rc-x">Close</button>');
    const addLine = (sel) => { const d = document.createElement('div'); d.className = 'ac-line'; d.innerHTML = '<select data-k="s">' + supplyOptions(ctx, sel) + '</select><input type="number" data-k="q" min="0.01" step="0.01" inputmode="decimal" placeholder="Quantity"><button type="button" class="btn small secondary" data-k="x" aria-label="Remove this line">✕</button>'; d.querySelector('[data-k="x"]').addEventListener('click', () => { if ($('ac-rc-lines').children.length > 1) d.remove(); }); $('ac-rc-lines').appendChild(d); };
    addLine(supplyId || ''); $('ac-rc-add').addEventListener('click', () => addLine(''));
    $('ac-rc-x').addEventListener('click', () => closeDrawer('side'));
    $('ac-rc-ok').addEventListener('click', async () => {
      errBox(''); const items = [...$('ac-rc-lines').children].map((d) => ({ supply_id: Number(d.querySelector('[data-k="s"]').value), quantity: d.querySelector('[data-k="q"]').value })).filter((x) => x.supply_id || x.quantity);
      if (!val('ac-rc-br')) { flagInvalid($('ac-rc-br')); return errBox('Choose the branch that received the stock.'); }
      if (!items.length || items.some((x) => !x.supply_id || !(Number(x.quantity) > 0))) return errBox('Choose a supply and a quantity on every line.');
      $('ac-rc-ok').disabled = true;
      try {
        const res = await ctx.api.receiveSupplies({ branch_id: Number(val('ac-rc-br')), received_on: val('ac-rc-on') || null, supplier: val('ac-rc-sup').trim() || null, invoice_number: val('ac-rc-inv').trim() || null, po_number: val('ac-rc-po').trim() || null, notes: val('ac-rc-notes').trim() || null, client_key: key, items });
        if (res && res.ok === false) { errBox(esc(errorsText(res))); $('ac-rc-ok').disabled = false; return; }
        await done(ctx, res.replay ? res.message : (res.receipt_number + ' received — stock updated.'));
      } catch (err) { errBox(esc(friendly(err))); $('ac-rc-ok').disabled = false; }
    });
  },

  adjust(ctx, supplyId) {
    const brs = myBranches(ctx), key = newKey();
    panel('Count / Adjust Stock', 'Corrections are recorded with a reason', '<div class="bl-formgrid">' + field('Supply *', '<select id="ac-aj-s">' + supplyOptions(ctx, supplyId) + '</select>') + field('Branch *', '<select id="ac-aj-br">' + branchOptions({ ...ctx, branches: brs }, ctx.employee.branch_id || (brs[0] || {}).id, brs.length > 1 ? 'Choose…' : undefined) + '</select>') +
      field('What are you recording? *', '<select id="ac-aj-kind">' + opts([{ value: 'count', label: 'A physical count (set the stock to…)' }, { value: 'increase', label: 'Add stock (found / corrected up)' }, { value: 'decrease', label: 'Remove stock (corrected down)' }, { value: 'damage', label: 'Damaged / spoiled / expired' }, { value: 'return', label: 'Returned to stock by an employee' }], 'count') + '</select>') +
      field('<span id="ac-aj-qlabel">Counted quantity *</span>', '<input type="number" id="ac-aj-q" min="0" step="0.01" inputmode="decimal">') + '</div><div id="ac-aj-prev" class="lv-preview"></div>' +
      '<div class="bl-formgrid" id="ac-aj-ret" hidden>' + field('Returned by', '<select id="ac-aj-emp">' + personOptions(ctx, { any: '—', includeLeft: false }) + '</select>') + field('Department', '<input type="text" id="ac-aj-dept" maxlength="80">') + '</div>' + field('Reason *', '<textarea id="ac-aj-reason" rows="2" maxlength="300" placeholder="What happened?"></textarea>'),
      '<button type="button" class="btn" id="ac-aj-ok">Save</button><button type="button" class="btn secondary" id="ac-aj-x">Close</button>');
    const sync = () => {
      const k = val('ac-aj-kind'), sid = Number(val('ac-aj-s')), br = Number(val('ac-aj-br')), cur = sid && br ? stockOf(ctx, sid, br) : null, q = Number(val('ac-aj-q'));
      $('ac-aj-qlabel').textContent = k === 'count' ? 'Counted quantity *' : 'Quantity *'; $('ac-aj-ret').hidden = k !== 'return';
      const after = cur === null || val('ac-aj-q') === '' ? null : k === 'count' ? q : (k === 'increase' || k === 'return') ? cur + q : cur - q;
      $('ac-aj-prev').innerHTML = cur === null ? 'Choose a supply and a branch.' : 'In stock now: <b>' + qty(cur) + '</b>' + (after !== null ? ' → after this: <b class="' + (after < 0 ? 'lv-neg' : '') + '">' + qty(after) + '</b>' + (after < 0 ? ' — that would go below zero' : '') : '');
    };
    ['ac-aj-s', 'ac-aj-br', 'ac-aj-kind', 'ac-aj-q'].forEach((i) => $(i).addEventListener('input', sync)); sync();
    $('ac-aj-x').addEventListener('click', () => closeDrawer('side'));
    $('ac-aj-ok').addEventListener('click', async () => {
      errBox(''); const k = val('ac-aj-kind');
      if (!val('ac-aj-s')) { flagInvalid($('ac-aj-s')); return errBox('Choose the supply.'); }
      if (!val('ac-aj-br')) { flagInvalid($('ac-aj-br')); return errBox('Choose the branch.'); }
      if (val('ac-aj-q') === '' || Number(val('ac-aj-q')) < 0 || (k !== 'count' && !(Number(val('ac-aj-q')) > 0))) { flagInvalid($('ac-aj-q')); return errBox(k === 'count' ? 'Enter the counted quantity (zero or more).' : 'Enter a quantity of more than zero.'); }
      if (val('ac-aj-reason').trim().length < 3) { flagInvalid($('ac-aj-reason')); return errBox('A reason is required.'); }
      $('ac-aj-ok').disabled = true;
      try {
        const p = { kind: k, supply_id: Number(val('ac-aj-s')), branch_id: Number(val('ac-aj-br')), reason: val('ac-aj-reason').trim(), client_key: key };
        if (k === 'count') p.new_quantity = val('ac-aj-q'); else p.quantity = val('ac-aj-q');
        if (k === 'return') { p.employee_id = val('ac-aj-emp') || null; p.department = val('ac-aj-dept').trim() || null; }
        const res = await ctx.api.adjustSupply(p);
        if (res && res.ok === false) { errBox(esc(errorsText(res))); $('ac-aj-ok').disabled = false; return; }
        await done(ctx, res.replay ? res.message : 'Stock updated' + (res.balance_after !== undefined ? ' — now ' + qty(res.balance_after) : '') + (res.low ? ' (low)' : '') + '.');
      } catch (err) { errBox(esc(friendly(err))); $('ac-aj-ok').disabled = false; }
    });
  },

  transfer(ctx, supplyId) {
    const brs = myBranches(ctx), key = newKey();
    panel('Move Stock Between Branches', 'Out of one branch, into another — both are recorded', '<div class="bl-formgrid">' + field('Supply *', '<select id="ac-tf-s">' + supplyOptions(ctx, supplyId) + '</select>') + field('From *', '<select id="ac-tf-from">' + branchOptions({ ...ctx, branches: brs }, ctx.employee.branch_id || (brs[0] || {}).id, brs.length > 1 ? 'Choose…' : undefined) + '</select>') +
      field('To *', '<select id="ac-tf-to">' + branchOptions(ctx, '', 'Choose…') + '</select>') + field('Quantity *', '<input type="number" id="ac-tf-q" min="0.01" step="0.01" inputmode="decimal">') + '</div><div id="ac-tf-prev" class="lv-preview"></div>' + field('Why? *', '<textarea id="ac-tf-reason" rows="2" maxlength="300"></textarea>'),
      '<button type="button" class="btn" id="ac-tf-ok">Move</button><button type="button" class="btn secondary" id="ac-tf-x">Close</button>');
    const sync = () => { const sid = Number(val('ac-tf-s')), f = Number(val('ac-tf-from')), t2 = Number(val('ac-tf-to')), q = Number(val('ac-tf-q')); $('ac-tf-prev').innerHTML = sid && f ? esc(branchName(ctx, f)) + ' has <b>' + qty(stockOf(ctx, sid, f)) + '</b>' + (q > 0 ? ' → <b class="' + (q > stockOf(ctx, sid, f) ? 'lv-neg' : '') + '">' + qty(stockOf(ctx, sid, f) - q) + '</b>' : '') + (t2 ? ' · ' + esc(branchName(ctx, t2)) + ' has ' + qty(stockOf(ctx, sid, t2)) + (q > 0 ? ' → <b>' + qty(stockOf(ctx, sid, t2) + q) + '</b>' : '') : '') : 'Choose a supply and the branches.'; };
    ['ac-tf-s', 'ac-tf-from', 'ac-tf-to', 'ac-tf-q'].forEach((i) => $(i).addEventListener('input', sync)); sync();
    $('ac-tf-x').addEventListener('click', () => closeDrawer('side'));
    $('ac-tf-ok').addEventListener('click', async () => {
      errBox('');
      if (!val('ac-tf-s') || !val('ac-tf-from') || !val('ac-tf-to')) return errBox('Choose the supply and both branches.');
      if (val('ac-tf-from') === val('ac-tf-to')) { flagInvalid($('ac-tf-to')); return errBox('Choose two different branches.'); }
      if (!(Number(val('ac-tf-q')) > 0)) { flagInvalid($('ac-tf-q')); return errBox('Enter a quantity of more than zero.'); }
      if (val('ac-tf-reason').trim().length < 3) { flagInvalid($('ac-tf-reason')); return errBox('Say why the stock is being moved.'); }
      $('ac-tf-ok').disabled = true;
      try {
        const res = await ctx.api.transferSupply({ supply_id: Number(val('ac-tf-s')), from_branch_id: Number(val('ac-tf-from')), to_branch_id: Number(val('ac-tf-to')), quantity: val('ac-tf-q'), reason: val('ac-tf-reason').trim(), client_key: key });
        if (res && res.ok === false) { errBox(esc(errorsText(res))); $('ac-tf-ok').disabled = false; return; }
        await done(ctx, res.replay ? res.message : res.transfer_number + ' — stock moved.');
      } catch (err) { errBox(esc(friendly(err))); $('ac-tf-ok').disabled = false; }
    });
  },
};

// ================================================================ add / edit a supply
function openSupplyForm(ctx, id) {
  const s = id ? ctx.supplyById.get(id) : null, c = ctx.caps, cur = s || {}, edit = !!s;
  const brs = myBranches(ctx);
  const body = '<div id="ac-form-msg"></div><div id="ac-form-errors"></div><form id="ac-sf" novalidate><div class="bl-formgrid">' + field('Name *', '<input type="text" name="name" maxlength="120" required value="' + esc(cur.name || '') + '" placeholder="e.g. Printer ink, black">') +
    field('Category', '<select name="category_id">' + categoryOptions(ctx, 'Supply', cur.category_id || '', 'Choose…') + '</select>') + field('Unit', '<input type="text" name="unit" maxlength="20" value="' + esc(cur.unit || 'pcs') + '" placeholder="pcs, box, ream, bottle">') + field('Usual supplier', '<input type="text" name="supplier" maxlength="100" value="' + esc(cur.supplier || '') + '">') +
    field('Minimum stock', '<input type="number" name="minimum_stock" min="0" step="0.01" value="' + esc(cur.minimum_stock ?? 0) + '"><span class="muted">At or below this, it is “low”.</span>') + field('Reorder level', '<input type="number" name="reorder_level" min="0" step="0.01" value="' + esc(cur.reorder_level ?? 0) + '"><span class="muted">The point at which to buy more.</span>') +
    (c.viewCost ? field('Unit cost (₱)', '<input type="number" name="unit_cost" min="0" step="0.01" value="' + esc(cur._cost ?? '') + '">') : '') + '</div>' + field('Description', '<textarea name="description" rows="2" maxlength="300">' + esc(cur.description || '') + '</textarea>') +
    (edit ? '<label class="lv-check"><input type="checkbox" name="active"' + (cur.active ? ' checked' : '') + '> Active <span class="muted">(an inactive supply cannot be issued or received; it must have no stock left)</span></label>' :
      '<h4 class="rf-sub">Stock already on the shelf <span class="muted">· optional</span></h4><div class="bl-formgrid">' + brs.map((b) => field(esc(b.name), '<input type="number" data-open="' + b.id + '" min="0" step="0.01" inputmode="decimal" placeholder="0">')).join('') + '</div><p class="muted">Counted stock is recorded as “Opening stock” in the ledger.</p>') + '</form>';
  openDrawer('form', { title: edit ? 'Edit ' + cur.name : 'Add Supply', sub: edit ? cur.supply_code : 'A supply is a consumable counted in quantity — a laptop or a phone is an asset, not a supply.', body, footer: '<button type="button" class="btn" id="ac-sf-save">' + (edit ? 'Save Changes' : 'Add Supply') + '</button><button type="button" class="btn secondary" id="ac-sf-x">Cancel</button>' });
  const form = $('ac-sf'), errB = (h) => { $('ac-form-errors').innerHTML = h ? '<div class="msg error">' + h + '</div>' : ''; };
  $('ac-sf-x').addEventListener('click', () => closeDrawer('form'));
  const f = (n) => (form.elements[n] ? form.elements[n].value.trim() : '');
  async function save(confirmDup) {
    errB(''); if (!f('name')) { flagInvalid(form.elements.name); return errB('Enter the supply name.'); }
    const p = { name: f('name'), category_id: f('category_id') || null, unit: f('unit') || 'pcs', supplier: f('supplier'), description: f('description'), minimum_stock: f('minimum_stock') || '0', reorder_level: f('reorder_level') || '0' };
    if (c.viewCost && f('unit_cost') !== '') p.unit_cost = f('unit_cost');
    if (edit) p.active = form.elements.active.checked; else { const open = [...form.querySelectorAll('[data-open]')].filter((i) => i.value !== '').map((i) => ({ branch_id: Number(i.dataset.open), quantity: i.value })); if (open.length) p.opening = open; }
    if (confirmDup) p.confirm_duplicate = 'true';
    $('ac-sf-save').disabled = true;
    try {
      const res = await ctx.api.saveSupply(edit ? cur.id : null, p);
      if (res && res.ok === false) {
        if (res.duplicate) { actionPanel('form', { title: 'Looks like a duplicate', message: esc(errorsText(res)), okLabel: 'This is a different item — add it', onOk: async () => { await save(true); } }); $('ac-sf-save').disabled = false; return; }
        errB(esc(errorsText(res))); $('ac-sf-save').disabled = false; return;
      }
      closeDrawer('form'); await ctx.afterChange(edit ? 'Supply updated.' : cur.name === undefined ? p.name + ' added (' + res.supply_code + ').' : '');
    } catch (err) { errB(esc(friendly(err))); $('ac-sf-save').disabled = false; }
  }
  $('ac-sf-save').addEventListener('click', () => save(false));
  form.addEventListener('submit', (e) => { e.preventDefault(); save(false); });
}
