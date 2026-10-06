// Transfers -- the History tab (everything that ever happened on a transfer; permanent and read-only, with the field-by-field audit
// log for Admins and Managers) and the Settings tab (alert limits, the inventory check, who can do what, how stock moves).
import { esc, fmtDateTime, plural, friendly, errorsText } from './transfersUi.js?v=20261007c';
import { uniqueSorted } from './transfersLogic.js?v=20261007c';
import { LOG_COLUMNS, logRow } from './transfersExport.js?v=20261007c';
import { exportCsv, exportXlsx, exportPdf } from './leaveExport.js?v=20261007c';
import { flagInvalid } from './uiKit.js?v=20261007c';

const $ = (id) => document.getElementById(id);
const field = (label, inner) => '<div class="field"><label>' + label + '</label>' + inner + '</div>';

// ================================================================ history
export const newLogState = () => ({ view: 'activity', rows: { activity: [], audit: [] }, loaded: { activity: false, audit: false }, done: { activity: false, audit: false }, q: '', user: '', action: '', from: '', to: '' });

const personOf = (l, v) => (v === 'audit' ? l.user_name : l.performed_by_name) || 'System';
function filtered(L, ctx) {
  const v = L.view, q = L.q.toLowerCase();
  return L.rows[v].filter((l) => {
    const day = String(l.created_at).slice(0, 10), t = l.transfer_id ? ctx.byId.get(l.transfer_id) : null;
    if (L.user && personOf(l, v) !== L.user) return false;
    if (L.action && l.action !== L.action) return false;
    if (L.from && day < L.from) return false;
    if (L.to && day > L.to) return false;
    return !q || [t && t.transfer_number, t && t._from, t && t._to, personOf(l, v), l.action, l.description, l.field_name, l.old_value, l.new_value].join(' ').toLowerCase().includes(q);
  });
}
const transferCell = (l, ctx) => {
  const t = l.transfer_id ? ctx.byId.get(l.transfer_id) : null;
  if (t) return '<button type="button" class="bl-link" data-open="' + t.id + '">' + esc(t.transfer_number) + '</button><div class="muted bl-sub">' + esc(t._from + ' → ' + t._to) + '</div>';
  return l.transfer_id ? '<span class="muted">(not listed)</span>' : '<span class="muted">Settings</span>';
};
const change = (l) => {
  const f = l.field_name ? '<b>' + esc(String(l.field_name).replace(/_/g, ' ')) + '</b>: ' : '';
  const b = l.old_value !== null && l.old_value !== undefined ? '<span class="bl-before">' + esc(String(l.old_value).slice(0, 120)) + '</span> → ' : '';
  const a = l.new_value !== null && l.new_value !== undefined ? '<span class="bl-after">' + esc(String(l.new_value).slice(0, 120)) + '</span>' : '';
  return (f || b || a) ? f + b + a : '—';
};

