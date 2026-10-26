// Scrap Monitoring page -- "Available Scrap" (the lots still held, oldest first) and "For Sale / Disposal" (the lots management has marked, plus the sales and disposals waiting for approval).
// A lot is one metal / purity line of a purchase. Select lots to sell or dispose of them, or to mark them for sale / disposal / reserve them for a buyer.
import { esc, grams, num, fmtDate, markBadge, ageBadge, scrapId, kindBadge, money, friendly, saleStatusBadge, kindOfSale, METALS, plural } from './smFormat.js?v=20261026b';
import { openDrawer, closeDrawer, kv, emptyBox, actionPanel } from './smUi.js?v=20261026b';
import { renderList } from './smList.js?v=20261026b';

const MARK_OPTIONS = [['FOR_SALE', 'For sale'], ['RESERVED', 'Reserved for a buyer'], ['FOR_DISPOSAL', 'For disposal'], ['NONE', 'Not marked']];

export function availableCfg(ctx, mode) {
  const marked = mode === 'marked', key = marked ? 'marked' : 'available';
  const st = () => ctx.ui.lists[key];
  return {
    key,
    hint: marked ? 'Scrap that management has marked as ready to sell, reserved for a buyer or set for disposal. Sales and disposals that are waiting for an approver are listed above.'
      : 'Scrap still held by the branches, oldest first. Tick lots to sell or dispose of them, or to mark them for sale. A lot already sold, disposed of or held back by a sale waiting for approval is not listed.',
    fields: [
      { id: 'q', type: 'search', label: 'Search', ph: 'Scrap #, customer, purity, branch, buyer…', grow: true },
      { id: 'branch_id', type: 'select', label: 'Branch', options: (c) => c.branches.map((b) => [b.id, b.name]), show: (c) => c.branches.length > 1 },
      { id: 'metal', type: 'select', label: 'Metal', options: METALS.map((m) => [m, m]) },
      { id: 'karat', type: 'select', label: 'Purity', options: (c) => c.refs.karats.map((k) => [k, k]) },
      ...(marked ? [] : [{ id: 'mark', type: 'select', label: 'Mark', options: MARK_OPTIONS }]),
      { id: 'min_age', type: 'number', label: 'Held at least (days)', more: true }, { id: 'max_age', type: 'number', label: 'Held at most (days)', more: true },
      { id: 'date_from', type: 'date', label: 'Recorded from', more: true }, { id: 'date_to', type: 'date', label: 'Recorded to', more: true },
    ],
    sorts: [['oldest', 'Oldest first'], ['newest', 'Newest first'], ['heaviest', 'Heaviest first'], ['branch', 'Branch'], ['purity', 'Purity']], sort: 'oldest', pageSize: 100,
    get fixed() { return marked ? { marked: (ctx.ui.lists.marked && ctx.ui.lists.marked.view) === 'disposal' ? 'disposal' : 'sale' } : {}; },
    fetch: (f, sort, limit, offset) => ctx.api.available(f, limit, offset, sort),
    topHtml: marked ? () => '<div id="sm-pending"></div><div class="sm-seg" id="sm-markseg" role="group" aria-label="Which marked scrap"><button type="button" data-view="sale">For sale / reserved</button><button type="button" data-view="disposal">For disposal</button></div>' : undefined,
    wireTop: marked ? (top, c, s, reload) => {
      s.view = s.view || 'sale';
      const seg = top.querySelector('#sm-markseg');
      const paint = () => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.view === s.view));
      paint();
      seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { s.view = b.dataset.view; s.picked.clear(); paint(); reload(); }));
      renderPending(c, top.querySelector('#sm-pending'));
    } : undefined,
    summaryHtml: (res, s) => {
      const sum = res.summary || {};
      const groups = (res.groups || []);
      return '<div class="sm-chips"><span class="sm-chip"><b>' + (sum.lots || 0).toLocaleString('en-PH') + '</b> lots</span><span class="sm-chip"><b>' + grams(sum.grams) + '</b> available</span>' +
        '<span class="sm-chip"><b>' + (sum.branches || 0) + '</b> ' + ((sum.branches || 0) === 1 ? 'branch' : 'branches') + '</span>' + (sum.oldest_days !== null && sum.oldest_days !== undefined ? '<span class="sm-chip">oldest <b>' + esc(sum.oldest_days) + ' days</b></span>' : '') + '</div>' +
        (groups.length > 1 ? '<div class="sm-chips">' + groups.slice(0, 30).map((g) => '<button type="button" class="sm-chip sm-chip-btn" data-grp-branch="' + esc(g.branch_id) + '" data-grp-karat="' + esc(g.karat) + '" data-grp-metal="' + esc(g.metal_type) + '" title="Show only this">' +
          esc(g.branch_name) + ' · ' + esc(g.metal_type) + ' ' + esc(g.karat) + ' · <b>' + esc(num(g.grams)) + ' g</b> (' + esc(g.lots) + ')</button>').join('') + '</div>' : '');
    },
    // the tick boxes are only for people who can act on the lots (sell, dispose, mark); a view-only person just reads the list
    tableHtml: (rows, c, s) => '<div class="table-scroll table-2col"><table class="sm-table"><thead><tr>' + (c.can.sell || c.can.dispose ? '<th class="sm-c-check"><input type="checkbox" data-pick-all aria-label="Select every lot on this page"></th>' : '') + '<th>Scrap ID</th><th>Recorded</th><th>Held</th><th>Branch</th><th>Metal / purity</th>' +
      '<th class="sm-num">Bought</th><th class="sm-num">Available</th><th>Mark</th><th>From</th><th>Recorded by</th><th></th></tr></thead><tbody>' +
      rows.map((r) => '<tr data-line="' + esc(r.line_id) + '" class="' + (s.picked.has(r.line_id) ? 'sm-row-picked ' : '') + (r.age_days >= c.settings.aged_days ? 'sm-row-old' : '') + '">' +
        (c.can.sell || c.can.dispose ? '<td class="sm-c-check" data-label=""><input type="checkbox" data-pick="' + esc(r.line_id) + '"' + (s.picked.has(r.line_id) ? ' checked' : '') + ' aria-label="Select lot"></td>' : '') +
        '<td data-label="Scrap ID"><button type="button" class="sm-link" data-open-entry="' + esc(r.entry_id) + '"><b>' + esc(scrapId(r.entry_id)) + '</b></button><div class="muted sm-small">line ' + esc(r.line_no) + '</div></td>' +
        '<td data-label="Recorded">' + esc(fmtDate(r.entry_date)) + '</td><td data-label="Held">' + ageBadge(r.age_days, c.settings.aged_days) + '</td><td data-label="Branch">' + esc(r.branch_name) + '</td>' +
        '<td data-label="Metal / purity"><b>' + esc(r.metal_type) + ' ' + esc(r.karat || '') + '</b></td><td data-label="Bought" class="sm-num">' + esc(num(r.original_g)) + ' g</td>' +
        '<td data-label="Available" class="sm-num"><b>' + esc(num(r.available_g)) + ' g</b>' + (r.original_g - r.available_g > 0.0005 ? '<div class="muted sm-small">' + esc(num(r.original_g - r.available_g)) + ' g already gone</div>' : '') + '</td>' +
        '<td data-label="Mark">' + (markBadge(r.mark, r.mark_buyer) || '<span class="muted">—</span>') + (r.mark_note ? '<div class="muted sm-small sm-wrap">' + esc(r.mark_note) + '</div>' : '') + '</td>' +
        '<td data-label="From" class="sm-wrap">' + (r.kind === 'Transferred In' ? 'Transfer in' : esc(r.customer_name || 'Walk-in')) + '</td><td data-label="Recorded by">' + esc(r.recorded_by || '—') + '</td>' +
        '<td class="full-row"><button type="button" class="btn small secondary" data-open-entry="' + esc(r.entry_id) + '">Details</button></td></tr>').join('') + '</tbody></table></div><div id="sm-bulkhost"></div>',
    wireRows: (body, rows, c, s, reload) => wirePicking(c, body, rows, s, reload, key),
    emptyText: (hasFilters) => hasFilters ? 'No lots match these filters.' : marked ? 'Nothing is marked yet. Tick lots on the Available Scrap tab and mark them for sale or disposal.' : 'No scrap is available right now.',
  };
}

