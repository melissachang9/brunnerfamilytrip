// ========== STATE ==========
let currentUser = null;
let settings = {};

// ========== API HELPERS ==========
async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ========== AUTH ==========
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('login-password').value;
  try {
    await api('/api/login', { method: 'POST', body: { password } });
    currentUser = 'Host';
    showApp();
  } catch (err) {
    const el = document.getElementById('login-error');
    el.textContent = 'Wrong password. Try again!';
    el.classList.remove('hidden');
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  location.reload();
});

// Check existing session
(async () => {
  try {
    const me = await api('/api/me');
    if (me.authenticated) {
      currentUser = me.name;
      showApp();
    }
  } catch (e) { /* not logged in */ }
})();

function showApp() {
  document.getElementById('login-screen').classList.remove('active');
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  document.getElementById('app-screen').classList.add('active');
  document.getElementById('app-screen').style.display = 'block';
  document.getElementById('user-display').textContent = currentUser;
  loadAll();

  // Navigate to hash section if present (e.g. #voting)
  const hash = location.hash.replace('#', '');
  if (hash) navigateTo(hash);
}

// ========== NAVIGATION ==========
function navigateTo(section) {
  const el = document.getElementById('section-' + section);
  if (!el) return;
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const link = document.querySelector(`.nav-link[data-section="${section}"]`);
  if (link) link.classList.add('active');
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  document.querySelector('.nav-links').classList.remove('open');
  location.hash = section;
}

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo(link.dataset.section);
  });
});

document.getElementById('mobile-menu-btn').addEventListener('click', () => {
  document.querySelector('.nav-links').classList.toggle('open');
});

// ========== MODALS ==========
function showModal(id) {
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById(id).classList.remove('hidden');
}

function closeModals() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

// Close on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModals();
});

// ========== LOAD ALL DATA ==========
async function loadAll() {
  await Promise.all([
    loadSettings(),
    loadDestinations(),
    loadDates(),
    loadAnnouncements(),
    loadAccommodations(),
    loadFlights(),
    loadItinerary(),
    loadMembers(),
    loadPollResults(),
    loadPolls(),
  ]);
  loadDashboardStats();
}

// ========== SETTINGS ==========
async function loadSettings() {
  settings = await api('/api/settings');
  document.getElementById('setting-trip_name').value = settings.trip_name || '';
  document.getElementById('setting-phase').value = settings.phase || 'voting';
  document.getElementById('setting-destination').value = settings.destination || '';
  document.getElementById('setting-dates').value = settings.dates || '';
}

async function saveSettings() {
  const keys = ['trip_name', 'phase', 'destination', 'dates'];
  for (const key of keys) {
    const value = document.getElementById('setting-' + key).value;
    await api('/api/settings/' + key, { method: 'PUT', body: { value } });
  }
  await loadSettings();
  loadDashboardStats();
}

// ========== DASHBOARD ==========
function loadDashboardStats() {
  const statusEl = document.getElementById('trip-status-info');
  const phase = settings.phase || 'voting';
  const phaseLabels = { voting: 'Voting', planning: 'Planning', confirmed: 'Confirmed' };
  const phaseColors = { voting: '#f59e0b', planning: '#2563eb', confirmed: '#10b981' };

  let statusHTML = `
    <div class="stat-item"><span>Phase</span><span class="stat-value" style="color:${phaseColors[phase]}">${phaseLabels[phase]}</span></div>
  `;
  if (settings.trip_name) statusHTML += `<div class="stat-item"><span>Trip</span><span class="stat-value">${escapeHTML(settings.trip_name)}</span></div>`;
  if (settings.destination) statusHTML += `<div class="stat-item"><span>Destination</span><span class="stat-value">${escapeHTML(settings.destination)}</span></div>`;
  if (settings.dates) statusHTML += `<div class="stat-item"><span>Dates</span><span class="stat-value">${escapeHTML(settings.dates)}</span></div>`;
  statusEl.innerHTML = statusHTML;

  // Quick stats are populated from cached data
  const statsEl = document.getElementById('quick-stats');
  const memberCount = document.querySelectorAll('.member-card').length;
  const destCount = document.querySelectorAll('#destination-proposals .proposal-item').length;
  const accCount = document.querySelectorAll('.acc-card').length;
  const dayCount = document.querySelectorAll('.day-card').length;

  statsEl.innerHTML = `
    <div class="stat-item"><span>Family Members</span><span class="stat-value">${memberCount}</span></div>
    <div class="stat-item"><span>Destination Options</span><span class="stat-value">${destCount}</span></div>
    <div class="stat-item"><span>Accommodations</span><span class="stat-value">${accCount}</span></div>
    <div class="stat-item"><span>Itinerary Days</span><span class="stat-value">${dayCount}</span></div>
  `;
}

