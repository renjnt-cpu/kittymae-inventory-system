// Access & Performance Control Center -- the one table every tab uses: search, sort, pages, and Export (CSV / Excel / PDF / Print) of exactly what is filtered.
// The rows are already in the browser (the database sends one row per person or per record), so this works on them directly -- it never asks the database again.
// A column is { key, label, type?, render?(row) -> html, sort?(row) -> value, total?: 'sum', hide?: true, noExport? }; render() must escape what it prints.
import { cellHtml, exportData } from './sdTable.js?v=20261011b';
import { esc, int, toast, friendly, emptyBox } from './apcCore.js?v=20261011b';

const NUMERIC = ['money', 'int', 'num', 'pct'];
const isNum = (c) => NUMERIC.includes(c.type) || c.align === 'right';
const keyOf = (c, r) => (c.sort ? c.sort(r) : r[c.key]);
function compare(a, b) {
  const x = a === undefined ? null : a, y = b === undefined ? null : b;
  if (x === null || x === '') return (y === null || y === '') ? 0 : 1;   // blanks always last
  if (y === null || y === '') return -1;
  const nx = Number(x), ny = Number(y);
  return (!Number.isNaN(nx) && !Number.isNaN(ny) && typeof x !== 'boolean') ? nx - ny : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' });
}

