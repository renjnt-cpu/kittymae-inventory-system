// Leave Management -- the "Leave" section inside an employee's 201-File (spec section 24).
// Shown to HR and the Final Approver (the 201-File page itself is already limited to them) and built
// on exactly the same data, drawers and rules as the Leave Management page -- there is no second copy
// of any leave logic here.
import { esc, fmtDate, rangeText, num, daysText, statusBadge, tile } from './leaveUi.js?v=20261011b';
import { summarizeLeave } from './leaveSummary.js?v=20261011b';
import { createLeaveContext, drawersHtml, bindDrawerEvents } from './leavePage.js?v=20261011b';
import { openAdjust, openLedger } from './leaveCredits.js?v=20261011b';
import * as api from './leaveApi.js?v=20261011b';

let ctx = null;
let current = null;

/** The shared drawers (request details, side panel) are added to the page once, on first use. */
function surface() {
  if (!document.getElementById('lv-detail-drawer')) {
    const host = document.createElement('div');
    host.id = 'lv-surface';
    host.innerHTML = drawersHtml();
    document.body.appendChild(host);
    ctx = null;
  }
  if (!ctx) {
    ctx = createLeaveContext(api);
    bindDrawerEvents(ctx);
    // any change made from a drawer (adjusting credits, deciding a request…) reloads this record
    ctx.refresh = async () => { await ctx.loadData(); if (current) draw(current.host, current.employeeId); };
  }
  return ctx;
}

export async function mountLeaveProfile(host, employeeId) {
  const c = surface();
  current = { host, employeeId };
  host.innerHTML = '<p class="muted">Loading leave record…</p>';
  try { await c.loadData(); } catch (err) { host.innerHTML = '<div class="msg error">' + esc(err.message || String(err)) + '</div>'; return; }
  if (!c.flags.view_all) { host.innerHTML = '<p class="muted">You do not have access to leave records.</p>'; return; }
  draw(host, employeeId);
}

function draw(host, employeeId) {
  const c = ctx;
  const person = c.dirById[employeeId] || {};
  // the numbers come from leaveSummary.js -- the same function the HR 201-File Overview card uses, so the two always agree
  const S = summarizeLeave({ types: c.types, balances: c.data.balances, requests: c.data.requests, today: c.today }, employeeId);
  const { reqs, creditTypes, balOf, upcoming } = S;
  const own = employeeId === c.me.employee_id;
  const canAdjust = c.flags.hr && (!own || c.flags.final);
  const tName = (id) => (c.typeById[id] || {}).name || '—';

  host.innerHTML =
    '<div class="tiles" style="margin-bottom:12px;">' +
      tile(esc(num(S.available)), 'Available Leave Credits') + tile(esc(num(S.used)), 'Used Leave Credits') +
      tile(S.pending, 'Pending Requests') + tile(S.approved, 'Approved Leave') +
      tile(S.rejected, 'Rejected Leave') + tile(upcoming.length, 'Upcoming Leave') + '</div>' +
    '<div class="lv-row-actions" style="margin-bottom:12px;">' +
      (canAdjust ? '<button type="button" class="btn small" data-lp="add">Add Credit</button><button type="button" class="btn small secondary" data-lp="adjust">Adjust Credit</button>' : '') +
      '<button type="button" class="btn small secondary" data-lp="ledger">Credit History</button>' +
      '<a class="lv-linkbtn secondary" href="leave.html?employee=' + encodeURIComponent(employeeId) + '#hr">View Full Leave Record</a></div>' +
    '<div class="lv-credit-grid" style="margin-bottom:14px;">' + (creditTypes.map((t) => {
      const b = balOf(t.id);
      return '<div class="lv-credit-card"><div class="lv-credit-name">' + esc(t.name) + '</div><div class="lv-credit-rem"><b>' + esc(num(b.available_credits)) + '</b> <span class="muted">remaining</span></div>' +
        '<div class="muted">Total ' + esc(num(b.total_credits)) + ' · Used ' + esc(num(b.used_credits)) + '</div></div>';
    }).join('') || '<p class="muted">No credit-based leave types are set up.</p>') + '</div>' +
    '<h4 class="lv-h">Upcoming Leave</h4>' + (upcoming.length
      ? '<ul class="lv-people" style="margin-bottom:12px;">' + upcoming.map((r) => '<li data-lp-open="' + esc(r.id) + '"><b>' + esc(tName(r.leave_type_id)) + '</b> <span class="muted">· ' + esc(rangeText(r.start_date, r.end_date)) + ' · ' + esc(daysText(r.requested_days)) + '</span></li>').join('') + '</ul>'
      : '<p class="muted" style="margin-top:0;">No upcoming approved leave.</p>') +
    '<h4 class="lv-h">Leave History' + (person.full_name ? ' — ' + esc(person.full_name) : '') + '</h4>' + (reqs.length
      ? '<div class="table-scroll table-2col"><table><thead><tr><th>Request No.</th><th>Leave Type</th><th>Dates</th><th>Days</th><th>Paid / Unpaid</th><th>Status</th><th></th></tr></thead><tbody>' +
        reqs.slice(0, 10).map((r) => '<tr><td data-label="Request No.">' + esc(r.leave_request_number || '') + '</td><td data-label="Leave Type">' + esc(tName(r.leave_type_id)) + '</td>' +
          '<td data-label="Dates">' + esc(rangeText(r.start_date, r.end_date)) + '</td><td data-label="Days">' + esc(num(r.requested_days)) + '</td><td data-label="Paid / Unpaid">' + esc(r.payment_type) + '</td>' +
          '<td data-label="Status">' + statusBadge(r.status, r.cancellation_status) + '</td><td data-label="Action" class="full-row"><button type="button" class="btn small secondary" data-lp-open="' + esc(r.id) + '">View</button></td></tr>').join('') +
        '</tbody></table></div>' + (reqs.length > 10 ? '<p class="muted" style="margin:6px 0 0;">Showing the latest 10 of ' + reqs.length + ' — use “View Full Leave Record” for the rest.</p>' : '')
      : '<p class="muted" style="margin:0;">No leave requests on file.</p>');

  const on = (sel, fn) => host.querySelectorAll(sel).forEach((el) => el.addEventListener('click', fn));
  on('[data-lp="add"]', () => openAdjust(c, employeeId, { txn: 'Manual Credit' }));
  on('[data-lp="adjust"]', () => openAdjust(c, employeeId, { txn: 'Correction' }));
  on('[data-lp="ledger"]', () => openLedger(c, employeeId));
  on('[data-lp-open]', (e) => c.openDetail(e.currentTarget.dataset.lpOpen));
}
