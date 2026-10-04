// Assets & Supplies Custodian -- the rules the screens share: the vocabularies (statuses, conditions ...), the one place each asset is joined
// to its holder / branch / category / open repair / open report, "what needs attention" (the same rules the database uses for the dashboard
// counts), who may do what (UI hints only -- the database re-checks every action), saved views, search, sorting and a few helpers.
// Pure functions: nothing here touches the page or the database, so it can be tested on its own.

export const STATUSES = ['Available', 'Assigned', 'In Use', 'In Storage', 'Transferred', 'Under Maintenance', 'Under Repair', 'Damaged', 'Missing', 'Lost', 'For Return', 'Returned', 'For Disposal', 'Disposed', 'Archived'];
export const CONDITIONS = ['New', 'Excellent', 'Good', 'Fair', 'Needs Repair', 'Damaged', 'Unserviceable'];
export const ISSUE_CONDITIONS = CONDITIONS.filter((c) => !['Damaged', 'Unserviceable'].includes(c));
export const OWNERSHIP = ['Company Owned', 'Leased', 'Borrowed', 'Employee Owned'];
export const COMPANIES = ['Miss Kittymae', 'Layover'];
export const RETURN_OUTCOMES = ['Available', 'In Storage', 'Returned'];
export const REPAIR_TYPES = ['Repair', 'Preventive Maintenance', 'Inspection', 'Warranty Claim', 'Upgrade'];
export const REPAIR_STATUSES = ['Reported', 'For Inspection', 'Waiting for Approval', 'Under Repair', 'Waiting for Parts', 'Completed', 'Unrepairable', 'Cancelled'];
export const OPEN_REPAIR = ['Reported', 'For Inspection', 'Waiting for Approval', 'Under Repair', 'Waiting for Parts'];
export const INCIDENT_TYPES = ['Damaged', 'Lost', 'Missing'];
export const OPEN_INCIDENT = ['Reported', 'Under Review'];
export const RECOMMENDED = ['Repair', 'Replace', 'Accountability Review', 'Dispose', 'No Action'];
export const DISPOSAL_METHODS = ['Sold', 'Donated', 'Scrapped', 'Recycled', 'Returned to Supplier', 'Traded In', 'Written Off'];
export const OPEN_DISPOSAL = ['Pending Approval', 'Approved for Disposal'];
export const TRANSFER_OPEN = ['Requested', 'Approved', 'In Transit'];
export const FILE_KINDS = ['Photo', 'Purchase Invoice', 'Official Receipt', 'Warranty', 'Service Receipt', 'Manual', 'Accountability Form', 'Transfer Form', 'Disposal Form', 'Other'];
export const COST_KINDS = ['Purchase Invoice', 'Official Receipt'];
export const PHOTO_STAGES = ['Created', 'Issued', 'Returned', 'Damaged', 'Transferred', 'Repair', 'Disposed'];
export const FILE_TYPES = /^(image\/(jpeg|png)|application\/pdf)$/;
export const MAX_FILE = 10 * 1024 * 1024;
export const SUPPLY_TYPES = { SUPPLY_OPENING: 'Opening stock', SUPPLY_RECEIVED: 'Received', SUPPLY_ISSUED: 'Issued', SUPPLY_TRANSFER_OUT: 'Transferred out', SUPPLY_TRANSFER_IN: 'Transferred in', SUPPLY_ADJUSTMENT: 'Adjustment', SUPPLY_DAMAGE: 'Damaged / spoiled', SUPPLY_RETURN: 'Returned to stock' };
export const REQUEST_STATUSES = ['Requested', 'Under Review', 'Approved', 'Ready for Issue', 'Partially Issued', 'Issued', 'Received', 'Completed', 'Waitlisted', 'Rejected', 'Cancelled'];
export const REQUEST_OPEN = ['Requested', 'Under Review', 'Approved', 'Ready for Issue', 'Partially Issued', 'Waitlisted'];
export const DEFAULTS = { repair_overdue_days: 14, warranty_warn_days: 30, maintenance_warn_days: 14, high_repair_cost_pct: 60, request_wait_days: 3, transfer_wait_days: 3, acknowledge_wait_days: 7, aging_warn_years: 5 };

