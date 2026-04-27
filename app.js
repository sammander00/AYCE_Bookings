/* ── SUPABASE CONFIG ── */
const SUPABASE_URL = 'https://zmhfympqxvdkotyjzvuk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_I5WfIE7qy58qjLz6TsvqVw_ZI60hNDW';
const CAPACITY     = 30;
const SLOTS        = ['5:30', '6:00', '6:30'];

let appState = {
    numGuests: 1,
    selectedTime: null,
    selectedDate: null,
    controlsCache: null,
    slots: [
        { time: '5:30', booked: 0, capacity: 30, forcedSoldOut: false },
        { time: '6:00', booked: 0, capacity: 30, forcedSoldOut: false },
        { time: '6:30', booked: 0, capacity: 30, forcedSoldOut: false }
    ],
    loading: false,
    vegCount: 0,
    vegYes: null,  // null = not yet answered
    allDates: []
};

/* ── HELPERS ── */
function generateRef() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let ref = 'HELL-';
    for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)];
    return ref;
}

function localDateStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

/* ── SUPABASE FETCH ── */
async function sbFetch(path, options) {
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, Object.assign({
        headers: {
            'apikey':        SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Content-Type':  'application/json',
            'Prefer':        'return=representation'
        }
    }, options || {}));
    var text = await res.text();
    return text ? JSON.parse(text) : null;
}

/* ── FETCH AVAILABILITY (fast — direct DB query) ── */
async function fetchAvailability(date) {
    // If controls not cached yet, fetch both in parallel; otherwise just bookings
    var fetchList = [sbFetch('bookings?select=time,guests&date=eq.' + encodeURIComponent(date))];
    if (!appState.controlsCache) fetchList.push(sbFetch('controls?id=eq.1'));

    var results = await Promise.all(fetchList);
    var rows = results[0];
    if (results[1]) appState.controlsCache = (results[1].length > 0) ? results[1][0].data : {};

    var counts = {};
    SLOTS.forEach(function(s) { counts[s] = 0; });
    (rows || []).forEach(function(r) {
        if (counts[r.time] !== undefined) counts[r.time] += (parseInt(r.guests) || 0);
    });

    var ctrl = appState.controlsCache || {};
    var dateCtrl = ctrl[date] || { blocked: false, stoppedSlots: [] };

    appState.slots.forEach(function(slot) {
        slot.booked = counts[slot.time] || 0;
        slot.forcedSoldOut = dateCtrl.blocked ||
            (dateCtrl.stoppedSlots && dateCtrl.stoppedSlots.indexOf(slot.time) >= 0);
    });

    updateSlotsUI();
}

async function fetchAllDates() {
    await Promise.all(appState.allDates.map(function(d) { return fetchAvailability(d); }));
}

/* ── LUCIDE & ELEMENTS ── */
lucide.createIcons();

const elements = {
    bookingForm: document.getElementById('bookingForm'),
    guestSelector: document.getElementById('guestSelector'),
    tuesdaySelector: document.getElementById('tuesdaySelector'),
    sessionDate: document.getElementById('sessionDate'),
    dateError: document.getElementById('dateError'),
    slotBtns: document.querySelectorAll('.slot-btn'),
    screens: document.querySelectorAll('.screen'),
    submitBtn: document.getElementById('submitBtn')
};

/* ── DATE PICKER ── */
function initDatePicker() {
    const selector = elements.tuesdaySelector;
    selector.innerHTML = '';

    const now = new Date();
    let offset = (2 - now.getDay() + 7) % 7;
    if (offset === 0 && now.getHours() >= 20) offset = 7;

    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12, 0, 0);
    const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

    appState.allDates = [];
    let firstBtn = null;
    let firstDateStr = null;

    for (let i = 0; i < 4; i++) {
        const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + (i * 7), 12, 0, 0);
        const dateStr = localDateStr(d);
        appState.allDates.push(dateStr);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'selector-btn';
        btn.innerHTML = '<span class="date-day">' + d.getDate() + '</span>' +
                        '<span class="date-month">' + months[d.getMonth()] + '</span>';

        btn.onclick = (function(ds) {
            return function() {
                appState.selectedDate = ds;
                elements.sessionDate.value = ds;
                selector.querySelectorAll('.selector-btn').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                elements.dateError.style.display = 'none';
                appState.slots.forEach(function(s) { s.booked = 0; s.forcedSoldOut = false; });
                updateSlotsUI();
                fetchAvailability(ds);
            };
        })(dateStr);

        selector.appendChild(btn);
        if (i === 0) { firstBtn = btn; firstDateStr = dateStr; }
    }

    if (firstBtn) {
        firstBtn.classList.add('active');
        appState.selectedDate = firstDateStr;
        elements.sessionDate.value = firstDateStr;
        fetchAvailability(firstDateStr);
        // Pre-fetch other dates in background so switching is fast
        setTimeout(function() {
            appState.allDates.slice(1).forEach(function(d) { fetchAvailability(d); });
        }, 500);
    }
}
// Pre-warm controls cache immediately so first fetchAvailability skips it
sbFetch('controls?id=eq.1').then(function(ctrlRows) {
    appState.controlsCache = (ctrlRows && ctrlRows.length > 0) ? ctrlRows[0].data : {};
}).catch(function(){});
initDatePicker();

