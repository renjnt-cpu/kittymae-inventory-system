// Assets & Supplies Custodian -- the process tabs: Asset Transfers, Returns, Maintenance & Repairs, Lost / Damaged and Disposals. Each is a
// work list over one kind of record (open ones first), with the actions the viewer may take on each row. The asset itself is always opened
// from here, never copied: these lists read the same register as the Assets tab.
import { esc, plural, field, opts, dt, dash, money, flowBadge, statusBadge, tagBadge, branchName, emptyBox, qty } from './assetsUi.js?v=20261007c';
import { OPEN_REPAIR, OPEN_INCIDENT, OPEN_DISPOSAL, REPAIR_TYPES, REPAIR_STATUSES, INCIDENT_TYPES, TRANSFER_OPEN, daysBetween, dayOf, repairCostFlag, sum } from './assetsLogic.js?v=20261007c';
import { exportFlow } from './assetsReports.js?v=20261007c';
import { exportMenu } from './assetsList.js?v=20261007c';

const $ = (id) => document.getElementById(id);
export const newFlowState = () => ({ transfers: { q: '', status: 'open', type: '' }, returns: { q: '', days: '30', show: 'expected' }, repairs: { q: '', status: 'open', type: '' }, incidents: { q: '', status: 'open', type: '' }, disposals: { q: '', status: 'open' } });
const person = (ctx, id) => esc(ctx.names[id] || '—');
const assetCell = (ctx, a) => (a ? '<button type="button" class="bl-link" data-fa="asset" data-id="' + a.id + '">' + esc(a.asset_number) + '</button><div class="muted bl-sub">' + esc(a.name) + '</div>' : '<span class="muted">an asset you cannot see</span>');
const th = (h) => '<th>' + h + '</th>';
const table = (head, rows) => '<div class="table-scroll table-2col bl-tablewrap"><table class="bl-table"><thead><tr>' + head.map(th).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
const btn = (act, id, label, cls) => '<button type="button" class="btn small' + (cls ? ' ' + cls : '') + '" data-fa="' + act + '" data-id="' + id + '">' + label + '</button>';
const toolbar = (id, st, { statuses, statusLabel, types, typeLabel, extra, exp }) => '<div class="card bl-toolbar"><div class="bl-toolrow"><div class="field bl-grow"><label>Search</label><input type="search" id="' + id + '-q" placeholder="Number, asset, person…" value="' + esc(st.q) + '"></div>' +
  (statuses ? field(statusLabel || 'Show', '<select id="' + id + '-status">' + opts(statuses, st.status) + '</select>') : '') + (types ? field(typeLabel || 'Type', '<select id="' + id + '-type">' + opts(types, st.type, 'Any') + '</select>') : '') + (extra || '') +
  '<div class="field"><label>&nbsp;</label>' + (exp ? exportMenu() : '') + '</div></div></div>';
