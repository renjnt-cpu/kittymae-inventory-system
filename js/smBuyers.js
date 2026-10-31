// Scrap Monitoring page -- "Scrap Buyers": who the scrap is sold to, what each buyer has taken and paid, and what they still owe. Buyers are never deleted (their sales must stay readable):
// a buyer who is no longer used is switched to inactive and drops out of the pick-lists.
import { esc, grams, money, num, fmtDate, friendly, plural, debounce, PAY_METHODS, saleStatusBadge, payBadge, kindOfSale } from './smFormat.js?v=20261031a';
import { openDrawer, closeDrawer, drawerBody, drawerFooter, emptyBox, kv } from './smUi.js?v=20261031a';

const canEdit = (ctx) => !!ctx.can.manage_buyers;
const canAdd = (ctx) => !!(ctx.can.manage_buyers || ctx.can.sell);

export async function renderBuyers(ctx, panel) {
  const st = ctx.ui.buyers || (ctx.ui.buyers = { q: '', inactive: false });
  const v = ctx.value;
  panel.innerHTML = '<p class="sm-tabhint muted">The people and companies the scrap is sold to. Open a buyer to see everything they bought and what they still owe.</p>' +
    '<div class="card sm-toolbar"><div class="sm-toolrow"><div class="field sm-grow"><label for="smbuy-q">Search</label><input id="smbuy-q" type="search" value="' + esc(st.q) + '" placeholder="Name, contact person, number…"></div>' +
    '<div class="field"><label>&nbsp;</label><label class="sm-check"><input type="checkbox" id="smbuy-inactive"' + (st.inactive ? ' checked' : '') + '> Show inactive buyers</label></div>' +
    '<div class="field"><label>&nbsp;</label><div class="sm-btnrow">' + (canAdd(ctx) ? '<button type="button" class="btn small" id="smbuy-add">+ Add buyer</button>' : '') + '<button type="button" class="btn small secondary" id="smbuy-reload">↻ Refresh</button></div></div></div></div>' +
    '<div id="smbuy-body"><p class="muted">Loading…</p></div>';
  const body = panel.querySelector('#smbuy-body');
  let all = [];

  function draw() {
    const q = st.q.trim().toLowerCase();
    const rows = all.filter((b) => (st.inactive || b.active) && (!q || [b.name, b.contact_person, b.contact_number, b.address].join(' ').toLowerCase().includes(q)));
    if (!rows.length) { body.innerHTML = emptyBox(all.length ? 'No buyer matches.' : 'No buyer has been added yet.' + (canAdd(ctx) ? ' Use “+ Add buyer”, or add one while you record a sale.' : '')); return; }
    const owing = rows.reduce((t, b) => t + (Number(b.outstanding) || 0), 0);
    body.innerHTML = '<div class="sm-chips"><span class="sm-chip"><b>' + rows.length + '</b> ' + (rows.length === 1 ? 'buyer' : 'buyers') + '</span>' +
      (v ? '<span class="sm-chip">bought <b>' + esc(money(rows.reduce((t, b) => t + (Number(b.total_amount) || 0), 0))) + '</b></span><span class="sm-chip">still owe <b' + (owing > 0 ? ' style="color:#c62828;"' : '') + '>' + esc(money(owing)) + '</b></span>' : '') + '</div>' +
      '<div class="table-scroll table-2col"><table class="sm-table"><thead><tr><th>Buyer</th><th>Contact</th><th>Usually pays by</th><th class="sm-num">Sales</th><th class="sm-num">Grams bought</th>' +
      (v ? '<th class="sm-num">Total</th><th class="sm-num">Still owes</th>' : '') + '<th>Last sale</th><th>Status</th><th></th></tr></thead><tbody>' +
      rows.map((b) => '<tr data-id="' + esc(b.id) + '" class="' + (b.active ? '' : 'sm-row-inactive') + '"><td data-label="Buyer"><button type="button" class="sm-link" data-open-buyer="' + esc(b.id) + '"><b>' + esc(b.name) + '</b></button></td>' +
        '<td data-label="Contact" class="sm-wrap">' + esc(b.contact_person || '—') + (b.contact_number ? '<div class="muted sm-small">' + esc(b.contact_number) + '</div>' : '') + '</td>' +
        '<td data-label="Usually pays by">' + esc(b.payment_method || '—') + '</td><td data-label="Sales" class="sm-num">' + esc(b.transactions) + '</td><td data-label="Grams bought" class="sm-num">' + esc(num(b.total_g)) + ' g</td>' +
        (v ? '<td data-label="Total" class="sm-num">' + esc(money(b.total_amount)) + '</td><td data-label="Still owes" class="sm-num">' + (Number(b.outstanding) > 0 ? '<b style="color:#c62828;">' + esc(money(b.outstanding)) + '</b>' : esc(money(0))) + '</td>' : '') +
        '<td data-label="Last sale">' + esc(b.last_sale ? fmtDate(b.last_sale) : '—') + '</td><td data-label="Status">' + (b.active ? '<span class="badge sm-badge sm-st-confirmed">Active</span>' : '<span class="badge sm-badge sm-st-converted">Inactive</span>') + '</td>' +
        '<td class="full-row"><div class="sm-rowact"><button type="button" class="btn small secondary" data-open-buyer="' + esc(b.id) + '">Open</button>' + (canEdit(ctx) ? '<button type="button" class="btn small secondary" data-edit-buyer="' + esc(b.id) + '">Edit</button>' : '') + '</div></td></tr>').join('') + '</tbody></table></div>';
    body.querySelectorAll('[data-open-buyer]').forEach((x) => x.addEventListener('click', () => openBuyer(ctx, all.find((b) => String(b.id) === x.dataset.openBuyer), load)));
    body.querySelectorAll('[data-edit-buyer]').forEach((x) => x.addEventListener('click', () => openBuyerForm(ctx, all.find((b) => String(b.id) === x.dataset.editBuyer), load)));
  }
  async function load() {
    try {
      const res = await ctx.api.buyersList(true);
      if (!res || res.ok === false) { body.innerHTML = '<div class="msg error">' + esc((res && res.message) || 'The buyers could not be loaded.') + '</div>'; return; }
      all = res.rows || []; draw();
    } catch (err) { body.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; }
  }
  panel.querySelector('#smbuy-q').addEventListener('input', debounce((e) => { st.q = e.target.value; draw(); }, 200));
  panel.querySelector('#smbuy-inactive').addEventListener('change', (e) => { st.inactive = e.target.checked; draw(); });
  panel.querySelector('#smbuy-reload').addEventListener('click', load);
  const add = panel.querySelector('#smbuy-add'); if (add) add.addEventListener('click', () => openBuyerForm(ctx, null, load));
  await load();
}

