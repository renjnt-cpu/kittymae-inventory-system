// Access & Performance Control Center -- Role / Position Matrix: every role and position side by side, so the owner can compare access at a glance, then open one to see who is in it,
// what it grants, its branch reach, the people on it with custom overrides, and its sensitive access. Editing a position's permissions stays on the Position Access Matrix page (it asks
// for confirmation and shows who is affected); this tab is for comparing.
import { esc, panel, badge, loadingBox, errorBox, friendly, empLink, wireLinks, btn } from './apcCore.js?v=20261011b';
import { createClientTable } from './apcTable.js?v=20261011b';
import { describeKey, SENSITIVE, BRANCH_SCOPE_KEYS, MODULES } from './apcAccessModel.js?v=20261011b';

const view = { cols: null, module: '', sensitiveOnly: false, detail: null };

export async function renderMatrix(root, A) {
  root.innerHTML = panel('Role / Position matrix', loadingBox('Loading roles and positions…'));
  let m;
  try { m = await A.api.matrix(); } catch (err) { root.innerHTML = errorBox(friendly(err)); return; }
  const keys = A.S.snap.keys, columns = m.columns;
  const withPeople = columns.filter((c) => c.members.length);
  if (!view.cols) view.cols = new Set(withPeople.map((c) => c.key));
  const shown = () => columns.filter((c) => view.cols.has(c.key));
  const grants = Object.fromEntries(columns.map((c) => [c.key, new Set(c.keys)]));

  root.innerHTML =
    panel('Role / Position matrix', '<div class="sd-fb-row"><div class="field"><label for="mx-mod">Module</label><select id="mx-mod"><option value="">All modules</option>' + MODULES.map((x) => '<option' + (view.module === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></div>' +
      '<label class="sd-inline"><input type="checkbox" id="mx-sens"' + (view.sensitiveOnly ? ' checked' : '') + '> Sensitive access only</label>' +
      '<details class="sd-menu"><summary class="btn small secondary">Columns (' + view.cols.size + ' of ' + columns.length + ')</summary><div class="sd-menu-pop sd-cols">' +
        '<div class="muted sd-small apc-pad">Roles and positions with nobody in them are hidden at first.</div>' +
        columns.map((c) => '<label><input type="checkbox" data-mc="' + esc(c.key) + '"' + (view.cols.has(c.key) ? ' checked' : '') + '> ' + esc(c.label) + ' <span class="muted">(' + (c.kind === 'role' ? 'role' : 'position') + ', ' + c.members.length + ')</span></label>').join('') + '</div></details>' +
      '<a class="btn small secondary" href="access-matrix.html">Edit in Position Access Matrix ↗</a></div><p class="muted sd-small">✓ = granted by that role or position. Click a column heading to open it. Individual overrides are not shown here — they sit on each person (Access Control tab).</p><div id="mx-table"></div>',
      { sub: 'Compare access across roles and positions' }) + '<div id="mx-detail"></div>';

  function table() {
    const cols = shown(), rows = keys.filter((k) => { const d = describeKey(k.key); return (!view.module || d.module === view.module) && (!view.sensitiveOnly || d.sensitive); })
      .map((k) => { const d = describeKey(k.key), row = { key: k.key, label: k.label, module: d.module, action: d.action, sens: d.sensitive || '' }; cols.forEach((c) => { row['c:' + c.key] = grants[c.key].has(k.key) ? 'YES' : 'NO'; }); return row; });
    createClientTable({ root: root.querySelector('#mx-table'), rows, size: 100, sort: { key: 'module', dir: 'asc' }, exportName: 'access-matrix', title: 'Access matrix — roles and positions', subtitle: () => ['Columns: ' + cols.map((c) => c.label).join(', '), 'Generated: ' + new Date().toLocaleString('en-US', { timeZone: A.ctx.tz })],
      searchPlaceholder: 'Search permissions…', emptyText: 'No permissions match.', rowClass: (r) => (r.sens ? 'apc-sens-tr' : ''),
      columns: [{ key: 'label', label: 'Task / permission', render: (r) => '<b>' + esc(r.label) + '</b>' + (r.sens ? ' ' + badge('SENSITIVE', 'red') : '') + '<div class="muted sd-small"><code>' + esc(r.key) + '</code></div>' }, { key: 'module', label: 'Module' },
        { key: 'action', label: 'Kind', render: (r) => esc(r.action) }].concat(cols.map((c) => ({ key: 'c:' + c.key, label: c.label, title: c.kind === 'role' ? 'Role' : 'Position', align: 'right', render: (r) => (r['c:' + c.key] === 'YES' ? '<span class="apc-yes">✓ YES</span>' : '<span class="apc-no">NO</span>'),
          hide: false }))) });
    // plain buttons above the table to open a column (a header click is used for sorting)
    root.querySelector('#mx-open').innerHTML = cols.map((c) => '<button type="button" class="act-link" data-open="' + esc(c.key) + '">' + esc(c.label) + '</button>').join(' · ');
    root.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openDetail(b.dataset.open)));
  }
  root.querySelector('#mx-table').insertAdjacentHTML('beforebegin', '<div class="apc-open-row"><span class="muted">Open details for:</span> <span id="mx-open"></span></div>');
  root.querySelector('#mx-mod').addEventListener('change', (e) => { view.module = e.target.value; table(); });
  root.querySelector('#mx-sens').addEventListener('change', (e) => { view.sensitiveOnly = e.target.checked; table(); });
  root.querySelectorAll('[data-mc]').forEach((cb) => cb.addEventListener('change', () => { if (cb.checked) view.cols.add(cb.dataset.mc); else if (view.cols.size > 1) view.cols.delete(cb.dataset.mc); else cb.checked = true; table(); }));

  function openDetail(colKey) {
    const c = columns.find((x) => x.key === colKey); if (!c) return; view.detail = colKey;
    const people = c.members.map((p) => A.byId(p.id)).filter(Boolean), byKey = Object.fromEntries(keys.map((k) => [k.key, k]));
    const byMod = {}; c.keys.forEach((k) => { const d = describeKey(k); (byMod[d.module] = byMod[d.module] || []).push(byKey[k] ? byKey[k].label : k); });
    const sens = c.keys.filter((k) => SENSITIVE[k]), branch = c.keys.filter((k) => BRANCH_SCOPE_KEYS.includes(k));
    const withOv = people.filter((p) => p.snap && (p.snap.overrides || []).some((o) => o.active && !['access_perf.view', 'staff_analytics.view'].includes(o.key)));
    root.querySelector('#mx-detail').innerHTML = panel(c.label + (c.kind === 'role' ? ' (role)' : ' (position)'), '<div class="apc-detail-cols">' +
      '<div><h4>Employees using it (' + people.length + ')</h4>' + (people.length ? '<ul class="apc-plain">' + people.map((p) => '<li>' + empLink(p.id, p.name, 'access') + '</li>').join('') + '</ul>' : '<p class="muted">Nobody.</p>') +
        (c.kind === 'position' && !c.auto_access ? '<p class="apc-notice">Automatic Access is <b>off</b> for this position: its permissions do not apply to anyone until it is turned on.</p>' : '') + (c.kind === 'position' && !c.is_active ? '<p class="muted">This position is inactive.</p>' : '') + '</div>' +
      '<div><h4>Permissions (' + c.keys.length + ')</h4>' + (Object.keys(byMod).length ? '<ul class="apc-plain">' + Object.keys(byMod).sort().map((mo) => '<li><b>' + esc(mo) + '</b> <span class="muted">' + byMod[mo].length + '</span><div class="muted sd-small">' + esc(byMod[mo].join(' · ')) + '</div></li>').join('') + '</ul>' : '<p class="muted">Grants nothing.</p>') + '</div>' +
      '<div><h4>Branch rules</h4>' + (branch.length ? '<ul class="apc-plain">' + branch.map((k) => '<li>' + esc(byKey[k] ? byKey[k].label : k) + '</li>').join('') + '</ul>' : '<p class="muted">No cross-branch permission — limited to their own branch and any extra branches assigned.</p>') +
        '<h4>Sensitive access</h4>' + (sens.length ? '<ul class="apc-plain">' + sens.map((k) => '<li>' + badge('SENSITIVE', 'red') + ' ' + esc(SENSITIVE[k]) + ' <span class="muted">— ' + esc(byKey[k] ? byKey[k].label : k) + '</span></li>').join('') + '</ul>' : '<p class="muted">None.</p>') +
        '<h4>People with custom overrides</h4>' + (withOv.length ? '<ul class="apc-plain">' + withOv.map((p) => '<li>' + empLink(p.id, p.name, 'access') + ' <span class="muted">' + p.snap.overrides.filter((o) => o.active).length + ' setting(s)</span></li>').join('') + '</ul>' : '<p class="muted">Nobody has one.</p>') + '</div></div>',
      { actions: btn('Close', 'id="mx-close"', 'secondary') });
    wireLinks(root.querySelector('#mx-detail'), A);
    root.querySelector('#mx-close').addEventListener('click', () => { view.detail = null; root.querySelector('#mx-detail').innerHTML = ''; });
    root.querySelector('#mx-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  table();
  if (view.detail) openDetail(view.detail);
  return { destroy() {} };
}
