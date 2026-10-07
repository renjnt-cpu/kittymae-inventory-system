// Transfers -- the Branches tab (what each branch holds, has promised to send, and is waiting to receive; what each branch has
// received; who sends to whom) and the Discrepancies tab (every missing / damaged / wrong item, open or resolved).
// Stock numbers are READ from the real inventory through the database; nothing is stored in Transfers.
import { esc, qty, fmtDate, plural, tagBadge, routeText, branchBadge, emptyBox } from './transfersUi.js?v=20261008b';
import { receivedByBranch, matchesScope, inPeriod, sum, DISC_TYPES } from './transfersLogic.js?v=20261008b';
import { filterBarHtml, bindFilterBar, scopedPeriod, periodLabel, scopeLabel } from './transfersFilters.js?v=20261008b';
import { DISC_COLUMNS, discRow, exportRows } from './transfersExport.js?v=20261008b';
import { manilaDate } from './leaveUi.js?v=20261008b';
import { bindActions } from './transfersActions.js?v=20261008b';

const $ = (id) => document.getElementById(id);

// ================================================================ branches
function matrixHtml(ctx, period) {
  const sent = period.filter((t) => t._sentPcs > 0);
  const cell = (a, b) => sum(sent.filter((t) => t.from_branch_id === a && t.to_branch_id === b), (t) => t._sentPcs);
  const branches = ctx.branches.filter((b) => sent.some((t) => t.from_branch_id === b.id || t.to_branch_id === b.id));
  if (!branches.length) return '<p class="muted">No stock has been released in this period.</p>';
  return '<div class="table-scroll"><table class="lv-mini tf-matrix"><thead><tr><th>From ↓ / To →</th>' + branches.map((b) => '<th>' + esc(b.name) + '</th>').join('') + '<th>Total sent</th></tr></thead><tbody>' +
    branches.map((a) => '<tr><th scope="row">' + esc(a.name) + '</th>' + branches.map((b) => { const v = a.id === b.id ? null : cell(a.id, b.id); return '<td>' + (v ? '<b>' + qty(v) + '</b>' : '<span class="muted">' + (a.id === b.id ? '·' : '—') + '</span>') + '</td>'; }).join('') + '<td><b>' + qty(sum(sent.filter((t) => t.from_branch_id === a.id), (t) => t._sentPcs)) + '</b></td></tr>').join('') +
    '<tr><th scope="row">Total received</th>' + branches.map((b) => '<td><b>' + qty(sum(sent.filter((t) => t.to_branch_id === b.id), (t) => t._sentPcs)) + '</b></td>').join('') + '<td></td></tr></tbody></table></div>';
}

