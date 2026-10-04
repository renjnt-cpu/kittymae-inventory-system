// Assets & Supplies Custodian -- the work panels for who holds an asset: assign (with a confirmation summary and a printable form),
// receive a return (condition, missing accessories), ask for it back, transfer to another employee, move to another branch (request ->
// approve -> release -> receive), change condition, accessories, financial details, photos and files, and the employee's own
// acknowledgment. Each opens in the side drawer so it works the same from a list row and from the asset card. The database re-checks every
// rule (who, status, branch, dates); a panel only helps people get it right the first time. Nothing here deletes anything.
import { esc, field, opts, qty, dt, money, openDrawer, closeDrawer, drawerBody, actionPanel, friendly, errorsText, fmtBytes, must, val, personOptions, branchOptions, branchName, statusBadge, conditionBadge } from './assetsUi.js?v=20261004h';
import { ISSUE_CONDITIONS, CONDITIONS, RETURN_OUTCOMES, FILE_KINDS, COST_KINDS, PHOTO_STAGES, FILE_TYPES, MAX_FILE, uniqueSorted, daysBetween } from './assetsLogic.js?v=20261004h';
import { flagInvalid } from './uiKit.js?v=20261004h';

const $ = (id) => document.getElementById(id);
const errBox = (html) => { const b = $('ac-sd-errors'); if (b) b.innerHTML = html ? '<div class="msg error">' + html + '</div>' : ''; if (html && drawerBody('side')) drawerBody('side').scrollTop = 0; };
const gone = (ctx) => ctx.toast('That asset is no longer available to you.', true);
const panel = (a, title, body, footer) => openDrawer('side', { title, sub: a.asset_number + ' · ' + a.name + ' · ' + a.status, body: '<div id="ac-side-msg"></div><div id="ac-sd-errors"></div>' + body, footer });
const checks = (names, checked, name) => names.length ? '<div class="ac-checks">' + names.map((n) => '<label class="lv-check"><input type="checkbox" name="' + name + '" value="' + esc(n) + '"' + (checked ? ' checked' : '') + '> ' + esc(n) + '</label>').join('') + '</div>' : '<p class="muted">No accessories are recorded for this asset.</p>';
const picked = (name) => [...document.querySelectorAll('#ac-side-body input[name="' + name + '"]:checked')].map((x) => x.value);
const holderName = (ctx, a) => (a._asg ? (a._asg.assignee_type === 'Employee' ? a._holder : a._where.replace(/^(In use (at|by)|At) /, '')) : '—');
const whyNot = (ctx, a, act) => {
  const c = ctx.caps;
  if (act === 'assign') return !c.canAssign ? 'Only a custodian can assign assets.' : a._transfer ? 'This asset has a transfer in progress.' : ['Missing', 'Lost'].includes(a.status) ? 'This asset has been reported ' + a.status.toLowerCase() + '. Resolve the report first.' : a._asg ? 'This asset is already assigned to ' + holderName(ctx, a) + '. Return it or transfer it first.' : 'An asset that is ' + a.status + ' cannot be assigned.';
  if (act === 'return') return !c.canReturn ? 'Only a custodian can receive returned assets.' : !a._asg ? 'This asset is not assigned to anyone.' : ['Missing', 'Lost'].includes(a.status) ? 'This asset has been reported ' + a.status.toLowerCase() + '. Resolve the report first (for example mark it Found).' : 'An asset that is ' + a.status + ' cannot be returned right now.';
  return 'That is not possible right now.';
};
const savedState = (ctx, a) => (id) => ctx.byId.get(id) || a;

