/* ─────────────────────────────────────────────
   HELL PIZZA — Staff Admin Portal
   ───────────────────────────────────────────── */

const CONFIG = {
    API_URL: "https://script.google.com/macros/s/AKfycbxWrmERca_Mh5OsURUx7Y8MpmvjOGa9ZmOJN4TDEscpEd_rYUWcKEUpkq6tiQGJ9_YfCQ/exec",
    CAPACITY_PER_SLOT: 30,
    SLOTS: ['5:30', '6:00', '6:30'],
    TOTAL_CAPACITY: 90 // 3 slots × 30
};

/* ── State ── */
let state = {
    // Array of { dateStr, label, bookings: [], slotCounts: {}, loaded: false }
    sessions: [],
    currentDate: null
};

/* ── Helpers ── */
const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const DAYS   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function getUpcomingTuesdays() {
    const tuesdays = [];
    let d = new Date();
    // Move to next Tuesday (or today if it's Tuesday and before 8pm)
    const dayOfWeek = d.getDay();
    let daysUntilTuesday = (2 - dayOfWeek + 7) % 7;
    if (daysUntilTuesday === 0 && d.getHours() >= 20) daysUntilTuesday = 7;
    d.setDate(d.getDate() + daysUntilTuesday);
    d.setHours(0,0,0,0);

    for (let i = 0; i < 4; i++) {
        const copy = new Date(d);
        tuesdays.push({
            dateStr: copy.toISOString().split('T')[0],
            day: copy.getDate(),
            month: MONTHS[copy.getMonth()],
            year: copy.getFullYear(),
            label: `TUESDAY ${copy.getDate()} ${MONTHS[copy.getMonth()]}`
        });
        d.setDate(d.getDate() + 7);
    }
    return tuesdays;
}

function totalBooked(session) {
    return (session.bookings || []).reduce((sum, b) => sum + (parseInt(b.guests) || 0), 0);
}

function slotBooked(session, time) {
    return (session.bookings || [])
        .filter(b => b.time === time)
        .reduce((sum, b) => sum + (parseInt(b.guests) || 0), 0);
}

/* ── Init ── */
lucide.createIcons();

function init() {
    const tuesdays = getUpcomingTuesdays();
    state.sessions = tuesdays.map(t => ({
        ...t,
        bookings: [],
        loaded: false,
        loading: false
    }));
    renderHomepage();
    // Kick off background fetches for all 4 sessions
    state.sessions.forEach((_, i) => fetchSession(i));
}

/* ── Render Homepage ── */
function renderHomepage() {
    const grid = document.getElementById('tuesdayGrid');
    grid.innerHTML = state.sessions.map((s, i) => `
        <div class="tuesday-card" onclick="openSession(${i})">
            <div class="card-top">
                <div class="card-date">
                    <div class="card-day-num">${s.day}</div>
                    <div class="card-date-detail">
                        <div class="card-month">${s.month}</div>
                        <div class="card-year">${s.year}</div>
                    </div>
                </div>
                <i data-lucide="arrow-right" size="18" class="card-arrow"></i>
            </div>
            <div class="card-divider"></div>
            <div class="card-bottom" id="cardBottom-${i}">
                ${renderCardBottom(s)}
            </div>
        </div>
    `).join('');
    lucide.createIcons();
}

function renderCardBottom(s) {
    if (!s.loaded) {
        return `<div class="card-loading-text">Loading...</div>`;
    }

    const total = totalBooked(s);

    const miniSlots = CONFIG.SLOTS.map(time => {
        const count = slotBooked(s, time);
        const active = count > 0 ? 'active' : '';
        return `
            <div class="mini-slot ${active}">
                <div class="mini-dot"></div>
                ${time} PM &mdash; ${count}
            </div>
        `;
    }).join('');

    return `
        <div class="card-total">
            <div class="card-total-num">${total}</div>
            <div class="card-total-label">people booked</div>
        </div>
        <div class="card-slots-mini">${miniSlots}</div>
    `;
}

function updateCardBottom(index) {
    const el = document.getElementById(`cardBottom-${index}`);
    if (el) {
        el.innerHTML = renderCardBottom(state.sessions[index]);
        lucide.createIcons();
    }
}

/* ── Fetch a single session ── */
async function fetchSession(index) {
    const session = state.sessions[index];
    if (!CONFIG.API_URL || CONFIG.API_URL.includes('YOUR_DEPLOYMENT_ID')) {
        // Demo mode — no real data
        session.loaded = true;
        updateCardBottom(index);
        return;
    }

    session.loading = true;
    try {
        const url = new URL(CONFIG.API_URL);
        url.searchParams.set('date', session.dateStr);
        const res = await fetch(url);
        const data = await res.json();

        session.bookings = data.bookings || [];
        session.loaded = true;

        // If we're currently viewing this session, re-render it
        if (state.currentDate === session.dateStr) {
            renderSessionDetail(index);
        }
    } catch (err) {
        console.error(`Failed to load session ${session.dateStr}:`, err);
        session.loaded = true; // show empty rather than stuck loading
    } finally {
        session.loading = false;
        updateCardBottom(index);
    }
}

/* ── Navigation ── */
function showHome() {
    document.getElementById('homeView').style.display = '';
    document.getElementById('sessionView').style.display = 'none';
    state.currentDate = null;
}

function openSession(index) {
    const session = state.sessions[index];
    state.currentDate = session.dateStr;

    document.getElementById('homeView').style.display = 'none';
    document.getElementById('sessionView').style.display = '';

    renderSessionDetail(index);

    // Refresh data when opening
    fetchSession(index);
}

function currentSessionIndex() {
    return state.sessions.findIndex(s => s.dateStr === state.currentDate);
}

