/* Google Sheets Configuration */
const CONFIG = {
    API_URL: "https://script.google.com/macros/s/AKfycbxWrmERca_Mh5OsURUx7Y8MpmvjOGa9ZmOJN4TDEscpEd_rYUWcKEUpkq6tiQGJ9_YfCQ/exec",
    CAPACITY_PER_SLOT: 30
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
    loading: false
};

function generateRef() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let ref = 'HELL-';
    for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)];
    return ref;
}

// Timezone-safe date string — avoids UTC conversion shifting the day in NZ (UTC+12/13)
function localDateStr(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
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

// Initialize Date Picker
function initDatePicker() {
    const selector = elements.tuesdaySelector;
    selector.innerHTML = '';

    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 Sun … 2 Tue … 6 Sat
    const hour = now.getHours();

    // Days until the next Tuesday.
    // If today IS Tuesday and before 8 pm, offset = 0 (show today).
    // If today IS Tuesday at/after 8 pm, jump 7 days.
    let offset = (2 - dayOfWeek + 7) % 7;
    if (offset === 0 && hour >= 20) offset = 7;

    // Use noon local time to avoid any DST edge cases
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
                // Reset slot counts when switching date
                appState.slots.forEach(function(s) { s.booked = 0; });
                updateSlotsUI();
                refreshData();
            };
        })(dateStr);

        selector.appendChild(btn);

        if (i === 0) {
            firstBtn = btn;
            firstDateStr = dateStr;
        }
    }

    // Auto-select first Tuesday and fetch immediately
    if (firstBtn) {
        firstBtn.classList.add('active');
        appState.selectedDate = firstDateStr;
        elements.sessionDate.value = firstDateStr;
        refreshData();
    }
}
initDatePicker();

// Generate 15 Guest Buttons
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
            };
        })(i);
        elements.guestSelector.appendChild(btn);
    }
}
initGuestSelector();

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
    document.getElementById('specialRequests').value = '';
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
        name: document.getElementById('custName').value,
        phone: document.getElementById('custPhone').value,
        email: document.getElementById('custEmail').value,
        guests: appState.numGuests,
        time: appState.selectedTime,
        date: appState.selectedDate,
        requests: document.getElementById('specialRequests').value || '',
        ref: bookingRef,
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

        document.getElementById('successEmail').textContent = formData.email;
        document.getElementById('successRef').textContent = bookingRef;
        showScreen('successPage');
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

    elements.slotBtns.forEach(function(btn) {
        btn.querySelector('.availability').textContent = 'LOADING...';
    });

    try {
        var url = new URL(CONFIG.API_URL);
        url.searchParams.set('date', appState.selectedDate);
        var response = await fetch(url);
        var data = await response.json();

        if (data.availability) {
            data.availability.forEach(function(slot) {
                var match = appState.slots.find(function(s) { return s.time === slot.time; });
                if (match) match.booked = slot.totalBooked;
            });
        }
    } catch (err) {
        console.error('Error refreshing data:', err);
    }

    updateSlotsUI();
}

function setLoading(isLoading) {
    appState.loading = isLoading;
    elements.submitBtn.disabled = isLoading;
    elements.submitBtn.querySelector('.btn-text').style.opacity = isLoading ? '0' : '1';
    elements.submitBtn.querySelector('.btn-loader').style.display = isLoading ? 'block' : 'none';
}

updateSlotsUI();
gsap.from('.container', { y: 100, opacity: 0, duration: 1.2, delay: 0.3, ease: 'power3.out' });
