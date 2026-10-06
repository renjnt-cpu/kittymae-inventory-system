// Leave Management -- the File / Edit Leave Request drawer.
// Three views in one drawer: the form (with a live days + credits preview from the database's
// own calculation engine), a "Review & Submit" confirmation, and a success screen.
// Nothing here decides anything -- the preview, the validation and the routing (HR review,
// final approval, owner auto-approval) all come back from the database functions.
import {
  esc, fmtDate, rangeText, num, daysText, fmtBytes, errorsText, statusBadge, DURATION_TYPES, DOC_KINDS, kv,
} from './leaveUi.js?v=20261007e';
import { fileProblem } from './leaveDetail.js?v=20261007e';

const $ = (id) => document.getElementById(id);
let ctx = null;
let st = null;
let previewTimer = null;
let previewSeq = 0;

export function closeForm() {
  clearTimeout(previewTimer);
  previewSeq++;
  $('lv-form-backdrop').classList.remove('open');
  $('lv-form-drawer').classList.remove('open');
  st = null;
}

/** The ✕ / backdrop / Escape path: asks before throwing away unsaved work, otherwise just closes. */
export function requestCloseForm() {
  if (st && (st.view === 'edit' || st.view === 'review')) onCancelForm(); else closeForm();
}

/** opts.request = an existing request to edit/resubmit; opts.employeeId = pre-select (HR). */
export async function openForm(c, opts = {}) {
  ctx = c;
  const r = opts.request || null;
  st = {
    requestId: r ? r.id : null,
    status: r ? r.status : null,
    employeeId: r ? r.employee_id : (opts.employeeId || ctx.me.employee_id),
    leaveTypeId: r ? String(r.leave_type_id) : '',
    paymentType: r ? r.payment_type : 'Paid',
    durationType: r ? r.duration_type : 'Full Day',
    startDate: r ? r.start_date : '',
    endDate: r ? r.end_date : '',
    startTime: r && r.start_time ? String(r.start_time).slice(0, 5) : '',
    endTime: r && r.end_time ? String(r.end_time).slice(0, 5) : '',
    reason: r ? (r.reason || '') : '',
    contactName: r ? (r.emergency_contact_name || '') : '',
    contactNumber: r ? (r.emergency_contact_number || '') : '',
    notes: r ? (r.employee_notes || '') : '',
    staged: [], existing: [], preview: null, dirty: false, busy: false,
  };
  $('lv-form-backdrop').classList.add('open');
  $('lv-form-drawer').classList.add('open');
  $('lv-form-title').textContent = !r ? 'File Leave Request' : (r.status === 'Draft' ? 'Edit Draft' : r.status === 'Needs Employee Information' ? 'Update Leave Request' : 'Edit Leave Request');
  $('lv-form-sub').textContent = r && r.leave_request_number ? r.leave_request_number : '';
  $('lv-form-body').innerHTML = '<p class="muted">Loading…</p>';
  $('lv-form-footer').innerHTML = '';
  if (r) {
    try { st.existing = await ctx.api.listAttachments(r.id); } catch (e) { st.existing = []; }
  }
  if (!st) return;
  renderEdit();
  schedulePreview(0);
}

const typeOf = () => ctx.typeById[Number(st.leaveTypeId)] || null;
const empOf = () => ctx.dirById[st.employeeId] || {};
const isNew = () => !st.requestId;
const filingForOther = () => st.employeeId !== ctx.me.employee_id;

function balanceFor(employeeId, typeId) {
  const b = (ctx.data.balances || []).find((x) => x.employee_id === employeeId && x.leave_type_id === Number(typeId));
  return b ? Number(b.available_credits) : 0;
}

