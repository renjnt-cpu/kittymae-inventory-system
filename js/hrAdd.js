// HR 201 File -- the Add Employee wizard.  Basic info -> employment & access -> personal -> government IDs -> compensation -> emergency contact -> review.
// A step is skipped when the person has no permission for its fields.  It never creates a sign-in and never makes up an Employee ID.
// The final step checks for possible duplicates and shows the access the new person will receive; the database checks everything again.
import { esc, $, badge, spinner, toast, friendly, confirmDialog, inputHtml, busy } from './hrUi.js?v=20261008b';
import { FIELD_DEFS, ROLES, COMPANIES, money, fmtDate, statusLabel, blank, plural } from './hrLogic.js?v=20261008b';

const plain = (id, label, value, o = {}) => '<div class="field hr-ef"><label for="hr-w-' + id + '">' + esc(label) + (o.required ? ' *' : '') + '</label><input id="hr-w-' + id + '" data-w="' + id + '" type="' + (o.type || 'text') + '" value="' + esc(value || '') +
  '"' + (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') + ' autocomplete="off" maxlength="' + (o.max || 120) + '">' + (o.hint ? '<span class="hr-hint">' + o.hint + '</span>' : '') + '</div>';

function stepsFor(ctx) {
  const k = ctx.access.keys;
  const steps = [
    { id: 'basic', title: 'Basic information' },
    { id: 'employment', title: 'Employment & access' },
    { id: 'personal', title: 'Personal details' },
  ];
  if (k['hr.edit_government_ids']) steps.push({ id: 'government', title: 'Government IDs' });
  if (k['hr.edit_compensation']) steps.push({ id: 'compensation', title: 'Compensation' });
  steps.push({ id: 'emergency', title: 'Emergency contact' }, { id: 'review', title: 'Review & create' });
  return steps;
}

export function openAddWizard(ctx) {
  const host = ctx.addHost;
  const w = { step: 0, data: { role: 'None', employment_status: 'PB', company: 'Miss Kittymae' }, dupes: [], impact: null, ackImpact: false, ackDupes: false, steps: stepsFor(ctx), touched: false, error: '' };
  ctx.wizard = w;
  draw(ctx, host, w);
}

const latestCode = (ctx) => (ctx.rows || []).map((r) => r.employee_code).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })).slice(-1)[0] || '';

