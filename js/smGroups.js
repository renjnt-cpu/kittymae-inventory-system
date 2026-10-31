// Scrap Monitoring page -- "By Group". A group is a PENDING FOLDER of scrap (from any branches) made BEFORE the supplier has weighed it: while it waits, its grams are held back (nobody
// else can sell or dispose of them) and nothing leaves a branch. When the supplier's weighing arrives, the group is confirmed here with the supplier's grams and rate for each purity (or one
// flat amount): the database then makes the sales -- one for each branch, linked together -- so one payment, approval, file or reversal covers the whole group.
// What each person sees and may do is decided by the database (the scrap_monitor.* keys, and a group is shown only to someone who can see EVERY branch it touches); the buttons only hide
// what a person could not use.
import { esc, grams as fmtG, money, num, fmtDate, fmtShortDateTime, groupStatusBadge, GROUP_STATUS, saleStatusBadge, manilaToday, friendly, plural, scrapId } from './smFormat.js?v=20261031a';
import { openDrawer, closeDrawer, drawerBody, drawerFooter, kv, actionPanel } from './smUi.js?v=20261031a';
import { renderList } from './smList.js?v=20261031a';
import { acceptedControls, wireAccepted, sameAs, acceptedNote, metalPurity } from './smAccepted.js?v=20261031a';

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const r3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
const RATES_KEY = 'sm-last-rates-v1';       // the same "last rate per purity" hints the sale form keeps
const loadRates = () => { try { return JSON.parse(localStorage.getItem(RATES_KEY) || '{}') || {}; } catch (e) { return {}; } };
const saveRates = (m) => { try { localStorage.setItem(RATES_KEY, JSON.stringify(m)); } catch (e) { /* the form works without it */ } };
const section = (title, html) => '<div class="drawer-section"><h4>' + esc(title) + '</h4>' + html + '</div>';
const tlClass = (a) => /cancel/i.test(a) ? 'sm-tl-bad' : /edited|added|taken out/i.test(a) ? 'sm-tl-warn' : 'sm-tl-good';
const alertDays = (ctx) => Number((ctx.settings || {}).group_alert_days) || 7;
/** a purity as the database groups it: metal + purity upper-cased */
export const purityKey = (p) => String(p.metal_type || '') + '|' + String(p.karat || '').trim().toUpperCase();
export const purityLabel = (p) => [p.metal_type, p.karat].filter(Boolean).join(' ') || 'Scrap';

/**
 * What each branch's sale will be, worked out the way the database does it: the amount of a purity (supplier's grams x rate) is shared over that purity's lots by their grams, the biggest
 * lot taking the odd centavos; a flat total is shared over all the lots by grams. items: [{branch_id, branch_name, metal_type, karat, grams}], weigh: Map(purityKey -> {received, rate}).
 */
export function shareByBranch(items, weigh, method, flat) {
  const amounts = items.map(() => 0);
  const biggest = (ks) => { let big = ks[0]; ks.forEach((k) => { if (Number(items[k].grams) > Number(items[big].grams)) big = k; }); return big; };
  if (method === 'FLAT') {
    const total = r2(flat || 0), totalG = items.reduce((t, i) => t + Number(i.grams), 0), all = items.map((x, k) => k);
    if (total > 0 && totalG > 0 && all.length) { let diff = total; all.forEach((k) => { amounts[k] = r2(total * Number(items[k].grams) / totalG); diff = r2(diff - amounts[k]); }); if (diff !== 0) amounts[biggest(all)] = r2(amounts[biggest(all)] + diff); }
  } else {
    const groups = new Map();
    items.forEach((i, k) => { const g = purityKey(i); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(k); });
    groups.forEach((ks, g) => {
      const w = weigh.get(g); if (!w || !(w.received > 0) || !(w.rate > 0)) return;
      const amt = r2(w.received * w.rate), sent = ks.reduce((t, k) => t + Number(items[k].grams), 0); let diff = amt;
      ks.forEach((k) => { amounts[k] = r2(amt * Number(items[k].grams) / sent); diff = r2(diff - amounts[k]); });
      if (diff !== 0) amounts[biggest(ks)] = r2(amounts[biggest(ks)] + diff);
    });
  }
  const per = new Map();
  items.forEach((i, k) => { const o = per.get(i.branch_id) || { name: i.branch_name, g: 0, amt: 0, n: 0 }; o.g += Number(i.grams); o.amt += amounts[k]; o.n += 1; per.set(i.branch_id, o); });
  return per;
}

