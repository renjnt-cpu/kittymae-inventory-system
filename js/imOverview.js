// Item Monitoring > Overview -- the management picture: the numbers, what needs attention, and the latest purchases, low stock, counts due and activity. Every card and row opens the place that
// answers it. Nothing here is calculated apart from the data the other tabs use.
import { esc, money, num, plural, fmtDate, fmtDateTime, ago, reqBadge, delBadge } from './imFormat.js?v=20261031a';
import { kpi, emptyBox } from './imUi.js?v=20261031a';

export function renderOverview(ctx, panel) {
  const o = ctx.data.overview || {};
  const stock = ctx.data.stock;
  const low = stock.filter((r) => r._low), overdue = stock.filter((r) => r._overdue);
  const unInv = ctx.data.counts.filter((c) => c.variance !== 0 && !c.investigated).length;

  const approvalsVisible = ctx.who.canRecord || ctx.who.canSeeAll;
  const cards = [
    kpi({ label: 'SKU × branch monitored', value: num(stock.length), go: 'stock:all' }),
    kpi({ label: 'Low stock', value: num(low.length), tone: low.length ? 'red' : 'green', go: 'stock:low' }),
    kpi({ label: 'Counts overdue', value: num(overdue.length), tone: overdue.length ? 'orange' : 'green', go: 'stock:overdue' }),
    approvalsVisible ? kpi({ label: 'Pending purchase approvals', value: num(o.pending_requests), tone: Number(o.pending_requests) ? 'yellow' : 'gray', sub: Number(o.pending_requests) ? money(o.pending_value) + ' waiting' : '', go: 'approvals:purchases' }) : '',
    approvalsVisible ? kpi({ label: 'Pending delete requests', value: num(o.pending_deletes), tone: Number(o.pending_deletes) ? 'orange' : 'gray', go: 'approvals:reversals' }) : '',
    kpi({ label: 'Factory purchases this month', value: num(o.purchases_this_month), sub: money(o.purchased_this_month), go: 'history' }),
    kpi({ label: 'Stock in this month', value: num(o.stock_in_this_month) + ' pcs', sub: 'from factory purchases', go: 'history' }),
  ].join('');

  const attn = [];
  if (Number(o.pending_requests)) attn.push([ctx.who.isApprover ? 'yellow' : 'gray', plural(o.pending_requests, 'factory purchase') + ' awaiting final approval' + (Number(o.pending_value) ? ' (' + money(o.pending_value) + ')' : ''), 'approvals:purchases']);
  if (Number(o.new_sku_awaiting)) attn.push(['orange', plural(o.new_sku_awaiting, 'new SKU', 'new SKUs') + ' awaiting approval', 'approvals:purchases']);
  if (Number(o.pending_deletes)) attn.push(['orange', plural(o.pending_deletes, 'delete / reversal request') + ' waiting', 'approvals:reversals']);
  if (Number(o.returned)) attn.push(['blue', plural(o.returned, 'request') + ' returned for correction', 'approvals:returned']);
  if (Number(o.posting_problems)) attn.push(['red', plural(o.posting_problems, 'approved request') + ' with items that could not be posted', 'approvals:purchases']);
  if (Number(o.my_drafts)) attn.push(['gray', 'You have ' + plural(o.my_drafts, 'draft') + ' not sent yet', 'purchase']);
  if (low.length) attn.push(['red', plural(low.length, 'SKU × branch row') + ' low on stock', 'stock:low']);
  if (overdue.length) attn.push(['orange', plural(overdue.length, 'SKU × branch row') + ' due for a physical count', 'counts:due']);
  if (unInv) attn.push(['orange', plural(unInv, 'count variance') + ' not investigated yet', 'counts:recent']);

  const lowTop = low.slice().sort((a, b) => ((b.products || {}).reorder_level > 0) - ((a.products || {}).reorder_level > 0) || Number(a.qty_available) - Number(b.qty_available) || a.sku.localeCompare(b.sku)).slice(0, 6);
  const dueTop = overdue.filter((r) => Number(r.qty_available) > 0).sort((a, b) => (a._last ? new Date(a._last).getTime() : 0) - (b._last ? new Date(b._last).getTime() : 0)).slice(0, 6);
  const recentBuys = ctx.data.purchases.slice(0, 6);

  // the latest happenings across the module
  const ev = [];
  (ctx.data.requests || []).forEach((r) => {
    const t = [r.submitted_at, r.final_approved_at, r.rejected_at, r.returned_at, r.cancelled_at].filter(Boolean).sort().pop() || r.created_at;
    ev.push({ t, html: '<button type="button" class="im-link" data-open-req="' + r.id + '">' + esc(r.request_number) + '</button> ' + reqBadge(r.status) + ' <span class="muted">' + esc(r.branch_name) + ' · ' + esc(r.submitted_by_name || r.created_by_name || '') + ' · ' + money(r.purchased) + '</span>' });
  });
  (ctx.data.deletes || []).forEach((d) => ev.push({ t: d.reviewed_at || d.requested_at, html: '<button type="button" class="im-link" data-open-del="' + d.id + '">' + esc(d.request_number) + '</button> ' + delBadge(d.status) + ' <span class="muted">reversal · ' + esc(d.sku) + ' · ' + esc(d.branch_name) + '</span>' }));
  ctx.data.counts.slice(0, 20).forEach((c) => ev.push({ t: c.counted_at, html: 'Count: <b>' + esc(c.sku) + '</b> <span class="muted">' + esc(c.branches ? c.branches.name : '') + ' · ' + (c.variance === 0 ? 'matches' : 'variance ' + (c.variance > 0 ? '+' : '') + c.variance) + '</span>' }));
  ctx.data.changes.slice(0, 20).forEach((c) => ev.push({ t: c.changed_at, html: 'Catalog: <b>' + esc(c.sku) + '</b> ' + esc(c.action.toLowerCase()) + ' <span class="muted">' + esc(c.changer ? c.changer.full_name : '') + '</span>' }));
  ev.sort((a, b) => new Date(b.t) - new Date(a.t));

  panel.innerHTML = '<div class="im-cards">' + cards + '</div>' +
    '<div class="im-two"><div class="card"><h3 class="im-h">Attention needed</h3>' + (attn.length ? '<ul class="im-attn">' + attn.map(([tone, text, go]) => '<li class="im-attn-' + tone + '"><span>' + esc(text) + '</span><button type="button" class="btn small secondary" data-go="' + go + '">Open</button></li>').join('') + '</ul>' : '<p class="muted">Nothing needs attention right now.</p>') + '</div>' +
    '<div class="card"><h3 class="im-h">Recent activity</h3>' + (ev.length ? '<ul class="im-act">' + ev.slice(0, 9).map((e) => '<li><span class="muted im-when">' + ago(e.t) + '</span> ' + e.html + '</li>').join('') + '</ul>' : '<p class="muted">Nothing yet.</p>') + '</div></div>' +
    '<div class="im-two"><div class="card"><h3 class="im-h">Recent purchases</h3>' + (recentBuys.length ? '<div class="table-scroll table-mini"><table><tbody>' + recentBuys.map((p) => {
      const m = ctx.data.meta.posted.get(p.id);
      return '<tr><td data-label="">' + fmtDate(p.date_delivered) + '</td><td data-label=""><b>' + esc(p.sku) + '</b></td><td data-label="">' + esc(p.branches ? p.branches.name : '') + '</td><td data-label="">' + num(p.qty) + ' pcs</td><td data-label="">' + money(p.purchased_amount) + '</td><td data-label="">' + (m ? esc(m.request_number) : '<span class="muted">older</span>') + '</td></tr>'; }).join('') + '</tbody></table></div><div style="margin-top:6px;"><button type="button" class="btn small secondary" data-go="history">All purchases</button></div>' : emptyBox('No purchases yet.')) + '</div>' +
    '<div class="card"><h3 class="im-h">Low stock</h3>' + (lowTop.length ? '<div class="table-scroll table-mini"><table><tbody>' + lowTop.map((r) => '<tr><td data-label=""><b>' + esc(r.sku) + '</b></td><td data-label="">' + esc(r._name) + '</td><td data-label="">' + esc(r._branch) + '</td><td data-label=""><span class="badge low">' + num(r.qty_available) + '</span></td></tr>').join('') + '</tbody></table></div><div style="margin-top:6px;"><button type="button" class="btn small secondary" data-go="stock:low">See all ' + num(low.length) + '</button></div>' : '<p class="muted">Nothing is low.</p>') + '</div></div>' +
    '<div class="card"><h3 class="im-h">Counts due</h3>' + (dueTop.length ? '<div class="table-scroll table-mini"><table><tbody>' + dueTop.map((r) => '<tr><td data-label=""><b>' + esc(r.sku) + '</b></td><td data-label="">' + esc(r._name) + '</td><td data-label="">' + esc(r._branch) + '</td><td data-label="">' + (r._last ? 'last ' + fmtDate(r._last) : '<span class="muted">never counted</span>') + '</td></tr>').join('') + '</tbody></table></div><div style="margin-top:6px;"><button type="button" class="btn small secondary" data-go="counts:due">See all ' + num(overdue.length) + '</button></div>' : '<p class="muted">No counts are due.</p>') + '</div>';

  const go = (target) => {
    const [tab, arg] = String(target).split(':');
    if (tab === 'stock') ctx.showTab('stock', { status: arg || 'all', search: '', branch: 'all' });
    else if (tab === 'approvals') ctx.showTab('approvals', { sub: arg });
    else if (tab === 'counts') ctx.showTab('counts', { view: arg || 'recent' });
    else ctx.showTab(tab);
  };
  panel.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  panel.querySelectorAll('[data-open-req]').forEach((b) => b.addEventListener('click', () => ctx.openRequest(Number(b.dataset.openReq))));
  panel.querySelectorAll('[data-open-del]').forEach((b) => b.addEventListener('click', () => ctx.openDelete(Number(b.dataset.openDel))));
}
