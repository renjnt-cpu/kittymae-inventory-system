// Scrap Monitoring -- every Supabase call the module makes lives here, so the screens never touch `supabase` directly (and can be exercised against a stand-in object in
// tests). Nothing reads the scrap_* tables: each screen asks a scrap_* database function, which checks who is calling (the scrap_monitor.* keys), which branches they may see
// and whether they may see money and files, and refuses (with a plain sentence) anything that is not allowed or not valid.
import { supabase } from './supabaseClient.js?v=20261026b';

export const SALE_BUCKET = 'scrap-sale-files';
export const ENTRY_BUCKET = 'scrap-attachments';

async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params || {});
  if (error) throw new Error(error.message);
  return data;
}
/** For the simple flows: throws the database's own sentence when it said ok:false. */
export function must(res) {
  if (res && res.ok === false) { const e = new Error(res.message || 'That did not work.'); e.result = res; throw e; }
  return res;
}
const clean = (f) => { const o = {}; Object.entries(f || {}).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined && v !== false) o[k] = v; }); return o; };

// ---------------------------------------------------------------- reading
export const access = () => rpc('scrap_access');
export const formOptions = () => rpc('scrap_form_options');
export const dashboard = (branch) => rpc('scrap_dashboard', { p_branch: branch || null });
export const attention = (branch) => rpc('scrap_attention', { p_branch: branch || null });
export const entriesList = (filters, limit = 50, offset = 0, sort = 'newest') => rpc('scrap_entries_list', { p_filters: clean(filters), p_limit: limit, p_offset: offset, p_sort: sort });
export const entryDetail = (id) => rpc('scrap_entry_detail', { p_id: id });
export const available = (filters, limit = 100, offset = 0, sort = 'oldest') => rpc('scrap_available', { p_filters: clean(filters), p_limit: limit, p_offset: offset, p_sort: sort });
export const byBranch = (from, to) => rpc('scrap_by_branch', { p_from: from || null, p_to: to || null });
export const byPurity = (from, to, branch) => rpc('scrap_by_purity', { p_from: from || null, p_to: to || null, p_branch: branch || null });
export const bySource = (from, to, branch) => rpc('scrap_by_source', { p_from: from || null, p_to: to || null, p_branch: branch || null });
export const aging = (branch) => rpc('scrap_aging', { p_branch: branch || null });
export const movement = (from, to, branch) => rpc('scrap_movement', { p_from: from, p_to: to, p_branch: branch || null });
export const ledger = (filters, limit = 100, offset = 0) => rpc('scrap_ledger', { p_filters: clean(filters), p_limit: limit, p_offset: offset });
export const audit = (filters, limit = 100, offset = 0) => rpc('scrap_audit', { p_filters: clean(filters), p_limit: limit, p_offset: offset });
export const salesList = (filters, limit = 50, offset = 0, sort = 'newest') => rpc('scrap_sales_list', { p_filters: clean(filters), p_limit: limit, p_offset: offset, p_sort: sort });
export const saleDetail = (id) => rpc('scrap_sale_detail', { p_id: id });
export const buyersList = (includeInactive = true) => rpc('scrap_buyers_list', { p_include_inactive: includeInactive });
export async function listBranches() {
  const { data, error } = await supabase.from('branches').select('id, name, display_order').order('display_order').order('id');
  if (error) throw new Error(error.message);
  return data || [];
}

