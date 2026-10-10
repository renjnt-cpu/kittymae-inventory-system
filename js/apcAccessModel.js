// Access & Performance Control Center -- how the system's real permission keys are grouped for the owner: by module and by what they let a person do
// (view / encode / edit / approve / delete / export), which of them are SENSITIVE, where each person's access comes from, and which combinations deserve a second look.
// Nothing here invents a permission: a module with no key behind it says so, instead of showing a switch that does nothing.

export const MODULES = ['DASHBOARD', 'SALES', 'POS', 'PRODUCTS', 'SKU CATALOG', 'INVENTORY', 'PURCHASES', 'SUPPLIERS', 'CUSTOMERS', 'SCRAP', 'ACCOUNTING', 'FINANCE', 'REPORTS', 'PEOPLE', 'SETTINGS', 'OPERATIONS', 'SYSTEM'];
export const MODULE_NOTE = {
  CUSTOMERS: 'No permission keys yet — customer records follow the screen rules for each role.',
  SYSTEM: 'Role markers used by older screens; they are set by role and position, not switched one by one.',
  OPERATIONS: 'Company assets, supplies and LBC.',
};
export const ACTIONS = [
  { id: 'view', label: 'View' }, { id: 'add', label: 'Encode / Add' }, { id: 'edit', label: 'Edit' },
  { id: 'approve', label: 'Approve' }, { id: 'delete', label: 'Delete' }, { id: 'export', label: 'Export' },
];

