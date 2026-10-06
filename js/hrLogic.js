// HR 201 File -- pure rules and small helpers (no DOM, no network), so they can be checked on their own.
// The database (migrations 180-183) is what really decides who may see or change what; nothing here grants anything.

// ---- the same lists the classic 201-File page used (Kittymae's real values; unchanged) ----
export const COMPANIES = ['Miss Kittymae', 'Layover'];
export const DEPARTMENTS = ['EXECUTIVE', 'SALES & MARKETING', 'HUMAN CAPITAL MANAGEMENT', 'CORPORATE SERVICES', 'ADMINISTRATIVE', 'F&B', 'OPERATIONS'];
export const JOB_TITLES_BY_DEPT = {
  'EXECUTIVE': ['CEO', 'COO'],
  'SALES & MARKETING': ['Senior Sales Admin Associate', 'Sales Admin Associate', 'Sales Associate'],
  'HUMAN CAPITAL MANAGEMENT': ['Admin Associate', 'Sales Clerk'],
  'CORPORATE SERVICES': ['Inventory Staff', 'Admin Associate', 'Audit', 'Data Entry'],
  'ADMINISTRATIVE': ['Company Driver', 'Personal Assistant', 'Helper'],
  'F&B': ['Service Crew', 'Senior Crew'],
  'OPERATIONS': ['Sales Admin Associate', 'Branch Team Leader', 'Branch Supervisor'],
};
export const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated'];
export const GENDERS = ['Male', 'Female'];
export const EMPLOYMENT_STATUSES = ['REG', 'PB', 'RES', 'TER', 'AWOL', 'DECEASED'];
export const STATUS_LABEL = { REG: 'Regular', PB: 'Probationary', RES: 'Resigned', TER: 'Terminated', AWOL: 'AWOL', DECEASED: 'Deceased' };
export const SEPARATED = ['RES', 'TER', 'AWOL', 'DECEASED'];
export const TAX_STATUS_CODES = ['S', 'S1', 'S2', 'S3', 'S4', 'M', 'M1', 'M2', 'M3', 'M4'];
export const PAYMENT_MODES = ['CASH', 'CHEQUE', 'BANK'];
export const YES_NO = ['YES', 'NO'];
export const EDUCATIONAL_ATTAINMENTS = ['HIGH SCHOOL', 'DIPLOMA', 'BACHELOR', 'MASTERAL', 'DOCTORAL'];
export const STORE_CATEGORIES = ['HQ', 'CONSOLACION', 'PACIFIC', 'HELPER', 'DAILY RATE', 'ON LEAVE', 'APM MALL', 'PRISTINA', 'MACTAN', 'WAREHOUSE', 'DECA HERNAN CORTES'];
export const ROLES = ['None', 'Staff', 'Branch Supervisor', 'Manager', 'Admin'];
export const DOC_CATEGORIES = ['Identification', 'Government Documents', 'Employment Contract', 'Clearances & Medical', 'Training & Certificates', 'Performance & Disciplinary', 'Separation', 'Other'];
export const GOV_FIELDS = [
  { key: 'sss_number', label: 'SSS number', on: 'sss_on_file' },
  { key: 'philhealth_number', label: 'PhilHealth number', on: 'philhealth_on_file' },
  { key: 'pagibig_number', label: 'Pag-IBIG number', on: 'pagibig_on_file' },
  { key: 'tin_number', label: 'TIN number', on: 'tin_on_file' },
];

