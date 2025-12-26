/**
 * QR Generator for:
 *  - 96 Yard Slot QRs: A-D, Bay 1-3, Row 1-4, Tier 1-2  => 96 slots
 *  - Tank QRs: from a list you can edit
 *
 * Outputs:
 *  - PNG QR images in: ../public/qr/slots and ../public/qr/tanks
 *  - A printable HTML page: ../public/qr_print.html
 */

const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");

// --------- EDIT THIS LIST FOR YOUR DEMO TANKS ----------
const TANK_IDS = [
  "TANK001",
  "TANK002",
  "TANK003",
  "TANK004",
  "TANK005",
  "TANK006",
];
// ------------------------------------------------------

const PUBLIC_DIR = path.join(__dirname, "..", "public");
const QR_DIR = path.join(PUBLIC_DIR, "qr");
const SLOTS_DIR = path.join(QR_DIR, "slots");
const TANKS_DIR = path.join(QR_DIR, "tanks");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function safeFileName(text) {
  return text.replace(/[^a-zA-Z0-9-_]/g, "_");
}

async function makeQRpng(text, outPath) {
  // QR options: high error correction = robust scanning
  await QRCode.toFile(outPath, text, {
    errorCorrectionLevel: "H",
    margin: 1,
    width: 320,
  });
}

function generateSlotIds() {
  const blocks = ["A", "B", "C", "D"];
  const slotIds = [];

  for (const block of blocks) {
    for (let bay = 1; bay <= 3; bay++) {
      for (let row = 1; row <= 4; row++) {
        for (let tier = 1; tier <= 2; tier++) {
          slotIds.push(`${block}-${bay}-${row}-${tier}`);
        }
      }
    }
  }
  return slotIds; // length = 96
}

function buildPrintHTML(tankIds, slotIds) {
  // Create a nice print layout: cards with QR + label
  // Uses local images saved in /public/qr/...
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>QR Print Sheet</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 16px; }
    h2 { margin: 18px 0 8px; }
    .hint { color:#555; font-size:12px; margin-bottom:10px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
    }
    .card {
      border: 1px solid #ccc;
      border-radius: 10px;
      padding: 10px;
      text-align: center;
      page-break-inside: avoid;
    }
    .card img { width: 140px; height: 140px; }
    .label { font-weight: bold; margin-top: 6px; }
    .small { font-size: 12px; color:#333; word-break: break-all; }
    @media print {
      body { margin: 0; }
      .card { border: 1px solid #000; }
    }
  </style>
</head>
<body>

  <h2>Tank QR Codes</h2>
  <div class="hint">Scan these to identify tanks (example: TANK001).</div>
  <div class="grid">
    ${tankIds
      .map((id) => {
        const file = `qr/tanks/${safeFileName(id)}.png`;
        return `<div class="card">
          <img src="${file}" alt="${id}" />
          <div class="label">${id}</div>
          <div class="small">${id}</div>
        </div>`;
      })
      .join("")}
  </div>

  <h2 style="margin-top:22px;">Yard Slot QR Codes (96 slots)</h2>
  <div class="hint">Scan these at placement to confirm slot location (format: Block-Bay-Row-Tier, e.g., A-1-3-2).</div>
  <div class="grid">
    ${slotIds
      .map((sid) => {
        const file = `qr/slots/${safeFileName(sid)}.png`;
        return `<div class="card">
          <img src="${file}" alt="${sid}" />
          <div class="label">${sid}</div>
          <div class="small">${sid}</div>
        </div>`;
      })
      .join("")}
  </div>

</body>
</html>`;
}

async function main() {
  ensureDir(PUBLIC_DIR);
  ensureDir(QR_DIR);
  ensureDir(SLOTS_DIR);
  ensureDir(TANKS_DIR);

  const slotIds = generateSlotIds();

  console.log("Generating Tank QRs...");
  for (const tankId of TANK_IDS) {
    const outPath = path.join(TANKS_DIR, `${safeFileName(tankId)}.png`);
    await makeQRpng(tankId, outPath);
  }

  console.log("Generating Slot QRs (96)...");
  for (const slotId of slotIds) {
    const outPath = path.join(SLOTS_DIR, `${safeFileName(slotId)}.png`);
    await makeQRpng(slotId, outPath);
  }

  console.log("Generating printable HTML...");
  const html = buildPrintHTML(TANK_IDS, slotIds);
  const htmlPath = path.join(PUBLIC_DIR, "qr_print.html");
  fs.writeFileSync(htmlPath, html, "utf8");

  console.log("✅ Done!");
  console.log("Open this in your browser to print:");
  console.log("  http://<YOUR_LAPTOP_IP>:3000/qr_print.html");
  console.log("or locally:");
  console.log("  http://localhost:3000/qr_print.html");
}

main().catch((e) => {
  console.error("❌ Error generating QR codes:", e);
  process.exit(1);
});
