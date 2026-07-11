/**
 * Cabinet Designer — single backend for the website + app.
 *
 * Handles three actions, routed by the `action` POST field:
 *   - request   (request.html)   -> "Requests" sheet + email
 *   - contact   (contact form)   -> "Contacts" sheet + email
 *   - activate  (activate.html / in-app "Activate online")
 *                                -> saves the uploaded file to Drive,
 *                                   logs it in "Activations", emails it to you
 *
 * DEPLOY (do this logged in as cabinetdesigner.global@gmail.com):
 *   1. Create a Google Sheet, e.g. "Cabinet Designer — Backend".
 *   2. Extensions -> Apps Script. Paste this file. Save.
 *   3. Deploy -> New deployment -> type "Web app".
 *        Execute as: Me (cabinetdesigner.global@gmail.com)
 *        Who has access: Anyone
 *      Authorize when prompted.
 *   4. Copy the Web app URL (https://script.google.com/macros/s/.../exec)
 *      and paste it into the `action="..."` of request.html and activate.html,
 *      and into ENDPOINT in the in-app activation code.
 */

var NOTIFY_EMAIL   = 'cabinetdesigner.global@gmail.com';
var DRIVE_FOLDER   = 'Cabinet Designer — Activations';
var MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var p = (e && e.parameter) || {};
    var action = p.action || 'request';
    if (action === 'activate') return handleActivate_(p);
    if (action === 'contact')  return handleContact_(p);
    return handleRequest_(p);
  } catch (err) {
    return textOut_('ERROR: ' + err);
  } finally {
    lock.releaseLock();
  }
}

// Simple health check when opened in a browser.
function doGet() {
  return textOut_('Cabinet Designer backend is running.');
}

/* ---------- actions ---------- */

function handleRequest_(p) {
  appendRow_('Requests',
    ['Timestamp', 'Name', 'Company', 'Email', 'Country', 'Plan', 'Message'],
    [new Date(), p.name, p.company, p.email, p.country, p.plan, p.message]);

  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: 'New license request — ' + (p.plan || '') + ' — ' + (p.name || ''),
    replyTo: p.email || NOTIFY_EMAIL,
    body: field_('Name', p.name) + field_('Company', p.company) + field_('Email', p.email) +
          field_('Country', p.country) + field_('Plan', p.plan) + field_('Message', p.message)
  });
  return textOut_('OK');
}

function handleContact_(p) {
  appendRow_('Contacts',
    ['Timestamp', 'Name', 'Email', 'Message'],
    [new Date(), p.name, p.email, p.message]);

  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: 'Contact form — ' + (p.name || ''),
    replyTo: p.email || NOTIFY_EMAIL,
    body: field_('Name', p.name) + field_('Email', p.email) + field_('Message', p.message)
  });
  return textOut_('OK');
}

function handleActivate_(p) {
  var fileUrl = '';
  var attachments = [];
  if (p.filedata && p.filename) {
    var bytes = Utilities.base64Decode(p.filedata);
    if (bytes.length > MAX_FILE_BYTES) return textOut_('ERROR: file too large');
    var blob = Utilities.newBlob(bytes, 'application/octet-stream', p.filename);
    var folder = getFolder_(DRIVE_FOLDER);
    var stamped = new Date().toISOString().replace(/[:.]/g, '-') + ' — ' +
                  (p.order || 'no-order') + ' — ' + p.filename;
    var file = folder.createFile(blob.setName(stamped));
    fileUrl = file.getUrl();
    attachments.push(blob);
  }

  appendRow_('Activations',
    ['Timestamp', 'Email', 'Order / receipt', 'Filename', 'Drive link', 'Note'],
    [new Date(), p.email, p.order, p.filename || '', fileUrl, p.note || '']);

  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: 'ACTIVATION request — order ' + (p.order || '') + ' — ' + (p.email || ''),
    replyTo: p.email || NOTIFY_EMAIL,
    body: 'Verify this payment in Stripe, then send the license.\n\n' +
          field_('Email', p.email) + field_('Order/receipt', p.order) +
          field_('File', p.filename) + field_('Drive', fileUrl) + field_('Note', p.note),
    attachments: attachments
  });
  return textOut_('OK');
}

/* ---------- helpers ---------- */

function appendRow_(sheetName, header, row) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  if (sh.getLastRow() === 0) sh.appendRow(header);
  sh.appendRow(row);
}

function getFolder_(name) {
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

function field_(label, val) { return label + ': ' + (val || '') + '\n'; }

function textOut_(s) { return ContentService.createTextOutput(s); }
