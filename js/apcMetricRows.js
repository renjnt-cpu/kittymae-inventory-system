// Access & Performance Control Center -- the list of figures a person can be measured on, each tied to the kind of work it belongs to ("family") so that a cashier is not measured
// on scrap and a scrap encoder is not measured on voids. `drill` names the records behind the figure (click it to see them).
import { money, int, rate, grams, accuracyOf, dash, fin } from './apcCore.js?v=20261011b';

const m = (id, label, fam, get, fmt, extra) => Object.assign({ id, label, fam, get, fmt }, extra || {});
const nz = (v) => (v === null || v === undefined ? null : v);
export const METRICS = [
  m('net', 'Total sales (net)', 'pos', (r) => r.pos.net, money, { drill: 'pos_orders', good: 'up' }),
  m('gross', 'Gross sales', 'pos', (r) => r.pos.gross, money, { drill: 'pos_orders', good: 'up' }),
  m('orders', 'Transactions (POS sales)', 'pos', (r) => r.pos.orders, int, { drill: 'pos_orders', good: 'up' }),
  m('aov', 'Average transaction value', 'pos', (r) => nz(r.pos.aov), money, { good: 'up' }),
  m('items', 'Items sold', 'pos', (r) => r.pos.items, int, { good: 'up' }),
  m('discount_rate', 'Discount rate', 'pos', (r) => nz(r.pos.discount_rate), rate, { good: 'down' }),
  m('void_rate', 'Void rate (of the sales they rang up)', 'pos', (r) => nz(r.pos.void_rate), rate, { drill: 'voids', good: 'down' }),
  m('voids', 'Sales voided or deleted (theirs)', 'pos', (r) => r.pos.voids, int, { drill: 'voids', good: 'down' }),
  m('scrap_entries', 'Scrap entries encoded', 'scrap', (r) => r.scrap.entries, int, { drill: 'scrap_entries', good: 'up' }),
  m('scrap_grams', 'Grams received (scrap)', 'scrap', (r) => r.scrap.grams, grams, { good: 'up' }),
  m('scrap_value', 'Scrap value', 'scrap', (r) => r.scrap.value, money, { good: 'up' }),
  m('scrap_avg', 'Average value per scrap entry', 'scrap', (r) => nz(r.scrap.avg_value), money),
  m('stock_in', 'Stock-in entries', 'inventory', (r) => r.inventory.stock_in, int, { drill: 'inventory', good: 'up' }),
  m('adjustments', 'Inventory adjustments (corrections)', 'inventory', (r) => r.inventory.adjustments, int, { drill: 'inventory' }),
  m('pull_outs', 'Pull-outs and returns', 'inventory', (r) => r.inventory.pull_outs, int, { drill: 'inventory' }),
  m('inv_transfers', 'Transfer movements', 'inventory', (r) => r.inventory.transfers, int, { drill: 'inventory' }),
  m('purchases', 'Purchases encoded', 'inventory', (r) => r.other.purchases, int, { drill: 'purchases', good: 'up' }),
  m('catalog', 'SKU Catalog changes', 'inventory', (r) => r.other.catalog, int, { drill: 'catalog' }),
  m('layaway', 'Layaways created', 'layaway', (r) => r.other.layaway, int, { drill: 'layaway', good: 'up' }),
  m('subasta', 'Subasta items recorded', 'layaway', (r) => r.other.subasta, int, { drill: 'subasta' }),
  m('approvals', 'Approvals completed', 'approvals', (r) => r.other.approvals, int, { drill: 'approvals', good: 'up' }),
  m('refund_requests', 'Refund requests submitted', 'approvals', (r) => r.other.refund_requests, int, { drill: 'refund_requests' }),
  m('voids_done', 'Voids processed (as the approver)', 'approvals', (r) => r.pos.voids_processed, int),
  m('tasks_done', 'Data Fix tasks completed', 'tasks', (r) => r.tasks.completed, int, { drill: 'tasks', good: 'up' }),
  m('tasks_open', 'Data Fix tasks still open', 'tasks', (r) => r.tasks.open, int, { good: 'down' }),
  m('errors', 'Errors (counted)', 'all', (r) => r.errors.counted, int, { drill: 'errors', good: 'down' }),
  m('error_rate', 'Error rate', 'all', (r) => nz(r.rates.error), rate, { good: 'down', needsSample: true }),
  m('accuracy', 'Accuracy', 'all', (r, th) => accuracyOf(r, th), (v) => (v === null || v === undefined ? dash : Number(v).toFixed(1) + '%'), { good: 'up' }),
  m('repeated', 'Repeated errors', 'all', (r) => r.errors.repeated, int, { good: 'down' }),
];
export const byId = Object.fromEntries(METRICS.map((x) => [x.id, x]));
/** Total pieces of encoding work (scrap, stock, purchases, catalog, layaway, Subasta) -- the "Entries Encoded" column. */
export const encoded = (r) => (fin(r.scrap.entries) || 0) + (fin(r.inventory.total) || 0) + (fin(r.other.purchases) || 0) + (fin(r.other.catalog) || 0) + (fin(r.other.layaway) || 0) + (fin(r.other.subasta) || 0);
