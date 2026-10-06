// HR 201 File -- the "Company Assets" section inside an employee's 201-File, and the offboarding warning. It is a READ-ONLY summary of what the
// Asset & Supplies Custodian module records for this person: nothing about the employee is copied, and nothing is issued or returned from here
// (that happens on the Asset & Supplies Custodian page, where the history is kept). A person who has left but still holds company property is
// flagged here so HR does not clear them by mistake; nothing is ever deleted.
import { esc, fmtDate } from './leaveUi.js?v=20261007a';
import * as api from './assetsApi.js?v=20261007a';

const link = (number) => 'assets.html?asset=' + encodeURIComponent(number);

/** the Company Assets section for one employee (loaded when the section is opened) */
export async function mountAssetsProfile(host, employeeId) {
  host.innerHTML = '<p class="muted">Loading company assets…</p>';
  let s;
  try { s = await api.employeeSummary(employeeId); } catch (err) { host.innerHTML = '<div class="msg error">' + esc(err.message || String(err)) + '</div>'; return; }
  if (!s || s.ok === false) { host.innerHTML = '<p class="muted">' + esc((s && s.errors && s.errors[0]) || 'You do not have access to this employee’s company assets.') + '</p>'; return; }
  const e = s.employee, rows = s.current || [];
  host.innerHTML = (e.left && s.outstanding ? '<div class="msg error"><b>' + esc(e.full_name) + ' is no longer employed (' + esc(e.employment_status || e.status || 'left') + ') but still holds ' + s.outstanding + ' company item' + (s.outstanding === 1 ? '' : 's') + '.</b> Make sure they are returned or transferred before clearance — open the Asset &amp; Supplies Custodian page, Employee Accountability.</div>' : '') +
    '<div class="bl-sum" style="margin-bottom:10px;"><div class="bl-sum-cell"><span class="muted">Holds now</span><b>' + s.outstanding + '</b></div><div class="bl-sum-cell"><span class="muted">Returned</span><b>' + s.returned + '</b></div><div class="bl-sum-cell"><span class="muted">Transferred on</span><b>' + s.transferred + '</b></div><div class="bl-sum-cell"><span class="muted">Damaged / lost reports</span><b>' + s.damaged + ' / ' + s.lost + '</b></div></div>' +
    (rows.length ? '<div class="table-scroll"><table><tr><th>Asset</th><th>Item</th><th>Issued</th><th>Condition</th><th>Status</th><th>Confirmed</th></tr>' + rows.map((r) => '<tr><td data-label="Asset"><a href="' + link(r.asset_number) + '">' + esc(r.asset_number) + '</a></td><td data-label="Item">' + esc(r.name) + (r.category ? '<div class="muted" style="font-size:11px;">' + esc(r.category) + '</div>' : '') + '</td><td data-label="Issued">' + esc(fmtDate(r.issued_on)) + (r.issued_on_estimated ? ' <span class="muted">(est.)</span>' : '') + '</td>' +
      '<td data-label="Condition">' + esc(r.condition) + '</td><td data-label="Status">' + esc(r.status) + '</td><td data-label="Confirmed">' + (r.acknowledged ? 'Yes' : 'Not yet') + '</td></tr>').join('') + '</table></div>' : '<p class="muted">No company property is issued to this employee.</p>') +
    '<p class="muted" style="font-size:11px;margin-top:8px;">This is a summary of the Asset &amp; Supplies Custodian records — assets are issued, returned and transferred there, and the full history is kept. <a href="assets.html#people">Open Employee Accountability</a></p>';
}

/** HR page banner: former employees who still hold company property (empty string when there are none) */
export async function offboardingBanner() {
  let list;
  try { list = await api.offboardingAlerts(); } catch (err) { return ''; }
  if (!Array.isArray(list) || !list.length) return '';
  const items = list.reduce((n, p) => n + (p.assets || []).length, 0);
  return '<div class="msg error"><b>' + list.length + ' former employee' + (list.length === 1 ? '' : 's') + ' still hold' + (list.length === 1 ? 's' : '') + ' ' + items + ' company item' + (items === 1 ? '' : 's') + ':</b> ' +
    list.slice(0, 8).map((p) => esc(p.full_name) + ' (' + (p.assets || []).length + ')').join(', ') + (list.length > 8 ? '…' : '') + '. <a href="assets.html#people">Open Employee Accountability</a> to get them back — nothing is deleted.</div>';
}

/** after the 201-File is saved: a warning sentence if the person is now marked as left but still holds property, otherwise ''. */
export async function afterSaveWarning(employeeId) {
  let s;
  try { s = await api.employeeSummary(employeeId); } catch (err) { return ''; }
  if (!s || s.ok === false || !s.employee || !s.employee.left || !s.outstanding) return '';
  return s.employee.full_name + ' is now marked as no longer employed but still holds ' + s.outstanding + ' company item' + (s.outstanding === 1 ? '' : 's') + ' (' + (s.current || []).slice(0, 3).map((r) => r.asset_number).join(', ') + ((s.current || []).length > 3 ? '…' : '') + '). They need to be returned or transferred — see Asset & Supplies Custodian → Employee Accountability.';
}
