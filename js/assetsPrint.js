// Assets & Supplies Custodian -- printable documents: asset tags with a QR code, and the accountability, return, branch-transfer and disposal
// forms. Everything is built in the browser from the data already loaded and printed with the browser's own print dialog (Save as PDF works
// too). A tag shows only the asset number, name and the QR link -- never who holds it and never a price. The forms name people because they are
// internal paper records that people sign.
import { esc, dt, qty, money, branchName } from './assetsUi.js?v=20261007b';
import { qrSvg } from './assetsQr.js?v=20261007b';
import { dayOf } from './assetsLogic.js?v=20261007b';

const $ = (id) => document.getElementById(id);
const COMPANY = 'Kittymae Jewels';

function printHtml(ctx, html, cls) {
  let area = $('ac-print-root');
  if (!area) { area = document.createElement('div'); area.id = 'ac-print-root'; area.className = 'ac-print-area'; document.body.appendChild(area); }
  area.className = 'ac-print-area ' + (cls || '');
  area.innerHTML = html;
  document.body.classList.add('ac-printing');
  const done = () => { document.body.classList.remove('ac-printing'); area.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { window.print(); setTimeout(done, 1500); }, 80);
}

// ---------------------------------------------------------------- tags
export async function tags(ctx, ids) {
  const list = (ids || []).map((id) => ctx.byId.get(id)).filter(Boolean);
  if (!list.length) { ctx.toast('Choose at least one asset to print a tag for.', true); return; }
  if (list.length > 200) { ctx.toast('Print up to 200 tags at a time.', true); return; }
  let svgs;
  try { svgs = await Promise.all(list.map((a) => qrSvg(a.asset_number))); } catch (err) { ctx.toast(err, true); return; }
  const label = (a, i) => '<div class="ac-label"><div class="ac-label-qr">' + svgs[i] + '</div><div class="ac-label-text"><b class="ac-label-no">' + esc(a.asset_number) + '</b><span class="ac-label-name">' + esc(a.name) + '</span>' +
    (a.asset_tag ? '<span>' + esc(a.asset_tag) + '</span>' : '') + '<span class="ac-label-co">' + esc(a.company || COMPANY) + ' property</span></div></div>';
  printHtml(ctx, '<div class="ac-labels">' + list.map(label).join('') + '</div><p class="ac-noprint-note muted">' + list.length + ' tag' + (list.length === 1 ? '' : 's') + '</p>', 'ac-print-tags');
}

// ---------------------------------------------------------------- forms
const sign = (labels) => '<div class="ac-signoff">' + labels.map((l) => '<div><span>' + esc(l) + '</span></div>').join('') + '</div>' + '<div class="ac-signoff ac-datesoff">' + labels.map(() => '<div><span>Date</span></div>').join('') + '</div>';
const row = (k, v) => '<tr><th>' + esc(k) + '</th><td>' + (v === null || v === undefined || v === '' ? '—' : v) + '</td></tr>';
const assetTable = (ctx, a) => '<table class="ac-ptable"><tbody>' + row('Asset number', '<b>' + esc(a.asset_number) + '</b>') + row('Name', esc(a.name)) + row('Category', esc(a._category)) + row('Brand / model', esc([a.brand, a.model].filter(Boolean).join(' · '))) +
  row('Serial number', esc(a.serial_number)) + row('Asset tag', esc(a.asset_tag)) + row('Branch', esc(a._branch)) + '</tbody></table>';
const personLine = (ctx, id) => { const p = ctx.personById[id]; return p ? esc(p.full_name) + (p.employee_code ? ' (ID ' + esc(p.employee_code) + ')' : '') + (p.job_title || p.position ? ' — ' + esc(p.job_title || p.position) : '') + (p.department ? ', ' + esc(p.department) : '') : esc(ctx.names[id] || ''); };
const foot = (ctx) => '<p class="muted ac-pfoot">' + esc(COMPANY) + ' — Assets &amp; Supplies Custodian · printed ' + esc(ctx.today) + '</p>';

