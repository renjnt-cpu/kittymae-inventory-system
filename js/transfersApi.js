// Transfers -- every Supabase call the module makes lives here, so the screens never touch `supabase` directly (and can be
// exercised against a stand-in object in tests). Reads go straight to the tables (stock and ledger are READ from the real
// inventory, never copied); every CHANGE goes through a transfer_* database function that re-checks who is calling and
// re-checks the stock on the server. A function that finds a problem returns {ok:false, errors:[...]} -- callers show those;
// anything else thrown is an Error.
import { supabase } from './supabaseClient.js?v=20261007c';
import { FILE_TYPES, MAX_FILE } from './transfersLogic.js?v=20261007c';

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

// ---------------------------------------------------------------- reads
export async function listBranches() {
  return check(await supabase.from('branches').select('*').eq('is_active', true).order('display_order'));
}
export const listTransfers = () => fetchAll(() => supabase.from('inventory_transfers').select('*, inventory_transfer_items(*, products(item_name, category, reorder_level))').order('created_at', { ascending: false }).order('id'));
export const listReceipts = () => fetchAll(() => supabase.from('transfer_receipts').select('*').order('id'));
export const listReceiptItems = () => fetchAll(() => supabase.from('transfer_receipt_items').select('*').order('id'));
export const listDiscrepancies = () => fetchAll(() => supabase.from('transfer_discrepancies').select('*').order('id'));
/** every stock movement that belongs to a transfer (the ledger rows the stock actually moved through) */
export const listTransferLedger = () => fetchAll(() => supabase.from('inventory_transactions')
  .select('id, transaction_type, sku, branch_id, qty_change, qty_before, qty_after, related_branch_id, transfer_id, transfer_item_id, reference_number, employee_id, reason, occurred_at')
  .not('transfer_id', 'is', null).order('id'));
/** the real stock, per SKU and branch (nothing is stored in Transfers) */
export const listStock = () => fetchAll(() => supabase.from('inventory').select('sku, branch_id, qty_available').order('sku').order('branch_id'));
export async function listSettings() {
  return check(await supabase.from('transfer_settings').select('key, value'));
}
export async function employeeNames(ids) {
  if (!ids.length) return {};
  const data = await rpc('get_employee_names', { ids });
  return Object.fromEntries((data || []).map((e) => [e.id, e.full_name]));
}
export async function hasPermission(employeeId, key) {
  try { return !!(await rpc('has_permission', { p_employee_id: employeeId, p_permission_key: key })); } catch (e) { return false; }
}
export async function listTimeline(id) {
  return check(await supabase.from('transfer_timeline').select('*').eq('transfer_id', id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(300));
}
export async function listTimelineAll({ before = null, limit = 300 } = {}) {
  let q = supabase.from('transfer_timeline').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit);
  if (before) q = q.lt('created_at', before);
  return check(await q);
}
export async function listComments(id) {
  return check(await supabase.from('transfer_comments').select('*').eq('transfer_id', id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(200));
}
export async function listFiles(id) {
  return check(await supabase.from('transfer_files').select('*').eq('transfer_id', id).is('deleted_at', null).order('created_at', { ascending: false }));
}
export async function listRevisions(id) {
  return check(await supabase.from('transfer_revisions').select('*').eq('transfer_id', id).order('created_at', { ascending: false }).order('id', { ascending: false }));
}
export async function listReceiptItemsFor(receiptIds) {
  if (!receiptIds.length) return [];
  return check(await supabase.from('transfer_receipt_items').select('*').in('receipt_id', receiptIds).order('id'));
}
/** The permanent audit trail (Admin / Manager only through row-level security). `before` pages backwards. */
export async function listAudit({ transferId = null, before = null, limit = 300 } = {}) {
  let q = supabase.from('transfer_audit_logs').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit);
  if (transferId) q = q.eq('transfer_id', transferId);
  if (before) q = q.lt('created_at', before);
  return check(await q);
}
/** Find a SKU by code or name (the SKU Catalog stays the master; this only reads it). */
export async function searchProducts(text) {
  const term = String(text || '').replace(/[,()%*\\]/g, ' ').trim();
  if (!term) return [];
  const pat = '%' + term + '%';
  return check(await supabase.from('products').select('sku, item_name, category, product_status, reorder_level, gross_weight_g').or('sku.ilike.' + pat + ',item_name.ilike.' + pat).order('sku').limit(30));
}
export async function getProduct(sku) {
  const rows = check(await supabase.from('products').select('sku, item_name, category, product_status, reorder_level, gross_weight_g, system_selling_price, pricing_mode').eq('sku', sku).limit(1));
  return rows[0] || null;
}
/** Every stock movement of one SKU (sales, adjustments, transfers ...), newest first. */
export async function listSkuLedger(sku, limit = 300) {
  return check(await supabase.from('inventory_transactions')
    .select('id, transaction_type, sku, branch_id, qty_change, qty_before, qty_after, related_branch_id, transfer_id, reference_number, employee_id, reason, occurred_at')
    .eq('sku', sku).order('occurred_at', { ascending: false }).order('id', { ascending: false }).limit(limit));
}

