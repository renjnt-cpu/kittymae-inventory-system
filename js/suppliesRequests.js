// Assets & Supplies Custodian -- supply requests: anyone allowed to request supplies asks for what they need; a manager approves all or part
// of it (with a reason when less), a custodian prepares and issues it (in one go or in parts), and the requester confirms they received it.
// Nothing moves stock until it is ISSUED -- approving only says "yes, up to this much". A request is never deleted: it is rejected, waitlisted
// or cancelled, and every step is recorded with who and when.
import { esc, plural, field, opts, qty, dt, emptyBox, flowBadge, branchName, branchChip, openDrawer, closeDrawer, drawerBody, kv, setDetailHandlers, friendly, errorsText, val, branchOptions, fmtDateTime, isDrawerOpen } from './assetsUi.js?v=20261007d';
import { REQUEST_STATUSES, REQUEST_OPEN, stockOf, dayOf, daysBetween } from './assetsLogic.js?v=20261007d';
import { exportRequests } from './assetsReports.js?v=20261007d';
import { exportMenu } from './assetsList.js?v=20261007d';
import { flagInvalid } from './uiKit.js?v=20261007d';

const $ = (id) => document.getElementById(id);
export const newRequestsState = () => ({ q: '', status: 'open', mine: false, branch: '' });
const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2));
const myBranches = (ctx) => (ctx.caps.viewAll ? ctx.branches : ctx.branches.filter((b) => b.id === ctx.employee.branch_id));
const errBox = (html) => { const b = $('ac-sd-errors'); if (b) b.innerHTML = html ? '<div class="msg error">' + html + '</div>' : ''; if (html && drawerBody('side')) drawerBody('side').scrollTop = 0; };
const panel = (title, sub, body, footer) => openDrawer('side', { title, sub, body: '<div id="ac-side-msg"></div><div id="ac-sd-errors"></div>' + body, footer });
const itemsOf = (r) => r.supply_request_items || [];
const itemText = (ctx, r) => itemsOf(r).map((x) => ((ctx.supplyById.get(x.supply_id) || {}).name || 'Supply #' + x.supply_id) + ' × ' + qty(x.requested_qty) + (x.approved_qty !== null && x.approved_qty !== undefined && Number(x.approved_qty) !== Number(x.requested_qty) ? ' (approved ' + qty(x.approved_qty) + ')' : '')).join(', ');
const canDecide = (ctx) => ctx.caps.mgr || ctx.caps.sManage;
const canHandle = (ctx) => ctx.caps.mgr || ctx.caps.sManage || ctx.caps.sIssue;
const waitDays = (ctx, r) => daysBetween(dayOf(r.requested_at), ctx.today);