function wireToolbar(ctx, root, id, st, rowsForExport, label) {
  let t = null;
  $(id + '-q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value; ctx.rerender(); const s = $(id + '-q'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 300); });
  if ($(id + '-status')) $(id + '-status').addEventListener('change', (e) => { st.status = e.target.value; ctx.rerender(); });
  if ($(id + '-type')) $(id + '-type').addEventListener('change', (e) => { st.type = e.target.value; ctx.rerender(); });
  root.querySelectorAll('[data-exp]').forEach((el) => el.addEventListener('click', async () => { el.closest('details').open = false; try { await exportFlow(ctx, label, rowsForExport(), el.dataset.exp); } catch (err) { ctx.toast(err, true); } }));
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-fa]');
    if (!el) return;
    const idn = Number(el.dataset.id), a = ctx.byId.get(idn);
    const run = {
      asset: () => ctx.openAsset(idn), tapprove: () => ctx.work.transferAction(idn, 'approve'), trelease: () => ctx.work.transferAction(idn, 'release'), treceive: () => ctx.work.transferAction(idn, 'receive'), tcancel: () => ctx.work.transferAction(idn, 'cancel'), treject: () => ctx.work.transferAction(idn, 'reject'),
      trprint: () => ctx.print.form('transfer', idn), repairupdate: () => ctx.cases.repairUpdate(idn), increview: () => ctx.cases.reviewIncident(idn), incresolve: () => ctx.cases.resolveIncident(idn),
      disapprove: () => ctx.cases.disposalAction(idn, 'approve'), disreject: () => ctx.cases.disposalAction(idn, 'reject'), discomplete: () => ctx.cases.disposalAction(idn, 'complete'), discancel: () => ctx.cases.disposalAction(idn, 'cancel'),
      return: () => ctx.work.returnAsset(idn), callback: () => ctx.work.callBack(idn), maint: () => ctx.cases.repairNew(idn, { type: 'Preventive Maintenance' }), disprint: () => ctx.print.form('disposal', idn), retprint: () => ctx.print.form('return', idn),
    }[el.dataset.fa];
    if (run) { e.preventDefault(); Promise.resolve(run()).catch((err) => ctx.toast(err, true)); }
    return a;
  });
}
const match = (q, ...parts) => !q || parts.join(' ').toLowerCase().includes(q.trim().toLowerCase());
const empty = (msg) => emptyBox(msg);

// ================================================================ asset transfers
export function renderTransfers(ctx, panel) {
  const st = ctx.ui.flow.transfers, c = ctx.caps;
  const all = ctx.data.transfers.map((t) => ({ t, a: ctx.byId.get(t.asset_id) }));
  const rows = all.filter(({ t, a }) => (st.status === 'all' || (st.status === 'open' ? TRANSFER_OPEN.includes(t.status) : t.status === st.status)) && (!st.type || t.transfer_type === st.type) &&
    match(st.q, t.transfer_number, a && a.asset_number, a && a.name, ctx.names[t.requested_by], branchName(ctx, t.from_branch_id), branchName(ctx, t.to_branch_id), ctx.names[t.from_employee_id], ctx.names[t.to_employee_id])).sort((x, y) => (TRANSFER_OPEN.includes(y.t.status) - TRANSFER_OPEN.includes(x.t.status)) || y.t.id - x.t.id);
  const routeRaw = (t) => (t.transfer_type === 'Employee' ? (ctx.names[t.from_employee_id] || '—') + ' → ' + (ctx.names[t.to_employee_id] || '—') : branchName(ctx, t.from_branch_id) + ' → ' + branchName(ctx, t.to_branch_id));
  const route = (t) => esc(routeRaw(t));
  const act = (t) => '<div class="bl-rowact">' + (t.transfer_type === 'Branch' ? [t.status === 'Requested' && c.canApproveTransfer(t) ? btn('tapprove', t.id, 'Approve') : '', t.status === 'Approved' && c.canTransfer ? btn('trelease', t.id, 'Release') : '', t.status === 'In Transit' && c.canTransfer ? btn('treceive', t.id, 'Receive') : '',
    ['Requested', 'Approved'].includes(t.status) && (c.mgr || t.requested_by === ctx.employee.id) ? btn('tcancel', t.id, 'Cancel', 'secondary') : '', ['Requested', 'Approved'].includes(t.status) && c.mgr ? btn('treject', t.id, 'Reject', 'secondary') : ''].join('') : '') +
    (t.transfer_type === 'Branch' ? btn('trprint', t.asset_id, 'Print form', 'secondary') : '') + '</div>';
  const tr = ({ t, a }) => '<tr><td data-label="Transfer"><b>' + esc(t.transfer_number) + '</b><div class="muted bl-sub">' + esc(t.transfer_type) + ' · ' + esc(dt(dayOf(t.created_at))) + '</div></td><td data-label="Asset">' + assetCell(ctx, a) + '</td><td data-label="From → to" class="full-row">' + route(t) + '<div class="muted bl-sub">' + esc(t.reason || '') + '</div></td>' +
    '<td data-label="Status">' + flowBadge(t.status) + (TRANSFER_OPEN.includes(t.status) && daysBetween(dayOf(t.created_at), ctx.today) > ctx.settings.transfer_wait_days ? '<div class="lv-neg bl-sub">waiting ' + daysBetween(dayOf(t.created_at), ctx.today) + ' days</div>' : '') + '</td>' +
    '<td data-label="Requested">' + person(ctx, t.requested_by) + '</td><td data-label="Approved / released / received" class="full-row"><span class="muted">' + [t.approved_at ? 'approved ' + person(ctx, t.approved_by) : '', t.released_at ? 'released ' + person(ctx, t.released_by) : '', t.received_at ? 'received ' + person(ctx, t.received_by) : ''].filter(Boolean).join('<br>') + '</span></td><td class="full-row">' + act(t) + '</td></tr>';
  panel.innerHTML = '<div id="ac-fl">' + toolbar('ac-tr', st, { statuses: [{ value: 'open', label: 'Open (waiting)' }, { value: 'all', label: 'All' }, 'Requested', 'Approved', 'In Transit', 'Completed', 'Rejected', 'Cancelled'], types: ['Branch', 'Employee'], exp: true }) +
    '<div class="bl-summary"><b>' + plural(rows.length, 'transfer') + '</b><span>Open <b>' + all.filter(({ t }) => TRANSFER_OPEN.includes(t.status)).length + '</b></span><span class="muted">Branch transfers: request → approval → release → receipt. Employee transfers are one step and are recorded in both people’s history.</span></div>' +
    (rows.length ? table(['Transfer', 'Asset', 'From → to', 'Status', 'Requested by', 'Progress', ''], rows.map(tr)) : empty('No transfer matches.')) + '</div>';
  wireToolbar(ctx, $('ac-fl'), 'ac-tr', st, () => rows.map(({ t, a }) => ({ number: t.transfer_number, type: t.transfer_type, asset: a ? a.asset_number + ' ' + a.name : '', route: routeRaw(t), status: t.status, requested_by: ctx.names[t.requested_by] || '', requested: dayOf(t.created_at), reason: t.reason || '' })), 'transfers');
}

