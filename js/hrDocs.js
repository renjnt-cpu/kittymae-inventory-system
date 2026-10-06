// HR 201 File -- the Document Center tab: required-document checklist, upload, versions, expiry alerts, archive (never delete).
// Files live in the private "employee-201-documents" bucket; every action is checked and logged by the database (hr_* functions).
import { esc, $, badge, spinner, emptyBox, friendly, toast, confirmDialog, reasonDialog, openModal, busy } from './hrUi.js?v=20261007f';
import { DOC_CATEGORIES, DOC_STATE_LABEL, fmtDate, fmtDateTime, fmtBytes, expiryText, plural } from './hrLogic.js?v=20261007f';

const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx';

export async function renderDocuments(ctx, ps, panel) {
  ps.ui = ps.ui || {};
  panel.innerHTML = '<h3>Documents</h3>' + spinner('Loading documents…');
  let res;
  try { res = await ctx.api.listDocuments(ps.id, !!ps.ui.showArchived); }
  catch (err) { panel.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; return; }
  if (ctx.ps !== ps || ps.tab !== 'documents') return;
  draw(ctx, ps, panel, res);
}

function draw(ctx, ps, panel, res) {
  const docs = res.documents || [], list = res.checklist || [], can = res.can_manage, canDelete = res.can_delete;
  const required = list.filter((x) => x.is_required), optional = list.filter((x) => !x.is_required);
  const chk = (x) => '<div class="hr-chk ' + (x.is_required ? x.state : (x.state === 'missing' ? 'optional' : x.state)) + '"><span>' + esc(x.doc_type) + (x.is_required ? '' : ' <span class="muted">(optional)</span>') + '</span>' +
    '<span>' + (x.state === 'ok' ? badge('On file', 'ok') : x.state === 'missing' ? badge(x.is_required ? 'Missing' : 'Not on file', x.is_required ? 'low' : 'gray') : x.state === 'expiring' ? badge('Expiring soon', 'pending') : badge('Expired', 'low')) + '</span></div>';
  const active = docs.filter((d) => d.status === 'Active');
  const history = docs.filter((d) => d.status !== 'Active');
  const byCat = {};
  active.forEach((d) => { (byCat[d.category || 'Other'] = byCat[d.category || 'Other'] || []).push(d); });
  const docRow = (d) => '<div class="hr-doc' + (d.status !== 'Active' ? ' archived' : '') + '"><div class="hr-doc-main"><b>' + esc(d.document_name) + '</b> ' +
    (d.version > 1 || d.status === 'Replaced' ? badge('Version ' + d.version, 'transit') + ' ' : '') + (d.status !== 'Active' ? badge(d.status, 'gray') + ' ' : '') +
    (d.doc_type ? '<span class="hr-chip">' + esc(d.doc_type) + '</span> ' : '') +
    (d.expiry_state === 'expired' ? badge(expiryText(d), 'low') : d.expiry_state === 'expiring' ? badge(expiryText(d), 'pending') : '<span class="muted">' + esc(expiryText(d)) + '</span>') +
    '<span class="muted" style="display:block;">Added ' + esc(fmtDateTime(d.uploaded_at)) + (d.uploaded_by_name ? ' by ' + esc(d.uploaded_by_name) : '') + (d.file_size ? ' · ' + esc(fmtBytes(d.file_size)) : '') +
    (d.description ? ' · ' + esc(d.description) : '') + (d.status !== 'Active' && d.archive_reason ? '<br>' + esc(d.status === 'Replaced' ? '' : 'Archived: ') + esc(d.archive_reason) : '') + '</span></div>' +
    '<div class="hr-doc-actions"><button type="button" class="btn small secondary" data-doc="open" data-id="' + esc(d.id) + '">Open</button>' +
    (can && d.status === 'Active' ? '<button type="button" class="btn small secondary" data-doc="replace" data-id="' + esc(d.id) + '">Upload new version</button><button type="button" class="btn small secondary" data-doc="archive" data-id="' + esc(d.id) + '">Archive</button>' : '') +
    (can && d.status === 'Archived' ? '<button type="button" class="btn small secondary" data-doc="restore" data-id="' + esc(d.id) + '">Restore</button>' : '') +
    (canDelete && d.status !== 'Active' ? '<button type="button" class="btn small hr-danger" data-doc="delete" data-id="' + esc(d.id) + '">Delete permanently</button>' : '') + '</div></div>';

  panel.innerHTML = '<h3>Documents</h3>' +
    '<h4>Required documents <span class="muted" style="text-transform:none;letter-spacing:0;">— ' + required.filter((x) => x.state === 'ok' || x.state === 'expiring').length + ' of ' + required.length + ' on file</span>' +
    (can ? ' <button type="button" class="hr-link" id="hr-chk-edit">Customize checklist</button>' : '') + '</h4>' +
    (required.length ? '<div class="hr-check">' + required.map(chk).join('') + '</div>' : '<p class="muted">No document is marked as required yet.' + (can ? ' Use “Customize checklist” to choose which ones every employee should have.' : '') + '</p>') +
    (optional.length ? '<details class="exp"><summary><span class="exp-arrow" aria-hidden="true">▸</span>Other documents we track (' + optional.length + ')</summary><div class="exp-body"><div class="hr-check">' + optional.map(chk).join('') + '</div></div></details>' : '') +
    (can ? '<h4>Add a document</h4><form id="hr-up" class="hr-upload" autocomplete="off">' +
      '<div class="field"><label for="hr-up-name">Document name *</label><input id="hr-up-name" required maxlength="200" placeholder="e.g. SSS ID front"></div>' +
      '<div class="field"><label for="hr-up-type">Document type</label><input id="hr-up-type" list="hr-up-types" placeholder="Pick or type"><datalist id="hr-up-types">' + list.map((x) => '<option value="' + esc(x.doc_type) + '">').join('') + '</datalist></div>' +
      '<div class="field"><label for="hr-up-cat">Category</label><select id="hr-up-cat">' + (res.categories || DOC_CATEGORIES).map((c) => '<option>' + esc(c) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="hr-up-issue">Issue date</label><input id="hr-up-issue" type="date"></div>' +
      '<div class="field"><label for="hr-up-exp">Expiry date</label><input id="hr-up-exp" type="date"></div>' +
      '<div class="field"><label for="hr-up-file">File * <span class="muted">(PDF or image, up to 15 MB)</span></label><input id="hr-up-file" type="file" accept="' + ACCEPT + '" required></div>' +
      '<div class="field"><label for="hr-up-desc">Note</label><input id="hr-up-desc" maxlength="200" placeholder="Optional"></div>' +
      '<div class="field"><label>&nbsp;</label><button class="btn" type="submit" id="hr-up-go">Upload</button></div></form>' : '') +
    '<h4>' + plural(active.length, 'document') + ' on file</h4>' +
    (active.length ? Object.keys(byCat).sort().map((c) => '<h5 style="margin:12px 0 6px;font-size:12px;color:var(--muted);">' + esc(c) + '</h5><div class="hr-docs">' + byCat[c].map(docRow).join('') + '</div>').join('') : emptyBox('No documents have been uploaded for this employee yet.')) +
    '<label class="hr-qbtn" style="display:inline-block;margin-top:14px;"><input type="checkbox" id="hr-arch-docs"' + (ps.ui.showArchived ? ' checked' : '') + '> Show archived and replaced versions</label>' +
    (ps.ui.showArchived ? (history.length ? '<h4>Archived and earlier versions</h4><div class="hr-docs">' + history.map(docRow).join('') + '</div>' : '<p class="muted">No archived or replaced documents.</p>') : '') +
    '<p class="muted" style="margin-top:12px;">Documents are archived, never deleted. Every upload, version and archive is recorded in the audit log.</p>';

  $('hr-arch-docs').addEventListener('change', (e) => { ps.ui.showArchived = e.target.checked; renderDocuments(ctx, ps, panel); });
  const find = (id) => docs.find((d) => d.id === id);
  panel.querySelectorAll('[data-doc]').forEach((b) => b.addEventListener('click', () => docAction(ctx, ps, panel, b.dataset.doc, find(b.dataset.id), b)));
  if ($('hr-chk-edit')) $('hr-chk-edit').addEventListener('click', () => openChecklist(ctx, ps, panel));
  if ($('hr-up')) $('hr-up').addEventListener('submit', (ev) => { ev.preventDefault(); upload(ctx, ps, panel, null); });
}

async function upload(ctx, ps, panel, replacing, dlg) {
  const p = replacing ? 'hr-rp-' : 'hr-up-';
  const file = $(p + 'file').files[0];
  if (!file) { toast('Choose a file first.', true); return; }
  if (file.size > MAX_BYTES) { toast('That file is ' + fmtBytes(file.size) + '. The limit is 15 MB.', true); return; }
  const name = replacing ? ($(p + 'name').value.trim() || replacing.document_name) : $(p + 'name').value.trim();
  if (!name) { toast('Give the document a name.', true); return; }
  const btn = $(p + 'go'); busy(btn, true, 'Uploading…');
  let path = null;
  try {
    path = await ctx.api.uploadFile(ps.id, file);
    const r = await ctx.api.addDocument(ps.id, {
      name, path, category: $(p + 'cat') ? $(p + 'cat').value : (replacing && replacing.category), docType: $(p + 'type') ? $(p + 'type').value.trim() : null,
      issueDate: $(p + 'issue').value || null, expiryDate: $(p + 'exp').value || null, description: $(p + 'desc') ? $(p + 'desc').value.trim() : null,
      size: file.size, mime: file.type, replacesId: replacing ? replacing.id : null,
    });
    if (r && r.ok === false) { await ctx.api.removeFile(path).catch(() => {}); toast((r.errors && r.errors[0] && r.errors[0].message) || 'The document could not be saved.', true); busy(btn, false); return; }
    toast(replacing ? 'New version uploaded.' : 'Document uploaded.');
    if (dlg) dlg.close();
    await ctx.afterChange();
  } catch (err) {
    if (path) await ctx.api.removeFile(path).catch(() => {});
    toast(err, true); busy(btn, false);
  }
}

async function docAction(ctx, ps, panel, action, d, btn) {
  if (!d) return;
  try {
    if (action === 'open') {
      const w = window.open('about:blank', '_blank');
      try {
        const r = await ctx.api.openDocument(d.id);
        const url = await ctx.api.signedUrl(r.storage_path);
        if (w) { w.opener = null; w.location.href = url; } else window.location.href = url;
      } catch (err) { if (w) w.close(); throw err; }
    } else if (action === 'archive') {
      const reason = await reasonDialog({ title: 'Archive “' + d.document_name + '”', message: 'The file is kept and can be restored. It just stops counting as a current document.', label: 'Reason', okLabel: 'Archive' });
      if (reason === null) return;
      const r = await ctx.api.archiveDocument(d.id, reason);
      if (r && r.ok === false) { toast(r.errors[0].message, true); return; }
      toast('Document archived.'); await ctx.afterChange();
    } else if (action === 'restore') {
      await ctx.api.restoreDocument(d.id); toast('Document restored.'); await ctx.afterChange();
    } else if (action === 'replace') {
      const dlg = openModal({
        title: 'Upload a new version', sub: d.document_name + ' (now version ' + d.version + ')',
        body: '<form id="hr-rp" class="hr-ef-grid" autocomplete="off"><div class="field"><label for="hr-rp-name">Name</label><input id="hr-rp-name" value="' + esc(d.document_name) + '" maxlength="200"></div>' +
          '<div class="field"><label for="hr-rp-issue">Issue date</label><input id="hr-rp-issue" type="date"></div><div class="field"><label for="hr-rp-exp">Expiry date</label><input id="hr-rp-exp" type="date"></div>' +
          '<div class="field"><label for="hr-rp-file">File *</label><input id="hr-rp-file" type="file" accept="' + ACCEPT + '" required></div></form>' +
          '<p class="muted">The current version is kept in the history as “Replaced”.</p>',
        footer: [{ label: 'Cancel', kind: 'secondary', onClick: (close) => close() }, { label: 'Upload', kind: 'primary', id: 'hr-rp-go', onClick: () => upload(ctx, ps, panel, d, dlg) }],
      });
    } else if (action === 'delete') {
      const reason = await reasonDialog({ title: 'Delete “' + d.document_name + '” permanently', message: 'This removes the file for good and cannot be undone. Only do this for a document uploaded by mistake. The deletion itself is recorded in the audit log.', label: 'Why must it be deleted?', okLabel: 'Delete permanently', danger: true });
      if (reason === null) return;
      const r = await ctx.api.deleteDocumentPermanently(d.id, reason);
      if (r && r.ok === false) { toast(r.errors[0].message, true); return; }
      if (r.storage_path) await ctx.api.removeFile(r.storage_path).catch(() => {});
      toast('Document deleted.'); await ctx.afterChange();
    }
  } catch (err) { toast(err, true); }
}

async function openChecklist(ctx, ps, panel) {
  let rows;
  try { rows = await ctx.api.listRequirements(); } catch (err) { toast(err, true); return; }
  const dlg = openModal({ title: 'Document checklist', sub: 'Which documents every employee should have. Required ones count toward “missing documents”.', wide: true, body: '<div id="hr-req-body"></div>', footer: [{ label: 'Done', kind: 'primary', onClick: async (close) => { close(); await ctx.afterChange(); } }] });
  const body = $('hr-req-body');
  const draw2 = () => {
    body.innerHTML = '<div class="table-scroll"><table><thead><tr><th>Document type</th><th>Category</th><th>Required</th><th>Tracked</th></tr></thead><tbody>' +
      rows.map((r, i) => '<tr><td data-label="Type">' + esc(r.doc_type) + '</td><td data-label="Category"><select data-i="' + i + '" data-k="category">' + DOC_CATEGORIES.map((c) => '<option' + (c === r.category ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></td>' +
        '<td data-label="Required"><input type="checkbox" data-i="' + i + '" data-k="is_required"' + (r.is_required ? ' checked' : '') + '></td><td data-label="Tracked"><input type="checkbox" data-i="' + i + '" data-k="active"' + (r.active ? ' checked' : '') + '></td></tr>').join('') + '</tbody></table></div>' +
      '<form id="hr-req-add" class="hr-upload"><div class="field"><label for="hr-req-new">New document type</label><input id="hr-req-new" maxlength="100" placeholder="e.g. Drug test result"></div>' +
      '<div class="field"><label for="hr-req-cat">Category</label><select id="hr-req-cat">' + DOC_CATEGORIES.map((c) => '<option>' + esc(c) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>&nbsp;</label><label style="font-size:13px;"><input type="checkbox" id="hr-req-req"> Required</label></div><div class="field"><label>&nbsp;</label><button class="btn small" type="submit">Add</button></div></form>';
    body.querySelectorAll('[data-i]').forEach((el) => el.addEventListener('change', async () => {
      const r = rows[Number(el.dataset.i)];
      if (el.dataset.k === 'category') r.category = el.value; else r[el.dataset.k] = el.checked;
      try { await ctx.api.saveRequirement(r.doc_type, r.category, r.is_required, r.active, r.sort_order); toast('Checklist updated.'); } catch (err) { toast(err, true); }
    }));
    $('hr-req-add').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const name = $('hr-req-new').value.trim(); if (!name) return;
      try {
        const r = await ctx.api.saveRequirement(name, $('hr-req-cat').value, $('hr-req-req').checked, true, null);
        if (r && r.ok === false) { toast(r.errors[0].message, true); return; }
        rows = await ctx.api.listRequirements(); draw2(); toast('Added to the checklist.');
      } catch (err) { toast(err, true); }
    });
  };
  draw2();
}
