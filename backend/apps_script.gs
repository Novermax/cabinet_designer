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
    if (action === 'grant')    return handleGrant_(p);
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

/* ---------- online demo gating (Maestro export cap) ---------- */
/**
 * Server-authoritative Demo cap for Maestro (.xcs) exports.
 *
 * The client (cabinet_designer/demo_online.py) POSTs:
 *   action=grant, op=peek|consume, product, machine, gen, nonce
 * We look the machine up in the "DemoCounters" sheet, optionally increment
 * (consume), and return an RSA-SHA256 SIGNED reply so the client can trust it:
 *   { ok, machine, gen, nonce, op, used, limit, exp, sig }
 * where sig = base64url( RSASSA-PKCS1-v1.5(SHA-256) ) over the exact string
 *   grant-v1:{machine}:{gen}:{nonce}:{op}:{used}:{limit}:{exp}
 *
 * SETUP (once):
 *   1. Run packaging/genera_grant_keys.py on your PC.
 *   2. Project Settings -> Script properties -> add:
 *        GRANT_PRIVATE_PEM = <contents of packaging/grant_private_key.pem>
 *   3. (optional) GRANT_RESET_SECRET = <a long random string> to allow resets.
 * The private key stays here (Google's servers), never in the client bundle.
 */
var DEMO_LIMIT     = 3;
var GRANT_TTL_SECS = 300;              // reply validity window (anti-replay)

function handleGrant_(p) {
  var pem = PropertiesService.getScriptProperties().getProperty('GRANT_PRIVATE_PEM');
  if (!pem) return jsonOut_({ ok: false, error: 'server not configured' });

  var machine = String(p.machine || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  var gen     = parseInt(p.gen, 10); if (isNaN(gen)) gen = 0;
  var nonce   = String(p.nonce || '');
  var op      = String(p.op || 'peek');
  if (!machine) return jsonOut_({ ok: false, error: 'bad request' });

  // Owner-triggered reset: op=reset with the shared secret zeroes the machine.
  // Checked BEFORE the peek/consume coercion below.
  if (op === 'reset') {
    var secret = PropertiesService.getScriptProperties().getProperty('GRANT_RESET_SECRET');
    if (!secret || String(p.secret || '') !== secret) {
      return jsonOut_({ ok: false, error: 'forbidden' });
    }
    setCount_(machine, 0);
    return jsonOut_({ ok: true, used: 0, limit: DEMO_LIMIT });
  }

  if (!nonce) return jsonOut_({ ok: false, error: 'bad request' });
  if (op !== 'peek' && op !== 'consume') op = 'peek';

  var used = getCount_(machine);
  if (op === 'consume' && used < DEMO_LIMIT) {
    used = used + 1;
    setCount_(machine, used);
  }
  if (used > DEMO_LIMIT) used = DEMO_LIMIT;

  var exp = Math.floor(Date.now() / 1000) + GRANT_TTL_SECS;
  var msg = ['grant-v1', machine, gen, nonce, op, used, DEMO_LIMIT, exp].join(':');
  var sigBytes = Utilities.computeRsaSha256Signature(msg, pem);
  var sig = Utilities.base64EncodeWebSafe(sigBytes);

  return jsonOut_({
    ok: true, machine: machine, gen: gen, nonce: nonce, op: op,
    used: used, limit: DEMO_LIMIT, exp: exp, sig: sig
  });
}

function getCount_(machine) {
  var sh = counterSheet_();
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === machine) return parseInt(data[i][1], 10) || 0;
  }
  return 0;
}

function setCount_(machine, used) {
  var sh = counterSheet_();
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === machine) {
      sh.getRange(i + 1, 2).setValue(used);
      sh.getRange(i + 1, 3).setValue(new Date());
      return;
    }
  }
  sh.appendRow([machine, used, new Date()]);
}

function counterSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('DemoCounters');
  if (!sh) { sh = ss.insertSheet('DemoCounters'); sh.appendRow(['Machine', 'Used', 'Updated']); }
  return sh;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
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