// ================================================================ returns
export function renderReturns(ctx, panel) {
  const st = ctx.ui.flow.returns, c = ctx.caps, today = ctx.today;
  const expected = ctx.assets.filter((a) => a._asg && (a.status === 'For Return' || (a._asg.expected_return_date && a._asg.expected_return_date < today))).filter((a) => match(st.q, a.asset_number, a.name, a._holder, a._where)).sort((x, y) => String(x._asg.expected_return_date || '9').localeCompare(String(y._asg.expected_return_date || '9')));
  const cutoff = st.days === 'all' ? '' : (() => { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - Number(st.days)); return d.toISOString().slice(0, 10); })();
  const done = ctx.data.assignments.filter((x) => x.returned_at && x.end_reason === 'Returned' && (!cutoff || x.returned_on >= cutoff)).map((x) => ({ x, a: ctx.byId.get(x.asset_id) })).filter(({ x, a }) => match(st.q, a && a.asset_number, a && a.name, ctx.names[x.employee_id])).sort((p, q2) => String(q2.x.returned_at).localeCompare(String(p.x.returned_at)));
  const etr = (a) => '<tr><td data-label="Asset">' + assetCell(ctx, a) + '</td><td data-label="Holder">' + esc(a._asg.assignee_type === 'Employee' ? a._holder : a._where) + (a._holderLeft ? ' ' + tagBadge('Left', 'ac-tag-bad') : '') + '</td><td data-label="Status">' + statusBadge(a.status) + '</td>' +
    '<td data-label="Expected back">' + (a._asg.expected_return_date ? dt(a._asg.expected_return_date) + (a._asg.expected_return_date < today ? ' <b class="lv-neg">overdue</b>' : '') : '—') + '</td><td class="full-row"><div class="bl-rowact">' + (c.canReturnAsset(a) ? btn('return', a.id, 'Receive return') : '') + (c.canCallBack(a) ? btn('callback', a.id, 'Ask for return', 'secondary') : '') + '</div></td></tr>';
  const dtr = ({ x, a }) => '<tr><td data-label="Asset">' + assetCell(ctx, a) + '</td><td data-label="Returned by">' + person(ctx, x.employee_id) + '</td><td data-label="Returned">' + dt(x.returned_on) + '</td><td data-label="Condition">' + esc((x.condition_out || '—') + ' → ' + (x.condition_in || '—')) + '</td>' +
    '<td data-label="Missing accessories">' + ((x.accessories_missing || []).length ? '<b class="lv-neg">' + esc(x.accessories_missing.join(', ')) + '</b>' : '—') + '</td><td data-label="Received by">' + person(ctx, x.return_received_by) + '</td><td class="full-row">' + (a ? '<div class="bl-rowact">' + btn('retprint', a.id, 'Print form', 'secondary') + '</div>' : '') + '</td></tr>';
  panel.innerHTML = '<div id="ac-fl">' + toolbar('ac-rt', st, { extra: field('Returned in the last', '<select id="ac-rt-days">' + opts([{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: 'all', label: 'All time' }], st.days) + '</select>'), exp: true }) +
    '<div class="card bl-panel"><h3 class="bl-h">Expected back <span class="muted">· asked for, or past the expected date</span></h3>' + (expected.length ? table(['Asset', 'Holder', 'Status', 'Expected back', ''], expected.map(etr)) : '<p class="lv-pos">Nothing is waiting to come back. ✓</p>') + '</div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Returns received <span class="muted">· ' + plural(done.length, 'return') + '</span></h3>' + (done.length ? table(['Asset', 'Returned by', 'Returned', 'Condition out → in', 'Missing accessories', 'Received by', ''], done.slice(0, 200).map(dtr)) : empty('No returns in this period.')) + '</div></div>';
  wireToolbar(ctx, $('ac-fl'), 'ac-rt', st, () => done.map(({ x, a }) => ({ asset: a ? a.asset_number + ' ' + a.name : '', returned_by: ctx.names[x.employee_id] || '', returned: x.returned_on || '', condition_out: x.condition_out || '', condition_in: x.condition_in || '', missing: (x.accessories_missing || []).join(', '), received_by: ctx.names[x.return_received_by] || '' })), 'returns');
  $('ac-rt-days').addEventListener('change', (e) => { st.days = e.target.value; ctx.rerender(); });
}

