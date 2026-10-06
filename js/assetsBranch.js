// Assets & Supplies Custodian -- the Branch Assets tab: what each branch has (by status), what is moving in and out, which departments hold
// what, and the assets of the branch you pick. A branch supervisor sees their own branch; a custodian with the "every branch" permission sees
// them all. A branch's list is the same register as the Assets tab -- there is no second copy of any asset.
import { esc, plural, field, opts, emptyBox, branchChip, hbars, COLORS, statusColor, donut } from './assetsUi.js?v=20261007g';
import { sum, group, uniqueSorted } from './assetsLogic.js?v=20261007g';
import { assetTableHtml, assetColumns } from './assetsList.js?v=20261007g';
import { bindActions } from './assetsActions.js?v=20261007g';

const $ = (id) => document.getElementById(id);
const S = { branch: '', dept: '' };

export function renderBranches(ctx, panel) {
  const live = ctx.assets.filter((a) => !['Disposed', 'Archived'].includes(a.status)), byBranch = group(live, (a) => a.branch_id || 0);
  const trs = ctx.data.transfers.filter((t) => ['Requested', 'Approved', 'In Transit'].includes(t.status));
  const branchIds = [...new Set([...Object.keys(byBranch).map(Number), ...(ctx.caps.viewAll ? ctx.branches.map((b) => b.id) : [])])].filter((id) => id === 0 || ctx.branchById[id]).sort((a, b) => (a || 999) - (b || 999));
  const name = (id) => (id ? (ctx.branchById[id] || {}).name || 'Branch ' + id : 'No branch recorded');
  const rowFor = (id) => {
    const l = byBranch[id] || [], n = (f) => l.filter(f).length;
    return { id, name: name(id), total: l.length, available: n((a) => ['Available', 'In Storage', 'Returned'].includes(a.status)), assigned: n((a) => a._asg && a._asg.assignee_type === 'Employee'), inuse: n((a) => a.status === 'In Use'),
      repair: n((a) => ['Under Repair', 'Under Maintenance'].includes(a.status)), damaged: n((a) => a.status === 'Damaged'), lost: n((a) => ['Lost', 'Missing'].includes(a.status)), disposal: n((a) => a.status === 'For Disposal'),
      incoming: trs.filter((t) => t.to_branch_id === id).length, outgoing: trs.filter((t) => t.from_branch_id === id).length, attention: n((a) => a._att.some((x) => !['aging', 'warranty_expired'].includes(x.code))) };
  };
  const rows = branchIds.map(rowFor);
  if (S.branch !== '' && !branchIds.includes(Number(S.branch))) S.branch = '';
  const sel = S.branch === '' ? null : Number(S.branch), selAssets = sel === null ? [] : (byBranch[sel] || []).filter((a) => !S.dept || (a.department || '') === S.dept);
  const depts = sel === null ? [] : uniqueSorted((byBranch[sel] || []).map((a) => a.department));
  const sups = sel === null ? [] : Object.values(ctx.personById).filter((p) => String(p.branch_id) === String(sel) && p.status === 'Active' && /supervisor/i.test((p.position || '') + ' ' + (p.job_title || ''))).map((p) => p.full_name);
  const head = '<tr><th>Branch</th><th>Total</th><th>Available</th><th>With employees</th><th>In use</th><th>Repair</th><th>Damaged</th><th>Lost / missing</th><th>For disposal</th><th>Moving in</th><th>Moving out</th><th>Needs attention</th></tr>';
  const cell = (label, v, bad) => '<td data-label="' + label + '">' + (v ? (bad ? '<b class="lv-neg">' + v + '</b>' : v) : '<span class="muted">—</span>') + '</td>';
  const tr = (r) => '<tr' + (sel === r.id ? ' class="ac-row-sel"' : '') + '><td data-label="Branch" class="full-row"><button type="button" class="bl-link" data-pick="' + r.id + '">' + esc(r.name) + '</button></td>' + '<td data-label="Total"><b>' + r.total + '</b></td>' + cell('Available', r.available) + cell('With employees', r.assigned) + cell('In use', r.inuse) +
    cell('Repair', r.repair) + cell('Damaged', r.damaged, true) + cell('Lost / missing', r.lost, true) + cell('For disposal', r.disposal) + cell('Moving in', r.incoming) + cell('Moving out', r.outgoing) + cell('Needs attention', r.attention, true) + '</tr>';
  const status = {};
  selAssets.forEach((a) => { status[a.status] = (status[a.status] || 0) + 1; });
  const dep = group(byBranch[sel] || [], (a) => a.department || 'No department');
  panel.innerHTML = '<div id="ac-br">' + '<div class="card bl-panel"><h3 class="bl-h">Assets by branch <span class="muted">· ' + plural(live.length, 'active asset') + '</span></h3>' +
    (rows.length ? '<div class="table-scroll table-2col bl-tablewrap"><table class="bl-table"><thead>' + head + '</thead><tbody>' + rows.map(tr).join('') + '</tbody></table></div><p class="muted">Click a branch to see its assets below.</p>' : emptyBox('No assets are recorded yet.')) + '</div>' +
    (sel !== null ? '<div class="card bl-panel"><div class="bl-toolrow"><h3 class="bl-h bl-grow">' + esc(name(sel)) + ' <span class="muted">· ' + plural((byBranch[sel] || []).length, 'asset') + (sups.length ? ' · supervisor: ' + esc(sups.join(', ')) : '') + '</span></h3>' +
      field('Department', '<select id="ac-br-dept">' + opts(depts, S.dept, 'All departments') + '</select>') + '<div class="field"><label>&nbsp;</label><button type="button" class="btn small secondary" id="ac-br-open">Open in the Assets tab</button></div></div>' +
      '<div class="bl-charts"><div class="card bl-panel"><h3 class="bl-h">By status</h3>' + donut(Object.entries(status).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, color: statusColor(label) })), { center: selAssets.length, centerSub: 'assets' }) + '</div>' +
      '<div class="card bl-panel"><h3 class="bl-h">By department</h3>' + hbars(Object.entries(dep).sort((a, b) => b[1].length - a[1].length).map(([label, l]) => ({ label, value: l.length })), { color: '#7b5fb5' }) + '</div></div>' +
      (selAssets.length ? assetTableHtml(selAssets.slice(0, 100), assetColumns(ctx, false, false, new Set())) + (selAssets.length > 100 ? '<p class="muted">Showing the first 100 — open the Assets tab for the rest.</p>' : '') : emptyBox('No assets match.')) + '</div>' : '') + '</div>';
  const root = $('ac-br');
  root.querySelectorAll('[data-pick]').forEach((el) => el.addEventListener('click', () => { S.branch = S.branch === el.dataset.pick ? '' : el.dataset.pick; S.dept = ''; ctx.rerender(); }));
  if ($('ac-br-dept')) $('ac-br-dept').addEventListener('change', (e) => { S.dept = e.target.value; ctx.rerender(); });
  if ($('ac-br-open')) $('ac-br-open').addEventListener('click', () => { ctx.ui.assets.q = { ...ctx.ui.assets.q, branch: String(sel), department: S.dept }; ctx.applyView('active'); });
  bindActions(ctx, root);
}
