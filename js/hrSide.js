// HR 201 File -- the record-keeping tabs: Access & Permissions (view only), Employment History, Notes, Audit Log, and the Leave tab.
import { esc, $, badge, spinner, emptyBox, friendly, toast, confirmDialog, reasonDialog, openModal, inputHtml, bindEdit, busy, lockIcon } from './hrUi.js?v=20261007h';
import {
  fmtDate, fmtDateTime, historyText, plural, statusLabel, ACTION_LABEL, SECTION_LABEL, FIELD_DEFS, blank, money, HISTORY_LABEL,
} from './hrLogic.js?v=20261007h';
import { rebuildOriginal, canEditField } from './hrTabs.js?v=20261007h';

const stale = (ctx, ps, tab) => ctx.ps !== ps || ps.tab !== tab;

// ================================================================= Access & Permissions (view only: the Position Access Matrix stays the one place to change permissions)
export async function renderAccess(ctx, ps, panel) {
  panel.innerHTML = '<h3>Access &amp; permissions</h3>' + spinner();
  let a;
  try { a = await ctx.api.accessView(ps.id); } catch (err) { panel.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; return; }
  if (stale(ctx, ps, 'access')) return;
  const k = ctx.access.keys, e = ps.data.employee;
  const card = (t, big, small, tone) => '<div class="hr-card' + (tone ? ' hr-tone-' + tone : '') + '"><h5>' + esc(t) + '</h5><span class="big">' + big + '</span>' + (small ? '<span class="small">' + small + '</span>' : '') + '</div>';
  const login = a.login || {}, pw = a.password || {}, rev = a.last_reviewed || {};
  panel.innerHTML = '<h3>Access &amp; permissions</h3><p class="hr-notice">' + lockIcon + ' <b>View only.</b> Nothing here changes what this person can do. Permissions are set in the Position Access Matrix' +
    (ctx.access.is_admin ? ' — <a href="access-matrix.html">open it</a>' : ' (an Admin manages it)') + '. Changing the job title, role or branch on the Employment tab shows the effect first.</p>' +
    (a.position_differs_from_job_title ? '<div class="hr-notice warn">The system position is <b>' + esc(a.position || 'empty') + '</b> but the 201 job title is <b>' + esc(a.job_title || 'empty') + '</b>. Both exist in the system and some older rules still read the position. Nothing was changed automatically.</div>' : '') +
    (a.status !== 'Active' ? '<div class="hr-notice bad">This person\'s system account is <b>Inactive</b>: they cannot sign in or use any permission.</div>' : '') +
    '<div class="hr-grid">' +
      card('Role', esc(a.role), 'Role-based permissions apply') +
      card('Job title (201 file)', esc(a.job_title || '—'), a.job_title ? (a.automatic_access ? 'Automatic access is ON' : '<b>Automatic access is OFF</b> — this title\'s permissions do not apply') + (a.job_title_registered ? '' : '<br>Not a registered position') : '') +
      card('System position', esc(a.position || '—'), 'Used by older rules') +
      card('Branch', esc(a.branch_name || 'No branch'), 'Decides branch-based data access') +
      card('Sign-in', login.has_login ? 'Has a sign-in' : 'No sign-in yet', 'Sign-in ID: <b>' + esc(login.login_id || '—') + '</b>' + (login.linked_accounts ? '<br>Last sign-in: ' + esc(login.last_sign_in_at ? fmtDateTime(login.last_sign_in_at) : 'never') : ''), login.has_login ? 'ok' : 'warn') +
      card('Password', esc(pw.last_set_at ? 'Set ' + fmtDate(String(pw.last_set_at).slice(0, 10)) : 'Not recorded'), pw.last_set_at ? 'By ' + esc(pw.last_set_by || '—') + ' (' + esc(pw.mode || '') + ')' : 'Only changes made from this page are recorded. The password itself is never stored or shown.') +
      card('Account status', esc(a.status === 'Active' ? 'Active' : 'Inactive'), 'Permissions in effect: <b>' + esc(a.effective_count) + '</b>', a.status === 'Active' ? 'ok' : 'bad') +
      card('Last access review', esc(rev.at ? fmtDate(String(rev.at).slice(0, 10)) : 'Never'), rev.at ? 'By ' + esc(rev.by || '—') + (rev.note ? ' — ' + esc(rev.note) : '') : 'Mark it after you have checked the permissions below') +
    '</div>' +
    '<div class="hr-top-actions" style="margin:12px 0;">' +
      (k['hr.view_access'] && k['hr.edit_employment'] ? '<button type="button" class="btn secondary" id="hr-acc-review">Mark access as reviewed</button>' : '') +
      (k['hr.reset_password'] && ctx.access.password_function_allowed ? '<button type="button" class="btn secondary" id="hr-acc-pw">' + (login.has_login ? 'Reset password' : 'Set a password') + '</button>' : '') + '</div>' +
    '<h4>Where the permissions come from</h4><p class="muted">From the role: <b>' + esc(a.sources.from_role) + '</b> · from the job title: <b>' + esc(a.sources.from_job_title) + '</b> · from individual grants: <b>' + esc(a.sources.from_individual_grants) + '</b> (a permission can come from more than one place).</p>' +
    '<h4>Individual overrides (' + (a.overrides || []).length + ')</h4>' +
    ((a.overrides || []).length ? '<div class="table-scroll"><table><thead><tr><th>Permission</th><th>Effect</th><th>Reason</th><th>From</th><th>Until</th><th>Approved by</th></tr></thead><tbody>' +
      a.overrides.map((o) => '<tr><td data-label="Permission">' + esc(o.label) + '<span class="hr-sub">' + esc(o.key) + '</span></td><td data-label="Effect">' + (o.granted ? badge('Granted', 'ok') : badge('Denied', 'low')) + (o.active ? '' : ' ' + badge('Not active', 'gray')) + '</td><td data-label="Reason">' + esc(o.reason || '—') + '</td><td data-label="From">' + esc(fmtDate(String(o.starts_at).slice(0, 10))) + '</td><td data-label="Until">' + esc(o.expires_at ? fmtDate(String(o.expires_at).slice(0, 10)) : 'No end') + '</td><td data-label="Approved by">' + esc(o.approved_by_name || '—') + '</td></tr>').join('') + '</tbody></table></div>'
      : '<p class="muted">None. This person has only what the role and job title give.</p>') +
    '<h4>What this person can do (' + esc(a.effective_count) + ')</h4>' +
    ((a.effective || []).length ? a.effective.map((c) => '<details class="hr-perm-cat"><summary><span>' + esc(c.category) + '</span><span>' + c.keys.length + '</span></summary><ul>' + c.keys.map((p) => '<li>' + esc(p.label) + ' <span class="muted">' + esc(p.key) + '</span></li>').join('') + '</ul></details>').join('') : '<p class="muted">No permissions are in effect.</p>') +
    '<h4>Recent role, position, status and branch changes</h4>' +
    ((a.recent_changes || []).length ? '<ul class="hr-timeline">' + a.recent_changes.map((c) => '<li><span class="hr-tl-date">' + esc(fmtDate(String(c.changed_at).slice(0, 10))) + '</span><span class="hr-tl-body">' + esc(c.details || c.action) + '<span class="muted">' + esc(c.changed_by_name || '') + '</span></span></li>').join('') + '</ul>' : '<p class="muted">No changes recorded.</p>');
  if ($('hr-acc-review')) $('hr-acc-review').addEventListener('click', async () => {
    const note = await reasonDialog({ title: 'Mark access as reviewed', message: 'Record that you have checked what ' + esc(e.full_name) + ' can do and it is right for their job.', label: 'Note', okLabel: 'Mark as reviewed', required: false, placeholder: 'Optional' });
    if (note === null) return;
    try { await ctx.api.markAccessReviewed(ps.id, note || null); toast('Access marked as reviewed.'); renderAccess(ctx, ps, panel); } catch (err) { toast(err, true); }
  });
  if ($('hr-acc-pw')) $('hr-acc-pw').addEventListener('click', () => passwordDialog(ctx, ps, login, panel));
}

