// Scrap Monitoring page -- Reports and the Audit Log. Twelve reports, each built from the same scrap_* database functions the other tabs use, so a figure here always agrees with the tab it came
// from. A report is only a list of columns plus a function that fetches rows; the filter bar, the table, the totals and the CSV / Excel / PDF downloads are shared. Money columns are dropped for
// people without scrap_monitor.view_value (the database already sends them blank), downloads need scrap_monitor.export_reports, and the ledger / audit need scrap_monitor.view_reports.
import { esc, num, money, fmtDate, fmtDateTime, manilaToday, monthStart, daysAgo, plural, debounce, TX_LABELS, SALE_STATUS, PAY_STATUS, KINDS, STATUS, MARKS, kindOfSale, scrapId, friendly } from './smFormat.js?v=20261025b';
import { emptyBox } from './smUi.js?v=20261025b';
import { renderList } from './smList.js?v=20261025b';
import { exportCsv, exportXlsx, exportPdf } from './leaveExport.js?v=20261025b';

const PAGE = 500;          // rows asked for per call when a report is gathered from several calls
const CAP = 10000;         // the most rows one report gathers (a note says so if that is reached)
const LEDGER_PAGE = 100;   // rows per screen in the ledger (a download gets everything)

const must = (res) => { if (!res || res.ok === false) throw new Error((res && res.message) || 'The report could not be loaded.'); return res; };
const n = (x) => (x === null || x === undefined || x === '' ? null : Number(x));
const r3 = (x) => Math.round((Number(x) + Number.EPSILON) * 1000) / 1000;
const C = (key, label, type, extra) => Object.assign({ key, label, type: type || 'text' }, extra || {});
const dayDiff = (a, b) => { const p = (s) => String(s).slice(0, 10).split('-').map(Number); return Math.round((Date.UTC(...[p(b)[0], p(b)[1] - 1, p(b)[2]]) - Date.UTC(...[p(a)[0], p(a)[1] - 1, p(a)[2]])) / 86400000); };

/** Gathers every row of a paged database call (up to CAP). `fn(limit, offset)` returns { rows, total }. */
async function fetchAll(fn) {
  const out = [];
  let total = Infinity, off = 0;
  while (off < total && out.length < CAP) {
    const res = must(await fn(PAGE, off));
    const rows = res.rows || [];
    out.push(...rows);
    total = res.total === undefined || res.total === null ? rows.length : Number(res.total);
    if (!rows.length) break;
    off += PAGE;
  }
  return { rows: out, total: Number.isFinite(total) ? total : out.length, truncated: out.length < (Number.isFinite(total) ? total : out.length) };
}

// ---------------------------------------------------------------- dates
const PRESETS = [['month', 'This month'], ['30', 'Last 30 days'], ['year', 'This year'], ['all', 'All time']];
const presetRange = (p) => { const t = manilaToday(); return p === 'month' ? [monthStart(t), t] : p === '30' ? [daysAgo(30, t), t] : p === 'year' ? [t.slice(0, 4) + '-01-01', t] : ['', '']; };

// ---------------------------------------------------------------- the reports
const LEDGER_COLS = [C('at', 'When'), C('tx', 'Movement'), C('scrap', 'Scrap ID'), C('sale_number', 'Sale no.'), C('branch_name', 'Branch'), C('metal', 'Metal'), C('karat', 'Purity'),
  C('before_g', 'Before (g)', 'number'), C('change_g', 'Change (g)', 'number', { signed: true }), C('after_g', 'After (g)', 'number'), C('by', 'By'), C('ref', 'Buyer / reason / customer')];
const ledgerFilters = (f) => ({ branch_id: f.branch, tx_type: f.tx_type, date_from: f.from, date_to: f.to, karat: f.karat, q: f.q, entry_id: f.entry_id, sale_id: f.sale_id });
const ledgerRow = (r) => ({ entry_id: r.entry_id, sale_id: r.sale_id, at: fmtDateTime(r.at), tx: TX_LABELS[r.tx_type] || r.tx_type, scrap: r.entry_id ? scrapId(r.entry_id) : '', sale_number: r.sale_number || '', branch_name: r.branch_name,
  metal: r.metal_type || '', karat: r.karat || '', before_g: n(r.before_g), change_g: n(r.change_g), after_g: n(r.after_g), by: r.by || '', ref: r.ref || '' });

const openRecord = (c, row) => { if (row.sale_id) c.openSale(Number(row.sale_id)); else if (row.entry_id) c.openEntry(row.entry_id); };