export function renderRequests(ctx, panelEl) {
  const t = ctx.ui.requests, c = ctx.caps, me = ctx.employee.id, s = t.q.trim().toLowerCase();
  const rows = ctx.data.requests.filter((r) => (t.status === 'all' || (t.status === 'open' ? REQUEST_OPEN.includes(r.status) : r.status === t.status)) && (!t.mine || r.requested_by === me) && (!t.branch || String(r.branch_id) === String(t.branch)) &&
    (!s || [r.request_number, ctx.names[r.requested_by], r.department, r.purpose, itemText(ctx, r)].join(' ').toLowerCase().includes(s))).sort((a, b) => (REQUEST_OPEN.includes(b.status) - REQUEST_OPEN.includes(a.status)) || String(b.requested_at).localeCompare(String(a.requested_at)));
  const tr = (r) => '<tr><td data-label="Request"><button type="button" class="bl-link" data-req="' + r.id + '">' + esc(r.request_number) + '</button><div class="muted bl-sub">' + esc(dt(dayOf(r.requested_at))) + '</div></td><td data-label="Requested by">' + esc(ctx.names[r.requested_by] || '—') + '<div class="muted bl-sub">' + esc([branchName(ctx, r.branch_id), r.department].filter(Boolean).join(' · ')) + '</div></td>' +
    '<td data-label="Items" class="full-row">' + esc(itemText(ctx, r)) + (r.purpose ? '<div class="muted bl-sub">' + esc(r.purpose) + '</div>' : '') + '</td><td data-label="Status">' + flowBadge(r.status) + (['Requested', 'Under Review'].includes(r.status) && waitDays(ctx, r) > ctx.settings.request_wait_days ? '<div class="lv-neg bl-sub">waiting ' + waitDays(ctx, r) + ' days</div>' : '') + '</td>' +
    '<td data-label="Needed by">' + (r.needed_by ? dt(r.needed_by) : '—') + '</td><td class="full-row"><div class="bl-rowact"><button type="button" class="btn small secondary" data-req="' + r.id + '">View</button>' +
    (c.sIssue && ['Approved', 'Ready for Issue', 'Partially Issued'].includes(r.status) ? '<button type="button" class="btn small" data-issue="' + r.id + '">Issue</button>' : '') + (canDecide(ctx) && ['Requested', 'Under Review', 'Waitlisted'].includes(r.status) && r.requested_by !== me ? '<button type="button" class="btn small" data-decide="' + r.id + '">Review</button>' : '') +
    (r.status === 'Issued' && r.requested_by === me ? '<button type="button" class="btn small" data-receive="' + r.id + '">I received these</button>' : '') + '</div></td></tr>';
  panelEl.innerHTML = '<div id="ac-rq"><div class="card bl-toolbar"><div class="bl-toolrow"><div class="field bl-grow"><label>Search</label><input type="search" id="ac-rq-q" placeholder="Number, person, supply, purpose…" value="' + esc(t.q) + '"></div>' +
    field('Show', '<select id="ac-rq-status">' + opts([{ value: 'open', label: 'Open (not finished)' }, { value: 'all', label: 'All' }, ...REQUEST_STATUSES], t.status) + '</select>') + (c.viewSupplies ? field('Branch', '<select id="ac-rq-br">' + opts(ctx.branches.map((b) => ({ value: b.id, label: b.name })), t.branch, 'All') + '</select>') : '') +
    '<div class="field"><label>&nbsp;</label><div class="bl-btnrow"><label class="lv-check"><input type="checkbox" id="ac-rq-mine"' + (t.mine ? ' checked' : '') + '> Only mine</label>' + (c.canExport || c.reports ? exportMenu() : '') + (c.requestSupplies ? '<button type="button" class="btn small" id="ac-rq-new">+ New Request</button>' : '') + '</div></div></div></div>' +
    '<div class="bl-summary"><b>' + plural(rows.length, 'request') + '</b><span>Waiting for a decision <b>' + ctx.data.requests.filter((r) => ['Requested', 'Under Review'].includes(r.status)).length + '</b></span><span class="muted">Approving does not move stock — supplies leave the branch only when they are issued.</span></div>' +
    (rows.length ? '<div class="table-scroll table-2col bl-tablewrap"><table class="bl-table"><thead><tr><th>Request</th><th>Requested by</th><th>Items</th><th>Status</th><th>Needed by</th><th></th></tr></thead><tbody>' + rows.map(tr).join('') + '</tbody></table></div>' : emptyBox('No request matches' + (c.requestSupplies ? ' — press “New Request” to ask for supplies.' : '.'))) + '</div>';
  const root = $('ac-rq');
  let st = null;
  $('ac-rq-q').addEventListener('input', (e) => { clearTimeout(st); st = setTimeout(() => { t.q = e.target.value; ctx.rerender(); const x = $('ac-rq-q'); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }, 300); });
  $('ac-rq-status').addEventListener('change', (e) => { t.status = e.target.value; ctx.rerender(); });
  if ($('ac-rq-br')) $('ac-rq-br').addEventListener('change', (e) => { t.branch = e.target.value; ctx.rerender(); });
  $('ac-rq-mine').addEventListener('change', (e) => { t.mine = e.target.checked; ctx.rerender(); });
  if ($('ac-rq-new')) $('ac-rq-new').addEventListener('click', () => ctx.openRequestForm({}));
  root.querySelectorAll('[data-req]').forEach((el) => el.addEventListener('click', () => ctx.openRequest(Number(el.dataset.req))));
  root.querySelectorAll('[data-issue]').forEach((el) => el.addEventListener('click', () => ctx.openIssueForm({ request: Number(el.dataset.issue) })));
  root.querySelectorAll('[data-decide]').forEach((el) => el.addEventListener('click', () => ctx.openRequest(Number(el.dataset.decide))));
  root.querySelectorAll('[data-receive]').forEach((el) => el.addEventListener('click', () => act(ctx, Number(el.dataset.receive), 'receive')));
  root.querySelectorAll('[data-exp]').forEach((el) => el.addEventListener('click', async () => { el.closest('details').open = false; try { await exportRequests(ctx, rows, el.dataset.exp); } catch (err) { ctx.toast(err, true); } }));
}

