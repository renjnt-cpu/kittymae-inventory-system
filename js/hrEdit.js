// HR 201 File -- the edit session: Edit Employee -> Review changes -> (access impact) -> Save.
// Nothing is saved until the person confirms.  The database repeats every check (permissions, reason, confirmation, someone else's newer save).
import { esc, $, badge, toast, friendly, confirmDialog, openModal, busy } from './hrUi.js?v=20261007j';
import { diffFields, needsReason, affectsAccess, changesPayload, money, fmtDateTime, statusLabel, plural, FIELD_DEFS, blank, CRITICAL } from './hrLogic.js?v=20261007j';

export const isDirty = (ps) => !!ps && ps.editing && diffFields(ps.original, ps.values).length > 0;

export function startEdit(ctx) {
  const ps = ctx.ps;
  ps.editing = true; ps.values = {};
  ctx.redrawProfile();
}

export async function cancelEdit(ctx) {
  const ps = ctx.ps;
  if (isDirty(ps)) {
    const n = diffFields(ps.original, ps.values).length;
    const ok = await confirmDialog({ title: 'Discard your changes?', message: 'You have ' + plural(n, 'unsaved change') + '. They will be lost.', okLabel: 'Discard changes', cancelLabel: 'Keep editing', danger: true });
    if (!ok) return;
  }
  ps.editing = false; ps.values = {};
  ctx.redrawProfile();
}

/** how a value is shown in the review: salary as money, IDs masked, free text hidden */
function shownValue(d, side, ps) {
  const v = d[side];
  if (d.type === 'gov' && side === 'old') { const m = ps && ps.data.government_ids && ps.data.government_ids[d.field]; return m || '(not on file)'; }
  if (blank(v)) return side === 'new' && d.type === 'gov' ? '(removed)' : '(blank)';
  if (d.type === 'gov') return '••••' + String(v).slice(-4);
  if (d.field === 'payroll_details' || d.field === 'notes') return '(updated)';
  if (d.type === 'number') return money(v);
  if (d.field === 'employment_status') return statusLabel(v);
  if (d.field === 'branch_id') return v;
  return String(v);
}

export async function saveEdit(ctx) {
  const ps = ctx.ps, diff = diffFields(ps.original, ps.values);
  if (!diff.length) { toast('Nothing has changed yet.'); return; }
  const branchName = (id) => (ctx.branchById[id] || {}).name || (blank(id) ? '(no branch)' : id);
  const rowHtml = (d) => '<div class="hr-change-row"><b>' + esc(d.label) + (d.critical ? ' <span class="hr-crit" title="Needs a reason">●</span>' : '') + '</b><span class="old">' +
    esc(d.field === 'branch_id' ? branchName(shownValue(d, 'old', ps)) : shownValue(d, 'old', ps)) + '</span><span class="new">' + esc(d.field === 'branch_id' ? branchName(shownValue(d, 'new', ps)) : shownValue(d, 'new', ps)) + '</span></div>';
  const reasonNeeded = needsReason(diff), access = affectsAccess(diff);
  const dlg = openModal({
    title: 'Review changes', sub: ps.data.employee.full_name + ' · ' + plural(diff.length, 'change'), wide: true,
    body: '<div class="hr-change-row hr-change-head" style="font-size:11px;color:var(--muted);text-transform:uppercase;border-bottom:1px solid #eee;"><span>Field</span><span>Before</span><span>After</span></div>' + diff.map(rowHtml).join('') +
      (access ? '<p class="hr-notice warn" style="margin-top:12px;"><b>This changes what the person can do or reach in the system.</b> The next step shows exactly which permissions they would gain or lose before anything is saved.</p>' : '') +
      '<div class="field" style="margin-top:12px;"><label for="hr-save-reason">Reason for the change' + (reasonNeeded ? ' *' : ' (optional)') + '</label><textarea id="hr-save-reason" rows="2" maxlength="300" placeholder="' + (reasonNeeded ? 'Required — for example: promoted to Branch Team Leader' : 'Optional') + '"></textarea></div>' +
      '<p class="hr-err" id="hr-save-err" hidden></p>',
    footer: [
      { label: 'Back to editing', kind: 'secondary', onClick: (close) => close() },
      { label: access ? 'Review access impact' : 'Save changes', kind: 'primary', id: 'hr-save-go', onClick: async (close, btn) => {
        const reason = $('hr-save-reason').value.trim(), err = $('hr-save-err');
        if (reasonNeeded && reason.length < 3) { err.hidden = false; err.textContent = 'Please write a short reason (at least 3 characters).'; $('hr-save-reason').focus(); return; }
        if (access) {
          busy(btn, true, 'Checking…');
          try { const impact = await ctx.api.accessImpact(ps.id, impactPayload(diff)); close(); impactDialog(ctx, diff, reason, impact); }
          catch (ex) { busy(btn, false); err.hidden = false; err.textContent = friendly(ex); }
        } else {
          busy(btn, true, 'Saving…');
          const done = await doSave(ctx, diff, reason, false, dlg);
          if (done) close(); else busy(btn, false);
        }
      } },
    ],
  });
}

