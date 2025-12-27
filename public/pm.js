const params = new URLSearchParams(location.search);
const pmId = params.get("pm") || "PM1";
document.getElementById("pmId").textContent = pmId;

const connStatus = document.getElementById("connStatus");

let currentJobId = null;
let currentTankId = null;
let currentSlotId = null;

let tankScanLock = false;

// UI elements
const jobIdEl = document.getElementById("jobId");
const tankIdEl = document.getElementById("tankId");
const slotIdEl = document.getElementById("slotId");
const ackBtn = document.getElementById("ackBtn");
const clearBtn = document.getElementById("clearBtn");
const jobMsg = document.getElementById("jobMsg");

const tankVideo = document.getElementById("tankVideo");
const tankResult = document.getElementById("tankScanResult");

const slotVideo = document.getElementById("slotVideo");
const slotResult = document.getElementById("slotScanResult");

// --- WebSocket connect
const wsUrl = `ws://${location.host}?pm=${pmId}`;
const ws = new WebSocket(wsUrl);

ws.onopen = () => {
  connStatus.textContent = "WS Connected";
  connStatus.className = "pill ok";
};

ws.onclose = () => {
  connStatus.textContent = "WS Offline";
  connStatus.className = "pill warn";
};

ws.onmessage = (evt) => {
  const data = JSON.parse(evt.data);
  if (data.type === "JOB") {
    currentJobId = data.job_id;
    currentTankId = data.tank_id;
    currentSlotId = data.slot_id;

    jobIdEl.textContent = currentJobId;
    tankIdEl.textContent = currentTankId;
    slotIdEl.textContent = currentSlotId;

    ackBtn.disabled = false;
    jobMsg.textContent =
      "✅ Job received. Press ACK, then scan Slot QR to confirm placement.";
    jobMsg.className = "notice success";

    // Start slot scanner only when a job exists
    startSlotScanner();
  }
};

// ACK
ackBtn.onclick = () => {
  if (!currentJobId) return;
  ws.send(JSON.stringify({ type: "ACK", job_id: currentJobId }));
  ackBtn.disabled = true;
  jobMsg.textContent = "✅ ACK sent. Proceed to scan Slot QR.";
  jobMsg.className = "notice success";
};

// Clear demo
clearBtn.onclick = () => {
  currentJobId = null;
  currentTankId = null;
  currentSlotId = null;
  jobIdEl.textContent = "-";
  tankIdEl.textContent = "-";
  slotIdEl.textContent = "-";
  ackBtn.disabled = true;
  slotResult.textContent = "No active job.";
  stopSlotScanner();
  restartTankScanner();
};

// ---- QR Patterns (prevents wrong QR type)
const TANK_PATTERN = /^TANK\d{3}$/i;
const SLOT_PATTERN = /^[ABCD]-[1-3]-[1-4]-[1-2]$/i;

// Camera constraints (phone-friendly)
const cameraConstraints = {
  preferredCamera: "environment", // back camera on phones
};

// ---- Tank scanner
let tankScanner = null;

function startTankScanner() {
  if (tankScanner) return;

  tankScanner = new QrScanner(
    tankVideo,
    async (result) => {
      const tankId = (result.data || "").trim();

      if (!TANK_PATTERN.test(tankId)) {
        tankResult.textContent = `⚠️ Not a Tank QR: ${tankId} (expected TANK001 format)`;
        tankResult.className = "notice";
        return;
      }

      if (tankScanLock) return;
      tankScanLock = true;

      tankResult.textContent = `✅ Tank QR: ${tankId} — sending...`;
      tankResult.className = "notice success";

      // Stop tank scanning to prevent repeated scans
      try {
        await tankScanner.stop();
      } catch (e) {}
      tankVideo.srcObject = null;

      try {
        const r = await fetch("/api/tank/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tank_id: tankId, pm_id: pmId }),
        });

        const j = await r.json();
        if (!j.ok) {
          tankResult.textContent = `❌ ${j.error}`;
          tankResult.className = "notice error";
          tankScanLock = false;
          // restart scanning
          restartTankScanner();
        } else {
          tankResult.textContent = `✅ Sent ${tankId}. Waiting for job assignment...`;
          tankResult.className = "notice success";
          // keep locked until job completes
        }
      } catch (err) {
        tankResult.textContent = `❌ Network error. Try again.`;
        tankResult.className = "notice error";
        tankScanLock = false;
        restartTankScanner();
      }
    },
    { returnDetailedScanResult: true, ...cameraConstraints }
  );

  tankScanner.start().catch((e) => {
    tankResult.textContent =
      "❌ Camera error. Allow camera permission (on phone use Chrome, sometimes HTTPS required).";
    tankResult.className = "notice error";
  });
}