// ================================================================ the request card
const STEPS = ['Requested', 'Under Review', 'Approved', 'Ready for Issue', 'Issued', 'Received', 'Completed'];
function stepsHtml(r) {
  if (['Rejected', 'Cancelled', 'Waitlisted'].includes(r.status)) return '<ol class="tf-steps"><li class="tf-step tf-step-done"><span class="tf-dot">✓</span>Requested</li><li class="tf-step tf-step-stop"><span class="tf-dot">' + (r.status === 'Waitlisted' ? '…' : '✕') + '</span>' + esc(r.status) + '</li></ol>';
  const at = r.status === 'Partially Issued' ? 'Issued' : r.status, idx = STEPS.indexOf(at);
  return '<ol class="tf-steps">' + STEPS.map((s, i) => '<li class="tf-step' + (i < idx ? ' tf-step-done' : i === idx ? ' tf-step-cur' : '') + '"><span class="tf-dot">' + (i < idx ? '✓' : i === idx ? '●' : '') + '</span>' + esc(s === 'Issued' && r.status === 'Partially Issued' ? 'Partly issued' : s) + '</li>').join('') + '</ol>';
}
export function openRequestCard(ctx, id, opts2 = {}) {
  const r = ctx.data.requests.find((x) => x.id === id), c = ctx.caps, me = ctx.employee.id;
  if (!r) { ctx.toast('That request is no longer available to you.', true); return; }
  const items = itemsOf(r), mine = r.requested_by === me;
  const rows = items.map((x) => { const s = ctx.supplyById.get(x.supply_id) || {}; const left = Number(x.approved_qty || 0) - Number(x.issued_qty || 0); return '<tr><td data-label="Supply">' + esc(s.name || 'Supply #' + x.supply_id) + (x.note ? '<div class="muted bl-sub">' + esc(x.note) + '</div>' : '') + '</td><td data-label="Requested">' + qty(x.requested_qty) + ' ' + esc(s.unit || '') + '</td>' +
    '<td data-label="Approved">' + (x.approved_qty === null || x.approved_qty === undefined ? '—' : qty(x.approved_qty) + (x.waitlisted ? ' <span class="muted">(rest waitlisted)</span>' : '')) + '</td><td data-label="Issued">' + qty(x.issued_qty) + '</td>' + (c.viewSupplies ? '<td data-label="In stock at ' + esc(branchName(ctx, r.branch_id)) + '">' + (left > 0 && !['Issued', 'Received', 'Completed'].includes(r.status) ? (stockOf(ctx, x.supply_id, r.branch_id) >= left ? qty(stockOf(ctx, x.supply_id, r.branch_id)) : '<b class="lv-neg">' + qty(stockOf(ctx, x.supply_id, r.branch_id)) + '</b>') : '—') + '</td>' : '') + '</tr>'; }).join('');
  const issuances = ctx.data.issuances.filter((i) => i.request_id === r.id);
  const body = '<div id="ac-detail-msg"></div><div class="bl-d-head"><div class="bl-d-badges">' + flowBadge(r.status) + '</div></div>' + stepsHtml(r) +
    (['Requested', 'Under Review'].includes(r.status) && waitDays(ctx, r) > ctx.settings.request_wait_days ? '<div class="msg lv-warn"><b>Needs attention:</b> waiting ' + waitDays(ctx, r) + ' days for a decision.</div>' : '') +
    '<div class="drawer-section"><h4>Request</h4>' + kv('Request no.', '<b>' + esc(r.request_number) + '</b>') + kv('Requested by', esc(ctx.names[r.requested_by] || '—') + ' <span class="muted">' + esc(fmtDateTime(r.requested_at)) + '</span>') + kv('Branch', branchChip(ctx, r.branch_id)) + kv('Department', esc(r.department || '—')) + kv('Purpose', esc(r.purpose || '—')) + kv('Needed by', r.needed_by ? dt(r.needed_by) : '—') + (r.notes ? kv('Notes', esc(r.notes)) : '') + '</div>' +
    '<div class="drawer-section"><h4>Items</h4><div class="table-scroll table-2col"><table class="lv-mini"><thead><tr><th>Supply</th><th>Requested</th><th>Approved</th><th>Issued</th>' + (c.viewSupplies ? '<th>In stock here</th>' : '') + '</tr></thead><tbody>' + rows + '</tbody></table></div></div>' +
    '<div class="drawer-section"><h4>What happened</h4>' + kv('Reviewed', r.reviewed_at ? esc(ctx.names[r.reviewed_by] || '—') + ' <span class="muted">' + esc(fmtDateTime(r.reviewed_at)) + '</span>' : '—') + kv('Approved', r.approved_at ? esc(ctx.names[r.approved_by] || '—') + ' <span class="muted">' + esc(fmtDateTime(r.approved_at)) + '</span>' + (r.approval_notes ? '<div class="muted">' + esc(r.approval_notes) + '</div>' : '') : '—') +
    (r.reject_reason ? kv('Rejected', esc(r.reject_reason)) : '') + (r.cancel_reason ? kv('Cancelled', esc(r.cancel_reason)) : '') + kv('Issued', r.issued_at ? esc(ctx.names[r.issued_by] || '—') + ' <span class="muted">' + esc(fmtDateTime(r.issued_at)) + '</span>' : '—') + kv('Received', r.received_at ? esc(ctx.names[r.received_by] || '—') + ' <span class="muted">' + esc(fmtDateTime(r.received_at)) + '</span>' : '—') + (r.completed_at ? kv('Completed', esc(fmtDateTime(r.completed_at))) : '') +
    (issuances.length ? kv('Issuances', issuances.map((i) => esc(i.issuance_number) + ' · ' + esc(dt(dayOf(i.issued_at)))).join('<br>')) : '') + '</div>';
  let foot = '';
  if (c.sIssue && ['Approved', 'Ready for Issue', 'Partially Issued'].includes(r.status)) foot += '<button type="button" class="btn" data-act="issue">Issue</button>';
  if (canDecide(ctx) && ['Requested', 'Under Review', 'Waitlisted'].includes(r.status) && !mine) foot += '<button type="button" class="btn" data-act="approve">Approve</button><button type="button" class="btn secondary" data-act="reject">Reject</button>';
  if (canHandle(ctx) && ['Requested', 'Waitlisted'].includes(r.status)) foot += '<button type="button" class="btn secondary" data-act="review">Start review</button>';
  if (canHandle(ctx) && ['Requested', 'Under Review', 'Approved'].includes(r.status) && !items.some((x) => Number(x.issued_qty) > 0)) foot += '<button type="button" class="btn secondary" data-act="waitlist">Waitlist</button>';
  if (canHandle(ctx) && r.status === 'Approved') foot += '<button type="button" class="btn secondary" data-act="ready">Mark ready</button>';
  if (canDecide(ctx) && r.status === 'Partially Issued') foot += '<button type="button" class="btn secondary" data-act="close_short">Close — rest will not be issued</button>';
  if (r.status === 'Issued' && (mine || canHandle(ctx))) foot += '<button type="button" class="btn" data-act="receive">' + (mine ? 'I received these' : 'Confirm received') + '</button>';
  if (canHandle(ctx) && r.status === 'Received') foot += '<button type="button" class="btn" data-act="complete">Complete</button>';
  if ((mine || canDecide(ctx)) && ['Requested', 'Under Review', 'Approved', 'Ready for Issue', 'Waitlisted'].includes(r.status) && !items.some((x) => Number(x.issued_qty) > 0)) foot += '<button type="button" class="btn secondary" data-act="cancel">Cancel request</button>';
  openDrawer('detail', { title: r.request_number, sub: (ctx.names[r.requested_by] || '') + ' · ' + branchName(ctx, r.branch_id), body, footer: foot + '<button type="button" class="btn secondary" data-act="close">Close</button>' });
  ctx.detail = { kind: 'request', id, reopen: () => openRequestCard(ctx, id, { keep: true }) };
  setDetailHandlers({ close: () => ctx.closeDetail(), issue: () => ctx.openIssueForm({ request: r.id }), approve: () => approvePanel(ctx, r), reject: () => reasonPanel(ctx, r, 'reject', 'Reject this request?', 'Say why it is rejected.'), review: () => act(ctx, r.id, 'review'),
    waitlist: () => reasonPanel(ctx, r, 'waitlist', 'Put on the waitlist?', 'Say why it has to wait (for example, out of stock).'), ready: () => act(ctx, r.id, 'ready'), close_short: () => reasonPanel(ctx, r, 'close_short', 'Close this request short?', 'Say why the rest will not be issued.'),
    receive: () => act(ctx, r.id, 'receive'), complete: () => act(ctx, r.id, 'complete'), cancel: () => reasonPanel(ctx, r, 'cancel', 'Cancel this request?', 'Say why it is cancelled.') }, ctx.toast);
}
const LABEL = { review: 'under review', ready: 'ready for issue', receive: 'received', complete: 'completed' };
async function act(ctx, id, action, extra) {
  try {
    const res = await ctx.api.supplyRequestAction(id, { action, ...(extra || {}) });
    if (res && res.ok === false) { ctx.toast(errorsText(res), true); return res; }
    closeDrawer('side'); await ctx.afterChange('Request ' + (LABEL[action] ? 'marked ' + LABEL[action] : action.replace('_', ' ') + ' done') + '.'); return res;
  } catch (err) { ctx.toast(err, true); }
}
function reasonPanel(ctx, r, action, title, err) {
  panel(title, r.request_number, '<p><b>' + esc(r.request_number) + '</b> — ' + esc(itemText(ctx, r)) + '</p>' + (action === 'cancel' || action === 'reject' ? '<p class="muted">The request is kept in the history — nothing is deleted.</p>' : '') + field('Reason *', '<textarea id="ac-rr-note" rows="3" maxlength="400"></textarea>'),
    '<button type="button" class="btn' + (action === 'reject' || action === 'cancel' ? ' lv-btn-danger' : '') + '" id="ac-rr-ok">Confirm</button><button type="button" class="btn secondary" id="ac-rr-x">Close</button>');
  $('ac-rr-x').addEventListener('click', () => closeDrawer('side'));
  $('ac-rr-ok').addEventListener('click', async () => { errBox(''); if (val('ac-rr-note').trim().length < 3) { flagInvalid($('ac-rr-note')); return errBox(esc(err)); } $('ac-rr-ok').disabled = true; const res = await act(ctx, r.id, action, { note: val('ac-rr-note').trim() }); if (res && res.ok === false) $('ac-rr-ok').disabled = false; });
}
function approvePanel(ctx, r) {
  const items = itemsOf(r);
  const rows = items.map((x) => { const s = ctx.supplyById.get(x.supply_id) || {}, have = stockOf(ctx, x.supply_id, r.branch_id); return '<tr data-item="' + x.id + '"><td data-label="Supply">' + esc(s.name || '') + '</td><td data-label="Requested">' + qty(x.requested_qty) + '</td><td data-label="In stock">' + (have < Number(x.requested_qty) ? '<b class="lv-neg">' + qty(have) + '</b>' : qty(have)) + '</td>' +
    '<td data-label="Approve"><input type="number" data-k="q" min="0" max="' + x.requested_qty + '" step="0.01" inputmode="decimal" value="' + esc(x.requested_qty) + '"></td><td data-label="Rest waits" class="full-row"><label class="lv-check"><input type="checkbox" data-k="w"> waitlist the rest</label></td></tr>'; }).join('');
  panel('Approve Request', r.request_number, '<p class="muted">Approving says “yes, up to this much” — nothing leaves the branch until it is issued. Lower a quantity to approve part of a line; 0 leaves a line out. You cannot approve your own request.</p>' +
    '<div class="table-scroll table-2col"><table class="lv-mini"><thead><tr><th>Supply</th><th>Requested</th><th>In stock</th><th>Approve</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' + field('<span id="ac-ap-label">Note (optional)</span>', '<textarea id="ac-ap-note" rows="2" maxlength="400"></textarea>'),
    '<button type="button" class="btn" id="ac-ap-ok">Approve</button><button type="button" class="btn secondary" id="ac-ap-x">Close</button>');
  const read = () => items.map((x) => { const tr = document.querySelector('tr[data-item="' + x.id + '"]'); return { item_id: x.id, approved_qty: tr.querySelector('[data-k="q"]').value, waitlisted: tr.querySelector('[data-k="w"]').checked, req: Number(x.requested_qty) }; });
  const sync = () => { $('ac-ap-label').textContent = read().some((x) => Number(x.approved_qty) < x.req) ? 'Why is less approved than requested? *' : 'Note (optional)'; };
  document.querySelectorAll('#ac-side-body [data-k]').forEach((i) => i.addEventListener('input', sync)); sync();
  $('ac-ap-x').addEventListener('click', () => closeDrawer('side'));
  $('ac-ap-ok').addEventListener('click', async () => {
    errBox(''); const lines = read();
    if (lines.some((x) => x.approved_qty === '' || Number(x.approved_qty) < 0 || Number(x.approved_qty) > x.req)) return errBox('Enter a quantity from 0 up to the requested amount on every line.');
    if (!lines.some((x) => Number(x.approved_qty) > 0)) return errBox('Approve at least one item — or reject the request.');
    if (lines.some((x) => Number(x.approved_qty) < x.req) && val('ac-ap-note').trim().length < 3) { flagInvalid($('ac-ap-note')); return errBox('You approved less than was requested — write a note explaining why.'); }
    $('ac-ap-ok').disabled = true;
    const res = await act(ctx, r.id, 'approve', { note: val('ac-ap-note').trim() || null, items: lines.map((x) => ({ item_id: x.item_id, approved_qty: x.approved_qty, waitlisted: x.waitlisted })) });
    if (res && res.ok === false) { errBox(esc(errorsText(res))); $('ac-ap-ok').disabled = false; }
  });
}

