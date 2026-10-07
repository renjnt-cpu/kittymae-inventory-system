// Data Fixes -- the one place these screens talk to the database (functions dq_*, migrations 152-157).
// Every call comes back as a plain object: { ok, message, ... }. A network or database failure is turned into the same friendly sentence; the technical
// reason is kept in `technical` for the browser console and is NEVER shown to a person.
import { supabase } from './supabaseClient.js?v=20261007i';

export const GENERIC_ERROR = 'We couldn\'t save this change. Please try again.';
export const LOAD_ERROR = 'We couldn\'t load this right now. Please try again.';

async function call(name, args, failMessage) {
  let res;
  try { res = await supabase.rpc(name, args || {}); }
  catch (e) { return { ok: false, message: failMessage || GENERIC_ERROR, network: true, technical: String(e && e.message || e) }; }
  if (res.error) return { ok: false, message: failMessage || GENERIC_ERROR, network: true, technical: res.error.message };
  const d = res.data;
  return d && typeof d === 'object' ? d : { ok: false, message: failMessage || GENERIC_ERROR };
}

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

export const dq = {
  // ---- reading (sanitized by the database: no sales, profit, capital, cash ...)
  summary: (scope) => call('dq_summary', { p_scope: scope || null }, LOAD_ERROR),
  list: (o) => call('dq_list', { p_type: o.type || null, p_scope: o.scope || null, p_search: o.search || null, p_limit: o.limit || 50, p_offset: o.offset || 0 }, LOAD_ERROR),
  item: (o) => call('dq_item', { p_issue_id: o.id || null, p_type: o.type || null, p_record: o.record || null }, LOAD_ERROR),
  options: () => call('dq_options', {}, LOAD_ERROR),
  candidates: (query, external) => call('dq_sku_candidates', { p_query: query || null, p_external: external || null }, LOAD_ERROR),
  assignees: () => call('dq_assignees', {}, LOAD_ERROR),
  myChanges: (limit) => call('dq_my_changes', { p_limit: limit || 10 }, LOAD_ERROR),
  auditList: (limit, offset) => call('dq_audit_list', { p_limit: limit || 20, p_offset: offset || 0, p_type: null, p_person: null }, LOAD_ERROR),
  start: (id) => call('dq_start', { p_issue_id: id }),
  refresh: () => call('dq_refresh', {}),

  // ---- fixing
  costSave: (a) => call('dq_cost_save', { p_sku: a.sku, p_cost: num(a.cost), p_source: a.source || 'manual', p_supplier: a.supplier || null, p_note: a.note || null, p_confirm: !!a.confirm }),
  costBulk: (items, supplier, confirm) => call('dq_cost_bulk_save', { p_items: items, p_supplier: supplier || null, p_confirm: !!confirm }),
  purchaseSave: (a) => call('dq_purchase_save', { p_id: a.id, p_unit_price: num(a.unit), p_total: num(a.total), p_note: a.note || null }),
  purchaseBulk: (items, confirm) => call('dq_purchase_bulk_save', { p_items: items, p_confirm: !!confirm }),
  categorySave: (sku, category) => call('dq_category_save', { p_sku: sku, p_category: category }),
  categoryBulk: (skus, category, confirm) => call('dq_category_bulk_set', { p_skus: skus, p_category: category, p_confirm: !!confirm }),
  supplierAdd: (name) => call('dq_supplier_add', { p_name: name }),
  supplierSave: (sku, supplier) => call('dq_supplier_save', { p_sku: sku, p_supplier: supplier }),
  supplierBulk: (skus, supplier, confirm) => call('dq_supplier_bulk_set', { p_skus: skus, p_supplier: supplier, p_confirm: !!confirm }),
  skuMap: (external, shop, components) => call('dq_sku_map', { p_external: external, p_shop: shop, p_components: components }),
  skuCreate: (a) => call('dq_sku_create', { p_external: a.external, p_shop: a.shop, p_name: a.name, p_category: a.category || null, p_price: num(a.price), p_cost: num(a.cost) }),
  assign: (ids, employee) => call('dq_assign', { p_issue_ids: ids, p_employee: employee || null }),
  assignType: (type, employee, all) => call('dq_assign_type', { p_type: type, p_employee: employee || null, p_all: !!all }),
};