export async function renderBranches(ctx, panel) {
  const period = scopedPeriod(ctx);
  const rbb = receivedByBranch(period, ctx.branches);
  panel.innerHTML = '<div id="tf-br">' + filterBarHtml(ctx) +
    '<div class="card bl-panel"><h3 class="bl-h">Branch stock right now</h3><div id="tf-br-cards"><p class="muted">Loading…</p></div>' +
    '<p class="muted">Read live from the inventory. “Promised to send” is approved or being prepared but not yet released — it is <b>not</b> reserved or deducted; the stock only leaves when the transfer is released.</p></div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Received by branch <span class="muted">· ' + esc(periodLabel(ctx)) + ' · ' + esc(scopeLabel(ctx)) + ' · click a branch to see what it received</span></h3>' +
    rbb.map((r) => '<details class="tf-brx"><summary><b class="tf-brx-name">' + esc(r.branch.name) + '</b><span>' + plural(r.count, 'transfer') + '</span><span>' + plural(r.skus, 'SKU') + '</span><span><b>' + qty(r.units) + '</b> units received</span>' +
      '<span class="muted">Last receipt: ' + (r.lastReceipt ? esc(fmtDate(r.lastReceipt)) : '—') + '</span><span>' + (r.openDiscs ? '<b class="lv-neg">' + plural(r.openDiscs, 'open discrepancy', 'open discrepancies') + '</b>' : '<span class="muted">No open discrepancies</span>') + '</span></summary>' +
      '<div class="tf-brx-body">' + (r.count ? '<div class="table-scroll table-2col"><table class="lv-mini"><thead><tr><th>Transfer</th><th>Received from</th><th>Received on</th><th>SKUs</th><th>Pieces</th><th>Discrepancy</th></tr></thead><tbody>' +
        r.transfers.slice().sort((a, b) => String(b._receivedOn).localeCompare(String(a._receivedOn))).slice(0, 30).map((t) => '<tr><td data-label="Transfer"><button type="button" class="bl-link" data-act="view" data-id="' + t.id + '">' + esc(t.transfer_number) + '</button></td><td data-label="Received from">' + esc(t._from) + '</td><td data-label="Received on">' + esc(fmtDate(t._receivedOn)) + '</td><td data-label="SKUs">' + t._items.filter((i) => i.rec > 0).length + '</td><td data-label="Pieces"><b>' + qty(t._recPcs) + '</b></td><td data-label="Discrepancy">' + (t._openDiscs.length ? '<b class="lv-neg">' + t._openDiscs.length + ' open</b>' : '—') + '</td></tr>').join('') +
        '</tbody></table></div>' + (r.count > 30 ? '<p class="muted">Showing the latest 30 of ' + r.count + ' — the Transfers tab (filtered to this destination) lists them all.</p>' : '') : '<p class="muted">Nothing was received here in this period.</p>') + '</div></details>').join('') + '</div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Who sends to whom <span class="muted">· pieces released · ' + esc(periodLabel(ctx)) + '</span></h3>' + matrixHtml(ctx, period) + '</div></div>';
  const root = $('tf-br');
  bindFilterBar(ctx, root, () => ctx.rerender());
  bindActions(ctx, root);
  try {
    const rows = await ctx.api.branchOverview();
    if (!$('tf-br-cards')) return;
    const by = Object.fromEntries((rows || []).map((r) => [r.branch_id, r]));
    const list = ctx.branches.map((b) => by[b.id]).filter(Boolean);
    $('tf-br-cards').innerHTML = '<div class="tf-branchgrid">' + list.map((r) => '<div class="tf-branchcard">' + branchBadge(esc, r.name, r.branch_id, ctx.branches) +
      '<div class="tf-bc-main"><b>' + qty(r.on_hand) + '</b> <span class="muted">pcs in stock · ' + qty(r.skus_in_stock) + ' SKUs</span></div>' +
      '<ul class="tf-bc-list"><li><span>Promised to send</span><b>' + qty(r.pending_out) + '</b></li><li><span>Sent, still on the way</span><b>' + qty(r.out_in_transit) + '</b></li><li><span>Incoming</span><b>' + qty(r.incoming) + '</b></li>' +
      '<li><span>Open discrepancies</span><b class="' + (r.open_discrepancies ? 'lv-neg' : '') + '">' + qty(r.open_discrepancies) + '</b></li></ul></div>').join('') + '</div>';
  } catch (err) { if ($('tf-br-cards')) $('tf-br-cards').innerHTML = '<div class="msg error">Could not load branch stock: ' + esc(err.message || String(err)) + '</div>'; }
}

// ================================================================ discrepancies
export const newDiscState = () => ({ status: 'Open', type: '', search: '' });

function visibleDiscs(ctx) {
  const s = ctx.ui.disc, q = s.search.toLowerCase();
  return ctx.transfers.filter((t) => matchesScope(t, ctx.filters)).flatMap((t) => t._discs.map((d) => ({ t, d }))).filter(({ t, d }) => {
    if (d.status === 'Open' ? false : !inPeriod(t, ctx.filters)) return false;
    if (s.status && (s.status === 'Open') !== (d.status === 'Open')) return false;
    if (s.type && d.type !== s.type) return false;
    const i = t._items.find((x) => x.id === d.transfer_item_id);
    return !q || [t.transfer_number, t._from, t._to, i && i.sku, i && i.name, d.type, d.explanation, d.resolution_notes].join(' ').toLowerCase().includes(q);
  }).sort((a, b) => (a.d.status === 'Open' ? 0 : 1) - (b.d.status === 'Open' ? 0 : 1) || String(b.d.reported_at).localeCompare(String(a.d.reported_at)));
}

