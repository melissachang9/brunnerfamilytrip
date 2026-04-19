const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'familytrip.db'));

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initialize() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      passport_name TEXT,
      passport_number TEXT,
      passport_expiry TEXT,
      date_of_birth TEXT,
      nationality TEXT,
      dietary_needs TEXT,
      medical_notes TEXT,
      emergency_contact TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS destination_proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      destination TEXT NOT NULL,
      description TEXT,
      proposed_by TEXT,
      image_url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS destination_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposal_id INTEGER NOT NULL,
      member_name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (proposal_id) REFERENCES destination_proposals(id) ON DELETE CASCADE,
      UNIQUE(proposal_id, member_name)
    );

    CREATE TABLE IF NOT EXISTS date_proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date_range TEXT NOT NULL,
      description TEXT,
      proposed_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS date_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposal_id INTEGER NOT NULL,
      member_name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (proposal_id) REFERENCES date_proposals(id) ON DELETE CASCADE,
      UNIQUE(proposal_id, member_name)
    );

    CREATE TABLE IF NOT EXISTS accommodations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT,
      address TEXT,
      url TEXT,
      price_info TEXT,
      check_in TEXT,
      check_out TEXT,
      notes TEXT,
      booked INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS flights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER,
      airline TEXT,
      flight_number TEXT,
      departure_city TEXT,
      arrival_city TEXT,
      departure_time TEXT,
      arrival_time TEXT,
      booking_ref TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS itinerary_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      title TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_id INTEGER NOT NULL,
      time TEXT,
      title TEXT NOT NULL,
      description TEXT,
      location TEXT,
      url TEXT,
      cost TEXT,
      notes TEXT,
      max_participants INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (day_id) REFERENCES itinerary_days(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_signups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
      UNIQUE(activity_id, member_id)
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT,
      posted_by TEXT,
      pinned INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      question TEXT NOT NULL,
      description TEXT,
      allow_multiple INTEGER DEFAULT 1,
      allow_custom INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS poll_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS poll_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL,
      option_id INTEGER NOT NULL,
      voter_name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
      FOREIGN KEY (option_id) REFERENCES poll_options(id) ON DELETE CASCADE,
      UNIQUE(option_id, voter_name)
    );
  `);

  // Set default family passcode if not exists
  const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get('passcode');
  if (!existing) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('passcode', 'brunner2026');
  }

  // Set default trip phase
  const phase = db.prepare('SELECT value FROM settings WHERE key = ?').get('phase');
  if (!phase) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('phase', 'voting');
  }
}

module.exports = { db, initialize };
