// Assets & Supplies Custodian -- the Reports tab (twelve reports plus supply usage) and every export in the module (CSV, Excel, PDF).
// Everything is built in the browser from the data this person is allowed to see -- a branch supervisor's reports cover their branch, and
// money columns appear only for people who may see costs. Nothing is sent anywhere. The Excel / PDF libraries load from cdnjs only when someone
// clicks Export (pinned and integrity-checked in leaveExport.js).
import { exportCsv, exportXlsx, exportPdf } from './leaveExport.js?v=20261007i';
import { manilaDate } from './leaveUi.js?v=20261007i';
import { esc, plural, field, opts, branchName, fmtDate } from './assetsUi.js?v=20261007i';
import { OPEN_INCIDENT, OPEN_REPAIR, STATUSES, SUPPLY_TYPES, sum, group, uniqueSorted, dayOf, peopleRows } from './assetsLogic.js?v=20261007i';

const $ = (id) => document.getElementById(id);
const FOOTER = 'Kittymae Jewels - Assets & Supplies Custodian';
const col = (key, label, type) => ({ key, label, type: type || 'text' });
const human = (k) => String(k).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const who = (ctx) => (ctx.employee && (ctx.names[ctx.employee.id] || ctx.employee.full_name)) || '';
const stamp = (ctx) => 'Generated ' + ctx.today + (who(ctx) ? ' by ' + who(ctx) : '');

export function exportReport(report, format) {
  if (format === 'csv') return exportCsv(report.filename, report.columns, report.rows);
  if (format === 'xlsx') return exportXlsx(report.filename, report.title, report.columns, report.rows, report.about);
  return exportPdf(report.filename, report.title, report.subtitle, report.pdfColumns || report.columns, report.rows, FOOTER);
}
/** Any list of plain rows: columns come from the first row's keys. */
export function exportFlow(ctx, label, rows, format) {
  if (!rows.length) throw new Error('There is nothing to export.');
  const columns = Object.keys(rows[0]).map((k) => col(k, human(k), typeof rows[0][k] === 'number' ? 'number' : /^(date|requested|reported|completed|returned|disposed|expected)$/.test(k) ? 'date' : 'text'));
  return exportReport({ title: human(label), filename: 'assets-' + slug(label) + '-' + ctx.today, columns, pdfColumns: columns.slice(0, 9), rows, subtitle: [human(label) + ' · ' + plural(rows.length, 'row'), stamp(ctx)], about: [{ k: 'Report', v: human(label) }, { k: 'Rows', v: String(rows.length) }, { k: 'Generated', v: ctx.today }] }, format);
}

// ---------------------------------------------------------------- the asset register as a table of plain rows
export function assetRow(ctx, a) {
  const r = { asset_no: a.asset_number, name: a.name, category: a._category, brand: a.brand || '', model: a.model || '', serial: a.serial_number || '', tag: a.asset_tag || '', status: a.status, condition: a.condition, holder: a._holder || '', where: a._where, branch: a._branch,
    department: a.department || '', company: a.company || '', ownership: a.ownership_status, custodian: a.custodian_id ? ctx.names[a.custodian_id] || '' : a.custodian_label || '', purchased: a.purchase_date || '', warranty_ends: a.warranty_end || '', next_maintenance: a.next_maintenance_due || '', last_movement: a.last_movement_at ? dayOf(a.last_movement_at) : '' };
  if (ctx.caps.viewCost) { r.purchase_price = a._price ?? ''; r.estimated_value = a._est ?? ''; r.repair_cost = a._repairCost || ''; }
  return r;
}
const ASSET_COLS = (ctx) => [col('asset_no', 'Asset No.'), col('name', 'Name'), col('category', 'Category'), col('brand', 'Brand'), col('model', 'Model'), col('serial', 'Serial No.'), col('tag', 'Asset Tag'), col('status', 'Status'), col('condition', 'Condition'), col('holder', 'Holder'), col('where', 'Where'), col('branch', 'Branch'),
  col('department', 'Department'), col('company', 'Company'), col('ownership', 'Ownership'), col('custodian', 'Custodian'), col('purchased', 'Purchase Date', 'date'), col('warranty_ends', 'Warranty Ends', 'date'), col('next_maintenance', 'Next Maintenance', 'date'), col('last_movement', 'Last Movement', 'date'),
  ...(ctx.caps.viewCost ? [col('purchase_price', 'Purchase Price', 'money'), col('estimated_value', 'Estimated Value', 'money'), col('repair_cost', 'Repair Cost', 'money')] : [])];
