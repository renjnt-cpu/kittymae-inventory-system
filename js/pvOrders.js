// Payment Verification on the Online Orders pages: a small payment badge next to each order (verified / pending / possible duplicate / needs review / rejected), and a
// "Payment" section a person can open under an order line: how much the order needs, what is verified, pending and rejected, every payment proof with its status, and
// a button to add another proof. Nothing here decides anything -- verifying happens in Payment Verification; this only shows where an order stands and links to it.
import { esc, money, statusBadge, riskBadge, orderSummaryLines, fmtShortDateTime, imgTag, sourceLabel, friendly, attachedWhere } from './pvFormat.js?v=20261025a';
import { hydrateImages } from './pvApi.js?v=20261025a';
import { openProofForm } from './pvProofForm.js?v=20261025a';

const BADGE = {
  VERIFIED: ['pv-st-verified', 'Payment verified'], PENDING: ['pv-st-pending', 'Payment pending'], POSSIBLE_DUPLICATE: ['pv-st-dup', 'Possible duplicate payment'],
  NEEDS_REVIEW: ['pv-st-review', 'Payment needs review'], REJECTED: ['pv-st-rejected', 'Payment rejected'],
};

export function createOrderPayments({ api, employee, erpBase = '', onChange }) {
  // the person's own list of keys decides (an Admin can be held to read-only by a personal override); the role alone only decides when the list could not be loaded
  const can = (k) => (employee.permissions || []).length ? employee.permissions.includes(k) : employee.role === 'Admin';
  const canView = can('payment_verify.view'), canSubmit = can('payment_verify.submit');
  if (!canView && !canSubmit) return null;
  const link = (id) => (erpBase || '') + 'payment-verification.html?open=' + encodeURIComponent(id);

  return {
    canView, canSubmit,
    /** an empty slot for the badge, put in the Order / Customer cell */
    badgeSlot: (ref, shop) => canView && ref ? '<span class="pv-ordbadge" data-pv-ref="' + esc(ref) + '" data-pv-shop="' + esc(shop || '') + '"></span>' : '',
    /** the button that opens the section */
    buttonHtml: (id, ref, shop) => '<button type="button" class="btn small secondary" data-payment-toggle="' + esc(id) + '" data-pv-ref="' + esc(ref || '') + '" data-pv-shop="' + esc(shop || '') + '" aria-expanded="false">💳 Payment</button>',

    /** fills every badge slot under `root` (one call per shop) */
    async fillBadges(root) {
      if (!canView || !root) return;
      const slots = [...root.querySelectorAll('.pv-ordbadge[data-pv-ref]')];
      const byShop = new Map();
      slots.forEach((s) => { const sh = s.dataset.pvShop || ''; (byShop.get(sh) || byShop.set(sh, new Set()).get(sh)).add(s.dataset.pvRef); });
      for (const [shop, refs] of byShop) {
        let map = {};
        try { map = (await api.orderBadges([...refs], shop ? Number(shop) : null)) || {}; } catch (e) { map = {}; }
        slots.filter((s) => (s.dataset.pvShop || '') === shop).forEach((s) => {
          const st = map[s.dataset.pvRef], b = BADGE[st];
          s.innerHTML = b ? '<span class="badge pv-badge ' + b[0] + '" title="Open the Payment section of this order for the details">💳 ' + esc(b[1]) + '</span>' : '';
        });
      }
    },

    /** draws the Payment section into `box` for one order */
    async renderSection(box, { ref, shop, customer }) {
      box.innerHTML = '<div class="muted" style="padding:8px 4px;">Loading the payments of this order…</div>';
      let s = null, err = null;
      if (canView) {
        try { s = await api.orderSummary(ref, shop ? Number(shop) : null); } catch (e) { err = friendly(e); }
      }
      const head = '<div class="pv-orderpay-head"><b>Payment verification — Order #' + esc(ref) + '</b>' + (s && s.ok !== false ? statusBadge(s.state) : '') + '</div>';
      let body = '';
      if (err) body = '<div class="msg error">' + esc(err) + '</div>';
      else if (!canView) body = '<p class="muted">You can add a payment proof for this order, but you cannot see the payments recorded for it.</p>';
      else if (!s || s.ok === false) body = '<p class="muted">' + esc((s && s.message) || 'The payments of this order are not available to you.') + '</p>';
      else {
        const lines = orderSummaryLines(s);
        body = '<div class="pv-orderpay-lines">' + lines.map((l) => '<span>' + esc(l[0]) + ': <b>' + esc(l[1]) + '</b></span>').join('') + '</div>' +
          (s.payments.length ? s.payments.map((p) => '<div class="pv-orderpay-row"><span>' + (p.thumb ? imgTag(p.thumb, { cls: 'pv-thumb' }) + ' ' : '') + '<b>' + esc(p.pv_code) + '</b> ' + esc(money(p.amount)) +
              ' <span class="pv-ref">' + esc(p.reference || 'no reference') + '</span> <span class="muted">' + esc(sourceLabel(p.source)) + ' · ' + (p.submitted_by ? 'attached by <b>' + esc(p.submitted_by) + '</b> ' + attachedWhere(p.source) + ' · ' : '') + esc(fmtShortDateTime(p.submitted_at)) + '</span></span>' +
              '<span>' + statusBadge(p.status) + ' ' + riskBadge(p.duplicate_risk) + ' <a class="pv-link" target="_blank" rel="noopener" href="' + esc(link(p.id)) + '">Open ↗</a></span></div>').join('')
            : '<p class="muted">No payment proof has been recorded for this order yet.</p>');
      }
      box.innerHTML = '<div class="pv-orderpay">' + head + body +
        (canSubmit ? '<div style="margin-top:8px;"><button type="button" class="btn small" data-pv-add>+ Add payment proof</button></div>' : '') + '</div>';
      hydrateImages(box);
      const add = box.querySelector('[data-pv-add]');
      if (add) add.addEventListener('click', () => openProofForm({
        api, source: 'MANUAL_ENTRY', askSource: true, title: 'Add payment proof — Order #' + ref, lockOrder: true, prefill: { order_ref: ref, order_shop: shop ? Number(shop) : null, customer_name: customer },
        onOpenPayment: (id) => window.open(link(id), '_blank', 'noopener'),
        onSaved: async () => { await this.renderSection(box, { ref, shop, customer }); if (onChange) onChange(); },
      }));
    },
  };
}