// ---------------------------------------------------------------- the list
export function groupsCfg(ctx) {
  const v = ctx.value, days = alertDays(ctx);
  return {
    key: 'groups',
    hint: 'A group is a pending folder for scrap that goes to a supplier to be weighed. While it waits, its grams are held back (nobody else can sell them) and nothing leaves the branches. When the supplier\'s weighing arrives, open the group, enter their grams and rate for each purity and confirm: the sales are made then, one for each branch.',
    fields: [
      { id: 'q', type: 'search', label: 'Search', ph: 'Group number, name, supplier, branch, reference…', grow: true },
      { id: 'date_from', type: 'date', label: 'Sent from' }, { id: 'date_to', type: 'date', label: 'Sent to' },
      { id: 'branch_id', type: 'select', label: 'Branch', allLabel: 'All branches', options: (c) => c.branches.map((b) => [b.id, b.name]), show: (c) => c.branches.length > 1 },
      { id: 'status', type: 'select', label: 'Status', options: Object.entries(GROUP_STATUS).map(([k, x]) => [k, x.label]) },
      { id: 'buyer_id', type: 'select', label: 'Supplier / buyer', options: (c) => (c.refs.buyers || []).map((b) => [b.id, b.name]), more: true },
    ],
    sorts: [['newest', 'Newest first'], ['oldest', 'Oldest first'], ['heaviest', 'Heaviest first'], ['buyer', 'Supplier'], ['status', 'Status']], sort: 'newest', presets: true, pageSize: 50,
    fetch: (f, sort, limit, offset) => ctx.api.groupsList(f, limit, offset, sort),
    summaryHtml: (res) => {
      const s = res.summary || {};
      return '<div class="sm-chips"><span class="sm-chip"><b>' + (s.groups || 0) + '</b> shown</span>' +
        '<span class="sm-chip"><b>' + (s.pending || 0) + '</b> waiting for the supplier' + (s.pending ? ' · <b>' + esc(fmtG(s.pending_g)) + '</b> held back' : '') + '</span>' +
        '<span class="sm-chip"><b>' + (s.confirmed || 0) + '</b> confirmed</span>' + (v && s.amount !== null && s.amount !== undefined ? '<span class="sm-chip">sold for <b>' + esc(money(s.amount)) + '</b></span>' : '') + '</div>';
    },
    tableHtml: (rows) => '<div class="table-scroll table-2col"><table class="sm-table"><thead><tr><th>Group</th><th>Sent on</th><th>Branches</th><th>Supplier / buyer</th><th class="sm-num">Lots</th><th class="sm-num">Grams sent</th><th class="sm-num">Supplier weighed</th>' +
      (v ? '<th class="sm-num">Amount</th>' : '') + '<th>Status</th><th></th></tr></thead><tbody>' +
      rows.map((r) => {
        const late = r.status === 'PENDING' && r.age_days >= days, diff = r.status === 'CONFIRMED' && r.received_grams !== null && r.received_grams !== undefined ? r3(Number(r.received_grams) - Number(r.sent_g)) : null;
        return '<tr data-id="' + esc(r.id) + '" class="' + (late ? 'sm-row-old' : '') + '"><td data-label="Group"><button type="button" class="sm-link" data-open-group="' + esc(r.id) + '"><b>' + esc(r.group_number) + '</b></button>' +
          '<div class="sm-wrap">' + esc(r.title) + '</div></td><td data-label="Sent on">' + esc(fmtDate(r.sent_date)) + '</td><td data-label="Branches" class="sm-wrap">' + esc(r.branch_names || '—') + '</td>' +
          '<td data-label="Supplier / buyer" class="sm-wrap">' + esc(r.buyer_name || '—') + '</td><td data-label="Lots" class="sm-num">' + esc(r.lots_n) + '</td><td data-label="Grams sent" class="sm-num"><b>' + esc(num(r.sent_g)) + ' g</b></td>' +
          '<td data-label="Supplier weighed" class="sm-num">' + (r.status === 'CONFIRMED' && r.received_grams !== null && r.received_grams !== undefined ? '<b>' + esc(num(r.received_grams)) + ' g</b>' + (diff ? '<div class="muted sm-small">' + (diff > 0 ? '+' : '') + esc(num(diff)) + ' g</div>' : '') : '<span class="muted">—</span>') + '</td>' +
          (v ? '<td data-label="Amount" class="sm-num">' + (r.status === 'CONFIRMED' && r.total_amount !== null && r.total_amount !== undefined ? esc(money(r.total_amount)) : '—') + '</td>' : '') +
          '<td data-label="Status">' + groupStatusBadge(r.status) + (late ? '<div class="sm-small" style="color:#c62828;">waiting ' + esc(r.age_days) + ' days</div>' : '') + '</td>' +
          '<td class="full-row"><button type="button" class="btn small' + (r.status === 'PENDING' && ctx.can.sell ? '' : ' secondary') + '" data-open-group="' + esc(r.id) + '">' + (r.status === 'PENDING' && ctx.can.sell ? 'Open · confirm' : 'View') + '</button></td></tr>';
      }).join('') + '</tbody></table></div>',
    wireRows: (body) => body.querySelectorAll('[data-open-group]').forEach((b) => b.addEventListener('click', () => openGroup(ctx, b.dataset.openGroup))),
    emptyText: (hasFilters) => hasFilters ? 'No group matches these filters.' : 'No group yet. Tick lots in Available Scrap and choose "Put in a group…", or use "+ New group" at the top.',
  };
}
export async function renderGroups(ctx, panel) {
  try { await ctx.loadOptions(); } catch (e) { /* the supplier filter just stays empty */ }
  return renderList(ctx, panel, groupsCfg(ctx));
}

