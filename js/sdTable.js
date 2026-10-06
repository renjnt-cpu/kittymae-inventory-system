// Sales & Profit Dashboard -- the one table every tab uses: the database sends a page at a time (search, sort and totals are done there, so the browser
// never holds every transaction), the person can choose which columns to see, open a row, and export everything the filters match (CSV, Excel, PDF, Print).
import { api, esc, money, int, pct, fin, fmtDate, fmtDateTime, friendly } from './sdCore.js?v=20261007e';
import { exportCsv, exportXlsx, exportPdf } from './leaveExport.js?v=20261007e';
import { loadingBox, errorBox, emptyBox, badge, openDrawer, kvRow, toast } from './sdUi.js?v=20261007e';

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private window: the choice just is not remembered */ } },
};

/** What a cell shows on screen. A column may supply its own render(row) (it must escape what it prints). */
export function cellHtml(col, row) {
  if (col.render) return col.render(row);
  const v = row[col.key];
  switch (col.type) {
    case 'money': return v === null || v === undefined ? '<span class="muted">—</span>' : esc(money(v));
    case 'int': return esc(int(v));
    case 'num': return v === null || v === undefined ? '<span class="muted">—</span>' : esc(String(Math.round(Number(v) * 100) / 100));
    case 'pct': return v === null || v === undefined ? '<span class="muted">—</span>' : esc(pct(v, 1));
    case 'date': return esc(fmtDate(v));
    case 'dt': return v ? esc(fmtDateTime(v)) : '<span class="muted">—</span>';
    case 'bool': return v ? '✓' : '';
    case 'badge': return v ? badge(v, (col.tones && col.tones[v]) || 'gray') : '';
    default: return v === null || v === undefined || v === '' ? '<span class="muted">—</span>' : esc(v);
  }
}
/** What a cell holds in an export (a number stays a number so a spreadsheet can add it up). */
function cellValue(col, row) {
  const v = row[col.key];
  if (v === null || v === undefined || v === '') return null;
  if (col.type === 'money' || col.type === 'int' || col.type === 'num' || col.type === 'pct') return fin(v);
  if (col.type === 'dt') return fmtDateTime(v);
  if (col.type === 'bool') return v ? 'Yes' : '';
  return String(v);
}
const exportType = (col) => col.type === 'money' ? 'money' : (col.type === 'int' || col.type === 'num' || col.type === 'pct') ? 'number' : col.type === 'date' ? 'date' : 'text';

