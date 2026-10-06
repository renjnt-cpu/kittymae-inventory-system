// HR 201 File -- print a 201 summary and export the employee list.  Both are recorded in the audit log.
// Government ID numbers are always printed masked; salary is only printed when the person ticks it AND may see compensation.
import { esc, $, openModal, toast, friendly, busy } from './hrUi.js?v=20261007f';
import { GOV_FIELDS, FIELD_DEFS, fmtDate, fmtDateTime, money, statusLabel, spanText, directoryCsv, blank } from './hrLogic.js?v=20261007f';

export function openPrint(ctx) {
  const ps = ctx.ps, k = ctx.access.keys;
  const opt = (id, label, checked, disabled, note) => '<label style="display:flex;gap:8px;align-items:flex-start;margin:6px 0;font-size:14px;' + (disabled ? 'opacity:.5;' : '') + '"><input type="checkbox" id="hr-pr-' + id + '"' + (checked ? ' checked' : '') + (disabled ? ' disabled' : '') + '> <span>' + esc(label) + (note ? ' <span class="muted">' + esc(note) + '</span>' : '') + '</span></label>';
  const dlg = openModal({
    title: 'Print 201 summary', sub: ps.data.employee.full_name,
    body: '<p class="muted">Choose what goes on the printout. Printing is recorded in the audit log with your name.</p>' +
      opt('personal', 'Personal information', true) + opt('employment', 'Employment details', true) + opt('emergency', 'Emergency contact', true) +
      (k['hr.view_government_ids'] ? opt('gov', 'Government IDs', false, false, '(always masked)') : '') +
      (k['hr.view_compensation'] ? opt('comp', 'Compensation & payroll', false, false, '(confidential — opening it is logged)') : '') +
      (k['hr.view_documents'] ? opt('docs', 'Documents on file (names and expiry only)', true) : ''),
    footer: [{ label: 'Cancel', kind: 'secondary', onClick: (close) => close() }, { label: 'Print', kind: 'primary', id: 'hr-pr-go', onClick: async (close, btn) => {
      const want = (id) => $('hr-pr-' + id) && $('hr-pr-' + id).checked;
      const win = window.open('about:blank', '_blank');
      if (!win) { toast('Allow pop-ups for this site to print.', true); return; }
      win.document.write('<p style="font:14px Arial;padding:20px;">Preparing the printout…</p>');
      busy(btn, true, 'Preparing…');
      try {
        const sections = ['personal', 'employment', 'emergency'].filter(want);
        let comp = null, docs = null;
        if (want('comp')) { comp = await ctx.api.getCompensation(ps.id); sections.push('compensation'); }
        if (want('docs')) { docs = await ctx.api.listDocuments(ps.id, false); sections.push('documents'); }
        if (want('gov')) sections.push('government_ids');
        await ctx.api.logEvent(ps.id, 'printed', '201 summary', { sections });
        win.document.open(); win.document.write(buildHtml(ctx, ps, { gov: want('gov'), personal: want('personal'), employment: want('employment'), emergency: want('emergency') }, comp, docs)); win.document.close();
        win.focus(); setTimeout(() => win.print(), 300);
        close();
      } catch (err) { win.close(); busy(btn, false); toast(err, true); }
    } }],
  });
  return dlg;
}

