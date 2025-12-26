const params = new URLSearchParams(location.search);
const pmId = params.get("pm") || "PM1";
document.getElementById("pmId").textContent = pmId;

let currentJobId = null;
let currentTankId = null;
let currentSlotId = null;

// Connect WebSocket
const wsUrl = `ws://${location.host}?pm=${pmId}`;
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
    const tankId = result.data.trim();
    tankResult.textContent = `✅ Tank QR Scanned: ${tankId}`;

    // Send to backend
    const r = await fetch("/api/tank/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tank_id: tankId, pm_id: pmId }),
    });

    const j = await r.json();
    if (!j.ok) {
      tankResult.textContent = `❌ Error: ${j.error}`;
    } else {
      tankResult.textContent = `✅ Sent tank ${tankId}. Waiting for slot assignment...`;
    }
  },
  { returnDetailedScanResult: true }
);

tankScanner.start();

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

    const r = await fetch("/api/job/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: currentJobId, scanned_slot: scannedSlot }),
    });

    const j = await r.json();
    if (j.ok) {
      slotResult.textContent = `✅ Placement confirmed at ${scannedSlot}. Job completed.`;
      // reset job
      currentJobId = null;
      document.getElementById("jobId").textContent = "-";
      document.getElementById("tankId").textContent = "-";
      document.getElementById("slotId").textContent = "-";
    } else {
      slotResult.textContent = `❌ ${j.error}. Correct slot: ${j.correct_slot}`;
    }
  },
  { returnDetailedScanResult: true }
);

slotScanner.start();
