// Payment Verification page -- the Payment Accounts tab: the accounts customers pay into (only the last four digits of an account number are ever shown), which of
// them each Pancake payment method really is, and what each payment method needs before it can be verified (a picture, a reference number).
import { esc, money, fmtDate, manilaDay, friendly, plural } from './pvFormat.js?v=20261030b';
import { openDrawer, closeDrawer, drawerBody, drawerFooter, emptyBox } from './pvUi.js?v=20261030b';

const ACCOUNT_TYPES = ['GCash', 'Maya', 'BDO', 'BPI', 'PS Bank', 'Union Bank', 'Palawan Pay', 'Bank Transfer', 'Other Bank', 'Other E-Wallet', 'Cash Deposit', 'Other'];

export async function renderAccounts(ctx, panel) {
  panel.innerHTML = '<p class="muted">Loading…</p>';
  let acc, pm, rules;
  try { [acc, pm, rules] = await Promise.all([ctx.api.accountsList(), ctx.api.pancakeMethodsList().catch(() => null), ctx.api.methodRulesList().catch(() => null)]); }
  catch (err) { panel.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; return; }
  if (!acc || acc.ok === false) { panel.innerHTML = '<div class="msg error">' + esc((acc && acc.message) || 'The accounts could not be loaded.') + '</div>'; return; }
  const manage = !!acc.can_manage;
  ctx.accounts = (acc.accounts || []).filter((a) => a.active);
  const accounts = acc.accounts || [];
  const methods = (rules && rules.ok !== false ? rules.rules : []) || [];

  panel.innerHTML =
    '<div class="card"><div class="pv-cardhead"><div><h3 class="pv-h3">Payment accounts</h3><p class="muted">The accounts customers pay into. Account numbers are shown as the last four digits only.</p></div>' +
      (manage ? '<button type="button" class="btn small" id="pv-acc-add">+ Add account</button>' : '') + '</div>' +
      (accounts.length ? '<div class="table-scroll table-2col"><table class="pv-table"><thead><tr><th>Account</th><th>Type</th><th>Number</th><th>Status</th><th>Payments</th><th>Verified</th><th></th></tr></thead><tbody>' +
        accounts.map((a) => '<tr><td data-label="Account"><b>' + esc(a.name) + '</b></td><td data-label="Type">' + esc(a.type) + '</td><td data-label="Number">' + (a.masked ? '<span class="pv-ref">' + esc(a.masked) + '</span>' : '<span class="muted">not set</span>') + '</td>' +
          '<td data-label="Status">' + (a.active ? '<span class="badge pv-badge pv-st-verified">Active</span>' : '<span class="badge pv-badge pv-st-none">Off</span>') + '</td><td data-label="Payments">' + esc(Number(a.payments).toLocaleString('en-PH')) + '</td>' +
          '<td data-label="Verified">' + esc(money(a.verified_amount)) + '</td><td class="full-row">' + (manage ? '<button type="button" class="btn small secondary" data-edit-acc="' + esc(a.id) + '">Edit</button>' : '') + '</td></tr>').join('') + '</tbody></table></div>'
        : emptyBox('No payment account is set up yet.' + (manage ? ' Add the GCash, Maya and bank accounts customers pay into.' : ''))) + '</div>' +

    '<div class="card"><h3 class="pv-h3">Pancake payment methods</h3><p class="muted">Pancake POS numbers its payment methods. Tell the system which of your accounts each number is, and every payment imported from Pancake shows the right method and account. ' +
      'The sample references and typical amounts below are there to help you recognise which is which.</p>' +
      (pm && pm.ok !== false && (pm.methods || []).length ? '<div class="table-scroll table-2col"><table class="pv-table"><thead><tr><th>Pancake method</th><th>Payments</th><th>Typical amount</th><th>Recent references</th><th>Method</th><th>Account</th><th></th></tr></thead><tbody>' +
        pm.methods.map((m, i) => '<tr data-pm="' + i + '"><td data-label="Pancake method"><b>#' + esc(m.payment_id) + '</b>' + (m.label ? ' ' + esc(m.label) : '') + (m.mapped ? '' : ' <span class="badge pv-badge pv-st-pending">not linked</span>') + '</td>' +
          '<td data-label="Payments">' + esc(Number(m.uses).toLocaleString('en-PH')) + '</td><td data-label="Typical amount">' + esc(m.avg_amount != null ? money(m.avg_amount) : '—') + '</td>' +
          '<td data-label="Recent references" class="pv-ref pv-small">' + esc((m.sample_refs || []).join(' · ') || '—') + '</td>' +
          '<td data-label="Method"><select class="pv-pm-method"' + (pm.can_manage ? '' : ' disabled') + '><option value="">—</option>' + methods.map((r) => '<option value="' + esc(r.method) + '"' + (r.method === m.method ? ' selected' : '') + '>' + esc(r.method) + '</option>').join('') + '</select></td>' +
          '<td data-label="Account"><select class="pv-pm-account"' + (pm.can_manage ? '' : ' disabled') + '><option value="">—</option>' + accounts.filter((a) => a.active || String(a.id) === String(m.account_id)).map((a) => '<option value="' + esc(a.id) + '"' + (String(a.id) === String(m.account_id) ? ' selected' : '') + '>' + esc(a.name) + '</option>').join('') + '</select></td>' +
          '<td class="full-row">' + (pm.can_manage ? '<button type="button" class="btn small" data-save-pm="' + i + '">Save</button>' : '') + '</td></tr>').join('') + '</tbody></table></div>'
        : '<p class="muted">No Pancake payment method has been seen yet.</p>') + '</div>' +

    '<div class="card"><h3 class="pv-h3">What each payment method needs</h3><p class="muted">A payment cannot be verified until it has what its method needs. A method that is turned off is no longer offered when adding a proof.</p>' +
      (methods.length ? '<div class="table-scroll table-2col"><table class="pv-table"><thead><tr><th>Method</th><th>Picture of the payment</th><th>Reference number</th><th>Offered</th></tr></thead><tbody>' +
        methods.map((r) => '<tr data-rule="' + esc(r.method) + '"><td data-label="Method"><b>' + esc(r.method) + '</b></td>' +
          '<td data-label="Picture"><label class="pv-check"><input type="checkbox" data-rule-field="proof" ' + (r.proof_required ? 'checked ' : '') + (rules.can_manage ? '' : 'disabled') + '> required</label></td>' +
          '<td data-label="Reference"><label class="pv-check"><input type="checkbox" data-rule-field="reference" ' + (r.reference_required ? 'checked ' : '') + (rules.can_manage ? '' : 'disabled') + '> required</label></td>' +
          '<td data-label="Offered"><label class="pv-check"><input type="checkbox" data-rule-field="active" ' + (r.active ? 'checked ' : '') + (rules.can_manage ? '' : 'disabled') + '> yes</label></td></tr>').join('') + '</tbody></table></div>'
        : '<p class="muted">The payment method rules could not be loaded.</p>') + '</div>';

  const open = (a) => accountForm(ctx, a, async () => { await renderAccounts(ctx, panel); });
  const add = panel.querySelector('#pv-acc-add');
  if (add) add.addEventListener('click', () => open(null));
  panel.querySelectorAll('[data-edit-acc]').forEach((b) => b.addEventListener('click', () => open(accounts.find((a) => String(a.id) === b.dataset.editAcc))));
  panel.querySelectorAll('[data-save-pm]').forEach((b) => b.addEventListener('click', async () => {
    const tr = b.closest('tr'), m = pm.methods[Number(b.dataset.savePm)];
    const method = tr.querySelector('.pv-pm-method').value, accountId = tr.querySelector('.pv-pm-account').value;
    if (!method && !accountId) { ctx.toast('Choose the method or the account first.', true); return; }
    b.disabled = true;
    try {
      const r = await ctx.api.pancakeMethodMap(m.shop, m.payment_id, accountId ? Number(accountId) : null, method || null);
      if (r.ok === false) throw new Error(r.message);
      ctx.toast('Saved. ' + plural(r.updated || 0, 'payment') + ' updated.');
      await renderAccounts(ctx, panel);
    } catch (err) { ctx.toast(err.message || String(err), true); b.disabled = false; }
  }));
  panel.querySelectorAll('[data-rule] [data-rule-field]').forEach((cb) => cb.addEventListener('change', async () => {
    const tr = cb.closest('tr'), get = (f) => tr.querySelector('[data-rule-field="' + f + '"]').checked;
    cb.disabled = true;
    try {
      const r = await ctx.api.methodRuleSave(tr.dataset.rule, get('proof'), get('reference'), get('active'));
      if (r.ok === false) throw new Error(r.message);
      ctx.toast(tr.dataset.rule + ' updated.');
      ctx.methods = (await ctx.api.methodRulesList()).rules.filter((x) => x.active);
    } catch (err) { ctx.toast(err.message || String(err), true); cb.checked = !cb.checked; }
    cb.disabled = false;
  }));
}

