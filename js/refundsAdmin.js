// Refund Management -- the History tab (everything that ever happened on a request; permanent and read-only, with the
// field-by-field audit log for Admins) and the Admin-only Settings tab (alert limits, refund reasons, who can do what).
import { esc, fmtDateTime, tagBadge, plural, friendly, errorsText } from './refundsUi.js?v=20261007j';
import { uniqueSorted } from './refundsLogic.js?v=20261007j';
import { LOG_COLUMNS, logRow } from './refundsExport.js?v=20261007j';
import { exportCsv, exportXlsx, exportPdf } from './leaveExport.js?v=20261007j';
import { flagInvalid } from './uiKit.js?v=20261007j';

const $ = (id) => document.getElementById(id);
const field = (label, inner) => '<div class="field"><label>' + label + '</label>' + inner + '</div>';

// ================================================================ history
export const newLogState = () => ({ view: 'activity', rows: { activity: [], audit: [] }, loaded: { activity: false, audit: false }, done: { activity: false, audit: false }, q: '', user: '', action: '', from: '', to: '' });

const personOf = (l, v) => (v === 'audit' ? l.user_name : l.performed_by_name) || 'System';
function filtered(L, ctx) {
  const v = L.view, q = L.q.toLowerCase();
  return L.rows[v].filter((l) => {
    const day = String(l.created_at).slice(0, 10), r = l.refund_id ? ctx.byId.get(l.refund_id) : null;
    if (L.user && personOf(l, v) !== L.user) return false;
    if (L.action && l.action !== L.action) return false;
    if (L.from && day < L.from) return false;
    if (L.to && day > L.to) return false;
    return !q || [r && r.refund_request_number, r && r.customer_name, personOf(l, v), l.action, l.description, l.field_name, l.old_value, l.new_value].join(' ').toLowerCase().includes(q);
  });
}
const refundCell = (l, ctx) => {
  const r = l.refund_id ? ctx.byId.get(l.refund_id) : null;
  if (r) return '<button type="button" class="bl-link" data-open="' + r.id + '">' + esc(r.refund_request_number) + '</button><div class="muted bl-sub">' + esc(r.customer_name) + '</div>';
  return l.refund_id ? esc('#' + l.refund_id) + ' <span class="muted">(not listed)</span>' : '<span class="muted">Settings</span>';
};
const change = (l) => {
  const f = l.field_name ? '<b>' + esc(String(l.field_name).replace(/_/g, ' ')) + '</b>: ' : '';
  const b = l.old_value !== null && l.old_value !== undefined ? '<span class="bl-before">' + esc(String(l.old_value).slice(0, 120)) + '</span> → ' : '';
  const a = l.new_value !== null && l.new_value !== undefined ? '<span class="bl-after">' + esc(String(l.new_value).slice(0, 120)) + '</span>' : '';
  return (f || b || a) ? f + b + a : '—';
};