/** config: { root, kind, columns, getFilters(), extra(): {}, sort:{key,dir}, size, title, exportName, subtitle(): [lines], can:{cost,profit,expenses}, onRows(data), emptyText, rowTitle(row), noExport } */
export function createTable(cfg) {
  const root = cfg.root;
  const lsKey = 'sd-cols-' + cfg.kind;
  const perm = cfg.can || {};
  const allowed = cfg.columns.filter((c) => !c.need || perm[c.need]);
  const saved = store.get(lsKey);
  const visible = new Set(saved && Array.isArray(saved) ? saved.filter((k) => allowed.some((c) => c.key === k)) : allowed.filter((c) => !c.hide).map((c) => c.key));
  if (!visible.size) allowed.filter((c) => !c.hide).forEach((c) => visible.add(c.key));
  const st = { sort: Object.assign({ key: null, dir: 'desc' }, cfg.sort || {}), page: 1, size: cfg.size || 25, search: '', data: null, token: 0, timer: null };

  root.innerHTML =
    '<div class="sd-table">' +
      '<div class="sd-table-bar">' +
        '<input type="search" class="sd-t-search" placeholder="' + esc(cfg.searchPlaceholder || 'Search…') + '" aria-label="Search this table">' +
        '<label class="sd-t-size-l">Rows <select class="sd-t-size">' + [10, 25, 50, 100].map((n) => '<option' + (n === st.size ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label>' +
        '<details class="sd-menu"><summary class="btn small secondary">Columns</summary><div class="sd-menu-pop sd-cols">' +
          allowed.map((c) => '<label><input type="checkbox" data-col="' + esc(c.key) + '"' + (visible.has(c.key) ? ' checked' : '') + '> ' + esc(c.label) + '</label>').join('') +
          '<button type="button" class="btn small secondary sd-cols-reset">Reset</button></div></details>' +
        '<span class="sd-t-spacer"></span>' +
        (cfg.noExport ? '' : '<details class="sd-menu sd-menu-right sd-t-export"><summary class="btn small">Export</summary><div class="sd-menu-pop">' +
          '<button type="button" data-exp="csv">CSV (.csv)</button><button type="button" data-exp="xlsx">Excel (.xlsx)</button><button type="button" data-exp="pdf">PDF (.pdf)</button><button type="button" data-exp="print">Print</button></div></details>') +
      '</div>' +
      '<div class="sd-t-status muted" role="status"></div>' +
      '<div class="sd-tablewrap"><table class="sd-tbl"></table></div>' +
      '<div class="sd-t-pager"></div>' +
    '</div>';
  const $ = (s) => root.querySelector(s);
  const cols = () => allowed.filter((c) => visible.has(c.key));

  function opts(extra) { return Object.assign({ sort: st.sort.key, dir: st.sort.dir, page: st.page, size: st.size, search: st.search }, extra || {}); }
  function filters() { return Object.assign({}, cfg.getFilters(), cfg.extra ? cfg.extra() : {}); }

  async function load() {
    const token = ++st.token;
    $('.sd-t-status').innerHTML = '<span class="sd-spin"></span> Loading…';
    root.classList.add('sd-t-busy');
    try {
      const data = await api.table(cfg.kind, filters(), opts());
      if (token !== st.token) return;
      st.data = data; render();
      if (cfg.onRows) cfg.onRows(data);
    } catch (err) {
      if (token !== st.token) return;
      $('.sd-t-status').innerHTML = '';
      $('.sd-tablewrap').innerHTML = errorBox(friendly(err), 'table');
      $('.sd-tablewrap').querySelector('[data-retry]').addEventListener('click', load);
      $('.sd-t-pager').innerHTML = '';
    } finally { if (token === st.token) root.classList.remove('sd-t-busy'); }
  }

  function render() {
    const d = st.data, cs = cols();
    const pages = Math.max(1, Math.ceil(d.total / st.size));
    if (st.page > pages) { st.page = pages; return load(); }
    const from = d.total ? (st.page - 1) * st.size + 1 : 0, to = Math.min(d.total, st.page * st.size);
    $('.sd-t-status').textContent = d.total ? 'Showing ' + int(from) + '–' + int(to) + ' of ' + int(d.total) + (st.search ? ' matching "' + st.search + '"' : '') : '';
    const wrap = $('.sd-tablewrap');
    if (!d.rows.length) { wrap.innerHTML = emptyBox(st.search ? 'Nothing matches "' + st.search + '". Try a different search.' : (cfg.emptyText || 'No records for these filters.')); $('.sd-t-pager').innerHTML = ''; return; }
    wrap.innerHTML = '<table class="sd-tbl"><thead><tr>' + cs.map((c) => {
      const sortable = !!c.sort, on = sortable && st.sort.key === c.sort;
      return '<th' + (c.align === 'right' || ['money', 'int', 'num', 'pct'].includes(c.type) ? ' class="sd-num"' : '') + (sortable ? ' data-sort="' + esc(c.sort) + '" tabindex="0" role="columnheader" aria-sort="' + (on ? (st.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none') + '"' : '') + '>' +
        esc(c.label) + (on ? ' <span aria-hidden="true">' + (st.sort.dir === 'asc' ? '▲' : '▼') + '</span>' : '') + '</th>';
    }).join('') + '</tr></thead><tbody>' + d.rows.map((r, i) => '<tr data-i="' + i + '" tabindex="0">' + cs.map((c) =>
      '<td' + (['money', 'int', 'num', 'pct'].includes(c.type) || c.align === 'right' ? ' class="sd-num"' : '') + '>' + cellHtml(c, r) + '</td>').join('') + '</tr>').join('') + '</tbody>' +
      (d.totals && cs.some((c) => c.total) ? '<tfoot><tr>' + cs.map((c, i) => {
        if (c.total) { const v = d.totals[c.total]; return '<td class="sd-num"><b>' + (c.type === 'int' ? esc(int(v)) : c.type === 'pct' ? esc(pct(v, 1)) : esc(v === null || v === undefined ? '—' : money(v))) + '</b></td>'; }
        return i === 0 ? '<td><b>Total · ' + esc(int(d.total)) + ' rows</b></td>' : '<td></td>';
      }).join('') + '</tr></tfoot>' : '') + '</table>';
    wrap.querySelectorAll('th[data-sort]').forEach((th) => {
      const go = () => { const k = th.dataset.sort; st.sort = st.sort.key === k ? { key: k, dir: st.sort.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'desc' }; st.page = 1; load(); };
      th.addEventListener('click', go); th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    wrap.querySelectorAll('tbody tr').forEach((tr) => {
      const open = () => showRow(d.rows[Number(tr.dataset.i)]);
      tr.addEventListener('click', open); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    });
    $('.sd-t-pager').innerHTML = pages > 1
      ? '<button type="button" class="btn small secondary" data-pg="first"' + (st.page === 1 ? ' disabled' : '') + '>«</button><button type="button" class="btn small secondary" data-pg="prev"' + (st.page === 1 ? ' disabled' : '') + '>‹ Prev</button>' +
        '<span class="sd-t-page">Page ' + int(st.page) + ' of ' + int(pages) + '</span>' +
        '<button type="button" class="btn small secondary" data-pg="next"' + (st.page >= pages ? ' disabled' : '') + '>Next ›</button><button type="button" class="btn small secondary" data-pg="last"' + (st.page >= pages ? ' disabled' : '') + '>»</button>'
      : '';
    $('.sd-t-pager').querySelectorAll('[data-pg]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.pg; st.page = k === 'first' ? 1 : k === 'prev' ? st.page - 1 : k === 'next' ? st.page + 1 : pages; load();
    }));
  }

  function showRow(row) {
    openDrawer({ title: cfg.rowTitle ? cfg.rowTitle(row) : (cfg.title || 'Details'), sub: '',
      body: '<div class="drawer-section">' + allowed.filter((c) => !c.noDetail).map((c) => kvRow(c.label, cellHtml(c, row))).join('') + '</div>' });
  }

  // ---- controls
  let searchTimer = null;
  $('.sd-t-search').addEventListener('input', (e) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { st.search = e.target.value.trim(); st.page = 1; load(); }, 300); });
  $('.sd-t-size').addEventListener('change', (e) => { st.size = Number(e.target.value); st.page = 1; load(); });
  root.querySelectorAll('[data-col]').forEach((cb) => cb.addEventListener('change', () => {
    if (cb.checked) visible.add(cb.dataset.col); else if (visible.size > 1) visible.delete(cb.dataset.col); else cb.checked = true;
    store.set(lsKey, [...visible]); if (st.data) render();
  }));
  root.querySelector('.sd-cols-reset').addEventListener('click', () => {
    visible.clear(); allowed.filter((c) => !c.hide).forEach((c) => visible.add(c.key));
    root.querySelectorAll('[data-col]').forEach((cb) => { cb.checked = visible.has(cb.dataset.col); }); store.set(lsKey, [...visible]); if (st.data) render();
  });
  const onDoc = (e) => root.querySelectorAll('details.sd-menu[open]').forEach((d) => { if (!d.contains(e.target)) d.removeAttribute('open'); });
  document.addEventListener('click', onDoc);

  // ---- export: everything the filters match, a few big pages at a time
  async function doExport(kind) {
    const btn = root.querySelector('.sd-t-export summary'); const old = btn.textContent; btn.textContent = 'Preparing…';
    try {
      const { rows, totals } = await fetchAllRows(cfg.kind, filters(), opts());
      await exportData(kind, { name: cfg.exportName || cfg.kind, title: cfg.title || cfg.kind, subtitle: cfg.subtitle ? cfg.subtitle() : [], columns: cols().filter((c) => !c.noExport), rows, totals });
    } catch (err) { toast(friendly(err), true); } finally { btn.textContent = old; root.querySelector('.sd-t-export').removeAttribute('open'); }
  }
  root.querySelectorAll('[data-exp]').forEach((b) => b.addEventListener('click', () => doExport(b.dataset.exp)));

  load();
  return { reload: () => { st.page = 1; return load(); }, destroy: () => document.removeEventListener('click', onDoc), state: st };
}

/** Print through a hidden frame so only the table is printed, not the app around it. */
export function printRows(title, subtitleLines, ecols, erows) {
  const cell = (c, v) => v === null || v === undefined ? '' : (c.type === 'money' ? esc(money(v)) : c.type === 'number' ? esc(String(v)) : c.type === 'date' ? esc(fmtDate(v)) : esc(v));
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' +
    'body{font:11px Arial,sans-serif;margin:14px;color:#222}h1{font-size:16px;margin:0 0 4px}p{margin:0 0 3px;color:#555}table{border-collapse:collapse;width:100%;margin-top:10px}' +
    'th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f3f0e0;font-size:10px}td.n{text-align:right;white-space:nowrap}tr:nth-child(even) td{background:#fafafa}@page{size:landscape;margin:10mm}</style></head><body>' +
    '<h1>' + esc(title) + '</h1>' + subtitleLines.map((l) => '<p>' + esc(l) + '</p>').join('') +
    '<table><thead><tr>' + ecols.map((c) => '<th>' + esc(c.label) + '</th>').join('') + '</tr></thead><tbody>' +
    erows.map((r) => '<tr>' + ecols.map((c) => '<td' + (c.type === 'money' || c.type === 'number' ? ' class="n"' : '') + '>' + cell(c, r[c.key]) + '</td>').join('') + '</tr>').join('') + '</tbody></table></body></html>';
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; document.body.appendChild(f);
  f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
  f.onload = null;
  setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { toast('Printing is not available here.', true); } setTimeout(() => f.remove(), 2000); }, 250);
}

// ---------------------------------------------------------------- shared export helpers (tables, summary tables and the Reports tab all use these)
/** Reads every row the filters match, a few big pages at a time (the database caps a page at 5,000). */
export async function fetchAllRows(kind, filters, o) {
  const rows = []; let page = 1, total = 0, totals = null;
  do {
    const d = await api.table(kind, filters, Object.assign({}, o, { page, size: 5000 }));
    rows.push(...d.rows); total = d.total; totals = d.totals; page++;
  } while (rows.length < total && page < 40);
  return { rows, totals };
}
function exportRows(rows, totals, cs) {
  const out = rows.map((r) => Object.fromEntries(cs.map((c) => [c.key, cellValue(c, r)])));
  if (totals && cs.some((c) => c.total)) {
    const t = {}; cs.forEach((c, i) => { t[c.key] = c.total ? fin(totals[c.total]) : (i === 0 ? 'TOTAL' : null); }); out.push(t);
  }
  return out;
}
/** format: csv | xlsx | pdf | print. spec: { name, title, subtitle:[lines], columns:[column specs], rows, totals } */
export async function exportData(format, spec) {
  if (!spec.rows.length) { toast('There is nothing to export for these filters.', true); return; }
  const cs = spec.columns, ecols = cs.map((c) => ({ key: c.key, label: c.label, type: exportType(c) })), erows = exportRows(spec.rows, spec.totals, cs);
  const name = spec.name + '-' + new Date().toISOString().slice(0, 10), sub = spec.subtitle || [];
  if (format === 'csv') exportCsv(name, ecols, erows);
  else if (format === 'xlsx') await exportXlsx(name, spec.title, ecols, erows, sub.map((l) => { const i = l.indexOf(':'); return i > 0 ? { k: l.slice(0, i), v: l.slice(i + 1).trim() } : { k: 'Note', v: l }; }));
  else if (format === 'pdf') await exportPdf(name, spec.title, sub, ecols, erows, 'Kittymae Jewels — Sales & Profit Dashboard');
  else { printRows(spec.title, sub, ecols, erows); return; }
  toast('Exported ' + int(spec.rows.length) + ' rows.');
}
const MENU = '<details class="sd-menu sd-menu-right sd-t-export"><summary class="btn small">Export</summary><div class="sd-menu-pop">' +
  '<button type="button" data-exp="csv">CSV (.csv)</button><button type="button" data-exp="xlsx">Excel (.xlsx)</button><button type="button" data-exp="pdf">PDF (.pdf)</button><button type="button" data-exp="print">Print</button></div></details>';

/** A small table the database sends whole (channels, categories, payment methods ...): click a header to sort, Export to download. */
export function staticTable(root, o) {
  const cs = o.columns.filter((c) => !c.need || (o.can || {})[c.need]);
  let rows = o.rows.slice(), sort = { key: null, dir: 'desc' };
  function draw() {
    if (!rows.length) { root.innerHTML = emptyBox(o.emptyText || 'Nothing to show for these filters.'); return; }
    root.innerHTML = '<div class="sd-table"><div class="sd-table-bar"><span class="sd-t-spacer"></span>' + MENU + '</div><div class="sd-tablewrap"><table class="sd-tbl"><thead><tr>' +
      cs.map((c) => '<th' + (['money', 'int', 'num', 'pct'].includes(c.type) ? ' class="sd-num"' : '') + ' data-k="' + esc(c.key) + '" tabindex="0" aria-sort="' + (sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none') + '">' + esc(c.label) +
        (sort.key === c.key ? ' <span aria-hidden="true">' + (sort.dir === 'asc' ? '▲' : '▼') + '</span>' : '') + '</th>').join('') + '</tr></thead><tbody>' +
      rows.map((r) => '<tr>' + cs.map((c) => '<td' + (['money', 'int', 'num', 'pct'].includes(c.type) ? ' class="sd-num"' : '') + '>' + cellHtml(c, r) + '</td>').join('') + '</tr>').join('') + '</tbody>' +
      (o.totals ? '<tfoot><tr>' + cs.map((c, i) => '<td' + (['money', 'int', 'num', 'pct'].includes(c.type) ? ' class="sd-num"' : '') + '><b>' + (i === 0 ? 'Total' : (c.total ? (c.type === 'int' ? esc(int(o.totals[c.total])) : esc(o.totals[c.total] === null || o.totals[c.total] === undefined ? '—' : money(o.totals[c.total]))) : '')) + '</b></td>').join('') + '</tr></tfoot>' : '') +
      '</table></div></div>';
    root.querySelectorAll('th[data-k]').forEach((th) => {
      const go = () => { const k = th.dataset.k; sort = sort.key === k ? { key: k, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'desc' };
        rows.sort((a, b) => { const x = a[k], y = b[k]; const c = (x === null || x === undefined) - (y === null || y === undefined) || (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))); return sort.dir === 'asc' ? c : -c; }); draw(); };
      th.addEventListener('click', go); th.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    });
    root.querySelectorAll('[data-exp]').forEach((b) => b.addEventListener('click', async () => {
      try { await exportData(b.dataset.exp, { name: o.exportName, title: o.title, subtitle: o.subtitle ? o.subtitle() : [], columns: cs, rows: o.rows, totals: o.totals }); } catch (err) { toast(friendly(err), true); }
      const d = root.querySelector('.sd-t-export'); if (d) d.removeAttribute('open');
    }));
  }
  draw();
}
