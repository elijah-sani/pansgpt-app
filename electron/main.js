// [ELECTRON PHASE 1] — Electron main process for PansGPT desktop shell
// Phase 1: standard OS frame only. No custom title bar, no WebContentsView, no frameless mode.

"use strict";

const { app, BrowserWindow, dialog } = require("electron"); // [ELECTRON PHASE 1]
const path = require("path"); // [ELECTRON PHASE 1]
const net = require("net"); // [ELECTRON PHASE 1]
const http = require("http"); // [ELECTRON PHASE 1]
const { spawn } = require("child_process"); // [ELECTRON PHASE 1]

// ─── State ────────────────────────────────────────────────────────────────────

/** @type {import("child_process").ChildProcess | null} */
let serverProcess = null; // [ELECTRON PHASE 1]
let mainWindow = null; // [ELECTRON PHASE 1]
let isQuitting = false; // [ELECTRON PHASE 1]

// ─── Port helpers ─────────────────────────────────────────────────────────────

/**
 * Find a free TCP port by trial-binding a temporary server.
 * Returns a Promise<number>.
 */ // [ELECTRON PHASE 1]
/**
 * Find a free TCP port by trial-binding a temporary server.
 * Returns a Promise<number>.
 */ // [ELECTRON PHASE 1]
function findFreePort(retries = 3) { // [ELECTRON PHASE 1 RELIABILITY]
  return new Promise((resolve, reject) => { // [ELECTRON PHASE 1]
    const server = net.createServer(); // [ELECTRON PHASE 1]
    server.unref(); // [ELECTRON PHASE 1]
    server.on("error", (err) => { // [ELECTRON PHASE 1 RELIABILITY]
      if (retries > 0) { // [ELECTRON PHASE 1 RELIABILITY]
        setTimeout(() => findFreePort(retries - 1).then(resolve, reject), 100); // [ELECTRON PHASE 1 RELIABILITY]
      } else { // [ELECTRON PHASE 1 RELIABILITY]
        reject(err); // [ELECTRON PHASE 1 RELIABILITY]
      } // [ELECTRON PHASE 1 RELIABILITY]
    }); // [ELECTRON PHASE 1 RELIABILITY]
    server.listen(0, "127.0.0.1", () => { // [ELECTRON PHASE 1]
      const { port } = server.address(); // [ELECTRON PHASE 1]
      server.close(() => resolve(port)); // [ELECTRON PHASE 1]
    }); // [ELECTRON PHASE 1]
  }); // [ELECTRON PHASE 1]
} // [ELECTRON PHASE 1]

/**
 * Poll http://127.0.0.1:<port>/ with exponential backoff until it responds,
 * or rejects after timeoutMs.
 */ // [ELECTRON PHASE 1]
