// Sales & Profit Dashboard -- the Capital tab: owner capital (initial, additional, withdrawals), equipment, stock at cost, receivables and payables.
// Capital is kept apart from sales and from stock. An entry is never deleted: a wrong one is voided with a reason, and every change is in the audit trail.
// There is deliberately no cash balance and no "estimated owner equity" (which was built on it): the Finance > Transactions ledger does not see the real money -- Ren, 2026-10-07.
import { api, esc, money, int, fmtDate, friendly, todayIn } from './sdCore.js?v=20261007i';
import { panel, lockedBox, loadingBox, errorBox, emptyBox, badge, openDrawer, closeDrawer, toast, drawerBody } from './sdUi.js?v=20261007i';
import { createTable } from './sdTable.js?v=20261007i';
import { COLS, ROW_TITLE } from './sdColumns.js?v=20261007i';
import { stats } from './sdTabs.js?v=20261007i';

const TYPES = [
  { id: 'INITIAL_CAPITAL', label: 'Initial capital', hint: 'The money the owner first put into the business.' },
  { id: 'ADDITIONAL_CAPITAL', label: 'Additional capital', hint: 'More money the owner put in later.' },
  { id: 'OWNER_WITHDRAWAL', label: 'Owner withdrawal', hint: 'Money the owner took out of the business.' },
  { id: 'ASSET_PURCHASE', label: 'Asset purchase (equipment)', hint: 'Equipment or an asset bought for the business — listed under Equipment / Assets.' },
  { id: 'OTHER', label: 'Other (memo only)', hint: 'Shown in the list but never used in any figure.' },
];

// Suggestions for the "Payment account" box of a capital entry (free text -- how the owner paid the money in or took it out)
const PAY_ACCOUNTS = ['Cash on hand', 'GCash', 'Maya', 'Bank transfer'];