// ================================================================ assign
export function assignAsset(ctx, id) {
  const a = ctx.byId.get(id);
  if (!a) return gone(ctx);
  if (!ctx.caps.canAssignAsset(a)) { ctx.toast(whyNot(ctx, a, 'assign'), true); return; }
  const startCond = ISSUE_CONDITIONS.includes(a.condition) ? a.condition : 'Good';
  const depts = uniqueSorted([...ctx.departments, ...ctx.assets.map((x) => x.department)]);
  panel(a, 'Assign Asset',
    (['Damaged', 'Unserviceable'].includes(a.condition) ? '<div class="msg lv-warn">This asset is recorded as <b>' + esc(a.condition) + '</b>. Repair it before issuing it — change its condition first if that is out of date.</div>' : '') +
    '<div class="bl-formgrid">' +
      field('Assign to *', '<select id="ac-as-type"><option value="Employee">An employee</option><option value="Branch">The branch (' + esc(a._branch || 'this branch') + ')</option><option value="Department">A department</option><option value="Location">A place / room</option></select>') +
      field('Employee *', '<select id="ac-as-emp">' + personOptions(ctx, { any: 'Choose an employee…' }) + '</select>', { id: 'ac-as-emp-wrap' }) +
      field('Department *', '<select id="ac-as-dept">' + opts(depts, '', 'Choose…') + '</select>', { id: 'ac-as-dept-wrap', hidden: true }) +
      field('Place *', '<input type="text" id="ac-as-loc" maxlength="100" placeholder="e.g. cashier counter">', { id: 'ac-as-loc-wrap', hidden: true }) +
      field('Date issued', '<input type="date" id="ac-as-on" value="' + esc(ctx.today) + '" max="' + esc(ctx.today) + '">') + field('Expected back <span class="muted">(optional)</span>', '<input type="date" id="ac-as-exp" min="' + esc(ctx.today) + '">') +
      field('Condition when issued *', '<select id="ac-as-cond">' + opts(ISSUE_CONDITIONS, startCond) + '</select>') +
    '</div><div id="ac-as-holds"></div>' +
    field('Purpose', '<input type="text" id="ac-as-purpose" maxlength="200" placeholder="e.g. daily work, field trip">') +
    '<h4 class="rf-sub">Accessories handed over</h4>' + checks(a._acc, true, 'as-acc') + field('Notes', '<textarea id="ac-as-notes" rows="2" maxlength="300"></textarea>') +
    '<label class="lv-check"><input type="checkbox" id="ac-as-ack" checked> I confirm the item and accessories above were handed over.</label>' +
    '<div id="ac-as-sum" class="lv-preview"></div>',
    '<button type="button" class="btn" id="ac-as-ok">Assign</button><button type="button" class="btn secondary" id="ac-as-x">Close</button>');
  const typeSel = $('ac-as-type');
  const sync = () => { const t = typeSel.value; $('ac-as-emp-wrap').hidden = t !== 'Employee'; $('ac-as-dept-wrap').hidden = t !== 'Department'; $('ac-as-loc-wrap').hidden = t !== 'Location'; summary(); };
  const summary = () => {
    const t = typeSel.value, emp = ctx.personById[val('ac-as-emp')];
    const to = t === 'Employee' ? (emp ? '<b>' + esc(emp.full_name) + '</b>' + (emp.job_title || emp.position ? ' (' + esc(emp.job_title || emp.position) + ')' : '') : '<i>choose an employee</i>') : t === 'Branch' ? '<b>' + esc(a._branch || 'the branch') + '</b>' : t === 'Department' ? '<b>' + esc(val('ac-as-dept') || '…') + '</b>' : '<b>' + esc(val('ac-as-loc') || '…') + '</b>';
    $('ac-as-sum').innerHTML = '<b>Confirmation summary</b><br>' + esc(a.asset_number) + ' — ' + esc(a.name) + (a.serial_number ? ' (S/N ' + esc(a.serial_number) + ')' : '') + ' will be issued to ' + to + ' on ' + esc(dt(val('ac-as-on'))) + ' in <b>' + esc(val('ac-as-cond')) + '</b> condition' +
      (picked('as-acc').length ? ', with ' + esc(picked('as-acc').join(', ')) : '') + '.' + (t === 'Employee' ? ' They will be asked to confirm they received it, and it stays on their record until it is returned or transferred.' : '');
    const holds = t === 'Employee' && emp ? ctx.assets.filter((x) => x._asg && x._asg.assignee_type === 'Employee' && x._asg.employee_id === emp.id) : [];
    $('ac-as-holds').innerHTML = holds.length ? '<div class="msg lv-note"><b>' + esc(emp.full_name) + '</b> already holds ' + holds.length + ' asset' + (holds.length === 1 ? '' : 's') + ': ' + esc(holds.slice(0, 4).map((x) => x.name).join(', ')) + (holds.length > 4 ? '…' : '') + '</div>' : '';
  };
  ['ac-as-emp', 'ac-as-dept', 'ac-as-loc', 'ac-as-on', 'ac-as-cond'].forEach((i) => $(i).addEventListener('input', summary)); typeSel.addEventListener('change', sync);
  document.querySelectorAll('input[name="as-acc"]').forEach((x) => x.addEventListener('change', summary));
  sync();
  $('ac-as-x').addEventListener('click', () => closeDrawer('side'));
  $('ac-as-ok').addEventListener('click', async () => {
    const t = typeSel.value, btn = $('ac-as-ok'); errBox('');
    if (t === 'Employee' && !val('ac-as-emp')) { flagInvalid($('ac-as-emp')); return errBox('Choose the employee who is receiving the asset.'); }
    if (t === 'Department' && !val('ac-as-dept')) { flagInvalid($('ac-as-dept')); return errBox('Choose the department.'); }
    if (t === 'Location' && !val('ac-as-loc').trim()) { flagInvalid($('ac-as-loc')); return errBox('Enter the place.'); }
    btn.disabled = true;
    try {
      const res = await ctx.api.assignAsset(a.id, { assignee_type: t, employee_id: t === 'Employee' ? val('ac-as-emp') : null, department: t === 'Department' ? val('ac-as-dept') : null, location: t === 'Location' ? val('ac-as-loc').trim() : null,
        branch_id: t === 'Branch' ? a.branch_id : null, issued_on: val('ac-as-on') || null, expected_return_date: val('ac-as-exp') || null, condition_out: val('ac-as-cond'), purpose: val('ac-as-purpose').trim() || null, notes: val('ac-as-notes').trim() || null,
        accessories: picked('as-acc'), custodian_ack: $('ac-as-ack').checked });
      if (res && res.ok === false) { errBox(esc(errorsText(res))); btn.disabled = false; return; }
      await ctx.afterChange(a.asset_number + ' assigned.');
      drawerBody('side').innerHTML = '<div class="msg ok"><b>' + esc(a.asset_number) + '</b> is now assigned. ' + (t === 'Employee' ? 'The employee will see it under “My Assets” and can confirm receipt there.' : '') + '</div>' +
        '<div class="lv-row-actions"><button type="button" class="btn" id="ac-as-print">Print accountability form</button><button type="button" class="btn secondary" id="ac-as-done">Done</button></div>';
      $('ac-side-footer').hidden = true;
      $('ac-as-print').addEventListener('click', () => ctx.print.form('accountability', a.id));
      $('ac-as-done').addEventListener('click', () => closeDrawer('side'));
    } catch (err) { errBox(esc(friendly(err))); btn.disabled = false; }
  });
}

