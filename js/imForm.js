// Item Monitoring > Factory Purchase -- where a delivery is entered. Nothing entered here becomes stock: it becomes a REQUEST that waits for the Final Approver (migrations 264-268). Staff save a
// draft, attach proof, review it and submit it; the owner (who holds the final-approval key) can submit and approve in one step. The fields, the live arithmetic and the "add another item" list
// are the old form's; the items are cards now, one per SKU, so they read on a phone.
import { esc, money, weight, num, plural, calcLine, lineWarnings, todayManila, fmtDateTime, FILE_TYPES, fileTypeLabel, friendly, reqBadge } from './imFormat.js?v=20261030b';
import { branchBadge, branchOptionStyle } from './branchColors.js?v=20261030b';
import { banner, filesHtml, wireFiles, showModal } from './imUi.js?v=20261030b';

const uuid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const safeName = (n) => String(n || 'file').replace(/[^\w.\-]+/g, '_').slice(-80);
const READ_KEYS = ['sku', 'product_name', 'category', 'qty', 'sup_price', 'pancake_price', 'grams', 'availed_factory_gram', 'est_sales', 'purchased_amount', 'profit', 'tag_note'];

function itemCardHtml(n) {
  return '<div class="im-item" data-item>' +
    '<div class="im-item-head"><b>ITEM ' + n + '</b><span class="im-item-flags" data-flags></span><button type="button" class="btn small secondary" data-remove title="Remove this item">Remove</button></div>' +
    '<div class="im-item-grid">' +
      '<fieldset class="im-grp"><legend>Item</legend>' +
        '<div class="field" style="position:relative;"><label>SKU *</label><input type="text" data-f="sku" autocomplete="off" placeholder="Type a SKU or item name…"><div class="muted im-sku-note" data-sku-note></div><div class="im-suggest" data-suggest hidden></div></div>' +
        '<div class="field"><label>Product name</label><input type="text" data-f="product_name" placeholder="only for a new SKU"></div>' +
        '<div class="field"><label>Category</label><input type="text" data-f="category" placeholder="only for a new SKU"></div>' +
      '</fieldset>' +
      '<fieldset class="im-grp"><legend>Quantity &amp; weight</legend>' +
        '<div class="field"><label>Pcs *</label><input type="number" data-f="qty" min="1" step="1" inputmode="numeric"></div>' +
        '<div class="field"><label>Grams (each)</label><input type="number" data-f="grams" step="0.001" min="0" inputmode="decimal"></div>' +
        '<div class="field"><label>Total grams</label><div class="im-calc" data-total-g>—</div></div>' +
      '</fieldset>' +
      '<fieldset class="im-grp"><legend>Cost</legend>' +
        '<div class="field"><label>Supplier price (each)</label><input type="number" data-f="sup_price" step="0.01" min="0" inputmode="decimal"></div>' +
        '<div class="field"><label>Avail. factory / g</label><input type="number" data-f="availed_factory_gram" step="0.01" min="0" inputmode="decimal"></div>' +
        '<div class="field"><label>Purchased (total)</label><input type="number" data-f="purchased_amount" step="0.01" inputmode="decimal"></div>' +
      '</fieldset>' +
      '<fieldset class="im-grp"><legend>Selling</legend>' +
        '<div class="field"><label>Pancake price (each)</label><input type="number" data-f="pancake_price" step="0.01" min="0" inputmode="decimal"></div>' +
        '<div class="field"><label>Est. sales (total)</label><input type="number" data-f="est_sales" step="0.01" inputmode="decimal"></div>' +
        '<div class="field"><label>Profit</label><input type="number" data-f="profit" step="0.01" inputmode="decimal"></div>' +
      '</fieldset>' +
      '<fieldset class="im-grp im-grp-wide"><legend>Other</legend><div class="field"><label>Tag / Note</label><input type="text" data-f="tag_note"></div></fieldset>' +
    '</div>' +
    '<div class="im-item-warn" data-warn></div></div>';
}

