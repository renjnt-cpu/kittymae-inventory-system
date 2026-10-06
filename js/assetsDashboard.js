// Assets & Supplies Custodian -- the Dashboard tab: KPI cards, "Attention needed" with quick actions, charts and recent activity.
// The counts come from the database (custodian_dashboard), which counts only what this person may see -- a branch supervisor's numbers
// are their branch's, a custodian's are every branch's. Clicking a card or a "View all" opens the matching list, already filtered.
import { esc, kpiCard, donut, hbars, statusColor, fmtDateTime, plural, COLORS, emptyBox, alertItem } from './assetsUi.js?v=20261007g';
import { peopleRows } from './assetsLogic.js?v=20261007g';

const SECTIONS = [
  { id: 'missing_unreturned', title: 'Missing, lost or unreturned assets', tone: 'red', go: 'view:lost', empty: 'Nothing is reported lost, missing or overdue for return.' },
  { id: 'damaged', title: 'Damaged assets waiting for a decision', tone: 'red', go: 'view:damaged', empty: 'No asset is sitting damaged.' },
  { id: 'resigned_holding', title: 'Former employees who still hold company property', tone: 'red', go: 'view:left', empty: 'Nobody who has left still holds company property.' },
  { id: 'repair_overdue', title: 'Under repair for too long', tone: 'orange', go: 'tab:repairs', empty: 'Every repair is within its time limit.' },
  { id: 'transfers_waiting', title: 'Asset transfers not yet confirmed', tone: 'orange', go: 'tab:transfers', empty: 'No transfer is waiting longer than the limit.' },
  { id: 'unacknowledged', title: 'Assigned assets the employee has not confirmed', tone: 'orange', go: 'tab:people', empty: 'Every recent assignment has been acknowledged.' },
  { id: 'maintenance_due', title: 'Due for maintenance', tone: 'orange', go: 'view:maintenance', empty: 'No asset is due for maintenance soon.' },
  { id: 'warranty_expiring', title: 'Warranty ending soon', tone: 'yellow', go: 'view:warranty', empty: 'No warranty ends within the warning period.' },
  { id: 'warranty_expired', title: 'Warranty already ended', tone: 'gray', go: 'q:warranty=expired', empty: 'No asset is past its warranty.' },
  { id: 'no_custodian', title: 'Assets with no custodian recorded', tone: 'yellow', go: 'view:nocustodian', empty: 'Every unassigned asset has a custodian.' },
  { id: 'no_location', title: 'Assets with no branch or location', tone: 'yellow', go: 'view:attention', empty: 'Every asset has a branch or a location.' },
  { id: 'supplies_out', title: 'Supplies out of stock', tone: 'red', go: 'tab:supplies', empty: 'No supply is out of stock.', supply: true },
  { id: 'supplies_low', title: 'Supplies running low', tone: 'orange', go: 'tab:supplies', empty: 'No supply is below its minimum level.', supply: true },
  { id: 'requests_waiting', title: 'Supply requests waiting for a decision', tone: 'orange', go: 'tab:requests', empty: 'No supply request is waiting.', supply: true, request: true },
];

