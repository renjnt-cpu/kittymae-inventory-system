// Thin wrappers around Supabase tables/RPCs — every page calls these instead of touching
// `supabase` directly, so the query shape lives in one place. Mirrors the old app's
// `api(name, ...args)` helper in spirit, just split into named functions since
// supabase-js's table/RPC calls aren't as uniformly shaped as google.script.run's.
import { supabase } from './supabaseClient.js';

/** Resolves the signed-in employee's id for "created_by"/"paid_by"/etc attribution.
 * Goes through the current_employee() RPC (which joins employee_auth_links) rather
 * than matching employees.auth_user_id directly -- that column is only ever set for
 * Google logins, so a direct match silently returns nothing for anyone who signed in
 * with ID+password (see 33_multi_auth_identity.sql). */
async function currentEmployeeId() {
  const { data: emp } = await supabase.rpc('current_employee');
  return emp ? emp.id : null;
}

/** Live cross-user updates — the business is fast-paced (multiple people approving/
 * editing the same records), so every page subscribes to Postgres changes on the
 * table(s) it displays and just reloads when anything changes, instead of everyone
 * having to manually refresh to see someone else's approval/edit. RLS still applies to
 * realtime the same as any other read, so this never leaks rows a viewer couldn't
 * otherwise see. Call the returned function to unsubscribe (not currently needed since
 * these pages never tear down, but kept for correctness). */
export function subscribeToChanges(tables, onChange) {
  const list = Array.isArray(tables) ? tables : [tables];
  const channel = supabase.channel('live-' + list.join('-') + '-' + Math.random().toString(36).slice(2));
  list.forEach((table) => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
  });
  channel.subscribe();
  return () => supabase.removeChannel(channel);
}

