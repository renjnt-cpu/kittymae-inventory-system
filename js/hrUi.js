// HR 201 File -- small UI building blocks: toasts, dialogs, badges, view / edit fields.  No business rules and no network here.
import { esc, blank, norm, FIELD_DEFS, JOB_TITLES_BY_DEPT, statusLabel, fmtDate } from './hrLogic.js?v=20261007f';

export { esc };
export const $ = (id) => document.getElementById(id);

/** An error from the database or the network, in words a person can act on. */
export function friendly(err) {
  let m = String((err && err.message) || err || 'Something went wrong.');
  m = m.replace(/^Error:\s*/, '');
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Could not reach the server. Check the connection and try again.';
  if (/JWT expired|not authenticated/i.test(m)) return 'Your sign-in has expired. Reload the page and sign in again.';
  if (/Could not find the function|schema cache/i.test(m)) return 'The HR upgrade is not fully installed on the database yet. Please tell the system administrator. (' + m + ')';
  return m;
}

// ---------------------------------------------------------------- toast
let toastTimer = null;
export function toast(text, isError) {
  const el = $('hr-toast');
  if (!el) return;
  el.innerHTML = '<div class="msg ' + (isError ? 'error' : 'ok') + '" role="status">' + esc(isError ? friendly(text) : text) + '</div>';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.innerHTML = ''; }, isError ? 9000 : 4500);
}

// ---------------------------------------------------------------- badges
export const badge = (text, tone) => '<span class="badge ' + (tone || 'gray') + '">' + esc(text) + '</span>';
export const chip = (text, tone) => '<span class="hr-chip hr-chip-' + (tone || 'gray') + '">' + esc(text) + '</span>';
export const lockIcon = '<svg class="hr-ico" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M8 1a3.5 3.5 0 0 0-3.5 3.5V6H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-.5V4.5A3.5 3.5 0 0 0 8 1Zm2 5H6V4.5a2 2 0 1 1 4 0V6Z"/></svg>';
export const eyeIcon = '<svg class="hr-ico" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M8 3C4.5 3 1.7 5.2.5 8c1.2 2.8 4 5 7.5 5s6.3-2.2 7.5-5C14.3 5.2 11.5 3 8 3Zm0 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm0-1.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/></svg>';

// ---------------------------------------------------------------- dialogs
let modalSeq = 0;
/**
 * A dialog over the page.  footer = [{label, kind: 'primary'|'secondary'|'danger', onClick(close, btn), id}].  Returns {close, body, footer, el}.
 * dismissable=false makes Escape / the backdrop do nothing (used while a save is running or a choice is required).
 */
export function openModal({ title, sub = '', body = '', footer = [], wide = false, dismissable = true, onClose = null }) {
  const id = 'hr-modal-' + (++modalSeq);
  const el = document.createElement('div');
  el.className = 'hr-modal-backdrop';
  el.innerHTML = '<div class="hr-modal' + (wide ? ' hr-modal-wide' : '') + '" role="dialog" aria-modal="true" aria-labelledby="' + id + '-t">' +
    '<div class="hr-modal-head"><div><h3 id="' + id + '-t">' + esc(title) + '</h3>' + (sub ? '<p class="muted">' + esc(sub) + '</p>' : '') + '</div>' +
    (dismissable ? '<button type="button" class="hr-x" data-close aria-label="Close">×</button>' : '') + '</div>' +
    '<div class="hr-modal-body">' + body + '</div><div class="hr-modal-foot"></div></div>';
  document.body.appendChild(el);
  document.body.classList.add('hr-modal-open');
  const foot = el.querySelector('.hr-modal-foot'), bodyEl = el.querySelector('.hr-modal-body');
  let closed = false;
  const prevFocus = document.activeElement;
  const api = {
    el, body: bodyEl, footer: foot, dismissable,
    close() {
      if (closed) return; closed = true;
      document.removeEventListener('keydown', onKey, true);
      el.remove();
      if (!document.querySelector('.hr-modal-backdrop')) document.body.classList.remove('hr-modal-open');
      if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) { /* harmless */ } }
      if (onClose) onClose();
    },
    setFooter(buttons) {
      foot.innerHTML = '';
      buttons.forEach((b) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn' + (b.kind === 'secondary' ? ' secondary' : '') + (b.kind === 'danger' ? ' hr-danger' : '');
        btn.textContent = b.label;
        if (b.id) btn.id = b.id;
        if (b.disabled) btn.disabled = true;
        btn.addEventListener('click', () => b.onClick && b.onClick(api.close, btn));
        foot.appendChild(btn);
      });
    },
  };
  function onKey(e) {
    if (e.key !== 'Escape') return;
    const all = document.querySelectorAll('.hr-modal-backdrop');
    if (all[all.length - 1] !== el) return;
    if (api.dismissable) { e.stopPropagation(); api.close(); }
  }
  document.addEventListener('keydown', onKey, true);
  el.addEventListener('mousedown', (e) => { if (e.target === el && api.dismissable) api.close(); });
  const x = el.querySelector('[data-close]');
  if (x) x.addEventListener('click', () => api.close());
  api.setFooter(footer);
  const first = el.querySelector('input:not([type=hidden]), select, textarea') || foot.querySelector('button');
  if (first) setTimeout(() => { try { first.focus(); } catch (e) { /* harmless */ } }, 30);
  return api;
}

