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
    console.log("Seeded 96 yard slots");
  });
}

function seedTanks() {
  db.serialize(() => {
    db.run("DELETE FROM tanks");
    const stmt = db.prepare(
      "INSERT INTO tanks (tank_id, size, priority) VALUES (?,?,?)"
    );

    // Demo tanks
    stmt.run("TANK001", "20", 1);
    stmt.run("TANK002", "40", 2);
    stmt.run("TANK003", "20", 3);
    stmt.run("TANK004", "40", 1);
    stmt.finalize();

    console.log("Seeded demo tanks");
  });
}

seedSlots();
seedTanks();