export function renderCapital(root, ctx) {
  const { filters, can, meta } = ctx; let scope = 'all'; let table = null;
  const tz = meta.tz;
  function draw() {
    const f = filters.server();
    root.innerHTML = '<div id="sd-cp-sum"></div><div id="sd-cp-table"></div>';
    const sum = root.querySelector('#sd-cp-sum');
    sum.innerHTML = panel('Capital Overview', loadingBox(), { sub: 'As of the end of the selected period',
      actions: can.capital_manage ? '<button type="button" class="btn small" id="sd-cp-add">+ Add capital entry</button>' : '' });
    if (can.capital_manage) sum.querySelector('#sd-cp-add').addEventListener('click', () => openForm(null));
    Promise.all([api.capitalSummary(f), api.overview(f).catch(() => null)]).then(([c, ov]) => {
      const oc = (ov && ov.cur) || {};
      sum.querySelector('.sd-panel-body').innerHTML = stats([
        { label: 'Total capital contributions', html: esc(money(c.contributions)), sub: 'Initial + additional capital' },
        { label: 'Owner withdrawals', html: esc(money(c.withdrawals)) }, { label: 'Net capital contribution', html: esc(money(c.net_contribution)), sub: 'Contributions − withdrawals' },
        { label: 'Inventory purchased (period)', html: oc.purchases === null || oc.purchases === undefined ? '<span class="sd-dash">—</span>' : esc(money(oc.purchases)), sub: 'Deliveries priced in the period' },
        { label: 'Inventory sold, at cost (COGS)', html: oc.cogs === null || oc.cogs === undefined ? badge('Cost data missing', 'orange') : esc(money(oc.cogs)), sub: 'Cost of what was sold in the period' },
        { label: 'Current inventory capital', html: c.inventory_cost_value === null || c.inventory_cost_value === undefined ? badge('Cost data missing', 'orange') : esc(money(c.inventory_cost_value)), sub: 'Stock at supplier price · ' + int(c.inventory_units) + ' pcs' },
        { label: 'Receivables', html: c.receivables === null || c.receivables === undefined ? '<span class="sd-dash">—</span>' : esc(money(c.receivables)), sub: 'COD not yet remitted' },
        { label: 'Payables', html: c.payables === null || c.payables === undefined ? '<span class="sd-dash">—</span>' : esc(money(c.payables)), sub: 'Unpaid business expenses' },
        { label: 'Equipment / assets', html: esc(money(c.equipment)), sub: 'Asset purchases recorded here' },
      ]) + (c.notes || []).map((n) => '<p class="muted sd-note">' + esc(n) + '</p>').join('');
    }).catch((err) => { sum.querySelector('.sd-panel-body').innerHTML = err.denied ? lockedBox(err.message) : errorBox(friendly(err)); });

    const holder = root.querySelector('#sd-cp-table');
    holder.innerHTML = '<div class="card sd-sortbar"><div class="field"><label for="sd-cp-scope">Show capital entries</label><select id="sd-cp-scope"><option value="all">All entries up to the end of the period</option><option value="period">Only entries inside the period</option></select></div></div><div id="sd-cp-t"></div>';
    holder.querySelector('#sd-cp-scope').value = scope;
    holder.querySelector('#sd-cp-scope').addEventListener('change', (e) => { scope = e.target.value; table.reload(); });
    const cols = COLS.capital.concat(can.capital_manage ? [{ key: 'id', label: 'Actions', noDetail: true, noExport: true, render: (r) => r.voided ? '<span class="muted" title="' + esc(r.void_reason || '') + '">voided</span>'
      : '<button type="button" class="btn small secondary" data-cap-act="edit" data-id="' + r.id + '">Edit</button> <button type="button" class="btn small secondary" data-cap-act="void" data-id="' + r.id + '">Void</button>' }] : []);
    table = createTable({ root: holder.querySelector('#sd-cp-t'), kind: 'capital', columns: cols, getFilters: () => filters.server(), extra: () => ({ capital_scope: scope }), sort: { key: 'date', dir: 'desc' }, size: 25,
      title: 'Capital entries', exportName: 'capital', subtitle: () => filters.describe(), can: { cost: true, profit: true, expenses: true }, rowTitle: ROW_TITLE.capital, searchPlaceholder: 'Search type, account, reference, notes…' });
    holder.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cap-act]'); if (!b) return;
      e.stopPropagation(); e.preventDefault();
      const row = (table.state.data.rows || []).find((r) => String(r.id) === b.dataset.id); if (!row) return;
      if (b.dataset.capAct === 'edit') openForm(row); else openVoid(row);
    }, true);
  }

  function typeOptions(sel) { return TYPES.map((t) => '<option value="' + t.id + '"' + (sel === t.id ? ' selected' : '') + '>' + esc(t.label) + '</option>').join(''); }
  function openForm(row) {
    const key = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random();
    openDrawer({ title: row ? 'Edit capital entry' : 'Add capital entry', sub: row ? 'Entry #' + row.id : 'Owner capital is separate from sales and stock',
      body: '<div id="sd-cap-msg"></div><div class="sd-form">' +
        '<div class="field"><label for="sd-cap-date">Date</label><input type="date" id="sd-cap-date" value="' + esc(row ? row.date : todayIn(tz)) + '" max="' + esc(todayIn(tz)) + '"></div>' +
        '<div class="field"><label for="sd-cap-type">Type</label><select id="sd-cap-type">' + typeOptions(row ? row.type : 'ADDITIONAL_CAPITAL') + '</select><span class="muted" id="sd-cap-hint"></span></div>' +
        '<div class="field"><label for="sd-cap-amount">Amount (₱)</label><input type="number" id="sd-cap-amount" min="0.01" step="0.01" inputmode="decimal" value="' + esc(row ? row.amount : '') + '"></div>' +
        '<div class="field"><label for="sd-cap-account">Payment account</label><input type="text" id="sd-cap-account" list="sd-cap-accts" maxlength="80" value="' + esc(row ? row.account || '' : '') + '"><datalist id="sd-cap-accts">' + PAY_ACCOUNTS.map((a) => '<option value="' + esc(a) + '">').join('') + '</datalist></div>' +
        '<div class="field"><label for="sd-cap-ref">Reference number</label><input type="text" id="sd-cap-ref" maxlength="80" value="' + esc(row ? row.reference || '' : '') + '"></div>' +
        '<div class="field"><label for="sd-cap-notes">Notes</label><textarea id="sd-cap-notes" rows="3" maxlength="500">' + esc(row ? row.notes || '' : '') + '</textarea></div></div>',
      footer: '<button type="button" class="btn" id="sd-cap-save">' + (row ? 'Save changes' : 'Save entry') + '</button><button type="button" class="btn secondary" id="sd-cap-cancel">Cancel</button>' });
    const $ = (id) => document.getElementById(id);
    const hint = () => { $('sd-cap-hint').textContent = (TYPES.find((t) => t.id === $('sd-cap-type').value) || {}).hint || ''; };
    $('sd-cap-type').addEventListener('change', hint); hint();
    $('sd-cap-cancel').addEventListener('click', closeDrawer);
    $('sd-cap-save').addEventListener('click', async () => {
      const btn = $('sd-cap-save'); btn.disabled = true; $('sd-cap-msg').innerHTML = '';
      try {
        const res = await api.capitalSave({ id: row && row.id, date: $('sd-cap-date').value, type: $('sd-cap-type').value, amount: Number($('sd-cap-amount').value), account: $('sd-cap-account').value, reference: $('sd-cap-ref').value, notes: $('sd-cap-notes').value, client_key: row ? null : key });
        void res; closeDrawer(); toast(row ? 'Capital entry updated.' : 'Capital entry saved.'); ctx.reloadAll();
      } catch (err) { $('sd-cap-msg').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; btn.disabled = false; }
    });
  }
  function openVoid(row) {
    openDrawer({ title: 'Void capital entry', sub: 'Entry #' + row.id + ' · ' + fmtDate(row.date) + ' · ' + money(row.amount),
      body: '<div id="sd-cap-msg"></div><div class="lv-action-panel lv-danger"><h4>Void this entry?</h4><p>It will no longer count in any figure. It stays in the list and in the audit trail, marked as voided.</p>' +
        '<div class="field"><label for="sd-cap-reason">Reason (required)</label><textarea id="sd-cap-reason" rows="3" maxlength="300" placeholder="e.g. entered twice by mistake"></textarea></div></div>',
      footer: '<button type="button" class="btn lv-btn-danger" id="sd-cap-void">Void entry</button><button type="button" class="btn secondary" id="sd-cap-cancel">Back</button>' });
    document.getElementById('sd-cap-cancel').addEventListener('click', closeDrawer);
    document.getElementById('sd-cap-void').addEventListener('click', async () => {
      const btn = document.getElementById('sd-cap-void'); btn.disabled = true;
      try { await api.capitalVoid(row.id, document.getElementById('sd-cap-reason').value); closeDrawer(); toast('Capital entry voided.'); ctx.reloadAll(); }
      catch (err) { document.getElementById('sd-cap-msg').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; btn.disabled = false; }
    });
  }
  return { reload: draw };
}
void emptyBox; void drawerBody;
