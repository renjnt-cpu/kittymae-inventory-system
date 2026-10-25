// Scrap Monitoring page -- the Dashboard: how much scrap is held, what is waiting for someone, what sold this month and who still owes money, plus the "Attention Needed" list.
// Every figure is worked out by the database when the page asks (scrap_dashboard / scrap_attention); nothing here is stored or typed in. Cards that lead somewhere are buttons.
import { esc, grams, money, num, fmtDate, plural, friendly, saleStatusBadge, payBadge, kindOfSale, ageBadge, monthStart } from './smFormat.js?v=20261025b';
import { kpiCard, emptyBox } from './smUi.js?v=20261025b';

const BUCKETS = [{ max_age: 7 }, { min_age: 8, max_age: 30 }, { min_age: 31, max_age: 60 }, { min_age: 61, max_age: 90 }, { min_age: 91 }];
const SEVERITY = { high: 'Needs action', medium: 'Look at this', low: 'For information' };

/** Follows an Attention item's "go": open a sale / record, or jump to a tab with filters. The database calls All Scrap 'all'; the page calls it 'entries'. */
export function follow(ctx, go) {
  if (!go) return;
  const tab = go.tab === 'all' ? 'entries' : go.tab;
  if (go.open && tab === 'sales') return ctx.openSale(Number(go.open));
  if (go.open) return ctx.openEntry(go.open);
  return ctx.gotoTab(tab, go.filters || {});
}