function empInfoHtml() {
  const e = empOf();
  let h = kv('Name', esc(e.full_name || '—')) + kv('Employee ID', esc(e.employee_code || '—')) +
    kv('Department', esc(e.department || '—')) + kv('Position', esc(e.job_title || '—')) +
    kv('Immediate Supervisor', esc(e.supervisor_name || '—')) + kv('Employment Start Date', fmtDate(e.hire_date));
  if (filingForOther() && e.has_login === false) h += '<p class="muted" style="margin:6px 0 0;">This employee has no login — you are filing on their behalf and it will be recorded that way.</p>';
  return h;
}

// ---------- form view ----------
function renderEdit() {
  st.view = 'edit';
  const types = ctx.types.filter((t) => t.active || String(t.id) === st.leaveTypeId);
  const editingExisting = !isNew();
  let who = '';
  if (ctx.flags.hr && !editingExisting) {
    const people = ctx.dir.filter((e) => e.status === 'Active' || e.employee_id === st.employeeId)
      .sort((a, b) => (a.employee_id === ctx.me.employee_id ? -1 : b.employee_id === ctx.me.employee_id ? 1 : String(a.full_name).localeCompare(String(b.full_name))));
    who = '<div class="field"><label>File leave for</label><select id="lv-f-employee">' + people.map((e) =>
      '<option value="' + esc(e.employee_id) + '"' + (e.employee_id === st.employeeId ? ' selected' : '') + '>' +
      esc(e.full_name) + (e.employee_id === ctx.me.employee_id ? ' (me)' : '') + (e.has_login === false ? ' — no login' : '') +
      (e.department ? ' · ' + esc(e.department) : '') + '</option>').join('') + '</select></div>';
  }
  const t = typeOf();
  const pay = (v) => '<option value="' + v + '"' + (st.paymentType === v ? ' selected' : '') + '>' + v + ' Leave</option>';
  const dur = DURATION_TYPES.map((d) => '<option' + (st.durationType === d ? ' selected' : '') + '>' + esc(d) + '</option>').join('');
  const singleDay = st.durationType !== 'Full Day';

  $('lv-form-body').innerHTML =
    '<div id="lv-form-msg"></div>' +
    '<div class="drawer-section"><h4>Employee</h4>' + who + '<div id="lv-emp-info">' + empInfoHtml() + '</div></div>' +
    '<div class="drawer-section"><h4>Leave Details</h4><div class="lv-grid">' +
      '<div class="field"><label>Leave Type *</label><select id="lv-f-type"><option value="">Select a leave type…</option>' +
        types.map((x) => '<option value="' + x.id + '"' + (String(x.id) === st.leaveTypeId ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Paid / Unpaid *</label><select id="lv-f-payment">' + pay('Paid') + pay('Unpaid') + '</select></div>' +
      '<div class="field"><label>Duration *</label><select id="lv-f-duration">' + dur + '</select></div>' +
      '<div class="field"><label>Start Date *</label><input type="date" id="lv-f-start" value="' + esc(st.startDate) + '"></div>' +
      '<div class="field"><label>End Date *</label><input type="date" id="lv-f-end" value="' + esc(st.endDate) + '"' + (singleDay ? ' disabled' : '') + '></div>' +
      '<div class="field lv-time"' + (st.durationType === 'Custom Hours' ? '' : ' hidden') + '><label>Start Time *</label><input type="time" id="lv-f-stime" value="' + esc(st.startTime) + '"></div>' +
      '<div class="field lv-time"' + (st.durationType === 'Custom Hours' ? '' : ' hidden') + '><label>End Time *</label><input type="time" id="lv-f-etime" value="' + esc(st.endTime) + '"></div>' +
    '</div><div id="lv-type-hint" class="muted" style="margin-top:6px;">' + typeHint(t) + '</div></div>' +
    '<div class="drawer-section"><h4>Estimate</h4><div id="lv-preview"></div></div>' +
    '<div class="drawer-section"><h4>Reason &amp; Contact</h4>' +
      '<div class="field"><label>Reason for Leave *</label><textarea id="lv-f-reason" rows="3" placeholder="Tell HR why you need this leave">' + esc(st.reason) + '</textarea></div>' +
      '<div class="lv-grid" style="margin-top:8px;">' +
        '<div class="field"><label>Emergency Contact Name</label><input type="text" id="lv-f-cname" value="' + esc(st.contactName) + '"></div>' +
        '<div class="field"><label>Emergency Contact Number</label><input type="text" id="lv-f-cnum" inputmode="tel" value="' + esc(st.contactNumber) + '"></div>' +
      '</div>' +
      '<div class="field" style="margin-top:8px;"><label>Notes (optional)</label><textarea id="lv-f-notes" rows="2">' + esc(st.notes) + '</textarea></div></div>' +
    '<div class="drawer-section"><h4>Supporting Documents</h4><div id="lv-f-docs"></div>' +
      '<div class="lv-upload"><select id="lv-f-dockind">' + DOC_KINDS.map((k) => '<option>' + esc(k) + '</option>').join('') + '</select>' +
      '<input type="file" id="lv-f-docfile" accept=".pdf,.jpg,.jpeg,.png" multiple><button type="button" class="btn small secondary" id="lv-f-docadd">Add</button></div>' +
      '<div class="muted" style="margin-top:4px;">PDF, JPG or PNG, up to ' + esc(ctx.settings.max_attachment_mb || 5) + ' MB each.</div></div>';
  renderDocs();
  renderPreview();
  applyPaymentRules();
  wireEdit();
  renderEditFooter();
}

function typeHint(t) {
  if (!t) return 'Choose a leave type to see its rules.';
  const bits = [];
  if (t.requires_credit) bits.push('Paid ' + t.name + ' uses leave credits.'); else bits.push('This leave type does not use credits.');
  if (!t.is_paid_available) bits.push('Can only be filed as unpaid.');
  if (t.attachment_required_min_days !== null && t.attachment_required_min_days !== undefined) bits.push('A supporting document is required for ' + num(t.attachment_required_min_days) + ' day(s) or more.');
  return esc(bits.join(' '));
}

function applyPaymentRules() {
  const t = typeOf();
  const sel = $('lv-f-payment');
  if (!sel) return;
  const paidOpt = sel.querySelector('option[value="Paid"]');
  if (t && !t.is_paid_available) {
    if (paidOpt) paidOpt.disabled = true;
    if (st.paymentType === 'Paid') { st.paymentType = 'Unpaid'; sel.value = 'Unpaid'; }
  } else if (paidOpt) paidOpt.disabled = false;
}

function wireEdit() {
  const on = (id, evt, fn) => { const el = $(id); if (el) el.addEventListener(evt, fn); };
  const touch = () => { st.dirty = true; };
  on('lv-f-employee', 'change', (e) => { touch(); st.employeeId = e.target.value; $('lv-emp-info').innerHTML = empInfoHtml(); schedulePreview(0); });
  on('lv-f-type', 'change', (e) => { touch(); st.leaveTypeId = e.target.value; $('lv-type-hint').innerHTML = typeHint(typeOf()); applyPaymentRules(); schedulePreview(0); });
  on('lv-f-payment', 'change', (e) => { touch(); st.paymentType = e.target.value; schedulePreview(0); });
  on('lv-f-duration', 'change', (e) => {
    touch(); st.durationType = e.target.value;
    const single = st.durationType !== 'Full Day';
    const end = $('lv-f-end');
    end.disabled = single;
    if (single) { st.endDate = st.startDate; end.value = st.endDate; }
    document.querySelectorAll('.lv-time').forEach((el) => { el.hidden = st.durationType !== 'Custom Hours'; });
    schedulePreview(0);
  });
  on('lv-f-start', 'change', (e) => {
    touch(); st.startDate = e.target.value;
    if (st.durationType !== 'Full Day' || !st.endDate || st.endDate < st.startDate) { st.endDate = st.startDate; $('lv-f-end').value = st.endDate; }
    schedulePreview(0);
  });
  on('lv-f-end', 'change', (e) => { touch(); st.endDate = e.target.value; schedulePreview(0); });
  on('lv-f-stime', 'change', (e) => { touch(); st.startTime = e.target.value; schedulePreview(0); });
  on('lv-f-etime', 'change', (e) => { touch(); st.endTime = e.target.value; schedulePreview(0); });
  on('lv-f-reason', 'input', (e) => { touch(); st.reason = e.target.value; });
  on('lv-f-cname', 'input', (e) => { touch(); st.contactName = e.target.value; });
  on('lv-f-cnum', 'input', (e) => { touch(); st.contactNumber = e.target.value; });
  on('lv-f-notes', 'input', (e) => { touch(); st.notes = e.target.value; });
  on('lv-f-docadd', 'click', () => {
    const input = $('lv-f-docfile');
    const kind = $('lv-f-dockind').value;
    const files = Array.from(input.files || []);
    if (!files.length) { formMsg('Choose a file first.', true); return; }
    for (const f of files) {
      const problem = fileProblem(ctx, f);
      if (problem) { formMsg(f.name + ': ' + problem, true); return; }
    }
    files.forEach((f) => st.staged.push({ file: f, kind }));
    input.value = '';
    touch();
    formMsg('', false);
    renderDocs();
    schedulePreview(0);
  });
}

function renderDocs() {
  const box = $('lv-f-docs');
  if (!box) return;
  const rows = [];
  st.existing.forEach((a) => rows.push('<div class="lv-doc"><div><b>' + esc(a.file_name) + '</b><div class="muted">' + esc(a.kind) + ' · ' + esc(fmtBytes(a.file_size)) + ' · uploaded</div></div>' +
    '<div class="lv-doc-actions"><button type="button" class="btn small secondary" data-rm-existing="' + a.id + '">Remove</button></div></div>'));
  st.staged.forEach((s, i) => rows.push('<div class="lv-doc"><div><b>' + esc(s.file.name) + '</b><div class="muted">' + esc(s.kind) + ' · ' + esc(fmtBytes(s.file.size)) + ' · uploads when you submit</div></div>' +
    '<div class="lv-doc-actions"><button type="button" class="btn small secondary" data-rm-staged="' + i + '">Remove</button></div></div>'));
  box.innerHTML = rows.length ? rows.join('') : '<p class="muted">No documents added.</p>';
  box.querySelectorAll('[data-rm-staged]').forEach((b) => b.addEventListener('click', () => { st.staged.splice(Number(b.dataset.rmStaged), 1); renderDocs(); schedulePreview(0); }));
  box.querySelectorAll('[data-rm-existing]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      await ctx.api.deleteAttachment(Number(b.dataset.rmExisting));
      st.existing = st.existing.filter((a) => a.id !== Number(b.dataset.rmExisting));
      renderDocs(); schedulePreview(0);
    } catch (err) { formMsg(err.message || String(err), true); b.disabled = false; }
  }));
}

