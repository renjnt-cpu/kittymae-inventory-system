// Leave Management -- every Supabase call the module makes lives here, so the screens never
// touch `supabase` directly (and can be exercised against a stand-in object in tests).
// Reads go straight to the tables (RLS decides what a person may see); every CHANGE goes
// through a leave_* database function that re-checks who is calling. A function that finds a
// problem returns {ok:false, errors:[...]} -- callers show those; anything else is an Error.
import { supabase } from './supabaseClient.js?v=20260928a';

async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw new Error(error.message);
  return data;
}
function check({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

// ---- profile / reference data ----
export const getMyProfile = () => rpc('leave_my_profile');
export const getDirectory = () => rpc('leave_directory');

export async function listLeaveTypes() {
  return check(await supabase.from('leave_types').select('*').order('sort_order').order('name'));
}
export async function listBalances() {
  return check(await supabase.from('employee_leave_balances')
    .select('employee_id, leave_type_id, total_credits, used_credits, available_credits, updated_at'));
}
export async function listRequests() {
  return check(await supabase.from('leave_requests').select('*').order('created_at', { ascending: false }).limit(3000));
}
export async function getRequest(id) {
  return check(await supabase.from('leave_requests').select('*').eq('id', id).maybeSingle());
}
export async function listTimeline(id) {
  return check(await supabase.from('leave_timeline').select('*').eq('leave_request_id', id).order('created_at').order('id'));
}
export async function listComments(id) {
  return check(await supabase.from('leave_comments').select('*').eq('leave_request_id', id).order('created_at').order('id'));
}
export async function listAttachments(id) {
  return check(await supabase.from('leave_attachments').select('*').eq('leave_request_id', id).order('created_at'));
}
export async function listLedger(employeeId, limit = 300) {
  let q = supabase.from('leave_credit_transactions').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit);
  if (employeeId) q = q.eq('employee_id', employeeId);
  return check(await q);
}

// ---- requests ----
export function previewRequest(p) {
  return rpc('leave_preview_request', {
    p_leave_type_id: p.leaveTypeId, p_payment_type: p.paymentType, p_start_date: p.startDate, p_end_date: p.endDate,
    p_duration_type: p.durationType || 'Full Day', p_start_time: p.startTime || null, p_end_time: p.endTime || null,
    p_employee_id: p.employeeId || null, p_exclude_request: p.excludeRequest || null, p_attachment_count: p.attachmentCount || 0,
  });
}
export function saveRequest(p) {
  return rpc('leave_save_request', {
    p_request_id: p.requestId || null, p_employee_id: p.employeeId || null, p_leave_type_id: p.leaveTypeId,
    p_payment_type: p.paymentType, p_start_date: p.startDate, p_end_date: p.endDate,
    p_start_time: p.startTime || null, p_end_time: p.endTime || null, p_duration_type: p.durationType || 'Full Day',
    p_reason: p.reason || null, p_contact_name: p.contactName || null, p_contact_number: p.contactNumber || null,
    p_notes: p.notes || null, p_submit: !!p.submit,
  });
}
export const deleteDraft = (id) => rpc('leave_delete_draft', { p_request_id: id });
export const markViewed = (id) => rpc('leave_mark_viewed', { p_request_id: id });
export const hrAction = (id, action, comment) => rpc('leave_hr_action', { p_request_id: id, p_action: action, p_comment: comment || null });
export const finalAction = (id, action, comment, reason) =>
  rpc('leave_final_action', { p_request_id: id, p_action: action, p_comment: comment || null, p_reason: reason || null });
export const changePaymentType = (id, paymentType, comment) =>
  rpc('leave_change_payment_type', { p_request_id: id, p_payment_type: paymentType, p_comment: comment || null });
export const cancelRequest = (id, reason) => rpc('leave_cancel_request', { p_request_id: id, p_reason: reason });
export const decideCancellation = (id, decision, comment) =>
  rpc('leave_decide_cancellation', { p_request_id: id, p_decision: decision, p_comment: comment || null });
export const addComment = (id, comment, type) => rpc('leave_add_comment', { p_request_id: id, p_comment: comment, p_type: type || 'public' });

// ---- credits ----
export const adjustCredit = (p) => rpc('leave_adjust_credit', {
  p_employee_id: p.employeeId, p_leave_type_id: p.leaveTypeId, p_transaction_type: p.transactionType, p_amount: p.amount,
  p_reason: p.reason, p_effective_date: p.effectiveDate, p_notes: p.notes || null,
});

// ---- documents ----
const safeName = (name) => String(name).replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
/** Uploads to the private leave-attachments bucket (path "<request id>/<uuid>-<name>"), then
 * registers it with the request so the size/type rules are enforced server-side. */
export async function uploadAttachment(requestId, file, kind) {
  const path = requestId + '/' + crypto.randomUUID() + '-' + safeName(file.name);
  const { error: upErr } = await supabase.storage.from('leave-attachments').upload(path, file, { upsert: false, contentType: file.type });
  if (upErr) throw new Error(upErr.message);
  return rpc('leave_register_attachment', {
    p_request_id: requestId, p_file_name: file.name, p_file_path: path, p_file_type: file.type, p_file_size: file.size, p_kind: kind || 'Supporting Document',
  });
}
export const deleteAttachment = (id) => rpc('leave_delete_attachment', { p_attachment_id: id });
export async function getAttachmentUrl(path) {
  const { data, error } = await supabase.storage.from('leave-attachments').createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// ---- notifications ----
export async function listNotifications(limit = 40) {
  return check(await supabase.from('leave_notifications').select('*').order('created_at', { ascending: false }).limit(limit));
}
export const markNotificationsRead = (ids) => rpc('leave_mark_notifications_read', { p_ids: ids });
export const markAllNotificationsRead = () => rpc('leave_mark_all_notifications_read');

// ---- HR configuration (RLS limits these writes to leave.hr; each change is audited by trigger) ----
export async function listHolidays() { return check(await supabase.from('company_holidays').select('*').order('holiday_date')); }
export async function addHoliday(name, date, isWorking) {
  return check(await supabase.from('company_holidays').insert({ holiday_name: name, holiday_date: date, is_working_holiday: !!isWorking }));
}
export async function updateHoliday(id, patch) { return check(await supabase.from('company_holidays').update(patch).eq('id', id)); }
export async function deleteHoliday(id) { return check(await supabase.from('company_holidays').delete().eq('id', id)); }

export async function listBlackouts() { return check(await supabase.from('leave_blackout_dates').select('*').order('start_date')); }
export async function addBlackout(start, end, reason) {
  return check(await supabase.from('leave_blackout_dates').insert({ start_date: start, end_date: end, reason }));
}
export async function deleteBlackout(id) { return check(await supabase.from('leave_blackout_dates').delete().eq('id', id)); }

export async function addLeaveType(row) { return check(await supabase.from('leave_types').insert(row)); }
export async function updateLeaveType(id, patch) { return check(await supabase.from('leave_types').update(patch).eq('id', id)); }

export async function listSettings() { return check(await supabase.from('leave_settings').select('*')); }
export async function saveSetting(key, value) { return check(await supabase.from('leave_settings').update({ value }).eq('key', key)); }

export async function listSchedules() { return check(await supabase.from('employee_work_schedules').select('*')); }
export async function saveSchedule(employeeId, restDay, supervisorId) {
  return check(await supabase.from('employee_work_schedules')
    .upsert({ employee_id: employeeId, rest_day: restDay, immediate_supervisor_id: supervisorId || null }, { onConflict: 'employee_id' }));
}

// ---- audit log (leave.audit only) ----
export async function listAudit({ before = null, limit = 100 } = {}) {
  let q = supabase.from('leave_audit_log').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit);
  if (before) q = q.lt('created_at', before);
  return check(await q);
}

// ---- live updates ----
export function subscribe(tables, onChange) {
  const list = Array.isArray(tables) ? tables : [tables];
  const channel = supabase.channel('leave-' + list.join('-') + '-' + Math.random().toString(36).slice(2));
  list.forEach((table) => channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange));
  channel.subscribe();
  return () => supabase.removeChannel(channel);
}