function passwordDialog(ctx, ps, login, panel) {
  const e = ps.data.employee;
  const dlg = openModal({
    title: (login.has_login ? 'Reset' : 'Set') + ' the sign-in password', sub: e.full_name,
    body: '<p class="muted">They sign in with ID <b>' + esc(e.employee_code || '— set an Employee ID first —') + '</b> and this password. The password is sent straight to the sign-in service; it is never shown, stored or logged here.</p>' +
      '<div class="field"><label for="hr-pw1">New password *</label><input id="hr-pw1" type="password" minlength="6" autocomplete="new-password"></div>' +
      '<div class="field"><label for="hr-pw2">Confirm password *</label><input id="hr-pw2" type="password" minlength="6" autocomplete="new-password"></div><p class="hr-err" id="hr-pw-err" hidden></p>',
    footer: [{ label: 'Cancel', kind: 'secondary', onClick: (close) => close() }, { label: 'Save password', kind: 'primary', id: 'hr-pw-go', disabled: !e.employee_code, onClick: async (close, btn) => {
      const a = $('hr-pw1').value, b = $('hr-pw2').value, err = $('hr-pw-err');
      const fail = (m) => { err.hidden = false; err.textContent = m; };
      if (a !== b) return fail('The two passwords do not match.');
      if (a.length < 6) return fail('The password must be at least 6 characters.');
      busy(btn, true, 'Saving…');
      try {
        const r = await ctx.api.setEmployeePassword(ps.id, a);
        await ctx.api.logPasswordChange(ps.id, r.mode === 'created' ? 'created' : 'updated').catch(() => {});
        close(); toast((r.mode === 'created' ? 'Password set' : 'Password updated') + ' for ' + e.full_name + ' — signs in with ID ' + String(r.email || '').split('@')[0] + '.');
        renderAccess(ctx, ps, panel);
      } catch (ex) { busy(btn, false); fail(friendly(ex)); }
    } }],
  });
  return dlg;
}