function accountability(ctx, a) {
  const o = a._asg;
  if (!o) return null;
  const who = o.assignee_type === 'Employee' ? personLine(ctx, o.employee_id) : esc(a._where);
  return '<h2>Asset Accountability Form</h2><p class="muted">' + esc(COMPANY) + ' — company property issued</p>' + assetTable(ctx, a) +
    '<h3>Issue</h3><table class="ac-ptable"><tbody>' + row('Issued to', who) + row('Date issued', dt(o.issued_on) + (o.issued_on_estimated ? ' (estimated)' : '')) + row('Condition when issued', esc(o.condition_out || a.condition)) +
    row('Accessories', (o.accessories_out || []).length ? esc(o.accessories_out.join(', ')) : 'None') + row('Purpose', esc(o.purpose)) + row('Expected return', o.expected_return_date ? dt(o.expected_return_date) : null) + row('Issued by', esc(ctx.names[o.issued_by])) + row('Notes', esc(o.issue_notes)) + '</tbody></table>' +
    '<p class="ac-decl">I acknowledge that I received the company property described above in the condition stated. I will take care of it, use it for company purposes, keep it safe, and return it when I am asked or when I leave the company. I will report any loss or damage right away; I understand that any loss or damage is reviewed by management.</p>' +
    sign(['Received by (employee)', 'Issued by (custodian)', 'Supervisor']) + foot(ctx);
}
function returnForm(ctx, a) {
  const o = a._asgs.filter((x) => x.returned_at).sort((x, y) => y.id - x.id)[0] || a._asg;
  if (!o) return null;
  return '<h2>Asset Return Form</h2><p class="muted">' + esc(COMPANY) + ' — company property returned</p>' + assetTable(ctx, a) +
    '<h3>Return</h3><table class="ac-ptable"><tbody>' + row('Returned by', o.assignee_type === 'Employee' ? personLine(ctx, o.employee_id) : esc(a._where)) + row('Issued', dt(o.issued_on)) + row('Returned', o.returned_on ? dt(o.returned_on) : null) +
    row('Condition issued → returned', esc((o.condition_out || '—') + ' → ' + (o.condition_in || '—'))) + row('Accessories issued', (o.accessories_out || []).length ? esc(o.accessories_out.join(', ')) : 'None') +
    row('Accessories returned', o.accessories_returned ? (o.accessories_returned.length ? esc(o.accessories_returned.join(', ')) : 'None') : null) + row('Missing accessories', (o.accessories_missing || []).length ? '<b>' + esc(o.accessories_missing.join(', ')) + '</b>' : 'None') +
    row('Received by', esc(ctx.names[o.return_received_by])) + row('Notes', esc(o.return_notes)) + '</tbody></table>' + sign(['Returned by', 'Received by (custodian)', 'Supervisor']) + foot(ctx);
}
function transferForm(ctx, a) {
  const t = ctx.data.transfers.filter((x) => x.asset_id === a.id && x.transfer_type === 'Branch').sort((x, y) => y.id - x.id)[0];
  if (!t) return null;
  return '<h2>Asset Transfer Form</h2><p class="muted">' + esc(COMPANY) + ' — ' + esc(t.transfer_number) + '</p>' + assetTable(ctx, a) +
    '<h3>Transfer</h3><table class="ac-ptable"><tbody>' + row('From', esc(branchName(ctx, t.from_branch_id))) + row('To', '<b>' + esc(branchName(ctx, t.to_branch_id)) + '</b>') + row('Status', esc(t.status)) + row('Reason', esc(t.reason)) +
    row('Requested', esc(ctx.names[t.requested_by]) + ' · ' + esc(dayOf(t.requested_at))) + row('Approved', t.approved_at ? esc(ctx.names[t.approved_by]) + ' · ' + esc(dayOf(t.approved_at)) : null) + row('Released', t.released_at ? esc(ctx.names[t.released_by]) + ' · ' + esc(dayOf(t.released_at)) : null) +
    row('Received', t.received_at ? esc(ctx.names[t.received_by]) + ' · ' + esc(dayOf(t.received_at)) : null) + row('Condition out → in', esc((t.condition_out || '—') + ' → ' + (t.condition_in || '—'))) + row('Notes', esc(t.notes)) + '</tbody></table>' + sign(['Released by (sending branch)', 'Carried by', 'Received by (' + branchName(ctx, t.to_branch_id) + ')']) + foot(ctx);
}
function disposalForm(ctx, a) {
  const d = ctx.data.disposals.filter((x) => x.asset_id === a.id).sort((x, y) => y.id - x.id)[0];
  if (!d) return null;
  return '<h2>Asset Disposal Form</h2><p class="muted">' + esc(COMPANY) + ' — ' + esc(d.disposal_number) + '</p>' + assetTable(ctx, a) +
    '<h3>Disposal</h3><table class="ac-ptable"><tbody>' + row('Status', esc(d.status)) + row('Reason', esc(d.reason)) + row('Condition', esc(d.condition)) + row('Recommendation', esc(d.recommendation)) + row('Requested by', esc(ctx.names[d.requested_by]) + ' · ' + esc(dayOf(d.requested_at))) +
    row('Approved by', d.approved_at ? esc(ctx.names[d.approved_by]) + ' · ' + esc(dayOf(d.approved_at)) : null) + row('How disposed of', esc(d.disposal_method)) + row('Date disposed', d.disposal_date ? dt(d.disposal_date) : null) + row('Processed by', d.processed_by ? esc(ctx.names[d.processed_by]) : null) + row('Notes', esc(d.notes)) + '</tbody></table>' +
    sign(['Requested by', 'Approved by (manager)', 'Disposed / handed over by']) + foot(ctx);
}
/** A slip for one supply issuance: what was handed out, from which branch, to whom. */
export function issueSlip(ctx, issuanceId) {
  const i = ctx.data.issuances.find((x) => x.id === issuanceId);
  if (!i) { ctx.toast('That issuance is no longer available.', true); return; }
  const rows = (i.supply_issuance_items || []).map((x) => { const s = ctx.supplyById.get(x.supply_id) || {}; return '<tr><td>' + esc(s.supply_code || '') + '</td><td>' + esc(s.name || 'Supply #' + x.supply_id) + '</td><td>' + qty(x.quantity) + ' ' + esc(s.unit || '') + '</td></tr>'; }).join('');
  printHtml(ctx, '<h2>Supply Issue Slip</h2><p class="muted">' + esc(COMPANY) + ' — ' + esc(i.issuance_number) + '</p><table class="ac-ptable"><tbody>' + row('Taken from', esc(branchName(ctx, i.branch_id))) + row('Date', esc(dayOf(i.issued_at))) +
    row('For', esc([ctx.names[i.employee_id], i.department].filter(Boolean).join(' · '))) + row('Purpose', esc(i.purpose)) + row('Issued by', esc(ctx.names[i.issued_by])) + row('Received by', esc(ctx.names[i.received_by])) + row('Notes', esc(i.notes)) + '</tbody></table>' +
    '<table class="ac-ptable"><thead><tr><th>Code</th><th>Supply</th><th>Quantity</th></tr></thead><tbody>' + rows + '</tbody></table>' + sign(['Issued by', 'Received by', 'Approved by']) + foot(ctx), 'ac-print-form');
}
/** Everything one employee holds, with signature lines -- used for clearance when someone leaves, or a yearly check. */
export function statement(ctx, employeeId) {
  const list = ctx.assets.filter((a) => a._asg && a._asg.assignee_type === 'Employee' && a._asg.employee_id === employeeId);
  const p = ctx.personById[employeeId];
  if (!list.length) { ctx.toast('This person does not hold any company property.', true); return; }
  const rows = list.map((a) => '<tr><td>' + esc(a.asset_number) + '</td><td>' + esc(a.name) + '</td><td>' + esc(a.serial_number || '—') + '</td><td>' + dt(a._asg.issued_on) + '</td><td>' + esc(a.condition) + '</td><td>' + esc((a._asg.accessories_out || []).join(', ') || '—') + '</td><td>&nbsp;</td></tr>').join('');
  printHtml(ctx, '<h2>Company Property Statement</h2><p><b>' + esc(p ? p.full_name : ctx.names[employeeId] || '') + '</b>' + (p ? ' — ' + esc(p.job_title || p.position || '') + (p.department ? ', ' + esc(p.department) : '') : '') + '</p>' +
    '<table class="ac-ptable"><thead><tr><th>Asset no.</th><th>Item</th><th>Serial no.</th><th>Issued</th><th>Condition</th><th>Accessories</th><th>Returned ✓</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<p class="ac-decl">The items listed above are company property issued to the person named. They are to be accounted for in full — returned, or explained in writing — before any clearance is signed.</p>' + sign(['Employee', 'Custodian', 'HR / Supervisor']) + foot(ctx), 'ac-print-form');
}
export function form(ctx, kind, assetId) {
  const a = ctx.byId.get(assetId);
  if (!a) { ctx.toast('That asset is no longer available.', true); return; }
  const html = { accountability, return: returnForm, transfer: transferForm, disposal: disposalForm }[kind](ctx, a);
  if (!html) { ctx.toast('There is nothing to print for that yet.', true); return; }
  printHtml(ctx, html, 'ac-print-form');
}