export function createClientTable(cfg) {
  const root = cfg.root;
  let rows = cfg.rows || [], size = cfg.size || 25, page = 1, search = '';
  let sort = Object.assign({ key: null, dir: 'desc' }, cfg.sort || {});
  const allowed = cfg.columns;
  const visible = new Set(allowed.filter((c) => !c.hide).map((c) => c.key));
  root.innerHTML =
    '<div class="sd-table apc-table">' +
      '<div class="sd-table-bar">' +
        (cfg.noSearch ? '' : '<input type="search" class="sd-t-search" placeholder="' + esc(cfg.searchPlaceholder || 'Search…') + '" aria-label="Search this table">') +
        '<label class="sd-t-size-l">Rows <select class="sd-t-size">' + [10, 25, 50, 100].map((k) => '<option' + (k === size ? ' selected' : '') + '>' + k + '</option>').join('') + '</select></label>' +
        '<details class="sd-menu"><summary class="btn small secondary">Columns</summary><div class="sd-menu-pop sd-cols">' +
          allowed.map((c) => '<label><input type="checkbox" data-col="' + esc(c.key) + '"' + (visible.has(c.key) ? ' checked' : '') + '> ' + esc(c.label) + '</label>').join('') + '</div></details>' +
        '<span class="sd-t-spacer"></span>' + (cfg.toolbar || '') +
        (cfg.noExport ? '' : '<details class="sd-menu sd-menu-right sd-t-export"><summary class="btn small">Export</summary><div class="sd-menu-pop">' +
          '<button type="button" data-exp="csv">CSV (.csv)</button><button type="button" data-exp="xlsx">Excel (.xlsx)</button><button type="button" data-exp="pdf">PDF (.pdf)</button><button type="button" data-exp="print">Print</button></div></details>') +
      '</div>' +
      '<div class="sd-t-status muted" role="status"></div><div class="sd-tablewrap"></div><div class="sd-t-pager"></div></div>';
  const $ = (s) => root.querySelector(s);
  const cols = () => allowed.filter((c) => visible.has(c.key));

  function filtered() {
    const q = search.trim().toLowerCase();
    let out = rows;
    if (q) out = out.filter((r) => allowed.some((c) => { const v = c.sort ? c.sort(r) : r[c.key]; return v !== null && v !== undefined && String(v).toLowerCase().includes(q); }) || (cfg.searchText && String(cfg.searchText(r)).toLowerCase().includes(q)));
    if (sort.key) {
      const c = allowed.find((x) => x.key === sort.key);
      if (c) out = out.slice().sort((a, b) => { const r = compare(keyOf(c, a), keyOf(c, b)); return sort.dir === 'asc' ? r : -r; });
    }
    return out;
  }
  function draw() {
    const list = filtered(), cs = cols(), pages = Math.max(1, Math.ceil(list.length / size));
    if (page > pages) page = pages;
    const from = list.length ? (page - 1) * size + 1 : 0, to = Math.min(list.length, page * size), shown = list.slice(from ? from - 1 : 0, to);
    $('.sd-t-status').textContent = list.length ? 'Showing ' + int(from) + '–' + int(to) + ' of ' + int(list.length) + (search ? ' matching "' + search + '"' : (list.length !== rows.length ? ' (filtered from ' + int(rows.length) + ')' : '')) : '';
    const wrap = $('.sd-tablewrap');
    if (!list.length) { wrap.innerHTML = emptyBox(search ? 'Nothing matches "' + search + '".' : (cfg.emptyText || 'Nothing to show for these filters.')); $('.sd-t-pager').innerHTML = ''; return; }
    const totals = cfg.totals ? cfg.totals(list) : null;
    wrap.innerHTML = '<table class="sd-tbl"><thead><tr>' + cs.map((c) => {
      const on = sort.key === c.key;
      return '<th' + (isNum(c) ? ' class="sd-num"' : '') + ' data-k="' + esc(c.key) + '" tabindex="0" aria-sort="' + (on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none') + '"' + (c.title ? ' title="' + esc(c.title) + '"' : '') + '>' +
        esc(c.label) + (on ? ' <span aria-hidden="true">' + (sort.dir === 'asc' ? '▲' : '▼') + '</span>' : '') + '</th>';
    }).join('') + '</tr></thead><tbody>' + shown.map((r, i) => '<tr data-i="' + i + '"' + (cfg.rowClass && cfg.rowClass(r) ? ' class="' + esc(cfg.rowClass(r)) + '"' : '') + (cfg.onRow ? ' tabindex="0"' : '') + '>' +
      cs.map((c) => '<td' + (isNum(c) ? ' class="sd-num"' : '') + (c.label ? ' data-label="' + esc(c.label) + '"' : '') + '>' + cellHtml(c, r) + '</td>').join('') + '</tr>').join('') + '</tbody>' +
      (totals ? '<tfoot><tr>' + cs.map((c, i) => '<td' + (isNum(c) ? ' class="sd-num"' : '') + '><b>' + (i === 0 ? 'Total · ' + int(list.length) : (totals[c.key] !== undefined ? cellHtml({ key: c.key, type: c.type }, { [c.key]: totals[c.key] }) : '')) + '</b></td>').join('') + '</tr></tfoot>' : '') + '</table>';
    wrap.querySelectorAll('th[data-k]').forEach((th) => {
      const go = () => { const k = th.dataset.k; sort = sort.key === k ? { key: k, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'desc' }; page = 1; draw(); };
      th.addEventListener('click', go); th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    if (cfg.onRow) wrap.querySelectorAll('tbody tr').forEach((tr) => {
      const open = (e) => { if (e.target.closest('button, a, input, select')) return; cfg.onRow(shown[Number(tr.dataset.i)]); };
      tr.addEventListener('click', open); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(e); });
    });
    if (cfg.afterDraw) cfg.afterDraw(wrap);
    $('.sd-t-pager').innerHTML = pages > 1
      ? '<button type="button" class="btn small secondary" data-pg="prev"' + (page === 1 ? ' disabled' : '') + '>‹ Prev</button><span class="sd-t-page">Page ' + int(page) + ' of ' + int(pages) + '</span>' +
        '<button type="button" class="btn small secondary" data-pg="next"' + (page >= pages ? ' disabled' : '') + '>Next ›</button>' : '';
    $('.sd-t-pager').querySelectorAll('[data-pg]').forEach((b) => b.addEventListener('click', () => { page += b.dataset.pg === 'next' ? 1 : -1; draw(); }));
  }

  let timer = null;
  const si = $('.sd-t-search');
  if (si) si.addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => { search = e.target.value; page = 1; draw(); }, 200); });
  $('.sd-t-size').addEventListener('change', (e) => { size = Number(e.target.value); page = 1; draw(); });
  root.querySelectorAll('[data-col]').forEach((cb) => cb.addEventListener('change', () => { if (cb.checked) visible.add(cb.dataset.col); else if (visible.size > 1) visible.delete(cb.dataset.col); else cb.checked = true; draw(); }));
  const onDoc = (e) => root.querySelectorAll('details.sd-menu[open]').forEach((d) => { if (!d.contains(e.target)) d.removeAttribute('open'); });
  document.addEventListener('click', onDoc);
  root.querySelectorAll('[data-exp]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await exportData(b.dataset.exp, { name: cfg.exportName || 'access-performance', title: cfg.title || 'Access & Performance Control Center', subtitle: cfg.subtitle ? cfg.subtitle() : [],
        columns: cols().filter((c) => !c.noExport), rows: filtered(), totals: null, footer: 'Kittymae Jewels — Access & Performance Control Center (confidential)' });
    } catch (err) { toast(friendly(err), true); }
    const d = root.querySelector('.sd-t-export'); if (d) d.removeAttribute('open');
  }));
  draw();
  return { setRows(r) { rows = r || []; page = 1; draw(); }, setSort(key, dir) { sort = { key, dir: dir || 'desc' }; page = 1; draw(); }, redraw: draw, destroy() { document.removeEventListener('click', onDoc); }, filtered };
}
