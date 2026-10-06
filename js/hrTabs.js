// HR 201 File -- the profile tabs that show employee data: Overview, Personal, Employment, Compensation, Government IDs, Emergency Contact.
// Each renderer draws the tab in VIEW mode, or as a form when the person is editing and may change those fields.
// Nothing here saves anything: edits go into ps.values and are saved through the review dialog (hrEdit.js).
import {
  esc, $, badge, chip, viewField, inputHtml, bindEdit, spinner, emptyBox, lockIcon, eyeIcon, friendly, toast, confirmDialog, reasonDialog, openModal,
} from './hrUi.js?v=20261007d';
import {
  FIELD_DEFS, GOV_FIELDS, money, fmtDate, fmtDateTime, statusLabel, statusTone, spanText, ageText, blank, historyText, plural, DOC_CATEGORIES,
} from './hrLogic.js?v=20261007d';

/** May this person change this field right now? (The database decides again when saving.) */
export function canEditField(ctx, field) {
  const d = FIELD_DEFS[field];
  if (d.adminOnly) return !!ctx.access.is_admin;
  return !!ctx.access.keys[d.key];
}
const isLoaded = (ps, field) => {
  const t = FIELD_DEFS[field].tab;
  if (t === 'compensation') return !!ps.comp;
  if (field === 'notes') return !!ps.notes;
  return true;
};
export function rebuildOriginal(ps) {
  const o = {}, e = ps.data.employee, f = ps.data.file;
  for (const field of Object.keys(FIELD_DEFS)) {
    const d = FIELD_DEFS[field];
    if (d.type === 'gov' || d.tab === 'compensation' || field === 'notes') continue;
    o[field] = d.store === 'emp' ? e[field] : f[field];
  }
  if (ps.comp) for (const k of ['basic_salary', 'payroll_details', 'payment_mode', 'tax_status_code', 'minimum_wage_earner']) o[k] = ps.comp[k];
  if (ps.notes) o.notes = ps.notes.legacy_note;
  ps.original = o;
}

const val = (ps, field) => (field in ps.values ? ps.values[field] : ps.original[field]);
function shown(ctx, ps, field) {
  const d = FIELD_DEFS[field], v = ps.original[field];
  if (blank(v)) return '';
  if (d.type === 'date') return esc(fmtDate(v));
  if (field === 'employment_status') return esc(statusLabel(v)) + ' <span class="muted">(' + esc(v) + ')</span>';
  if (field === 'branch_id') return esc((ctx.branchById[v] || {}).name || v);
  if (d.type === 'number') return esc(money(v));
  return esc(v);
}
/** a grid of fields: inputs when editing (and allowed), plain values otherwise */
function fieldGrid(ctx, ps, fields, extra = {}) {
  const editing = ps.editing;
  const inputs = [], parts = [];
  for (const f of fields) {
    const d = FIELD_DEFS[f];
    if (editing && canEditField(ctx, f) && isLoaded(ps, f)) {
      parts.push(inputHtml(f, val(ps, f), { branches: ctx.branches, positions: ctx.positions, department: val(ps, 'department') }));
      inputs.push(f);
    } else {
      const locked = editing && d.adminOnly && !ctx.access.is_admin;
      parts.push(viewField(d.label, shown(ctx, ps, f), { wide: d.type === 'textarea', locked }) + (locked ? '' : ''));
    }
  }
  return { html: '<div class="' + (inputs.length ? 'hr-ef-grid' : 'hr-fields') + '">' + parts.join('') + '</div>', editable: inputs.length > 0 };
}
function afterDraw(ctx, ps, panel, onChange) {
  if (!ps.editing) return;
  bindEdit(panel, ps, (f) => { ctx.markDirty(); if (onChange) onChange(f); });
  // reflect edits already made (when the tab is redrawn)
  Object.keys(ps.values).forEach((f) => {
    const el = panel.querySelector('[data-field="' + f + '"]');
    if (el && FIELD_DEFS[f].type !== 'gov') { el.dispatchEvent(new Event('input')); }
  });
}
const lockedNote = (text) => '<p class="hr-locked">' + lockIcon + ' ' + text + '</p>';