// key -> [module, action]
export const KEY_MAP = {
  'dashboard.view': ['DASHBOARD', 'view'], 'dashboard.sales': ['DASHBOARD', 'view'], 'dashboard.inventory': ['DASHBOARD', 'view'], 'dashboard.all_branches': ['DASHBOARD', 'view'],
  'dashboard.cost': ['DASHBOARD', 'view'], 'dashboard.profit': ['DASHBOARD', 'view'], 'dashboard.capital': ['DASHBOARD', 'view'], 'dashboard.expenses': ['DASHBOARD', 'view'],
  'dashboard.export': ['DASHBOARD', 'export'], 'dashboard.capital_manage': ['FINANCE', 'edit'], 'dashboard.settings': ['SETTINGS', 'edit'],
  'branches.view_all': ['SALES', 'view'], 'layaway.request_delete': ['SALES', 'delete'],
  'message_pancake.view': ['SALES', 'view'], 'message_pancake.manage': ['SALES', 'edit'], 'message_pancake.view_alerts': ['SALES', 'view'], 'message_pancake.view_all_branches': ['SALES', 'view'], 'message_pancake.analytics': ['SALES', 'view'],
  'message_pancake.reply': ['SALES', 'edit'], 'message_pancake.assign': ['SALES', 'edit'], 'message_pancake.escalate': ['SALES', 'edit'], 'message_pancake.change_classification': ['SALES', 'edit'],
  'pos_sale.manage': ['POS', 'delete'], 'transaction.edit_amount': ['POS', 'edit'],
  'datafix.view': ['PRODUCTS', 'view'], 'datafix.team': ['PRODUCTS', 'view'], 'datafix.sku_create': ['PRODUCTS', 'add'], 'datafix.category': ['PRODUCTS', 'edit'], 'datafix.cost': ['PRODUCTS', 'edit'],
  'datafix.sku_match': ['PRODUCTS', 'edit'], 'datafix.bulk': ['PRODUCTS', 'edit'], 'datafix.assign': ['PRODUCTS', 'approve'],
  'catalog.cost_view': ['SKU CATALOG', 'view'], 'catalog.cost_edit': ['SKU CATALOG', 'edit'], 'extra_access.products_edit': ['SKU CATALOG', 'edit'],
  'inventory.pull_out.create': ['INVENTORY', 'add'], 'inventory.pull_out.edit': ['INVENTORY', 'edit'], 'transfer.receive_any_branch': ['INVENTORY', 'edit'],
  'inventory.record_factory_purchase_any_branch': ['PURCHASES', 'add'], 'datafix.purchase': ['PURCHASES', 'edit'],
  'datafix.supplier': ['SUPPLIERS', 'edit'], 'datafix.supplier_add': ['SUPPLIERS', 'add'],
  'scrap.edit': ['SCRAP', 'edit'], 'subasta.manage': ['SCRAP', 'edit'], 'subasta.pawner_history': ['SCRAP', 'view'],
  'extra_access.transactions': ['ACCOUNTING', 'view'],
  'bills.access': ['FINANCE', 'view'], 'bills.view': ['FINANCE', 'view'], 'bills.branch': ['FINANCE', 'add'], 'bills.manage': ['FINANCE', 'edit'], 'bills.admin': ['FINANCE', 'delete'],
  'refunds.view': ['FINANCE', 'view'], 'refunds.approve': ['FINANCE', 'approve'], 'refunds.pay': ['FINANCE', 'edit'], 'refunds.admin': ['FINANCE', 'delete'],
  'hr.view_profile': ['PEOPLE', 'view'], 'hr.view_documents': ['PEOPLE', 'view'], 'hr.view_notes': ['PEOPLE', 'view'], 'hr.view_management_notes': ['PEOPLE', 'view'],
  'hr.view_government_ids': ['PEOPLE', 'view'], 'hr.reveal_government_ids': ['PEOPLE', 'view'], 'hr.view_compensation': ['PEOPLE', 'view'], 'hr.view_access': ['PEOPLE', 'view'], 'hr.view_audit_log': ['PEOPLE', 'view'],
  'hr.add_employee': ['PEOPLE', 'add'], 'hr.add_notes': ['PEOPLE', 'add'], 'hr.edit_profile': ['PEOPLE', 'edit'], 'hr.edit_employment': ['PEOPLE', 'edit'], 'hr.edit_compensation': ['PEOPLE', 'edit'],
  'hr.edit_government_ids': ['PEOPLE', 'edit'], 'hr.manage_documents': ['PEOPLE', 'edit'], 'hr.manage_201_file': ['PEOPLE', 'edit'], 'hr.reset_password': ['PEOPLE', 'edit'],
  'hr.archive_employee': ['PEOPLE', 'delete'], 'hr.delete_documents': ['PEOPLE', 'delete'], 'hr.export_print': ['PEOPLE', 'export'],
  'leave.view_all': ['PEOPLE', 'view'], 'leave.audit': ['PEOPLE', 'view'], 'leave.hr': ['PEOPLE', 'edit'], 'leave.final_approve': ['PEOPLE', 'approve'],
  'access_checklist.view': ['PEOPLE', 'view'], 'access_perf.view': ['PEOPLE', 'view'], 'staff_analytics.view': ['PEOPLE', 'view'],
  'assets.view': ['OPERATIONS', 'view'], 'assets.view_all_branches': ['OPERATIONS', 'view'], 'assets.view_cost': ['OPERATIONS', 'view'], 'assets.reports': ['OPERATIONS', 'view'], 'extra_access.assets': ['OPERATIONS', 'view'], 'extra_access.lbc': ['OPERATIONS', 'view'],
  'assets.add': ['OPERATIONS', 'add'], 'assets.report_damage': ['OPERATIONS', 'add'], 'assets.assign': ['OPERATIONS', 'edit'], 'assets.edit': ['OPERATIONS', 'edit'], 'assets.repairs': ['OPERATIONS', 'edit'],
  'assets.return': ['OPERATIONS', 'edit'], 'assets.transfer': ['OPERATIONS', 'edit'], 'assets.dispose': ['OPERATIONS', 'approve'], 'assets.admin': ['OPERATIONS', 'delete'], 'assets.export': ['OPERATIONS', 'export'],
  'supplies.view': ['OPERATIONS', 'view'], 'supplies.request': ['OPERATIONS', 'add'], 'supplies.manage': ['OPERATIONS', 'add'], 'supplies.issue': ['OPERATIONS', 'edit'], 'supplies.adjust': ['OPERATIONS', 'edit'], 'supplies.transfer': ['OPERATIONS', 'edit'],
  'system.admin': ['SETTINGS', 'edit'], 'system.manager_or_admin': ['SETTINGS', 'view'],
};
// every "Activity: ..." key lets a person see that kind of event in the activity feed
const activityOf = (k) => k.startsWith('activity.') ? ['REPORTS', 'view'] : null;
export function describeKey(key) {
  const m = KEY_MAP[key] || activityOf(key) || (key.startsWith('role.') ? ['SYSTEM', 'view'] : ['SYSTEM', 'view']);
  return { module: m[0], action: m[1], sensitive: SENSITIVE[key] || null, locked: LOCKED_KEYS.includes(key) };
}

