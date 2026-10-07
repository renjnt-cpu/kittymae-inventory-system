// Assets & Supplies Custodian -- the Audit Log tab (everything that ever changed on an asset or a supply, field by field; permanent and
// read-only; Admin and Manager only) and the Settings tab (alert limits, the asset and supply categories, who can do what, the rules the
// records follow).
import { esc, plural, field, opts, fmtDateTime, friendly, errorsText, emptyBox, tagBadge } from './assetsUi.js?v=20261008b';
import { uniqueSorted, DEFAULTS } from './assetsLogic.js?v=20261008b';
import { exportAudit } from './assetsReports.js?v=20261008b';
import { exportMenu } from './assetsList.js?v=20261008b';
import { flagInvalid } from './uiKit.js?v=20261008b';

const $ = (id) => document.getElementById(id);
export const newAuditState = () => ({ rows: [], loaded: false, done: false, q: '', user: '', action: '', entity: '', from: '', to: '' });
const ENTITY = { asset: 'Asset', assignment: 'Assignment', asset_transfer: 'Asset transfer', incident: 'Lost / damaged report', repair: 'Repair', disposal: 'Disposal', file: 'File', supply: 'Supply', supply_stock: 'Stock', issuance: 'Issuance', receipt: 'Receipt', supply_transfer: 'Supply transfer', supply_request: 'Supply request', setting: 'Setting', category: 'Category' };

function filtered(L) {
  const q = L.q.toLowerCase();
  return L.rows.filter((l) => {
    const day = String(l.created_at).slice(0, 10);
    if (L.user && (l.user_name || 'System') !== L.user) return false;
    if (L.action && l.action !== L.action) return false;
    if (L.entity && l.entity_type !== L.entity) return false;
    if (L.from && day < L.from) return false;
    if (L.to && day > L.to) return false;
    return !q || [l.user_name, l.action, l.field_name, l.old_value, l.new_value, l.reason, l.entity_id, ENTITY[l.entity_type]].join(' ').toLowerCase().includes(q);
  });
}
const change = (l) => {
  const f = l.field_name ? '<b>' + esc(String(l.field_name).replace(/_/g, ' ')) + '</b>: ' : '';
  const b = l.old_value !== null && l.old_value !== undefined ? '<span class="bl-before">' + esc(String(l.old_value).slice(0, 120)) + '</span> → ' : '';
  const a = l.new_value !== null && l.new_value !== undefined ? '<span class="bl-after">' + esc(String(l.new_value).slice(0, 120)) + '</span>' : '';
  return (f || b || a) ? f + b + a + (l.reason ? '<div class="muted bl-sub">' + esc(String(l.reason).slice(0, 160)) + '</div>' : '') : (l.reason ? esc(String(l.reason).slice(0, 160)) : '—');
};