export function renderForm(ctx, panel, opts) {
  const { api, data } = ctx;
  const me = ctx.employee;
  const branches = ctx.branches;
  const st = ctx.ui.form;                       // { clientId, requestId, requestNumber, status, returnedReason, pendingFiles: [{file,type}], serverFiles: [], saved: state to restore }
  if (!st.clientId) st.clientId = uuid();
  if (!ctx.who.canRecord) {
    panel.innerHTML = '<div class="card"><h3>Record Factory Purchase</h3><p class="muted">You do not have the right to record factory purchases. Ask an Admin if you think you should.</p></div>';
    return;
  }

  const branchField = ctx.who.branchLocked
    ? '<div class="field"><label>Branch</label>' + (ctx.branchById[me.branch_id] ? branchBadge(esc, ctx.branchById[me.branch_id], me.branch_id, branches) : '<input type="text" value="None assigned" disabled>') + '<input type="hidden" id="im-pf-branch" value="' + esc(me.branch_id || '') + '"></div>'
    : '<div class="field"><label>Branch *</label><select id="im-pf-branch" required>' + branches.map((b) => '<option value="' + b.id + '" style="' + branchOptionStyle(b.id, branches) + '">' + esc(b.name) + '</option>').join('') + '</select></div>';

  const mine = (data.requests || []).filter((r) => r.created_by === me.id && ['DRAFT', 'RETURNED FOR CORRECTION'].includes(r.status));
  const myList = mine.length
    ? '<div class="im-mydrafts"><h4>Your drafts and returned requests</h4>' + mine.map((r) =>
        '<div class="im-mydraft"><div><b>' + esc(r.request_number) + '</b> ' + reqBadge(r.status) + ' <span class="muted">' + esc(r.branch_name) + ' · ' + plural(r.items, 'item') + ' · ' + num(r.pcs) + ' pcs · ' + money(r.purchased) + '</span>' +
        (r.status === 'RETURNED FOR CORRECTION' && r.return_for_correction_reason ? '<div class="im-returned">Returned: ' + esc(r.return_for_correction_reason) + '</div>' : '') + '</div>' +
        '<button type="button" class="btn small" data-open-draft="' + r.id + '">' + (r.status === 'RETURNED FOR CORRECTION' ? 'Correct it' : 'Continue') + '</button></div>').join('') + '</div>'
    : '';
  const recent = (data.requests || []).filter((r) => r.created_by === me.id && !['DRAFT', 'RETURNED FOR CORRECTION'].includes(r.status)).slice(0, 5);
  const recentList = recent.length
    ? '<div class="im-mydrafts"><h4>Recently submitted</h4>' + recent.map((r) => '<div class="im-mydraft"><div><b>' + esc(r.request_number) + '</b> ' + reqBadge(r.status) + ' <span class="muted">' + esc(r.branch_name) + ' · ' + num(r.pcs) + ' pcs · ' + money(r.purchased) + (r.submitted_at ? ' · ' + fmtDateTime(r.submitted_at) : '') + '</span></div>' +
      '<button type="button" class="btn small secondary" data-view-req="' + r.id + '">View</button></div>').join('') + '</div>'
    : '';

  panel.innerHTML = '<div class="card im-form-card"><h3>Record Factory Purchase</h3>' +
    '<p class="muted" style="margin-top:-4px;">A purchase you enter here goes to <b>Final Approval</b> first. <b>No stock is added until it is approved</b> — then it posts a real Stock In and appears in the SKU Catalog. ' +
    'Product name and category are only used the first time a SKU is purchased; an existing SKU\'s catalog details are never overwritten. Branch, date delivered and current per gram are shared by every item below.</p>' +
    '<div id="im-pf-editing"></div>' + myList + recentList +
    '<form id="im-pf" class="im-pf" autocomplete="off">' +
      '<div class="im-pf-head">' + branchField + '<div class="field"><label>Date delivered *</label><input type="date" id="im-pf-date" required max="' + esc(todayManila()) + '"></div>' +
      '<div class="field"><label>Current per gram</label><input type="number" id="im-pf-pergram" step="0.01" min="0" placeholder="PHP/g, today\'s rate" inputmode="decimal"></div>' +
      '<div class="field im-grow"><label>Note for the approver (optional)</label><input type="text" id="im-pf-notes" placeholder="e.g. delivery of Oct 30, invoice attached"></div></div>' +
      '<div class="im-items-title"><b>Items *</b> <span class="muted">one card for each SKU</span></div>' +
      '<div id="im-pf-items"></div>' +
      '<button type="button" class="btn small secondary" id="im-pf-add">+ Add another item</button>' +
      '<div class="im-sumbar" id="im-pf-sum"></div>' +
      '<div class="im-files"><h4>Proof &amp; attachments</h4><div id="im-pf-serverfiles"></div><div id="im-pf-pendingfiles"></div>' +
        '<div class="lv-upload"><select id="im-pf-ftype">' + FILE_TYPES.map((t) => '<option value="' + t[0] + '">' + esc(t[1]) + '</option>').join('') + '</select>' +
        '<input type="file" id="im-pf-file" accept="image/*,.pdf" multiple><span class="muted" style="font-size:11px;">Invoices, receipts and photos help the approver check the purchase. They are uploaded when you save or submit.</span></div></div>' +
      '<div class="im-pf-actions"><button type="button" class="btn secondary" id="im-pf-draft">Save as draft</button>' +
        '<button type="button" class="btn" id="im-pf-review">' + (ctx.who.isApprover ? 'Review &amp; submit &amp; approve' : 'Review &amp; submit for approval') + '</button>' +
        '<button type="button" class="btn secondary" id="im-pf-cancel" hidden>Cancel this request</button><button type="button" class="btn secondary" id="im-pf-new" hidden>Start a new purchase</button></div>' +
    '</form></div>';

  const $ = (sel) => panel.querySelector(sel);
  const itemsBox = $('#im-pf-items');
  $('#im-pf-date').value = todayManila();

  // ---------------------------------------------------------------- the item cards
  const histOf = (sku) => { const h = ctx.histBySku(); return h.get(sku) || null; };
  function updateRemove() { const cards = itemsBox.querySelectorAll('[data-item]'); cards.forEach((c, i) => { c.querySelector('.im-item-head b').textContent = 'ITEM ' + (i + 1); c.querySelector('[data-remove]').hidden = cards.length <= 1; }); }
  function readCard(card) {
    const g = (k) => card.querySelector('[data-f="' + k + '"]').value;
    const numOrNull = (k) => (g(k) === '' ? null : Number(g(k)));
    return {
      sku: g('sku').trim(), product_name: g('product_name').trim(), category: g('category').trim(), qty: Number(g('qty') || 0), sup_price: numOrNull('sup_price'), pancake_price: numOrNull('pancake_price'),
      grams: numOrNull('grams'), availed_factory_gram: numOrNull('availed_factory_gram'), est_sales: numOrNull('est_sales'), purchased_amount: numOrNull('purchased_amount'), profit: numOrNull('profit'), tag_note: g('tag_note').trim(),
    };
  }
  function readItems() { return [...itemsBox.querySelectorAll('[data-item]')].map(readCard).filter((it) => it.sku); }
  function setCard(card, it) { READ_KEYS.forEach((k) => { const el = card.querySelector('[data-f="' + k + '"]'); if (el) el.value = it[k] === null || it[k] === undefined ? '' : it[k]; }); recalcCard(card, false); lookupSku(card, it.sku, true); }

  function recalcCard(card, overwrite) {
    const it = readCard(card);
    const c = calcLine({ qty: it.qty, grams: it.grams, supPrice: it.sup_price, pancakePrice: it.pancake_price });
    card.querySelector('[data-total-g]').textContent = c.totalGrams ? weight(c.totalGrams) : '—';
    if (overwrite) {
      card.querySelector('[data-f="est_sales"]').value = c.estSales === null ? '' : c.estSales.toFixed(2);
      card.querySelector('[data-f="purchased_amount"]').value = c.purchased === null ? '' : c.purchased.toFixed(2);
      card.querySelector('[data-f="profit"]').value = c.profit === null ? '' : c.profit.toFixed(2);
    }
    refreshFlags(card);
  }
  function refreshFlags(card) {
    const it = readCard(card);
    const known = card.dataset.known === '1';
    const warn = lineWarnings({ sku: it.sku, qty: it.qty, grams: it.grams, supPrice: it.sup_price, pancakePrice: it.pancake_price }, known || !it.sku || card.dataset.checked !== '1', histOf(it.sku));
    const extra = card.dataset.caseVariant ? ['This SKU matches “' + card.dataset.caseVariant + '” in the catalog apart from letter case — pick it from the list so a duplicate SKU is not created'] : [];
    card.querySelector('[data-flags]').innerHTML = it.sku && card.dataset.checked === '1' ? (known ? '<span class="badge lv-green">EXISTING SKU</span>' : '<span class="badge lv-orange im-newsku">NEW SKU</span>') : '';
    card.querySelector('[data-warn]').innerHTML = [...extra, ...warn].map((w) => '<div class="im-warn-line">⚠ ' + esc(w) + '</div>').join('');
    updateSummary();
  }
  function updateSummary() {
    const cards = [...itemsBox.querySelectorAll('[data-item]')];
    const rows = cards.map((c) => ({ it: readCard(c), isNew: c.dataset.checked === '1' && c.dataset.known !== '1' })).filter((x) => x.it.sku);
    const pcs = rows.reduce((s, x) => s + (x.it.qty || 0), 0);
    const purchased = rows.reduce((s, x) => s + (x.it.purchased_amount || 0), 0);
    const est = rows.reduce((s, x) => s + (x.it.est_sales || 0), 0);
    const grams = rows.reduce((s, x) => s + (x.it.qty && x.it.grams ? x.it.qty * x.it.grams : 0), 0);
    const profit = rows.reduce((s, x) => s + (x.it.profit || 0), 0);
    const newN = rows.filter((x) => x.isNew).length;
    $('#im-pf-sum').innerHTML = [['SKUs', num(rows.length)], ['Total pcs', num(pcs)], ['Total grams', grams ? weight(grams) : '—'], ['Total purchased', money(purchased)], ['Est. sales', est ? money(est) : '—'], ['Expected profit', est || purchased ? money(profit) : '—'], ['New SKUs', num(newN)]]
      .map(([l, v]) => '<div><div class="muted">' + l + '</div><b>' + v + '</b></div>').join('');
  }

  const lookups = new WeakMap();
  function lookupSku(card, sku, silent) {
    const q = String(sku || '').trim();
    const note = card.querySelector('[data-sku-note]');
    card.dataset.known = '0'; card.dataset.checked = '0'; delete card.dataset.caseVariant;
    if (!q) { note.textContent = ''; refreshFlags(card); return; }
    const token = (lookups.get(card) || 0) + 1; lookups.set(card, token);
    api.searchProducts(q).then((rs) => {
      if (lookups.get(card) !== token) return;
      const exact = rs.find((p) => p.sku === q);
      const variant = !exact && rs.find((p) => p.sku.toLowerCase() === q.toLowerCase());
      card.dataset.checked = '1';
      if (exact) { card.dataset.known = '1'; note.textContent = 'In the catalog: ' + exact.item_name; if (!silent) fillFromProduct(card, exact); }
      else { if (variant) card.dataset.caseVariant = variant.sku; note.textContent = ''; }
      refreshFlags(card);
    }).catch(() => { /* a failed look-up must not stop someone typing a SKU by hand */ if (lookups.get(card) === token) { card.dataset.checked = '0'; refreshFlags(card); } });
  }
  function fillFromProduct(card, p) {
    const set = (k, v) => { const el = card.querySelector('[data-f="' + k + '"]'); if (el && v !== null && v !== undefined && el.value === '') el.value = v; };
    set('product_name', p.item_name); set('category', p.category); set('pancake_price', p.system_selling_price); set('grams', p.gross_weight_g);
    recalcCard(card, true);
  }

  function wireCard(card) {
    const sku = card.querySelector('[data-f="sku"]'); const sug = card.querySelector('[data-suggest]'); let timer = null; let tok = 0;
    const hide = () => { sug.hidden = true; sug.innerHTML = ''; };
    sku.addEventListener('input', () => {
      clearTimeout(timer);
      const q = sku.value.trim();
      card.dataset.known = '0'; card.dataset.checked = '0'; delete card.dataset.caseVariant; card.querySelector('[data-sku-note]').textContent = '';
      if (!q) { hide(); refreshFlags(card); return; }
      timer = setTimeout(async () => {
        const my = ++tok;
        try {
          const rs = await api.searchProducts(q);
          if (my !== tok) return;
          card.dataset.checked = '1';
          const exact = rs.find((p) => p.sku === q);
          const variant = !exact && rs.find((p) => p.sku.toLowerCase() === q.toLowerCase());
          if (exact) { card.dataset.known = '1'; card.querySelector('[data-sku-note]').textContent = 'In the catalog — edit anything that changed: ' + exact.item_name; fillFromProduct(card, exact); }
          else if (variant) card.dataset.caseVariant = variant.sku;
          if (rs.length) {
            sug.innerHTML = rs.slice(0, 12).map((p, i) => '<div class="im-sug" data-i="' + i + '"><b>' + esc(p.sku) + '</b> — ' + esc(p.item_name) + '</div>').join('');
            sug.hidden = false;
            sug.querySelectorAll('.im-sug').forEach((row) => row.addEventListener('mousedown', (ev) => {
              ev.preventDefault(); const p = rs[Number(row.dataset.i)];
              sku.value = p.sku; card.dataset.known = '1'; card.dataset.checked = '1'; delete card.dataset.caseVariant;
              card.querySelector('[data-sku-note]').textContent = 'In the catalog — edit anything that changed: ' + p.item_name;
              fillFromProduct(card, p); hide(); refreshFlags(card);
            }));
          } else hide();
          refreshFlags(card);
        } catch (e) { card.dataset.checked = '0'; hide(); refreshFlags(card); }
      }, 200);
    });
    sku.addEventListener('blur', () => setTimeout(hide, 150));
    ['qty', 'grams', 'sup_price', 'pancake_price'].forEach((k) => card.querySelector('[data-f="' + k + '"]').addEventListener('input', () => recalcCard(card, true)));
    ['product_name', 'category', 'availed_factory_gram', 'purchased_amount', 'est_sales', 'profit', 'tag_note'].forEach((k) => card.querySelector('[data-f="' + k + '"]').addEventListener('input', () => refreshFlags(card)));
    card.querySelector('[data-remove]').addEventListener('click', () => { if (itemsBox.querySelectorAll('[data-item]').length <= 1) return; card.remove(); updateRemove(); updateSummary(); });
  }
  function addCard(it) {
    const w = document.createElement('div'); w.innerHTML = itemCardHtml(itemsBox.querySelectorAll('[data-item]').length + 1);
    const card = w.firstElementChild; itemsBox.appendChild(card); wireCard(card); updateRemove();
    if (it) setCard(card, it);
    updateSummary();
    return card;
  }
  $('#im-pf-add').addEventListener('click', () => { const c = addCard(); c.querySelector('[data-f="sku"]').focus(); });

  // ---------------------------------------------------------------- files
  function renderFiles() {
    $('#im-pf-serverfiles').innerHTML = st.serverFiles && st.serverFiles.length ? '<div class="muted" style="font-size:11px;">Already attached</div>' + filesHtml(st.serverFiles) : '';
    wireFiles($('#im-pf-serverfiles'), api, ctx.toast);
    $('#im-pf-pendingfiles').innerHTML = st.pendingFiles.length ? '<div class="muted" style="font-size:11px;">Will be uploaded</div>' + st.pendingFiles.map((f, i) =>
      '<div class="lv-doc"><div><b>' + esc(f.file.name) + '</b><div class="muted" style="font-size:11px;">' + esc(fileTypeLabel(f.type)) + ' · ' + Math.max(1, Math.round(f.file.size / 1024)) + ' KB</div></div>' +
      '<div class="lv-doc-actions"><button type="button" class="btn small secondary" data-drop-file="' + i + '">Remove</button></div></div>').join('') : '';
    panel.querySelectorAll('[data-drop-file]').forEach((b) => b.addEventListener('click', () => { st.pendingFiles.splice(Number(b.dataset.dropFile), 1); renderFiles(); }));
  }
  $('#im-pf-file').addEventListener('change', (ev) => {
    for (const f of ev.target.files) {
      if (f.size > 15 * 1024 * 1024) { ctx.toast(f.name + ' is bigger than 15 MB.', true); continue; }
      st.pendingFiles.push({ file: f, type: $('#im-pf-ftype').value });
    }
    ev.target.value = ''; renderFiles();
  });

  // ---------------------------------------------------------------- editing banner / loading a request into the form
  function showEditing() {
    const box = $('#im-pf-editing');
    if (!st.requestId) { box.innerHTML = ''; $('#im-pf-cancel').hidden = true; $('#im-pf-new').hidden = true; return; }
    box.innerHTML = banner(st.status === 'RETURNED FOR CORRECTION' ? 'blue' : 'gray', '<b>Editing ' + esc(st.requestNumber) + '</b> ' + reqBadge(st.status) +
      (st.status === 'RETURNED FOR CORRECTION' && st.returnedReason ? '<div class="im-returned" style="margin-top:6px;">The Final Approver asked: ' + esc(st.returnedReason) + '</div>' : ''));
    $('#im-pf-cancel').hidden = false; $('#im-pf-new').hidden = false;
    $('#im-pf-review').innerHTML = st.status === 'RETURNED FOR CORRECTION' ? (ctx.who.isApprover ? 'Review &amp; resubmit &amp; approve' : 'Review &amp; resubmit for approval') : $('#im-pf-review').innerHTML;
  }
  function loadRequest(res) {
    const r = res.request;
    st.requestId = r.id; st.requestNumber = r.request_number; st.status = r.status; st.returnedReason = r.return_for_correction_reason || ''; st.serverFiles = res.files || []; st.pendingFiles = [];
    if ($('#im-pf-branch')) $('#im-pf-branch').value = String(r.branch_id);
    $('#im-pf-date').value = r.date_delivered; $('#im-pf-pergram').value = r.current_per_gram === null ? '' : r.current_per_gram; $('#im-pf-notes').value = r.notes || '';
    itemsBox.innerHTML = '';
    (res.items || []).forEach((it) => addCard({ sku: it.sku, product_name: it.product_name, category: it.category, qty: it.qty, sup_price: it.sup_price, pancake_price: it.pancake_price, grams: it.grams,
      availed_factory_gram: it.availed_factory_gram, est_sales: it.est_sales, purchased_amount: it.purchased_amount, profit: it.profit, tag_note: it.tag_note }));
    if (!itemsBox.children.length) addCard();
    showEditing(); renderFiles(); updateSummary();
  }

  // ---------------------------------------------------------------- validating, saving, uploading
  function formValues() {
    const items = readItems();
    return { branchId: Number($('#im-pf-branch').value) || null, date: $('#im-pf-date').value, perGram: $('#im-pf-pergram').value === '' ? '' : Number($('#im-pf-pergram').value), notes: $('#im-pf-notes').value.trim(), items };
  }
  function problem(v, forSubmit) {
    if (!v.branchId) return 'Choose the branch the delivery is for.';
    if (!v.date) return 'Date delivered is required.';
    if (!v.items.length) return 'Add at least one item (SKU).';
    const bad = v.items.find((it) => !it.qty || it.qty <= 0);
    if (bad) return 'Pcs must be a positive number for ' + bad.sku + '.';
    const dup = v.items.find((it, i) => v.items.findIndex((x) => x.sku === it.sku) !== i);
    if (dup && forSubmit) return 'The SKU ' + dup.sku + ' is on two cards — put its pieces on one card.';
    return '';
  }
  async function persist(v) {
    // a request that is already with the approver (an earlier "submit & approve" that stopped half-way) is not saved again: it is read-only now
    if (st.requestId && st.status === 'PENDING FINAL APPROVAL') return { request_id: st.requestId, request_number: st.requestNumber, status: st.status };
    const res = await api.requestSave({ clientId: st.clientId, requestId: st.requestId, branchId: v.branchId, date: v.date, perGram: v.perGram, notes: v.notes, items: v.items });
    st.requestId = res.request_id; st.requestNumber = res.request_number; st.status = res.status;
    // upload what was picked, then register it; a file that fails stays in the list so it can be tried again
    const failed = [];
    for (const pf of st.pendingFiles.slice()) {
      try {
        const path = 'R' + st.requestId + '/' + uuid().slice(0, 8) + '-' + safeName(pf.file.name);
        await api.uploadFile(path, pf.file);
        const added = await api.fileAdd(st.requestId, null, pf.type, pf.file.name, path, pf.file.type, pf.file.size);
        void added;
        st.pendingFiles.splice(st.pendingFiles.indexOf(pf), 1);
        (st.serverFiles = st.serverFiles || []).push({ id: 0, file_type: pf.type, file_name: pf.file.name, file_path: path, content_type: pf.file.type, uploaded_by_name: me.full_name, created_at: new Date().toISOString() });
      } catch (err) { failed.push(pf.file.name + ': ' + friendly(err)); }
    }
    renderFiles(); showEditing();
    if (failed.length) throw new Error('The request was saved, but these files did not upload — ' + failed.join('; '));
    return res;
  }

  $('#im-pf-draft').addEventListener('click', async () => {
    const v = formValues(); const p = problem(v, false);
    if (p) { ctx.toast(p, true); return; }
    const btn = $('#im-pf-draft'); btn.disabled = true;
    try { const res = await persist(v); ctx.toast('Draft saved as ' + res.request_number + '. It is not sent to the approver yet.', false); await ctx.reload('approvals'); }
    catch (err) { ctx.toast(err, true); } finally { btn.disabled = false; }
  });

  $('#im-pf-cancel').addEventListener('click', async () => {
    if (!st.requestId) return;
    const m = showModal({ title: 'Cancel ' + st.requestNumber + '?', body: '<p>This request will be cancelled. Nothing is added to stock either way. The record stays in the history.</p><div class="field"><label>Reason (optional)</label><input type="text" id="im-cancel-why"></div>',
      buttons: [{ label: 'Keep it', kind: 'secondary' }, { label: 'Cancel the request', kind: 'danger', onClick: async (mm) => { await api.requestCancel(st.requestId, mm.el.querySelector('#im-cancel-why').value); mm.close(); ctx.toast(st.requestNumber + ' was cancelled.', false); resetForm(); await ctx.reload('approvals'); } }] });
    void m;
  });
  $('#im-pf-new').addEventListener('click', () => resetForm());

  function resetForm() {
    ctx.ui.form = { clientId: uuid(), requestId: null, requestNumber: '', status: '', returnedReason: '', pendingFiles: [], serverFiles: [], saved: null, done: null };
    renderForm(ctx, panel, {});
  }

  // ---------------------------------------------------------------- review, then submit (and, for the owner, approve)
  $('#im-pf-review').addEventListener('click', () => {
    const v = formValues(); const p = problem(v, true);
    if (p) { ctx.toast(p, true); return; }
    const branchName = ctx.branchById[v.branchId] || '';
    const cards = [...itemsBox.querySelectorAll('[data-item]')].filter((c) => readCard(c).sku);
    const rows = cards.map((c) => ({ it: readCard(c), isNew: c.dataset.checked === '1' && c.dataset.known !== '1', unchecked: c.dataset.checked !== '1' }));
    const pcs = rows.reduce((s, x) => s + x.it.qty, 0), purchased = rows.reduce((s, x) => s + (x.it.purchased_amount || 0), 0), est = rows.reduce((s, x) => s + (x.it.est_sales || 0), 0);
    const grams = rows.reduce((s, x) => s + (x.it.qty && x.it.grams ? x.it.qty * x.it.grams : 0), 0), profit = rows.reduce((s, x) => s + (x.it.profit || 0), 0);
    const newN = rows.filter((x) => x.isNew).length;
    const approver = ctx.who.isApprover;
    const body = '<div class="im-rv-sum">' + [['Branch', esc(branchName)], ['Delivery date', esc(v.date)], ['Rate per gram', v.perGram === '' ? '—' : money(v.perGram)], ['Number of SKUs', num(rows.length)], ['Total pieces', num(pcs)],
        ['Total grams', grams ? weight(grams) : '—'], ['Total purchased', money(purchased)], ['Total estimated sales', est ? money(est) : '—'], ['Expected profit', est || purchased ? money(profit) : '—'], ['New SKUs', num(newN)]]
        .map(([l, val]) => '<div><span class="muted">' + l + '</span><b>' + val + '</b></div>').join('') + '</div>' +
      (newN ? banner('amber', '<b>' + plural(newN, 'new SKU') + '</b> — the Final Approver will check these against the catalog before approving.') : '') +
      '<div class="im-rv-items">' + rows.map(({ it, isNew }) => {
        const w = lineWarnings({ sku: it.sku, qty: it.qty, grams: it.grams, supPrice: it.sup_price, pancakePrice: it.pancake_price }, !isNew, histOf(it.sku));
        return '<div class="im-rv-item"><div><b>SKU: ' + esc(it.sku) + '</b> ' + (isNew ? '<span class="badge lv-orange im-newsku">NEW SKU</span>' : '') + '</div>' +
          '<div class="muted">' + esc(it.product_name || '') + (it.category ? ' · ' + esc(it.category) : '') + '</div>' +
          '<div class="im-rv-line"><span>Qty: <b>' + num(it.qty) + '</b></span><span>Sup. price: <b>' + money(it.sup_price) + '</b></span><span>Pancake price: <b>' + money(it.pancake_price) + '</b></span>' +
          '<span>Purchased: <b>' + money(it.purchased_amount) + '</b></span><span>Est. sales: <b>' + money(it.est_sales) + '</b></span><span>Profit: <b>' + money(it.profit) + '</b></span></div>' +
          w.filter((x) => !/^NEW SKU/.test(x)).map((x) => '<div class="im-warn-line">⚠ ' + esc(x) + '</div>').join('') + '</div>';
      }).join('') + '</div>' +
      ((st.pendingFiles.length || (st.serverFiles || []).length) ? '<p class="muted">Attachments: ' + (st.pendingFiles.length + (st.serverFiles || []).length) + ' file(s)</p>' : '<p class="muted">No proof attached — you can still submit.</p>') +
      (approver ? '<p class="muted">You are the Final Approver: <b>Submit &amp; approve</b> posts this stock now.</p>' : '<p class="muted">No stock is added yet. The Final Approver is notified and decides.</p>');

    showModal({
      title: 'REVIEW FACTORY PURCHASE', wide: true, body,
      buttons: [
        { label: 'BACK TO EDIT', kind: 'secondary' },
        { label: approver ? 'SUBMIT & APPROVE' : (st.status === 'RETURNED FOR CORRECTION' ? 'RESUBMIT FOR APPROVAL' : 'SUBMIT FOR APPROVAL'), kind: 'primary', onClick: async (m) => {
          const vv = formValues(); const pp = problem(vv, true); if (pp) throw new Error(pp);
          const res = await persist(vv);
          const sub = await api.requestSubmit(res.request_id);
          st.status = sub.status;
          if (approver) {
            const ap = await api.requestApprove(res.request_id);
            m.close(); showPostingResults(ctx, ap, res.request_number);
            ctx.ui.form = { clientId: uuid(), requestId: null, requestNumber: '', status: '', returnedReason: '', pendingFiles: [], serverFiles: [], saved: null, done: null };
            await ctx.reload('all'); renderForm(ctx, panel, {}); return;
          }
          m.close();
          ctx.ui.form = { clientId: uuid(), requestId: null, requestNumber: '', status: '', returnedReason: '', pendingFiles: [], serverFiles: [], saved: null, done: { id: res.request_id, number: res.request_number, status: sub.status } };
          await ctx.reload('approvals'); renderForm(ctx, panel, {});
        } },
      ],
    });
  });

  // ---------------------------------------------------------------- opening a draft / returned request, and what to show after a submit
  panel.querySelectorAll('[data-open-draft]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try { const res = await api.requestGet(Number(b.dataset.openDraft)); loadRequest(res); panel.querySelector('.im-form-card').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    catch (err) { ctx.toast(err, true); b.disabled = false; }
  }));

  panel.querySelectorAll('[data-view-req]').forEach((b) => b.addEventListener('click', () => ctx.openRequest(Number(b.dataset.viewReq))));

  // start from: a request the caller asked to continue, the form as it was left, or a clean form
  const doneInfo = st.done; st.done = null;                       // shown at the end, after the form has been set up (setting up clears the "editing" banner)
  if (opts && opts.requestId) {
    api.requestGet(opts.requestId).then(loadRequest).catch((err) => ctx.toast(err, true));
    addCard();
  } else if (st.saved) {
    if ($('#im-pf-branch')) $('#im-pf-branch').value = st.saved.branchId || $('#im-pf-branch').value;
    $('#im-pf-date').value = st.saved.date || todayManila(); $('#im-pf-pergram').value = st.saved.perGram; $('#im-pf-notes').value = st.saved.notes || '';
    (st.saved.items.length ? st.saved.items : [null]).forEach((it) => addCard(it));
    showEditing(); st.saved = null;
  } else {
    addCard(); showEditing();
  }
  renderFiles(); updateSummary();
  if (doneInfo) {
    $('#im-pf-editing').innerHTML = banner('green', '<b>' + esc(doneInfo.number) + ' was submitted.</b> ' + reqBadge(doneInfo.status) + ' The Final Approver has been notified. No stock moves until it is approved. ' +
      '<button type="button" class="btn small" data-view-done>View request</button>');
    $('#im-pf-editing').querySelector('[data-view-done]').addEventListener('click', () => ctx.openRequest(doneInfo.id));
  }

  // remember the form when the person goes to another tab (leaving does not lose what was typed)
  ctx.ui.formLeave = () => {
    if (!panel.querySelector('#im-pf')) return;
    const v = formValues();
    const hasContent = v.items.length || v.notes || v.perGram !== '';
    st.saved = hasContent || st.requestId ? { branchId: v.branchId, date: v.date, perGram: v.perGram, notes: v.notes, items: [...itemsBox.querySelectorAll('[data-item]')].map(readCard) } : null;
  };
}

