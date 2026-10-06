// Sales & Profit Dashboard -- the columns of every detail table (what each column is called, how it is shown, which key unlocks it, which are hidden at first).
// `need` is a permission the database also enforces: a person without it never receives the figure, the column is just not offered.
import { esc, money, int, pct, fmtDate } from './sdCore.js?v=20261007f';
import { badge } from './sdUi.js?v=20261007f';

const missing = (label) => badge(label || 'COST DATA MISSING', 'orange');
const dash = '<span class="muted">—</span>';
const OS = { Completed: 'green', Returned: 'orange', Cancelled: 'gray', Open: 'blue', Refunded: 'red' };
const PS = { Paid: 'green', Partial: 'orange', Unpaid: 'red', COD: 'blue', Refunded: 'red', Collected: 'green', 'Collected by courier': 'green' };
const KIND = { Sale: 'green', Return: 'orange', Refund: 'red' };
const STOCK = { 'IN STOCK': 'green', 'LOW STOCK': 'orange', 'OUT OF STOCK': 'red', OVERSTOCK: 'blue', 'SLOW MOVING': 'yellow', 'DEAD STOCK': 'gray' };
const costCell = (key, type) => ({ render: (r) => r.cost_missing ? (key === 'unit_cost' ? missing() : dash) : (r[key] === null || r[key] === undefined ? dash : esc(type === 'pct' ? pct(r[key], 1) : money(r[key]))) });

