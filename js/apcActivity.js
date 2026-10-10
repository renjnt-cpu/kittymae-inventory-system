// Access & Performance Control Center -- Activity Log (what everyone did, newest first) and the Permission Change History (every access change: old access -> new access, who, when, why).
// Both read records that already exist (the Global Activity feed and the access change log); nothing is copied.
import { esc, panel, dash, loadingBox, errorBox, friendly, empLink, wireLinks, btn, badge } from './apcCore.js?v=20261011a';
import { createClientTable } from './apcTable.js?v=20261011a';

const KINDS = ['Created', 'Edited', 'Approved', 'Deleted', 'Voided', 'Refunded', 'Encoded', 'Transferred', 'Changed Permission'];
const f = { employee: '', module: '', kind: '' };
const PAGE = 300;
const yn = (b) => (b === null || b === undefined ? dash : (b ? 'YES' : 'NO'));

export async function renderActivity(root, A) {
  const people = A.people();
  root.innerHTML = panel('Activity log', '<p class="muted sd-small">Everything recorded in the Global Activity feed, plus individual permission changes. Date range and branch follow the filters above; the feed itself starts on 21 Sep 2026.</p>' +
    '<div class="sd-fb-row"><div class="field"><label for="al-emp">Employee</label><select id="al-emp"><option value="">Everyone</option>' + people.map((p) => '<option value="' + esc(p.id) + '"' + (f.employee === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label for="al-mod">Module</label><select id="al-mod"><option value="">All modules</option></select></div>' +
    '<div class="field"><label for="al-kind">Action</label><select id="al-kind"><option value="">All actions</option>' + KINDS.map((k) => '<option' + (f.kind === k ? ' selected' : '') + '>' + esc(k) + '</option>').join('') + '</select></div></div>' +
    '<div id="al-table">' + loadingBox() + '</div><div class="sd-t-pager" id="al-more"></div>') + '<div id="al-hist"></div>';
  let rows = [], total = 0, modules = [], offset = 0, tbl = null, token = 0;
  async function load(append) {
    const my = ++token, box = root.querySelector('#al-table');
    if (!append) { offset = 0; rows = []; box.innerHTML = loadingBox(); }
    try {
      const r = await A.api.activity(Object.assign({ employee: f.employee || null, module: f.module || null, kind: f.kind || null, limit: PAGE, offset }, A.filters.server()));
      if (my !== token) return;
      rows = rows.concat(r.rows); total = r.total; modules = r.modules || modules; offset = rows.length;
      const ms = root.querySelector('#al-mod'); ms.innerHTML = '<option value="">All modules</option>' + modules.map((m) => '<option' + (f.module === m ? ' selected' : '') + '>' + esc(m) + '</option>').join('');
      const shaped = rows.map((x) => Object.assign({}, x, { rec: x.title || x.ref || '' }));
      if (!tbl || !append) {
        box.innerHTML = ''; tbl = createClientTable({ root: box, rows: shaped, size: 50, sort: { key: 'at', dir: 'desc' }, exportName: 'activity-log', title: 'Activity log', subtitle: () => A.filters.describe(), searchPlaceholder: 'Search the loaded activity…', emptyText: 'No activity for these filters.',
          columns: [{ key: 'employee_name', label: 'Employee', render: (x) => empLink(x.employee_id, x.employee_name, 'people') }, { key: 'at', label: 'Date / Time', type: 'dt' }, { key: 'module', label: 'Module' }, { key: 'action', label: 'Action', render: (x) => esc(x.action) + (x.kind && x.kind !== x.action ? ' <span class="muted">(' + esc(x.kind) + ')</span>' : '') },
            { key: 'rec', label: 'Record', render: (x) => '<span class="sd-small">' + esc(x.rec) + '</span>' }, { key: 'ref', label: 'Reference', hide: true }, { key: 'branch_name', label: 'Branch' }, { key: 'amount', label: 'Amount', type: 'money', hide: true }], afterDraw: (w) => wireLinks(w, A) });
      } else tbl.setRows(shaped);
      root.querySelector('#al-more').innerHTML = (rows.length < total ? '<span class="muted">Showing the newest ' + rows.length + ' of ' + total + '.</span> ' + btn('Load older', 'id="al-older"', 'secondary') : (total ? '<span class="muted">All ' + total + ' shown.</span>' : ''));
      const older = root.querySelector('#al-older'); if (older) older.addEventListener('click', () => load(true));
    } catch (err) { if (my === token) box.innerHTML = errorBox(friendly(err)); }
  }
  root.querySelector('#al-emp').addEventListener('change', (e) => { f.employee = e.target.value; tbl = null; load(false); });
  root.querySelector('#al-mod').addEventListener('change', (e) => { f.module = e.target.value; tbl = null; load(false); });
  root.querySelector('#al-kind').addEventListener('change', (e) => { f.kind = e.target.value; tbl = null; load(false); });
  load(false);
  loadHistory(A, root.querySelector('#al-hist'));
  return { destroy() { token++; } };
}

async function loadHistory(A, el) {
  el.innerHTML = panel('Permission change history', '<div id="ph-body">' + loadingBox() + '</div>', { sub: 'Every change to who can do what — for one person, or for a whole role or position. Changes made before 8 Oct 2026 do not record the old access.' });
  const body = el.querySelector('#ph-body');
  try {
    const r = await A.api.history(Object.assign({}, A.filters.server(), { employee: null }));
    const rows = r.map((x) => ({ at: x.at, who: x.employee_name || (x.position_key ? x.position_key.replace(/^(ROLE|POSITION):/, '') + ' (all ' + (x.position_key.startsWith('ROLE:') ? 'with this role' : 'in this position') + ')' : '—'),
      perm: x.permission_label || x.details || x.action, key: x.permission_key || '', old: x.old_access, nw: x.new_access, by: x.changed_by_name || 'System', reason: x.reason || '', kind: x.kind, action: x.action }));
    createClientTable({ root: body, rows, size: 25, sort: { key: 'at', dir: 'desc' }, exportName: 'permission-history', title: 'Permission change history', subtitle: () => A.filters.describe(), searchPlaceholder: 'Search permission, person, reason…', emptyText: 'No access changes in this period.',
      columns: [{ key: 'who', label: 'Employee' }, { key: 'perm', label: 'Permission', render: (x) => '<span class="sd-small">' + esc(x.perm) + '</span>' }, { key: 'old', label: 'Old Access', render: (x) => yn(x.old), sort: (x) => (x.old === null ? '' : x.old ? 'YES' : 'NO') },
        { key: 'nw', label: 'New Access', render: (x) => (x.nw === null || x.nw === undefined ? dash : (x.nw ? badge('YES', 'green') : badge('NO', 'gray'))), sort: (x) => (x.nw === null ? '' : x.nw ? 'YES' : 'NO') },
        { key: 'by', label: 'Changed By' }, { key: 'at', label: 'Date', type: 'dt' }, { key: 'reason', label: 'Reason' }, { key: 'action', label: 'Type', hide: true }] });
  } catch (err) { body.innerHTML = errorBox(friendly(err)); }
}