export async function renderDashboard(ctx, panel) {
  const st = ctx.ui.dash || (ctx.ui.dash = { branch: '', allAttention: false });
  const v = ctx.value;
  panel.innerHTML = '<div class="card sm-toolbar"><div class="sm-toolrow">' +
    (ctx.branches.length > 1 ? '<div class="field"><label for="smd-branch">Branch</label><select id="smd-branch"><option value="">All branches I can see</option>' +
      ctx.branches.map((b) => '<option value="' + esc(b.id) + '"' + (String(st.branch) === String(b.id) ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('') + '</select></div>' : '') +
    '<div class="field"><label>&nbsp;</label><button type="button" class="btn small secondary" id="smd-reload">↻ Refresh</button></div></div></div><div id="smd-body"><p class="muted">Loading…</p></div>';
  const body = panel.querySelector('#smd-body');
  const b = panel.querySelector('#smd-branch'); if (b) b.addEventListener('change', () => { st.branch = b.value; renderDashboard(ctx, panel); });
  panel.querySelector('#smd-reload').addEventListener('click', () => { ctx.refreshCounts(); renderDashboard(ctx, panel); });

  let res, attn;
  try { [res, attn] = await Promise.all([ctx.api.dashboard(st.branch ? Number(st.branch) : null), ctx.api.attention(st.branch ? Number(st.branch) : null)]); }
  catch (err) { body.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; return; }
  if (!panel.contains(body)) return;
  if (!res || res.ok === false) { body.innerHTML = '<div class="msg error">' + esc((res && res.message) || 'The dashboard could not be loaded.') + '</div>'; return; }
  const k = res.kpis || {}, branchF = st.branch ? { branch_id: st.branch } : {};
  const pending = (k.pending_sales || 0) + (k.pending_disposals || 0);

  const GO = {
    available: () => ctx.gotoTab('available', branchF),
    sale: () => ctx.gotoTab('marked', branchF, { view: 'sale' }),
    disposal: () => ctx.gotoTab('marked', branchF, { view: 'disposal' }),
    pending: () => ctx.gotoTab('marked', branchF, { view: 'sale' }),
    entries: () => ctx.gotoTab('entries', branchF),
    month: () => ctx.gotoTab('entries', Object.assign({ kind: 'Bought from Customer', date_from: monthStart() }, branchF)),
    sales: () => ctx.gotoTab('sales', Object.assign({ kind: 'SALE', status: 'CONFIRMED' }, branchF)),
    disposed: () => ctx.gotoTab('sales', Object.assign({ kind: 'DISPOSAL', status: 'CONFIRMED' }, branchF)),
    owed: () => ctx.gotoTab('sales', Object.assign({ unpaid: true, status: 'CONFIRMED' }, branchF)),
  };

  const heldCards = [
    kpiCard({ label: 'Available scrap', value: esc(grams(k.available_g)), sub: esc(plural(k.available_lots || 0, 'lot')) + ' in ' + esc(plural(k.branches_with_scrap || 0, 'branch', 'branches')), tone: 'blue', go: 'available', hint: 'Scrap the branches still hold' }),
    kpiCard({ label: 'Marked for sale', value: esc(grams(k.marked_sale_g)), sub: esc(plural(k.marked_sale_lots || 0, 'lot')) + ' ready to sell or reserved', tone: 'yellow', go: 'sale' }),
    kpiCard({ label: 'Marked for disposal', value: esc(grams(k.marked_disposal_g)), sub: esc(plural(k.marked_disposal_lots || 0, 'lot')), tone: 'yellow', go: 'disposal' }),
    kpiCard({ label: 'Waiting for approval', value: esc(pending), sub: pending ? esc(grams(k.reserved_g)) + ' held back · ' + esc(plural(k.pending_sales || 0, 'sale')) + ', ' + esc(plural(k.pending_disposals || 0, 'disposal')) : 'Nothing is waiting', tone: pending ? 'orange' : 'green', go: 'pending' }),
  ];
  const monthCards = [
    kpiCard({ label: 'Bought this month', value: esc(grams(k.month_g)), sub: esc(plural(k.month_entries || 0, 'purchase')), tone: 'gray', go: 'month' }),
    kpiCard({ label: 'Sold / released this month', value: esc(grams(k.sold_month_g)), sub: v ? esc(money(k.sold_month_amount)) : '', tone: 'green', go: 'sales' }),
    kpiCard({ label: 'Disposed this month', value: esc(grams(k.disposed_month_g)), sub: 'Total ' + esc(grams(k.disposed_total_g)), tone: 'gray', go: 'disposed' }),
    ...(v ? [kpiCard({ label: 'Buyers still owe', value: esc(money(k.outstanding)), sub: esc(plural(k.unpaid_sales || 0, 'sale')) + ' not fully paid', tone: Number(k.outstanding) > 0 ? 'red' : 'green', go: 'owed' })] : []),
  ];
  const totalCards = [
    kpiCard({ label: 'Total scrap recorded', value: esc(grams(k.recorded_g)), sub: esc(plural(k.purchases || 0, 'purchase')) + ' · ' + esc(plural(k.entries || 0, 'record')) + ' in all', tone: 'gray', go: 'entries' }),
    kpiCard({ label: 'Sold / released in all', value: esc(grams(k.sold_total_g)), sub: v ? 'Sale value ' + esc(money(k.sale_value)) : '', tone: 'gray', go: 'sales' }),
    ...(v ? [kpiCard({ label: 'Paid to customers', value: esc(money(k.purchase_amount)), sub: 'for all the scrap recorded', tone: 'gray', go: 'entries' })] : []),
  ];

  const items = (attn && attn.ok !== false ? attn.items : []) || [];
  const shownItems = st.allAttention ? items : items.slice(0, 6);
  const attnHtml = '<div class="card"><div class="sm-cardhead"><div><h3 class="sm-h3">Attention needed</h3><p class="muted sm-small">Things someone should look at. Click one to go straight to it.</p></div>' +
    '<div class="sm-chips">' + ['high', 'medium', 'low'].map((s) => (attn && attn[s] ? '<span class="sm-chip"><span class="badge sm-badge sm-sev-' + s + '">' + esc(SEVERITY[s]) + '</span> <b>' + esc(attn[s]) + '</b></span>' : '')).join('') + '</div></div>' +
    (items.length ? '<div class="sm-attn">' + shownItems.map((it, i) => '<button type="button" class="sm-attn-row sm-attn-' + esc(it.severity) + '" data-attn="' + i + '"><span class="sm-attn-main"><span class="sm-attn-title">' + esc(it.title) + '</span>' +
        '<span class="sm-attn-detail">' + esc(it.detail) + '</span></span><span class="badge sm-badge sm-sev-' + esc(it.severity) + '">' + esc(({ high: 'Action', medium: 'Check', low: 'Info' })[it.severity] || '') + '</span></button>').join('') + '</div>' +
      (items.length > 6 ? '<p style="margin:8px 0 0;"><button type="button" class="act-link" id="smd-attn-more">' + (st.allAttention ? 'Show fewer' : 'Show all ' + items.length) + '</button></p>' : '')
      : '<div class="sm-banner sm-banner-ok" style="margin:0;">Nothing needs attention right now.</div>') + '</div>';

  const aging = res.aging || [], maxG = Math.max(1, ...aging.map((a) => Number(a.grams) || 0));
  const agingHtml = '<div class="card"><div class="sm-cardhead"><div><h3 class="sm-h3">How long scrap has been held</h3><p class="muted sm-small">Available scrap by how long ago it was recorded. Click a row to see those lots.</p></div></div>' +
    (aging.some((a) => a.lots) ? '<div class="sm-aging">' + aging.map((a, i) => '<button type="button" class="sm-aging-row sm-aging-btn" data-bucket="' + i + '"><span>' + esc(a.bucket) + '</span><span class="sm-bar ' + (i >= 4 ? 'sm-bar-old' : i >= 2 ? 'sm-bar-mid' : '') + '"><span style="width:' + Math.round((Number(a.grams) || 0) / maxG * 100) + '%"></span></span>' +
        '<span class="sm-num"><b>' + esc(num(a.grams)) + ' g</b> · ' + esc(a.lots) + '</span></button>').join('') + '</div>' : emptyBox('No scrap is being held.')) + '</div>';

  const karats = res.by_karat || [];
  const karatHtml = '<div class="card"><div class="sm-cardhead"><div><h3 class="sm-h3">Available by metal and purity</h3></div></div>' +
    (karats.length ? '<div class="sm-karats">' + karats.map((x) => '<button type="button" class="sm-karat sm-chip-btn" data-metal="' + esc(x.metal_type) + '" data-karat="' + esc(x.karat) + '" title="Show these lots"><b>' + esc(num(x.grams)) + ' g</b><span>' + esc(x.metal_type) + ' ' + esc(x.karat) + ' · ' + esc(plural(x.lots, 'lot')) + '</span></button>').join('') + '</div>' : emptyBox('No scrap is being held.')) + '</div>';

  const brs = res.branches || [];
  const branchHtml = brs.length > 1 ? '<div class="card"><div class="sm-cardhead"><div><h3 class="sm-h3">By branch</h3><p class="muted sm-small">Bought and sold are for this month.</p></div></div>' +
    '<div class="table-scroll table-2col"><table class="sm-table"><thead><tr><th>Branch</th><th class="sm-num">Available</th><th class="sm-num">Lots</th><th>Oldest</th><th class="sm-num">Bought</th><th class="sm-num">Sold</th><th class="sm-num">Waiting</th></tr></thead><tbody>' +
    brs.map((x) => '<tr class="sm-clickrow" data-branch-row="' + esc(x.branch_id) + '"><td data-label="Branch"><b>' + esc(x.branch_name) + '</b></td><td data-label="Available" class="sm-num"><b>' + esc(num(x.available_g)) + ' g</b></td><td data-label="Lots" class="sm-num">' + esc(x.lots_open) + '</td>' +
      '<td data-label="Oldest">' + (x.oldest_days !== null && x.oldest_days !== undefined ? ageBadge(x.oldest_days, ctx.settings.aged_days) : '—') + '</td><td data-label="Bought" class="sm-num">' + esc(num(x.purchased_g)) + ' g</td><td data-label="Sold" class="sm-num">' + esc(num(x.sold_g)) + ' g</td>' +
      '<td data-label="Waiting" class="sm-num">' + (x.pending_sales ? '<b>' + esc(x.pending_sales) + '</b>' : '—') + '</td></tr>').join('') + '</tbody></table></div></div>' : '';

  const recent = res.recent_sales || [];
  const recentHtml = '<div class="card"><div class="sm-cardhead"><div><h3 class="sm-h3">Latest sales and disposals</h3></div><button type="button" class="btn small secondary" data-go="sales-all">See all</button></div>' +
    (recent.length ? '<div class="table-scroll table-2col"><table class="sm-table"><thead><tr><th>Number</th><th>Date</th><th>Buyer / reason</th><th class="sm-num">Grams</th>' + (v ? '<th class="sm-num">Amount</th><th>Payment</th>' : '') + '<th>Status</th></tr></thead><tbody>' +
      recent.map((r) => '<tr><td data-label="Number"><button type="button" class="sm-link" data-open-sale="' + esc(r.id) + '"><b>' + esc(r.sale_number) + '</b></button><div class="muted sm-small">' + esc(kindOfSale(r.kind)) + ' · ' + esc(r.branch_name) + '</div></td>' +
        '<td data-label="Date">' + esc(fmtDate(r.sale_date)) + '</td><td data-label="Buyer / reason" class="sm-wrap">' + esc(r.buyer_name || (r.kind === 'DISPOSAL' ? 'Disposal' : '—')) + '</td><td data-label="Grams" class="sm-num">' + esc(num(r.total_grams)) + ' g</td>' +
        (v ?'<td data-label="Amount" class="sm-num">' + esc(r.total_amount === null || r.total_amount === undefined ? '—' : money(r.total_amount)) + '</td><td data-label="Payment">' + (r.status === 'CONFIRMED' && r.kind === 'SALE' ? payBadge(r.payment_status) : '') + '</td>' : '') +
        '<td data-label="Status">' + saleStatusBadge(r.status) + '</td></tr>').join('') + '</tbody></table></div>' : emptyBox('Nothing has been sold through this module yet.')) + '</div>';

  const buyers = res.buyers;
  const buyersHtml = buyers ? '<div class="card"><div class="sm-cardhead"><div><h3 class="sm-h3">Top buyers</h3><p class="muted sm-small">By the value of confirmed sales.</p></div><button type="button" class="btn small secondary" data-go="buyers">All buyers</button></div>' +
    (buyers.length ? '<div class="table-scroll table-2col"><table class="sm-table"><thead><tr><th>Buyer</th><th class="sm-num">Sales</th><th class="sm-num">Grams</th>' + (v ? '<th class="sm-num">Total</th><th class="sm-num">Still owes</th>' : '') + '</tr></thead><tbody>' +
      buyers.map((x) => '<tr><td data-label="Buyer"><b>' + esc(x.name || '—') + '</b></td><td data-label="Sales" class="sm-num">' + esc(x.transactions) + '</td><td data-label="Grams" class="sm-num">' + esc(num(x.grams)) + ' g</td>' +
        (v ? '<td data-label="Total" class="sm-num">' + esc(money(x.total_amount)) + '</td><td data-label="Still owes" class="sm-num">' + (Number(x.outstanding) > 0 ? '<b style="color:#c62828;">' + esc(money(x.outstanding)) + '</b>' : esc(money(0))) + '</td>' : '') + '</tr>').join('') + '</tbody></table></div>' : emptyBox('No scrap has been sold to a buyer yet.')) + '</div>' : '';

  body.innerHTML = '<div class="sm-kpi-group"><h3>Scrap held now</h3><div class="sm-kpis">' + heldCards.join('') + '</div></div>' +
    '<div class="sm-kpi-group"><h3>This month</h3><div class="sm-kpis">' + monthCards.join('') + '</div></div>' +
    '<div class="sm-kpi-group"><h3>All time</h3><div class="sm-kpis">' + totalCards.join('') + '</div></div>' +
    '<div class="sm-twocol">' + attnHtml + agingHtml + '</div><div class="sm-twocol" style="margin-top:14px;">' + karatHtml + (branchHtml || '') + '</div>' +
    '<div class="sm-twocol" style="margin-top:14px;">' + recentHtml + buyersHtml + '</div>';

  body.querySelectorAll('[data-go]').forEach((x) => x.addEventListener('click', () => {
    const g = x.dataset.go;
    if (g === 'sales-all') return ctx.gotoTab('sales', branchF);
    if (g === 'buyers') return ctx.gotoTab('buyers', {});
    if (GO[g]) GO[g]();
  }));
  body.querySelectorAll('[data-attn]').forEach((x) => x.addEventListener('click', () => follow(ctx, shownItems[Number(x.dataset.attn)].go)));
  const more = body.querySelector('#smd-attn-more'); if (more) more.addEventListener('click', () => { st.allAttention = !st.allAttention; renderDashboard(ctx, panel); });
  body.querySelectorAll('[data-bucket]').forEach((x) => x.addEventListener('click', () => ctx.gotoTab('available', Object.assign({}, branchF, BUCKETS[Number(x.dataset.bucket)]))));
  body.querySelectorAll('[data-karat]').forEach((x) => x.addEventListener('click', () => ctx.gotoTab('available', Object.assign({ metal: x.dataset.metal, karat: x.dataset.karat }, branchF))));
  body.querySelectorAll('[data-branch-row]').forEach((x) => x.addEventListener('click', () => ctx.gotoTab('available', { branch_id: x.dataset.branchRow })));
  body.querySelectorAll('[data-open-sale]').forEach((x) => x.addEventListener('click', () => ctx.openSale(Number(x.dataset.openSale))));
}