// ---- the field catalogue: where each field lives, how it is edited, which HR key edits it ----
// `store` says which row it is saved on: the 201 file ('file') or the employees row ('emp').
export const FIELD_DEFS = {
  first_name:   { label: 'First name', tab: 'personal', type: 'text', store: 'file', key: 'hr.edit_profile' },
  middle_name:  { label: 'Middle name', tab: 'personal', type: 'text', store: 'file', key: 'hr.edit_profile' },
  last_name:    { label: 'Last name', tab: 'personal', type: 'text', store: 'file', key: 'hr.edit_profile' },
  suffix:       { label: 'Suffix', tab: 'personal', type: 'text', store: 'file', key: 'hr.edit_profile' },
  full_name:    { label: 'Display name', tab: 'personal', type: 'text', store: 'emp', key: 'hr.edit_profile', hint: 'How the name is shown across the system.' },
  gender:       { label: 'Gender', tab: 'personal', type: 'select', options: GENDERS, store: 'file', key: 'hr.edit_profile' },
  civil_status: { label: 'Civil status', tab: 'personal', type: 'select', options: CIVIL_STATUSES, store: 'file', key: 'hr.edit_profile' },
  birthdate:    { label: 'Birthdate', tab: 'personal', type: 'date', store: 'file', key: 'hr.edit_profile' },
  contact_number: { label: 'Contact number', tab: 'personal', type: 'text', store: 'emp', key: 'hr.edit_profile' },
  address:      { label: 'Address', tab: 'personal', type: 'textarea', store: 'file', key: 'hr.edit_profile' },
  educational_attainment: { label: 'Educational attainment', tab: 'personal', type: 'select', options: EDUCATIONAL_ATTAINMENTS, store: 'file', key: 'hr.edit_profile' },

  company:      { label: 'Company', tab: 'employment', type: 'select', options: COMPANIES, store: 'file', key: 'hr.edit_employment', critical: true, access: true },
  department:   { label: 'Department', tab: 'employment', type: 'select', options: DEPARTMENTS, store: 'file', key: 'hr.edit_employment', critical: true, access: true },
  job_title:    { label: 'Job title', tab: 'employment', type: 'jobtitle', store: 'file', key: 'hr.edit_employment', critical: true, access: true, hint: 'The job title decides what this person can do in the system.' },
  employment_status: { label: 'Employment status', tab: 'employment', type: 'select', options: EMPLOYMENT_STATUSES, optionLabel: (c) => c + ' — ' + (STATUS_LABEL[c] || c), store: 'file', key: 'hr.edit_employment', critical: true },
  hire_date:    { label: 'Date hired', tab: 'employment', type: 'date', store: 'emp', key: 'hr.edit_employment', critical: true },
  end_of_employment_date: { label: 'End of employment date', tab: 'employment', type: 'date', store: 'file', key: 'hr.edit_employment', critical: true },
  store_category: { label: 'Store category', tab: 'employment', type: 'select', options: STORE_CATEGORIES, store: 'file', key: 'hr.edit_employment' },
  role:         { label: 'Role', tab: 'employment', type: 'select', options: ROLES, store: 'emp', key: 'system.admin', critical: true, access: true, adminOnly: true },
  branch_id:    { label: 'Branch', tab: 'employment', type: 'branch', store: 'emp', key: 'system.admin', critical: true, access: true, adminOnly: true },
  status:       { label: 'System account status', tab: 'employment', type: 'select', options: ['Active', 'Inactive'], store: 'emp', key: 'system.admin', critical: true, access: true, adminOnly: true, hint: 'Inactive means this person can no longer sign in.' },

  basic_salary: { label: 'Basic salary', tab: 'compensation', type: 'number', store: 'file', key: 'hr.edit_compensation', critical: true, sensitive: true },
  payment_mode: { label: 'Payment mode', tab: 'compensation', type: 'select', options: PAYMENT_MODES, store: 'file', key: 'hr.edit_compensation' },
  payroll_details: { label: 'Payroll details', tab: 'compensation', type: 'textarea', store: 'file', key: 'hr.edit_compensation', sensitive: true, hint: 'For example bank, account number, pay schedule.' },
  tax_status_code: { label: 'Tax status code', tab: 'compensation', type: 'select', options: TAX_STATUS_CODES, store: 'file', key: 'hr.edit_compensation' },
  minimum_wage_earner: { label: 'Minimum wage earner', tab: 'compensation', type: 'select', options: YES_NO, store: 'file', key: 'hr.edit_compensation' },

  sss_number:        { label: 'SSS number', tab: 'government', type: 'gov', store: 'file', key: 'hr.edit_government_ids', sensitive: true },
  philhealth_number: { label: 'PhilHealth number', tab: 'government', type: 'gov', store: 'file', key: 'hr.edit_government_ids', sensitive: true },
  pagibig_number:    { label: 'Pag-IBIG number', tab: 'government', type: 'gov', store: 'file', key: 'hr.edit_government_ids', sensitive: true },
  tin_number:        { label: 'TIN number', tab: 'government', type: 'gov', store: 'file', key: 'hr.edit_government_ids', sensitive: true },

  emergency_contact_name:         { label: 'Emergency contact name', tab: 'emergency', type: 'text', store: 'file', key: 'hr.edit_profile' },
  emergency_contact_relationship: { label: 'Relationship', tab: 'emergency', type: 'text', store: 'file', key: 'hr.edit_profile' },
  emergency_contact_number:       { label: 'Emergency contact number', tab: 'emergency', type: 'text', store: 'file', key: 'hr.edit_profile' },

  notes: { label: 'Note on file (original field)', tab: 'notes', type: 'textarea', store: 'file', key: 'hr.add_notes', sensitive: true },
};
export const fieldLabel = (f) => (FIELD_DEFS[f] || {}).label || f;

