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

    // Click-to-release (only if ASSIGNED or OCCUPIED)
    div.style.cursor = s.status === "FREE" ? "default" : "pointer";
    div.title =
      `Slot ${s.slot_id} | Status: ${s.status}` +
      (s.status === "FREE" ? "" : " | Click to release");

    div.onclick = async () => {
      if (s.status === "FREE") return;

      const ok = confirm(`Release slot ${s.slot_id}? (${s.status} -> FREE)`);
      if (!ok) return;

      const r = await fetch("/api/slot/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot_id: s.slot_id }),
      });
      const out = await r.json();
      if (!out.ok) alert(out.error || "Failed to release slot");

      refresh();
    };

    gridEl.appendChild(div);
  }

  // Jobs list
  const activeJobs = j.jobs.filter((x) => x.status !== "COMPLETED");
  const completedJobs = j.jobs.filter((x) => x.status === "COMPLETED");

  jobsEl.innerHTML = `
  <div style="margin-bottom:8px;">
    <b>Active Jobs</b> <span class="small">(${activeJobs.length})</span>
  </div>

  ${
    activeJobs.length
      ? activeJobs
          .map(
            (job) => `
    <div class="card">
      <div><b>Job ${job.job_id}</b> | ${job.status}</div>
      <div>Tank: ${job.tank_id} | PM: ${job.pm_id}</div>
      <div>Slot: ${job.assigned_slot}</div>
    </div>
  `
          )
          .join("")
      : `<div class="small">No active jobs</div>`
  }

  <div style="margin-top:14px;margin-bottom:8px;">
    <b>Completed (latest)</b> <span class="small">(${
      completedJobs.length
    })</span>
  </div>

  ${
    completedJobs.length
      ? completedJobs
          .map(
            (job) => `
    <div class="card" style="opacity:0.75;">
      <div><b>Job ${job.job_id}</b> | ${job.status}</div>
      <div>Tank: ${job.tank_id} | PM: ${job.pm_id}</div>
      <div>Slot: ${job.assigned_slot}</div>
    </div>
  `
          )
          .join("")
      : `<div class="small">No completed jobs</div>`
  }
`;

  // Events
  const recentEvents = j.events.slice(0, 15); // newest first already
  eventsEl.innerHTML = recentEvents
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
