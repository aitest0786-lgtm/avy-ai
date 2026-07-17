import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('avyAPI', {
  // Memory
  getMemories: (userId: string) => ipcRenderer.invoke('memory:getMemories', userId),
  saveMemory: (userId: string, fact: string, category: string, importance: number, archived?: boolean, pinned?: boolean, notes?: string) => 
    ipcRenderer.invoke('memory:saveMemory', userId, fact, category, importance, archived, pinned, notes),
  updateMemory: (userId: string, id: string, fact: string, category: string, importance: number, archived?: boolean, pinned?: boolean, notes?: string) =>
    ipcRenderer.invoke('memory:updateMemory', userId, id, fact, category, importance, archived, pinned, notes),
  forgetMemory: (userId: string, id: string) => ipcRenderer.invoke('memory:forgetMemory', userId, id),
  isMemoryPaused: (userId: string) => ipcRenderer.invoke('memory:isMemoryPaused', userId),
  setMemoryPaused: (userId: string, paused: boolean) => ipcRenderer.invoke('memory:setMemoryPaused', userId, paused),
  getFormattedMemoriesForPrompt: (userId: string, essentialOnly: boolean = false) => 
    ipcRenderer.invoke('memory:getFormattedMemoriesForPrompt', userId, essentialOnly),
  
  // Desktop Automation
  requestDesktopPermission: () => ipcRenderer.invoke('desktop:requestPermission'),
  getScreenState: () => ipcRenderer.invoke('desktop:getScreenState'),
  mouseMove: (x: number, y: number) => ipcRenderer.invoke('desktop:mouseMove', x, y),
  mouseClick: (type: 'left' | 'right' | 'double') => ipcRenderer.invoke('desktop:mouseClick', type),
  mouseDragDrop: (fromX: number, fromY: number, toX: number, toY: number) => ipcRenderer.invoke('desktop:mouseDragDrop', fromX, fromY, toX, toY),
  keyboardType: (text: string) => ipcRenderer.invoke('desktop:keyboardType', text),
  keyboardPress: (key: string) => ipcRenderer.invoke('desktop:keyboardPress', key),
  launchApp: (appName: string) => ipcRenderer.invoke('desktop:launchApp', appName),
  windowControl: (controlType: 'minimize' | 'maximize' | 'close') => ipcRenderer.invoke('desktop:windowControl', controlType),

  // Screen Capture
  getScreenSources: () => ipcRenderer.invoke('screen:getSources'),

  // Environment info
  getEnv: (key: string) => ipcRenderer.invoke('env:get', key),

  // WebEngine Specific operations
  runWebEngineSelfTest: () => ipcRenderer.invoke('webengine:run-self-test'),
  getWebEngineSettings: () => ipcRenderer.invoke('webengine:get-settings'),
  updateWebEngineSettings: (settings: any) => ipcRenderer.invoke('webengine:update-settings', settings),
  setWebEngineGPUMode: (mode: 'hardware' | 'software') => ipcRenderer.invoke('webengine:set-gpu-mode', mode),
  logWebEngineEvent: (type: 'info' | 'warning' | 'error' | 'success', text: string) => 
    ipcRenderer.invoke('webengine:log', { type, text }),
  clearWebEngineSession: (partition?: string) => ipcRenderer.invoke('webengine:clear-session', partition),

  // WebEngine Events listeners
  onGPUCrashed: (callback: (details: any) => void) => {
    const listener = (_e: any, details: any) => callback(details);
    ipcRenderer.on('webengine:gpu-crashed', listener);
    return () => ipcRenderer.off('webengine:gpu-crashed', listener);
  },
  onRendererCrashed: (callback: (details: any) => void) => {
    const listener = (_e: any, details: any) => callback(details);
    ipcRenderer.on('webengine:renderer-crashed', listener);
    return () => ipcRenderer.off('webengine:renderer-crashed', listener);
  },
  onCertificateError: (callback: (details: any) => void) => {
    const listener = (_e: any, details: any) => callback(details);
    ipcRenderer.on('webengine:certificate-error', listener);
    return () => ipcRenderer.off('webengine:certificate-error', listener);
  }
});