// the confidential ones, under the names the owner uses
export const SENSITIVE = {
  'catalog.cost_view': 'View Supplier Cost', 'catalog.cost_edit': 'View Supplier Cost', 'datafix.purchase': 'View Supplier Cost',
  'dashboard.cost': 'View Product Cost', 'datafix.cost': 'View Product Cost', 'assets.view_cost': 'View Product Cost',
  'dashboard.profit': 'View Gross / Net Profit',
  'dashboard.capital': 'View Owner Capital', 'dashboard.capital_manage': 'View Owner Capital',
  'bills.access': 'View Accounting', 'bills.view': 'View Accounting', 'bills.manage': 'View Accounting', 'bills.admin': 'View Accounting', 'dashboard.expenses': 'View Accounting', 'extra_access.transactions': 'View Accounting',
  'hr.view_compensation': 'View Payroll', 'hr.edit_compensation': 'View Payroll',
  'activity.audit': 'View Audit Log', 'hr.view_audit_log': 'View Audit Log', 'leave.audit': 'View Audit Log', 'assets.admin': 'View Audit Log',
  'hr.view_access': 'View Access Control', 'access_checklist.view': 'View Access Control', 'access_perf.view': 'View Access Control', 'staff_analytics.view': 'View Access Control', 'system.admin': 'View Access Control', 'hr.reset_password': 'View Access Control',
  'hr.view_government_ids': 'View Government IDs', 'hr.reveal_government_ids': 'View Government IDs', 'hr.edit_government_ids': 'View Government IDs',
};
export const SENSITIVE_ORDER = ['View Supplier Cost', 'View Product Cost', 'View Gross / Net Profit', 'View Owner Capital', 'View Accounting', 'View Bank Balance', 'View Payroll', 'View Audit Log', 'View Access Control', 'View Government IDs'];
export const SENSITIVE_NOTE = { 'View Bank Balance': 'There is no separate bank-balance permission — it is shown with Owner Capital.' };
/** Only a person who already holds access_perf.view can give or take these two (the database enforces it too). */
export const LOCKED_KEYS = ['access_perf.view', 'staff_analytics.view'];

export const BRANCH_SCOPE_KEYS = ['branches.view_all', 'dashboard.all_branches', 'assets.view_all_branches', 'activity.view.all_branches', 'transfer.receive_any_branch'];

// the "do they still need this?" review (spec: Sales Edit? Refund? Inventory Edit? Supplier Cost? Accounting? Other Branch Access?)
export const REVIEW_GROUPS = [
  { id: 'sales', question: 'Does this person still need to edit sales and recorded amounts?', keys: ['transaction.edit_amount', 'pos_sale.manage', 'layaway.request_delete', 'scrap.edit', 'subasta.manage'], module: 'POS' },
  { id: 'refund', question: 'Does this person still need to work with refunds?', keys: ['refunds.view', 'refunds.approve', 'refunds.pay', 'refunds.admin'], module: 'FINANCE' },
  { id: 'inventory', question: 'Does this person still need to edit inventory?', keys: ['inventory.pull_out.create', 'inventory.pull_out.edit', 'inventory.record_factory_purchase_any_branch', 'extra_access.products_edit', 'transfer.receive_any_branch'], module: 'INVENTORY' },
  { id: 'cost', question: 'Does this person still need to see supplier and product cost?', keys: ['catalog.cost_view', 'catalog.cost_edit', 'dashboard.cost', 'datafix.cost', 'datafix.purchase', 'assets.view_cost'], module: 'SKU CATALOG' },
  { id: 'accounting', question: 'Does this person still need accounting, expenses or profit figures?', keys: ['bills.access', 'bills.view', 'bills.branch', 'bills.manage', 'bills.admin', 'dashboard.expenses', 'dashboard.profit', 'dashboard.capital', 'dashboard.capital_manage', 'extra_access.transactions'], module: 'FINANCE' },
  { id: 'branches', question: 'Does this person still need access to other branches?', keys: BRANCH_SCOPE_KEYS, module: 'SALES' },
];

