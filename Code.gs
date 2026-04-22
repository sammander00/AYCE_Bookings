// ─────────────────────────────────────────────────────────────
//  HELL PIZZA — AYCE Bookings — Google Apps Script
// ─────────────────────────────────────────────────────────────
//
//  SETUP INSTRUCTIONS:
//  1. Paste this entire file into your Apps Script editor
//  2. Update BOOKING_URL below to your GitHub Pages URL
//  3. Check SHEET_NAME matches your sheet tab name exactly
//  4. Click Deploy → Manage deployments → Edit (pencil icon)
//     → Set version to "New version" → Deploy
//  5. IMPORTANT: Set "Who has access" to "Anyone" (not "Anyone with Google account")
//
// ─────────────────────────────────────────────────────────────

var SHEET_NAME  = 'Bookings';
var CAPACITY    = 30;
var SLOTS       = ['5:30', '6:00', '6:30'];
var FROM_NAME   = 'Hell Pizza Bond St';
var BOOKING_URL = 'https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPO-NAME/';


// ── GET ───────────────────────────────────────────────────────
function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var sheet  = getSheet();

    // Lookup by ref (manage page)
    if (params.ref) {
      return respond(getBookingByRef(sheet, params.ref));
    }

    var date = params.date || '';
    var availability = getAvailability(sheet, date);
    var bookings     = date ? getBookingsForDate(sheet, date) : [];

    return respond({ availability: availability, bookings: bookings });

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

    if (action === 'CREATE') {
      createBooking(sheet, data);
    } else if (action === 'EDIT') {
      editBooking(sheet, data);
    } else if (action === 'DELETE') {
      deleteBooking(sheet, data.timestamp, data.ref);
    } else if (action === 'CHANGE') {
      changeBookingSession(sheet, data);
    }

    return respond({ success: true });

  } catch(err) {
    return respond({ error: err.toString() });
  }
}


// ── CREATE ────────────────────────────────────────────────────
function createBooking(sheet, data) {
  var timestamp  = new Date().toISOString();
  var manageUrl  = BOOKING_URL + 'manage.html?ref=' + (data.ref || '');

  sheet.appendRow([
    timestamp,            // A — timestamp (used as unique ID)
    data.date     || '',  // B — session date  e.g. 2026-04-29
    data.time     || '',  // C — arrival time  e.g. 5:30
    data.name     || '',  // D — name
    data.phone    || '',  // E — phone
    data.email    || '',  // F — email
    data.guests   || 1,   // G — guest count
    data.requests || '',  // H — special requests
    data.ref      || ''   // I — booking reference e.g. HELL-AB3X9F
  ]);

  // Send confirmation email
  if (data.email) {
    sendConfirmationEmail(data, manageUrl);
  }
}


// ── EDIT ──────────────────────────────────────────────────────
function editBooking(sheet, data) {
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.timestamp)) {
      if (data.name     !== undefined) sheet.getRange(i+1, 4).setValue(data.name);
      if (data.phone    !== undefined) sheet.getRange(i+1, 5).setValue(data.phone);
      if (data.email    !== undefined) sheet.getRange(i+1, 6).setValue(data.email);
      if (data.guests   !== undefined) sheet.getRange(i+1, 7).setValue(data.guests);
      if (data.time     !== undefined) sheet.getRange(i+1, 3).setValue(data.time);
      if (data.requests !== undefined) sheet.getRange(i+1, 8).setValue(data.requests);
      break;
    }
  }
}


