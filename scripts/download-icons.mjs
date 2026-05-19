/**
 * Download brand icons from Cloudinary and save locally to public/icons/.
 * Run once: node scripts/download-icons.mjs
 */
import { createWriteStream, mkdirSync } from "fs";
import { pipeline } from "stream/promises";
import { get } from "https";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "../public/icons");
mkdirSync(outDir, { recursive: true });

const BASE = "https://res.cloudinary.com/dckzmg6c3/image/upload/f_auto,q_auto";
const SRC = "v1777572835/Untitled-2_tgjm4u.png";

const targets = [
  { url: `${BASE},w_192/${SRC}`, file: "icon-192.png" },
  { url: `${BASE},w_512/${SRC}`, file: "icon-512.png" },
  { url: `${BASE},w_180/${SRC}`, file: "apple-touch-icon.png" },
  { url: `${BASE},w_32/${SRC}`,  file: "favicon-32.png" }
];

async function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    get(url, (res) => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode} for ${url}`)); return; }
      pipeline(res, file).then(resolve).catch(reject);
    }).on("error", reject);
  });
}

for (const { url, file } of targets) {
  const dest = join(outDir, file);
  process.stdout.write(`Downloading ${file}... `);
  await download(url, dest);
  console.log("done");
}

console.log("\nIcons saved to public/icons/. Update manifest.ts paths if needed.");