// ---------------------------------------------------------------- where a person's access comes from
const has = (arr, k) => Array.isArray(arr) && arr.includes(k);
/** The state of one key for one person, with where it comes from. `pending` (optional) is a Map key -> 'grant'|'revoke'|'clear' not yet saved. */
export function keyState(emp, key, pending) {
  const eff = has(emp.effective_keys, key), def = has(emp.default_keys, key);
  const ov = (emp.overrides || []).find((o) => o.key === key && o.active);
  const fromRole = has(emp.role_keys, key), fromTitle = has(emp.title_keys, key) && emp.auto_access;
  const templateOnly = has(emp.title_keys, key) && !emp.auto_access;
  let source, label;
  if (ov) { source = ov.granted ? 'override-grant' : 'override-revoke'; label = ov.granted ? 'Custom override — granted' : 'Custom override — taken away'; }
  else if (fromRole && fromTitle) { source = 'role+position'; label = 'Inherited from Role and Position'; }
  else if (fromRole) { source = 'role'; label = 'Inherited from Role (' + emp.role + ')'; }
  else if (fromTitle) { source = 'position'; label = 'Inherited from Position (' + (emp.job_title || '') + ')'; }
  else if (templateOnly) { source = 'none'; label = 'Position grants it, but Automatic Access is off'; }
  else { source = 'none'; label = 'Not granted'; }
  let now = eff;
  const p = pending && pending.get(key);
  if (p === 'grant') now = true; else if (p === 'revoke') now = false; else if (p === 'clear') now = def;
  return { on: eff, now, def, source, label, override: ov || null, changed: now !== eff, pending: p || null };
}
/** What to store so the person ends up with `wantOn` for this key: nothing, a custom grant / revoke, or removing a custom override. */
export function actionFor(emp, key, wantOn) {
  const def = has(emp.default_keys, key), ov = (emp.overrides || []).find((o) => o.key === key && o.active);
  if (wantOn === def) return ov ? 'clear' : null;
  return wantOn ? 'grant' : 'revoke';
}
/** Keys that differ between what is in force and a target set -> the pending map that would make them equal. */
export function pendingToMatch(emp, targetKeys, catalogKeys, { onlyAdd } = {}) {
  const p = new Map(), target = new Set(targetKeys);
  catalogKeys.forEach((k) => {
    if (LOCKED_KEYS.includes(k)) return;
    const eff = has(emp.effective_keys, k), want = target.has(k);
    if (want === eff || (onlyAdd && !want)) return;
    const a = actionFor(emp, k, want);
    if (a) p.set(k, a);
  });
  return p;
}

// ---------------------------------------------------------------- unusual combinations (the owner decides; nothing is removed automatically)
const ACCOUNTING_KEYS = ['bills.manage', 'bills.admin', 'dashboard.capital', 'dashboard.capital_manage', 'dashboard.expenses', 'dashboard.profit', 'extra_access.transactions'];
/** [{ text, level }] -- 'warn' = an unusual combination worth a decision, 'info' = something the owner granted on purpose that is worth remembering. */
export function accessConflicts(emp, ownerId) {
  const eff = emp.effective_keys || [], held = (k) => eff.includes(k);
  const out = [], pos = emp.job_title || emp.position || '', add = (text, level) => out.push({ text, level: level || 'warn' });
  const isPos = /sales admin associate|cashier|\bpos\b/i.test(pos) || emp.role === 'Staff';
  const isEncoder = /encoder|inventory staff/i.test(pos);
  if (isPos && ACCOUNTING_KEYS.some(held)) add('POS user has Accounting access (' + ACCOUNTING_KEYS.filter(held).join(', ') + ')');
  if ((isEncoder || isPos) && held('dashboard.profit')) add('Encoder can view Net Profit');
  if (isPos && (held('catalog.cost_edit') || held('datafix.cost'))) add('Cashier can edit supplier costs');
  if (emp.role !== 'Admin' && (held('system.admin') || held('hr.reset_password') || held('hr.view_access'))) add('A non-Admin can see or change who has access to what');
  if (emp.role !== 'Admin' && !/HR Supervisor/i.test(pos) && (held('hr.view_compensation') || held('hr.reveal_government_ids'))) add('Payroll or government ID access outside HR');
  if (emp.id !== ownerId && (held('access_perf.view') || held('staff_analytics.view'))) add('Holds an owner-only key — the owner gave it on purpose; confirm it is still wanted');
  const sens = (emp.overrides || []).filter((o) => o.active && o.granted && SENSITIVE[o.key] && !LOCKED_KEYS.includes(o.key));
  if (sens.length) add('Sensitive access granted individually: ' + [...new Set(sens.map((o) => SENSITIVE[o.key]))].join(', '), 'info');
  return out;
}