export function renderDiscrepancies(ctx, panel) {
  const s = ctx.ui.disc, rows = visibleDiscs(ctx);
  const open = rows.filter((r) => r.d.status === 'Open');
  const all = ctx.transfers.flatMap((t) => t._discs);
  panel.innerHTML = '<div id="tf-dc">' + filterBarHtml(ctx) +
    '<div class="bl-views" role="group" aria-label="Discrepancy status">' + [['Open', 'Open'], ['Resolved', 'Resolved'], ['', 'All']].map(([v, l]) => '<button type="button" class="bl-chip' + (s.status === v ? ' bl-chip-on' : '') + '" data-ds="' + v + '">' + l + '</button>').join('') + '</div>' +
    '<div class="card bl-toolbar"><div class="bl-toolrow"><div class="field bl-grow"><label>Search</label><input type="search" id="tf-dc-q" placeholder="Transfer ID, SKU, item, what happened…" value="' + esc(s.search) + '"></div>' +
      '<div class="field"><label>Type</label><select id="tf-dc-type"><option value="">Any</option>' + DISC_TYPES.map((x) => '<option' + (s.type === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>&nbsp;</label><details class="bl-menu bl-exportmenu"><summary class="btn small secondary">Export ▾</summary><div class="bl-menu-pop"><button type="button" data-exp="csv">CSV</button><button type="button" data-exp="xlsx">Excel (.xlsx)</button><button type="button" data-exp="pdf">PDF</button></div></details></div></div></div>' +
    '<div class="bl-summary"><b>' + plural(rows.length, 'discrepancy', 'discrepancies') + '</b><span>Open <b class="' + (open.length ? 'lv-neg' : '') + '">' + open.length + '</b> · ' + qty(sum(open, (r) => r.d.quantity)) + ' pcs</span><span class="muted">All time: ' + all.filter((d) => d.status === 'Open').length + ' open of ' + all.length + ' reported</span></div>' +
    (rows.length ? '<div class="table-scroll table-2col bl-tablewrap"><table class="bl-table tf-table"><thead><tr><th>Transfer</th><th>Item</th><th>Type</th><th>Qty</th><th>What happened</th><th>Status</th><th></th></tr></thead><tbody>' + rows.map(({ t, d }) => {
      const i = t._items.find((x) => x.id === d.transfer_item_id);
      return '<tr class="' + (d.status === 'Open' ? 'tf-row-open' : '') + '"><td data-label="Transfer"><button type="button" class="bl-link" data-act="view" data-id="' + t.id + '">' + esc(t.transfer_number) + '</button><div class="tf-routeline">' + routeText(ctx, t) + '</div></td>' +
        '<td data-label="Item">' + (i ? '<b>' + esc(i.sku) + '</b><div class="muted bl-sub">' + esc(i.name) + '</div>' : '<span class="muted">Whole transfer</span>') + '</td>' +
        '<td data-label="Type">' + tagBadge(d.type, d.status === 'Open' ? 'tf-tag-disc' : 'bl-tag-gray') + '</td><td data-label="Qty"><b>' + qty(d.quantity) + '</b></td>' +
        '<td data-label="What happened" class="full-row">' + esc(d.explanation) + '<div class="muted bl-sub">' + esc(ctx.names[d.reported_by] || '—') + ' · ' + esc(fmtDate(manilaDate(d.reported_at))) + '</div></td>' +
        '<td data-label="Status" class="full-row">' + (d.status === 'Open' ? '<b class="lv-neg">Open</b>' : '<b class="lv-pos">Resolved</b> — ' + esc(d.resolution || '') + (d.resolution_notes ? '<div class="muted bl-sub">' + esc(d.resolution_notes) + '</div>' : '')) + '</td>' +
        '<td data-label="" class="full-row"><div class="bl-rowact"><button type="button" class="btn small secondary" data-act="view" data-id="' + t.id + '">View Transfer</button>' + (d.status === 'Open' && ctx.caps.canResolve() ? '<button type="button" class="btn small" data-act="resolvedisc" data-id="' + t.id + '" data-disc="' + d.id + '">Resolve</button>' : '') + '</div></td></tr>';
    }).join('') + '</tbody></table></div>' : emptyBox(s.status === 'Open' ? 'No open discrepancies. ✓ Every missing or damaged item has been resolved.' : 'No discrepancies match these filters.')) + '</div>';

  const root = $('tf-dc');
  bindFilterBar(ctx, root, () => ctx.rerender());
  root.querySelectorAll('[data-ds]').forEach((el) => el.addEventListener('click', () => { s.status = el.dataset.ds; ctx.rerender(); }));
  let st = null;
  $('tf-dc-q').addEventListener('input', (e) => { clearTimeout(st); st = setTimeout(() => { s.search = e.target.value.trim(); ctx.rerender(); const f = $('tf-dc-q'); if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } }, 300); });
  $('tf-dc-type').addEventListener('change', (e) => { s.type = e.target.value; ctx.rerender(); });
  root.querySelectorAll('[data-act="resolvedisc"]').forEach((el) => el.addEventListener('click', () => ctx.openDetail(el.dataset.id, { action: 'resolve', discrepancy: Number(el.dataset.disc) })));
  root.querySelectorAll('[data-exp]').forEach((el) => el.addEventListener('click', async () => {
    el.closest('details').open = false;
    const out = rows.map(({ t, d }) => discRow(t, d, ctx.names));
    try { await exportRows('Transfer Discrepancies', 'transfers-discrepancies-' + ctx.today, DISC_COLUMNS, out, el.dataset.exp, [plural(out.length, 'discrepancy', 'discrepancies') + ' · ' + periodLabel(ctx) + ' · ' + scopeLabel(ctx)], DISC_COLUMNS.filter((c) => ['transfer_no', 'sku', 'type', 'quantity', 'status', 'explanation', 'reported_date'].includes(c.key))); } catch (err) { ctx.toast(err, true); }
  }));
  bindActions(ctx, root);
}
