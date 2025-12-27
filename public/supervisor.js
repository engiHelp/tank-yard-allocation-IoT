const gridEl = document.getElementById("grid");
const jobsEl = document.getElementById("jobs");
const eventsEl = document.getElementById("events");

const lastUpdatedEl = document.getElementById("lastUpdated");
const pmPill = document.getElementById("pmPill");

const sd_slot = document.getElementById("sd_slot");
const sd_status = document.getElementById("sd_status");
const sd_job = document.getElementById("sd_job");
const sd_tank = document.getElementById("sd_tank");
const sd_pm = document.getElementById("sd_pm");

let selectedSlotId = null;
let tabMode = "ACTIVE"; // ACTIVE | COMPLETED

document.getElementById("arrivalBtn").onclick = async () => {
  await fetch("/api/arrival", { method: "POST" });
};

document.getElementById("tabActive").onclick = () => {
  tabMode = "ACTIVE";
  document.getElementById("tabActive").classList.add("active");
  document.getElementById("tabCompleted").classList.remove("active");
};

document.getElementById("tabCompleted").onclick = () => {
  tabMode = "COMPLETED";
  document.getElementById("tabCompleted").classList.add("active");
  document.getElementById("tabActive").classList.remove("active");
};

function slotClass(status) {
  if (status === "FREE") return "slot free";
  if (status === "ASSIGNED") return "slot assigned";
  return "slot occupied";
}

function badgeClass(status) {
  if (status === "ASSIGNED") return "badge assigned";
  if (status === "ACK") return "badge ack";
  if (status === "COMPLETED") return "badge completed";
  return "badge";
}

function setSlotDetails(slot, jobs) {
  if (!slot) {
    sd_slot.textContent = "-";
    sd_status.textContent = "-";
    sd_job.textContent = "-";
    sd_tank.textContent = "-";
    sd_pm.textContent = "-";
    return;
  }

  sd_slot.textContent = slot.slot_id;
  sd_status.textContent = slot.status;

  // find latest job for this slot
  const j = jobs.find((x) => x.assigned_slot === slot.slot_id);
  if (j) {
    sd_job.textContent = j.job_id;
    sd_tank.textContent = j.tank_id;
    sd_pm.textContent = j.pm_id;
  } else {
    sd_job.textContent = "-";
    sd_tank.textContent = "-";
    sd_pm.textContent = "-";
  }
}

async function refresh() {
  const r = await fetch("/api/supervisor/state");
  const data = await r.json();
  if (!data.ok) return;

  const { jobs, slots, events, kpis } = data;

  // KPIs
  document.getElementById("k1").textContent = kpis.totalJobs;
  document.getElementById("k2").textContent = kpis.completedJobs;
  document.getElementById("k3").textContent = kpis.misallocations;

  // Active PM count (from active jobs + connected logs approximation)
  const activePms = new Set(
    jobs.filter((j) => j.status !== "COMPLETED").map((j) => j.pm_id)
  );
  document.getElementById("k4").textContent = activePms.size;
  pmPill.textContent = `Active PMs: ${activePms.size}`;

  lastUpdatedEl.textContent = ` • Updated ${new Date().toLocaleTimeString()}`;

  // Grid render
  gridEl.innerHTML = "";
  const sortedSlots = slots.sort((a, b) => a.slot_id.localeCompare(b.slot_id));

  for (const s of sortedSlots) {
    const div = document.createElement("div");
    div.className =
      slotClass(s.status) + (s.slot_id === selectedSlotId ? " selected" : "");
    div.textContent = s.slot_id;

    div.onclick = () => {
      selectedSlotId = s.slot_id;
      setSlotDetails(s, jobs);
      refresh(); // re-render selection outline immediately
    };

    gridEl.appendChild(div);
  }

  // If slot already selected, keep details synced
  if (selectedSlotId) {
    const slot = sortedSlots.find((x) => x.slot_id === selectedSlotId);
    setSlotDetails(slot, jobs);
  }

  // Jobs list with tabs
  let visibleJobs =
    tabMode === "ACTIVE"
      ? jobs.filter((j) => j.status !== "COMPLETED")
      : jobs.filter((j) => j.status === "COMPLETED");

  // show newest first
  visibleJobs = visibleJobs.sort((a, b) => b.job_id - a.job_id);

  jobsEl.innerHTML = visibleJobs
    .map(
      (job) => `
    <div class="jobCard">
      <div class="row">
        <div><b>Job ${job.job_id}</b></div>
        <div class="${badgeClass(job.status)}">${job.status}</div>
      </div>
      <div class="small" style="margin-top:6px">
        Tank: <b>${job.tank_id}</b> • PM: <b>${job.pm_id}</b>
      </div>
      <div class="small">Slot: <b>${job.assigned_slot}</b></div>
    </div>
  `
    )
    .join("");

  // Events
  eventsEl.innerHTML = events
    .map(
      (e) => `
    <div class="logLine">
      [${new Date(e.ts).toLocaleTimeString()}] <b>${e.type}</b> — ${e.message}
    </div>
  `
    )
    .join("");
}

setInterval(refresh, 1000);
refresh();
