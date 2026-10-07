// Access & Performance Control Center -- the Task Checklist this page grew out of ("each task starts from what their role/position grants"), now showing three things per task:
// POSITION DEFAULT (what the role/position rules give), OWNER RECORD (what the owner saw on the real account and recorded -- stored in access_checklist_verifications), and CURRENT.
// The default is worked out from the same role/position rules the screens use; the record is the owner's own note and does not change what anyone can do.
import { esc, toast, friendly, guarded, btn } from './apcCore.js?v=20261008b';

const POSITION_MANAGERS = ['Operations Supervisor', 'Inventory Supervisor', 'Admin Assistant'];
const CATEGORY_ORDER = ['inventory', 'movement', 'orders', 'transfers', 'branches', 'capital', 'payments', 'assets', 'lbc', 'refund', 'bills'];
const CATEGORY_LABEL = { inventory: 'Inventory Visibility', movement: 'Stock Movements', orders: 'Order & Item Status', transfers: 'Transfers', branches: 'Branches (Subasta / Scrap)', capital: 'Branch Capital',
  payments: 'Transactions', assets: 'Asset & Supplies Custodian', lbc: 'LBC Monitoring', refund: 'Refund Approval', bills: 'Expenses' };
const EXTRA_PAGE_CATEGORY = { transactions: 'payments', assets: 'assets', lbc: 'lbc' };
const NO_ACCESS_LABEL = { inventory: 'Cannot see any branch’s inventory', movement: 'Cannot record any stock movement', transfers: 'Cannot see or act on transfers', branches: 'Cannot add Subasta/Scrap entries',
  capital: 'Cannot access Branch Capital', payments: 'Cannot see Transactions', assets: 'Cannot access Asset & Supplies Custodian', lbc: 'Cannot access LBC Monitoring' };
const LEVELS = [['none', 'No access'], ['view', 'View only'], ['encode', 'Encode'], ['edit', 'Edit'], ['approver', 'Approver']];