// ================================================================ return
export function returnAsset(ctx, id) {
  const a = ctx.byId.get(id);
  if (!a) return gone(ctx);
  if (!ctx.caps.canReturnAsset(a)) { ctx.toast(whyNot(ctx, a, 'return'), true); return; }
  const o = a._asg, out = o.accessories_out || [];
  panel(a, 'Receive Return',
    '<div class="drawer-section"><p>Coming back from <b>' + esc(holderName(ctx, a)) + '</b> — issued ' + esc(dt(o.issued_on)) + ' in <b>' + esc(o.condition_out || a.condition) + '</b> condition' + (out.length ? ', with ' + esc(out.join(', ')) : '') + '.</p></div>' +
    '<div class="bl-formgrid">' + field('Condition now *', '<select id="ac-rt-cond"><option value="">Choose…</option>' + opts(CONDITIONS, '') + '</select>') + field('Date returned', '<input type="date" id="ac-rt-on" value="' + esc(ctx.today) + '" min="' + esc(o.issued_on) + '" max="' + esc(ctx.today) + '">') +
    field('Where does it go now?', '<select id="ac-rt-out">' + opts(RETURN_OUTCOMES, 'Available') + '</select>', { id: 'ac-rt-out-wrap' }) + '</div>' +
    '<div id="ac-rt-bad" class="msg lv-warn" hidden><b>It came back in poor condition.</b> It will be marked <b>Damaged</b> and a damage report is opened automatically so someone decides: repair, replace, or review who is accountable. Nobody is charged automatically.</div>' +
    (out.length ? '<h4 class="rf-sub">Accessories returned</h4>' + checks(out, true, 'rt-acc') + '<div id="ac-rt-miss" class="msg lv-warn" hidden></div>' : '') +
    field('Notes <span id="ac-rt-notes-req" class="muted">(optional)</span>', '<textarea id="ac-rt-notes" rows="2" maxlength="300" placeholder="Anything worth recording about this return"></textarea>'),
    '<button type="button" class="btn" id="ac-rt-ok">Confirm Return</button><button type="button" class="btn secondary" id="ac-rt-x">Close</button>');
  const sync = () => {
    const bad = ['Needs Repair', 'Damaged', 'Unserviceable'].includes(val('ac-rt-cond')), miss = out.filter((n) => !picked('rt-acc').includes(n));
    $('ac-rt-bad').hidden = !bad; $('ac-rt-out-wrap').hidden = bad;
    if ($('ac-rt-miss')) { $('ac-rt-miss').hidden = !miss.length; $('ac-rt-miss').innerHTML = miss.length ? '<b>Not returned:</b> ' + esc(miss.join(', ')) + '. Explain in the notes (lost, left at the branch…).' : ''; }
    $('ac-rt-notes-req').textContent = miss.length ? '(required — explain what is missing)' : '(optional)';
  };
  $('ac-rt-cond').addEventListener('change', sync); document.querySelectorAll('input[name="rt-acc"]').forEach((x) => x.addEventListener('change', sync)); sync();
  $('ac-rt-x').addEventListener('click', () => closeDrawer('side'));
  $('ac-rt-ok').addEventListener('click', async () => {
    const btn = $('ac-rt-ok'); errBox('');
    if (!val('ac-rt-cond')) { flagInvalid($('ac-rt-cond')); return errBox('Record the condition the asset came back in.'); }
    const miss = out.filter((n) => !picked('rt-acc').includes(n));
    if (miss.length && val('ac-rt-notes').trim().length < 3) { flagInvalid($('ac-rt-notes')); return errBox('Explain what happened to ' + esc(miss.join(', ')) + ' in the notes.'); }
    btn.disabled = true;
    try {
      const res = await ctx.api.returnAsset(a.id, { condition_in: val('ac-rt-cond'), returned_on: val('ac-rt-on') || null, outcome: val('ac-rt-out'), notes: val('ac-rt-notes').trim() || null, accessories_returned: picked('rt-acc') });
      if (res && res.ok === false) { errBox(esc(errorsText(res))); btn.disabled = false; return; }
      await ctx.afterChange(a.asset_number + ' returned' + (res.status === 'Damaged' ? ' — marked Damaged, a damage report was opened.' : '.'));
      drawerBody('side').innerHTML = '<div class="msg ok"><b>' + esc(a.asset_number) + '</b> is back' + (res.status === 'Damaged' ? ' and marked <b>Damaged</b> — a damage report is open for a decision.' : ' — now ' + esc(res.status) + '.') + '</div>' +
        ((res.missing_accessories || []).length ? '<div class="msg lv-warn">Not returned: ' + esc(res.missing_accessories.join(', ')) + '</div>' : '') +
        '<div class="lv-row-actions"><button type="button" class="btn" id="ac-rt-print">Print return form</button><button type="button" class="btn secondary" id="ac-rt-done">Done</button></div>';
      $('ac-side-footer').hidden = true;
      $('ac-rt-print').addEventListener('click', () => ctx.print.form('return', a.id));
      $('ac-rt-done').addEventListener('click', () => closeDrawer('side'));
    } catch (err) { errBox(esc(friendly(err))); btn.disabled = false; }
  });
}

