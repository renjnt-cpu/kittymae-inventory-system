// Scrap Monitoring page -- "All Scrap": every scrap record of every branch the person may see, read live from the branches' own records, and the drawer that shows one record in full.
// Nothing here is typed in again: the list and the drawer only show what the POS (Branches > Scrap) already stores; "Open original record" goes back to it.
import { esc, grams, money, num, fmtDate, fmtTime, fmtDateTime, fmtShortDateTime, kindBadge, statusBadge, markBadge, ageBadge, KINDS, STATUS, SORT_ENTRIES, SOURCE_TYPES, METALS, posEntryUrl, scrapId, friendly, saleStatusBadge, groupStatusBadge, kindOfSale, plural } from './smFormat.js?v=20261030b';
import { openDrawer, closeDrawer, drawerFooter, kv, emptyBox, fileThumb, wireFiles } from './smUi.js?v=20261030b';
import { renderList } from './smList.js?v=20261030b';

export function entriesCfg(ctx) {
  const v = ctx.value;
  return {
    key: 'entries',
    hint: 'Every scrap record from every branch you can see — read live from the branches\' own records, so nothing is typed twice. Open any row for its full details, or go to the original record in the POS.',
    fields: [
      { id: 'q', type: 'search', label: 'Search', ph: 'Scrap #, customer, buyer, sale number, recorded by…', grow: true },
      { id: 'date_from', type: 'date', label: 'From' }, { id: 'date_to', type: 'date', label: 'To' },
      { id: 'branch_id', type: 'select', label: 'Branch', allLabel: 'All branches', options: (c) => c.branches.map((b) => [b.id, b.name]), show: (c) => c.branches.length > 1 },
      { id: 'kind', type: 'select', label: 'Type', options: Object.entries(KINDS).map(([k, x]) => [k, x.long]) },
      { id: 'status', type: 'select', label: 'Status', options: Object.entries(STATUS).map(([k, x]) => [k, x.label]) },
      { id: 'availability', type: 'select', label: 'Held now', options: [['available', 'Available now'], ['none', 'Nothing left']] },
      { id: 'metal', type: 'select', label: 'Metal', options: METALS.map((m) => [m, m]), more: true },
      { id: 'karat', type: 'select', label: 'Purity', options: (c) => c.refs.karats.map((k) => [k, k]), more: true },
      { id: 'source_type', type: 'select', label: 'Source', options: SOURCE_TYPES.map((x) => [x, x]), more: true },
      { id: 'buyer', type: 'text', label: 'Buyer', ph: 'Name', more: true },
      { id: 'recorded_by', type: 'text', label: 'Recorded by', ph: 'Name', more: true },
      { id: 'min_g', type: 'number', label: 'Weight from (g)', more: true }, { id: 'max_g', type: 'number', label: 'Weight to (g)', more: true },
      { id: 'has_photo', type: 'select', label: 'Photo', options: [['yes', 'Has a photo'], ['no', 'No photo']], more: true },
    ],
    sorts: SORT_ENTRIES, sort: 'newest', presets: true, pageSize: 50,
    fetch: (f, sort, limit, offset) => ctx.api.entriesList(f, limit, offset, sort),
    summaryHtml: (res) => {
      const s = res.summary || {};
      return '<div class="sm-chips"><span class="sm-chip"><b>' + (s.entries || 0).toLocaleString('en-PH') + '</b> records</span><span class="sm-chip"><b>' + grams(s.recorded_g) + '</b> recorded</span>' +
        '<span class="sm-chip"><b>' + grams(s.available_g) + '</b> available now</span><span class="sm-chip"><b>' + grams(s.sold_g) + '</b> sold / released</span>' +
        (v ? '<span class="sm-chip">paid to customers <b>' + money(s.purchase_amount) + '</b></span>' : '') + '</div>';
    },
    tableHtml: (rows) => '<div class="table-scroll table-2col"><table class="sm-table"><thead><tr><th>Scrap ID</th><th>Date</th><th>Branch</th><th>Type</th><th>Item</th><th class="sm-num">Weight</th><th class="sm-num">Available</th>' +
      '<th>Source</th><th>Recorded by</th><th>Status</th><th>Sale / disposal</th>' + (v ? '<th class="sm-num">Amount</th>' : '') + '<th></th></tr></thead><tbody>' + rows.map((r) => rowHtml(r, ctx)).join('') + '</tbody></table></div>',
    wireRows: (body) => wireEntryRows(ctx, body),
    emptyText: (hasFilters) => hasFilters ? 'No scrap records match these filters.' : 'No scrap records yet.',
  };
}

