// Refund Management -- every Supabase call the module makes lives here, so the screens never touch `supabase`
// directly (and can be exercised against a stand-in object in tests).
// Reads go straight to the tables (row-level security decides what a person may see); every CHANGE goes
// through a refund_* database function that re-checks who is calling. A function that finds a problem
// returns {ok:false, errors:[...]} -- callers show those; anything else thrown is an Error.
import { supabase } from './supabaseClient.js?v=20261007f';
import { FILE_TYPES, MAX_FILE } from './refundsLogic.js?v=20261007f';

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
async function fetchAll(build, pageSize = 1000, cap = 30000) {
  const rows = [];
  for (let from = 0; from < cap; from += pageSize) {
    const data = check(await build().range(from, from + pageSize - 1));
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

// ---------------------------------------------------------------- reads
export const getAccess = () => rpc('refund_my_access');
export async function listBranches() {
  return check(await supabase.from('branches').select('id, name').order('id'));
}
export async function listReasons() {
  return check(await supabase.from('refund_reasons').select('*').order('sort_order').order('name'));
}
export async function listSettings() {
  return check(await supabase.from('refund_settings').select('key, value'));
}
export const listRefunds = () => fetchAll(() => supabase.from('refunds').select('*').order('id'));
export const listItems = () => fetchAll(() => supabase.from('refund_items').select('*').order('id'));
export const listPayments = () => fetchAll(() => supabase.from('refund_payments').select('*').order('id'));
export const listFiles = () => fetchAll(() => supabase.from('refund_files').select('*').is('deleted_at', null).order('id'));
export async function listTimeline(refundId) {
  return check(await supabase.from('refund_timeline').select('*').eq('refund_id', refundId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(300));
}
/** The company-wide activity feed: everything that happened on the requests this person may see. `before` pages backwards. */
export async function listTimelineAll({ before = null, limit = 300 } = {}) {
  let q = supabase.from('refund_timeline').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit);
  if (before) q = q.lt('created_at', before);
  return check(await q);
}
export async function listComments(refundId) {
  return check(await supabase.from('refund_comments').select('*').eq('refund_id', refundId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(200));
}
export async function listCommunications(refundId) {
  return check(await supabase.from('refund_communications').select('*').eq('refund_id', refundId).order('occurred_at', { ascending: false }).order('id', { ascending: false }).limit(200));
}
/** The permanent audit trail (Admin only through row-level security). `before` pages backwards. */
export async function listAudit({ refundId = null, before = null, limit = 300 } = {}) {
  let q = supabase.from('refund_audit_logs').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit);
  if (refundId) q = q.eq('refund_id', refundId);
  if (before) q = q.lt('created_at', before);
  return check(await q);
}

// ---------------------------------------------------------------- requests
export const lookupOrder = (ref) => rpc('refund_order_lookup', { p_ref: ref });
export const createRefund = (p) => rpc('refund_create', { p });
export const updateRefund = (id, p) => rpc('refund_update', { p_id: id, p });
/** action: start_review | request_info | info_provided | hold | approve | reject | cancel | reopen */
export const reviewRefund = (id, action, p) => rpc('refund_review', { p_id: id, p_action: action, p: p || {} });
export const setPriority = (id, priority, flagged, reason) => rpc('refund_set_priority', { p_id: id, p_priority: priority, p_flagged: !!flagged, p_flag_reason: reason || null });

// ---------------------------------------------------------------- payments
export const recordPayment = (id, p) => rpc('refund_record_payment', { p_id: id, p });
export const editPayment = (paymentId, p) => rpc('refund_edit_payment', { p_payment_id: paymentId, p });
export const voidPayment = (paymentId, reason) => rpc('refund_void_payment', { p_payment_id: paymentId, p_reason: reason });
export const verifyProof = (paymentId, verified) => rpc('refund_verify_proof', { p_payment_id: paymentId, p_verified: !!verified });

// ---------------------------------------------------------------- notes, customer communication, follow-ups
export const addComment = (refundId, text, type) => rpc('refund_add_comment', { p_refund: refundId, p_comment: text, p_type: type || 'Note' });
export const logCommunication = (p) => rpc('refund_log_communication', {
  p_refund: p.refundId, p_method: p.method, p_message: p.message, p_customer_followup: !!p.followup, p_next_follow_up: p.next || null, p_when: p.when || null,
});
export const setFollowUp = (refundId, next) => rpc('refund_set_follow_up', { p_refund: refundId, p_next: next || null });

// ---------------------------------------------------------------- admin
export const saveReason = (name, active, sort) => rpc('refund_save_reason', { p_name: name, p_active: !!active, p_sort: sort === undefined ? null : sort });
export const saveSettings = (p) => rpc('refund_save_settings', { p });

// ---------------------------------------------------------------- files (private bucket "refund-attachments")
const safeName = (name) => String(name).replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
/** Uploads to the private bucket (path "<refund id>/<uuid>-<name>"), then registers it so the server checks type, size and ownership. */
export async function uploadFile(refundId, file, kind, paymentId) {
  if (!FILE_TYPES.test(file.type || '')) throw new Error('Only JPG, JPEG, PNG and PDF files can be attached.');
  if (file.size > MAX_FILE) throw new Error('That file is too large (10 MB at most).');
  const path = refundId + '/' + crypto.randomUUID() + '-' + safeName(file.name);
  const { error: upErr } = await supabase.storage.from('refund-attachments').upload(path, file, { upsert: false, contentType: file.type });
  if (upErr) throw new Error(upErr.message);
  let res;
  try {
    res = await rpc('refund_register_file', {
      p_refund: refundId, p_file_name: file.name.slice(0, 200), p_path: path, p_type: file.type, p_size: file.size, p_kind: kind || 'Other', p_payment_id: paymentId || null,
    });
  } catch (err) { await supabase.storage.from('refund-attachments').remove([path]).catch(() => {}); throw err; }
  if (res && res.ok === false) await supabase.storage.from('refund-attachments').remove([path]).catch(() => {});
  return res;
}
export const removeFile = (id) => rpc('refund_remove_file', { p_file_id: id });
export async function getFileUrl(path) {
  const { data, error } = await supabase.storage.from('refund-attachments').createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// ---------------------------------------------------------------- live updates
export function subscribe(tables, onChange) {
  const list = Array.isArray(tables) ? tables : [tables];
  const channel = supabase.channel('refunds-' + list.join('-') + '-' + Math.random().toString(36).slice(2));
  list.forEach((table) => channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange));
  channel.subscribe();
  return () => supabase.removeChannel(channel);
}
