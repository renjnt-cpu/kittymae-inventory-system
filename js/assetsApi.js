// Assets & Supplies Custodian -- every Supabase call the module makes lives here, so the screens never touch `supabase` directly (and can be
// exercised against a stand-in object in tests). Reads go straight to the tables (row-level security decides what each person may see:
// an employee sees only what they hold, a branch supervisor their own branch, a custodian every branch); every CHANGE goes through an
// asset_* / supply_* / custodian_* database function that re-checks who is calling and what state the record is in. A function that finds
// a problem returns {ok:false, errors:[...]} -- callers show those; anything else thrown is an Error.
import { supabase } from './supabaseClient.js?v=20261007c';
import { FILE_TYPES, MAX_FILE } from './assetsLogic.js?v=20261007c';

async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw new Error(error.message);
  return data;
}
function check({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}
/** Reads a whole table past the server's 1,000-row page limit. `build` must return a fresh, ordered query each call. */
async function fetchAll(build, pageSize = 1000, cap = 50000) {
  const rows = [];
  for (let from = 0; from < cap; from += pageSize) {
    const data = check(await build().range(from, from + pageSize - 1));
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}
const table = (name, order = 'id') => fetchAll(() => supabase.from(name).select('*').order(order).order('id'));

// ---------------------------------------------------------------- who am I, who can I pick
export const myAccess = () => rpc('asset_my_access');
export const listPeople = () => rpc('asset_people');
export const listDepartments = () => rpc('asset_departments');
export const findByNumber = (number) => rpc('asset_by_number', { p_number: number });
export const employeeSummary = (id) => rpc('asset_employee_summary', { p_employee: id });
export const offboardingAlerts = () => rpc('asset_offboarding_alerts');
export const dashboard = () => rpc('custodian_dashboard');

// ---------------------------------------------------------------- reads
export async function listBranches() {
  return check(await supabase.from('branches').select('*').eq('is_active', true).order('display_order'));
}
export const listCategories = () => table('custodian_categories', 'sort_order');
export async function listSettings() {
  return check(await supabase.from('custodian_settings').select('key, value'));
}
export const listAssets = () => fetchAll(() => supabase.from('assets').select('*').order('asset_number'));
export const listAccessories = () => fetchAll(() => supabase.from('asset_accessories').select('*').eq('active', true).order('id'));
export const listAssignments = () => table('asset_assignments');
export const listAcknowledgments = () => table('asset_acknowledgments');
export const listAssetTransfers = () => fetchAll(() => supabase.from('asset_transfers').select('*').order('created_at', { ascending: false }).order('id'));
export const listRepairs = () => fetchAll(() => supabase.from('asset_repairs').select('*').order('reported_at', { ascending: false }).order('id'));
export const listIncidents = () => fetchAll(() => supabase.from('asset_incidents').select('*').order('reported_at', { ascending: false }).order('id'));
export const listDisposals = () => fetchAll(() => supabase.from('asset_disposals').select('*').order('requested_at', { ascending: false }).order('id'));
/** money lives in separate tables; people without "see costs" get an empty list, not an error */
export async function listFinancials() {
  try { return await fetchAll(() => supabase.from('asset_financials').select('*').order('asset_id')); } catch (e) { return []; }
}
export async function listRepairCosts() {
  try { return await fetchAll(() => supabase.from('asset_repair_costs').select('*').order('repair_id')); } catch (e) { return []; }
}
export async function listSupplyCosts() {
  try { return await fetchAll(() => supabase.from('supply_costs').select('*').order('supply_id')); } catch (e) { return []; }
}
export async function listMovements(assetId, limit = 400) {
  return check(await supabase.from('asset_movements').select('*').eq('asset_id', assetId).order('movement_date', { ascending: false }).order('id', { ascending: false }).limit(limit));
}
/** the newest movements across every asset this person can see (the dashboard's "recent activity") */
export async function listRecentMovements(limit = 20) {
  return check(await supabase.from('asset_movements').select('*').order('movement_date', { ascending: false }).order('id', { ascending: false }).limit(limit));
}
export async function listAssetFiles(assetId) {
  return check(await supabase.from('asset_files').select('*').eq('asset_id', assetId).is('deleted_at', null).order('created_at', { ascending: false }));
}
/** The permanent audit log (Admin / Manager only through row-level security). `before` pages backwards. */
export async function listAudit({ assetId = null, before = null, limit = 300 } = {}) {
  let q = supabase.from('asset_audit_logs').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit);
  if (assetId) q = q.eq('asset_id', assetId);
  if (before) q = q.lt('created_at', before);
  return check(await q);
}
export async function employeeNames(ids) {
  if (!ids.length) return {};
  const data = await rpc('get_employee_names', { ids });
  return Object.fromEntries((data || []).map((e) => [e.id, e.full_name]));
}

// supplies
export const listSupplies = () => table('supplies', 'name');
export const listBalances = () => fetchAll(() => supabase.from('supply_branch_balances').select('*').order('supply_id').order('branch_id'));
export const listSupplyRequests = () => fetchAll(() => supabase.from('supply_requests').select('*, supply_request_items(*)').order('requested_at', { ascending: false }).order('id'));
export const listIssuances = () => fetchAll(() => supabase.from('supply_issuances').select('*, supply_issuance_items(*)').order('issued_at', { ascending: false }).order('id'), 1000, 10000);
export const listReceipts = () => fetchAll(() => supabase.from('supply_receipts').select('*, supply_receipt_items(*)').order('received_on', { ascending: false }).order('id'), 1000, 10000);
export const listSupplyTransfers = () => fetchAll(() => supabase.from('supply_transfers').select('*').order('created_at', { ascending: false }).order('id'), 1000, 10000);
/** the stock ledger (one row per change). `supplyId` narrows it to one supply. */
export async function listSupplyLedger({ supplyId = null, branchId = null, before = null, limit = 500 } = {}) {
  let q = supabase.from('supply_transactions').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit);
  if (supplyId) q = q.eq('supply_id', supplyId);
  if (branchId) q = q.eq('branch_id', branchId);
  if (before) q = q.lt('created_at', before);
  return check(await q);
}
/** the whole ledger inside a date range, for the usage reports (paged past the 1,000-row limit) */
export const listSupplyLedgerRange = (from, to) => fetchAll(() => {
  let q = supabase.from('supply_transactions').select('*').order('created_at').order('id');
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lt('created_at', to);
  return q;
}, 1000, 100000);