function quick(ctx, sec, it) {
  // buttons that fit the row; each opens the right panel (the database re-checks the action when it is pressed)
  const a = sec.supply || sec.request ? null : ctx.byId.get(it.id), c = ctx.caps, b = [];
  const btn = (act, label) => '<button type="button" class="btn small secondary" data-q="' + act + '" data-id="' + it.id + '">' + label + '</button>';
  if (a) {
    if (sec.id === 'damaged' && c.canSendRepair(a)) b.push(btn('repair', 'Send for repair'));
    if (sec.id === 'damaged' && a._incident && c.canResolveIncident) b.push(btn('resolve', 'Resolve report'));
    if (sec.id === 'missing_unreturned' && a._incident && c.canResolveIncident) b.push(btn('resolve', 'Resolve report'));
    if (sec.id === 'missing_unreturned' && a.status === 'For Return' && c.canReturnAsset(a)) b.push(btn('return', 'Receive return'));
    if (sec.id === 'resigned_holding' && c.canReturnAsset(a)) b.push(btn('return', 'Receive return'));
    if (sec.id === 'resigned_holding' && c.canCallBack(a)) b.push(btn('callback', 'Ask for return'));
    if (sec.id === 'repair_overdue' && c.canRepair && a._repair) b.push(btn('repairupdate', 'Update repair'));
    if (sec.id === 'maintenance_due' && c.canSendRepair(a)) b.push(btn('maint', 'Log maintenance'));
    if (sec.id === 'no_custodian' && c.canEditAsset(a)) b.push(btn('edit', 'Set custodian'));
    if (sec.id === 'no_location' && c.canEditAsset(a)) b.push(btn('edit', 'Set location'));
    if (sec.id === 'transfers_waiting') { const t = a._transfer; if (t && c.canApproveTransfer(t)) b.push(btn('tapprove', 'Approve')); if (t && t.status === 'Approved' && c.canTransfer) b.push(btn('trelease', 'Release')); if (t && t.status === 'In Transit' && c.canTransfer) b.push(btn('treceive', 'Receive')); }
    if (sec.id === 'unacknowledged' && c.canAssign) b.push(btn('openasset', 'View'));
  }
  if (sec.id === 'requests_waiting' && (c.mgr || c.sManage)) b.push(btn('req', 'Review'));
  if (sec.supply && !sec.request && (c.sManage || c.sIssue)) b.push(btn('receive', 'Receive stock'));
  return b.length ? '<div class="bl-rowact">' + b.join('') + '</div>' : '';
}

function section(ctx, s, d) {
  const x = (d.attention || {})[s.id] || { count: 0, items: [] };
  const head = '<div class="bl-alert-head bl-tone-' + s.tone + '"><h4>' + esc(s.title) + '</h4><span>' + x.count + '</span></div>';
  if (!x.count) return '<div class="bl-alert" id="ac-al-' + s.id + '">' + head + '<p class="muted bl-alert-empty">' + esc(s.empty) + '</p></div>';
  const row = (it) => '<div class="bl-alert-row"><div class="bl-alert-main"><button type="button" class="bl-link" data-open="' + (s.request ? 'request' : s.supply ? 'supply' : 'asset') + '" data-id="' + it.id + '">' + esc(it.asset_number) + '</button> <b>' + esc(it.name) + '</b>' +
    '<div class="muted">' + esc(it.detail) + '</div></div><div class="bl-alert-actions">' + quick(ctx, s, it) + '</div></div>';
  return '<div class="bl-alert" id="ac-al-' + s.id + '">' + head + x.items.map(row).join('') + (x.count > x.items.length ? '<p class="muted bl-alert-more">Showing ' + x.items.length + ' of ' + x.count + '. <button type="button" class="bl-link" data-go="' + esc(s.go) + '">View all ' + x.count + '</button></p>' : '<p class="muted bl-alert-more"><button type="button" class="bl-link" data-go="' + esc(s.go) + '">Open the list</button></p>') + '</div>';
}

function recentHtml(ctx) {
  const rows = ctx.recent || [];
  if (!rows.length) return '<div class="card bl-panel"><h3 class="bl-h">Recent activity</h3><p class="muted">Nothing has moved yet.</p></div>';
  return '<div class="card bl-panel"><h3 class="bl-h">Recent activity</h3><ul class="bl-recent">' + rows.map((m) => {
    const a = ctx.byId.get(m.asset_id);
    return '<li><div>' + (a ? '<button type="button" class="bl-link" data-open="asset" data-id="' + a.id + '">' + esc(a.asset_number) + '</button> ' + esc(a.name) : '<span class="muted">An asset you can no longer see</span>') +
      '<div class="muted">' + esc(m.movement_type) + (m.notes ? ' — ' + esc(String(m.notes).slice(0, 90)) : '') + '</div></div><span class="muted">' + esc(fmtDateTime(m.movement_date)) + '<br>' + esc(ctx.names[m.performed_by] || 'System') + '</span></li>';
  }).join('') + '</ul></div>';
}

