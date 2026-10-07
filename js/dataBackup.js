// Bundles date-range-filtered transaction records and their Storage attachments
// (scrap/layaway/refund/bill/transfer/asset photos) into one downloadable zip -- see data-backup.html.
// This exists because Supabase's own daily backups only snapshot the Postgres database;
// they explicitly do NOT include Storage bucket contents, so without this, the photos
// themselves have no backup at all if something ever happens to them.
import { supabase } from './supabaseClient.js?v=20261007i';

const SOURCES = [
  { table: 'bills', dateCol: 'created_at', pathCol: 'attachment_path', bucket: 'bill-attachments', label: 'Expenses' },
  // every proof / invoice file attached to a bill (the line above only reaches the newest one per bill)
  { table: 'bill_attachments', dateCol: 'created_at', pathCol: 'file_path', bucket: 'bill-attachments', label: 'Expense Files (proofs & invoices)' },
  { table: 'scrap_entries', dateCol: 'created_at', pathCol: 'attachment_path', bucket: 'scrap-attachments', label: 'Scrap Entries' },
  // the proof of payment on each scrap payment line (the line above only reaches the entry's own photo)
  { table: 'scrap_payments', dateCol: 'created_at', pathCol: 'attachment_path', bucket: 'scrap-attachments', label: 'Scrap Payment Proofs' },
  // the proof of payment on each Subasta sale payment (Subasta Mark Sold / add payment, migration 178)
  { table: 'subasta_payments', dateCol: 'created_at', pathCol: 'attachment_path', bucket: 'subasta-attachments', label: 'Subasta Payment Proofs' },
  { table: 'refunds', dateCol: 'created_at', pathCol: 'request_attachment_path', bucket: 'refund-attachments', label: 'Refund Requests' },
  { table: 'refund_attachments', dateCol: 'uploaded_at', pathCol: 'attachment_path', bucket: 'refund-attachments', label: 'Refund Payment Proofs' },
  // every request attachment and refund proof uploaded since the Refund Management upgrade (the two lines above hold the older ones)
  { table: 'refund_files', dateCol: 'created_at', pathCol: 'file_path', bucket: 'refund-attachments', label: 'Refund Files (requests & proofs)' },
  // transfer slips, packing / receiving / damage photos and courier receipts (a removed file stays in storage, so it is included too)
  { table: 'transfer_files', dateCol: 'created_at', pathCol: 'file_path', bucket: 'transfer-attachments', label: 'Transfer Files (slips & photos)' },
  // asset photos and documents (Asset & Supplies Custodian) -- a file removed from an asset is hidden from everyone, so only the current ones are included
  { table: 'asset_files', dateCol: 'created_at', pathCol: 'file_path', bucket: 'asset-attachments', label: 'Asset Files (photos & documents)' },
  { table: 'layaway_payments', dateCol: 'created_at', pathCol: 'attachment_path', bucket: 'layaway-attachments', label: 'Layaway Payments' },
];

/** fromDate/toDate are 'YYYY-MM-DD' strings from <input type=date>, or '' for open-ended.
 * onProgress(text) is called as work happens so the page can show live status. Returns
 * null if nothing in range matched (nothing to download). */
export async function buildBackupZip(fromDate, toDate, onProgress) {
  const zip = new JSZip();
  const matched = [];
  let fileCount = 0, skipped = 0;

  for (const src of SOURCES) {
    onProgress('Looking up ' + src.label + '…');
    let query = supabase.from(src.table).select('*').not(src.pathCol, 'is', null);
    if (fromDate) query = query.gte(src.dateCol, fromDate);
    if (toDate) query = query.lte(src.dateCol, toDate + 'T23:59:59');
    const { data: rows, error } = await query;
    if (error) throw new Error(src.label + ': ' + error.message);
    if (!rows.length) continue;

    matched.push({ label: src.label, table: src.table, rows });
    const folder = zip.folder(src.table);
    folder.file('records.json', JSON.stringify(rows, null, 2));
    for (const row of rows) {
      const path = row[src.pathCol];
      onProgress('Downloading ' + src.label + ' photo ' + (fileCount + skipped + 1) + '…');
      try {
        const { data: blob, error: dlErr } = await supabase.storage.from(src.bucket).download(path);
        if (dlErr) throw dlErr;
        folder.file(path.split('/').pop(), blob);
        fileCount++;
      } catch (err) {
        skipped++;
      }
    }
  }

  if (!matched.length) return null;

  const recordCount = matched.reduce((n, s) => n + s.rows.length, 0);
  zip.file('README.txt',
    'Kittymae Jewels -- Data Backup\r\n' +
    'Range: ' + (fromDate || 'the beginning') + ' to ' + (toDate || 'today') + '\r\n' +
    'Generated: ' + new Date().toISOString() + '\r\n\r\n' +
    matched.map((s) => s.label + ': ' + s.rows.length + ' record(s)').join('\r\n') + '\r\n\r\n' +
    'Each folder is a database table. records.json inside it holds the full row data\r\n' +
    'for that table in this date range; any other files in the same folder are the\r\n' +
    'actual attached photos for those records.\r\n' +
    (skipped ? '\r\n' + skipped + ' file(s) could not be downloaded and were skipped.\r\n' : '') +
    '\r\nThis is a personal reference copy. Supabase\'s own daily database backups\r\n' +
    '(Database > Backups in the dashboard) already cover all table data, but do NOT\r\n' +
    'include Storage files like these photos -- this export is the only backup of the\r\n' +
    'photos themselves.'
  );

  onProgress('Zipping…');
  const blob = await zip.generateAsync({ type: 'blob' });
  return { blob, fileCount, skipped, recordCount };
}
