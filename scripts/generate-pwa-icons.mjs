import sharp from "sharp";
import { mkdirSync } from "fs";

const OUT_DIR = "public/icons";
mkdirSync(OUT_DIR, { recursive: true });

function svgIcon({ size, padding = 0, bg = "#0f172a" }) {
  const fontSize = Math.round(size * 0.5);
  return Buffer.from(`
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${padding > 0 ? 0 : size * 0.2}" fill="${bg}"/>
      <text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="${fontSize}" fill="#ffffff">R</text>
    </svg>
  `);
}

const targets = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "maskable-icon-512.png", size: 512, padding: 1 }, // full-bleed background for maskable safe zone
  { file: "apple-touch-icon.png", size: 180 },
];

for (const t of targets) {
  await sharp(svgIcon({ size: t.size, padding: t.padding }))
    .png()
    .toFile(`${OUT_DIR}/${t.file}`);
  console.log(`Generated ${OUT_DIR}/${t.file}`);
}