// ================================================================ ask for it back
export function callBack(ctx, id) {
  const a = ctx.byId.get(id);
  if (!a) return gone(ctx);
  if (!ctx.caps.canCallBack(a)) { ctx.toast('Only an asset that is currently assigned can be called back.', true); return; }
  panel(a, 'Ask for Return',
    '<p class="muted">The asset stays with ' + esc(holderName(ctx, a)) + ' until it is actually handed back. This marks it <b>For Return</b> so it shows up on the dashboard — use it when someone is leaving or a loan has ended.</p>' +
    '<div class="bl-formgrid">' + field('Please return by', '<input type="date" id="ac-cb-due" min="' + esc(ctx.today) + '">') + '</div>' + field('Why? *', '<textarea id="ac-cb-reason" rows="2" maxlength="300" placeholder="e.g. resignation, end of project"></textarea>'),
    '<button type="button" class="btn" id="ac-cb-ok">Ask for return</button><button type="button" class="btn secondary" id="ac-cb-x">Close</button>');
  $('ac-cb-x').addEventListener('click', () => closeDrawer('side'));
  $('ac-cb-ok').addEventListener('click', async () => {
    errBox('');
    if (val('ac-cb-reason').trim().length < 3) { flagInvalid($('ac-cb-reason')); return errBox('Say why the asset is being called back.'); }
    $('ac-cb-ok').disabled = true;
    try {
      const res = await ctx.api.requestReturn(a.id, { due_date: val('ac-cb-due') || null, reason: val('ac-cb-reason').trim() });
      if (res && res.ok === false) { errBox(esc(errorsText(res))); $('ac-cb-ok').disabled = false; return; }
      closeDrawer('side'); await ctx.afterChange(a.asset_number + ' marked For Return.');
    } catch (err) { errBox(esc(friendly(err))); $('ac-cb-ok').disabled = false; }
  });
}

// ================================================================ transfer to another employee
export function transferEmployee(ctx, id) {
  const a = ctx.byId.get(id);
  if (!a) return gone(ctx);
  if (!ctx.caps.canTransferEmployee(a)) { ctx.toast('Only an asset that is assigned to an employee can be transferred to another employee.', true); return; }
  panel(a, 'Transfer to Another Employee',
    '<p>Currently with <b>' + esc(holderName(ctx, a)) + '</b>. Both people’s records are kept: this closes ' + esc(holderName(ctx, a)) + '’s assignment as “Transferred” and opens a new one.</p>' +
    '<div class="bl-formgrid">' + field('New holder *', '<select id="ac-te-to">' + personOptions(ctx, { any: 'Choose an employee…' }).replace('value="' + a._holderId + '"', 'value="' + a._holderId + '" disabled') + '</select>') + field('Condition now *', '<select id="ac-te-cond">' + opts(ISSUE_CONDITIONS, ISSUE_CONDITIONS.includes(a.condition) ? a.condition : 'Good') + '</select>') + '</div>' +
    field('Reason *', '<textarea id="ac-te-reason" rows="2" maxlength="300" placeholder="e.g. moved to the Cebu branch team"></textarea>') + field('Notes', '<input type="text" id="ac-te-notes" maxlength="200">') + '<div id="ac-te-sum" class="lv-preview"></div>',
    '<button type="button" class="btn" id="ac-te-ok">Transfer</button><button type="button" class="btn secondary" id="ac-te-x">Close</button>');
  const sum = () => { const p = ctx.personById[val('ac-te-to')]; $('ac-te-sum').innerHTML = '<b>Summary:</b> ' + esc(a.asset_number) + ' moves from ' + esc(holderName(ctx, a)) + ' to ' + (p ? '<b>' + esc(p.full_name) + '</b>' : '<i>choose a person</i>') + '. The new holder will be asked to confirm they received it.'; };
  $('ac-te-to').addEventListener('change', sum); sum();
  $('ac-te-x').addEventListener('click', () => closeDrawer('side'));
  $('ac-te-ok').addEventListener('click', async () => {
    errBox('');
    if (!val('ac-te-to')) { flagInvalid($('ac-te-to')); return errBox('Choose who receives the asset.'); }
    if (val('ac-te-reason').trim().length < 3) { flagInvalid($('ac-te-reason')); return errBox('Say why the asset is being transferred.'); }
    $('ac-te-ok').disabled = true;
    try {
      const res = await ctx.api.transferToEmployee(a.id, { to_employee_id: val('ac-te-to'), condition: val('ac-te-cond'), reason: val('ac-te-reason').trim(), notes: val('ac-te-notes').trim() || null });
      if (res && res.ok === false) { errBox(esc(errorsText(res))); $('ac-te-ok').disabled = false; return; }
      closeDrawer('side'); await ctx.afterChange(a.asset_number + ' transferred.');
    } catch (err) { errBox(esc(friendly(err))); $('ac-te-ok').disabled = false; }
  });
}

