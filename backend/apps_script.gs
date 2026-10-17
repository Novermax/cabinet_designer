/**
 * Cabinet Designer — single backend for the website + app.
 *
 * Handles these actions, routed by the `action` POST field:
 *   - request   (request.html)   -> "Requests" sheet + email
 *   - contact   (contact form)   -> "Contacts" sheet + email
 *   - activate  (activate.html / in-app "Activate online")
 *                                -> saves the uploaded file to Drive,
 *                                   logs it in "Activations", emails it to you
 *   - grant     (in-app demo cap) -> "DemoCounters" sheet, RSA-signed reply
 *   - telemetry (in-app, Full and Demo, consent-gated)
 *                                -> "Telemetry" sheet (one row per event) +
 *                                   "Clients" sheet (one row per installation)
 *   - telemetry_delete (in-app, consent withdrawn)
 *                                -> erases that installation's rows
 *   - telemetry_unlink (in-app, licence link turned off)
 *                                -> blanks the licence code on its rows
 *
 * Plus owner notifications on Telegram (downloads of the installers, new
 * installations and installed updates): see "Telegram notifications" below.
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
    if (action === 'grant')     return handleGrant_(p);
    if (action === 'telemetry') return handleTelemetry_(p);
    if (action === 'telemetry_delete') return handleTelemetryDelete_(p);
    if (action === 'telemetry_unlink') return handleTelemetryUnlink_(p);
    if (action === 'activate')  return handleActivate_(p);
    if (action === 'license_alert') return handleLicenseAlert_(p);
    if (action === 'contact')   return handleContact_(p);
    // request.html posts no action at all; any OTHER unknown action (e.g. a
    // newer app calling a handler this deployment lacks) must not become a
    // blank licence request + e-mail.
    if (action !== 'request') return textOut_('ERROR: unknown action');
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
  // What the person typed into the activation form, for the owner who sells
  // by hand: the e-mail and the order are theirs to give, nothing else is added.
  notifyTelegram_('📩 Richiesta di attivazione: ' + String(p.email || '(nessuna e-mail)').slice(0, 120) +
                  (p.order ? ' · ordine ' + String(p.order).slice(0, 80) : ''));
  return textOut_('OK');
}

/* ---------- licence misuse alert (Full, licence enforcement) ---------- */
/**
 * The client (cabinet_license/alert.py) POSTs, without waiting for the
 * statistics consent (licence enforcement, declared in the EULA, section 3):
 *   action=license_alert, product, kind ("stored" = a licence folder copied
 *   to another PC, seen at startup; "import" = someone else's unlock file
 *   loaded in the activation window), license (short code "XXXXX-XXXXX"),
 *   machine (12-hex one-way tag of the Machine ID), app_version, country.
 * Only for a GENUINE licence (valid signature) on the wrong computer, once
 * per licence + machine + kind. No name, e-mail, hostname or IP: the owner
 * maps the licence code to the customer it was issued to.
 *
 *   "License alerts" -> one row per alert, purged with the statistics
 *                       after RETENTION_MONTHS (purgeOldTelemetry)
 */
var LICENSE_ALERT_HEADER = ['Timestamp', 'Kind', 'License', 'Machine', 'App version', 'Country'];

function handleLicenseAlert_(p) {
  var kind    = (p.kind === 'stored' || p.kind === 'import') ? p.kind : '';
  var license = /^[0-9A-F]{5}-[0-9A-F]{5}$/.test(String(p.license || '')) ? p.license : '';
  var machine = /^[0-9a-f]{12}$/.test(String(p.machine || '')) ? p.machine : '';
  var country = /^[A-Z]{2}$/.test(String(p.country || '')) ? p.country : '';
  var version = /^[0-9][0-9A-Za-z.+-]{0,30}$/.test(String(p.app_version || '')) ? p.app_version : '';
  if (!kind || !license || !machine) return textOut_('ERROR: bad alert');

  var sh = sheet_('License alerts', LICENSE_ALERT_HEADER);
  sh.appendRow([new Date(), kind, license, machine, version, country].map(cell_));

  // How many different computers this licence has turned up on, this one included.
  var machines = {};
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 3, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
      if (String(r[0]) === license) machines[String(r[1])] = true;
    });
  }
  var count = Object.keys(machines).length;
  notifyTelegram_('⚠️ Licenza ' + license + ' su un altro computer: ' +
                  (kind === 'stored' ? 'cartella della licenza copiata'
                                     : 'tentativo di caricare il suo file di sblocco') +
                  ' · ' + count + (count === 1 ? ' computer estraneo' : ' computer estranei') +
                  (version ? ' · ' + version : '') + countryTag_(country));
  return textOut_('OK');
}

