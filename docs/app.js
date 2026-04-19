// ========== INIT ==========
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null; // { id, name, is_host }

(function init() {
  const saved = localStorage.getItem('brunner_user');
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      showApp();
    } catch (e) {
      localStorage.removeItem('brunner_user');
    }
  }
})();

// ========== AUTH ==========
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('login-name').value.trim();
  const password = document.getElementById('login-password').value;
  if (!name) return;

  const isHost = password === HOST_PASSWORD;
  if (password && !isHost) {
    const el = document.getElementById('login-error');
    el.textContent = 'Wrong host password';
    el.classList.remove('hidden');
    return;
  }

  // Find or create member
  let { data: existing } = await sb.from('members').select('*').eq('name', name).limit(1).single();
  if (existing) {
    currentUser = { id: existing.id, name: existing.name, is_host: existing.is_host || isHost };
    if (isHost && !existing.is_host) {
      await sb.from('members').update({ is_host: true }).eq('id', existing.id);
    }
  } else {
    const { data: newMember } = await sb.from('members').insert({ name, is_host: isHost }).select().single();
    currentUser = { id: newMember.id, name: newMember.name, is_host: isHost };
  }

  localStorage.setItem('brunner_user', JSON.stringify(currentUser));
  showApp();
});

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('brunner_user');
  location.reload();
});

function showApp() {
  document.getElementById('login-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('active');
  document.getElementById('user-display').textContent = currentUser.name + (currentUser.is_host ? ' (Host)' : '');

  // Show host-only elements
  if (currentUser.is_host) {
    document.querySelectorAll('.host-only').forEach(el => el.classList.remove('hidden'));
  }

  loadAll();
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

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModals(); });

// ========== LOAD ALL ==========
async function loadAll() {
  await Promise.all([
    loadConfig(),
    loadSuggestions(),
    loadAnnouncements(),
    loadAccommodation(),
    loadFlights(),
    loadItinerary(),
    loadMembers(),
    loadPolls(),
  ]);
  loadDashboardStats();
}

// ========== CONFIG ==========
let tripConfig = {};
async function loadConfig() {
  const { data } = await sb.from('trip_config').select('*').limit(1).single();
  if (!data) return;
  tripConfig = data;
  document.getElementById('setting-phase').value = data.phase || 'voting';
  document.getElementById('setting-destination').value = data.selected_destination || '';
  document.getElementById('setting-time').value = data.selected_time || '';
}

async function saveSettings() {
  await sb.from('trip_config').update({
    phase: document.getElementById('setting-phase').value,
    selected_destination: document.getElementById('setting-destination').value,
    selected_time: document.getElementById('setting-time').value,
  }).eq('id', tripConfig.id);
  await loadConfig();
  loadDashboardStats();
}

// ========== DASHBOARD ==========
async function loadDashboardStats() {
  const statusEl = document.getElementById('trip-status-info');
  const phase = tripConfig.phase || 'voting';
  const phaseLabels = { voting: 'Voting', planning: 'Planning' };
  const phaseColors = { voting: '#f59e0b', planning: '#10b981' };

  let html = `<div class="stat-item"><span>Phase</span><span class="stat-value" style="color:${phaseColors[phase]}">${phaseLabels[phase]}</span></div>`;
  if (tripConfig.selected_destination) html += `<div class="stat-item"><span>Destination</span><span class="stat-value">${esc(tripConfig.selected_destination)}</span></div>`;
  if (tripConfig.selected_time) html += `<div class="stat-item"><span>When</span><span class="stat-value">${esc(tripConfig.selected_time)}</span></div>`;
  statusEl.innerHTML = html;

  const statsEl = document.getElementById('quick-stats');
  const { data: allMembers } = await sb.from('members').select('party_size');
  const memberCount = allMembers?.length || 0;
  const totalTravelers = (allMembers || []).reduce((sum, m) => sum + (m.party_size || 1), 0);
  statsEl.innerHTML = `
    <div class="stat-item"><span>Family Members</span><span class="stat-value">${memberCount}</span></div>
    <div class="stat-item"><span>Total Travelers</span><span class="stat-value">${totalTravelers}</span></div>
  `;
}

