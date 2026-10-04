// Bills Management -- the two Admin-only tabs: the company-wide Activity Log (who changed what, with
// before / after values; permanent and read-only) and Settings (alert limits, categories, branch assignment).
import { esc, money, fmtDateTime, tagBadge, openDrawer, closeDrawer, plural, friendly, errorsText, prioBadge } from './billsUi.js?v=20261004d';
import { PRIORITIES, uniqueSorted } from './billsLogic.js?v=20261004d';
import { LOG_COLUMNS, logRow } from './billsExport.js?v=20261004d';
import { exportCsv, exportXlsx, exportPdf } from './leaveExport.js?v=20261004d';
import { flagInvalid } from './uiKit.js?v=20260928a';

const $ = (id) => document.getElementById(id);
const val = (id) => ($(id) ? $(id).value : '');
const field = (label, inner) => '<div class="field"><label>' + label + '</label>' + inner + '</div>';

// ================================================================ activity log
export const newLogState = () => ({ rows: [], loaded: false, done: false, q: '', user: '', action: '', from: '', to: '' });

function filtered(L) {
  const q = L.q.toLowerCase();
  return L.rows.filter((l) => {
    const day = String(l.created_at).slice(0, 10);
    if (L.user && (l.user_name || 'System') !== L.user) return false;
    if (L.action && l.action !== L.action) return false;
    if (L.from && day < L.from) return false;
    if (L.to && day > L.to) return false;
    return !q || [l.bill_name, l.user_name, l.action, l.field_name, l.before_value, l.after_value].join(' ').toLowerCase().includes(q);
  });
}
const change = (l) => {
  const f = l.field_name ? '<b>' + esc(String(l.field_name).replace(/_/g, ' ')) + '</b>: ' : '';
  const b = l.before_value !== null && l.before_value !== undefined ? '<span class="bl-before">' + esc(String(l.before_value).slice(0, 120)) + '</span> → ' : '';
  const a = l.after_value !== null && l.after_value !== undefined ? '<span class="bl-after">' + esc(String(l.after_value).slice(0, 120)) + '</span>' : '';
  return (f || b || a) ? f + b + a : '—';
};