// ================================================================ branch to branch
export function branchTransfer(ctx, id) {
  const a = ctx.byId.get(id);
  if (!a) return gone(ctx);
  if (!ctx.caps.canBranchTransfer(a)) { ctx.toast(a._transfer ? 'This asset already has a transfer in progress.' : ['Assigned', 'For Return'].includes(a.status) ? 'This asset is assigned to an employee. Return it (or transfer it to an employee at the other branch) before moving it between branches.' : 'An asset that is ' + a.status + ' cannot be moved between branches.', true); return; }
  panel(a, 'Move to Another Branch',
    '<p>At <b>' + esc(a._branch || '—') + '</b> now. A branch transfer has four steps — <b>request → approval (an Admin or Manager) → release by the sending branch → receipt by the destination</b> — and the asset stays at ' + esc(a._branch || 'its branch') + ' until the destination confirms it arrived. History is kept at every step.</p>' +
    '<div class="bl-formgrid">' + field('Going to *', '<select id="ac-bt-to">' + branchOptions(ctx, '', 'Choose a branch…').replace('value="' + a.branch_id + '"', 'value="' + a.branch_id + '" disabled') + '</select>') + field('Place at the destination', '<input type="text" id="ac-bt-loc" maxlength="100" placeholder="Optional">') + '</div>' +
    field('Why is it moving? *', '<textarea id="ac-bt-reason" rows="2" maxlength="300"></textarea>') + field('Notes', '<input type="text" id="ac-bt-notes" maxlength="200">'),
    '<button type="button" class="btn" id="ac-bt-ok">Request Transfer</button><button type="button" class="btn secondary" id="ac-bt-x">Close</button>');
  $('ac-bt-x').addEventListener('click', () => closeDrawer('side'));
  $('ac-bt-ok').addEventListener('click', async () => {
    errBox('');
    if (!val('ac-bt-to')) { flagInvalid($('ac-bt-to')); return errBox('Choose the branch it is going to.'); }
    if (val('ac-bt-reason').trim().length < 3) { flagInvalid($('ac-bt-reason')); return errBox('Say why the asset is being moved.'); }
    $('ac-bt-ok').disabled = true;
    try {
      const res = await ctx.api.requestBranchTransfer(a.id, { to_branch_id: Number(val('ac-bt-to')), to_location: val('ac-bt-loc').trim() || null, reason: val('ac-bt-reason').trim(), notes: val('ac-bt-notes').trim() || null });
      if (res && res.ok === false) { errBox(esc(errorsText(res))); $('ac-bt-ok').disabled = false; return; }
      closeDrawer('side'); await ctx.afterChange('Transfer ' + res.transfer_number + ' requested — an Admin or Manager must approve it.');
    } catch (err) { errBox(esc(friendly(err))); $('ac-bt-ok').disabled = false; }
  });
}