// ========== ANNOUNCEMENTS ==========
async function loadAnnouncements() {
  const { data: list } = await sb.from('announcements').select('*').order('created_at', { ascending: false });
  const el = document.getElementById('announcements-list');
  if (!list || list.length === 0) {
    el.innerHTML = '<div class="empty-state"><p>No announcements yet</p></div>';
    return;
  }
  el.innerHTML = list.map(a => `
    <div class="announcement-item">
      <p>${esc(a.body)}</p>
      <div class="announcement-meta">
        <span>— ${esc(a.author_name)}</span>
        <span>${fmtDate(a.created_at)}</span>
        ${currentUser.is_host ? `<button class="btn-danger" onclick="deleteAnnouncement('${a.id}')">Delete</button>` : ''}
      </div>
    </div>
  `).join('');
}

async function submitAnnouncement(e) {
  e.preventDefault();
  await sb.from('announcements').insert({
    body: document.getElementById('ann-body').value,
    author_name: currentUser.name,
  });
  closeModals();
  e.target.reset();
  await loadAnnouncements();
}

async function deleteAnnouncement(id) {
  if (!confirm('Delete this announcement?')) return;
  await sb.from('announcements').delete().eq('id', id);
  await loadAnnouncements();
}

// ========== VOTING RESULTS ==========
async function loadSuggestions() {
  const { data: suggestions } = await sb
    .from('suggestions')
    .select('*, votes(id, member_id, members(name))')
    .order('created_at', { ascending: false });

  const el = document.getElementById('vote-summary');

  if (!suggestions || suggestions.length === 0) {
    el.innerHTML = '<div class="empty-state"><p>No votes yet</p></div>';
    return;
  }

  // Sort by vote count descending
  const sorted = suggestions.slice().sort((a, b) => (b.votes?.length || 0) - (a.votes?.length || 0));
  const maxVotes = Math.max(...sorted.map(s => s.votes?.length || 0), 1);

  el.innerHTML = sorted.map((s, idx) => {
    const count = s.votes?.length || 0;
    const pct = Math.round((count / maxVotes) * 100);
    const medal = idx === 0 && count > 0 ? '🥇 ' : idx === 1 && count > 0 ? '🥈 ' : idx === 2 && count > 0 ? '🥉 ' : '';
    const voters = (s.votes || []).map(v => v.members?.name || 'Unknown');
    return `
      <div class="poll-result-item">
        <div class="poll-result-header">
          <span class="poll-result-name">${medal}${esc(s.destination)} — ${esc(s.time_of_year)}</span>
          <span class="poll-result-count">${count} vote${count !== 1 ? 's' : ''}</span>
        </div>
        <div class="poll-bar-bg"><div class="poll-bar" style="width:${pct}%"></div></div>
        ${voters.length ? `<div class="poll-voters">${voters.map(v => esc(v)).join(', ')}</div>` : ''}
      </div>`;
  }).join('');
}

// ========== ACCOMMODATION ==========
let accData = null;
async function loadAccommodation() {
  const { data } = await sb.from('accommodation').select('*').limit(1).single();
  accData = data;
  if (data) {
    document.getElementById('acc-details').textContent = data.details || '';
    document.getElementById('acc-links').textContent = data.links || '';
    document.getElementById('acc-notes').textContent = data.notes || '';
  }
}

function editInfo(type) {
  if (type === 'accommodation') {
    document.getElementById('edit-acc-details').value = accData?.details || '';
    document.getElementById('edit-acc-links').value = accData?.links || '';
    document.getElementById('edit-acc-notes').value = accData?.notes || '';
    showModal('accommodation-edit-modal');
  } else if (type === 'flights') {
    document.getElementById('edit-flight-details').value = flightData?.details || '';
    document.getElementById('edit-flight-notes').value = flightData?.notes || '';
    showModal('flights-edit-modal');
  }
}

async function saveAccommodation(e) {
  e.preventDefault();
  await sb.from('accommodation').update({
    details: document.getElementById('edit-acc-details').value,
    links: document.getElementById('edit-acc-links').value,
    notes: document.getElementById('edit-acc-notes').value,
  }).eq('id', accData.id);
  closeModals();
  await loadAccommodation();
}

