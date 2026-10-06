// Assets & Supplies Custodian -- the Supply Issuance tab and the Issue Supplies form. Issuing hands supplies to an employee or a department and
// takes them out of one branch's stock: the stock is re-checked and locked by the database at the moment of issuing, so two people issuing the
// last box at the same time cannot both succeed, and stock never goes negative. Only an Admin or Manager can issue more than the system shows —
// with a written reason, and the difference is recorded as a stock correction in the ledger.
import { esc, plural, field, opts, qty, dt, emptyBox, branchName, branchChip, openDrawer, closeDrawer, drawerBody, friendly, errorsText, val, personOptions, branchOptions, fmtDateTime } from './assetsUi.js?v=20261007g';
import { uniqueSorted, stockOf, dayOf } from './assetsLogic.js?v=20261007g';
import { exportIssuances } from './assetsReports.js?v=20261007g';
import { exportMenu, pagerHtml } from './assetsList.js?v=20261007g';
import { flagInvalid } from './uiKit.js?v=20261007g';

const $ = (id) => document.getElementById(id);
export const newIssuanceState = () => ({ q: '', branch: '', dept: '', from: '', to: '', page: 1, pageSize: 50 });
const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2));
const myBranches = (ctx) => (ctx.caps.viewAll ? ctx.branches : ctx.branches.filter((b) => b.id === ctx.employee.branch_id));

export function visibleIssuances(ctx) {
  const t = ctx.ui.issuance, s = t.q.trim().toLowerCase();
  return ctx.data.issuances.filter((i) => {
    const day = dayOf(i.issued_at);
    if (t.branch && String(i.branch_id) !== String(t.branch)) return false;
    if (t.dept && (i.department || '') !== t.dept) return false;
    if (t.from && day < t.from) return false;
    if (t.to && day > t.to) return false;
    if (!s) return true;
    return [i.issuance_number, i.department, ctx.names[i.employee_id], ctx.names[i.issued_by], ctx.names[i.received_by], i.purpose, ...(i.supply_issuance_items || []).map((x) => (ctx.supplyById.get(x.supply_id) || {}).name)].join(' ').toLowerCase().includes(s);
  });
}
const itemsText = (ctx, i) => (i.supply_issuance_items || []).map((x) => { const s = ctx.supplyById.get(x.supply_id) || {}; return (s.name || 'Supply #' + x.supply_id) + ' × ' + qty(x.quantity) + (s.unit ? ' ' + s.unit : ''); }).join(', ');

