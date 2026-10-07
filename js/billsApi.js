// Bills Management -- every Supabase call the module makes lives here, so the screens never touch
// `supabase` directly (and can be exercised against a stand-in object in tests).
// Reads go straight to the tables (row-level security decides what a person may see); every CHANGE goes
// through a bill_* database function that re-checks who is calling. A function that finds a problem
// returns {ok:false, errors:[...]} -- callers show those; anything else thrown is an Error.
import { supabase } from './supabaseClient.js?v=20261008a';
import { FILE_TYPES, MAX_FILE } from './billsLogic.js?v=20261008a';

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
export const getAccess = () => rpc('bill_my_access');
export const listPeople = () => rpc('bill_people');
export async function listCategories() {
  return check(await supabase.from('bill_categories').select('*').order('sort_order').order('name'));
}
export async function listBranches() {
  return check(await supabase.from('branches').select('id, name').order('id'));
}
const BILL_COLUMNS = 'id, name, category, category_id, amount, due_date, status, is_recurring, paid_date, paid_at, paid_by, notes, created_by, created_by_name, created_at, ' +
  'updated_at, updated_by, updated_by_name, attachment_path, account_name, account_number, provider_name, branch_id, payment_status, paid_amount, priority, ' +
  'priority_source, payment_type, recurring_frequency, recurring_template_id, next_due_date, reminder_days, snoozed_until, archived_at, archived_by';
export const listBills = () => fetchAll(() => supabase.from('bills').select(BILL_COLUMNS).order('id'));
export const listPayments = () => fetchAll(() => supabase.from('bill_payments').select('*').order('id'));
export const listAttachments = () => fetchAll(() => supabase.from('bill_attachments').select('*').order('id'));
export async function listTemplates() {
  return check(await supabase.from('recurring_bill_templates').select('*').order('next_due_date', { ascending: true, nullsFirst: false }).order('id'));
}
export async function listSettings() {
  return check(await supabase.from('bill_settings').select('key, value'));
}
export async function listNotifications(limit = 60) {
  return check(await supabase.from('bill_notifications').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit));
}
export async function listReminders(billId) {
  return check(await supabase.from('bill_reminders').select('*').eq('bill_id', billId).order('sent_at', { ascending: false }).order('id', { ascending: false }).limit(100));
}
export async function listActivity(billId, limit = 200) {
  return check(await supabase.from('bill_activity_logs').select('*').eq('bill_id', billId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit));
}
/** The company-wide history (Admin only through row-level security). `before` pages backwards. */
export async function listActivityAll({ before = null, limit = 300 } = {}) {
  let q = supabase.from('bill_activity_logs').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit);
  if (before) q = q.lt('created_at', before);
  return check(await q);
}

// ---------------------------------------------------------------- bills
export const saveBill = (id, p) => rpc('bill_save', { p_id: id || null, p });
export const recordPayment = (p) => rpc('bill_record_payment', {
  p_bill_id: p.billId, p_amount: p.amount, p_date: p.date, p_method: p.method, p_reference: p.reference || null, p_paid_by: p.paidBy || null, p_notes: p.notes || null,
});
export const voidPayment = (paymentId, reason) => rpc('bill_void_payment', { p_payment_id: paymentId, p_reason: reason });
export const markUnpaid = (billId, reason) => rpc('bill_mark_unpaid', { p_bill_id: billId, p_reason: reason });
export const setCancelled = (billId, cancel, reason) => rpc('bill_set_cancelled', { p_bill_id: billId, p_cancel: !!cancel, p_reason: reason || null });
export const archiveBill = (billId, archive) => rpc('bill_archive', { p_bill_id: billId, p_archive: !!archive });
export const snoozeBill = (billId, until) => rpc('bill_snooze', { p_bill_id: billId, p_until: until || null });
export const addNote = (billId, note) => rpc('bill_add_note', { p_bill_id: billId, p_note: note });
export const duplicateBill = (billId, dueDate) => rpc('bill_duplicate', { p_bill_id: billId, p_due_date: dueDate || null });
export const generateNext = (billId) => rpc('bill_generate_next', { p_bill_id: billId });
export const deleteBill = (billId) => rpc('bill_delete', { p_bill_id: billId });
export const bulkUpdate = (ids, p) => rpc('bill_bulk_update', { p_ids: ids, p });

// ---------------------------------------------------------------- recurring templates
export const saveTemplate = (id, p) => rpc('bill_save_template', { p_id: id || null, p });
export const generateFromTemplate = (id, due) => rpc('bill_generate_from_template', { p_template_id: id, p_due: due || null });
export const setTemplateActive = (id, active) => rpc('bill_set_template_active', { p_id: id, p_active: !!active });
export const archiveTemplate = (id, archive = true) => rpc('bill_archive_template', { p_id: id, p_archive: !!archive });

// ---------------------------------------------------------------- admin
export const saveCategory = (id, p) => rpc('bill_save_category', { p_id: id || null, p });
export const saveSettings = (p) => rpc('bill_save_settings', { p });
export const refreshReminders = () => rpc('bill_refresh_reminders');

// ---------------------------------------------------------------- files (private bucket "bill-attachments")
const safeName = (name) => String(name).replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
/** Uploads to the private bucket (path "<bill id>/<uuid>-<name>"), then registers it so the server checks type, size and ownership. */
export async function uploadAttachment(billId, file, kind, paymentId) {
  if (!FILE_TYPES.test(file.type || '')) throw new Error('Only photos (JPG, PNG, WEBP, HEIC) and PDF files can be attached.');
  if (file.size > MAX_FILE) throw new Error('That file is too large (15 MB at most).');
  const path = billId + '/' + crypto.randomUUID() + '-' + safeName(file.name);
  const { error: upErr } = await supabase.storage.from('bill-attachments').upload(path, file, { upsert: false, contentType: file.type });
  if (upErr) throw new Error(upErr.message);
  let res;
  try {
    res = await rpc('bill_register_attachment', {
      p_bill_id: billId, p_file_name: file.name.slice(0, 200), p_path: path, p_type: file.type, p_size: file.size, p_kind: kind || 'Proof', p_payment_id: paymentId || null,
    });
  } catch (err) { await supabase.storage.from('bill-attachments').remove([path]).catch(() => {}); throw err; }
  if (res && res.ok === false) await supabase.storage.from('bill-attachments').remove([path]).catch(() => {});
  return res;
}
export const deleteAttachment = (id) => rpc('bill_delete_attachment', { p_attachment_id: id });
export async function getFileUrl(path) {
  const { data, error } = await supabase.storage.from('bill-attachments').createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// ---------------------------------------------------------------- notifications
export const markNotificationsRead = (ids) => rpc('bill_mark_notifications_read', { p_ids: ids });
export const markAllNotificationsRead = () => rpc('bill_mark_all_notifications_read');

// ---------------------------------------------------------------- live updates
export function subscribe(tables, onChange) {
  const list = Array.isArray(tables) ? tables : [tables];
  const channel = supabase.channel('bills-' + list.join('-') + '-' + Math.random().toString(36).slice(2));
  list.forEach((table) => channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange));
  channel.subscribe();
  return () => supabase.removeChannel(channel);
}