/** Yes / no.  Resolves true when the person confirms. */
export function confirmDialog({ title, message, okLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal({
      title, body: '<p>' + message + '</p>', dismissable: true, onClose: () => { if (!answered) resolve(false); },
      footer: [
        { label: cancelLabel, kind: 'secondary', onClick: (close) => { answered = true; close(); resolve(false); } },
        { label: okLabel, kind: danger ? 'danger' : 'primary', onClick: (close) => { answered = true; close(); resolve(true); } },
      ],
    });
    return m;
  });
}

/** Asks for a reason (and optionally more).  Resolves the text, or null when cancelled. */
export function reasonDialog({ title, message = '', label = 'Reason', okLabel = 'Continue', required = true, danger = false, placeholder = '' }) {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal({
      title, body: (message ? '<p>' + message + '</p>' : '') +
        '<div class="field"><label for="hr-reason-box">' + esc(label) + (required ? ' *' : '') + '</label><textarea id="hr-reason-box" rows="3" maxlength="300" placeholder="' + esc(placeholder) + '"></textarea></div>' +
        '<p class="hr-err" id="hr-reason-err" hidden></p>',
      onClose: () => { if (!answered) resolve(null); },
      footer: [
        { label: 'Cancel', kind: 'secondary', onClick: (close) => { answered = true; close(); resolve(null); } },
        { label: okLabel, kind: danger ? 'danger' : 'primary', onClick: (close) => {
          const v = $('hr-reason-box').value.trim();
          if (required && v.length < 3) { const e = $('hr-reason-err'); e.hidden = false; e.textContent = 'Please write a short reason (at least 3 characters).'; $('hr-reason-box').focus(); return; }
          answered = true; close(); resolve(v);
        } },
      ],
    });
    return m;
  });
}

/** Makes a button show it is working and ignore further clicks. */
export function busy(btn, on, text) {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.textContent; btn.disabled = true; if (text) btn.textContent = text; }
  else { btn.disabled = false; if (btn.dataset.label) btn.textContent = btn.dataset.label; }
}

// ---------------------------------------------------------------- fields
/** A read-only field: label above the value. */
export function viewField(label, valueHtml, opts = {}) {
  return '<div class="hr-vf' + (opts.wide ? ' hr-vf-wide' : '') + '"><span class="hr-vf-l">' + esc(label) + (opts.locked ? ' ' + lockIcon : '') + '</span>' +
    '<span class="hr-vf-v">' + (valueHtml === null || valueHtml === undefined || valueHtml === '' ? '<span class="muted">—</span>' : valueHtml) + '</span></div>';
}
export const textOrDash = (v) => (blank(v) ? '' : esc(v));

