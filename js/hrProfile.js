// HR 201 File -- one employee's profile: header with summary chips, the 12 tabs, view mode by default, and the edit session around them.
import { esc, $, badge, chip, spinner, toast, friendly, confirmDialog, reasonDialog } from './hrUi.js?v=20261011b';
import {
  visibleTabs, statusLabel, statusTone, fmtDateTime, fmtDate, spanText, initials, diffFields, FIELD_DEFS, plural, SEPARATED,
} from './hrLogic.js?v=20261011b';
import { rebuildOriginal, renderOverview, renderPersonal, renderEmployment, renderCompensation, renderGovernment, renderEmergency } from './hrTabs.js?v=20261011b';
import { renderDocuments } from './hrDocs.js?v=20261011b';
import { renderAccess, renderHistory, renderNotes, renderAudit, renderLeave } from './hrSide.js?v=20261011b';
import { startEdit, cancelEdit, saveEdit, isDirty } from './hrEdit.js?v=20261011b';

const RENDER = {
  overview: renderOverview, personal: renderPersonal, employment: renderEmployment, compensation: renderCompensation, government: renderGovernment,
  emergency: renderEmergency, documents: renderDocuments, leave: renderLeave, access: renderAccess, history: renderHistory, notes: renderNotes, audit: renderAudit,
};
const EDIT_KEYS = ['hr.edit_profile', 'hr.edit_employment', 'hr.edit_compensation', 'hr.edit_government_ids', 'hr.add_notes'];

