// Payment Verification page -- the Dashboard tab: what needs a person's attention right now, what was verified today and this month, where the proofs come from, and the
// two short lists to start with (the payments waiting longest and the possible duplicates). Every card opens the matching list.
import { esc, money, moneyShort, fmtDateTime, ago, plural, friendly } from './pvFormat.js?v=20261025a';
import { kpiCard } from './pvUi.js?v=20261025a';
import { compactList } from './pvTable.js?v=20261025a';

export async function renderDashboard(ctx, panel) {
  panel.innerHTML = '<p class="muted">Loading…</p>';
  const branch = ctx.ui.dashBranch || '';
  let c;
  try { c = await ctx.api.dashboard(branch ? Number(branch) : null); } catch (err) { panel.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; return; }
  if (!c || c.ok === false) { panel.innerHTML = '<div class="msg error">' + esc((c && c.message) || 'The dashboard could not be loaded.') + '</div>'; return; }
  ctx.counts = c;
  const n = (v) => Number(v || 0).toLocaleString('en-PH');
  const attention = (v, tone) => (Number(v) > 0 ? tone : 'gray');
  const group = (title, hint, cards) => '<div class="pv-kpi-group"><h3>' + esc(title) + (hint ? ' <span class="muted">' + esc(hint) + '</span>' : '') + '</h3><div class="pv-kpis">' + cards.join('') + '</div></div>';
  const showBranch = ctx.scope.allBranches && ctx.branches.length > 1;

  panel.innerHTML = '<div class="pv-dashhead"><div class="muted">' + (c.last_sync ? 'Online Orders proofs last pulled in ' + esc(fmtDateTime(c.last_sync)) + ' (' + esc(ago(c.last_sync)) + ')' : '') + '</div>' +
    '<div class="pv-btnrow">' + (showBranch ? '<div class="field pv-inline"><label for="pv-dash-branch">Branch</label><select id="pv-dash-branch"><option value="">All branches</option>' + ctx.branches.map((b) => '<option value="' + b.id + '"' + (String(b.id) === String(branch) ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('') + '</select></div>' : '') +
    '<button type="button" class="btn small secondary" id="pv-dash-sync">↻ Check for new proofs</button></div></div>' +
    group('Needs a person', 'work to do now', [
      kpiCard({ label: 'Pending verification', value: n(c.pending), sub: money(c.amount_pending) + ' waiting', tone: attention(c.pending, 'yellow'), go: 'pending', hint: 'Open the Pending Verification list' }),
      kpiCard({ label: 'Possible duplicates', value: n(c.possible_duplicates), sub: n(c.duplicate_references) + ' reference' + (Number(c.duplicate_references) === 1 ? '' : 's') + ' used more than once', tone: attention(c.possible_duplicates, 'red'), go: 'duplicates' }),
      kpiCard({ label: 'Needs review', value: n(c.needs_review), tone: attention(c.needs_review, 'orange'), go: 'needs_review' }),
      kpiCard({ label: 'No reference number', value: n(c.missing_reference), sub: 'cannot be verified yet', tone: attention(c.missing_reference, 'orange'), go: 'missing_reference', hint: 'Pending payments whose reference is missing or too short' }),
    ]) +
    (Array.isArray(c.shops) && c.shops.length ? group('By Pancake shop', 'Miss Kittymae Jewels and Kittymae.co are checked together — one reference is searched in both', c.shops.map((s) =>
      kpiCard({ label: s.shop_name || 'Shop not known', value: n(s.pending), sub: 'pending · ' + n(s.possible_duplicates) + ' possible duplicate' + (Number(s.possible_duplicates) === 1 ? '' : 's') + ' · ' + n(s.total) + ' proofs on file',
        tone: attention(s.pending, 'yellow'), go: 'shop:' + (s.shop_id || ''), hint: 'Open the pending payments of this shop' }))) : '') +
    group('Today', '', [
      kpiCard({ label: 'Verified today', value: n(c.verified_today), sub: money(c.amount_verified_today), tone: 'green', go: 'verified_today' }),
      kpiCard({ label: 'Rejected today', value: n(c.rejected_today), tone: Number(c.rejected_today) > 0 ? 'red' : 'gray', go: 'unverified' }),
      kpiCard({ label: 'Verified this month', value: moneyShort(c.amount_verified_month), sub: money(c.amount_verified_month), tone: 'green', go: 'verified' }),
      kpiCard({ label: 'Verified in total', value: moneyShort(c.amount_verified_total), sub: n(c.total) + ' payment proofs on file', tone: 'blue', go: 'all' }),
    ]) +
    group('Where proofs come from', 'still waiting', [
      kpiCard({ label: 'From Pancake chat', value: n(c.from_pancake_chat), tone: 'blue', go: 'from_pancake' }),
      kpiCard({ label: 'From Online Orders', value: n(c.from_online_orders), tone: 'blue', go: 'from_orders' }),
      kpiCard({ label: 'Verified in Pancake, not yet here', value: n(c.pending_verified_in_pancake), sub: 'staff already checked these in Pancake POS', tone: 'gray', go: 'pancake_pending' }),
      kpiCard({ label: 'Changed in Pancake after verifying', value: n(c.pancake_changed_after_verify), tone: attention(c.pancake_changed_after_verify, 'orange'), go: 'drift' }),
    ]) +
    '<div class="pv-twocol"><div class="card"><h3 class="pv-h3">Waiting the longest</h3><div id="pv-dash-wait"></div></div><div class="card"><h3 class="pv-h3">Possible duplicates</h3><div id="pv-dash-dup"></div></div></div>';

  panel.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
    const g = b.dataset.go;
    if (g.startsWith('shop:')) return ctx.gotoList('pending', g.length > 5 ? { shop_id: g.slice(5) } : {});
    if (g === 'missing_reference') return ctx.gotoList('pending', { no_reference: true });
    if (g === 'verified_today') return ctx.gotoList('verified', { date_from: ctx.today, date_to: ctx.today });
    if (g === 'from_pancake') return ctx.gotoList('pending', { source: 'PANCAKE' });
    if (g === 'from_orders') return ctx.gotoList('pending', { source: 'ONLINE_ORDER' });
    if (g === 'pancake_pending') return ctx.gotoList('pending', { pancake: 'yes' });
    if (g === 'drift') return ctx.gotoList('all', { drift: true });
    return ctx.gotoList(g, {});
  }));
  const sel = panel.querySelector('#pv-dash-branch');
  if (sel) sel.addEventListener('change', () => { ctx.ui.dashBranch = sel.value; renderDashboard(ctx, panel); });
  panel.querySelector('#pv-dash-sync').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { const r = await ctx.api.syncNow(); ctx.toast(r && r.skipped ? (r.message || 'Just refreshed.') : 'Checked for new proofs.'); await ctx.refreshCounts(); await renderDashboard(ctx, panel); }
    catch (err) { ctx.toast(err.message || String(err), true); e.target.disabled = false; }
  });
  compactList(ctx, panel.querySelector('#pv-dash-wait'), 'pending', 6, 'oldest', 'Nothing is waiting. Every proof has been checked.');
  compactList(ctx, panel.querySelector('#pv-dash-dup'), 'duplicates', 6, 'risk', 'No possible duplicates right now.');
}
