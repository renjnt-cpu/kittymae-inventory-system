// Item Monitoring > Purchase History -- every purchase that became stock, newest delivery first, with what the approval added: the request number, who submitted it, who approved it and when.
// Purchases made before the approval existed show "Before approvals". The columns and totals are the old Factory Purchases table's; the only action is REQUEST REVERSAL (it asks the Final Approver; it
// does not delete anything). Pending, returned and rejected requests are in the Approvals tab, because they are not purchases yet.
import { esc, money, weight, num, fmtDate, fmtDateTime, plural, toCsv, downloadText } from './imFormat.js?v=20261030a';
import { materialOf } from './imData.js?v=20261030a';
import { MATERIAL_GROUPS } from './productMaterial.js?v=20261030a';
import { emptyBox } from './imUi.js?v=20261030a';
import { openReversalRequest, openDeleteReview } from './imReview.js?v=20261030a';

const CAP = 200;

export function summaryTiles(rows) {
  const pcs = rows.reduce((s, p) => s + Number(p.qty || 0), 0), amt = rows.reduce((s, p) => s + Number(p.purchased_amount || 0), 0), est = rows.reduce((s, p) => s + Number(p.est_sales || 0), 0), g = rows.reduce((s, p) => s + Number(p.total_grams || 0), 0);
  return '<div><div class="muted">Total pcs (' + plural(rows.length, 'entry', 'entries') + ')</div><b>' + num(pcs) + '</b></div><div><div class="muted">Total purchased</div><b>' + money(amt) + '</b></div>' +
    (g ? '<div><div class="muted">Total grams</div><b>' + weight(g) + '</b></div>' : '') + (est ? '<div><div class="muted">Total estimated sales</div><b>' + money(est) + '</b></div>' : '');
}