// ================================================================ maintenance & repairs
export function renderRepairs(ctx, panel) {
  const st = ctx.ui.flow.repairs, c = ctx.caps, cost = new Map(ctx.data.repairCosts.map((r) => [r.repair_id, r.repair_cost]));
  const overdue = (r, a) => a && a._att.some((x) => x.code === 'repair_overdue') && OPEN_REPAIR.includes(r.status);
  const all = ctx.data.repairs.map((r) => ({ r, a: ctx.byId.get(r.asset_id) }));
  const rows = all.filter(({ r, a }) => (st.status === 'all' || (st.status === 'open' ? OPEN_REPAIR.includes(r.status) : st.status === 'overdue' ? overdue(r, a) : r.status === st.status)) && (!st.type || r.repair_type === st.type) &&
    match(st.q, r.repair_number, a && a.asset_number, a && a.name, r.issue, r.service_provider)).sort((x, y) => (OPEN_REPAIR.includes(y.r.status) - OPEN_REPAIR.includes(x.r.status)) || y.r.id - x.r.id);
  const due = ctx.assets.filter((a) => a._att.some((x) => x.code === 'maintenance_due')).sort((x, y) => (x._maintDays ?? 0) - (y._maintDays ?? 0));
  const total = c.viewCost ? sum(rows, ({ r }) => cost.get(r.id) || 0) : null;
  const tr = ({ r, a }) => '<tr><td data-label="Repair"><button type="button" class="bl-link" data-fa="repairupdate" data-id="' + r.id + '">' + esc(r.repair_number) + '</button><div class="muted bl-sub">' + esc(r.repair_type) + '</div></td><td data-label="Asset">' + assetCell(ctx, a) + '</td>' +
    '<td data-label="Status">' + flowBadge(r.status) + (overdue(r, a) ? '<div class="lv-neg bl-sub">overdue</div>' : '') + '</td><td data-label="Problem" class="full-row">' + esc(String(r.issue).slice(0, 140)) + (r.service_provider ? '<div class="muted bl-sub">' + esc(r.service_provider) + '</div>' : '') + '</td>' +
    '<td data-label="Reported">' + dt(dayOf(r.reported_at)) + '</td><td data-label="Back by / done">' + (r.completed_at ? dt(dayOf(r.completed_at)) : r.expected_completion ? dt(r.expected_completion) : '—') + '</td>' + (c.viewCost ? '<td data-label="Cost">' + (cost.has(r.id) ? money(cost.get(r.id)) : '—') + '</td>' : '') +
    '<td class="full-row">' + (c.canRepair ? '<div class="bl-rowact">' + btn('repairupdate', r.id, OPEN_REPAIR.includes(r.status) ? 'Update' : 'View', 'secondary') + '</div>' : '') + '</td></tr>';
  panel.innerHTML = '<div id="ac-fl">' + toolbar('ac-rp', st, { statuses: [{ value: 'open', label: 'Open' }, { value: 'overdue', label: 'Overdue' }, { value: 'all', label: 'All' }, ...REPAIR_STATUSES], types: REPAIR_TYPES, exp: true }) +
    '<div class="bl-summary"><b>' + plural(rows.length, 'repair') + '</b><span>Open <b>' + all.filter(({ r }) => OPEN_REPAIR.includes(r.status)).length + '</b></span>' + (total !== null ? '<span>Cost of these <b>' + money(total) + '</b></span>' : '') + '</div>' +
    (due.length ? '<div class="card bl-panel"><h3 class="bl-h">Due for maintenance <span class="muted">· ' + due.length + '</span></h3>' + table(['Asset', 'Due', 'Last done', ''], due.slice(0, 15).map((a) => '<tr><td data-label="Asset">' + assetCell(ctx, a) + '</td><td data-label="Due">' + (a._maintDays < 0 ? '<b class="lv-neg">overdue by ' + (-a._maintDays) + ' days</b>' : 'in ' + a._maintDays + ' days') + ' <span class="muted">(' + esc(dt(a.next_maintenance_due)) + ')</span></td><td data-label="Last done">' + (a.last_maintenance_on ? dt(a.last_maintenance_on) : 'never') + '</td><td class="full-row">' + (c.canSendRepair(a) ? '<div class="bl-rowact">' + btn('maint', a.id, 'Log maintenance') + '</div>' : '') + '</td></tr>')) + '</div>' : '') +
    (rows.length ? table(['Repair', 'Asset', 'Status', 'Problem', 'Reported', 'Back by / done', ...(c.viewCost ? ['Cost'] : []), ''], rows.map(tr)) : empty('No repair or maintenance matches.')) + '<p class="muted">An asset under repair stays on its holder’s record. A repair that cannot be fixed is declared unrepairable — it is never disposed of automatically.</p></div>';
  wireToolbar(ctx, $('ac-fl'), 'ac-rp', st, () => rows.map(({ r, a }) => ({ repair: r.repair_number, type: r.repair_type, asset: a ? a.asset_number + ' ' + a.name : '', status: r.status, problem: r.issue, provider: r.service_provider || '', reported: dayOf(r.reported_at), expected: r.expected_completion || '', completed: r.completed_at ? dayOf(r.completed_at) : '', ...(c.viewCost ? { cost: cost.get(r.id) ?? '' } : {}) })), 'repairs');
}