function field(ctx, w, f) {
  return inputHtml(f, w.data[f] || '', { branches: ctx.branches, positions: ctx.positions, department: w.data.department, noCrit: true });
}
function stepBody(ctx, w, step) {
  const d = w.data, admin = ctx.access.is_admin;
  switch (step.id) {
    case 'basic':
      return '<div class="hr-ef-grid">' + plain('employee_code', 'Employee ID', d.employee_code, { required: true, placeholder: 'e.g. MK26027', max: 30, hint: 'Typed by you — never generated. This is also the sign-in ID.' + (latestCode(ctx) ? ' Latest on file: <b>' + esc(latestCode(ctx)) + '</b>.' : '') }) +
        plain('full_name', 'Display name', d.full_name, { required: true, hint: 'How the system shows this person.' }) + plain('email', 'Email', d.email, { required: true, type: 'email', max: 120, hint: 'Used to match a Google sign-in. Does not create a login.' }) +
        field(ctx, w, 'first_name') .replace('<label for="hr-f-first_name">First name', '<label for="hr-f-first_name">First name *') + field(ctx, w, 'middle_name') + field(ctx, w, 'last_name').replace('<label for="hr-f-last_name">Last name', '<label for="hr-f-last_name">Last name *') + field(ctx, w, 'suffix') + field(ctx, w, 'contact_number') + '</div>';
    case 'employment': {
      const roles = admin ? ROLES : ROLES.filter((r) => ['None', 'Staff', 'Branch Supervisor'].includes(r));
      return '<div class="hr-ef-grid">' + field(ctx, w, 'company') + field(ctx, w, 'department') + field(ctx, w, 'job_title') + field(ctx, w, 'employment_status') + field(ctx, w, 'hire_date') + field(ctx, w, 'store_category') +
        field(ctx, w, 'branch_id') + '<div class="field hr-ef"><label for="hr-w-role">Role</label><select id="hr-w-role" data-w="role">' + roles.map((r) => '<option' + (r === d.role ? ' selected' : '') + '>' + esc(r) + '</option>').join('') + '</select>' +
        '<span class="hr-hint">' + (admin ? 'Most staff are “None”: their access comes from their job title.' : 'Only an Admin can add someone as Admin or Manager.') + '</span></div></div>' +
        '<p class="hr-notice" style="margin-top:12px;">The <b>job title</b> decides what this person can do in the system. The last step shows exactly which permissions they will receive before anything is created.</p>';
    }
    case 'personal': return '<div class="hr-ef-grid">' + ['gender', 'civil_status', 'birthdate', 'educational_attainment', 'address'].map((f) => field(ctx, w, f)).join('') + '</div>';
    case 'government': return '<p class="hr-notice">Optional. Numbers are stored protected; only people with the right permission can ever see them, and every full reveal is logged.</p><div class="hr-ef-grid">' + ['sss_number', 'philhealth_number', 'pagibig_number', 'tin_number'].map((f) => field(ctx, w, f)).join('') + '</div>';
    case 'compensation': return '<p class="hr-notice">Optional. Protected — only people with the Compensation permission can see it, and the first salary is saved as the starting point of the salary history.</p><div class="hr-ef-grid">' + ['basic_salary', 'payment_mode', 'tax_status_code', 'minimum_wage_earner', 'payroll_details'].map((f) => field(ctx, w, f)).join('') + '</div>';
    case 'emergency': return '<div class="hr-ef-grid">' + ['emergency_contact_name', 'emergency_contact_relationship', 'emergency_contact_number'].map((f) => field(ctx, w, f)).join('') + '</div>';
    default: return reviewBody(ctx, w);
  }
}
function reviewBody(ctx, w) {
  const d = w.data;
  const row = (label, v) => (blank(v) ? '' : '<dt>' + esc(label) + '</dt><dd>' + v + '</dd>');
  const shown = (f) => { const v = d[f]; if (blank(v)) return ''; const t = FIELD_DEFS[f].type; return t === 'gov' ? '••••' + esc(String(v).slice(-4)) : t === 'date' ? esc(fmtDate(v)) : t === 'number' ? esc(money(v)) : f === 'branch_id' ? esc((ctx.branchById[v] || {}).name || v) : f === 'employment_status' ? esc(statusLabel(v)) : f === 'payroll_details' ? '(entered)' : esc(v); };
  const im = w.impact;
  return '<div class="hr-review"><dl>' +
    row('Employee ID', esc(d.employee_code)) + row('Display name', esc(d.full_name)) + row('Email', esc(d.email)) +
    ['first_name', 'middle_name', 'last_name', 'suffix', 'contact_number', 'company', 'department', 'job_title', 'employment_status', 'hire_date', 'store_category', 'branch_id'].map((f) => row(FIELD_DEFS[f].label, shown(f))).join('') +
    row('Role', esc(d.role)) + ['gender', 'civil_status', 'birthdate', 'educational_attainment', 'address', 'sss_number', 'philhealth_number', 'pagibig_number', 'tin_number', 'basic_salary', 'payment_mode', 'tax_status_code', 'minimum_wage_earner', 'payroll_details',
      'emergency_contact_name', 'emergency_contact_relationship', 'emergency_contact_number'].map((f) => row(FIELD_DEFS[f].label, shown(f))).join('') + '</dl></div>' +
    '<h4>Possible duplicates</h4>' + (w.dupes.length ? '<div class="hr-notice warn">' + w.dupes.map((x) => '<div><b>' + esc(x.employee_code) + ' · ' + esc(x.full_name) + '</b> — ' + esc(x.reasons.join(', ')) + (x.blocks ? ' <b>(this Employee ID is already used — go back and change it)</b>' : '') + '</div>').join('') +
      (w.dupes.some((x) => !x.blocks) ? '<label style="display:flex;gap:8px;margin-top:8px;font-size:13px;"><input type="checkbox" id="hr-w-dup"' + (w.ackDupes ? ' checked' : '') + '> <span>I checked, this is a different person.</span></label>' : '') + '</div>' : '<p class="muted">No similar employee found.</p>') +
    '<h4>Access this person will receive</h4>' + (im ? '<p class="muted">' + esc(im.proposed.permission_count) + ' permission' + (im.proposed.permission_count === 1 ? '' : 's') + ' from the role “' + esc(im.proposed.role || 'none') + '” and the job title “' + esc(im.proposed.job_title || 'none') + '”.</p>' +
      (im.added.length ? '<details class="exp"><summary><span class="exp-arrow" aria-hidden="true">▸</span>Show the ' + im.added.length + ' permissions</summary><div class="exp-body"><ul style="font-size:12px;">' + im.added.map((p) => '<li>' + esc(p.label) + '</li>').join('') + '</ul></div></details>' : '') +
      (im.notes || []).filter((n) => !/^The job title decides|^The role changes/.test(n)).map((n) => '<p class="muted">' + esc(n) + '</p>').join('') +
      (im.added.length ? '<label style="display:flex;gap:8px;margin-top:8px;font-size:13px;"><input type="checkbox" id="hr-w-imp"' + (w.ackImpact ? ' checked' : '') + '> <span>I reviewed the access this person will receive.</span></label>' : '') : spinner('Checking the access…')) +
    '<p class="muted" style="margin-top:12px;">Creating the employee does not create a sign-in. After it is created, open the <b>Access &amp; Permissions</b> tab to set a password, and upload their documents in the <b>Documents</b> tab.</p>';
}

