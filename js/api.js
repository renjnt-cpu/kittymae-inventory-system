// Thin wrappers around Supabase tables/RPCs — every page calls these instead of touching
// `supabase` directly, so the query shape lives in one place. Mirrors the old app's
// `api(name, ...args)` helper in spirit, just split into named functions since
// supabase-js's table/RPC calls aren't as uniformly shaped as google.script.run's.
import { supabase } from './supabaseClient.js';

export async function getBranches() {
  const { data, error } = await supabase.from('branches').select('*').eq('is_active', true).order('id');
  if (error) throw new Error(error.message);
  return data;
}

/** branchId omitted/null = every branch the caller's role can see (RLS still applies —
 * a Branch Supervisor/Staff session only ever gets their own branch's rows back). */
export async function getInventory(branchId) {
  let query = supabase
    .from('inventory')
    .select('sku, branch_id, qty_available, qty_reserved, total_grams_on_hand, last_updated_at, products(item_name, product_line, reorder_level, product_status)')
    .order('sku');
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function searchProducts(query) {
  const { data, error } = await supabase
    .from('products')
    .select('sku, item_name, category, product_line')
    .or(`sku.ilike.%${query}%,item_name.ilike.%${query}%`)
    .limit(50);
  if (error) throw new Error(error.message);
  return data;
}

/**
 * The one Record-a-Movement entry point for Phase 1's frontend — covers Stock In /
 * Stock Out / Damage / Missing / Adjustment / Correction. Sale and the two Transfer
 * types are deliberately not reachable through this function (see 06_functions.sql's
 * own guard against posting them directly, and the plan's "Sales deduction" section).
 */
export async function recordMovement({ sku, branchId, transactionType, qtyChange, referenceNumber, reason, notes }) {
  const { data, error } = await supabase.rpc('record_inventory_transaction', {
    p_sku: sku,
    p_branch_id: branchId,
    p_transaction_type: transactionType,
    p_qty_change: qtyChange,
    p_reference_number: referenceNumber || null,
    p_reason: reason || null,
    p_notes: notes || null,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function getTransactionHistory(sku, branchId) {
  let query = supabase
    .from('inventory_transactions')
    .select('*')
    .eq('sku', sku)
    .order('occurred_at', { ascending: false })
    .limit(200);
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function listTransfers() {
  const { data, error } = await supabase
    .from('inventory_transfers')
    .select('*, inventory_transfer_items(*)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data;
}

/** items: [{ sku, qty }] */
export async function createTransferRequest(fromBranchId, toBranchId, items) {
  const { data, error } = await supabase.rpc('create_transfer_request', {
    p_from_branch_id: fromBranchId,
    p_to_branch_id: toBranchId,
    p_items: items.map((i) => ({ sku: i.sku, qty: i.qty })),
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function approveTransfer(transferId) {
  const { error } = await supabase.rpc('approve_transfer', { p_transfer_id: transferId });
  if (error) throw new Error(error.message);
}

export async function startPreparingTransfer(transferId) {
  const { error } = await supabase.rpc('start_preparing_transfer', { p_transfer_id: transferId });
  if (error) throw new Error(error.message);
}

/** items: [{ sku, sentQty }] */
export async function shipTransfer(transferId, items) {
  const { error } = await supabase.rpc('mark_in_transit', {
    p_transfer_id: transferId,
    p_sent_items: items.map((i) => ({ sku: i.sku, sent_qty: i.sentQty })),
  });
  if (error) throw new Error(error.message);
}

/** items: [{ sku, receivedQty }] */
export async function receiveTransfer(transferId, items) {
  const { error } = await supabase.rpc('receive_transfer', {
    p_transfer_id: transferId,
    p_received_items: items.map((i) => ({ sku: i.sku, received_qty: i.receivedQty })),
  });
  if (error) throw new Error(error.message);
}

export async function rejectTransfer(transferId, reason) {
  const { error } = await supabase.rpc('reject_transfer', { p_transfer_id: transferId, p_reason: reason });
  if (error) throw new Error(error.message);
}

export async function cancelTransfer(transferId, reason) {
  const { error } = await supabase.rpc('cancel_transfer', { p_transfer_id: transferId, p_reason: reason });
  if (error) throw new Error(error.message);
}

// ---- Bills (monthly business + personal expense monitoring — unrelated to inventory,
// Admin-only, plain CRUD since there's no concurrency to protect against here) ----

export async function listBills() {
  const { data, error } = await supabase.from('bills').select('*').order('due_date', { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return data;
}

/** Returns the new bill's id — needed so a photo picked in the same Add Bill submit
 * can be uploaded and linked to the row right after it's created. */
export async function createBill({ name, category, accountName, accountNumber, amount, dueDate, status, isRecurring, notes }) {
  const { data: auth } = await supabase.auth.getUser();
  const { data: emp } = await supabase.from('employees').select('id').eq('auth_user_id', auth.user.id).single();
  const { data, error } = await supabase.from('bills').insert({
    name, category, account_name: accountName || null, account_number: accountNumber || null,
    amount: amount || null, due_date: dueDate || null,
    status: status || 'Unpaid', is_recurring: !!isRecurring, notes: notes || null,
    created_by: emp ? emp.id : null,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function setBillStatus(id, status) {
  const patch = { status, updated_at: new Date().toISOString() };
  patch.paid_date = status === 'Paid' ? new Date().toISOString().slice(0, 10) : null;
  const { error } = await supabase.from('bills').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Generic field edit — this is what makes a recurring bill reusable: instead of
 * re-adding it every month, edit the same row's amount/due date and it's ready again. */
export async function updateBill(id, { name, category, accountName, accountNumber, amount, dueDate, status, isRecurring, notes }) {
  const { error } = await supabase.from('bills').update({
    name, category, account_name: accountName || null, account_number: accountNumber || null,
    amount: amount || null, due_date: dueDate || null,
    status, is_recurring: !!isRecurring, notes: notes || null,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Cleans up the attachment in storage first (if any) so deleting a bill never leaves
 * an orphaned file behind — storage isn't cascade-deleted automatically by a row delete. */
export async function deleteBill(id) {
  const { data: bill } = await supabase.from('bills').select('attachment_path').eq('id', id).single();
  if (bill && bill.attachment_path) {
    await supabase.storage.from('bill-attachments').remove([bill.attachment_path]);
  }
  const { error } = await supabase.from('bills').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Uploads a proof-of-payment/refund photo to the private bill-attachments bucket and
 * links it to the bill row. Path is prefixed by bill id so files are naturally grouped
 * and never collide across bills. */
export async function uploadBillAttachment(billId, file) {
  const path = billId + '/' + Date.now() + '_' + file.name;
  const { error: upErr } = await supabase.storage.from('bill-attachments').upload(path, file, { upsert: true });
  if (upErr) throw new Error(upErr.message);
  const { error: updErr } = await supabase.from('bills')
    .update({ attachment_path: path, updated_at: new Date().toISOString() }).eq('id', billId);
  if (updErr) throw new Error(updErr.message);
  return path;
}

/** Bucket is private, so viewing a photo means minting a short-lived signed URL on
 * demand rather than storing a permanent public link. */
export async function getBillAttachmentUrl(path) {
  const { data, error } = await supabase.storage.from('bill-attachments').createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function removeBillAttachment(billId, path) {
  await supabase.storage.from('bill-attachments').remove([path]);
  const { error } = await supabase.from('bills')
    .update({ attachment_path: null, updated_at: new Date().toISOString() }).eq('id', billId);
  if (error) throw new Error(error.message);
}

// ---- Access checklist (Admin-only sign-off record — see access-checklist.html) ----

/** Everyone except Admin, since Admin has full access by definition and isn't
 * worth verifying. Pulled live so a role/branch/bills_access change shows up
 * here immediately -- the checklist tracks today's roster, not a snapshot. */
export async function getEmployeesForChecklist() {
  const { data, error } = await supabase.from('employees')
    .select('id, full_name, role, position, bills_access, branches(name)')
    .neq('role', 'Admin')
    .eq('status', 'Active')
    .order('full_name');
  if (error) throw new Error(error.message);
  return data;
}

export async function getAccessChecklist() {
  const { data, error } = await supabase.from('access_checklist_verifications').select('employee_id, item_key, checked');
  if (error) throw new Error(error.message);
  return data;
}

export async function setAccessChecklistItem(employeeId, itemKey, checked) {
  const { data: auth } = await supabase.auth.getUser();
  const { data: emp } = await supabase.from('employees').select('id').eq('auth_user_id', auth.user.id).single();
  const { error } = await supabase.from('access_checklist_verifications').upsert({
    employee_id: employeeId, item_key: itemKey, checked,
    checked_by: checked ? (emp ? emp.id : null) : null,
    checked_at: checked ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'employee_id,item_key' });
  if (error) throw new Error(error.message);
}