export const REPORTS = [
  { id: 'entries', label: 'All scrap records', desc: 'Every scrap record of the branches you can see — bought, transferred in or out, and released — exactly as the branch POS holds it.',
    use: ['range', 'branch'], rangeLabel: 'Recorded between', defRange: 'month',
    async run(ctx, f) {
      const { rows, truncated, total } = await fetchAll((lim, off) => ctx.api.entriesList({ branch_id: f.branch, date_from: f.from, date_to: f.to }, lim, off, 'newest'));
      return {
        cols: [C('scrap', 'Scrap ID'), C('entry_date', 'Date', 'date'), C('branch_name', 'Branch'), C('type', 'Type'), C('label', 'Item'), C('weight_g', 'Weight (g)', 'number'), C('available_g', 'Available (g)', 'number', { sum: true }),
          C('status', 'Status'), C('source', 'Source'), C('party', 'Customer / buyer / branch'), C('recorded_by', 'Recorded by'), C('sales', 'Sale / disposal'), C('amount', 'Amount', 'money', { v: true })],
        rows: rows.map((r) => ({ id: r.id, entry_id: r.id, scrap: scrapId(r.id), entry_date: r.entry_date, branch_name: r.branch_name, type: (KINDS[r.kind] || {}).long || r.kind, label: r.label || '', weight_g: n(r.weight_g),
          available_g: r.entry_type === 'In' && !r.converted_id ? n(r.available_g) : null, status: (STATUS[r.status] || {}).label || r.status, source: r.source_type || '',
          party: r.kind === 'Bought from Customer' ? (r.customer_name || 'Walk-in') : r.kind === 'Refiner / Other' ? (r.customer_name || r.buyers || '') : (r.counterpart_branch || ''), recorded_by: r.recorded_by || '',
          sales: r.sale_numbers || '', amount: n(r.total_amount) })),
        truncated, total, onRow: openRecord,
      };
    } },

  { id: 'available', label: 'Available scrap', desc: 'Every lot the branches still hold, oldest first — what could be sold or disposed of today.',
    use: ['range', 'branch'], rangeLabel: 'Recorded between', defRange: 'all',
    async run(ctx, f) {
      const { rows, truncated, total } = await fetchAll((lim, off) => ctx.api.available({ branch_id: f.branch, date_from: f.from, date_to: f.to }, lim, off, 'oldest'));
      return {
        cols: [C('scrap', 'Scrap ID'), C('entry_date', 'Recorded', 'date'), C('age_days', 'Days held', 'number', { dp: 0 }), C('branch_name', 'Branch'), C('metal', 'Metal'), C('karat', 'Purity'), C('original_g', 'Bought (g)', 'number', { sum: true }),
          C('available_g', 'Available (g)', 'number', { sum: true }), C('mark', 'Marked as'), C('source', 'From'), C('recorded_by', 'Recorded by')],
        rows: rows.map((r) => ({ entry_id: r.entry_id, scrap: scrapId(r.entry_id), entry_date: r.entry_date, age_days: r.age_days, branch_name: r.branch_name, metal: r.metal_type, karat: r.karat || '', original_g: n(r.original_g),
          available_g: n(r.available_g), mark: MARKS[r.mark] || '', source: r.kind === 'Transferred In' ? 'Transfer in' : (r.customer_name || 'Walk-in'), recorded_by: r.recorded_by || '' })),
        truncated, total, onRow: openRecord,
      };
    } },

  { id: 'branch', label: 'Scrap by branch', desc: 'What each branch holds now, and what it bought and sold in the period.',
    use: ['range', 'branch'], rangeLabel: 'Period', defRange: 'month',
    async run(ctx, f) {
      const res = must(await ctx.api.byBranch(f.from || null, f.to || null));
      const rows = (res.rows || []).filter((b) => !f.branch || String(b.branch_id) === String(f.branch));
      return {
        cols: [C('branch_name', 'Branch'), C('available_g', 'Available now (g)', 'number', { sum: true }), C('lots_open', 'Lots held', 'number', { dp: 0, sum: true }), C('oldest_days', 'Oldest (days)', 'number', { dp: 0 }),
          C('entries', 'Purchases', 'number', { dp: 0, sum: true }), C('purchased_g', 'Bought (g)', 'number', { sum: true }), C('purchase_amount', 'Paid to customers', 'money', { sum: true, v: true }),
          C('sold_g', 'Sold / released (g)', 'number', { sum: true }), C('sold_amount', 'Sold for', 'money', { sum: true, v: true }), C('sales', 'Sales', 'number', { dp: 0, sum: true }),
          C('pending_sales', 'Waiting for approval', 'number', { dp: 0, sum: true }), C('unpaid', 'Buyers still owe', 'money', { sum: true, v: true })],
        rows: rows.map((b) => ({ branch_id: b.branch_id, branch_name: b.branch_name, available_g: n(b.available_g), lots_open: n(b.lots_open), oldest_days: n(b.oldest_days), entries: n(b.entries), purchased_g: n(b.purchased_g),
          purchase_amount: n(b.purchase_amount), sold_g: n(b.sold_g), sold_amount: n(b.sold_amount), sales: n(b.sales), pending_sales: n(b.pending_sales), unpaid: n(b.unpaid) })),
        onRow: (c, row) => c.gotoTab('entries', { branch_id: row.branch_id }),
      };
    } },

  { id: 'purity', label: 'Scrap by metal / purity', desc: 'The same scrap grouped by what it is made of: how much was recorded, how much is still held, and how much was sold at what average rate.',
    use: ['range', 'branch'], rangeLabel: 'Period', defRange: 'all',
    async run(ctx, f) {
      const res = must(await ctx.api.byPurity(f.from || null, f.to || null, f.branch ? Number(f.branch) : null));
      return {
        cols: [C('metal_type', 'Metal'), C('karat', 'Purity'), C('purchases', 'Purchases', 'number', { dp: 0 }), C('recorded_g', 'Recorded (g)', 'number', { sum: true }), C('available_g', 'Available now (g)', 'number', { sum: true }),
          C('sold_g', 'Sold / released (g)', 'number', { sum: true }), C('sold_amount', 'Sold for', 'money', { sum: true, v: true }), C('avg_rate', 'Average ₱ per gram', 'money', { v: true }),
          C('disposed_g', 'Disposed (g)', 'number', { sum: true }), C('transferred_out_g', 'Transferred out (g)', 'number', { sum: true }), C('last_date', 'Last recorded', 'date')],
        rows: (res.rows || []).map((r) => ({ metal_type: r.metal_type, karat: r.karat || '', purchases: n(r.purchases), recorded_g: n(r.recorded_g), available_g: n(r.available_g), sold_g: n(r.sold_g), sold_amount: n(r.sold_amount),
          avg_rate: n(r.avg_rate), disposed_g: n(r.disposed_g), transferred_out_g: n(r.transferred_out_g), last_date: r.last_date || null })),
        onRow: (c, row) => c.gotoTab('entries', { metal: row.metal_type, karat: row.karat }),
      };
    } },

  { id: 'source', label: 'Scrap by source', desc: 'Where the scrap that was bought came from — walk-ins, returning customers, referrals — with how much was paid for it.',
    use: ['range', 'branch'], rangeLabel: 'Bought between', defRange: 'all',
    async run(ctx, f) {
      const res = must(await ctx.api.bySource(f.from || null, f.to || null, f.branch ? Number(f.branch) : null));
      return {
        cols: [C('source', 'Source'), C('entries', 'Purchases', 'number', { dp: 0, sum: true }), C('grams', 'Weight (g)', 'number', { sum: true }), C('amount', 'Paid to customers', 'money', { sum: true, v: true }),
          C('avg_per_gram', 'Average ₱ per gram', 'money', { v: true }), C('first_date', 'First', 'date'), C('last_date', 'Last', 'date')],
        rows: (res.rows || []).map((r) => ({ source: r.source, entries: n(r.entries), grams: n(r.grams), amount: n(r.amount), avg_per_gram: n(r.avg_per_gram), first_date: r.first_date || null, last_date: r.last_date || null })),
      };
    } },

  { id: 'aging', label: 'Scrap aging', desc: 'How long the scrap each branch holds has been sitting, in the age bands management watches. A lot is counted by the date it was recorded.',
    use: ['branch'], defRange: 'all',
    async run(ctx, f) {
      const res = must(await ctx.api.aging(f.branch ? Number(f.branch) : null));
      return {
        cols: [C('branch_name', 'Branch'), C('lots', 'Lots', 'number', { dp: 0, sum: true }), C('grams', 'Available (g)', 'number', { sum: true }), C('oldest_days', 'Oldest (days)', 'number', { dp: 0 }),
          C('d0_7_g', '0–7 days (g)', 'number', { sum: true }), C('d8_30_g', '8–30 days (g)', 'number', { sum: true }), C('d31_60_g', '31–60 days (g)', 'number', { sum: true }),
          C('d61_90_g', '61–90 days (g)', 'number', { sum: true }), C('d90_plus_g', 'Over 90 days (g)', 'number', { sum: true })],
        rows: (res.rows || []).map((r) => ({ branch_id: r.branch_id, branch_name: r.branch_name, lots: n(r.lots), grams: n(r.grams), oldest_days: n(r.oldest_days), d0_7_g: n(r.d0_7_g), d8_30_g: n(r.d8_30_g), d31_60_g: n(r.d31_60_g),
          d61_90_g: n(r.d61_90_g), d90_plus_g: n(r.d90_plus_g) })),
        onRow: (c, row) => c.gotoTab('available', { branch_id: row.branch_id }),
      };
    } },

  { id: 'sales', label: 'Sales and disposals', desc: 'Every sale and disposal in the period: the buyer or reason, the grams, what was paid and who entered and approved it.',
    use: ['range', 'branch', 'kind', 'status'], rangeLabel: 'Dated between', defRange: 'month', totalLabel: 'Total (confirmed only)',
    async run(ctx, f) {
      const { rows, truncated, total } = await fetchAll((lim, off) => ctx.api.salesList({ branch_id: f.branch, kind: f.kind, status: f.status, date_from: f.from, date_to: f.to }, lim, off, 'oldest'));
      const conf = (r) => r.code === 'CONFIRMED';
      return {
        cols: [C('sale_number', 'Number'), C('sale_date', 'Date', 'date'), C('kind', 'Type'), C('branch_name', 'Branch'), C('party', 'Buyer / reason'), C('items_n', 'Lots', 'number', { dp: 0 }),
          C('total_grams', 'Grams', 'number', { sum: true, sumWhere: conf }), C('total_amount', 'Amount', 'money', { sum: true, sumWhere: (r) => conf(r) && r.is_sale, v: true }),
          C('paid', 'Paid', 'money', { sum: true, sumWhere: (r) => conf(r) && r.is_sale, v: true }), C('balance', 'Still owed', 'money', { sum: true, sumWhere: (r) => conf(r) && r.is_sale, v: true }),
          C('payment', 'Payment', 'text', { v: true }), C('status', 'Status'), C('created_by_name', 'Entered by'), C('approved_by_name', 'Approved by')],
        rows: rows.map((r) => ({ id: r.id, sale_id: r.id, code: r.status, is_sale: r.kind === 'SALE', sale_number: r.sale_number, sale_date: r.sale_date, kind: kindOfSale(r.kind), branch_name: r.branch_name,
          party: r.kind === 'SALE' ? (r.buyer_name || '') : [r.reason, r.disposal_method].filter(Boolean).join(' · '), items_n: n(r.items_n), total_grams: n(r.total_grams), total_amount: n(r.total_amount),
          paid: r.kind === 'SALE' ? n(r.paid) : null, balance: r.kind === 'SALE' && r.status === 'CONFIRMED' ? n(r.balance) : null,
          payment: r.kind === 'SALE' && r.status === 'CONFIRMED' ? (PAY_STATUS[r.payment_status] || {}).label || '' : '', status: (SALE_STATUS[r.status] || {}).label || r.status,
          created_by_name: r.created_by_name || '', approved_by_name: r.approved_by_name || '' })),
        truncated, total, onRow: openRecord,
        notes: !f.status ? ['Totals count confirmed sales and disposals only; waiting, rejected and reversed ones are listed but not added up.'] : [],
      };
    } },

  { id: 'buyers', label: 'Sales by buyer', desc: 'What each buyer bought in the period, what they paid, and what they still owe (confirmed sales only).',
    use: ['range', 'branch'], rangeLabel: 'Sold between', defRange: 'all',
    async run(ctx, f) {
      const { rows, truncated, total } = await fetchAll((lim, off) => ctx.api.salesList({ kind: 'SALE', status: 'CONFIRMED', branch_id: f.branch, date_from: f.from, date_to: f.to }, lim, off, 'oldest'));
      const by = new Map();
      rows.forEach((r) => {
        const key = r.buyer_id === null || r.buyer_id === undefined ? 'none' : String(r.buyer_id);
        const g = by.get(key) || { buyer_id: r.buyer_id, buyer: r.buyer_name || 'No buyer named', sales: 0, grams: 0, total: 0, paid: 0, owes: 0, last: '' };
        g.sales += 1; g.grams += Number(r.total_grams) || 0; g.total += Number(r.total_amount) || 0; g.paid += Number(r.paid) || 0; g.owes += Number(r.balance) || 0;
        if (String(r.sale_date) > g.last) g.last = String(r.sale_date).slice(0, 10);
        by.set(key, g);
      });
      const list = [...by.values()].sort((a, b) => b.total - a.total || b.grams - a.grams);
      return {
        cols: [C('buyer', 'Buyer'), C('sales', 'Sales', 'number', { dp: 0, sum: true }), C('grams', 'Grams bought', 'number', { sum: true }), C('total', 'Total', 'money', { sum: true, v: true }), C('paid', 'Paid', 'money', { sum: true, v: true }),
          C('owes', 'Still owes', 'money', { sum: true, v: true }), C('last', 'Last sale', 'date')],
        rows: list.map((g) => ({ buyer_id: g.buyer_id, buyer: g.buyer, sales: g.sales, grams: r3(g.grams), total: Math.round(g.total * 100) / 100, paid: Math.round(g.paid * 100) / 100, owes: Math.round(g.owes * 100) / 100, last: g.last || null })),
        truncated, total,
        onRow: (c, row) => { if (row.buyer_id !== null && row.buyer_id !== undefined) c.gotoTab('sales', { buyer_id: row.buyer_id, status: 'CONFIRMED' }); },
      };
    } },

  { id: 'outstanding', label: 'Outstanding payments', desc: 'Confirmed sales the buyer has not fully paid, biggest balance first, with how many days they have been waiting.',
    use: ['branch'], needsValue: true, defRange: 'all',
    async run(ctx, f) {
      const { rows, truncated, total } = await fetchAll((lim, off) => ctx.api.salesList({ unpaid: 'yes', status: 'CONFIRMED', kind: 'SALE', branch_id: f.branch }, lim, off, 'balance'));
      const today = manilaToday();
      return {
        cols: [C('sale_number', 'Number'), C('sale_date', 'Sold on', 'date'), C('days', 'Days waiting', 'number', { dp: 0 }), C('branch_name', 'Branch'), C('buyer', 'Buyer'), C('total_amount', 'Amount', 'money', { sum: true }),
          C('paid', 'Paid', 'money', { sum: true }), C('balance', 'Still owed', 'money', { sum: true }), C('last_paid', 'Last payment', 'date')],
        rows: rows.map((r) => ({ id: r.id, sale_id: r.id, sale_number: r.sale_number, sale_date: r.sale_date, days: dayDiff(r.sale_date, today), branch_name: r.branch_name, buyer: r.buyer_name || '', total_amount: n(r.total_amount),
          paid: n(r.paid), balance: n(r.balance), last_paid: r.last_paid || null })),
        truncated, total, onRow: openRecord,
      };
    } },

  { id: 'disposed', label: 'Disposed scrap', desc: 'Scrap that was disposed of rather than sold — melted in-house, damaged, returned or written off — with the reason and who approved it.',
    use: ['range', 'branch', 'status'], rangeLabel: 'Disposed between', defRange: 'all',
    async run(ctx, f) {
      const { rows, truncated, total } = await fetchAll((lim, off) => ctx.api.salesList({ kind: 'DISPOSAL', status: f.status, branch_id: f.branch, date_from: f.from, date_to: f.to }, lim, off, 'oldest'));
      const conf = (r) => r.code === 'CONFIRMED';
      return {
        cols: [C('sale_number', 'Number'), C('sale_date', 'Date', 'date'), C('branch_name', 'Branch'), C('reason', 'Reason'), C('method', 'How'), C('items_n', 'Lots', 'number', { dp: 0 }),
          C('total_grams', 'Grams', 'number', { sum: true, sumWhere: conf }), C('status', 'Status'), C('created_by_name', 'Entered by'), C('approved_by_name', 'Approved by')],
        rows: rows.map((r) => ({ id: r.id, sale_id: r.id, code: r.status, sale_number: r.sale_number, sale_date: r.sale_date, branch_name: r.branch_name, reason: r.reason || '', method: r.disposal_method || '', items_n: n(r.items_n),
          total_grams: n(r.total_grams), status: (SALE_STATUS[r.status] || {}).label || r.status, created_by_name: r.created_by_name || '', approved_by_name: r.approved_by_name || '' })),
        truncated, total, onRow: openRecord, totalLabel: 'Total (confirmed only)',
      };
    } },

  { id: 'movement', label: 'Scrap movement', desc: 'Opening + bought + transferred in − sold − disposed − transferred out = closing, for each branch, metal and purity. Weights are as recorded now, so a corrected weight is already inside these figures.',
    use: ['range', 'branch'], rangeLabel: 'Period', defRange: 'month',
    async run(ctx, f) {
      if (!f.from || !f.to) return { message: 'Choose both dates — From and To — to see the movement for that period.' };
      if (f.to < f.from) return { message: 'The From date must not be after the To date.' };
      const res = must(await ctx.api.movement(f.from, f.to, f.branch ? Number(f.branch) : null));
      const rows = (res.rows || []).map((r) => {
        const diff = r3((n(r.opening_g) || 0) + (n(r.purchased_g) || 0) + (n(r.transferred_in_g) || 0) - (n(r.sold_g) || 0) - (n(r.disposed_g) || 0) - (n(r.transferred_out_g) || 0) - (n(r.closing_g) || 0));
        return { branch_id: r.branch_id, branch_name: r.branch_name, metal: r.metal_type, karat: r.karat || '', opening_g: n(r.opening_g), purchased_g: n(r.purchased_g), transferred_in_g: n(r.transferred_in_g), sold_g: n(r.sold_g),
          disposed_g: n(r.disposed_g), transferred_out_g: n(r.transferred_out_g), closing_g: n(r.closing_g), check: Math.abs(diff) < 0.0005 ? 'OK' : 'Off by ' + diff };
      });
      const corr = Number(res.corrections) || 0;
      return {
        cols: [C('branch_name', 'Branch'), C('metal', 'Metal'), C('karat', 'Purity'), C('opening_g', 'Opening (g)', 'number', { sum: true }), C('purchased_g', 'Bought (g)', 'number', { sum: true }),
          C('transferred_in_g', 'Transfer in (g)', 'number', { sum: true }), C('sold_g', 'Sold / released (g)', 'number', { sum: true }), C('disposed_g', 'Disposed (g)', 'number', { sum: true }),
          C('transferred_out_g', 'Transfer out (g)', 'number', { sum: true }), C('closing_g', 'Closing (g)', 'number', { sum: true }), C('check', 'Adds up?')],
        rows,
        notes: corr ? [plural(corr, 'weight correction') + ' ' + (corr === 1 ? 'was' : 'were') + ' made to scrap records in this period. Their effect is already inside these figures; the Scrap ledger and the Audit Log show what changed, who changed it and why.'] : [],
        onRow: (c, row) => c.gotoTab('entries', { branch_id: row.branch_id, metal: row.metal, karat: row.karat }),
      };
    } },

  { id: 'ledger', label: 'Scrap ledger', desc: 'Every movement of scrap in order — recorded, transferred, sold, disposed of, reversed, corrected — with the grams before, the change and the grams after, for each branch, metal and purity.',
    use: ['range', 'branch', 'tx_type', 'karat', 'q'], rangeLabel: 'Moved between', defRange: 'month', paged: true,
    async run(ctx, f, rs) {
      const res = must(await ctx.api.ledger(ledgerFilters(f), LEDGER_PAGE, (rs.page - 1) * LEDGER_PAGE));
      return { cols: LEDGER_COLS, rows: (res.rows || []).map(ledgerRow), total: Number(res.total) || 0, pageSize: LEDGER_PAGE, onRow: openRecord,
        notes: ['“Before” and “After” are the branch’s running total for that metal and purity. A correction shows the change in weight but no running total, because the record’s weight already includes it.'] };
    },
    async exportAll(ctx, f) {
      const { rows } = await fetchAll((lim, off) => ctx.api.ledger(ledgerFilters(f), lim, off));
      return { cols: LEDGER_COLS, rows: rows.map(ledgerRow) };
    } },
];

