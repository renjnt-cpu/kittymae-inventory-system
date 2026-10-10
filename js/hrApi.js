// HR 201 File -- every Supabase call the page makes lives here, so the screens never touch `supabase` directly
// (and can be driven by a stand-in object in tests).  Every read and every change goes through an hr_* database function
// (migrations 180-183) that checks the caller's HR permission keys itself; the page only hides what it would refuse.
// A function that finds a problem with the input returns {ok:false, errors:[{field, message}]}; a missing permission throws an Error.
import { supabase } from './supabaseClient.js?v=20261011a';
export { getBranches, listHrPositions, setEmployeePassword } from './api.js?v=20261011a';

const BUCKET = 'employee-201-documents';

async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw new Error(error.message);
  return data;
}

// ---------------------------------------------------------------- reads
export const myAccess = () => rpc('hr_my_access');
export const directory = () => rpc('hr_directory');
export const summary = () => rpc('hr_summary');
export const alerts = () => rpc('hr_alerts');
export const getEmployee = (id) => rpc('hr_get_employee', { p_employee_id: id });
export const getCompensation = (id) => rpc('hr_get_compensation', { p_employee_id: id });
export const revealGovId = (id, field, reason) => rpc('hr_reveal_government_id', { p_employee_id: id, p_field: field, p_reason: reason || null });
export const accessImpact = (id, changes) => rpc('hr_access_impact', { p_employee_id: id || null, p_new: changes || {} });
export const accessView = (id) => rpc('hr_access_view', { p_employee_id: id });
export const listHistory = (id) => rpc('hr_list_history', { p_employee_id: id });
export const listAudit = ({ employeeId = null, limit = 200, before = null, action = '', section = '' } = {}) =>
  rpc('hr_list_audit', { p_employee_id: employeeId, p_limit: limit, p_before: before, p_action: action || null, p_section: section || null });
export const listNotes = (id) => rpc('hr_list_notes', { p_employee_id: id });
export const listDocuments = (id, includeArchived = false) => rpc('hr_list_documents', { p_employee_id: id, p_include_archived: !!includeArchived });
export const listRequirements = () => rpc('hr_list_requirements');
export const findDuplicates = (payload) => rpc('hr_find_duplicates', { p_payload: payload });

// ---------------------------------------------------------------- changes
export const saveEmployee = (id, changes, { reason = null, expectedUpdatedAt = null, confirmImpact = false } = {}) =>
  rpc('hr_save_employee', { p_employee_id: id, p_changes: changes, p_reason: reason, p_expected_updated_at: expectedUpdatedAt, p_confirm_impact: !!confirmImpact });
export const createEmployee = (payload, reason = null) => rpc('hr_create_employee_full', { p_payload: payload, p_reason: reason });
export const archiveEmployee = (id, reason) => rpc('hr_archive_employee', { p_employee_id: id, p_reason: reason });
export const restoreEmployee = (id, reason = null) => rpc('hr_restore_employee', { p_employee_id: id, p_reason: reason });
export const addNote = (id, visibility, category, body) => rpc('hr_add_note', { p_employee_id: id, p_visibility: visibility, p_category: category, p_body: body });
export const archiveNote = (noteId, reason = null) => rpc('hr_archive_note', { p_note_id: noteId, p_reason: reason });
export const addDocument = (id, d) => rpc('hr_add_document', {
  p_employee_id: id, p_document_name: d.name, p_storage_path: d.path, p_category: d.category || 'Other', p_doc_type: d.docType || null,
  p_issue_date: d.issueDate || null, p_expiry_date: d.expiryDate || null, p_description: d.description || null,
  p_file_size: d.size || null, p_mime_type: d.mime || null, p_replaces_id: d.replacesId || null });
export const archiveDocument = (docId, reason) => rpc('hr_archive_document', { p_document_id: docId, p_reason: reason });
export const restoreDocument = (docId) => rpc('hr_restore_document', { p_document_id: docId });
export const deleteDocumentPermanently = (docId, reason) => rpc('hr_delete_document_permanently', { p_document_id: docId, p_reason: reason });
export const openDocument = (docId) => rpc('hr_document_open', { p_document_id: docId });
export const saveRequirement = (docType, category, isRequired, active = true, sort = null) =>
  rpc('hr_save_document_requirement', { p_doc_type: docType, p_category: category, p_is_required: !!isRequired, p_active: active !== false, p_sort: sort });
export const logEvent = (employeeId, action, section = null, detail = null) => rpc('hr_log_event', { p_employee_id: employeeId || null, p_action: action, p_section: section, p_detail: detail });
export const logPasswordChange = (id, mode) => rpc('hr_log_password_change', { p_employee_id: id, p_mode: mode });
export const markAccessReviewed = (id, note = null) => rpc('hr_mark_access_reviewed', { p_employee_id: id, p_note: note });

// ---------------------------------------------------------------- files (private bucket; the page uploads first, then registers the document)
const safeName = (n) => String(n || 'file').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120) || 'file';
export async function uploadFile(employeeId, file) {
  const path = employeeId + '/' + Date.now() + '_' + safeName(file.name);
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw new Error(error.message);
  return path;
}
export async function removeFile(path) {
  await supabase.storage.from(BUCKET).remove([path]);
}
export async function signedUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
