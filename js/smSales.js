// Scrap Monitoring page -- "Scrap Sales": every scrap sale and disposal, and the drawer for one of them (its lots, what the buyer paid, the files, the history, and the actions: approve,
// reject, correct, reverse, record a payment, attach a file). What each person sees and may do is decided by the database (the scrap_monitor.* keys); the buttons only hide what a person could not use.
import { esc, grams, money, num, fmtDate, fmtDateTime, fmtShortDateTime, saleStatusBadge, payBadge, SALE_STATUS, PAY_STATUS, PAY_METHODS, NEEDS_REFERENCE, FILE_TYPES, fileTypeLabel, manilaToday, friendly,
  kindOfSale, scrapId, posEntryUrl, plural, DISPOSAL_REASONS, DISPOSAL_METHODS } from './smFormat.js?v=20261030a';
import { openDrawer, closeDrawer, drawerFooter, kv, actionPanel, fileThumb, wireFiles, emptyBox } from './smUi.js?v=20261030a';
import { renderList } from './smList.js?v=20261030a';

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));

export function salesCfg(ctx) {
  const v = ctx.value;
  return {
    key: 'sales',
    hint: 'Every sale of scrap to a buyer and every disposal, with what was taken, what the buyer paid and who approved it. A sale never deletes the scrap record: it is kept, and what was taken is shown on it.',
    fields: [
      { id: 'q', type: 'search', label: 'Search', ph: 'Sale number, buyer, reference, entered by…', grow: true },
      { id: 'date_from', type: 'date', label: 'From' }, { id: 'date_to', type: 'date', label: 'To' },
      { id: 'branch_id', type: 'select', label: 'Branch', allLabel: 'All branches', options: (c) => c.branches.map((b) => [b.id, b.name]), show: (c) => c.branches.length > 1 },
      { id: 'kind', type: 'select', label: 'Sale or disposal', options: [['SALE', 'Sales'], ['DISPOSAL', 'Disposals']] },
      { id: 'status', type: 'select', label: 'Status', options: Object.entries(SALE_STATUS).map(([k, x]) => [k, x.label]) },
      { id: 'payment_status', type: 'select', label: 'Payment', options: Object.entries(PAY_STATUS).map(([k, x]) => [k, x.label]), show: () => v, more: true },
      { id: 'buyer_id', type: 'select', label: 'Buyer', options: (c) => (c.refs.buyers || []).map((b) => [b.id, b.name]), more: true },
      { id: 'unpaid', type: 'check', label: 'Still owing money', show: () => v, more: true },
    ],
    sorts: [['newest', 'Newest first'], ['oldest', 'Oldest first'], ...(v ? [['amount', 'Highest amount'], ['balance', 'Biggest balance']] : []), ['buyer', 'Buyer']], sort: 'newest', presets: true, pageSize: 50,
    chipText: (id, val) => id === 'unpaid' ? 'yes' : undefined,
    fetch: (f, sort, limit, offset) => ctx.api.salesList(f.unpaid ? Object.assign({}, f, { unpaid: 'yes' }) : f, limit, offset, sort),
    summaryHtml: (res) => {
      const s = res.summary || {};
      return '<div class="sm-chips"><span class="sm-chip"><b>' + (s.sales || 0) + '</b> shown</span><span class="sm-chip"><b>' + grams(s.grams) + '</b> confirmed</span>' +
        (v ? '<span class="sm-chip">sold for <b>' + money(s.amount) + '</b></span><span class="sm-chip">paid <b>' + money(s.paid) + '</b></span><span class="sm-chip">still owed <b>' + money(s.balance) + '</b></span>' : '') +
        (s.pending ? '<span class="sm-chip"><b>' + s.pending + '</b> waiting for approval</span>' : '') + '</div>';
    },
    tableHtml: (rows) => '<div class="table-scroll table-2col"><table class="sm-table"><thead><tr><th>Number</th><th>Date</th><th>Branch</th><th>Buyer / reason</th><th class="sm-num">Lots</th><th class="sm-num">Grams</th>' +
      (v ? '<th class="sm-num">Amount</th><th class="sm-num">Paid</th><th class="sm-num">Remaining</th><th>Payment</th>' : '') + '<th>Entered by</th><th>Status</th><th></th></tr></thead><tbody>' +
      rows.map((r) => '<tr data-id="' + esc(r.id) + '" class="' + (r.status === 'PENDING_APPROVAL' ? 'sm-row-pending' : '') + '"><td data-label="Number"><button type="button" class="sm-link" data-open-sale="' + esc(r.id) + '"><b>' + esc(r.sale_number) + '</b></button>' +
        '<div class="muted sm-small">' + esc(kindOfSale(r.kind)) + '</div>' + (r.batch_n > 1 ? '<div class="sm-small sm-batch-tag" title="Made in one step with the ' + (r.kind === 'SALE' ? 'sales' : 'disposals') + ' of the other branches; ' + (r.kind === 'SALE' ? 'one payment or approval' : 'one approval') + ' can cover them all">one of ' + esc(r.batch_n) + (r.kind === 'SALE' ? ' sold together' : ' disposed together') + '</div>' : '') +
        '</td><td data-label="Date">' + esc(fmtDate(r.sale_date)) + '</td><td data-label="Branch">' + esc(r.branch_name) + '</td>' +
        '<td data-label="Buyer / reason" class="sm-wrap">' + esc(r.buyer_name || r.reason || '—') + (r.reference_number ? '<div class="muted sm-small">ref ' + esc(r.reference_number) + '</div>' : '') + '</td>' +
        '<td data-label="Lots" class="sm-num">' + esc(r.items_n) + '</td><td data-label="Grams" class="sm-num">' + esc(num(r.total_grams)) + ' g</td>' +
        (v ? '<td data-label="Amount" class="sm-num">' + esc(r.total_amount === null || r.total_amount === undefined ? '—' : money(r.total_amount)) + '</td><td data-label="Paid" class="sm-num">' + esc(r.kind === 'SALE' ? money(r.paid) : '—') + '</td>' +
          '<td data-label="Remaining" class="sm-num">' + (r.kind === 'SALE' && r.status === 'CONFIRMED' ? (r.balance > 0 ? '<b style="color:#c62828;">' + esc(money(r.balance)) + '</b>' : esc(money(0))) : '—') + '</td><td data-label="Payment">' + (r.status === 'CONFIRMED' ? payBadge(r.payment_status) : '') + '</td>' : '') +
        '<td data-label="Entered by">' + esc(r.created_by_name || '—') + '</td><td data-label="Status">' + saleStatusBadge(r.status) + (r.status === 'PENDING_APPROVAL' && r.pending_hours >= ctx.settings.pending_alert_hours ? '<div class="sm-small" style="color:#c62828;">waiting ' + esc(r.pending_hours) + ' h</div>' : '') + '</td>' +
        '<td class="full-row"><button type="button" class="btn small' + (r.status === 'PENDING_APPROVAL' && ctx.can.approve_sale ? '' : ' secondary') + '" data-open-sale="' + esc(r.id) + '">' + (r.status === 'PENDING_APPROVAL' && ctx.can.approve_sale ? 'Review' : 'View') + '</button></td></tr>').join('') + '</tbody></table></div>',
    wireRows: (body) => body.querySelectorAll('[data-open-sale]').forEach((b) => b.addEventListener('click', () => openSale(ctx, Number(b.dataset.openSale)))),
    emptyText: (hasFilters) => hasFilters ? 'No sales or disposals match these filters.' : 'No scrap has been sold or disposed of through this module yet.',
  };
}
export const renderSales = (ctx, panel) => renderList(ctx, panel, salesCfg(ctx));

