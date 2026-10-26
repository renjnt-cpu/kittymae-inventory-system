// Scrap Monitoring -- the words, colours and small formatters every screen shares. No imports on purpose (the screens and the tests both load it).

export const esc = (s) => (s === null || s === undefined) ? '' : String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------- numbers and dates (Manila time, like the rest of the system)
export const isBlank = (n) => n === null || n === undefined || n === '' || Number.isNaN(Number(n));
export const money = (n) => isBlank(n) ? '—' : '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** a number with up to `dp` decimals, no trailing zeros: 15.14, 1,069.69, 0.22 */
export const num = (n, dp = 3) => isBlank(n) ? '—' : Number(n).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: dp });
export const grams = (n) => isBlank(n) ? '—' : num(n, 3) + ' g';
export const fmtDate = (d) => {
  if (!d) return '—';
  const [y, m, day] = String(d).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' });
};
export const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
export const fmtShortDateTime = (iso) => iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
export const fmtTime = (t) => {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  return new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString('en-US', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' });
};
/** today's calendar day in Manila as YYYY-MM-DD */
export const manilaToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
export const daysAgo = (n, from) => { const d = new Date((from || manilaToday()) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
export const monthStart = (from) => (from || manilaToday()).slice(0, 8) + '01';
export const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const ageText = (d) => (d === null || d === undefined) ? '—' : d === 0 ? 'today' : d === 1 ? '1 day' : d + ' days';
/** what a person is told when a call failed: the database's own sentence, without the technical wrapping */
export function friendly(err) {
  const m = String((err && err.message) || err || 'Something went wrong.').replace(/^Error:\s*/, '');
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Could not reach the server. Check your internet connection and try again.';
  if (/JWT|not authenticated|permission denied for/i.test(m)) return 'Your sign-in expired or you do not have permission. Reload the page and sign in again.';
  return m;
}

// ---------------------------------------------------------------- where the original record lives (the POS)
export const POS_BASE = 'https://renjnt-cpu.github.io/kittymae-pos/';
export const posEntryUrl = (id) => POS_BASE + 'branches.html?tab=scrap&open=' + encodeURIComponent(id);
export const scrapId = (id) => 'Scrap #' + id;

// ---------------------------------------------------------------- words
export const KINDS = {
  'Bought from Customer': { label: 'Bought', cls: 'sm-kind-in', long: 'Bought from a customer' },
  'Transferred In': { label: 'Transfer in', cls: 'sm-kind-tr', long: 'Transferred in from another branch' },
  'Transferred Out': { label: 'Transfer out', cls: 'sm-kind-tr', long: 'Transferred out to another branch' },
  'Refiner / Other': { label: 'Sold / refiner', cls: 'sm-kind-out', long: 'Sold to a refiner or released' },
};
export const kindBadge = (k) => '<span class="badge sm-badge sm-kind ' + ((KINDS[k] || {}).cls || '') + '" title="' + esc((KINDS[k] || {}).long || k) + '">' + esc((KINDS[k] || { label: k }).label) + '</span>';

export const STATUS = {
  AVAILABLE: { label: 'Available scrap', cls: 'sm-st-available', hint: 'Held by the branch, nothing sold from it yet.' },
  FOR_SALE: { label: 'For sale', cls: 'sm-st-forsale', hint: 'Marked by management as ready to sell.' },
  FOR_DISPOSAL: { label: 'For disposal', cls: 'sm-st-fordisposal', hint: 'Marked by management for disposal.' },
  RESERVED: { label: 'Reserved for buyer', cls: 'sm-st-reserved', hint: 'Set aside for a named buyer.' },
  PENDING_SALE: { label: 'On hold', cls: 'sm-st-pending', hint: 'Some of it is on hold: in a sale or disposal waiting for an approver, or in a group waiting for the supplier\'s weighing. The grams are held back.' },
  PARTIALLY_SOLD: { label: 'Partially sold', cls: 'sm-st-partial', hint: 'Part of it was sold, released or disposed of; some is still held.' },
  SOLD: { label: 'Sold', cls: 'sm-st-sold', hint: 'All of it was sold or released.' },
  DISPOSED: { label: 'Disposed', cls: 'sm-st-disposed', hint: 'Disposed of (not sold).' },
  TRANSFERRED: { label: 'Transferred', cls: 'sm-st-transferred', hint: 'Moved to another branch.' },
  CONVERTED: { label: 'Converted to Subasta', cls: 'sm-st-converted', hint: 'Turned into a Subasta item; not counted as scrap any more.' },
};
export const statusLabel = (s) => (STATUS[s] || { label: s || '—' }).label;
export const statusBadge = (s) => '<span class="badge sm-badge ' + (STATUS[s] || { cls: 'sm-st-converted' }).cls + '" title="' + esc((STATUS[s] || {}).hint || '') + '">' + esc(statusLabel(s)) + '</span>';
export const MARKS = { FOR_SALE: 'For sale', FOR_DISPOSAL: 'For disposal', RESERVED: 'Reserved for buyer' };
export const markBadge = (m, buyer) => m ? '<span class="badge sm-badge ' + (STATUS[m] || { cls: 'sm-st-forsale' }).cls + '">' + esc(MARKS[m] || m) + (m === 'RESERVED' && buyer ? ' · ' + esc(buyer) : '') + '</span>' : '';

export const SALE_STATUS = {
  PENDING_APPROVAL: { label: 'Waiting for approval', cls: 'sm-st-pending' },
  CONFIRMED: { label: 'Confirmed', cls: 'sm-st-confirmed' },
  REJECTED: { label: 'Rejected', cls: 'sm-st-rejected' },
  REVERSED: { label: 'Reversed', cls: 'sm-st-reversed' },
};
export const saleStatusBadge = (s) => '<span class="badge sm-badge ' + (SALE_STATUS[s] || { cls: 'sm-st-converted' }).cls + '">' + esc((SALE_STATUS[s] || { label: s }).label) + '</span>';
/** a group = a pending folder of scrap that is confirmed once the supplier has weighed it */
export const GROUP_STATUS = {
  PENDING: { label: 'Waiting for the supplier', cls: 'sm-st-pending', hint: 'The grams are held back. Confirm the group when the supplier\'s weighing arrives.' },
  CONFIRMED: { label: 'Confirmed', cls: 'sm-st-confirmed', hint: 'The supplier weighed it and the sales were made.' },
  CANCELLED: { label: 'Cancelled', cls: 'sm-st-rejected', hint: 'Cancelled: the grams are free again.' },
};
export const groupStatusBadge = (s) => '<span class="badge sm-badge ' + (GROUP_STATUS[s] || { cls: 'sm-st-converted' }).cls + '" title="' + esc((GROUP_STATUS[s] || {}).hint || '') + '">' + esc((GROUP_STATUS[s] || { label: s }).label) + '</span>';
export const PAY_STATUS = { UNPAID: { label: 'Unpaid', cls: 'sm-pay-unpaid' }, PARTIALLY_PAID: { label: 'Partially paid', cls: 'sm-pay-partial' }, PAID: { label: 'Paid', cls: 'sm-pay-paid' } };
export const payBadge = (s) => s ? '<span class="badge sm-badge ' + (PAY_STATUS[s] || { cls: 'sm-st-converted' }).cls + '">' + esc((PAY_STATUS[s] || { label: s }).label) + '</span>' : '';
export const kindOfSale = (k) => k === 'DISPOSAL' ? 'Disposal' : 'Sale';
export const ageBadge = (d, agedDays) => {
  if (d === null || d === undefined) return '<span class="sm-muted">—</span>';
  const old = d >= (agedDays || 90), mid = d >= 31;
  return '<span class="badge sm-badge ' + (old ? 'sm-age-old' : mid ? 'sm-age-mid' : 'sm-age-new') + '" title="' + (old ? 'Held ' + (agedDays || 90) + '+ days without being sold' : '') + '">' + esc(ageText(d)) + '</span>';
};

export const PAY_METHODS = ['Cash', 'GCash', 'Maya', 'Bank Transfer', 'Check', 'Other'];
export const NEEDS_REFERENCE = ['GCash', 'Maya', 'Bank Transfer', 'Check'];
export const FILE_TYPES = [['SCRAP_PHOTO', 'Scrap photo'], ['WEIGHING_SLIP', 'Weighing slip'], ['BUYER_RECEIPT', 'Buyer receipt'], ['PAYMENT_PROOF', 'Payment proof'],
  ['OFFICIAL_RECEIPT', 'Official receipt'], ['ACKNOWLEDGMENT', 'Acknowledgment'], ['SIGNED_RELEASE', 'Signed release form'], ['OTHER', 'Other document']];
export const fileTypeLabel = (t) => (FILE_TYPES.find((x) => x[0] === t) || [0, t || 'File'])[1];
export const DISPOSAL_REASONS = ['Melted / refined in-house', 'Damaged or unusable', 'Returned to the customer', 'Lost or missing (write-off)', 'Other'];
export const DISPOSAL_METHODS = ['Melting', 'Returned', 'Written off', 'Other'];
export const TX_LABELS = {
  SCRAP_CREATED: 'Scrap recorded', SCRAP_TRANSFER_IN: 'Transfer in', SCRAP_TRANSFER_OUT: 'Transfer out', SCRAP_SALE: 'Sale', SCRAP_PARTIAL_SALE: 'Partial sale',
  SCRAP_DISPOSAL: 'Disposal', SCRAP_REVERSAL: 'Sale reversed', SCRAP_CORRECTION: 'Entry corrected',
};
export const SORT_ENTRIES = [['newest', 'Newest first'], ['oldest', 'Oldest first'], ['heaviest', 'Heaviest first'], ['available', 'Most available'], ['amount', 'Highest amount'], ['branch', 'Branch']];
export const SOURCE_TYPES = ['Walk-In', 'Returning Customer', 'Referral', 'Other'];
export const METALS = ['Gold', 'Silver', 'Other'];
export const KARAT_GUESS = ['10K', '14K', '16K', '18K', '20K', '21K', '22K', '24K'];

/** "15.14 g Gold 18K" -> kept as the server's label; used where a lot is shown on its own */
export const lotLabel = (metal, karat) => [metal, karat].filter(Boolean).join(' ');