// ---------------------------------------------------------------- the request
export const stockCheck = (from, to, skus) => rpc('transfer_stock_check', { p_from: from, p_to: to, p_skus: skus });
export const branchOverview = () => rpc('transfer_branch_overview');
export const reconcile = () => rpc('transfer_reconcile');
export const createTransfer = (p) => rpc('transfer_create', { p });
export const updateTransfer = (id, p) => rpc('transfer_update', { p_id: id, p });
export const submitTransfer = (id, p) => rpc('transfer_submit', { p_id: id, p: p || {} });
export const returnForEditing = (id, reason) => rpc('transfer_return_for_editing', { p_id: id, p_reason: reason });
export const approveTransfer = (id, p) => rpc('transfer_approve', { p_id: id, p: p || {} });
export const rejectTransfer = (id, reason) => rpc('transfer_reject', { p_id: id, p_reason: reason });
export const reviseTransfer = (id, p) => rpc('transfer_revise', { p_id: id, p });
export const cancelTransfer = (id, reason) => rpc('transfer_cancel', { p_id: id, p_reason: reason });

// ---------------------------------------------------------------- moving the stock
export const startPreparing = (id) => rpc('transfer_start_preparing', { p_id: id });
export const releaseTransfer = (id, p) => rpc('transfer_release', { p_id: id, p: p || {} });
export const receiveTransfer = (id, p) => rpc('transfer_receive', { p_id: id, p });
export const reportDiscrepancy = (id, p) => rpc('transfer_report_discrepancy', { p_id: id, p });
export const resolveDiscrepancy = (discrepancyId, p) => rpc('transfer_resolve_discrepancy', { p_discrepancy: discrepancyId, p });

// ---------------------------------------------------------------- notes, settings
export const addComment = (id, text, internal) => rpc('transfer_add_comment', { p_transfer: id, p_comment: text, p_internal: !!internal });
export const saveSettings = (p) => rpc('transfer_save_settings', { p });

// ---------------------------------------------------------------- files (private bucket "transfer-attachments")
const safeName = (name) => String(name).replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
/** Uploads to the private bucket (path "<transfer id>/<uuid>-<name>"), then registers it so the server checks type, size and who is involved. */
export async function uploadFile(transferId, file, kind, discrepancyId) {
  if (!FILE_TYPES.test(file.type || '')) throw new Error('Only JPG, JPEG, PNG and PDF files can be attached.');
  if (file.size > MAX_FILE) throw new Error('That file is too large (10 MB at most).');
  const path = transferId + '/' + crypto.randomUUID() + '-' + safeName(file.name);
  const { error: upErr } = await supabase.storage.from('transfer-attachments').upload(path, file, { upsert: false, contentType: file.type });
  if (upErr) throw new Error(upErr.message);
  let res;
  try {
    res = await rpc('transfer_register_file', { p_transfer: transferId, p_file_name: file.name.slice(0, 200), p_path: path, p_type: file.type, p_size: file.size, p_kind: kind || 'Other', p_discrepancy: discrepancyId || null });
  } catch (err) { await supabase.storage.from('transfer-attachments').remove([path]).catch(() => {}); throw err; }
  if (res && res.ok === false) await supabase.storage.from('transfer-attachments').remove([path]).catch(() => {});
  return res;
}
export const removeFile = (id) => rpc('transfer_remove_file', { p_file_id: id });
export async function getFileUrl(path) {
  const { data, error } = await supabase.storage.from('transfer-attachments').createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// ---------------------------------------------------------------- live updates
export function subscribe(tables, onChange) {
  const list = Array.isArray(tables) ? tables : [tables];
  const channel = supabase.channel('transfers-' + list.join('-') + '-' + Math.random().toString(36).slice(2));
  list.forEach((table) => channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange));
  channel.subscribe();
  return () => supabase.removeChannel(channel);
}