const initialFilters = (def) => { const [from, to] = presetRange(def.defRange || 'month'); return { from, to, branch: '', kind: '', status: '', tx_type: '', karat: '', q: '', entry_id: '', sale_id: '' }; };
/** Opens the Reports tab on one report (the entry drawer's "View ledger" uses it). */
export function setReport(ctx, kind, patch) {
  const def = REPORTS.find((r) => r.id === kind) || REPORTS[0];
  const f = Object.assign(initialFilters(def), patch || {});
  if (patch && (patch.entry_id || patch.sale_id) && patch.from === undefined) { f.from = ''; f.to = ''; }
  ctx.ui.report = { kind: def.id, f, page: 1, seq: 0 };
}

// ---------------------------------------------------------------- table, totals and downloads
const fmtCell = (c, v) => {
  if (v === null || v === undefined || v === '') return '<span class="muted">—</span>';
  if (c.type === 'number') return esc((c.signed && Number(v) > 0 ? '+' : '') + num(v, c.dp === undefined ? 3 : c.dp));
  if (c.type === 'money') return esc(money(v));
  if (c.type === 'date') return esc(fmtDate(v));
  return esc(v);
};
const isNumeric = (c) => c.type === 'number' || c.type === 'money';
function sumOf(rows, c) {
  const s = rows.reduce((t, r) => t + ((c.sumWhere ? c.sumWhere(r) : true) ? (Number(r[c.key]) || 0) : 0), 0);
  return c.type === 'money' ? Math.round(s * 100) / 100 : r3(s);
}
function totalRow(cols, rows, label) {
  if (!cols.some((c) => c.sum)) return null;
  const t = {}; let named = false;
  cols.forEach((c) => { if (c.sum) t[c.key] = sumOf(rows, c); else if (!named && c.type === 'text') { t[c.key] = label || 'Total'; named = true; } });
  return t;
}
function tableHtml(cols, rows, def, label) {
  const tot = totalRow(cols, rows, label);
  return '<div class="table-scroll table-2col"><table class="sm-table"><thead><tr>' + cols.map((c) => '<th' + (isNumeric(c) ? ' class="sm-num"' : '') + '>' + esc(c.label) + '</th>').join('') + '</tr></thead><tbody>' +
    rows.map((r, i) => '<tr' + (def.onRow ? ' class="sm-clickrow" data-ri="' + i + '"' : '') + '>' + cols.map((c) => '<td data-label="' + esc(c.label) + '"' + (isNumeric(c) ? ' class="sm-num"' : '') + '>' + fmtCell(c, r[c.key]) + '</td>').join('') + '</tr>').join('') + '</tbody>' +
    (tot ? '<tfoot><tr>' + cols.map((c) => '<td data-label="' + esc(c.label) + '"' + (isNumeric(c) ? ' class="sm-num"' : '') + '>' + (c.sum ? fmtCell(c, tot[c.key]) : tot[c.key] !== undefined ? '<b>' + esc(tot[c.key]) + '</b>' : '') + '</td>').join('') + '</tr></tfoot>' : '') + '</table></div>';
}