// ---------------------------------------------------------------- assets: changes
export const createAsset = (p) => rpc('asset_create', { p });
export const updateAsset = (id, p) => rpc('asset_update', { p_id: id, p });
export const setCondition = (id, condition, reason) => rpc('asset_set_condition', { p_id: id, p_condition: condition, p_reason: reason });
export const setFinancials = (id, p) => rpc('asset_set_financials', { p_id: id, p });
export const setAccessories = (id, names) => rpc('asset_set_accessories', { p_id: id, p_names: names });
export const assignAsset = (id, p) => rpc('asset_assign', { p_id: id, p });
export const acknowledge = (assignmentId, role, note) => rpc('asset_acknowledge', { p_assignment: assignmentId, p_role: role, p_note: note || null });
export const requestReturn = (id, p) => rpc('asset_request_return', { p_id: id, p });
export const returnAsset = (id, p) => rpc('asset_return', { p_id: id, p });
export const transferToEmployee = (id, p) => rpc('asset_transfer_employee', { p_id: id, p });
export const requestBranchTransfer = (id, p) => rpc('asset_branch_transfer_request', { p_id: id, p });
export const approveBranchTransfer = (id, note) => rpc('asset_branch_transfer_approve', { p_transfer: id, p_note: note || null });
export const rejectBranchTransfer = (id, reason) => rpc('asset_branch_transfer_reject', { p_transfer: id, p_reason: reason });
export const cancelBranchTransfer = (id, reason) => rpc('asset_branch_transfer_cancel', { p_transfer: id, p_reason: reason });
export const releaseBranchTransfer = (id, p) => rpc('asset_branch_transfer_release', { p_transfer: id, p: p || {} });
export const receiveBranchTransfer = (id, p) => rpc('asset_branch_transfer_receive', { p_transfer: id, p });
// reports, repairs, disposals
export const reportIncident = (id, p) => rpc('asset_report_incident', { p_id: id, p });
export const reviewIncident = (id, p) => rpc('asset_review_incident', { p_incident: id, p });
export const resolveIncident = (id, p) => rpc('asset_resolve_incident', { p_incident: id, p });
export const createRepair = (id, p) => rpc('asset_repair_create', { p_id: id, p });
export const updateRepair = (id, p) => rpc('asset_repair_update', { p_repair: id, p });
export const requestDisposal = (id, p) => rpc('asset_disposal_request', { p_id: id, p });
export const approveDisposal = (id, notes) => rpc('asset_disposal_approve', { p_disposal: id, p_notes: notes || null });
export const rejectDisposal = (id, reason) => rpc('asset_disposal_reject', { p_disposal: id, p_reason: reason });
export const cancelDisposal = (id, reason) => rpc('asset_disposal_cancel', { p_disposal: id, p_reason: reason });
export const completeDisposal = (id, p) => rpc('asset_disposal_complete', { p_disposal: id, p });
export const archiveAsset = (id, reason) => rpc('asset_archive', { p_id: id, p_reason: reason });
export const saveSettings = (p) => rpc('custodian_save_settings', { p });
export const saveCategory = (kind, name, active, sort) => rpc('custodian_save_category', { p_kind: kind, p_name: name, p_active: active, p_sort: sort === undefined ? null : sort });

