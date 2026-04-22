// ─────────────────────────────────────────────────────────────
//  HELL PIZZA — AYCE Bookings — Google Apps Script
// ─────────────────────────────────────────────────────────────

var SHEET_NAME  = 'Bookings';
var CTRL_SHEET  = 'Controls';
var CAPACITY    = 30;
var SLOTS       = ['5:30', '6:00', '6:30'];
var FROM_NAME   = 'Hell Pizza Bond St';
var BOOKING_URL = 'https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPO-NAME/';

var COL = {
  TIMESTAMP: 0,  // A
  DATE:      1,  // B
  TIME:      2,  // C
  NAME:      3,  // D
  PHONE:     4,  // E
  EMAIL:     5,  // F
  GUESTS:    6,  // G
  REQUESTS:  7,  // H
  REF:       8,  // I
  VEGS:      9   // J
};


// ── KEY HELPERS ──────────────────────────────────────────────
// Google Sheets can store dates as Date objects OR as strings.
// String() on a Date object gives "Mon Apr 28 2026 12:00:00 GMT+1200"
// This function handles both cases reliably.
function toDateStr(val) {
  if (!val) return '';
  if (val instanceof Date) {
    var y  = val.getFullYear();
    var m  = String(val.getMonth() + 1).padStart(2, '0');
    var d  = String(val.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  // Already a string — return as-is (trimmed)
  return String(val).trim();
}

// Converts a time value (Date object or string) to "H:MM" format
function toTimeStr(val) {
  if (!val) return '';
  if (val instanceof Date) {
    var h = val.getHours();
    var m = String(val.getMinutes()).padStart(2, '0');
    return h + ':' + m;
  }
  return String(val).trim();
}

// ── GET ───────────────────────────────────────────────────────
function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var sheet  = getSheet();

    if (params.ref) {
      return respond(getBookingByRef(sheet, params.ref));
    }

    if (params.controls) {
      return respond({ controls: loadControls() });
    }

    var date         = params.date || '';
    var availability = getAvailability(sheet, date);
    var bookings     = date ? getBookingsForDate(sheet, date) : [];

    var controls = loadControls();
    var dateCtrl = (controls && controls[date]) ? controls[date] : { blocked: false, stoppedSlots: [] };
    return respond({ availability: availability, bookings: bookings, blocked: dateCtrl.blocked, stoppedSlots: dateCtrl.stoppedSlots || [] });

  } catch(err) {
    return respond({ error: err.toString() });
  }
}


// ── POST ──────────────────────────────────────────────────────
function doPost(e) {
  try {
    var data   = JSON.parse(e.postData.contents);
    var sheet  = getSheet();
    var action = data.action || 'CREATE';

    if      (action === 'CREATE') createBooking(sheet, data);
    else if (action === 'EDIT')   editBooking(sheet, data);
    else if (action === 'DELETE') deleteBooking(sheet, data.timestamp, data.ref);
    else if (action === 'CHANGE') changeBookingSession(sheet, data);
    else if (action === 'SAVE_CONTROLS') saveControls(data.controls);

    return respond({ success: true });

  } catch(err) {
    return respond({ error: err.toString() });
  }
}


// ── CREATE ────────────────────────────────────────────────────
function createBooking(sheet, data) {
  var timestamp = new Date().toISOString();
  var manageUrl = BOOKING_URL + 'manage.html?ref=' + (data.ref || '');

  sheet.appendRow([
    timestamp,            // A — Timestamp
    data.date     || '',  // B — Date        YYYY-MM-DD string
    data.time     || '',  // C — Time        e.g. 5:30
    data.name     || '',  // D — Name
    data.phone    || '',  // E — Phone
    data.email    || '',  // F — Email
    data.guests   || 1,   // G — Guests
    data.requests || '',  // H — Requests
    data.ref      || '',  // I — Ref
    data.vegetarians || 0  // J — Vegetarians
  ]);

  if (data.email) {
    sendConfirmationEmail(data, manageUrl);
  }
}


// ── EDIT ──────────────────────────────────────────────────────
function editBooking(sheet, data) {
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][COL.TIMESTAMP]) === String(data.timestamp)) {
      if (data.name     !== undefined) sheet.getRange(i+1, COL.NAME+1).setValue(data.name);
      if (data.phone    !== undefined) sheet.getRange(i+1, COL.PHONE+1).setValue(data.phone);
      if (data.email    !== undefined) sheet.getRange(i+1, COL.EMAIL+1).setValue(data.email);
      if (data.guests   !== undefined) sheet.getRange(i+1, COL.GUESTS+1).setValue(data.guests);
      if (data.time     !== undefined) sheet.getRange(i+1, COL.TIME+1).setValue(data.time);
      if (data.requests !== undefined) sheet.getRange(i+1, COL.REQUESTS+1).setValue(data.requests);
      break;
    }
  }
}