export async function openProfile(ctx, id, tab) {
  const host = ctx.profileHost;
  host.innerHTML = spinner('Opening the 201 file…');
  let data;
  try { data = await ctx.api.getEmployee(id); }
  catch (err) { host.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div><p><button type="button" class="btn secondary" id="hr-back-err">Back to the list</button></p>'; $('hr-back-err').addEventListener('click', () => ctx.closeProfile(true)); return; }
  const tabs = visibleTabs(ctx.access.keys);
  const ps = { id, data, tab: tabs.some((t) => t.id === tab) ? tab : 'overview', editing: false, original: {}, values: {}, comp: null, notes: null, notices: [], ui: {}, audit: null };
  rebuildOriginal(ps);
  ctx.ps = ps;
  drawProfile(ctx);
}

export function drawProfile(ctx) {
  const ps = ctx.ps, d = ps.data, e = d.employee, f = d.file, k = ctx.access.keys, row = d.directory_row || {};
  const sep = SEPARATED.includes(f.employment_status);
  const canEdit = EDIT_KEYS.some((x) => k[x]) || ctx.access.is_admin;
  const chips = [
    badge(statusLabel(f.employment_status), statusTone({ employment_status: f.employment_status, archived: !!f.archived_at })),
    f.archived_at ? chip('Archived', 'bad') : '',
    e.status === 'Active' ? chip('System account active', 'ok') : chip('System account inactive', 'bad'),
    d.flags.has_login ? chip('Has a sign-in', 'info') : chip('No sign-in yet', 'warn'),
    row.profile_pct !== undefined ? chip('Profile ' + row.profile_pct + '%', Number(row.profile_pct) >= 100 ? 'ok' : (Number(row.profile_pct) < 70 ? 'warn' : '')) : '',
    row.docs_missing !== null && row.docs_missing !== undefined && Number(row.docs_missing) > 0 ? chip(plural(row.docs_missing, 'document') + ' missing', 'warn') : '',
    Number(row.docs_expired) > 0 ? chip(plural(row.docs_expired, 'document') + ' expired', 'bad') : '',
    Number(row.docs_expiring) > 0 ? chip(plural(row.docs_expiring, 'document') + ' expiring', 'warn') : '',
    sep && e.status === 'Active' ? chip('Left but still has access', 'bad') : '',
  ].filter(Boolean).join(' ');
  const sub = [e.employee_code, f.job_title, f.department, f.company, e.branch_name].filter(Boolean).map(esc).join(' · ');
  ctx.profileHost.innerHTML =
    '<button type="button" class="btn small secondary hr-back" id="hr-back">← All employees</button>' +
    '<div class="hr-head"><div class="hr-avatar" aria-hidden="true">' + esc(initials(row.display_name || e.full_name)) + '</div>' +
      '<div class="hr-head-main"><h2>' + esc(row.display_name || e.full_name) + '</h2><div class="hr-head-sub">' + sub + '</div><div class="hr-chips">' + chips + '</div></div>' +
      '<div class="hr-head-actions"><div class="row">' +
        (canEdit && !ps.editing ? '<button type="button" class="btn" id="hr-edit">Edit Employee</button>' : '') +
        (k['hr.export_print'] ? '<button type="button" class="btn secondary" id="hr-print">Print 201 summary</button>' : '') +
        (k['hr.archive_employee'] && ctx.access.employee_id !== e.id ? (f.archived_at ? '<button type="button" class="btn secondary" id="hr-restore">Restore</button>' : '<button type="button" class="btn secondary" id="hr-archive">Archive</button>') : '') +
      '</div><div class="hr-meta">' + (d.file_exists ? 'Last updated ' + esc(fmtDateTime(f.updated_at)) + (f.updated_by_name ? ' by ' + esc(f.updated_by_name) : '') : '201 file not created yet') + '</div></div></div>' +
    '<div id="hr-editbar"></div><div id="hr-notices"></div>' +
    '<div class="hr-tabs-wrap"><div class="lv-tabs" id="hr-tabs" role="tablist" aria-label="201 file sections"></div></div>' +
    '<div class="hr-panel" id="hr-panel" role="tabpanel"></div>';
  $('hr-back').addEventListener('click', () => ctx.closeProfile());
  if ($('hr-edit')) $('hr-edit').addEventListener('click', () => startEdit(ctx));
  if ($('hr-print')) $('hr-print').addEventListener('click', () => ctx.openPrint());
  if ($('hr-archive')) $('hr-archive').addEventListener('click', () => archive(ctx));
  if ($('hr-restore')) $('hr-restore').addEventListener('click', () => restore(ctx));
  drawEditBar(ctx); drawNotices(ctx); drawTabs(ctx);
  renderPanel(ctx);
}

function drawEditBar(ctx) {
  const ps = ctx.ps, bar = $('hr-editbar');
  if (!bar) return;
  if (!ps.editing) { bar.innerHTML = ''; return; }
  const n = diffFields(ps.original, ps.values).length;
  bar.innerHTML = '<div class="hr-editbar"><span><b>Editing</b> — ' + (n ? plural(n, 'unsaved change') : 'no changes yet') + '. Changed fields are highlighted. Nothing is saved until you review and confirm.</span>' +
    '<span class="hr-top-actions"><button type="button" class="btn secondary" id="hr-cancel">Cancel</button><button type="button" class="btn" id="hr-save"' + (n ? '' : ' disabled') + '>Save Changes</button></span></div>';
  $('hr-cancel').addEventListener('click', () => cancelEdit(ctx));
  $('hr-save').addEventListener('click', () => saveEdit(ctx));
}
function drawNotices(ctx) {
  const box = $('hr-notices');
  if (!box) return;
  const list = ctx.ps.notices || [];
  box.innerHTML = list.map((t, i) => '<div class="hr-notice warn" style="display:flex;justify-content:space-between;gap:8px;"><span>' + esc(t) + '</span><button type="button" class="hr-link" data-dismiss="' + i + '">Dismiss</button></div>').join('');
  box.querySelectorAll('[data-dismiss]').forEach((b) => b.addEventListener('click', () => { ctx.ps.notices.splice(Number(b.dataset.dismiss), 1); drawNotices(ctx); }));
}
function drawTabs(ctx) {
  const ps = ctx.ps, tabs = visibleTabs(ctx.access.keys);
  const changed = new Set(diffFields(ps.original, ps.values).map((d) => d.tab));
  $('hr-tabs').innerHTML = tabs.map((t) => '<button type="button" class="lv-tab' + (t.id === ps.tab ? ' lv-tab-active' : '') + '" role="tab" aria-selected="' + (t.id === ps.tab) + '" data-tab="' + t.id + '">' + esc(t.label) +
    (ps.editing && changed.has(t.id) ? '<span class="hr-tab-dot" title="Has unsaved changes"></span>' : '') + '</button>').join('');
  $('hr-tabs').querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(ctx, b.dataset.tab)));
}
async function renderPanel(ctx) {
  const ps = ctx.ps, panel = $('hr-panel');
  if (!panel) return;
  const fn = RENDER[ps.tab] || renderOverview;
  try { await fn(ctx, ps, panel); }
  catch (err) { panel.innerHTML = '<div class="msg error">Could not show this section: ' + esc(friendly(err)) + '</div>'; if (typeof console !== 'undefined') console.error(err); }
}
export function showTab(ctx, id) {
  const ps = ctx.ps;
  if (!visibleTabs(ctx.access.keys).some((t) => t.id === id)) id = 'overview';
  ps.tab = id;
  ctx.setHash('emp/' + ps.id + '/' + id);
  drawTabs(ctx);
  return renderPanel(ctx);
}

