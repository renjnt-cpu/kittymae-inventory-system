// Leave Management -- report exports (spec section 23): CSV, Excel (.xlsx) and PDF.
// Everything is generated in the browser from the rows already on screen -- nothing is sent anywhere.
// The Excel and PDF libraries are loaded from cdnjs only when someone clicks Export, pinned to an
// exact version with a Subresource Integrity hash (a tampered or swapped file will not load).
//
// A report column is { key, label, type } where type is 'text' (default), 'number' or 'date'
// (an ISO yyyy-mm-dd string). Rows are plain objects keyed by column key.
import { fmtDate, num } from './leaveUi.js?v=20261007b';

const LIBS = {
  jszip: { url: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', integrity: 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG', ready: () => window.JSZip },
  jspdf: { url: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', integrity: 'sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk', ready: () => window.jspdf && window.jspdf.jsPDF },
  autotable: { url: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js', integrity: 'sha384-fCAW/rDWORTbQXSiB7mOg0QtQ5c+r0f544y6XoKjuVva0nMBlCpNUjiFeG5iMdS3', ready: () => window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable },
};
const pending = {};
export function ensureLib(name) {
  const lib = LIBS[name];
  if (lib.ready()) return Promise.resolve();
  if (pending[name]) return pending[name];
  pending[name] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = lib.url; s.integrity = lib.integrity; s.crossOrigin = 'anonymous';
    s.onload = () => resolve();
    s.onerror = () => { delete pending[name]; reject(new Error('Could not load the export tool. Check your internet connection and try again.')); };
    document.head.appendChild(s);
  });
  return pending[name];
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// 'money' is a number shown as 12,500.00 in a PDF and stored as a plain number in CSV / Excel (no currency
// symbol: jsPDF's built-in fonts cannot print the peso sign, and a number cell stays summable in a spreadsheet)
const shown = (v, type) => (v === null || v === undefined || v === '') ? '' : type === 'date' ? fmtDate(v) : type === 'number' ? num(v)
  : type === 'money' ? Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v);

// ---------------------------------------------------------------- CSV
// Text that starts with = + - @ (or a tab/CR) would be run as a formula by Excel/Sheets; a leave
// reason typed by an employee must never become one, so such text gets a leading apostrophe.
const csvCell = (v) => {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
};
export function buildCsv(columns, rows) {
  const lines = [columns.map((c) => csvCell(c.label)).join(',')];
  rows.forEach((r) => lines.push(columns.map((c) => csvCell(r[c.key])).join(',')));
  return '﻿' + lines.join('\r\n') + '\r\n'; // BOM so Excel reads the file as UTF-8
}
export function exportCsv(filename, columns, rows) {
  download(new Blob([buildCsv(columns, rows)], { type: 'text/csv;charset=utf-8' }), filename + '.csv');
}

// ---------------------------------------------------------------- Excel (.xlsx)
const xmlEsc = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colLetter = (i) => { let n = i + 1, s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const excelDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000); };
const sheetName = (s) => String(s || 'Report').replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Report';

function sheetXml(columns, rows) {
  const widths = columns.map((c) => Math.min(50, Math.max(8, c.label.length + 2, ...rows.slice(0, 500).map((r) => shown(r[c.key], c.type).length + 2))));
  let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<cols>' + widths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols><sheetData>';
  x += '<row r="1">' + columns.map((c, i) => '<c r="' + colLetter(i) + '1" t="inlineStr" s="2"><is><t xml:space="preserve">' + xmlEsc(c.label) + '</t></is></c>').join('') + '</row>';
  rows.forEach((r, ri) => {
    x += '<row r="' + (ri + 2) + '">';
    columns.forEach((c, ci) => {
      const v = r[c.key], ref = colLetter(ci) + (ri + 2);
      if (v === null || v === undefined || v === '') return;
      if ((c.type === 'number' || c.type === 'money') && typeof v === 'number' && Number.isFinite(v)) x += '<c r="' + ref + '"><v>' + v + '</v></c>';
      else if (c.type === 'date' && /^\d{4}-\d{2}-\d{2}/.test(v)) x += '<c r="' + ref + '" s="1"><v>' + excelDate(String(v).slice(0, 10)) + '</v></c>';
      else x += '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(v) + '</t></is></c>'; // inline text is never evaluated as a formula
    });
    x += '</row>';
  });
  x += '</sheetData>' + (rows.length ? '<autoFilter ref="A1:' + colLetter(columns.length - 1) + (rows.length + 1) + '"/>' : '') + '</worksheet>';
  return x;
}

/** sheets = [{ name, columns, rows }] -- the first sheet is the report, the second lists the filters used. */
export async function buildXlsxBlob(sheets) {
  await ensureLib('jszip');
  const zip = new window.JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    sheets.map((s, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  const used = new Set();
  const names = sheets.map((s) => { let n = sheetName(s.name), k = 2; while (used.has(n.toLowerCase())) n = sheetName(s.name).slice(0, 28) + ' ' + k++; used.add(n.toLowerCase()); return n; });
  zip.file('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    names.map((n, i) => '<sheet name="' + xmlEsc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets.map((s, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
    '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  zip.file('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/></numFmts>' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF1BC"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
  sheets.forEach((s, i) => zip.file('xl/worksheets/sheet' + (i + 1) + '.xml', sheetXml(s.columns, s.rows)));
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
}
export async function exportXlsx(filename, title, columns, rows, aboutRows) {
  const sheets = [{ name: title, columns, rows }];
  if (aboutRows && aboutRows.length) sheets.push({ name: 'About this report', columns: [{ key: 'k', label: 'Item' }, { key: 'v', label: 'Value' }], rows: aboutRows });
  download(await buildXlsxBlob(sheets), filename + '.xlsx');
}

// ---------------------------------------------------------------- PDF
// jsPDF's built-in fonts are Latin-1 only, so anything outside it is swapped for a safe stand-in.
const pdfSafe = (s) => String(s).replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/[^ -ÿ]/g, '?');
export async function buildPdfBlob(title, subtitleLines, columns, rows, footer) {
  await ensureLib('jspdf'); await ensureLib('autotable');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const margin = 36;
  doc.setFontSize(15); doc.setFont('helvetica', 'bold'); doc.text(pdfSafe(title), margin, 40);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  let y = 56;
  (subtitleLines || []).forEach((l) => { doc.text(pdfSafe(l), margin, y); y += 12; });
  doc.autoTable({
    startY: y + 4, margin: { left: margin, right: margin, bottom: 40 },
    head: [columns.map((c) => pdfSafe(c.label))],
    body: rows.map((r) => columns.map((c) => pdfSafe(shown(r[c.key], c.type) || '-'))),
    styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [255, 241, 188], textColor: 30, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 250, 247] },
    columnStyles: Object.fromEntries(columns.map((c, i) => [i, { halign: (c.type === 'number' || c.type === 'money') ? 'right' : 'left' }]).filter(([, s]) => s.halign === 'right')),
  });
  const pages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setFontSize(8); doc.setTextColor(120);
    doc.text(pdfSafe(footer || 'Kittymae Jewels - Leave Management'), margin, doc.internal.pageSize.getHeight() - 20);
    doc.text('Page ' + p + ' of ' + pages, doc.internal.pageSize.getWidth() - margin, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
  }
  return doc.output('blob');
}
export async function exportPdf(filename, title, subtitleLines, columns, rows, footer) {
  download(await buildPdfBlob(title, subtitleLines, columns, rows, footer), filename + '.pdf');
}