// ========== POLL RESULTS ==========
async function loadPollResults() {
  const [dests, dates] = await Promise.all([
    api('/api/destinations'),
    api('/api/dates'),
  ]);

  const destEl = document.getElementById('dest-results');
  const dateEl = document.getElementById('date-results');

  destEl.innerHTML = renderPollResults(dests, 'destination');
  dateEl.innerHTML = renderPollResults(dates, 'date_range');
}

function renderPollResults(items, nameKey) {
  if (items.length === 0) {
    return '<div class="empty-state"><p>No votes yet</p></div>';
  }

  const maxVotes = Math.max(...items.map(i => i.vote_count), 1);

  return items.map((item, idx) => {
    const pct = Math.round((item.vote_count / maxVotes) * 100);
    const medal = idx === 0 && item.vote_count > 0 ? '🥇 ' : idx === 1 && item.vote_count > 0 ? '🥈 ' : idx === 2 && item.vote_count > 0 ? '🥉 ' : '';
    return `
      <div class="poll-result-item">
        <div class="poll-result-header">
          <span class="poll-result-name">${medal}${escapeHTML(item[nameKey])}</span>
          <span class="poll-result-count">${item.vote_count} vote${item.vote_count !== 1 ? 's' : ''}</span>
        </div>
        <div class="poll-bar-bg"><div class="poll-bar" style="width:${pct}%"></div></div>
        ${item.voters && item.voters.length ? `<div class="poll-voters">${item.voters.map(v => escapeHTML(v)).join(', ')}</div>` : ''}
      </div>
    `;
  }).join('');
}

// ========== ANNOUNCEMENTS ==========
async function loadAnnouncements() {
  const list = await api('/api/announcements');
  const el = document.getElementById('announcements-list');
  if (list.length === 0) {
    el.innerHTML = '<div class="empty-state"><p>No announcements yet</p></div>';
    return;
  }
  el.innerHTML = list.map(a => `
    <div class="announcement-item ${a.pinned ? 'pinned' : ''}">
      <h4>${a.pinned ? '📌 ' : ''}${escapeHTML(a.title)}</h4>
      <p>${escapeHTML(a.content || '')}</p>
      <div class="announcement-meta">
        <span>Posted by ${escapeHTML(a.posted_by || 'Unknown')}</span>
        <span>${formatDate(a.created_at)}</span>
        <button class="btn-danger" onclick="deleteAnnouncement(${a.id})">Delete</button>
      </div>
    </div>
  `).join('');
}

async function submitAnnouncement(e) {
  e.preventDefault();
  await api('/api/announcements', { method: 'POST', body: {
    title: document.getElementById('ann-title').value,
    content: document.getElementById('ann-content').value,
    pinned: document.getElementById('ann-pinned').checked,
  }});
  closeModals();
  e.target.reset();
  await loadAnnouncements();
}

async function deleteAnnouncement(id) {
  if (!confirm('Delete this announcement?')) return;
  await api('/api/announcements/' + id, { method: 'DELETE' });
  await loadAnnouncements();
}

// ========== DESTINATION VOTING ==========
async function loadDestinations() {
  const list = await api('/api/destinations');
  const el = document.getElementById('destination-proposals');
  if (list.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🌍</div><p>No destinations proposed yet. Be the first!</p></div>';
    return;
  }
  el.innerHTML = list.map(d => `
    <div class="proposal-item">
      <div class="proposal-top">
        <div>
          <div class="proposal-name">${escapeHTML(d.destination)}</div>
          <div class="proposal-by">proposed by ${escapeHTML(d.proposed_by || 'Unknown')}</div>
        </div>
        <button class="btn-danger" onclick="deleteDestination(${d.id})">×</button>
      </div>
      ${d.description ? `<div class="proposal-desc">${escapeHTML(d.description)}</div>` : ''}
      <div class="proposal-bottom">
        <button class="btn-vote ${d.user_voted ? 'voted' : ''}" onclick="voteDestination(${d.id})">
          ${d.user_voted ? '✓' : '♡'} ${d.vote_count} vote${d.vote_count !== 1 ? 's' : ''}
        </button>
      </div>
      ${d.voters.length ? `<div class="voters-list">${d.voters.map(v => escapeHTML(v)).join(', ')}</div>` : ''}
    </div>
  `).join('');
}