// ── DELETE ────────────────────────────────────────────────────
function deleteBooking(sheet, timestamp, ref) {
  var rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    var tsMatch  = timestamp && String(rows[i][COL.TIMESTAMP]) === String(timestamp);
    var refMatch = ref       && String(rows[i][COL.REF])       === String(ref);
    if (tsMatch || refMatch) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
}


// ── CHANGE SESSION ────────────────────────────────────────────
function changeBookingSession(sheet, data) {
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][COL.REF]) === String(data.ref)) {
      var newDate = data.date || toDateStr(rows[i][COL.DATE]);
      var newTime = data.time || toTimeStr(rows[i][COL.TIME]);
      sheet.getRange(i+1, COL.DATE+1).setValue(newDate);
      sheet.getRange(i+1, COL.TIME+1).setValue(newTime);
      var email = String(rows[i][COL.EMAIL]);
      if (email) {
        sendChangeEmail({
          name:   String(rows[i][COL.NAME]),
          email:  email,
          date:   newDate,
          time:   newTime,
          guests: rows[i][COL.GUESTS],
          ref:    data.ref
        });
      }
      break;
    }
  }
}


// ── AVAILABILITY ──────────────────────────────────────────────
function getAvailability(sheet, date) {
  var rows   = sheet.getDataRange().getValues();
  var counts = {};
  SLOTS.forEach(function(s) { counts[s] = 0; });

  for (var i = 1; i < rows.length; i++) {
    var rowDate = toDateStr(rows[i][COL.DATE]);   // ← handles Date objects
    var rowTime = toTimeStr(rows[i][COL.TIME]).trim();
    if (rowDate === date && counts.hasOwnProperty(rowTime)) {
      counts[rowTime] += (parseInt(rows[i][COL.GUESTS]) || 0);
    }
  }

  return SLOTS.map(function(time) {
    return { time: time, totalBooked: counts[time], remaining: CAPACITY - counts[time] };
  });
}


// ── BOOKINGS FOR DATE ─────────────────────────────────────────
function getBookingsForDate(sheet, date) {
  var rows     = sheet.getDataRange().getValues();
  var bookings = [];
  for (var i = 1; i < rows.length; i++) {
    if (toDateStr(rows[i][COL.DATE]) === date) {   // ← handles Date objects
      bookings.push({
        timestamp: String(rows[i][COL.TIMESTAMP]),
        date:      toDateStr(rows[i][COL.DATE]),
        time:      toTimeStr(rows[i][COL.TIME]),
        name:      String(rows[i][COL.NAME]),
        phone:     String(rows[i][COL.PHONE]),
        email:     String(rows[i][COL.EMAIL]),
        guests:    rows[i][COL.GUESTS],
        requests:  String(rows[i][COL.REQUESTS]),
        ref:       String(rows[i][COL.REF]),
        vegetarians: rows[i][COL.VEGS] || 0
      });
    }
  }
  return bookings;
}


// ── LOOKUP BY REF ─────────────────────────────────────────────
function getBookingByRef(sheet, ref) {
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][COL.REF]).trim() === String(ref).trim()) {
      return {
        booking: {
          timestamp: String(rows[i][COL.TIMESTAMP]),
          date:      toDateStr(rows[i][COL.DATE]),
          time:      toTimeStr(rows[i][COL.TIME]),
          name:      String(rows[i][COL.NAME]),
          phone:     String(rows[i][COL.PHONE]),
          email:     String(rows[i][COL.EMAIL]),
          guests:    rows[i][COL.GUESTS],
          requests:  String(rows[i][COL.REQUESTS]),
          ref:       String(rows[i][COL.REF]),
          vegetarians: rows[i][COL.VEGS] || 0
        }
      };
    }
  }
  return { booking: null };
}