// ---------------------------------------------------------------- supplies: changes
export const saveSupply = (id, p) => rpc('supply_save', { p_id: id, p });
export const receiveSupplies = (p) => rpc('supply_receive', { p });
export const issueSupplies = (p) => rpc('supply_issue', { p });
export const adjustSupply = (p) => rpc('supply_adjust', { p });
export const transferSupply = (p) => rpc('supply_transfer', { p });
export const createSupplyRequest = (p) => rpc('supply_request_create', { p });
export const supplyRequestAction = (id, p) => rpc('supply_request_action', { p_request: id, p });

// ---------------------------------------------------------------- files (private bucket "asset-attachments")
const safeName = (name) => String(name).replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
/** Uploads to the private bucket (path "<asset id>/<uuid>-<name>"), then registers it so the server checks type, size and who may attach. */
export async function uploadFile(assetId, file, { kind, stage } = {}) {
  if (!FILE_TYPES.test(file.type || '')) throw new Error('Only JPG, JPEG, PNG and PDF files can be attached.');
  if (file.size > MAX_FILE) throw new Error('That file is too large (10 MB at most).');
  const path = assetId + '/' + crypto.randomUUID() + '-' + safeName(file.name);
  const { error: upErr } = await supabase.storage.from('asset-attachments').upload(path, file, { upsert: false, contentType: file.type });
  if (upErr) throw new Error(upErr.message);
  let res;
  try {
    res = await rpc('asset_register_file', { p_id: assetId, p: { file_path: path, file_name: file.name.slice(0, 200), file_type: file.type, file_size: file.size, kind: kind || 'Other', stage: stage || null } });
  } catch (err) { await supabase.storage.from('asset-attachments').remove([path]).catch(() => {}); throw err; }
  if (res && res.ok === false) await supabase.storage.from('asset-attachments').remove([path]).catch(() => {});
  return res;
}
export const removeFile = (id) => rpc('asset_remove_file', { p_file: id });
export async function getFileUrl(path) {
  const { data, error } = await supabase.storage.from('asset-attachments').createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// ---------------------------------------------------------------- live updates
export function subscribe(tables, onChange) {
  const list = Array.isArray(tables) ? tables : [tables];
  const channel = supabase.channel('assets-' + list.join('-') + '-' + Math.random().toString(36).slice(2));
  list.forEach((t) => channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, onChange));
  channel.subscribe();
  return () => supabase.removeChannel(channel);
}