// ---------------------------------------------------------------- one group
export async function openGroup(ctx, id) {
  openDrawer('detail', { title: 'Loading…', sub: '', body: '<div id="sm-detail-msg"></div><p class="muted">Loading…</p>', footer: '' });
  let res;
  try { res = await ctx.api.groupDetail(id); } catch (err) { openDrawer('detail', { title: 'Group', sub: '', body: '<div class="msg error">' + esc(friendly(err)) + '</div>', footer: '' }); return; }
  if (!res || res.ok === false) { openDrawer('detail', { title: 'Group', sub: '', body: '<div class="msg error">' + esc((res && res.message) || 'That group could not be opened.') + '</div>', footer: '' }); return; }
  const g = res.group, items = res.items || [], pur = res.by_purity || [], sales = res.sales || [], tl = res.timeline || [], v = !!res.value_visible, can = ctx.can;
  const pending = g.status === 'PENDING', confirmed = g.status === 'CONFIRMED';
  let opts = { buyers: [], people: [] };
  try { opts = await ctx.loadOptions(); } catch (e) { /* the forms still open; the pick-lists are just empty */ }
  const late = pending && g.age_days >= alertDays(ctx);
  const diff = confirmed && g.received_grams !== null && g.received_grams !== undefined ? r3(Number(g.received_grams) - Number(g.sent_g)) : null;

  let body = '<div id="sm-detail-msg"></div><div class="sm-badges">' + groupStatusBadge(g.status) + (late ? '<span class="badge sm-badge sm-st-pending">waiting ' + esc(g.age_days) + ' days</span>' : '') + '</div>';
  if (pending) body += '<div class="sm-banner sm-banner-info">The <b>' + esc(fmtG(g.sent_g)) + '</b> in this group is held back: nobody else can sell it and nothing has left the ' + (g.branch_names && g.branch_names.indexOf(',') > -1 ? 'branches' : 'branch') + '. ' +
    (can.sell ? 'When the supplier\'s weighing arrives, press <b>Weigh &amp; confirm</b>.' : 'Someone who can sell scrap confirms it once the supplier has weighed it.') + '</div>';
  body += section('Details',
    kv('Name', '<b>' + esc(g.title) + '</b>') + kv('Supplier / buyer', g.buyer_name ? '<b>' + esc(g.buyer_name) + '</b>' : '<span class="muted">not decided yet</span>') + kv('Sent', esc(fmtDate(g.sent_date))) +
    kv('Branches', esc(g.branch_names || '—')) + kv('Sent in all', '<b>' + esc(fmtG(g.sent_g)) + '</b> <span class="muted">· ' + esc(plural(g.lots_n, 'lot')) + '</span>') +
    kv('Made by', esc(g.created_by_name || '—') + ' <span class="muted">· ' + esc(fmtShortDateTime(g.created_at)) + '</span>') + (g.notes ? kv('Notes', esc(g.notes)) : '') +
    (confirmed ? kv('Confirmed by', esc(g.confirmed_by_name || '—') + ' <span class="muted">· ' + esc(fmtShortDateTime(g.confirmed_at)) + '</span>') + kv('Sale date', esc(fmtDate(g.sale_date))) +
      (g.received_grams !== null && g.received_grams !== undefined ? kv('Supplier weighed', '<b>' + esc(fmtG(g.received_grams)) + '</b>' + (diff ? ' <span class="muted">· ' + (diff > 0 ? '+' : '') + esc(num(diff)) + ' g compared with what was sent</span>' : '')) : '') +
      (g.reference_number ? kv('Supplier\'s slip / receipt no.', esc(g.reference_number)) : '') + (g.buyer_representative ? kv('Collected by (supplier\'s person)', esc(g.buyer_representative)) : '') +
      (v && g.total_amount !== null && g.total_amount !== undefined ? kv('Total amount', '<b>' + esc(money(g.total_amount)) + '</b> <span class="muted">· ' + (g.pricing_method === 'FLAT' ? 'one flat amount' : 'supplier\'s grams × rate, purity by purity') + '</span>') + (g.paid !== null && g.paid !== undefined ? kv('Paid so far', esc(money(g.paid))) : '') : '') : '') +
    (g.status === 'CANCELLED' ? kv('Cancelled by', esc(g.cancelled_by_name || '—') + ' <span class="muted">· ' + esc(fmtShortDateTime(g.cancelled_at)) + '</span><div class="muted sm-small">' + esc(g.cancel_reason || '') + '</div>') : ''));

  body += section('Scrap in this group (' + plural(items.length, 'lot') + ')', '<div class="table-scroll table-2col"><table class="sm-table"><thead><tr><th>Branch</th><th>Scrap ID</th><th>Bought</th><th>Metal / purity</th><th class="sm-num">Grams</th>' + (pending && can.sell ? '<th></th>' : '') + '</tr></thead><tbody>' +
    items.map((i) => '<tr><td data-label="Branch">' + esc(i.branch_name) + '</td><td data-label="Scrap ID">' + (i.entry_id ? '<button type="button" class="sm-link" data-open-entry="' + esc(i.entry_id) + '"><b>' + esc(scrapId(i.entry_id)) + '</b></button>' : '—') + '</td>' +
      '<td data-label="Bought">' + esc(i.entry_date ? fmtDate(i.entry_date) : '—') + (i.customer_name ? '<div class="muted sm-small">' + esc(i.customer_name) + '</div>' : '') + '</td><td data-label="Metal / purity">' + esc([i.metal_type, i.karat].filter(Boolean).join(' ')) + '</td>' +
      '<td data-label="Grams" class="sm-num"><b>' + esc(num(i.grams)) + ' g</b></td>' + (pending && can.sell ? '<td class="full-row"><button type="button" class="btn small secondary" data-take-out="' + esc(i.line_id) + '" data-take-g="' + esc(i.grams) + '" data-take-name="' + esc(scrapId(i.entry_id)) + '">Take out</button></td>' : '') + '</tr>').join('') + '</tbody>' +
    '<tfoot><tr><td colspan="4">Total sent</td><td class="sm-num">' + esc(num(g.sent_g)) + ' g</td>' + (pending && can.sell ? '<td></td>' : '') + '</tr></tfoot></table></div>');

  if (confirmed && Array.isArray(g.weighings) && g.weighings.length) {
    body += section('The supplier\'s weighing', '<div class="table-scroll table-2col"><table class="sm-table"><thead><tr><th>Purity</th><th class="sm-num">Sent</th><th class="sm-num">Supplier weighed</th><th class="sm-num">Difference</th>' + (v ? '<th class="sm-num">Rate / g</th><th class="sm-num">Amount</th>' : '') + '</tr></thead><tbody>' +
      g.weighings.map((w) => { const d = r3(Number(w.received_g) - Number(w.sent_g));
        return '<tr><td data-label="Purity">' + esc(purityLabel(w)) + acceptedNote(w) + '<div class="muted sm-small">' + esc(plural(w.lots, 'lot')) + '</div></td><td data-label="Sent" class="sm-num">' + esc(num(w.sent_g)) + ' g</td><td data-label="Supplier weighed" class="sm-num"><b>' + esc(num(w.received_g)) + ' g</b></td>' +
          '<td data-label="Difference" class="sm-num">' + (d ? (d > 0 ? '+' : '') + esc(num(d)) + ' g' : 'same') + '</td>' + (v ? '<td data-label="Rate / g" class="sm-num">' + esc(money(w.rate)) + '</td><td data-label="Amount" class="sm-num">' + esc(money(w.amount)) + '</td>' : '') + '</tr>'; }).join('') + '</tbody></table></div>' +
      '<p class="muted sm-small">“Accepted as” is what was entered when the group was confirmed. To change it later, open a branch\'s sale below and use “Change the accepted metal / purity”.</p>');
  } else if (pur.length) {
    body += section('By purity (what was sent)', '<div class="table-scroll table-2col"><table class="sm-table"><thead><tr><th>Purity</th><th class="sm-num">Lots</th><th class="sm-num">Grams sent</th></tr></thead><tbody>' +
      pur.map((p) => '<tr><td data-label="Purity">' + esc(purityLabel(p)) + '</td><td data-label="Lots" class="sm-num">' + esc(p.lots) + '</td><td data-label="Grams sent" class="sm-num"><b>' + esc(num(p.grams)) + ' g</b></td></tr>').join('') + '</tbody></table></div>');
  }

  if (confirmed) {
    body += section('Sales made from this group (' + sales.length + ')', sales.length ? '<div class="table-scroll table-2col"><table class="sm-table"><thead><tr><th>Number</th><th>Branch</th><th>Status</th><th class="sm-num">Grams</th>' + (v ? '<th class="sm-num">Amount</th><th class="sm-num">Paid</th>' : '') + '</tr></thead><tbody>' +
      sales.map((s) => '<tr><td data-label="Number"><button type="button" class="sm-link" data-open-sale="' + esc(s.id) + '"><b>' + esc(s.sale_number) + '</b></button></td><td data-label="Branch">' + esc(s.branch_name) + '</td><td data-label="Status">' + saleStatusBadge(s.status) + '</td>' +
        '<td data-label="Grams" class="sm-num">' + esc(num(s.total_grams)) + ' g</td>' + (v ? '<td data-label="Amount" class="sm-num">' + esc(money(s.total_amount)) + '</td><td data-label="Paid" class="sm-num">' + esc(money(s.paid)) + '</td>' : '') + '</tr>').join('') + '</tbody></table></div>' +
      '<p class="muted sm-small">One sale was made for each branch, because each branch\'s scrap is recorded in its own branch books. Open any of them to record the supplier\'s payment, attach the weighing slip or approve: one step can cover all of them.</p>' : '<p class="muted">No sale found.</p>');
  }

  body += section('History', tl.length ? '<ul class="sm-tl">' + tl.map((h) => '<li class="' + tlClass(h.action) + '"><div class="sm-tl-head"><b>' + esc(h.action) + '</b> <span class="muted">· ' + esc(h.by || 'System') + (h.role ? ' (' + esc(h.role) + ')' : '') + ' · ' + esc(fmtShortDateTime(h.at)) + '</span></div>' +
    (h.reason ? '<div class="sm-tl-text">' + esc(h.reason) + '</div>' : '') + '</li>').join('') + '</ul>' : '<p class="muted">No history recorded.</p>');

  const footer = (pending && can.sell ? '<button type="button" class="btn" data-act="confirm">Weigh &amp; confirm</button><button type="button" class="btn secondary" data-act="add">Add scrap</button>' +
      '<button type="button" class="btn secondary" data-act="edit">Edit details</button><button type="button" class="btn secondary" data-act="cancel">Cancel group</button>' : '') +
    (confirmed && sales.length ? '<button type="button" class="btn" data-act="open-sale">Open ' + esc(sales[0].sale_number) + '</button>' : '') + '<button type="button" class="btn secondary" data-act="close">Close</button>';
  openDrawer('detail', { title: g.group_number, sub: g.title + (g.buyer_name ? ' · ' + g.buyer_name : ''), body, footer });
  const bodyEl = drawerBody('detail'), footEl = drawerFooter('detail');
  const reopen = () => { ctx.afterChange(); return openGroup(ctx, g.id); };
  bodyEl.querySelectorAll('[data-open-entry]').forEach((b) => b.addEventListener('click', () => ctx.openEntry(b.dataset.openEntry)));
  bodyEl.querySelectorAll('[data-open-sale]').forEach((b) => b.addEventListener('click', () => ctx.openSale(Number(b.dataset.openSale))));

  bodyEl.querySelectorAll('[data-take-out]').forEach((b) => b.addEventListener('click', () => actionPanel('detail', {
    title: 'Take ' + esc(b.dataset.takeName) + ' out of ' + esc(g.group_number) + '?', message: esc(num(b.dataset.takeG)) + ' g becomes free again: it is no longer held for this group, so it can be sold, put in another group or disposed of. The group keeps its other lots.',
    okLabel: 'Take it out', danger: true,
    onOk: async () => { const r = await ctx.api.groupRemoveLots(g.id, [Number(b.dataset.takeOut)]); if (r && r.ok === false) throw new Error(r.message); ctx.toast(b.dataset.takeName + ' taken out of the group.'); await reopen(); },
  })));

  footEl.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
    const act = b.dataset.act;
    if (act === 'close') return closeDrawer('detail');
    if (act === 'open-sale') { closeDrawer('detail'); return ctx.openSale(sales[0].id); }
    if (act === 'confirm') return openConfirm(ctx, res, opts, () => { closeDrawer('side'); return reopen(); });
    if (act === 'add') return ctx.openSaleForm({ mode: 'GROUP_ADD', groupId: g.id, groupNumber: g.group_number, excludeLines: items.map((i) => i.line_id).filter(Boolean), onDone: () => openGroup(ctx, g.id) });
    if (act === 'edit') return actionPanel('detail', {
      title: 'Edit ' + esc(g.group_number), message: 'Change the name, the supplier, the date it was sent or the notes. To change which scrap is in the group, use Add scrap or Take out.',
      fields: '<div class="sm-grid"><div class="field"><label for="ge-title">Name *</label><input id="ge-title" type="text" maxlength="80" value="' + esc(g.title) + '"></div>' +
        '<div class="field"><label for="ge-buyer">Supplier / buyer</label><select id="ge-buyer"><option value="">Not decided yet</option>' + (opts.buyers || []).map((x) => '<option value="' + esc(x.id) + '"' + (Number(g.buyer_id) === Number(x.id) ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></div>' +
        '<div class="field"><label for="ge-date">Date sent</label><input id="ge-date" type="date" value="' + esc(String(g.sent_date).slice(0, 10)) + '" max="' + esc(manilaToday()) + '"></div>' +
        '<div class="field"><label for="ge-notes">Notes</label><input id="ge-notes" type="text" value="' + esc(g.notes || '') + '"></div></div>',
      okLabel: 'Save changes',
      onOk: async () => {
        const q = (i) => document.getElementById(i), title = q('ge-title').value.trim();
        if (!title) throw new Error('Give the group a name.');
        const r = await ctx.api.groupUpdate({ id: g.id, title, buyerId: q('ge-buyer').value ? Number(q('ge-buyer').value) : null, sentDate: q('ge-date').value || null, notes: q('ge-notes').value.trim() });
        if (r && r.ok === false) throw new Error(r.message);
        ctx.toast('Group updated.'); await reopen();
      },
    });
    if (act === 'cancel') return actionPanel('detail', {
      title: 'Cancel ' + esc(g.group_number) + '?', message: 'The ' + esc(fmtG(g.sent_g)) + ' held in this group is free again and can be sold or put in another group. The group stays in the list as cancelled, with this reason. Nothing was sold, so nothing else changes.',
      fields: '<textarea id="act-reason" rows="2" placeholder="Reason (required)"></textarea>', okLabel: 'Cancel the group', danger: true,
      onOk: async () => { const reason = document.getElementById('act-reason').value.trim(); if (reason.length < 3) throw new Error('Say why you are cancelling it.'); const r = await ctx.api.groupCancel(g.id, reason); if (r && r.ok === false) throw new Error(r.message); ctx.toast(g.group_number + ' cancelled.'); await reopen(); },
    });
  }));
}

