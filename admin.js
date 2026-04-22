/* ─────────────────────────────────────────
   HELL PIZZA — Staff Admin Portal
   ───────────────────────────────────────── */

const CONFIG = {
    API_URL: "https://script.google.com/macros/s/AKfycbxWrmERca_Mh5OsURUx7Y8MpmvjOGa9ZmOJN4TDEscpEd_rYUWcKEUpkq6tiQGJ9_YfCQ/exec",
    CAPACITY_PER_SLOT: 30,
    SLOTS: ['5:30', '6:00', '6:30']
};

let state = {
    sessions: [],
    currentDate: null
};

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const FULL_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ── Timezone-safe date string (same fix as app.js) ──
function localDateStr(d) {
    var yyyy = d.getFullYear();
    var mm   = String(d.getMonth() + 1).padStart(2, '0');
    var dd   = String(d.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
}

function getUpcomingTuesdays() {
    var now        = new Date();
    var dayOfWeek  = now.getDay();
    var offset     = (2 - dayOfWeek + 7) % 7;
    if (offset === 0 && now.getHours() >= 20) offset = 7;

    var tuesdays = [];
    for (var i = 0; i < 4; i++) {
        var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset + (i * 7), 12, 0, 0);
        tuesdays.push({
            dateStr: localDateStr(d),
            day:     d.getDate(),
            month:   MONTHS[d.getMonth()],
            fullMonth: FULL_MONTHS[d.getMonth()],
            year:    d.getFullYear(),
            label:   'TUESDAY ' + d.getDate() + ' ' + MONTHS[d.getMonth()]
        });
    }
    return tuesdays;
}

function totalBooked(session) {
    return (session.bookings || []).reduce(function(sum, b) { return sum + (parseInt(b.guests) || 0); }, 0);
}

function slotBooked(session, time) {
    return (session.bookings || [])
        .filter(function(b) { return b.time === time; })
        .reduce(function(sum, b) { return sum + (parseInt(b.guests) || 0); }, 0);
}

// ── Init ──
lucide.createIcons();

function init() {
    state.sessions = getUpcomingTuesdays().map(function(t) {
        return Object.assign({}, t, { bookings: [], loaded: false, loading: false });
    });
    renderHomepage();
    state.sessions.forEach(function(_, i) { fetchSession(i); });
}

// ── Render Homepage ──
function renderHomepage() {
    var grid = document.getElementById('tuesdayGrid');
    grid.innerHTML = state.sessions.map(function(s, i) {
        return '<div class="tuesday-card" onclick="openSession(' + i + ')">'
            + '<div class="card-top">'
            + '<div class="card-date">'
            + '<div class="card-day-num">' + s.day + '</div>'
            + '<div class="card-date-detail">'
            + '<div class="card-month">' + s.month + '</div>'
            + '<div class="card-year">' + s.year + '</div>'
            + '</div></div>'
            + '<i data-lucide="arrow-right" size="18" class="card-arrow"></i>'
            + '</div>'
            + '<div class="card-divider"></div>'
            + '<div class="card-bottom" id="cardBottom-' + i + '">' + renderCardBottom(s) + '</div>'
            + '</div>';
    }).join('');
    lucide.createIcons();
}

function renderCardBottom(s) {
    if (!s.loaded) return '<div class="card-loading-text">Loading...</div>';

    var total = totalBooked(s);
    var miniSlots = CONFIG.SLOTS.map(function(time) {
        var count  = slotBooked(s, time);
        var active = count > 0 ? 'active' : '';
        return '<div class="mini-slot ' + active + '"><div class="mini-dot"></div>' + time + ' PM &mdash; ' + count + '</div>';
    }).join('');

    return '<div class="card-total"><div class="card-total-num">' + total + '</div>'
        + '<div class="card-total-label">people booked</div></div>'
        + '<div class="card-slots-mini">' + miniSlots + '</div>';
}

function updateCardBottom(index) {
    var el = document.getElementById('cardBottom-' + index);
    if (el) {
        el.innerHTML = renderCardBottom(state.sessions[index]);
        lucide.createIcons();
    }
}

// ── Fetch session from API ──
async function fetchSession(index) {
    var session = state.sessions[index];
    session.loading = true;

    try {
        var url = new URL(CONFIG.API_URL);
        url.searchParams.set('date', session.dateStr);
        var res  = await fetch(url.toString());
        var data = await res.json();

        session.bookings = data.bookings || [];
        session.loaded   = true;

        if (state.currentDate === session.dateStr) {
            renderSessionDetail(index);
        }
    } catch(err) {
        console.error('Failed to load session ' + session.dateStr + ':', err);
        session.loaded = true;
    }

    session.loading = false;
    updateCardBottom(index);
}

// ── Navigation ──
function showHome() {
    document.getElementById('homeView').style.display    = '';
    document.getElementById('sessionView').style.display = 'none';
    state.currentDate = null;
}

function openSession(index) {
    var session        = state.sessions[index];
    state.currentDate  = session.dateStr;

    document.getElementById('homeView').style.display    = 'none';
    document.getElementById('sessionView').style.display = '';

    renderSessionDetail(index);
    fetchSession(index);
}

function currentSessionIndex() {
    return state.sessions.findIndex(function(s) { return s.dateStr === state.currentDate; });
}

function refreshSession() {
    var icon  = document.getElementById('refreshIcon');
    var index = currentSessionIndex();
    if (icon)  icon.classList.add('spin');
    if (index >= 0) {
        fetchSession(index).then(function() {
            if (icon) icon.classList.remove('spin');
        });
    }
}

