// Transfers -- the SKU Trace tab: pick a SKU from the SKU Catalog (read-only here; the catalog stays the master) and see where it is
// right now by branch, what is promised or on the way, every transfer it has been on, and its whole stock-ledger history (sales,
// adjustments, transfers ...). Links go to the SKU Catalog and Item Monitoring -- this screen never copies either of them.
import { esc, qty, fmtDate, plural, friendly, tagBadge, statusBadge, routeText, emptyBox } from './transfersUi.js?v=20261011a';
import { stockOf, sum } from './transfersLogic.js?v=20261011a';
import { exportRows } from './transfersExport.js?v=20261011a';

const $ = (id) => document.getElementById(id);
export const newSkuState = () => ({ sku: '', product: null, ledger: [], loaded: false, q: '', results: [], msg: '' });

const TRANSFER_STATES = ['Requested', 'Approved', 'Preparing', 'In Transit', 'Partially Received'];
const dtm = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const LEDGER_COLUMNS = [{ key: 'when', label: 'When' }, { key: 'type', label: 'Entry Type' }, { key: 'branch', label: 'Branch' }, { key: 'change', label: 'Quantity Change', type: 'number' }, { key: 'before', label: 'Stock Before', type: 'number' },
  { key: 'after', label: 'Stock After', type: 'number' }, { key: 'transfer', label: 'Transfer' }, { key: 'reference', label: 'Reference' }, { key: 'by', label: 'Recorded By' }, { key: 'reason', label: 'Reason' }];
const TRANSFER_COLUMNS = [{ key: 'transfer', label: 'Transfer ID' }, { key: 'from', label: 'Source' }, { key: 'to', label: 'Destination' }, { key: 'status', label: 'Status' }, { key: 'requested_date', label: 'Requested', type: 'date' },
  { key: 'requested', label: 'Requested Qty', type: 'number' }, { key: 'approved', label: 'Approved Qty', type: 'number' }, { key: 'released', label: 'Released Qty', type: 'number' }, { key: 'received', label: 'Received Qty', type: 'number' }, { key: 'damaged', label: 'Damaged', type: 'number' }, { key: 'missing', label: 'Missing', type: 'number' }];

/** Where this SKU sits on transfers the signed-in person can see. */
function transferLines(ctx, sku) {
  return ctx.transfers.filter((t) => t.status !== 'Draft').flatMap((t) => t._items.filter((i) => i.sku === sku).map((i) => ({ t, i })))
    .sort((a, b) => String(b.t.requested_at || b.t.created_at).localeCompare(String(a.t.requested_at || a.t.created_at)));
}

export async function selectSku(ctx, sku) {
  const S = ctx.ui.sku;
  S.sku = sku; S.loaded = false; S.product = null; S.ledger = []; S.msg = '';
  await ctx.rerender();
  try {
    const [product, ledger] = await Promise.all([ctx.api.getProduct(sku), ctx.api.listSkuLedger(sku, 300)]);
    if (S.sku !== sku) return;
    S.product = product; S.ledger = ledger; S.loaded = true;
    if (!product) S.msg = 'No SKU “' + sku + '” was found in the SKU Catalog.';
  } catch (err) { if (S.sku === sku) S.msg = friendly(err); }
  if (S.sku === sku) ctx.rerender();
}