const exportBarHtml = () => '<div class="sm-btnrow sm-exportbar"><span class="muted sm-small">Download this report:</span><button type="button" class="btn small secondary" data-export="csv">CSV</button>' +
  '<button type="button" class="btn small secondary" data-export="xlsx">Excel</button><button type="button" class="btn small secondary" data-export="pdf">PDF</button></div>';
function wireExport(root, ctx, handler) {
  root.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', async () => {
    const all = root.querySelectorAll('[data-export]'), label = b.textContent;
    all.forEach((x) => { x.disabled = true; }); b.textContent = 'Preparing…';
    try { await handler(b.dataset.export); } catch (err) { ctx.toast(err, true); } finally { all.forEach((x) => { x.disabled = false; }); b.textContent = label; }
  }));
}
/** p = { title, name, cols, rows, subtitle:[lines], about:[{k,v}], totalRow } -- the downloads carry exactly what the screen shows (money columns only for people who may see money). */
async function doExport(ctx, kind, p) {
  const cols = p.cols.filter((c) => !c.v || ctx.value).map((c) => ({ key: c.key, label: c.label, type: c.type }));
  const file = 'Scrap-' + p.name + '-' + manilaToday();
  const fine = p.cols.some((c) => c.type === 'number' && c.dp === undefined && p.rows.some((r) => r[c.key] !== null && r[c.key] !== undefined && Math.abs(r[c.key] * 100 - Math.round(r[c.key] * 100)) > 1e-6));
  if (kind === 'csv') exportCsv(file, cols, p.rows);
  else if (kind === 'xlsx') await exportXlsx(file, p.title, cols, p.rows, p.about);
  else await exportPdf(file, p.title, (p.subtitle || []).concat(fine ? ['Weights are rounded to 2 decimals on this PDF; the CSV and Excel files carry the exact figures.'] : []), cols, p.totalRow ? p.rows.concat([p.totalRow]) : p.rows, 'Kittymae Jewels - Scrap Monitoring');
  ctx.toast('Your ' + ({ csv: 'CSV', xlsx: 'Excel', pdf: 'PDF' })[kind] + ' file was downloaded.');
}
const preparedBy = (ctx) => 'Prepared ' + fmtDateTime(new Date().toISOString()) + ' by ' + ((ctx.access && ctx.access.me && ctx.access.me.name) || '');
function filterLines(ctx, def, f) {
  const out = [], bn = (id) => (ctx.branches.find((b) => String(b.id) === String(id)) || {}).name || id;
  if (def.use.includes('range')) out.push((def.rangeLabel || 'Period') + ': ' + (f.from || f.to ? (f.from ? fmtDate(f.from) : 'the start') + ' to ' + (f.to ? fmtDate(f.to) : 'today') : 'all time'));
  if (def.use.includes('branch')) out.push('Branch: ' + (f.branch ? bn(f.branch) : ctx.branches.length > 1 ? 'all branches you can see' : (ctx.branches[0] || {}).name || ''));
  if (f.kind) out.push('Type: ' + kindOfSale(f.kind));
  if (f.status) out.push('Status: ' + ((SALE_STATUS[f.status] || {}).label || f.status));
  if (f.tx_type) out.push('Movement: ' + (TX_LABELS[f.tx_type] || f.tx_type));
  if (f.karat) out.push('Purity: ' + f.karat);
  if (f.q) out.push('Search: ' + f.q);
  if (f.entry_id) out.push('Scrap ID: #' + f.entry_id);
  return out;
}
const aboutRows = (def, lines, count, ctx) => [{ k: 'Report', v: def.label }, { k: 'About', v: def.desc || '' }].concat(lines.map((l) => { const i = l.indexOf(': '); return { k: l.slice(0, i), v: l.slice(i + 2) }; }),
  [{ k: 'Rows', v: String(count) }, { k: 'Prepared by', v: (ctx.access && ctx.access.me && ctx.access.me.name) || '' }, { k: 'Prepared on', v: fmtDateTime(new Date().toISOString()) }]);