/* ---------- usage telemetry (Full and Demo, consent-gated) ---------- */
/**
 * The client (cabinet_services/telemetry_manager.py) POSTs, only with the
 * user's explicit consent:
 *   action=telemetry, product, payload=<JSON string>
 * where payload = { kind:"telemetry", installation_id, consent_version,
 * edition ("full" | "demo"; absent before 5.3), license ("XXXXX-XXXXX" only
 * when the user ticked the separate licence-link option, else ""), country,
 * environment:{app_version, os, os_version, arch, python, language,
 * screen, ram_mb}, launch_count, events:[ {event, ts, feature, duration_s,
 * load_ms, error_type, context, count, rating}, ... ] }.
 *
 * installation_id is a random 32-hex code minted on the user's PC when they
 * consent (never the licence, never hardware); country is the ISO code of the
 * Windows region setting. No IP address, name or e-mail ever reaches here.
 * Clients older than consent version 2 send no id and no country: their rows
 * land in "Telemetry" only, unattributed. Clients that predate the edition
 * field leave "Edition" empty: Full and Demo cannot be told apart there.
 * "License" holds the short licence code (cabinet_license.model.license_code)
 * ONLY for users who opted in; action=telemetry_unlink, installation_id=<id>
 * blanks it on every row of that id when they opt out again.
 *
 *   "Telemetry" -> one row per event (environment repeated: pivot-able)
 *   "Clients"   -> ONE row per installation: first/last use, launch count
 *
 * action=telemetry_delete, installation_id=<id> erases every row of that id
 * (sent by the app when the user withdraws consent). purgeOldTelemetry()
 * drops anything older than RETENTION_MONTHS (install its daily trigger once
 * with installTelemetryTriggers()). buildTelemetryDashboard() (re)creates the
 * "Dashboard" (installations) and "Utilizzo" (how the app is used) sheets.
 * Both are run by hand from the Apps Script editor.
 *
 * Event vocabulary (column "Event"): launch, startup (Load ms), session
 * (Duration s), export_cnc (Feature = app.format, Count = pieces or modules,
 * Load ms), error (Error type + Context = message template, never values),
 * satisfaction (Rating), use (Feature = identifier, Count = times since the
 * last send: menu.*, edit.*, param.*, model.*, hw.*, cnc.warning.*,
 * tutorial.*, export.*, app.*).
 *
 * The sheet stays private: this web app is deployed for "Anyone", so NEVER
 * serve the statistics from doGet.
 */
var RETENTION_MONTHS = 24;
var TELEMETRY_HEADER = ['Timestamp', 'App version', 'OS', 'OS version', 'Arch',
                        'Python', 'Language', 'Screen', 'RAM (MB)', 'Launch count',
                        'Event', 'Feature', 'Duration (s)', 'Load (ms)', 'Error type',
                        'Context', 'Count', 'Event time', 'Installation ID',
                        'Country', 'Rating', 'Edition', 'License'];
var TELEMETRY_ID_COL = 19;  // 'Installation ID' (1-based)
var CLIENTS_HEADER = ['Installation ID', 'Country', 'App version', 'OS',
                      'Language', 'First seen', 'Last seen', 'Launch count',
                      'Consent version', 'Edition', 'License', 'Highest version'];
var CLIENTS_HIGHEST_COL = 12;  // 'Highest version' (1-based)

function handleTelemetry_(p) {
  var payload;
  try {
    payload = JSON.parse(p.payload || '{}');
  } catch (err) {
    return textOut_('ERROR: bad payload');
  }
  var env     = payload.environment || {};
  var launch  = Number(payload.launch_count) || '';
  var events  = payload.events || [];
  var id      = validId_(payload.installation_id);
  var country = /^[A-Z]{2}$/.test(String(payload.country || '')) ? payload.country : '';
  var edition = (payload.edition === 'full' || payload.edition === 'demo') ? payload.edition : '';
  var license = /^[0-9A-F]{5}-[0-9A-F]{5}$/.test(String(payload.license || '')) ? payload.license : '';
  var now     = new Date();

  if (!events.length) {
    // No queued events (unusual) — still log an environment heartbeat row.
    events = [{}];
  }
  var rows = [];
  for (var i = 0; i < events.length && i < 500; i++) {
    var ev = events[i] || {};
    rows.push([
      now, env.app_version, env.os, env.os_version, env.arch, env.python,
      env.language, env.screen, env.ram_mb, launch,
      ev.event, ev.feature, ev.duration_s, ev.load_ms, ev.error_type,
      ev.context, ev.count, eventTime_(ev.ts), id, country, ev.rating, edition,
      license
    ].map(cell_));
  }
  var sh = sheet_('Telemetry', TELEMETRY_HEADER);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, TELEMETRY_HEADER.length)
    .setValues(rows);

  if (id) {
    upsertClient_(id, country, env, launch, Number(payload.consent_version) || '', now,
                  edition, license);
  }
  return textOut_('OK');
}

