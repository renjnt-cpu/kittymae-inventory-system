// Scrap Monitoring -- "accepted as": the metal / purity the supplier or buyer took a lot for can differ from the one the branch recorded (the lot itself, and what left the branch's shelf,
// always stay as recorded). A small metal + purity picker used by the group confirmation and by the sale page, and the words that say what a lot was accepted as.
// The purities are the ones the POS offers (GOLD 10K..24K, SILVER 999 / 925 / 800); anything else is typed under "Custom…", so a purity like 20K is never lost.
import { esc, METALS } from './smFormat.js?v=20261031a';

export const GOLD_PURITIES = ['10K', '14K', '16K', '18K', '21K', '22K', '24K'];
export const SILVER_PURITIES = ['999', '925', '800'];
const CUSTOM = '__custom';
const purityList = (metal) => (metal === 'Gold' ? GOLD_PURITIES : metal === 'Silver' ? SILVER_PURITIES : []);
const norm = (k) => String(k == null ? '' : k).trim().toUpperCase();

/** what the lot was accepted as: { metal_type, karat, changed } -- an item (or a weighing row) carries accepted_metal_type / accepted_karat only when they differ from the recorded ones */
export const acceptedOf = (i) => (i && i.accepted_metal_type ? { metal_type: i.accepted_metal_type, karat: i.accepted_karat || '', changed: true } : { metal_type: (i && i.metal_type) || '', karat: (i && i.karat) || '', changed: false });
export const metalPurity = (metal, karat) => [metal, karat].filter(Boolean).join(' ') || 'Scrap';
/** "accepted as Gold 14K" under a recorded purity, or '' when nothing was changed */
export function acceptedNote(i) {
  if (!i || !i.accepted_metal_type) return '';
  return '<div class="sm-small sm-accepted">accepted as <b>' + esc(metalPurity(i.accepted_metal_type, i.accepted_karat) + (i.accepted_karat ? '' : ' (no purity)')) + '</b></div>';
}

const metalOptions = (metal) => METALS.map((m) => '<option' + (m === metal ? ' selected' : '') + '>' + esc(m) + '</option>').join('');
function purityOptions(metal, karat) {
  const list = purityList(metal), k = norm(karat), custom = !!k && !list.includes(k);
  return '<option value=""' + (!k ? ' selected' : '') + '>No purity</option>' + list.map((p) => '<option' + (p === k ? ' selected' : '') + '>' + esc(p) + '</option>').join('') +
    '<option value="' + CUSTOM + '"' + (custom ? ' selected' : '') + '>Custom…</option>';
}

/** The picker: a metal box, a purity box and (under "Custom…") a box to type the purity. `pre` makes the ids unique; `val` = { metal_type, karat }. */
export function acceptedControls(pre, val, label) {
  const metal = METALS.includes(val.metal_type) ? val.metal_type : 'Other', k = norm(val.karat), custom = !!k && !purityList(metal).includes(k);
  return '<div class="sm-acc" data-acc="' + esc(pre) + '"><select id="' + esc(pre) + '-m" aria-label="Metal accepted' + (label ? ' for ' + esc(label) : '') + '">' + metalOptions(metal) + '</select>' +
    '<select id="' + esc(pre) + '-p" aria-label="Purity accepted' + (label ? ' for ' + esc(label) : '') + '">' + purityOptions(metal, k) + '</select>' +
    '<input id="' + esc(pre) + '-c" type="text" maxlength="12" placeholder="e.g. 20K" value="' + (custom ? esc(k) : '') + '"' + (custom ? '' : ' hidden') + ' aria-label="Purity typed in">' + '</div>';
}

/** What the picker says now: { metal_type, karat, bad } -- `bad` is a sentence when "Custom…" is chosen but nothing (or too much) was typed. */
export function readAccepted(root, pre) {
  const g = (s) => root.querySelector('#' + pre + '-' + s);
  const m = g('m'), p = g('p'), c = g('c');
  if (!m || !p) return null;
  const choice = p.value;
  if (choice === CUSTOM) {
    const t = norm(c.value);
    return { metal_type: m.value, karat: t, bad: !t ? 'Type the purity (or choose “No purity”).' : t.length > 12 ? 'The purity is too long (12 characters at most).' : '' };
  }
  return { metal_type: m.value, karat: choice, bad: '' };
}

/** Makes the picker work: choosing a metal offers that metal's purities; choosing Custom… shows the box. `onChange(value)` runs after every change. */
export function wireAccepted(root, pre, onChange) {
  const g = (s) => root.querySelector('#' + pre + '-' + s);
  const m = g('m'), p = g('p'), c = g('c');
  if (!m || !p) return;
  const fire = () => { if (onChange) onChange(readAccepted(root, pre)); };
  m.addEventListener('change', () => { p.innerHTML = purityOptions(m.value, ''); c.hidden = true; c.value = ''; fire(); });
  p.addEventListener('change', () => { c.hidden = p.value !== CUSTOM; if (!c.hidden) c.focus(); fire(); });
  c.addEventListener('input', fire);
}

/** true when two { metal_type, karat } mean the same thing (the database stores "accepted" only when they differ) */
export const sameAs = (a, b) => String(a.metal_type || '') === String(b.metal_type || '') && norm(a.karat) === norm(b.karat);
