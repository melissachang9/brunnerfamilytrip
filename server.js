const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
const { db, initialize } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
initialize();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
}));

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  res.status(401).json({ error: 'Not authenticated' });
}

// --- AUTH ROUTES (host only) ---
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  const stored = db.prepare('SELECT value FROM settings WHERE key = ?').get('host_password');
  const hostPw = stored ? stored.value : 'brunner2026';
  if (password === hostPw) {
    req.session.authenticated = true;
    req.session.memberName = 'Host';
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

app.get('/api/me', (req, res) => {
  if (req.session && req.session.authenticated) {
    res.json({ authenticated: true, name: req.session.memberName });
  } else {
    res.json({ authenticated: false });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// --- SETTINGS ---
app.get('/api/settings', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

app.put('/api/settings/:key', requireAuth, (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  const allowedKeys = ['phase', 'trip_name', 'destination', 'dates'];
  if (!allowedKeys.includes(key)) {
    return res.status(400).json({ error: 'Invalid setting key' });
  }
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  res.json({ success: true });
});

// --- DESTINATION PROPOSALS & VOTING ---
app.get('/api/destinations', requireAuth, (req, res) => {
  const proposals = db.prepare(`
    SELECT dp.*, COUNT(dv.id) as vote_count
    FROM destination_proposals dp
    LEFT JOIN destination_votes dv ON dp.id = dv.proposal_id
    GROUP BY dp.id
    ORDER BY vote_count DESC
  `).all();

  const memberName = req.session.memberName;
  proposals.forEach(p => {
    const voted = db.prepare('SELECT id FROM destination_votes WHERE proposal_id = ? AND member_name = ?')
      .get(p.id, memberName);
    p.user_voted = !!voted;
    const voters = db.prepare('SELECT member_name FROM destination_votes WHERE proposal_id = ?').all(p.id);
    p.voters = voters.map(v => v.member_name);
  });

  res.json(proposals);
});

app.post('/api/destinations', requireAuth, (req, res) => {
  const { destination, description, image_url } = req.body;
  if (!destination || !destination.trim()) {
    return res.status(400).json({ error: 'Destination is required' });
  }
  const result = db.prepare('INSERT INTO destination_proposals (destination, description, proposed_by, image_url) VALUES (?, ?, ?, ?)')
    .run(destination.trim(), description || '', req.session.memberName, image_url || '');
  res.json({ id: result.lastInsertRowid });
});

app.delete('/api/destinations/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM destination_proposals WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/api/destinations/:id/vote', requireAuth, (req, res) => {
  try {
    db.prepare('INSERT INTO destination_votes (proposal_id, member_name) VALUES (?, ?)')
      .run(req.params.id, req.session.memberName);
    res.json({ success: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      // Already voted, remove vote (toggle)
      db.prepare('DELETE FROM destination_votes WHERE proposal_id = ? AND member_name = ?')
        .run(req.params.id, req.session.memberName);
      res.json({ success: true, toggled: 'removed' });
    } else {
      res.status(500).json({ error: 'Vote failed' });
    }
  }
});

// --- DATE PROPOSALS & VOTING ---
app.get('/api/dates', requireAuth, (req, res) => {
  const proposals = db.prepare(`
    SELECT dp.*, COUNT(dv.id) as vote_count
    FROM date_proposals dp
    LEFT JOIN date_votes dv ON dp.id = dv.proposal_id
    GROUP BY dp.id
    ORDER BY vote_count DESC
  `).all();

  const memberName = req.session.memberName;
  proposals.forEach(p => {
    const voted = db.prepare('SELECT id FROM date_votes WHERE proposal_id = ? AND member_name = ?')
      .get(p.id, memberName);
    p.user_voted = !!voted;
    const voters = db.prepare('SELECT member_name FROM date_votes WHERE proposal_id = ?').all(p.id);
    p.voters = voters.map(v => v.member_name);
  });

  res.json(proposals);
});

app.post('/api/dates', requireAuth, (req, res) => {
  const { date_range, description } = req.body;
  if (!date_range || !date_range.trim()) {
    return res.status(400).json({ error: 'Date range is required' });
  }
  const result = db.prepare('INSERT INTO date_proposals (date_range, description, proposed_by) VALUES (?, ?, ?)')
    .run(date_range.trim(), description || '', req.session.memberName);
  res.json({ id: result.lastInsertRowid });
});

app.delete('/api/dates/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM date_proposals WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/api/dates/:id/vote', requireAuth, (req, res) => {
  try {
    db.prepare('INSERT INTO date_votes (proposal_id, member_name) VALUES (?, ?)')
      .run(req.params.id, req.session.memberName);
    res.json({ success: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      db.prepare('DELETE FROM date_votes WHERE proposal_id = ? AND member_name = ?')
        .run(req.params.id, req.session.memberName);
      res.json({ success: true, toggled: 'removed' });
    } else {
      res.status(500).json({ error: 'Vote failed' });
    }
  }
});

// --- MEMBERS ---
app.get('/api/members', requireAuth, (req, res) => {
  const members = db.prepare('SELECT * FROM members ORDER BY name').all();
  res.json(members);
});

app.post('/api/members', requireAuth, (req, res) => {
  const { name, email, phone, passport_name, passport_number, passport_expiry,
          date_of_birth, nationality, dietary_needs, medical_notes, emergency_contact, notes } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  const result = db.prepare(`INSERT INTO members (name, email, phone, passport_name, passport_number,
    passport_expiry, date_of_birth, nationality, dietary_needs, medical_notes, emergency_contact, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    name.trim(), email || '', phone || '', passport_name || '', passport_number || '',
    passport_expiry || '', date_of_birth || '', nationality || '', dietary_needs || '',
    medical_notes || '', emergency_contact || '', notes || ''
  );
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/members/:id', requireAuth, (req, res) => {
  const { name, email, phone, passport_name, passport_number, passport_expiry,
          date_of_birth, nationality, dietary_needs, medical_notes, emergency_contact, notes } = req.body;
  db.prepare(`UPDATE members SET name=?, email=?, phone=?, passport_name=?, passport_number=?,
    passport_expiry=?, date_of_birth=?, nationality=?, dietary_needs=?, medical_notes=?, emergency_contact=?, notes=?
    WHERE id=?`).run(
    name, email || '', phone || '', passport_name || '', passport_number || '',
    passport_expiry || '', date_of_birth || '', nationality || '', dietary_needs || '',
    medical_notes || '', emergency_contact || '', notes || '', req.params.id
  );
  res.json({ success: true });
});

app.delete('/api/members/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM members WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// --- ACCOMMODATIONS ---
app.get('/api/accommodations', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM accommodations ORDER BY created_at DESC').all());
});

app.post('/api/accommodations', requireAuth, (req, res) => {
  const { name, type, address, url, price_info, check_in, check_out, notes } = req.body;
  const result = db.prepare(`INSERT INTO accommodations (name, type, address, url, price_info, check_in, check_out, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(name, type || '', address || '', url || '', price_info || '', check_in || '', check_out || '', notes || '');
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/accommodations/:id', requireAuth, (req, res) => {
  const { name, type, address, url, price_info, check_in, check_out, notes, booked } = req.body;
  db.prepare(`UPDATE accommodations SET name=?, type=?, address=?, url=?, price_info=?, check_in=?, check_out=?, notes=?, booked=? WHERE id=?`)
    .run(name, type || '', address || '', url || '', price_info || '', check_in || '', check_out || '', notes || '', booked ? 1 : 0, req.params.id);
  res.json({ success: true });
});

app.delete('/api/accommodations/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM accommodations WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// --- FLIGHTS ---
app.get('/api/flights', requireAuth, (req, res) => {
  const flights = db.prepare(`
    SELECT f.*, m.name as member_name
    FROM flights f
    LEFT JOIN members m ON f.member_id = m.id
    ORDER BY f.departure_time
  `).all();
  res.json(flights);
});

app.post('/api/flights', requireAuth, (req, res) => {
  const { member_id, airline, flight_number, departure_city, arrival_city, departure_time, arrival_time, booking_ref, notes } = req.body;
  const result = db.prepare(`INSERT INTO flights (member_id, airline, flight_number, departure_city, arrival_city, departure_time, arrival_time, booking_ref, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(member_id || null, airline || '', flight_number || '', departure_city || '', arrival_city || '', departure_time || '', arrival_time || '', booking_ref || '', notes || '');
  res.json({ id: result.lastInsertRowid });
});

app.delete('/api/flights/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM flights WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// --- ITINERARY ---
app.get('/api/itinerary', requireAuth, (req, res) => {
  const days = db.prepare('SELECT * FROM itinerary_days ORDER BY date').all();
  days.forEach(day => {
    day.activities = db.prepare('SELECT * FROM activities WHERE day_id = ? ORDER BY time').all(day.id);
    day.activities.forEach(activity => {
      const signups = db.prepare(`
        SELECT s.*, m.name as member_name
        FROM activity_signups s
        JOIN members m ON s.member_id = m.id
        WHERE s.activity_id = ?
      `).all(activity.id);
      activity.signups = signups;
    });
  });
  res.json(days);
});

app.post('/api/itinerary/days', requireAuth, (req, res) => {
  const { date, title } = req.body;
  const result = db.prepare('INSERT INTO itinerary_days (date, title) VALUES (?, ?)').run(date, title || '');
  res.json({ id: result.lastInsertRowid });
});

app.delete('/api/itinerary/days/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM itinerary_days WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/api/itinerary/activities', requireAuth, (req, res) => {
  const { day_id, time, title, description, location, url, cost, notes, max_participants } = req.body;
  const result = db.prepare(`INSERT INTO activities (day_id, time, title, description, location, url, cost, notes, max_participants)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(day_id, time || '', title, description || '', location || '', url || '', cost || '', notes || '', max_participants || null);
  res.json({ id: result.lastInsertRowid });
});

app.delete('/api/itinerary/activities/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM activities WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/api/itinerary/activities/:id/signup', requireAuth, (req, res) => {
  const { member_id } = req.body;
  try {
    db.prepare('INSERT INTO activity_signups (activity_id, member_id) VALUES (?, ?)').run(req.params.id, member_id);
    res.json({ success: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      db.prepare('DELETE FROM activity_signups WHERE activity_id = ? AND member_id = ?').run(req.params.id, member_id);
      res.json({ success: true, toggled: 'removed' });
    } else {
      res.status(500).json({ error: 'Signup failed' });
    }
  }
});

// --- ANNOUNCEMENTS ---
app.get('/api/announcements', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM announcements ORDER BY pinned DESC, created_at DESC').all());
});

app.post('/api/announcements', requireAuth, (req, res) => {
  const { title, content, pinned } = req.body;
  const result = db.prepare('INSERT INTO announcements (title, content, posted_by, pinned) VALUES (?, ?, ?, ?)')
    .run(title, content || '', req.session.memberName, pinned ? 1 : 0);
  res.json({ id: result.lastInsertRowid });
});

app.delete('/api/announcements/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM announcements WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// --- PUBLIC VOTE API (no auth) ---
app.get('/api/public/destinations', (req, res) => {
  const proposals = db.prepare('SELECT id, destination, description FROM destination_proposals ORDER BY id').all();
  res.json(proposals);
});

app.get('/api/public/dates', (req, res) => {
  const proposals = db.prepare('SELECT id, date_range, description FROM date_proposals ORDER BY id').all();
  res.json(proposals);
});

app.post('/api/public/vote', (req, res) => {
  const { name, destination_ids, custom_destination, months } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  const voterName = name.trim();

  // If they suggested a custom destination, create it then vote for it
  if (custom_destination && custom_destination.trim()) {
    const result = db.prepare('INSERT INTO destination_proposals (destination, description, proposed_by) VALUES (?, ?, ?)')
      .run(custom_destination.trim(), '', voterName);
    try {
      db.prepare('INSERT INTO destination_votes (proposal_id, member_name) VALUES (?, ?)').run(result.lastInsertRowid, voterName);
    } catch (e) { /* ignore duplicate */ }
  }

  // Vote for selected destinations
  if (Array.isArray(destination_ids)) {
    for (const id of destination_ids) {
      try {
        db.prepare('INSERT INTO destination_votes (proposal_id, member_name) VALUES (?, ?)').run(id, voterName);
      } catch (e) { /* ignore duplicate */ }
    }
  }

  // For each selected month, find or create date proposal, then vote
  if (Array.isArray(months)) {
    for (const month of months) {
      let proposal = db.prepare('SELECT id FROM date_proposals WHERE date_range = ?').get(month);
      if (!proposal) {
        const result = db.prepare('INSERT INTO date_proposals (date_range, description, proposed_by) VALUES (?, ?, ?)').run(month, '', voterName);
        proposal = { id: result.lastInsertRowid };
      }
      try {
        db.prepare('INSERT INTO date_votes (proposal_id, member_name) VALUES (?, ?)').run(proposal.id, voterName);
      } catch (e) { /* ignore duplicate */ }
    }
  }

  res.json({ success: true });
});

// --- POLLS (host creates, manages) ---
app.get('/api/polls', requireAuth, (req, res) => {
  const polls = db.prepare('SELECT * FROM polls ORDER BY created_at DESC').all();
  polls.forEach(poll => {
    poll.options = db.prepare('SELECT * FROM poll_options WHERE poll_id = ? ORDER BY sort_order').all(poll.id);
    poll.options.forEach(opt => {
      const votes = db.prepare(`
        SELECT voter_name FROM poll_votes WHERE option_id = ?
      `).all(opt.id);
      opt.vote_count = votes.length;
      opt.voters = votes.map(v => v.voter_name);
    });
    poll.total_voters = [...new Set(
      db.prepare('SELECT DISTINCT voter_name FROM poll_votes WHERE poll_id = ?').all(poll.id).map(v => v.voter_name)
    )].length;
  });
  res.json(polls);
});

app.post('/api/polls', requireAuth, (req, res) => {
  const { question, description, options, allow_multiple, allow_custom } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'Question is required' });
  }
  if (!Array.isArray(options) || options.length === 0) {
    return res.status(400).json({ error: 'At least one option is required' });
  }
  // Generate a short slug
  const slug = Math.random().toString(36).substring(2, 8);
  const result = db.prepare('INSERT INTO polls (slug, question, description, allow_multiple, allow_custom) VALUES (?, ?, ?, ?, ?)')
    .run(slug, question.trim(), description || '', allow_multiple ? 1 : 0, allow_custom ? 1 : 0);
  const pollId = result.lastInsertRowid;
  options.forEach((label, i) => {
    if (label && label.trim()) {
      db.prepare('INSERT INTO poll_options (poll_id, label, sort_order) VALUES (?, ?, ?)').run(pollId, label.trim(), i);
    }
  });
  res.json({ id: pollId, slug });
});

app.put('/api/polls/:id/toggle', requireAuth, (req, res) => {
  const poll = db.prepare('SELECT active FROM polls WHERE id = ?').get(req.params.id);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  db.prepare('UPDATE polls SET active = ? WHERE id = ?').run(poll.active ? 0 : 1, req.params.id);
  res.json({ success: true });
});

app.delete('/api/polls/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM polls WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// --- PUBLIC POLL VOTING ---
app.get('/api/public/poll/:slug', (req, res) => {
  const poll = db.prepare('SELECT * FROM polls WHERE slug = ?').get(req.params.slug);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  if (!poll.active) return res.status(403).json({ error: 'This poll is closed' });
  poll.options = db.prepare('SELECT id, label FROM poll_options WHERE poll_id = ? ORDER BY sort_order').all(poll.id);
  res.json(poll);
});

app.post('/api/public/poll/:slug/vote', (req, res) => {
  const poll = db.prepare('SELECT * FROM polls WHERE slug = ?').get(req.params.slug);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  if (!poll.active) return res.status(403).json({ error: 'This poll is closed' });

  const { name, option_ids, custom_option } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  const voterName = name.trim();

  // Add custom option if provided
  if (poll.allow_custom && custom_option && custom_option.trim()) {
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM poll_options WHERE poll_id = ?').get(poll.id);
    const result = db.prepare('INSERT INTO poll_options (poll_id, label, sort_order) VALUES (?, ?, ?)')
      .run(poll.id, custom_option.trim(), (maxOrder.m || 0) + 1);
    try {
      db.prepare('INSERT INTO poll_votes (poll_id, option_id, voter_name) VALUES (?, ?, ?)').run(poll.id, result.lastInsertRowid, voterName);
    } catch (e) { /* ignore duplicate */ }
  }

  // Vote for selected options
  if (Array.isArray(option_ids)) {
    for (const optId of option_ids) {
      try {
        db.prepare('INSERT INTO poll_votes (poll_id, option_id, voter_name) VALUES (?, ?, ?)').run(poll.id, optId, voterName);
      } catch (e) { /* ignore duplicate */ }
    }
  }

  res.json({ success: true });
});

// --- SERVE VOTE PAGE ---
app.get('/vote', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'vote.html'));
});

// --- SERVE POLL PAGE ---
app.get('/poll/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'poll.html'));
});

// --- SPA FALLBACK (dashboard) ---
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Brunner Family Trip planner running at http://localhost:${PORT}`);
  console.log(`Share this voting link: http://localhost:${PORT}/vote`);
});