// ---------------------------------------------------------------- doing things
export const buyerSave = (b) => rpc('scrap_buyer_save', {
  p_id: b.id || null, p_name: b.name, p_contact_person: b.contact_person || null, p_contact_number: b.contact_number || null, p_address: b.address || null,
  p_payment_method: b.payment_method || null, p_notes: b.notes || null, p_active: b.active !== false,
});
export const markLots = (lineIds, mark, buyerId, note) => rpc('scrap_mark_lots', { p_line_ids: lineIds, p_mark: mark, p_buyer_id: buyerId || null, p_note: note || null });
/** s: {requestId, buyerId, branchId, date, method ('PER_GRAM'|'FLAT'), items:[{line_id, grams, rate}], flatTotal, reference, representative, releasedBy, notes} */
export const saleCreate = (s) => rpc('scrap_sale_create', {
  p_request_id: s.requestId, p_buyer_id: s.buyerId, p_branch_id: s.branchId, p_sale_date: s.date, p_pricing_method: s.method, p_items: s.items,
  p_flat_total: s.method === 'FLAT' ? s.flatTotal : null, p_reference: s.reference || null, p_representative: s.representative || null, p_released_by: s.releasedBy || null, p_notes: s.notes || null,
});
/** d: {requestId, branchId, date, reason, method, items:[{line_id, grams}], releasedBy, notes} */
export const disposeCreate = (d) => rpc('scrap_dispose_create', {
  p_request_id: d.requestId, p_branch_id: d.branchId, p_date: d.date, p_reason: d.reason, p_method: d.method || null, p_items: d.items, p_released_by: d.releasedBy || null, p_notes: d.notes || null,
});
export const saleApprove = (id, note) => rpc('scrap_sale_approve', { p_sale_id: id, p_note: note || null });
export const saleReject = (id, reason) => rpc('scrap_sale_reject', { p_sale_id: id, p_reason: reason || null });
export const saleReverse = (id, reason) => rpc('scrap_sale_reverse', { p_sale_id: id, p_reason: reason });
export const saleCorrect = (id, patch, reason) => rpc('scrap_sale_correct', { p_sale_id: id, p_patch: patch, p_reason: reason });
/** p: {requestId, saleId, amount, method, reference, paidAt, receivedBy, receivedByName, notes} */
export const paymentAdd = (p) => rpc('scrap_payment_add', {
  p_request_id: p.requestId, p_sale_id: p.saleId, p_amount: p.amount, p_method: p.method, p_reference: p.reference || null, p_paid_at: p.paidAt || null,
  p_received_by: p.receivedBy || null, p_received_by_name: p.receivedByName || null, p_notes: p.notes || null,
});
export const paymentVoid = (id, reason) => rpc('scrap_payment_void', { p_payment_id: id, p_reason: reason });
export const fileAttach = (f) => rpc('scrap_file_attach', {
  p_sale_id: f.saleId, p_payment_id: f.paymentId || null, p_file_type: f.type, p_file_name: f.name, p_path: f.path, p_content_type: f.contentType || null, p_size: f.size || null,
});

// ---------------------------------------------------------------- files
const safeName = (n) => String(n || 'file').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80) || 'file';
/** Uploads one file to the private bucket, in the sale's own folder; returns what scrap_file_attach needs. */
export async function uploadSaleFile(saleId, file) {
  if (file.size > 15 * 1024 * 1024) throw new Error('That file is larger than 15 MB. Choose a smaller photo or PDF.');
  const path = saleId + '/' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2)) + '_' + safeName(file.name);
  const { error } = await supabase.storage.from(SALE_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw new Error(error.message);
  return { path, name: file.name, contentType: file.type || null, size: file.size };
}
const urlCache = new Map();   // bucket|path -> { url, exp }
/** Short-lived addresses for private files, fetched in one call per bucket and kept for a while. */
export async function signedUrls(bucket, paths, ttl = 900) {
  const wanted = [...new Set((paths || []).filter(Boolean))];
  const need = wanted.filter((p) => { const c = urlCache.get(bucket + '|' + p); return !c || c.exp < Date.now() + 30000; });
  if (need.length) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(need, ttl);
    if (error) throw new Error(error.message);
    for (const row of data || []) if (row.signedUrl) urlCache.set(bucket + '|' + row.path, { url: row.signedUrl, exp: Date.now() + ttl * 1000 });
  }
  return Object.fromEntries(wanted.map((p) => [p, (urlCache.get(bucket + '|' + p) || {}).url || null]));
}
export const signedUrl = async (bucket, path) => (await signedUrls(bucket, [path]))[path];

/** Fills in the src of every <img data-sm-bucket data-sm-path> under `root`. Safe to call again after the markup changes. */
export async function hydrateImages(root) {
  if (!root) return;
  const imgs = [...root.querySelectorAll('img[data-sm-path]:not([data-sm-done])')];
  if (!imgs.length) return;
  imgs.forEach((im) => { im.dataset.smDone = '1'; im.addEventListener('error', () => im.classList.add('sm-img-broken'), { once: true }); });
  const byBucket = {};
  imgs.forEach((im) => { (byBucket[im.dataset.smBucket] = byBucket[im.dataset.smBucket] || []).push(im); });
  for (const [bucket, list] of Object.entries(byBucket)) {
    try {
      const urls = await signedUrls(bucket, list.map((im) => im.dataset.smPath));
      list.forEach((im) => { if (urls[im.dataset.smPath]) im.src = urls[im.dataset.smPath]; else im.classList.add('sm-img-broken'); });
    } catch (e) { list.forEach((im) => im.classList.add('sm-img-broken')); }
  }
}