/** approve / reject / cancel / release / receive one branch transfer */
export function transferAction(ctx, tid, action) {
  const t = ctx.data.transfers.find((x) => x.id === tid);
  if (!t) { ctx.toast('That transfer is no longer available.', true); return; }
  const a = ctx.byId.get(t.asset_id) || { asset_number: '', name: '', status: '' };
  const head = '<p><b>' + esc(t.transfer_number) + '</b> — ' + esc(a.asset_number) + ' ' + esc(a.name) + '<br>' + esc(branchName(ctx, t.from_branch_id)) + ' → <b>' + esc(branchName(ctx, t.to_branch_id)) + '</b> · requested by ' + esc(ctx.names[t.requested_by] || '—') + (t.reason ? '<br><span class="muted">' + esc(t.reason) + '</span>' : '') + '</p>';
  const title = { approve: 'Approve Transfer', reject: 'Reject Transfer', cancel: 'Cancel Transfer', release: 'Release Asset', receive: 'Receive Asset' }[action];
  const onSide = (btnLabel, danger) => '<button type="button" class="btn' + (danger ? ' lv-btn-danger' : '') + '" id="ac-ta-ok">' + btnLabel + '</button><button type="button" class="btn secondary" id="ac-ta-x">Close</button>';
  const run = (label, call, done) => {
    $('ac-ta-x').addEventListener('click', () => closeDrawer('side'));
    $('ac-ta-ok').addEventListener('click', async () => {
      errBox(''); const btn = $('ac-ta-ok');
      try {
        const need = call.need && call.need(); if (need) { errBox(esc(need)); return; }
        btn.disabled = true;
        const res = await call.run();
        if (res && res.ok === false) { errBox(esc(errorsText(res))); btn.disabled = false; return; }
        closeDrawer('side'); await ctx.afterChange(done);
      } catch (err) { errBox(esc(friendly(err))); btn.disabled = false; }
    });
  };
  const mini = { asset_number: a.asset_number, name: a.name, status: t.status };
  if (action === 'approve') {
    panel(mini, title, head + '<p class="muted">Approving does not move the asset yet — the sending branch releases it, then the destination confirms it arrived. You cannot approve a transfer you requested yourself.</p>' + field('Note (optional)', '<input type="text" id="ac-ta-note" maxlength="200">'), onSide('Approve'));
    run('Approve', { run: () => ctx.api.approveBranchTransfer(t.id, val('ac-ta-note').trim()) }, t.transfer_number + ' approved.');
  } else if (action === 'reject' || action === 'cancel') {
    panel(mini, title, head + field('Reason *', '<textarea id="ac-ta-reason" rows="2" maxlength="300"></textarea>') + '<p class="muted">The record is kept. Nothing is deleted.</p>', onSide(title, true));
    run(title, { need: () => (val('ac-ta-reason').trim().length < 3 ? 'A reason is required.' : ''), run: () => (action === 'reject' ? ctx.api.rejectBranchTransfer(t.id, val('ac-ta-reason').trim()) : ctx.api.cancelBranchTransfer(t.id, val('ac-ta-reason').trim())) }, t.transfer_number + (action === 'reject' ? ' rejected.' : ' cancelled.'));
  } else if (action === 'release') {
    panel(mini, title, head + '<div class="msg lv-warn"><b>Releasing sends it out of ' + esc(branchName(ctx, t.from_branch_id)) + '.</b> It becomes <b>Transferred</b> (on its way) and belongs to no branch until ' + esc(branchName(ctx, t.to_branch_id)) + ' receives it.</div>' +
      field('Condition when released', '<select id="ac-ta-cond">' + opts(CONDITIONS, a.condition || 'Good') + '</select>'), onSide('Release'));
    run('Release', { run: () => ctx.api.releaseBranchTransfer(t.id, { condition_out: val('ac-ta-cond') }) }, t.transfer_number + ' released.');
  } else {
    panel(mini, title, head + '<div class="bl-formgrid">' + field('Condition on arrival *', '<select id="ac-ta-cond"><option value="">Choose…</option>' + opts(CONDITIONS, '') + '</select>') + field('Now it is', '<select id="ac-ta-after">' + opts(['Available', 'In Storage'], 'Available') + '</select>') + '</div>' +
      '<div id="ac-ta-bad" class="msg lv-warn" hidden>It arrived in poor condition — it will be marked <b>Damaged</b> and a damage report is opened automatically.</div>' + field('Notes', '<textarea id="ac-ta-notes" rows="2" maxlength="300"></textarea>'), onSide('Confirm Receipt'));
    $('ac-ta-cond').addEventListener('change', () => { $('ac-ta-bad').hidden = !['Needs Repair', 'Damaged', 'Unserviceable'].includes(val('ac-ta-cond')); });
    run('Receive', { need: () => (!val('ac-ta-cond') ? 'Record the condition the asset arrived in.' : ''), run: () => ctx.api.receiveBranchTransfer(t.id, { condition_in: val('ac-ta-cond'), status: val('ac-ta-after'), notes: val('ac-ta-notes').trim() || null }) }, t.transfer_number + ' received.');
  }
}