export function renderHistory(ctx, panel, opts) {
  const st = ctx.ui.history;
  if (opts) {
    if (opts.search !== undefined) st.search = opts.search;
    if (opts.branch !== undefined) st.branch = opts.branch;
    st.all = false;
  }
  const meta = ctx.data.meta;
  const people = [...new Set([...meta.posted.values()].flatMap((m) => [m.submitted_by, m.approved_by]).filter(Boolean))].sort();

  panel.innerHTML = '<div class="card im-filters"><div class="im-filter-row">' +
    '<div class="field im-grow"><label>Search SKU or product name</label><input type="search" id="im-h-search" value="' + esc(st.search) + '" placeholder="SKU or product name…"></div>' +
    '<div class="field"><label>Branch</label><select id="im-h-branch"><option value="">All branches</option>' + ctx.branches.map((b) => '<option value="' + b.id + '"' + (st.branch === String(b.id) ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Category</label><select id="im-h-cat"><option value="all">All categories</option>' + MATERIAL_GROUPS.map((g) => '<option' + (st.cat === g ? ' selected' : '') + '>' + g + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Submitted by</label><select id="im-h-sub"><option value="">Anyone</option>' + people.map((n) => '<option' + (st.sub === n ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Approved by</label><select id="im-h-app"><option value="">Anyone</option>' + people.map((n) => '<option' + (st.app === n ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Status</label><select id="im-h-status">' + [['', 'Any'], ['posted', 'Posted through approval'], ['legacy', 'Before approvals existed'], ['delete', 'Delete requested']].map(([k, l]) => '<option value="' + k + '"' + (st.status === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Delivered from</label><input type="date" id="im-h-from" value="' + esc(st.from) + '"></div><div class="field"><label>to</label><input type="date" id="im-h-to" value="' + esc(st.to) + '"></div>' +
    '<button type="button" class="btn small secondary" id="im-h-clear">Clear</button></div>' +
    '<p class="muted" style="margin:8px 0 0;font-size:11px;">Category (Gold / Silver / Coated) is read from each product’s category and name — the catalog has no separate material field. “Not marked” means neither says which. ' +
    'Pending, returned and rejected requests are not purchases yet — they are in <button type="button" class="im-link" id="im-h-toap">Approvals</button>.</p></div>' +
    '<div id="im-h-sum" class="im-sumbar"></div><div id="im-h-list"></div>';
  const $ = (id) => panel.querySelector('#' + id);

  function filtered() {
    const q = st.search.trim().toLowerCase();
    return ctx.data.purchases.filter((p) => {
      const pr = p.products || {}; const m = meta.posted.get(p.id); const del = meta.deletes.get(p.id);
      if (q && !(String(p.sku).toLowerCase().includes(q) || String(pr.item_name || '').toLowerCase().includes(q) || (m && String(m.request_number).toLowerCase().includes(q)))) return false;
      if (st.branch && String(p.branch_id) !== st.branch) return false;
      if (st.cat !== 'all' && materialOf(pr.category, pr.item_name) !== st.cat) return false;
      if (st.sub && !(m && m.submitted_by === st.sub)) return false;
      if (st.app && !(m && m.approved_by === st.app)) return false;
      if (st.status === 'posted' && !m) return false;
      if (st.status === 'legacy' && m) return false;
      if (st.status === 'delete' && !del) return false;
      if (st.from && p.date_delivered < st.from) return false;
      if (st.to && p.date_delivered > st.to) return false;
      return true;
    });
  }

  function paint() {
    const rows = filtered();
    $('im-h-sum').innerHTML = rows.length ? summaryTiles(rows) : '';
    const box = $('im-h-list');
    if (!ctx.data.purchases.length) { box.innerHTML = emptyBox('No factory purchases recorded yet.'); return; }
    if (!rows.length) { box.innerHTML = emptyBox('No factory purchases match this filter.'); return; }
    const shown = st.all ? rows : rows.slice(0, CAP);
    box.innerHTML = '<div class="table-scroll table-2col"><table><thead><tr><th>Delivered</th><th>SKU</th><th>Branch</th><th>Pcs</th><th>Sup. price</th><th>Pancake price</th><th>Grams</th><th>Total grams</th><th>Availed factory gram</th><th>Current/gram</th><th>Est. sales</th><th>Purchased</th><th>Profit</th>' +
      '<th>Approval</th><th>Request</th><th>Submitted by</th><th>Approved by</th><th>Approved</th><th>Note</th><th></th></tr></thead><tbody>' +
      shown.map((p) => {
        const m = meta.posted.get(p.id); const del = meta.deletes.get(p.id);
        const canAsk = ctx.who.canDelete(p.branch_id);
        return '<tr><td data-label="Delivered">' + fmtDate(p.date_delivered) + '</td><td data-label="SKU"><b>' + esc(p.sku) + '</b><div class="muted" style="font-size:10px;">' + esc((p.products || {}).item_name || '') + '</div></td>' +
          '<td data-label="Branch">' + (p.branches ? esc(p.branches.name) : '—') + '</td><td data-label="Pcs">' + num(p.qty) + '</td><td data-label="Sup. price">' + money(p.sup_price) + '</td><td data-label="Pancake price">' + money(p.pancake_price) + '</td>' +
          '<td data-label="Grams">' + weight(p.grams) + '</td><td data-label="Total grams">' + weight(p.total_grams) + '</td><td data-label="Availed factory gram">' + money(p.availed_factory_gram) + '</td><td data-label="Current/gram">' + money(p.current_per_gram) + '</td>' +
          '<td data-label="Est. sales">' + money(p.est_sales) + '</td><td data-label="Purchased">' + money(p.purchased_amount) + '</td><td data-label="Profit">' + money(p.profit) + '</td>' +
          '<td data-label="Approval">' + (del ? '<span class="badge lv-orange">Delete requested</span>' : m ? '<span class="badge lv-green">Posted</span>' : '<span class="badge lv-gray">Before approvals</span>') + '</td>' +
          '<td data-label="Request">' + (m ? '<button type="button" class="im-link" data-open-req="' + m.request_id + '">' + esc(m.request_number) + '</button>' : '—') + (del ? '<div><button type="button" class="im-link" data-open-del="' + del.id + '">' + esc(del.request_number) + '</button></div>' : '') + '</td>' +
          '<td data-label="Submitted by">' + esc(m ? m.submitted_by : (p.creator ? p.creator.full_name : '—') || '—') + '</td><td data-label="Approved by">' + esc(m && m.approved_by ? m.approved_by : '—') + '</td><td data-label="Approved">' + (m && m.approved_at ? fmtDateTime(m.approved_at) : '—') + '</td>' +
          '<td data-label="Note" class="full-row">' + esc(p.tag_note || '—') + '</td>' +
          '<td data-label="" class="full-row">' + (canAsk && !del ? '<button type="button" class="btn small secondary" data-req-del="' + p.id + '">Request reversal</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      (shown.length < rows.length ? '<div class="im-showmore"><span class="muted">Showing the newest ' + shown.length + ' of ' + rows.length + ' purchases.</span> <button type="button" class="btn small secondary" id="im-h-all">Show all ' + rows.length + '</button></div>' : '') +
      '<div style="margin-top:8px;"><button type="button" class="btn small secondary" id="im-h-csv">Export this list (CSV)</button></div>';
    box.querySelectorAll('[data-open-req]').forEach((b) => b.addEventListener('click', () => ctx.openRequest(Number(b.dataset.openReq))));
    box.querySelectorAll('[data-open-del]').forEach((b) => b.addEventListener('click', () => openDeleteReview(ctx, Number(b.dataset.openDel))));
    box.querySelectorAll('[data-req-del]').forEach((b) => b.addEventListener('click', () => openReversalRequest(ctx, { id: Number(b.dataset.reqDel) })));
    const all = $('im-h-all'); if (all) all.addEventListener('click', () => { st.all = true; paint(); });
    $('im-h-csv').addEventListener('click', () => {
      downloadText('factory-purchases.csv', toCsv(['Delivered', 'SKU', 'Product', 'Branch', 'Pcs', 'Sup. price', 'Pancake price', 'Grams', 'Total grams', 'Est. sales', 'Purchased', 'Profit', 'Request', 'Submitted by', 'Approved by', 'Approved'],
        rows.map((p) => { const m = meta.posted.get(p.id); return [p.date_delivered, p.sku, (p.products || {}).item_name, p.branches && p.branches.name, p.qty, p.sup_price, p.pancake_price, p.grams, p.total_grams, p.est_sales, p.purchased_amount, p.profit, m && m.request_number, m && m.submitted_by, m && m.approved_by, m && m.approved_at]; })));
    });
  }

  const bind = (id, key, ev) => { const el = $(id); el.addEventListener(ev, () => { st[key] = el.value; st.all = false; paint(); }); };
  bind('im-h-search', 'search', 'input'); bind('im-h-branch', 'branch', 'change'); bind('im-h-cat', 'cat', 'change'); bind('im-h-sub', 'sub', 'change'); bind('im-h-app', 'app', 'change');
  bind('im-h-status', 'status', 'change'); bind('im-h-from', 'from', 'change'); bind('im-h-to', 'to', 'change');
  $('im-h-clear').addEventListener('click', () => { Object.assign(st, { search: '', branch: '', cat: 'all', sub: '', app: '', status: '', from: '', to: '', all: false }); renderHistory(ctx, panel); });
  $('im-h-toap').addEventListener('click', () => ctx.showTab('approvals', { sub: 'all' }));
  paint();
}