async function restartTankScanner() {
  if (tankScanner) {
    try {
      await tankScanner.stop();
    } catch (e) {}
    tankScanner = null;
  }
  startTankScanner();
}

startTankScanner();

// ---- Slot scanner
let slotScanner = null;

function startSlotScanner() {
  if (slotScanner) return;

  slotScanner = new QrScanner(
    slotVideo,
    async (result) => {
      const scannedSlot = (result.data || "").trim();

      if (!currentJobId) {
        slotResult.textContent = `❌ No active job. Scan Tank QR first.`;
        slotResult.className = "notice error";
        return;
      }

      if (!SLOT_PATTERN.test(scannedSlot)) {
        slotResult.textContent = `⚠️ Not a Slot QR: ${scannedSlot} (expected C-1-1-1 format)`;
        slotResult.className = "notice";
        return;
      }

      slotResult.textContent = `Validating ${scannedSlot}...`;
      slotResult.className = "notice";

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
        slotResult.textContent = `✅ Confirmed at ${scannedSlot}. Job completed.`;
        slotResult.className = "notice success";

        // Reset job & restart tank scan
        currentJobId = null;
        currentTankId = null;
        currentSlotId = null;
        jobIdEl.textContent = "-";
        tankIdEl.textContent = "-";
        slotIdEl.textContent = "-";
        ackBtn.disabled = true;
        tankScanLock = false;

        stopSlotScanner();
        restartTankScanner();
      } else {
        slotResult.textContent = `❌ ${j.error}. Correct: ${j.correct_slot}`;
        slotResult.className = "notice error";
      }
    },
    { returnDetailedScanResult: true, ...cameraConstraints }
  );

  slotScanner.start().catch(() => {
    slotResult.textContent =
      "❌ Camera error for slot scan. Allow camera permission. If phone blocks on HTTP, use manual fallback.";
    slotResult.className = "notice error";
  });
}

async function stopSlotScanner() {
  if (!slotScanner) return;
  try {
    await slotScanner.stop();
  } catch (e) {}
  slotScanner = null;
  slotVideo.srcObject = null;
}

// Manual slot confirm
document.getElementById("manualBtn").onclick = async () => {
  const scannedSlot = document.getElementById("manualSlot").value.trim();
  if (!currentJobId) {
    slotResult.textContent = "❌ No active job.";
    slotResult.className = "notice error";
    return;
  }
  if (!SLOT_PATTERN.test(scannedSlot)) {
    slotResult.textContent = "⚠️ Invalid slot format (use C-1-1-1).";
    slotResult.className = "notice";
    return;
  }

  const r = await fetch("/api/job/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_id: currentJobId, scanned_slot: scannedSlot }),
  });
  const j = await r.json();
  if (j.ok) {
    slotResult.textContent = `✅ Confirmed at ${scannedSlot}. Job completed.`;
    slotResult.className = "notice success";
    clearBtn.click();
  } else {
    slotResult.textContent = `❌ ${j.error}. Correct: ${j.correct_slot}`;
    slotResult.className = "notice error";
  }
};