export async function renderLog(ctx, panel) {
  const L = ctx.ui.log;
  if (L.view === 'audit' && !ctx.caps.mgr) L.view = 'activity';
  panel.innerHTML = '<div id="tf-log"><p class="muted">Loading the history…</p></div>';
  if (!L.loaded[L.view]) {
    try {
      L.rows[L.view] = L.view === 'audit' ? await ctx.api.listAudit({ limit: 400 }) : await ctx.api.listTimelineAll({ limit: 400 });
      L.loaded[L.view] = true; L.done[L.view] = L.rows[L.view].length < 400;
    } catch (err) { panel.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; return; }
  }
  draw();

  function draw() {
    const v = L.view, rows = filtered(L, ctx);
    panel.innerHTML = '<div id="tf-log">' +
      (ctx.caps.mgr ? '<div class="bl-views" role="group" aria-label="History view"><button type="button" class="bl-chip' + (v === 'activity' ? ' bl-chip-on' : '') + '" data-lv="activity">Activity</button><button type="button" class="bl-chip' + (v === 'audit' ? ' bl-chip-on' : '') + '" data-lv="audit">Audit log (every field change)</button></div>' : '') +
      '<div class="card"><div class="bl-filters">' +
      '<div class="field bl-grow"><label>Search</label><input type="search" id="tf-log-q" placeholder="Transfer ID, branch, person, action…" value="' + esc(L.q) + '"></div>' +
      field('Person', '<select id="tf-log-user"><option value="">Everyone</option>' + uniqueSorted(L.rows[v].map((l) => personOf(l, v))).map((n) => '<option' + (L.user === n ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select>') +
      field('Action', '<select id="tf-log-action"><option value="">Any</option>' + uniqueSorted(L.rows[v].map((l) => l.action)).map((n) => '<option' + (L.action === n ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select>') +
      field('From', '<input type="date" id="tf-log-from" value="' + esc(L.from) + '">') + field('To', '<input type="date" id="tf-log-to" value="' + esc(L.to) + '">') +
      '<div class="field"><label>&nbsp;</label><div class="bl-btnrow"><button type="button" class="btn small secondary" id="tf-log-clear">Clear</button>' +
      (v === 'audit' ? '<details class="bl-menu bl-exportmenu"><summary class="btn small secondary">Export ▾</summary><div class="bl-menu-pop"><button type="button" data-exp="csv">CSV</button><button type="button" data-exp="xlsx">Excel (.xlsx)</button><button type="button" data-exp="pdf">PDF</button></div></details>' : '') + '</div></div></div></div>' +
      '<p class="muted">' + plural(rows.length, 'entry', 'entries') + (rows.length !== L.rows[v].length ? ' of ' + L.rows[v].length + ' loaded' : '') + '. This history is permanent — nobody can edit or delete it.</p>' +
      (rows.length ? '<div class="table-scroll table-2col"><table class="bl-table"><thead><tr><th>When</th><th>Person</th><th>Transfer</th><th>' + (v === 'audit' ? 'Action' : 'What happened') + '</th>' + (v === 'audit' ? '<th>Change</th>' : '') + '</tr></thead><tbody>' + rows.slice(0, 300).map((l) =>
        '<tr><td data-label="When">' + esc(fmtDateTime(l.created_at)) + '</td><td data-label="Person">' + esc(personOf(l, v)) + '<div class="muted bl-sub">' + esc((v === 'audit' ? l.user_role : l.performed_by_role) || '') + '</div></td>' +
        '<td data-label="Transfer">' + transferCell(l, ctx) + '</td>' +
        (v === 'audit' ? '<td data-label="Action">' + esc(l.action) + '</td><td data-label="Change" class="full-row">' + change(l) + '</td>'
          : '<td data-label="What happened" class="full-row"><b>' + esc(l.action) + '</b>' + (l.description ? ' <span class="muted">— ' + esc(l.description) + '</span>' : '') + '</td>') + '</tr>').join('') + '</tbody></table></div>' +
        (rows.length > 300 ? '<p class="muted">Showing the newest 300 — narrow the filters' + (v === 'audit' ? ' or export' : '') + ' to see the rest.</p>' : '') : '<div class="empty-state"><div class="empty-state-msg">No history matches these filters.</div></div>') +
      (!L.done[v] ? '<p><button type="button" class="btn small secondary" id="tf-log-more">Load older entries</button></p>' : '') + '</div>';

    const root = $('tf-log');
    root.querySelectorAll('[data-lv]').forEach((el) => el.addEventListener('click', () => { L.view = el.dataset.lv; L.user = ''; L.action = ''; ctx.rerender(); }));
    let t = null;
    $('tf-log-q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { L.q = e.target.value.trim(); draw(); const s = $('tf-log-q'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 300); });
    [['user', 'tf-log-user'], ['action', 'tf-log-action'], ['from', 'tf-log-from'], ['to', 'tf-log-to']].forEach(([k, id]) => $(id).addEventListener('change', (e) => { L[k] = e.target.value; draw(); }));
    $('tf-log-clear').addEventListener('click', () => { Object.assign(L, { q: '', user: '', action: '', from: '', to: '' }); draw(); });
    root.querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', () => ctx.openDetail(el.dataset.open)));
    if ($('tf-log-more')) $('tf-log-more').addEventListener('click', async () => {
      const last = L.rows[v][L.rows[v].length - 1];
      try {
        const more = v === 'audit' ? await ctx.api.listAudit({ before: last ? last.created_at : null, limit: 400 }) : await ctx.api.listTimelineAll({ before: last ? last.created_at : null, limit: 400 });
        const seen = new Set(L.rows[v].map((x) => x.id)); L.rows[v].push(...more.filter((x) => !seen.has(x.id))); L.done[v] = more.length < 400; draw();
      } catch (err) { ctx.toast(err, true); }
    });
    root.querySelectorAll('[data-exp]').forEach((el) => el.addEventListener('click', async () => {
      el.closest('details').open = false;
      const out = rows.map((l) => logRow(l, ctx)), name = 'transfers-audit-log-' + ctx.today;
      try {
        if (el.dataset.exp === 'csv') exportCsv(name, LOG_COLUMNS, out);
        else if (el.dataset.exp === 'xlsx') await exportXlsx(name, 'Audit Log', LOG_COLUMNS, out, [{ k: 'Report', v: 'Transfer audit log' }, { k: 'Entries', v: String(out.length) }, { k: 'Generated', v: ctx.today }]);
        else await exportPdf(name, 'Transfer Audit Log', [plural(out.length, 'entry', 'entries'), 'Generated ' + ctx.today], LOG_COLUMNS, out, 'Kittymae Jewels - Transfers');
      } catch (err) { ctx.toast(err, true); }
    }));
  }
}

// ================================================================ settings
export function renderSettings(ctx, panel) {
  const s = ctx.settings;
  panel.innerHTML = '<div id="tf-settings">' +
    '<div class="card bl-panel"><h3 class="bl-h">Alert limits</h3><div class="bl-formgrid">' +
      field('Waiting for approval — flag after (days)', '<input type="number" id="ts-approval" min="1" max="365" step="1" value="' + s.approval_days + '"><span class="muted">A Requested transfer older than this appears under “Waiting too long for approval”.</span>') +
      field('Approved but not released — flag after (days)', '<input type="number" id="ts-release" min="1" max="365" step="1" value="' + s.release_days + '"><span class="muted">An Approved or Preparing transfer older than this appears under “Approved but not yet released”.</span>') +
      field('In transit — flag after (days)', '<input type="number" id="ts-transit" min="1" max="365" step="1" value="' + s.transit_days + '"><span class="muted">A released transfer not fully received after this many days is flagged as late.</span>') +
      field('“Destination already holds plenty” at (pieces)', '<input type="number" id="ts-high" min="1" max="100000" step="1" value="' + s.high_dest_qty + '"><span class="muted">When a SKU’s stock at the destination is at or above this, the request form shows an information note. It never blocks anything.</span>') +
    '</div><div id="ts-errors"></div><p><button type="button" class="btn" id="ts-save">Save limits</button></p></div>' +
    (ctx.caps.mgr ? '<div class="card bl-panel"><h3 class="bl-h">Inventory check</h3><p class="muted">Compares every released transfer with the stock ledger: pieces released must equal pieces taken out of the source, and pieces received must equal pieces added to the destination. It only reads — it never changes stock.</p>' +
      '<p><button type="button" class="btn small" id="ts-check">Run the check</button></p><div id="ts-check-result"></div></div>' : '') +
    '<div class="card bl-panel"><h3 class="bl-h">How stock moves</h3><ul class="bl-roles">' +
      '<li><b>Requested, approved, preparing</b> — no stock moves and nothing is reserved. “Promised to send” is shown for information only.</li>' +
      '<li><b>Released</b> — the released pieces leave the source branch (one “Branch Transfer Out” entry per line in the stock ledger, with the stock before and after). They are in transit and belong to no branch.</li>' +
      '<li><b>Received</b> — only the good pieces are added to the destination (one “Branch Transfer In” entry per line). Damaged and missing pieces are <b>not</b> added; each becomes an open discrepancy that a manager resolves: written off (no stock change), found and received (added to the destination), or returned to the source (added back there).</li>' +
      '<li><b>Rejected or cancelled</b> before release — nothing ever moved, so nothing changes. A released transfer can’t be cancelled: receive it and report a discrepancy.</li>' +
      '<li>Every change is one row in the inventory ledger. Nothing is edited or deleted, a receipt can’t be counted twice, and a transfer can’t be released twice.</li></ul></div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Who can do what</h3><ul class="bl-roles">' +
      '<li><b>Admin / Manager</b> — everywhere: approve, reject, release, receive, revise, resolve discrepancies, override a stock shortage with a written reason, and read the audit log. Admin also edits a requested transfer and these settings.</li>' +
      '<li><b>Branch Supervisor</b> — requests transfers, prepares and releases from their own branch, receives at their own branch, and reports discrepancies.</li>' +
      '<li><b>Other staff</b> — a Sales Admin Associate, Operations Supervisor, Inventory Supervisor or Admin Assistant works across branches. Any other staff member without a special role sees and requests only transfers that involve their own branch. A person with the “receive at any branch” access (set in the Access Matrix) can receive at any branch.</li>' +
      '<li><b>Two people</b> — the person who requested a transfer can’t approve or release it, and whoever revises an approved quantity can’t approve the revision.</li></ul>' +
      '<p class="muted">The database enforces every rule — hiding a button on this page is only a courtesy. Transfers can never be deleted: a transfer is rejected or cancelled, and every change is kept in the history.</p></div></div>';

  const read = (id) => $(id).value;
  $('ts-save').addEventListener('click', async () => {
    const vals = { approval_days: read('ts-approval'), release_days: read('ts-release'), transit_days: read('ts-transit'), high_dest_qty: read('ts-high') };
    const ids = { approval_days: 'ts-approval', release_days: 'ts-release', transit_days: 'ts-transit', high_dest_qty: 'ts-high' };
    for (const k of Object.keys(vals)) { const n = Number(vals[k]); if (vals[k] === '' || !Number.isInteger(n) || n < 1 || n > 100000) { flagInvalid($(ids[k])); return; } }
    const btn = $('ts-save'); btn.disabled = true; $('ts-errors').innerHTML = '';
    try {
      const res = await ctx.api.saveSettings(Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, Number(v)])));
      if (!res || res.ok === false) { $('ts-errors').innerHTML = '<div class="msg error">' + esc(errorsText(res)) + '</div>'; btn.disabled = false; return; }
      ctx.toast('Limits saved.'); await ctx.refresh();
    } catch (err) { $('ts-errors').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; btn.disabled = false; }
  });
  if ($('ts-check')) $('ts-check').addEventListener('click', async () => {
    const btn = $('ts-check'), out = $('ts-check-result'); btn.disabled = true; out.innerHTML = '<p class="muted">Checking…</p>';
    try {
      const rows = await ctx.api.reconcile();
      out.innerHTML = rows && rows.length ? '<div class="msg error"><b>INVENTORY RECONCILIATION REQUIRED</b> — ' + plural(rows.length, 'line') + ' where a transfer and the stock ledger disagree. Nothing was changed; tell an Admin.</div><div class="table-scroll table-2col"><table class="lv-mini"><thead><tr><th>Transfer</th><th>SKU</th><th>Released</th><th>Ledger out</th><th>Received</th><th>Ledger in</th></tr></thead><tbody>' +
        rows.map((r) => '<tr><td data-label="Transfer">' + esc(r.transfer_number) + '</td><td data-label="SKU">' + esc(r.sku) + '</td><td data-label="Released">' + r.sent_qty + '</td><td data-label="Ledger out">' + r.ledger_out + '</td><td data-label="Received">' + r.received_qty + '</td><td data-label="Ledger in">' + r.ledger_in + '</td></tr>').join('') + '</tbody></table></div>'
        : '<p class="lv-pos">✓ Every released and received piece matches the stock ledger (' + plural(ctx.transfers.filter((t) => t._sentPcs > 0).length, 'transfer') + ' checked).</p>';
    } catch (err) { out.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; } finally { btn.disabled = false; }
  });
}
