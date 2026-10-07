// Assets & Supplies Custodian -- add a new asset, or edit an existing asset's DETAILS. The form is never where status, holder or branch change:
// an asset becomes assigned through Assign, moves between people through Transfer, between branches through a branch transfer, and its
// condition changes through "Change condition" -- each of those writes the permanent history. A possible duplicate (same serial number or
// tag) is flagged with "POSSIBLE DUPLICATE ASSET" and needs a deliberate "these are different assets" before it saves; a blank serial number
// is never treated as a duplicate.
import { esc, field, opts, openDrawer, closeDrawer, drawerBody, isDrawerOpen, actionPanel, errorsText, friendly, branchOptions, categoryOptions, personOptions, val, statusBadge } from './assetsUi.js?v=20261007j';
import { CONDITIONS, OWNERSHIP, COMPANIES, uniqueSorted } from './assetsLogic.js?v=20261007j';
import { flagInvalid as flag } from './uiKit.js?v=20261007j';

const $ = (id) => document.getElementById(id);
let dirty = false, ctxRef = null;

export function requestCloseForm() {
  if (!isDrawerOpen('form')) return;
  if (!dirty || !$('ac-form-msg')) { closeDrawer('form'); return; }
  actionPanel('form', { title: 'Discard your changes?', message: 'What you typed has not been saved.', okLabel: 'Discard', danger: true, onOk: async () => { dirty = false; closeDrawer('form'); } });
}
const lines = (s) => [...new Set(String(s || '').split(/[\n,]+/).map((x) => x.trim()).filter(Boolean))];
const num = (v) => (v === '' ? null : Number(v));