export async function renderLog(ctx, panel) {
  const L = ctx.ui.log;
  panel.innerHTML = '<div id="bl-log"><p class="muted">Loading the history…</p></div>';
  if (!L.loaded) {
    try { L.rows = await ctx.api.listActivityAll({ limit: 400 }); L.loaded = true; L.done = L.rows.length < 400; }
    catch (err) { panel.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; return; }
  }
  draw();

  function draw() {
    const rows = filtered(L);
    panel.innerHTML = '<div id="bl-log"><div class="card"><div class="bl-filters">' +
      '<div class="field bl-grow"><label>Search</label><input type="search" id="bl-log-q" placeholder="Bill, person, action, value…" value="' + esc(L.q) + '"></div>' +
      field('Person', '<select id="bl-log-user"><option value="">Everyone</option>' + uniqueSorted(L.rows.map((l) => l.user_name || 'System')).map((n) => '<option' + (L.user === n ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select>') +
      field('Action', '<select id="bl-log-action"><option value="">Any</option>' + uniqueSorted(L.rows.map((l) => l.action)).map((n) => '<option' + (L.action === n ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select>') +
      field('From', '<input type="date" id="bl-log-from" value="' + esc(L.from) + '">') + field('To', '<input type="date" id="bl-log-to" value="' + esc(L.to) + '">') +
      '<div class="field"><label>&nbsp;</label><div class="bl-btnrow"><button type="button" class="btn small secondary" id="bl-log-clear">Clear</button>' +
      '<details class="bl-menu bl-exportmenu"><summary class="btn small secondary">Export ▾</summary><div class="bl-menu-pop"><button type="button" data-exp="csv">CSV</button><button type="button" data-exp="xlsx">Excel (.xlsx)</button><button type="button" data-exp="pdf">PDF</button></div></details></div></div></div></div>' +
      '<p class="muted">' + plural(rows.length, 'entry', 'entries') + (rows.length !== L.rows.length ? ' of ' + L.rows.length + ' loaded' : '') + '. This history is permanent — nobody can edit or delete it.</p>' +
      (rows.length ? '<div class="table-scroll table-2col"><table class="bl-table"><thead><tr><th>When</th><th>Person</th><th>Bill</th><th>Action</th><th>Change</th></tr></thead><tbody>' + rows.slice(0, 300).map((l) =>
        '<tr><td data-label="When">' + esc(fmtDateTime(l.created_at)) + '</td><td data-label="Person">' + esc(l.user_name || 'System') + '</td>' +
        '<td data-label="Bill">' + (l.bill_id && ctx.byId.has(l.bill_id) ? '<button type="button" class="bl-link" data-open="' + l.bill_id + '">' + esc(l.bill_name || '#' + l.bill_id) + '</button>' : esc(l.bill_name || '—') + (l.bill_id ? ' <span class="muted">(#' + l.bill_id + ' no longer listed)</span>' : '')) + '</td>' +
        '<td data-label="Action">' + esc(l.action) + '</td><td data-label="Change" class="full-row">' + change(l) + '</td></tr>').join('') + '</tbody></table></div>' +
        (rows.length > 300 ? '<p class="muted">Showing the newest 300 — narrow the filters or export to see the rest.</p>' : '') : '<div class="empty-state"><div class="empty-state-msg">No history matches these filters.</div></div>') +
      (!L.done ? '<p><button type="button" class="btn small secondary" id="bl-log-more">Load older entries</button></p>' : '') + '</div>';

    const root = $('bl-log');
    let t = null;
    $('bl-log-q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { L.q = e.target.value.trim(); draw(); const s = $('bl-log-q'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 300); });
    [['user', 'bl-log-user'], ['action', 'bl-log-action'], ['from', 'bl-log-from'], ['to', 'bl-log-to']].forEach(([k, id]) => $(id).addEventListener('change', (e) => { L[k] = e.target.value; draw(); }));
    $('bl-log-clear').addEventListener('click', () => { Object.assign(L, { q: '', user: '', action: '', from: '', to: '' }); draw(); });
    root.querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', () => ctx.openDetail(Number(el.dataset.open))));
    if ($('bl-log-more')) $('bl-log-more').addEventListener('click', async () => {
      const last = L.rows[L.rows.length - 1];
      try { const more = await ctx.api.listActivityAll({ before: last ? last.created_at : null, limit: 400 }); const seen = new Set(L.rows.map((x) => x.id)); L.rows.push(...more.filter((x) => !seen.has(x.id))); L.done = more.length < 400; draw(); }
      catch (err) { ctx.toast(err, true); }
    });
    root.querySelectorAll('[data-exp]').forEach((el) => el.addEventListener('click', async () => {
      el.closest('details').open = false;
      const out = rows.map(logRow), name = 'bills-activity-log-' + ctx.today;
      try {
        if (el.dataset.exp === 'csv') exportCsv(name, LOG_COLUMNS, out);
        else if (el.dataset.exp === 'xlsx') await exportXlsx(name, 'Activity Log', LOG_COLUMNS, out, [{ k: 'Report', v: 'Bills activity log' }, { k: 'Entries', v: String(out.length) }, { k: 'Generated', v: ctx.today }]);
        else await exportPdf(name, 'Bills Activity Log', [plural(out.length, 'entry', 'entries'), 'Generated ' + ctx.today], LOG_COLUMNS, out, 'Kittymae Jewels - Bills Management');
      } catch (err) { ctx.toast(err, true); }
    }));
  }
}

// ================================================================ settings
export function renderSettings(ctx, panel) {
  const unassigned = ctx.bills.filter((b) => !b.archived_at && !b.branch_id).length;
  const catCount = (id) => ctx.bills.filter((b) => b.category_id === id).length;
  panel.innerHTML = '<div id="bl-settings">' +
    '<div class="card bl-panel"><h3 class="bl-h">Alert limits</h3><div class="bl-formgrid">' +
      field('High-amount bills start at (PHP)', '<input type="number" id="bs-high" min="0" step="100" inputmode="decimal" value="' + ctx.highAmount + '"><span class="muted">Unpaid bills at or above this appear in the “High-amount bills” alert.</span>') +
      field('“Due Soon” means within (days)', '<input type="number" id="bs-soon" min="1" max="30" value="' + ctx.soonDays + '"><span class="muted">A bill due within this many days shows as Due Soon.</span>') +
    '</div><div id="bs-errors"></div><p><button type="button" class="btn" id="bs-save">Save limits</button></p></div>' +
    '<div class="card bl-panel"><div class="bl-sethead"><h3 class="bl-h">Categories</h3><button type="button" class="btn small" id="bs-addcat">+ Add category</button></div>' +
      '<div class="table-scroll table-2col"><table class="bl-table"><thead><tr><th>Category</th><th>Group</th><th>Default priority</th><th>Bills</th><th>Status</th><th></th></tr></thead><tbody>' + ctx.cats.map((c) =>
        '<tr><td data-label="Category"><b>' + esc(c.name) + '</b>' + (c.is_personal ? ' ' + tagBadge('Personal', 'bl-tag-gray') : '') + '</td><td data-label="Group">' + esc(c.group_name) + '</td><td data-label="Default priority">' + prioBadge(c.default_priority) + '</td>' +
        '<td data-label="Bills">' + catCount(c.id) + '</td><td data-label="Status">' + (c.active ? tagBadge('Active', 'bl-tag-green') : tagBadge('Hidden', 'bl-tag-gray')) + '</td><td data-label="" class="full-row"><button type="button" class="btn small secondary" data-editcat="' + c.id + '">Edit</button></td></tr>').join('') + '</tbody></table></div>' +
      '<p class="muted">“Personal” categories are visible to Admin and to people with Bills access or Finance, and hidden from the View-only and Branch Manager roles. Hiding a category keeps its existing bills.</p></div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Branches</h3>' + (unassigned ? '<p><b>' + plural(unassigned, 'bill') + '</b> ' + (unassigned === 1 ? 'has' : 'have') + ' no branch yet.</p><button type="button" class="btn small" id="bs-assign">Assign branches</button>' : '<p class="lv-pos">Every bill has a branch. ✓</p>') + '</div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Reminders</h3><p>Reminders and automatic recurring bills run every night just after midnight (Manila time). Reminders appear in the Bills notification bell for each person who handles bills — email is not turned on.</p>' +
      '<p><button type="button" class="btn small secondary" id="bs-run">Run reminders now</button> <span class="muted">Safe to press — nothing is sent twice.</span></p></div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Who can do what</h3><ul class="bl-roles">' +
      '<li><b>Admin</b> — everything, including voiding payments, marking paid bills unpaid, deleting bills, categories, settings and this history.</li>' +
      '<li><b>Finance</b> (“Bills — Finance”, or the older “Bills Module Access”) — add and edit bills, record payments, manage recurring templates, reports and exports.</li>' +
      '<li><b>View only</b> (“Bills — View only”) — dashboards, bills and reports; cannot change anything. Personal bills are hidden.</li>' +
      '<li><b>Branch Manager</b> (“Bills — Branch Manager”) — sees only their own branch’s bills, can add a bill for that branch and upload proof. Personal bills are hidden.</li></ul>' +
      '<p class="muted">Roles are granted per person or per position in the <a href="access-matrix.html">Access Matrix</a> — nothing about who can see what is decided on this page.</p></div></div>';

  $('bs-save').addEventListener('click', async () => {
    const high = $('bs-high').value, soon = $('bs-soon').value;
    if (high === '' || Number(high) < 0) { flagInvalid($('bs-high')); return; }
    if (soon === '' || Number(soon) < 1 || Number(soon) > 30) { flagInvalid($('bs-soon')); return; }
    const btn = $('bs-save'); btn.disabled = true; $('bs-errors').innerHTML = '';
    try {
      const res = await ctx.api.saveSettings({ high_amount: Number(high), due_soon_days: Number(soon) });
      if (!res || res.ok === false) { $('bs-errors').innerHTML = '<div class="msg error">' + esc(errorsText(res)) + '</div>'; btn.disabled = false; return; }
      ctx.toast('Limits saved.'); await ctx.refresh();
    } catch (err) { $('bs-errors').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; btn.disabled = false; }
  });
  $('bs-addcat').addEventListener('click', () => openCategoryForm(ctx, null));
  panel.querySelectorAll('[data-editcat]').forEach((el) => el.addEventListener('click', () => openCategoryForm(ctx, Number(el.dataset.editcat))));
  if ($('bs-assign')) $('bs-assign').addEventListener('click', () => ctx.openAssignBranches());
  $('bs-run').addEventListener('click', async () => {
    const btn = $('bs-run'); btn.disabled = true;
    try { const r = await ctx.api.refreshReminders(); ctx.toast(r.reminders ? plural(r.reminders, 'reminder') + ' sent.' : 'Nothing new to remind about right now.' + (r.generated ? ' ' + plural(r.generated, 'recurring bill') + ' created.' : '')); await ctx.refresh(); }
    catch (err) { ctx.toast(err, true); } finally { btn.disabled = false; }
  });
}

function openCategoryForm(ctx, id) {
  const c = id ? ctx.catById[id] : null;
  const groups = uniqueSorted(ctx.cats.map((x) => x.group_name));
  openDrawer('side', {
    title: c ? 'Edit Category' : 'Add Category', sub: c ? c.name : '',
    body: '<div id="bl-side-msg"></div><div id="bc-errors"></div><div class="bl-formgrid">' +
      field('Name *', '<input type="text" id="bc-name" maxlength="60" value="' + esc(c ? c.name : '') + '">') +
      field('Group', '<input type="text" id="bc-group" list="bc-groups" maxlength="40" value="' + esc(c ? c.group_name : '') + '" placeholder="e.g. Utilities"><datalist id="bc-groups">' + groups.map((g) => '<option value="' + esc(g) + '"></option>').join('') + '</datalist>') +
      field('Default priority', '<select id="bc-prio">' + PRIORITIES.map((p) => '<option' + ((c ? c.default_priority : 'Medium') === p ? ' selected' : '') + '>' + p + '</option>').join('') + '</select><span class="muted">Used when a bill’s priority is set to Automatic.</span>') + '</div>' +
      '<label class="lv-check"><input type="checkbox" id="bc-personal"' + (c && c.is_personal ? ' checked' : '') + '> Personal category (hidden from View-only and Branch Manager roles)</label>' +
      '<label class="lv-check"><input type="checkbox" id="bc-active"' + (!c || c.active ? ' checked' : '') + '> Show in the category lists</label>',
    footer: '<button type="button" class="btn" id="bc-save">' + (c ? 'Save' : 'Add Category') + '</button><button type="button" class="btn secondary" id="bc-cancel">Cancel</button>',
  });
  $('bc-cancel').addEventListener('click', () => closeDrawer('side'));
  $('bc-save').addEventListener('click', async () => {
    const name = val('bc-name').trim();
    if (!name) { flagInvalid($('bc-name')); $('bc-errors').innerHTML = '<div class="msg error">Give the category a name.</div>'; return; }
    const btn = $('bc-save'); btn.disabled = true; $('bc-errors').innerHTML = '';
    try {
      const res = await ctx.api.saveCategory(c ? c.id : null, { name, group_name: val('bc-group').trim(), default_priority: val('bc-prio'), is_personal: $('bc-personal').checked, active: $('bc-active').checked });
      if (!res || res.ok === false) { $('bc-errors').innerHTML = '<div class="msg error">' + esc(errorsText(res)) + '</div>'; btn.disabled = false; return; }
      closeDrawer('side'); ctx.toast('Category saved.'); await ctx.refresh();
    } catch (err) { $('bc-errors').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; btn.disabled = false; }
  });
  $('bc-name').focus();
}