/** Fields that need a reason / change what a person can do (mirrors hr_save_employee; the database enforces both). */
export const CRITICAL = new Set(Object.keys(FIELD_DEFS).filter((k) => FIELD_DEFS[k].critical));
export const ACCESS_DRIVING = new Set(Object.keys(FIELD_DEFS).filter((k) => FIELD_DEFS[k].access));

// ---- tabs, in the order the spec lists them ----
export const TABS = [
  { id: 'overview', label: 'Overview', need: 'hr.view_profile' },
  { id: 'personal', label: 'Personal Information', need: 'hr.view_profile' },
  { id: 'employment', label: 'Employment', need: 'hr.view_profile' },
  { id: 'compensation', label: 'Compensation & Payroll', need: 'hr.view_compensation' },
  { id: 'government', label: 'Government & Statutory IDs', need: 'hr.view_government_ids' },
  { id: 'emergency', label: 'Emergency Contact', need: 'hr.view_profile' },
  { id: 'documents', label: 'Documents', need: 'hr.view_documents' },
  { id: 'leave', label: 'Leave', need: 'hr.view_profile' },
  { id: 'access', label: 'Access & Permissions', need: 'hr.view_access' },
  { id: 'history', label: 'Employment History', need: 'hr.view_profile' },
  { id: 'notes', label: 'Notes', need: 'hr.view_notes|hr.view_management_notes' },
  { id: 'audit', label: 'Audit Log', need: 'hr.view_audit_log' },
];
/** Which tabs a person gets: a tab appears when they hold any of the keys it needs ("a|b" = either). */
export function visibleTabs(keys) {
  return TABS.filter((t) => t.need.split('|').some((k) => keys && keys[k]));
}

// ---- values ----
export const blank = (v) => v === null || v === undefined || String(v).trim() === '';
export const norm = (v) => (blank(v) ? null : String(v).trim());
export const sameValue = (a, b) => norm(a) === norm(b);
export function sameNumber(a, b) {
  if (blank(a) && blank(b)) return true;
  if (blank(a) || blank(b)) return false;
  return Number(a) === Number(b);
}

/**
 * The changes made in an edit session. `original` and `edited` are plain {field: value} maps; only fields present in `edited` count.
 * Returns [{field, label, old, new, tab, critical, access, sensitive, type}] in catalogue order.
 */