// ================================================================= Overview
export function renderOverview(ctx, ps, panel) {
  const d = ps.data, e = d.employee, f = d.file, row = d.directory_row || {}, k = ctx.access.keys;
  const sep = ['RES', 'TER', 'AWOL', 'DECEASED'].includes(f.employment_status);
  const docsOn = row.docs_required !== null && row.docs_required !== undefined && k['hr.view_documents'];
  const idsOn = d.government_ids ? GOV_FIELDS.filter((g) => d.government_ids[g.on]).length : null;
  const card = (title, big, small, opts = {}) => '<div class="hr-card' + (opts.tone ? ' hr-tone-' + opts.tone : '') + '"><h5>' + esc(title) + '</h5><span class="big">' + big + '</span>' +
    (small ? '<span class="small">' + small + '</span>' : '') + (opts.go ? '<button type="button" class="btn small secondary go" data-tab-go="' + opts.go + '">' + esc(opts.goLabel || 'Open') + '</button>' : '') + '</div>';
  const missing = row.profile_missing || [];
  const cards = [
    card('Employment', esc(statusLabel(f.employment_status)), (e.hire_date ? 'Hired ' + esc(fmtDate(e.hire_date)) + ' · ' + esc(spanText(e.hire_date, sep ? f.end_of_employment_date : null)) + (sep ? ' with the company' : '') : 'No hire date on file') +
      (f.end_of_employment_date ? '<br>Ended ' + esc(fmtDate(f.end_of_employment_date)) : ''), { tone: sep ? 'bad' : '', go: 'employment' }),
    card('Position', esc(f.job_title || '—'), esc([f.department, f.company, ps.data.employee.branch_name].filter(Boolean).join(' · ')) || 'Not set', { go: 'employment' }),
    card('Profile completeness', esc(row.profile_pct === undefined ? '—' : row.profile_pct + '%'), missing.length ? 'Missing: ' + esc(missing.join(', ')) : 'Everything needed is filled in', { tone: Number(row.profile_pct) >= 100 ? 'ok' : (Number(row.profile_pct) < 70 ? 'warn' : '') }),
    ...(docsOn ? [card('Documents', esc(row.docs_required ? row.docs_ok + ' of ' + row.docs_required : 'No checklist'),
      (row.docs_required ? 'required documents are current' : 'No document is marked as required') + (Number(row.docs_missing) > 0 ? '<br>' + esc(plural(row.docs_missing, 'required document')) + ' missing' : '') +
      (Number(row.docs_expired) > 0 ? '<br>' + esc(plural(row.docs_expired, 'document')) + ' expired' : '') + (Number(row.docs_expiring) > 0 ? '<br>' + esc(plural(row.docs_expiring, 'document')) + ' expiring soon' : ''),
      { tone: Number(row.docs_expired) > 0 ? 'bad' : (Number(row.docs_missing) > 0 || Number(row.docs_expiring) > 0 ? 'warn' : (row.docs_required ? 'ok' : '')), go: 'documents' })] : []),
    ...(idsOn !== null ? [card('Government IDs', idsOn + ' of 4 on file', GOV_FIELDS.map((g) => esc(g.label.replace(' number', '')) + (d.government_ids[g.on] ? ' ✓' : ' —')).join(' · '), { go: 'government' })] : []),
    ...(d.compensation ? [card('Compensation', '<span class="hr-secret">Protected</span>', (d.compensation.salary_on_file ? 'Basic salary on file' : 'No basic salary on file') + ' · ' + esc(d.compensation.payment_mode || 'no payment mode'), { go: 'compensation', goLabel: 'Open (logged)' })] : []),
    card('Emergency contact', esc(f.emergency_contact_name || 'Missing'), f.emergency_contact_name ? esc([f.emergency_contact_relationship, f.emergency_contact_number].filter(Boolean).join(' · ')) : 'Add one so someone can be reached', { tone: f.emergency_contact_name ? '' : 'warn', go: 'emergency' }),
    card('System access', esc(e.role === 'None' ? 'Position-based' : e.role), 'System account ' + esc(e.status === 'Active' ? 'Active' : 'INACTIVE') + ' · ' + (d.flags.has_login ? 'has a sign-in' : 'no sign-in yet'), { tone: e.status !== 'Active' ? 'bad' : '', go: k['hr.view_access'] ? 'access' : '' }),
    card('Leave', 'Leave record', 'Credits, requests and history', { go: 'leave' }),
  ];
  const alerts = [];
  if (f.archived_at) alerts.push('<div class="hr-notice warn"><b>Archived</b> ' + esc(fmtDate(String(f.archived_at).slice(0, 10))) + (f.archived_by_name ? ' by ' + esc(f.archived_by_name) : '') + (f.archive_reason ? ' — ' + esc(f.archive_reason) : '') + '. The record is kept; sign-in access is not changed by archiving.</div>');
  if (sep && e.status === 'Active') alerts.push('<div class="hr-notice bad"><b>No longer employed, but the system account is still Active.</b> Review this person\'s access' + (k['hr.view_access'] ? ' in the Access &amp; Permissions tab' : '') + '.</div>');
  if (!d.file_exists) alerts.push('<div class="hr-notice">This person has no 201 file yet. It is created the first time you save changes.</div>');
  if (d.flags.position_differs_from_job_title && k['hr.view_access']) alerts.push('<div class="hr-notice warn">The system position (<b>' + esc(e.position || 'none') + '</b>) differs from the 201 job title (<b>' + esc(f.job_title || 'none') + '</b>). Nothing was changed automatically — see the Access &amp; Permissions tab.</div>');
  panel.innerHTML = alerts.join('') + '<div class="hr-grid">' + cards.join('') + '</div>';
  panel.querySelectorAll('[data-tab-go]').forEach((b) => b.addEventListener('click', () => ctx.showTab(b.dataset.tabGo)));
}

