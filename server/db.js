const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "yard.db");
const db = new sqlite3.Database(dbPath);

// Create tables if they don't exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS tanks (
      tank_id TEXT PRIMARY KEY,
      size TEXT,
      priority INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS slots (
      slot_id TEXT PRIMARY KEY,
      block TEXT,
      bay INTEGER,
      row INTEGER,
      tier INTEGER,
      status TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS jobs (
      job_id INTEGER PRIMARY KEY AUTOINCREMENT,
      tank_id TEXT,
      pm_id TEXT,
      assigned_slot TEXT,
      status TEXT,
      ts_created INTEGER,
      ts_ack INTEGER,
      ts_placed INTEGER,
      last_sent_ts INTEGER,
      resend_count INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      event_id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      message TEXT,
      ts INTEGER
    )
  `);

  // ✅ prevent same tank being active in multiple jobs
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_active_tank
    ON jobs(tank_id)
    WHERE status IN ('ASSIGNED','ACK')
  `);

  // ✅ prevent same slot being active in multiple jobs
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_active_slot
    ON jobs(assigned_slot)
    WHERE status IN ('ASSIGNED','ACK')
  `);
});

module.exports = db;