export async function getBranches() {
  const { data, error } = await supabase.from('branches').select('*').eq('is_active', true).order('display_order');
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
  const { data, error } = await supabase.from('bills')
    .select('*, creator:employees!bills_created_by_fkey(full_name), payer:employees!bills_paid_by_fkey(full_name)')
    .order('due_date', { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return data;
}

/** Returns the new bill's id — needed so a photo picked in the same Add Bill submit
 * can be uploaded and linked to the row right after it's created. */
export async function createBill({ name, category, accountName, accountNumber, amount, dueDate, status, isRecurring, notes }) {
  const empId = await currentEmployeeId();
  const { data, error } = await supabase.from('bills').insert({
    name, category, account_name: accountName || null, account_number: accountNumber || null,
    amount: amount || null, due_date: dueDate || null,
    status: status || 'Unpaid', is_recurring: !!isRecurring, notes: notes || null,
    created_by: empId,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function setBillStatus(id, status) {
  const patch = { status, updated_at: new Date().toISOString() };
  patch.paid_date = status === 'Paid' ? new Date().toISOString().slice(0, 10) : null;
  if (status === 'Paid') {
    patch.paid_by = await currentEmployeeId();
  } else {
    patch.paid_by = null;
  }
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

// ---- Subasta (auction of unredeemed pawned items) — per branch, Admin/Manager see
// everything, Branch Supervisor sees/manages only their own branch (RLS-enforced). ----

export async function listSubastaItems() {
  const { data, error } = await supabase.from('subasta_items')
    .select('*, creator:employees!subasta_items_created_by_fkey(full_name), branches(name)')
    .order('auction_eligible_date', { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function createSubastaItem({ branchId, sku, itemDescription, weightGrams, pawnReference, pawnDate, auctionEligibleDate, notes }) {
  const empId = await currentEmployeeId();
  const { error } = await supabase.from('subasta_items').insert({
    branch_id: branchId, sku: sku || null, item_description: itemDescription,
    weight_grams: weightGrams || null, pawn_reference: pawnReference || null, pawn_date: pawnDate || null,
    auction_eligible_date: auctionEligibleDate || null, notes: notes || null,
    created_by: empId,
  });
  if (error) throw new Error(error.message);
}

export async function updateSubastaItem(id, { branchId, sku, itemDescription, weightGrams, pawnReference, pawnDate, auctionEligibleDate, status, saleDate, salePrice, buyerName, notes }) {
  const { error } = await supabase.from('subasta_items').update({
    branch_id: branchId, sku: sku || null, item_description: itemDescription,
    weight_grams: weightGrams || null, pawn_reference: pawnReference || null, pawn_date: pawnDate || null,
    auction_eligible_date: auctionEligibleDate || null, status,
    sale_date: saleDate || null, sale_price: salePrice || null, buyer_name: buyerName || null,
    notes: notes || null, updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteSubastaItem(id) {
  const { error } = await supabase.from('subasta_items').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---- Scrap (scrap gold/silver bought in or sold on) — per branch, same access pattern
// as Subasta. v_scrap_balance sums each branch+metal's running weight on hand. ----

export async function listScrapEntries() {
  const { data, error } = await supabase.from('scrap_entries')
    .select('*, creator:employees!scrap_entries_created_by_fkey(full_name), branches(name)')
    .order('entry_date', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function getScrapBalances() {
  const { data, error } = await supabase.from('v_scrap_balance').select('*');
  if (error) throw new Error(error.message);
  return data;
}

/** Scrap-purpose Branch Capital minus net cash spent/received on Scrap -- see
 * v_scrap_cash_balance (43_scrap_cash_balance.sql) for the running-balance formula. */
export async function getScrapCashBalances() {
  const { data, error } = await supabase.from('v_scrap_cash_balance').select('*');
  if (error) throw new Error(error.message);
  return data;
}

/** Returns the new entry's id so a photo picked in the same Add form submit can be
 * uploaded and linked right after it's created (mirrors bills' attachment flow). */
export async function createScrapEntry({ branchId, entryDate, entryType, metalType, karat, weightGrams, pricePerGram, totalAmount, customerName, contactNumber, paymentMethod, source, notes }) {
  const empId = await currentEmployeeId();
  const { data, error } = await supabase.from('scrap_entries').insert({
    branch_id: branchId, entry_date: entryDate || new Date().toISOString().slice(0, 10),
    entry_type: entryType || 'In', metal_type: metalType, karat: karat || null,
    weight_grams: weightGrams, price_per_gram: pricePerGram || null, total_amount: totalAmount || null,
    customer_name: customerName || null, contact_number: contactNumber || null,
    payment_method: paymentMethod || null,
    source: source || null, notes: notes || null, created_by: empId,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function deleteScrapEntry(id) {
  const { data: entry } = await supabase.from('scrap_entries').select('attachment_path').eq('id', id).single();
  if (entry && entry.attachment_path) {
    await supabase.storage.from('scrap-attachments').remove([entry.attachment_path]);
  }
  const { error } = await supabase.from('scrap_entries').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Path is "<branch_id>/<scrap_entry_id>/<file>" so Branch Supervisor storage access
 * can be scoped by branch, matching scrap_entries' own RLS. */
export async function uploadScrapAttachment(branchId, scrapId, file) {
  const path = branchId + '/' + scrapId + '/' + Date.now() + '_' + file.name;
  const { error: upErr } = await supabase.storage.from('scrap-attachments').upload(path, file, { upsert: true });
  if (upErr) throw new Error(upErr.message);
  const { error: updErr } = await supabase.from('scrap_entries').update({ attachment_path: path }).eq('id', scrapId);
  if (updErr) throw new Error(updErr.message);
  return path;
}

export async function getScrapAttachmentUrl(path) {
  const { data, error } = await supabase.storage.from('scrap-attachments').createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// ---- Payments (GCash + Bank Transfer combined — money received from a customer) —
// per branch, Admin/Manager see everything, Branch Supervisor sees/manages own branch. ----

export async function listPayments() {
  const { data, error } = await supabase.from('payment_transactions')
    .select('*, creator:employees!payment_transactions_created_by_fkey(full_name)')
    .order('transaction_date', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function createPayment({ method, transactionDate, amount, referenceNumber, payerName, notes }) {
  const empId = await currentEmployeeId();
  const { error } = await supabase.from('payment_transactions').insert({
    method, transaction_date: transactionDate || new Date().toISOString().slice(0, 10),
    amount, reference_number: referenceNumber || null, payer_name: payerName || null,
    notes: notes || null, created_by: empId,
  });
  if (error) throw new Error(error.message);
}

export async function deletePayment(id) {
  const { error } = await supabase.from('payment_transactions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---- Refunds — per branch, same access pattern as Payments. Optional proof photo in a
// private bucket, path "<branch_id>/<refund_id>/<file>" so RLS can scope by branch. ----

export async function listRefunds() {
  const { data, error } = await supabase.from('refunds')
    .select('*, creator:employees!refunds_created_by_fkey(full_name), approver:employees!refunds_approved_by_fkey(full_name), refund_attachments(id, attachment_path, amount, reference_number, uploaded_at)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

/** No photo field here on purpose — a refund starts as a request awaiting Manager/Admin
 * approval, and proof-of-payment photos only make sense once it's actually been paid
 * out, which can't happen before approval. */
export async function createRefund({ customerName, orderReference, itemDescription, purchaseDate, dateRequested, refundAmount, refundMethod, accountName, accountNumber, reason, notes }) {
  const empId = await currentEmployeeId();
  const { data, error } = await supabase.from('refunds').insert({
    customer_name: customerName, order_reference: orderReference || null,
    item_description: itemDescription || null, purchase_date: purchaseDate || null,
    date_requested: dateRequested || new Date().toISOString().slice(0, 10),
    refund_amount: refundAmount, refund_method: refundMethod || 'GCash',
    account_name: accountName || null, account_number: accountNumber || null,
    reason: reason || null, notes: notes || null, created_by: empId,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}

/** Records who clicked Approve (mirrors bills.paid_by) -- once set, later status changes
 * (Completed, Reopened back to Approved) don't touch it, since the approval already
 * happened and shouldn't be reattributed to whoever completes/reopens it later. */
export async function setRefundStatus(id, status) {
  const patch = { status, updated_at: new Date().toISOString() };
  if (status === 'Approved') {
    patch.approved_by = await currentEmployeeId();
  }
  const { error } = await supabase.from('refunds').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteRefund(id) {
  const { data: attachments } = await supabase.from('refund_attachments').select('attachment_path').eq('refund_id', id);
  if (attachments && attachments.length) {
    await supabase.storage.from('refund-attachments').remove(attachments.map((a) => a.attachment_path));
  }
  const { error } = await supabase.from('refunds').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Refunds for a large amount are sometimes paid out in staggered installments, each
 * with its own amount + proof-of-payment screenshot -- so this ADDS an attachment row
 * (amount + photo together) rather than replacing a single column. Callers are expected
 * to only allow this once the refund is Approved (or later), matching real payout
 * timing, and to only allow marking a refund Completed once the attached amounts sum
 * to the full requested refund_amount — see refunds.html's remaining-balance check. */
export async function addRefundAttachment(refundId, amount, file, referenceNumber) {
  const path = refundId + '/' + Date.now() + '_' + file.name;
  const { error: upErr } = await supabase.storage.from('refund-attachments').upload(path, file, { upsert: true });
  if (upErr) throw new Error(upErr.message);
  const empId = await currentEmployeeId();
  const { error: insErr } = await supabase.from('refund_attachments')
    .insert({ refund_id: refundId, attachment_path: path, amount, reference_number: referenceNumber || null, uploaded_by: empId });
  if (insErr) throw new Error(insErr.message);
  return path;
}

export async function removeRefundAttachment(attachmentId, path) {
  await supabase.storage.from('refund-attachments').remove([path]);
  const { error } = await supabase.from('refund_attachments').delete().eq('id', attachmentId);
  if (error) throw new Error(error.message);
}

export async function getRefundAttachmentUrl(path) {
  const { data, error } = await supabase.storage.from('refund-attachments').createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// ---- Asset & Supplies Custodian registry — one row per item, assigned to the employee
// accountable for it. Company-wide, Admin + Manager only (like Payments/Branch Capital). ----

/** Plain roster for the Custodian dropdown — unlike getEmployeesForChecklist(), this
 * includes Admin, since Ren can just as well be the custodian of an item. */
export async function listActiveEmployees() {
  const { data, error } = await supabase.from('employees')
    .select('id, full_name').eq('status', 'Active').order('full_name');
  if (error) throw new Error(error.message);
  return data;
}

export async function listAssetCustodianItems() {
  const { data, error } = await supabase.from('asset_custodian_items')
    .select('*, custodian:employees!asset_custodian_items_custodian_id_fkey(full_name), creator:employees!asset_custodian_items_created_by_fkey(full_name), branches(name)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function createAssetCustodianItem({ itemName, itemType, branchId, custodianId, quantity, unitValue, condition, dateAssigned, notes }) {
  const empId = await currentEmployeeId();
  const { error } = await supabase.from('asset_custodian_items').insert({
    item_name: itemName, item_type: itemType || 'Asset', branch_id: branchId || null,
    custodian_id: custodianId || null, quantity: quantity || 1, unit_value: unitValue || null,
    condition: condition || 'Good', date_assigned: dateAssigned || null, notes: notes || null,
    created_by: empId,
  });
  if (error) throw new Error(error.message);
}

export async function updateAssetCustodianItem(id, { itemName, itemType, branchId, custodianId, quantity, unitValue, condition, dateAssigned, notes }) {
  const { error } = await supabase.from('asset_custodian_items').update({
    item_name: itemName, item_type: itemType, branch_id: branchId || null,
    custodian_id: custodianId || null, quantity: quantity || 1, unit_value: unitValue || null,
    condition, date_assigned: dateAssigned || null, notes: notes || null,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteAssetCustodianItem(id) {
  const { error } = await supabase.from('asset_custodian_items').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---- Branch Capital (money Ren injects into a branch — the inverse of Bills) ----
// Admin-only, same access model as Bills.

export async function listBranchCapitalEntries() {
  const { data, error } = await supabase.from('branch_capital_entries')
    .select('*, creator:employees!branch_capital_entries_created_by_fkey(full_name), branches(name)')
    .order('entry_date', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function getBranchCapitalBalances() {
  const { data, error } = await supabase.from('v_branch_capital_balance').select('*');
  if (error) throw new Error(error.message);
  return data;
}

export async function createBranchCapitalEntry({ branchId, entryDate, amount, purpose, notes }) {
  const empId = await currentEmployeeId();
  const { error } = await supabase.from('branch_capital_entries').insert({
    branch_id: branchId, entry_date: entryDate || new Date().toISOString().slice(0, 10),
    amount, purpose: purpose || null, notes: notes || null, created_by: empId,
  });
  if (error) throw new Error(error.message);
}

export async function deleteBranchCapitalEntry(id) {
  const { error } = await supabase.from('branch_capital_entries').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---- Access checklist (Admin-only sign-off record — see access-checklist.html) ----

/** Everyone except Admin, since Admin has full access by definition and isn't
 * worth verifying. Pulled live so a role/branch/bills_access change shows up
 * here immediately -- the checklist tracks today's roster, not a snapshot. */
export async function getEmployeesForChecklist() {
  const { data, error } = await supabase.from('employees')
    .select('id, full_name, role, position, bills_access, refund_approval_access, branches(name)')
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
  const empId = checked ? await currentEmployeeId() : null;
  const { error } = await supabase.from('access_checklist_verifications').upsert({
    employee_id: employeeId, item_key: itemKey, checked,
    checked_by: empId,
    checked_at: checked ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'employee_id,item_key' });
  if (error) throw new Error(error.message);
}