function waitForServer(port, timeoutMs = 15000) { // [ELECTRON PHASE 1]
  return new Promise((resolve, reject) => { // [ELECTRON PHASE 1]
    const deadline = Date.now() + timeoutMs; // [ELECTRON PHASE 1]
    let delay = 200; // [ELECTRON PHASE 1] initial poll interval ms
    let cleanedUp = false; // [ELECTRON PHASE 1 RELIABILITY]

    function cleanup() { // [ELECTRON PHASE 1 RELIABILITY]
      if (cleanedUp) return; // [ELECTRON PHASE 1 RELIABILITY]
      cleanedUp = true; // [ELECTRON PHASE 1 RELIABILITY]
      if (serverProcess) { // [ELECTRON PHASE 1 RELIABILITY]
        serverProcess.removeListener("exit", onProcessExit); // [ELECTRON PHASE 1 RELIABILITY]
      } // [ELECTRON PHASE 1 RELIABILITY]
    } // [ELECTRON PHASE 1 RELIABILITY]

    function onProcessExit(code, signal) { // [ELECTRON PHASE 1 RELIABILITY]
      cleanup(); // [ELECTRON PHASE 1 RELIABILITY]
      reject(new Error(`Server process exited prematurely with code ${code} (signal=${signal}) while waiting for port ${port}`)); // [ELECTRON PHASE 1 RELIABILITY]
    } // [ELECTRON PHASE 1 RELIABILITY]

    if (serverProcess) { // [ELECTRON PHASE 1 RELIABILITY]
      serverProcess.once("exit", onProcessExit); // [ELECTRON PHASE 1 RELIABILITY]
    } // [ELECTRON PHASE 1 RELIABILITY]

    function attempt() { // [ELECTRON PHASE 1]
      if (cleanedUp) return; // [ELECTRON PHASE 1 RELIABILITY]
      if (Date.now() >= deadline) { // [ELECTRON PHASE 1]
        cleanup(); // [ELECTRON PHASE 1 RELIABILITY]
        return reject( // [ELECTRON PHASE 1]
          new Error(`PansGPT server on port ${port} did not respond within ${timeoutMs / 1000}s`) // [ELECTRON PHASE 1]
        ); // [ELECTRON PHASE 1]
      } // [ELECTRON PHASE 1]

      const req = http.get(`http://127.0.0.1:${port}/`, (res) => { // [ELECTRON PHASE 1]
        // Any HTTP response (even 404/500) means the server is up
        res.resume(); // [ELECTRON PHASE 1]
        cleanup(); // [ELECTRON PHASE 1 RELIABILITY]
        resolve(); // [ELECTRON PHASE 1]
      }); // [ELECTRON PHASE 1]
      req.on("error", () => { // [ELECTRON PHASE 1]
        if (cleanedUp) return; // [ELECTRON PHASE 1 RELIABILITY]
        // Server not ready yet — retry after backoff
        delay = Math.min(delay * 1.5, 2000); // [ELECTRON PHASE 1] cap at 2s
        setTimeout(attempt, delay); // [ELECTRON PHASE 1]
      }); // [ELECTRON PHASE 1]
      // [ELECTRON PHASE 1 RELIABILITY] Per-request HTTP timeout increased from 1000ms to 5000ms.
      // Next.js cold-boot first-route compilation takes 1.5s-2.5s; 1000ms was prematurely aborting healthy requests.
      req.setTimeout(5000, () => { // [ELECTRON PHASE 1 RELIABILITY]
        req.destroy(); // [ELECTRON PHASE 1]
      }); // [ELECTRON PHASE 1]
    } // [ELECTRON PHASE 1]

    attempt(); // [ELECTRON PHASE 1]
  }); // [ELECTRON PHASE 1]
} // [ELECTRON PHASE 1]

// ─── Child process cleanup ────────────────────────────────────────────────────

/**
 * Gracefully terminate the spawned Next.js standalone server.
 * Mirrors the seriousness of the backend's graceful-shutdown handling.
 */ // [ELECTRON PHASE 1]
function killServerProcess() { // [ELECTRON PHASE 1]
  if (!serverProcess) return; // [ELECTRON PHASE 1]

  const proc = serverProcess; // [ELECTRON PHASE 1]
  serverProcess = null; // [ELECTRON PHASE 1]

  try { // [ELECTRON PHASE 1]
    if (process.platform === "win32") { // [ELECTRON PHASE 1]
      // Windows: taskkill /T kills the whole process tree (avoids orphans)
      spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { // [ELECTRON PHASE 1]
        detached: true, // [ELECTRON PHASE 1]
        stdio: "ignore", // [ELECTRON PHASE 1]
      }); // [ELECTRON PHASE 1]
    } else { // [ELECTRON PHASE 1]
      proc.kill("SIGTERM"); // [ELECTRON PHASE 1]
    } // [ELECTRON PHASE 1]
  } catch (err) { // [ELECTRON PHASE 1]
    // Best effort — log but do not crash the quit sequence
    console.error("[ELECTRON PHASE 1] Failed to kill server process:", err); // [ELECTRON PHASE 1]
  } // [ELECTRON PHASE 1]
} // [ELECTRON PHASE 1]

// ─── Window creation ──────────────────────────────────────────────────────────