/** What the role/position rules give this person, one row per task (the same rules the screens use). */
export function itemsForEmployee(emp) {
  const branch = (emp.branches && emp.branches.name) || 'their branch', isPosMgr = POSITION_MANAGERS.includes(emp.position);
  const cat = {}; CATEGORY_ORDER.forEach((c) => { cat[c] = { label: '', access: false, levels: [] }; });
  const set = (c, label, levels) => { cat[c] = { label, access: true, levels }; };
  if (emp.role === 'Manager') {
    set('inventory', 'Sees inventory for every branch', ['view']); set('movement', 'Can record stock movements at any branch', ['encode']);
    set('transfers', 'Can approve, ship, and receive transfers anywhere', ['edit', 'approver']); set('branches', 'Can add, edit, and delete Subasta/Scrap for every branch', ['edit']);
    set('capital', 'Can add (pending approval) and view Branch Capital for every branch — cannot approve or delete', ['view', 'encode']); set('payments', 'Can see, add, and import Transactions', ['edit']);
    set('assets', 'Can manage Asset & Supplies Custodian at every branch — cannot change its settings', ['edit']); set('lbc', 'Can see and manage LBC Monitoring', ['edit']);
  } else if (emp.role === 'Branch Supervisor') {
    set('inventory', 'Sees inventory for ' + branch + ' only', ['view']); set('movement', 'Can record Stock In/Out, Damage, Missing at ' + branch + ' (not Adjustment/Correction)', ['encode']);
    set('transfers', 'Can request, ship, and receive transfers involving ' + branch, ['edit']); set('branches', 'Can add, edit, and delete Subasta/Scrap for ' + branch, ['edit']);
    set('capital', 'Can add (pending approval) and view Branch Capital for ' + branch + ' — cannot approve or delete', ['view', 'encode']); set('payments', 'Can see Transactions and fill in FB Name/Customer/Order ID (not add/import/delete)', ['edit']);
    set('assets', 'Can assign, receive back, transfer, report and repair assets, and request / issue supplies, for ' + branch + ' only — cannot add assets or see prices', ['encode']); set('lbc', 'Can see and manage LBC Monitoring', ['edit']);
  } else if (emp.role === 'Staff') {
    set('inventory', 'Sees inventory for ' + branch + ' only', ['view']); set('movement', 'Can record Stock In/Out, Damage, Missing at ' + branch, ['encode']);
    set('transfers', 'Can view transfers involving ' + branch + ' (cannot request/approve)', ['view']); set('branches', 'Can add Subasta/Scrap entries for ' + branch + ' (cannot edit/delete)', ['encode']);
  } else if (emp.role === 'None' && emp.position === 'Sales Admin Associate') {
    set('inventory', 'Sees inventory for every branch', ['view']); set('transfers', 'Can request transfers (cannot approve)', ['encode']); set('branches', 'Can view and add Subasta/Scrap for any branch (cannot edit/delete)', ['encode']);
  } else if (emp.role === 'None' && isPosMgr) {
    set('branches', 'Can add, edit, and delete Subasta/Scrap for any branch', ['edit']);
    if (emp.position === 'Admin Assistant') { set('payments', 'Can see Transactions and fill in FB Name/Customer/Order ID (not add/import/delete)', ['edit']); set('lbc', 'Can see and manage LBC Monitoring', ['edit']); set('assets', 'Can manage Asset & Supplies Custodian at every branch', ['edit']); }
  } else if (emp.role === 'None' && emp.position === 'Personal Assistant') {
    set('branches', 'Can view Subasta/Scrap for every branch (view only)', ['view']); set('capital', 'Can add (pending approval) and view Branch Capital for every branch', ['view', 'encode']); set('assets', 'Can manage Asset & Supplies Custodian at every branch', ['edit']);
  } else if (emp.role === 'None') {
    cat.branches = emp.branches ? { label: 'Can add Subasta/Scrap entries for ' + branch + ' (cannot edit/delete)', access: true, levels: ['encode'] } : { label: 'No branch assigned — cannot add Subasta/Scrap entries', access: false, levels: [] };
  }
  if (!cat.assets.access) set('assets', 'Sees only the company property issued to them (My Company Assets) — can confirm receipt and report a problem', ['view']);
  const autoRefund = ['Admin', 'Manager', 'Branch Supervisor'].includes(emp.role) || isPosMgr;
  cat.refund = (autoRefund || emp.refund_approval_access) ? { label: 'Can approve and process refund requests', access: true, levels: ['approver'] } : { label: 'Can only submit refund requests (cannot approve)', access: false, levels: [] };
  cat.bills = emp.bills_access ? { label: 'Can see and add Expenses', access: true, levels: ['edit'] } : { label: 'Cannot see the Expenses tracker', access: false, levels: [] };
  cat.orders = emp.role === 'Manager' ? { label: 'Can add, update, and delete Order & Item Status entries', access: true, levels: ['edit'] } : { label: 'Can add and update Order & Item Status entries (cannot delete)', access: true, levels: ['encode'] };
  (emp.extra_page_access || []).forEach((page) => { const c = EXTRA_PAGE_CATEGORY[page]; if (c) cat[c] = { label: cat[c].access ? cat[c].label : 'Individually granted access to ' + page, access: true, levels: cat[c].levels.length ? cat[c].levels : ['edit'] }; });
  CATEGORY_ORDER.forEach((c) => { if (!cat[c].label) cat[c].label = NO_ACCESS_LABEL[c] || 'No access'; });
  return CATEGORY_ORDER.map((c) => ({ id: c, label: cat[c].label, levels: cat[c].access ? cat[c].levels : [] }));
}