export function renderIssuance(ctx, panel) {
  const t = ctx.ui.issuance, c = ctx.caps, rows = visibleIssuances(ctx), pages = Math.max(1, Math.ceil(rows.length / t.pageSize));
  if (t.page > pages) t.page = pages;
  const pageRows = rows.slice((t.page - 1) * t.pageSize, t.page * t.pageSize), depts = uniqueSorted(ctx.data.issuances.map((i) => i.department));
  const tr = (i) => '<tr><td data-label="Issued"><b>' + esc(i.issuance_number) + '</b><div class="muted bl-sub">' + esc(fmtDateTime(i.issued_at)) + '</div></td><td data-label="From">' + branchChip(ctx, i.branch_id) + '</td>' +
    '<td data-label="For">' + esc([ctx.names[i.employee_id], i.department].filter(Boolean).join(' · ') || '—') + (i.purpose ? '<div class="muted bl-sub">' + esc(i.purpose) + '</div>' : '') + '</td><td data-label="Items" class="full-row">' + esc(itemsText(ctx, i)) + (i.override_reason ? '<div class="bl-sub"><b>Stock corrected:</b> ' + esc(i.override_reason) + '</div>' : '') + '</td>' +
    '<td data-label="Issued by">' + esc(ctx.names[i.issued_by] || '—') + '</td><td data-label="Received by">' + esc(ctx.names[i.received_by] || '—') + '</td><td data-label="Request">' + (i.request_id ? '<button type="button" class="bl-link" data-req="' + i.request_id + '">' + esc((ctx.data.requests.find((r) => r.id === i.request_id) || {}).request_number || 'request') + '</button>' : '—') + '</td>' +
    '<td class="full-row"><div class="bl-rowact"><button type="button" class="btn small secondary" data-slip="' + i.id + '">Print slip</button></div></td></tr>';
  panel.innerHTML = '<div id="ac-is"><div class="card bl-toolbar"><div class="bl-toolrow"><div class="field bl-grow"><label>Search</label><input type="search" id="ac-is-q" placeholder="Number, person, department, supply…" value="' + esc(t.q) + '"></div>' +
    field('Branch', '<select id="ac-is-br">' + opts(ctx.branches.map((b) => ({ value: b.id, label: b.name })), t.branch, 'All') + '</select>') + field('Department', '<select id="ac-is-dept">' + opts(depts, t.dept, 'All') + '</select>') +
    field('From', '<input type="date" id="ac-is-from" value="' + esc(t.from) + '">') + field('To', '<input type="date" id="ac-is-to" value="' + esc(t.to) + '">') +
    '<div class="field"><label>&nbsp;</label><div class="bl-btnrow">' + (c.canExport || c.reports ? exportMenu() : '') + (c.sIssue ? '<button type="button" class="btn small" id="ac-is-new">+ Issue Supplies</button>' : '') + '</div></div></div></div>' +
    '<div class="bl-summary"><b>' + plural(rows.length, 'issuance') + '</b><span>Items issued <b>' + qty(rows.reduce((s, i) => s + (i.supply_issuance_items || []).reduce((a, x) => a + Number(x.quantity), 0), 0)) + '</b></span><span class="muted">Each issuance takes the supplies out of one branch’s stock and is listed in the ledger.</span></div>' +
    (rows.length ? '<div class="table-scroll table-2col bl-tablewrap"><table class="bl-table"><thead><tr><th>Issuance</th><th>From</th><th>For</th><th>Items</th><th>Issued by</th><th>Received by</th><th>Request</th><th></th></tr></thead><tbody>' + pageRows.map(tr).join('') + '</tbody></table></div>' + pagerHtml(t, rows.length, pages, 'ac-is') : emptyBox('No supplies have been issued' + (ctx.data.issuances.length ? ' that match these filters' : ' yet') + '.')) + '</div>';
  const root = $('ac-is'), redraw = () => ctx.rerender();
  let st = null;
  $('ac-is-q').addEventListener('input', (e) => { clearTimeout(st); st = setTimeout(() => { t.q = e.target.value; t.page = 1; redraw(); const s = $('ac-is-q'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 300); });
  [['ac-is-br', 'branch'], ['ac-is-dept', 'dept'], ['ac-is-from', 'from'], ['ac-is-to', 'to']].forEach(([id, k]) => $(id).addEventListener('change', (e) => { t[k] = e.target.value; t.page = 1; redraw(); }));
  if ($('ac-is-new')) $('ac-is-new').addEventListener('click', () => ctx.openIssueForm({}));
  root.querySelectorAll('[data-req]').forEach((el) => el.addEventListener('click', () => ctx.openRequest(Number(el.dataset.req))));
  root.querySelectorAll('[data-slip]').forEach((el) => el.addEventListener('click', () => ctx.print.issueSlip(Number(el.dataset.slip))));
  root.querySelectorAll('[data-page]').forEach((el) => el.addEventListener('click', () => { t.page = Math.max(1, Math.min(pages, t.page + Number(el.dataset.page))); redraw(); }));
  if ($('ac-is-pagesize')) $('ac-is-pagesize').addEventListener('change', (e) => { t.pageSize = Number(e.target.value); t.page = 1; redraw(); });
  root.querySelectorAll('[data-exp]').forEach((el) => el.addEventListener('click', async () => { el.closest('details').open = false; try { await exportIssuances(ctx, rows, el.dataset.exp); } catch (err) { ctx.toast(err, true); } }));
}

// ================================================================ the Issue Supplies form
export function openIssueForm(ctx, { supply, request } = {}) {
  if (!ctx.caps.sIssue) { ctx.toast('Only someone with the issue permission can hand out supplies.', true); return; }
  const key = newKey(), brs = myBranches(ctx), mgr = ctx.caps.mgr;
  const req = request ? ctx.data.requests.find((r) => r.id === request) : null;
  const reqItems = req ? (req.supply_request_items || []).map((x) => ({ ...x, left: Number(x.approved_qty || 0) - Number(x.issued_qty || 0) })).filter((x) => x.left > 0) : [];
  const branch = req ? req.branch_id : ctx.employee.branch_id || (brs[0] || {}).id;
  const body = '<div id="ac-form-msg"></div><div id="ac-form-errors"></div>' + (req ? '<div class="msg lv-note">Issuing against request <b>' + esc(req.request_number) + '</b> (' + esc(ctx.names[req.requested_by] || '') + '). Only the approved quantities that are still outstanding can be issued.</div>' : '') +
    '<div class="bl-formgrid">' + field('Take from *', '<select id="ac-iss-br">' + branchOptions({ ...ctx, branches: req ? ctx.branches : brs }, branch, (req ? ctx.branches : brs).length > 1 ? 'Choose…' : undefined) + '</select>') +
    field('For employee', '<select id="ac-iss-emp">' + personOptions(ctx, { selected: req ? req.requested_by : '', any: '— none —' }) + '</select>') + field('…and / or department', '<input type="text" id="ac-iss-dept" maxlength="80" list="ac-iss-depts" value="' + esc(req ? req.department || '' : '') + '"><datalist id="ac-iss-depts">' + uniqueSorted([...ctx.departments, ...ctx.data.issuances.map((i) => i.department)]).map((d) => '<option value="' + esc(d) + '">').join('') + '</datalist>') +
    field('Received by', '<select id="ac-iss-recv">' + personOptions(ctx, { any: 'Same person' }) + '</select>') + '</div>' + field('Purpose', '<input type="text" id="ac-iss-purpose" maxlength="200" value="' + esc(req ? req.purpose || '' : '') + '" placeholder="What the supplies are for">') +
    '<h4 class="rf-sub">Items</h4><div id="ac-iss-lines"></div>' + (req ? '' : '<p><button type="button" class="btn small secondary" id="ac-iss-add">+ Add another supply</button></p>') +
    '<div id="ac-iss-warn"></div><div id="ac-iss-over" class="msg lv-warn" hidden><b>Not enough stock for a line.</b> As an Admin or Manager you may issue anyway if the system count is behind. Write why — the difference is recorded as a stock correction.' + field('Reason *', '<textarea id="ac-iss-reason" rows="2" maxlength="300"></textarea>') + '</div>' + field('Notes', '<input type="text" id="ac-iss-notes" maxlength="200">');
  openDrawer('form', { title: 'Issue Supplies', sub: req ? req.request_number : 'Hand supplies to an employee or a department', body, footer: '<button type="button" class="btn" id="ac-iss-ok">Issue</button><button type="button" class="btn secondary" id="ac-iss-x">Cancel</button>' });
  const lines = $('ac-iss-lines'), errB = (h) => { $('ac-form-errors').innerHTML = h ? '<div class="msg error">' + h + '</div>' : ''; if (h) drawerBody('form').scrollTop = 0; };
  const sOpts = (sel) => '<option value="">Choose a supply…</option>' + ctx.supplyList.filter((s) => s.active).map((s) => '<option value="' + s.id + '"' + (String(sel) === String(s.id) ? ' selected' : '') + '>' + esc(s.name) + ' (' + esc(s.unit) + ')</option>').join('');
  const addLine = (sel, q, max) => { const d = document.createElement('div'); d.className = 'ac-line'; d.innerHTML = '<select data-k="s"' + (req ? ' disabled' : '') + '>' + sOpts(sel) + '</select><input type="number" data-k="q" min="0.01" step="0.01" inputmode="decimal" placeholder="Quantity"' + (max ? ' max="' + max + '"' : '') + ' value="' + esc(q || '') + '"><span class="ac-stockhint" data-k="h"></span>' + (req ? '' : '<button type="button" class="btn small secondary" data-k="x" aria-label="Remove this line">✕</button>'); const x = d.querySelector('[data-k="x"]'); if (x) x.addEventListener('click', () => { if (lines.children.length > 1) { d.remove(); sync(); } }); d.querySelectorAll('select,input').forEach((i) => i.addEventListener('input', sync)); lines.appendChild(d); };
  const read = () => [...lines.children].map((d) => ({ supply_id: Number(d.querySelector('[data-k="s"]').value), quantity: d.querySelector('[data-k="q"]').value, el: d }));
  const sync = () => {
    const br = Number(val('ac-iss-br')); let short = false;
    read().forEach((l) => { const h = l.el.querySelector('[data-k="h"]'), have = l.supply_id && br ? stockOf(ctx, l.supply_id, br) : null, q = Number(l.quantity); const unit = (ctx.supplyById.get(l.supply_id) || {}).unit || '';
      h.innerHTML = have === null ? '' : 'in stock: <b>' + qty(have) + '</b> ' + esc(unit) + (q > 0 ? ' → <b class="' + (q > have ? 'lv-neg' : '') + '">' + qty(have - q) + '</b>' : ''); if (q > have && have !== null) short = true; });
    $('ac-iss-over').hidden = !(short && mgr);
    $('ac-iss-warn').innerHTML = short && !mgr ? '<div class="msg error">Not enough stock for a line. Receive more stock, or issue less.</div>' : '';
  };
  if (req) reqItems.forEach((x) => addLine(x.supply_id, x.left, x.left)); else addLine(supply || '');
  if ($('ac-iss-add')) $('ac-iss-add').addEventListener('click', () => addLine(''));
  $('ac-iss-br').addEventListener('input', sync); sync();
  $('ac-iss-x').addEventListener('click', () => closeDrawer('form'));
  $('ac-iss-ok').addEventListener('click', async () => {
    errB(''); const items = read().filter((l) => l.supply_id || l.quantity);
    if (!val('ac-iss-br')) { flagInvalid($('ac-iss-br')); return errB('Choose the branch the supplies come from.'); }
    if (!val('ac-iss-emp') && !val('ac-iss-dept').trim()) { flagInvalid($('ac-iss-emp')); return errB('Say who the supplies are for — an employee or a department.'); }
    if (!items.length || items.some((l) => !l.supply_id || !(Number(l.quantity) > 0))) return errB('Choose a supply and a quantity on every line.');
    $('ac-iss-ok').disabled = true;
    try {
      const p = { branch_id: Number(val('ac-iss-br')), employee_id: val('ac-iss-emp') || null, department: val('ac-iss-dept').trim() || null, received_by: val('ac-iss-recv') || null, purpose: val('ac-iss-purpose').trim() || null, notes: val('ac-iss-notes').trim() || null,
        items: items.map((l) => ({ supply_id: l.supply_id, quantity: l.quantity })), client_key: key };
      if (req) p.request_id = req.id;
      if (!$('ac-iss-over').hidden) p.override_reason = val('ac-iss-reason').trim();
      const res = await ctx.api.issueSupplies(p);
      if (res && res.ok === false) { if (res.needs_override) { $('ac-iss-over').hidden = false; } errB(esc(errorsText(res))); $('ac-iss-ok').disabled = false; return; }
      closeDrawer('form');
      const low = (res.low_stock || []).map((x) => x.name + (x.out ? ' is now OUT of stock' : ' is running low (' + qty(x.balance) + ' left)'));
      await ctx.afterChange(res.replay ? res.message : res.issuance_number + ' issued.' + (res.stock_corrected ? ' The stock count was corrected.' : '') + (low.length ? ' ' + low.join('; ') + '.' : ''));
    } catch (err) { errB(esc(friendly(err))); $('ac-iss-ok').disabled = false; }
  });
}