export async function renderDashboard(ctx, panel) {
  if (!ctx.dash || Date.now() - ctx.dashAt > 60000) {
    panel.innerHTML = '<p class="muted">Counting…</p>';
    try { await ctx.loadDashboard(); } catch (err) { panel.innerHTML = '<div class="msg error">' + esc(err.message || String(err)) + '</div>'; return; }
  }
  const d = ctx.dash || { kpis: {}, attention: {}, charts: {} }, k = d.kpis || {}, c = ctx.caps;
  const tone = (n, t) => (n ? t : 'green');
  const assetKpis = c.viewAssets ? '<div class="bl-kpi-group"><h3 class="bl-h">Assets <span class="muted">' + (c.viewAll ? 'every branch' : 'your branch only') + '</span></h3><div class="bl-kpis">' +
    kpiCard({ label: 'Total assets', value: k.total ?? 0, sub: 'not disposed or archived', tone: 'blue', go: 'view:active' }) +
    kpiCard({ label: 'In use', value: k.in_use ?? 0, sub: 'used by a branch or department', tone: 'blue', go: 'view:inuse' }) +
    kpiCard({ label: 'Available', value: k.available ?? 0, sub: 'ready to assign', tone: 'green', go: 'view:available' }) +
    kpiCard({ label: 'Assigned to employees', value: k.assigned_employees ?? 0, sub: 'held by a person', tone: 'blue', go: 'view:assigned' }) +
    kpiCard({ label: 'Assigned to branches', value: k.assigned_branches ?? 0, sub: 'branch / department / place', tone: 'blue', go: 'view:inuse' }) +
    kpiCard({ label: 'Under repair', value: k.under_repair ?? 0, sub: 'repair or maintenance', tone: tone(k.under_repair, 'orange'), go: 'view:repair' }) +
    kpiCard({ label: 'Damaged', value: k.damaged ?? 0, sub: 'waiting for a decision', tone: tone(k.damaged, 'red'), go: 'view:damaged' }) +
    kpiCard({ label: 'Lost / missing', value: k.lost_missing ?? 0, sub: 'reported', tone: tone(k.lost_missing, 'red'), go: 'view:lost' }) +
    kpiCard({ label: 'For disposal', value: k.for_disposal ?? 0, sub: 'waiting for approval', tone: tone(k.for_disposal, 'yellow'), go: 'view:disposal' }) +
    kpiCard({ label: 'Disposed', value: k.disposed ?? 0, sub: 'kept in the history', tone: 'gray', go: 'view:disposed' }) +
    kpiCard({ label: 'Pending accountability', value: k.pending_accountability ?? 0, sub: 'employee has not confirmed', tone: tone(k.pending_accountability, 'yellow'), go: 'tab:people' }) +
    kpiCard({ label: 'Pending return', value: k.pending_return ?? 0, sub: 'asked to give it back', tone: tone(k.pending_return, 'orange'), go: 'q:status=For Return' }) +
    '</div></div>' : '';
  const supplyKpis = c.viewSupplies ? '<div class="bl-kpi-group"><h3 class="bl-h">Supplies <span class="muted">stock by branch</span></h3><div class="bl-kpis">' +
    kpiCard({ label: 'Supply items', value: k.supply_items ?? 0, sub: 'active in the catalogue', tone: 'blue', go: 'tab:supplies' }) +
    kpiCard({ label: 'Low stock', value: k.low_stock ?? 0, sub: 'branch counts at or below the minimum', tone: tone(k.low_stock, 'orange'), go: 'tab:supplies' }) +
    kpiCard({ label: 'Out of stock', value: k.out_of_stock ?? 0, sub: 'branch counts at zero', tone: tone(k.out_of_stock, 'red'), go: 'tab:supplies' }) + '</div></div>' : '';
  const sections = SECTIONS.filter((s) => (s.supply ? c.viewSupplies : c.viewAssets)).map((s) => section(ctx, s, d));
  const ch = d.charts || {};
  const statusItems = Object.entries(ch.by_status || {}).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, color: statusColor(label) }));
  const holders = c.viewAssets ? peopleRows(ctx).filter((r) => r.outstanding).slice(0, 8).map((r) => ({ label: r.name, value: r.outstanding })) : [];
  const total = statusItems.reduce((s, x) => s + x.value, 0);
  const charts = c.viewAssets ? '<div class="bl-charts"><div class="card bl-panel"><h3 class="bl-h">Assets by status</h3>' + donut(statusItems, { center: total, centerSub: 'assets' }) + '</div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Assets by category</h3>' + hbars((ch.by_category || []).slice(0, 10).map((x) => ({ label: x.name, value: x.count })), { color: COLORS.auto }) + '</div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Assets by branch</h3>' + hbars((ch.by_branch || []).map((x) => ({ label: x.name, value: x.count })), { color: '#7b5fb5' }) + '</div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Who holds the most</h3>' + hbars(holders, { color: COLORS.billed }) + '</div></div>' : '';
  const att = sections.length ? '<div class="card bl-panel"><h3 class="bl-h">Attention needed</h3>' + sections.join('') + '</div>' : '';
  panel.innerHTML = '<div id="ac-dash">' + assetKpis + supplyKpis + '<div class="bl-dash-grid"><div class="bl-dash-main">' + att + '</div><div class="bl-dash-side">' + (c.viewAssets ? recentHtml(ctx) : '') + '</div></div>' + charts + '</div>' +
    (!c.viewAssets && !c.viewSupplies ? emptyBox('Nothing to show.') : '');

  const root = panel.querySelector('#ac-dash');
  root.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', () => go(ctx, el.dataset.go)));
  root.querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', () => {
    const id = Number(el.dataset.id), kind = el.dataset.open;
    if (kind === 'supply') ctx.openSupply(id); else if (kind === 'request') ctx.openRequest(id); else ctx.openAsset(id);
  }));
  root.querySelectorAll('[data-q]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); quickRun(ctx, el.dataset.q, Number(el.dataset.id)); }));
}