// ================================================================= Personal Information
export function renderPersonal(ctx, ps, panel) {
  const g = fieldGrid(ctx, ps, ['full_name', 'first_name', 'middle_name', 'last_name', 'suffix', 'gender', 'civil_status', 'birthdate', 'contact_number', 'educational_attainment', 'address']);
  const age = ageText(ps.data.file.birthdate, ctx.today);
  panel.innerHTML = '<h3>Personal information</h3>' + g.html + (age && !ps.editing ? '<p class="muted" style="margin-top:10px;">' + esc(age) + '</p>' : '');
  afterDraw(ctx, ps, panel);
}

// ================================================================= Employment
export function renderEmployment(ctx, ps, panel) {
  const e = ps.data.employee, f = ps.data.file;
  const g = fieldGrid(ctx, ps, ['company', 'department', 'job_title', 'employment_status', 'hire_date', 'end_of_employment_date', 'store_category', 'branch_id', 'role', 'status']);
  const locked = '<div class="hr-fields" style="margin-bottom:14px;">' +
    viewField('Employee ID', '<b>' + esc(e.employee_code || '—') + '</b>', { locked: true }) +
    viewField('System position', esc(e.position || ''), { locked: true }) +
    (ps.editing ? '' : viewField('Time with the company', esc(e.hire_date ? spanText(e.hire_date, f.end_of_employment_date || null) : '')) ) + '</div>' +
    lockedNote('The Employee ID is also this person\'s sign-in ID, so it is never changed from this page. The system position follows the job title automatically.');
  const adminOnly = ps.editing && !ctx.access.is_admin ? lockedNote('Role, branch and system account status can only be changed by an Admin.') : '';
  panel.innerHTML = '<h3>Employment</h3>' + (ps.editing ? '<p class="hr-notice">Changing the job title, department, company, role, branch or account status asks you to review what it does to this person\'s access before anything is saved.</p>' : '') +
    locked + g.html + adminOnly +
    '<h4>Company assets</h4><div id="hr-assets-host" class="hr-card" style="background:#fff;">' + spinner('Loading company assets…') + '</div>';
  afterDraw(ctx, ps, panel, (field) => {
    if (field === 'department') {
      const dl = $('hr-dl-job_title'); if (!dl) return;
      import('./hrLogic.js?v=20261007d').then((L) => { dl.innerHTML = [...new Set((ctx.positions || []).concat(L.JOB_TITLES_BY_DEPT[val(ps, 'department')] || []))].map((t) => '<option value="' + esc(t) + '">').join(''); });
    }
  });
  import('./hrAssets.js?v=20261007d').then((m) => m.mountAssetsProfile($('hr-assets-host'), ps.id)).catch((err) => {
    const h = $('hr-assets-host'); if (h) h.innerHTML = '<p class="muted">Company assets could not be loaded (' + esc(friendly(err)) + ').</p>';
  });
}