function formMsg(text, isError) {
  const el = $('lv-form-msg');
  if (!el) return;
  el.innerHTML = text ? '<div class="msg ' + (isError ? 'error' : 'ok') + '">' + esc(text) + '</div>' : '';
  if (text) $('lv-form-body').scrollTop = 0;
}

function formReady() {
  return st.leaveTypeId && st.paymentType && st.startDate && st.endDate &&
    (st.durationType !== 'Custom Hours' || (st.startTime && st.endTime));
}

function paramsFor(extra) {
  return Object.assign({
    leaveTypeId: Number(st.leaveTypeId), paymentType: st.paymentType, startDate: st.startDate, endDate: st.endDate || st.startDate,
    durationType: st.durationType, startTime: st.durationType === 'Custom Hours' ? st.startTime : null,
    endTime: st.durationType === 'Custom Hours' ? st.endTime : null,
    employeeId: filingForOther() ? st.employeeId : null,
  }, extra || {});
}

// ---------- live preview ----------
function schedulePreview(delay) {
  clearTimeout(previewTimer);
  st.preview = null;
  renderPreview(true);
  previewTimer = setTimeout(runPreview, delay === undefined ? 300 : delay);
}

async function runPreview() {
  if (!st || st.view !== 'edit' || !formReady()) { if (st) { st.preview = null; renderPreview(false); } return; }
  const seq = ++previewSeq;
  try {
    const p = await ctx.api.previewRequest(paramsFor({
      excludeRequest: st.requestId, attachmentCount: st.existing.length + st.staged.length,
    }));
    if (seq !== previewSeq || !st) return;
    st.preview = p;
    st.previewError = null;
  } catch (err) {
    if (seq !== previewSeq || !st) return;
    st.preview = null;
    st.previewError = err.message || String(err);
  }
  renderPreview(false);
}