function draw(ctx, host, w) {
  const step = w.steps[w.step], last = w.step === w.steps.length - 1;
  host.innerHTML = '<button type="button" class="btn small secondary hr-back" id="hr-w-cancel">← Cancel and go back</button>' +
    '<div class="hr-panel"><h2 style="margin:0 0 10px;font-size:18px;">Add Employee</h2>' +
    '<ol class="hr-steps">' + w.steps.map((s, i) => '<li class="' + (i === w.step ? 'on' : i < w.step ? 'done' : '') + '"><b>' + (i + 1) + '</b>' + esc(s.title) + '</li>').join('') + '</ol>' +
    '<h3 style="margin:0 0 10px;">' + esc(step.title) + '</h3>' + (w.error ? '<div class="msg error">' + esc(w.error) + '</div>' : '') +
    '<div id="hr-w-body">' + stepBody(ctx, w, step) + '</div>' +
    '<div class="hr-wiz-foot"><button type="button" class="btn secondary" id="hr-w-back"' + (w.step === 0 ? ' disabled' : '') + '>Back</button><button type="button" class="btn" id="hr-w-next">' + (last ? 'Create employee' : 'Next') + '</button></div></div>';
  host.querySelectorAll('[data-field],[data-w]').forEach((el) => {
    const key = el.dataset.field || el.dataset.w;
    const upd = () => { w.data[key] = el.value; w.touched = true; };
    el.addEventListener('input', upd); el.addEventListener('change', upd);
  });
  const department = host.querySelector('[data-field="department"]');
  if (department) department.addEventListener('change', () => import('./hrLogic.js?v=20261008b').then((L) => { const dl = $('hr-dl-job_title'); if (dl) dl.innerHTML = [...new Set((ctx.positions || []).concat(L.JOB_TITLES_BY_DEPT[w.data.department] || []))].map((t) => '<option value="' + esc(t) + '">').join(''); }));
  if ($('hr-w-dup')) $('hr-w-dup').addEventListener('change', (e) => { w.ackDupes = e.target.checked; });
  if ($('hr-w-imp')) $('hr-w-imp').addEventListener('change', (e) => { w.ackImpact = e.target.checked; });
  $('hr-w-cancel').addEventListener('click', async () => {
    if (w.touched) { const ok = await confirmDialog({ title: 'Cancel adding this employee?', message: 'What you typed will be lost.', okLabel: 'Discard', cancelLabel: 'Keep going', danger: true }); if (!ok) return; }
    ctx.closeAdd();
  });
  $('hr-w-back').addEventListener('click', () => { w.error = ''; w.step = Math.max(0, w.step - 1); draw(ctx, host, w); });
  $('hr-w-next').addEventListener('click', () => (last ? create(ctx, host, w) : next(ctx, host, w)));
  if (step.id === 'review' && !w.impact) loadImpact(ctx, host, w);
}