let cache = null; // { emps: Map id -> raw, rows: Map "emp:item" -> {checked, levels} }
async function load(A, force) {
  if (cache && !force) return cache;
  const [emps, rows] = await Promise.all([A.api.checklistEmployees(), A.api.checklistRows()]);
  cache = { emps: new Map(emps.map((e) => [e.id, e])), rows: new Map(rows.map((r) => [r.employee_id + ':' + r.item_key, { checked: r.checked, levels: r.levels || [] }])) };
  return cache;
}
const chips = (levels) => levels.length ? levels.map((l) => '<span class="lvl-pill active ' + l + '">' + esc((LEVELS.find((x) => x[0] === l) || [l, l])[1]) + '</span>').join(' ') : '<span class="lvl-pill active none">No access</span>';

export async function renderChecklist(el, A, empId) {
  el.innerHTML = '<p class="muted">Loading the task checklist…</p>';
  let c;
  try { c = await load(A); } catch (err) { el.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; return; }
  const raw = c.emps.get(empId);
  if (!raw) { el.innerHTML = '<p class="muted">Admins (and people outside Miss Kittymae) are not part of this checklist.</p>'; return; }
  const items = itemsForEmployee(Object.assign({}, raw, { branches: raw.branch_name ? { name: raw.branch_name } : null }));
  const rec = (it) => c.rows.get(empId + ':' + it.id);
  const current = (it) => { const r = rec(it); return r ? (r.checked ? r.levels : []) : it.levels; };
  el.innerHTML = '<p class="muted">Each task starts from what their role/position gives. Click what you actually see on their real account to record it — more than one can apply (e.g. Edit + Approver). Your record is a note for you; it does not change what anyone can do.</p>' +
    '<div class="table-scroll"><table class="sd-tbl apc-check-tbl"><thead><tr><th>Task</th><th>Position default</th><th>Owner record <span class="muted">(click to record)</span></th><th>Current</th></tr></thead><tbody>' +
    items.map((it) => {
      const cur = current(it), r = rec(it);
      const pill = (lvl) => { const on = lvl === 'none' ? cur.length === 0 : cur.includes(lvl); return '<button type="button" class="lvl-pill ' + lvl + (on ? ' active' : '') + '" data-item="' + it.id + '" data-level="' + lvl + '">' + esc(LEVELS.find((x) => x[0] === lvl)[1]) + '</button>'; };
      return '<tr><td data-label="Task"><b>' + esc(CATEGORY_LABEL[it.id]) + '</b><div class="muted sd-small">' + esc(it.label) + '</div></td><td data-label="Position default">' + chips(it.levels) + '</td>' +
        '<td data-label="Owner record"><div class="lvl-picker">' + LEVELS.map((l) => pill(l[0])).join('') + '</div>' + (r ? '<div class="muted sd-small">Recorded by you' + (cur.join() !== it.levels.join() ? ' — <b>differs from the default</b>' : '') + '</div>' : '') + '</td>' +
        '<td data-label="Current">' + chips(cur) + '</td></tr>';
    }).join('') + '</tbody></table></div><div style="margin-top:8px;">' + btn('Record every task as shown', 'id="chk-all"', 'secondary') + '</div>';
  el.querySelectorAll('.lvl-pill[data-item]').forEach((b) => b.addEventListener('click', () => guarded(b, async () => {
    const it = items.find((x) => x.id === b.dataset.item), cur = current(it), lvl = b.dataset.level;
    const next = lvl === 'none' ? [] : (cur.includes(lvl) ? cur.filter((x) => x !== lvl) : [...cur, lvl]);
    await A.api.setChecklistItem(empId, it.id, next.length > 0, next);
    c.rows.set(empId + ':' + it.id, { checked: next.length > 0, levels: next });
    renderChecklist(el, A, empId);
  })));
  const all = el.querySelector('#chk-all');
  if (all) all.addEventListener('click', () => guarded(all, async () => {
    await Promise.all(items.map((it) => { const cur = current(it); c.rows.set(empId + ':' + it.id, { checked: cur.length > 0, levels: cur }); return A.api.setChecklistItem(empId, it.id, cur.length > 0, cur); }));
    toast('All ' + items.length + ' tasks recorded as shown.'); renderChecklist(el, A, empId);
  }));
}
