/* Google Sheets Configuration */
const CONFIG = {
    // REPLACE THIS URL AFTER DEPLOYING APPS SCRIPT
    API_URL: "https://script.google.com/macros/s/AKfycbxWrmERca_Mh5OsURUx7Y8MpmvjOGa9ZmOJN4TDEscpEd_rYUWcKEUpkq6tiQGJ9_YfCQ/exec",
    CAPACITY_PER_SLOT: 30
};

// State
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
    bookings: [],
    loading: false
};

// Initialize Lucide Icons
lucide.createIcons();

// Elements
const elements = {
    bookingForm: document.getElementById('bookingForm'),
    guestSelector: document.getElementById('guestSelector'),
    tuesdaySelector: document.getElementById('tuesdaySelector'), // Custom selector
    sessionDate: document.getElementById('sessionDate'), // Hidden input
    dateError: document.getElementById('dateError'),
    slotBtns: document.querySelectorAll('.slot-btn'),
    screens: document.querySelectorAll('.screen'),
    submitBtn: document.getElementById('submitBtn')
};

// Initialize Date Picker (Custom Tuesday Buttons)
function initDatePicker() {
    const selector = elements.tuesdaySelector;
    selector.innerHTML = '';
    
    // Generate next 4 Tuesdays
    let date = new Date();
    // Go to next Tuesday
    date.setDate(date.getDate() + (7 - date.getDay() + 2) % 7);
    if (new Date().getDay() === 2 && new Date().getHours() >= 20) {
        // If it's Tuesday after 8pm, start from next week
        date.setDate(date.getDate() + 7);
    }

    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

    for (let i = 0; i < 4; i++) {
        const d = new Date(date);
        const dateStr = d.toISOString().split('T')[0];
        
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'selector-btn';
        btn.innerHTML = `
            <span class="date-day">${d.getDate()}</span>
            <span class="date-month">${months[d.getMonth()]}</span>
        `;
        
        btn.onclick = () => {
            appState.selectedDate = dateStr;
            elements.sessionDate.value = dateStr;
            
            // UI Toggle
            selector.querySelectorAll('.selector-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            elements.dateError.style.display = 'none';
            
            refreshData();
        };
        
        selector.appendChild(btn);
        date.setDate(date.getDate() + 7); // Next Tuesday
    }
}
initDatePicker();

// Generate 15 Guest Buttons
function initGuestSelector() {
    elements.guestSelector.innerHTML = '';
    for (let i = 1; i <= 15; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.val = i;
        btn.textContent = i;
        btn.classList.toggle('active', i === appState.numGuests);
        btn.onclick = (e) => {
            appState.numGuests = parseInt(e.currentTarget.dataset.val);
            updateGuestUI();
            updateSlotsUI();
        };
        elements.guestSelector.appendChild(btn);
    }
}
initGuestSelector();

// Event Listeners
elements.bookingForm.addEventListener('submit', handleFormSubmit);

elements.slotBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        const time = e.currentTarget.dataset.time;
        if (e.currentTarget.classList.contains('disabled')) return;
        appState.selectedTime = time;
        updateSlotsUI();
    });
});

// UI Functions
function updateGuestUI() {
    const btns = elements.guestSelector.querySelectorAll('button');
    btns.forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.val) === appState.numGuests);
    });
    document.getElementById('numGuests').value = appState.numGuests;
}

function updateSlotsUI() {
    elements.slotBtns.forEach(btn => {
        const time = btn.dataset.time;
        const slot = appState.slots.find(s => s.time === time);
        const remaining = slot ? (slot.capacity - slot.booked) : 30;
        
        const availText = btn.querySelector('.availability');
        
        if (remaining <= 0) {
            btn.classList.add('disabled');
            btn.classList.remove('active', 'urgent');
            availText.textContent = "SOLD OUT";
        } else {
            btn.classList.remove('disabled');
            availText.textContent = `${remaining} SEATS LEFT`;
            
            if (remaining <= 10) {
                btn.classList.add('urgent');
            } else {
                btn.classList.remove('urgent');
            }
            
            // Check group size
            if (remaining < appState.numGuests) {
                btn.classList.add('disabled');
                availText.textContent = `NEED ${appState.numGuests} SEATS`;
            }
        }
        
        btn.classList.toggle('active', appState.selectedTime === time);
    });
    document.getElementById('selectedTime').value = appState.selectedTime;
}

function showScreen(screenId) {
    elements.screens.forEach(s => {
        if (s.id === screenId) {
            s.style.display = 'block';
            setTimeout(() => s.classList.add('active'), 10);
        } else {
            s.classList.remove('active');
            setTimeout(() => s.style.display = 'none', 500);
        }
    });

}

function resetForm() {
    elements.bookingForm.reset();
    appState.selectedTime = null;
    appState.numGuests = 1;
    document.getElementById('specialRequests').value = '';
    updateGuestUI();
    updateSlotsUI();
    showScreen('bookingPage');
}

// Data Handling
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

    if (CONFIG.API_URL.includes("YOUR_DEPLOYMENT_ID")) {
        alert("Please set your Google Apps Script Web App URL in app.js first. Instructions are in GOOGLE_SHEETS_SETUP.md.");
        return;
    }

    const formData = {
        name: document.getElementById('custName').value,
        phone: document.getElementById('custPhone').value,
        guests: appState.numGuests,
        time: appState.selectedTime,
        date: appState.selectedDate,
        requests: document.getElementById('specialRequests').value || ''
    };

    try {
        setLoading(true);
        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            mode: 'no-cors', // Apps Script requires no-cors for simple posts or complex CORS handling
            body: JSON.stringify(formData),
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // 'no-cors' means we won't see the response body, but we assume success if no error is thrown
        showScreen('successPage');
        refreshData(); // background refresh
    } catch (err) {
        console.error("Booking failed:", err);
        alert("Something went wrong. Please check your connection to the flames.");
    } finally {
        setLoading(false);
    }
}

async function refreshData() {
    if (CONFIG.API_URL.includes("YOUR_DEPLOYMENT_ID")) return;
    
    // Add date filter to the fetch
    const url = new URL(CONFIG.API_URL);
    if (appState.selectedDate) {
        url.searchParams.set('date', appState.selectedDate);
    }

    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.availability) {
            // Update app slots state
            data.availability.forEach(slot => {
                const match = appState.slots.find(s => s.time === slot.time);
                if (match) match.booked = slot.totalBooked;
            });
            updateSlotsUI();
        }

    } catch (err) {
        console.error("Error refreshing data:", err);
    }
}


function setLoading(isLoading) {
    appState.loading = isLoading;
    elements.submitBtn.disabled = isLoading;
    if (isLoading) {
        elements.submitBtn.querySelector('.btn-text').style.opacity = '0';
        elements.submitBtn.querySelector('.btn-loader').style.display = 'block';
    } else {
        elements.submitBtn.querySelector('.btn-text').style.opacity = '1';
        elements.submitBtn.querySelector('.btn-loader').style.display = 'none';
    }
}

function copyShareLink() {
    const url = window.location.href.split('?')[0];
    navigator.clipboard.writeText(url).then(() => {
        alert("Shareable booking link copied to clipboard!");
    });
}

// Initial Call
refreshData();
updateSlotsUI();

// Intro Animation
gsap.from(".logo-text", { y: -50, opacity: 0, duration: 1.5, ease: "power4.out" });
gsap.from(".container", { y: 100, opacity: 0, duration: 1.2, delay: 0.5, ease: "power3.out" });
