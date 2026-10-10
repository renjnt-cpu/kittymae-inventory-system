// Access & Performance Control Center -- owner-only account actions: switch an account on or off, change the position (the 201-file job title) or the branch, set a new sign-in password.
// Position, branch and status go through the same HR function the HR 201 File page uses (hr_save_employee): it shows exactly what the person will gain or lose first, asks for a
// reason, and writes the change to the HR audit log. No password is ever shown -- a password can only be set, never read.
// ("Lock account" is the same thing as switching the account off here: an inactive account cannot sign in or do anything.)
import { esc, dialog, toast, guarded, btn } from './apcCore.js?v=20261011b';

function impactBody(imp, what) {
  const list = (xs) => xs.length ? '<ul class="apc-plain">' + xs.slice(0, 40).map((k) => '<li>' + esc(k.label || k.key) + '</li>').join('') + (xs.length > 40 ? '<li class="muted">… and ' + (xs.length - 40) + ' more</li>' : '') + '</ul>' : '<p class="muted">None.</p>';
  return '<p>' + esc(what) + '</p><div class="apc-impact"><div><h5>Will gain (' + imp.added.length + ')</h5>' + list(imp.added) + '</div><div><h5>Will lose (' + imp.removed.length + ')</h5>' + list(imp.removed) + '</div></div>' +
    '<p class="muted">' + esc(imp.kept_count) + ' permission' + (imp.kept_count === 1 ? '' : 's') + ' stay the same.</p>' + (imp.notes || []).map((t) => '<p class="apc-notice">' + esc(t) + '</p>').join('');
}

/** Change one HR field (status / job_title / branch_id): reason -> impact review -> save. Returns true when saved. */
export async function changeField(A, emp, field, value, what) {
  const first = await dialog({ title: what, bodyHtml: '<p>' + esc(emp.name) + '</p>', reason: { label: 'Reason', required: true, placeholder: 'Why this change' }, confirmLabel: 'Review the impact' });
  if (!first) return false;
  const res = await A.api.hrSave(emp.id, { [field]: value }, { reason: first.reason, confirmImpact: false });
  if (!res.ok && res.errors && res.errors.length) { toast(res.errors.map((e) => e.message).join(' '), true); return false; }
  if (res.needs_confirmation) {
    const ok = await dialog({ title: 'Review access impact — ' + emp.name, bodyHtml: impactBody(res.impact, what + ': the person’s access changes as listed.'), confirmLabel: 'Save the change', danger: field === 'status' && value === 'Inactive' });
    if (!ok) return false;
    const done = await A.api.hrSave(emp.id, { [field]: value }, { reason: first.reason, confirmImpact: true });
    if (!done.ok) { toast((done.errors || []).map((e) => e.message).join(' ') || 'The change was not saved.', true); return false; }
  } else if (!res.ok && !res.no_changes) { toast('The change was not saved.', true); return false; }
  toast(what + ' — saved.');
  await A.reload('all');
  return true;
}

export function renderAccountActions(el, A, emp) {
  const active = emp.status === 'Active';
  el.innerHTML =
    '<div class="apc-actions-row">' +
      btn(active ? 'Deactivate account' : 'Activate account', 'id="acct-status"', active ? 'danger' : '') +
      '<span class="field"><label for="acct-pos">Position (201-file job title)</label><select id="acct-pos"><option value="">— choose —</option>' + (A.ctx.positions || []).map((p) => '<option' + (p === emp.job_title ? ' selected' : '') + '>' + esc(p) + '</option>').join('') + '</select></span>' + btn('Change position', 'id="acct-pos-go"', 'secondary') +
      '<span class="field"><label for="acct-branch">Branch</label><select id="acct-branch"><option value="">— no branch —</option>' + A.ctx.branches.map((b) => '<option value="' + b.id + '"' + (b.id === emp.branch_id ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('') + '</select></span>' + btn('Change branch', 'id="acct-branch-go"', 'secondary') +
      btn('Set sign-in password', 'id="acct-pw"', 'secondary') +
    '</div><p class="muted sd-small">An inactive account cannot sign in or do anything in the system (there is no separate “locked” state). Passwords are never shown — you can only set a new one.</p>';
  el.querySelector('#acct-status').addEventListener('click', (e) => guarded(e.target, () => changeField(A, emp, 'status', active ? 'Inactive' : 'Active', active ? 'Deactivate account' : 'Activate account')));
  el.querySelector('#acct-pos-go').addEventListener('click', (e) => { const v = el.querySelector('#acct-pos').value; if (!v || v === emp.job_title) return toast('Choose a different position first.', true); guarded(e.target, () => changeField(A, emp, 'job_title', v, 'Change position to ' + v)); });
  el.querySelector('#acct-branch-go').addEventListener('click', (e) => { const v = el.querySelector('#acct-branch').value; if (String(v) === String(emp.branch_id || '')) return toast('Choose a different branch first.', true); guarded(e.target, () => changeField(A, emp, 'branch_id', v === '' ? null : Number(v), 'Change branch')); });
  el.querySelector('#acct-pw').addEventListener('click', async (e) => {
    const r = await dialog({ title: 'Set a new sign-in password — ' + emp.name, confirmLabel: 'Save password',
      bodyHtml: '<p class="muted">They sign in with their Employee Code and this password. It is saved for them and never shown again.</p><div class="field"><label for="pw1">New password *</label><input type="password" id="pw1" data-field="pw1" minlength="6" autocomplete="new-password"></div><div class="field"><label for="pw2">Confirm password *</label><input type="password" id="pw2" data-field="pw2" minlength="6" autocomplete="new-password"></div>' });
    if (!r) return;
    if (r.pw1 !== r.pw2) return toast('The two passwords do not match.', true);
    if (String(r.pw1).length < 6) return toast('The password must be at least 6 characters.', true);
    guarded(e.target, async () => { const res = await A.api.setPassword(emp.id, r.pw1); toast((res.mode === 'created' ? 'Password set' : 'Password updated') + ' for ' + emp.name + '.'); });
  });
}
