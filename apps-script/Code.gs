// Google Apps Script web app til delt madplansuge.
// Backend: Google Sheet som append-only lager. Samme id kan gemmes flere gange.
// Seneste række for et id er altid den aktuelle version.
//
// Sheet oprettet fra ChatGPT: Madplan delte uger
// Sheet id: 1-7cv_o6FsVRUIsLWfJF2-bS5ny3AZHWcJXylKbumuP4
// Faneblad: weeks
//
// Deploy:
// 1. Opret Apps Script fra Google Sheet eller script.google.com.
// 2. Indsæt hele denne fil som Code.gs.
// 3. Deploy som Web app.
// 4. Execute as: Me.
// 5. Who has access: Anyone with the link.
// 6. Kopiér Web app URL ind i frontendens MADPLAN_SHARE_CONFIG.apiUrl.

const SPREADSHEET_ID = '1-7cv_o6FsVRUIsLWfJF2-bS5ny3AZHWcJXylKbumuP4';
const SHEET_NAME = 'weeks';
const HEADERS = ['id', 'createdAt', 'updatedAt', 'version', 'payload', 'lastEditor', 'note'];

function ensureSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

  const firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const hasHeaders = HEADERS.every((header, index) => firstRow[index] === header);
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function nowIso_() {
  return new Date().toISOString();
}

function normalizeId_(id) {
  return String(id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
}

function findLatest_(sheet, id) {
  const normalizedId = normalizeId_(id);
  if (!normalizedId) return null;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  let latest = null;

  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    if (String(row[0]) === normalizedId) {
      latest = {
        id: String(row[0]),
        createdAt: String(row[1] || ''),
        updatedAt: String(row[2] || ''),
        version: Number(row[3] || 1),
        payload: String(row[4] || '{}'),
        lastEditor: String(row[5] || ''),
        note: String(row[6] || '')
      };
      break;
    }
  }

  if (!latest) return null;

  try {
    latest.data = JSON.parse(latest.payload || '{}');
  } catch (err) {
    latest.data = {};
    latest.parseError = String(err && err.message ? err.message : err);
  }

  return latest;
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonpOutput_(callback, obj) {
  const safeCallback = String(callback || 'callback').replace(/[^a-zA-Z0-9_.$]/g, '');
  const body = safeCallback + '(' + JSON.stringify(obj) + ');';
  return ContentService
    .createTextOutput(body)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = params.action || 'get';
  const callback = params.callback || '';
  const sheet = ensureSheet_();

  let result;

  if (action === 'ping') {
    result = { ok: true, service: 'madplan-share', time: nowIso_() };
  } else if (action === 'get') {
    const id = normalizeId_(params.id);
    const latest = findLatest_(sheet, id);
    result = latest
      ? { ok: true, found: true, week: latest }
      : { ok: true, found: false, id: id };
  } else {
    result = { ok: false, error: 'Unknown action', action: action };
  }

  return callback ? jsonpOutput_(callback, result) : jsonOutput_(result);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(8000);

  try {
    const params = e && e.parameter ? e.parameter : {};
    const sheet = ensureSheet_();
    const action = params.action || 'save';

    if (action !== 'save') {
      return jsonOutput_({ ok: false, error: 'Unknown action', action: action });
    }

    const id = normalizeId_(params.id);
    if (!id) {
      return jsonOutput_({ ok: false, error: 'Missing id' });
    }

    const rawPayload = params.payload || '{}';
    let parsed;
    try {
      parsed = JSON.parse(rawPayload);
    } catch (err) {
      return jsonOutput_({ ok: false, error: 'Invalid JSON payload' });
    }

    const existing = findLatest_(sheet, id);
    const now = nowIso_();
    const createdAt = existing ? existing.createdAt : now;
    const version = existing ? Number(existing.version || 1) + 1 : 1;
    const editor = String(params.editor || '').slice(0, 120);
    const note = String(params.note || '').slice(0, 500);

    sheet.appendRow([
      id,
      createdAt,
      now,
      version,
      JSON.stringify(parsed),
      editor,
      note
    ]);

    return jsonOutput_({ ok: true, id: id, version: version, updatedAt: now });
  } finally {
    lock.releaseLock();
  }
}
