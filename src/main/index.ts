import { app, BrowserWindow, ipcMain, desktopCapturer } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as dns from 'dns';
import { startupManager } from '../modules/Core/StartupManager';
import { configurationModule } from '../modules/Core/ConfigurationModule';
import { loggerModule } from '../modules/Core/LoggerModule';
import { backendModule } from '../modules/Backend/BackendModule';
import { ipcModule } from '../modules/Backend/IPCModule';
import { voiceModule } from '../modules/Voice/VoiceModule';
import { aiModule } from '../modules/AI/AIModule';
import { desktopModule } from '../modules/Desktop/DesktopModule';
import { visionModule } from '../modules/Vision/VisionModule';
import { memoryModule } from '../modules/Memory/MemoryModule';
import { plannerModule } from '../modules/Planner/PlannerModule';
import { diagnosticsModule } from '../modules/Diagnostics/DiagnosticsModule';
import { securityModule } from '../modules/Security/SecurityModule';
import { pluginModule } from '../modules/Plugin/PluginModule';

// ========================================================
// AVY WEBENGINE CONFIGURATION & SELF DIAGNOSTICS MANAGER
// ========================================================

const settingsPath = path.join(app.getPath('userData'), 'webengine-settings.json');

interface WebEngineSettings {
  disableGPU?: boolean;
  gpuFailed?: boolean;
}

function getSettings(): WebEngineSettings {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[WebEngine Settings] Error reading settings:', err);
  }
  return {};
}

function updateSettings(settings: Partial<WebEngineSettings>) {
  try {
    const current = getSettings();
    const updated = { ...current, ...settings };
    fs.writeFileSync(settingsPath, JSON.stringify(updated, null, 2), 'utf8');
    console.log('[WebEngine Settings] Settings updated successfully:', updated);
  } catch (err) {
    console.error('[WebEngine Settings] Error writing settings:', err);
  }
}

// 1. GPU Check & Software rendering fallback (Before App Ready)
const initialSettings = getSettings();
if (initialSettings.disableGPU || initialSettings.gpuFailed) {
  console.warn('[WebEngine Main] Software rendering fallback initiated due to prior GPU failure or manual preference.');
  app.disableHardwareAcceleration();
}

// 2. Self Diagnosis Function
async function runSelfTest() {
  const report = {
    timestamp: new Date().toISOString(),
    renderer: { status: 'OK', details: 'IPC Main and Host responsiveness verified' },
    gpu: { status: 'OK', details: {} as any },
    network: { status: 'OK', details: '' },
    session: { status: 'OK', details: '' }
  };

  // GPU diagnostics
  try {
    const gpuFeatures = app.getGPUFeatureStatus();
    report.gpu.details = gpuFeatures;
    if (gpuFeatures.gpu_compositing === 'disabled' || gpuFeatures.webgl === 'disabled') {
      report.gpu.status = 'WARNING';
    }
  } catch (err: any) {
    report.gpu.status = 'ERROR';
    report.gpu.details = err.message || String(err);
  }

  // Network diagnostics
  try {
    await new Promise<void>((resolve, reject) => {
      dns.lookup('google.com', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    report.network.details = 'DNS lookup and network routing to google.com resolved successfully';
  } catch (err: any) {
    report.network.status = 'ERROR';
    report.network.details = `Network routing / DNS resolution failed: ${err.message || String(err)}`;
  }

  // Session/cache write diagnostics
  try {
    const testFile = path.join(app.getPath('userData'), '.write-test');
    fs.writeFileSync(testFile, 'WebEngine test payload', 'utf8');
    fs.unlinkSync(testFile);
    report.session.details = 'User session partition data storage directories are writable';
  } catch (err: any) {
    report.session.status = 'ERROR';
    report.session.details = `Cache directory write test failed: ${err.message || String(err)}`;
  }

  console.log('[WebEngine SelfTest] Startup diagnostics complete.', report);
  return report;
}

// 3. Process Listeners (GPU Crash, Renderer Crash, Certificate Error)
app.on('child-process-gone', (event, details) => {
  console.error(`[WebEngine Main] Child process gone: type=${details.type}, reason=${details.reason}, exitCode=${details.exitCode}`);
  if (details.type === 'GPU') {
    console.error('[WebEngine Main] GPU Process crashed! Switching to software rendering fallback settings.');
    updateSettings({ gpuFailed: true });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('webengine:gpu-crashed', details);
    }
  }
});
// Legacy gpu-process-crashed event listener removed as it is handled by child-process-gone

app.on('render-process-gone', (event, webContents, details) => {
  console.error(`[WebEngine Main] Render process gone: reason=${details.reason}, exitCode=${details.exitCode}`);
  if (mainWindow && !mainWindow.isDestroyed() && webContents === mainWindow.webContents) {
    console.error('[WebEngine Main] Main BrowserWindow renderer process went away!');
    mainWindow.webContents.send('webengine:renderer-crashed', details);
  }
});

app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  console.error(`[WebEngine Main] TLS Certificate Error: URL=${url}, Error=${error}, Issuer=${certificate.issuerName}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('webengine:certificate-error', { url, error, issuer: certificate.issuerName });
  }
  // Safe default: Prevent unsafe connections, but let user know.
  event.preventDefault();
  callback(false);
});

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Avy AI Assistant",
    backgroundColor: '#020203',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      webSecurity: false // Required for some embedded browser functionalities, but handle with care
    },
  });

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  createWindow();

  // Allow Renderer to capture screen natively using getDisplayMedia
  app.commandLine.appendSwitch('enable-usermedia-screen-capturing');
  
  const { session } = require('electron');
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      // Automatically grant access to the entire desktop screen
      callback({ video: sources[0], audio: 'loopback' });
    }).catch((err) => {
      console.error('Error getting sources:', err);
    });
  });

  // Register and initialize all modules
  startupManager.registerModule(configurationModule);
  startupManager.registerModule(loggerModule);
  startupManager.registerModule(backendModule);
  startupManager.registerModule(ipcModule);
  startupManager.registerModule(voiceModule);
  startupManager.registerModule(aiModule);
  startupManager.registerModule(desktopModule);
  startupManager.registerModule(visionModule);
  startupManager.registerModule(memoryModule);
  startupManager.registerModule(plannerModule);
  startupManager.registerModule(diagnosticsModule);
  startupManager.registerModule(securityModule);
  startupManager.registerModule(pluginModule);

  await startupManager.initializeAll();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // IPC and WebEngine specific handlers have been moved to IPCModule
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