const ASSET_PDF = ['asset_no', 'name', 'category', 'status', 'condition', 'holder', 'branch', 'warranty_ends'];
export function exportAssetList(ctx, assets, format, label) {
  if (!assets.length) throw new Error('There are no assets to export.');
  const cols = ASSET_COLS(ctx), rows = assets.map((a) => assetRow(ctx, a));
  return exportReport({ title: label || 'Assets', filename: 'assets-list-' + ctx.today, columns: cols, pdfColumns: cols.filter((c) => ASSET_PDF.includes(c.key)), rows, subtitle: [(label || 'Assets') + ' · ' + plural(rows.length, 'asset'), stamp(ctx)],
    about: [{ k: 'Report', v: label || 'Assets' }, { k: 'Assets', v: String(rows.length) }, { k: 'Generated', v: ctx.today + (who(ctx) ? ' by ' + who(ctx) : '') }] }, format);
}
export function exportPeople(ctx, rows, format) {
  if (!rows.length) throw new Error('There is nothing to export.');
  const cols = [col('employee', 'Employee'), col('employee_id', 'Employee ID'), col('position', 'Position'), col('department', 'Department'), col('branch', 'Branch'), col('status', 'Status'), col('holding', 'Holds Now', 'number'), col('items', 'Items'), col('not_confirmed', 'Not Confirmed', 'number'), col('returned', 'Returned', 'number'), col('transferred', 'Transferred', 'number'), col('damaged', 'Damaged Reports', 'number'), col('lost', 'Lost / Missing Reports', 'number')];
  const data = rows.map((r) => ({ employee: r.name, employee_id: r.person.employee_code || '', position: r.person.job_title || r.person.position || '', department: r.department, branch: branchName(ctx, r.branch_id), status: r.left ? 'Left' : 'Active', holding: r.outstanding, items: r.holding.map((a) => a.asset_number + ' ' + a.name).join('; '), not_confirmed: r.unacknowledged, returned: r.returned, transferred: r.transferred, damaged: r.damaged, lost: r.lost }));
  return exportReport({ title: 'Employee accountability', filename: 'assets-employee-accountability-' + ctx.today, columns: cols, pdfColumns: cols.filter((c) => ['employee', 'position', 'branch', 'status', 'holding', 'not_confirmed', 'damaged', 'lost'].includes(c.key)), rows: data, subtitle: ['Employee accountability · ' + plural(data.length, 'person', 'people'), stamp(ctx)], about: [{ k: 'Report', v: 'Employee accountability' }, { k: 'Generated', v: ctx.today }] }, format);
}
export function exportSupplies(ctx, rows, format) {
  if (!rows.length) throw new Error('There are no supplies to export.');
  const brs = ctx.branches, cols = [col('code', 'Code'), col('name', 'Supply'), col('category', 'Category'), col('unit', 'Unit'), col('supplier', 'Supplier'), col('total', 'Total In Stock', 'number'), ...brs.map((b) => col('b' + b.id, b.name, 'number')), col('minimum', 'Minimum', 'number'), col('reorder', 'Reorder Level', 'number'), col('level', 'Level'), col('active', 'Active'),
    ...(ctx.caps.viewCost ? [col('unit_cost', 'Unit Cost', 'money'), col('value', 'Stock Value', 'money')] : [])];
  const data = rows.map((s) => { const r = { code: s.supply_code, name: s.name, category: s._category, unit: s.unit, supplier: s.supplier || '', total: s._total, minimum: Number(s.minimum_stock), reorder: Number(s.reorder_level), level: ({ ok: 'In stock', low: 'Low', out: 'Out', 'out-some': 'Out at a branch', inactive: 'Inactive' })[s._state], active: s.active ? 'Yes' : 'No' };
    brs.forEach((b) => { if (b.id in s._per) r['b' + b.id] = s._per[b.id]; }); if (ctx.caps.viewCost) { r.unit_cost = s._cost ?? ''; r.value = s._value ?? ''; } return r; });
  return exportReport({ title: 'Supplies stock', filename: 'supplies-stock-' + ctx.today, columns: cols, pdfColumns: cols.filter((c) => ['code', 'name', 'unit', 'total', 'minimum', 'level'].includes(c.key)), rows: data, subtitle: ['Supplies stock · ' + plural(data.length, 'supply', 'supplies'), stamp(ctx)], about: [{ k: 'Report', v: 'Supplies stock' }, { k: 'Generated', v: ctx.today }] }, format);
}
const itemsText = (ctx, items, f) => (items || []).map((x) => { const s = ctx.supplyById.get(x.supply_id) || {}; return (s.name || 'Supply #' + x.supply_id) + ' x ' + f(x) + (s.unit ? ' ' + s.unit : ''); }).join('; ');
export function exportIssuances(ctx, rows, format) {
  if (!rows.length) throw new Error('There is nothing to export.');
  const cols = [col('issuance', 'Issuance'), col('date', 'Date', 'date'), col('branch', 'Taken From'), col('employee', 'For Employee'), col('department', 'Department'), col('items', 'Items'), col('issued_by', 'Issued By'), col('received_by', 'Received By'), col('purpose', 'Purpose'), col('request', 'Request'), col('correction', 'Stock Corrected (reason)')];
  const data = rows.map((i) => ({ issuance: i.issuance_number, date: dayOf(i.issued_at), branch: branchName(ctx, i.branch_id), employee: ctx.names[i.employee_id] || '', department: i.department || '', items: itemsText(ctx, i.supply_issuance_items, (x) => Number(x.quantity)), issued_by: ctx.names[i.issued_by] || '', received_by: ctx.names[i.received_by] || '',
    purpose: i.purpose || '', request: (ctx.data.requests.find((r) => r.id === i.request_id) || {}).request_number || '', correction: i.override_reason || '' }));
  return exportReport({ title: 'Supply issuance', filename: 'supply-issuance-' + ctx.today, columns: cols, pdfColumns: cols.filter((c) => ['issuance', 'date', 'branch', 'employee', 'department', 'items'].includes(c.key)), rows: data, subtitle: ['Supply issuance · ' + plural(data.length, 'issuance'), stamp(ctx)], about: [{ k: 'Report', v: 'Supply issuance' }, { k: 'Generated', v: ctx.today }] }, format);
}
export function exportRequests(ctx, rows, format) {
  if (!rows.length) throw new Error('There is nothing to export.');
  const cols = [col('request', 'Request'), col('date', 'Date', 'date'), col('requested_by', 'Requested By'), col('branch', 'Branch'), col('department', 'Department'), col('purpose', 'Purpose'), col('status', 'Status'), col('items', 'Items'), col('needed_by', 'Needed By', 'date'), col('approved_by', 'Approved By'), col('issued', 'Issued', 'date')];
  const data = rows.map((r) => ({ request: r.request_number, date: dayOf(r.requested_at), requested_by: ctx.names[r.requested_by] || '', branch: branchName(ctx, r.branch_id), department: r.department || '', purpose: r.purpose || '', status: r.status, items: itemsText(ctx, r.supply_request_items, (x) => (x.approved_qty === null || x.approved_qty === undefined ? Number(x.requested_qty) : Number(x.approved_qty) + '/' + Number(x.requested_qty))), needed_by: r.needed_by || '', approved_by: ctx.names[r.approved_by] || '', issued: r.issued_at ? dayOf(r.issued_at) : '' }));
  return exportReport({ title: 'Supply requests', filename: 'supply-requests-' + ctx.today, columns: cols, pdfColumns: cols.filter((c) => ['request', 'date', 'requested_by', 'branch', 'status', 'items'].includes(c.key)), rows: data, subtitle: ['Supply requests · ' + plural(data.length, 'request'), stamp(ctx)], about: [{ k: 'Report', v: 'Supply requests' }, { k: 'Generated', v: ctx.today }] }, format);
}
export function exportAudit(ctx, rows, format) {
  if (!rows.length) throw new Error('There is nothing to export.');
  const cols = [col('when', 'When'), col('who', 'User'), col('role', 'Role'), col('about', 'About'), col('action', 'Action'), col('field', 'Field'), col('before', 'Before'), col('after', 'After'), col('reason', 'Reason')];
  const data = rows.map((l) => { const a = l.asset_id ? ctx.byId.get(l.asset_id) : null, s = l.supply_id ? ctx.supplyById.get(l.supply_id) : null; return { when: l.created_at ? new Date(l.created_at).toLocaleString('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '', who: l.user_name || 'System', role: l.user_role || '', about: a ? a.asset_number + ' ' + a.name : s ? s.supply_code + ' ' + s.name : l.entity_type, action: l.action, field: l.field_name || '', before: l.old_value ?? '', after: l.new_value ?? '', reason: l.reason || '' }; });
  return exportReport({ title: 'Audit log', filename: 'assets-audit-log-' + ctx.today, columns: cols, pdfColumns: cols.filter((c) => ['when', 'who', 'about', 'action', 'before', 'after'].includes(c.key)), rows: data, subtitle: ['Audit log · ' + plural(data.length, 'entry', 'entries'), stamp(ctx)], about: [{ k: 'Report', v: 'Audit log' }, { k: 'Entries', v: String(data.length) }, { k: 'Generated', v: ctx.today }] }, format);
}

// ================================================================ the reports
export const REPORTS = [
  { id: 'register', title: 'Asset Register', blurb: 'Every asset with its details, status, holder and branch.', scope: 'live', group: 'Assets' },
  { id: 'byEmployee', title: 'Assets by Employee', blurb: 'Who holds what, issued when, and whether they confirmed receiving it.', scope: 'live', group: 'Assets' },
  { id: 'byBranch', title: 'Assets by Branch', blurb: 'For each branch: how many assets, in which status.', scope: 'live', group: 'Assets' },
  { id: 'byDepartment', title: 'Assets by Department', blurb: 'For each department: how many assets, in which status.', scope: 'live', group: 'Assets' },
  { id: 'assigned', title: 'Assigned Assets', blurb: 'Everything currently issued to an employee, a branch, a department or a place.', scope: 'live', group: 'Assets' },
  { id: 'available', title: 'Available Assets', blurb: 'Assets ready to be assigned.', scope: 'live', group: 'Assets' },
  { id: 'incidents', title: 'Lost / Missing / Damaged Assets', blurb: 'Every report in the period, with its outcome and any decision.', scope: 'range', group: 'Assets' },
  { id: 'repairs', title: 'Repair & Maintenance History', blurb: 'Every repair or maintenance job reported in the period.', scope: 'range', group: 'Assets' },
  { id: 'disposals', title: 'Disposal Report', blurb: 'Every disposal requested in the period, and what became of it.', scope: 'range', group: 'Assets' },
  { id: 'supplyStock', title: 'Supplies Stock', blurb: 'Stock of every supply at every branch, with minimum and reorder levels.', scope: 'live', group: 'Supplies' },
  { id: 'lowStock', title: 'Low and Out-of-Stock Supplies', blurb: 'Supplies at or below their minimum, or at zero, by branch.', scope: 'live', group: 'Supplies' },
  { id: 'issuance', title: 'Supply Issuance', blurb: 'Every supply handed out in the period: what, to whom, from where.', scope: 'range', group: 'Supplies' },
  { id: 'usage', title: 'Supply Usage by Department and Employee', blurb: 'How much of each supply each department and person used in the period.', scope: 'range', group: 'Supplies' },
];
const monthStart = (today) => today.slice(0, 8) + '01';
const S = { branch: '', from: '', to: '', open: null, last: null };

const inRange = (day, f, t) => (!f || day >= f) && (!t || day <= t);
const mkAbout = (ctx, def, rows, extra) => [{ k: 'Report', v: def.title }, { k: 'Period', v: def.scope === 'range' ? (S.from || 'start') + ' to ' + (S.to || ctx.today) : 'As of ' + ctx.today }, { k: 'Branch', v: S.branch ? branchName(ctx, Number(S.branch)) : 'All branches you can see' }, { k: 'Generated', v: ctx.today + (who(ctx) ? ' by ' + who(ctx) : '') }, ...(extra || [])];
const branchOk = (id) => !S.branch || String(id) === String(S.branch);

export async function buildReport(id, ctx) {
  const def = REPORTS.find((r) => r.id === id), cost = ctx.caps.viewCost, from = S.from, to = S.to || ctx.today;
  const when = def.scope === 'range' ? (from || 'start') + ' to ' + to : 'as of ' + ctx.today, scope = S.branch ? branchName(ctx, Number(S.branch)) : 'all branches you can see';
  const base = { def, title: def.title, filename: 'assets-' + slug(def.title) + '-' + (def.scope === 'range' ? (from || 'start') + '_' + to : ctx.today) };
  const wrap = (columns, pdfKeys, rows, total, summary, extra) => ({ ...base, columns, pdfColumns: pdfKeys ? columns.filter((c) => pdfKeys.includes(c.key)) : columns, rows: total ? [...rows, total] : rows, preview: rows, total: total || null, subtitle: [def.title + ' · ' + when + ' · ' + scope, summary, stamp(ctx)].filter(Boolean), about: mkAbout(ctx, def, rows, [{ k: 'Rows', v: String(rows.length) }, ...(extra || [])]) });
  const assets = ctx.assets.filter((a) => branchOk(a.branch_id));
  const live = assets.filter((a) => !['Disposed', 'Archived'].includes(a.status));

  if (id === 'register') { const rows = assets.map((a) => assetRow(ctx, a)); return wrap(ASSET_COLS(ctx), ASSET_PDF, rows, null, plural(rows.length, 'asset')); }
  if (id === 'byEmployee') {
    const rows = ctx.assets.filter((a) => a._asg && a._asg.assignee_type === 'Employee' && branchOk(a.branch_id)).map((a) => { const p = ctx.personById[a._asg.employee_id] || {}; return { employee: a._holder, position: p.job_title || p.position || '', branch: a._branch, status: p.left ? 'Left' : 'Active', asset_no: a.asset_number, asset: a.name, serial: a.serial_number || '', issued: a._asg.issued_on, condition: a.condition, confirmed: a._ack ? 'Yes' : a._asg.legacy ? 'Before the upgrade' : 'No' }; }).sort((x, y) => x.employee.localeCompare(y.employee) || x.asset_no.localeCompare(y.asset_no));
    const cols = [col('employee', 'Employee'), col('position', 'Position'), col('branch', 'Branch'), col('status', 'Employment'), col('asset_no', 'Asset No.'), col('asset', 'Asset'), col('serial', 'Serial No.'), col('issued', 'Issued', 'date'), col('condition', 'Condition'), col('confirmed', 'Employee Confirmed')];
    return wrap(cols, ['employee', 'asset_no', 'asset', 'issued', 'condition', 'confirmed'], rows, { employee: 'TOTAL', asset_no: String(rows.length) + ' items' }, plural(new Set(rows.map((r) => r.employee)).size, 'person', 'people') + ' · ' + plural(rows.length, 'item'));
  }
  const statusCols = [col('label', ''), col('total', 'Total', 'number'), ...STATUSES.filter((s) => !['Archived'].includes(s)).map((s) => col('s_' + s.replace(/\W+/g, '_'), s, 'number')), ...(cost ? [col('value', 'Purchase Value', 'money')] : [])];
  const statusRow = (label, list) => { const r = { label, total: list.length }; STATUSES.filter((s) => s !== 'Archived').forEach((s) => { r['s_' + s.replace(/\W+/g, '_')] = list.filter((a) => a.status === s || (s === 'Disposed' && a.status === 'Archived')).length; }); if (cost) r.value = sum(list, (a) => a._price); return r; };
  if (id === 'byBranch' || id === 'byDepartment') {
    const g = group(assets, id === 'byBranch' ? (a) => a._branch || 'No branch' : (a) => a.department || 'No department'), keys = Object.keys(g).sort((a, b) => a.localeCompare(b));
    const rows = keys.map((k) => statusRow(k, g[k])), total = { ...statusRow('TOTAL', assets) };
    const cols = statusCols.map((c) => (c.key === 'label' ? col('label', id === 'byBranch' ? 'Branch' : 'Department') : c));
    return wrap(cols, ['label', 'total', 's_Available', 's_Assigned', 's_In_Use', 's_Under_Repair', 's_Damaged', 's_Lost'], rows, total, plural(rows.length, id === 'byBranch' ? 'branch' : 'department', id === 'byBranch' ? 'branches' : 'departments') + ' · ' + plural(assets.length, 'asset'));
  }
  if (id === 'assigned') {
    const rows = assets.filter((a) => a._asg).map((a) => ({ asset_no: a.asset_number, asset: a.name, assigned_to: a._asg.assignee_type === 'Employee' ? a._holder : a._where, type: a._asg.assignee_type, branch: a._branch, issued: a._asg.issued_on, expected: a._asg.expected_return_date || '', condition: a.condition, status: a.status, confirmed: a._asg.assignee_type !== 'Employee' ? '' : a._ack ? 'Yes' : a._asg.legacy ? 'Before the upgrade' : 'No' }));
    const cols = [col('asset_no', 'Asset No.'), col('asset', 'Asset'), col('assigned_to', 'Assigned To'), col('type', 'Type'), col('branch', 'Branch'), col('issued', 'Issued', 'date'), col('expected', 'Expected Back', 'date'), col('condition', 'Condition'), col('status', 'Status'), col('confirmed', 'Confirmed')];
    return wrap(cols, ['asset_no', 'asset', 'assigned_to', 'issued', 'condition', 'confirmed'], rows, null, plural(rows.length, 'assigned asset'));
  }
  if (id === 'available') {
    const rows = assets.filter((a) => ['Available', 'In Storage', 'Returned'].includes(a.status)).map((a) => ({ asset_no: a.asset_number, asset: a.name, category: a._category, status: a.status, condition: a.condition, branch: a._branch, location: a.location || '', custodian: a.custodian_id ? ctx.names[a.custodian_id] || '' : a.custodian_label || '', serial: a.serial_number || '' }));
    const cols = [col('asset_no', 'Asset No.'), col('asset', 'Asset'), col('category', 'Category'), col('status', 'Status'), col('condition', 'Condition'), col('branch', 'Branch'), col('location', 'Location'), col('custodian', 'Custodian'), col('serial', 'Serial No.')];
    return wrap(cols, ['asset_no', 'asset', 'category', 'condition', 'branch'], rows, null, plural(rows.length, 'available asset'));
  }
  if (id === 'incidents') {
    const rows = ctx.data.incidents.map((i) => ({ i, a: ctx.byId.get(i.asset_id) })).filter(({ i, a }) => a && branchOk(a.branch_id) && inRange(i.incident_date || dayOf(i.reported_at), from, to)).map(({ i, a }) => ({ report: i.incident_number, type: i.incident_type, status: i.status, asset_no: a.asset_number, asset: a.name, holder_then: ctx.names[i.custodian_id] || '', reported_by: ctx.names[i.reported_by] || '', date: i.incident_date || dayOf(i.reported_at), description: i.description, resolution: i.resolution || '', notes: i.resolution_notes || '', decision: i.accountability_decision || '' }));
    const cols = [col('report', 'Report'), col('type', 'Type'), col('status', 'Status'), col('asset_no', 'Asset No.'), col('asset', 'Asset'), col('holder_then', 'Holder Then'), col('reported_by', 'Reported By'), col('date', 'Date', 'date'), col('description', 'What Happened'), col('resolution', 'Outcome'), col('notes', 'Resolution Notes'), col('decision', 'Accountability Decision')];
    return wrap(cols, ['report', 'type', 'status', 'asset_no', 'date', 'resolution'], rows, null, plural(rows.length, 'report') + ' · ' + rows.filter((r) => OPEN_INCIDENT.includes(r.status)).length + ' still open');
  }
  if (id === 'repairs') {
    const cmap = new Map(ctx.data.repairCosts.map((r) => [r.repair_id, r.repair_cost]));
    const rows = ctx.data.repairs.map((r) => ({ r, a: ctx.byId.get(r.asset_id) })).filter(({ r, a }) => a && branchOk(a.branch_id) && inRange(dayOf(r.reported_at), from, to)).map(({ r, a }) => ({ repair: r.repair_number, type: r.repair_type, status: r.status, asset_no: a.asset_number, asset: a.name, problem: r.issue, provider: r.service_provider || '', reported: dayOf(r.reported_at), expected: r.expected_completion || '', completed: r.completed_at ? dayOf(r.completed_at) : '', outcome: r.resolution || '', ...(cost ? { cost: cmap.has(r.id) ? cmap.get(r.id) : '' } : {}) }));
    const cols = [col('repair', 'Repair'), col('type', 'Type'), col('status', 'Status'), col('asset_no', 'Asset No.'), col('asset', 'Asset'), col('problem', 'Problem'), col('provider', 'Service Provider'), col('reported', 'Reported', 'date'), col('expected', 'Expected', 'date'), col('completed', 'Completed', 'date'), col('outcome', 'Outcome'), ...(cost ? [col('cost', 'Cost', 'money')] : [])];
    return wrap(cols, ['repair', 'type', 'status', 'asset_no', 'reported', 'completed', ...(cost ? ['cost'] : [])], rows, cost ? { repair: 'TOTAL', cost: sum(rows, (r) => r.cost || 0) } : null, plural(rows.length, 'repair') + ' · ' + rows.filter((r) => OPEN_REPAIR.includes(r.status)).length + ' still open');
  }
  if (id === 'disposals') {
    const rows = ctx.data.disposals.map((d) => ({ d, a: ctx.byId.get(d.asset_id) })).filter(({ d, a }) => a && branchOk(a.branch_id) && inRange(dayOf(d.requested_at), from, to)).map(({ d, a }) => ({ disposal: d.disposal_number, status: d.status, asset_no: a.asset_number, asset: a.name, reason: d.reason, requested_by: ctx.names[d.requested_by] || '', requested: dayOf(d.requested_at), approved_by: ctx.names[d.approved_by] || '', method: d.disposal_method || '', disposed: d.disposal_date || '', notes: d.notes || '' }));
    const cols = [col('disposal', 'Disposal'), col('status', 'Status'), col('asset_no', 'Asset No.'), col('asset', 'Asset'), col('reason', 'Reason'), col('requested_by', 'Requested By'), col('requested', 'Requested', 'date'), col('approved_by', 'Approved By'), col('method', 'How Disposed'), col('disposed', 'Date Disposed', 'date'), col('notes', 'Notes')];
    return wrap(cols, ['disposal', 'status', 'asset_no', 'asset', 'requested', 'method', 'disposed'], rows, null, plural(rows.length, 'disposal'));
  }
  // ---- supplies
  const supplyBranch = (s) => Object.entries(s._per).filter(([b]) => branchOk(Number(b)));
  if (id === 'supplyStock' || id === 'lowStock') {
    const rows = [];
    ctx.supplyList.filter((s) => s.active).forEach((s) => supplyBranch(s).forEach(([b, q]) => { const low = s._threshold > 0 && q > 0 && q <= s._threshold, out = q === 0; if (id === 'supplyStock' || low || out) rows.push({ code: s.supply_code, supply: s.name, category: s._category, unit: s.unit, branch: branchName(ctx, Number(b)), quantity: q, minimum: Number(s.minimum_stock), reorder: Number(s.reorder_level), level: out ? 'Out of stock' : low ? 'Low' : 'In stock', ...(cost ? { value: s._cost !== null ? q * Number(s._cost) : '' } : {}) }); }));
    rows.sort((x, y) => x.supply.localeCompare(y.supply) || x.branch.localeCompare(y.branch));
    const cols = [col('code', 'Code'), col('supply', 'Supply'), col('category', 'Category'), col('unit', 'Unit'), col('branch', 'Branch'), col('quantity', 'In Stock', 'number'), col('minimum', 'Minimum', 'number'), col('reorder', 'Reorder Level', 'number'), col('level', 'Level'), ...(cost ? [col('value', 'Stock Value', 'money')] : [])];
    return wrap(cols, ['code', 'supply', 'unit', 'branch', 'quantity', 'minimum', 'level'], rows, cost && id === 'supplyStock' ? { code: 'TOTAL', value: sum(rows, (r) => r.value || 0) } : null, plural(rows.length, 'line'));
  }
  if (id === 'issuance') {
    const rows = [];
    ctx.data.issuances.filter((i) => branchOk(i.branch_id) && inRange(dayOf(i.issued_at), from, to)).forEach((i) => (i.supply_issuance_items || []).forEach((x) => { const s = ctx.supplyById.get(x.supply_id) || {}; rows.push({ issuance: i.issuance_number, date: dayOf(i.issued_at), branch: branchName(ctx, i.branch_id), supply: s.name || 'Supply #' + x.supply_id, quantity: Number(x.quantity), unit: s.unit || '', employee: ctx.names[i.employee_id] || '', department: i.department || '', issued_by: ctx.names[i.issued_by] || '', received_by: ctx.names[i.received_by] || '', purpose: i.purpose || '' }); }));
    rows.sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.issuance.localeCompare(b.issuance));
    const cols = [col('issuance', 'Issuance'), col('date', 'Date', 'date'), col('branch', 'Taken From'), col('supply', 'Supply'), col('quantity', 'Quantity', 'number'), col('unit', 'Unit'), col('employee', 'For Employee'), col('department', 'Department'), col('issued_by', 'Issued By'), col('received_by', 'Received By'), col('purpose', 'Purpose')];
    return wrap(cols, ['issuance', 'date', 'supply', 'quantity', 'employee', 'department'], rows, null, plural(rows.length, 'line') + ' · ' + plural(new Set(rows.map((r) => r.issuance)).size, 'issuance'));
  }
  if (id === 'usage') {
    const lastDay = new Date(to + 'T00:00:00Z'); lastDay.setUTCDate(lastDay.getUTCDate() + 1);
    const ledger = (await ctx.api.listSupplyLedgerRange(from ? from + 'T00:00:00+08:00' : null, lastDay.toISOString().slice(0, 10) + 'T00:00:00+08:00')).filter((x) => x.transaction_type === 'SUPPLY_ISSUED' && branchOk(x.branch_id));
    const g = {};
    ledger.forEach((x) => { const s = ctx.supplyById.get(x.supply_id) || {}, k = [x.supply_id, x.department || '', x.employee_id || ''].join('|'); const e = g[k] || (g[k] = { supply: s.name || 'Supply #' + x.supply_id, unit: s.unit || '', department: x.department || '', employee: ctx.names[x.employee_id] || '', quantity: 0, issues: 0 }); e.quantity += -Number(x.quantity_change); e.issues++; });
    const rows = Object.values(g).sort((a, b) => a.supply.localeCompare(b.supply) || b.quantity - a.quantity);
    const cols = [col('supply', 'Supply'), col('unit', 'Unit'), col('department', 'Department'), col('employee', 'Employee'), col('quantity', 'Quantity Used', 'number'), col('issues', 'Times Issued', 'number')];
    return wrap(cols, null, rows, null, plural(rows.length, 'line') + ' from ' + plural(ledger.length, 'issue entry', 'issue entries'));
  }
  throw new Error('Unknown report.');
}

// ================================================================ the Reports tab
export function renderReports(ctx, panel) {
  if (!S.to) { S.to = ctx.today; S.from = monthStart(ctx.today); }
  const groups = ['Assets', 'Supplies'];
  panel.innerHTML = '<div id="ac-rep"><div class="card bl-filterbar"><div class="bl-filters">' + field('Branch', '<select id="ac-rep-br">' + opts(ctx.branches.map((b) => ({ value: b.id, label: b.name })), S.branch, 'All branches I can see') + '</select>') +
    field('From <span class="muted">(period reports)</span>', '<input type="date" id="ac-rep-from" value="' + esc(S.from) + '" max="' + esc(ctx.today) + '">') + field('To', '<input type="date" id="ac-rep-to" value="' + esc(S.to) + '" max="' + esc(ctx.today) + '">') +
    '<div class="field"><label>&nbsp;</label><button type="button" class="btn small secondary" id="ac-rep-month">This month</button></div></div></div>' +
    groups.map((g) => '<div class="card bl-panel"><h3 class="bl-h">' + g + ' reports</h3><div class="bl-reports">' + REPORTS.filter((r) => r.group === g).map((r) => '<div class="bl-report" id="ac-rep-' + r.id + '"><div class="bl-report-head"><div><b>' + esc(r.title) + '</b>' + (r.scope === 'range' ? ' <span class="badge bl-tag bl-tag-blue">uses the dates</span>' : '') + '<div class="muted">' + esc(r.blurb) + '</div></div>' +
      '<div class="bl-btnrow"><button type="button" class="btn small secondary" data-prev="' + r.id + '">Preview</button><details class="bl-menu bl-exportmenu"><summary class="btn small">Export ▾</summary><div class="bl-menu-pop"><button type="button" data-rexp="' + r.id + ':csv">CSV</button><button type="button" data-rexp="' + r.id + ':xlsx">Excel (.xlsx)</button><button type="button" data-rexp="' + r.id + ':pdf">PDF</button></div></details></div></div><div class="ac-rep-prev" id="ac-prev-' + r.id + '"></div></div>').join('') + '</div></div>').join('') +
    '<p class="muted">Reports cover only what you are allowed to see' + (ctx.caps.viewCost ? '' : ' — price and cost columns are left out') + '. Nothing leaves your browser except the file you download.</p></div>';
  const redo = () => ctx.rerender();
  $('ac-rep-br').addEventListener('change', (e) => { S.branch = e.target.value; });
  $('ac-rep-from').addEventListener('change', (e) => { S.from = e.target.value; }); $('ac-rep-to').addEventListener('change', (e) => { S.to = e.target.value; });
  $('ac-rep-month').addEventListener('click', () => { S.from = monthStart(ctx.today); S.to = ctx.today; redo(); });
  panel.querySelectorAll('[data-prev]').forEach((el) => el.addEventListener('click', async () => {
    const id = el.dataset.prev, box = $('ac-prev-' + id);
    if (box.dataset.open) { box.innerHTML = ''; delete box.dataset.open; el.textContent = 'Preview'; return; }
    box.innerHTML = '<p class="muted">Building…</p>';
    try {
      const rep = await buildReport(id, ctx), cols = rep.columns, rows = rep.preview.slice(0, 100);
      box.dataset.open = '1'; el.textContent = 'Hide';
      box.innerHTML = '<p class="muted">' + esc(rep.subtitle.slice(1, 2).join(' · ')) + '</p>' + (rows.length ? '<div class="table-scroll"><table class="lv-mini"><thead><tr>' + cols.map((c) => '<th>' + esc(c.label) + '</th>').join('') + '</tr></thead><tbody>' + rows.map((r) => '<tr>' + cols.map((c) => '<td>' + esc(r[c.key] === null || r[c.key] === undefined ? '' : c.type === 'date' && r[c.key] ? fmtDate(r[c.key]) : c.type === 'money' && r[c.key] !== '' ? Number(r[c.key]).toLocaleString('en-PH', { minimumFractionDigits: 2 }) : r[c.key]) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>' + (rep.preview.length > 100 ? '<p class="muted">Showing the first 100 of ' + rep.preview.length + ' — export to get them all.</p>' : '') : '<p class="muted">Nothing to report for these choices.</p>');
    } catch (err) { box.innerHTML = '<div class="msg error">' + esc(err.message || String(err)) + '</div>'; }
  }));
  panel.querySelectorAll('[data-rexp]').forEach((el) => el.addEventListener('click', async () => {
    el.closest('details').open = false; const [id, fmt] = el.dataset.rexp.split(':');
    try { const rep = await buildReport(id, ctx); if (!rep.preview.length) { ctx.toast('Nothing to export for these choices.', true); return; } await exportReport(rep, fmt); } catch (err) { ctx.toast(err, true); }
  }));
}
