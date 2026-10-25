// Scrap Monitoring page -- the form for selling (or disposing of) scrap. Nothing is typed twice: the lots come from the branch's own purchase records, the person only says how many grams of
// each lot go, to whom, and for how much. The database checks every lot again at the moment of confirming, so two people can never take the same grams, and a second click on the confirm
// button hands back the same sale instead of making another (the request id stays the same until the form is closed).
import { esc, grams as fmtG, num, money, fmtDate, ageBadge, scrapId, manilaToday, friendly, plural, DISPOSAL_REASONS, DISPOSAL_METHODS, PAY_METHODS } from './smFormat.js?v=20261025a';
import { openDrawer, closeDrawer, drawerBody, drawerFooter } from './smUi.js?v=20261025a';

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const r3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
const RATES_KEY = 'sm-last-rates-v1';
const loadRates = () => { try { return JSON.parse(localStorage.getItem(RATES_KEY) || '{}') || {}; } catch (e) { return {}; } };
const saveRates = (m) => { try { localStorage.setItem(RATES_KEY, JSON.stringify(m)); } catch (e) { /* the form works without it */ } };

/** The same share-out the database does: grams x rate per lot, or one flat total shared by grams with the biggest lot taking the rounding. */
export function priceItems(picks, method, flat) {
  const items = picks.map((p) => ({ line_id: p.line_id, grams: Number(p.grams), rate: Number(p.rate) }));
  const totalG = items.reduce((t, i) => t + i.grams, 0);
  if (method === 'FLAT') {
    const total = r2(flat || 0);
    if (!(total > 0) || !(totalG > 0)) return { items: items.map((i) => ({ ...i, amount: 0 })), total: 0 };
    let diff = total;
    const out = items.map((i) => { const a = r2(total * i.grams / totalG); diff = r2(diff - a); return { ...i, amount: a }; });
    if (diff !== 0 && out.length) { let big = 0; out.forEach((i, k) => { if (i.grams > out[big].grams) big = k; }); out[big].amount = r2(out[big].amount + diff); }
    return { items: out, total };
  }
  const out = items.map((i) => ({ ...i, amount: r2(i.grams * (i.rate || 0)) }));
  return { items: out, total: r2(out.reduce((t, i) => t + i.amount, 0)) };
}