/** The edit control for one catalogue field.  `ctx` = {branches, jobTitles, department}. */
export function inputHtml(field, value, ctx = {}) {
  const d = FIELD_DEFS[field];
  const id = 'hr-f-' + field;
  const v = value === null || value === undefined ? '' : String(value);
  let control;
  if (d.type === 'select') {
    control = '<select id="' + id + '" data-field="' + field + '"><option value="">—</option>' +
      d.options.map((o) => '<option value="' + esc(o) + '"' + (String(o) === v ? ' selected' : '') + '>' + esc(d.optionLabel ? d.optionLabel(o) : o) + '</option>').join('') +
      (v && !d.options.includes(v) ? '<option value="' + esc(v) + '" selected>' + esc(v) + ' (not in the list)</option>' : '') + '</select>';
  } else if (d.type === 'branch') {
    control = '<select id="' + id + '" data-field="' + field + '"><option value="">— no branch —</option>' +
      (ctx.branches || []).map((b) => '<option value="' + b.id + '"' + (String(b.id) === v ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('') + '</select>';
  } else if (d.type === 'jobtitle') {
    const list = (ctx.positions || []).concat(JOB_TITLES_BY_DEPT[ctx.department] || []);
    const uniq = [...new Set(list)];
    control = '<input id="' + id + '" data-field="' + field + '" type="text" list="hr-dl-' + field + '" value="' + esc(v) + '" autocomplete="off">' +
      '<datalist id="hr-dl-' + field + '">' + uniq.map((t) => '<option value="' + esc(t) + '">').join('') + '</datalist>';
  } else if (d.type === 'textarea') {
    control = '<textarea id="' + id + '" data-field="' + field + '" rows="3">' + esc(v) + '</textarea>';
  } else if (d.type === 'date') {
    control = '<input id="' + id + '" data-field="' + field + '" type="date" value="' + esc(v.slice(0, 10)) + '">';
  } else if (d.type === 'number') {
    control = '<input id="' + id + '" data-field="' + field + '" type="number" step="0.01" min="0" inputmode="decimal" value="' + esc(v) + '">';
  } else if (d.type === 'gov') {
    control = '<input id="' + id + '" data-field="' + field + '" type="text" autocomplete="off" placeholder="' + esc(ctx.placeholder || 'Type the new number') + '" value="' + esc(v) + '">';
  } else {
    control = '<input id="' + id + '" data-field="' + field + '" type="text" value="' + esc(v) + '" autocomplete="off">';
  }
  return '<div class="field hr-ef" data-wrap="' + field + '"><label for="' + id + '">' + esc(d.label) + (d.critical && !ctx.noCrit ? ' <span class="hr-crit" title="Changing this asks for a reason">●</span>' : '') + '</label>' + control +
    (d.hint ? '<span class="hr-hint">' + esc(d.hint) + '</span>' : '') + '<span class="hr-was" data-was="' + field + '" hidden></span></div>';
}

/** Wires every [data-field] control inside `root` to `session.values`, marking the ones that differ from `session.original`. */
export function bindEdit(root, session, onChange) {
  const sync = (el) => {
    const f = el.dataset.field;
    let val = el.value;
    if (el.type === 'checkbox') return;
    session.values[f] = val;
    const wrap = root.querySelector('[data-wrap="' + f + '"]');
    const was = root.querySelector('[data-was="' + f + '"]');
    const d = FIELD_DEFS[f];
    const o = session.original[f];
    let changed;
    if (d.type === 'gov') changed = !blank(val);
    else if (d.type === 'number') changed = !(blank(o) && blank(val)) && (blank(o) || blank(val) || Number(o) !== Number(val));
    else changed = norm(o) !== norm(val);
    if (!changed) delete session.values[f];
    if (wrap) wrap.classList.toggle('hr-changed', changed);
    if (was) { was.hidden = !changed || d.type === 'gov'; if (changed) was.textContent = 'was: ' + (blank(o) ? '—' : (d.sensitive ? '(hidden)' : (d.type === 'date' ? fmtDate(o) : o))); }
    if (onChange) onChange(f);
  };
  root.querySelectorAll('[data-field]').forEach((el) => {
    el.addEventListener('input', () => sync(el));
    el.addEventListener('change', () => sync(el));
  });
}

export const emptyBox = (text) => '<div class="empty-state"><div class="empty-state-msg">' + text + '</div></div>';
export const spinner = (text) => '<p class="muted hr-loading">' + esc(text || 'Loading…') + '</p>';
export { statusLabel };