function accountForm(ctx, a, done) {
  const edit = !!a;
  openDrawer('side', {
    title: edit ? 'Edit account' : 'Add payment account', sub: '',
    body: '<div id="pv-side-msg"></div><div class="field"><label for="pv-acc-name">Account name</label><input id="pv-acc-name" type="text" maxlength="80" value="' + esc(edit ? a.name : '') + '" placeholder="e.g. GCash — Kittymae Main"></div>' +
      '<div class="field"><label for="pv-acc-type">Type</label><select id="pv-acc-type">' + ACCOUNT_TYPES.map((t) => '<option' + (edit && a.type === t ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="pv-acc-num">Account number' + (edit && a.masked ? ' <span class="muted">(currently ' + esc(a.masked) + ' — leave empty to keep it)</span>' : '') + '</label><input id="pv-acc-num" type="text" inputmode="numeric" autocomplete="off" placeholder="Only the last four digits are ever shown"></div>' +
      '<div class="field"><label class="pv-check"><input type="checkbox" id="pv-acc-active"' + (!edit || a.active ? ' checked' : '') + '> Active (offered when adding a payment proof)</label></div>' +
      '<div id="pv-acc-err"></div>',
    footer: '<button type="button" class="btn" id="pv-acc-save">Save account</button><button type="button" class="btn secondary" id="pv-acc-cancel">Cancel</button>',
  });
  const body = drawerBody('side');
  drawerFooter('side').querySelector('#pv-acc-cancel').addEventListener('click', () => closeDrawer('side'));
  drawerFooter('side').querySelector('#pv-acc-save').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const r = await ctx.api.accountSave({ id: edit ? a.id : null, name: body.querySelector('#pv-acc-name').value, type: body.querySelector('#pv-acc-type').value, number: body.querySelector('#pv-acc-num').value, active: body.querySelector('#pv-acc-active').checked });
      if (r.ok === false) throw new Error(r.message);
      closeDrawer('side');
      ctx.toast(edit ? 'Account saved.' : 'Account added.');
      await done();
    } catch (err) { body.querySelector('#pv-acc-err').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; e.target.disabled = false; }
  });
}