// ---------------------------------------------------------------- small helpers
export const sum = (list, f) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0);
export const uniqueSorted = (list) => [...new Set(list.filter((x) => x !== null && x !== undefined && x !== ''))].sort((a, b) => String(a).localeCompare(String(b)));
export const group = (list, key) => { const m = {}; list.forEach((x) => { const k = typeof key === 'function' ? key(x) : x[key]; (m[k] || (m[k] = [])).push(x); }); return m; };
/** whole days from date string a to date string b (b later = positive) */
export const daysBetween = (a, b) => Math.round((Date.UTC(+String(b).slice(0, 4), +String(b).slice(5, 7) - 1, +String(b).slice(8, 10)) - Date.UTC(+String(a).slice(0, 4), +String(a).slice(5, 7) - 1, +String(a).slice(8, 10))) / 86400000);
export const dayOf = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) : '');
export const ageYears = (purchaseDate, today) => (purchaseDate ? daysBetween(purchaseDate, today) / 365.25 : null);
export const nameOf = (ctx, id) => (id ? (ctx.names[id] || 'Unknown') : '');
export const money = (n) => (n === null || n === undefined || n === '' ? '—' : '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

// ---------------------------------------------------------------- who may do what (hints; the database decides)
export function makeCaps(ctx) {
  const a = ctx.access || {}, k = a.keys || {}, me = ctx.employee || {};
  const c = {
    mgr: !!a.manager, admin: !!a.admin, k, viewAll: !!a.view_all, scope: a.scope || 'own',
    viewAssets: !!k['assets.view'], viewSupplies: !!k['supplies.view'], requestSupplies: !!k['supplies.request'],
    viewCost: !!k['assets.view_cost'], canAdd: !!k['assets.add'], canEdit: !!k['assets.edit'], canAssign: !!k['assets.assign'], canReturn: !!k['assets.return'], canTransfer: !!k['assets.transfer'],
    canReport: !!k['assets.report_damage'], canRepair: !!k['assets.repairs'], canDispose: !!k['assets.dispose'], reports: !!k['assets.reports'], canExport: !!k['assets.export'],
    sManage: !!k['supplies.manage'], sIssue: !!k['supplies.issue'], sAdjust: !!k['supplies.adjust'], sTransfer: !!k['supplies.transfer'],
  };
  c.own = (x) => !!x && x._holderId === me.id;
  c.canSeeAudit = c.mgr || c.admin;
  c.canEditAsset = (x) => c.canEdit && !['Disposed', 'Archived'].includes(x.status);
  c.canCondition = (x) => (c.canEdit || c.canRepair) && !['Disposed', 'Archived'].includes(x.status);
  c.canAssignAsset = (x) => c.canAssign && ['Available', 'In Storage', 'Returned'].includes(x.status) && !x._transfer;
  c.canReturnAsset = (x) => c.canReturn && !!x._asg && ['Assigned', 'In Use', 'For Return', 'Damaged'].includes(x.status);
  c.canCallBack = (x) => (c.canAssign || c.canReturn) && !!x._asg && ['Assigned', 'In Use'].includes(x.status);
  c.canTransferEmployee = (x) => c.canTransfer && !!x._asg && x._asg.assignee_type === 'Employee' && ['Assigned', 'For Return'].includes(x.status);
  c.canBranchTransfer = (x) => c.canTransfer && ['Available', 'In Storage', 'Returned', 'In Use'].includes(x.status) && !x._transfer;
  c.canSendRepair = (x) => c.canRepair && !['Disposed', 'Archived', 'Lost', 'Missing', 'For Disposal', 'Transferred'].includes(x.status) && !x._repair;
  c.canReportOn = (x) => (c.canReport || c.own(x)) && !['Disposed', 'Archived', 'For Disposal', 'Transferred'].includes(x.status) && !x._incident;
  c.canRequestDisposal = (x) => c.canEdit && !x._asg && ['Available', 'In Storage', 'Returned', 'Damaged', 'Lost'].includes(x.status) && !x._repair && !x._disposal && !(x._incident && x._incident.incident_type !== 'Damaged');
  c.canArchive = (x) => (c.mgr || c.admin) && x.status === 'Disposed';
  c.canAcknowledge = (x) => c.own(x) && !!x._asg && !x._ack && ['Assigned', 'In Use', 'For Return', 'Under Repair', 'Under Maintenance'].includes(x.status);
  c.canReviewIncident = c.canEdit || c.canRepair || c.mgr;
  c.canResolveIncident = c.canEdit || c.mgr;
  c.canAttach = (x) => !['Disposed', 'Archived'].includes(x.status) && (c.own(x) || c.canEdit || c.canAssign || c.canReturn || c.canReport || c.canRepair || c.canAdd);
  c.canApproveTransfer = (t) => (c.mgr || c.admin) && t.status === 'Requested' && t.requested_by !== me.id;
  c.canApproveDisposal = (d) => c.canDispose && d.status === 'Pending Approval' && d.requested_by !== me.id;
  return c;
}

// ---------------------------------------------------------------- joining everything to each asset
/** ctx.data = { assets, assignments, acks, transfers, repairs, incidents, disposals, financials, repairCosts, accessories } */
export function enrichAssets(ctx) {
  const d = ctx.data, today = ctx.today, s = ctx.settings;
  const openAsg = new Map(), ackBy = group(d.acks, 'assignment_id'), asgBy = group(d.assignments, 'asset_id'), accBy = group(d.accessories, 'asset_id');
  d.assignments.forEach((x) => { if (!x.returned_at) openAsg.set(x.asset_id, x); });
  const openInc = new Map(), openRep = new Map(), openTr = new Map(), openDis = new Map(), fin = new Map(d.financials.map((f) => [f.asset_id, f])), repCost = new Map(d.repairCosts.map((r) => [r.repair_id, r.repair_cost]));
  d.incidents.forEach((x) => { if (OPEN_INCIDENT.includes(x.status) && !openInc.has(x.asset_id)) openInc.set(x.asset_id, x); });
  d.repairs.forEach((x) => { if (OPEN_REPAIR.includes(x.status) && !openRep.has(x.asset_id)) openRep.set(x.asset_id, x); });
  d.transfers.forEach((x) => { if (TRANSFER_OPEN.includes(x.status) && !openTr.has(x.asset_id)) openTr.set(x.asset_id, x); });
  d.disposals.forEach((x) => { if (OPEN_DISPOSAL.includes(x.status) && !openDis.has(x.asset_id)) openDis.set(x.asset_id, x); });
  const catName = new Map(ctx.cats.map((c) => [c.id, c.name]));
  const repByAsset = group(d.repairs, 'asset_id');
  const list = d.assets.map((a) => {
    const x = { ...a };
    const asg = openAsg.get(a.id) || null;
    x._asg = asg; x._holderId = asg && asg.assignee_type === 'Employee' ? asg.employee_id : a.assigned_employee_id;
    x._holder = x._holderId ? nameOf(ctx, x._holderId) : '';
    x._branch = (ctx.branchById[a.branch_id] || {}).name || '';
    x._category = catName.get(a.category_id) || '';
    x._incident = openInc.get(a.id) || null; x._repair = openRep.get(a.id) || null; x._transfer = openTr.get(a.id) || null; x._disposal = openDis.get(a.id) || null;
    x._acc = (accBy[a.id] || []).map((r) => r.name);
    x._asgs = asgBy[a.id] || [];
    x._ack = asg ? (ackBy[asg.id] || []).some((k) => k.role === 'Employee') : false;
    x._acks = asg ? (ackBy[asg.id] || []) : [];
    const f = fin.get(a.id); x._price = f ? f.purchase_price : null; x._est = f ? f.estimated_value : null; x._fin = f || null;
    x._repairCost = sum(repByAsset[a.id] || [], (r) => repCost.get(r.id) || 0); x._repairCount = (repByAsset[a.id] || []).filter((r) => r.status !== 'Cancelled').length;
    x._where = whereText(ctx, x);
    x._person = x._holderId ? ctx.personById[x._holderId] || null : null;
    x._holderLeft = !!(x._person && x._person.left) && !!asg && asg.assignee_type === 'Employee';
    x._age = ageYears(a.purchase_date, today);
    x._warranty = !a.warranty_end ? 'none' : a.warranty_end < today ? 'expired' : daysBetween(today, a.warranty_end) <= s.warranty_warn_days ? 'soon' : 'ok';
    x._maintDays = a.next_maintenance_due ? daysBetween(today, a.next_maintenance_due) : null;
    x._att = attention(ctx, x);
    return x;
  });
  ctx.assets = list; ctx.byId = new Map(list.map((x) => [x.id, x]));
  return list;
}

function whereText(ctx, a) {
  const o = a._asg;
  if (o) {
    if (o.assignee_type === 'Employee') return 'With ' + (a._holder || 'an employee');
    if (o.assignee_type === 'Branch') return 'In use at ' + ((ctx.branchById[o.branch_id] || {}).name || 'a branch');
    if (o.assignee_type === 'Department') return 'In use by ' + (o.department || 'a department');
    return 'At ' + (o.location || 'a location');
  }
  if (a.status === 'Transferred') return 'On its way to another branch';
  return [a.location, a._branch].filter(Boolean).join(' · ') || 'No location recorded';
}

/** The reasons an asset needs a look. Same rules as the dashboard counts in the database (custodian_dashboard). */
export function attention(ctx, a) {
  const s = ctx.settings, t = ctx.today, out = [], add = (code, tone, text) => out.push({ code, tone, text });
  const gone = ['Disposed', 'Archived'].includes(a.status);
  if (['Lost', 'Missing'].includes(a.status)) add('lost', 'red', 'Reported ' + a.status.toLowerCase());
  if (a.status === 'For Return' && a.last_movement_at && daysBetween(dayOf(a.last_movement_at), t) > s.request_wait_days) add('unreturned', 'orange', 'Return requested ' + daysBetween(dayOf(a.last_movement_at), t) + ' days ago');
  if (a.status === 'Damaged') add('damaged', 'red', 'Damaged');
  const r = a._repair;
  if (r && ['Under Repair', 'Waiting for Parts'].includes(r.status)) {
    const since = dayOf(r.sent_at || r.reported_at), days = daysBetween(since, t);
    if (days > s.repair_overdue_days || (r.expected_completion && r.expected_completion < t)) add('repair_overdue', 'orange', 'In repair ' + days + ' days' + (r.expected_completion && r.expected_completion < t ? ' · past its expected date' : ''));
  }
  if (['Available', 'In Storage', 'Returned'].includes(a.status) && !a.custodian_id && !(a.custodian_label || '').trim()) add('no_custodian', 'yellow', 'No custodian recorded');
  if (!gone && !a.branch_id && !(a.location || '').trim()) add('no_location', 'yellow', 'No branch or location');
  if (!gone && a._warranty === 'expired') add('warranty_expired', 'gray', 'Warranty ended ' + a.warranty_end);
  if (!gone && a._warranty === 'soon') add('warranty_soon', 'yellow', 'Warranty ends ' + a.warranty_end);
  if (!gone && !['Lost', 'Missing'].includes(a.status) && a._maintDays !== null && a._maintDays <= s.maintenance_warn_days) add('maintenance_due', a._maintDays < 0 ? 'orange' : 'yellow', a._maintDays < 0 ? 'Maintenance overdue by ' + (-a._maintDays) + ' days' : 'Maintenance due in ' + a._maintDays + ' days');
  if (a._holderLeft) add('resigned_holding', 'red', a._holder + ' has left and still holds this');
  const o = a._asg;
  if (o && o.assignee_type === 'Employee' && !o.legacy && !a._ack && daysBetween(o.issued_on, t) > s.acknowledge_wait_days) add('unacknowledged', 'yellow', a._holder + ' has not confirmed receipt');
  if (a._transfer && daysBetween(dayOf(a._transfer.created_at), t) > s.transfer_wait_days) add('transfer_waiting', 'orange', 'Transfer ' + a._transfer.status.toLowerCase() + ' since ' + dayOf(a._transfer.created_at));
  if (!gone && a._age !== null && a._age >= s.aging_warn_years) add('aging', 'gray', 'Aging: ' + a._age.toFixed(1) + ' years old');
  return out;
}
export const NEEDS_ATTENTION = (a) => a._att.some((x) => x.code !== 'aging' && x.code !== 'warranty_expired');

/** Repair history cost versus value: an information flag only -- nothing is ever disposed of automatically. */
export function repairCostFlag(ctx, a) {
  const base = a._price || a._est;
  if (!base || !a._repairCost) return null;
  const pct = a._repairCost / base * 100;
  return pct >= ctx.settings.high_repair_cost_pct ? { pct: Math.round(pct) } : null;
}

// ---------------------------------------------------------------- saved views, search, sorting
export const SAVED_VIEWS = [
  { id: 'active', label: 'All active', test: (a) => !['Disposed', 'Archived'].includes(a.status) },
  { id: 'all', label: 'Everything', test: () => true },
  { id: 'available', label: 'Available', test: (a) => ['Available', 'In Storage', 'Returned'].includes(a.status) },
  { id: 'assigned', label: 'Assigned', test: (a) => ['Assigned', 'For Return'].includes(a.status) || (a._asg && a._asg.assignee_type === 'Employee') },
  { id: 'inuse', label: 'In use', test: (a) => a.status === 'In Use' },
  { id: 'repair', label: 'Under repair', test: (a) => ['Under Repair', 'Under Maintenance'].includes(a.status) },
  { id: 'damaged', label: 'Damaged', test: (a) => a.status === 'Damaged' },
  { id: 'lost', label: 'Lost / missing', test: (a) => ['Lost', 'Missing'].includes(a.status) },
  { id: 'disposal', label: 'For disposal', test: (a) => a.status === 'For Disposal' },
  { id: 'disposed', label: 'Disposed / archived', test: (a) => ['Disposed', 'Archived'].includes(a.status) },
  { id: 'attention', label: 'Needs attention', test: NEEDS_ATTENTION },
  { id: 'warranty', label: 'Warranty ending', test: (a) => a._warranty === 'soon' },
  { id: 'maintenance', label: 'Maintenance due', test: (a) => a._att.some((x) => x.code === 'maintenance_due') },
  { id: 'nocustodian', label: 'No custodian', test: (a) => a._att.some((x) => x.code === 'no_custodian') },
  { id: 'left', label: 'Held by former employees', test: (a) => a._holderLeft },
];
export const viewById = (id) => SAVED_VIEWS.find((v) => v.id === id) || SAVED_VIEWS[0];

export const BLANK_Q = { search: '', status: '', condition: '', category: '', branch: '', department: '', holder: '', company: '', ownership: '', warranty: '', purchaseFrom: '', purchaseTo: '', min: '', max: '' };
export function matchesQuery(a, q) {
  if (q.status && a.status !== q.status) return false;
  if (q.condition && a.condition !== q.condition) return false;
  if (q.category && a._category !== q.category) return false;
  if (q.branch && String(a.branch_id) !== String(q.branch)) return false;
  if (q.department && (a.department || '') !== q.department) return false;
  if (q.holder && a._holderId !== q.holder) return false;
  if (q.company && (a.company || '') !== q.company) return false;
  if (q.ownership && a.ownership_status !== q.ownership) return false;
  if (q.warranty && a._warranty !== q.warranty) return false;
  if (q.purchaseFrom && (!a.purchase_date || a.purchase_date < q.purchaseFrom)) return false;
  if (q.purchaseTo && (!a.purchase_date || a.purchase_date > q.purchaseTo)) return false;
  const v = a._price ?? a._est;
  if (q.min !== '' && (v === null || v === undefined || Number(v) < Number(q.min))) return false;
  if (q.max !== '' && (v === null || v === undefined || Number(v) > Number(q.max))) return false;
  const s = String(q.search || '').trim().toLowerCase();
  if (!s) return true;
  return [a.asset_number, a.asset_tag, a.name, a.brand, a.model, a.serial_number, a._holder, a._branch, a.department, a.location, a._category, a.company, a.notes, a.status, a.condition].join(' ').toLowerCase().includes(s);
}
const text = (f) => (a, b) => String(f(a) || '').localeCompare(String(f(b) || ''), undefined, { numeric: true });
const num = (f) => (a, b) => (Number(f(a)) || 0) - (Number(f(b)) || 0);
export const SORT_FIELDS = [
  { key: 'asset_number', label: 'Asset No.' }, { key: 'name', label: 'Name' }, { key: 'status', label: 'Status' }, { key: 'condition', label: 'Condition' }, { key: 'holder', label: 'Holder' }, { key: 'branch', label: 'Branch' },
  { key: 'category', label: 'Category' }, { key: 'purchase', label: 'Purchase date' }, { key: 'moved', label: 'Last movement' }, { key: 'value', label: 'Value' }, { key: 'attention', label: 'Needs attention' },
];
export const SORT_COMPARATORS = {
  asset_number: text((a) => a.asset_number), name: text((a) => a.name), status: text((a) => a.status), condition: text((a) => a.condition), holder: text((a) => a._holder), branch: text((a) => a._branch),
  category: text((a) => a._category), purchase: text((a) => a.purchase_date), moved: text((a) => a.last_movement_at), value: num((a) => a._price ?? a._est ?? 0),
  attention: num((a) => a._att.filter((x) => x.code !== 'aging' && x.code !== 'warranty_expired').reduce((s2, x) => s2 + ({ red: 3, orange: 2, yellow: 1, gray: 0 }[x.tone] || 0), 0)),
};

// ---------------------------------------------------------------- people: who holds what, who has left
/** One row per person who holds, or has ever held, company property. */
export function peopleRows(ctx) {
  const byEmp = group(ctx.assets.filter((a) => a._asg && a._asg.assignee_type === 'Employee'), (a) => a._asg.employee_id);
  const hist = group(ctx.data.assignments.filter((x) => x.employee_id), 'employee_id');
  const incByAsset = group(ctx.data.incidents, 'asset_id');
  const ids = new Set([...Object.keys(byEmp), ...Object.keys(hist)]);
  return [...ids].map((id) => {
    const p = ctx.personById[id] || { id, full_name: nameOf(ctx, id), status: 'Active' };
    const holding = byEmp[id] || [], h = hist[id] || [];
    const incidents = h.flatMap((x) => (incByAsset[x.asset_id] || []).filter((i) => i.custodian_id === id));
    return { id, person: p, name: p.full_name || nameOf(ctx, id), holding, outstanding: holding.length, returned: h.filter((x) => x.end_reason === 'Returned').length, transferred: h.filter((x) => x.end_reason === 'Transferred').length,
      damaged: new Set(incidents.filter((i) => i.incident_type === 'Damaged').map((i) => i.id)).size, lost: new Set(incidents.filter((i) => i.incident_type !== 'Damaged').map((i) => i.id)).size,
      unacknowledged: holding.filter((a) => a._asg && !a._asg.legacy && !a._ack).length, left: !!p.left, branch_id: p.branch_id, department: p.department || '' };
  }).sort((a, b) => b.outstanding - a.outstanding || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------- supplies
/** stock of one supply: per branch, total, and whether it is low / out */
export function supplyRows(ctx) {
  const bal = group(ctx.data.balances, 'supply_id'), cost = new Map(ctx.data.supplyCosts.map((c) => [c.supply_id, c.unit_cost]));
  const catName = new Map(ctx.cats.map((c) => [c.id, c.name]));
  return ctx.data.supplies.map((s) => {
    const rows = bal[s.id] || [], per = {};
    rows.forEach((b) => { per[b.branch_id] = Number(b.quantity); });
    const total = sum(rows, (b) => b.quantity), threshold = Math.max(Number(s.minimum_stock) || 0, Number(s.reorder_level) || 0);
    const low = rows.filter((b) => Number(b.quantity) > 0 && threshold > 0 && Number(b.quantity) <= threshold), out = rows.filter((b) => Number(b.quantity) === 0);
    return { ...s, _category: catName.get(s.category_id) || '', _per: per, _total: total, _threshold: threshold, _low: low.map((b) => b.branch_id), _out: out.map((b) => b.branch_id), _cost: cost.has(s.id) ? cost.get(s.id) : null, _value: cost.has(s.id) && cost.get(s.id) !== null ? total * Number(cost.get(s.id)) : null,
      _state: !s.active ? 'inactive' : (rows.length && out.length === rows.length) || (!rows.length) ? 'out' : out.length ? 'out-some' : low.length ? 'low' : 'ok' };
  });
}
export const stockOf = (ctx, supplyId, branchId) => { const r = ctx.data.balances.find((b) => b.supply_id === supplyId && b.branch_id === branchId); return r ? Number(r.quantity) : 0; };