function upsertClient_(id, country, env, launch, consentVersion, now, edition, license) {
  var sh = sheet_('Clients', CLIENTS_HEADER);
  var row = findRow_(sh, 1, id);
  if (row) {
    // An update is a version above every one this installation has reported,
    // not a change: one PC may run two versions on the same id (Full and
    // Demo, an old copy beside the new one) and switching between them is
    // not an update. Rows from before the column fall back to 'App version'.
    var highest = String(sh.getRange(row, CLIENTS_HIGHEST_COL).getValue() || '') ||
                  String(sh.getRange(row, 3).getValue() || '');
    var version = String(env.app_version || '');
    if (version && highest && compareVersions_(version, highest) > 0) {
      notifyTelegram_('🔄 Aggiornamento installato: ' + editionLabel_(edition) + ' ' +
                      highest + ' → ' + version + countryTag_(country));
    }
    if (version && (!highest || compareVersions_(version, highest) > 0)) highest = version;
    sh.getRange(row, CLIENTS_HIGHEST_COL).setValue(cell_(highest));
    var prevLaunch = Number(sh.getRange(row, 8).getValue()) || 0;
    sh.getRange(row, 2, 1, 4).setValues([[country, env.app_version, env.os,
                                          env.language].map(cell_)]);
    sh.getRange(row, 7, 1, 5).setValues([[now, Math.max(prevLaunch, Number(launch) || 0),
                                          consentVersion, cell_(edition), cell_(license)]]);
  } else {
    sh.appendRow([id, country, env.app_version, env.os, env.language, now, now,
                  launch, consentVersion, edition, license, env.app_version].map(cell_));
    notifyTelegram_('🆕 Nuova installazione: ' + editionLabel_(edition) + ' ' +
                    (env.app_version || '') + countryTag_(country));
  }
}

/** Numeric, per-field: -1, 0 or 1 ("5.10.0" > "5.9.2"; "5.3" == "5.3.0").
 *  A leading v and any "-beta"/"+build" suffix are ignored. */
function compareVersions_(a, b) {
  var parse = function (v) {
    return String(v).trim().replace(/^[vV]/, '').split(/[-+ ]/)[0].split('.')
                    .map(function (x) { return parseInt(x, 10) || 0; });
  };
  var pa = parse(a), pb = parse(b);
  for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
    var d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

function handleTelemetryDelete_(p) {
  var id = validId_(p.installation_id);
  if (!id) return textOut_('ERROR: bad id');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var clients = ss.getSheetByName('Clients');
  if (clients) {
    var row = findRow_(clients, 1, id);
    if (row) clients.deleteRow(row);
  }
  var tele = ss.getSheetByName('Telemetry');
  if (tele && tele.getLastRow() > 1) {
    var cells = tele.getRange(2, TELEMETRY_ID_COL, tele.getLastRow() - 1, 1)
                    .createTextFinder(id).matchEntireCell(true).findAll();
    var rowsToDelete = cells.map(function (c) { return c.getRow(); })
                            .sort(function (a, b) { return b - a; });
    for (var i = 0; i < rowsToDelete.length; i++) tele.deleteRow(rowsToDelete[i]);
  }
  return textOut_('OK');  // idempotent: an id with no rows is already erased
}

/** The user turned the licence link off: blank "License" on every row of
 *  that installation (its other statistics stay, still pseudonymous). */
function handleTelemetryUnlink_(p) {
  var id = validId_(p.installation_id);
  if (!id) return textOut_('ERROR: bad id');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var clients = ss.getSheetByName('Clients');
  if (clients) {
    var row = findRow_(clients, 1, id);
    if (row && clients.getLastColumn() >= CLIENTS_HEADER.length) {
      clients.getRange(row, CLIENTS_HEADER.indexOf('License') + 1).setValue('');
    }
  }
  var tele = ss.getSheetByName('Telemetry');
  var col = TELEMETRY_HEADER.indexOf('License') + 1;
  if (tele && tele.getLastRow() > 1 && tele.getLastColumn() >= col) {
    var cells = tele.getRange(2, TELEMETRY_ID_COL, tele.getLastRow() - 1, 1)
                    .createTextFinder(id).matchEntireCell(true).findAll();
    for (var i = 0; i < cells.length; i++) {
      tele.getRange(cells[i].getRow(), col).setValue('');
    }
  }
  return textOut_('OK');  // idempotent
}

/** Daily job: drop rows older than RETENTION_MONTHS. Run by the trigger. */
function purgeOldTelemetry() {
  var cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Rows are appended in time order: delete each sheet's leading stale block.
  ['Telemetry', 'License alerts'].forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return;
    var stamps = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    var stale = 0;
    while (stale < stamps.length) {
      var t = asDate_(stamps[stale][0]);
      if (!t || t >= cutoff) break;
      stale++;
    }
    if (stale) sh.deleteRows(2, stale);
  });

  var clients = ss.getSheetByName('Clients');
  if (clients && clients.getLastRow() > 1) {
    var last = clients.getRange(2, 7, clients.getLastRow() - 1, 1).getValues();
    for (var r = last.length - 1; r >= 0; r--) {
      var seen = asDate_(last[r][0]);
      if (seen && seen < cutoff) clients.deleteRow(r + 2);
    }
  }
}