export const COLS = {
  sales: [
    { key: 'date', label: 'Date', sort: 'date' }, { key: 'time', label: 'Time' },
    { key: 'kind', label: 'Type', type: 'badge', tones: KIND },
    { key: 'order_no', label: 'Order #', sort: 'order' }, { key: 'customer', label: 'Customer', sort: 'customer' }, { key: 'channel', label: 'Channel', sort: 'channel' },
    { key: 'shop', label: 'Shop', hide: true }, { key: 'sku', label: 'SKU', sort: 'sku' }, { key: 'product', label: 'Product', sort: 'product' }, { key: 'variant', label: 'Variant', hide: true },
    { key: 'qty', label: 'Qty', type: 'int', sort: 'qty' },
    { key: 'gross', label: 'Gross', type: 'money', sort: 'gross', total: 'gross' }, { key: 'discount', label: 'Discount', type: 'money', sort: 'discount', total: 'discount' },
    { key: 'refund', label: 'Refund', type: 'money', sort: 'refund', total: 'refund' }, { key: 'net', label: 'Net', type: 'money', sort: 'net', total: 'net' },
    Object.assign({ key: 'unit_cost', label: 'Unit cost', type: 'money', need: 'cost', hide: true }, costCell('unit_cost')),
    Object.assign({ key: 'cogs', label: 'COGS', type: 'money', sort: 'cogs', need: 'cost', total: 'cogs' }, costCell('cogs')),
    Object.assign({ key: 'gross_profit', label: 'Gross profit', type: 'money', sort: 'gp', need: 'profit', total: 'gross_profit' }, costCell('gross_profit')),
    Object.assign({ key: 'margin', label: 'Margin %', type: 'pct', sort: 'margin', need: 'profit' }, costCell('margin', 'pct')),
    { key: 'allocated_expenses', label: 'Allocated expenses', type: 'money', need: 'expenses', hide: true, total: 'allocated_expenses' },
    Object.assign({ key: 'net_profit', label: 'Net profit', type: 'money', need: 'profit', hide: true, total: 'net_profit' }, costCell('net_profit')),
    { key: 'payment_method', label: 'Payment', sort: 'payment' }, { key: 'payment_status', label: 'Payment status', type: 'badge', tones: PS, hide: true },
    { key: 'order_status', label: 'Order status', type: 'badge', tones: OS, sort: 'status' }, { key: 'salesperson', label: 'Salesperson', sort: 'salesperson' }, { key: 'branch', label: 'Branch', sort: 'branch' },
  ],
  products: [
    { key: 'rank', label: '#', type: 'int', sort: 'rank' }, { key: 'product', label: 'Product', sort: 'product' }, { key: 'sku', label: 'SKU', sort: 'sku' }, { key: 'category', label: 'Category', sort: 'category' },
    { key: 'qty_sold', label: 'Qty sold', type: 'int', sort: 'qty', total: 'qty_sold' }, { key: 'gross', label: 'Gross sales', type: 'money', sort: 'gross', total: 'gross' },
    { key: 'discounts', label: 'Discounts', type: 'money', sort: 'discounts', total: 'discounts' }, { key: 'refunds', label: 'Refunds', type: 'money', total: 'refunds', hide: true },
    { key: 'net', label: 'Net sales', type: 'money', sort: 'net', total: 'net' },
    Object.assign({ key: 'cogs', label: 'COGS', type: 'money', sort: 'cogs', need: 'cost' }, { render: (r) => r.cost_missing_lines > 0 && (r.cogs === null || r.cogs === undefined) ? missing() : (r.cogs === null || r.cogs === undefined ? dash : esc(money(r.cogs))) }),
    Object.assign({ key: 'gross_profit', label: 'Gross profit', type: 'money', sort: 'gp', need: 'profit' }, { render: (r) => r.gross_profit === null || r.gross_profit === undefined ? dash : esc(money(r.gross_profit)) }),
    { key: 'margin', label: 'Margin %', type: 'pct', sort: 'margin', need: 'profit' }, { key: 'net_profit', label: 'Net profit', type: 'money', sort: 'net_profit', need: 'profit', hide: true },
    { key: 'return_qty', label: 'Returned qty', type: 'int', sort: 'return_qty', total: 'return_qty' }, { key: 'return_rate', label: 'Return rate', type: 'pct', sort: 'return_rate' },
    { key: 'in_catalog', label: 'In catalog', type: 'bool', hide: true },
  ],
  purchases: [
    { key: 'date', label: 'Date', type: 'date', sort: 'date' }, { key: 'po_number', label: 'PO number', hide: true }, { key: 'supplier', label: 'Supplier', sort: 'supplier' },
    { key: 'sku', label: 'SKU', sort: 'sku' }, { key: 'product', label: 'Product', sort: 'product' }, { key: 'variant', label: 'Variant', hide: true }, { key: 'category', label: 'Category', sort: 'category', hide: true },
    { key: 'qty', label: 'Qty', type: 'int', sort: 'qty', total: 'qty' },
    { key: 'unit_cost', label: 'Unit cost', type: 'money', sort: 'unit_cost', render: (r) => r.unit_cost === null || r.unit_cost === undefined ? (r.total_cost === null || r.total_cost === undefined ? badge('PRICE MISSING', 'orange') : dash) : esc(money(r.unit_cost)) },
    { key: 'total_cost', label: 'Total', type: 'money', sort: 'total', total: 'total_cost', render: (r) => r.total_cost === null || r.total_cost === undefined ? badge('PRICE MISSING', 'orange') : esc(money(r.total_cost)) },
    { key: 'amount_paid', label: 'Amount paid', type: 'money', hide: true }, { key: 'balance', label: 'Balance', type: 'money', hide: true }, { key: 'payment_method', label: 'Payment method', hide: true },
    { key: 'receiving_status', label: 'Receiving', type: 'badge', tones: { Received: 'green' } }, { key: 'created_by', label: 'Created by', sort: 'created_by' }, { key: 'branch', label: 'Branch', sort: 'branch' },
  ],
  inventory: [
    { key: 'sku', label: 'SKU', sort: 'sku' }, { key: 'product', label: 'Product', sort: 'product' }, { key: 'category', label: 'Category', sort: 'category' }, { key: 'collection', label: 'Collection', hide: true },
    { key: 'variant', label: 'Variant', hide: true }, { key: 'supplier', label: 'Supplier', hide: true },
    { key: 'stock', label: 'Stock', type: 'int', sort: 'stock', total: 'stock' }, { key: 'reorder_level', label: 'Reorder level', type: 'int', sort: 'reorder', hide: true },
    { key: 'unit_cost', label: 'Unit cost', type: 'money', sort: 'unit_cost', need: 'cost', render: (r) => r.unit_cost === null || r.unit_cost === undefined ? missing() : esc(money(r.unit_cost)) },
    { key: 'selling_price', label: 'Selling price', type: 'money', sort: 'price' },
    { key: 'cost_value', label: 'Inventory cost value', type: 'money', sort: 'cost_value', need: 'cost', total: 'cost_value' },
    { key: 'retail_value', label: 'Retail value', type: 'money', sort: 'retail_value', total: 'retail_value' },
    { key: 'potential_gp', label: 'Potential gross profit', type: 'money', sort: 'potential_gp', need: 'cost', total: 'potential_gp' },
    { key: 'qty_sold', label: 'Qty sold (period)', type: 'int', sort: 'qty_sold', total: 'qty_sold' }, { key: 'last_sale_at', label: 'Last sale', type: 'dt', sort: 'last_sale' },
    { key: 'idle_days', label: 'Days since last sale', type: 'int', sort: 'idle', hide: true }, { key: 'status', label: 'Stock status', type: 'badge', tones: STOCK, sort: 'status' },
  ],
  expenses: [
    { key: 'date', label: 'Due date', type: 'date', sort: 'date' }, { key: 'category', label: 'Category', sort: 'category' }, { key: 'subcategory', label: 'Group', hide: true },
    { key: 'description', label: 'Description', sort: 'description' }, { key: 'payee', label: 'Payee', sort: 'payee' },
    { key: 'amount', label: 'Amount', type: 'money', sort: 'amount', total: 'amount', render: (r) => r.amount === null || r.amount === undefined ? badge('NO AMOUNT YET', 'orange') : esc(money(r.amount)) },
    { key: 'paid', label: 'Paid', type: 'money', sort: 'paid', total: 'paid' }, { key: 'remaining', label: 'Unpaid', type: 'money', sort: 'remaining', total: 'remaining' },
    { key: 'payment_method', label: 'Method', sort: 'method' }, { key: 'payment_status', label: 'Status', type: 'badge', tones: { Paid: 'green', 'Partially Paid': 'orange', Unpaid: 'red' } },
    { key: 'receipt', label: 'Receipt', type: 'bool' }, { key: 'branch', label: 'Branch', sort: 'branch' }, { key: 'notes', label: 'Notes', hide: true }, { key: 'created_by', label: 'Created by', sort: 'created_by', hide: true },
  ],
  payables: [
    { key: 'due_date', label: 'Due date', type: 'date', sort: 'due_date' }, { key: 'overdue', label: 'Overdue', type: 'bool' }, { key: 'category', label: 'Category', sort: 'category' },
    { key: 'description', label: 'Description', sort: 'description' }, { key: 'payee', label: 'Payee', sort: 'payee' },
    { key: 'amount', label: 'Amount', type: 'money', sort: 'amount', total: 'amount' }, { key: 'paid', label: 'Paid', type: 'money', sort: 'paid', total: 'paid' }, { key: 'remaining', label: 'Still owed', type: 'money', sort: 'remaining', total: 'remaining' },
    { key: 'payment_status', label: 'Status', type: 'badge', tones: { 'Partially Paid': 'orange', Unpaid: 'red' } }, { key: 'branch', label: 'Branch', sort: 'branch' },
  ],
  receivables: [
    { key: 'ship_date', label: 'Shipped', type: 'date', sort: 'ship_date' }, { key: 'tracking_number', label: 'Tracking #', sort: 'tracking' }, { key: 'order_ref', label: 'Pancake order', sort: 'order' },
    { key: 'customer', label: 'Customer', sort: 'customer' }, { key: 'cod_amount', label: 'COD amount', type: 'money', sort: 'amount', total: 'cod_amount' }, { key: 'status', label: 'Parcel status' }, { key: 'branch', label: 'Branch', sort: 'branch' },
  ],
  payments: [
    { key: 'date', label: 'Date', type: 'date', sort: 'date' }, { key: 'source', label: 'Source', sort: 'source' }, { key: 'reference', label: 'Reference', sort: 'reference' }, { key: 'customer', label: 'Customer', sort: 'customer' },
    { key: 'method', label: 'Method', sort: 'method' }, { key: 'amount', label: 'Amount', type: 'money', sort: 'amount', total: 'net' }, { key: 'status', label: 'Status', type: 'badge', tones: PS, sort: 'status' }, { key: 'branch', label: 'Branch', sort: 'branch' },
  ],
  capital: [
    { key: 'date', label: 'Date', type: 'date', sort: 'date' }, { key: 'type', label: 'Type', sort: 'type', render: (r) => esc(({ INITIAL_CAPITAL: 'Initial capital', ADDITIONAL_CAPITAL: 'Additional capital', OWNER_WITHDRAWAL: 'Owner withdrawal', ASSET_PURCHASE: 'Asset purchase', OTHER: 'Other (memo)' })[r.type] || r.type) + (r.voided ? ' ' + badge('VOIDED', 'gray') : '') },
    { key: 'amount', label: 'Amount', type: 'money', sort: 'amount', render: (r) => (r.type === 'OWNER_WITHDRAWAL' ? '<span class="sd-neg">-' : '<span>') + esc(money(r.amount)) + '</span>' },
    { key: 'account', label: 'Account', sort: 'account' }, { key: 'reference', label: 'Reference', sort: 'reference' }, { key: 'notes', label: 'Notes' }, { key: 'created_by', label: 'Created by', sort: 'created_by', hide: true },
  ],
  missing_cost: [
    { key: 'sku', label: 'SKU', sort: 'sku' }, { key: 'product', label: 'Product', sort: 'product' }, { key: 'category', label: 'Category', sort: 'category' },
    { key: 'units_sold', label: 'Units sold (period)', type: 'int', sort: 'units_sold', total: 'units_sold' }, { key: 'net_sales', label: 'Net sales (period)', type: 'money', sort: 'net_sales', total: 'net_sales' },
    { key: 'in_stock', label: 'In stock now', type: 'int', sort: 'in_stock', total: 'in_stock' }, { key: 'last_sold', label: 'Last sold', type: 'dt', sort: 'last_sold' },
    { key: 'in_catalog', label: 'In SKU Catalog', type: 'bool' },
  ],
};

/** A short title for the row-detail drawer. */
export const ROW_TITLE = {
  sales: (r) => (r.kind || 'Sale') + ' · ' + (r.order_no || r.product || ''), products: (r) => r.product || r.sku, purchases: (r) => (r.product || r.sku) + ' · ' + fmtDate(r.date),
  inventory: (r) => r.product || r.sku, expenses: (r) => r.description || r.category, payables: (r) => r.description || r.category, receivables: (r) => r.tracking_number || r.order_ref,
  payments: (r) => (r.source || '') + ' · ' + (r.reference || ''), capital: (r) => (r.type || '').replace(/_/g, ' ').toLowerCase(), missing_cost: (r) => r.product || r.sku,
};
void int;