// ---------------------------------------------------------------- one sale / disposal
const section = (title, html) => '<div class="drawer-section"><h4>' + esc(title) + '</h4>' + html + '</div>';
const peopleOptions = (people, selected) => '<option value="">—</option>' + (people || []).map((p) => '<option value="' + esc(p.id) + '"' + (p.id === selected ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('');
const tlClass = (a) => /revers|reject|void|withdraw/i.test(a) ? 'sm-tl-bad' : /correct|pending|submitted|attached/i.test(a) ? 'sm-tl-warn' : 'sm-tl-good';

export async function openSale(ctx, id) {
  openDrawer('detail', { title: 'Loading…', sub: '', body: '<div id="sm-detail-msg"></div><p class="muted">Loading…</p>', footer: '' });
  let res;
  try { res = await ctx.api.saleDetail(Number(id)); } catch (err) { openDrawer('detail', { title: 'Sale', sub: '', body: '<div class="msg error">' + esc(friendly(err)) + '</div>', footer: '' }); return; }
  if (!res || res.ok === false) { openDrawer('detail', { title: 'Sale', sub: '', body: '<div class="msg error">' + esc((res && res.message) || 'That sale could not be opened.') + '</div>', footer: '' }); return; }
  const s = res.sale, v = ctx.value, isSale = s.kind === 'SALE', conf = s.status === 'CONFIRMED';
  const noun = isSale ? 'sale' : 'disposal', nouns = noun + 's';
  const items = res.items || [], pays = res.payments || [], files = res.files || [];
  let opts = { buyers: [], people: [] };
  try { opts = await ctx.loadOptions(); } catch (e) { /* the forms still open; the lists are just empty */ }
  const activePays = pays.filter((p) => !p.voided_at);
  // the sales made in the same step for the other branches (a "batch"): they are separate sales, but a payment, an approval or a file can cover them all
  const bt = res.batch && res.batch.count > 1 ? res.batch : null, legs = bt ? (bt.sales || []) : [];
  const live = legs.filter((x) => x.status === 'CONFIRMED' || x.status === 'PENDING_APPROVAL'), pendingLegs = legs.filter((x) => x.status === 'PENDING_APPROVAL'), confirmedLegs = legs.filter((x) => x.status === 'CONFIRMED');
  const owingLegs = legs.filter((x) => x.kind === 'SALE' && x.status === 'CONFIRMED' && x.balance > 0.005), batchBalance = Math.round(owingLegs.reduce((t, x) => t + Number(x.balance || 0), 0) * 100) / 100;
  const payAsBatch = isSale && conf && owingLegs.length > 1 && owingLegs.some((x) => x.id === s.id), fileOthers = bt ? legs.filter((x) => x.id !== s.id && x.status !== 'REJECTED') : [];
  let body = '<div id="sm-detail-msg"></div><div class="sm-badges"><span class="badge sm-badge sm-kind">' + esc(kindOfSale(s.kind)) + '</span>' + saleStatusBadge(s.status) + (v && isSale && conf ? payBadge(s.payment_status) : '') +
    (s.status === 'PENDING_APPROVAL' && s.pending_hours !== null && s.pending_hours !== undefined ? '<span class="badge sm-badge sm-st-pending">waiting ' + esc(s.pending_hours) + ' h</span>' : '') + '</div>';

  body += section('Details',
    (isSale ? kv('Buyer', '<b>' + esc(s.buyer_name || '—') + '</b>') : kv('Reason', '<b>' + esc(s.reason || '—') + '</b>') + (s.disposal_method ? kv('Method', esc(s.disposal_method)) : '')) +
    (res.group ? kv('From group', (res.group.visible ? '<button type="button" class="sm-link" data-open-group="' + esc(res.group.id) + '"><b>' + esc(res.group.group_number) + '</b></button>' : '<b>' + esc(res.group.group_number) + '</b>') + ' <span class="muted">· ' + esc(res.group.title) +
      (res.group.visible && res.group.received_grams !== null && res.group.received_grams !== undefined ? ' · the supplier weighed ' + esc(grams(res.group.received_grams)) + ' in all' : '') + (res.group.visible ? '' : ' · includes branches you cannot see') + '</span>') : '') +
    kv('Branch', esc(s.branch_name)) + kv('Date', esc(fmtDate(s.sale_date))) + (v && s.pricing_method ? kv('Price worked out', s.pricing_method === 'PER_GRAM' ? 'per gram, lot by lot' : 'one flat amount') : '') +
    (s.reference_number ? kv('Reference / slip no.', esc(s.reference_number)) : '') + (s.buyer_representative ? kv('Collected by (buyer\'s person)', esc(s.buyer_representative)) : '') +
    (s.released_by_name ? kv('Released by', esc(s.released_by_name)) : '') + kv('Entered by', esc(s.created_by_name || '—') + ' <span class="muted">· ' + esc(fmtShortDateTime(s.created_at)) + '</span>') +
    (s.approved_by_name ? kv('Approved by', esc(s.approved_by_name) + ' <span class="muted">· ' + esc(fmtShortDateTime(s.approved_at)) + '</span>' + (s.approval_note ? '<div class="muted sm-small">' + esc(s.approval_note) + '</div>' : '')) : '') +
    (s.rejected_by_name ? kv('Rejected by', esc(s.rejected_by_name) + ' <span class="muted">· ' + esc(fmtShortDateTime(s.rejected_at)) + '</span><div class="muted sm-small">' + esc(s.reject_reason || '') + '</div>') : '') +
    (s.reversed_by_name ? kv('Reversed by', esc(s.reversed_by_name) + ' <span class="muted">· ' + esc(fmtShortDateTime(s.reversed_at)) + '</span><div class="muted sm-small">' + esc(s.reverse_reason || '') + '</div>') : '') +
    (s.notes ? kv('Notes', esc(s.notes)) : '') +
    (s.out_entry_id ? kv('In the POS', '<a class="sm-link" href="' + esc(posEntryUrl(s.out_entry_id)) + '" target="_blank" rel="noopener noreferrer">Scrap #' + esc(s.out_entry_id) + ' ↗</a>') : ''));

  if (bt) {
    body += section((isSale ? 'Sold together' : 'Disposed together') + ' · ' + plural(bt.count, noun), '<p class="muted sm-small">Made in one step for several branches. They are separate ' + nouns + ' — one for each branch\'s own books — but ' + (isSale ? 'one payment, approval or file' : 'one approval') + ' can cover them all.</p>' +
      '<div class="table-scroll table-2col"><table class="sm-table"><thead><tr><th>Number</th><th>Branch</th><th>Status</th><th class="sm-num">Grams</th>' + (v && isSale ? '<th class="sm-num">Amount</th><th class="sm-num">Remaining</th>' : '') + '</tr></thead><tbody>' +
      legs.map((x) => '<tr' + (x.id === s.id ? ' class="sm-batch-me"' : '') + '><td data-label="Number">' + (x.id === s.id ? '<b>' + esc(x.sale_number) + '</b> <span class="muted sm-small">(this one)</span>' : '<button type="button" class="sm-link" data-open-sale="' + esc(x.id) + '"><b>' + esc(x.sale_number) + '</b></button>') + '</td>' +
        '<td data-label="Branch">' + esc(x.branch_name) + '</td><td data-label="Status">' + saleStatusBadge(x.status) + '</td><td data-label="Grams" class="sm-num">' + esc(num(x.total_grams)) + ' g</td>' +
        (v && isSale ? '<td data-label="Amount" class="sm-num">' + esc(money(x.total_amount)) + '</td><td data-label="Remaining" class="sm-num">' + (x.kind === 'SALE' && x.status === 'CONFIRMED' ? (x.balance > 0.005 ? '<b style="color:#c62828;">' + esc(money(x.balance)) + '</b>' : esc(money(0))) : '—') + '</td>' : '') + '</tr>').join('') + '</tbody>' +
      '<tfoot><tr><td colspan="3">Together' + (live.length !== legs.length ? ' (without rejected or reversed)' : '') + '</td><td class="sm-num">' + esc(num(live.reduce((t, x) => t + Number(x.total_grams || 0), 0))) + ' g</td>' +
        (v && isSale ? '<td class="sm-num">' + esc(money(live.reduce((t, x) => t + Number(x.total_amount || 0), 0))) + '</td><td class="sm-num">' + esc(money(batchBalance)) + '</td>' : '') + '</tr></tfoot></table></div>' +
      (bt.hidden > 0 ? '<p class="muted sm-small">' + esc(plural(bt.hidden, 'more ' + noun)) + ' of this batch ' + (bt.hidden === 1 ? 'is' : 'are') + ' in a branch you cannot see.</p>' : ''));
  }

  body += section('Scrap taken (' + plural(items.length, 'lot') + ')', '<div class="table-scroll table-2col"><table class="sm-table"><thead><tr><th>Scrap ID</th><th>Bought</th><th>Metal / purity</th><th class="sm-num">Grams</th>' + (v && isSale ? '<th class="sm-num">Rate / g</th><th class="sm-num">Amount</th>' : '') + '<th class="sm-num">Still held</th></tr></thead><tbody>' +
    items.map((i) => '<tr><td data-label="Scrap ID">' + (i.entry_id ? '<button type="button" class="sm-link" data-open-entry="' + esc(i.entry_id) + '"><b>' + esc(scrapId(i.entry_id)) + '</b></button>' : '—') + '</td><td data-label="Bought">' + esc(i.entry_date ? fmtDate(i.entry_date) : '—') + (i.branch_name ? '<div class="muted sm-small">' + esc(i.branch_name) + '</div>' : '') + '</td>' +
      '<td data-label="Metal / purity">' + esc([i.metal_type, i.karat].filter(Boolean).join(' ')) + '</td><td data-label="Grams" class="sm-num"><b>' + esc(num(i.grams)) + ' g</b></td>' +
      (v && isSale ? '<td data-label="Rate / g" class="sm-num">' + esc(i.rate_per_gram === null || i.rate_per_gram === undefined ? '—' : money(i.rate_per_gram)) + '</td><td data-label="Amount" class="sm-num">' + esc(i.amount === null || i.amount === undefined ? '—' : money(i.amount)) + '</td>' : '') +
      '<td data-label="Still held" class="sm-num">' + esc(i.available_now_g === null || i.available_now_g === undefined ? (i.original_g === null || i.original_g === undefined ? 'record removed' : '0 g') : num(i.available_now_g) + ' g') + '</td></tr>').join('') + '</tbody>' +
    '<tfoot><tr><td colspan="3">Total</td><td class="sm-num">' + esc(num(s.total_grams)) + ' g</td>' + (v && isSale ? '<td></td><td class="sm-num">' + esc(money(s.total_amount)) + '</td>' : '') + '<td></td></tr></tfoot></table></div>');

  if (v && isSale && (conf || pays.length)) {
    body += section('Payments from the buyer', kv('Sale total', '<b>' + esc(money(s.total_amount)) + '</b>') + kv('Paid', esc(money(s.paid))) + kv('Remaining', s.balance > 0 ? '<b style="color:#c62828;">' + esc(money(s.balance)) + '</b>' : '<span style="color:#2e7d32;">nothing owed</span>') +
      (pays.length ? '<div class="table-scroll table-2col" style="margin-top:8px;"><table class="sm-table"><thead><tr><th>Date</th><th>Method</th><th class="sm-num">Amount</th><th>Reference</th><th>Received by</th><th>Recorded by</th><th></th></tr></thead><tbody>' +
        pays.map((p) => '<tr' + (p.voided_at ? ' style="opacity:.6;"' : '') + '><td data-label="Date">' + esc(fmtDate(p.paid_at)) + '</td><td data-label="Method">' + esc(p.method) + '</td><td data-label="Amount" class="sm-num">' + (p.voided_at ? '<s>' + esc(money(p.amount)) + '</s>' : esc(money(p.amount))) + (p.batch_request_id ? '<div class="muted sm-small" title="One payment shared over the sales made together">part of a batch payment</div>' : '') + '</td>' +
          '<td data-label="Reference">' + esc(p.reference_number || '—') + '</td><td data-label="Received by">' + esc(p.received_by_name || '—') + '</td><td data-label="Recorded by">' + esc(p.recorded_by_name || '—') + '<div class="muted sm-small">' + esc(fmtShortDateTime(p.created_at)) + '</div></td>' +
          '<td class="full-row">' + (p.voided_at ? '<span class="badge sm-badge sm-st-rejected">voided</span><div class="muted sm-small sm-wrap">' + esc(p.voided_by_name || '') + ' · ' + esc(p.void_reason || '') + '</div>' : (ctx.can.record_payment ? (p.batch_request_id ? '<button type="button" class="btn small secondary" data-void-batch="' + esc(p.batch_request_id) + '" title="Voids this payment in every sale it was shared over">Void the whole payment</button>' : '<button type="button" class="btn small secondary" data-void-payment="' + esc(p.id) + '">Void</button>') : '')) + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="muted">No payment recorded yet.</p>') +
      (conf && ctx.can.record_payment && s.balance > 0.005 ? '<div class="sm-form-sec" style="margin-top:12px;"><h4>Record a payment</h4>' +
        (payAsBatch ? '<div class="sm-banner sm-banner-info"><label class="sm-check"><input type="checkbox" id="pay-batch" checked> <span>Apply it to all <b>' + esc(owingLegs.length) + '</b> sales made together (' + esc(owingLegs.map((x) => x.branch_name).join(', ')) + ') — shared by what each one still owes. Together they owe <b>' + esc(money(batchBalance)) + '</b>.</span></label></div>' : '') +
        '<div class="sm-grid"><div class="field"><label for="pay-amount">Amount (₱) *</label><input id="pay-amount" type="number" min="0" step="0.01" value="' + esc(payAsBatch ? batchBalance : s.balance) + '"></div>' +
        '<div class="field"><label for="pay-method">Method *</label><select id="pay-method">' + PAY_METHODS.map((m) => '<option>' + esc(m) + '</option>').join('') + '</select></div><div class="field"><label for="pay-ref">Reference no.</label><input id="pay-ref" type="text" placeholder="Required for GCash, Maya, bank, check"></div>' +
        '<div class="field"><label for="pay-date">Date paid *</label><input id="pay-date" type="date" value="' + esc(manilaToday()) + '" max="' + esc(manilaToday()) + '" min="' + esc(String(s.sale_date).slice(0, 10)) + '"></div>' +
        '<div class="field"><label for="pay-by">Received by</label><select id="pay-by">' + peopleOptions(opts.people, ctx.access.me.id) + '</select></div><div class="field"><label for="pay-notes">Notes</label><input id="pay-notes" type="text"></div></div>' +
        '<button type="button" class="btn" id="pay-save">Record payment</button><p class="muted sm-small">Add the proof (receipt, screenshot) under Files below after recording.</p></div>' : ''));
  }

  const fileCells = files.map((f) => fileThumb({ bucket: ctx.api.SALE_BUCKET || 'scrap-sale-files', path: f.path, name: f.file_name, contentType: f.content_type, label: fileTypeLabel(f.file_type) + (f.payment_id ? ' · payment' : '') }) || '').join('');
  body += section('Files', (ctx.files ? (files.length ? '<div class="sm-files">' + fileCells + '</div>' : '<p class="muted">No file is attached yet.</p>') : '<p class="muted">Files are hidden for your access level.</p>') +
    (['sell', 'record_payment', 'dispose', 'approve_sale'].some((k) => ctx.can[k]) && s.status !== 'REJECTED' ? '<div class="sm-form-sec" style="margin-top:12px;"><h4>Attach a file</h4><div class="sm-grid"><div class="field"><label for="file-type">What is it?</label><select id="file-type">' + FILE_TYPES.map(([k, l]) => '<option value="' + k + '">' + esc(l) + '</option>').join('') + '</select></div>' +
      (v && isSale && pays.length ? '<div class="field"><label for="file-pay">Belongs to payment</label><select id="file-pay"><option value="">The whole sale</option>' + pays.filter((p) => !p.voided_at).map((p) => '<option value="' + esc(p.id) + '">' + esc(fmtDate(p.paid_at) + ' · ' + money(p.amount) + ' · ' + p.method) + '</option>').join('') + '</select></div>' : '') +
      '<div class="field"><label for="file-input">File (photo or PDF, up to 15 MB)</label><input id="file-input" type="file" accept="image/*,application/pdf"></div></div>' +
      (fileOthers.length ? '<label class="sm-check" style="margin:0 0 8px;"><input type="checkbox" id="file-batch"> <span>Also attach it to the other ' + esc(plural(fileOthers.length, 'sale')) + ' made together (' + esc(fileOthers.map((x) => x.sale_number).join(', ')) + ')</span></label>' : '') +
      '<button type="button" class="btn secondary" id="file-save">Upload file</button></div>' : ''));

  const tl = res.timeline || [];
  body += section('History', tl.length ? '<ul class="sm-tl">' + tl.map((h) => '<li class="' + tlClass(h.action) + '"><div class="sm-tl-head"><b>' + esc(h.action) + '</b> <span class="muted">· ' + esc(h.by || 'System') + (h.role ? ' (' + esc(h.role) + ')' : '') + ' · ' + esc(fmtShortDateTime(h.at)) + '</span></div>' +
    (h.reason ? '<div class="sm-tl-text">' + esc(h.reason) + '</div>' : '') + '</li>').join('') + '</ul>' : '<p class="muted">No history recorded.</p>');

  const mine = res.sale.created_by_name && ctx.access.me.name === res.sale.created_by_name;
  const manyPending = pendingLegs.length > 1 && s.status === 'PENDING_APPROVAL', manyConfirmed = confirmedLegs.length > 1 && conf;
  const footer = (s.status === 'PENDING_APPROVAL' && ctx.can.approve_sale ? '<button type="button" class="btn" data-act="approve">Approve</button>' + (manyPending ? '<button type="button" class="btn" data-act="approve-all">Approve all ' + pendingLegs.length + '</button>' : '') +
      '<button type="button" class="btn secondary" data-act="reject">Reject</button>' + (manyPending ? '<button type="button" class="btn secondary" data-act="reject-all">Reject all ' + pendingLegs.length + '</button>' : '') : '') +
    (s.status === 'PENDING_APPROVAL' && !ctx.can.approve_sale && mine ? '<button type="button" class="btn secondary" data-act="withdraw">Withdraw this</button>' + (manyPending ? '<button type="button" class="btn secondary" data-act="withdraw-all">Withdraw all ' + pendingLegs.length + '</button>' : '') : '') +
    (conf && ctx.can.approve_sale ? '<button type="button" class="btn secondary" data-act="correct">Correct</button><button type="button" class="btn secondary" data-act="reverse">Reverse</button>' + (manyConfirmed ? '<button type="button" class="btn secondary" data-act="reverse-all">Reverse all ' + confirmedLegs.length + '</button>' : '') : '') +
    '<button type="button" class="btn secondary" data-act="close">Close</button>';
  openDrawer('detail', { title: s.sale_number, sub: kindOfSale(s.kind) + ' · ' + s.branch_name + (s.buyer_name ? ' · ' + s.buyer_name : ''), body, footer });
  const bodyEl = document.getElementById('sm-detail-body'), footEl = drawerFooter('detail');
  wireFiles(ctx, bodyEl);
  const reopen = () => { ctx.afterChange(); return openSale(ctx, s.id); };
  bodyEl.querySelectorAll('[data-open-entry]').forEach((b) => b.addEventListener('click', () => ctx.openEntry(b.dataset.openEntry)));
  bodyEl.querySelectorAll('[data-open-group]').forEach((b) => b.addEventListener('click', () => ctx.openGroup(b.dataset.openGroup)));

  // ---- record a payment
  const payBtn = bodyEl.querySelector('#pay-save');
  if (payBtn) {
    const requestId = uuid();
    payBtn.addEventListener('click', async () => {
      const q = (i) => bodyEl.querySelector('#' + i), method = q('pay-method').value, amount = Number(q('pay-amount').value);
      if (!(amount > 0)) { ctx.toast('Enter the amount paid.', true); return; }
      if (NEEDS_REFERENCE.includes(method) && !q('pay-ref').value.trim()) { ctx.toast('Enter the reference number for a ' + method + ' payment.', true); return; }
      payBtn.disabled = true;
      try {
        const by = q('pay-by').value, asBatch = payAsBatch && !!q('pay-batch') && q('pay-batch').checked;
        const pay = { requestId, amount, method, reference: q('pay-ref').value.trim(), paidAt: q('pay-date').value, receivedBy: by || null,
          receivedByName: by ? ((opts.people || []).find((p) => p.id === by) || {}).name : null, notes: q('pay-notes').value.trim() };
        const r = asBatch ? await ctx.api.batchPaymentAdd({ ...pay, batchId: bt.id }) : await ctx.api.paymentAdd({ ...pay, saleId: s.id });
        if (r && r.ok === false) throw new Error(r.message);
        ctx.toast(asBatch ? 'Payment of ' + money(amount) + ' recorded across ' + plural((r.sales || owingLegs).length, 'sale') + '.' + (r.balance > 0 ? ' ' + money(r.balance) + ' still owed by the batch.' : ' The whole batch is paid.')
          : 'Payment recorded.' + (r.balance > 0 ? ' ' + money(r.balance) + ' still owed.' : r.balance === 0 ? ' The sale is fully paid.' : '')); await reopen();
      } catch (err) { ctx.toast(err, true); payBtn.disabled = false; }
    });
    const pb = bodyEl.querySelector('#pay-batch');
    if (pb) pb.addEventListener('change', () => { bodyEl.querySelector('#pay-amount').value = pb.checked ? batchBalance : s.balance; });
  }
  bodyEl.querySelectorAll('[data-open-sale]').forEach((b) => b.addEventListener('click', () => openSale(ctx, Number(b.dataset.openSale))));
  bodyEl.querySelectorAll('[data-void-batch]').forEach((b) => b.addEventListener('click', () => actionPanel('detail', {
    title: 'Void this payment in every sale it covers?', message: 'This payment was shared over the sales made together (' + esc(legs.map((x) => x.sale_number).join(', ')) + '). Voiding it voids each sale\'s part of it. The payment stays in the history (marked voided) and no longer counts toward what the buyer paid. Say why.',
    fields: '<textarea id="act-reason" rows="2" placeholder="Reason (required)"></textarea>', okLabel: 'Void the whole payment', danger: true,
    onOk: async () => { const reason = document.getElementById('act-reason').value.trim(); if (reason.length < 5) throw new Error('Give the reason (at least a few words).'); const r = await ctx.api.batchPaymentVoid(b.dataset.voidBatch, reason); if (r && r.ok === false) throw new Error(r.message); ctx.toast('Payment voided in ' + plural(r.voided || 1, 'sale') + '.'); await reopen(); },
  })));
  bodyEl.querySelectorAll('[data-void-payment]').forEach((b) => b.addEventListener('click', () => actionPanel('detail', {
    title: 'Void this payment?', message: 'The payment stays in the history (marked voided) and no longer counts toward what the buyer paid. Say why.', fields: '<textarea id="act-reason" rows="2" placeholder="Reason (required)"></textarea>', okLabel: 'Void payment', danger: true,
    onOk: async () => { const reason = document.getElementById('act-reason').value.trim(); if (reason.length < 5) throw new Error('Give the reason (at least a few words).'); const r = await ctx.api.paymentVoid(Number(b.dataset.voidPayment), reason); if (r && r.ok === false) throw new Error(r.message); ctx.toast('Payment voided.'); await reopen(); },
  })));
  // ---- attach a file
  const fileBtn = bodyEl.querySelector('#file-save');
  if (fileBtn) fileBtn.addEventListener('click', async () => {
    const input = bodyEl.querySelector('#file-input'), file = input.files && input.files[0];
    if (!file) { ctx.toast('Choose a file first.', true); return; }
    fileBtn.disabled = true;
    try {
      const up = await ctx.api.uploadSaleFile(s.id, file);
      const payId = bodyEl.querySelector('#file-pay') ? bodyEl.querySelector('#file-pay').value : '';
      const type = bodyEl.querySelector('#file-type').value;
      const r = await ctx.api.fileAttach({ saleId: s.id, paymentId: payId ? Number(payId) : null, type, name: up.name, path: up.path, contentType: up.contentType, size: up.size });
      if (r && r.ok === false) throw new Error(r.message);
      const both = !!bodyEl.querySelector('#file-batch') && bodyEl.querySelector('#file-batch').checked;
      if (both) {
        for (const o of fileOthers) {       // the same file goes into each sale's own folder (a sale only ever reads its own files)
          try { const up2 = await ctx.api.uploadSaleFile(o.id, file); const r2 = await ctx.api.fileAttach({ saleId: o.id, paymentId: null, type, name: up2.name, path: up2.path, contentType: up2.contentType, size: up2.size }); if (r2 && r2.ok === false) throw new Error(r2.message); }
          catch (err) { throw new Error(o.sale_number + ': ' + friendly(err) + ' (the file is attached to ' + s.sale_number + ' and the sales before it).'); }
        }
      }
      ctx.toast(both ? 'File attached to ' + plural(fileOthers.length + 1, 'sale') + '.' : 'File attached.'); await reopen();
    } catch (err) { ctx.toast(err, true); fileBtn.disabled = false; }
  });

  // ---- the decisions
  footEl.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
    const act = b.dataset.act;
    if (act === 'close') return closeDrawer('detail');
    if (act === 'approve') return actionPanel('detail', {
      title: 'Approve ' + esc(s.sale_number) + '?', message: 'This takes ' + esc(grams(s.total_grams)) + ' out of the branch' + (isSale ? ' and records the sale to ' + esc(s.buyer_name || 'the buyer') + (v ? ' for ' + esc(money(s.total_amount)) : '') : ' and records the disposal') + '. Check the weighing slip first.',
      fields: '<textarea id="act-note" rows="2" placeholder="Note (optional)"></textarea>', okLabel: 'Approve', onOk: async () => { const r = await ctx.api.saleApprove(s.id, document.getElementById('act-note').value.trim()); if (r && r.ok === false) throw new Error(r.message); ctx.toast(s.sale_number + ' approved.'); await reopen(); },
    });
    if (act === 'reject' || act === 'withdraw') return actionPanel('detail', {
      title: (act === 'withdraw' ? 'Withdraw ' : 'Reject ') + esc(s.sale_number) + '?', message: 'The grams held back for it are free again.', fields: '<textarea id="act-reason" rows="2" placeholder="' + (act === 'withdraw' ? 'Reason (optional)' : 'Reason (required)') + '"></textarea>', okLabel: act === 'withdraw' ? 'Withdraw' : 'Reject', danger: true,
      onOk: async () => { const reason = document.getElementById('act-reason').value.trim(); if (act === 'reject' && reason.length < 3) throw new Error('Say why you are rejecting it.'); const r = await ctx.api.saleReject(s.id, reason); if (r && r.ok === false) throw new Error(r.message); ctx.toast(s.sale_number + (act === 'withdraw' ? ' withdrawn.' : ' rejected.')); await reopen(); },
    });
    if (act === 'reverse') return actionPanel('detail', {
      title: 'Reverse ' + esc(s.sale_number) + '?', message: 'The scrap goes back to the branch\'s available scrap and the entry written in the POS is removed. The sale, its payments and this history are kept. ' + (activePays.length ? '<b>Void its ' + plural(activePays.length, 'payment') + ' first.</b> ' : '') + 'If only a price or a name was wrong, use Correct instead.',
      fields: '<textarea id="act-reason" rows="2" placeholder="Reason (required)"></textarea>', okLabel: 'Reverse sale', danger: true,
      onOk: async () => { const reason = document.getElementById('act-reason').value.trim(); if (reason.length < 5) throw new Error('Give the reason (at least a few words).'); const r = await ctx.api.saleReverse(s.id, reason); if (r && r.ok === false) throw new Error(r.message); ctx.toast(s.sale_number + ' reversed.'); await reopen(); },
    });
    if (act === 'correct') return correctPanel(ctx, res, opts, reopen);
    // ---- all the sales made together
    if (act === 'approve-all') return actionPanel('detail', {
      title: 'Approve all ' + pendingLegs.length + ' ' + nouns + '?', message: 'This takes the scrap out of each branch and records the ' + nouns + ' (' + esc(pendingLegs.map((x) => x.sale_number).join(', ')) + '). If one of them cannot be approved, none is. Check the weighing slip first.',
      fields: '<textarea id="act-note" rows="2" placeholder="Note (optional)"></textarea>', okLabel: 'Approve all ' + pendingLegs.length,
      onOk: async () => { const r = await ctx.api.batchApprove(bt.id, document.getElementById('act-note').value.trim()); if (r && r.ok === false) throw new Error(r.message); ctx.toast(plural(r.approved || pendingLegs.length, noun) + ' approved.'); await reopen(); },
    });
    if (act === 'reject-all' || act === 'withdraw-all') return actionPanel('detail', {
      title: (act === 'withdraw-all' ? 'Withdraw all ' : 'Reject all ') + pendingLegs.length + ' ' + nouns + '?', message: 'The grams held back for them (' + esc(pendingLegs.map((x) => x.sale_number).join(', ')) + ') are free again.',
      fields: '<textarea id="act-reason" rows="2" placeholder="' + (act === 'withdraw-all' ? 'Reason (optional)' : 'Reason (required)') + '"></textarea>', okLabel: act === 'withdraw-all' ? 'Withdraw all' : 'Reject all', danger: true,
      onOk: async () => { const reason = document.getElementById('act-reason').value.trim(); if (act === 'reject-all' && reason.length < 3) throw new Error('Say why you are rejecting them.'); const r = await ctx.api.batchReject(bt.id, reason); if (r && r.ok === false) throw new Error(r.message); ctx.toast(plural(r.rejected || pendingLegs.length, noun) + (act === 'withdraw-all' ? ' withdrawn.' : ' rejected.')); await reopen(); },
    });
    if (act === 'reverse-all') return actionPanel('detail', {
      title: 'Reverse all ' + confirmedLegs.length + ' ' + nouns + '?', message: 'The scrap goes back to each branch\'s available scrap and the entries written in the POS are removed (' + esc(confirmedLegs.map((x) => x.sale_number).join(', ')) + '). The ' + nouns + (isSale ? ', their payments' : '') + ' and the history are kept. ' +
        (confirmedLegs.some((x) => Number(x.paid) > 0.005) ? '<b>Void the payments first.</b> ' : '') + (isSale ? 'If only a price or a name was wrong, use Correct on each sale instead.' : 'If only the reason, method, date or a note was wrong, use Correct on each disposal instead.'),
      fields: '<textarea id="act-reason" rows="2" placeholder="Reason (required)"></textarea>', okLabel: 'Reverse all ' + confirmedLegs.length, danger: true,
      onOk: async () => { const reason = document.getElementById('act-reason').value.trim(); if (reason.length < 5) throw new Error('Give the reason (at least a few words).'); const r = await ctx.api.batchReverse(bt.id, reason); if (r && r.ok === false) throw new Error(r.message); ctx.toast(plural(r.reversed || confirmedLegs.length, noun) + ' reversed.'); await reopen(); },
    });
  }));
}

/** Correct the price, buyer, date, reference or notes of a confirmed sale. A change of GRAMS is a reversal plus a new sale, so the grams cannot be edited here. */
function correctPanel(ctx, res, opts, reopen) {
  const s = res.sale, items = res.items || [], isSale = s.kind === 'SALE', v = ctx.value;
  const fields = '<div class="sm-grid">' +
    (isSale ? '<div class="field"><label for="cr-buyer">Buyer</label><select id="cr-buyer">' + (opts.buyers || []).map((b) => '<option value="' + esc(b.id) + '"' + (b.id === s.buyer_id ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('') + '</select></div>' : '') +
    '<div class="field"><label for="cr-date">Date</label><input id="cr-date" type="date" value="' + esc(String(s.sale_date).slice(0, 10)) + '" max="' + esc(manilaToday()) + '"></div>' +
    (isSale ? '<div class="field"><label for="cr-ref">Reference / slip no.</label><input id="cr-ref" type="text" value="' + esc(s.reference_number || '') + '"></div><div class="field"><label for="cr-rep">Collected by (buyer\'s person)</label><input id="cr-rep" type="text" value="' + esc(s.buyer_representative || '') + '"></div>' :
      '<div class="field"><label for="cr-dreason">Reason</label><select id="cr-dreason">' + [...new Set([s.reason, ...DISPOSAL_REASONS])].filter(Boolean).map((r) => '<option' + (r === s.reason ? ' selected' : '') + '>' + esc(r) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="cr-dmethod">Method</label><select id="cr-dmethod"><option value="">—</option>' + [...new Set([s.disposal_method, ...DISPOSAL_METHODS])].filter(Boolean).map((r) => '<option' + (r === s.disposal_method ? ' selected' : '') + '>' + esc(r) + '</option>').join('') + '</select></div>') +
    '<div class="field"><label for="cr-notes">Notes</label><input id="cr-notes" type="text" value="' + esc(s.notes || '') + '"></div></div>' +
    (isSale && v && s.pricing_method === 'PER_GRAM' ? '<h4 class="sm-h4">Rate per gram</h4><div class="sm-grid">' + items.map((i) => '<div class="field"><label for="cr-rate-' + esc(i.id) + '">' + esc([i.metal_type, i.karat].filter(Boolean).join(' ')) + ' · ' + esc(num(i.grams)) + ' g</label><input id="cr-rate-' + esc(i.id) + '" type="number" min="0" step="0.01" value="' + esc(i.rate_per_gram) + '" data-rate-item="' + esc(i.id) + '" data-old="' + esc(i.rate_per_gram) + '"></div>').join('') + '</div>' : '') +
    (isSale && v && s.pricing_method === 'FLAT' ? '<div class="field"><label for="cr-flat">Flat total (₱)</label><input id="cr-flat" type="number" min="0" step="0.01" value="' + esc(s.total_amount) + '"></div>' : '') +
    '<div class="field"><label for="cr-reason">Why is it being corrected? *</label><textarea id="cr-reason" rows="2" placeholder="Reason (required)"></textarea></div>';
  actionPanel('detail', {
    title: 'Correct ' + esc(s.sale_number), message: 'Change what was entered wrong. The old and the new values are both kept in the history. The grams cannot be changed here — to change them, reverse this sale and enter a new one.',
    fields, okLabel: 'Save correction',
    onOk: async () => {
      const q = (i) => document.getElementById(i), patch = {};
      if (isSale) {
        if (Number(q('cr-buyer').value) !== s.buyer_id) patch.buyer_id = Number(q('cr-buyer').value);
        if (q('cr-ref').value.trim() !== (s.reference_number || '')) patch.reference_number = q('cr-ref').value.trim();
        if (q('cr-rep').value.trim() !== (s.buyer_representative || '')) patch.buyer_representative = q('cr-rep').value.trim();
        const rates = {}; let changed = false;
        document.querySelectorAll('[data-rate-item]').forEach((inp) => { rates[inp.dataset.rateItem] = Number(inp.value); if (Number(inp.value) !== Number(inp.dataset.old)) changed = true; });
        if (changed) patch.rates = rates;
        if (q('cr-flat') && Number(q('cr-flat').value) !== Number(s.total_amount)) patch.flat_total = Number(q('cr-flat').value);
      } else {
        if (q('cr-dreason').value !== (s.reason || '')) patch.reason = q('cr-dreason').value;
        if (q('cr-dmethod').value !== (s.disposal_method || '')) patch.disposal_method = q('cr-dmethod').value;
      }
      if (q('cr-date').value && q('cr-date').value !== String(s.sale_date).slice(0, 10)) patch.sale_date = q('cr-date').value;
      if (q('cr-notes').value.trim() !== (s.notes || '')) patch.notes = q('cr-notes').value.trim();
      const reason = q('cr-reason').value.trim();
      if (!Object.keys(patch).length) throw new Error('Nothing was changed.');
      if (reason.length < 5) throw new Error('Give the reason (at least a few words).');
      const r = await ctx.api.saleCorrect(s.id, patch, reason); if (r && r.ok === false) throw new Error(r.message);
      ctx.toast(s.sale_number + ' corrected.'); await reopen();
    },
  });
}