function createWindow(url) { // [ELECTRON PHASE 1]
  mainWindow = new BrowserWindow({ // [ELECTRON PHASE 1]
    width: 1280, // [ELECTRON PHASE 1]
    height: 800, // [ELECTRON PHASE 1]
    title: "PansGPT", // [ELECTRON PHASE 1]
    // frame: true is the Electron default — standard OS window chrome.
    // Do NOT set frame: false here — that's Phase 2 scope.
    frame: true, // [ELECTRON PHASE 1]
    contextIsolation: true, // [ELECTRON PHASE 1] — do not disable; security default
    webPreferences: { // [ELECTRON PHASE 1]
      nodeIntegration: false, // [ELECTRON PHASE 1] — do not enable; security default
      contextIsolation: true, // [ELECTRON PHASE 1]
      sandbox: true, // [ELECTRON PHASE 1]
      preload: path.join(__dirname, "preload.js"), // [ELECTRON PHASE 1]
    }, // [ELECTRON PHASE 1]
  }); // [ELECTRON PHASE 1]

  mainWindow.loadURL(url); // [ELECTRON PHASE 1]

  mainWindow.on("closed", () => { // [ELECTRON PHASE 1]
    mainWindow = null; // [ELECTRON PHASE 1]
  }); // [ELECTRON PHASE 1]
} // [ELECTRON PHASE 1]

// ─── Single Instance Lock ───────────────────────────────────────────────────────

// [ELECTRON PHASE 1 RELIABILITY] Enforce single instance lock before spawning server/windows
const gotTheLock = app.requestSingleInstanceLock(); // [ELECTRON PHASE 1 RELIABILITY]

