// Item Monitoring -- every Supabase call the page makes lives here, so the screens never touch `supabase` directly (and can be exercised against a stand-in object in tests).
// Two kinds of call: the old reads (stock, counts, purchases, product changes -- same tables and same helpers as before) and the approval functions (fpr_* / fpd_*, migrations 264-269),
// which check who is calling. A purchase never becomes stock from this file's reads; only fprApprove() does that, and the database lets only the Final Approver call it.
import { supabase } from './supabaseClient.js?v=20261031a';
import {
  getBranches as apiBranches, searchProducts as apiSearch, logCycleCount as apiLogCount, listRecentCycleCounts as apiRecentCounts, markCycleCountInvestigated as apiMarkInvestigated,
  listProductChangeLog as apiChanges, listFactoryPurchases as apiPurchases, subscribeToChanges,
} from './api.js?v=20261031a';
import { openSkuMovement } from './skuMovement.js?v=20261031a';

export const BUCKET = 'factory-purchase-files';

async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params || {});
  if (error) throw new Error(error.message);
  return data;
}

// ---------------------------------------------------------------- the old reads
export const getBranches = () => apiBranches();
export const searchProducts = (q) => apiSearch(q);
export const logCycleCount = (p) => apiLogCount(p);
export const recentCounts = (limit = 300) => apiRecentCounts(limit);
export const markInvestigated = (id, on) => apiMarkInvestigated(id, on);
export const productChanges = (limit = 300) => apiChanges(limit);
export const listPurchases = () => apiPurchases();

/** Every SKU x branch row. A single request returns at most 1000 rows and there are more than that, so this reads page by page (in a fixed order, so no row is skipped or repeated). */
export async function listStock() {
  const pageSize = 1000;
  let all = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from('inventory')
      .select('sku, branch_id, qty_available, qty_reserved, total_grams_on_hand, last_updated_at, products(item_name, category, product_line, metal_purity, value_tier, reorder_level, gross_weight_g, product_status)')
      .order('sku').order('branch_id').range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    all = all.concat(data || []);
    if (!data || data.length < pageSize) break;
  }
  return all;
}

/** { "SKU|branch": last counted_at } -- read page by page too, so a count is never missed once there are more than 1000. */
export async function latestCounts() {
  const pageSize = 1000;
  const latest = {};
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from('cycle_counts').select('sku, branch_id, counted_at').order('counted_at', { ascending: false }).order('id', { ascending: false }).range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    (data || []).forEach((r) => { const k = r.sku + '|' + r.branch_id; if (!latest[k]) latest[k] = r.counted_at; });
    if (!data || data.length < pageSize) break;
  }
  return latest;
}

/** The read-only stock-movement drawer (shared with the Transfers page). */
export const openMovement = (sku, branchId) => openSkuMovement(supabase, sku, { branchId, transferUrl: 'transfers.html?open=' });

// ---------------------------------------------------------------- purchase requests (what staff enter)
export const overview = () => rpc('fpr_overview');
export const requestsList = () => rpc('fpr_list');
export const requestGet = (id) => rpc('fpr_get', { p_request_id: id });
/** form: { clientId, requestId, branchId, date, perGram, notes, items:[{sku, product_name, category, qty, sup_price, pancake_price, grams, availed_factory_gram, est_sales, purchased_amount, profit, tag_note}] } */
export const requestSave = (f) => rpc('fpr_save', {
  p_client_id: f.clientId, p_request_id: f.requestId || null, p_branch: f.branchId, p_date: f.date, p_per_gram: f.perGram === '' || f.perGram === undefined ? null : f.perGram,
  p_notes: f.notes || null, p_items: f.items,
});
export const requestSubmit = (id) => rpc('fpr_submit', { p_request_id: id });
export const requestCancel = (id, reason) => rpc('fpr_cancel', { p_request_id: id, p_reason: reason || null });
export const commentAdd = (requestId, deleteId, body) => rpc('fpr_comment', { p_request_id: requestId || null, p_delete_id: deleteId || null, p_body: body });
export const fileAdd = (requestId, deleteId, type, name, path, contentType, size) => rpc('fpr_file_add', {
  p_request_id: requestId || null, p_delete_id: deleteId || null, p_type: type, p_name: name, p_path: path, p_content_type: contentType || null, p_size: size || null,
});

// ---------------------------------------------------------------- the Final Approver's decisions (the database refuses anyone else)
export const requestApprove = (id) => rpc('fpr_approve', { p_request_id: id });
export const requestReturn = (id, reason) => rpc('fpr_return', { p_request_id: id, p_reason: reason });
export const requestReject = (id, reason) => rpc('fpr_reject', { p_request_id: id, p_reason: reason });
export const requestDiscardFailed = (id, reason) => rpc('fpr_discard_failed', { p_request_id: id, p_reason: reason });

// ---------------------------------------------------------------- reversal ("delete") requests
export const deleteList = () => rpc('fpd_list');
export const deleteGet = (id) => rpc('fpd_get', { p_id: id });
export const deleteStatus = (purchaseId) => rpc('fpd_status', { p_purchase_id: purchaseId });
export const deleteRequest = (clientId, purchaseId, category, reason) => rpc('fpd_request', { p_client_id: clientId, p_purchase_id: purchaseId, p_reason_category: category, p_reason: reason || null });
export const deleteApprove = (id) => rpc('fpd_approve', { p_id: id });
export const deleteReject = (id, comment) => rpc('fpd_reject', { p_id: id, p_comment: comment });
export const deleteCancel = (id, reason) => rpc('fpd_cancel', { p_id: id, p_reason: reason || null });

export const historyMeta = () => rpc('fp_history_meta');
export const notifications = () => rpc('fpr_my_notifications');
export const notificationsRead = (ids) => rpc('fpr_notifications_read', { p_ids: ids || null });

// ---------------------------------------------------------------- files (private bucket; the path starts with R<request id>/ or D<reversal id>/)
export async function uploadFile(path, file) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}
export async function signedUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error) throw new Error(error.message);
  return data && data.signedUrl;
}

// ---------------------------------------------------------------- live updates: any change to the old tables or a "something changed" ping from the approval functions
export function subscribe(onChange) {
  return subscribeToChanges(['inventory', 'cycle_counts', 'product_change_log', 'factory_purchases', 'fpr_pings'], (payload) => onChange(payload && payload.table));
}