export async function openSaleForm(ctx, opts) {
  const mode = opts.mode === 'DISPOSAL' ? 'DISPOSAL' : 'SALE', sale = mode === 'SALE';
  const st = { mode, requestId: uuid(), branchId: opts.branchId || (ctx.branches.length === 1 ? ctx.branches[0].id : null), lockBranch: !!opts.branchId, buyerId: '', date: manilaToday(), method: 'PER_GRAM', flat: '',
    reference: '', rep: '', releasedBy: ctx.access.me.id, notes: '', reason: DISPOSAL_REASONS[0], dmethod: DISPOSAL_METHODS[0], lots: [], picks: new Map(), rate: {}, lotRate: {}, busy: false, done: false, filter: '', purity: '' };
  const title = sale ? 'New scrap sale' : 'Dispose of scrap';
  const rates = loadRates();
  const lastRate = (karat) => (rates[karat] ? 'last ' + rates[karat] : '');
  let opt = { buyers: [], people: [] };
  openDrawer('side', { title, sub: 'Loading…', body: '<div id="sm-side-msg"></div><p class="muted">Loading…</p>', footer: '' });
  try { opt = await ctx.loadOptions(); } catch (err) { drawerBody('side').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; return; }

  async function loadLots() {
    st.lots = []; st.picks.clear();
    if (!st.branchId) return;
    const filters = { branch_id: st.branchId }; if (opts.entryId) filters.entry_id = opts.entryId;
    const res = await ctx.api.available(filters, 2000, 0, 'oldest');
    if (!res || res.ok === false) throw new Error((res && res.message) || 'The lots could not be loaded.');
    st.lots = res.rows || [];
    st.lots.forEach((l) => { st.lotRate[l.line_id] = ''; });   // gold prices move daily: last time's rate is shown as a hint, never filled in for the person
    const want = new Set((opts.lineIds || []).map(Number));
    st.lots.forEach((l) => { if (want.has(l.line_id) || (opts.entryId && l.entry_id === opts.entryId)) st.picks.set(l.line_id, { line_id: l.line_id, grams: l.available_g, rate: st.lotRate[l.line_id] }); });
    st.missing = (opts.lineIds || []).length - [...st.picks.keys()].filter((id) => want.has(id)).length;
  }
  try { await loadLots(); } catch (err) { drawerBody('side').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; return; }

  const $ = (id) => document.getElementById(id);
  const lotById = (id) => st.lots.find((l) => l.line_id === Number(id));
  const rateOf = (id) => st.lotRate[id];

  function problems() {
    const p = [];
    if (!st.branchId) p.push('Choose the branch.');
    if (sale && !st.buyerId) p.push('Choose the buyer.');
    if (!st.date) p.push('Choose the date.'); else if (st.date > manilaToday()) p.push('The date cannot be in the future.');
    if (!sale && !String(st.reason || '').trim()) p.push('Say why the scrap is being disposed of.');
    if (!st.picks.size) p.push('Choose the lots (tick them in the list below).');
    st.picks.forEach((pk, id) => {
      const l = lotById(id), g = Number(pk.grams);
      if (!(g > 0)) p.push(scrapId(l.entry_id) + ': enter the grams.'); else if (g > Number(l.available_g) + 0.0005) p.push(scrapId(l.entry_id) + ': only ' + num(l.available_g) + ' g is available.');
      if (sale && st.method === 'PER_GRAM' && !(Number(rateOf(id)) > 0)) p.push(scrapId(l.entry_id) + ' (' + (l.karat || l.metal_type) + '): enter the rate per gram.');
    });
    if (sale && st.method === 'FLAT' && !(Number(st.flat) > 0)) p.push('Enter the total amount of the sale.');
    return p;
  }
  const pickList = () => [...st.picks.values()].map((pk) => ({ line_id: pk.line_id, grams: Number(pk.grams), rate: Number(rateOf(pk.line_id) || 0) }));

  function preview() {
    const host = $('sm-preview');
    if (!host) return;
    const picks = pickList(), pr = sale ? priceItems(picks, st.method, st.flat) : null, byId = new Map((pr ? pr.items : picks).map((i) => [i.line_id, i]));
    const totalG = r3(picks.reduce((t, i) => t + (i.grams || 0), 0));
    const probs = problems();
    host.innerHTML = '<h4>Before you confirm</h4>' + (picks.length ? '<div class="table-scroll"><table class="sm-table"><thead><tr><th>Scrap ID</th><th>Metal / purity</th><th class="sm-num">Available</th><th class="sm-num">Selling</th><th class="sm-num">Remaining</th>' +
      (sale && ctx.value ? '<th class="sm-num">Rate / g</th><th class="sm-num">Amount</th>' : '') + '</tr></thead><tbody>' +
      picks.map((pk) => { const l = lotById(pk.line_id), it = byId.get(pk.line_id), rem = r3(Number(l.available_g) - pk.grams);
        return '<tr><td>' + esc(scrapId(l.entry_id)) + '</td><td>' + esc(l.metal_type + ' ' + (l.karat || '')) + '</td><td class="sm-num">' + esc(num(l.available_g)) + ' g</td><td class="sm-num"><b>' + esc(num(pk.grams)) + ' g</b></td>' +
          '<td class="sm-num"' + (rem < 0 ? ' style="color:#c62828;"' : '') + '>' + esc(num(rem)) + ' g</td>' + (sale && ctx.value ? '<td class="sm-num">' + (st.method === 'PER_GRAM' ? esc(money(pk.rate)) : '<span class="muted">flat</span>') + '</td><td class="sm-num">' + esc(money(it ? it.amount : 0)) + '</td>' : '') + '</tr>'; }).join('') +
      '</tbody><tfoot><tr><td colspan="3">Total · ' + plural(picks.length, 'lot') + '</td><td class="sm-num">' + esc(num(totalG)) + ' g</td><td></td>' + (sale && ctx.value ? '<td></td><td class="sm-num">' + esc(money(pr.total)) + '</td>' : '') + '</tr></tfoot></table></div>' : '<p class="muted">No lot is chosen yet.</p>') +
      (probs.length ? '<ul class="sm-small" style="margin:8px 0 0 18px;color:#a14400;">' + probs.slice(0, 6).map((x) => '<li>' + esc(x) + '</li>').join('') + (probs.length > 6 ? '<li>…and ' + (probs.length - 6) + ' more</li>' : '') + '</ul>' : '');
    const ok = $('sm-sf-ok'); if (ok) ok.disabled = st.busy || probs.length > 0;
  }

  function lotRow(l) {
    const pk = st.picks.get(l.line_id), on = !!pk;
    return '<tr data-lot="' + esc(l.line_id) + '" class="' + (on ? 'sm-lot-on' : '') + '"><td class="sm-c-check"><input type="checkbox" data-lot-pick="' + esc(l.line_id) + '"' + (on ? ' checked' : '') + ' aria-label="Choose this lot"></td>' +
      '<td><b>' + esc(scrapId(l.entry_id)) + '</b><div class="muted sm-small">' + esc(fmtDate(l.entry_date)) + '</div></td><td>' + ageBadge(l.age_days, ctx.settings.aged_days) + '</td><td>' + esc(l.metal_type + ' ' + (l.karat || '')) + '</td>' +
      '<td class="sm-num"><b>' + esc(num(l.available_g)) + ' g</b>' + (l.mark ? '<div class="sm-small muted">' + esc(({ FOR_SALE: 'for sale', FOR_DISPOSAL: 'for disposal', RESERVED: 'reserved' })[l.mark] || '') + '</div>' : '') + '</td>' +
      '<td class="sm-num"><input type="number" min="0" step="0.001" max="' + esc(l.available_g) + '" data-lot-grams="' + esc(l.line_id) + '" value="' + (on ? esc(pk.grams) : '') + '"' + (on ? '' : ' disabled') + ' aria-label="Grams to take"></td>' +
      (sale && st.method === 'PER_GRAM' ? '<td class="sm-num"><input type="number" min="0" step="0.01" data-lot-rate="' + esc(l.line_id) + '" value="' + esc(st.lotRate[l.line_id]) + '" placeholder="' + esc(lastRate((l.karat || '').toUpperCase())) + '" aria-label="Rate per gram"></td>' : '') + '</tr>';
  }
  const visibleLots = () => st.lots.filter((l) => (!st.purity || (l.karat || '').toUpperCase() === st.purity) && (!st.filter || (scrapId(l.entry_id) + ' ' + (l.customer_name || '') + ' ' + l.metal_type + ' ' + (l.karat || '')).toLowerCase().includes(st.filter.toLowerCase())));
  const purities = () => [...new Set(st.lots.map((l) => (l.karat || '').toUpperCase()))].filter(Boolean).sort();

  function drawLots() {
    const host = $('sm-lots-host');
    if (!st.branchId) { host.innerHTML = '<p class="muted">Choose the branch to see its scrap.</p>'; return; }
    if (!st.lots.length) { host.innerHTML = '<div class="sm-banner sm-banner-warn">This branch has no available scrap to ' + (sale ? 'sell' : 'dispose of') + '.</div>'; return; }
    const lots = visibleLots();
    host.innerHTML = '<div class="sm-grid"><div class="field"><label for="sm-lotq">Find a lot</label><input id="sm-lotq" type="search" value="' + esc(st.filter) + '" placeholder="Scrap #, customer…"></div>' +
      '<div class="field"><label for="sm-lotp">Purity</label><select id="sm-lotp"><option value="">All</option>' + purities().map((p) => '<option' + (st.purity === p ? ' selected' : '') + '>' + esc(p) + '</option>').join('') + '</select></div></div>' +
      '<div class="sm-ratebar"><div class="field"><label for="sm-qp-p">Take the oldest</label><select id="sm-qp-p">' + purities().map((p) => '<option>' + esc(p) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="sm-qp-g">grams of that purity</label><input id="sm-qp-g" type="number" min="0" step="0.001" placeholder="e.g. 100"></div><button type="button" class="btn small secondary" id="sm-qp-go">Pick oldest first</button>' +
      (sale && st.method === 'PER_GRAM' ? purities().map((p) => '<div class="field"><label for="sm-pr-' + esc(p) + '">Rate / g for ' + esc(p) + '</label><input id="sm-pr-' + esc(p) + '" type="number" min="0" step="0.01" data-purity-rate="' + esc(p) + '" value="' + esc(st.rate[p] !== undefined ? st.rate[p] : '') + '" placeholder="' + esc(lastRate(p) || '₱') + '"></div>').join('') : '') + '</div>' +
      '<div class="sm-lots"><table class="sm-table"><thead><tr><th class="sm-c-check"><input type="checkbox" data-lot-all aria-label="Choose every lot shown"></th><th>Scrap ID</th><th>Held</th><th>Metal / purity</th><th class="sm-num">Available</th><th class="sm-num">Take (g)</th>' +
      (sale && st.method === 'PER_GRAM' ? '<th class="sm-num">Rate / g</th>' : '') + '</tr></thead><tbody>' + lots.map(lotRow).join('') + '</tbody></table></div>' + (lots.length < st.lots.length ? '<p class="muted sm-small">' + (st.lots.length - lots.length) + ' more lots are hidden by the filter.</p>' : '');
    wireLots();
  }

  function setPick(id, on) {
    const l = lotById(id);
    if (on) st.picks.set(l.line_id, { line_id: l.line_id, grams: l.available_g, rate: rateOf(l.line_id) }); else st.picks.delete(l.line_id);
    const tr = document.querySelector('tr[data-lot="' + id + '"]');
    if (tr) { tr.classList.toggle('sm-lot-on', on); const g = tr.querySelector('[data-lot-grams]'); g.disabled = !on; g.value = on ? l.available_g : ''; const c = tr.querySelector('[data-lot-pick]'); c.checked = on; }
  }
  function wireLots() {
    const host = $('sm-lots-host');
    host.querySelectorAll('[data-lot-pick]').forEach((c) => c.addEventListener('change', () => { setPick(Number(c.dataset.lotPick), c.checked); preview(); }));
    host.querySelectorAll('[data-lot-grams]').forEach((i) => i.addEventListener('input', () => { const pk = st.picks.get(Number(i.dataset.lotGrams)); if (pk) pk.grams = i.value === '' ? 0 : Number(i.value); preview(); }));
    host.querySelectorAll('[data-lot-rate]').forEach((i) => i.addEventListener('input', () => { st.lotRate[Number(i.dataset.lotRate)] = i.value; const pk = st.picks.get(Number(i.dataset.lotRate)); if (pk) pk.rate = i.value; preview(); }));
    host.querySelectorAll('[data-purity-rate]').forEach((i) => i.addEventListener('input', () => {
      const p = i.dataset.purityRate; st.rate[p] = i.value;
      st.lots.forEach((l) => { if ((l.karat || '').toUpperCase() === p) { st.lotRate[l.line_id] = i.value; const el = host.querySelector('[data-lot-rate="' + l.line_id + '"]'); if (el) el.value = i.value; } });
      preview();
    }));
    const all = host.querySelector('[data-lot-all]'); if (all) all.addEventListener('change', () => { visibleLots().forEach((l) => setPick(l.line_id, all.checked)); preview(); });
    const q = $('sm-lotq'); if (q) q.addEventListener('input', () => { st.filter = q.value; const pos = q.selectionStart; drawLots(); const nq = $('sm-lotq'); nq.focus(); nq.setSelectionRange(pos, pos); preview(); });
    const p = $('sm-lotp'); if (p) p.addEventListener('change', () => { st.purity = p.value; drawLots(); preview(); });
    const go = $('sm-qp-go'); if (go) go.addEventListener('click', () => {
      const purity = $('sm-qp-p').value, want = Number($('sm-qp-g').value);
      if (!(want > 0)) { ctx.toast('Enter how many grams to take.', true); return; }
      let left = want;
      st.lots.filter((l) => (l.karat || '').toUpperCase() === purity).forEach((l) => {
        if (left <= 0.0005) { if (st.picks.has(l.line_id)) setPick(l.line_id, false); return; }
        const take = Math.min(left, Number(l.available_g)); setPick(l.line_id, true); st.picks.get(l.line_id).grams = r3(take); const g = document.querySelector('[data-lot-grams="' + l.line_id + '"]'); if (g) g.value = r3(take); left = r3(left - take);
      });
      if (left > 0.0005) ctx.toast('Only ' + num(want - left) + ' g of ' + purity + ' is available — all of it was picked.', true);
      preview();
    });
  }

  function fieldsHtml() {
    const branchSel = '<div class="field"><label for="sf-branch">Branch *</label><select id="sf-branch"' + (st.lockBranch ? ' disabled' : '') + '><option value="">Choose…</option>' + ctx.branches.map((b) => '<option value="' + esc(b.id) + '"' + (b.id === st.branchId ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('') + '</select></div>';
    const people = '<div class="field"><label for="sf-by">Released by (who handed it over)</label><select id="sf-by"><option value="">—</option>' + (opt.people || []).map((p) => '<option value="' + esc(p.id) + '"' + (p.id === st.releasedBy ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select></div>';
    if (sale) {
      return '<div class="sm-form-sec"><h4>The sale</h4><div class="sm-grid">' + branchSel +
        '<div class="field"><label for="sf-buyer">Buyer *</label><select id="sf-buyer"><option value="">Choose…</option>' + (opt.buyers || []).map((b) => '<option value="' + esc(b.id) + '">' + esc(b.name) + '</option>').join('') + '</select>' +
        (ctx.can.manage_buyers || ctx.can.sell ? '<button type="button" class="act-link" id="sf-newbuyer">+ New buyer</button>' : '') + '</div>' +
        '<div class="field"><label for="sf-date">Date of sale *</label><input id="sf-date" type="date" value="' + esc(st.date) + '" max="' + esc(manilaToday()) + '"></div>' +
        '<div class="field"><label for="sf-method">How is the price worked out? *</label><select id="sf-method"><option value="PER_GRAM">Rate per gram, lot by lot</option><option value="FLAT">One flat amount for the whole sale</option></select></div>' +
        '<div class="field" id="sf-flat-wrap" hidden><label for="sf-flat">Total amount (₱) *</label><input id="sf-flat" type="number" min="0" step="0.01" value="' + esc(st.flat) + '"></div>' +
        '<div class="field"><label for="sf-ref">Buyer\'s slip / receipt no.</label><input id="sf-ref" type="text" value="' + esc(st.reference) + '"></div>' +
        '<div class="field"><label for="sf-rep">Collected by (buyer\'s person)</label><input id="sf-rep" type="text" value="' + esc(st.rep) + '"></div>' + people +
        '<div class="field"><label for="sf-notes">Notes</label><input id="sf-notes" type="text" value="' + esc(st.notes) + '"></div></div><div id="sf-newbuyer-host"></div></div>';
    }
    return '<div class="sm-form-sec"><h4>The disposal</h4><div class="sm-grid">' + branchSel +
      '<div class="field"><label for="sf-date">Date *</label><input id="sf-date" type="date" value="' + esc(st.date) + '" max="' + esc(manilaToday()) + '"></div>' +
      '<div class="field"><label for="sf-reason">Why is it being disposed of? *</label><select id="sf-reason">' + DISPOSAL_REASONS.map((r) => '<option' + (r === st.reason ? ' selected' : '') + '>' + esc(r) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="sf-dmethod">How?</label><select id="sf-dmethod">' + DISPOSAL_METHODS.map((r) => '<option' + (r === st.dmethod ? ' selected' : '') + '>' + esc(r) + '</option>').join('') + '</select></div>' + people +
      '<div class="field"><label for="sf-notes">Notes</label><input id="sf-notes" type="text" value="' + esc(st.notes) + '"></div></div></div>';
  }

  function render() {
    const approver = ctx.can.approve_sale;
    drawerBody('side').innerHTML = '<div id="sm-side-msg"></div>' + (st.missing > 0 ? '<div class="sm-banner sm-banner-warn">' + plural(st.missing, 'lot') + ' you chose ' + (st.missing === 1 ? 'is' : 'are') + ' no longer available.</div>' : '') +
      (!approver ? '<div class="sm-banner sm-banner-info">You can enter this ' + (sale ? 'sale' : 'disposal') + ', but an approver must confirm it. The grams are held back meanwhile, so nobody else can sell them.</div>' : '') +
      fieldsHtml() + '<div class="sm-form-sec"><h4>The lots</h4><div id="sm-lots-host"></div></div><div class="sm-form-sec"><div class="sm-preview" id="sm-preview"></div></div>';
    drawerFooter('side').hidden = false;
    drawerFooter('side').innerHTML = '<button type="button" class="btn" id="sm-sf-ok" disabled>' + (approver ? (sale ? 'CONFIRM SCRAP SALE' : 'CONFIRM DISPOSAL') : 'SUBMIT FOR APPROVAL') + '</button><button type="button" class="btn secondary" id="sm-sf-cancel">Cancel</button>';
    document.getElementById('sm-side-sub').textContent = ctx.branches.find((b) => b.id === st.branchId) ? ctx.branches.find((b) => b.id === st.branchId).name : 'Choose a branch';
    if (sale) { $('sf-method').value = st.method; $('sf-flat-wrap').hidden = st.method !== 'FLAT'; if (st.buyerId) $('sf-buyer').value = st.buyerId; }
    drawLots(); preview(); wireFields();
  }

  function wireFields() {
    const bind = (id, key, num_) => { const el = $(id); if (el) el.addEventListener('input', () => { st[key] = num_ ? el.value : el.value; preview(); }); };
    bind('sf-date', 'date'); bind('sf-ref', 'reference'); bind('sf-rep', 'rep'); bind('sf-notes', 'notes'); bind('sf-flat', 'flat'); bind('sf-reason', 'reason'); bind('sf-dmethod', 'dmethod');
    const by = $('sf-by'); if (by) by.addEventListener('change', () => { st.releasedBy = by.value; });
    const buyer = $('sf-buyer'); if (buyer) buyer.addEventListener('change', () => { st.buyerId = buyer.value ? Number(buyer.value) : ''; preview(); });
    const method = $('sf-method'); if (method) method.addEventListener('change', () => { st.method = method.value; $('sf-flat-wrap').hidden = st.method !== 'FLAT'; drawLots(); preview(); });
    const br = $('sf-branch'); if (br && !st.lockBranch) br.addEventListener('change', async () => {
      st.branchId = br.value ? Number(br.value) : null; st.picks.clear(); $('sm-lots-host').innerHTML = '<p class="muted">Loading…</p>';
      try { await loadLots(); } catch (err) { ctx.toast(err, true); }
      document.getElementById('sm-side-sub').textContent = st.branchId ? ctx.branches.find((b) => b.id === st.branchId).name : 'Choose a branch'; drawLots(); preview();
    });
    const nb = $('sf-newbuyer'); if (nb) nb.addEventListener('click', () => newBuyerBox());
    $('sm-sf-cancel').addEventListener('click', () => closeDrawer('side'));
    $('sm-sf-ok').addEventListener('click', confirm_);
  }

  function newBuyerBox() {
    const host = $('sf-newbuyer-host');
    host.innerHTML = '<div class="sm-banner sm-banner-info"><b>New buyer</b><div class="sm-grid" style="margin-top:8px;"><div class="field"><label for="nb-name">Name *</label><input id="nb-name" type="text"></div><div class="field"><label for="nb-person">Contact person</label><input id="nb-person" type="text"></div>' +
      '<div class="field"><label for="nb-num">Contact number</label><input id="nb-num" type="text"></div><div class="field"><label for="nb-addr">Address</label><input id="nb-addr" type="text"></div><div class="field"><label for="nb-pm">Usually pays by</label><select id="nb-pm"><option value="">—</option>' + PAY_METHODS.map((m) => '<option>' + esc(m) + '</option>').join('') + '</select></div></div>' +
      '<button type="button" class="btn small" id="nb-save">Save buyer</button> <button type="button" class="btn small secondary" id="nb-cancel">Cancel</button></div>';
    $('nb-cancel').addEventListener('click', () => { host.innerHTML = ''; });
    $('nb-save').addEventListener('click', async () => {
      const name = $('nb-name').value.trim(); if (!name) { ctx.toast('Enter the buyer\'s name.', true); return; }
      $('nb-save').disabled = true;
      try {
        const r = await ctx.api.buyerSave({ name, contact_person: $('nb-person').value.trim(), contact_number: $('nb-num').value.trim(), address: $('nb-addr').value.trim(), payment_method: $('nb-pm').value });
        if (r && r.ok === false) throw new Error(r.message);
        opt = await ctx.reloadOptions(); st.buyerId = r.id;
        const sel = $('sf-buyer'); sel.innerHTML = '<option value="">Choose…</option>' + (opt.buyers || []).map((b) => '<option value="' + esc(b.id) + '">' + esc(b.name) + '</option>').join(''); sel.value = r.id; host.innerHTML = ''; preview();
        ctx.toast('Buyer saved.');
      } catch (err) { ctx.toast(err, true); $('nb-save').disabled = false; }
    });
  }

  async function confirm_() {
    if (st.busy || st.done) return;
    const probs = problems(); if (probs.length) { ctx.toast(probs[0], true); return; }
    st.busy = true; const ok = $('sm-sf-ok'); ok.disabled = true; ok.textContent = 'Saving…';
    try {
      const items = pickList().map((i) => (sale && st.method === 'PER_GRAM' ? { line_id: i.line_id, grams: i.grams, rate: i.rate } : { line_id: i.line_id, grams: i.grams }));
      const res = sale ? await ctx.api.saleCreate({ requestId: st.requestId, buyerId: st.buyerId, branchId: st.branchId, date: st.date, method: st.method, items, flatTotal: Number(st.flat) || null,
          reference: st.reference.trim(), representative: st.rep.trim(), releasedBy: st.releasedBy || null, notes: st.notes.trim() })
        : await ctx.api.disposeCreate({ requestId: st.requestId, branchId: st.branchId, date: st.date, reason: String(st.reason).trim(), method: st.dmethod, items, releasedBy: st.releasedBy || null, notes: st.notes.trim() });
      if (res && res.ok === false) throw new Error(res.message);
      st.done = true;
      if (sale) { PER_GRAM_REMEMBER(st, rates, saveRates); }
      const waiting = res.status === 'PENDING_APPROVAL';
      drawerBody('side').innerHTML = '<div class="sm-ok-box"><h4>' + esc(res.sale_number) + (waiting ? ' is waiting for approval' : sale ? ' is confirmed' : ' is recorded') + '</h4><p>' +
        (waiting ? 'The grams are held back until an approver confirms it.' : sale ? 'The scrap was taken from the branch and the sale is recorded. Record the buyer\'s payment and attach the weighing slip or receipt from the sale\'s page.' : 'The scrap was taken from the branch\'s available scrap.') + '</p>' + (res.duplicate ? '<p class="muted">(This was already saved — no second record was made.)</p>' : '') + '</div>';
      drawerFooter('side').innerHTML = '<button type="button" class="btn" id="sm-sf-open">Open ' + esc(res.sale_number) + '</button><button type="button" class="btn secondary" id="sm-sf-done">Done</button>';
      $('sm-sf-open').addEventListener('click', () => { closeDrawer('side'); ctx.openSale(res.sale_id); });
      $('sm-sf-done').addEventListener('click', () => closeDrawer('side'));
      ctx.afterChange();
    } catch (err) { st.busy = false; ok.textContent = ctx.can.approve_sale ? (sale ? 'CONFIRM SCRAP SALE' : 'CONFIRM DISPOSAL') : 'SUBMIT FOR APPROVAL'; ctx.toast(err, true); preview(); }
  }
  render();
}

/** the rates just used become the starting rates next time (per purity) */
function PER_GRAM_REMEMBER(st, rates, save) {
  if (st.method !== 'PER_GRAM') return;
  st.lots.forEach((l) => { const k = (l.karat || '').toUpperCase(); const pk = st.picks.get(l.line_id); if (pk && Number(st.lotRate[l.line_id]) > 0) rates[k] = st.lotRate[l.line_id]; });
  save(rates);
}