function buildHtml(ctx, ps, want, comp, docs) {
  const e = ps.data.employee, f = ps.data.file, gv = ps.data.government_ids || {};
  const row = (l, v) => (blank(v) ? '' : '<tr><th>' + esc(l) + '</th><td>' + esc(v) + '</td></tr>');
  const table = (title, rows) => (rows.filter(Boolean).length ? '<h2>' + esc(title) + '</h2><table>' + rows.join('') + '</table>' : '');
  const parts = [];
  if (want.personal) parts.push(table('Personal information', [row('Name', [f.last_name, [f.first_name, f.middle_name, f.suffix].filter(Boolean).join(' ')].filter(Boolean).join(', ') || e.full_name), row('Gender', f.gender), row('Civil status', f.civil_status), row('Birthdate', f.birthdate ? fmtDate(f.birthdate) : ''), row('Contact number', e.contact_number), row('Address', f.address), row('Education', f.educational_attainment)]));
  if (want.employment) parts.push(table('Employment', [row('Employee ID', e.employee_code), row('Company', f.company), row('Department', f.department), row('Job title', f.job_title), row('Branch', e.branch_name), row('Employment status', f.employment_status ? statusLabel(f.employment_status) : ''), row('Date hired', e.hire_date ? fmtDate(e.hire_date) : ''), row('Time with the company', e.hire_date ? spanText(e.hire_date, f.end_of_employment_date || null) : ''), row('End of employment', f.end_of_employment_date ? fmtDate(f.end_of_employment_date) : ''), row('System account', e.status)]));
  if (want.emergency) parts.push(table('Emergency contact', [row('Name', f.emergency_contact_name), row('Relationship', f.emergency_contact_relationship), row('Number', f.emergency_contact_number)]));
  if (want.gov) parts.push(table('Government IDs (masked)', GOV_FIELDS.map((g) => row(g.label, gv[g.on] ? gv[g.key] : 'Not on file'))));
  if (comp) parts.push(table('Compensation & payroll — CONFIDENTIAL', [row('Basic salary', comp.basic_salary === null ? '' : money(comp.basic_salary)), row('Payment mode', comp.payment_mode), row('Tax status', comp.tax_status_code), row('Minimum wage earner', comp.minimum_wage_earner), row('Payroll details', comp.payroll_details)]));
  if (docs) parts.push('<h2>Documents on file</h2>' + ((docs.documents || []).length ? '<table>' + docs.documents.map((d) => '<tr><th>' + esc(d.document_name) + '</th><td>' + esc([d.doc_type, d.expiry_date ? 'expires ' + fmtDate(d.expiry_date) : 'no expiry'].filter(Boolean).join(' · ')) + '</td></tr>').join('') + '</table>' : '<p>No documents on file.</p>'));
  return '<!doctype html><html><head><meta charset="utf-8"><title>201 summary — ' + esc(e.full_name) + '</title><style>' +
    'body{font:13px Arial,Helvetica,sans-serif;color:#222;margin:28px;} h1{font-size:18px;margin:0 0 2px;} h2{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#555;border-bottom:1px solid #ccc;padding-bottom:3px;margin:18px 0 6px;}' +
    'table{width:100%;border-collapse:collapse;} th{width:32%;text-align:left;vertical-align:top;padding:4px 8px 4px 0;color:#555;font-weight:normal;} td{padding:4px 0;} .meta{color:#666;font-size:11px;margin-bottom:6px;} .foot{margin-top:28px;font-size:10px;color:#777;border-top:1px solid #ccc;padding-top:6px;}' +
    '@media print{body{margin:14mm;}}</style></head><body><h1>Miss Kittymae Jewels — 201 File Summary</h1><div class="meta">' + esc(ps.data.employee.full_name) + ' · ' + esc(e.employee_code || '') + ' · printed ' + esc(fmtDateTime(new Date().toISOString())) + ' by ' + esc(ctx.access.name || '') + '</div>' +
    parts.join('') + '<div class="foot">Confidential — for HR use only. Government ID numbers are masked. This printout was recorded in the HR audit log.</div></body></html>';
}

/** downloads what the directory currently shows (never salary or government IDs) and records it */
export async function exportDirectory(ctx, rows) {
  try {
    await ctx.api.logEvent(null, 'exported', 'employee list', { rows: rows.length });
    const blob = new Blob(['﻿' + directoryCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'employees-' + (ctx.today || 'list') + '.csv';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Exported ' + rows.length + ' employee' + (rows.length === 1 ? '' : 's') + '.');
  } catch (err) { toast(err, true); }
}