function wirePicking(ctx, body, rows, s, reload, key) {
  const byLine = new Map(rows.map((r) => [r.line_id, r]));
  body.querySelectorAll('[data-open-entry]').forEach((b) => b.addEventListener('click', () => ctx.openEntry(b.dataset.openEntry)));
  body.querySelectorAll('[data-grp-branch]').forEach((b) => b.addEventListener('click', () => {
    s.filters.branch_id = b.dataset.grpBranch; s.filters.karat = b.dataset.grpKarat; s.filters.metal = b.dataset.grpMetal; s.page = 1; ctx.showTab(key);
  }));
  const paintBulk = () => {
    const host = body.querySelector('#sm-bulkhost');
    if (!host) return;
    const picked = [...s.picked.values()];
    if (!picked.length) { host.innerHTML = ''; return; }
    const g = picked.reduce((t, r) => t + Number(r.available_g), 0), branches = new Set(picked.map((r) => r.branch_id)), one = branches.size === 1;
    const can = ctx.can;
    host.innerHTML = '<div class="sm-bulk"><div class="sm-bulk-info"><b>' + plural(picked.length, 'lot') + '</b> selected · ' + esc(num(g)) + ' g' + (one ? ' · ' + esc(picked[0].branch_name) : '') +
      (!one ? '<div class="muted sm-small">A sale or disposal is for one branch — you have lots from ' + branches.size + ' branches selected.</div>' : '') + '</div>' +
      (can.sell ? '<button type="button" class="btn" data-bulk="sell"' + (one ? '' : ' disabled') + '>Sell selected</button>' : '') +
      (can.dispose ? '<button type="button" class="btn secondary" data-bulk="dispose"' + (one ? '' : ' disabled') + '>Dispose selected</button>' : '') +
      (can.sell ? '<button type="button" class="btn secondary" data-bulk="FOR_SALE">Mark for sale</button><button type="button" class="btn secondary" data-bulk="RESERVED">Reserve for a buyer…</button>' : '') +
      (can.dispose ? '<button type="button" class="btn secondary" data-bulk="FOR_DISPOSAL">Mark for disposal</button>' : '') +
      (can.sell || can.dispose ? '<button type="button" class="btn secondary" data-bulk="CLEAR">Clear mark</button>' : '') + '<button type="button" class="btn small secondary" data-bulk="none">Clear selection</button></div>';
    host.querySelectorAll('[data-bulk]').forEach((b) => b.addEventListener('click', async () => {
      const act = b.dataset.bulk, ids = picked.map((r) => r.line_id);
      if (act === 'none') { s.picked.clear(); repaintBoxes(); paintBulk(); return; }
      if (act === 'sell') return ctx.openSaleForm({ mode: 'SALE', branchId: picked[0].branch_id, lineIds: ids });
      if (act === 'dispose') return ctx.openSaleForm({ mode: 'DISPOSAL', branchId: picked[0].branch_id, lineIds: ids });
      if (act === 'RESERVED') return openReserveForm(ctx, ids, () => { s.picked.clear(); reload(); ctx.refreshCounts(); });
      b.disabled = true;
      try { const res = await ctx.api.markLots(ids, act, null, null); if (res && res.ok === false) throw new Error(res.message); ctx.toast(act === 'CLEAR' ? 'Mark cleared on ' + plural(res.count, 'lot') + '.' : plural(res.count, 'lot') + ' marked.'); s.picked.clear(); reload(); ctx.refreshCounts(); }
      catch (err) { ctx.toast(err, true); b.disabled = false; }
    }));
  };
  const repaintBoxes = () => body.querySelectorAll('[data-pick]').forEach((cb) => { const on = s.picked.has(Number(cb.dataset.pick)); cb.checked = on; cb.closest('tr').classList.toggle('sm-row-picked', on); });
  body.querySelectorAll('[data-pick]').forEach((cb) => cb.addEventListener('change', () => {
    const r = byLine.get(Number(cb.dataset.pick));
    if (cb.checked) s.picked.set(r.line_id, r); else s.picked.delete(r.line_id);
    cb.closest('tr').classList.toggle('sm-row-picked', cb.checked); paintBulk();
  }));
  const all = body.querySelector('[data-pick-all]');
  if (all) all.addEventListener('change', () => { rows.forEach((r) => { if (all.checked) s.picked.set(r.line_id, r); else s.picked.delete(r.line_id); }); repaintBoxes(); paintBulk(); });
  paintBulk();
}

