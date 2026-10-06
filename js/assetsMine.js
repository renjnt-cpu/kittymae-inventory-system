// Assets & Supplies Custodian -- "My Company Assets": what is issued to the signed-in person, whether they have confirmed receiving it,
// a way to report a problem, what they have held before, and (if they may) their supply requests. Every employee with a login can open this;
// nobody sees anyone else's property here.
import { esc, plural, dt, dash, conditionBadge, statusBadge, flowBadge, emptyBox, chips, qty, branchName } from './assetsUi.js?v=20261007e';
import { REQUEST_OPEN, dayOf } from './assetsLogic.js?v=20261007e';

const $ = (id) => document.getElementById(id);

export function renderMine(ctx, panel) {
  const me = ctx.employee.id, c = ctx.caps;
  const mine = ctx.assets.filter((a) => a._asg && a._asg.assignee_type === 'Employee' && a._asg.employee_id === me);
  const past = ctx.data.assignments.filter((x) => x.employee_id === me && x.returned_at).sort((a, b) => b.id - a.id);
  const reports = ctx.data.incidents.filter((i) => i.reported_by === me || i.custodian_id === me).sort((a, b) => b.id - a.id);
  const reqs = ctx.data.requests.filter((r) => r.requested_by === me).sort((a, b) => String(b.requested_at).localeCompare(String(a.requested_at)));
  const unconfirmed = mine.filter((a) => !a._ack && !a._asg.legacy);
  const card = (a) => {
    const o = a._asg;
    return '<div class="card ac-mycard"><div class="ac-mycard-head"><div><button type="button" class="bl-link" data-act="view" data-id="' + a.id + '">' + esc(a.asset_number) + '</button> <b>' + esc(a.name) + '</b><div class="muted">' + esc([a.brand, a.model, a.serial_number ? 'S/N ' + a.serial_number : ''].filter(Boolean).join(' · ')) + '</div></div><div>' + statusBadge(a.status) + ' ' + conditionBadge(a.condition) + '</div></div>' +
      '<div class="ac-mycard-body"><span>Issued <b>' + esc(dt(o.issued_on)) + '</b>' + (o.issued_on_estimated ? ' <span class="muted">(estimated)</span>' : '') + '</span>' + ((o.accessories_out || []).length ? '<span>With <b>' + esc(o.accessories_out.join(', ')) + '</b></span>' : '') + (o.expected_return_date ? '<span>Expected back <b>' + esc(dt(o.expected_return_date)) + '</b></span>' : '') +
      '<span>' + (a._ack ? '<b class="lv-pos">✓ You confirmed receiving it</b>' : o.legacy ? '<span class="muted">Issued before this system started</span>' : '<b class="lv-neg">Please confirm you received it</b>') + '</span></div>' + chips(a._att.filter((x) => ['maintenance_due', 'repair_overdue', 'damaged', 'lost', 'unreturned'].includes(x.code)), 3) +
      '<div class="bl-rowact">' + (c.canAcknowledge(a) ? '<button type="button" class="btn small" data-act="ack" data-id="' + a.id + '">I received this</button>' : '') + (c.canReportOn(a) ? '<button type="button" class="btn small secondary" data-act="report" data-id="' + a.id + '">Report a problem</button>' : '') + '<button type="button" class="btn small secondary" data-act="view" data-id="' + a.id + '">Details</button></div></div>';
  };
  panel.innerHTML = '<div id="ac-my">' + (unconfirmed.length ? '<div class="msg lv-warn"><b>' + plural(unconfirmed.length, 'item') + ' waiting for your confirmation.</b> Please confirm that you received ' + (unconfirmed.length === 1 ? 'it' : 'them') + ', or report a problem.</div>' : '') +
    '<div class="card bl-panel"><h3 class="bl-h">Issued to me <span class="muted">· ' + plural(mine.length, 'item') + '</span></h3>' + (mine.length ? '<div class="ac-mygrid">' + mine.map(card).join('') + '</div>' : emptyBox('Nothing is issued to you right now.')) +
    '<p class="muted">Company property stays on your record until you return it or it is transferred. If something is lost or damaged, report it right away — reports are reviewed by management, and nobody is charged automatically.</p></div>' +
    (reports.length ? '<div class="card bl-panel"><h3 class="bl-h">My reports</h3><div class="table-scroll table-2col"><table class="lv-mini"><thead><tr><th>Report</th><th>Asset</th><th>Status</th><th>What happened</th></tr></thead><tbody>' + reports.map((i) => { const a = ctx.byId.get(i.asset_id); return '<tr><td data-label="Report"><b>' + esc(i.incident_number) + '</b> ' + esc(i.incident_type) + '</td><td data-label="Asset">' + (a ? '<button type="button" class="bl-link" data-act="view" data-id="' + a.id + '">' + esc(a.asset_number) + '</button> ' + esc(a.name) : '—') + '</td><td data-label="Status">' + flowBadge(i.status) + '</td><td data-label="What happened" class="full-row">' + esc(String(i.description).slice(0, 140)) + '</td></tr>'; }).join('') + '</tbody></table></div></div>' : '') +
    (c.requestSupplies ? '<div class="card bl-panel"><div class="bl-toolrow"><h3 class="bl-h bl-grow">My supply requests</h3><button type="button" class="btn small" id="ac-my-req">+ New Request</button></div>' + (reqs.length ? '<div class="table-scroll table-2col"><table class="lv-mini"><thead><tr><th>Request</th><th>For</th><th>Status</th><th></th></tr></thead><tbody>' + reqs.slice(0, 15).map((r) => '<tr><td data-label="Request"><button type="button" class="bl-link" data-req="' + r.id + '">' + esc(r.request_number) + '</button><div class="muted bl-sub">' + esc(dt(dayOf(r.requested_at))) + '</div></td><td data-label="For" class="full-row">' + esc(r.purpose || '') + '</td><td data-label="Status">' + flowBadge(r.status) + '</td><td class="full-row">' + (r.status === 'Issued' ? '<button type="button" class="btn small" data-req="' + r.id + '">Confirm received</button>' : '') + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="muted">You have not asked for supplies yet.</p>') + '</div>' : '') +
    (past.length ? '<details class="exp card"><summary><span class="exp-arrow" aria-hidden="true">▸</span>What I held before (' + past.length + ')</summary><div class="exp-body"><div class="table-scroll table-2col"><table class="lv-mini"><thead><tr><th>Asset</th><th>Issued</th><th>Returned</th><th>How it ended</th></tr></thead><tbody>' + past.map((x) => { const a = ctx.byId.get(x.asset_id); return '<tr><td data-label="Asset">' + (a ? esc(a.asset_number + ' ' + a.name) : '—') + '</td><td data-label="Issued">' + dt(x.issued_on) + '</td><td data-label="Returned">' + dt(x.returned_on) + '</td><td data-label="How it ended">' + esc(x.end_reason || '—') + '</td></tr>'; }).join('') + '</tbody></table></div></div></details>' : '') + '</div>';
  const root = $('ac-my');
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const id = Number(el.dataset.id), a = ctx.byId.get(id);
    const run = { view: () => ctx.openAsset(id), ack: () => ctx.work.acknowledge(a._asg.id, id), report: () => ctx.cases.report(id) }[el.dataset.act];
    if (run) { e.preventDefault(); Promise.resolve(run()).catch((err) => ctx.toast(err, true)); }
  });
  root.querySelectorAll('[data-req]').forEach((el) => el.addEventListener('click', () => ctx.openRequest(Number(el.dataset.req))));
  if ($('ac-my-req')) $('ac-my-req').addEventListener('click', () => ctx.openRequestForm({}));
}