// ---------------------------------------------------------------- the Reports tab
export async function renderReports(ctx, panel) {
  const defs = REPORTS.filter((d) => !d.needsValue || ctx.value);
  if (!ctx.ui.report || !defs.find((d) => d.id === ctx.ui.report.kind)) setReport(ctx, defs[0].id);
  const rs = ctx.ui.report;
  const def = () => defs.find((d) => d.id === rs.kind);
  let last = null;

  function controlsHtml() {
    const d = def(), f = rs.f, has = (t) => d.use.includes(t);
    const sel = (id, label, opts, val, all) => '<div class="field"><label for="smr-' + id + '">' + esc(label) + '</label><select id="smr-' + id + '"><option value="">' + esc(all || 'All') + '</option>' +
      opts.map(([v, l]) => '<option value="' + esc(v) + '"' + (String(val) === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></div>';
    return '<div class="card sm-toolbar"><div class="sm-toolrow">' +
      (has('range') ? '<div class="field"><label for="smr-from">' + esc(d.rangeLabel || 'From') + '</label><input id="smr-from" type="date" value="' + esc(f.from) + '"></div><div class="field"><label for="smr-to">to</label><input id="smr-to" type="date" value="' + esc(f.to) + '"></div>' +
        '<div class="field"><label>&nbsp;</label><div class="sm-btnrow">' + PRESETS.map(([k, l]) => '<button type="button" class="btn small secondary" data-preset="' + k + '">' + esc(l) + '</button>').join('') + '</div></div>' : '') +
      (has('branch') && ctx.branches.length > 1 ? sel('branch', 'Branch', ctx.branches.map((b) => [b.id, b.name]), f.branch, 'All branches') : '') +
      (has('kind') ? sel('kind', 'Sale or disposal', [['SALE', 'Sales'], ['DISPOSAL', 'Disposals']], f.kind) : '') +
      (has('status') ? sel('status', 'Status', Object.entries(SALE_STATUS).map(([k, x]) => [k, x.label]), f.status) : '') +
      (has('tx_type') ? sel('tx_type', 'Movement', Object.entries(TX_LABELS), f.tx_type) : '') +
      (has('karat') ? sel('karat', 'Purity', (ctx.refs.karats || []).map((k) => [k, k]), f.karat) : '') +
      (has('q') ? '<div class="field sm-grow"><label for="smr-q">Search</label><input id="smr-q" type="search" value="' + esc(f.q) + '" placeholder="Scrap ID, sale number, person…"></div>' : '') +
      '<div class="field"><label>&nbsp;</label><button type="button" class="btn small secondary" id="smr-reload">↻ Refresh</button></div></div>' +
      (f.entry_id || f.sale_id ? '<div class="active-filters"><span class="active-filters-label">Only:</span><span class="filter-chip">' + (f.entry_id ? 'Scrap ID <b>#' + esc(f.entry_id) + '</b>' : 'Sale <b>' + esc(f.sale_id) + '</b>') + '</span> <button type="button" class="act-link" data-clear-ctx>Show everything</button></div>' : '') + '</div>';
  }

  function paintShell() {
    const d = def();
    panel.innerHTML = '<p class="sm-tabhint muted">Choose a report, set the filters, then download it if you need a copy. Every report is worked out live from the branches\' own scrap records.</p>' +
      '<div class="sm-reportpick" role="group" aria-label="Choose a report">' + defs.map((x) => '<button type="button" class="btn small' + (x.id === d.id ? '' : ' secondary') + '" data-rep="' + esc(x.id) + '" aria-pressed="' + (x.id === d.id) + '">' + esc(x.label) + '</button>').join('') + '</div>' +
      '<p class="muted sm-small" style="margin:0 0 10px;">' + esc(d.desc) + '</p>' + controlsHtml() + '<div id="smr-out"></div>';
    wireShell();
  }
  function wireShell() {
    const d = def(), f = rs.f, $ = (id) => panel.querySelector('#' + id);
    panel.querySelectorAll('[data-rep]').forEach((b) => b.addEventListener('click', () => { setReport(ctx, b.dataset.rep, { branch: rs.f.branch }); renderReports(ctx, panel); }));
    const bind = (id, key, ev) => { const el = $('smr-' + id); if (el) el.addEventListener(ev || 'change', () => { f[key] = el.value; rs.page = 1; run(); }); };
    bind('from', 'from'); bind('to', 'to'); bind('branch', 'branch'); bind('kind', 'kind'); bind('status', 'status'); bind('tx_type', 'tx_type'); bind('karat', 'karat');
    const q = $('smr-q'); if (q) q.addEventListener('input', debounce(() => { f.q = q.value.trim(); rs.page = 1; run(); }, 400));
    panel.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => { [f.from, f.to] = presetRange(b.dataset.preset); rs.page = 1; $('smr-from').value = f.from; $('smr-to').value = f.to; run(); }));
    $('smr-reload').addEventListener('click', () => run());
    const clr = panel.querySelector('[data-clear-ctx]'); if (clr) clr.addEventListener('click', () => { f.entry_id = ''; f.sale_id = ''; if (!f.from && !f.to) [f.from, f.to] = presetRange(d.defRange || 'month'); paintShell(); run(); });
  }

  async function run() {
    const d = def(), seq = (rs.seq = (rs.seq || 0) + 1), out = panel.querySelector('#smr-out');
    if (!out) return;
    out.classList.add('sm-loading');
    let res;
    try { res = await d.run(ctx, rs.f, rs); }
    catch (err) { if (seq === rs.seq && panel.contains(out)) { out.classList.remove('sm-loading'); out.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; } return; }
    if (seq !== rs.seq || !panel.contains(out)) return;
    out.classList.remove('sm-loading');
    last = { d, res };
    if (res.message) { out.innerHTML = '<div class="sm-banner sm-banner-info">' + esc(res.message) + '</div>'; return; }
    const cols = res.cols.filter((c) => !c.v || ctx.value), rows = res.rows || [];
    const total = res.pageSize ? res.total : rows.length;
    const pages = res.pageSize ? Math.max(1, Math.ceil(total / res.pageSize)) : 1;
    out.innerHTML = (ctx.can.export_reports && rows.length ? exportBarHtml() : '') +
      '<div class="sm-summary muted">' + (res.pageSize ? (total ? 'Showing <b>' + ((rs.page - 1) * res.pageSize + 1) + '–' + Math.min(total, rs.page * res.pageSize) + '</b> of <b>' + total.toLocaleString('en-PH') + '</b>' : 'Nothing to show')
        : 'Showing <b>' + rows.length.toLocaleString('en-PH') + '</b> ' + (rows.length === 1 ? 'row' : 'rows') + (res.onRow ? ' · click a row to open it' : '')) + '</div>' +
      (res.truncated ? '<div class="sm-banner sm-banner-warn">This report is very long, so only the first ' + rows.length.toLocaleString('en-PH') + ' of ' + Number(res.total).toLocaleString('en-PH') + ' rows are shown. Narrow the dates or choose one branch to see the rest.</div>' : '') +
      (rows.length ? tableHtml(cols, rows, res, res.totalLabel || d.totalLabel) : emptyBox('Nothing matches these filters.')) +
      (res.pageSize && total > res.pageSize ? '<div class="sm-pager"><span class="muted">Page ' + rs.page + ' of ' + pages + '</span><span class="sm-btnrow"><button type="button" class="btn small secondary" data-page="prev"' + (rs.page <= 1 ? ' disabled' : '') + '>← Previous</button>' +
        '<button type="button" class="btn small secondary" data-page="next"' + (rs.page >= pages ? ' disabled' : '') + '>Next →</button></span></div>' : '') +
      (res.notes && res.notes.length ? '<div class="muted sm-small" style="margin-top:8px;">' + res.notes.map((x) => '<div>' + esc(x) + '</div>').join('') + '</div>' : '');
    out.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => { rs.page += b.dataset.page === 'next' ? 1 : -1; run(); out.scrollIntoView({ block: 'start' }); }));
    out.querySelectorAll('tr[data-ri]').forEach((tr) => tr.addEventListener('click', () => res.onRow(ctx, rows[Number(tr.dataset.ri)])));
    wireExport(out, ctx, async (kind) => {
      const data = d.exportAll ? await d.exportAll(ctx, rs.f) : res, dcols = data.cols, drows = data.rows;
      const lines = filterLines(ctx, d, rs.f);
      await doExport(ctx, kind, { title: d.label, name: d.id, cols: dcols, rows: drows, subtitle: [lines.join('  ·  '), preparedBy(ctx)], about: aboutRows(d, lines, drows.length, ctx), totalRow: totalRow(dcols.filter((c) => !c.v || ctx.value), drows, res.totalLabel || d.totalLabel) });
    });
  }

  ctx.reloadList = () => run();
  paintShell();
  await run();
}