export function openAssetForm(ctx, { id } = {}) {
  ctxRef = ctx;
  const a = id ? ctx.byId.get(id) : null, c = ctx.caps;
  if (id && !a) { ctx.toast('That asset is no longer available to you.', true); return; }
  if (a && !c.canEditAsset(a)) { ctx.toast(['Disposed', 'Archived'].includes(a.status) ? 'A disposed or archived asset can no longer be edited.' : 'Only a custodian can edit asset details.', true); return; }
  if (!a && !c.canAdd) { ctx.toast('Only a custodian can add assets.', true); return; }
  dirty = false;
  const cur = a || {}, edit = !!a;
  const depts = uniqueSorted([...ctx.departments, ...ctx.assets.map((x) => x.department)]);
  const defBranch = edit ? cur.branch_id : (c.viewAll ? ctx.employee.branch_id : ctx.employee.branch_id) || '';
  const fin = cur._fin || {};
  const body = '<div id="ac-form-msg"></div><div id="ac-form-errors"></div>' +
    (edit ? '<div class="msg lv-note">Editing the details of <b>' + esc(cur.asset_number) + '</b>. Who holds it, its status, its branch and its condition change through their own actions (Assign, Return, Transfer, Change condition) so the history stays true.</div>' : '') +
    '<form id="ac-form" novalidate><div class="bl-formgrid">' +
    field('Asset name *', '<input type="text" name="name" maxlength="120" required value="' + esc(cur.name || '') + '" placeholder="e.g. Lenovo ThinkPad E14">') +
    field('Category', '<select name="category_id">' + categoryOptions(ctx, 'Asset', cur.category_id || '', 'Choose…') + '</select>') +
    (edit ? field('Branch', '<div class="ac-readonly">' + esc(cur._branch || '—') + ' <span class="muted">— move it with “Move to another branch”</span></div>')
      : field('Branch *', '<select name="branch_id" required>' + branchOptions(ctx, defBranch, 'Choose…') + '</select>' + (c.viewAll ? '' : '<span class="muted">You can add assets at your own branch.</span>'))) +
    field('Brand', '<input type="text" name="brand" maxlength="60" value="' + esc(cur.brand || '') + '">') + field('Model', '<input type="text" name="model" maxlength="60" value="' + esc(cur.model || '') + '">') +
    field('Serial number', '<input type="text" name="serial_number" maxlength="80" value="' + esc(cur.serial_number || '') + '" autocomplete="off">') +
    field('Asset tag', '<input type="text" name="asset_tag" maxlength="60" value="' + esc(cur.asset_tag || '') + '" placeholder="Optional — the sticker on the item"><span class="muted">The asset number (' + esc(cur.asset_number || 'AST-…') + ') is assigned automatically and never changes.</span>') +
    field('Company', '<select name="company">' + opts(uniqueSorted([...COMPANIES, ...ctx.assets.map((x) => x.company)]), cur.company || 'Miss Kittymae') + '</select>') +
    field('Department', '<select name="department">' + opts(depts, cur.department || '', '—') + '</select>') + field('Location', '<input type="text" name="location" maxlength="100" value="' + esc(cur.location || '') + '" placeholder="e.g. back office, shelf 3">') +
    field('Custodian (responsible person)', '<select name="custodian_id">' + personOptions(ctx, { selected: cur.custodian_id || '', any: 'None' }) + '</select><span class="muted">Looks after the asset. Not the same as who uses it.</span>') +
    field('…or a team', '<input type="text" name="custodian_label" maxlength="80" value="' + esc(cur.custodian_label || '') + '" placeholder="e.g. Inventory Department">') +
    field('Ownership', '<select name="ownership_status">' + opts(OWNERSHIP, cur.ownership_status || 'Company Owned') + '</select>') +
    (edit ? '' : field('Condition', '<select name="condition">' + opts(CONDITIONS.filter((x) => !['Damaged', 'Unserviceable'].includes(x)), 'Good') + '</select>') + field('Starts as', '<select name="status"><option>Available</option><option>In Storage</option></select>')) +
    field('Purchase date', '<input type="date" name="purchase_date" value="' + esc(cur.purchase_date || '') + '">') +
    field('Warranty starts', '<input type="date" name="warranty_start" value="' + esc(cur.warranty_start || '') + '">') + field('Warranty ends', '<input type="date" name="warranty_end" value="' + esc(cur.warranty_end || '') + '">') +
    field('Warranty provider', '<input type="text" name="warranty_provider" maxlength="80" value="' + esc(cur.warranty_provider || '') + '">') +
    field('Maintenance every (days)', '<input type="number" name="maintenance_interval_days" min="1" step="1" inputmode="numeric" value="' + esc(cur.maintenance_interval_days || '') + '" placeholder="Optional">') +
    '</div>' +
    field('Description', '<textarea name="description" rows="2" maxlength="500">' + esc(cur.description || '') + '</textarea>') + field('Warranty notes', '<input type="text" name="warranty_notes" maxlength="200" value="' + esc(cur.warranty_notes || '') + '">') +
    (edit ? '' : field('Accessories that go with it', '<textarea name="accessories" rows="2" placeholder="Charger, bag, mouse — one per line or separated by commas"></textarea>')) +
    field('Notes', '<textarea name="notes" rows="2" maxlength="500">' + esc(cur.notes || '') + '</textarea>') +
    (!edit && c.viewCost ? '<h4 class="rf-sub">Financial details <span class="muted">· only people who may see costs see these</span></h4><div class="bl-formgrid">' + field('Purchase price (₱)', '<input type="number" name="purchase_price" min="0" step="0.01" inputmode="decimal">') + field('Estimated value (₱)', '<input type="number" name="estimated_value" min="0" step="0.01" inputmode="decimal">') +
      field('Supplier', '<input type="text" name="supplier" maxlength="100">') + field('Invoice / receipt no.', '<input type="text" name="invoice_number" maxlength="60">') + '</div>' : '') +
    (edit ? field('Reason for the change <span class="muted">(required if you change the serial number)</span>', '<input type="text" name="reason" maxlength="200" placeholder="e.g. serial typed wrongly">') : '') +
    '</form>';
  openDrawer('form', { title: edit ? 'Edit ' + cur.asset_number : 'Add Asset', sub: edit ? cur.name : 'A new asset starts as Available or In Storage — assign it afterwards.', body,
    footer: '<button type="button" class="btn" id="ac-form-save">' + (edit ? 'Save Changes' : 'Add Asset') + '</button><button type="button" class="btn secondary" id="ac-form-cancel">Cancel</button>' });
  const form = $('ac-form'), errBox = (html) => { $('ac-form-errors').innerHTML = html ? '<div class="msg error">' + html + '</div>' : ''; if (html) drawerBody('form').scrollTop = 0; };
  form.addEventListener('input', () => { dirty = true; });
  form.addEventListener('change', () => { dirty = true; });
  $('ac-form-cancel').addEventListener('click', requestCloseForm);
  const f = (n) => (form.elements[n] ? form.elements[n].value.trim() : '');

  const payload = (ack) => {
    const p = { name: f('name'), category_id: f('category_id') || null, brand: f('brand'), model: f('model'), serial_number: f('serial_number'), asset_tag: f('asset_tag'), company: f('company'), department: f('department'), location: f('location'),
      custodian_id: f('custodian_id') || null, custodian_label: f('custodian_label'), ownership_status: f('ownership_status'), purchase_date: f('purchase_date') || null, warranty_start: f('warranty_start') || null, warranty_end: f('warranty_end') || null,
      warranty_provider: f('warranty_provider'), warranty_notes: f('warranty_notes'), maintenance_interval_days: f('maintenance_interval_days') ? Number(f('maintenance_interval_days')) : null, description: f('description'), notes: f('notes') };
    if (!edit) {
      Object.assign(p, { branch_id: f('branch_id') || null, condition: f('condition'), status: f('status'), accessories: lines(f('accessories')) });
      if (c.viewCost) Object.assign(p, { purchase_price: num(f('purchase_price')), estimated_value: num(f('estimated_value')), supplier: f('supplier'), invoice_number: f('invoice_number') });
    } else p.reason = f('reason');
    if (ack) p.duplicate_ack = true;
    return p;
  };
  const check = () => {
    if (!f('name')) { flag(form.elements.name); return 'Enter the asset name.'; }
    if (!edit && !f('branch_id')) { flag(form.elements.branch_id); return 'Choose the branch this asset is at.'; }
    if (f('warranty_start') && f('warranty_end') && f('warranty_end') < f('warranty_start')) { flag(form.elements.warranty_end); return 'The warranty cannot end before it starts.'; }
    if (f('maintenance_interval_days') && !(Number(f('maintenance_interval_days')) >= 1)) { flag(form.elements.maintenance_interval_days); return 'The maintenance interval must be at least 1 day.'; }
    return '';
  };
  const dupPanel = (res) => {
    const list = (res.matches || []).map((m) => '<li><b>' + esc(m.asset_number) + '</b> — ' + esc(m.name) + ' · ' + esc(m.why) + (m.branch ? ' · ' + esc(m.branch) : '') + ' ' + statusBadge(m.status) + '</li>').join('');
    actionPanel('form', { title: 'POSSIBLE DUPLICATE ASSET', danger: true, okLabel: 'These are different assets — save anyway',
      message: 'Another asset already has the same serial number or tag. If you are adding the same item twice, go back and open the existing record instead.<ul class="bl-roles">' + list + '</ul>',
      onOk: async () => { await save(true); } });
  };
  async function save(ack) {
    const problem = check();
    if (problem) { errBox(esc(problem)); return; }
    errBox('');
    const btn = $('ac-form-save'); btn.disabled = true;
    try {
      const p = payload(ack), res = edit ? await ctx.api.updateAsset(cur.id, p) : await ctx.api.createAsset(p);
      if (res && res.ok === false) {
        if (res.duplicate) { dupPanel(res); btn.disabled = false; return; }
        errBox(esc(errorsText(res))); btn.disabled = false; return;
      }
      dirty = false;
      if (edit) { closeDrawer('form'); await ctx.afterChange(cur.asset_number + ' updated.'); return; }
      await ctx.refresh();
      drawerBody('form').innerHTML = '<div class="msg ok"><b>' + esc(res.asset_number) + '</b> was added to the register.</div><p class="muted">Print its tag so the item can be scanned later, or assign it now.</p>' +
        '<div class="lv-row-actions"><button type="button" class="btn" id="ac-new-view">Open the asset</button><button type="button" class="btn secondary" id="ac-new-tag">Print asset tag</button>' + (c.canAssign ? '<button type="button" class="btn secondary" id="ac-new-assign">Assign it now</button>' : '') + '<button type="button" class="btn secondary" id="ac-new-more">Add another</button></div>';
      $('ac-form-save').hidden = true;
      $('ac-new-view').addEventListener('click', () => { closeDrawer('form'); ctx.openAsset(res.id); });
      $('ac-new-tag').addEventListener('click', () => ctx.print.tags([res.id]));
      if ($('ac-new-assign')) $('ac-new-assign').addEventListener('click', () => { closeDrawer('form'); ctx.work.assignAsset(res.id); });
      $('ac-new-more').addEventListener('click', () => openAssetForm(ctx, {}));
      ctx.toast(res.asset_number + ' added.');
    } catch (err) { errBox(esc(friendly(err))); btn.disabled = false; }
  }
  $('ac-form-save').addEventListener('click', () => save(false));
  form.addEventListener('submit', (e) => { e.preventDefault(); save(false); });
}