// ---------------------------------------------------------------- the supplier's weighing: confirm the group
function openConfirm(ctx, res, opt, onDone) {
  const g = res.group, items = res.items || [], pur = res.by_purity || [], v = ctx.value, approver = ctx.can.approve_sale, rates = loadRates();
  const st = { requestId: uuid(), buyerId: g.buyer_id || '', date: manilaToday(), method: 'PER_PURITY', flat: '', flatG: '', reference: '', rep: '', releasedBy: ctx.access.me.id, notes: '', busy: false, done: false,
    w: new Map(pur.map((p) => [purityKey(p), { received: String(p.grams), rate: '', acc: { metal_type: p.metal_type, karat: p.karat || '' }, accBad: '' }])) };
  const $ = (id) => document.getElementById(id);
  const okLabel = () => (approver ? 'CONFIRM THE GROUP' : 'SUBMIT FOR APPROVAL');
  const weighOf = (p) => st.w.get(purityKey(p));
  const sentTotal = () => r3(pur.reduce((t, p) => t + Number(p.grams), 0));

  function problems() {
    const p = [];
    if (!st.buyerId) p.push('Choose the supplier or buyer.');
    if (!st.date) p.push('Choose the date.'); else if (st.date > manilaToday()) p.push('The date cannot be in the future.');
    pur.forEach((x) => { const w = weighOf(x); if (w.accBad) p.push(purityLabel(x) + ': ' + w.accBad); });
    if (st.method === 'FLAT') { if (!(Number(st.flat) > 0)) p.push('Enter the total amount the supplier pays.'); }
    else pur.forEach((x) => { const w = weighOf(x); if (!(Number(w.received) > 0)) p.push(purityLabel(x) + ': enter the grams the supplier weighed.'); if (!(Number(w.rate) > 0)) p.push(purityLabel(x) + ': enter the rate per gram.'); });
    return p;
  }

  function fieldsHtml() {
    return '<div class="sm-form-sec"><h4>The supplier</h4><div class="sm-grid">' +
      '<div class="field"><label for="gc-buyer">Supplier / buyer *</label><select id="gc-buyer"><option value="">Choose…</option>' + (opt.buyers || []).map((b) => '<option value="' + esc(b.id) + '"' + (Number(st.buyerId) === Number(b.id) ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('') + '</select>' +
      (ctx.can.manage_buyers || ctx.can.sell ? '<button type="button" class="act-link" id="gc-newbuyer">+ New buyer</button>' : '') + '</div>' +
      '<div class="field"><label for="gc-date">Date of the sale *</label><input id="gc-date" type="date" value="' + esc(st.date) + '" max="' + esc(manilaToday()) + '"></div>' +
      '<div class="field"><label for="gc-method">How is the price worked out? *</label><select id="gc-method"><option value="PER_PURITY">Supplier\'s grams and rate, purity by purity</option><option value="FLAT">One flat amount for the whole group</option></select></div>' +
      '<div class="field"><label for="gc-ref">Supplier\'s slip / receipt no.</label><input id="gc-ref" type="text" value="' + esc(st.reference) + '"></div>' +
      '<div class="field"><label for="gc-rep">Collected by (supplier\'s person)</label><input id="gc-rep" type="text" value="' + esc(st.rep) + '"></div>' +
      '<div class="field"><label for="gc-by">Released by (who handed it over)</label><select id="gc-by"><option value="">—</option>' + (opt.people || []).map((p) => '<option value="' + esc(p.id) + '"' + (p.id === st.releasedBy ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="gc-notes">Notes</label><input id="gc-notes" type="text" value="' + esc(st.notes) + '"></div></div><div id="gc-newbuyer-host"></div></div>';
  }
  function weighHtml() {
    const flat = st.method === 'FLAT';
    return '<div class="sm-form-sec"><h4>' + (flat ? 'What was sent' : 'The supplier\'s weighing') + '</h4>' +
      (flat ? '<p class="muted sm-small">One total for the whole group. The amount is shared over the lots by their grams, so each branch\'s sale gets its part.</p>' : '<p class="muted sm-small">For each purity: the grams the supplier weighed and the rate per gram they pay. The grams that left the branches stay as they were sent; the difference is kept on the group.</p>') +
      '<p class="muted sm-small">If the supplier took a purity as something else, change <b>Accepted as</b>. What the branch recorded stays as it was.</p>' +
      '<div class="table-scroll table-2col"><table class="sm-table sm-weigh"><thead><tr><th>Purity sent</th><th>Accepted as</th><th class="sm-num">Sent (g)</th>' + (flat ? '' : '<th class="sm-num">Supplier weighed (g)</th><th class="sm-num">Rate / g (₱)</th>' + (v ? '<th class="sm-num">Amount</th>' : '') + '<th class="sm-num">Difference</th>') + '</tr></thead><tbody>' +
      pur.map((p, i) => { const w = weighOf(p), hint = rates[String(p.karat || '').trim().toUpperCase()];
        return '<tr><td data-label="Purity sent">' + esc(purityLabel(p)) + '<div class="muted sm-small">' + esc(plural(p.lots, 'lot')) + '</div></td>' +
          '<td data-label="Accepted as">' + acceptedControls('gc-acc-' + i, w.acc, purityLabel(p)) + '<div class="sm-small sm-accepted" data-acc-note="' + i + '"></div></td><td data-label="Sent (g)" class="sm-num">' + esc(num(p.grams)) + '</td>' +
          (flat ? '' : '<td data-label="Supplier weighed (g)" class="sm-num"><input type="number" min="0" step="0.001" data-w-recv="' + i + '" value="' + esc(w.received) + '" aria-label="Grams the supplier weighed for ' + esc(purityLabel(p)) + '"></td>' +
            '<td data-label="Rate / g (₱)" class="sm-num"><input type="number" min="0" step="0.01" data-w-rate="' + i + '" value="' + esc(w.rate) + '" placeholder="' + esc(hint ? 'last ' + hint : '₱') + '" aria-label="Rate per gram for ' + esc(purityLabel(p)) + '"></td>' +
            (v ? '<td data-label="Amount" class="sm-num" data-w-amt="' + i + '">—</td>' : '') + '<td data-label="Difference" class="sm-num" data-w-diff="' + i + '">—</td>') + '</tr>'; }).join('') + '</tbody>' +
      '<tfoot><tr><td>Together</td><td></td><td class="sm-num">' + esc(num(sentTotal())) + '</td>' + (flat ? '' : '<td class="sm-num" id="gc-tot-recv">—</td><td></td>' + (v ? '<td class="sm-num" id="gc-tot-amt">—</td>' : '') + '<td class="sm-num" id="gc-tot-diff">—</td>') + '</tr></tfoot></table></div>' +
      (flat ? '<div class="sm-grid" style="margin-top:8px;"><div class="field"><label for="gc-flat">Total amount (₱) *</label><input id="gc-flat" type="number" min="0" step="0.01" value="' + esc(st.flat) + '"></div>' +
        '<div class="field"><label for="gc-flatg">Grams the supplier weighed (optional)</label><input id="gc-flatg" type="number" min="0" step="0.001" value="' + esc(st.flatG) + '"></div></div>' : '') + '</div>';
  }

  function refresh() {
    const flat = st.method === 'FLAT', weigh = new Map();
    let tr = 0, ta = 0;
    pur.forEach((p, i) => {
      const w = weighOf(p), recv = Number(w.received) || 0, rate = Number(w.rate) || 0, sent = Number(p.grams), amt = !flat && recv > 0 && rate > 0 ? r2(recv * rate) : 0, d = r3(recv - sent);
      weigh.set(purityKey(p), { received: recv, rate }); tr += recv; ta += amt;
      const an = document.querySelector('[data-acc-note="' + i + '"]'); if (an) an.textContent = sameAs(w.acc, p) ? '' : 'sent as ' + purityLabel(p);
      const a = document.querySelector('[data-w-amt="' + i + '"]'); if (a) a.textContent = amt ? money(amt) : '—';
      const df = document.querySelector('[data-w-diff="' + i + '"]');
      if (df) { const big = sent > 0 && Math.abs(d) / sent > 0.05; df.innerHTML = recv > 0 ? (d ? (d > 0 ? '+' : '') + esc(num(d)) + ' g' : 'same') + (big ? '<div class="sm-small" style="color:#c62828;">' + Math.round(Math.abs(d) / sent * 100) + '% off — check the slip</div>' : '') : '—'; }
    });
    if (!flat) {
      const tw = $('gc-tot-recv'); if (tw) tw.textContent = tr > 0 ? num(r3(tr)) : '—';
      const tam = $('gc-tot-amt'); if (tam) tam.textContent = ta > 0 ? money(r2(ta)) : '—';
      const td = $('gc-tot-diff'); if (td) { const d = r3(tr - sentTotal()); td.textContent = tr > 0 ? (d ? (d > 0 ? '+' : '') + num(d) + ' g' : 'same') : '—'; }
    }
    // what each branch's sale will be
    const per = shareByBranch(items, weigh, st.method, Number(st.flat) || 0), probs = problems(), diffs = pur.filter((p) => !sameAs(weighOf(p).acc, p));
    const host = $('gc-preview');
    host.innerHTML = '<h4>Before you confirm</h4><div class="table-scroll table-2col"><table class="sm-table"><thead><tr><th>Branch</th><th class="sm-num">Lots</th><th class="sm-num">Sent</th>' + (v ? '<th class="sm-num">Amount</th>' : '') + '</tr></thead><tbody>' +
      [...per.entries()].map(([id, o]) => '<tr><td data-label="Branch">' + esc(o.name) + '</td><td data-label="Lots" class="sm-num">' + esc(o.n) + '</td><td data-label="Sent" class="sm-num">' + esc(num(r3(o.g))) + ' g</td>' + (v ? '<td data-label="Amount" class="sm-num">' + esc(o.amt ? money(r2(o.amt)) : '—') + '</td>' : '') + '</tr>').join('') + '</tbody></table></div>' +
      '<div class="sm-bg-split"><b>' + esc(plural(per.size, 'sale')) + ' will be made</b> — one for each branch, because each branch\'s scrap is recorded in its own branch books. ' + (approver ? 'They are confirmed at once and the scrap leaves the branches.' : 'They wait for an approver; the grams stay held back until then.') +
      ' One payment, approval, file or reversal can then cover them all.</div>' +
      (diffs.length ? '<div class="sm-small" style="margin-top:8px;"><b>Accepted as something else:</b> ' + diffs.map((p) => esc(purityLabel(p)) + ' → <b>' + esc(metalPurity(weighOf(p).acc.metal_type, weighOf(p).acc.karat)) + '</b>').join(' · ') + '. What the branches recorded stays as it was.</div>' : '') +
      (probs.length ? '<ul class="sm-small" style="margin:8px 0 0 18px;color:#a14400;">' + probs.slice(0, 6).map((x) => '<li>' + esc(x) + '</li>').join('') + (probs.length > 6 ? '<li>…and ' + (probs.length - 6) + ' more</li>' : '') + '</ul>' : '');
    const ok = $('sm-sf-ok'); if (ok) ok.disabled = st.busy || probs.length > 0;
  }

  function drawAll() {
    drawerBody('side').innerHTML = '<div id="sm-side-msg"></div><div class="sm-banner sm-banner-info">Enter what the <b>supplier</b> weighed and pays. The sales are made from these numbers.' + (approver ? '' : ' You can enter them, but an approver must confirm the sales.') + '</div>' +
      '<div id="gc-fields">' + fieldsHtml() + '</div><div id="gc-weigh">' + weighHtml() + '</div><div class="sm-form-sec"><div class="sm-preview" id="gc-preview"></div></div>';
    drawerFooter('side').hidden = false;
    drawerFooter('side').innerHTML = '<button type="button" class="btn" id="sm-sf-ok" disabled>' + okLabel() + '</button><button type="button" class="btn secondary" id="sm-sf-cancel">Cancel</button>';
    $('gc-method').value = st.method;
    wire(); refresh();
  }

  function wire() {
    const bind = (id, key) => { const el = $(id); if (el) el.addEventListener('input', () => { st[key] = el.value; refresh(); }); };
    bind('gc-date', 'date'); bind('gc-ref', 'reference'); bind('gc-rep', 'rep'); bind('gc-notes', 'notes'); bind('gc-flat', 'flat'); bind('gc-flatg', 'flatG');
    $('gc-buyer').addEventListener('change', () => { st.buyerId = $('gc-buyer').value ? Number($('gc-buyer').value) : ''; refresh(); });
    $('gc-by').addEventListener('change', () => { st.releasedBy = $('gc-by').value; });
    $('gc-method').addEventListener('change', () => { st.method = $('gc-method').value; $('gc-weigh').innerHTML = weighHtml(); wireWeigh(); refresh(); });
    const nb = $('gc-newbuyer'); if (nb) nb.addEventListener('click', newBuyerBox);
    wireWeigh();
    $('sm-sf-cancel').addEventListener('click', () => closeDrawer('side'));
    $('sm-sf-ok').addEventListener('click', confirmNow);
  }
  function wireWeigh() {
    document.querySelectorAll('[data-w-recv]').forEach((el) => el.addEventListener('input', () => { weighOf(pur[Number(el.dataset.wRecv)]).received = el.value; refresh(); }));
    document.querySelectorAll('[data-w-rate]').forEach((el) => el.addEventListener('input', () => { weighOf(pur[Number(el.dataset.wRate)]).rate = el.value; refresh(); }));
    pur.forEach((p, i) => wireAccepted(document, 'gc-acc-' + i, (val) => { const w = weighOf(p); w.acc = { metal_type: val.metal_type, karat: val.karat }; w.accBad = val.bad; refresh(); }));
    const f = $('gc-flat'); if (f) f.addEventListener('input', () => { st.flat = f.value; refresh(); });
    const fg = $('gc-flatg'); if (fg) fg.addEventListener('input', () => { st.flatG = fg.value; });
  }

  function newBuyerBox() {
    const host = $('gc-newbuyer-host');
    host.innerHTML = '<div class="sm-banner sm-banner-info"><b>New buyer</b><div class="sm-grid" style="margin-top:8px;"><div class="field"><label for="nb-name">Name *</label><input id="nb-name" type="text"></div><div class="field"><label for="nb-person">Contact person</label><input id="nb-person" type="text"></div>' +
      '<div class="field"><label for="nb-num">Contact number</label><input id="nb-num" type="text"></div><div class="field"><label for="nb-addr">Address</label><input id="nb-addr" type="text"></div></div>' +
      '<button type="button" class="btn small" id="nb-save">Save buyer</button> <button type="button" class="btn small secondary" id="nb-cancel">Cancel</button></div>';
    $('nb-cancel').addEventListener('click', () => { host.innerHTML = ''; });
    $('nb-save').addEventListener('click', async () => {
      const name = $('nb-name').value.trim(); if (!name) { ctx.toast('Enter the buyer\'s name.', true); return; }
      $('nb-save').disabled = true;
      try {
        const r = await ctx.api.buyerSave({ name, contact_person: $('nb-person').value.trim(), contact_number: $('nb-num').value.trim(), address: $('nb-addr').value.trim() });
        if (r && r.ok === false) throw new Error(r.message);
        opt = await ctx.reloadOptions(); st.buyerId = r.id;
        const sel = $('gc-buyer'); sel.innerHTML = '<option value="">Choose…</option>' + (opt.buyers || []).map((b) => '<option value="' + esc(b.id) + '">' + esc(b.name) + '</option>').join(''); sel.value = r.id; host.innerHTML = ''; refresh();
        ctx.toast('Buyer saved.');
      } catch (err) { ctx.toast(err, true); $('nb-save').disabled = false; }
    });
  }

  async function confirmNow() {
    if (st.busy || st.done) return;
    const probs = problems(); if (probs.length) { ctx.toast(probs[0], true); return; }
    st.busy = true; const ok = $('sm-sf-ok'); ok.disabled = true; ok.textContent = 'Saving…';
    try {
      // metal_type / karat name the purity that was SENT; accepted_* say what the supplier took it for (the database stores that only when it differs)
      const weighings = pur.map((p) => { const w = weighOf(p), a = w.acc, acc = { accepted_metal_type: a.metal_type, accepted_karat: a.karat };
        return st.method === 'FLAT' ? { metal_type: p.metal_type, karat: p.karat, ...acc } : { metal_type: p.metal_type, karat: p.karat, received_g: Number(w.received), rate: Number(w.rate), ...acc }; });
      const r = await ctx.api.groupConfirm({ requestId: st.requestId, groupId: g.id, buyerId: st.buyerId, date: st.date, method: st.method, weighings, flatTotal: Number(st.flat) || null, receivedGrams: Number(st.flatG) || null,
        reference: st.reference.trim(), representative: st.rep.trim(), releasedBy: st.releasedBy || null, notes: st.notes.trim() });
      if (r && r.ok === false) throw new Error(r.message);
      st.done = true;
      if (st.method === 'PER_PURITY') { pur.forEach((p) => { const k = String(p.karat || '').trim().toUpperCase(), w = weighOf(p); if (k && Number(w.rate) > 0) rates[k] = w.rate; }); saveRates(rates); }
      ctx.afterChange(); showDone(r);
    } catch (err) { st.busy = false; ok.textContent = okLabel(); ctx.toast(err, true); refresh(); }
  }

  function showDone(r) {
    const list = r.sales || [], waiting = r.status === 'PENDING_APPROVAL', hasG = r.received_grams !== null && r.received_grams !== undefined;
    drawerBody('side').innerHTML = '<div class="sm-ok-box"><h4>' + esc(g.group_number) + ' is confirmed — ' + esc(plural(list.length, 'sale')) + (waiting ? ' waiting for approval' : ' made') + '</h4><p>' +
      (hasG ? 'The supplier weighed <b>' + esc(fmtG(r.received_grams)) + '</b> (' + esc(fmtG(sentTotal())) + ' were sent). ' : '') + (waiting ? 'An approver must confirm the sales; the grams stay held back until then. ' : 'The scrap was taken from each branch. ') +
      'One sale was made for each branch, because each branch\'s scrap is recorded in its own branch books. They are linked together, so one payment, approval or file can cover them all — open any of them.</p>' +
      '<ul class="sm-sale-list">' + list.map((s) => '<li><button type="button" class="sm-link" data-open-sale="' + esc(s.sale_id) + '"><b>' + esc(s.sale_number) + '</b></button> · ' + esc(s.branch_name) + ' · ' + esc(fmtG(s.total_grams)) +
        (v && s.total_amount !== null && s.total_amount !== undefined ? ' · ' + esc(money(s.total_amount)) : '') + '</li>').join('') + '</ul>' +
      (v && r.total_amount !== null && r.total_amount !== undefined ? '<p><b>Together: ' + esc(fmtG(r.total_grams)) + ' · ' + esc(money(r.total_amount)) + '</b></p>' : '') + (r.duplicate ? '<p class="muted">(This was already saved — no second record was made.)</p>' : '') + '</div>';
    drawerFooter('side').innerHTML = '<button type="button" class="btn" id="sm-sf-open">Open ' + esc(g.group_number) + '</button><button type="button" class="btn secondary" id="sm-sf-done">Done</button>';
    drawerBody('side').querySelectorAll('[data-open-sale]').forEach((b) => b.addEventListener('click', () => { closeDrawer('side'); closeDrawer('detail'); ctx.openSale(Number(b.dataset.openSale)); }));
    $('sm-sf-open').addEventListener('click', () => onDone());
    $('sm-sf-done').addEventListener('click', () => onDone());
  }

  openDrawer('side', { title: 'Confirm ' + g.group_number, sub: g.title + ' · ' + plural(items.length, 'lot') + ' · ' + fmtG(sentTotal()) + ' sent', body: '', footer: '' });
  drawAll();
}
