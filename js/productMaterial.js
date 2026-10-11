// Gold / Silver / Coated grouping for a product. The catalog has no material field
// (product_line and metal_purity are blank on every SKU), so this reads the two places
// that do carry it: the category ("18K COATED BRACELET", "SILVER CHAINS", "MK PENDANT" ...)
// and the item name ("SILVER WAVE RING 2.2G", "2IN1 COATED RING"). Used by Item
// Monitoring's Trace a Product (Ren, 2026-10-11: "i want to add a category of this gold,
// silver, coated").
//
//   Coated      the name or the category says COATED
//   Silver      the name or the category says SILVER
//   Gold        an "MK ..." category or PREMIUM CHAIN (their names say 2 TONE / WG / ALL GOLD
//               and carry gram weights), or a name that says GOLD
//   Not marked  none of the above -- the generic EARRINGS / PENDANT / RING / CHAIN ... SKUs,
//               phones, watches and accessories. Deliberately NOT guessed.
//
// The name is checked before the category so a piece described as SILVER stays Silver even
// when it was filed under a COATED category.
export const MATERIAL_GROUPS = ['Gold', 'Silver', 'Coated', 'Not marked'];

export function materialGroup(category, itemName) {
  const cat = String(category || '').trim().toUpperCase();
  const name = String(itemName || '').toUpperCase();
  if (name.includes('COATED')) return 'Coated';
  if (name.includes('SILVER')) return 'Silver';
  if (cat.includes('COATED')) return 'Coated';
  if (cat.includes('SILVER')) return 'Silver';
  if (cat.startsWith('MK ') || cat === 'PREMIUM CHAIN' || name.includes('GOLD')) return 'Gold';
  return 'Not marked';
}