/** The result of an approval: what posted and what failed, never hidden. */
export function showPostingResults(ctx, res, number) {
  const results = res.results || [];
  const ok = results.filter((r) => r.ok), bad = results.filter((r) => !r.ok);
  const body = '<p><b>' + esc(res.request_number || number || '') + '</b> — status <b>' + esc(res.status || '') + '</b>' + (res.already ? ' (it was already posted — nothing was added twice)' : '') + '</p>' +
    (ok.length ? '<h4 class="im-h">Successful</h4><ul class="im-res">' + ok.map((r) => '<li>' + esc(r.sku) + ' — ' + num(r.qty) + ' pcs added (purchase #' + esc(r.purchase_id) + ')</li>').join('') + '</ul>' : '') +
    (bad.length ? '<h4 class="im-h">Failed — not posted</h4><ul class="im-res im-res-bad">' + bad.map((r) => '<li><b>' + esc(r.sku) + '</b> — ' + esc(r.error) + '</li>').join('') + '</ul><p class="muted">The failed items did not change any stock. Open the request to retry them or discard them.</p>' : '') +
    (!results.length && !res.already ? '<p class="muted">Nothing needed posting.</p>' : '');
  showModal({ title: 'POSTING RESULTS', body, buttons: [{ label: 'Close', kind: 'secondary' }, { label: 'Open the request', kind: 'primary', onClick: (m) => { m.close(); ctx.openRequest(res.request_id); } }] });
}
