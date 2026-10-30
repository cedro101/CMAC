// Draws the "C" app icon and writes the PNG sizes iOS and the manifest need.
// The mark stays inside the central 80% so it also works as a maskable icon.
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0a0a0a"/>
  <path d="M362.07 149.93 A150 150 0 1 0 362.07 362.07"
        fill="none" stroke="#34d399" stroke-width="64" stroke-linecap="round"/>
</svg>`;

const outputs = [
  ["apple-touch-icon.png", 180],
  ["icon-192.png", 192],
  ["icon-512.png", 512],
];

await mkdir("public/icons", { recursive: true });

for (const [name, size] of outputs) {
  await sharp(Buffer.from(svg), { density: 300 })
    .resize(size, size)
    .flatten({ background: "#0a0a0a" })
    .png()
    .toFile(`public/icons/${name}`);
}