export function renderSku(ctx, panel) {
  const S = ctx.ui.sku;
  panel.innerHTML = '<div id="tf-sku"><div class="card bl-panel"><h3 class="bl-h">Trace a SKU</h3><div class="field tf-search"><input type="search" id="tf-sku-q" autocomplete="off" placeholder="Search the SKU Catalog by SKU or item name…" value="' + esc(S.q) + '" aria-label="Search SKU">' +
    '<div id="tf-sku-results" class="tf-results" hidden></div></div><p class="muted">Shows where one SKU is, what is moving, and every stock entry it has ever had. Nothing here changes stock.</p></div><div id="tf-sku-body"></div></div>';
  const box = $('tf-sku-q'), res = $('tf-sku-results');
  let timer = null, seq = 0, found = [];
  const show = (rows, msg) => {
    found = rows; res.hidden = false;
    res.innerHTML = msg ? '<div class="muted tf-result-msg">' + esc(msg) + '</div>' : rows.map((p, i) => '<button type="button" class="tf-result" data-i="' + i + '"><div><b>' + esc(p.sku) + '</b> ' + esc(p.item_name) + '<div class="muted bl-sub">' + esc(p.category || '') + '</div></div>' +
      '<div class="tf-chips"><span class="tf-chip tf-chip-total">All branches <b>' + qty(ctx.branches.reduce((s, b) => s + stockOf(ctx, p.sku, b.id), 0)) + '</b></span></div></button>').join('');
    res.querySelectorAll('.tf-result').forEach((b) => b.addEventListener('click', () => { const p = found[Number(b.dataset.i)]; res.hidden = true; S.q = p.sku; box.value = p.sku; selectSku(ctx, p.sku); }));
  };
  box.addEventListener('input', () => {
    clearTimeout(timer);
    const text = box.value.trim(); S.q = box.value;
    if (text.length < 2) { res.hidden = true; return; }
    timer = setTimeout(async () => {
      const my = ++seq;
      try { const rows = await ctx.api.searchProducts(text); if (my === seq) show(rows, rows.length ? '' : 'No SKU matches “' + text + '”.'); } catch (err) { if (my === seq) show([], friendly(err)); }
    }, 250);
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (found.length === 1 && !res.hidden) { res.hidden = true; S.q = found[0].sku; selectSku(ctx, found[0].sku); } else if (box.value.trim()) { res.hidden = true; selectSku(ctx, box.value.trim()); }
    } else if (e.key === 'Escape') res.hidden = true;
  });

  const body = $('tf-sku-body');
  if (!S.sku) { body.innerHTML = emptyBox('Search for a SKU above to see its stock by branch, its transfers and its movement history.'); return; }
  if (!S.loaded && !S.msg) { body.innerHTML = '<p class="muted">Loading ' + esc(S.sku) + '…</p>'; return; }
  if (S.msg) { body.innerHTML = '<div class="msg error">' + esc(S.msg) + '</div>'; return; }
  const p = S.product, lines = transferLines(ctx, S.sku);
  const live = lines.filter((x) => TRANSFER_STATES.includes(x.t.status));
  const promised = (b) => sum(live.filter((x) => x.t.from_branch_id === b && ['Approved', 'Preparing'].includes(x.t.status)), (x) => x.i.appr ?? x.i.req);
  const incoming = (b) => sum(live.filter((x) => x.t.to_branch_id === b && ['In Transit', 'Partially Received'].includes(x.t.status)), (x) => x.i.outstanding);
  const total = ctx.branches.reduce((s, b) => s + stockOf(ctx, S.sku, b.id), 0);
  const moved = lines.filter((x) => !['Cancelled', 'Rejected'].includes(x.t.status));
  const sums = { n: moved.length, req: sum(moved, (x) => x.i.req), sent: sum(moved, (x) => x.i.sent || 0), rec: sum(moved, (x) => x.i.rec), dam: sum(moved, (x) => x.i.dam), mis: sum(moved, (x) => x.i.mis) };
  const byBranch = ctx.branches.map((b) => ({ b, out: sum(moved.filter((x) => x.t.from_branch_id === b.id), (x) => x.i.sent || 0), inn: sum(moved.filter((x) => x.t.to_branch_id === b.id), (x) => x.i.rec),
    n: moved.filter((x) => x.t.from_branch_id === b.id || x.t.to_branch_id === b.id).length })).filter((x) => x.out || x.inn);
  const q = encodeURIComponent(S.sku);
  const ledgerRows = S.ledger.map((x) => { const t = x.transfer_id ? ctx.byId.get(x.transfer_id) : null;
    return { when: dtm(x.occurred_at), type: x.transaction_type, branch: (ctx.branchById[x.branch_id] || {}).name || x.branch_id, change: x.qty_change, before: x.qty_before, after: x.qty_after, transfer: t ? t.transfer_number : '', reference: x.reference_number || '', by: ctx.names[x.employee_id] || '', reason: x.reason || '', _t: t }; });
  const transferRows = lines.map((x) => ({ transfer: x.t.transfer_number, from: x.t._from, to: x.t._to, status: x.t.status, requested_date: x.t._requestedOn, requested: x.i.req, approved: x.i.appr, released: x.i.sent, received: x.i.rec, damaged: x.i.dam, missing: x.i.mis }));
  body.innerHTML =
    '<div class="card bl-panel"><div class="tf-skuhead"><div><h3 class="bl-h">' + esc(S.sku) + ' <span class="muted">· ' + esc(p.item_name) + '</span></h3><div class="muted">' + esc(p.category || '') + (p.product_status ? ' · ' + esc(p.product_status) : '') + (p.reorder_level !== null && p.reorder_level !== undefined ? ' · reorder level ' + qty(p.reorder_level) : '') + (p.gross_weight_g ? ' · ' + esc(String(p.gross_weight_g)) + ' g' : '') + '</div></div>' +
      '<div class="bl-btnrow"><a class="btn small secondary" href="products.html?q=' + q + '">Open in SKU Catalog</a><a class="btn small secondary" href="item-monitoring.html?q=' + q + '">Open in Item Monitoring</a></div></div>' +
      '<div class="bl-sum tf-sum5"><div class="bl-sum-cell"><span class="muted">In stock, all branches</span><b>' + qty(total) + '</b></div><div class="bl-sum-cell"><span class="muted">Transfers (not cancelled)</span><b>' + sums.n + '</b></div><div class="bl-sum-cell"><span class="muted">Pieces released</span><b>' + qty(sums.sent) + '</b></div>' +
      '<div class="bl-sum-cell"><span class="muted">Pieces received</span><b class="lv-pos">' + qty(sums.rec) + '</b></div><div class="bl-sum-cell"><span class="muted">Damaged / missing</span><b class="' + (sums.dam + sums.mis ? 'lv-neg' : '') + '">' + qty(sums.dam) + ' / ' + qty(sums.mis) + '</b></div></div></div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Stock by branch</h3><div class="table-scroll table-2col"><table class="lv-mini"><thead><tr><th>Branch</th><th>In stock now</th><th>Promised to send</th><th>On the way to it</th></tr></thead><tbody>' +
      ctx.branches.map((b) => '<tr><td data-label="Branch"><b>' + esc(b.name) + '</b></td><td data-label="In stock now"><b>' + qty(stockOf(ctx, S.sku, b.id)) + '</b></td><td data-label="Promised to send">' + (promised(b.id) ? qty(promised(b.id)) : '—') + '</td><td data-label="On the way to it">' + (incoming(b.id) ? qty(incoming(b.id)) : '—') + '</td></tr>').join('') + '</tbody></table></div>' +
      '<p class="muted">“Promised to send” is approved or being prepared but not yet released. It is not reserved and not deducted.</p></div>' +
    (byBranch.length ? '<div class="card bl-panel"><h3 class="bl-h">Where it moved <span class="muted">· transfers that were not cancelled or rejected</span></h3><div class="table-scroll table-2col"><table class="lv-mini"><thead><tr><th>Branch</th><th>Sent out</th><th>Received in</th><th>Transfers</th></tr></thead><tbody>' +
      byBranch.map((x) => '<tr><td data-label="Branch"><b>' + esc(x.b.name) + '</b></td><td data-label="Sent out">' + (x.out ? qty(x.out) : '—') + '</td><td data-label="Received in">' + (x.inn ? '<b class="lv-pos">' + qty(x.inn) + '</b>' : '—') + '</td><td data-label="Transfers">' + x.n + '</td></tr>').join('') + '</tbody></table></div>' +
      '<p class="muted">Sent from: <b>' + esc(byBranch.filter((x) => x.out).map((x) => x.b.name).join(', ') || '—') + '</b> · Received at: <b>' + esc(byBranch.filter((x) => x.inn).map((x) => x.b.name).join(', ') || '—') + '</b></p></div>' : '') +
    '<div class="card bl-panel"><div class="tf-skuhead"><h3 class="bl-h">Transfers with this SKU <span class="muted">· ' + plural(lines.length, 'transfer') + '</span></h3>' + exportMenu('tr') + '</div>' +
      (lines.length ? '<div class="table-scroll table-2col"><table class="lv-mini"><thead><tr><th>Transfer</th><th>Route</th><th>Status</th><th>Requested</th><th>Approved</th><th>Released</th><th>Received</th><th>Damaged</th><th>Missing</th></tr></thead><tbody>' +
        lines.map((x) => '<tr><td data-label="Transfer"><button type="button" class="bl-link" data-act="view" data-id="' + x.t.id + '">' + esc(x.t.transfer_number) + '</button><div class="muted bl-sub">' + esc(fmtDate(x.t._requestedOn)) + '</div></td><td data-label="Route" class="tf-routecell">' + routeText(ctx, x.t) + '</td><td data-label="Status">' + statusBadge(x.t.status) + '</td>' +
          '<td data-label="Requested">' + qty(x.i.req) + '</td><td data-label="Approved">' + (x.i.appr === null ? '—' : qty(x.i.appr)) + '</td><td data-label="Released">' + (x.i.sent === null ? '—' : qty(x.i.sent)) + '</td><td data-label="Received">' + (x.i.sent === null ? '—' : qty(x.i.rec)) + '</td><td data-label="Damaged">' + (x.i.dam ? '<b class="lv-neg">' + qty(x.i.dam) + '</b>' : '—') + '</td><td data-label="Missing">' + (x.i.mis ? '<b class="lv-neg">' + qty(x.i.mis) + '</b>' : '—') + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="muted">This SKU is not on any transfer you can see.</p>') + '</div>' +
    '<div class="card bl-panel"><div class="tf-skuhead"><h3 class="bl-h">Stock movement history <span class="muted">· newest first, latest ' + S.ledger.length + ' entries</span></h3>' + exportMenu('lg') + '</div>' +
      (ledgerRows.length ? '<div class="table-scroll table-2col"><table class="lv-mini"><thead><tr><th>When</th><th>Entry</th><th>Branch</th><th>Change</th><th>Before → after</th><th>Transfer / reference</th><th>By</th></tr></thead><tbody>' + ledgerRows.map((r) =>
        '<tr><td data-label="When">' + esc(r.when) + '</td><td data-label="Entry">' + (r.type.startsWith('Branch Transfer') ? tagBadge(r.type, 'bl-tag-blue') : esc(r.type)) + '</td><td data-label="Branch">' + esc(r.branch) + '</td><td data-label="Change"><b class="' + (r.change < 0 ? 'lv-neg' : 'lv-pos') + '">' + (r.change > 0 ? '+' : '') + qty(r.change) + '</b></td>' +
        '<td data-label="Before → after">' + qty(r.before) + ' → ' + qty(r.after) + '</td><td data-label="Transfer / reference">' + (r._t ? '<button type="button" class="bl-link" data-act="view" data-id="' + r._t.id + '">' + esc(r.transfer) + '</button>' : esc(r.reference || '—')) + '</td><td data-label="By">' + esc(r.by || '—') + (r.reason ? '<div class="muted bl-sub">' + esc(r.reason) + '</div>' : '') + '</td></tr>').join('') + '</tbody></table></div>' +
        (S.ledger.length >= 300 ? '<p class="muted">Showing the latest 300 entries. Item Monitoring and the SKU Catalog hold the full picture.</p>' : '') : '<p class="muted">No stock movement has been recorded for this SKU.</p>') + '</div>';

  body.querySelectorAll('[data-act="view"]').forEach((el) => el.addEventListener('click', () => ctx.openDetail(el.dataset.id)));
  body.querySelectorAll('[data-exp]').forEach((el) => el.addEventListener('click', async () => {
    el.closest('details').open = false;
    const which = el.dataset.exp.split(':'), isTr = which[0] === 'tr';
    try {
      await exportRows(isTr ? 'Transfers of ' + S.sku : 'Stock movement of ' + S.sku, (isTr ? 'transfers-sku-' : 'stock-movement-sku-') + S.sku.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + ctx.today, isTr ? TRANSFER_COLUMNS : LEDGER_COLUMNS,
        (isTr ? transferRows : ledgerRows.map(({ _t, ...r }) => r)), which[1], [S.sku + ' · ' + p.item_name]);
    } catch (err) { ctx.toast(err, true); }
  }));
}
const exportMenu = (id) => '<details class="bl-menu bl-exportmenu"><summary class="btn small secondary">Export ▾</summary><div class="bl-menu-pop">' + ['csv', 'xlsx', 'pdf'].map((f) => '<button type="button" data-exp="' + id + ':' + f + '">' + (f === 'xlsx' ? 'Excel (.xlsx)' : f.toUpperCase()) + '</button>').join('') + '</div></details>';