// ---------------------------------------------------------------- one buyer
export async function openBuyer(ctx, b, reload) {
  if (!b) return;
  const v = ctx.value;
  openDrawer('detail', { title: b.name, sub: b.active ? 'Scrap buyer' : 'Scrap buyer · inactive', body: '<div id="sm-detail-msg"></div><p class="muted">Loading…</p>',
    footer: (canEdit(ctx) ? '<button type="button" class="btn" data-edit>Edit buyer</button>' : '') + '<button type="button" class="btn secondary" data-close>Close</button>' });
  const foot = drawerFooter('detail');
  foot.querySelector('[data-close]').addEventListener('click', () => closeDrawer('detail'));
  const edit = foot.querySelector('[data-edit]'); if (edit) edit.addEventListener('click', () => { closeDrawer('detail'); openBuyerForm(ctx, b, reload); });
  let sales = null, err = '';
  try { const r = await ctx.api.salesList({ buyer_id: b.id }, 100, 0, 'newest'); if (r && r.ok !== false) sales = r.rows || []; else err = (r && r.message) || ''; } catch (e) { err = friendly(e); }
  drawerBody('detail').innerHTML = '<div id="sm-detail-msg"></div><div class="drawer-section"><h4>Details</h4>' +
    kv('Contact person', esc(b.contact_person || '—')) + kv('Contact number', esc(b.contact_number || '—')) + kv('Address', esc(b.address || '—')) + kv('Usually pays by', esc(b.payment_method || '—')) +
    (b.notes ? kv('Notes', esc(b.notes)) : '') + '</div>' +
    '<div class="drawer-section"><h4>What this buyer has taken</h4>' + kv('Sales', esc(b.transactions)) + kv('Grams bought', esc(grams(b.total_g))) + kv('Last sale', esc(b.last_sale ? fmtDate(b.last_sale) : '—')) +
    (v ? kv('Total bought', esc(money(b.total_amount))) + kv('Paid so far', esc(money(b.paid))) + kv('Still owes', Number(b.outstanding) > 0 ? '<span style="color:#c62828;">' + esc(money(b.outstanding)) + '</span>' : esc(money(0))) : '') + '</div>' +
    '<div class="drawer-section"><h4>Sales to this buyer</h4>' + (err ? '<div class="msg error">' + esc(err) + '</div>' : !sales ? '' : !sales.length ? '<p class="muted">Nothing has been sold to this buyer yet.</p>' :
      '<div class="table-scroll table-2col"><table class="sm-table"><thead><tr><th>Number</th><th>Date</th><th>Branch</th><th class="sm-num">Grams</th>' + (v ? '<th class="sm-num">Amount</th><th>Payment</th>' : '') + '<th>Status</th></tr></thead><tbody>' +
      sales.map((s) => '<tr><td data-label="Number"><button type="button" class="sm-link" data-open-sale="' + esc(s.id) + '"><b>' + esc(s.sale_number) + '</b></button></td><td data-label="Date">' + esc(fmtDate(s.sale_date)) + '</td><td data-label="Branch">' + esc(s.branch_name) + '</td>' +
        '<td data-label="Grams" class="sm-num">' + esc(num(s.total_grams)) + ' g</td>' + (v ? '<td data-label="Amount" class="sm-num">' + esc(money(s.total_amount)) + '</td><td data-label="Payment">' + (s.status === 'CONFIRMED' ? payBadge(s.payment_status) : '') + '</td>' : '') +
        '<td data-label="Status">' + saleStatusBadge(s.status) + '</td></tr>').join('') + '</tbody></table></div>') + '</div>';
  drawerBody('detail').querySelectorAll('[data-open-sale]').forEach((x) => x.addEventListener('click', () => ctx.openSale(Number(x.dataset.openSale))));
}