async function submitDestination(e) {
  e.preventDefault();
  await api('/api/destinations', { method: 'POST', body: {
    destination: document.getElementById('dest-name').value,
    description: document.getElementById('dest-desc').value,
    image_url: document.getElementById('dest-image').value,
  }});
  closeModals();
  e.target.reset();
  await loadDestinations();
  loadDashboardStats();
}

async function voteDestination(id) {
  await api('/api/destinations/' + id + '/vote', { method: 'POST' });
  await loadDestinations();
}

async function deleteDestination(id) {
  if (!confirm('Delete this destination?')) return;
  await api('/api/destinations/' + id, { method: 'DELETE' });
  await loadDestinations();
  loadDashboardStats();
}

// ========== DATE VOTING ==========
async function loadDates() {
  const list = await api('/api/dates');
  const el = document.getElementById('date-proposals');
  if (list.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><p>No dates proposed yet. Suggest one!</p></div>';
    return;
  }
  el.innerHTML = list.map(d => `
    <div class="proposal-item">
      <div class="proposal-top">
        <div>
          <div class="proposal-name">${escapeHTML(d.date_range)}</div>
          <div class="proposal-by">proposed by ${escapeHTML(d.proposed_by || 'Unknown')}</div>
        </div>
        <button class="btn-danger" onclick="deleteDate(${d.id})">×</button>
      </div>
      ${d.description ? `<div class="proposal-desc">${escapeHTML(d.description)}</div>` : ''}
      <div class="proposal-bottom">
        <button class="btn-vote ${d.user_voted ? 'voted' : ''}" onclick="voteDate(${d.id})">
          ${d.user_voted ? '✓' : '♡'} ${d.vote_count} vote${d.vote_count !== 1 ? 's' : ''}
        </button>
      </div>
      ${d.voters.length ? `<div class="voters-list">${d.voters.map(v => escapeHTML(v)).join(', ')}</div>` : ''}
    </div>
  `).join('');
}

async function submitDate(e) {
  e.preventDefault();
  await api('/api/dates', { method: 'POST', body: {
    date_range: document.getElementById('date-range').value,
    description: document.getElementById('date-desc').value,
  }});
  closeModals();
  e.target.reset();
  await loadDates();
}

async function voteDate(id) {
  await api('/api/dates/' + id + '/vote', { method: 'POST' });
  await loadDates();
}

async function deleteDate(id) {
  if (!confirm('Delete this date option?')) return;
  await api('/api/dates/' + id, { method: 'DELETE' });
  await loadDates();
}

// ========== ACCOMMODATION ==========
async function loadAccommodations() {
  const list = await api('/api/accommodations');
  const el = document.getElementById('accommodation-list');
  if (list.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🏠</div><p>No accommodations added yet</p></div>';
    return;
  }
  el.innerHTML = list.map(a => `
    <div class="acc-card">
      <span class="acc-badge ${a.booked ? 'booked' : 'not-booked'}">${a.booked ? '✓ Booked' : 'Not Booked'}</span>
      <h4>${escapeHTML(a.name)}</h4>
      ${a.type ? `<div class="acc-detail"><strong>Type:</strong> ${escapeHTML(a.type)}</div>` : ''}
      ${a.address ? `<div class="acc-detail"><strong>Address:</strong> ${escapeHTML(a.address)}</div>` : ''}
      ${a.price_info ? `<div class="acc-detail"><strong>Price:</strong> ${escapeHTML(a.price_info)}</div>` : ''}
      ${a.check_in ? `<div class="acc-detail"><strong>Check-in:</strong> ${escapeHTML(a.check_in)}</div>` : ''}
      ${a.check_out ? `<div class="acc-detail"><strong>Check-out:</strong> ${escapeHTML(a.check_out)}</div>` : ''}
      ${a.url ? `<div class="acc-detail"><a href="${escapeAttr(a.url)}" target="_blank" rel="noopener noreferrer">View Listing ↗</a></div>` : ''}
      ${a.notes ? `<div class="acc-detail" style="margin-top:0.5rem">${escapeHTML(a.notes)}</div>` : ''}
      <div style="margin-top:0.75rem; display:flex; gap:0.5rem">
        <button class="btn-danger" onclick="deleteAccommodation(${a.id})">Delete</button>
      </div>
    </div>
  `).join('');
}