// ── DELETE ────────────────────────────────────────────────────
function deleteBooking(sheet, timestamp, ref) {
  var rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    var tsMatch  = timestamp && String(rows[i][0]) === String(timestamp);
    var refMatch = ref       && String(rows[i][8]) === String(ref);
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
    if (String(rows[i][8]) === String(data.ref)) {
      var newDate = data.date || String(rows[i][1]);
      var newTime = data.time || String(rows[i][2]);
      sheet.getRange(i+1, 2).setValue(newDate);
      sheet.getRange(i+1, 3).setValue(newTime);

      var email = String(rows[i][5]);
      if (email) {
        sendChangeEmail({
          name:   String(rows[i][3]),
          email:  email,
          date:   newDate,
          time:   newTime,
          guests: rows[i][6],
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
    var rowDate = String(rows[i][1]).trim();
    var rowTime = String(rows[i][2]).trim();
    if (rowDate === date && counts[rowTime] !== undefined) {
      counts[rowTime] += (parseInt(rows[i][6]) || 0);
    }
  }

  return SLOTS.map(function(time) {
    return {
      time:        time,
      totalBooked: counts[time],
      remaining:   CAPACITY - counts[time]
    };
  });
}


// ── BOOKINGS FOR DATE ─────────────────────────────────────────
function getBookingsForDate(sheet, date) {
  var rows     = sheet.getDataRange().getValues();
  var bookings = [];
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][1]).trim() === date) {
      bookings.push({
        timestamp: String(rows[i][0]),
        date:      String(rows[i][1]),
        time:      String(rows[i][2]),
        name:      String(rows[i][3]),
        phone:     String(rows[i][4]),
        email:     String(rows[i][5]),
        guests:    rows[i][6],
        requests:  String(rows[i][7]),
        ref:       String(rows[i][8])
      });
    }
  }
  return bookings;
}


// ── LOOKUP BY REF ─────────────────────────────────────────────
function getBookingByRef(sheet, ref) {
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][8]).trim() === String(ref).trim()) {
      return {
        booking: {
          timestamp: String(rows[i][0]),
          date:      String(rows[i][1]),
          time:      String(rows[i][2]),
          name:      String(rows[i][3]),
          phone:     String(rows[i][4]),
          email:     String(rows[i][5]),
          guests:    rows[i][6],
          requests:  String(rows[i][7]),
          ref:       String(rows[i][8])
        }
      };
    }
  }
  return { booking: null };
}


// ── CONFIRMATION EMAIL ────────────────────────────────────────
function sendConfirmationEmail(data, manageUrl) {
  var dateFormatted = formatDate(data.date);
  var subject = 'Your Hell Pizza AYCE Booking — ' + dateFormatted;

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
    + 'Hell Pizza Bond St &mdash; 14 Bond Street, Te Aro, Wellington.<br>'
    + 'All sessions end at 8:00pm. Please eat responsibly.'
    + '</p></div></div>';

  MailApp.sendEmail({ to: data.email, subject: subject, htmlBody: html, name: FROM_NAME });
}


// ── CHANGE EMAIL ──────────────────────────────────────────────
function sendChangeEmail(data) {
  var dateFormatted = formatDate(data.date);
  var subject = 'Booking Updated — ' + dateFormatted;

  var html = '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;">'
    + '<div style="background:#151515;padding:32px;text-align:center;">'
    + '<h1 style="font-family:Georgia,serif;color:#E1D8B7;font-size:28px;margin:0;letter-spacing:4px;">HELL PIZZA</h1>'
    + '<p style="color:#C80613;font-size:11px;font-weight:700;letter-spacing:3px;margin:8px 0 0;">BOOKING UPDATED</p>'
    + '</div>'
    + '<div style="background:#f9f9f7;padding:32px;">'
    + '<p style="font-size:16px;margin:0 0 24px;">Kia ora <strong>' + data.name + '</strong>,<br>Your booking has been updated to the details below.</p>'
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


// ── HELPERS ───────────────────────────────────────────────────
function getSheet() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['Timestamp','Date','Time','Name','Phone','Email','Guests','Special Requests','Ref']);
    sheet.setFrozenRows(1);
    // Format column A as plain text so ISO timestamps don't get mangled
    sheet.getRange('A:A').setNumberFormat('@STRING@');
  }

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