// ================================================================= Employment History
export async function renderHistory(ctx, ps, panel) {
  panel.innerHTML = '<h3>Employment history</h3>' + spinner();
  let rows;
  try { rows = await ctx.api.listHistory(ps.id); } catch (err) { panel.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; return; }
  if (stale(ctx, ps, 'history')) return;
  const icon = { job_title: 'Position', department: 'Department', company: 'Company', employment_status: 'Status', salary: 'Pay', hire_date: 'Hired', end_of_employment: 'End', branch: 'Branch', role: 'Role', status: 'Account', position: 'System', archived: 'Record', restored: 'Record' };
  panel.innerHTML = '<h3>Employment history</h3><p class="muted" style="margin-bottom:8px;">Every change to the position, department, company, status, dates' + (ctx.access.keys['hr.view_compensation'] ? ', pay' : '') + ', role, branch and account is kept here permanently. Entries marked “starting point” show what was already on file when this history began.</p>' +
    (rows.length ? '<ul class="hr-timeline">' + rows.map((h) => '<li><span class="hr-tl-date">' + esc(fmtDate(h.effective_date)) + '</span><span class="hr-tl-body"><span class="hr-chip hr-chip-info">' + esc(icon[h.kind] || h.kind) + '</span> <b>' + esc(historyText(h)) + '</b>' +
      '<span class="muted">' + esc(h.changed_by_name || '') + (h.reason ? ' — ' + esc(h.reason) : '') + '</span></span></li>').join('') + '</ul>' : emptyBox('No history has been recorded yet.'));
}