// Auto-refresh every 30s
setInterval(function() {
    if (appState.selectedDate) fetchAvailability(appState.selectedDate);
}, 30000);

/* ── GUEST SELECTOR ── */
function initGuestSelector() {
    elements.guestSelector.innerHTML = '';
    for (var i = 1; i <= 15; i++) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.val = i;
        btn.textContent = i;
        btn.classList.toggle('active', i === appState.numGuests);
        btn.onclick = (function(val) {
            return function() {
                appState.numGuests = val;
                updateGuestUI();
                updateSlotsUI();
                if (appState.vegYes) initVegSelector();
            };
        })(i);
        elements.guestSelector.appendChild(btn);
    }
}
initGuestSelector();

/* ── VEG SELECTOR ── */
function initVegSelector() {
    var sel = document.getElementById('vegSelector');
    if (!sel) return;
    sel.innerHTML = '';
    if (appState.vegCount > appState.numGuests) appState.vegCount = appState.numGuests;
    if (appState.vegCount < 1) appState.vegCount = 1;
    document.getElementById('vegCount').value = appState.vegCount;
    for (var i = 1; i <= appState.numGuests; i++) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.val = i;
        btn.textContent = i;
        btn.classList.toggle('active', i === appState.vegCount);
        btn.onclick = (function(val) {
            return function() {
                appState.vegCount = val;
                document.getElementById('vegSelector').querySelectorAll('button').forEach(function(b) {
                    b.classList.toggle('active', parseInt(b.dataset.val) === val);
                });
                document.getElementById('vegCount').value = val;
            };
        })(i);
        sel.appendChild(btn);
    }
}

function setVeg(isYes) {
    appState.vegYes = isYes;
    document.getElementById('vegYes').classList.toggle('active', isYes);
    document.getElementById('vegNo').classList.toggle('active', !isYes);
    var wrap = document.getElementById('vegCountWrap');
    if (isYes) {
        wrap.style.display = 'block';
        initVegSelector();
    } else {
        wrap.style.display = 'none';
        appState.vegCount = 0;
        document.getElementById('vegCount').value = 0;
    }
}

/* ── EVENT LISTENERS ── */
elements.bookingForm.addEventListener('submit', handleFormSubmit);

elements.slotBtns.forEach(function(btn) {
    btn.addEventListener('click', function(e) {
        if (e.currentTarget.classList.contains('disabled')) return;
        appState.selectedTime = e.currentTarget.dataset.time;
        updateSlotsUI();
    });
});

/* ── UI ── */
function updateGuestUI() {
    elements.guestSelector.querySelectorAll('button').forEach(function(btn) {
        btn.classList.toggle('active', parseInt(btn.dataset.val) === appState.numGuests);
    });
    document.getElementById('numGuests').value = appState.numGuests;
}

function updateSlotsUI() {
    elements.slotBtns.forEach(function(btn) {
        var time = btn.dataset.time;
        var slot = appState.slots.find(function(s) { return s.time === time; });
        var remaining = slot ? (slot.capacity - slot.booked) : 30;
        var availText = btn.querySelector('.availability');

        if (!slot || remaining <= 0 || slot.forcedSoldOut) {
            btn.classList.add('disabled');
            btn.classList.remove('active', 'urgent');
            availText.textContent = 'SOLD OUT';
        } else {
            btn.classList.remove('disabled');
            availText.textContent = remaining + ' SEATS LEFT';
            btn.classList.toggle('urgent', remaining <= 10);
            if (remaining < appState.numGuests) {
                btn.classList.add('disabled');
                availText.textContent = 'NEED ' + appState.numGuests + ' SEATS';
            }
        }
        btn.classList.toggle('active', appState.selectedTime === time);
    });
    document.getElementById('selectedTime').value = appState.selectedTime || '';
}

