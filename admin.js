/* Admin Portal Logic (V2 - Full CRUD) */
const CONFIG = {
    // THIS MUST MATCH THE URL IN app.js
    API_URL: "https://script.google.com/macros/s/AKfycbxWrmERca_Mh5OsURUx7Y8MpmvjOGa9ZmOJN4TDEscpEd_rYUWcKEUpkq6tiQGJ9_YfCQ/exec"
};

let adminState = {
    selectedDate: null,
    bookings: [],
    slots: [
        { time: '5:30', booked: 0, capacity: 30 },
        { time: '6:00', booked: 0, capacity: 30 },
        { time: '6:30', booked: 0, capacity: 30 }
    ]
};

// Initialize
lucide.createIcons();

function initAdminDates() {
    const selector = document.getElementById('tuesdaySelector');
    selector.innerHTML = '';
    
    let date = new Date();
    date.setDate(date.getDate() + (7 - date.getDay() + 2) % 7);
    if (new Date().getDay() === 2 && new Date().getHours() >= 20) {
        date.setDate(date.getDate() + 7);
    }

    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

    for (let i = 0; i < 4; i++) {
        const d = new Date(date);
        const dateStr = d.toISOString().split('T')[0];
        
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'selector-btn';
        if (i === 0) {
            btn.classList.add('active');
            adminState.selectedDate = dateStr;
        }

        btn.innerHTML = `
            <span class="date-day">${d.getDate()}</span>
            <span class="date-month">${months[d.getMonth()]}</span>
        `;
        
        btn.onclick = () => {
            adminState.selectedDate = dateStr;
            selector.querySelectorAll('.selector-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            refreshData();
        };
        
        selector.appendChild(btn);
        date.setDate(date.getDate() + 7);
    }
    refreshData();
}

async function refreshData() {
    if (!CONFIG.API_URL || !adminState.selectedDate) return;
    
    const loading = document.getElementById('loadingIndicator');
    if (loading) loading.style.display = 'block';

    const url = new URL(CONFIG.API_URL);
    url.searchParams.set('date', adminState.selectedDate);

    try {
        const response = await fetch(url);
        const data = await response.json();
        
        // Reset slot counts
        adminState.slots.forEach(s => s.booked = 0);

        if (data.availability) {
            data.availability.forEach(slot => {
                const match = adminState.slots.find(s => s.time === slot.time);
                if (match) match.booked = slot.totalBooked;
            });
        }

        if (data.bookings) {
            adminState.bookings = data.bookings;
        }
        
        renderAdmin();
    } catch (err) {
        console.error("Error fetching data:", err);
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

function renderAdmin() {
    const statsContainer = document.getElementById('adminStats');
    const tableBody = document.querySelector('#bookingsTable tbody');

    // Render Stats
    statsContainer.innerHTML = adminState.slots.map(slot => `
        <div class="stat-card">
            <div class="stat-val">${slot.booked} <span style="font-size:0.4em; opacity:0.4">/ ${slot.capacity}</span></div>
            <div class="stat-label">${slot.time} PM</div>
        </div>
    `).join('');

    // Render Table
    if (adminState.bookings.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; opacity:0.5; padding: 4rem;">NO SOULS HAVE BOOKED FOR THIS SESSION YET.</td></tr>';
    } else {
        tableBody.innerHTML = adminState.bookings
            .sort((a,b) => a.time.localeCompare(b.time))
            .map(booking => `
                <tr>
                    <td style="font-family: var(--font-display); font-size: 1.5rem">${booking.time}</td>
                    <td style="font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em">${booking.name}</td>
                    <td style="text-align:center">${booking.guests}</td>
                    <td style="opacity: 0.6">${booking.phone}</td>
                    <td>
                        <div style="display: flex; gap: 0.5rem">
                            <button onclick="openEditModal('${booking.timestamp}')" class="action-btn" style="width: 35px; height: 35px;"><i data-lucide="edit-2" size="14"></i></button>
                            <button onclick="deleteBooking('${booking.timestamp}')" class="action-btn" style="width: 35px; height: 35px; color: var(--hell-red); border-color: rgba(200,6,19,0.3)"><i data-lucide="trash-2" size="14"></i></button>
                        </div>
                    </td>
                </tr>
            `).join('');
        lucide.createIcons(); // Refresh icons for new rows
    }
}

// DELETE FUNCTION
async function deleteBooking(timestamp) {
    if (!confirm("ARE YOU SURE YOU WANT TO EXTINGUISH THIS BOOKING?")) return;

    try {
        const res = await fetch(CONFIG.API_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({
                action: 'DELETE',
                timestamp: timestamp
            })
        });
        
        // Wait a bit and refresh
        setTimeout(refreshData, 1000);
        alert("Booking removed.");
    } catch (err) {
        alert("Failed to delete.");
    }
}

// EDIT MODAL FUNCTIONS
function openEditModal(timestamp) {
    const booking = adminState.bookings.find(b => b.timestamp === timestamp);
    if (!booking) return;

    document.getElementById('editTimestamp').value = booking.timestamp;
    document.getElementById('editName').value = booking.name;
    document.getElementById('editPhone').value = booking.phone;
    document.getElementById('editGuests').value = booking.guests;
    document.getElementById('editTime').value = booking.time;

    document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
}

document.getElementById('editForm').onsubmit = async (e) => {
    e.preventDefault();
    
    const payload = {
        action: 'EDIT',
        timestamp: document.getElementById('editTimestamp').value,
        name: document.getElementById('editName').value,
        phone: document.getElementById('editPhone').value,
        guests: parseInt(document.getElementById('editGuests').value),
        time: document.getElementById('editTime').value
    };

    try {
        await fetch(CONFIG.API_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(payload)
        });
        
        closeEditModal();
        setTimeout(refreshData, 1000);
        alert("Booking updated.");
    } catch (err) {
        alert("Failed to update.");
    }
};

function copyShareLink() {
    const url = window.location.origin + window.location.pathname.replace('admin.html', 'index.html');
    navigator.clipboard.writeText(url).then(() => {
        alert("Public booking link copied!");
    });
}

// Start
initAdminDates();