function renderPreview(loading) {
  const box = $('lv-preview');
  if (!box) return;
  const t = typeOf();
  const p = st.preview;
  const label = t ? t.name : 'leave';
  if (!formReady()) {
    const avail = t ? balanceFor(st.employeeId, t.id) : null;
    box.innerHTML = '<div class="lv-preview"><p class="muted" style="margin:0;">Choose a leave type and dates to see how many days this will use.</p>' +
      (t && t.requires_credit ? '<div class="lv-pv-row"><span>Available ' + esc(label) + ' credits</span><b>' + esc(daysText(avail)) + '</b></div>' : '') + '</div>';
    return;
  }
  if (loading && !p) { box.innerHTML = '<div class="lv-preview"><p class="muted" style="margin:0;">Calculating…</p></div>'; return; }
  if (st.previewError) { box.innerHTML = '<div class="msg error">' + esc(st.previewError) + '</div>'; return; }
  if (!p) { box.innerHTML = ''; return; }
  const usesCredit = t && t.requires_credit && st.paymentType === 'Paid';
  let h = '<div class="lv-preview"><div class="lv-pv-row"><span>Leave days</span><b>' + esc(daysText(p.days)) + (p.hours ? ' <span class="muted">(' + esc(num(p.hours)) + ' hrs)</span>' : '') + '</b></div>';
  if (usesCredit) {
    h += '<div class="lv-pv-row"><span>Available ' + esc(label) + ' credits</span><b>' + esc(daysText(p.available)) + '</b></div>' +
      '<div class="lv-pv-row"><span>Remaining after approval</span><b class="' + (Number(p.remaining_after) < 0 ? 'lv-neg' : '') + '">' + esc(daysText(p.remaining_after)) + '</b></div>';
  } else {
    h += '<div class="lv-pv-row"><span>Leave credits</span><b>' + (st.paymentType === 'Unpaid' ? 'Not used (unpaid)' : 'Not used for this type') + '</b></div>';
  }
  h += '</div>';
  (p.errors || []).forEach((e) => { h += '<div class="msg error" style="margin-top:8px;">' + esc(e) + '</div>'; });
  (p.warnings || []).forEach((w) => { h += '<div class="msg lv-warn" style="margin-top:8px;">' + esc(w) + '</div>'; });
  if ((p.errors || []).some((e) => /enough available leave credits/i.test(e)) && t && st.paymentType === 'Paid') {
    h += '<div style="margin-top:8px;"><button type="button" class="btn small secondary" id="lv-switch-unpaid">Switch to Unpaid Leave</button> <span class="muted">No credits are used for unpaid leave.</span></div>';
  }
  const bd = Array.isArray(p.breakdown) ? p.breakdown : [];
  if (bd.length) {
    h += '<details class="exp" style="margin-top:8px;"><summary><span class="exp-arrow" aria-hidden="true">▸</span>How the days are counted</summary><div class="exp-body"><table class="lv-mini"><tbody>' +
      bd.map((d) => '<tr class="' + (Number(d.counted) > 0 ? '' : 'lv-skip') + '"><td>' + esc(fmtDate(d.date)) + '</td><td>' + esc(d.reason) + '</td><td style="text-align:right;">' + esc(num(d.counted)) + '</td></tr>').join('') +
      '</tbody></table></div></details>';
  }
  box.innerHTML = h;
  const sw = $('lv-switch-unpaid');
  if (sw) sw.addEventListener('click', () => { st.paymentType = 'Unpaid'; $('lv-f-payment').value = 'Unpaid'; st.dirty = true; schedulePreview(0); });
}