function impactPayload(diff) {
  const out = {};
  for (const d of diff) if (['job_title', 'role', 'branch_id', 'status', 'department', 'company'].includes(d.field)) out[d.field] = d.field === 'branch_id' && !blank(d.new) ? Number(d.new) : d.new;
  return out;
}

/** "What will this change do to the person's access?"  Continue saves; Cancel leaves everything as it was. */
export function impactDialog(ctx, diff, reason, impact) {
  const ps = ctx.ps;
  const name = (id) => (ctx.branchById[id] || {}).name || '(no branch)';
  const cur = impact.current || {}, nw = impact.proposed || {};
  const rows = [];
  if (impact.changed_fields.includes('job_title')) rows.push(['Job title', cur.job_title || '(none)', nw.job_title || '(none)']);
  if (impact.changed_fields.includes('role')) rows.push(['Role', cur.role || '(none)', nw.role || '(none)']);
  if (impact.changed_fields.includes('branch_id')) rows.push(['Branch', name(cur.branch_id), name(nw.branch_id)]);
  if (impact.changed_fields.includes('status')) rows.push(['Account status', cur.status || '—', nw.status || '—']);
  if (impact.changed_fields.includes('department')) rows.push(['Department', (diff.find((d) => d.field === 'department') || {}).old || '(none)', (diff.find((d) => d.field === 'department') || {}).new || '(none)']);
  if (impact.changed_fields.includes('company')) rows.push(['Company', (diff.find((d) => d.field === 'company') || {}).old || '(none)', (diff.find((d) => d.field === 'company') || {}).new || '(none)']);
  const list = (items, cls) => items.length ? '<ul class="' + cls + '">' + items.map((p) => '<li>' + esc(p.label) + '</li>').join('') + '</ul>' : '<p class="muted">None</p>';
  const dlg = openModal({
    title: 'Review access impact', sub: ps.data.employee.full_name, wide: true,
    body: '<div class="hr-vs"><div><b>Permissions now</b>' + esc(cur.permission_count) + '</div><div><b>Permissions after saving</b>' + esc(nw.permission_count) + '</div></div>' +
      (rows.length ? '<div class="hr-change-row hr-change-head" style="font-size:11px;color:var(--muted);text-transform:uppercase;"><span>Field</span><span>Current</span><span>New</span></div>' + rows.map((r) => '<div class="hr-change-row"><b>' + esc(r[0]) + '</b><span class="old">' + esc(r[1]) + '</span><span class="new">' + esc(r[2]) + '</span></div>').join('') : '') +
      '<div class="hr-impact-cols" style="margin-top:12px;"><div><h5 class="hr-add-list">Will gain (' + impact.added.length + ')</h5>' + list(impact.added, 'hr-add-list') + '</div><div><h5 class="hr-rem-list">Will lose (' + impact.removed.length + ')</h5>' + list(impact.removed, 'hr-rem-list') + '</div></div>' +
      '<p class="muted" style="margin-top:6px;">' + esc(impact.kept_count) + ' permission' + (impact.kept_count === 1 ? '' : 's') + ' stay the same.</p>' +
      (impact.notes || []).map((n) => '<p class="hr-notice">' + esc(n) + '</p>').join('') +
      (impact.overrides && impact.overrides.length ? '<details class="exp"><summary><span class="exp-arrow" aria-hidden="true">▸</span>Individual overrides that stay as they are (' + impact.overrides.length + ')</summary><div class="exp-body"><ul>' +
        impact.overrides.map((o) => '<li>' + esc(o.label) + ' — ' + (o.granted ? 'granted' : 'denied') + (o.reason ? ' (' + esc(o.reason) + ')' : '') + '</li>').join('') + '</ul></div></details>' : '') +
      '<label style="display:flex;gap:8px;align-items:flex-start;margin-top:12px;font-size:13px;"><input type="checkbox" id="hr-imp-ok"> <span>I have reviewed this and understand it takes effect as soon as it is saved.</span></label>' +
      '<p class="hr-err" id="hr-imp-err" hidden></p>',
    footer: [
      { label: 'Cancel — change nothing', kind: 'secondary', onClick: (close) => close() },
      { label: 'Continue and save', kind: 'primary', id: 'hr-imp-go', disabled: true, onClick: async (close, btn) => {
        busy(btn, true, 'Saving…');
        const done = await doSave(ctx, diff, reason, true, dlg);
        if (done) close(); else busy(btn, false);
      } },
    ],
  });
  $('hr-imp-ok').addEventListener('change', (e) => { $('hr-imp-go').disabled = !e.target.checked; });
  return dlg;
}

