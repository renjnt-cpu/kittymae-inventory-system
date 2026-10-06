// Leave Management -- the Leave card on the ERP dashboard (spec section 34).
// Everyone sees their own available credits, next approved leave and pending requests plus a File Leave
// button; HR also sees how many requests need review, and the Final Approver how many await a decision.
// Counts come from a few small queries (never the full request list), and the dashboard loads this file
// lazily and ignores any failure, so a problem here can never affect the dashboard itself.
import { getWidgetData } from './leaveApi.js?v=20261007c';
import { esc, fmtDate, rangeText, num, daysText } from './leaveUi.js?v=20261007c';

const box = (valueHtml, label, sub) => '<div class="tile"><div class="num" style="font-size:20px;">' + valueHtml + '</div><div class="lbl">' + esc(label) + '</div>' +
  (sub ? '<div class="muted" style="font-size:11px;">' + esc(sub) + '</div>' : '') + '</div>';

export async function renderLeaveWidget(host) {
  if (!host) return;
  const d = await getWidgetData();
  if (!d) return; // no linked employee record -- nothing sensible to show
  const alerts = [];
  if (d.hrNeeds !== null) alerts.push({ n: d.hrNeeds, text: 'Leave Requests Needing Review', href: 'leave.html#hr' });
  if (d.finalNeeds !== null) alerts.push({ n: d.finalNeeds, text: 'Leave Requests Awaiting Final Approval', href: 'leave.html#final' });
  host.innerHTML = '<div class="card lv-widget"><div class="lv-widget-head"><h3 style="margin:0;">Leave</h3>' +
    '<div class="lv-row-actions"><a class="lv-linkbtn" href="leave.html?new=1">File Leave</a><a class="lv-linkbtn secondary" href="leave.html">My Leave</a></div></div>' +
    '<div class="tiles" style="margin:12px 0 0;">' +
      box(esc(num(d.available)), 'Available Leave', 'credit days remaining') +
      box(d.next ? esc(fmtDate(d.next.start)) : '—', 'Next Approved Leave', d.next ? d.next.type + ' · ' + rangeText(d.next.start, d.next.end) + ' · ' + daysText(d.next.days) : 'None scheduled') +
      box(String(d.pending), 'Pending Requests', d.pending ? 'waiting for a decision' : 'nothing waiting') +
    '</div>' +
    (alerts.length ? '<div class="lv-widget-alerts">' + alerts.map((a) => '<a class="lv-widget-alert' + (a.n ? ' lv-widget-alert-on' : '') + '" href="' + a.href + '"><b>' + a.n + '</b> ' + esc(a.text) + ' <span aria-hidden="true">→</span></a>').join('') + '</div>' : '') +
    '</div>';
}