// ================================================================ lost / damaged
export function renderIncidents(ctx, panel) {
  const st = ctx.ui.flow.incidents, c = ctx.caps;
  const all = ctx.data.incidents.map((i) => ({ i, a: ctx.byId.get(i.asset_id) }));
  const rows = all.filter(({ i, a }) => (st.status === 'all' || (st.status === 'open' ? OPEN_INCIDENT.includes(i.status) : i.status === st.status)) && (!st.type || i.incident_type === st.type) && match(st.q, i.incident_number, a && a.asset_number, a && a.name, i.description, ctx.names[i.reported_by], ctx.names[i.custodian_id])).sort((x, y) => (OPEN_INCIDENT.includes(y.i.status) - OPEN_INCIDENT.includes(x.i.status)) || y.i.id - x.i.id);
  const tr = ({ i, a }) => '<tr><td data-label="Report"><b>' + esc(i.incident_number) + '</b><div class="muted bl-sub">' + esc(i.incident_type) + (i.legacy ? ' · from the old list' : '') + '</div></td><td data-label="Asset">' + assetCell(ctx, a) + '</td><td data-label="Status">' + flowBadge(i.status) + '</td>' +
    '<td data-label="What happened" class="full-row">' + esc(String(i.description).slice(0, 160)) + (i.last_known_location ? '<div class="muted bl-sub">last seen ' + esc(i.last_known_location) + '</div>' : '') + (i.recommended_action ? '<div class="bl-sub">Recommended: <b>' + esc(i.recommended_action) + '</b></div>' : '') + '</td>' +
    '<td data-label="Reported by">' + person(ctx, i.reported_by) + '<div class="muted bl-sub">' + esc(dt(i.incident_date || dayOf(i.reported_at))) + '</div></td><td data-label="Holder then">' + person(ctx, i.custodian_id) + '</td><td data-label="Outcome" class="full-row">' + (i.resolution ? '<b>' + esc(i.resolution) + '</b>' + (i.accountability_decision ? '<div class="muted bl-sub">' + esc(i.accountability_decision) + '</div>' : '') : '—') + '</td>' +
    '<td class="full-row"><div class="bl-rowact">' + (OPEN_INCIDENT.includes(i.status) && c.canReviewIncident ? btn('increview', i.id, 'Review', 'secondary') : '') + (OPEN_INCIDENT.includes(i.status) && c.canResolveIncident ? btn('incresolve', i.id, 'Resolve') : '') + '</div></td></tr>';
  panel.innerHTML = '<div id="ac-fl">' + toolbar('ac-in', st, { statuses: [{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }, 'Reported', 'Under Review', 'Resolved'], types: INCIDENT_TYPES, exp: true }) +
    '<div class="bl-summary"><b>' + plural(rows.length, 'report') + '</b><span>Open <b class="' + (all.some(({ i }) => OPEN_INCIDENT.includes(i.status)) ? 'lv-neg' : '') + '">' + all.filter(({ i }) => OPEN_INCIDENT.includes(i.status)).length + '</b></span><span class="muted">A lost or missing asset can only come back through “Found”. Nobody is charged automatically — a manager writes down any decision.</span></div>' +
    (rows.length ? table(['Report', 'Asset', 'Status', 'What happened', 'Reported by', 'Holder then', 'Outcome', ''], rows.map(tr)) : empty('No report matches.')) + '</div>';
  wireToolbar(ctx, $('ac-fl'), 'ac-in', st, () => rows.map(({ i, a }) => ({ report: i.incident_number, type: i.incident_type, asset: a ? a.asset_number + ' ' + a.name : '', status: i.status, description: i.description, reported_by: ctx.names[i.reported_by] || '', date: i.incident_date || dayOf(i.reported_at), holder_then: ctx.names[i.custodian_id] || '', resolution: i.resolution || '', decision: i.accountability_decision || '' })), 'lost-damaged');
}

