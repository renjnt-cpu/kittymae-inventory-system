// Scrap Monitoring page -- "By Branch" (one card per branch: what it holds, how old it is, what it sold) and "By Metal / Purity" (the same scrap grouped by what it is made of).
// The business keeps scrap by weight and purity, not by item code, so "metal + purity" is what the spec calls the item / SKU view.
import { esc, grams, num, money, fmtDate, ageBadge, friendly, manilaToday, daysAgo, monthStart, plural } from './smFormat.js?v=20261026b';
import { emptyBox } from './smUi.js?v=20261026b';

function rangeBar(ctx, st, idPrefix, withBranch) {
  return '<div class="card sm-toolbar"><div class="sm-toolrow"><div class="field"><label for="' + idPrefix + '-from">From</label><input id="' + idPrefix + '-from" type="date" value="' + esc(st.from) + '"></div>' +
    '<div class="field"><label for="' + idPrefix + '-to">To</label><input id="' + idPrefix + '-to" type="date" value="' + esc(st.to) + '"></div>' +
    '<div class="field"><label>&nbsp;</label><div class="sm-btnrow"><button type="button" class="btn small secondary" data-range="month">This month</button><button type="button" class="btn small secondary" data-range="30">30 days</button>' +
    '<button type="button" class="btn small secondary" data-range="all">All time</button></div></div>' +
    (withBranch && ctx.branches.length > 1 ? '<div class="field"><label for="' + idPrefix + '-branch">Branch</label><select id="' + idPrefix + '-branch"><option value="">All branches</option>' + ctx.branches.map((b) => '<option value="' + esc(b.id) + '"' + (String(st.branch) === String(b.id) ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('') + '</select></div>' : '') +
    '<div class="field"><label>&nbsp;</label><button type="button" class="btn small secondary" id="' + idPrefix + '-reload">↻ Refresh</button></div></div></div>';
}
function wireRange(panel, st, idPrefix, reload) {
  const $ = (s) => panel.querySelector(s);
  $('#' + idPrefix + '-from').addEventListener('change', (e) => { st.from = e.target.value; reload(); });
  $('#' + idPrefix + '-to').addEventListener('change', (e) => { st.to = e.target.value; reload(); });
  const br = $('#' + idPrefix + '-branch'); if (br) br.addEventListener('change', (e) => { st.branch = e.target.value; reload(); });
  $('#' + idPrefix + '-reload').addEventListener('click', () => reload());
  panel.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => {
    const t = manilaToday(), r = b.dataset.range;
    if (r === 'all') { st.from = ''; st.to = ''; } else { st.to = t; st.from = r === 'month' ? monthStart(t) : daysAgo(Number(r), t); }
    reload();
  }));
}