// ========== FLIGHTS ==========
let flightData = null;
async function loadFlights() {
  const { data } = await sb.from('flight_info').select('*').limit(1).single();
  flightData = data;
  if (data) {
    document.getElementById('flight-details').textContent = data.details || '';
    document.getElementById('flight-notes').textContent = data.notes || '';
  }
}

async function saveFlights(e) {
  e.preventDefault();
  await sb.from('flight_info').update({
    details: document.getElementById('edit-flight-details').value,
    notes: document.getElementById('edit-flight-notes').value,
  }).eq('id', flightData.id);
  closeModals();
  await loadFlights();
}

// ========== ITINERARY ==========
async function loadItinerary() {
  const { data: days } = await sb
    .from('itinerary_days')
    .select('*, activities(*)')
    .order('day_number');

  const el = document.getElementById('itinerary-list');
  if (!days || days.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>No itinerary days yet</p></div>';
    return;
  }

  el.innerHTML = days.map(day => {
    const acts = (day.activities || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    return `
      <div class="day-card">
        <div class="day-header">
          <div>
            <h3>Day ${day.day_number}${day.title ? ': ' + esc(day.title) : ''}</h3>
            ${day.date ? `<div class="day-date">${fmtDateOnly(day.date)}</div>` : ''}
          </div>
          <div class="day-actions">
            ${currentUser.is_host ? `
              <button onclick="openActivityModal('${day.id}')">+ Activity</button>
              <button onclick="deleteDay('${day.id}')">Delete Day</button>
            ` : ''}
          </div>
        </div>
        ${acts.length === 0 ? '<div style="padding:1.5rem;color:var(--text-light);text-align:center">No activities yet</div>' :
          acts.map(act => `
            <div class="activity-item">
              <div class="activity-time">${esc(act.time || '')}</div>
              <div class="activity-info">
                <h4>${esc(act.title)}</h4>
                ${act.description ? `<p>${esc(act.description)}</p>` : ''}
                <div class="activity-meta">
                  ${act.location ? `<span>📍 ${esc(act.location)}</span>` : ''}
                  ${currentUser.is_host ? `<button class="btn-danger" onclick="deleteActivity('${act.id}')">Delete</button>` : ''}
                </div>
              </div>
            </div>
          `).join('')
        }
      </div>
    `;
  }).join('');
}

async function submitDay(e) {
  e.preventDefault();
  await sb.from('itinerary_days').insert({
    day_number: parseInt(document.getElementById('day-number').value),
    date: document.getElementById('day-date').value || null,
    title: document.getElementById('day-title').value,
  });
  closeModals();
  e.target.reset();
  await loadItinerary();
}

function openActivityModal(dayId) {
  document.getElementById('activity-day-id').value = dayId;
  showModal('activity-modal');
}

async function submitActivity(e) {
  e.preventDefault();
  await sb.from('activities').insert({
    day_id: document.getElementById('activity-day-id').value,
    time: document.getElementById('activity-time').value,
    title: document.getElementById('activity-title').value,
    description: document.getElementById('activity-desc').value,
    location: document.getElementById('activity-location').value,
  });
  closeModals();
  e.target.reset();
  await loadItinerary();
}

async function deleteDay(id) {
  if (!confirm('Delete this day and all its activities?')) return;
  await sb.from('itinerary_days').delete().eq('id', id);
  await loadItinerary();
}

async function deleteActivity(id) {
  if (!confirm('Delete this activity?')) return;
  await sb.from('activities').delete().eq('id', id);
  await loadItinerary();
}

// ========== MEMBERS ==========
async function loadMembers() {
  const { data: members } = await sb.from('members').select('*, traveler_profiles(*)').order('created_at');
  const el = document.getElementById('members-list');
  if (!members || members.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">👨‍👩‍👧‍👦</div><p>No members yet</p></div>';
    return;
  }

  el.innerHTML = members.map(m => {
    const p = m.traveler_profiles?.[0] || {};
    const canEdit = m.id === currentUser.id || currentUser.is_host;
    return `
      <div class="member-card">
        <h4>
          ${esc(m.name)} ${m.is_host ? '👑' : ''}
          ${m.party_size ? `<span style="font-weight:400;font-size:0.85rem;color:var(--text-light)">(${m.party_size} traveler${m.party_size !== 1 ? 's' : ''})</span>` : ''}
          ${canEdit ? `<button class="btn-sm btn-secondary" onclick="editProfile('${m.id}')">Edit Profile</button>` : ''}
        </h4>
        ${p.email ? `<div class="member-detail"><strong>Email:</strong> ${esc(p.email)}</div>` : ''}
        ${p.phone ? `<div class="member-detail"><strong>Phone:</strong> ${esc(p.phone)}</div>` : ''}
        ${p.nationality ? `<div class="member-detail"><strong>Nationality:</strong> ${esc(p.nationality)}</div>` : ''}
        ${p.dietary_needs ? `<div class="member-detail"><strong>Dietary:</strong> ${esc(p.dietary_needs)}</div>` : ''}
        ${p.completed ? '<div style="margin-top:0.5rem;color:var(--success);font-size:0.85rem">✓ Profile complete</div>' : ''}
      </div>
    `;
  }).join('');
}

async function editProfile(memberId) {
  const { data: profile } = await sb.from('traveler_profiles').select('*').eq('member_id', memberId).limit(1).single();
  const p = profile || {};
  document.getElementById('profile-member-id').value = memberId;
  document.getElementById('profile-fullname').value = p.full_name || '';
  document.getElementById('profile-email').value = p.email || '';
  document.getElementById('profile-phone').value = p.phone || '';
  document.getElementById('profile-dob').value = p.date_of_birth || '';
  document.getElementById('profile-passport').value = p.passport_number || '';
  document.getElementById('profile-passport-exp').value = p.passport_expiry || '';
  document.getElementById('profile-nationality').value = p.nationality || '';
  document.getElementById('profile-dietary').value = p.dietary_needs || '';
  document.getElementById('profile-allergies').value = p.allergies || '';
  document.getElementById('profile-medical').value = p.medical_notes || '';
  document.getElementById('profile-emergency').value = p.emergency_contact || '';
  document.getElementById('profile-emergency-phone').value = p.emergency_phone || '';
  document.getElementById('profile-flight-prefs').value = p.flight_prefs || '';
  document.getElementById('profile-room-prefs').value = p.room_prefs || '';
  document.getElementById('profile-notes').value = p.notes || '';
  showModal('profile-modal');
}

async function saveProfile(e) {
  e.preventDefault();
  const memberId = document.getElementById('profile-member-id').value;
  const profileData = {
    member_id: memberId,
    full_name: document.getElementById('profile-fullname').value,
    email: document.getElementById('profile-email').value,
    phone: document.getElementById('profile-phone').value,
    date_of_birth: document.getElementById('profile-dob').value || null,
    passport_number: document.getElementById('profile-passport').value,
    passport_expiry: document.getElementById('profile-passport-exp').value || null,
    nationality: document.getElementById('profile-nationality').value,
    dietary_needs: document.getElementById('profile-dietary').value,
    allergies: document.getElementById('profile-allergies').value,
    medical_notes: document.getElementById('profile-medical').value,
    emergency_contact: document.getElementById('profile-emergency').value,
    emergency_phone: document.getElementById('profile-emergency-phone').value,
    flight_prefs: document.getElementById('profile-flight-prefs').value,
    room_prefs: document.getElementById('profile-room-prefs').value,
    notes: document.getElementById('profile-notes').value,
    completed: true,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await sb.from('traveler_profiles').select('id').eq('member_id', memberId).limit(1).single();
  if (existing) {
    await sb.from('traveler_profiles').update(profileData).eq('id', existing.id);
  } else {
    await sb.from('traveler_profiles').insert(profileData);
  }
  closeModals();
  await loadMembers();
}

// ========== POLLS ==========
async function loadPolls() {
  const { data: polls } = await sb.from('polls').select('*, poll_options(*, poll_votes(*))').order('created_at', { ascending: false });
  const el = document.getElementById('polls-list');
  if (!polls || polls.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>No custom polls yet</p></div>';
    return;
  }

  el.innerHTML = polls.map(p => {
    const options = (p.poll_options || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const allVoters = new Set();
    options.forEach(o => (o.poll_votes || []).forEach(v => allVoters.add(v.voter_name)));
    const totalVoters = allVoters.size;

    // Sort options by vote count for display
    const sorted = [...options].sort((a, b) => (b.poll_votes?.length || 0) - (a.poll_votes?.length || 0));
    const maxVotes = Math.max(...sorted.map(o => o.poll_votes?.length || 0), 1);

    const baseUrl = location.origin + location.pathname.replace('index.html', '').replace(/\/$/, '');
    const url = baseUrl + '/poll.html?s=' + encodeURIComponent(p.slug);

    return `
      <div class="card" style="margin-bottom:1.25rem">
        <div class="card-header">
          <h3>${p.active ? '🟢' : '🔴'} ${esc(p.question)}</h3>
          <div style="display:flex;gap:0.5rem;align-items:center">
            <span style="color:var(--text-light);font-size:0.85rem">${totalVoters} response${totalVoters !== 1 ? 's' : ''}</span>
            ${currentUser.is_host ? `
              <button class="btn-sm btn-secondary" onclick="togglePoll('${p.id}', ${p.active})">${p.active ? 'Close' : 'Reopen'}</button>
              <button class="btn-danger" onclick="deletePoll('${p.id}')">Delete</button>
            ` : ''}
          </div>
        </div>
        <div style="padding:0 1.5rem 0.75rem">
          <div style="display:flex;align-items:center;gap:0.5rem;margin:0.75rem 0">
            <input type="text" value="${attr(url)}" readonly style="flex:1;padding:0.4rem 0.6rem;border:1px solid var(--border);border-radius:6px;font-size:0.85rem;background:#f8fafc" id="poll-url-${p.id}">
            <button class="btn-sm btn-primary" onclick="copyPollLink('${p.id}')">Copy Link</button>
          </div>
          ${sorted.map((o, idx) => {
            const count = o.poll_votes?.length || 0;
            const pct = Math.round((count / maxVotes) * 100);
            const voters = (o.poll_votes || []).map(v => v.voter_name);
            const medal = idx === 0 && count > 0 ? '🥇 ' : idx === 1 && count > 0 ? '🥈 ' : idx === 2 && count > 0 ? '🥉 ' : '';
            return `
              <div class="poll-result-item">
                <div class="poll-result-header">
                  <span class="poll-result-name">${medal}${esc(o.label)}</span>
                  <span class="poll-result-count">${count} vote${count !== 1 ? 's' : ''}</span>
                </div>
                <div class="poll-bar-bg"><div class="poll-bar" style="width:${pct}%"></div></div>
                ${voters.length ? `<div class="poll-voters">${voters.map(v => esc(v)).join(', ')}</div>` : ''}
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
    .map(i => i.value.trim()).filter(v => v);
  if (options.length < 2) { alert('Add at least 2 options'); return; }

  const slug = Math.random().toString(36).substring(2, 8);
  const { data: poll } = await sb.from('polls').insert({
    slug,
    question: document.getElementById('poll-question').value,
    description: document.getElementById('poll-desc').value,
    allow_multiple: document.getElementById('poll-allow-multiple').checked,
    allow_custom: document.getElementById('poll-allow-custom').checked,
  }).select().single();

  await sb.from('poll_options').insert(
    options.map((label, i) => ({ poll_id: poll.id, label, sort_order: i }))
  );

  closeModals();
  e.target.reset();
  document.getElementById('poll-options-inputs').innerHTML = `
    <input type="text" class="poll-option-input" placeholder="Option 1" required>
    <input type="text" class="poll-option-input" placeholder="Option 2" required>
  `;
  await loadPolls();
}

async function togglePoll(id, currentlyActive) {
  await sb.from('polls').update({ active: !currentlyActive }).eq('id', id);
  await loadPolls();
}

async function deletePoll(id) {
  if (!confirm('Delete this poll and all its votes?')) return;
  await sb.from('polls').delete().eq('id', id);
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
function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}

function attr(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateOnly(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
