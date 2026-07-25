// [ELECTRON PHASE 1] — Electron preload script for PansGPT desktop shell
// Runs in the renderer's isolated context (contextIsolation: true, nodeIntegration: false).
// Exposes a minimal, forward-groundwork surface for Phase 3's platform-check pattern.
// Do NOT expand this API surface until Phase 3 — keep it to platform/version only.

"use strict";

const { contextBridge, ipcRenderer } = require("electron"); // [DESKTOP TABS]

contextBridge.exposeInMainWorld("electronAPI", { // [ELECTRON PHASE 1]
  platform: "electron", // [ELECTRON PHASE 1] — identifies runtime as Electron (not web browser)
  version: process.env.npm_package_version ?? "1.0.0", // [ELECTRON PHASE 1]
  getPersistedTabs: () => ipcRenderer.invoke("tabs:get"), // [DESKTOP TABS]
  setPersistedTabs: (data) => ipcRenderer.invoke("tabs:set", data), // [DESKTOP TABS]
  getAuthItem: (key) => ipcRenderer.invoke("auth:getItem", key), // [DESKTOP AUTH PERSISTENCE]
  setAuthItem: (key, value) => ipcRenderer.invoke("auth:setItem", key, value), // [DESKTOP AUTH PERSISTENCE]
  removeAuthItem: (key) => ipcRenderer.invoke("auth:removeItem", key), // [DESKTOP AUTH PERSISTENCE]
}); // [ELECTRON PHASE 1]
