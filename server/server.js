const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./db");
const { allocateSlot } = require("./allocator");
const WebSocket = require("ws");

const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend files
app.use(express.static(path.join(__dirname, "..", "public")));

const PORT = 3000;
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// WebSocket server
const wss = new WebSocket.Server({ server });

// Keep PM connections
const pmSockets = new Map(); // pm_id -> ws

wss.on("connection", (ws, req) => {
  // Expect pm_id from query like ws://ip:3000?pm=PM1
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pmId = url.searchParams.get("pm");

  if (pmId) {
    pmSockets.set(pmId, ws);
    logEvent("PM_CONNECTED", `${pmId} connected`);
  }

  ws.on("close", () => {
    if (pmId) {
      pmSockets.delete(pmId);
      logEvent("PM_DISCONNECTED", `${pmId} disconnected`);
    }
  });

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === "ACK") {
        handleAck(data.job_id, pmId);
      }
    } catch (e) {
      // ignore
    }
  });
});

// ---------- Helpers ----------
function now() {
  return Date.now();
}

function logEvent(type, message) {
  db.run(`INSERT INTO events (type, message, ts) VALUES (?,?,?)`, [
    type,
    message,
    now(),
  ]);
}

function broadcastSupervisorUpdate() {
  // Supervisor pulls via HTTP, so nothing required here.
}

app.get("/", (req, res) => {
  res.redirect("/supervisor.html");
});
// ---------- API: Arrival trigger ----------
app.post("/api/arrival", (req, res) => {
  // This is called by ESP32 OR supervisor button
  logEvent("ARRIVAL", "Tank arrival event triggered");
  res.json({ ok: true, message: "Arrival recorded" });
});

// ---------- API: Scan tank QR ----------
app.post("/api/tank/scan", (req, res) => {
  const { tank_id, pm_id } = req.body;
  if (!tank_id || !pm_id)
    return res
      .status(400)
      .json({ ok: false, error: "tank_id and pm_id required" });

  // check tank exists (planning table)
  db.get(`SELECT * FROM tanks WHERE tank_id=?`, [tank_id], (err, tankRow) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    if (!tankRow) {
      logEvent("SCAN_FAIL", `Tank ${tank_id} not found in planning table`);
      return res
        .status(404)
        .json({ ok: false, error: "Tank not found in planning table" });
    }

    // allocate a slot
    allocateSlot((err2, slotId) => {
      if (err2) {
        logEvent("ALLOC_FAIL", err2.message);
        return res.status(500).json({ ok: false, error: err2.message });
      }

      // create job
      db.run(
        `INSERT INTO jobs (tank_id, pm_id, assigned_slot, status, ts_created, last_sent_ts, resend_count)
         VALUES (?,?,?,?,?,?,?)`,
        [tank_id, pm_id, slotId, "ASSIGNED", now(), 0, 0],
        function (err3) {
          if (err3)
            return res.status(500).json({ ok: false, error: err3.message });

          const jobId = this.lastID;
          logEvent(
            "ALLOC_OK",
            `Tank ${tank_id} assigned to ${slotId} for ${pm_id} (Job ${jobId})`
          );

          // push to PM via WebSocket
          pushJobToPM(pm_id, { job_id: jobId, tank_id, slot_id: slotId });

          res.json({ ok: true, job_id: jobId, assigned_slot: slotId });
        }
      );
    });
  });
});

function pushJobToPM(pm_id, payload) {
  const ws = pmSockets.get(pm_id);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    logEvent("PM_OFFLINE", `${pm_id} not connected, cannot push job`);
    return;
  }

  const msg = JSON.stringify({ type: "JOB", ...payload });
  ws.send(msg);

  db.run(
    `UPDATE jobs SET last_sent_ts=?, resend_count=resend_count+1 WHERE job_id=?`,
    [now(), payload.job_id]
  );
}

// ---------- ACK handling + resend ----------
function handleAck(jobId, pmId) {
  db.run(`UPDATE jobs SET status='ACK', ts_ack=? WHERE job_id=?`, [
    now(),
    jobId,
  ]);
  logEvent("ACK", `${pmId} acknowledged Job ${jobId}`);
}