// ================================================================= Compensation & Payroll (protected: opening it is logged)
export async function renderCompensation(ctx, ps, panel) {
  if (!ps.comp) {
    panel.innerHTML = '<h3>Compensation &amp; Payroll</h3>' + spinner('Opening compensation…');
    try { ps.comp = await ctx.api.getCompensation(ps.id); rebuildOriginal(ps); }
    catch (err) { panel.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; return; }
    if (ctx.ps !== ps || ctx.ps.tab !== 'compensation') return;
  }
  const c = ps.comp;
  const g = fieldGrid(ctx, ps, ['basic_salary', 'payment_mode', 'tax_status_code', 'minimum_wage_earner', 'payroll_details']);
  panel.innerHTML = '<h3>Compensation &amp; Payroll</h3><p class="hr-notice">' + lockIcon + ' Protected. Only people with the Compensation permission can see this, and opening it is recorded in the audit log.</p>' +
    (ps.editing && g.editable ? '<p class="hr-notice">A change to the basic salary needs a reason and is kept in the salary history.</p>' : '') + g.html +
    '<h4>Salary history</h4>' + ((c.salary_history || []).length
      ? '<ul class="hr-timeline">' + c.salary_history.map((h) => '<li><span class="hr-tl-date">' + esc(fmtDate(h.effective_date)) + '</span><span class="hr-tl-body"><b>' + esc(blank(h.old_value) ? 'Starting salary ' + money(h.new_value) : money(h.old_value) + ' → ' + money(h.new_value)) + '</b>' +
        '<span class="muted">' + esc(h.changed_by_name || '') + (h.reason ? ' — ' + esc(h.reason) : '') + '</span></span></li>').join('') + '</ul>'
      : '<p class="muted">No salary has been recorded yet.</p>');
  afterDraw(ctx, ps, panel);
}

