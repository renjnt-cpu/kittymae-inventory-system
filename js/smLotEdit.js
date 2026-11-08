// Scrap Monitoring -- correct the metal / purity of ONE lot (a line of a scrap purchase) while all of it is still held. When the supplier's test shows the branch's record was wrong,
// the lot itself is corrected: its grams move from the old purity's balance to the new one. Needs a reason and is logged (migration 273, scrap_lot_set_purity).
// A lot that is already sold, disposed of, held in a sale or a group, or counted as released by a POS out entry cannot change -- the database refuses it, and this screen
// only hides the button. The "accepted as" value of a sold lot (smAccepted.js, the sale page) is a different thing: it leaves the recorded purity alone.
import { esc, num, scrapId } from './smFormat.js?v=20261108a';
import { openDrawer, closeDrawer, actionPanel } from './smUi.js?v=20261108a';
import { acceptedControls, readAccepted, wireAccepted, sameAs, metalPurity } from './smAccepted.js?v=20261108a';

/** who gets the button (the database decides for real: anyone who may sell, approve or dispose of scrap, in the branches they can see) */
export const canEditLots = (ctx) => !!(ctx.can.sell || ctx.can.approve_sale || ctx.can.dispose);
/** true when none of the lot is gone yet; `original` and `available` are in grams */
export const lotIsHeld = (original, available) => original !== null && original !== undefined && available !== null && available !== undefined && Number(original) - Number(available) <= 0.0005;

/**
 * lot: { lineId, entryId, lineNo, metal, karat, grams, branch }
 * opts: { drawer: 'side' (opens its own small drawer) | 'detail' (a panel inside the open detail drawer), done() runs after it is saved }
 */
export function openLotEdit(ctx, lot, { drawer = 'side', done } = {}) {
  const now = metalPurity(lot.metal, lot.karat);
  const message = 'Change this only if the lot really is something else than what was recorded, for example when the supplier tested it. The grams and the price stay as they were; ' +
    'the grams move from <b>' + esc(now) + '</b> to the new metal / purity in the branch balance. Saving keeps the old value in the history.';
  const fields = '<div class="sm-acc-row"><div><b>' + esc(now) + '</b><div class="muted sm-small">' + esc(scrapId(lot.entryId)) + ' · line ' + esc(lot.lineNo) + ' · ' + esc(num(lot.grams)) + ' g' + (lot.branch ? ' · ' + esc(lot.branch) : '') + '</div></div>' +
    acceptedControls('lot-e', { metal_type: lot.metal, karat: lot.karat }, 'this lot') + '</div>' +
    '<div class="field" style="margin-top:8px;"><label for="lot-e-reason">Why does it change? *</label><input id="lot-e-reason" type="text" maxlength="200" placeholder="e.g. the supplier tested it as 14K"></div>';
  const save = async () => {
    const cur = readAccepted(document, 'lot-e');
    if (!cur) throw new Error('The picker is not ready.');
    if (cur.bad) throw new Error(cur.bad);
    if (sameAs(cur, { metal_type: lot.metal, karat: lot.karat })) throw new Error('Choose a different metal or purity first.');
    const reason = document.getElementById('lot-e-reason').value.trim();
    if (reason.length < 5) throw new Error('Say why it changes (a few words).');
    const r = await ctx.api.lotSetPurity(lot.lineId, cur.metal_type, cur.karat, reason);
    if (r && r.ok === false) throw new Error(r.message);
    ctx.toast(scrapId(lot.entryId) + ' line ' + lot.lineNo + ' is now ' + metalPurity(cur.metal_type, cur.karat) + '.');
    return true;
  };
  if (drawer === 'detail') {
    actionPanel('detail', { title: 'Change the metal / purity of this lot', message, fields, okLabel: 'Save', onOk: async () => { await save(); if (done) await done(); } });
    wireAccepted(document, 'lot-e', null);
    return;
  }
  openDrawer('side', { title: 'Change the metal / purity', sub: scrapId(lot.entryId) + ' · line ' + lot.lineNo, body: '<div id="sm-side-msg"></div><div class="sm-form-sec"><p class="muted sm-small">' + message + '</p>' + fields + '</div>',
    footer: '<button type="button" class="btn" id="lot-e-ok">Save</button><button type="button" class="btn secondary" id="lot-e-cancel">Cancel</button>' });
  wireAccepted(document, 'lot-e', null);
  document.getElementById('lot-e-cancel').addEventListener('click', () => closeDrawer('side'));
  const ok = document.getElementById('lot-e-ok');
  ok.addEventListener('click', async () => {
    ok.disabled = true;
    try { await save(); closeDrawer('side'); if (done) await done(); } catch (err) { ctx.toast(err, true); ok.disabled = false; }
  });
}