async function submitAccommodation(e) {
  e.preventDefault();
  await api('/api/accommodations', { method: 'POST', body: {
    name: document.getElementById('acc-name').value,
    type: document.getElementById('acc-type').value,
    address: document.getElementById('acc-address').value,
    url: document.getElementById('acc-url').value,
    price_info: document.getElementById('acc-price').value,
    check_in: document.getElementById('acc-checkin').value,
    check_out: document.getElementById('acc-checkout').value,
    notes: document.getElementById('acc-notes').value,
  }});
  closeModals();
  e.target.reset();
  await loadAccommodations();
  loadDashboardStats();
}

async function deleteAccommodation(id) {
  if (!confirm('Delete this accommodation?')) return;
  await api('/api/accommodations/' + id, { method: 'DELETE' });
  await loadAccommodations();
  loadDashboardStats();
}

// ========== FLIGHTS ==========
async function loadFlights() {
  const list = await api('/api/flights');
  const el = document.getElementById('flights-list');
  if (list.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">✈️</div><p>No flights added yet</p></div>';
    return;
  }
  el.innerHTML = `
    <table class="flights-table">
      <thead>
        <tr>
          <th>Person</th>
          <th>Airline</th>
          <th>Flight</th>
          <th>From</th>
          <th>To</th>
          <th>Departs</th>
          <th>Arrives</th>
          <th>Ref</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${list.map(f => `
          <tr>
            <td>${escapeHTML(f.member_name || '—')}</td>
            <td>${escapeHTML(f.airline || '')}</td>
            <td>${escapeHTML(f.flight_number || '')}</td>
            <td>${escapeHTML(f.departure_city || '')}</td>
            <td>${escapeHTML(f.arrival_city || '')}</td>
            <td>${f.departure_time ? formatDateTime(f.departure_time) : ''}</td>
            <td>${f.arrival_time ? formatDateTime(f.arrival_time) : ''}</td>
            <td>${escapeHTML(f.booking_ref || '')}</td>
            <td><button class="btn-danger" onclick="deleteFlight(${f.id})">×</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function submitFlight(e) {
  e.preventDefault();
  await api('/api/flights', { method: 'POST', body: {
    member_id: document.getElementById('flight-member').value || null,
    airline: document.getElementById('flight-airline').value,
    flight_number: document.getElementById('flight-number').value,
    departure_city: document.getElementById('flight-from').value,
    arrival_city: document.getElementById('flight-to').value,
    departure_time: document.getElementById('flight-depart').value,
    arrival_time: document.getElementById('flight-arrive').value,
    booking_ref: document.getElementById('flight-ref').value,
    notes: document.getElementById('flight-notes').value,
  }});
  closeModals();
  e.target.reset();
  await loadFlights();
}

async function deleteFlight(id) {
  if (!confirm('Delete this flight?')) return;
  await api('/api/flights/' + id, { method: 'DELETE' });
  await loadFlights();
}

// ========== ITINERARY ==========
async function loadItinerary() {
  const days = await api('/api/itinerary');
  const el = document.getElementById('itinerary-list');
  if (days.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>No itinerary days yet. Start planning!</p></div>';
    return;
  }
  el.innerHTML = days.map(day => `
    <div class="day-card">
      <div class="day-header">
        <div>
          <h3>${escapeHTML(day.title || 'Untitled Day')}</h3>
          <div class="day-date">${formatDateOnly(day.date)}</div>
        </div>
        <div class="day-actions">
          <button onclick="openActivityModal(${day.id})">+ Activity</button>
          <button onclick="deleteDay(${day.id})">Delete Day</button>
        </div>
      </div>
      ${day.activities.length === 0 ? '<div style="padding:1.5rem;color:var(--text-light);text-align:center">No activities yet</div>' :
        day.activities.map(act => `
          <div class="activity-item">
            <div class="activity-time">${escapeHTML(act.time || '')}</div>
            <div class="activity-info">
              <h4>${escapeHTML(act.title)}</h4>
              ${act.description ? `<p>${escapeHTML(act.description)}</p>` : ''}
              <div class="activity-meta">
                ${act.location ? `<span>📍 ${escapeHTML(act.location)}</span>` : ''}
                ${act.cost ? `<span>💰 ${escapeHTML(act.cost)}</span>` : ''}
                ${act.max_participants ? `<span>👥 Max ${act.max_participants}</span>` : ''}
                ${act.url ? `<span><a href="${escapeAttr(act.url)}" target="_blank" rel="noopener noreferrer">Link ↗</a></span>` : ''}
              </div>
              <div class="signup-section">
                <div class="signup-tags">
                  ${act.signups.map(s => `<span class="signup-tag">${escapeHTML(s.member_name)}</span>`).join('')}
                </div>
                <div style="margin-top:0.5rem;display:flex;align-items:center;gap:0.5rem">
                  <select id="signup-select-${act.id}" class="signup-member-select"></select>
                  <button class="btn-sm btn-primary" onclick="signupActivity(${act.id})">Sign Up</button>
                  <button class="btn-danger" onclick="deleteActivity(${act.id})">Delete</button>
                </div>
              </div>
            </div>
          </div>
        `).join('')
      }
    </div>
  `).join('');

  // Populate signup dropdowns
  populateSignupDropdowns();
}

async function populateSignupDropdowns() {
  try {
    const members = await api('/api/members');
    document.querySelectorAll('.signup-member-select').forEach(select => {
      select.innerHTML = '<option value="">Select member</option>' +
        members.map(m => `<option value="${m.id}">${escapeHTML(m.name)}</option>`).join('');
    });
  } catch (e) { /* members not loaded yet */ }
}

function openActivityModal(dayId) {
  document.getElementById('activity-day-id').value = dayId;
  showModal('activity-modal');
}

async function submitDay(e) {
  e.preventDefault();
  await api('/api/itinerary/days', { method: 'POST', body: {
    date: document.getElementById('day-date').value,
    title: document.getElementById('day-title').value,
  }});
  closeModals();
  e.target.reset();
  await loadItinerary();
  loadDashboardStats();
}

async function deleteDay(id) {
  if (!confirm('Delete this day and all its activities?')) return;
  await api('/api/itinerary/days/' + id, { method: 'DELETE' });
  await loadItinerary();
  loadDashboardStats();
}

async function submitActivity(e) {
  e.preventDefault();
  await api('/api/itinerary/activities', { method: 'POST', body: {
    day_id: document.getElementById('activity-day-id').value,
    time: document.getElementById('activity-time').value,
    title: document.getElementById('activity-title').value,
    description: document.getElementById('activity-desc').value,
    location: document.getElementById('activity-location').value,
    url: document.getElementById('activity-url').value,
    cost: document.getElementById('activity-cost').value,
    max_participants: document.getElementById('activity-max').value || null,
    notes: document.getElementById('activity-notes').value,
  }});
  closeModals();
  e.target.reset();
  await loadItinerary();
}

async function deleteActivity(id) {
  if (!confirm('Delete this activity?')) return;
  await api('/api/itinerary/activities/' + id, { method: 'DELETE' });
  await loadItinerary();
}

async function signupActivity(activityId) {
  const select = document.getElementById('signup-select-' + activityId);
  const memberId = select.value;
  if (!memberId) return;
  await api('/api/itinerary/activities/' + activityId + '/signup', { method: 'POST', body: { member_id: memberId } });
  await loadItinerary();
}

// ========== MEMBERS ==========
async function loadMembers() {
  const list = await api('/api/members');
  const el = document.getElementById('members-list');

  // Also populate the flight member dropdown
  const flightSelect = document.getElementById('flight-member');
  flightSelect.innerHTML = '<option value="">Select family member</option>' +
    list.map(m => `<option value="${m.id}">${escapeHTML(m.name)}</option>`).join('');

  if (list.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">👨‍👩‍👧‍👦</div><p>No members added yet. Add everyone in the group!</p></div>';
    return;
  }

  el.innerHTML = list.map(m => `
    <div class="member-card">
      <h4>
        ${escapeHTML(m.name)}
        <span>
          <button class="btn-sm btn-secondary" onclick="editMember(${m.id})">Edit</button>
          <button class="btn-danger" onclick="deleteMember(${m.id})">Delete</button>
        </span>
      </h4>
      ${m.email ? `<div class="member-detail"><strong>Email:</strong> ${escapeHTML(m.email)}</div>` : ''}
      ${m.phone ? `<div class="member-detail"><strong>Phone:</strong> ${escapeHTML(m.phone)}</div>` : ''}
      ${m.nationality ? `<div class="member-detail"><strong>Nationality:</strong> ${escapeHTML(m.nationality)}</div>` : ''}
      ${m.date_of_birth ? `<div class="member-detail"><strong>Birthday:</strong> ${escapeHTML(m.date_of_birth)}</div>` : ''}

      ${(m.passport_name || m.passport_number) ? `
        <div class="member-section-title">Travel Documents</div>
        ${m.passport_name ? `<div class="member-detail"><strong>Passport Name:</strong> ${escapeHTML(m.passport_name)}</div>` : ''}
        ${m.passport_number ? `<div class="member-detail"><strong>Passport #:</strong> ${escapeHTML(m.passport_number)}</div>` : ''}
        ${m.passport_expiry ? `<div class="member-detail"><strong>Expires:</strong> ${escapeHTML(m.passport_expiry)}</div>` : ''}
      ` : ''}

      ${(m.dietary_needs || m.medical_notes || m.emergency_contact) ? `
        <div class="member-section-title">Other Info</div>
        ${m.dietary_needs ? `<div class="member-detail"><strong>Dietary:</strong> ${escapeHTML(m.dietary_needs)}</div>` : ''}
        ${m.medical_notes ? `<div class="member-detail"><strong>Medical:</strong> ${escapeHTML(m.medical_notes)}</div>` : ''}
        ${m.emergency_contact ? `<div class="member-detail"><strong>Emergency:</strong> ${escapeHTML(m.emergency_contact)}</div>` : ''}
      ` : ''}

      ${m.notes ? `<div class="member-detail" style="margin-top:0.5rem"><em>${escapeHTML(m.notes)}</em></div>` : ''}
    </div>
  `).join('');
}

async function editMember(id) {
  const members = await api('/api/members');
  const m = members.find(x => x.id === id);
  if (!m) return;

  document.getElementById('member-id').value = m.id;
  document.getElementById('member-name').value = m.name || '';
  document.getElementById('member-email').value = m.email || '';
  document.getElementById('member-phone').value = m.phone || '';
  document.getElementById('member-passport-name').value = m.passport_name || '';
  document.getElementById('member-passport-num').value = m.passport_number || '';
  document.getElementById('member-passport-exp').value = m.passport_expiry || '';
  document.getElementById('member-dob').value = m.date_of_birth || '';
  document.getElementById('member-nationality').value = m.nationality || '';
  document.getElementById('member-dietary').value = m.dietary_needs || '';
  document.getElementById('member-medical').value = m.medical_notes || '';
  document.getElementById('member-emergency').value = m.emergency_contact || '';
  document.getElementById('member-notes').value = m.notes || '';

  showModal('member-modal');
}

async function submitMember(e) {
  e.preventDefault();
  const id = document.getElementById('member-id').value;
  const body = {
    name: document.getElementById('member-name').value,
    email: document.getElementById('member-email').value,
    phone: document.getElementById('member-phone').value,
    passport_name: document.getElementById('member-passport-name').value,
    passport_number: document.getElementById('member-passport-num').value,
    passport_expiry: document.getElementById('member-passport-exp').value,
    date_of_birth: document.getElementById('member-dob').value,
    nationality: document.getElementById('member-nationality').value,
    dietary_needs: document.getElementById('member-dietary').value,
    medical_notes: document.getElementById('member-medical').value,
    emergency_contact: document.getElementById('member-emergency').value,
    notes: document.getElementById('member-notes').value,
  };

  if (id) {
    await api('/api/members/' + id, { method: 'PUT', body });
  } else {
    await api('/api/members', { method: 'POST', body });
  }
  closeModals();
  e.target.reset();
  document.getElementById('member-id').value = '';
  await loadMembers();
  loadDashboardStats();
}

async function deleteMember(id) {
  if (!confirm('Delete this member? Their flight and activity data will be unlinked.')) return;
  await api('/api/members/' + id, { method: 'DELETE' });
  await loadMembers();
  loadDashboardStats();
}

// ========== CUSTOM POLLS ==========
async function loadPolls() {
  const list = await api('/api/polls');
  const el = document.getElementById('polls-list');
  if (list.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>No custom polls yet. Create one to send out!</p></div>';
    return;
  }
  el.innerHTML = list.map(p => {
    const maxVotes = Math.max(...p.options.map(o => o.vote_count), 1);
    const totalVoters = new Set(p.options.flatMap(o => o.voters)).size;
    const url = location.origin + '/poll/' + encodeURIComponent(p.slug);
    return `
      <div class="card" style="margin-bottom:1.25rem">
        <div class="card-header">
          <h3>${p.active ? '🟢' : '🔴'} ${escapeHTML(p.question)}</h3>
          <div style="display:flex;gap:0.5rem;align-items:center">
            <span style="color:var(--text-light);font-size:0.85rem">${totalVoters} response${totalVoters !== 1 ? 's' : ''}</span>
            <button class="btn-sm btn-secondary" onclick="togglePoll(${p.id})">${p.active ? 'Close' : 'Reopen'}</button>
            <button class="btn-danger" onclick="deletePoll(${p.id})">Delete</button>
          </div>
        </div>
        ${p.description ? `<p style="color:var(--text-light);margin:0 0 0.75rem;padding:0 1.5rem">${escapeHTML(p.description)}</p>` : ''}
        <div style="padding:0 1.5rem 0.75rem">
          <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:1rem">
            <input type="text" value="${escapeAttr(url)}" readonly style="flex:1;padding:0.4rem 0.6rem;border:1px solid var(--border);border-radius:6px;font-size:0.85rem;background:#f8fafc" id="poll-url-${p.id}">
            <button class="btn-sm btn-primary" onclick="copyPollLink(${p.id})">Copy Link</button>
          </div>
          ${p.options.map((o, idx) => {
            const pct = Math.round((o.vote_count / maxVotes) * 100);
            const medal = idx === 0 && o.vote_count > 0 ? '🥇 ' : idx === 1 && o.vote_count > 0 ? '🥈 ' : idx === 2 && o.vote_count > 0 ? '🥉 ' : '';
            return `
              <div class="poll-result-item">
                <div class="poll-result-header">
                  <span class="poll-result-name">${medal}${escapeHTML(o.label)}</span>
                  <span class="poll-result-count">${o.vote_count} vote${o.vote_count !== 1 ? 's' : ''}</span>
                </div>
                <div class="poll-bar-bg"><div class="poll-bar" style="width:${pct}%"></div></div>
                ${o.voters.length ? `<div class="poll-voters">${o.voters.map(v => escapeHTML(v)).join(', ')}</div>` : ''}
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }).join('');
}

function addPollOptionInput() {
  const container = document.getElementById('poll-options-inputs');
  const count = container.children.length + 1;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'poll-option-input';
  input.placeholder = 'Option ' + count;
  container.appendChild(input);
}

async function submitPoll(e) {
  e.preventDefault();
  const options = [...document.querySelectorAll('.poll-option-input')]
    .map(i => i.value.trim())
    .filter(v => v);
  if (options.length < 2) { alert('Add at least 2 options'); return; }
  await api('/api/polls', { method: 'POST', body: {
    question: document.getElementById('poll-question').value,
    description: document.getElementById('poll-desc').value,
    allow_multiple: document.getElementById('poll-allow-multiple').checked,
    allow_custom: document.getElementById('poll-allow-custom').checked,
    options,
  }});
  closeModals();
  e.target.reset();
  document.getElementById('poll-options-inputs').innerHTML = `
    <input type="text" class="poll-option-input" placeholder="Option 1" required>
    <input type="text" class="poll-option-input" placeholder="Option 2" required>
  `;
  await loadPolls();
}

async function togglePoll(id) {
  await api('/api/polls/' + id + '/toggle', { method: 'PUT' });
  await loadPolls();
}

async function deletePoll(id) {
  if (!confirm('Delete this poll and all its votes?')) return;
  await api('/api/polls/' + id, { method: 'DELETE' });
  await loadPolls();
}

function copyPollLink(id) {
  const input = document.getElementById('poll-url-' + id);
  input.select();
  navigator.clipboard.writeText(input.value).then(() => {
    const btn = input.nextElementSibling;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy Link', 2000);
  });
}

// ========== HELPERS ==========
function escapeHTML(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'Z');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDateOnly(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