/** Run ONCE from the editor: installs the daily retention purge. */
function installTelemetryTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'purgeOldTelemetry') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('purgeOldTelemetry').timeBased().everyDays(1).atHour(3).create();
}

/**
 * Run from the editor to (re)create the "Dashboard" sheet. Everything in it
 * is a live formula over "Clients", so it never needs re-running for new
 * data — only after editing this function.
 */
function buildTelemetryDashboard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  sheet_('Clients', CLIENTS_HEADER);
  var sh = ss.getSheetByName('Dashboard') || ss.insertSheet('Dashboard');
  sh.clear();
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });

  // Formulas are parsed with the spreadsheet's locale: an Italian sheet
  // separates arguments with ";". Probe once, then write every formula below
  // with "," and let fx() convert it.
  var sep = argSeparator_(sh);
  var fx = function (f) { return sep === ',' ? f : localizeSeparators_(f); };

  sh.getRange('A1').setValue('Cabinet Designer — statistiche di utilizzo')
    .setFontSize(14).setFontWeight('bold');
  var kpis = [
    ['Installazioni con consenso', '=COUNTA(Clients!A2:A)'],
    ['Attive negli ultimi 7 giorni', '=COUNTIF(Clients!G2:G,">="&(TODAY()-7))'],
    ['Attive negli ultimi 30 giorni', '=COUNTIF(Clients!G2:G,">="&(TODAY()-30))'],
    ['Nuove negli ultimi 30 giorni', '=COUNTIF(Clients!F2:F,">="&(TODAY()-30))'],
    ['Avvii totali', '=SUM(Clients!H2:H)']
  ];
  for (var k = 0; k < kpis.length; k++) {
    sh.getRange(3 + k, 1).setValue(kpis[k][0]).setFontWeight('bold');
    sh.getRange(3 + k, 2).setFormula(fx(kpis[k][1]));
  }

  sh.getRange('A9').setValue('Per Paese').setFontWeight('bold');
  sh.getRange('A10').setFormula(
    fx('=QUERY(Clients!A2:I,"select B, count(A) where A is not null group by B ' +
    'order by count(A) desc label B \'Paese\', count(A) \'Installazioni\'",0)'));
  sh.getRange('D9').setValue('Per versione').setFontWeight('bold');
  sh.getRange('D10').setFormula(
    fx('=QUERY(Clients!A2:I,"select C, count(A) where A is not null group by C ' +
    'order by C desc label C \'Versione\', count(A) \'Installazioni\'",0)'));
  sh.getRange('G9').setValue('Installazioni (una riga ciascuna, ultimo uso in alto)')
    .setFontWeight('bold');
  sh.getRange('G10').setFormula(
    fx('=QUERY(Clients!A2:I,"select A, B, C, H, F, G where A is not null order by G desc ' +
    'label A \'Codice\', B \'Paese\', C \'Versione\', H \'Avvii\', ' +
    'F \'Primo uso\', G \'Ultimo uso\'",0)'));
  sh.getRange('K:L').setNumberFormat('dd/mm/yyyy hh:mm');

  sh.insertChart(sh.newChart()
    .setChartType(Charts.ChartType.GEO)
    .addRange(sh.getRange('A10:B200'))
    .setNumHeaders(1)
    .setOption('title', 'Installazioni per Paese')
    .setPosition(2, 14, 0, 0)
    .build());
  sh.insertChart(sh.newChart()
    .asColumnChart()
    .addRange(sh.getRange('D10:E60'))
    .setNumHeaders(1)
    .setOption('title', 'Installazioni per versione')
    .setOption('legend', { position: 'none' })
    .setPosition(24, 14, 0, 0)
    .build());
  sh.autoResizeColumns(1, 12);
  sh.setColumnWidths(11, 2, 130);  // dates: sized before any data exists

  buildUsageSheet_(ss, fx);
  buildWhenSheet_(ss, fx);
}