// ================================================================ condition, accessories, financials
export function condition(ctx, id) {
  const a = ctx.byId.get(id);
  if (!a) return gone(ctx);
  if (!ctx.caps.canCondition(a)) { ctx.toast('You cannot change this asset’s condition.', true); return; }
  panel(a, 'Change Condition',
    '<p>It is <b>' + esc(a.condition) + '</b> now. Every change is recorded with who made it and why. If the asset is actually damaged, use “Report damaged / lost / missing” so someone decides what happens next.</p>' +
    field('New condition *', '<select id="ac-cd-new">' + opts(CONDITIONS.filter((x) => x !== a.condition), '', 'Choose…') + '</select>') + field('Why? *', '<input type="text" id="ac-cd-reason" maxlength="200">'),
    '<button type="button" class="btn" id="ac-cd-ok">Save</button><button type="button" class="btn secondary" id="ac-cd-x">Close</button>');
  $('ac-cd-x').addEventListener('click', () => closeDrawer('side'));
  $('ac-cd-ok').addEventListener('click', async () => {
    errBox('');
    if (!val('ac-cd-new')) { flagInvalid($('ac-cd-new')); return errBox('Choose the new condition.'); }
    if (val('ac-cd-reason').trim().length < 3) { flagInvalid($('ac-cd-reason')); return errBox('Say why the condition is changing.'); }
    $('ac-cd-ok').disabled = true;
    try {
      const res = await ctx.api.setCondition(a.id, val('ac-cd-new'), val('ac-cd-reason').trim());
      if (res && res.ok === false) { errBox(esc(errorsText(res))); $('ac-cd-ok').disabled = false; return; }
      closeDrawer('side'); await ctx.afterChange('Condition changed to ' + val('ac-cd-new') + '.');
      if (res.suggest_report && ctx.caps.canReportOn(ctx.byId.get(a.id))) ctx.toast('The condition is now poor — remember to report it if it needs a decision (More actions → Report damaged).');
    } catch (err) { errBox(esc(friendly(err))); $('ac-cd-ok').disabled = false; }
  });
}
export function accessories(ctx, id) {
  const a = ctx.byId.get(id);
  if (!a) return gone(ctx);
  panel(a, 'Accessories', '<p class="muted">What normally goes out with this asset. A removed accessory is switched off, never deleted, so old assignments still show what was issued.</p>' + field('One per line (or separated by commas)', '<textarea id="ac-ac-list" rows="5">' + esc(a._acc.join('\n')) + '</textarea>'),
    '<button type="button" class="btn" id="ac-ac-ok">Save</button><button type="button" class="btn secondary" id="ac-ac-x">Close</button>');
  $('ac-ac-x').addEventListener('click', () => closeDrawer('side'));
  $('ac-ac-ok').addEventListener('click', async () => {
    errBox(''); $('ac-ac-ok').disabled = true;
    try {
      const names = [...new Set(val('ac-ac-list').split(/[\n,]+/).map((x) => x.trim()).filter(Boolean))];
      const res = await ctx.api.setAccessories(a.id, names);
      if (res && res.ok === false) { errBox(esc(errorsText(res))); $('ac-ac-ok').disabled = false; return; }
      closeDrawer('side'); await ctx.afterChange('Accessories updated.');
    } catch (err) { errBox(esc(friendly(err))); $('ac-ac-ok').disabled = false; }
  });
}
export function financials(ctx, id) {
  const a = ctx.byId.get(id);
  if (!a) return gone(ctx);
  if (!(ctx.caps.viewCost && ctx.caps.canEditAsset(a))) { ctx.toast('You are not allowed to change purchase prices.', true); return; }
  const f = a._fin || {};
  panel(a, 'Financial Details', '<div class="bl-formgrid">' + field('Purchase price (₱)', '<input type="number" id="ac-fn-price" min="0" step="0.01" value="' + esc(f.purchase_price ?? '') + '">') + field('Estimated value (₱)', '<input type="number" id="ac-fn-est" min="0" step="0.01" value="' + esc(f.estimated_value ?? '') + '">') +
    field('Supplier', '<input type="text" id="ac-fn-sup" maxlength="100" value="' + esc(f.supplier || '') + '">') + field('Invoice / receipt no.', '<input type="text" id="ac-fn-inv" maxlength="60" value="' + esc(f.invoice_number || '') + '">') + '</div>' +
    field('Value note', '<input type="text" id="ac-fn-note" maxlength="200" value="' + esc(f.value_note || '') + '">') + field('Reason for the change <span class="muted">(required if the purchase price changes)</span>', '<input type="text" id="ac-fn-reason" maxlength="200">'),
    '<button type="button" class="btn" id="ac-fn-ok">Save</button><button type="button" class="btn secondary" id="ac-fn-x">Close</button>');
  $('ac-fn-x').addEventListener('click', () => closeDrawer('side'));
  $('ac-fn-ok').addEventListener('click', async () => {
    errBox(''); $('ac-fn-ok').disabled = true;
    try {
      const res = await ctx.api.setFinancials(a.id, { purchase_price: val('ac-fn-price') === '' ? null : Number(val('ac-fn-price')), estimated_value: val('ac-fn-est') === '' ? null : Number(val('ac-fn-est')), supplier: val('ac-fn-sup').trim(), invoice_number: val('ac-fn-inv').trim(), value_note: val('ac-fn-note').trim(), reason: val('ac-fn-reason').trim() });
      if (res && res.ok === false) { errBox(esc(errorsText(res))); $('ac-fn-ok').disabled = false; return; }
      closeDrawer('side'); await ctx.afterChange('Financial details saved.');
    } catch (err) { errBox(esc(friendly(err))); $('ac-fn-ok').disabled = false; }
  });
}

