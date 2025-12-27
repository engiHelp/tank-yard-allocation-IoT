// ---------------- PM Driver Page Logic (pm.js) ----------------
const params = new URLSearchParams(location.search);
const pmId = params.get("pm") || "PM1";
document.getElementById("pmId").textContent = pmId;

let currentJobId = null;
let currentTankId = null;
let currentSlotId = null;

// Locks to prevent repeated scans spamming requests
let tankScanLock = false;
let slotScanLock = false;

// Slot format: A-1-1-1 (Blocks A-D)
const SLOT_PATTERN = /^[A-D]-\d+-\d+-\d+$/i;

// Connect WebSocket (supports HTTP + HTTPS)
const wsProto = location.protocol === "https:" ? "wss" : "ws";
const wsUrl = `${wsProto}://${location.host}?pm=${pmId}`;
const ws = new WebSocket(wsUrl);

ws.onmessage = (evt) => {
  const data = JSON.parse(evt.data);

  if (data.type === "JOB") {
    currentJobId = data.job_id;
    currentTankId = data.tank_id;
    currentSlotId = data.slot_id;

    document.getElementById("jobId").textContent = currentJobId;
    document.getElementById("tankId").textContent = currentTankId;
    document.getElementById("slotId").textContent = currentSlotId;

    document.getElementById("ackBtn").disabled = false;

    // Once a job is assigned, block scanning a new tank until placement is confirmed
    tankScanLock = true;
  }
};

// ACK button
document.getElementById("ackBtn").onclick = () => {
  if (!currentJobId) return;
  ws.send(JSON.stringify({ type: "ACK", job_id: currentJobId }));
  document.getElementById("ackBtn").disabled = true;
};

// ---- QR Scanning (Tank) ----
const tankVideo = document.getElementById("tankVideo");
const tankResult = document.getElementById("tankScanResult");

const tankScanner = new QrScanner(
  tankVideo,
  async (result) => {
    // If job is ongoing, do not accept another tank scan
    if (tankScanLock) {
      tankResult.textContent =
        "⚠️ Current job is active. Confirm placement (scan Slot QR) before scanning a new Tank QR.";
      return;
    }

    // Debounce rapid repeated reads of the same QR
    if (slotScanLock) return; // simple guard (reuse lock during network request)
    slotScanLock = true;

    const raw = (result.data || "").trim();
    const upper = raw.toUpperCase();

    // ✅ Only accept Tank QR that starts with "TANK"
    // This prevents slot QR like "C-1-1-1" being treated as a tank
    if (!upper.startsWith("TANK")) {
      tankResult.textContent = `⚠️ Not a Tank QR: "${raw}". Please scan a Tank QR like TANK001.`;
      slotScanLock = false;
      return;
    }

    const tankId = raw;
    tankResult.textContent = `✅ Tank QR Scanned: ${tankId}`;

    try {
      const r = await fetch("/api/tank/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tank_id: tankId, pm_id: pmId }),
      });

      const j = await r.json();

      if (!j.ok) {
        tankResult.textContent = `❌ Error: ${j.error}`;
        slotScanLock = false;
        tankScanLock = false; // allow retry
        return;
      }

      tankResult.textContent = `✅ Tank sent. Waiting for slot assignment...`;

      // Stop tank scanner now to avoid it scanning the slot QR accidentally
      // while driver is trying to confirm placement.
      await tankScanner.stop();
      tankVideo.srcObject = null; // force camera stream stop for tank scanner

      // Lock tank scans until job completes
      tankScanLock = true;
      slotScanLock = false;
    } catch (err) {
      tankResult.textContent = `❌ Network error: ${err.message}`;
      slotScanLock = false;
      tankScanLock = false;
    }
  },
  { returnDetailedScanResult: true }
);

// Start tank scanner (with error handling)
tankScanner.start().catch((err) => {
  tankResult.textContent = `❌ Camera error: ${err.name} - ${err.message}. Allow camera permission (and use HTTPS if needed).`;
});

// ---- QR Scanning (Slot confirmation) ----
const slotVideo = document.getElementById("slotVideo");
const slotResult = document.getElementById("slotScanResult");

const slotScanner = new QrScanner(
  slotVideo,
  async (result) => {
    if (slotScanLock) return;
    slotScanLock = true;

    const scannedSlot = (result.data || "").trim();

    // ✅ Validate slot format (A-1-1-1)
    if (!SLOT_PATTERN.test(scannedSlot)) {
      slotResult.textContent = `⚠️ Not a valid Slot QR: "${scannedSlot}".`;
      slotScanLock = false;
      return;
    }

    if (!currentJobId) {
      slotResult.textContent = `❌ No active job to confirm. Scan a Tank QR first.`;
      slotScanLock = false;
      return;
    }

    slotResult.textContent = `Scanned Slot: ${scannedSlot} ... validating`;

    try {
      const r = await fetch("/api/job/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: currentJobId,
          scanned_slot: scannedSlot,
        }),
      });

      const j = await r.json();

      if (j.ok) {
        slotResult.textContent = `✅ Placement confirmed at ${scannedSlot}. Job completed.`;

        // Reset job
        currentJobId = null;
        currentTankId = null;
        currentSlotId = null;

        document.getElementById("jobId").textContent = "-";
        document.getElementById("tankId").textContent = "-";
        document.getElementById("slotId").textContent = "-";
        document.getElementById("ackBtn").disabled = true;

        // Unlock tank scanning for next job
        tankScanLock = false;

        // Restart tank scanner for next tank
        await tankScanner.start().catch(() => {});

        slotScanLock = false;
      } else {
        slotResult.textContent = `❌ ${j.error}. Correct slot: ${j.correct_slot}`;
        slotScanLock = false;
      }
    } catch (err) {
      slotResult.textContent = `❌ Network error: ${err.message}`;
      slotScanLock = false;
    }
  },
  { returnDetailedScanResult: true }
);

// Start slot scanner (with error handling)
slotScanner.start().catch((err) => {
  slotResult.textContent = `❌ Camera error: ${err.name} - ${err.message}. Allow camera permission (and use HTTPS if needed).`;
});

// -------- Optional but Recommended: Recover job if page refreshes --------
// This needs server endpoint: GET /api/pm/job?pm_id=PM1
async function recoverJobIfAny() {
  try {
    const r = await fetch(`/api/pm/job?pm_id=${encodeURIComponent(pmId)}`);
    const j = await r.json();
    if (!j.ok || !j.job) return;

    currentJobId = j.job.job_id;
    currentTankId = j.job.tank_id;
    currentSlotId = j.job.assigned_slot;

    document.getElementById("jobId").textContent = currentJobId;
    document.getElementById("tankId").textContent = currentTankId;
    document.getElementById("slotId").textContent = currentSlotId;

    document.getElementById("ackBtn").disabled = false;

    // If we already have an active job, block tank scanning and stop tank scanner
    tankScanLock = true;
    await tankScanner.stop().catch(() => {});
  } catch (e) {
    // ignore
  }
}

recoverJobIfAny();