/** The "Utilizzo" sheet: how, how much and when the app is used. Every cell
 * is a live formula over "Telemetry" / "Clients". */
function buildUsageSheet_(ss, fx) {
  normalizeTelemetryDates_(sheet_('Telemetry', TELEMETRY_HEADER));
  var sh = ss.getSheetByName('Utilizzo') || ss.insertSheet('Utilizzo');
  sh.clear();
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });
  sh.clearConditionalFormatRules();
  var T = 'Telemetry!';

  sh.getRange('A1').setValue('Cabinet Designer — come viene usato')
    .setFontSize(14).setFontWeight('bold');
  var kpis = [
    ['Avvii', '=COUNTIF(' + T + 'K2:K,"launch")'],
    ['Durata media sessione (min)',
     '=IFERROR(ROUND(AVERAGEIF(' + T + 'K2:K,"session",' + T + 'M2:M)/60,1),"")'],
    ['Avvio medio del programma (s)',
     '=IFERROR(ROUND(AVERAGEIF(' + T + 'K2:K,"startup",' + T + 'N2:N)/1000,1),"")'],
    ['Generazioni CNC', '=COUNTIF(' + T + 'K2:K,"export_cnc")'],
    ['Generazione CNC media (s)',
     '=IFERROR(ROUND(AVERAGEIF(' + T + 'K2:K,"export_cnc",' + T + 'N2:N)/1000,1),"")'],
    ['Installazioni con almeno un programma CNC',
     // ROWS(UNIQUE(...)) and not COUNTUNIQUE: an empty FILTER is #N/A, which
     // COUNTUNIQUE counts as one value instead of failing into IFERROR.
     '=IFERROR(ROWS(UNIQUE(FILTER(' + T + 'S2:S,' + T + 'K2:K="export_cnc",' + T + 'S2:S<>""))),0)'],
    ['Installazioni ancora in uso 30 giorni dopo la prima volta',
     '=SUMPRODUCT((Clients!A2:A<>"")*(Clients!G2:G-Clients!F2:F>=30))'],
    ['Errori mostrati (distinti per sessione)', '=COUNTIF(' + T + 'K2:K,"error")']
  ];
  for (var k = 0; k < kpis.length; k++) {
    sh.getRange(3 + k, 1).setValue(kpis[k][0]).setFontWeight('bold');
    sh.getRange(3 + k, 2).setFormula(fx(kpis[k][1]));
  }

  var Q = 'Telemetry!A2:U';
  var tables = [
    ['A13', 'Funzioni più usate (menu, modifiche, parametri)',
     "select L, sum(Q) where K = 'use' and not L starts with 'model.' " +
     "and not L starts with 'hw.' and not L starts with 'cnc.warning.' " +
     "and not L starts with 'tutorial.' group by L order by sum(Q) desc limit 60 " +
     "label L 'Funzione', sum(Q) 'Volte'"],
    ['D13', 'Come sono fatti i mobili mandati in macchina',
     "select L, sum(Q) where K = 'use' and (L starts with 'model.' or L starts with 'hw.') " +
     "group by L order by sum(Q) desc limit 80 " +
     "label L 'Costruzione / ferramenta', sum(Q) 'Generazioni'"],
    ['G13', 'Generazioni CNC per app e formato',
     "select L, count(K), avg(Q) where K = 'export_cnc' group by L order by count(K) desc " +
     "label L 'App.formato', count(K) 'Generazioni', avg(Q) 'Pezzi medi'"],
    ['G27', 'Avvisi CNC',
     "select L, sum(Q) where K = 'use' and L starts with 'cnc.warning.' group by L " +
     "order by sum(Q) desc limit 40 label L 'Avviso', sum(Q) 'Volte'"],
    ['K13', 'Tutorial (avviati, completati, abbandonati al passo)',
     "select L, sum(Q) where K = 'use' and L starts with 'tutorial.' group by L " +
     "order by L limit 60 label L 'Tutorial', sum(Q) 'Volte'"],
    ['N13', 'Errori mostrati',
     "select O, P, count(K) where K = 'error' group by O, P order by count(K) desc limit 40 " +
     "label O 'Tipo', P 'Messaggio (senza valori)', count(K) 'Volte'"]
  ];
  for (var t = 0; t < tables.length; t++) {
    var cell = sh.getRange(tables[t][0]);
    sh.getRange(cell.getRow() - 1, cell.getColumn()).setValue(tables[t][1])
      .setFontWeight('bold');
    cell.setFormula(fx('=QUERY(' + Q + ',"' + tables[t][2] + '",0)'));
  }

  sh.setColumnWidth(1, 320);
  sh.setColumnWidth(4, 280);
  sh.setColumnWidth(7, 170);
  sh.setColumnWidth(11, 260);
  sh.setColumnWidth(14, 140);
  sh.setColumnWidth(15, 420);
}