function openReserveForm(ctx, lineIds, done) {
  ctx.loadOptions().then((opts) => {
    openDrawer('side', { title: 'Reserve scrap for a buyer', sub: plural(lineIds.length, 'lot'), body: '<div id="sm-side-msg"></div><div class="sm-form-sec"><div class="sm-grid"><div class="field"><label for="rs-buyer">Buyer *</label><select id="rs-buyer"><option value="">Choose…</option>' +
      (opts.buyers || []).map((b) => '<option value="' + esc(b.id) + '">' + esc(b.name) + '</option>').join('') + '</select></div><div class="field"><label for="rs-note">Note</label><input id="rs-note" type="text" placeholder="Optional"></div></div>' +
      '<p class="muted sm-small">A reservation is a mark on the lots: it does not take the grams out of the branch. The lots stay available until a sale is confirmed.</p></div>',
      footer: '<button type="button" class="btn" id="rs-ok">Reserve</button><button type="button" class="btn secondary" id="rs-cancel">Cancel</button>' });
    document.getElementById('rs-cancel').addEventListener('click', () => closeDrawer('side'));
    document.getElementById('rs-ok').addEventListener('click', async () => {
      const buyer = Number(document.getElementById('rs-buyer').value);
      if (!buyer) { ctx.toast('Choose the buyer.', true); return; }
      const ok = document.getElementById('rs-ok'); ok.disabled = true;
      try { const res = await ctx.api.markLots(lineIds, 'RESERVED', buyer, document.getElementById('rs-note').value.trim()); if (res && res.ok === false) throw new Error(res.message); ctx.toast(plural(res.count, 'lot') + ' reserved.'); closeDrawer('side'); done(); }
      catch (err) { ctx.toast(err, true); ok.disabled = false; }
    });
  }).catch((err) => ctx.toast(err, true));
}