/** Returns true when the save went through (the caller closes its dialog). */
async function doSave(ctx, diff, reason, confirmImpact, dlg) {
  const ps = ctx.ps;
  let res;
  try {
    res = await ctx.api.saveEmployee(ps.id, changesPayload(diff), { reason: reason || null, expectedUpdatedAt: ps.data.file.updated_at || null, confirmImpact });
  } catch (err) { showError(dlg, friendly(err)); return false; }

  if (res.ok) {
    ps.editing = false; ps.values = {};
    const warnings = res.warnings || [];
    toast(res.no_changes ? 'Nothing needed saving.' : 'Saved' + (res.changed ? ' — ' + plural(res.changed.length, 'change') : '') + '.');
    ps.notices = warnings;
    await ctx.reloadProfile();
    ctx.afterSaveChecks(diff);
    return true;
  }
  if (res.needs_confirmation) { dlg.close(); impactDialog(ctx, diff, reason, res.impact); return false; }
  if (res.conflict) {
    dlg.close();
    openModal({
      title: 'This record was changed by someone else', wide: false,
      body: '<p>' + esc(res.updated_by_name || 'Someone') + ' saved this 201 file at ' + esc(fmtDateTime(res.updated_at)) + ' while you were editing. To avoid overwriting their work, nothing was saved.</p>' +
        '<p class="muted">Reload to see the latest version, then make your changes again.</p>',
      footer: [{ label: 'Keep editing', kind: 'secondary', onClick: (c) => c() }, { label: 'Reload the latest and discard my changes', kind: 'primary', onClick: async (c) => { c(); ps.editing = false; ps.values = {}; await ctx.reloadProfile(); } }],
    });
    return false;
  }
  if (res.errors && res.errors.length) {
    const first = res.errors.find((e) => FIELD_DEFS[e.field]);
    if (res.errors.some((e) => e.field === 'reason')) { showError(dlg, res.errors.map((e) => e.message).join(' ')); return false; }
    dlg.close();
    openModal({
      title: 'Some changes could not be saved', body: '<ul>' + res.errors.map((e) => '<li><b>' + esc((FIELD_DEFS[e.field] || {}).label || e.field) + ':</b> ' + esc(e.message) + '</li>').join('') + '</ul><p class="muted">Nothing was saved. Fix these and try again.</p>',
      footer: [{ label: 'Go back and fix', kind: 'primary', onClick: (c) => { c(); if (first && FIELD_DEFS[first.field].tab !== ps.tab) ctx.showTab(FIELD_DEFS[first.field].tab); } }],
    });
    return false;
  }
  showError(dlg, 'The change could not be saved.');
  return false;
}
function showError(dlg, text) {
  const el = dlg && dlg.el && (dlg.el.querySelector('#hr-save-err') || dlg.el.querySelector('#hr-imp-err'));
  if (el) { el.hidden = false; el.textContent = text; } else toast(text, true);
}