/** called by every edit input: refreshes the counter and the tab dots without redrawing the form (so typing never loses focus) */
export function markDirty(ctx) {
  if (!ctx.ps || !ctx.ps.editing) return;
  drawEditBar(ctx);
  const changed = new Set(diffFields(ctx.ps.original, ctx.ps.values).map((d) => d.tab));
  const tabs = $('hr-tabs');
  if (tabs) tabs.querySelectorAll('[data-tab]').forEach((b) => {
    const has = b.querySelector('.hr-tab-dot');
    if (changed.has(b.dataset.tab) && !has) b.insertAdjacentHTML('beforeend', '<span class="hr-tab-dot" title="Has unsaved changes"></span>');
    if (!changed.has(b.dataset.tab) && has) has.remove();
  });
}

/** reload this person from the database after a save (keeps the tab; compensation / notes are re-read only if they were open) */
export async function reloadProfile(ctx) {
  const ps = ctx.ps;
  try {
    ps.data = await ctx.api.getEmployee(ps.id);
    if (ps.comp) { try { ps.comp = await ctx.api.getCompensation(ps.id); } catch (e) { ps.comp = null; } }
    if (ps.notes) { try { ps.notes = await ctx.api.listNotes(ps.id); } catch (e) { ps.notes = null; } }
    rebuildOriginal(ps);
  } catch (err) { toast(err, true); }
  if (ctx.ps !== ps) return;
  drawProfile(ctx);
  ctx.refreshDirectory(true);
}

/** after a document / note / checklist action: refresh the numbers in the header and redraw the tab, keeping an edit session intact */
export async function afterChange(ctx) {
  const ps = ctx.ps;
  try { ps.data = await ctx.api.getEmployee(ps.id); rebuildOriginal(ps); } catch (err) { toast(err, true); }
  if (ctx.ps !== ps) return;
  const keep = { editing: ps.editing, values: ps.values };
  drawProfile(ctx);
  ps.editing = keep.editing; ps.values = keep.values;
  ctx.refreshDirectory(true);
}

async function archive(ctx) {
  const ps = ctx.ps, e = ps.data.employee;
  const reason = await reasonDialog({ title: 'Archive ' + e.full_name, message: 'The record is kept and stays searchable. Archiving does <b>not</b> remove their sign-in or access — review that separately.', label: 'Reason for archiving', okLabel: 'Archive record', danger: true });
  if (reason === null) return;
  try {
    const r = await ctx.api.archiveEmployee(ps.id, reason);
    if (r && r.ok === false) { toast(r.errors[0].message, true); return; }
    ps.notices = (r.warnings || []).slice();
    toast('Record archived.'); await reloadProfile(ctx);
  } catch (err) { toast(err, true); }
}
async function restore(ctx) {
  const ps = ctx.ps;
  const ok = await confirmDialog({ title: 'Restore this record?', message: 'It will appear in the main employee list again.', okLabel: 'Restore' });
  if (!ok) return;
  try { await ctx.api.restoreEmployee(ps.id); toast('Record restored.'); await reloadProfile(ctx); } catch (err) { toast(err, true); }
}

/** the checks that follow a save: someone marked as left who still holds company property */
export function afterSaveChecks(ctx, diff) {
  const ps = ctx.ps;
  if (!diff.some((d) => ['employment_status', 'end_of_employment_date', 'status'].includes(d.field))) return;
  import('./hrAssets.js?v=20261011b').then((m) => m.afterSaveWarning(ps.id)).then((msg) => {
    if (!msg || ctx.ps !== ps) return;
    ps.notices.push(msg); drawNotices(ctx); toast(msg, true);
  }).catch(() => {});
}
export { isDirty };