/** The sales and disposals waiting for an approver (top of the For Sale / Disposal tab). */
async function renderPending(ctx, host) {
  if (!host) return;
  try {
    const res = await ctx.api.salesList({ status: 'PENDING_APPROVAL' }, 50, 0, 'oldest');
    if (!res || res.ok === false || !res.rows.length) { host.innerHTML = ''; return; }
    const v = ctx.value;
    host.innerHTML = '<div class="card"><div class="sm-cardhead"><div><h3 class="sm-h3">Waiting for approval (' + res.rows.length + ')</h3><p class="muted sm-small">The grams in these are held back, so nobody else can sell them. ' +
      (ctx.can.approve_sale ? 'Open one to check it, then approve or reject it.' : 'An approver will confirm or reject them.') + '</p></div></div><div class="table-scroll table-2col"><table class="sm-table"><thead><tr><th>Number</th><th>Branch</th><th>Entered by</th><th>Buyer / reason</th><th class="sm-num">Grams</th>' + (v ? '<th class="sm-num">Amount</th>' : '') + '<th>Waiting</th><th></th></tr></thead><tbody>' +
      res.rows.map((r) => '<tr' + (r.pending_hours >= ctx.settings.pending_alert_hours ? ' class="sm-row-pending"' : '') + '><td data-label="Number"><button type="button" class="sm-link" data-open-sale="' + esc(r.id) + '"><b>' + esc(r.sale_number) + '</b></button><div class="muted sm-small">' + esc(kindOfSale(r.kind)) + '</div></td>' +
        '<td data-label="Branch">' + esc(r.branch_name) + '</td><td data-label="Entered by">' + esc(r.created_by_name || '—') + '</td><td data-label="Buyer / reason" class="sm-wrap">' + esc(r.buyer_name || r.reason || '—') + '</td>' +
        '<td data-label="Grams" class="sm-num">' + esc(num(r.total_grams)) + ' g</td>' + (v ? '<td data-label="Amount" class="sm-num">' + esc(r.total_amount === null || r.total_amount === undefined ? '—' : money(r.total_amount)) + '</td>' : '') +
        '<td data-label="Waiting">' + esc(r.pending_hours === null || r.pending_hours === undefined ? '' : r.pending_hours < 1 ? 'just now' : r.pending_hours + ' h') + '</td><td class="full-row"><button type="button" class="btn small' + (ctx.can.approve_sale ? '' : ' secondary') + '" data-open-sale="' + esc(r.id) + '">' + (ctx.can.approve_sale ? 'Review' : 'View') + '</button></td></tr>').join('') + '</tbody></table></div></div>';
    host.querySelectorAll('[data-open-sale]').forEach((b) => b.addEventListener('click', () => ctx.openSale(Number(b.dataset.openSale))));
  } catch (err) { host.innerHTML = ''; }
}

export const renderAvailable = (ctx, panel) => renderList(ctx, panel, availableCfg(ctx, 'all'));
export const renderMarked = (ctx, panel) => renderList(ctx, panel, availableCfg(ctx, 'marked'));