// ================================================================= Government & Statutory IDs (masked; showing a full number is logged)
export function renderGovernment(ctx, ps, panel) {
  const gv = ps.data.government_ids || {}, k = ctx.access.keys, can = k['hr.reveal_government_ids'];
  const editing = ps.editing && k['hr.edit_government_ids'];
  panel.innerHTML = '<h3>Government &amp; statutory IDs</h3><p class="hr-notice">' + lockIcon + ' Numbers are masked. ' +
    (can ? 'Use <b>Show full number</b> when you really need it — each time is recorded in the audit log.' : 'You can see which numbers are on file but not the full numbers.') + '</p>' +
    '<div class="hr-id-list">' + GOV_FIELDS.map((g) => {
      const on = gv[g.on];
      if (editing) {
        return '<div class="hr-id" style="display:block;">' + inputHtml(g.key, ps.values[g.key] === undefined ? '' : ps.values[g.key], { placeholder: on ? 'Type the new number to replace ' + (gv[g.key] || 'the one on file') : 'Type the number' }) +
          '<label style="font-size:12px;display:flex;gap:6px;align-items:center;margin-top:6px;"><input type="checkbox" data-clear="' + g.key + '"' + (ps.values[g.key] === null ? ' checked' : '') + '> Remove the number on file</label>' +
          '<span class="muted">' + (on ? 'On file: ' + esc(gv[g.key]) + '. Leave the box empty to keep it.' : 'Nothing on file yet.') + '</span></div>';
      }
      return '<div class="hr-id"><div><div class="hr-vf-l">' + esc(g.label) + '</div><div class="num" id="hr-id-' + g.key + '">' + (on ? esc(gv[g.key]) : '<span class="muted">Not on file</span>') + '</div></div>' +
        '<div>' + (on ? badge('On file', 'ok') : badge('Missing', 'pending')) + (on && can ? ' <button type="button" class="btn small secondary" data-reveal="' + g.key + '">' + eyeIcon + ' Show full number</button>' : '') + '</div></div>';
    }).join('') + '</div>';
  if (editing) {
    bindEdit(panel, ps, () => ctx.markDirty());
    panel.querySelectorAll('[data-clear]').forEach((cb) => cb.addEventListener('change', () => {
      const f = cb.dataset.clear, input = panel.querySelector('[data-field="' + f + '"]');
      if (cb.checked) { ps.values[f] = null; input.value = ''; input.disabled = true; } else { delete ps.values[f]; input.disabled = false; }
      ctx.markDirty();
    }));
    panel.querySelectorAll('[data-clear]').forEach((cb) => { if (cb.checked) panel.querySelector('[data-field="' + cb.dataset.clear + '"]').disabled = true; });
  }
  panel.querySelectorAll('[data-reveal]').forEach((b) => b.addEventListener('click', async () => {
    const field = b.dataset.reveal, label = (GOV_FIELDS.find((g) => g.key === field) || {}).label;
    const reason = await reasonDialog({ title: 'Show the full ' + label, message: 'This will be recorded in the audit log with your name. The number is hidden again after 30 seconds.', label: 'Why do you need it?', okLabel: 'Show number', required: false, placeholder: 'e.g. filing the SSS contribution' });
    if (reason === null) return;
    b.disabled = true;
    try {
      const r = await ctx.api.revealGovId(ps.id, field, reason);
      const out = $('hr-id-' + field); out.textContent = r.value || '—';
      b.hidden = true;
      setTimeout(() => { if ($('hr-id-' + field)) { $('hr-id-' + field).textContent = gv[field]; b.hidden = false; b.disabled = false; } }, 30000);
    } catch (err) { toast(err, true); b.disabled = false; }
  }));
}

// ================================================================= Emergency Contact
export function renderEmergency(ctx, ps, panel) {
  const f = ps.data.file;
  const g = fieldGrid(ctx, ps, ['emergency_contact_name', 'emergency_contact_relationship', 'emergency_contact_number']);
  const card = !ps.editing && f.emergency_contact_name
    ? '<div class="hr-card" style="max-width:420px;margin-bottom:14px;"><h5>Who to call</h5><span class="big">' + esc(f.emergency_contact_name) + '</span><span class="small">' + esc(f.emergency_contact_relationship || 'Relationship not recorded') + '</span>' +
      (f.emergency_contact_number ? '<a class="btn small secondary go" style="text-decoration:none;display:inline-block;" href="tel:' + esc(String(f.emergency_contact_number).replace(/[^0-9+]/g, '')) + '">Call ' + esc(f.emergency_contact_number) + '</a>' : '') + '</div>'
    : (!ps.editing ? '<p class="hr-notice warn">No emergency contact is on file for this employee.</p>' : '');
  panel.innerHTML = '<h3>Emergency contact</h3>' + card + g.html;
  afterDraw(ctx, ps, panel);
}