// ---------- footers ----------
function renderEditFooter() {
  const f = $('lv-form-footer');
  const status = st.status;
  const draftish = isNew() || status === 'Draft';
  const primary = draftish ? 'Review & Submit' : status === 'Needs Employee Information' ? 'Review & Resubmit' : 'Review & Save Changes';
  f.innerHTML = '<button type="button" class="btn" id="lv-f-review">' + primary + '</button>' +
    (draftish ? '<button type="button" class="btn secondary" id="lv-f-draft">Save Draft</button>' : '') +
    '<button type="button" class="btn secondary" id="lv-f-cancel">Cancel</button>';
  $('lv-f-review').addEventListener('click', onReview);
  if (draftish) $('lv-f-draft').addEventListener('click', onSaveDraft);
  $('lv-f-cancel').addEventListener('click', onCancelForm);
}

function onCancelForm() {
  if (!st.dirty && !st.staged.length) { closeForm(); return; }
  const slot = $('lv-form-msg');
  slot.innerHTML = '<div class="lv-action-panel lv-danger"><h4>Discard this form?</h4><p>Your unsaved changes will be lost.' + (isNew() ? ' Use Save Draft to keep them.' : '') + '</p>' +
    '<div class="lv-action-buttons"><button type="button" class="btn lv-btn-danger" id="lv-discard">Discard</button><button type="button" class="btn secondary" id="lv-keep">Keep Editing</button></div></div>';
  $('lv-form-body').scrollTop = 0;
  $('lv-discard').addEventListener('click', closeForm);
  $('lv-keep').addEventListener('click', () => { slot.innerHTML = ''; });
}