function refreshSession() {
    const icon = document.getElementById('refreshIcon');
    if (icon) icon.classList.add('spin');
    const index = currentSessionIndex();
    if (index >= 0) {
        fetchSession(index).then(() => {
            if (icon) icon.classList.remove('spin');
        });
    }
}

/* ── Render Session Detail ── */
function renderSessionDetail(index) {
    const session = state.sessions[index];
    const total = totalBooked(session);

    document.getElementById('sessionTitle').textContent = session.label;
    document.getElementById('sessionSubtitle').textContent =
        session.loaded
            ? `${total} PEOPLE BOOKED ACROSS ${session.bookings.length} RESERVATION${session.bookings.length !== 1 ? 'S' : ''}`
            : 'LOADING...';

    // For print
    document.getElementById('printDateLine').textContent =
        `Printed ${new Date().toLocaleString('en-NZ')} — ${session.label}`;

    const container = document.getElementById('slotSections');

    if (!session.loaded) {
        container.innerHTML = `<div style="padding:3rem; opacity:0.3; font-size:0.8rem; letter-spacing:0.2em; font-weight:700; text-transform:uppercase;">Loading bookings...</div>`;
        return;
    }

    container.innerHTML = CONFIG.SLOTS.map(time => {
        const slotBookings = (session.bookings || [])
            .filter(b => b.time === time)
            .sort((a, b) => a.name.localeCompare(b.name));

        const count = slotBookings.reduce((s, b) => s + (parseInt(b.guests) || 0), 0);
        const timeLabel = time + ' PM';

        const rows = slotBookings.length > 0
            ? slotBookings.map(b => {
                const hasNote = b.requests && b.requests.trim().length > 0;
                return `
                    <div class="booking-row">
                        <div class="booking-name">${escapeHtml(b.name)}</div>
                        <div class="booking-phone">${escapeHtml(b.phone)}</div>
                        <div class="booking-guests-wrap">
                            <div class="booking-guests">${b.guests}</div>
                            <div class="booking-guests-label">guests</div>
                        </div>
                        <div class="booking-requests ${hasNote ? 'has-note' : ''}">
                            ${hasNote ? escapeHtml(b.requests) : 'No special requests'}
                        </div>
                        <div class="row-actions">
                            <button class="icon-btn" onclick="openEditModal('${escapeAttr(b.timestamp)}')" title="Edit">
                                <i data-lucide="pencil" size="13"></i>
                            </button>
                            <button class="icon-btn del" onclick="deleteBooking('${escapeAttr(b.timestamp)}')" title="Delete">
                                <i data-lucide="trash-2" size="13"></i>
                            </button>
                        </div>
                    </div>
                `;
              }).join('')
            : `<div class="empty-slot">No bookings for this slot yet</div>`;

        return `
            <div class="slot-group">
                <div class="slot-group-header">
                    <div class="slot-group-title">${timeLabel}</div>
                    <div class="slot-group-count">${count} PEOPLE &bull; ${slotBookings.length} BOOKING${slotBookings.length !== 1 ? 'S' : ''}</div>
                </div>
                ${rows}
            </div>
        `;
    }).join('');

    lucide.createIcons();
}

/* ── Edit Modal ── */
function openEditModal(timestamp) {
    const index = currentSessionIndex();
    if (index < 0) return;
    const booking = state.sessions[index].bookings.find(b => b.timestamp === timestamp);
    if (!booking) return;

    document.getElementById('editTimestamp').value = booking.timestamp;
    document.getElementById('editName').value = booking.name;
    document.getElementById('editPhone').value = booking.phone;
    document.getElementById('editGuests').value = booking.guests;
    document.getElementById('editTime').value = booking.time;
    document.getElementById('editRequests').value = booking.requests || '';

    document.getElementById('editModal').classList.add('open');
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('open');
}

async function saveEdit() {
    const payload = {
        action: 'EDIT',
        timestamp: document.getElementById('editTimestamp').value,
        name: document.getElementById('editName').value,
        phone: document.getElementById('editPhone').value,
        guests: parseInt(document.getElementById('editGuests').value),
        time: document.getElementById('editTime').value,
        requests: document.getElementById('editRequests').value
    };

    // Optimistic local update
    const index = currentSessionIndex();
    if (index >= 0) {
        const booking = state.sessions[index].bookings.find(b => b.timestamp === payload.timestamp);
        if (booking) Object.assign(booking, payload);
        renderSessionDetail(index);
        updateCardBottom(index);
    }

    closeEditModal();

    try {
        await fetch(CONFIG.API_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(payload)
        });
        setTimeout(() => fetchSession(index), 1200);
    } catch (err) {
        console.error('Failed to save edit:', err);
        alert('Save may have failed — please refresh to confirm.');
    }
}

/* ── Delete ── */
async function deleteBooking(timestamp) {
    if (!confirm('REMOVE THIS BOOKING?')) return;

    const index = currentSessionIndex();

    // Optimistic local remove
    if (index >= 0) {
        state.sessions[index].bookings = state.sessions[index].bookings.filter(b => b.timestamp !== timestamp);
        renderSessionDetail(index);
        updateCardBottom(index);
    }

    try {
        await fetch(CONFIG.API_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({ action: 'DELETE', timestamp })
        });
        setTimeout(() => fetchSession(index), 1200);
    } catch (err) {
        console.error('Failed to delete:', err);
        alert('Delete may have failed — please refresh to confirm.');
    }
}

/* ── Utilities ── */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/'/g, "\\'");
}

// Close modal on backdrop click
document.getElementById('editModal').addEventListener('click', function(e) {
    if (e.target === this) closeEditModal();
});

// Keyboard ESC to close modal
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeEditModal();
});

/* ── Boot ── */
init();