export function rowHtml(r, ctx) {
  const v = ctx.value, isIn = r.entry_type === 'In';
  const amount = v ? (r.kind === 'Bought from Customer' ? money(r.total_amount) + (r.balance > 0 ? '<div class="sm-small" style="color:#c62828;">owing ' + money(r.balance) + '</div>' : '') + (r.sold_amount ? '<div class="muted sm-small">sold ' + money(r.sold_amount) + '</div>' : '')
    : r.total_amount !== null && r.total_amount !== undefined ? money(r.total_amount) : '<span class="muted">—</span>') : '';
  const who = r.kind === 'Bought from Customer' ? (r.customer_name || 'Walk-in') : r.kind === 'Refiner / Other' ? (r.customer_name || '') : (r.counterpart_branch ? (r.kind === 'Transferred Out' ? 'to ' : 'from ') + r.counterpart_branch : '');
  return '<tr data-id="' + esc(r.id) + '" class="' + (r.age_days >= 90 ? 'sm-row-old' : r.status === 'PENDING_SALE' ? 'sm-row-pending' : '') + '">' +
    '<td data-label="Scrap ID"><button type="button" class="sm-link" data-open-entry="' + esc(r.id) + '"><b>' + esc(scrapId(r.id)) + '</b></button></td>' +
    '<td data-label="Date">' + esc(fmtDate(r.entry_date)) + (r.purchase_time ? '<div class="muted sm-small">' + esc(fmtTime(r.purchase_time)) + '</div>' : '') + '</td>' +
    '<td data-label="Branch">' + esc(r.branch_name) + '</td>' +
    '<td data-label="Type">' + kindBadge(r.kind) + (who ? '<div class="muted sm-small sm-wrap">' + esc(who) + '</div>' : '') + '</td>' +
    '<td data-label="Item" class="sm-wrap">' + esc(r.label || '—') + '</td>' +
    '<td data-label="Weight" class="sm-num">' + esc(grams(r.weight_g)) + '</td>' +
    '<td data-label="Available" class="sm-num">' + (isIn && !r.converted_id ? '<b>' + esc(grams(r.available_g)) + '</b>' + (r.reserved_g > 0 ? '<div class="muted sm-small">' + esc(num(r.reserved_g)) + ' g reserved</div>' : '') +
      (r.age_days !== null && r.age_days !== undefined ? '<div>' + ageBadge(r.age_days, ctx.settings.aged_days) + '</div>' : '') : '<span class="muted">—</span>') + '</td>' +
    '<td data-label="Source">' + esc(r.source_type || '—') + '</td>' +
    '<td data-label="Recorded by">' + esc(r.recorded_by || '—') + '</td>' +
    '<td data-label="Status">' + statusBadge(r.status) + (r.corrected ? ' <span class="badge sm-badge sm-corrected" title="This record was corrected after it was entered.">Corrected</span>' : '') + '</td>' +
    '<td data-label="Sale / disposal" class="sm-wrap">' + (r.sale_numbers ? esc(r.sale_numbers) + (r.buyers ? '<div class="muted sm-small">' + esc(r.buyers) + '</div>' : '') : '<span class="muted">—</span>') + '</td>' +
    (v ? '<td data-label="Amount" class="sm-num">' + amount + '</td>' : '') +
    '<td class="full-row"><div class="sm-rowact"><button type="button" class="btn small" data-open-entry="' + esc(r.id) + '">View details</button>' +
      '<a class="sm-abtn" href="' + esc(posEntryUrl(r.id)) + '" target="_blank" rel="noopener noreferrer" title="Open this record in the POS (Branches > Scrap)">Original ↗</a>' +
      (ctx.can.sell && isIn && !r.converted_id && r.available_g > 0.0005 ? '<button type="button" class="btn small secondary" data-sell-entry="' + esc(r.id) + '" data-branch="' + esc(r.branch_id) + '">Sell</button>' : '') + '</div></td></tr>';
}