// ================================================================= Notes (HR Internal / Management Internal; archived, never edited or deleted)
export async function renderNotes(ctx, ps, panel) {
  panel.innerHTML = '<h3>Notes</h3>' + spinner();
  let n;
  try { n = await ctx.api.listNotes(ps.id); } catch (err) { panel.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; return; }
  if (stale(ctx, ps, 'notes')) return;
  ps.notes = n; rebuildOriginal(ps);
  const active = n.notes.filter((x) => !x.archived_at), arch = n.notes.filter((x) => x.archived_at);
  const note = (x) => '<div class="hr-note' + (x.archived_at ? ' archived' : '') + '"><div class="hr-note-head"><span>' + (x.visibility === 'HR Internal' ? badge('HR internal', 'transit') : badge('Management internal', 'pending')) + ' <span class="hr-chip">' + esc(x.category) + '</span> ' + esc(x.created_by_name || '') + ' · ' + esc(fmtDateTime(x.created_at)) + '</span>' +
    (n.can_add && !x.archived_at ? '<button type="button" class="hr-link" data-archive-note="' + esc(x.id) + '">Archive</button>' : '') + '</div><div class="hr-note-body">' + esc(x.body) + '</div>' +
    (x.archived_at ? '<div class="muted" style="margin-top:4px;">Archived ' + esc(fmtDate(String(x.archived_at).slice(0, 10))) + (x.archived_by_name ? ' by ' + esc(x.archived_by_name) : '') + (x.archive_reason ? ' — ' + esc(x.archive_reason) : '') + '</div>' : '') + '</div>';
  const canEditLegacy = ps.editing && canEditField(ctx, 'notes') && n.can_view_hr;
  panel.innerHTML = '<h3>Notes</h3><p class="hr-notice">' + lockIcon + ' <b>HR internal</b> notes are seen by people with HR note access; <b>management internal</b> notes by people with management note access. Notes are never edited or deleted — archive one and add a new one.</p>' +
    (n.can_add ? '<form id="hr-note-form" class="hr-upload" autocomplete="off"><div class="field"><label for="hr-note-vis">Who can see it</label><select id="hr-note-vis">' +
      (n.can_view_hr ? '<option>HR Internal</option>' : '') + (n.can_view_management ? '<option>Management Internal</option>' : '') + '</select></div>' +
      '<div class="field"><label for="hr-note-cat">Category</label><input id="hr-note-cat" list="hr-note-cats" value="General" maxlength="60"><datalist id="hr-note-cats">' + ['General', 'Performance', 'Attendance', 'Commendation', 'Disciplinary', 'Medical', 'Personal'].map((c) => '<option>' + c + '</option>').join('') + '</datalist></div>' +
      '<div class="field" style="grid-column:1 / -1;"><label for="hr-note-body">Note *</label><textarea id="hr-note-body" rows="3" maxlength="4000" required></textarea></div>' +
      '<div class="field"><button class="btn" type="submit" id="hr-note-go">Add note</button></div></form>' : '') +
    (n.legacy_note || canEditLegacy ? '<h4>Note on file (original 201-file field)</h4>' + (canEditLegacy ? '<div class="hr-ef-grid">' + inputHtml('notes', ps.values.notes !== undefined ? ps.values.notes : ps.original.notes, {}) + '</div>' : '<div class="hr-note"><div class="hr-note-body">' + esc(n.legacy_note) + '</div></div>') : '') +
    '<h4>' + plural(active.length, 'note') + '</h4>' + (active.length ? active.map(note).join('') : '<p class="muted">No notes yet.</p>') +
    (arch.length ? '<details class="exp"><summary><span class="exp-arrow" aria-hidden="true">▸</span>Archived notes (' + arch.length + ')</summary><div class="exp-body">' + arch.map(note).join('') + '</div></details>' : '');
  if (canEditLegacy) { bindEdit(panel, ps, () => ctx.markDirty()); if ('notes' in ps.values) panel.querySelector('[data-field="notes"]').dispatchEvent(new Event('input')); }
  if ($('hr-note-form')) $('hr-note-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = $('hr-note-go'); busy(btn, true, 'Adding…');
    try {
      const r = await ctx.api.addNote(ps.id, $('hr-note-vis').value, $('hr-note-cat').value, $('hr-note-body').value);
      if (r && r.ok === false) { toast(r.errors[0].message, true); busy(btn, false); return; }
      toast('Note added.'); renderNotes(ctx, ps, panel);
    } catch (err) { toast(err, true); busy(btn, false); }
  });
  panel.querySelectorAll('[data-archive-note]').forEach((b) => b.addEventListener('click', async () => {
    const reason = await reasonDialog({ title: 'Archive this note', message: 'The note is kept (marked archived) and stays in the audit log. It will no longer be listed as current.', label: 'Reason', okLabel: 'Archive note', required: false, placeholder: 'Optional' });
    if (reason === null) return;
    try { await ctx.api.archiveNote(b.dataset.archiveNote, reason || null); toast('Note archived.'); renderNotes(ctx, ps, panel); } catch (err) { toast(err, true); }
  }));
}