// ---------------------------------------------------------------- the Audit Log tab
const KEY_LABELS = { weight_grams: 'Weight (g)', karat: 'Purity', metal_type: 'Metal', status: 'Status', total_amount: 'Amount', total_grams: 'Grams', name: 'Name', active: 'Active', contact_person: 'Contact person',
  contact_number: 'Contact number', reason: 'Reason', buyer_id: 'Buyer', sale_date: 'Date', reference_number: 'Reference', amount: 'Amount', method: 'Method' };
const niceKey = (k) => KEY_LABELS[k] || String(k).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const showVal = (x) => (x === null || x === undefined || x === '' ? '—' : typeof x === 'object' ? JSON.stringify(x) : x === true ? 'yes' : x === false ? 'no' : String(x));
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
/** The plain-words lines for "what changed": the POS's own detail sentence, then each field whose value differs. */
export function changeLines(oldV, newV, detail) {
  const lines = [];
  if (detail) lines.push(String(detail));
  if (isObj(oldV) || isObj(newV)) {
    const keys = [...new Set([...Object.keys(isObj(oldV) ? oldV : {}), ...Object.keys(isObj(newV) ? newV : {})])];
    keys.forEach((k) => {
      const a = isObj(oldV) ? oldV[k] : undefined, b = isObj(newV) ? newV[k] : undefined;
      if (JSON.stringify(a) === JSON.stringify(b)) return;
      if (a === undefined && (b === null || b === '')) return;    // a field that was only ever empty is not news
      lines.push(a !== undefined ? niceKey(k) + ': ' + showVal(a) + ' → ' + showVal(b) : niceKey(k) + ': ' + showVal(b));
    });
  }
  return lines;
}
const whereLabel = (s) => (s === 'POS' ? 'Branch POS' : 'Scrap Monitoring');
const AUDIT_COLS = [C('at', 'When'), C('by', 'Done by'), C('role', 'Role'), C('branch_name', 'Branch'), C('action', 'Action'), C('record', 'Record'), C('changes', 'What changed'), C('reason', 'Reason'), C('source', 'Where')];
const auditExportRow = (r) => ({ at: fmtDateTime(r.at), by: r.by || '', role: r.role || '', branch_name: r.branch_name || '', action: r.action || '', record: r.record || '', changes: changeLines(r.old_value, r.new_value, r.detail).join('; '), reason: r.reason || '', source: whereLabel(r.source) });