/** A sheet value as a Date: real dates, or the text form an older build of
 * this script wrote ("Sun Oct 11 2026 16:42:28 GMT+0200 ..."); else null. */
function asDate_(v) {
  if (v instanceof Date) return v;
  if (!v) return null;
  var d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

/** The "Quando" sheet: launches by hour of the user's own day x weekday,
 * and launches per day. */
function buildWhenSheet_(ss, fx) {
  var sh = ss.getSheetByName('Quando') || ss.insertSheet('Quando');
  sh.clear();
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });
  sh.clearConditionalFormatRules();
  var Q = 'Telemetry!A2:U';

  sh.getRange('A1').setValue('Cabinet Designer — quando viene usato')
    .setFontSize(14).setFontWeight('bold');
  // When: launches by hour of the user's own day x weekday. One formula per
  // cell (HOUR/WEEKDAY) rather than a QUERY pivot: QUERY decides by the
  // column's format whether "Event time" is a date or a date-time, and
  // hour() fails on a plain date.
  sh.getRange('A3').setValue('Avvii per ora del giorno (ora del cliente) e giorno della settimana')
    .setFontWeight('bold');
  sh.getRange('A4:H4').setValues([['Ora', 'dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']])
    .setFontWeight('bold');
  var grid = [];
  for (var h = 0; h < 24; h++) {
    var row = [h];
    for (var d = 1; d <= 7; d++) {
      row.push(fx('=SUMPRODUCT((Telemetry!$K$2:$K="launch")*(Telemetry!$R$2:$R<>"")*' +
                  '(HOUR(Telemetry!$R$2:$R)=' + h + ')*(WEEKDAY(Telemetry!$R$2:$R)=' + d + '))'));
    }
    grid.push(row);
  }
  sh.getRange('A5:A28').setValues(grid.map(function (r) { return [r[0]]; }));
  sh.getRange('B5:H28').setFormulas(grid.map(function (r) { return r.slice(1); }));
  sh.setConditionalFormatRules([SpreadsheetApp.newConditionalFormatRule()
    .setGradientMinpoint('#ffffff').setGradientMaxpoint('#1a73e8')
    .setRanges([sh.getRange('B5:H28')]).build()]);

  // How much over time: launches per day.
  sh.getRange('K3').setValue('Avvii per giorno').setFontWeight('bold');
  sh.getRange('K4').setFormula(fx('=QUERY(' + Q + ',"select toDate(R), count(K) ' +
    "where K = 'launch' and R is not null group by toDate(R) order by toDate(R) " +
    "label toDate(R) 'Giorno', count(K) 'Avvii'" + '",0)'));
  sh.insertChart(sh.newChart()
    .asLineChart()
    .addRange(sh.getRange('K4:L1000'))
    .setNumHeaders(1)
    .setOption('title', 'Avvii per giorno')
    .setOption('legend', { position: 'none' })
    .setPosition(3, 14, 0, 0)
    .build());

  sh.setColumnWidth(11, 110);
}

