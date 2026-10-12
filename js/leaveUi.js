// Leave Management -- formatting, status vocabulary and small DOM helpers shared by every
// screen. No Supabase here and no imports from shell.js (shell.js loads the notification bell,
// which loads this file, so importing shell back would be a cycle).

export const esc = (s) => (s === null || s === undefined) ? '' : String(s).replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- status vocabulary (mirrors leave_requests.status exactly) ----
export const STATUSES = ['Draft', 'Submitted', 'Pending HR Review', 'Needs Employee Information', 'HR Recommended Approval',
  'HR Recommended Rejection', 'Pending Final Approval', 'Approved', 'Rejected', 'Cancelled', 'Completed'];
export const PENDING_HR = ['Submitted', 'Pending HR Review'];
export const FINAL_QUEUE = ['HR Recommended Approval', 'HR Recommended Rejection', 'Pending Final Approval'];
export const OPEN_STATUSES = ['Submitted', 'Pending HR Review', 'Needs Employee Information', ...FINAL_QUEUE];
// the Final Approver may decide from any of these (including straight from HR's queue)
export const DECISION_STATUSES = [...PENDING_HR, ...FINAL_QUEUE];
export const EMPLOYEE_EDITABLE = ['Draft', 'Submitted', 'Pending HR Review', 'Needs Employee Information'];
export const DURATION_TYPES = ['Full Day', 'Half Day - Morning', 'Half Day - Afternoon', 'Custom Hours'];
export const DOC_KINDS = ['Medical Certificate', "Doctor's Note", 'Supporting Document', 'Travel Document', 'Other'];
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Yellow = pending, Blue = HR review, Orange = final approval, Green = approved,
// Red = rejected, Gray = cancelled / completed / draft (Ren's spec section 5).
const BADGE = {
  'Draft': 'lv-gray', 'Submitted': 'lv-yellow', 'Pending HR Review': 'lv-blue', 'Needs Employee Information': 'lv-yellow',
  'HR Recommended Approval': 'lv-blue', 'HR Recommended Rejection': 'lv-blue', 'Pending Final Approval': 'lv-orange',
  'Approved': 'lv-green', 'Rejected': 'lv-red', 'Cancelled': 'lv-gray', 'Completed': 'lv-gray',
};
export function statusBadge(status, cancellationStatus) {
  return '<span class="badge ' + (BADGE[status] || 'lv-gray') + '">' + esc(status) + '</span>' +
    (cancellationStatus === 'Requested' ? ' <span class="badge lv-orange">Cancellation requested</span>' : '');
}

// ---- dates (date-only strings are never run through the local timezone) ----
export function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = String(d).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' });
}
export const fmtDateTime = (iso) => iso
  ? new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : '—';
/** The Manila calendar day (YYYY-MM-DD) a timestamptz falls on -- "Approved Today" must follow the shop's clock, not the browser's. */
export const manilaDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) : '';
export const rangeText = (s, e) => (!e || s === e) ? fmtDate(s) : fmtDate(s) + ' – ' + fmtDate(e);
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.getUTCFullYear() + '-' + String(t.getUTCMonth() + 1).padStart(2, '0') + '-' + String(t.getUTCDate()).padStart(2, '0');
}
export const num = (n) => { const v = Number(n || 0); return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100); };
export const daysText = (n) => num(n) + (Number(n) === 1 ? ' day' : ' days');
export const fmtBytes = (b) => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
export const yearOf = (dateStr) => Number(String(dateStr).slice(0, 4));

// ---- people ----
// Leave screens name a person by the formal full name on their HR 201 File (leave_directory
// returns it as full_name) together with the employee number, so two people who share a first
// name can never be mixed up. `e` is a leave_directory row.
/** One line -- "Angelyn Morales (MK24024)" -- for dropdowns, subtitles, messages and exports. */
export const personLabel = (e) => {
  const name = (e && e.full_name) || '—';
  return e && e.employee_code ? name + ' (' + e.employee_code + ')' : name;
};
/** A table cell: the name in bold with the employee number under it (extraHtml adds another line). */
export const personCell = (e, extraHtml) => '<b>' + esc((e && e.full_name) || '—') + '</b>' +
  (e && e.employee_code ? '<div class="muted">' + esc(e.employee_code) + '</div>' : '') + (extraHtml || '');
// People are listed with the longest-serving first -- the earliest Date Hired on the HR 201 File on top,
// never alphabetically by name (Ren, 2026-10-12: "sort this with the longest stay in the company";
// that replaced the employee-number order he asked for the day before). Someone with no date hired goes
// last; people hired on the same day follow employee-number order (numeric-aware, like the 201 directory).
const compareEmployeeNo = (x, y) => String(x || '').localeCompare(String(y || ''), undefined, { numeric: true, sensitivity: 'base' });
/** Array.sort comparator for anything carrying hire_date + employee_code (a leave_directory row, or a row built from one). */
export const byTenure = (a, b) => {
  const x = (a && a.hire_date) || '', y = (b && b.hire_date) || '';
  if (x !== y) return !x ? 1 : !y ? -1 : (x < y ? -1 : 1); // ISO dates compare correctly as text
  return compareEmployeeNo(a && a.employee_code, b && b.employee_code);
};

/** Plain-text key/value row in the existing drawer style. */
export const kv = (label, valueHtml) => '<div class="drawer-kv"><span>' + esc(label) + '</span><b>' + valueHtml + '</b></div>';

/** Turns the {ok:false, errors:[]} shape (or a thrown Error) into one readable string. */
export const errorsText = (res) => (res && res.errors ? res.errors : [String(res)]).join(' ');

/** Small tile in the system's existing .tile look. */
export const tile = (num, label, sub) => '<div class="tile"><div class="num">' + num + '</div><div class="lbl">' + esc(label) + '</div>' +
  (sub ? '<div class="muted" style="font-size:10px;">' + esc(sub) + '</div>' : '') + '</div>';
