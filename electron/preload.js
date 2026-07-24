// [ELECTRON PHASE 1] — Electron preload script for PansGPT desktop shell
// Runs in the renderer's isolated context (contextIsolation: true, nodeIntegration: false).
// Exposes a minimal, forward-groundwork surface for Phase 3's platform-check pattern.
// Do NOT expand this API surface until Phase 3 — keep it to platform/version only.

"use strict";

const { contextBridge } = require("electron"); // [ELECTRON PHASE 1]

// [ELECTRON PHASE 1] Expose a minimal window.electronAPI object.
// version: app.getVersion() requires ipcMain round-trip with remote; since this is Phase 1
// groundwork only (not yet consumed by the app), we use process.env.npm_package_version
// which is set by npm at launch time and is sufficient for Phase 3's platform-check pattern.
// This will be replaced with a proper ipcRenderer.invoke('get-version') call in Phase 3.
contextBridge.exposeInMainWorld("electronAPI", { // [ELECTRON PHASE 1]
  platform: "electron", // [ELECTRON PHASE 1] — identifies runtime as Electron (not web browser)
  version: process.env.npm_package_version ?? "1.0.0", // [ELECTRON PHASE 1]
}); // [ELECTRON PHASE 1]