// ================================================================ disposals
export function renderDisposals(ctx, panel) {
  const st = ctx.ui.flow.disposals, c = ctx.caps;
  const all = ctx.data.disposals.map((d) => ({ d, a: ctx.byId.get(d.asset_id) }));
  const rows = all.filter(({ d, a }) => (st.status === 'all' || (st.status === 'open' ? OPEN_DISPOSAL.includes(d.status) : d.status === st.status)) && match(st.q, d.disposal_number, a && a.asset_number, a && a.name, d.reason, ctx.names[d.requested_by])).sort((x, y) => (OPEN_DISPOSAL.includes(y.d.status) - OPEN_DISPOSAL.includes(x.d.status)) || y.d.id - x.d.id);
  const worth = ctx.assets.filter((a) => c.canRequestDisposal(a) && ['Damaged', 'Lost'].includes(a.status)).slice(0, 6);
  const tr = ({ d, a }) => '<tr><td data-label="Disposal"><b>' + esc(d.disposal_number) + '</b></td><td data-label="Asset">' + assetCell(ctx, a) + '</td><td data-label="Status">' + flowBadge(d.status) + '</td><td data-label="Why" class="full-row">' + esc(String(d.reason).slice(0, 140)) + (d.recommendation ? '<div class="muted bl-sub">' + esc(d.recommendation) + '</div>' : '') + '</td>' +
    '<td data-label="Requested by">' + person(ctx, d.requested_by) + '<div class="muted bl-sub">' + esc(dt(dayOf(d.requested_at))) + '</div></td><td data-label="Approved by">' + (d.approved_at ? person(ctx, d.approved_by) : '—') + '</td><td data-label="Disposed">' + (d.disposal_method ? esc(d.disposal_method) + '<div class="muted bl-sub">' + esc(dt(d.disposal_date)) + '</div>' : '—') + '</td>' +
    '<td class="full-row"><div class="bl-rowact">' + (d.status === 'Pending Approval' && c.canApproveDisposal(d) ? btn('disapprove', d.id, 'Approve') + btn('disreject', d.id, 'Reject', 'secondary') : '') + (d.status === 'Approved for Disposal' && c.canDispose ? btn('discomplete', d.id, 'Mark as disposed') : '') +
    (OPEN_DISPOSAL.includes(d.status) && (c.canDispose || d.requested_by === ctx.employee.id) ? btn('discancel', d.id, 'Cancel', 'secondary') : '') + (a ? btn('disprint', a.id, 'Print form', 'secondary') : '') + '</div></td></tr>';
  panel.innerHTML = '<div id="ac-fl">' + toolbar('ac-ds', st, { statuses: [{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }, 'Pending Approval', 'Approved for Disposal', 'Disposed', 'Rejected', 'Cancelled'], exp: true }) +
    '<div class="bl-summary"><b>' + plural(rows.length, 'disposal') + '</b><span>Open <b>' + all.filter(({ d }) => OPEN_DISPOSAL.includes(d.status)).length + '</b></span><span class="muted">Request → approval by a different manager → marked disposed. A disposed asset is never deleted and can never be assigned again.</span></div>' +
    (worth.length ? '<div class="msg lv-note"><b>Could be put forward for disposal:</b> ' + worth.map((a) => '<button type="button" class="bl-link" data-fa="asset" data-id="' + a.id + '">' + esc(a.asset_number) + '</button> ' + esc(a.name) + ' (' + esc(a.status.toLowerCase()) + ')').join(' · ') + '</div>' : '') +
    (rows.length ? table(['Disposal', 'Asset', 'Status', 'Why', 'Requested by', 'Approved by', 'Disposed', ''], rows.map(tr)) : empty('No disposal matches.')) + '</div>';
  wireToolbar(ctx, $('ac-fl'), 'ac-ds', st, () => rows.map(({ d, a }) => ({ disposal: d.disposal_number, asset: a ? a.asset_number + ' ' + a.name : '', status: d.status, reason: d.reason, requested_by: ctx.names[d.requested_by] || '', requested: dayOf(d.requested_at), approved_by: ctx.names[d.approved_by] || '', method: d.disposal_method || '', disposed: d.disposal_date || '' })), 'disposals');
}