export function auditCfg(ctx) {
  const recordCell = (r) => (r.sale_id ? '<button type="button" class="sm-link" data-open-sale="' + esc(r.sale_id) + '">' + esc(r.record || 'Sale') + '</button>'
    : r.entry_id ? '<button type="button" class="sm-link" data-open-entry="' + esc(r.entry_id) + '">' + esc(r.record || scrapId(r.entry_id)) + '</button>' : esc(r.record || '—'));
  return {
    key: 'audit',
    hint: 'Everything done to scrap: what the branches recorded in the POS, and every sale, payment, approval, reversal and correction made here — who did it, when, what changed and why. The log cannot be edited or deleted.',
    fields: [
      { id: 'q', type: 'search', label: 'Search', ph: 'Action, record, person, reason…', grow: true },
      { id: 'date_from', type: 'date', label: 'From' }, { id: 'date_to', type: 'date', label: 'To' },
      { id: 'branch_id', type: 'select', label: 'Branch', options: (c) => c.branches.map((b) => [b.id, b.name]), show: (c) => c.branches.length > 1 },
      { id: 'source', type: 'select', label: 'Where', options: [['ERP', 'Scrap Monitoring'], ['POS', 'Branch POS']] },
      { id: 'actor', type: 'text', label: 'Done by', ph: 'Name', more: true }, { id: 'action', type: 'text', label: 'Action', ph: 'e.g. reversed', more: true },
    ],
    presets: true, pageSize: 100,
    fetch: (f, sort, limit, offset) => ctx.api.audit(f, limit, offset),
    summaryHtml: () => '',
    tableHtml: (rows) => '<div class="table-scroll table-2col"><table class="sm-table"><thead><tr><th>When</th><th>Done by</th><th>Branch</th><th>Action</th><th>Record</th><th>What changed</th><th>Reason</th><th>Where</th></tr></thead><tbody>' +
      rows.map((r) => { const lines = changeLines(r.old_value, r.new_value, r.detail);
        return '<tr><td data-label="When">' + esc(fmtDateTime(r.at)) + '</td><td data-label="Done by"><b>' + esc(r.by || '—') + '</b>' + (r.role ? '<div class="muted sm-small">' + esc(r.role) + '</div>' : '') + '</td>' +
          '<td data-label="Branch">' + esc(r.branch_name || '—') + '</td><td data-label="Action"><b>' + esc(r.action) + '</b></td><td data-label="Record">' + recordCell(r) + '</td>' +
          '<td data-label="What changed" class="sm-wrap">' + (lines.length ? lines.slice(0, 6).map((x) => '<div class="sm-small">' + esc(x) + '</div>').join('') + (lines.length > 6 ? '<div class="muted sm-small">…and ' + (lines.length - 6) + ' more</div>' : '') : '<span class="muted">—</span>') + '</td>' +
          '<td data-label="Reason" class="sm-wrap">' + esc(r.reason || '—') + '</td><td data-label="Where"><span class="badge sm-badge ' + (r.source === 'POS' ? 'sm-kind-tr' : 'sm-kind-in') + '">' + esc(whereLabel(r.source)) + '</span></td></tr>'; }).join('') + '</tbody></table></div>',
    wireRows: (body) => {
      body.querySelectorAll('[data-open-sale]').forEach((b) => b.addEventListener('click', () => ctx.openSale(Number(b.dataset.openSale))));
      body.querySelectorAll('[data-open-entry]').forEach((b) => b.addEventListener('click', () => ctx.openEntry(b.dataset.openEntry)));
    },
    emptyText: (hasFilters) => (hasFilters ? 'Nothing in the log matches these filters.' : 'Nothing has been logged yet.'),
  };
}