function missingFor(w, step) {
  const d = w.data, miss = [];
  const need = (f, label) => { if (blank(d[f])) miss.push(label); };
  if (step.id === 'basic') {
    need('employee_code', 'Employee ID'); need('full_name', 'Display name'); need('email', 'Email'); need('first_name', 'First name'); need('last_name', 'Last name');
    if (!blank(d.email) && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) miss.push('a valid email');
  }
  if (step.id === 'employment') { need('company', 'Company'); need('job_title', 'Job title'); need('hire_date', 'Date hired'); }
  return miss;
}

async function next(ctx, host, w) {
  const step = w.steps[w.step], miss = missingFor(w, step);
  if (miss.length) { w.error = 'Please fill in: ' + miss.join(', ') + '.'; draw(ctx, host, w); return; }
  w.error = '';
  if (step.id === 'basic') {
    const btn = $('hr-w-next'); busy(btn, true, 'Checking…');
    try {
      const dupes = await ctx.api.findDuplicates(payload(w));
      const blocked = dupes.find((x) => x.blocks);
      if (blocked) { w.error = 'Employee ID ' + w.data.employee_code + ' is already used by ' + blocked.full_name + '. Use a different ID.'; busy(btn, false); draw(ctx, host, w); return; }
      w.dupes = dupes;
      if (dupes.length) toast('Possible duplicate: ' + dupes[0].full_name + ' (' + dupes[0].reasons.join(', ') + '). You can continue; you will be asked to confirm at the end.', false);
    } catch (err) { busy(btn, false); w.error = friendly(err); draw(ctx, host, w); return; }
  }
  w.step += 1; w.impact = null; w.ackImpact = false;
  draw(ctx, host, w);
}

function payload(w) {
  const out = {};
  for (const [k, v] of Object.entries(w.data)) if (!blank(v)) out[k] = typeof v === 'string' ? v.trim() : v;
  return out;
}

async function loadImpact(ctx, host, w) {
  try {
    const d = w.data;
    w.impact = await ctx.api.accessImpact(null, { role: d.role || 'None', job_title: d.job_title || null, branch_id: d.branch_id ? Number(d.branch_id) : null });
    // refresh the duplicate check with everything typed
    w.dupes = await ctx.api.findDuplicates(payload(w)).catch(() => w.dupes);
  } catch (err) { w.error = friendly(err); w.impact = { proposed: { permission_count: 0, role: w.data.role, job_title: w.data.job_title }, added: [], notes: [] }; }
  if (ctx.wizard === w && w.steps[w.step].id === 'review') draw(ctx, host, w);
}

async function create(ctx, host, w) {
  if (!w.impact) { toast('Still checking the access. One moment.', true); return; }
  if (w.dupes.some((x) => x.blocks)) { w.error = 'The Employee ID is already used. Go back and change it.'; draw(ctx, host, w); return; }
  if (w.dupes.some((x) => !x.blocks) && !w.ackDupes) { w.error = 'Tick “I checked, this is a different person” to continue.'; draw(ctx, host, w); return; }
  if (w.impact.added.length && !w.ackImpact) { w.error = 'Tick “I reviewed the access this person will receive” to continue.'; draw(ctx, host, w); return; }
  const btn = $('hr-w-next'); busy(btn, true, 'Creating…');
  try {
    const p = payload(w); p.confirm_duplicates = w.ackDupes || undefined; p.confirm_impact = w.ackImpact || w.impact.added.length === 0;
    const r = await ctx.api.createEmployee(p);
    if (r.ok) { toast('Employee added — ' + w.data.full_name + ' (' + r.employee_code + ').'); ctx.afterCreate(r.employee_id); return; }
    busy(btn, false);
    if (r.errors && r.errors.length) { w.error = r.errors.map((e) => e.message).join(' '); }
    else if (r.needs_duplicate_confirmation) { w.dupes = r.duplicates; w.error = 'Please confirm the possible duplicates below.'; }
    else if (r.needs_confirmation) { w.impact = r.impact; w.error = 'Please review the access below.'; }
    draw(ctx, host, w);
  } catch (err) { busy(btn, false); w.error = friendly(err); draw(ctx, host, w); }
}