/**
 * Older builds of this script stored "Timestamp" (column A, briefly) and
 * "Event time" (column R, always) as text. QUERY types a column by its
 * majority, so text there would break hour()/toDate(): turn them into real
 * dates once. Idempotent — a Date stays a Date.
 */
function normalizeTelemetryDates_(sh) {
  var rows = sh.getLastRow() - 1;
  if (rows < 1) rows = 0;
  [1, 18].forEach(function (col) {
    if (!rows) return;
    var range = sh.getRange(2, col, rows, 1);
    var values = range.getValues();
    var changed = false;
    for (var i = 0; i < values.length; i++) {
      var v = values[i][0];
      if (v && !(v instanceof Date)) {
        var d = asDate_(v);
        values[i][0] = d || '';
        changed = true;
      }
    }
    if (changed) range.setValues(values);
  });
  // Whole columns, so the rows appended later inherit it too.
  sh.getRange('A:A').setNumberFormat('dd/mm/yyyy hh:mm:ss');
  sh.getRange('R:R').setNumberFormat('dd/mm/yyyy hh:mm:ss');
}

/** "," or ";": whichever argument separator this spreadsheet's locale parses. */
function argSeparator_(sh) {
  var probe = sh.getRange('Z1');
  probe.setFormula('=SUM(1,2)');
  SpreadsheetApp.flush();
  var ok = probe.getValue() === 3;
  probe.clearContent();
  return ok ? ',' : ';';
}

/** Commas outside double-quoted strings become ";" (the query text keeps its own). */
function localizeSeparators_(f) {
  var out = '', inQuote = false;
  for (var i = 0; i < f.length; i++) {
    var ch = f.charAt(i);
    if (ch === '"') inQuote = !inQuote;
    out += (ch === ',' && !inQuote) ? ';' : ch;
  }
  return out;
}

function sheet_(name, header) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(header);
  } else if (sh.getLastColumn() < header.length) {
    // An older header (columns appended since): extend it in place.
    sh.getRange(1, 1, 1, header.length).setValues([header]);
  }
  return sh;
}

function findRow_(sh, col, value) {
  if (sh.getLastRow() < 2) return 0;
  var hit = sh.getRange(2, col, sh.getLastRow() - 1, 1)
              .createTextFinder(value).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : 0;
}

/** The client's local "2026-10-11T16:42:28" as a Date (hour and weekday are
 * the user's own), or "" when absent/unreadable. */
function eventTime_(ts) {
  if (!ts) return '';
  var d = new Date(String(ts));
  return isNaN(d.getTime()) ? '' : d;
}

function validId_(v) {
  v = String(v || '');
  return /^[0-9a-f]{32}$/.test(v) ? v : '';
}

/** A cell value from untrusted input: no formulas, bounded length. */
function cell_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean' || v instanceof Date) return v;
  v = String(v).slice(0, 200);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
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
var DEMO_LIMIT     = 5;
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

/* ---------- Telegram notifications (owner only) ---------- */
/**
 * Messages to the owner's Telegram when someone downloads or installs
 * Cabinet Designer. Two sources, neither of which touches the app:
 *
 *   - DOWNLOADS: checkDownloads() — a time trigger — reads the download
 *     counters of the installers on GitHub Releases and reports every
 *     increase. Anonymous by construction (GitHub gives a count, nothing
 *     else). The in-app update downloads the same Full installer, so a Full
 *     download is a new installation OR an update.
 *   - INSTALLATIONS / UPDATES: upsertClient_ above — the first time an
 *     installation id is seen, and when its version changes. Only for users
 *     who consented to statistics: without consent the app sends nothing.
 *
 * The messages carry the minimum: edition, version, country. Never the
 * installation id, the licence code or anything else from the payload.
 * A failure to notify never fails the request that triggered it.
 *
 * SETUP (once):
 *   1. Telegram -> @BotFather -> /newbot -> copy the token.
 *   2. Send any message to your new bot.
 *   3. Project Settings -> Script properties -> add TELEGRAM_TOKEN = <token>
 *      (optional: GITHUB_TOKEN = a read-only token, avoids GitHub's limit of
 *      60 anonymous calls per hour shared by Google's servers).
 *   4. Run telegramSetup() from the editor: it stores your chat id, sends a
 *      test message and installs the 15-minute download check.
 *   5. Deploy -> Manage deployments -> edit the EXISTING one -> New version.
 */
