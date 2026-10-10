// Assets & Supplies Custodian -- the asset card: one drawer per asset with its overview, who holds it (and every holder before), its permanent
// movement history, repairs, lost / damaged reports, files and photos, money (only for people who may see it) and the audit trail -- and
// every action a person is allowed to take on it. It opens as a drawer from anywhere. Details are view-only here; editing opens the form,
// and changing WHO holds an asset is never an edit -- it goes through Assign / Return / Transfer so the history stays true.
import { esc, kv, fmtDateTime, fmtBytes, dt, dash, money, qty, statusBadge, conditionBadge, flowBadge, chips, toneChip, branchChip, tagBadge, openDrawer, closeDrawer, drawerBody, isDrawerOpen, actionPanel, errorsText, friendly, branchName, field, val, must, setDetailHandlers } from './assetsUi.js?v=20261011a';
import { OPEN_REPAIR, OPEN_INCIDENT, repairCostFlag, daysBetween, dayOf } from './assetsLogic.js?v=20261011a';
import { menuItems } from './assetsActions.js?v=20261011a';

const $ = (id) => document.getElementById(id);
let currentId = null, activePane = 'overview';
let extras = { id: null, movements: [], files: [], audit: [], loaded: false, auditLoaded: false };
export const assetOpenId = () => (currentId !== null && isDrawerOpen('detail') ? currentId : null);
export function closeAsset() { currentId = null; activePane = 'overview'; }
const who = (ctx, id) => (id ? ctx.names[id] || 'Unknown' : '—');
const when = (iso) => (iso ? fmtDateTime(iso) : '—');
const short = (s, n = 160) => { const x = String(s ?? ''); return x.length > n ? x.slice(0, n - 3) + '…' : x; };