// ── Render Session Detail ──
function renderSessionDetail(index) {
    var session = state.sessions[index];
    var total   = totalBooked(session);

    document.getElementById('sessionTitle').textContent = session.label;
    document.getElementById('sessionSubtitle').textContent = session.loaded
        ? total + ' PEOPLE BOOKED ACROSS ' + session.bookings.length + ' RESERVATION' + (session.bookings.length !== 1 ? 'S' : '')
        : 'LOADING...';

    document.getElementById('printDateLine').textContent =
        'Printed ' + new Date().toLocaleString('en-NZ') + ' \u2014 ' + session.label;

    var container = document.getElementById('slotSections');

    if (!session.loaded) {
        container.innerHTML = '<div style="padding:3rem;opacity:0.3;font-size:0.8rem;letter-spacing:0.2em;font-weight:700;text-transform:uppercase;">Loading bookings...</div>';
        return;
    }

    container.innerHTML = CONFIG.SLOTS.map(function(time) {
        var slotBookings = (session.bookings || [])
            .filter(function(b) { return b.time === time; })
            .sort(function(a, b) { return a.name.localeCompare(b.name); });

        var count = slotBookings.reduce(function(s, b) { return s + (parseInt(b.guests) || 0); }, 0);

        var rows = slotBookings.length > 0
            ? slotBookings.map(function(b) {
                var hasNote = b.requests && b.requests.trim().length > 0;
                return '<div class="booking-row">'
                    + '<div class="booking-name">'   + esc(b.name)  + '</div>'
                    + '<div class="booking-phone">'  + esc(b.phone) + '</div>'
                    + '<div class="booking-guests-wrap"><div class="booking-guests">' + b.guests + '</div><div class="booking-guests-label">guests</div></div>'
                    + '<div class="booking-requests ' + (hasNote ? 'has-note' : '') + '">' + (hasNote ? esc(b.requests) : 'No special requests') + '</div>'
                    + '<div class="row-actions">'
                    + '<button class="icon-btn" onclick="openEditModal(\'' + escAttr(b.timestamp) + '\')" title="Edit"><i data-lucide="pencil" size="13"></i></button>'
                    + '<button class="icon-btn del" onclick="deleteBooking(\'' + escAttr(b.timestamp) + '\')" title="Delete"><i data-lucide="trash-2" size="13"></i></button>'
                    + '</div></div>';
              }).join('')
            : '<div class="empty-slot">No bookings for this slot yet</div>';

        return '<div class="slot-group">'
            + '<div class="slot-group-header">'
            + '<div class="slot-group-title">' + time + ' PM</div>'
            + '<div class="slot-group-count">' + count + ' PEOPLE &bull; ' + slotBookings.length + ' BOOKING' + (slotBookings.length !== 1 ? 'S' : '') + '</div>'
            + '</div>' + rows + '</div>';
    }).join('');

    lucide.createIcons();
}

// ── Edit Modal ──
function openEditModal(timestamp) {
    var index   = currentSessionIndex();
    if (index < 0) return;
    var booking = state.sessions[index].bookings.find(function(b) { return b.timestamp === timestamp; });
    if (!booking) return;

    document.getElementById('editTimestamp').value = booking.timestamp;
    document.getElementById('editName').value      = booking.name;
    document.getElementById('editPhone').value     = booking.phone;
    document.getElementById('editGuests').value    = booking.guests;
    document.getElementById('editTime').value      = booking.time;
    document.getElementById('editRequests').value  = booking.requests || '';

    document.getElementById('editModal').classList.add('open');
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('open');
}

async function saveEdit() {
    var payload = {
        action:    'EDIT',
        timestamp: document.getElementById('editTimestamp').value,
        name:      document.getElementById('editName').value,
        phone:     document.getElementById('editPhone').value,
        guests:    parseInt(document.getElementById('editGuests').value),
        time:      document.getElementById('editTime').value,
        requests:  document.getElementById('editRequests').value
    };

    var index = currentSessionIndex();
    if (index >= 0) {
        var booking = state.sessions[index].bookings.find(function(b) { return b.timestamp === payload.timestamp; });
        if (booking) Object.assign(booking, payload);
        renderSessionDetail(index);
        updateCardBottom(index);
    }

    closeEditModal();

    try {
        await fetch(CONFIG.API_URL, {
            method: 'POST',
            mode:   'no-cors',
            body:   JSON.stringify(payload)
        });
        setTimeout(function() { fetchSession(index); }, 1500);
    } catch(err) {
        alert('Save may have failed — please refresh to confirm.');
    }
}

// ── Delete ──
async function deleteBooking(timestamp) {
    if (!confirm('REMOVE THIS BOOKING?')) return;

    var index = currentSessionIndex();
    if (index >= 0) {
        state.sessions[index].bookings = state.sessions[index].bookings.filter(function(b) { return b.timestamp !== timestamp; });
        renderSessionDetail(index);
        updateCardBottom(index);
    }

    try {
        await fetch(CONFIG.API_URL, {
            method: 'POST',
            mode:   'no-cors',
            body:   JSON.stringify({ action: 'DELETE', timestamp: timestamp })
        });
        setTimeout(function() { fetchSession(index); }, 1500);
    } catch(err) {
        alert('Delete may have failed — please refresh to confirm.');
    }
}

// ── Utilities ──
function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escAttr(str) {
    return String(str || '').replace(/'/g, "\\'");
}

document.getElementById('editModal').addEventListener('click', function(e) {
    if (e.target === this) closeEditModal();
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeEditModal();
});

init();
