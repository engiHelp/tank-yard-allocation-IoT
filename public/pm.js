// ---------------- PM Driver Page Logic (pm.js) ----------------
const params = new URLSearchParams(location.search);
const pmId = params.get("pm") || "PM1";
document.getElementById("pmId").textContent = pmId;

let currentJobId = null;
let currentTankId = null;
let currentSlotId = null;

// ✅ Prevent repeated QR scans creating multiple jobs
let tankScanLock = false;

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

    // Keep tankScanLock locked because we already accepted a job.
    // Driver should not scan another tank until this job is completed.
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
    // ✅ Lock to prevent duplicate scans firing many POST requests
    if (tankScanLock) return;
    tankScanLock = true;

    const tankId = result.data.trim();
    tankResult.textContent = `✅ Tank QR Scanned: ${tankId}`;

    try {
      // Send to backend
      const r = await fetch("/api/tank/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tank_id: tankId, pm_id: pmId }),
      });

      const j = await r.json();

      if (!j.ok) {
        tankResult.textContent = `❌ Error: ${j.error}`;
        // ✅ Unlock so user can try scanning again
        tankScanLock = false;
      } else {
        tankResult.textContent = `✅ Sent tank ${tankId}. Waiting for slot assignment...`;
        // Keep locked until job completes (or you can stop scanner)
        // await tankScanner.stop();
      }
    } catch (err) {
      tankResult.textContent = `❌ Network error: ${err.message}`;
      tankScanLock = false;
    }
  },
  { returnDetailedScanResult: true }
);

// Start tank scanner (with error handling)
tankScanner.start().catch((err) => {
  tankResult.textContent = `❌ Camera error: ${err.name} - ${err.message}. Use HTTPS + allow camera permission.`;
});

// ---- QR Scanning (Slot confirmation) ----
const slotVideo = document.getElementById("slotVideo");
const slotResult = document.getElementById("slotScanResult");

const slotScanner = new QrScanner(
  slotVideo,
  async (result) => {
    const scannedSlot = result.data.trim();

    if (!currentJobId) {
      slotResult.textContent = `❌ No active job to confirm.`;
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

        // Reset job display
        currentJobId = null;
        currentTankId = null;
        currentSlotId = null;

        document.getElementById("jobId").textContent = "-";
        document.getElementById("tankId").textContent = "-";
        document.getElementById("slotId").textContent = "-";

        // ✅ Unlock tank scanning for the next tank/job
        tankScanLock = false;

        // (Optional) Also re-enable ACK button state for next job
        document.getElementById("ackBtn").disabled = true;
      } else {
        slotResult.textContent = `❌ ${j.error}. Correct slot: ${j.correct_slot}`;
      }
    } catch (err) {
      slotResult.textContent = `❌ Network error: ${err.message}`;
    }
  },
  { returnDetailedScanResult: true }
);

// Start slot scanner (with error handling)
slotScanner.start().catch((err) => {
  slotResult.textContent = `❌ Camera error: ${err.name} - ${err.message}. Use HTTPS + allow camera permission.`;
});
