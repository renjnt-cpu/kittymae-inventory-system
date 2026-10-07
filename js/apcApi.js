// Access & Performance Control Center -- every database call the page makes (so the screens can be driven by a stand-in object in tests).
// Every apc_* function checks the caller's own permission key; a person without it gets an "ACCESS DENIED" error and no rows (migrations 196-199).
import { supabase } from './supabaseClient.js?v=20261008a';
import { saveEmployee, accessImpact } from './hrApi.js?v=20261008a';
import { getAccessChecklist, setAccessChecklistItem, getEmployeesForChecklist, setEmployeePassword, listPackedOrders, listOnlineOrderCareAssignments } from './api.js?v=20261008a';

async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params || {});
  if (error) throw new Error(error.message);
  return data;
}
const dates = (f) => ({ p_from: f.from, p_to: f.to });
const branch = (f) => (f.branch === null || f.branch === undefined || f.branch === '' ? null : Number(f.branch));

export const api = {
  // ---- what the page asks first (a person without access_perf.view gets {ok:false} and nothing else)
  context: () => rpc('apc_context'),
  // ---- access
  roster: () => rpc('apc_roster'),
  snapshot: () => rpc('apc_access_snapshot'),
  matrix: () => rpc('apc_matrix'),
  notes: () => rpc('apc_get_notes'),
  history: (f) => rpc('apc_permission_history', Object.assign(dates(f), { p_employee: f.employee || null })),
  // ---- performance (staff_analytics.view)
  performance: (f) => rpc('apc_performance', Object.assign(dates(f), { p_branch: branch(f) })),
  errors: (f) => rpc('apc_errors', Object.assign(dates(f), { p_branch: branch(f) })),
  activity: (f) => rpc('apc_activity', Object.assign(dates(f), { p_employee: f.employee || null, p_module: f.module || null, p_kind: f.kind || null, p_branch: branch(f), p_limit: f.limit || 100, p_offset: f.offset || 0 })),
  drill: (f) => rpc('apc_drilldown', Object.assign(dates(f), { p_employee: f.employee, p_metric: f.metric, p_branch: branch(f) })),
  scrapPerformance: (f) => rpc('apc_scrap_performance', Object.assign(dates(f), { p_branch: branch(f), p_karats: f.karats && f.karats.length ? f.karats : null })),
  scrapPurity: (f) => rpc('apc_scrap_purity', Object.assign(dates(f), { p_branch: branch(f), p_employee: f.employee || null })),
  branchSummary: (f) => rpc('apc_branch_summary', dates(f)),
  pending: () => rpc('apc_pending_counts'),
  inventoryValue: (categories) => rpc('apc_inventory_value', { p_categories: categories && categories.length ? categories : null }),
  // ---- the owner's actions
  applyOverrides: (employee, changes, reason) => rpc('apc_apply_overrides', { p_employee: employee, p_changes: changes, p_reason: reason || null }),
  resetToDefault: (employee, reason) => rpc('apc_reset_to_default', { p_employee: employee, p_reason: reason || null }),
  markVerified: (employee, note) => rpc('apc_mark_verified', { p_employee: employee, p_note: note || null }),
  setNote: (employee, note) => rpc('apc_set_note', { p_employee: employee, p_note: note }),
  ignoreError: (key, ignore, reason) => rpc('apc_ignore_error', { p_key: key, p_ignore: !!ignore, p_reason: reason || null }),
  setSetting: (key, value) => rpc('apc_set_setting', { p_key: key, p_value: value }),
  setBranchAccess: (employee, ids) => rpc('set_employee_branch_access', { p_employee_id: employee, p_branch_ids: ids }),
  // ---- account actions go through the same HR function the HR 201 File page uses (it shows the access impact first and logs the change)
  hrImpact: (id, changes) => accessImpact(id, changes),
  hrSave: (id, changes, o) => saveEmployee(id, changes, o),
  setPassword: (id, pw) => setEmployeePassword(id, pw),
  // ---- the task checklist this page grew out of (what each screen allows, and what the owner recorded for it)
  checklistEmployees: () => getEmployeesForChecklist(),
  checklistRows: () => getAccessChecklist(),
  setChecklistItem: (id, item, checked, levels) => setAccessChecklistItem(id, item, checked, levels),
  // ---- online order leaderboards (Pancake): attributed by their own fields, never mixed into the POS ranking
  packedOrders: (f) => listPackedOrders({ fromDate: f.from, toDate: f.to }),
  careAssignments: (f) => listOnlineOrderCareAssignments({ fromDate: f.from, toDate: f.to }),
};
