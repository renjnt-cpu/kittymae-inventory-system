// Access & Performance Control Center -- the Access Control tab. Pick an employee, see exactly what they can do and where each permission comes from (role, position, or the owner's own
// override), change it with plain switches, and save. Nothing is stored until Save; sensitive changes ask for a reason and a tick; every change goes to the permission history with
// the old and the new access. "Verified" records what they can do right now, so any later difference shows up as ACCESS MISMATCH.
import { esc, panel, chipFor, dialog, changeList, toast, friendly, guarded, btn, emptyBox, fmtDate, errorBox, dash } from './apcCore.js?v=20261011b';
import { describeKey, keyState, actionFor, pendingToMatch, LOCKED_KEYS } from './apcAccessModel.js?v=20261011b';
import { modulesHtml, sensitiveHtml, branchHtml, wireBranchSave, openReview, presetFlow } from './apcAccessSections.js?v=20261011b';
import { mountEmployeeList } from './apcEmpList.js?v=20261011b';
import { renderChecklist } from './apcChecklist.js?v=20261011b';
import { renderAccountActions } from './apcStatus.js?v=20261011b';

const st = { forId: null, pending: new Map(), openMods: new Map() };
const yn = (b) => b ? 'YES' : 'NO';

export async function renderAccess(root, A) {
  const people = A.people();
  if (!people.length) { root.innerHTML = emptyBox('No employees match these filters.'); return; }
  if (!people.some((p) => p.id === A.S.selected)) A.S.selected = people[0].id;
  if (st.forId !== A.S.selected) { st.forId = A.S.selected; st.pending = new Map(); }
  const wrap = document.createElement('div'); wrap.className = 'apc-layout'; root.appendChild(wrap);
  wrap.innerHTML = '<aside class="card apc-emp-list" id="acc-list"></aside><div class="apc-emp-main" id="acc-main"></div>';
  const keys = A.S.snap.keys;
  const label = Object.fromEntries(keys.map((k) => [k.key, k.label]));
  let list;

  async function choose(id) {
    if (id === A.S.selected) return;
    if (st.pending.size) {
      const ok = await dialog({ title: 'Leave without saving?', bodyHtml: '<p>You have <b>' + st.pending.size + '</b> unsaved change' + (st.pending.size === 1 ? '' : 's') + ' for ' + esc(A.byId(A.S.selected).name) + '. They will be discarded.</p>', confirmLabel: 'Discard and continue', danger: true });
      if (!ok) { list.redraw(); return; }
    }
    A.S.selected = id; st.forId = id; st.pending = new Map(); draw(); list.redraw();
  }
  list = mountEmployeeList(wrap.querySelector('#acc-list'), A, { onPick: choose, showVerify: true });

  function toggle(key, on) {
    const emp = A.byId(A.S.selected).snap, cur = keyState(emp, key).on;
    if (on === cur) st.pending.delete(key);
    else { const a = actionFor(emp, key, on); if (a) st.pending.set(key, a); else st.pending.delete(key); }
    const y = window.scrollY; draw(); window.scrollTo(0, y);
  }

  async function save(next) {
    const person = A.byId(A.S.selected), emp = person.snap;
    const changes = [...st.pending].map(([key, action]) => ({ key, action }));
    if (!changes.length) return;
    const rows = changes.map((c) => ({ label: label[c.key] || c.key, from: yn(keyState(emp, c.key).on), to: yn(keyState(emp, c.key, st.pending).now), sensitive: !!describeKey(c.key).sensitive }));
    const sens = rows.some((r) => r.sensitive), locked = changes.some((c) => LOCKED_KEYS.includes(c.key));
    const ok = await dialog({ title: 'Save access changes — ' + person.name, danger: sens, confirmLabel: 'Save changes', reason: { label: 'Reason (kept in the permission history)', required: sens, placeholder: 'Why this change' },
      bodyHtml: (locked ? '<p class="apc-notice"><b>This includes an owner-only key.</b> It opens the staff rankings and access controls to this person.</p>' : '') + changeList(rows),
      confirmCheck: sens ? 'I confirm I want to change sensitive access for ' + person.name + '.' : null });
    if (!ok) return;
    await A.api.applyOverrides(person.id, changes, ok.reason);
    st.pending = new Map(); toast(changes.length + ' change' + (changes.length === 1 ? '' : 's') + ' saved for ' + person.name + '.');
    if (next) { const ids = list.ids(), i = ids.indexOf(person.id); A.S.selected = ids[(i + 1) % ids.length] || person.id; st.forId = A.S.selected; }
    await A.reload('access');
  }

  function draw() {
    const main = wrap.querySelector('#acc-main'), person = A.byId(A.S.selected);
    if (!person || !person.snap) { main.innerHTML = emptyBox('Choose an employee.'); return; }
    const emp = person.snap, review = emp.review, pend = st.pending.size, conflicts = A.conflictsOf(person);
    const ovs = (emp.overrides || []).filter((o) => o.active && !LOCKED_KEYS.includes(o.key)), outside = ovs.filter((o) => emp.default_keys.includes(o.key) !== o.granted);
    const verified = review ? 'Verified by ' + esc(review.by || '—') + ' on ' + esc(fmtDate(String(review.at).slice(0, 10))) : 'Never verified';
    const mismatch = review && (review.added.length || review.removed.length);
    main.innerHTML =
      '<div class="card apc-head-card"><div class="apc-head-top"><div><h3 class="apc-emp-name">' + esc(person.name) + ' ' + chipFor(person.status) + ' ' + chipFor(emp.verify_status) + '</h3>' +
        '<div class="muted">' + esc(person.job_title || person.position || 'No position') + ' · Role: ' + esc(person.role === 'None' ? 'None (position only)' : person.role) + ' · ' + esc(person.branch_name || 'All branches') +
        ' · ' + verified + (person.last_sign_in ? ' · Last sign-in ' + esc(fmtDate(String(person.last_sign_in).slice(0, 10))) : '') + '</div></div>' +
        '<div class="apc-nav-btns">' + btn('‹ Previous', 'id="acc-prev"', 'secondary') + btn('Next ›', 'id="acc-next"', 'secondary') + '</div></div>' +
      '<div class="apc-bar">' +
        btn('Review access', 'id="acc-review"', 'secondary') + btn('Mark access verified', 'id="acc-verify"', 'secondary') +
        '<span class="apc-preset-box"><select id="acc-preset" aria-label="Preset"><option value="">Apply a preset…</option>' + A.ctx.presets.map((p) => '<option value="' + esc(p.name) + '">' + esc(p.name) + '</option>').join('') + '</select></span>' +
        btn('Reset to position default', 'id="acc-reset"', 'secondary') +
        '<span class="apc-spacer"></span>' + (pend ? '<span class="apc-unsaved">' + pend + ' unsaved</span> ' + btn('Discard', 'id="acc-discard"', 'secondary') : '') +
        btn('Save changes', 'id="acc-save"' + (pend ? '' : ' disabled')) + btn('Save & next employee', 'id="acc-savenext"' + (pend ? '' : ' disabled'), 'secondary') + '</div>' +
      '<p class="muted sd-small apc-summary">Position default grants <b>' + emp.default_keys.length + '</b> permissions · currently in force <b>' + emp.effective_keys.length + '</b> · custom overrides <b>' + ovs.length + '</b>' +
        (outside.length ? ' (<b>' + outside.length + '</b> differ from the default)' : '') + (emp.auto_access ? '' : ' · <b>Automatic Access is off</b> for this position') + '</p></div>' +
      (emp.title_conflict ? '<div class="apc-alert"><b>Position and job title differ.</b> The position on file is “' + esc(person.position || 'none') + '” but the 201-file job title is “' + esc(person.job_title || 'none') + '”. Some screens read one and the database reads the other — change the position below so they agree.</div>' : '') +
      (mismatch ? '<div class="apc-alert apc-alert-red"><b>ACCESS MISMATCH</b> — expected (what you verified) against actual (what is in force now):<div class="apc-diff"><div><h5>Gained since verified (' + review.added.length + ')</h5>' + diffList(review.added, label) + '</div><div><h5>Lost since verified (' + review.removed.length + ')</h5>' + diffList(review.removed, label) + '</div></div>' + btn('Correct access (put it back as verified)', 'id="acc-correct"') + '</div>' : '') +
      (conflicts.length ? '<div class="apc-alert apc-alert-orange"><b>' + (conflicts.some((c) => c.level === 'warn') ? 'ACCESS REVIEW NEEDED' : 'Worth remembering') + '</b> — nothing is removed automatically; you decide.<ul class="apc-plain">' + conflicts.map((c) => '<li>' + esc(c.text) + '</li>').join('') + '</ul></div>' : '') +
      panel('Sensitive access', sensitiveHtml(emp, keys, st), { cls: 'apc-sens-panel', sub: 'Confidential permissions. Granting one asks you to confirm and give a reason.' }) +
      panel('Access by module', modulesHtml(emp, keys, st), { sub: 'What each module lets this person do. ✓ = at least one permission of that kind is on. Open a module to switch individual permissions.' }) +
      panel('Branch access', branchHtml(emp, keys, st, A.ctx.branches), { id: 'acc-branch' }) +
      panel('Task checklist', '<div id="acc-check"></div>', { sub: 'What each screen allows, from the role and position rules — and what you recorded after looking at their real account.' }) +
      panel('Account actions', '<div id="acc-acct"></div>', { sub: 'Owner only. Position, branch and status changes show the access impact first and are logged in HR.' }) +
      panel('Permission history for ' + person.name, '<div id="acc-hist">…</div>', { sub: 'Every access change: old access → new access, who, when, why.' });
    // ---- wiring
    main.querySelectorAll('input[data-key]').forEach((cb) => cb.addEventListener('change', () => toggle(cb.dataset.key, cb.checked)));
    // remember only what the owner opens or closes by hand (the automatic "open if they hold something" must not stick to the next person)
    main.querySelectorAll('details.apc-mod > summary').forEach((s) => s.addEventListener('click', () => { const d = s.parentElement; st.openMods.set(d.dataset.mod, !d.open); }));
    wireBranchSave(main.querySelector('#acc-branch'), A, person);
    main.querySelector('#acc-prev').addEventListener('click', () => choose(A.nextEmployee(-1, A.people().filter((p) => list.ids().includes(p.id)))));
    main.querySelector('#acc-next').addEventListener('click', () => choose(A.nextEmployee(1, A.people().filter((p) => list.ids().includes(p.id)))));
    main.querySelector('#acc-save').addEventListener('click', (e) => guarded(e.target, () => save(false)));
    main.querySelector('#acc-savenext').addEventListener('click', (e) => guarded(e.target, () => save(true)));
    const dis = main.querySelector('#acc-discard'); if (dis) dis.addEventListener('click', () => { st.pending = new Map(); draw(); });
    main.querySelector('#acc-review').addEventListener('click', () => openReview(A, emp, keys, st, (removed, jump) => {
      draw(); toast(removed ? removed + ' permission' + (removed === 1 ? '' : 's') + ' staged for removal — press Save changes to apply.' : 'Review finished — nothing to remove.');
      if (jump) { const d = main.querySelector('details.apc-mod[data-mod="' + jump + '"]'); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }
    }));
    main.querySelector('#acc-verify').addEventListener('click', async (e) => {
      if (st.pending.size) return toast('Save or discard your unsaved changes first — verification records what is in force right now.', true);
      const ok = await dialog({ title: 'Mark access verified — ' + person.name, confirmLabel: 'ACCESS VERIFIED', reason: { label: 'Note (optional)', placeholder: 'e.g. checked against their real account' },
        bodyHtml: '<p>This records the <b>' + emp.effective_keys.length + '</b> permissions ' + esc(person.name) + ' has today. If anything differs later, it shows as ACCESS MISMATCH.</p>' });
      if (!ok) return;
      guarded(e.target, async () => { await A.api.markVerified(person.id, ok.reason); toast('Access verified for ' + person.name + '.'); await A.reload('access'); });
    });
    const correct = main.querySelector('#acc-correct');
    if (correct) correct.addEventListener('click', () => { st.pending = pendingToMatch(emp, review.keys, keys.map((k) => k.key)); draw(); toast(st.pending.size + ' change(s) staged to match what you verified — review them, then Save changes.'); });
    main.querySelector('#acc-preset').addEventListener('change', async (e) => {
      const p = A.ctx.presets.find((x) => x.name === e.target.value); e.target.value = ''; if (!p) return;
      if (await presetFlow(A, emp, keys, st, p)) draw();
    });
    main.querySelector('#acc-reset').addEventListener('click', async (e) => {
      if (!ovs.length) return toast('Nothing to reset — ' + person.name + ' has no custom overrides.');
      const ok = await dialog({ title: 'Reset to position default — ' + person.name, danger: true, confirmLabel: 'Remove ' + ovs.length + ' override' + (ovs.length === 1 ? '' : 's'), reason: { label: 'Reason', required: true, placeholder: 'Why' },
        bodyHtml: '<p>Every custom override is removed, so ' + esc(person.name) + ' gets exactly what their role and position give:</p><ul class="apc-plain">' + ovs.map((o) => '<li>' + esc(label[o.key] || o.key) + ' — ' + (o.granted ? 'granted (will be removed)' : 'taken away (will be given back)') + '</li>').join('') + '</ul>' });
      if (!ok) return;
      guarded(e.target, async () => { await A.api.resetToDefault(person.id, ok.reason); st.pending = new Map(); toast('Reset to the position default.'); await A.reload('access'); });
    });
    renderChecklist(main.querySelector('#acc-check'), A, person.id);
    renderAccountActions(main.querySelector('#acc-acct'), A, Object.assign({}, person, { id: person.id }));
    A.api.history({ from: '2020-01-01', to: A.ctx.today, employee: person.id }).then((rows) => {
      const el = main.querySelector('#acc-hist'); if (!el) return;
      el.innerHTML = rows.length ? '<div class="table-scroll"><table class="sd-tbl"><thead><tr><th>Date</th><th>Change</th><th>Old</th><th>New</th><th>Changed by</th><th>Reason</th></tr></thead><tbody>' +
        rows.slice(0, 25).map((r) => '<tr><td>' + esc(fmtDate(String(r.at).slice(0, 10))) + '</td><td>' + esc(r.permission_label || r.details || r.action) + '</td><td>' + (r.old_access === null || r.old_access === undefined ? dash : yn(r.old_access)) + '</td><td>' + (r.new_access === null || r.new_access === undefined ? dash : yn(r.new_access)) + '</td><td>' + esc(r.changed_by_name || 'System') + '</td><td class="sd-small">' + esc(r.reason || '') + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="muted">No access changes recorded.</p>';
    }).catch((err) => { const el = main.querySelector('#acc-hist'); if (el) el.innerHTML = errorBox(friendly(err)); });
  }
  draw();
  return { destroy() {} };
}
function diffList(ks, label) { return ks.length ? '<ul class="apc-plain">' + ks.slice(0, 40).map((k) => '<li>' + esc(label[k] || k) + '</li>').join('') + (ks.length > 40 ? '<li class="muted">… and ' + (ks.length - 40) + ' more</li>' : '') + '</ul>' : '<p class="muted">None.</p>'; }
