const db = require("./db");

function getBlockOccupancy(callback) {
  db.all(
    `SELECT block,
            SUM(CASE WHEN status='FREE' THEN 1 ELSE 0 END) AS free_count,
            COUNT(*) AS total_count
     FROM slots
     GROUP BY block`,
    (err, rows) => {
      if (err) return callback(err);
      // occupancy = occupied ratio
      const occ = rows.map((r) => ({
        block: r.block,
        free: r.free_count,
        total: r.total_count,
        occupancy: 1 - r.free_count / r.total_count,
      }));
      callback(null, occ);
    }
  );
}

function allocateSlot(callback) {
  getBlockOccupancy((err, occ) => {
    if (err) return callback(err);

    // Choose least-occupied block (more free slots)
    occ.sort((a, b) => a.occupancy - b.occupancy);
    const bestBlock = occ[0].block;

    // Pick first free slot in that block
    db.get(
      `SELECT slot_id FROM slots
       WHERE block=? AND status='FREE'
       ORDER BY bay ASC, row ASC, tier ASC
       LIMIT 1`,
      [bestBlock],
      (err2, row) => {
        if (err2) return callback(err2);
        if (!row) return callback(new Error("No FREE slots available"));

        // Reserve it
        db.run(
          `UPDATE slots SET status='ASSIGNED' WHERE slot_id=?`,
          [row.slot_id],
          (err3) => {
            if (err3) return callback(err3);
            callback(null, row.slot_id);
          }
        );
      }
    );
  });
}

module.exports = { allocateSlot };
