// Item Monitoring > Product Changes -- every Add / Edit / Discontinue / Reactivate made in the SKU Catalog, with who and when. Read-only: written by a database trigger from whichever page
// changed the catalog; nothing on this page can edit it.
import { esc, fmtDateTime } from './imFormat.js?v=20261030b';
import { emptyBox } from './imUi.js?v=20261030b';

const BADGE = { Added: 'ok', Edited: 'transit', Discontinued: 'low', Reactivated: 'ok' };

export function renderChanges(ctx, panel) {
  const st = ctx.ui.changes;
  panel.innerHTML = '<p class="muted" style="margin-top:0;">Every Add / Edit / Discontinue / Reactivate made in the SKU Catalog, with who and when. This list is read-only.</p>' +
    '<div class="card im-filters"><div class="im-filter-row"><div class="field im-grow"><label>Search SKU or details</label><input type="search" id="im-pc-search" value="' + esc(st.search) + '" placeholder="SKU or words from the details…"></div>' +
    '<div class="field"><label>Action</label><select id="im-pc-action"><option value="">All</option>' + ['Added', 'Edited', 'Discontinued', 'Reactivated'].map((a) => '<option' + (st.action === a ? ' selected' : '') + '>' + a + '</option>').join('') + '</select></div>' +
    '<button type="button" class="btn small secondary" id="im-pc-clear">Clear</button></div></div><div id="im-pc-list"></div>';
  const $ = (id) => panel.querySelector('#' + id);
  function paint() {
    const q = st.search.trim().toLowerCase();
    const rows = ctx.data.changes.filter((c) => (!st.action || c.action === st.action) && (!q || String(c.sku).toLowerCase().includes(q) || String(c.details || '').toLowerCase().includes(q)));
    const box = $('im-pc-list');
    if (!ctx.data.changes.length) { box.innerHTML = emptyBox('No SKU Catalog changes logged yet.'); return; }
    if (!rows.length) { box.innerHTML = emptyBox('No changes match this filter.'); return; }
    box.innerHTML = '<div class="muted im-count">Showing the latest ' + rows.length + (rows.length === ctx.data.changes.length ? ' changes' : ' matching changes') + '.</div><div class="table-scroll table-2col"><table><thead><tr><th>Date</th><th>SKU</th><th>Action</th><th>Details</th><th>Changed by</th></tr></thead><tbody>' +
      rows.slice(0, 300).map((c) => '<tr><td data-label="Date">' + fmtDateTime(c.changed_at) + '</td><td data-label="SKU">' + esc(c.sku) + '</td><td data-label="Action"><span class="badge ' + (BADGE[c.action] || 'pending') + '">' + esc(c.action) + '</span></td>' +
        '<td data-label="Details" class="full-row">' + esc(c.details || '—') + '</td><td data-label="Changed by" class="full-row">' + (c.changer ? esc(c.changer.full_name) : '—') + '</td></tr>').join('') + '</tbody></table></div>';
  }
  $('im-pc-search').addEventListener('input', (e) => { st.search = e.target.value; paint(); });
  $('im-pc-action').addEventListener('change', (e) => { st.action = e.target.value; paint(); });
  $('im-pc-clear').addEventListener('click', () => { st.search = ''; st.action = ''; renderChanges(ctx, panel); });
  paint();
}