// ---------------------------------------------------------------- panes
function headerHtml(ctx, a) {
  const flag = ctx.caps.viewCost ? repairCostFlag(ctx, a) : null;
  let h = '<div id="ac-detail-msg"></div><div class="bl-d-head"><div class="bl-d-badges">' + statusBadge(a.status) + ' ' + conditionBadge(a.condition) + (a.legacy_item_id ? ' ' + tagBadge('Brought over from the old list', 'bl-tag-gray') : '') + '</div></div>';
  h += '<div class="bl-sum ac-sum4"><div class="bl-sum-cell"><span class="muted">Holder / where</span><b>' + esc(a._where) + '</b></div><div class="bl-sum-cell"><span class="muted">Branch</span><b>' + esc(a._branch || '—') + '</b></div>' +
    '<div class="bl-sum-cell"><span class="muted">Category</span><b>' + esc(a._category || '—') + '</b></div><div class="bl-sum-cell"><span class="muted">Last movement</span><b>' + esc(a.last_movement_at ? dayOf(a.last_movement_at) : '—') + '</b></div></div>';
  h += a._att.map((x) => '<div class="msg lv-warn ac-warn-' + x.tone + '"><b>' + (x.code === 'aging' || x.code === 'warranty_expired' ? 'Note:' : 'Needs attention:') + '</b> ' + esc(x.text) + '</div>').join('');
  if (flag) h += '<div class="msg lv-warn"><b>High repair cost:</b> repairs on this asset have cost ' + esc(money(a._repairCost)) + ' — about ' + flag.pct + '% of what it was worth. This is information only; nothing is disposed of automatically.</div>';
  if (a._disposal) h += '<div class="msg lv-warn"><b>Disposal ' + esc(a._disposal.status.toLowerCase()) + '</b> — ' + esc(a._disposal.reason) + '</div>';
  if (a._holderLeft) h += '<div class="msg error"><b>' + esc(a._holder) + '</b> is no longer an active employee and still holds this asset. Receive it back, or transfer it to another employee — it is never deleted.</div>';
  return h;
}
function overviewHtml(ctx, a) {
  const cust = a.custodian_id ? who(ctx, a.custodian_id) : a.custodian_label || '';
  return '<div class="drawer-section"><h4>Details</h4>' + kv('Asset number', '<b>' + esc(a.asset_number) + '</b>') + kv('Asset tag', esc(a.asset_tag || '—')) + kv('Name', esc(a.name)) + kv('Category', esc(a._category || '—')) +
    (a.description ? kv('Description', esc(a.description)) : '') + kv('Brand / model', esc([a.brand, a.model].filter(Boolean).join(' · ') || '—')) + kv('Serial number', esc(a.serial_number || '—')) +
    kv('Company', esc(a.company || '—')) + kv('Branch', branchChip(ctx, a.branch_id)) + kv('Department', esc(a.department || '—')) + kv('Location', esc(a.location || '—')) +
    kv('Custodian (responsible)', esc(cust || '—') + ' <span class="muted">looks after it — not the same as who uses it</span>') + kv('Ownership', esc(a.ownership_status)) + kv('Notes', esc(a.notes || '—')) + '</div>' +
    '<div class="drawer-section"><h4>Dates, warranty &amp; maintenance</h4>' + kv('Purchased', dt(a.purchase_date) + (a._age !== null ? ' <span class="muted">(' + a._age.toFixed(1) + ' years ago)</span>' : '')) +
    kv('Warranty', a.warranty_start || a.warranty_end ? esc([a.warranty_start, a.warranty_end].filter(Boolean).map((d) => d).join(' → ')) + ' ' + (a._warranty === 'expired' ? tagBadge('Ended', 'bl-tag-gray') : a._warranty === 'soon' ? tagBadge('Ending soon', 'bl-tag-yellow') : a._warranty === 'ok' ? tagBadge('In warranty', 'bl-tag-green') : '') : '<span class="muted">none recorded</span>') +
    (a.warranty_provider ? kv('Warranty provider', esc(a.warranty_provider)) : '') + (a.warranty_notes ? kv('Warranty notes', esc(a.warranty_notes)) : '') +
    kv('Maintenance', a.maintenance_interval_days ? 'every ' + a.maintenance_interval_days + ' days · last ' + esc(a.last_maintenance_on || 'never') + ' · next ' + esc(a.next_maintenance_due || '—') : '<span class="muted">no schedule</span>') + '</div>' +
    '<div class="drawer-section"><h4>Accessories that normally go with it</h4>' + (a._acc.length ? '<div class="ac-chips">' + a._acc.map((x) => '<span class="ac-chip">' + esc(x) + '</span>').join('') + '</div>' : '<p class="muted">None recorded.</p>') +
    (ctx.caps.canEditAsset(a) ? '<p><button type="button" class="btn small secondary" data-act="accessories">Change the accessory list</button></p>' : '') + '</div>' +
    '<div class="drawer-section"><h4>Record</h4>' + kv('Added', esc(when(a.created_at)) + ' <span class="muted">' + esc(who(ctx, a.created_by)) + '</span>') + kv('Last changed', esc(when(a.updated_at))) + '</div>';
}
function ackRow(ctx, a) {
  const o = a._asg;
  if (!o) return '';
  const roles = ['Employee', 'Supervisor', 'Custodian'], by = Object.fromEntries(a._acks.map((k) => [k.role, k]));
  return '<div class="ac-acks">' + roles.filter((r) => r !== 'Employee' || o.assignee_type === 'Employee').map((r) => by[r] ? '<span class="ac-ack ac-ack-yes">✓ ' + r + ' · ' + esc(who(ctx, by[r].employee_id)) + ' · ' + esc(dayOf(by[r].acknowledged_at)) + '</span>' : '<span class="ac-ack ac-ack-no">' + r + ' — not yet</span>').join('') + '</div>';
}
function assignmentHtml(ctx, a) {
  const o = a._asg, c = ctx.caps;
  const current = o ? '<div class="drawer-section"><h4>Current assignment</h4>' + kv('Assigned to', esc(a._where) + (o.assignee_type === 'Employee' && a._person ? ' <button type="button" class="bl-link" data-act="employee" data-id="' + a._holderId + '">view employee</button>' : '')) +
    kv('Issued', dt(o.issued_on) + (o.issued_on_estimated ? ' <span class="muted">(estimated — the old list did not record the date)</span>' : '') + ' <span class="muted">by ' + esc(who(ctx, o.issued_by)) + '</span>') + kv('Condition when issued', conditionBadge(o.condition_out || a.condition)) +
    (o.purpose ? kv('Purpose', esc(o.purpose)) : '') + (o.expected_return_date ? kv('Expected back', dt(o.expected_return_date)) : '') + kv('Accessories issued', (o.accessories_out || []).length ? esc(o.accessories_out.join(', ')) : '<span class="muted">none</span>') + (o.issue_notes ? kv('Notes', esc(o.issue_notes)) : '') +
    '<h4 class="rf-sub">Acknowledgments</h4>' + ackRow(ctx, a) +
    '<div class="bl-rowact ac-mt">' + (c.canAcknowledge(a) ? '<button type="button" class="btn small" data-act="ack">I received this asset</button>' : '') +
      (c.canAssign && o.assignee_type === 'Employee' && !a._acks.some((k) => k.role === 'Custodian') ? '<button type="button" class="btn small secondary" data-act="ackrole" data-role="Custodian">Confirm as custodian</button>' : '') +
      (c.canAssign && o.assignee_type === 'Employee' && !a._acks.some((k) => k.role === 'Supervisor') && o.employee_id !== ctx.employee.id ? '<button type="button" class="btn small secondary" data-act="ackrole" data-role="Supervisor">Confirm as supervisor</button>' : '') +
      '<button type="button" class="btn small secondary" data-act="printform" data-kind="accountability">Print accountability form</button></div></div>'
    : '<div class="drawer-section"><h4>Current assignment</h4><p class="muted">' + (['Available', 'In Storage', 'Returned'].includes(a.status) ? 'Not assigned — ' + esc(a.status.toLowerCase()) + ' at ' + esc(a._where) + '.' : 'Not assigned (' + esc(a.status.toLowerCase()) + ').') + '</p>' +
      (c.canAssignAsset(a) ? '<p><button type="button" class="btn small" data-act="assign">Assign this asset</button></p>' : '') + '</div>';
  const hist = a._asgs.slice().sort((x, y) => y.id - x.id);
  const rows = hist.map((x) => '<tr><td data-label="Holder">' + esc(x.assignee_type === 'Employee' ? who(ctx, x.employee_id) : x.assignee_type === 'Branch' ? branchName(ctx, x.branch_id) : x.department || x.location || x.assignee_type) + (x.legacy ? ' <span class="muted">(before the upgrade)</span>' : '') + '</td>' +
    '<td data-label="Issued">' + dt(x.issued_on) + (x.issued_on_estimated ? '*' : '') + '</td><td data-label="Returned">' + (x.returned_on ? dt(x.returned_on) : '<b class="lv-pos">now</b>') + '</td>' +
    '<td data-label="Condition out → in">' + esc(x.condition_out || '—') + ' → ' + esc(x.condition_in || '—') + '</td><td data-label="How it ended" class="full-row">' + (x.end_reason ? esc(x.end_reason) : '—') + (x.return_notes ? '<div class="muted bl-sub">' + esc(short(x.return_notes, 120)) + '</div>' : '') +
    (x.accessories_missing && x.accessories_missing.length ? '<div class="lv-neg bl-sub">Missing: ' + esc(x.accessories_missing.join(', ')) + '</div>' : '') + '</td></tr>').join('');
  return current + '<div class="drawer-section"><h4>Assignment history</h4>' + (hist.length ? '<div class="table-scroll table-2col"><table class="lv-mini"><thead><tr><th>Holder</th><th>Issued</th><th>Returned</th><th>Condition</th><th>How it ended</th></tr></thead><tbody>' + rows + '</tbody></table></div><p class="muted">* issue date not recorded in the old list — the date it was listed is shown. History is permanent.</p>' : '<p class="muted">This asset has never been issued.</p>') + '</div>';
}
function historyHtml(ctx, a) {
  if (!extras.loaded) return '<div class="drawer-section"><h4>Movement history</h4><div class="muted">Loading…</div></div>';
  const list = extras.movements;
  return '<div class="drawer-section"><h4>Movement history</h4>' + (list.length ? '<div class="lv-timeline">' + list.map((m) => '<div class="lv-tl-item"><div class="lv-tl-when">' + esc(fmtDateTime(m.movement_date)) + '<br>' + esc(who(ctx, m.performed_by) || 'System') + '</div><div><b>' + esc(m.movement_type) + '</b>' +
    (m.from_status || m.to_status ? ' <span class="muted">' + esc(m.from_status || '') + (m.from_status && m.to_status ? ' → ' : '') + esc(m.to_status || '') + '</span>' : '') + (m.notes ? '<div class="lv-text">' + esc(short(m.notes, 220)) + '</div>' : '') + '</div></div>').join('') + '</div>' : '<p class="muted">Nothing recorded yet.</p>') +
    '<p class="muted">Every assignment, return, transfer, repair, report and condition change is one permanent line here — nothing is edited or deleted.</p></div>';
}
function repairsHtml(ctx, a) {
  const reps = ctx.data.repairs.filter((r) => r.asset_id === a.id), cost = new Map(ctx.data.repairCosts.map((r) => [r.repair_id, r.repair_cost])), c = ctx.caps;
  const rows = reps.map((r) => '<tr><td data-label="Repair"><button type="button" class="bl-link" data-act="repairopen" data-id="' + r.id + '">' + esc(r.repair_number) + '</button><div class="muted bl-sub">' + esc(r.repair_type) + '</div></td><td data-label="Status">' + flowBadge(r.status) + '</td>' +
    '<td data-label="Problem" class="full-row">' + esc(short(r.issue, 120)) + (r.service_provider ? '<div class="muted bl-sub">' + esc(r.service_provider) + '</div>' : '') + '</td><td data-label="Reported">' + dt(dayOf(r.reported_at)) + '</td>' +
    '<td data-label="Done">' + (r.completed_at ? dt(dayOf(r.completed_at)) : r.expected_completion ? '<span class="muted">due ' + dt(r.expected_completion) + '</span>' : '—') + '</td>' + (c.viewCost ? '<td data-label="Cost">' + (cost.has(r.id) ? money(cost.get(r.id)) : '—') + '</td>' : '') + '</tr>').join('');
  return '<div class="drawer-section"><h4>Maintenance &amp; repairs' + (a._repair ? ' <span class="badge ac-flow ac-flow-orange">1 open</span>' : '') + '</h4>' + (reps.length ? '<div class="table-scroll table-2col"><table class="lv-mini"><thead><tr><th>Repair</th><th>Status</th><th>Problem</th><th>Reported</th><th>Done</th>' + (c.viewCost ? '<th>Cost</th>' : '') + '</tr></thead><tbody>' + rows + '</tbody></table></div>' : '<p class="muted">No repair or maintenance recorded.</p>') +
    (c.viewCost && a._repairCost ? '<p class="muted">Total repair cost to date: <b>' + esc(money(a._repairCost)) + '</b></p>' : '') + (c.canSendRepair(a) ? '<p><button type="button" class="btn small" data-act="repair">Send for repair / maintenance</button></p>' : '') + '</div>';
}
function reportsHtml(ctx, a) {
  const inc = ctx.data.incidents.filter((i) => i.asset_id === a.id), trs = ctx.data.transfers.filter((t) => t.asset_id === a.id), dis = ctx.data.disposals.filter((d) => d.asset_id === a.id), c = ctx.caps;
  const irow = (i) => '<tr><td data-label="Report"><b>' + esc(i.incident_number) + '</b><div class="muted bl-sub">' + esc(i.incident_type) + '</div></td><td data-label="Status">' + flowBadge(i.status) + '</td><td data-label="What happened" class="full-row">' + esc(short(i.description, 160)) +
    '<div class="muted bl-sub">' + esc(who(ctx, i.reported_by)) + ' · ' + esc(dt(i.incident_date || dayOf(i.reported_at))) + (i.last_known_location ? ' · last seen ' + esc(i.last_known_location) : '') + '</div>' + (i.findings ? '<div class="bl-sub">Findings: ' + esc(short(i.findings, 160)) + '</div>' : '') +
    (i.resolution ? '<div class="bl-sub"><b>' + esc(i.resolution) + '</b> — ' + esc(short(i.resolution_notes || '', 160)) + '</div>' : '') + (i.accountability_decision ? '<div class="bl-sub"><b>Decision:</b> ' + esc(i.accountability_decision) + '</div>' : '') + '</td>' +
    '<td class="full-row"><div class="bl-rowact">' + (OPEN_INCIDENT.includes(i.status) && c.canReviewIncident ? '<button type="button" class="btn small secondary" data-act="increview" data-id="' + i.id + '">Review</button>' : '') +
      (OPEN_INCIDENT.includes(i.status) && c.canResolveIncident ? '<button type="button" class="btn small" data-act="incresolve" data-id="' + i.id + '">Resolve</button>' : '') + '</div></td></tr>';
  const trow = (t) => '<tr><td data-label="Transfer"><b>' + esc(t.transfer_number) + '</b><div class="muted bl-sub">' + esc(t.transfer_type) + '</div></td><td data-label="Status">' + flowBadge(t.status) + '</td><td data-label="From → to" class="full-row">' +
    esc(t.transfer_type === 'Employee' ? who(ctx, t.from_employee_id) + ' → ' + who(ctx, t.to_employee_id) : branchName(ctx, t.from_branch_id) + ' → ' + branchName(ctx, t.to_branch_id)) + '<div class="muted bl-sub">' + esc(short(t.reason || '', 120)) + '</div></td>' +
    '<td class="full-row"><div class="bl-rowact">' + (t.transfer_type === 'Branch' ? [t.status === 'Requested' && c.canApproveTransfer(t) ? ['tapprove', 'Approve'] : null, t.status === 'Approved' && c.canTransfer ? ['trelease', 'Release'] : null, t.status === 'In Transit' && c.canTransfer ? ['treceive', 'Receive'] : null,
      ['Requested', 'Approved'].includes(t.status) && (c.mgr || t.requested_by === ctx.employee.id) ? ['tcancel', 'Cancel'] : null, ['Requested', 'Approved'].includes(t.status) && c.mgr ? ['treject', 'Reject'] : null].filter(Boolean).map((x) => '<button type="button" class="btn small secondary" data-act="' + x[0] + '" data-id="' + t.id + '">' + x[1] + '</button>').join('') : '') + '</div></td></tr>';
  const drow = (d) => '<tr><td data-label="Disposal"><b>' + esc(d.disposal_number) + '</b></td><td data-label="Status">' + flowBadge(d.status) + '</td><td data-label="Why" class="full-row">' + esc(short(d.reason, 140)) + (d.disposal_method ? '<div class="bl-sub"><b>' + esc(d.disposal_method) + '</b> on ' + dt(d.disposal_date) + '</div>' : '') + '</td>' +
    '<td class="full-row"><div class="bl-rowact">' + (d.status === 'Pending Approval' && c.canApproveDisposal(d) ? '<button type="button" class="btn small" data-act="disapprove" data-id="' + d.id + '">Approve</button><button type="button" class="btn small secondary" data-act="disreject" data-id="' + d.id + '">Reject</button>' : '') +
      (d.status === 'Approved for Disposal' && c.canDispose ? '<button type="button" class="btn small" data-act="discomplete" data-id="' + d.id + '">Mark as disposed</button>' : '') + (['Pending Approval', 'Approved for Disposal'].includes(d.status) && (c.canDispose || d.requested_by === ctx.employee.id) ? '<button type="button" class="btn small secondary" data-act="discancel" data-id="' + d.id + '">Cancel</button>' : '') + '</div></td></tr>';
  const tbl = (head, rows) => '<div class="table-scroll table-2col"><table class="lv-mini"><thead><tr>' + head.map((h) => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
  return '<div class="drawer-section"><h4>Lost / damaged reports</h4>' + (inc.length ? tbl(['Report', 'Status', 'What happened', ''], inc.map(irow)) : '<p class="muted">No report has been made on this asset.</p>') + (c.canReportOn(a) ? '<p><button type="button" class="btn small secondary" data-act="report">Report damaged / lost / missing</button></p>' : '') + '</div>' +
    '<div class="drawer-section"><h4>Transfers</h4>' + (trs.length ? tbl(['Transfer', 'Status', 'From → to', ''], trs.map(trow)) : '<p class="muted">No transfer between branches or employees.</p>') + '</div>' +
    '<div class="drawer-section"><h4>Disposal</h4>' + (dis.length ? tbl(['Disposal', 'Status', 'Why', ''], dis.map(drow)) : '<p class="muted">Not put forward for disposal.</p>') + (c.canRequestDisposal(a) ? '<p><button type="button" class="btn small secondary" data-act="dispose">Request disposal</button></p>' : '') +
    (c.canArchive(a) ? '<p><button type="button" class="btn small secondary" data-act="archive">Archive this asset</button> <span class="muted">Archived assets stay in the history; they just leave the working lists.</span></p>' : '') + '</div>';
}
function filesHtml(ctx, a) {
  const files = extras.id === a.id ? extras.files : [], c = ctx.caps;
  const row = (f) => '<div class="lv-doc" data-file="' + f.id + '"><div><b>' + esc(f.file_name) + '</b><div class="muted">' + esc(f.kind) + (f.stage ? ' · ' + esc(f.stage) : '') + ' · ' + esc(fmtBytes(f.file_size || 0)) + ' · ' + esc(who(ctx, f.uploaded_by)) + ' · ' + esc(dayOf(f.created_at)) + '</div></div>' +
    '<div class="lv-doc-actions"><button type="button" class="btn small secondary" data-act="viewfile" data-id="' + f.id + '">View</button>' + (c.canEdit || f.uploaded_by === ctx.employee.id ? '<button type="button" class="btn small secondary" data-act="rmfile" data-id="' + f.id + '">Remove</button>' : '') + '</div></div>';
  return '<div class="drawer-section"><h4>Photos &amp; documents</h4>' + (files.length ? files.map(row).join('') : '<p class="muted">' + (extras.loaded ? 'No photos or documents yet — a photo of each asset when it is added, issued, returned or damaged keeps everyone honest.' : 'Loading…') + '</p>') +
    (c.canAttach(a) ? '<div class="lv-upload"><button type="button" class="btn small" data-act="upload">+ Attach a photo or file</button></div>' : '') + '<p class="muted">Files are private: only people who can see this asset can open them. Purchase invoices and receipts are visible only to people who may see costs.</p></div>';
}
function financialHtml(ctx, a) {
  const f = a._fin;
  return '<div class="drawer-section"><h4>Financial details <span class="muted">· only people who may see costs can see this</span></h4>' + kv('Purchase price', esc(money(a._price))) + kv('Supplier', esc((f && f.supplier) || '—')) + kv('Invoice / receipt no.', esc((f && f.invoice_number) || '—')) +
    kv('Estimated current value', esc(money(a._est))) + (f && f.value_note ? kv('Value note', esc(f.value_note)) : '') + kv('Repair cost to date', esc(money(a._repairCost || 0)) + ' <span class="muted">(' + a._repairCount + ' repair' + (a._repairCount === 1 ? '' : 's') + ')</span>') +
    (ctx.caps.canEditAsset(a) ? '<p><button type="button" class="btn small secondary" data-act="financials">Edit financial details</button></p>' : '') + '</div>';
}
function auditHtml(ctx) {
  if (!extras.auditLoaded) return '<div class="drawer-section"><h4>Audit trail</h4><div class="muted">Loading…</div></div>';
  const list = extras.audit;
  return '<div class="drawer-section"><h4>Audit trail — every field change</h4>' + (list.length ? '<div class="table-scroll table-2col"><table class="lv-mini"><thead><tr><th>When</th><th>Person</th><th>Action</th><th>Change</th></tr></thead><tbody>' + list.map((l) =>
    '<tr><td data-label="When">' + esc(fmtDateTime(l.created_at)) + '</td><td data-label="Person">' + esc(l.user_name || 'System') + '</td><td data-label="Action">' + esc(l.action) + '</td><td data-label="Change" class="full-row">' +
    (l.field_name ? '<b>' + esc(String(l.field_name).replace(/_/g, ' ')) + '</b>: ' : '') + (l.old_value !== null && l.old_value !== undefined ? '<span class="bl-before">' + esc(short(l.old_value, 80)) + '</span> → ' : '') + (l.new_value !== null && l.new_value !== undefined ? '<span class="bl-after">' + esc(short(l.new_value, 80)) + '</span>' : '') +
    (l.reason ? '<div class="muted bl-sub">' + esc(short(l.reason, 140)) + '</div>' : '') + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="muted">No changes recorded.</p>') + '</div>';
}

const PANES = (ctx) => [
  { id: 'overview', label: 'Overview' }, { id: 'assignment', label: 'Assignment' }, { id: 'history', label: 'History' }, { id: 'repairs', label: 'Repairs' }, { id: 'reports', label: 'Reports & transfers' }, { id: 'files', label: 'Files' },
  ...(ctx.caps.viewCost ? [{ id: 'financial', label: 'Financial' }] : []), ...(ctx.caps.canSeeAudit ? [{ id: 'audit', label: 'Audit' }] : []),
];
const paneHtml = (ctx, a, id) => ({ overview: overviewHtml, assignment: assignmentHtml, history: historyHtml, repairs: repairsHtml, reports: reportsHtml, files: filesHtml, financial: financialHtml, audit: auditHtml }[id] || (() => ''))(ctx, a);
function bodyHtml(ctx, a) {
  const panes = PANES(ctx);
  if (!panes.find((p) => p.id === activePane)) activePane = 'overview';
  return headerHtml(ctx, a) + moreMenu(ctx, a) + '<div class="ac-dtabs" role="tablist">' + panes.map((p) => '<button type="button" class="ac-dtab' + (p.id === activePane ? ' ac-dtab-on' : '') + '" role="tab" data-act="pane" data-pane="' + p.id + '">' + esc(p.label) + '</button>').join('') + '</div>' +
    '<div id="ac-dpane">' + paneHtml(ctx, a, activePane) + '</div>';
}
function moreMenu(ctx, a) {
  const more = menuItems(ctx, a).filter((x) => !['edit', 'assign', 'return'].includes(x[0]));
  if (a._asg) more.push(['printform', 'Print accountability form']);
  if (a._transfer && a._transfer.transfer_type === 'Branch') more.push(['printtransfer', 'Print transfer form']);
  if (a._disposal) more.push(['printdisposal', 'Print disposal form']);
  return '<details class="exp bl-more"><summary><span class="exp-arrow" aria-hidden="true">▸</span>More actions</summary><div class="exp-body"><div class="lv-row-actions">' +
    more.map((x) => '<button type="button" class="btn small secondary" data-act="' + x[0] + '"' + (x[0] === 'printform' ? ' data-kind="accountability"' : '') + '>' + x[1] + '</button>').join('') + '</div></div></details>';
}
function footerHtml(ctx, a) {
  const c = ctx.caps; let h = '';
  if (c.canAcknowledge(a)) h += '<button type="button" class="btn" data-act="ack">I received this asset</button>';
  if (c.canAssignAsset(a)) h += '<button type="button" class="btn" data-act="assign">Assign</button>';
  if (c.canReturnAsset(a)) h += '<button type="button" class="btn" data-act="return">Receive return</button>';
  if (c.canEditAsset(a)) h += '<button type="button" class="btn secondary" data-act="edit">Edit</button>';
  return h + '<button type="button" class="btn secondary" data-act="close">Close</button>';
}

async function loadExtras(ctx, a) {
  const [movements, files] = await Promise.all([ctx.api.listMovements(a.id).catch(() => []), ctx.api.listAssetFiles(a.id).catch(() => [])]);
  await ctx.ensureNames(movements.map((m) => m.performed_by).concat(files.map((f) => f.uploaded_by)));
  extras = { ...extras, id: a.id, movements, files, loaded: true };
}
async function openFile(ctx, fileId) {
  const f = extras.files.find((x) => String(x.id) === String(fileId));
  if (!f) return;
  const w = window.open('', '_blank');
  try {
    const url = await ctx.api.getFileUrl(f.file_path);
    if (w) { w.location.href = url; return; }
    const row = document.querySelector('[data-file="' + f.id + '"] .lv-doc-actions') || $('ac-detail-msg');
    if (row) row.insertAdjacentHTML('afterbegin', '<a class="lv-linkbtn" href="' + esc(url) + '" target="_blank" rel="noopener">Open file</a>');
  } catch (err) { if (w) w.close(); ctx.toast(err, true); }
}

// ---------------------------------------------------------------- the card
export async function openAsset(ctx, id, opts = {}) {
  const a = ctx.byId.get(id);
  if (!a) { ctx.toast('That asset is no longer available to you.', true); return; }
  const keepScroll = opts.keep && isDrawerOpen('detail') && currentId === a.id ? drawerBody('detail').scrollTop : 0;
  if (currentId !== a.id) { activePane = opts.pane || 'overview'; extras = { id: null, movements: [], files: [], audit: [], loaded: false, auditLoaded: false }; }
  else if (opts.pane) activePane = opts.pane;
  currentId = a.id;
  ctx.detail = { kind: 'asset', id: a.id, reopen: () => openAsset(ctx, a.id, { keep: true }) };
  openDrawer('detail', { title: a.asset_number + ' — ' + a.name, sub: a._where + (a._branch ? ' · ' + a._branch : ''), body: bodyHtml(ctx, a), footer: footerHtml(ctx, a) });
  if (keepScroll) drawerBody('detail').scrollTop = keepScroll;

  const redrawPane = () => { const p = $('ac-dpane'); if (p) p.innerHTML = paneHtml(ctx, a, activePane); };
  const reload = async () => { await ctx.refresh(); if (ctx.byId.has(a.id)) { extras.loaded = false; openAsset(ctx, a.id, { keep: true }); } else ctx.closeDetail(); };
  const done = (msg) => async () => { if (msg) ctx.toast(msg); await reload(); };
  const after = (res, msg) => { must(res); return done(msg)(); };

  loadExtras(ctx, a).then(() => { if (currentId === a.id) redrawPane(); });
  const loadAudit = () => { if (extras.auditLoaded || !ctx.caps.canSeeAudit) return; ctx.api.listAudit({ assetId: a.id, limit: 300 }).then((l) => { extras.audit = l; extras.auditLoaded = true; if (currentId === a.id && activePane === 'audit') redrawPane(); }).catch((err) => { extras.audit = []; extras.auditLoaded = true; if ($('ac-dpane')) $('ac-dpane').insertAdjacentHTML('afterbegin', '<div class="msg error">' + esc(friendly(err)) + '</div>'); }); };
  if (activePane === 'audit') loadAudit();

  const idOf = (el) => Number(el.dataset.id);
  const handlers = {
    close: () => ctx.closeDetail(),
    pane: (el) => { activePane = el.dataset.pane; document.querySelectorAll('.ac-dtab').forEach((b) => b.classList.toggle('ac-dtab-on', b.dataset.pane === activePane)); redrawPane(); if (activePane === 'audit') loadAudit(); },
    edit: () => ctx.openForm({ id: a.id }), assign: () => ctx.work.assignAsset(a.id), return: () => ctx.work.returnAsset(a.id), callback: () => ctx.work.callBack(a.id), transferemp: () => ctx.work.transferEmployee(a.id),
    branchtransfer: () => ctx.work.branchTransfer(a.id), repair: () => ctx.cases.repairNew(a.id), report: () => ctx.cases.report(a.id), condition: () => ctx.work.condition(a.id), dispose: () => ctx.cases.disposalRequest(a.id),
    upload: () => ctx.work.uploadFile(a.id), tag: () => ctx.print.tags([a.id]), accessories: () => ctx.work.accessories(a.id), financials: () => ctx.work.financials(a.id),
    ack: () => ctx.work.acknowledge(a._asg.id, a.id), ackrole: (el) => ctx.work.acknowledge(a._asg.id, a.id, el.dataset.role),
    employee: (el) => ctx.openEmployee(el.dataset.id),
    repairopen: (el) => ctx.cases.repairUpdate(idOf(el)), increview: (el) => ctx.cases.reviewIncident(idOf(el)), incresolve: (el) => ctx.cases.resolveIncident(idOf(el)),
    tapprove: (el) => ctx.work.transferAction(idOf(el), 'approve'), trelease: (el) => ctx.work.transferAction(idOf(el), 'release'), treceive: (el) => ctx.work.transferAction(idOf(el), 'receive'), tcancel: (el) => ctx.work.transferAction(idOf(el), 'cancel'), treject: (el) => ctx.work.transferAction(idOf(el), 'reject'),
    disapprove: (el) => ctx.cases.disposalAction(idOf(el), 'approve'), disreject: (el) => ctx.cases.disposalAction(idOf(el), 'reject'), discomplete: (el) => ctx.cases.disposalAction(idOf(el), 'complete'), discancel: (el) => ctx.cases.disposalAction(idOf(el), 'cancel'),
    archive: () => ctx.cases.archive(a.id),
    printform: (el) => ctx.print.form(el.dataset.kind || 'accountability', a.id), printtransfer: () => ctx.print.form('transfer', a.id), printdisposal: () => ctx.print.form('disposal', a.id),
    viewfile: (el) => openFile(ctx, el.dataset.id),
    rmfile: (el) => actionPanel('detail', { title: 'Remove this file?', message: 'It is removed from the asset. The change is recorded in the history.', okLabel: 'Remove', danger: true, onOk: async () => after(await ctx.api.removeFile(idOf(el)), 'File removed.') }),
  };
  setDetailHandlers(handlers, ctx.toast);
  if (opts.action && handlers[opts.action]) handlers[opts.action]();
}