export function diffFields(original, edited) {
  const out = [];
  for (const field of Object.keys(FIELD_DEFS)) {
    if (!Object.prototype.hasOwnProperty.call(edited, field)) continue;
    const d = FIELD_DEFS[field];
    const newV = edited[field];
    const oldV = original ? original[field] : null;
    if (d.type === 'gov') {
      // government IDs: the page never holds the current number, so a typed value (or an explicit clear = null) is a change; an empty box means "keep it"
      if (newV === undefined || (newV !== null && blank(newV))) continue;
    } else {
      const same = d.type === 'number' ? sameNumber(oldV, newV) : sameValue(oldV, newV);
      if (same) continue;
    }
    out.push({ field, label: d.label, old: d.type === 'gov' ? null : (blank(oldV) ? null : oldV), new: blank(newV) ? null : newV,
      tab: d.tab, critical: !!d.critical, access: !!d.access, sensitive: !!d.sensitive, type: d.type });
  }
  return out;
}
export const needsReason = (diff) => diff.some((d) => d.critical);
export const affectsAccess = (diff) => diff.some((d) => d.access);
/** What the save function receives: {field: value-or-null}. */
export function changesPayload(diff) {
  const out = {};
  for (const d of diff) out[d.field] = d.new;
  return out;
}

export const money = (n) => (blank(n) ? '—' : '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtDate = (s) => (s ? new Date(String(s).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-PH', { dateStyle: 'medium' }) : '—');
export const fmtDateTime = (s) => (s ? new Date(s).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
/** Whole years / months between two YYYY-MM-DD dates, as "2 yrs 3 mos". */
export function spanText(from, to) {
  if (!from) return '—';
  const a = new Date(String(from).slice(0, 10) + 'T00:00:00'), b = to ? new Date(String(to).slice(0, 10) + 'T00:00:00') : new Date();
  if (isNaN(a) || isNaN(b) || b < a) return '—';
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  if (months < 1) { const days = Math.max(0, Math.round((b - a) / 86400000)); return plural(days, 'day'); }
  const y = Math.floor(months / 12), m = months % 12;
  return [y ? plural(y, 'yr') : '', m ? plural(m, 'mo') : ''].filter(Boolean).join(' ');
}
export function ageText(birthdate, today) {
  if (!birthdate) return '';
  const a = new Date(String(birthdate).slice(0, 10) + 'T00:00:00'), b = today ? new Date(String(today).slice(0, 10) + 'T00:00:00') : new Date();
  if (isNaN(a)) return '';
  let age = b.getFullYear() - a.getFullYear();
  if (b.getMonth() < a.getMonth() || (b.getMonth() === a.getMonth() && b.getDate() < a.getDate())) age -= 1;
  return age >= 0 && age < 120 ? age + ' yrs old' : '';
}
export function fmtBytes(n) {
  if (!n) return '';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}

// ---- the directory: quick filters, filters, sort ----
export const QUICK_FILTERS = [
  { id: 'all', label: 'Everyone' },
  { id: 'active', label: 'Active' },
  { id: 'probationary', label: 'Probationary' },
  { id: 'regular', label: 'Regular' },
  { id: 'separated', label: 'Left the company' },
  { id: 'new', label: 'New (30 days)' },
  { id: 'docs_missing', label: 'Missing documents', docs: true },
  { id: 'docs_expiring', label: 'Documents expiring', docs: true },
  { id: 'incomplete', label: 'Incomplete profile' },
  { id: 'no_login', label: 'No sign-in yet' },
  { id: 'archived', label: 'Archived' },
];
export function defaultFilters() {
  return { q: '', quick: 'all', company: '', department: '', branch: '', job_title: '', employment_status: '', login: '', docs: '', profile: '', showArchived: false, ids: null, idsLabel: '' };
}
function quickMatch(r, id, today) {
  switch (id) {
    case 'active': return r.status === 'Active';
    case 'probationary': return r.employment_status === 'PB';
    case 'regular': return r.employment_status === 'REG';
    case 'separated': return SEPARATED.includes(r.employment_status) || (r.end_of_employment_date && r.end_of_employment_date <= today);
    case 'new': return r.hire_date && daysBefore(today, r.hire_date) <= 30 && daysBefore(today, r.hire_date) >= 0;
    case 'docs_missing': return Number(r.docs_missing) > 0;
    case 'docs_expiring': return Number(r.docs_expiring) > 0 || Number(r.docs_expired) > 0;
    case 'incomplete': return Number(r.profile_pct) < 100;
    case 'no_login': return !r.has_login;
    case 'archived': return !!r.archived;
    default: return true;
  }
}
function daysBefore(today, date) {
  const a = new Date(String(today).slice(0, 10) + 'T00:00:00'), b = new Date(String(date).slice(0, 10) + 'T00:00:00');
  return Math.round((a - b) / 86400000);
}
export function filterRows(rows, f, today) {
  const q = (f.q || '').trim().toLowerCase();
  return rows.filter((r) => {
    if (f.quick === 'archived') { if (!r.archived) return false; }
    else if (r.archived && !f.showArchived) return false;
    if (q) {
      const hay = [r.display_name, r.full_name, r.employee_code, r.department, r.job_title, r.company, r.branch_name, r.contact_number].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.quick && f.quick !== 'all' && f.quick !== 'archived' && !quickMatch(r, f.quick, today)) return false;
    if (f.ids && !f.ids.includes(r.id)) return false;
    if (f.company && r.company !== f.company) return false;
    if (f.department && r.department !== f.department) return false;
    if (f.branch && String(r.branch_id || '') !== String(f.branch)) return false;
    if (f.job_title && r.job_title !== f.job_title) return false;
    if (f.employment_status && r.employment_status !== f.employment_status) return false;
    if (f.login === 'yes' && !r.has_login) return false;
    if (f.login === 'no' && r.has_login) return false;
    if (f.docs === 'missing' && !(Number(r.docs_missing) > 0)) return false;
    if (f.docs === 'complete' && Number(r.docs_missing) > 0) return false;
    if (f.docs === 'expiring' && !(Number(r.docs_expiring) > 0 || Number(r.docs_expired) > 0)) return false;
    if (f.profile === 'complete' && Number(r.profile_pct) < 100) return false;
    if (f.profile === 'incomplete' && Number(r.profile_pct) >= 100) return false;
    return true;
  });
}
export const SORTS = [
  { key: 'employee_code', label: 'Employee #' },
  { key: 'display_name', label: 'Name' },
  { key: 'department', label: 'Department' },
  { key: 'job_title', label: 'Job title' },
  { key: 'hire_date', label: 'Date hired' },
  { key: 'profile_pct', label: 'Profile completeness' },
];
export function sortRows(rows, sort) {
  const dir = sort.dir === 'desc' ? -1 : 1, key = sort.field || 'employee_code';
  return [...rows].sort((a, b) => {
    const x = a[key], y = b[key];
    if (key === 'profile_pct') return (Number(x || 0) - Number(y || 0)) * dir;
    return String(x === null || x === undefined ? '' : x).localeCompare(String(y === null || y === undefined ? '' : y), undefined, { numeric: true, sensitivity: 'base' }) * dir;
  });
}
export function distinct(rows, key) {
  return [...new Set(rows.map((r) => r[key]).filter((v) => !blank(v)))].sort((a, b) => String(a).localeCompare(String(b)));
}

/** A CSV of the directory columns shown on screen (never salary or government IDs). */
export function directoryCsv(rows) {
  const cols = [['Employee #', 'employee_code'], ['Name', 'display_name'], ['Company', 'company'], ['Department', 'department'], ['Job title', 'job_title'], ['Branch', 'branch_name'],
    ['Employment status', (r) => statusLabel(r.employment_status)], ['System status', 'status'], ['Date hired', 'hire_date'], ['End of employment', 'end_of_employment_date'], ['Profile %', 'profile_pct']];
  const cell = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [cols.map((c) => cell(c[0])).join(',')].concat(rows.map((r) => cols.map((c) => cell(typeof c[1] === 'function' ? c[1](r) : r[c[1]])).join(','))).join('\r\n');
}
export const statusLabel = (code) => STATUS_LABEL[code] || code || '—';
export const statusTone = (r) => {
  if (r.archived) return 'gray';
  if (SEPARATED.includes(r.employment_status)) return 'low';
  if (r.employment_status === 'REG') return 'ok';
  if (r.employment_status === 'PB') return 'transit';
  return 'gray';
};

// ---- plain-language names for what the history and audit tables record ----
export const HISTORY_LABEL = {
  hire_date: 'Date hired', job_title: 'Job title', department: 'Department', company: 'Company', employment_status: 'Employment status',
  end_of_employment: 'End of employment', salary: 'Basic salary', branch: 'Branch', role: 'Role', status: 'System account status', position: 'System position',
  archived: 'Record archived', restored: 'Record restored',
};
export const ACTION_LABEL = {
  created: 'Record created', updated: 'Changed', viewed: 'Viewed', revealed: 'Showed full number', exported: 'Exported', printed: 'Printed',
  document_added: 'Document added', document_archived: 'Document archived', document_restored: 'Document restored', document_replaced: 'Document replaced',
  document_updated: 'Document updated', document_deleted: 'Document deleted', document_viewed: 'Document opened', note_added: 'Note added', note_archived: 'Note archived',
  archived: 'Record archived', restored: 'Record restored', password_set: 'Password set', access_reviewed: 'Access reviewed', checklist_changed: 'Document checklist changed',
};
export const SECTION_LABEL = {
  personal: 'Personal', employment: 'Employment', compensation: 'Compensation', government_ids: 'Government IDs', emergency: 'Emergency contact',
  documents: 'Documents', notes: 'Notes', access: 'Access', account: 'Account', record: 'Record',
};
/** "Job title: Inventory Staff → Branch Team Leader" */
export function historyText(h) {
  const label = HISTORY_LABEL[h.kind] || h.kind;
  if (h.hidden) return label + ' changed (amount hidden)';
  const fmt = (v) => (h.kind === 'salary' ? money(v) : (h.kind === 'employment_status' ? statusLabel(v) : v));
  if (h.kind === 'archived' || h.kind === 'restored') return label;
  if (blank(h.old_value)) return label + ': ' + fmt(h.new_value);
  if (blank(h.new_value)) return label + ' cleared (was ' + fmt(h.old_value) + ')';
  return label + ': ' + fmt(h.old_value) + ' → ' + fmt(h.new_value);
}

export const DOC_STATE_LABEL = { ok: 'On file', missing: 'Missing', expiring: 'Expiring soon', expired: 'Expired' };
export function expiryText(d) {
  if (!d.expiry_date) return 'No expiry';
  const n = Number(d.days_to_expiry);
  if (d.expiry_state === 'expired') return 'Expired ' + plural(Math.abs(n), 'day') + ' ago';
  if (d.expiry_state === 'expiring') return n === 0 ? 'Expires today' : 'Expires in ' + plural(n, 'day');
  return 'Valid until ' + fmtDate(d.expiry_date);
}
export const ALERT_TITLE = {
  doc_expired: 'Expired documents', doc_expiring: 'Documents expiring soon', doc_missing: 'Missing required documents', profile_incomplete: 'Incomplete profiles',
  ended_still_active: 'Left the company but still has access', position_mismatch: 'Position and job title differ', no_login: 'No sign-in yet',
};
export const ALERT_QUICK = { doc_expired: 'docs_expiring', doc_expiring: 'docs_expiring', doc_missing: 'docs_missing', profile_incomplete: 'incomplete', no_login: 'no_login' };