// ================================================================= Audit Log
export async function renderAudit(ctx, ps, panel) {
  ps.audit = ps.audit || { action: '', section: '', who: '', from: '', to: '', rows: [], done: false };
  const st = ps.audit;
  panel.innerHTML = '<h3>Audit log</h3><p class="muted" style="margin-bottom:8px;">Who changed or looked at what, and when. Entries are permanent. Government ID numbers are never stored here, and amounts are only shown to people who may see compensation.</p>' +
    '<div class="hr-audit-filters"><div class="field"><label for="hr-au-action">What happened</label><select id="hr-au-action"><option value="">Anything</option>' +
      Object.keys(ACTION_LABEL).map((a) => '<option value="' + a + '"' + (st.action === a ? ' selected' : '') + '>' + esc(ACTION_LABEL[a]) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label for="hr-au-section">Section</label><select id="hr-au-section"><option value="">Any</option>' + Object.keys(SECTION_LABEL).map((s) => '<option value="' + s + '"' + (st.section === s ? ' selected' : '') + '>' + esc(SECTION_LABEL[s]) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label for="hr-au-who">Who</label><select id="hr-au-who"><option value="">Anyone</option></select></div>' +
    '<div class="field"><label for="hr-au-from">From</label><input type="date" id="hr-au-from" value="' + esc(st.from) + '"></div>' +
    '<div class="field"><label for="hr-au-to">To</label><input type="date" id="hr-au-to" value="' + esc(st.to) + '"></div></div>' +
    '<div id="hr-au-box">' + spinner() + '</div>';
  // "Who" and the dates narrow what is already loaded; "What happened" and "Section" ask the database again
  const shown = () => st.rows.filter((r) => (!st.who || (r.actor_name || 'System') === st.who) && (!st.from || String(r.created_at).slice(0, 10) >= st.from) && (!st.to || String(r.created_at).slice(0, 10) <= st.to));
  function drawRows() {
    const who = $('hr-au-who');
    const names = [...new Set(st.rows.map((r) => r.actor_name || 'System'))].sort();
    who.innerHTML = '<option value="">Anyone</option>' + names.map((n) => '<option' + (n === st.who ? ' selected' : '') + '>' + esc(n) + '</option>').join('');
    const rows = shown();
    $('hr-au-box').innerHTML = rows.length ? '<div class="table-scroll"><table><thead><tr><th>When</th><th>Who</th><th>What</th><th>Section</th><th>Detail</th><th>Reason</th></tr></thead><tbody>' +
      rows.map((r) => '<tr><td data-label="When">' + esc(fmtDateTime(r.created_at)) + '</td><td data-label="Who">' + esc(r.actor_name || 'System') + '</td><td data-label="What">' + esc(ACTION_LABEL[r.action] || r.action) + '</td>' +
        '<td data-label="Section">' + esc(SECTION_LABEL[r.section] || r.section || '') + '</td><td data-label="Detail">' + auditDetail(r) + '</td><td data-label="Reason">' + esc(r.reason || '') + '</td></tr>').join('') + '</tbody></table></div>' +
      (st.done ? '' : '<p><button type="button" class="btn small secondary" id="hr-au-more">Load older entries</button></p>') : emptyBox('Nothing has been recorded for this employee' + (st.action || st.section || st.who || st.from || st.to ? ' with these filters' : ' yet') + '.' + (st.done ? '' : ' <button type="button" class="hr-link" id="hr-au-more">Load older entries</button>'));
    if ($('hr-au-more')) $('hr-au-more').addEventListener('click', () => load(true));
  }
  async function load(more) {
    try {
      const rows = await ctx.api.listAudit({ employeeId: ps.id, limit: 100, before: more && st.rows.length ? st.rows[st.rows.length - 1].id : null, action: st.action, section: st.section });
      st.rows = more ? st.rows.concat(rows) : rows; st.done = rows.length < 100;
    } catch (err) { $('hr-au-box').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; return; }
    if (stale(ctx, ps, 'audit')) return;
    drawRows();
  }
  $('hr-au-action').addEventListener('change', (e) => { st.action = e.target.value; load(false); });
  $('hr-au-section').addEventListener('change', (e) => { st.section = e.target.value; load(false); });
  $('hr-au-who').addEventListener('change', (e) => { st.who = e.target.value; drawRows(); });
  $('hr-au-from').addEventListener('change', (e) => { st.from = e.target.value; drawRows(); });
  $('hr-au-to').addEventListener('change', (e) => { st.to = e.target.value; drawRows(); });
  await load(false);
}
function auditDetail(r) {
  const label = r.label || (FIELD_DEFS[r.field_name] || {}).label || r.field_name || '';
  if (r.hidden) return esc(label) + ' <span class="muted">(amount hidden)</span>';
  if (r.action === 'updated') return '<b>' + esc(label) + '</b>: <span class="muted">' + esc(blank(r.old_value) ? '(blank)' : r.old_value) + '</span> → <b>' + esc(blank(r.new_value) ? '(blank)' : r.new_value) + '</b>';
  if (r.action === 'revealed') return esc(label || 'ID number');
  if (r.new_value) return esc(r.new_value);
  return esc(label);
}

// ================================================================= Leave (the Leave Management record, shown here; nothing is duplicated)
export async function renderLeave(ctx, ps, panel) {
  panel.innerHTML = '<h3>Leave</h3><div id="hr-leave-host">' + spinner('Loading the leave record…') + '</div>';
  try {
    const { mountLeaveProfile } = await import('./leaveProfile.js?v=20261007h');
    if (stale(ctx, ps, 'leave')) return;
    await mountLeaveProfile($('hr-leave-host'), ps.id);
  } catch (err) { const h = $('hr-leave-host'); if (h) h.innerHTML = '<div class="msg error">Could not load the leave record: ' + esc(friendly(err)) + '</div>'; }
}

// ================================================================= Audit log for everyone (opened from the directory)
export function openAuditAll(ctx) {
  const st = { action: '', section: '', rows: [], done: false };
  const dlg = openModal({
    title: 'HR audit log — all employees', sub: 'Every change to a 201 file and every look at protected information, newest first. Entries are permanent.', wide: true,
    body: '<div class="hr-audit-filters"><div class="field"><label for="hr-aa-action">What happened</label><select id="hr-aa-action"><option value="">Anything</option>' +
      Object.keys(ACTION_LABEL).map((a) => '<option value="' + a + '">' + esc(ACTION_LABEL[a]) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="hr-aa-section">Section</label><select id="hr-aa-section"><option value="">Any</option>' + Object.keys(SECTION_LABEL).map((s) => '<option value="' + s + '">' + esc(SECTION_LABEL[s]) + '</option>').join('') + '</select></div></div><div id="hr-aa-box">' + spinner() + '</div>',
    footer: [{ label: 'Close', kind: 'secondary', onClick: (close) => close() }],
  });
  async function load(more) {
    try {
      const rows = await ctx.api.listAudit({ employeeId: null, limit: 100, before: more && st.rows.length ? st.rows[st.rows.length - 1].id : null, action: st.action, section: st.section });
      st.rows = more ? st.rows.concat(rows) : rows; st.done = rows.length < 100;
    } catch (err) { $('hr-aa-box').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; return; }
    $('hr-aa-box').innerHTML = st.rows.length ? '<div class="table-scroll"><table><thead><tr><th>When</th><th>Employee</th><th>Who</th><th>What</th><th>Detail</th><th>Reason</th></tr></thead><tbody>' +
      st.rows.map((r) => '<tr><td data-label="When">' + esc(fmtDateTime(r.created_at)) + '</td><td data-label="Employee">' + esc(r.employee_label || '—') + '</td><td data-label="Who">' + esc(r.actor_name || 'System') + '</td>' +
        '<td data-label="What">' + esc(ACTION_LABEL[r.action] || r.action) + '</td><td data-label="Detail">' + auditDetail(r) + '</td><td data-label="Reason">' + esc(r.reason || '') + '</td></tr>').join('') + '</tbody></table></div>' +
      (st.done ? '' : '<p><button type="button" class="btn small secondary" id="hr-aa-more">Load older entries</button></p>') : emptyBox('Nothing has been recorded' + (st.action || st.section ? ' with these filters' : ' yet') + '.');
    if ($('hr-aa-more')) $('hr-aa-more').addEventListener('click', () => load(true));
  }
  $('hr-aa-action').addEventListener('change', (e) => { st.action = e.target.value; load(false); });
  $('hr-aa-section').addEventListener('change', (e) => { st.section = e.target.value; load(false); });
  load(false);
  return dlg;
}