// Resend loop (every 3 seconds check for missing ACK)
setInterval(() => {
  db.all(
    `SELECT job_id, pm_id, tank_id, assigned_slot, status, last_sent_ts, resend_count
     FROM jobs
     WHERE status='ASSIGNED'`,
    (err, rows) => {
      if (err) return;

      for (const r of rows) {
        const elapsed = now() - (r.last_sent_ts || 0);
        // resend if not acknowledged in 5 seconds
        if (elapsed > 5000 && r.resend_count < 5) {
          logEvent("RESEND", `Resending Job ${r.job_id} to ${r.pm_id}`);
          pushJobToPM(r.pm_id, {
            job_id: r.job_id,
            tank_id: r.tank_id,
            slot_id: r.assigned_slot,
          });
        }
      }
    }
  );
}, 3000);

// ---------- Placement confirmation ----------
app.post("/api/job/confirm", (req, res) => {
  const { job_id, scanned_slot } = req.body;
  if (!job_id || !scanned_slot)
    return res
      .status(400)
      .json({ ok: false, error: "job_id and scanned_slot required" });

  db.get(`SELECT * FROM jobs WHERE job_id=?`, [job_id], (err, job) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    if (!job)
      return res.status(404).json({ ok: false, error: "Job not found" });

    // check correct slot
    if (scanned_slot !== job.assigned_slot) {
      logEvent(
        "WRONG_SLOT",
        `Job ${job_id} scanned ${scanned_slot} but assigned ${job.assigned_slot}`
      );
      return res.json({
        ok: false,
        error: "Wrong slot",
        correct_slot: job.assigned_slot,
      });
    }

    // mark slot occupied + job completed
    db.serialize(() => {
      db.run(`UPDATE slots SET status='OCCUPIED' WHERE slot_id=?`, [
        scanned_slot,
      ]);
      db.run(`UPDATE jobs SET status='COMPLETED', ts_placed=? WHERE job_id=?`, [
        now(),
        job_id,
      ]);
      logEvent("PLACED_OK", `Job ${job_id} confirmed at ${scanned_slot}`);
      res.json({ ok: true, message: "Placement confirmed" });
    });
  });
});

// ---------- Release slot (make it available again) ----------
// Allows releasing ASSIGNED or OCCUPIED slots (prototype-friendly)
app.post("/api/slot/release", (req, res) => {
  const { slot_id } = req.body;
  if (!slot_id) {
    return res.status(400).json({ ok: false, error: "slot_id required" });
  }

  db.get(`SELECT status FROM slots WHERE slot_id=?`, [slot_id], (err, row) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    if (!row)
      return res.status(404).json({ ok: false, error: "Slot not found" });

    // If already FREE, just respond OK (no changes needed)
    if (row.status === "FREE") {
      logEvent(
        "SLOT_RELEASED",
        `Slot ${slot_id} release requested but already FREE`
      );
      return res.json({ ok: true, message: "Slot already FREE" });
    }

    // Release any non-free slot (ASSIGNED or OCCUPIED)
    db.run(
      `UPDATE slots SET status='FREE' WHERE slot_id=?`,
      [slot_id],
      (err2) => {
        if (err2)
          return res.status(500).json({ ok: false, error: err2.message });

        logEvent(
          "SLOT_RELEASED",
          `Slot ${slot_id} released (${row.status} -> FREE)`
        );
        res.json({ ok: true, message: `Slot ${slot_id} is now FREE` });
      }
    );
  });
});

// ---------- Supervisor data ----------
app.get("/api/supervisor/state", (req, res) => {
  db.all(`SELECT * FROM jobs ORDER BY job_id DESC LIMIT 50`, (err, jobs) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });

    db.all(`SELECT * FROM slots`, (err2, slots) => {
      if (err2) return res.status(500).json({ ok: false, error: err2.message });

      db.all(
        `SELECT * FROM events ORDER BY event_id DESC LIMIT 50`,
        (err3, events) => {
          if (err3)
            return res.status(500).json({ ok: false, error: err3.message });

          // simple KPIs
          let completed = jobs.filter((j) => j.status === "COMPLETED");
          const kpis = {
            totalJobs: jobs.length,
            completedJobs: completed.length,
            misallocations: events.filter((e) => e.type === "WRONG_SLOT")
              .length,
          };

          res.json({ ok: true, jobs, slots, events, kpis });
        }
      );
    });
  });
});