export async function renderLog(ctx, panel) {
  const L = ctx.ui.log;
  if (L.view === 'audit' && !ctx.canAdmin) L.view = 'activity';
  panel.innerHTML = '<div id="rf-log"><p class="muted">Loading the history…</p></div>';
  if (!L.loaded[L.view]) {
    try {
      L.rows[L.view] = L.view === 'audit' ? await ctx.api.listAudit({ limit: 400 }) : await ctx.api.listTimelineAll({ limit: 400 });
      L.loaded[L.view] = true; L.done[L.view] = L.rows[L.view].length < 400;
    } catch (err) { panel.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; return; }
  }
  draw();

  function draw() {
    const v = L.view, rows = filtered(L, ctx);
    panel.innerHTML = '<div id="rf-log">' +
      (ctx.canAdmin ? '<div class="bl-views" role="group" aria-label="History view"><button type="button" class="bl-chip' + (v === 'activity' ? ' bl-chip-on' : '') + '" data-lv="activity">Activity</button><button type="button" class="bl-chip' + (v === 'audit' ? ' bl-chip-on' : '') + '" data-lv="audit">Audit log (every field change)</button></div>' : '') +
      '<div class="card"><div class="bl-filters">' +
      '<div class="field bl-grow"><label>Search</label><input type="search" id="rf-log-q" placeholder="Refund no., customer, person, action…" value="' + esc(L.q) + '"></div>' +
      field('Person', '<select id="rf-log-user"><option value="">Everyone</option>' + uniqueSorted(L.rows[v].map((l) => personOf(l, v))).map((n) => '<option' + (L.user === n ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select>') +
      field('Action', '<select id="rf-log-action"><option value="">Any</option>' + uniqueSorted(L.rows[v].map((l) => l.action)).map((n) => '<option' + (L.action === n ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select>') +
      field('From', '<input type="date" id="rf-log-from" value="' + esc(L.from) + '">') + field('To', '<input type="date" id="rf-log-to" value="' + esc(L.to) + '">') +
      '<div class="field"><label>&nbsp;</label><div class="bl-btnrow"><button type="button" class="btn small secondary" id="rf-log-clear">Clear</button>' +
      (v === 'audit' ? '<details class="bl-menu bl-exportmenu"><summary class="btn small secondary">Export ▾</summary><div class="bl-menu-pop"><button type="button" data-exp="csv">CSV</button><button type="button" data-exp="xlsx">Excel (.xlsx)</button><button type="button" data-exp="pdf">PDF</button></div></details>' : '') + '</div></div></div></div>' +
      '<p class="muted">' + plural(rows.length, 'entry', 'entries') + (rows.length !== L.rows[v].length ? ' of ' + L.rows[v].length + ' loaded' : '') + '. This history is permanent — nobody can edit or delete it.</p>' +
      (rows.length ? '<div class="table-scroll table-2col"><table class="bl-table"><thead><tr><th>When</th><th>Person</th><th>Refund</th><th>' + (v === 'audit' ? 'Action' : 'What happened') + '</th>' + (v === 'audit' ? '<th>Change</th>' : '') + '</tr></thead><tbody>' + rows.slice(0, 300).map((l) =>
        '<tr><td data-label="When">' + esc(fmtDateTime(l.created_at)) + '</td><td data-label="Person">' + esc(personOf(l, v)) + '<div class="muted bl-sub">' + esc((v === 'audit' ? l.user_role : l.performed_by_role) || '') + '</div></td>' +
        '<td data-label="Refund">' + refundCell(l, ctx) + '</td>' +
        (v === 'audit' ? '<td data-label="Action">' + esc(l.action) + '</td><td data-label="Change" class="full-row">' + change(l) + '</td>'
          : '<td data-label="What happened" class="full-row"><b>' + esc(l.action) + '</b>' + (l.description ? ' <span class="muted">— ' + esc(l.description) + '</span>' : '') + '</td>') + '</tr>').join('') + '</tbody></table></div>' +
        (rows.length > 300 ? '<p class="muted">Showing the newest 300 — narrow the filters' + (v === 'audit' ? ' or export' : '') + ' to see the rest.</p>' : '') : '<div class="empty-state"><div class="empty-state-msg">No history matches these filters.</div></div>') +
      (!L.done[v] ? '<p><button type="button" class="btn small secondary" id="rf-log-more">Load older entries</button></p>' : '') + '</div>';

    const root = $('rf-log');
    root.querySelectorAll('[data-lv]').forEach((el) => el.addEventListener('click', () => { L.view = el.dataset.lv; L.user = ''; L.action = ''; ctx.rerender(); }));
    let t = null;
    $('rf-log-q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { L.q = e.target.value.trim(); draw(); const s = $('rf-log-q'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 300); });
    [['user', 'rf-log-user'], ['action', 'rf-log-action'], ['from', 'rf-log-from'], ['to', 'rf-log-to']].forEach(([k, id]) => $(id).addEventListener('change', (e) => { L[k] = e.target.value; draw(); }));
    $('rf-log-clear').addEventListener('click', () => { Object.assign(L, { q: '', user: '', action: '', from: '', to: '' }); draw(); });
    root.querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', () => ctx.openDetail(Number(el.dataset.open))));
    if ($('rf-log-more')) $('rf-log-more').addEventListener('click', async () => {
      const last = L.rows[v][L.rows[v].length - 1];
      try {
        const more = v === 'audit' ? await ctx.api.listAudit({ before: last ? last.created_at : null, limit: 400 }) : await ctx.api.listTimelineAll({ before: last ? last.created_at : null, limit: 400 });
        const seen = new Set(L.rows[v].map((x) => x.id)); L.rows[v].push(...more.filter((x) => !seen.has(x.id))); L.done[v] = more.length < 400; draw();
      } catch (err) { ctx.toast(err, true); }
    });
    root.querySelectorAll('[data-exp]').forEach((el) => el.addEventListener('click', async () => {
      el.closest('details').open = false;
      const out = rows.map((l) => logRow(l, ctx)), name = 'refunds-audit-log-' + ctx.today;
      try {
        if (el.dataset.exp === 'csv') exportCsv(name, LOG_COLUMNS, out);
        else if (el.dataset.exp === 'xlsx') await exportXlsx(name, 'Audit Log', LOG_COLUMNS, out, [{ k: 'Report', v: 'Refund audit log' }, { k: 'Entries', v: String(out.length) }, { k: 'Generated', v: ctx.today }]);
        else await exportPdf(name, 'Refund Audit Log', [plural(out.length, 'entry', 'entries'), 'Generated ' + ctx.today], LOG_COLUMNS, out, 'Kittymae Jewels - Refund Management');
      } catch (err) { ctx.toast(err, true); }
    }));
  }
}

// ================================================================ settings
export function renderSettings(ctx, panel) {
  const count = (name) => ctx.refunds.filter((r) => r.reason_category === name).length;
  panel.innerHTML = '<div id="rf-settings">' +
    '<div class="card bl-panel"><h3 class="bl-h">Alert limits</h3><div class="bl-formgrid">' +
      field('High-amount refunds start at (PHP)', '<input type="number" id="rs-high" min="0" step="100" inputmode="decimal" value="' + ctx.highAmount + '"><span class="muted">Open refunds at or above this appear in the “High-amount refunds” alert and the High Amount filter.</span>') +
      field('Warn after this many customer follow-ups', '<input type="number" id="rs-warn" min="1" max="20" value="' + ctx.followWarn + '"><span class="muted">When a customer has had to ask about the same refund this many times, it is flagged on the dashboard and in the list.</span>') +
    '</div><div id="rs-errors"></div><p><button type="button" class="btn" id="rs-save">Save limits</button></p></div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Refund reasons</h3>' +
      '<div class="table-scroll table-2col"><table class="bl-table"><thead><tr><th>Reason</th><th>Requests</th><th>Status</th><th></th></tr></thead><tbody>' + ctx.reasons.map((x) =>
        '<tr><td data-label="Reason"><b>' + esc(x.name) + '</b></td><td data-label="Requests">' + count(x.name) + '</td><td data-label="Status">' + (x.active ? tagBadge('In use', 'bl-tag-green') : tagBadge('Hidden', 'bl-tag-gray')) + '</td>' +
        '<td data-label="" class="full-row"><button type="button" class="btn small secondary" data-toggle-reason="' + esc(x.name) + '" data-active="' + (x.active ? '1' : '0') + '">' + (x.active ? 'Hide' : 'Show again') + '</button></td></tr>').join('') + '</tbody></table></div>' +
      '<div class="bl-inline rf-addreason"><input type="text" id="rs-newreason" maxlength="60" placeholder="New reason, e.g. Packaging damaged" aria-label="New reason"><button type="button" class="btn small" id="rs-addreason">Add reason</button></div><div id="rs-reason-errors"></div>' +
      '<p class="muted">Hiding a reason removes it from the new-request form; requests that already use it keep it.</p></div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Who can do what</h3><ul class="bl-roles">' +
      '<li><b>Admin</b> (“Refunds — Admin”) — everything, including editing any request, reopening closed ones, voiding a payment, the audit log and these settings.</li>' +
      '<li><b>Manager</b> (“Refunds — Manager”, the existing approval access) — reviews, approves or rejects requests, sets priority and flags, verifies proof, and records refund payments.</li>' +
      '<li><b>Finance</b> (“Refunds — Finance”) — records refund payments, uploads proof, adds notes and logs customer contact, and sees every request and all reports. Cannot approve.</li>' +
      '<li><b>Viewer</b> (“Refunds — View only”) — sees every request, the dashboard and reports; cannot change anything.</li>' +
      '<li><b>Staff</b> (everyone else with a login) — creates refund requests and sees, edits (while waiting for review), cancels and adds notes to <i>their own</i> requests only.</li></ul>' +
      '<p class="muted">Roles are granted per person or per position in the <a href="access-matrix.html">Access Matrix</a>. The database enforces every rule — hiding a button on this page is only a courtesy. Refunds can never be deleted: a request is cancelled or rejected, a payment is voided, and every change is kept in the history.</p></div></div>';

  $('rs-save').addEventListener('click', async () => {
    const high = $('rs-high').value, warn = $('rs-warn').value;
    if (high === '' || Number(high) < 0) { flagInvalid($('rs-high')); return; }
    if (warn === '' || Number(warn) < 1 || Number(warn) > 20) { flagInvalid($('rs-warn')); return; }
    const btn = $('rs-save'); btn.disabled = true; $('rs-errors').innerHTML = '';
    try {
      const res = await ctx.api.saveSettings({ high_amount: Number(high), follow_up_warn: Number(warn) });
      if (!res || res.ok === false) { $('rs-errors').innerHTML = '<div class="msg error">' + esc(errorsText(res)) + '</div>'; btn.disabled = false; return; }
      ctx.toast('Limits saved.'); await ctx.refresh();
    } catch (err) { $('rs-errors').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; btn.disabled = false; }
  });
  const saveReason = async (name, active) => {
    $('rs-reason-errors').innerHTML = '';
    try {
      const res = await ctx.api.saveReason(name, active);
      if (!res || res.ok === false) { $('rs-reason-errors').innerHTML = '<div class="msg error">' + esc(errorsText(res)) + '</div>'; return; }
      ctx.toast(active ? 'Reason saved.' : 'Reason hidden.'); await ctx.refresh();
    } catch (err) { $('rs-reason-errors').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; }
  };
  panel.querySelectorAll('[data-toggle-reason]').forEach((el) => el.addEventListener('click', () => saveReason(el.dataset.toggleReason, el.dataset.active !== '1')));
  $('rs-addreason').addEventListener('click', () => { const n = $('rs-newreason').value.trim(); if (!n) { flagInvalid($('rs-newreason')); return; } saveReason(n, true); });
}
