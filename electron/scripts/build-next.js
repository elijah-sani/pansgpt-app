// [ELECTRON API CONFIG] — Pre-build script to explicitly load frontend/.env.electron into process.env before Next.js build
"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const repoRoot = path.join(__dirname, "..", ".."); // [ELECTRON API CONFIG] up from electron/scripts/ to repo root
const envElectronPath = path.join(repoRoot, "frontend", ".env.electron");

const envVars = { ...process.env };

if (fs.existsSync(envElectronPath)) {
  const content = fs.readFileSync(envElectronPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.substring(0, idx).trim();
        let val = trimmed.substring(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        envVars[key] = val;
      }
    }
  }
}

envVars.ELECTRON_BUILD = "true";
envVars.NEXT_PUBLIC_IS_ELECTRON = "true";

console.log("[ELECTRON API CONFIG] Explicitly loading frontend/.env.electron...");
console.log(`[ELECTRON API CONFIG] Target NEXT_PUBLIC_API_URL=${envVars.NEXT_PUBLIC_API_URL}`);

try {
  execSync("npm run build --workspace=frontend", {
    cwd: repoRoot,
    env: envVars,
    stdio: "inherit",
  });
} catch (err) {
  console.error("[ELECTRON API CONFIG] Next.js build failed:", err.message);
  process.exit(1);
}
