// Runs in the renderer's context but with access to a select few Node/Electron
// APIs (contextIsolation is on, nodeIntegration is off in main.js — this is
// the one sanctioned bridge between them). Only exposes exactly what the
// update-ready banner needs, nothing broader.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ocho", {
  onUpdateReady: (callback) => {
    const listener = (event, version) => callback(version);
    ipcRenderer.on("update-ready", listener);
    return () => ipcRenderer.removeListener("update-ready", listener);
  },
  restartAndInstall: () => ipcRenderer.send("restart-and-install"),
});