// ---------------------------------------------------------------- By Branch
export async function renderByBranch(ctx, panel) {
  const st = ctx.ui.byBranch || (ctx.ui.byBranch = { from: monthStart(), to: manilaToday(), showAll: false });
  const v = ctx.value;
  async function paint() {
    panel.innerHTML = '<p class="sm-tabhint muted">What each branch holds right now, how long it has been held, and what it sold in the period you choose. Click a branch to open its scrap.</p>' + rangeBar(ctx, st, 'smb') +
      '<div class="sm-chips"><label class="sm-check"><input type="checkbox" id="smb-all"' + (st.showAll ? ' checked' : '') + '> Show branches that have no scrap</label></div><div id="smb-body"><p class="muted">Loading…</p></div>';
    wireRange(panel, st, 'smb', paint);
    panel.querySelector('#smb-all').addEventListener('change', (e) => { st.showAll = e.target.checked; paint(); });
    const body = panel.querySelector('#smb-body');
    let res;
    try { res = await ctx.api.byBranch(st.from || null, st.to || null); } catch (err) { body.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; return; }
    if (!res || res.ok === false) { body.innerHTML = '<div class="msg error">' + esc((res && res.message) || 'Could not load the branches.') + '</div>'; return; }
    const rows = res.rows.filter((b) => st.showAll || b.entries > 0 || b.available_g > 0 || b.sold_g > 0 || b.pending_sales > 0);
    if (!rows.length) { body.innerHTML = emptyBox('No branch has scrap in this period.'); return; }
    const period = st.from || st.to ? (st.from ? fmtDate(st.from) : 'the start') + ' – ' + (st.to ? fmtDate(st.to) : 'today') : 'all time';
    body.innerHTML = '<div class="sm-bcards">' + rows.map((b) => {
      const karats = Object.entries(b.by_karat || {}).map(([k, g]) => '<span class="sm-chip">' + esc(k) + ' <b>' + esc(num(g)) + ' g</b></span>').join('');
      const empty = !(b.entries > 0 || b.available_g > 0 || b.sold_g > 0);
      return '<div class="sm-bcard' + (empty ? ' sm-bcard-empty' : '') + '"><h4><span>' + esc(b.branch_name) + '</span>' + (b.oldest_days !== null && b.oldest_days !== undefined ? ageBadge(b.oldest_days, ctx.settings.aged_days) : '') + '</h4>' +
        '<div><div class="sm-bcard-big">' + esc(grams(b.available_g)) + '</div><div class="muted sm-small">available now · ' + plural(b.lots_open, 'lot') + (b.oldest_days !== null && b.oldest_days !== undefined ? ' · oldest ' + esc(b.oldest_days) + ' days' : '') + '</div></div>' +
        (karats ? '<div class="sm-chips">' + karats + '</div>' : '') +
        '<dl><dt>Scrap bought (' + esc(period) + ')</dt><dd>' + esc(plural(b.entries, 'entry', 'entries')) + ' · ' + esc(grams(b.purchased_g)) + '</dd>' +
        (v ? '<dt>Paid to customers</dt><dd>' + esc(money(b.purchase_amount)) + '</dd>' : '') +
        '<dt>Sold / released (' + esc(period) + ')</dt><dd>' + esc(grams(b.sold_g)) + (v ? ' · ' + esc(money(b.sold_amount)) : '') + '</dd>' +
        (b.pending_sales > 0 ? '<dt>Waiting for approval</dt><dd><b>' + b.pending_sales + '</b></dd>' : '') + (v && b.unpaid > 0 ? '<dt>Buyers still owe</dt><dd style="color:#c62828;"><b>' + esc(money(b.unpaid)) + '</b></dd>' : '') +
        (b.last_entry ? '<dt>Last purchase</dt><dd>' + esc(fmtDate(b.last_entry)) + '</dd>' : '') + '</dl>' +
        '<div class="sm-btnrow"><button type="button" class="btn small" data-go-tab="entries" data-branch="' + esc(b.branch_id) + '">View scrap</button><button type="button" class="btn small secondary" data-go-tab="available" data-branch="' + esc(b.branch_id) + '">Available</button>' +
        '<button type="button" class="btn small secondary" data-go-tab="sales" data-branch="' + esc(b.branch_id) + '">Sales</button></div></div>';
    }).join('') + '</div>';
    body.querySelectorAll('[data-go-tab]').forEach((b) => b.addEventListener('click', () => ctx.gotoTab(b.dataset.goTab, { branch_id: b.dataset.branch })));
  }
  await paint();
}