// ---------------------------------------------------------------- add / change a buyer
export function openBuyerForm(ctx, b, onSaved) {
  const isNew = !b, cur = b || { active: true };
  openDrawer('side', { title: isNew ? 'Add scrap buyer' : 'Edit ' + b.name, sub: '', footer: '<button type="button" class="btn" id="smbf-ok">' + (isNew ? 'Add buyer' : 'Save changes') + '</button><button type="button" class="btn secondary" id="smbf-cancel">Cancel</button>',
    body: '<div id="sm-side-msg"></div><div class="sm-form-sec"><div class="sm-grid">' +
      '<div class="field"><label for="smbf-name">Name *</label><input id="smbf-name" type="text" value="' + esc(cur.name || '') + '" autocomplete="off"></div>' +
      '<div class="field"><label for="smbf-person">Contact person</label><input id="smbf-person" type="text" value="' + esc(cur.contact_person || '') + '"></div>' +
      '<div class="field"><label for="smbf-num">Contact number</label><input id="smbf-num" type="text" inputmode="tel" value="' + esc(cur.contact_number || '') + '"></div>' +
      '<div class="field"><label for="smbf-addr">Address</label><input id="smbf-addr" type="text" value="' + esc(cur.address || '') + '"></div>' +
      '<div class="field"><label for="smbf-pm">Usually pays by</label><select id="smbf-pm"><option value="">—</option>' + PAY_METHODS.map((m) => '<option' + (cur.payment_method === m ? ' selected' : '') + '>' + esc(m) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="smbf-notes">Notes</label><input id="smbf-notes" type="text" value="' + esc(cur.notes || '') + '"></div>' +
      (isNew ? '' : '<div class="field"><label>&nbsp;</label><label class="sm-check"><input type="checkbox" id="smbf-active"' + (cur.active ? ' checked' : '') + '> This buyer is active</label></div>') + '</div>' +
      (isNew ? '' : '<p class="muted sm-small">A buyer is never deleted — their past sales stay readable. Untick “active” to stop offering them when a sale is entered.</p>') + '</div>' });
  const $ = (id) => document.getElementById(id);
  $('smbf-cancel').addEventListener('click', () => closeDrawer('side'));
  $('smbf-name').focus();
  $('smbf-ok').addEventListener('click', async () => {
    const name = $('smbf-name').value.trim();
    if (!name) { ctx.toast('Enter the buyer\'s name.', true); return; }
    $('smbf-ok').disabled = true;
    try {
      const res = await ctx.api.buyerSave({ id: isNew ? null : b.id, name, contact_person: $('smbf-person').value.trim(), contact_number: $('smbf-num').value.trim(), address: $('smbf-addr').value.trim(),
        payment_method: $('smbf-pm').value, notes: $('smbf-notes').value.trim(), active: isNew ? true : $('smbf-active').checked });
      if (res && res.ok === false) throw new Error(res.message);
      closeDrawer('side'); ctx.toast(isNew ? 'Buyer added.' : 'Buyer saved.');
      ctx.reloadOptions().catch(() => {});
      if (onSaved) onSaved();
    } catch (err) { ctx.toast(err, true); $('smbf-ok').disabled = false; }
  });
}