export async function renderAudit(ctx, panel) {
  const L = ctx.ui.audit;
  panel.innerHTML = '<div id="ac-au"><p class="muted">Loading the audit log…</p></div>';
  if (!L.loaded) {
    try { L.rows = await ctx.api.listAudit({ limit: 400 }); L.loaded = true; L.done = L.rows.length < 400; } catch (err) { panel.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; return; }
  }
  draw();
  function draw() {
    const rows = filtered(L);
    panel.innerHTML = '<div id="ac-au"><div class="card"><div class="bl-filters"><div class="field bl-grow"><label>Search</label><input type="search" id="ac-au-q" placeholder="Person, action, field, number…" value="' + esc(L.q) + '"></div>' +
      field('Person', '<select id="ac-au-user">' + opts(uniqueSorted(L.rows.map((l) => l.user_name || 'System')), L.user, 'Everyone') + '</select>') + field('Action', '<select id="ac-au-action">' + opts(uniqueSorted(L.rows.map((l) => l.action)), L.action, 'Any') + '</select>') +
      field('About', '<select id="ac-au-entity">' + opts(uniqueSorted(L.rows.map((l) => l.entity_type)).map((e) => ({ value: e, label: ENTITY[e] || e })), L.entity, 'Anything') + '</select>') + field('From', '<input type="date" id="ac-au-from" value="' + esc(L.from) + '">') + field('To', '<input type="date" id="ac-au-to" value="' + esc(L.to) + '">') +
      '<div class="field"><label>&nbsp;</label><div class="bl-btnrow"><button type="button" class="btn small secondary" id="ac-au-clear">Clear</button>' + exportMenu() + '</div></div></div></div>' +
      '<p class="muted">' + plural(rows.length, 'entry', 'entries') + (rows.length !== L.rows.length ? ' of ' + L.rows.length + ' loaded' : '') + '. This log is permanent — nobody can edit or delete it.</p>' +
      (rows.length ? '<div class="table-scroll table-2col"><table class="bl-table"><thead><tr><th>When</th><th>Person</th><th>About</th><th>Action</th><th>Change</th></tr></thead><tbody>' + rows.slice(0, 300).map((l) => {
        const a = l.asset_id ? ctx.byId.get(l.asset_id) : null, s = l.supply_id ? ctx.supplyById.get(l.supply_id) : null;
        return '<tr><td data-label="When">' + esc(fmtDateTime(l.created_at)) + '</td><td data-label="Person">' + esc(l.user_name || 'System') + '<div class="muted bl-sub">' + esc(l.user_role || '') + '</div></td><td data-label="About">' + (a ? '<button type="button" class="bl-link" data-open="' + a.id + '">' + esc(a.asset_number) + '</button><div class="muted bl-sub">' + esc(a.name) + '</div>' : s ? '<b>' + esc(s.name) + '</b><div class="muted bl-sub">' + esc(s.supply_code) + '</div>' : '<span class="muted">' + esc(ENTITY[l.entity_type] || l.entity_type) + '</span>') + '</td>' +
          '<td data-label="Action">' + esc(l.action) + '</td><td data-label="Change" class="full-row">' + change(l) + '</td></tr>'; }).join('') + '</tbody></table></div>' + (rows.length > 300 ? '<p class="muted">Showing the newest 300 — narrow the filters or export to see the rest.</p>' : '') : emptyBox('No entry matches these filters.')) +
      (!L.done ? '<p><button type="button" class="btn small secondary" id="ac-au-more">Load older entries</button></p>' : '') + '</div>';
    const root = $('ac-au');
    let t = null;
    $('ac-au-q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { L.q = e.target.value.trim(); draw(); const s = $('ac-au-q'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 300); });
    [['user', 'ac-au-user'], ['action', 'ac-au-action'], ['entity', 'ac-au-entity'], ['from', 'ac-au-from'], ['to', 'ac-au-to']].forEach(([k, id]) => $(id).addEventListener('change', (e) => { L[k] = e.target.value; draw(); }));
    $('ac-au-clear').addEventListener('click', () => { Object.assign(L, { q: '', user: '', action: '', entity: '', from: '', to: '' }); draw(); });
    root.querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', () => ctx.openAsset(Number(el.dataset.open))));
    if ($('ac-au-more')) $('ac-au-more').addEventListener('click', async () => {
      const last = L.rows[L.rows.length - 1];
      try { const more = await ctx.api.listAudit({ before: last ? last.created_at : null, limit: 400 }); const seen = new Set(L.rows.map((x) => x.id)); L.rows.push(...more.filter((x) => !seen.has(x.id))); L.done = more.length < 400; draw(); } catch (err) { ctx.toast(err, true); }
    });
    root.querySelectorAll('[data-exp]').forEach((el) => el.addEventListener('click', async () => { el.closest('details').open = false; try { await exportAudit(ctx, rows, el.dataset.exp); } catch (err) { ctx.toast(err, true); } }));
  }
}

// ================================================================ settings
const SETTINGS = [
  { key: 'repair_overdue_days', label: 'Under repair — flag after (days)', help: 'A repair open longer than this (or past its expected date) shows under “Under repair for too long”.' },
  { key: 'warranty_warn_days', label: 'Warranty ending — warn this many days ahead', help: 'Assets whose warranty ends within this many days are listed.' },
  { key: 'maintenance_warn_days', label: 'Maintenance due — warn this many days ahead', help: 'Assets with a maintenance date inside this window are listed.' },
  { key: 'high_repair_cost_pct', label: 'High repair cost — flag at (% of value)', help: 'When repairs on one asset add up to this share of its purchase price or value, a note is shown. Information only — nothing is disposed of automatically.' },
  { key: 'request_wait_days', label: 'Supply request / return waiting — flag after (days)', help: 'A supply request not yet decided, or an asset asked back and not returned, is flagged after this many days.' },
  { key: 'transfer_wait_days', label: 'Asset transfer not confirmed — flag after (days)', help: 'A branch transfer still requested, approved or in transit after this many days is flagged.' },
  { key: 'acknowledge_wait_days', label: 'Employee has not confirmed receipt — flag after (days)', help: 'An assignment the employee has not acknowledged is flagged after this many days.' },
  { key: 'aging_warn_years', label: 'Aging asset — note at (years)', help: 'An asset this old shows an “Aging” note.' },
];
const PERMS = [
  ['assets.view', 'See assets and supplies (own branch only, unless “every branch” is also given)'], ['assets.view_all_branches', 'See and act on every branch'], ['assets.add', 'Add assets'], ['assets.edit', 'Edit details, request disposal, resolve reports'], ['assets.assign', 'Assign and ask for return'],
  ['assets.return', 'Receive returns'], ['assets.transfer', 'Transfer between employees and branches'], ['assets.report_damage', 'Report damaged / lost / missing for any asset'], ['assets.repairs', 'Manage repairs and maintenance'], ['assets.dispose', 'Approve and complete disposals'],
  ['assets.view_cost', 'See purchase prices, repair costs and supply costs'], ['assets.reports', 'Open the Reports tab'], ['assets.export', 'Export lists'], ['assets.admin', 'Settings and the audit log'],
  ['supplies.view', 'See supply stock'], ['supplies.request', 'Request supplies'], ['supplies.manage', 'Add supplies and receive stock; approve requests'], ['supplies.issue', 'Issue supplies'], ['supplies.adjust', 'Count and adjust stock'], ['supplies.transfer', 'Move supplies between branches'],
];
export function renderSettings(ctx, panel) {
  const s = ctx.settings, cats = ctx.cats;
  const catRows = (kind) => cats.filter((c) => c.kind === kind).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)).map((c) => '<li class="ac-catrow' + (c.active ? '' : ' ac-cat-off') + '"><span>' + esc(c.name) + (c.active ? '' : ' ' + tagBadge('Hidden', 'bl-tag-gray')) + '</span><button type="button" class="btn small secondary" data-cat="' + esc(c.name) + '" data-kind="' + kind + '" data-active="' + (c.active ? '0' : '1') + '">' + (c.active ? 'Hide' : 'Show') + '</button></li>').join('');
  panel.innerHTML = '<div id="ac-set"><div class="card bl-panel"><h3 class="bl-h">Alert limits</h3><div class="bl-formgrid">' + SETTINGS.map((x) => field(esc(x.label), '<input type="number" id="ac-st-' + x.key + '" min="1" max="3650" step="1" value="' + esc(s[x.key] ?? DEFAULTS[x.key]) + '"><span class="muted">' + esc(x.help) + '</span>')).join('') + '</div><div id="ac-st-errors"></div><p><button type="button" class="btn" id="ac-st-save">Save limits</button></p></div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Categories</h3><p class="muted">Add a category if the list does not have one you need. A category is hidden, never deleted, so old records keep theirs.</p><div class="bl-charts"><div><h4 class="rf-sub">Asset categories</h4><ul class="ac-catlist">' + catRows('Asset') + '</ul><div class="bl-toolrow"><input type="text" id="ac-cat-a" maxlength="60" placeholder="New asset category"><button type="button" class="btn small" data-addcat="Asset">Add</button></div></div>' +
    '<div><h4 class="rf-sub">Supply categories</h4><ul class="ac-catlist">' + catRows('Supply') + '</ul><div class="bl-toolrow"><input type="text" id="ac-cat-s" maxlength="60" placeholder="New supply category"><button type="button" class="btn small" data-addcat="Supply">Add</button></div></div></div><div id="ac-cat-errors"></div></div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Who can do what</h3><p class="muted">Everything here follows the <b>Position Access Matrix</b> (People → Position Access Matrix): give a position or a person the permissions below. The database enforces each one — a hidden button is only a courtesy.</p><div class="table-scroll table-2col"><table class="lv-mini"><thead><tr><th>Permission</th><th>What it allows</th></tr></thead><tbody>' +
    PERMS.map(([k, d]) => '<tr><td data-label="Permission"><code>' + esc(k) + '</code></td><td data-label="What it allows" class="full-row">' + esc(d) + '</td></tr>').join('') + '</tbody></table></div><ul class="bl-roles"><li><b>Admin</b> — everything. <b>Manager</b> — everything except settings; approves transfers and disposals and records accountability decisions.</li><li><b>Branch Supervisor</b> — sees and handles their own branch’s assets, supplies and requests; cannot see prices.</li>' +
    '<li><b>Personal / Admin Assistant</b> — the full custodian set at every branch.</li><li><b>Everyone else</b> — only “My Company Assets”: what is issued to them, confirming receipt, reporting a problem.</li><li><b>Two people</b> — whoever requests a transfer or a disposal cannot approve it.</li></ul></div>' +
    '<div class="card bl-panel"><h3 class="bl-h">How the records behave</h3><ul class="bl-roles"><li>Every asset has a permanent number (AST-2026-00001) that is never reused or changed. Its QR tag holds only a link to the internal record.</li><li>Assets and supplies are <b>never deleted</b>. An asset is returned, transferred, reported, repaired or disposed of; a supply is deactivated once its stock is zero.</li>' +
    '<li>An asset has one holder at a time. Changing who holds it is Assign, Return or Transfer — never an edit — and each writes a permanent history line.</li><li>Supply stock only changes through the stock ledger (received, issued, transferred, adjusted, damaged, returned). It cannot go below zero, and pressing a button twice never counts twice.</li>' +
    '<li>Nobody is ever charged automatically for a lost or damaged asset. A manager records any decision in writing.</li><li>The employee list, branches and departments come from the HR 201 File and Branches — nothing is duplicated here.</li></ul></div></div>';
  $('ac-st-save').addEventListener('click', async () => {
    const vals = {};
    for (const x of SETTINGS) { const v = $('ac-st-' + x.key).value, n = Number(v); if (v === '' || !Number.isInteger(n) || n < 1 || n > 3650) { flagInvalid($('ac-st-' + x.key)); return; } vals[x.key] = n; }
    const btn = $('ac-st-save'); btn.disabled = true; $('ac-st-errors').innerHTML = '';
    try {
      const res = await ctx.api.saveSettings(vals);
      if (!res || res.ok === false) { $('ac-st-errors').innerHTML = '<div class="msg error">' + esc(errorsText(res)) + '</div>'; btn.disabled = false; return; }
      ctx.toast('Limits saved.'); await ctx.refresh();
    } catch (err) { $('ac-st-errors').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; btn.disabled = false; }
  });
  const saveCat = async (kind, name, active) => {
    $('ac-cat-errors').innerHTML = '';
    try {
      const res = await ctx.api.saveCategory(kind, name, active);
      if (!res || res.ok === false) { $('ac-cat-errors').innerHTML = '<div class="msg error">' + esc(errorsText(res)) + '</div>'; return; }
      ctx.toast(active ? 'Category saved.' : 'Category hidden.'); await ctx.refresh();
    } catch (err) { $('ac-cat-errors').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; }
  };
  panel.querySelectorAll('[data-cat]').forEach((el) => el.addEventListener('click', () => saveCat(el.dataset.kind, el.dataset.cat, el.dataset.active === '1')));
  panel.querySelectorAll('[data-addcat]').forEach((el) => el.addEventListener('click', () => { const k = el.dataset.addcat, inp = $(k === 'Asset' ? 'ac-cat-a' : 'ac-cat-s'), n = inp.value.trim(); if (n.length < 2) { flagInvalid(inp); return; } saveCat(k, n, true); }));
}
