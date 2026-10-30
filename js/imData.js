// Item Monitoring -- the rules and look-ups the tabs share, worked out from the data the page already loaded (no database calls here). The rules are the old page's, unchanged:
//   * LOW STOCK     = the product has a reorder level and the quantity available is at or under it
//   * COUNT CADENCE = by the product's Value Tier: A weekly (7 days), B monthly (30), C quarterly (90), anything else 30. Next due = last count + cadence; never counted = due now.
//   * qty_available is what can still be sold; qty_reserved is held for layaway. What the branch physically holds is the two added together.
import { materialGroup } from './productMaterial.js?v=20261030a';

export const CADENCE_DAYS = { A: 7, B: 30, C: 90 };
export const cadenceForTier = (tier) => CADENCE_DAYS[tier] || 30;
/** Same branch-scope rule as assert_can_act_on_branch(): these positions (and Admin / Manager) may count any branch; everyone else only their own. */
export const UNSCOPED_POSITIONS = ['Sales Admin Associate', 'Operations Supervisor', 'Inventory Supervisor', 'Admin Assistant'];
export const APPROVER_KEY = 'inventory.final_approve_factory_purchase';
export const ANY_BRANCH_KEY = 'inventory.record_factory_purchase_any_branch';

export const isLow = (row) => { const p = row.products || {}; return p.reorder_level != null && Number(row.qty_available) <= Number(p.reorder_level); };

/** Adds the worked-out fields every row needs once, so filtering and sorting thousands of rows stays instant. */
export function decorateStock(rows, latest, branchById) {
  const now = Date.now();
  rows.forEach((r) => {
    const p = r.products || {};
    const last = latest[r.sku + '|' + r.branch_id] || null;
    const due = last ? new Date(last).getTime() + cadenceForTier(p.value_tier) * 86400000 : now;
    r._low = isLow(r);
    r._last = last;
    r._due = due;
    r._overdue = due <= now;
    r._name = p.item_name || '';
    r._branch = branchById[r.branch_id] || '';
    r._total = Number(r.qty_available || 0) + Number(r.qty_reserved || 0);
    r._text = (r.sku + ' ' + (p.item_name || '')).toLowerCase();
  });
  return rows;
}

/** One SKU across every branch, from the loaded rows: { sku, name, available, reserved, total, perBranch: [{ branch_id, available, reserved }] }. */
export function skuSummary(rows, sku) {
  const mine = rows.filter((r) => r.sku === sku);
  if (!mine.length) return null;
  return {
    sku, name: (mine[0].products || {}).item_name || '', category: (mine[0].products || {}).category || '',
    available: mine.reduce((s, r) => s + Number(r.qty_available || 0), 0),
    reserved: mine.reduce((s, r) => s + Number(r.qty_reserved || 0), 0),
    total: mine.reduce((s, r) => s + Number(r.qty_available || 0) + Number(r.qty_reserved || 0), 0),
    grams: mine.reduce((s, r) => s + Number(r.total_grams_on_hand || 0), 0),
    perBranch: mine.map((r) => ({ branch_id: r.branch_id, available: Number(r.qty_available || 0), reserved: Number(r.qty_reserved || 0), overdue: r._overdue, last: r._last })),
  };
}

/** The one SKU a search points at, if it is exactly one: an exact SKU match first, otherwise when every matching row belongs to a single SKU. */
export function singleSku(rows, search) {
  const q = String(search || '').trim().toLowerCase();
  if (!q) return null;
  const exact = rows.find((r) => r.sku.toLowerCase() === q);
  if (exact) return exact.sku;
  const set = new Set(rows.filter((r) => r._text.includes(q)).map((r) => r.sku));
  return set.size === 1 ? [...set][0] : null;
}

/** The Gold / Silver / Coated answer for a product (js/productMaterial.js, unchanged). */
export const materialOf = (category, name) => materialGroup(category, name);

/** Who may do what on this page, worked out from the signed-in person. The database enforces every one of these again; this only decides what to show. */
export function whoAmI(employee, overview) {
  const perms = employee.permissions || [];
  const role = employee.role;
  const isApprover = overview && typeof overview.is_approver === 'boolean' ? overview.is_approver : perms.includes(APPROVER_KEY);
  const canRecord = ['Admin', 'Manager'].includes(role) || role === 'Branch Supervisor' || employee.position === 'Admin Assistant' || perms.includes(ANY_BRANCH_KEY);
  const canDeleteAny = ['Admin', 'Manager'].includes(role) || employee.position === 'Admin Assistant';
  return {
    isApprover, canRecord,
    branchLocked: role === 'Branch Supervisor' && !['Admin', 'Manager'].includes(role),                 // a Branch Supervisor records for their own branch only
    isScoped: ['Admin', 'Manager'].includes(role) ? false : !UNSCOPED_POSITIONS.includes(employee.position), // counts: own branch only
    canDelete: (purchaseBranchId) => canDeleteAny || (role === 'Branch Supervisor' && employee.branch_id === purchaseBranchId),
    canSeeAll: ['Admin', 'Manager'].includes(role) || isApprover,
  };
}