// ── CONFIRMATION EMAIL ────────────────────────────────────────
function sendConfirmationEmail(data, manageUrl) {
  var dateFormatted = formatDate(data.date);
  var subject = 'Your Hell Pizza AYCE Booking \u2014 ' + dateFormatted;

  var html = '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;">'
    + '<div style="background:#151515;padding:32px;text-align:center;">'
    + '<h1 style="font-family:Georgia,serif;color:#E1D8B7;font-size:28px;margin:0;letter-spacing:4px;">HELL PIZZA</h1>'
    + '<p style="color:#C80613;font-size:11px;font-weight:700;letter-spacing:3px;margin:8px 0 0;">ALL YOU CAN EAT TUESDAY</p>'
    + '</div>'
    + '<div style="background:#f9f9f7;padding:32px;">'
    + '<p style="font-size:16px;margin:0 0 24px;">Kia ora <strong>' + data.name + '</strong>,<br>Your booking is confirmed. See you in Hell.</p>'
    + '<div style="background:#fff;border:1px solid #e0e0e0;border-left:4px solid #C80613;padding:20px 24px;margin-bottom:24px;">'
    + '<table style="width:100%;font-size:14px;border-collapse:collapse;">'
    + '<tr><td style="color:#888;padding:6px 0;width:100px;">Reference</td><td style="font-weight:700;color:#C80613;">' + data.ref + '</td></tr>'
    + '<tr><td style="color:#888;padding:6px 0;">Date</td><td style="font-weight:700;">' + dateFormatted + '</td></tr>'
    + '<tr><td style="color:#888;padding:6px 0;">Arrival</td><td style="font-weight:700;">' + data.time + ' PM</td></tr>'
    + '<tr><td style="color:#888;padding:6px 0;">Guests</td><td style="font-weight:700;">' + data.guests + '</td></tr>'
    + (data.requests ? '<tr><td style="color:#888;padding:6px 0;vertical-align:top;">Requests</td><td style="font-style:italic;">' + data.requests + '</td></tr>' : '')
    + '</table></div>'
    + '<div style="text-align:center;margin:28px 0;">'
    + '<a href="' + manageUrl + '" style="display:inline-block;background:#C80613;color:#fff;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:2px;padding:14px 32px;">CHANGE OR CANCEL BOOKING</a>'
    + '</div>'
    + '<p style="font-size:13px;color:#666;border-top:1px solid #eee;padding-top:16px;margin:0;">'
    + 'Questions? Call us on <strong>04 473 5186</strong>.<br>'
    + 'Hell Pizza Bond St \u2014 14 Bond Street, Te Aro, Wellington.<br>'
    + 'All sessions end at 8:00pm. Please eat responsibly.'
    + '</p></div></div>';

  MailApp.sendEmail({ to: data.email, subject: subject, htmlBody: html, name: FROM_NAME });
}


// ── CHANGE EMAIL ──────────────────────────────────────────────
function sendChangeEmail(data) {
  var dateFormatted = formatDate(data.date);
  var subject = 'Booking Updated \u2014 ' + dateFormatted;

  var html = '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;">'
    + '<div style="background:#151515;padding:32px;text-align:center;">'
    + '<h1 style="font-family:Georgia,serif;color:#E1D8B7;font-size:28px;margin:0;letter-spacing:4px;">HELL PIZZA</h1>'
    + '<p style="color:#C80613;font-size:11px;font-weight:700;letter-spacing:3px;margin:8px 0 0;">BOOKING UPDATED</p>'
    + '</div>'
    + '<div style="background:#f9f9f7;padding:32px;">'
    + '<p style="font-size:16px;margin:0 0 24px;">Kia ora <strong>' + data.name + '</strong>,<br>Your booking has been updated.</p>'
    + '<div style="background:#fff;border:1px solid #e0e0e0;border-left:4px solid #C80613;padding:20px 24px;">'
    + '<table style="width:100%;font-size:14px;border-collapse:collapse;">'
    + '<tr><td style="color:#888;padding:6px 0;width:100px;">Reference</td><td style="font-weight:700;color:#C80613;">' + data.ref + '</td></tr>'
    + '<tr><td style="color:#888;padding:6px 0;">New Date</td><td style="font-weight:700;">' + dateFormatted + '</td></tr>'
    + '<tr><td style="color:#888;padding:6px 0;">New Time</td><td style="font-weight:700;">' + data.time + ' PM</td></tr>'
    + '<tr><td style="color:#888;padding:6px 0;">Guests</td><td style="font-weight:700;">' + data.guests + '</td></tr>'
    + '</table></div>'
    + '<p style="font-size:13px;color:#666;margin-top:24px;">Questions? Call <strong>04 473 5186</strong>.</p>'
    + '</div></div>';

  MailApp.sendEmail({ to: data.email, subject: subject, htmlBody: html, name: FROM_NAME });
}


// ── CONTROLS ─────────────────────────────────────────────────
function getCtrlSheet() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CTRL_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CTRL_SHEET);
    sheet.appendRow(['controls_json']);
  }
  return sheet;
}

function loadControls() {
  try {
    var sheet = getCtrlSheet();
    var data  = sheet.getRange(2, 1).getValue();
    return data ? JSON.parse(data) : {};
  } catch(e) { return {}; }
}

function saveControls(controls) {
  var sheet = getCtrlSheet();
  // Ensure row 2 exists
  if (sheet.getLastRow() < 2) sheet.appendRow(['']);
  sheet.getRange(2, 1).setValue(JSON.stringify(controls));
}

// ── HELPERS ───────────────────────────────────────────────────
function getSheet() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  var headers   = ['Timestamp','Date','Time','Name','Phone','Email','Guests','Special Requests','Ref','Vegetarians'];
  var firstRow  = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (firstRow[0] !== 'Timestamp') {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }

  // Force column B to plain text so dates are stored as strings not Date objects
  sheet.getRange('B:B').setNumberFormat('@STRING@');
  sheet.getRange('C:C').setNumberFormat('@STRING@');

  return sheet;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  var p = dateStr.split('-');
  var d = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]), 12, 0, 0);
  var days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
