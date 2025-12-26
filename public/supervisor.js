const gridEl = document.getElementById("grid");
const jobsEl = document.getElementById("jobs");
const eventsEl = document.getElementById("events");

document.getElementById("arrivalBtn").onclick = async () => {
  await fetch("/api/arrival", { method: "POST" });
};

function slotClass(status) {
  if (status === "FREE") return "slot free";
  if (status === "ASSIGNED") return "slot assigned";
  return "slot occupied";
}

async function refresh() {
  const r = await fetch("/api/supervisor/state");
  const j = await r.json();
  if (!j.ok) return;

  // KPIs
  document.getElementById("k1").textContent = j.kpis.totalJobs;
  document.getElementById("k2").textContent = j.kpis.completedJobs;
  document.getElementById("k3").textContent = j.kpis.misallocations;

  // Grid
  gridEl.innerHTML = "";
  // sort slots by block then bay,row,tier
  const slots = j.slots.sort((a, b) => a.slot_id.localeCompare(b.slot_id));
  for (const s of slots) {
    const div = document.createElement("div");
    div.className = slotClass(s.status);
    div.textContent = s.slot_id;
    gridEl.appendChild(div);
  }

  // Jobs list
  jobsEl.innerHTML = j.jobs
    .map(
      (job) => `
    <div class="card">
      <div><b>Job ${job.job_id}</b> | ${job.status}</div>
      <div>Tank: ${job.tank_id} | PM: ${job.pm_id}</div>
      <div>Slot: ${job.assigned_slot}</div>
    </div>
  `
    )
    .join("");

  // Events
  eventsEl.innerHTML = j.events
    .map(
      (e) => `
    <div class="small">[${new Date(e.ts).toLocaleTimeString()}] <b>${
        e.type
      }</b> - ${e.message}</div>
  `
    )
    .join("");
}

setInterval(refresh, 1000);
refresh();