export function wireEntryRows(ctx, body) {
  body.querySelectorAll('[data-open-entry]').forEach((b) => b.addEventListener('click', () => openEntry(ctx, b.dataset.openEntry)));
  body.querySelectorAll('[data-sell-entry]').forEach((b) => b.addEventListener('click', () => ctx.openSaleForm({ mode: 'SALE', branchId: Number(b.dataset.branch), entryId: Number(b.dataset.sellEntry) })));
}

export const renderEntries = (ctx, panel) => renderList(ctx, panel, entriesCfg(ctx));

// ---------------------------------------------------------------- one record in full
const section = (title, html) => '<div class="drawer-section"><h4>' + esc(title) + '</h4>' + html + '</div>';

export async function openEntry(ctx, id) {
  openDrawer('detail', { title: scrapId(id), sub: 'Loading…', body: '<div id="sm-detail-msg"></div><p class="muted">Loading…</p>', footer: '' });
  let res;
  try { res = await ctx.api.entryDetail(Number(id)); } catch (err) { openDrawer('detail', { title: scrapId(id), sub: '', body: '<div class="msg error">' + esc(friendly(err)) + '</div>', footer: '' }); return; }
  if (!res || res.ok === false) { openDrawer('detail', { title: scrapId(id), sub: '', body: '<div class="msg error">' + esc((res && res.message) || 'That record could not be opened.') + '</div>', footer: '' }); return; }
  const e = res.entry, v = ctx.value, isIn = e.entry_type === 'In' && !e.converted_id;
  const paths = [];
  let body = '<div id="sm-detail-msg"></div><div class="sm-badges">' + kindBadge(e.kind) + statusBadge(e.status) + (e.corrected ? '<span class="badge sm-badge sm-corrected">Corrected</span>' : '') +
    (e.converted_id ? '<span class="badge sm-badge sm-st-converted">Converted to Subasta #' + esc(e.converted_id) + '</span>' : '') + '</div>';

  body += section('Record',
    kv('Scrap ID', esc(scrapId(e.id))) + kv('Type', esc((KINDS[e.kind] || { long: e.kind }).long) + (e.counterpart_branch ? ' (' + (e.kind === 'Transferred Out' ? 'to ' : 'from ') + esc(e.counterpart_branch) + ')' : '')) +
    kv('Branch', esc(e.branch_name)) + kv('Date recorded', esc(fmtDate(e.entry_date)) + (e.purchase_time ? ' · ' + esc(fmtTime(e.purchase_time)) : '')) +
    kv('Recorded by', esc(e.recorded_by || '—') + (e.created_at ? ' <span class="muted">· ' + esc(fmtShortDateTime(e.created_at)) + '</span>' : '')) +
    kv('Last updated', e.updated_at ? esc(fmtDateTime(e.updated_at)) + (e.updated_by ? ' · ' + esc(e.updated_by) : '') : '<span class="muted">never corrected</span>') +
    (isIn ? kv('Held now', '<b>' + esc(grams(e.available_g)) + '</b> of ' + esc(grams(e.weight_g)) + (e.age_days !== null && e.age_days !== undefined ? ' ' + ageBadge(e.age_days, ctx.settings.aged_days) : '')) : '') +
    (e.mirror_sale_id ? kv('Written by', '<button type="button" class="sm-link" data-open-sale="' + esc(e.mirror_sale_id) + '">' + esc(e.sale_numbers || 'a scrap sale') + '</button>') : ''));

  const who = [['Customer / buyer', e.customer_name], ['Contact', e.contact_number], ['Address', e.customer_address], ['Source', e.source_type], ['Source note', e.source], ['Notes', e.notes]].filter(([, x]) => x);
  if (who.length) body += section(e.kind === 'Refiner / Other' ? 'Buyer / refiner' : 'Customer', who.map(([k, x]) => kv(k, esc(x))).join(''));

  const lines = res.lines || [];
  body += section('Metal & weight', '<div class="table-scroll table-2col"><table class="sm-table"><thead><tr><th>#</th><th>Metal</th><th>Purity</th><th class="sm-num">Grams</th>' + (v ? '<th class="sm-num">Price / g</th><th class="sm-num">Amount</th>' : '') +
    (isIn ? '<th class="sm-num">Held now</th><th class="sm-num">Sold / released</th><th>Mark</th>' : '') + '<th>Photo</th></tr></thead><tbody>' +
    lines.map((l) => { if (l.photo) paths.push(l.photo);
      return '<tr><td data-label="#">' + esc(l.line_no) + '</td><td data-label="Metal">' + esc(l.metal_type) + '</td><td data-label="Purity">' + esc(l.karat || '—') + '</td><td data-label="Grams" class="sm-num">' + esc(num(l.grams)) + '</td>' +
        (v ? '<td data-label="Price / g" class="sm-num">' + esc(l.price_per_gram === null || l.price_per_gram === undefined ? '—' : money(l.price_per_gram)) + '</td><td data-label="Amount" class="sm-num">' + esc(l.amount === null || l.amount === undefined ? '—' : money(l.amount)) + '</td>' : '') +
        (isIn ? '<td data-label="Held now" class="sm-num">' + esc(l.available_g === null || l.available_g === undefined ? '—' : num(l.available_g)) + (l.reserved_g > 0 ? '<div class="muted sm-small">' + esc(num(l.reserved_g)) + ' reserved</div>' : '') + '</td>' +
          '<td data-label="Sold / released" class="sm-num">' + esc(num((l.released_g || 0) + (l.disposed_g || 0) + (l.transferred_g || 0))) + '</td><td data-label="Mark">' + (markBadge(l.mark, l.mark_buyer) || '<span class="muted">—</span>') + (l.mark_note ? '<div class="muted sm-small">' + esc(l.mark_note) + '</div>' : '') + '</td>' : '') +
        '<td data-label="Photo">' + (l.photo ? '<button type="button" class="sm-link" data-zoom-bucket="scrap-attachments" data-zoom-path="' + esc(l.photo) + '" data-zoom-title="' + esc(scrapId(e.id) + ' · line ' + l.line_no) + '">View photo</button>' : '<span class="muted">—</span>') + '</td></tr>'; }).join('') +
    '</tbody></table></div>');

  if (v && (e.total_amount !== null && e.total_amount !== undefined)) {
    body += section('Money', kv('Final amount', '<b>' + esc(money(e.total_amount)) + '</b>') + (e.gross_amount !== null && e.gross_amount !== undefined && Number(e.gross_amount) !== Number(e.total_amount) ? kv('Before adjustment', esc(money(e.gross_amount))) : '') +
      (Number(e.adjustment_amount) ? kv('Adjustment', esc(money(e.adjustment_amount)) + (e.adjustment_reason ? ' <span class="muted">· ' + esc(e.adjustment_reason) + '</span>' : '')) : '') +
      (e.payment_method ? kv('Paid by', esc(e.payment_method)) : '') + (e.kind === 'Bought from Customer' ? kv('Paid so far', esc(money(e.paid))) + kv('Balance', e.balance > 0 ? '<span style="color:#c62828;"><b>' + esc(money(e.balance)) + '</b></span>' : '<span style="color:#2e7d32;">fully paid</span>') : ''));
  }
  if (v && res.payments && res.payments.length) {
    body += section('Payments', '<div class="table-scroll table-2col"><table class="sm-table"><thead><tr><th>Date</th><th>Method</th><th class="sm-num">Amount</th><th>Reference</th><th>Recorded by</th><th>Proof</th></tr></thead><tbody>' +
      res.payments.map((p) => { if (p.proof) paths.push(p.proof);
        return '<tr><td data-label="Date">' + esc(fmtDate(p.paid_at)) + '</td><td data-label="Method">' + esc(p.method) + '</td><td data-label="Amount" class="sm-num">' + esc(money(p.amount)) + '</td><td data-label="Reference">' + esc(p.reference || '—') + '</td>' +
          '<td data-label="Recorded by">' + esc(p.recorded_by || '—') + '</td><td data-label="Proof">' + (p.proof ? '<button type="button" class="sm-link" data-zoom-bucket="scrap-attachments" data-zoom-path="' + esc(p.proof) + '" data-zoom-title="Payment proof">View proof</button>' : '<span class="muted">—</span>') + '</td></tr>'; }).join('') + '</tbody></table></div>');
  }
  if (e.photo) paths.unshift(e.photo);
  if (ctx.files) {
    const thumbs = [];
    if (e.photo) thumbs.push(fileThumb({ bucket: 'scrap-attachments', path: e.photo, label: 'Whole purchase' }));
    lines.forEach((l) => { if (l.photo) thumbs.push(fileThumb({ bucket: 'scrap-attachments', path: l.photo, label: 'Line ' + l.line_no + ' · ' + (l.karat || l.metal_type) })); });
    (res.payments || []).forEach((p) => { if (p.proof) thumbs.push(fileThumb({ bucket: 'scrap-attachments', path: p.proof, label: 'Payment proof · ' + (p.method || '') })); });
    body += section('Photos & attachments', thumbs.length ? '<div class="sm-files">' + thumbs.join('') + '</div>' : '<p class="muted">No photo or proof is attached to this record.</p>');
  } else if (e.has_photo !== undefined) {
    body += section('Photos & attachments', '<p class="muted">Photos are hidden for your access level.</p>');
  }

  const sales = res.sales || [];
  if (sales.length) {
    body += section('Sales & disposals', '<div class="table-scroll table-2col"><table class="sm-table"><thead><tr><th>Number</th><th>Date</th><th>Status</th><th>Buyer</th><th>Lot</th><th class="sm-num">Grams</th>' + (v ? '<th class="sm-num">Amount</th>' : '') + '</tr></thead><tbody>' +
      sales.map((s) => '<tr><td data-label="Number"><button type="button" class="sm-link" data-open-sale="' + esc(s.sale_id) + '"><b>' + esc(s.sale_number) + '</b></button></td><td data-label="Date">' + esc(fmtDate(s.sale_date)) + '</td>' +
        '<td data-label="Status">' + saleStatusBadge(s.status) + '</td><td data-label="Buyer">' + esc(s.buyer || (s.kind === 'DISPOSAL' ? 'Disposal' : '—')) + '</td><td data-label="Lot">' + esc([s.metal_type, s.karat].filter(Boolean).join(' ')) + '</td>' +
        '<td data-label="Grams" class="sm-num">' + esc(num(s.grams)) + '</td>' + (v ? '<td data-label="Amount" class="sm-num">' + esc(s.amount === null || s.amount === undefined ? '—' : money(s.amount)) + '</td>' : '') + '</tr>').join('') + '</tbody></table></div>');
  }

  const groups = res.groups || [];
  if (groups.length) {
    body += section('In a group', '<div class="table-scroll table-2col"><table class="sm-table"><thead><tr><th>Group</th><th>Status</th><th>Lot</th><th class="sm-num">Grams</th></tr></thead><tbody>' +
      groups.map((x) => '<tr><td data-label="Group"><button type="button" class="sm-link" data-open-group="' + esc(x.group_id) + '"><b>' + esc(x.group_number) + '</b></button><div class="muted sm-small sm-wrap">' + esc(x.title) + '</div></td>' +
        '<td data-label="Status">' + groupStatusBadge(x.status) + '</td><td data-label="Lot">' + esc([x.metal_type, x.karat].filter(Boolean).join(' ')) + '</td><td data-label="Grams" class="sm-num">' + esc(num(x.grams)) + ' g</td></tr>').join('') + '</tbody></table></div>' +
      (groups.some((x) => x.status === 'PENDING') ? '<p class="muted sm-small">The grams in a group that is still waiting for the supplier are held back, so they are not available to sell.</p>' : ''));
  }

  const hist = res.history || [];
  body += section('History', hist.length ? '<ul class="sm-tl">' + hist.map((h) => '<li class="' + (/delet|reverse|reject|void/i.test(h.action) ? 'sm-tl-bad' : /correct|photo|proof|payment/i.test(h.action) ? 'sm-tl-warn' : 'sm-tl-good') + '"><div class="sm-tl-head"><b>' + esc(h.action) + '</b> <span class="muted">· ' + esc(h.by || 'System') + ' · ' + esc(fmtShortDateTime(h.at)) + (h.source === 'ERP' ? ' · Scrap Monitoring' : '') + '</span></div>' +
    (h.details || h.reason ? '<div class="sm-tl-text">' + esc([h.details, h.reason].filter(Boolean).join(' — ')) + '</div>' : '') + '</li>').join('') + '</ul>' : '<p class="muted">No history recorded.</p>');

  const canSell = ctx.can.sell && isIn && e.available_g > 0.0005, canDispose = ctx.can.dispose && isIn && e.available_g > 0.0005;
  const footer = '<a class="sm-abtn" href="' + esc(posEntryUrl(e.id)) + '" target="_blank" rel="noopener noreferrer">Open original record ↗</a>' +
    (canSell ? '<button type="button" class="btn" data-sell>Sell this scrap</button><button type="button" class="btn secondary" data-group title="Hold it back in a pending group until the supplier has weighed it">Put in a group…</button>' : '') + (canDispose ? '<button type="button" class="btn secondary" data-dispose>Dispose</button>' : '') +
    (ctx.can.view_reports ? '<button type="button" class="btn secondary" data-ledger>View ledger</button>' : '') + '<button type="button" class="btn secondary" data-close>Close</button>';
  openDrawer('detail', { title: scrapId(e.id), sub: e.branch_name + ' · ' + (KINDS[e.kind] || { label: e.kind }).label, body, footer });
  const bodyEl = document.getElementById('sm-detail-body'), footEl = drawerFooter('detail');
  wireFiles(ctx, bodyEl);
  bodyEl.querySelectorAll('[data-open-sale]').forEach((b) => b.addEventListener('click', () => ctx.openSale(Number(b.dataset.openSale))));
  bodyEl.querySelectorAll('[data-open-group]').forEach((b) => b.addEventListener('click', () => ctx.openGroup(b.dataset.openGroup)));
  footEl.querySelector('[data-close]').addEventListener('click', () => closeDrawer('detail'));
  const grp = footEl.querySelector('[data-group]'); if (grp) grp.addEventListener('click', () => { closeDrawer('detail'); ctx.openSaleForm({ mode: 'GROUP', branchId: e.branch_id, entryId: e.id }); });
  const sell = footEl.querySelector('[data-sell]'); if (sell) sell.addEventListener('click', () => { closeDrawer('detail'); ctx.openSaleForm({ mode: 'SALE', branchId: e.branch_id, entryId: e.id }); });
  const disp = footEl.querySelector('[data-dispose]'); if (disp) disp.addEventListener('click', () => { closeDrawer('detail'); ctx.openSaleForm({ mode: 'DISPOSAL', branchId: e.branch_id, entryId: e.id }); });
  const led = footEl.querySelector('[data-ledger]'); if (led) led.addEventListener('click', () => { closeDrawer('detail'); ctx.gotoReport('ledger', { entry_id: e.id }); });
}