/** 'view:lost' opens the Assets tab on that saved view; 'tab:repairs' opens that tab; 'q:status=For Return' opens Assets with a filter */
function go(ctx, spec) {
  const [kind, rest] = spec.split(/:(.*)/s);
  if (kind === 'view') return ctx.applyView(rest);
  if (kind === 'tab') return ctx.showTab(rest);
  if (kind === 'q') { const [key, ...v] = rest.split('='); ctx.ui.assets.q = { ...ctx.ui.assets.q, search: '', status: '', condition: '', warranty: '' }; return ctx.applyView('active', { [key]: v.join('=') }); }
}
function quickRun(ctx, act, id) {
  const run = {
    repair: () => ctx.cases.repairNew(id), resolve: () => { const a = ctx.byId.get(id); return a && a._incident ? ctx.cases.resolveIncident(a._incident.id) : ctx.openAsset(id); },
    return: () => ctx.work.returnAsset(id), callback: () => ctx.work.callBack(id), repairupdate: () => { const a = ctx.byId.get(id); return a && a._repair ? ctx.cases.repairUpdate(a._repair.id) : ctx.openAsset(id); },
    maint: () => ctx.cases.repairNew(id, { type: 'Preventive Maintenance' }), edit: () => ctx.openForm({ id }), openasset: () => ctx.openAsset(id),
    tapprove: () => { const a = ctx.byId.get(id); return a && a._transfer ? ctx.work.transferAction(a._transfer.id, 'approve') : ctx.openAsset(id); },
    trelease: () => { const a = ctx.byId.get(id); return a && a._transfer ? ctx.work.transferAction(a._transfer.id, 'release') : ctx.openAsset(id); },
    treceive: () => { const a = ctx.byId.get(id); return a && a._transfer ? ctx.work.transferAction(a._transfer.id, 'receive') : ctx.openAsset(id); },
    req: () => ctx.openRequest(id), receive: () => ctx.supplyActions.receive(ctx, id),
  }[act];
  if (run) Promise.resolve(run()).catch((err) => ctx.toast(err, true));
}