// ================================================================ photos and files
export function uploadFile(ctx, id, opts2 = {}) {
  const a = ctx.byId.get(id);
  if (!a) return gone(ctx);
  if (!ctx.caps.canAttach(a)) { ctx.toast('You cannot attach files to this asset.', true); return; }
  const kinds = FILE_KINDS.filter((k) => ctx.caps.viewCost || !COST_KINDS.includes(k));
  panel(a, 'Attach a Photo or File',
    '<p class="muted">JPG, PNG or PDF, up to 10 MB. On a phone, “Take a photo” opens the camera. Files are private to people who can see this asset.</p>' +
    '<div class="bl-formgrid">' + field('What is it? *', '<select id="ac-up-kind">' + opts(kinds, opts2.kind || 'Photo') + '</select>') + field('Photo of', '<select id="ac-up-stage">' + opts(PHOTO_STAGES, opts2.stage || '', '—') + '</select>', { id: 'ac-up-stage-wrap' }) + '</div>' +
    '<div class="lv-row-actions"><label class="btn small">Take a photo<input type="file" id="ac-up-cam" accept="image/*" capture="environment" hidden></label><label class="btn small secondary">Choose a file<input type="file" id="ac-up-file" accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf" hidden></label></div>' +
    '<div id="ac-up-picked" class="lv-preview">No file chosen.</div>',
    '<button type="button" class="btn" id="ac-up-ok" disabled>Upload</button><button type="button" class="btn secondary" id="ac-up-x">Close</button>');
  let file = null;
  const choose = (f) => { file = f || null; const bad = f ? (!FILE_TYPES.test(f.type || '') ? 'Only JPG, JPEG, PNG and PDF files can be attached.' : f.size > MAX_FILE ? 'That file is ' + fmtBytes(f.size) + ' — the limit is 10 MB.' : '') : ''; if (bad) { errBox(esc(bad)); file = null; } else errBox(''); $('ac-up-picked').innerHTML = file ? '<b>' + esc(file.name) + '</b> · ' + esc(fmtBytes(file.size)) : 'No file chosen.'; $('ac-up-ok').disabled = !file; };
  $('ac-up-cam').addEventListener('change', (e) => choose(e.target.files[0])); $('ac-up-file').addEventListener('change', (e) => choose(e.target.files[0]));
  const syncKind = () => { $('ac-up-stage-wrap').hidden = val('ac-up-kind') !== 'Photo'; }; $('ac-up-kind').addEventListener('change', syncKind); syncKind();
  $('ac-up-x').addEventListener('click', () => closeDrawer('side'));
  $('ac-up-ok').addEventListener('click', async () => {
    if (!file) return;
    errBox(''); $('ac-up-ok').disabled = true; $('ac-up-ok').textContent = 'Uploading…';
    try {
      const res = await ctx.api.uploadFile(a.id, file, { kind: val('ac-up-kind'), stage: val('ac-up-kind') === 'Photo' ? val('ac-up-stage') || null : null });
      if (res && res.ok === false) { errBox(esc(errorsText(res))); $('ac-up-ok').disabled = false; $('ac-up-ok').textContent = 'Upload'; return; }
      closeDrawer('side'); await ctx.afterChange('File attached.');
      if (ctx.detail && ctx.detail.id === a.id) ctx.openAsset(a.id, { pane: 'files', keep: true });
    } catch (err) { errBox(esc(friendly(err))); $('ac-up-ok').disabled = false; $('ac-up-ok').textContent = 'Upload'; }
  });
}

// ================================================================ the employee confirms receipt
export function acknowledge(ctx, assignmentId, assetId, role = 'Employee') {
  const a = ctx.byId.get(assetId);
  if (!a) return gone(ctx);
  const o = a._asg;
  if (!o || o.id !== assignmentId) { ctx.toast('That assignment is no longer current.', true); return; }
  const mine = role === 'Employee';
  panel(a, mine ? 'Confirm You Received This' : 'Confirm as ' + role,
    '<div class="drawer-section"><p>' + (mine ? 'I confirm that I received' : 'I confirm that this was handed over:') + ' <b>' + esc(a.asset_number) + ' — ' + esc(a.name) + '</b>' + (a.serial_number ? ' (S/N ' + esc(a.serial_number) + ')' : '') + ' on <b>' + esc(dt(o.issued_on)) + '</b> in <b>' + esc(o.condition_out || a.condition) + '</b> condition' + ((o.accessories_out || []).length ? ', with ' + esc(o.accessories_out.join(', ')) : '') + '.</p>' +
    (mine ? '<p class="muted">This is recorded with the date and your name. If something is wrong (damaged, missing a part), write it in the note — or report a problem on the asset card.</p>' : '') + '</div>' + field('Note (optional)', '<input type="text" id="ac-ak-note" maxlength="200">'),
    '<button type="button" class="btn" id="ac-ak-ok">Confirm</button><button type="button" class="btn secondary" id="ac-ak-x">Close</button>');
  $('ac-ak-x').addEventListener('click', () => closeDrawer('side'));
  $('ac-ak-ok').addEventListener('click', async () => {
    errBox(''); $('ac-ak-ok').disabled = true;
    try {
      const res = await ctx.api.acknowledge(o.id, role, val('ac-ak-note').trim());
      if (res && res.ok === false) { errBox(esc(errorsText(res))); $('ac-ak-ok').disabled = false; return; }
      closeDrawer('side'); await ctx.afterChange('Thank you — recorded.');
    } catch (err) { errBox(esc(friendly(err))); $('ac-ak-ok').disabled = false; }
  });
}
