// src/preload/index.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("avyAPI", {
  // Memory
  getMemories: (userId) => import_electron.ipcRenderer.invoke("memory:getMemories", userId),
  saveMemory: (userId, fact, category, importance, archived, pinned, notes) => import_electron.ipcRenderer.invoke("memory:saveMemory", userId, fact, category, importance, archived, pinned, notes),
  updateMemory: (userId, id, fact, category, importance, archived, pinned, notes) => import_electron.ipcRenderer.invoke("memory:updateMemory", userId, id, fact, category, importance, archived, pinned, notes),
  forgetMemory: (userId, id) => import_electron.ipcRenderer.invoke("memory:forgetMemory", userId, id),
  isMemoryPaused: (userId) => import_electron.ipcRenderer.invoke("memory:isMemoryPaused", userId),
  setMemoryPaused: (userId, paused) => import_electron.ipcRenderer.invoke("memory:setMemoryPaused", userId, paused),
  getFormattedMemoriesForPrompt: (userId, essentialOnly = false) => import_electron.ipcRenderer.invoke("memory:getFormattedMemoriesForPrompt", userId, essentialOnly),
  // Desktop Automation
  requestDesktopPermission: () => import_electron.ipcRenderer.invoke("desktop:requestPermission"),
  getScreenState: () => import_electron.ipcRenderer.invoke("desktop:getScreenState"),
  mouseMove: (x, y) => import_electron.ipcRenderer.invoke("desktop:mouseMove", x, y),
  mouseClick: (type) => import_electron.ipcRenderer.invoke("desktop:mouseClick", type),
  mouseDragDrop: (fromX, fromY, toX, toY) => import_electron.ipcRenderer.invoke("desktop:mouseDragDrop", fromX, fromY, toX, toY),
  keyboardType: (text) => import_electron.ipcRenderer.invoke("desktop:keyboardType", text),
  keyboardPress: (key) => import_electron.ipcRenderer.invoke("desktop:keyboardPress", key),
  launchApp: (appName) => import_electron.ipcRenderer.invoke("desktop:launchApp", appName),
  windowControl: (controlType) => import_electron.ipcRenderer.invoke("desktop:windowControl", controlType),
  // Screen Capture
  getScreenSources: () => import_electron.ipcRenderer.invoke("screen:getSources"),
  // Environment info
  getEnv: (key) => import_electron.ipcRenderer.invoke("env:get", key),
  // WebEngine Specific operations
  runWebEngineSelfTest: () => import_electron.ipcRenderer.invoke("webengine:run-self-test"),
  getWebEngineSettings: () => import_electron.ipcRenderer.invoke("webengine:get-settings"),
  updateWebEngineSettings: (settings) => import_electron.ipcRenderer.invoke("webengine:update-settings", settings),
  setWebEngineGPUMode: (mode) => import_electron.ipcRenderer.invoke("webengine:set-gpu-mode", mode),
  logWebEngineEvent: (type, text) => import_electron.ipcRenderer.invoke("webengine:log", { type, text }),
  clearWebEngineSession: (partition) => import_electron.ipcRenderer.invoke("webengine:clear-session", partition),
  // WebEngine Events listeners
  onGPUCrashed: (callback) => {
    const listener = (_e, details) => callback(details);
    import_electron.ipcRenderer.on("webengine:gpu-crashed", listener);
    return () => import_electron.ipcRenderer.off("webengine:gpu-crashed", listener);
  },
  onRendererCrashed: (callback) => {
    const listener = (_e, details) => callback(details);
    import_electron.ipcRenderer.on("webengine:renderer-crashed", listener);
    return () => import_electron.ipcRenderer.off("webengine:renderer-crashed", listener);
  },
  onCertificateError: (callback) => {
    const listener = (_e, details) => callback(details);
    import_electron.ipcRenderer.on("webengine:certificate-error", listener);
    return () => import_electron.ipcRenderer.off("webengine:certificate-error", listener);
  }
});
