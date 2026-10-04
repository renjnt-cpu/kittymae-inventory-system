// Leave Management -- Audit Log (Auditor / Admin only). Read-only: the table is append-only in
// the database, and this screen has no way to change it.
import { esc, fmtDateTime } from './leaveUi.js?v=20261004h';
import { activeFiltersHtml, emptyStateHtml, wireProxyButtons } from './uiKit.js?v=20261004h';

const $ = (id) => document.getElementById(id);
const af = { search: '', role: 'all', from: '', to: '' };
let rows = [];
let exhausted = false;
const PAGE = 100;

const pretty = (v) => v === null || v === undefined ? '' : esc(JSON.stringify(v, null, 2));
const manila = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

export async function renderAudit(ctx, root) {
  root.innerHTML = '<div class="card"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">' +
    '<div class="field" style="min-width:200px;"><label>Search</label><input type="text" id="au-search" placeholder="User, action, record…" value="' + esc(af.search) + '"></div>' +
    '<div class="field"><label>Role</label><select id="au-role"><option value="all">All</option></select></div>' +
    '<div class="field"><label>From</label><input type="date" id="au-from" value="' + esc(af.from) + '"></div>' +
    '<div class="field"><label>To</label><input type="date" id="au-to" value="' + esc(af.to) + '"></div>' +
    '<button type="button" class="btn small secondary" id="au-clear">Clear Filters</button></div></div>' +
    '<div id="au-active"></div><div id="au-list"><p class="muted">Loading…</p></div><div id="au-more" style="text-align:center;margin-top:8px;"></div>';
  try {
    rows = await ctx.api.listAudit({ limit: PAGE });
    exhausted = rows.length < PAGE;
  } catch (err) {
    $('au-list').innerHTML = '<div class="msg error">' + esc(err.message || String(err)) + '</div>';
    return;
  }
  const bind = (id, key, evt) => $(id).addEventListener(evt || 'change', (e) => { af[key] = e.target.value; draw(); });
  bind('au-search', 'search', 'input'); bind('au-role', 'role'); bind('au-from', 'from'); bind('au-to', 'to');
  $('au-clear').addEventListener('click', () => {
    Object.assign(af, { search: '', role: 'all', from: '', to: '' });
    $('au-search').value = ''; $('au-role').value = 'all'; $('au-from').value = ''; $('au-to').value = '';
    draw();
  });
  draw();
  $('au-more').addEventListener('click', async (e) => {
    if (!e.target.closest('#au-more-btn')) return;
    e.target.disabled = true;
    try {
      const more = await ctx.api.listAudit({ before: rows[rows.length - 1].created_at, limit: PAGE });
      const seen = new Set(rows.map((r) => r.id));
      rows = rows.concat(more.filter((r) => !seen.has(r.id)));
      exhausted = more.length < PAGE;
      draw();
    } catch (err) { ctx.toast(err.message || String(err), true); e.target.disabled = false; }
  });
}

function draw() {
  const roles = Array.from(new Set(rows.map((r) => r.user_role).filter(Boolean))).sort();
  const sel = $('au-role');
  sel.innerHTML = '<option value="all">All</option>' + roles.map((r) => '<option' + (af.role === r ? ' selected' : '') + '>' + esc(r) + '</option>').join('');
  const q = af.search.trim().toLowerCase();
  const shown = rows.filter((r) => (af.role === 'all' || r.user_role === af.role) &&
    (!af.from || manila(r.created_at) >= af.from) && (!af.to || manila(r.created_at) <= af.to) &&
    (!q || [r.user_name, r.user_role, r.action, r.record_table, r.record_id].join(' ').toLowerCase().includes(q)));
  $('au-active').innerHTML = activeFiltersHtml([
    { label: 'Search', value: esc(af.search.trim()) }, { label: 'Role', value: esc(af.role) }, { label: 'From', value: esc(af.from) }, { label: 'To', value: esc(af.to) },
  ], 'au-clear');
  wireProxyButtons($('au-active'));
  const list = $('au-list');
  if (!shown.length) {
    list.innerHTML = emptyStateHtml({ message: rows.length ? 'No log entries match these filters.' : 'The audit log is empty.', hasFilters: rows.length > 0, clearId: 'au-clear' });
    wireProxyButtons(list);
  } else {
    list.innerHTML = '<div class="card"><div class="muted" style="margin-bottom:8px;">' + shown.length + ' entr' + (shown.length === 1 ? 'y' : 'ies') + ' (newest first). The log cannot be edited or deleted.</div>' +
      '<div class="table-scroll table-2col"><table><thead><tr><th>When</th><th>User</th><th>Role</th><th>Action</th><th>Record</th><th>Details</th></tr></thead><tbody>' +
      shown.map((r) => '<tr><td data-label="When">' + esc(fmtDateTime(r.created_at)) + '</td>' +
        '<td data-label="User">' + esc(r.user_name || 'System') + '</td><td data-label="Role">' + esc(r.user_role || '—') + '</td>' +
        '<td data-label="Action"><b>' + esc(r.action) + '</b></td>' +
        '<td data-label="Record">' + esc(r.record_table || '') + (r.record_id ? '<div class="muted">' + esc(String(r.record_id).slice(0, 40)) + '</div>' : '') + '</td>' +
        '<td data-label="Details" class="full-row">' + ((r.previous_value || r.new_value || r.ip_address)
          ? '<details class="exp"><summary><span class="exp-arrow" aria-hidden="true">▸</span>View</summary><div class="exp-body">' +
            (r.previous_value ? '<div class="muted">Before</div><pre class="lv-pre">' + pretty(r.previous_value) + '</pre>' : '') +
            (r.new_value ? '<div class="muted">After</div><pre class="lv-pre">' + pretty(r.new_value) + '</pre>' : '') +
            (r.ip_address || r.user_agent ? '<div class="muted">' + esc([r.ip_address, r.user_agent].filter(Boolean).join(' · ')) + '</div>' : '') +
            '</div></details>' : '<span class="muted">—</span>') + '</td></tr>').join('') + '</tbody></table></div></div>';
  }
  $('au-more').innerHTML = exhausted ? '<span class="muted">That is the whole log.</span>' : '<button type="button" class="btn small secondary" id="au-more-btn">Load older entries</button>';
}
