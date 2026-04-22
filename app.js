/* Google Sheets Configuration */
const CONFIG = {
    API_URL: "https://script.google.com/macros/s/AKfycbxWrmERca_Mh5OsURUx7Y8MpmvjOGa9ZmOJN4TDEscpEd_rYUWcKEUpkq6tiQGJ9_YfCQ/exec",
    CAPACITY_PER_SLOT: 30,
    CACHE_TTL_MS: 60000  // cache is valid for 60 seconds
};

let appState = {
    currentScreen: 'bookingPage',
    numGuests: 1,
    selectedTime: null,
    selectedDate: null,
    slots: [
        { time: '5:30', booked: 0, capacity: 30 },
        { time: '6:00', booked: 0, capacity: 30 },
        { time: '6:30', booked: 0, capacity: 30 }
    ],
    loading: false,
    vegCount: 0,
    vegYes: false
};

function generateRef() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let ref = 'HELL-';
    for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)];
    return ref;
}

function localDateStr(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
}

// ── Cache helpers — store/load availability per date in localStorage ──
function cacheKey(date) { return 'ayce_avail_' + date; }

function loadFromCache(date) {
    try {
        var raw = localStorage.getItem(cacheKey(date));
        if (!raw) return null;
        var cached = JSON.parse(raw);
        // Ignore cache older than TTL
        if (Date.now() - cached.ts > CONFIG.CACHE_TTL_MS) return null;
        return cached.availability;
    } catch(e) { return null; }
}

function saveToCache(date, availability) {
    try {
        localStorage.setItem(cacheKey(date), JSON.stringify({
            ts: Date.now(),
            availability: availability
        }));
    } catch(e) {}
}

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

function initDatePicker() {
    const selector = elements.tuesdaySelector;
    selector.innerHTML = '';

    const now = new Date();
    const dayOfWeek = now.getDay();
    const hour = now.getHours();

    let offset = (2 - dayOfWeek + 7) % 7;
    if (offset === 0 && hour >= 20) offset = 7;

    let base = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12, 0, 0);
    const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    let firstBtn = null;
    let firstDateStr = null;

    for (let i = 0; i < 4; i++) {
        const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + (i * 7), 12, 0, 0);
        const dateStr = localDateStr(d);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'selector-btn';
        btn.innerHTML =
            '<span class="date-day">' + d.getDate() + '</span>' +
            '<span class="date-month">' + months[d.getMonth()] + '</span>';

        btn.onclick = (function(ds) {
            return function() {
                appState.selectedDate = ds;
                elements.sessionDate.value = ds;
                selector.querySelectorAll('.selector-btn').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                elements.dateError.style.display = 'none';
                appState.slots.forEach(function(s) { s.booked = 0; });
                // Show cached data instantly, then refresh in background
                applyCachedData(ds);
                refreshData();
            };
        })(dateStr);

        selector.appendChild(btn);

        if (i === 0) {
            firstBtn = btn;
            firstDateStr = dateStr;
        }
    }

    if (firstBtn) {
        firstBtn.classList.add('active');
        appState.selectedDate = firstDateStr;
        elements.sessionDate.value = firstDateStr;
        // Show cached data immediately (zero wait), then fetch fresh
        applyCachedData(firstDateStr);
        refreshData();
    }
}
initDatePicker();

// Apply cached availability instantly — no spinner, no "LOADING..."
function applyCachedData(date) {
    var cached = loadFromCache(date);
    if (cached) {
        cached.forEach(function(slot) {
            var match = appState.slots.find(function(s) { return s.time === slot.time; });
            if (match) match.booked = slot.totalBooked;
        });
        updateSlotsUI();
    }
    // If no cache yet, show a subtle pulsing state (not "LOADING...")
    // slots will just show current state until fetch completes
}

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
                // Rebuild veg selector to match new guest count
                if (appState.vegYes) {
                    initVegSelector();
                }
            };
        })(i);
        elements.guestSelector.appendChild(btn);
    }
}
initGuestSelector();


// Vegetarian selector — rebuilds buttons up to current guest count
function initVegSelector() {
    var sel = document.getElementById('vegSelector');
    if (!sel) return;
    sel.innerHTML = '';
    // Cap vegCount to current numGuests
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

elements.bookingForm.addEventListener('submit', handleFormSubmit);

elements.slotBtns.forEach(function(btn) {
    btn.addEventListener('click', function(e) {
        var time = e.currentTarget.dataset.time;
        if (e.currentTarget.classList.contains('disabled')) return;
        appState.selectedTime = time;
        updateSlotsUI();
    });
});

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

        if (remaining <= 0) {
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
    appState.slots.forEach(function(s) { s.booked = 0; });
    appState.vegYes = false;
    appState.vegCount = 0;
    setVeg(false);
    updateGuestUI();
    updateSlotsUI();
    showScreen('bookingPage');
    initDatePicker();
}

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

    var termsAccepted = document.getElementById('termsAccepted').checked;
    if (!termsAccepted) {
        var termsSection = document.querySelector('.terms-section');
        gsap.to(termsSection, { x: 5, repeat: 5, yoyo: true, duration: 0.05 });
        termsSection.style.borderColor = 'rgba(200,6,19,0.5)';
        setTimeout(function() { termsSection.style.borderColor = ''; }, 2000);
        return;
    }

    var bookingRef = generateRef();
    var manageUrl = window.location.href.replace(/\/[^\/]*$/, '/') + 'manage.html?ref=' + bookingRef;

    var formData = {
        name:     document.getElementById('custName').value,
        phone:    document.getElementById('custPhone').value,
        email:    document.getElementById('custEmail').value,
        guests:   appState.numGuests,
        time:     appState.selectedTime,
        date:     appState.selectedDate,
        vegetarians: appState.vegYes ? appState.vegCount : 0,
        ref:      bookingRef,
        manageUrl: manageUrl
    };

    try {
        setLoading(true);
        await fetch(CONFIG.API_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(formData),
            headers: { 'Content-Type': 'application/json' }
        });

        // Optimistically update local state and cache immediately
        // so the counter updates right away without waiting for a re-fetch
        var slot = appState.slots.find(function(s) { return s.time === formData.time; });
        if (slot) slot.booked += formData.guests;
        updateSlotsUI();
        // Bust the cache for this date so next load is fresh
        try { localStorage.removeItem(cacheKey(appState.selectedDate)); } catch(e) {}

        document.getElementById('successEmail').textContent = formData.email;
        document.getElementById('successRef').textContent = bookingRef;
        showScreen('successPage');

        // Refresh in background to get authoritative count
        refreshData();

    } catch (err) {
        console.error('Booking failed:', err);
        alert('Something went wrong. Please check your connection to the flames.');
    } finally {
        setLoading(false);
    }
}

async function refreshData() {
    if (!appState.selectedDate) return;
    var date = appState.selectedDate;

    try {
        var url = new URL(CONFIG.API_URL);
        url.searchParams.set('date', date);
        var response = await fetch(url);
        var data = await response.json();

        if (data.availability) {
            data.availability.forEach(function(slot) {
                var match = appState.slots.find(function(s) { return s.time === slot.time; });
                if (match) match.booked = slot.totalBooked;
            });
            // Save to cache for instant display next time
            saveToCache(date, data.availability);
        }
    } catch (err) {
        console.error('Error refreshing data:', err);
    }

    // Only update UI if the user hasn't switched to a different date
    if (appState.selectedDate === date) {
        updateSlotsUI();
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