var RELEASES_API = 'https://api.github.com/repos/Novermax/cabinet_designer/releases?per_page=30';

function telegramSetup() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TELEGRAM_TOKEN');
  if (!token) throw new Error('Aggiungi prima la proprietà TELEGRAM_TOKEN');
  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getUpdates',
                              { muteHttpExceptions: true });
  var updates = (JSON.parse(res.getContentText()).result) || [];
  var chat = '';
  for (var i = updates.length - 1; i >= 0 && !chat; i--) {
    var m = updates[i].message || updates[i].channel_post;
    if (m && m.chat) chat = String(m.chat.id);
  }
  if (!chat) throw new Error('Nessun messaggio trovato: scrivi qualcosa al bot e riprova');
  props.setProperty('TELEGRAM_CHAT_ID', chat);

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'checkDownloads') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkDownloads').timeBased().everyMinutes(15).create();
  // First run: records the current counts, says nothing. If GitHub refuses
  // it, no baseline exists and the first download after it would become the
  // baseline in silence — so say it now instead.
  var counted = checkDownloads();
  notifyTelegram_('✅ Cabinet Designer: notifiche attive (download ogni 15 minuti, ' +
                  'installazioni e aggiornamenti in tempo reale).' +
                  (counted ? '' : '\n⚠️ GitHub non ha risposto: aggiungi GITHUB_TOKEN ' +
                                  'nelle proprietà dello script e riesegui telegramSetup.'));
}

/** Trigger: report every increase of an installer's download counter. The
 *  first run (no stored counts) only records them. False when GitHub did not
 *  answer (nothing recorded). */
function checkDownloads() {
  var props = PropertiesService.getScriptProperties();
  var headers = { 'Accept': 'application/vnd.github+json' };
  var gh = props.getProperty('GITHUB_TOKEN');
  if (gh) headers['Authorization'] = 'Bearer ' + gh;
  var res = UrlFetchApp.fetch(RELEASES_API, { headers: headers, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    // Try again at the next tick; the log says why (403/429 = GitHub's
    // anonymous limit, shared by Google's servers: add GITHUB_TOKEN).
    console.log('GitHub ha risposto ' + res.getResponseCode() + ': ' +
                res.getContentText().slice(0, 300));
    return false;
  }
  var releases = JSON.parse(res.getContentText());

  var stored = props.getProperty('DOWNLOAD_COUNTS');
  var first = !stored;
  var prev = first ? {} : JSON.parse(stored);
  var now = {};
  var lines = [];
  releases.forEach(function (rel) {
    (rel.assets || []).forEach(function (a) {
      if (!/\.exe$/i.test(a.name)) return;
      now[a.id] = a.download_count;
      var delta = a.download_count - (prev[a.id] || 0);
      console.log(a.name + ': prima ' + (first ? '(primo giro)' : (prev[a.id] || 0)) +
                  ', ora ' + a.download_count);
      if (!first && delta > 0) {
        var what = /Demo/i.test(a.name) ? 'Demo'
                 : /Full/i.test(a.name) ? 'Full (nuova installazione o aggiornamento)'
                 : a.name;
        lines.push('⬇️ Download ' + what + ' — ' + a.name + ': +' + delta +
                   ' (totale ' + a.download_count + ')');
      }
    });
  });
  props.setProperty('DOWNLOAD_COUNTS', JSON.stringify(now));
  if (lines.length) notifyTelegram_(lines.join('\n'));
  return true;
}

function notifyTelegram_(text) {
  try {
    var props = PropertiesService.getScriptProperties();
    var token = props.getProperty('TELEGRAM_TOKEN');
    var chat = props.getProperty('TELEGRAM_CHAT_ID');
    if (!token || !chat) return;
    UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post',
      payload: { chat_id: chat, text: text, disable_web_page_preview: 'true' },
      muteHttpExceptions: true
    });
  } catch (err) {
    // A missed notification must never cost the statistics or the reply.
  }
}

function editionLabel_(edition) {
  return edition === 'full' ? 'Full' : edition === 'demo' ? 'Demo' : 'versione non dichiarata';
}

/** " · IT 🇮🇹" from an ISO country code, "" when unknown. */
function countryTag_(country) {
  if (!/^[A-Z]{2}$/.test(String(country || ''))) return '';
  var flag = String.fromCodePoint(0x1F1E6 + country.charCodeAt(0) - 65,
                                  0x1F1E6 + country.charCodeAt(1) - 65);
  return ' · ' + country + ' ' + flag;
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
