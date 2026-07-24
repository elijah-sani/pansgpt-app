// [ELECTRON PHASE 1] — Cross-platform asset copier for Next.js standalone build
// Next.js output: "standalone" does NOT copy public/ or .next/static/ automatically.
// This script must run after `next build` with ELECTRON_BUILD=true.
//
// Usage: node electron/scripts/copy-assets.js
// (called from root package.json's electron:copy-assets script)

"use strict";

const path = require("path"); // [ELECTRON PHASE 1]
const fs = require("fs-extra"); // [ELECTRON PHASE 1]

// ─── Paths ────────────────────────────────────────────────────────────────────
// This script runs from the REPO ROOT (root package.json calls it).
const repoRoot = path.resolve(__dirname, "..", ".."); // [ELECTRON PHASE 1] electron/scripts/ → repo root
const frontendDir = path.join(repoRoot, "frontend"); // [ELECTRON PHASE 1]
const standaloneDir = path.join(frontendDir, ".next-electron", "standalone"); // [ELECTRON PHASE 1]

const copies = [ // [ELECTRON PHASE 1]
  {
    src: path.join(frontendDir, "public"), // [ELECTRON PHASE 1]
    dest: path.join(standaloneDir, "public"), // [ELECTRON PHASE 1]
    label: "public/ → standalone/public/", // [ELECTRON PHASE 1]
  },
  {
    src: path.join(frontendDir, ".next-electron", "static"), // [ELECTRON PHASE 1]
    // [ELECTRON PHASE 1 FIX] Destination must match distDir name (".next-electron"), NOT hardcoded ".next".
    // Next.js standalone server.js references static assets relative to the distDir it was built with.
    // Verified: Next.js already placed server-side content at standalone/.next-electron/server/ and
    // manifest files — the static/ subdir is the only missing piece. fs-extra merges, not clobbers.
    dest: path.join(standaloneDir, ".next-electron", "static"), // [ELECTRON PHASE 1 FIX]
    label: ".next-electron/static/ → standalone/.next-electron/static/", // [ELECTRON PHASE 1 FIX]
  },
]; // [ELECTRON PHASE 1]

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() { // [ELECTRON PHASE 1]
  console.log("[ELECTRON PHASE 1] copy-assets: starting post-build asset copy"); // [ELECTRON PHASE 1]

  // Confirm the standalone directory actually exists before copying
  if (!(await fs.pathExists(standaloneDir))) { // [ELECTRON PHASE 1]
    console.error( // [ELECTRON PHASE 1]
      `[ELECTRON PHASE 1] ERROR: standalone dir not found at:\n  ${standaloneDir}\n` + // [ELECTRON PHASE 1]
      `  Run 'npm run electron:build:next' (or the root 'npm run electron:build') first.` // [ELECTRON PHASE 1]
    ); // [ELECTRON PHASE 1]
    process.exit(1); // [ELECTRON PHASE 1]
  } // [ELECTRON PHASE 1]

  // [ELECTRON PHASE 1 RELIABILITY] Next.js 16 standalone output traces minimal next package files, but misses
  // dynamically required submodules (picocolors, querystring, cpu-profile, build/output/log, etc.).
  // Copying node_modules/next/dist specifically into .next-electron/node_modules/next/dist
  // provides all required runtime JS modules (~1,200 files, <1s copy time) without recursive copy issues.
  const srcNextDist = path.join(repoRoot, "node_modules", "next", "dist"); // [ELECTRON PHASE 1 RELIABILITY]
  const destNextDist1 = path.join(frontendDir, ".next-electron", "node_modules", "next", "dist"); // [ELECTRON PHASE 1 RELIABILITY]
  const destNextDist2 = path.join(standaloneDir, "node_modules", "next", "dist"); // [ELECTRON PHASE 1 RELIABILITY]

  if (fs.existsSync(srcNextDist)) { // [ELECTRON PHASE 1 RELIABILITY]
    console.log("[ELECTRON PHASE 1 RELIABILITY] Syncing node_modules/next/dist..."); // [ELECTRON PHASE 1 RELIABILITY]
    if (fs.existsSync(path.dirname(destNextDist1))) { // [ELECTRON PHASE 1 RELIABILITY]
      fs.cpSync(srcNextDist, destNextDist1, { recursive: true, force: true }); // [ELECTRON PHASE 1 RELIABILITY]
    } // [ELECTRON PHASE 1 RELIABILITY]
    if (fs.existsSync(path.dirname(destNextDist2))) { // [ELECTRON PHASE 1 RELIABILITY]
      fs.cpSync(srcNextDist, destNextDist2, { recursive: true, force: true }); // [ELECTRON PHASE 1 RELIABILITY]
    } // [ELECTRON PHASE 1 RELIABILITY]
    console.log("[ELECTRON PHASE 1 RELIABILITY] ✓ Done: next/dist synced cleanly"); // [ELECTRON PHASE 1 RELIABILITY]
  } // [ELECTRON PHASE 1 RELIABILITY]

  for (const { src, dest, label } of copies) { // [ELECTRON PHASE 1]
    if (!(await fs.pathExists(src))) { // [ELECTRON PHASE 1]
      console.warn(`[ELECTRON PHASE 1] WARN: source not found, skipping: ${src}`); // [ELECTRON PHASE 1]
      continue; // [ELECTRON PHASE 1]
    } // [ELECTRON PHASE 1]

    console.log(`[ELECTRON PHASE 1]   Copying ${label}`); // [ELECTRON PHASE 1]
    await fs.copy(src, dest, { overwrite: true }); // [ELECTRON PHASE 1] merges into existing dir, does not clobber
    console.log(`[ELECTRON PHASE 1]   ✓ Done: ${dest}`); // [ELECTRON PHASE 1]
  } // [ELECTRON PHASE 1]

  // [ELECTRON PHASE 1 FIX] Remove stale standalone/.next/ directory if it exists.
  // This was created by a previous copy-assets run that used the wrong destination path.
  // The correct path is standalone/.next-electron/ — standalone/.next/ must not exist.
  const staleNextDir = path.join(standaloneDir, ".next"); // [ELECTRON PHASE 1 FIX]
  if (await fs.pathExists(staleNextDir)) { // [ELECTRON PHASE 1 FIX]
    console.log("[ELECTRON PHASE 1 FIX] Removing stale standalone/.next/ (wrong path from previous run)"); // [ELECTRON PHASE 1 FIX]
    await fs.remove(staleNextDir); // [ELECTRON PHASE 1 FIX]
    console.log("[ELECTRON PHASE 1 FIX] ✓ Removed standalone/.next/"); // [ELECTRON PHASE 1 FIX]
  } // [ELECTRON PHASE 1 FIX]

  console.log("[ELECTRON PHASE 1] copy-assets: all assets copied successfully"); // [ELECTRON PHASE 1]
} // [ELECTRON PHASE 1]

main().catch((err) => { // [ELECTRON PHASE 1]
  console.error("[ELECTRON PHASE 1] copy-assets FAILED:", err); // [ELECTRON PHASE 1]
  process.exit(1); // [ELECTRON PHASE 1]
}); // [ELECTRON PHASE 1]