function setBusy(on, label) {
  st.busy = on;
  $('lv-form-footer').querySelectorAll('button').forEach((b) => { b.disabled = on; });
  if (label && on) { const first = $('lv-form-footer').querySelector('button.btn'); if (first) first.textContent = label; }
}

async function onSaveDraft() {
  if (!st.leaveTypeId || !st.startDate) { formMsg('Choose at least a leave type and a start date to save a draft.', true); return; }
  setBusy(true, 'Saving…');
  try {
    const res = await ctx.api.saveRequest(paramsFor(draftFields({ requestId: st.requestId, submit: false })));
    if (!res || res.ok === false) { formMsg(errorsText(res), true); setBusy(false); renderEditFooter(); return; }
    st.requestId = res.id;
    await uploadStaged(res.id);
    ctx.toast('Draft saved.', false);
    closeForm();
    await ctx.refresh();
  } catch (err) {
    formMsg(err.message || String(err), true); setBusy(false); renderEditFooter();
  }
}

const draftFields = (extra) => Object.assign({
  reason: st.reason, contactName: st.contactName, contactNumber: st.contactNumber, notes: st.notes,
}, extra);

/** Uploads staged files one by one, dropping each from the staging list once it is on the
 * server -- so a retry after a failure never uploads the same file twice. */
async function uploadStaged(requestId) {
  while (st.staged.length) {
    const s = st.staged[0];
    const res = await ctx.api.uploadAttachment(requestId, s.file, s.kind);
    if (res && res.ok === false) throw new Error(s.file.name + ': ' + errorsText(res));
    st.staged.shift();
  }
  st.existing = await ctx.api.listAttachments(requestId);
}