export function renderAudit(ctx, panel) {
  const cfg = auditCfg(ctx);
  if (ctx.can.export_reports) {
    cfg.topHtml = () => exportBarHtml();
    cfg.wireTop = (top, c, s) => wireExport(top, c, async (kind) => {
      const f = Object.fromEntries(Object.entries(s.filters).filter(([, v]) => v !== '' && v !== false && v !== null && v !== undefined));
      const { rows, truncated } = await fetchAll((lim, off) => c.api.audit(f, lim, off));
      const lines = [].concat(f.date_from || f.date_to ? ['Dated: ' + (f.date_from ? fmtDate(f.date_from) : 'the start') + ' to ' + (f.date_to ? fmtDate(f.date_to) : 'today')] : ['Dated: all time'],
        f.branch_id ? ['Branch: ' + ((c.branches.find((b) => String(b.id) === String(f.branch_id)) || {}).name || f.branch_id)] : [], f.source ? ['Where: ' + whereLabel(f.source)] : [], f.actor ? ['Done by: ' + f.actor] : [], f.action ? ['Action: ' + f.action] : [], f.q ? ['Search: ' + f.q] : []);
      const out = rows.map(auditExportRow);
      await doExport(c, kind, { title: 'Scrap audit log', name: 'audit-log', cols: AUDIT_COLS, rows: out, subtitle: [lines.join('  ·  '), preparedBy(c)].concat(truncated ? ['Only the first ' + out.length + ' entries are included; narrow the dates to see the rest.'] : []),
        about: [{ k: 'Report', v: 'Scrap audit log' }].concat(lines.map((l) => { const i = l.indexOf(': '); return { k: l.slice(0, i), v: l.slice(i + 2) }; }), [{ k: 'Rows', v: String(out.length) }, { k: 'Prepared by', v: (c.access.me || {}).name || '' }, { k: 'Prepared on', v: fmtDateTime(new Date().toISOString()) }]) });
    });
  }
  return renderList(ctx, panel, cfg);
}