// ---------------------------------------------------------------- By Metal / Purity
export async function renderByPurity(ctx, panel) {
  const st = ctx.ui.byPurity || (ctx.ui.byPurity = { from: '', to: '', branch: '', q: '' });
  const v = ctx.value;
  async function paint() {
    panel.innerHTML = '<p class="sm-tabhint muted">The same scrap grouped by what it is made of: how much was bought, how much is still held, how much was sold (and for what), where it is, and when. Click a row to see those records.</p>' +
      rangeBar(ctx, st, 'smp', true) + '<div class="card sm-toolbar"><div class="sm-toolrow"><div class="field sm-grow"><label for="smp-q">Look up a purity</label><input id="smp-q" type="search" value="' + esc(st.q) + '" placeholder="e.g. 18K, 21K, silver"></div></div></div><div id="smp-body"><p class="muted">Loading…</p></div>';
    wireRange(panel, st, 'smp', paint);
    panel.querySelector('#smp-q').addEventListener('input', (e) => { st.q = e.target.value; drawRows(); });
    const body = panel.querySelector('#smp-body');
    let res;
    try { res = await ctx.api.byPurity(st.from || null, st.to || null, st.branch || null); } catch (err) { body.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; return; }
    if (!res || res.ok === false) { body.innerHTML = '<div class="msg error">' + esc((res && res.message) || 'Could not load.') + '</div>'; return; }
    ctx.ui.purityRows = res.rows;
    drawRows();
  }
  function drawRows() {
    const body = panel.querySelector('#smp-body'), q = st.q.trim().toLowerCase();
    const rows = (ctx.ui.purityRows || []).filter((r) => !q || (r.metal_type + ' ' + r.karat).toLowerCase().includes(q));
    if (!rows.length) { body.innerHTML = emptyBox('No metal or purity matches.'); return; }
    const t = rows.reduce((a, r) => ({ rec: a.rec + Number(r.recorded_g), av: a.av + Number(r.available_g), so: a.so + Number(r.sold_g), amt: a.amt + Number(r.sold_amount || 0), di: a.di + Number(r.disposed_g) }), { rec: 0, av: 0, so: 0, amt: 0, di: 0 });
    body.innerHTML = '<div class="table-scroll table-2col"><table class="sm-table"><thead><tr><th>Metal</th><th>Purity</th><th class="sm-num">Bought</th><th class="sm-num">Available</th><th class="sm-num">Sold / released</th>' + (v ? '<th class="sm-num">Sale proceeds</th><th class="sm-num">Avg rate / g</th>' : '') +
      '<th class="sm-num">Disposed</th><th>Held at</th><th>Bought between</th><th>Source</th></tr></thead><tbody>' +
      rows.map((r) => '<tr class="sm-clickrow" data-metal="' + esc(r.metal_type) + '" data-karat="' + esc(r.karat) + '"><td data-label="Metal">' + esc(r.metal_type) + '</td><td data-label="Purity"><button type="button" class="sm-link"><b>' + esc(r.karat || '—') + '</b></button></td>' +
        '<td data-label="Bought" class="sm-num">' + esc(num(r.recorded_g)) + ' g<div class="muted sm-small">' + plural(r.purchases, 'purchase') + '</div></td><td data-label="Available" class="sm-num"><b>' + esc(num(r.available_g)) + ' g</b></td>' +
        '<td data-label="Sold / released" class="sm-num">' + esc(num(r.sold_g)) + ' g</td>' + (v ? '<td data-label="Sale proceeds" class="sm-num">' + esc(money(r.sold_amount)) + '</td><td data-label="Avg rate / g" class="sm-num">' + esc(r.avg_rate === null || r.avg_rate === undefined ? '—' : money(r.avg_rate)) + '</td>' : '') +
        '<td data-label="Disposed" class="sm-num">' + esc(num(r.disposed_g)) + ' g</td><td data-label="Held at" class="sm-wrap">' + esc(r.branches || '—') + '</td>' +
        '<td data-label="Bought between">' + (r.first_date ? esc(fmtDate(r.first_date)) + (r.last_date !== r.first_date ? ' – ' + esc(fmtDate(r.last_date)) : '') : '—') + '</td><td data-label="Source" class="sm-wrap">' + esc(r.sources || '—') + '</td></tr>').join('') + '</tbody>' +
      '<tfoot><tr><td colspan="2">Total</td><td class="sm-num">' + esc(num(t.rec)) + ' g</td><td class="sm-num">' + esc(num(t.av)) + ' g</td><td class="sm-num">' + esc(num(t.so)) + ' g</td>' + (v ? '<td class="sm-num">' + esc(money(t.amt)) + '</td><td></td>' : '') + '<td class="sm-num">' + esc(num(t.di)) + ' g</td><td colspan="3"></td></tr></tfoot></table></div>';
    body.querySelectorAll('.sm-clickrow').forEach((tr) => tr.addEventListener('click', () => ctx.gotoTab('entries', { metal: tr.dataset.metal, karat: tr.dataset.karat, branch_id: st.branch || '', date_from: st.from || '', date_to: st.to || '' })));
  }
  await paint();
}