// ---------- review & submit (spec section 32) ----------
async function onReview() {
  clearTimeout(previewTimer);
  formMsg('', false);
  const missing = [];
  if (!st.leaveTypeId) missing.push('leave type');
  if (!st.startDate || !st.endDate) missing.push('start and end dates');
  if (st.durationType === 'Custom Hours' && (!st.startTime || !st.endTime)) missing.push('start and end times');
  if (!st.reason.trim()) missing.push('reason');
  if (missing.length) { formMsg('Please fill in: ' + missing.join(', ') + '.', true); return; }
  setBusy(true, 'Checking…');
  let p;
  try {
    p = await ctx.api.previewRequest(paramsFor({ excludeRequest: st.requestId, attachmentCount: st.existing.length + st.staged.length }));
  } catch (err) { formMsg(err.message || String(err), true); setBusy(false); renderEditFooter(); return; }
  st.preview = p;
  setBusy(false);
  if (p.errors && p.errors.length) {
    renderPreview(false);
    formMsg(p.errors.join(' '), true);
    renderEditFooter();
    return;
  }
  renderReview();
}

function renderReview() {
  st.view = 'review';
  const t = typeOf(), p = st.preview, e = empOf();
  const usesCredit = t && t.requires_credit && st.paymentType === 'Paid';
  const docs = st.existing.length + st.staged.length;
  const route = routeText();
  let h = '<div id="lv-form-msg"></div><p style="margin-top:0;">Please check everything below before you submit.</p>' +
    '<div class="drawer-section"><h4>Review your request</h4>' +
    kv('Employee', esc(e.full_name || '—')) + kv('Leave Type', esc(t ? t.name : '—')) + kv('Payment', esc(st.paymentType) + ' leave') +
    kv('Dates', esc(rangeText(st.startDate, st.endDate))) +
    kv('Duration', esc(st.durationType) + (st.durationType === 'Custom Hours' ? ' (' + esc(st.startTime) + ' – ' + esc(st.endTime) + ')' : '')) +
    kv('Leave Days', esc(daysText(p.days))) +
    (usesCredit ? kv('Available Credits', esc(daysText(p.available))) + kv('Remaining After Approval', esc(daysText(p.remaining_after))) : kv('Leave Credits', 'Not used')) +
    kv('Reason', esc(st.reason)) +
    (st.contactName || st.contactNumber ? kv('Emergency Contact', esc([st.contactName, st.contactNumber].filter(Boolean).join(' · '))) : '') +
    (st.notes ? kv('Notes', esc(st.notes)) : '') +
    kv('Attachments', docs ? esc(docs + ' file' + (docs === 1 ? '' : 's')) : 'None') + '</div>';
  (p.warnings || []).forEach((w) => { h += '<div class="msg lv-warn">' + esc(w) + '</div>'; });
  h += '<div class="msg" style="background:#eef3fb;color:#1a3a6b;">' + esc(route) + '</div>' +
    '<label class="lv-confirm"><input type="checkbox" id="lv-f-confirm"> I confirm that the information I provided is correct.</label>';
  $('lv-form-body').innerHTML = h;
  $('lv-form-body').scrollTop = 0;
  const submitLabel = isNew() || st.status === 'Draft' ? 'Submit Leave Request' : st.status === 'Needs Employee Information' ? 'Resubmit Leave Request' : 'Save Changes';
  $('lv-form-footer').innerHTML = '<button type="button" class="btn" id="lv-f-submit" disabled>' + submitLabel + '</button><button type="button" class="btn secondary" id="lv-f-back">Back to Edit</button>';
  $('lv-f-confirm').addEventListener('change', (ev) => { $('lv-f-submit').disabled = !ev.target.checked; });
  $('lv-f-back').addEventListener('click', () => { renderEdit(); schedulePreview(0); });
  $('lv-f-submit').addEventListener('click', onSubmit);
}

