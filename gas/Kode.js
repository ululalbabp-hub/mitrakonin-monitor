/**
 * MITRAKONIN Monitor — backend Apps Script (bound ke Sheet database).
 * Tahap 0: hanya uji koneksi. API lengkap dibuat di Tahap 2.
 * Aturan: tidak ada ID yang ditulis langsung. Sheet = getActiveSpreadsheet().
 */
function ping() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tabs = ss.getSheets().map(function (s) { return s.getName(); });
  Logger.log('Terhubung ke: ' + ss.getName() + ' | ' + tabs.length + ' tab: ' + tabs.join(', '));
  return tabs;
}