if (!gotTheLock) { // [ELECTRON PHASE 1 RELIABILITY]
  console.log("[ELECTRON PHASE 1 RELIABILITY] Another instance is already running. Quitting duplicate instance."); // [ELECTRON PHASE 1 RELIABILITY]
  app.quit(); // [ELECTRON PHASE 1 RELIABILITY]
} else { // [ELECTRON PHASE 1 RELIABILITY]
  app.on("second-instance", () => { // [ELECTRON PHASE 1 RELIABILITY]
    // Someone tried to run a second instance, focus our window.
    if (mainWindow) { // [ELECTRON PHASE 1 RELIABILITY]
      if (mainWindow.isMinimized()) mainWindow.restore(); // [ELECTRON PHASE 1 RELIABILITY]
      mainWindow.focus(); // [ELECTRON PHASE 1 RELIABILITY]
    } // [ELECTRON PHASE 1 RELIABILITY]
  }); // [ELECTRON PHASE 1 RELIABILITY]
} // [ELECTRON PHASE 1 RELIABILITY]

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => { // [ELECTRON PHASE 1]
  const isDevMode = process.env.ELECTRON_DEV === "true"; // [ELECTRON PHASE 1]

  if (isDevMode) { // [ELECTRON PHASE 1]
    // ── DEV MODE ──────────────────────────────────────────────────────────────
    // Assumes `npm run dev` (or `next dev`) is already running in another terminal on port 3000.
    // Do NOT spawn a child process here — fast-iteration path only.
    console.log("[ELECTRON PHASE 1] Dev mode: connecting to http://localhost:3000"); // [ELECTRON PHASE 1]
    createWindow("http://localhost:3000"); // [ELECTRON PHASE 1]
  } else { // [ELECTRON PHASE 1]
    // ── PRODUCTION / PACKAGED MODE ────────────────────────────────────────────
    // Locate the standalone server.js relative to the Electron __dirname.
    // In the packaged app, electron-builder puts main.js at the app root,
    // and the standalone build is at frontend/.next-electron/standalone/server.js
    // from the repo root. electron-builder copies files preserving this structure.
    const serverScript = path.join( // [ELECTRON PHASE 1]
      __dirname, // [ELECTRON PHASE 1]
      "..", // [ELECTRON PHASE 1] up from electron/ to repo root
      "frontend", // [ELECTRON PHASE 1]
      ".next-electron", // [ELECTRON PHASE 1]
      "standalone", // [ELECTRON PHASE 1]
      "server.js" // [ELECTRON PHASE 1]
    ); // [ELECTRON PHASE 1]

    let port; // [ELECTRON PHASE 1]
    try { // [ELECTRON PHASE 1]
      port = await findFreePort(); // [ELECTRON PHASE 1]
    } catch (err) { // [ELECTRON PHASE 1]
      dialog.showErrorBox( // [ELECTRON PHASE 1]
        "PansGPT — Startup Error", // [ELECTRON PHASE 1]
        `Could not find a free port to start the app server.\n\n${err.message}` // [ELECTRON PHASE 1]
      ); // [ELECTRON PHASE 1]
      app.quit(); // [ELECTRON PHASE 1]
      return; // [ELECTRON PHASE 1]
    } // [ELECTRON PHASE 1]

    const spawnStartTime = Date.now(); // [ELECTRON PHASE 1 RELIABILITY]
    console.log(`[ELECTRON PHASE 1 RELIABILITY] [${new Date().toISOString()}] Spawning standalone server on port ${port}`); // [ELECTRON PHASE 1 RELIABILITY]

    // Spawn the Next.js standalone server.
    // In development/unpackaged mode (!app.isPackaged), spawn system 'node' directly.
    // In packaged mode (app.isPackaged), spawn process.execPath with ELECTRON_RUN_AS_NODE=1.
    const nodeExecutable = app.isPackaged ? process.execPath : "node"; // [ELECTRON PHASE 1 FIX]
    const spawnEnv = { // [ELECTRON PHASE 1 FIX]
      ...process.env, // [ELECTRON PHASE 1]
      PORT: String(port), // [ELECTRON PHASE 1]
      HOSTNAME: "127.0.0.1", // [ELECTRON PHASE 1] bind loopback only; do not expose LAN
      NODE_ENV: "production", // [ELECTRON PHASE 1]
    }; // [ELECTRON PHASE 1 FIX]

    if (app.isPackaged) { // [ELECTRON PHASE 1 FIX]
      spawnEnv.ELECTRON_RUN_AS_NODE = "1"; // [ELECTRON PHASE 1 FIX]
    } // [ELECTRON PHASE 1 FIX]

    serverProcess = spawn(nodeExecutable, [serverScript], { // [ELECTRON PHASE 1 FIX]
      cwd: path.dirname(serverScript), // [ELECTRON PHASE 1 RELIABILITY] set explicit working directory to standalone folder
      env: spawnEnv, // [ELECTRON PHASE 1 FIX]
      stdio: ["ignore", "pipe", "pipe"], // [ELECTRON PHASE 1]
      detached: false, // [ELECTRON PHASE 1] do NOT detach — we want to own this process
    }); // [ELECTRON PHASE 1]

    serverProcess.stdout.on("data", (d) => { // [ELECTRON PHASE 1 RELIABILITY]
      const elapsed = Date.now() - spawnStartTime; // [ELECTRON PHASE 1 RELIABILITY]
      const lines = d.toString().trim().split("\n"); // [ELECTRON PHASE 1 RELIABILITY]
      for (const line of lines) { // [ELECTRON PHASE 1 RELIABILITY]
        if (line) console.log(`[ELECTRON PHASE 1 RELIABILITY] [+${elapsed}ms] [server:stdout] ${line}`); // [ELECTRON PHASE 1 RELIABILITY]
      } // [ELECTRON PHASE 1 RELIABILITY]
    }); // [ELECTRON PHASE 1 RELIABILITY]

    serverProcess.stderr.on("data", (d) => { // [ELECTRON PHASE 1 RELIABILITY]
      const elapsed = Date.now() - spawnStartTime; // [ELECTRON PHASE 1 RELIABILITY]
      const lines = d.toString().trim().split("\n"); // [ELECTRON PHASE 1 RELIABILITY]
      for (const line of lines) { // [ELECTRON PHASE 1 RELIABILITY]
        if (line) console.error(`[ELECTRON PHASE 1 RELIABILITY] [+${elapsed}ms] [server:stderr] ${line}`); // [ELECTRON PHASE 1 RELIABILITY]
      } // [ELECTRON PHASE 1 RELIABILITY]
    }); // [ELECTRON PHASE 1 RELIABILITY]

    serverProcess.on("error", (err) => { // [ELECTRON PHASE 1]
      console.error("[ELECTRON PHASE 1] Server process error:", err); // [ELECTRON PHASE 1]
    }); // [ELECTRON PHASE 1]

    serverProcess.on("exit", (code, signal) => { // [ELECTRON PHASE 1]
      const elapsed = Date.now() - spawnStartTime; // [ELECTRON PHASE 1 RELIABILITY]
      console.log(`[ELECTRON PHASE 1 RELIABILITY] [+${elapsed}ms] Server process exited (code=${code}, signal=${signal})`); // [ELECTRON PHASE 1 RELIABILITY]
      if (!isQuitting && mainWindow) { // [ELECTRON PHASE 1]
        // Server died unexpectedly while app is still open
        dialog.showErrorBox( // [ELECTRON PHASE 1]
          "PansGPT — Server Stopped", // [ELECTRON PHASE 1]
          "The internal server stopped unexpectedly. Please restart the application." // [ELECTRON PHASE 1]
        ); // [ELECTRON PHASE 1]
      } // [ELECTRON PHASE 1]
    }); // [ELECTRON PHASE 1]

    // Poll until the server is ready before showing the window
    try { // [ELECTRON PHASE 1]
      console.log(`[ELECTRON PHASE 1 RELIABILITY] [${new Date().toISOString()}] Starting server poll loop on port ${port}...`); // [ELECTRON PHASE 1 RELIABILITY]
      await waitForServer(port, 45000); // [ELECTRON API CONFIG] 45s safety ceiling for cold-boot route setup under load
      const elapsed = Date.now() - spawnStartTime; // [ELECTRON PHASE 1 RELIABILITY]
      console.log(`[ELECTRON PHASE 1 RELIABILITY] [+${elapsed}ms] Server poll loop SUCCESS! Server is listening on http://127.0.0.1:${port}`); // [ELECTRON PHASE 1 RELIABILITY]
    } catch (err) { // [ELECTRON PHASE 1]
      const elapsed = Date.now() - spawnStartTime; // [ELECTRON PHASE 1 RELIABILITY]
      console.error(`[ELECTRON PHASE 1 RELIABILITY] [+${elapsed}ms] Server poll loop FAILED (timeout): ${err.message}`); // [ELECTRON PHASE 1 RELIABILITY]
      killServerProcess(); // [ELECTRON PHASE 1]
      dialog.showErrorBox( // [ELECTRON PHASE 1]
        "PansGPT — Startup Timeout", // [ELECTRON PHASE 1]
        `The app server did not start in time.\n\n${err.message}\n\nCheck that the app was packaged correctly.` // [ELECTRON PHASE 1]
      ); // [ELECTRON PHASE 1]
      app.quit(); // [ELECTRON PHASE 1]
      return; // [ELECTRON PHASE 1]
    } // [ELECTRON PHASE 1]

    console.log(`[ELECTRON PHASE 1] Server ready — opening window at http://127.0.0.1:${port}`); // [ELECTRON PHASE 1]
    createWindow(`http://127.0.0.1:${port}`); // [ELECTRON PHASE 1]

  } // [ELECTRON PHASE 1]
}); // [ELECTRON PHASE 1]

// Kill the server when the last window closes (Windows/Linux behavior)
app.on("window-all-closed", () => { // [ELECTRON PHASE 1]
  isQuitting = true; // [ELECTRON PHASE 1]
  killServerProcess(); // [ELECTRON PHASE 1]
  app.quit(); // [ELECTRON PHASE 1]
}); // [ELECTRON PHASE 1]

// Additional safety net: kill server before the app fully exits
app.on("before-quit", () => { // [ELECTRON PHASE 1]
  isQuitting = true; // [ELECTRON PHASE 1]
  killServerProcess(); // [ELECTRON PHASE 1]
}); // [ELECTRON PHASE 1]