/** What will happen next, in plain words -- mirrors the routing rules in leave_save_request. */
function routeText() {
  const targetIsFinal = filingForOther() ? false : ctx.flags.final;
  const targetIsHr = filingForOther() ? false : ctx.flags.hr;
  if (!isNew() && (st.status === 'Submitted' || st.status === 'Pending HR Review')) return 'This updates your request while it is still waiting for HR. HR will be told it changed.';
  if (!isNew() && st.status === 'Needs Employee Information') return 'This sends your updated request back to the person who asked for more information.';
  if (targetIsFinal) return 'Your own leave does not need anyone above you, so it will be approved automatically — and logged.';
  if (targetIsHr) return 'Because this is HR\'s own leave, it skips HR review and goes straight to the Final Approver.';
  return 'It goes to HR for review first, then to the Final Approver for the final decision. No leave credits are deducted until it is approved.';
}

async function onSubmit() {
  setBusy(true, 'Submitting…');
  try {
    let id = st.requestId;
    // A brand-new request needs an id before documents can be attached to it.
    if (!id) {
      const d = await ctx.api.saveRequest(paramsFor(draftFields({ requestId: null, submit: false })));
      if (!d || d.ok === false) throw new Error(errorsText(d));
      id = d.id; st.requestId = id;
    }
    await uploadStaged(id);
    const res = await ctx.api.saveRequest(paramsFor(draftFields({ requestId: id, submit: true })));
    if (!res || res.ok === false) {
      // Submission was refused (e.g. credits changed meanwhile); the draft is safe -- go back and show why.
      renderEdit(); formMsg(errorsText(res), true); schedulePreview(0);
      return;
    }
    await ctx.refresh();
    renderSuccess(res);
  } catch (err) {
    renderEdit(); formMsg(err.message || String(err), true); schedulePreview(0);
  }
}

// ---------- success screen (spec section 33) ----------
function renderSuccess(res) {
  st.view = 'success';
  const wasEdit = st.status && st.status !== 'Draft';
  const other = filingForOther() ? empOf() : null;
  const subject = other ? 'The leave request for ' + other.full_name : 'Your leave request';
  const msg = {
    'Pending HR Review': subject + ' has been submitted and is now waiting for HR review.',
    'Pending Final Approval': subject + ' has been submitted and is now waiting for the Final Approver\'s decision.',
    'Approved': subject + ' has been approved automatically and recorded in the log.',
  }[res.status] || subject + ' has been saved.';
  const follow = res.status === 'Approved' ? 'Nothing more is needed — it is on the leave record.' : other
    ? (other.has_login === false ? other.full_name + ' has no login, so let them know the outcome yourself.' : other.full_name + ' will be notified here in the system when it is reviewed.')
    : 'You will be notified here in the system when it is reviewed.';
  $('lv-form-title').textContent = wasEdit ? 'Request Updated' : 'Request Submitted';
  $('lv-form-body').innerHTML = '<div class="lv-success"><div class="lv-success-icon" aria-hidden="true">✓</div>' +
    '<h3>' + (wasEdit ? 'Your changes were saved' : 'Leave request submitted') + '</h3>' +
    '<div class="lv-success-num">' + esc(res.number || '') + '</div><div style="margin:6px 0 12px;">' + statusBadge(res.status) + '</div>' +
    '<p>' + esc(msg) + '</p>' +
    ((res.warnings || []).length ? res.warnings.map((w) => '<div class="msg lv-warn" style="text-align:left;">' + esc(w) + '</div>').join('') : '') +
    '<p class="muted">' + esc(follow) + '</p></div>';
  $('lv-form-footer').innerHTML = '<button type="button" class="btn" id="lv-s-view">View Request</button>' +
    '<button type="button" class="btn secondary" id="lv-s-mine">View My Leave</button>' +
    '<button type="button" class="btn secondary" id="lv-s-dash">Back to Dashboard</button>';
  const id = res.id;
  $('lv-s-view').addEventListener('click', () => { closeForm(); ctx.openDetail(id); });
  $('lv-s-mine').addEventListener('click', () => { closeForm(); ctx.showMine({ scrollToList: true }); });
  $('lv-s-dash').addEventListener('click', () => { window.location.href = 'dashboard.html'; });
}
