const db = require("./db");

function seedSlots() {
  const blocks = ["A", "B", "C", "D"];

  db.serialize(() => {
    db.run("DELETE FROM slots");

    const stmt = db.prepare(
      "INSERT INTO slots (slot_id, block, bay, row, tier, status) VALUES (?,?,?,?,?,?)"
    );

    for (const block of blocks) {
      for (let bay = 1; bay <= 3; bay++) {
        for (let row = 1; row <= 4; row++) {
          for (let tier = 1; tier <= 2; tier++) {
            const slotId = `${block}-${bay}-${row}-${tier}`;
            stmt.run(slotId, block, bay, row, tier, "FREE");
          }
        }
      }
    }

    stmt.finalize();
    console.log("✅ Seeded 96 yard slots");
  });
}

function seedTanks() {
  db.serialize(() => {
    db.run("DELETE FROM tanks");

    const stmt = db.prepare(
      "INSERT INTO tanks (tank_id, size, priority) VALUES (?,?,?)"
    );

    // ✅ Seed tanks: TANK001 ... TANK096
    const totalTanks = 96;

    for (let i = 1; i <= totalTanks; i++) {
      const id = `TANK${String(i).padStart(3, "0")}`;

      // Simple demo attributes:
      // Alternate sizes 20/40
      const size = i % 2 === 0 ? "40" : "20";

      // Priority cycles 1..3
      const priority = (i % 3) + 1;

      stmt.run(id, size, priority);
    }

    stmt.finalize();
    console.log(
      `✅ Seeded ${totalTanks} demo tanks (TANK001 → TANK${String(
        totalTanks
      ).padStart(3, "0")})`
    );
  });
}

seedSlots();
seedTanks();