// ================================================================ new request
export function openRequestForm(ctx) {
  if (!ctx.caps.requestSupplies) { ctx.toast('You are not allowed to request supplies.', true); return; }
  const key = newKey(), brs = myBranches(ctx), sup = ctx.supplyList.filter((s) => s.active);
  const body = '<div id="ac-form-msg"></div><div id="ac-form-errors"></div><div class="bl-formgrid">' + field('For branch *', '<select id="ac-nr-br">' + branchOptions({ ...ctx, branches: brs }, ctx.employee.branch_id || (brs[0] || {}).id, brs.length > 1 ? 'Choose…' : undefined) + '</select>') + field('Department', '<input type="text" id="ac-nr-dept" maxlength="80">') +
    field('Needed by', '<input type="date" id="ac-nr-need" min="' + esc(ctx.today) + '">') + '</div>' + field('What are they for? *', '<input type="text" id="ac-nr-purpose" maxlength="200" placeholder="e.g. counter restock for the weekend sale">') + '<h4 class="rf-sub">What do you need?</h4><div id="ac-nr-lines"></div>' +
    '<p><button type="button" class="btn small secondary" id="ac-nr-add">+ Add another supply</button></p>' + field('Notes', '<input type="text" id="ac-nr-notes" maxlength="200">') + (sup.length ? '' : '<div class="msg lv-warn">No supplies are in the catalogue yet — ask a custodian to add them.</div>');
  openDrawer('form', { title: 'New Supply Request', sub: 'A manager approves it, a custodian issues it', body, footer: '<button type="button" class="btn" id="ac-nr-ok">Send Request</button><button type="button" class="btn secondary" id="ac-nr-x">Cancel</button>' });
  const lines = $('ac-nr-lines'), errB = (h) => { $('ac-form-errors').innerHTML = h ? '<div class="msg error">' + h + '</div>' : ''; if (h) drawerBody('form').scrollTop = 0; };
  const addLine = () => { const d = document.createElement('div'); d.className = 'ac-line'; d.innerHTML = '<select data-k="s"><option value="">Choose a supply…</option>' + sup.map((s) => '<option value="' + s.id + '">' + esc(s.name) + ' (' + esc(s.unit) + ')</option>').join('') + '</select><input type="number" data-k="q" min="0.01" step="0.01" inputmode="decimal" placeholder="Quantity"><input type="text" data-k="n" maxlength="100" placeholder="Note (optional)"><button type="button" class="btn small secondary" data-k="x" aria-label="Remove this line">✕</button>'; d.querySelector('[data-k="x"]').addEventListener('click', () => { if (lines.children.length > 1) d.remove(); }); lines.appendChild(d); };
  addLine(); $('ac-nr-add').addEventListener('click', addLine);
  $('ac-nr-x').addEventListener('click', () => closeDrawer('form'));
  $('ac-nr-ok').addEventListener('click', async () => {
    errB(''); const items = [...lines.children].map((d) => ({ supply_id: Number(d.querySelector('[data-k="s"]').value), quantity: d.querySelector('[data-k="q"]').value, note: d.querySelector('[data-k="n"]').value.trim() })).filter((x) => x.supply_id || x.quantity);
    if (!val('ac-nr-br')) { flagInvalid($('ac-nr-br')); return errB('Choose the branch the request is for.'); }
    if (val('ac-nr-purpose').trim().length < 3) { flagInvalid($('ac-nr-purpose')); return errB('Say what the supplies are for.'); }
    if (!items.length || items.some((x) => !x.supply_id || !(Number(x.quantity) > 0))) return errB('Choose a supply and a quantity on every line.');
    $('ac-nr-ok').disabled = true;
    try {
      const res = await ctx.api.createSupplyRequest({ branch_id: Number(val('ac-nr-br')), department: val('ac-nr-dept').trim() || null, purpose: val('ac-nr-purpose').trim(), needed_by: val('ac-nr-need') || null, notes: val('ac-nr-notes').trim() || null, items, client_key: key });
      if (res && res.ok === false) { errB(esc(errorsText(res))); $('ac-nr-ok').disabled = false; return; }
      closeDrawer('form'); await ctx.afterChange(res.replay ? res.message : 'Request ' + res.request_number + ' sent.');
    } catch (err) { errB(esc(friendly(err))); $('ac-nr-ok').disabled = false; }
  });
}
