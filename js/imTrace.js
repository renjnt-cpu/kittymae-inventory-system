// Item Monitoring > Trace Product -- follow one product (or a search) through the purchases: by SKU or name, by Gold / Silver / Coated, by delivery dates. When the search points at one SKU the
// answer is the whole picture: stock at every branch, the last count, every purchase and a button for the full movement history (transfers, sales, online orders, adjustments, reservations).
import { esc, money, weight, num, fmtDate, plural } from './imFormat.js?v=20261030b';
import { skuSummary, singleSku, materialOf } from './imData.js?v=20261030b';
import { MATERIAL_GROUPS } from './productMaterial.js?v=20261030b';
import { summaryTiles } from './imHistory.js?v=20261030b';
import { emptyBox } from './imUi.js?v=20261030b';

export function renderTrace(ctx, panel, opts) {
  const st = ctx.ui.trace;
  if (opts && opts.search !== undefined) st.search = opts.search;
  panel.innerHTML = '<div class="card im-filters"><h3>Trace a Product</h3><p class="muted" style="margin-top:-4px;">Search the factory purchases by SKU or product name, narrow it to Gold, Silver or Coated, and to a delivery date range.</p>' +
    '<div class="im-filter-row"><div class="field im-grow"><label>Search</label><input type="search" id="im-t-search" placeholder="SKU or product name…" value="' + esc(st.search) + '"></div>' +
    '<div class="field"><label>Category</label><select id="im-t-cat"><option value="all">All categories</option>' + MATERIAL_GROUPS.map((g) => '<option' + (st.cat === g ? ' selected' : '') + '>' + g + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>From</label><input type="date" id="im-t-from" value="' + esc(st.from) + '"></div><div class="field"><label>To</label><input type="date" id="im-t-to" value="' + esc(st.to) + '"></div>' +
    '<button type="button" class="btn small secondary" id="im-t-clear">Clear</button></div>' +
    '<p class="muted" style="margin:8px 0 0;font-size:11px;">Gold / Silver / Coated is read from each product’s category and name (the catalog has no separate material field yet). “Not marked” means neither says which.</p></div>' +
    '<div id="im-t-body"></div>';
  const $ = (id) => panel.querySelector('#' + id);

  function paint() {
    const q = st.search.trim().toLowerCase();
    const stockMatch = q ? ctx.data.stock.filter((r) => r._text.includes(q)) : [];
    const sku = singleSku(stockMatch.length ? stockMatch : ctx.data.purchases.map((p) => ({ sku: p.sku, _text: (p.sku + ' ' + ((p.products || {}).item_name || '')).toLowerCase() })), st.search);
    let rows = ctx.data.purchases;
    if (q) rows = rows.filter((p) => p.sku.toLowerCase().includes(q) || ((p.products || {}).item_name || '').toLowerCase().includes(q));
    if (st.cat !== 'all') rows = rows.filter((p) => materialOf((p.products || {}).category, (p.products || {}).item_name) === st.cat);
    if (st.from) rows = rows.filter((p) => p.date_delivered >= st.from);
    if (st.to) rows = rows.filter((p) => p.date_delivered <= st.to);
    let html = '';
    const s = sku && skuSummary(ctx.data.stock, sku);
    if (s) {
      html += '<div class="im-skucard"><div class="im-sku-title"><b>' + esc(s.sku) + '</b> <span class="muted">' + esc(s.name) + (s.category ? ' · ' + esc(s.category) : '') + ' · ' + esc(materialOf(s.category, s.name)) + '</span></div>' +
        '<div class="im-skunums"><div><span>Total company stock</span><b>' + num(s.total) + ' pcs</b></div><div><span>Reserved</span><b>' + num(s.reserved) + ' pcs</b></div><div><span>Available</span><b class="im-pos">' + num(s.available) + ' pcs</b></div>' + (s.grams ? '<div><span>Weight on hand</span><b>' + weight(s.grams) + '</b></div>' : '') + '</div>' +
        '<div class="table-scroll table-mini"><table><thead><tr><th>Branch</th><th>Available</th><th>Reserved</th><th>Last count</th><th>Next count</th></tr></thead><tbody>' + ctx.data.stock.filter((r) => r.sku === s.sku).map((r) =>
          '<tr><td data-label="Branch">' + esc(r._branch) + '</td><td data-label="Available"><b>' + num(r.qty_available) + '</b></td><td data-label="Reserved">' + num(r.qty_reserved) + '</td><td data-label="Last count">' + (r._last ? fmtDate(r._last) : '<span class="muted">never</span>') + '</td>' +
          '<td data-label="Next count">' + fmtDate(new Date(r._due).toISOString()) + (r._overdue ? ' <span class="badge low">DUE</span>' : '') + '</td></tr>').join('') + '</tbody></table></div>' +
        '<div class="im-links"><button type="button" class="btn small" data-hist>Full movement history</button><button type="button" class="btn small secondary" data-stock>Stock by branch</button><a class="btn small secondary" href="products.html?q=' + encodeURIComponent(s.sku) + '" target="_blank" rel="noopener">Open in SKU Catalog</a>' +
        '<a class="btn small secondary" href="transfers.html" target="_blank" rel="noopener">Transfers</a></div>' +
        '<p class="muted" style="font-size:11px;margin:6px 0 0;">The movement history shows transfers, sales, online orders, stock in, adjustments, reservations and pull-outs with the stock before and after each.</p></div>';
    } else if (q && stockMatch.length) {
      const skus = [...new Map(stockMatch.map((r) => [r.sku, r._name])).entries()].slice(0, 12);
      html += '<div class="card"><b>' + plural(new Set(stockMatch.map((r) => r.sku)).size, 'SKU') + ' match.</b> Pick one to see the whole picture: ' + skus.map(([k, n]) => '<button type="button" class="im-chip" data-pick="' + esc(k) + '">' + esc(k) + ' <span class="muted">' + esc(n) + '</span></button>').join(' ') + '</div>';
    }
    if (!ctx.data.purchases.length) html += emptyBox('No factory purchases recorded yet.');
    else if (!rows.length) html += emptyBox('No factory purchases match this search.');
    else {
      const shown = rows.slice(0, 200);
      html += '<h3 class="im-h">Factory purchases</h3><div class="im-sumbar">' + summaryTiles(rows) + '</div><div class="table-scroll table-2col"><table><thead><tr><th>Delivered</th><th>SKU</th><th>Branch</th><th>Pcs</th><th>Sup. price</th><th>Purchased</th><th>Est. sales</th><th>Request</th><th>By</th></tr></thead><tbody>' +
        shown.map((p) => { const m = ctx.data.meta.posted.get(p.id); return '<tr><td data-label="Delivered">' + fmtDate(p.date_delivered) + '</td><td data-label="SKU"><b>' + esc(p.sku) + '</b><div class="muted" style="font-size:10px;">' + esc((p.products || {}).item_name || '') + '</div></td>' +
          '<td data-label="Branch">' + (p.branches ? esc(p.branches.name) : '—') + '</td><td data-label="Pcs">' + num(p.qty) + '</td><td data-label="Sup. price">' + money(p.sup_price) + '</td><td data-label="Purchased">' + money(p.purchased_amount) + '</td><td data-label="Est. sales">' + money(p.est_sales) + '</td>' +
          '<td data-label="Request">' + (m ? '<button type="button" class="im-link" data-open-req="' + m.request_id + '">' + esc(m.request_number) + '</button>' : '<span class="muted">before approvals</span>') + '</td><td data-label="By">' + esc(m ? m.submitted_by : (p.creator ? p.creator.full_name : '—') || '—') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
        (rows.length > shown.length ? '<p class="muted">Showing the newest ' + shown.length + ' of ' + rows.length + ' — narrow the search to see the rest, or open Purchase History.</p>' : '');
    }
    const box = $('im-t-body'); box.innerHTML = html;
    box.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => { st.search = b.dataset.pick; $('im-t-search').value = st.search; paint(); }));
    box.querySelectorAll('[data-open-req]').forEach((b) => b.addEventListener('click', () => ctx.openRequest(Number(b.dataset.openReq))));
    const h = box.querySelector('[data-hist]'); if (h) h.addEventListener('click', () => ctx.openMovement(s.sku));
    const sb = box.querySelector('[data-stock]'); if (sb) sb.addEventListener('click', () => ctx.showTab('stock', { search: s.sku, status: 'all', branch: 'all' }));
  }
  const bind = (id, key, ev) => { const el = $(id); el.addEventListener(ev, () => { st[key] = el.value; paint(); }); };
  bind('im-t-search', 'search', 'input'); bind('im-t-cat', 'cat', 'change'); bind('im-t-from', 'from', 'change'); bind('im-t-to', 'to', 'change');
  $('im-t-clear').addEventListener('click', () => { Object.assign(st, { search: '', cat: 'all', from: '', to: '' }); renderTrace(ctx, panel); });
  paint();
}