function showScreen(screenId) {
    elements.screens.forEach(function(s) {
        if (s.id === screenId) {
            s.style.display = 'block';
            setTimeout(function() { s.classList.add('active'); }, 10);
        } else {
            s.classList.remove('active');
            setTimeout(function() { s.style.display = 'none'; }, 500);
        }
    });
}

function resetForm() {
    elements.bookingForm.reset();
    appState.selectedTime = null;
    appState.numGuests = 1;
    appState.slots.forEach(function(s) { s.booked = 0; s.forcedSoldOut = false; });
    appState.vegYes = null;
    appState.vegCount = 0;
    setVeg(false);
    updateGuestUI();
    updateSlotsUI();
    showScreen('bookingPage');
    // Pre-warm controls cache immediately so first fetchAvailability skips it
sbFetch('controls?id=eq.1').then(function(ctrlRows) {
    appState.controlsCache = (ctrlRows && ctrlRows.length > 0) ? ctrlRows[0].data : {};
}).catch(function(){});
initDatePicker();
}

/* ── SUBMIT ── */
async function handleFormSubmit(e) {
    e.preventDefault();

    if (!appState.selectedDate) {
        elements.dateError.style.display = 'block';
        gsap.to(elements.tuesdaySelector, { x: 5, repeat: 5, yoyo: true, duration: 0.05 });
        return;
    }
    if (!appState.selectedTime) {
        gsap.to(elements.slotBtns, { x: 5, repeat: 5, yoyo: true, duration: 0.05 });
        return;
    }
    if (appState.vegYes === null) {
        var vegGroup = document.querySelector('.input-group .veg-btn').closest('.input-group');
        gsap.to(vegGroup, { x: 5, repeat: 5, yoyo: true, duration: 0.05 });
        vegGroup.style.outline = '1px solid rgba(200,6,19,0.5)';
        setTimeout(function() { vegGroup.style.outline = ''; }, 2000);
        return;
    }
    if (!document.getElementById('termsAccepted').checked) {
        var ts = document.querySelector('.terms-section');
        gsap.to(ts, { x: 5, repeat: 5, yoyo: true, duration: 0.05 });
        ts.style.borderColor = 'rgba(200,6,19,0.5)';
        setTimeout(function() { ts.style.borderColor = ''; }, 2000);
        return;
    }

    var bookingRef = generateRef();
    var manageUrl = 'https://aycepizza.bond/manage.html?ref=' + bookingRef;

    var formData = {
        name:        document.getElementById('custName').value,
        phone:       document.getElementById('custPhone').value,
        email:       document.getElementById('custEmail').value,
        guests:      appState.numGuests,
        time:        appState.selectedTime,
        date:        appState.selectedDate,
        vegetarians: appState.vegYes ? appState.vegCount : 0,
        ref:         bookingRef,
        manageUrl:   manageUrl
    };

    try {
        setLoading(true);

        // Write to Supabase
        await sbFetch('bookings', {
            method: 'POST',
            body: JSON.stringify({
                date:        formData.date,
                time:        formData.time,
                name:        formData.name,
                phone:       String(formData.phone),
                email:       formData.email,
                guests:      formData.guests,
                vegetarians: formData.vegetarians,
                ref:         formData.ref,
                source:      'online'
            })
        });

        // Also notify Apps Script to send confirmation email
        fetch('https://script.google.com/macros/s/AKfycbxWrmERca_Mh5OsURUx7Y8MpmvjOGa9ZmOJN4TDEscpEd_rYUWcKEUpkq6tiQGJ9_YfCQ/exec', {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(Object.assign({ action: 'EMAIL_ONLY' }, formData))
        });

        // Optimistic update — show new count immediately
        var slot = appState.slots.find(function(s) { return s.time === formData.time; });
        if (slot) slot.booked += formData.guests;
        updateSlotsUI();

        document.getElementById('successEmail').textContent = formData.email;
        document.getElementById('successRef').textContent = bookingRef;
        showScreen('successPage');

        // Refresh counts from DB in background
        setTimeout(function() { fetchAvailability(appState.selectedDate); }, 1000);

    } catch(err) {
        console.error('Booking failed:', err);
        alert('Something went wrong. Please try again.');
    } finally {
        setLoading(false);
    }
}

function setLoading(isLoading) {
    appState.loading = isLoading;
    elements.submitBtn.disabled = isLoading;
    elements.submitBtn.querySelector('.btn-text').style.opacity = isLoading ? '0' : '1';
    elements.submitBtn.querySelector('.btn-loader').style.display = isLoading ? 'block' : 'none';
}

updateSlotsUI();
gsap.from('.container', { y: 100, opacity: 0, duration: 1.2, delay: 0.3, ease: 'power3.out' });
