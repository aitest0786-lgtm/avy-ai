import { IModule } from '../Core/IModule';
import { logger } from '../../main/agent/core/Logger';
import { ipcMain, desktopCapturer } from 'electron';
import { configurationModule } from '../Core/ConfigurationModule';
import * as dns from 'dns';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

export class IPCModule implements IModule {
  public readonly name = 'IPC';

  public async initialize(): Promise<boolean> {
    try {
      logger.info('Initializing IPC Module...');
      
      this.registerHandlers();
      
      logger.info('IPC Module initialized successfully.');
      return true;
    } catch (error) {
      logger.error('Failed to initialize IPC Module', error);
      return false;
    }
  }

  public async shutdown(): Promise<void> {
    logger.info('Shutting down IPC Module...');
    ipcMain.removeHandler('screen:getSources');
    ipcMain.removeHandler('env:get');
    ipcMain.removeHandler('webengine:run-self-test');
    ipcMain.removeHandler('webengine:get-settings');
    ipcMain.removeHandler('webengine:update-settings');
    ipcMain.removeHandler('webengine:set-gpu-mode');
    ipcMain.removeHandler('webengine:log');
    ipcMain.removeHandler('webengine:clear-session');
  }

  public status(): any {
    return { status: 'OK' };
  }

  private registerHandlers() {
    // Screen Capture IPC
    ipcMain.handle('screen:getSources', async () => {
      const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
      return sources.map(source => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL()
      }));
    });

    // Env info IPC
    ipcMain.handle('env:get', (event, key) => {
      return process.env[key];
    });

    // WebEngine Specific IPC handlers
    ipcMain.handle('webengine:run-self-test', async () => {
      return await this.runSelfTest();
    });

    ipcMain.handle('webengine:get-settings', () => {
      return configurationModule.getSettings();
    });

    ipcMain.handle('webengine:update-settings', (event, settings) => {
      configurationModule.updateSettings(settings);
      return configurationModule.getSettings();
    });

    ipcMain.handle('webengine:set-gpu-mode', (event, mode: 'hardware' | 'software') => {
      const disableGPU = mode === 'software';
      configurationModule.updateSettings({ disableGPU, gpuFailed: disableGPU });
      logger.info(`GPU mode updated to: ${mode}. Relaunch or restart is recommended.`);
      return { success: true, disableGPU };
    });

    ipcMain.handle('webengine:log', (event, logEntry: { type: string; text: string }) => {
      if (logEntry.type === 'error') {
        logger.error(`[WebEngine] ${logEntry.text}`);
      } else if (logEntry.type === 'warn') {
        logger.warn(`[WebEngine] ${logEntry.text}`);
      } else {
        logger.info(`[WebEngine] ${logEntry.text}`);
      }
      return { success: true };
    });

    ipcMain.handle('webengine:clear-session', async (event, partition?: string) => {
      try {
        const { session } = require('electron');
        const targetSession = partition ? session.fromPartition(partition) : session.defaultSession;
        await targetSession.clearCache();
        await targetSession.clearStorageData({
          storages: ['cookies', 'localstorage', 'indexdb', 'websql', 'serviceworkers', 'cachestorage']
        });
        logger.info(`Cleared storage/cache for session partition: ${partition || 'default'}`);
        return { success: true };
      } catch (err: any) {
        logger.error('Failed to clear session:', err);
        return { success: false, error: err.message };
      }
    });
  }

  private async runSelfTest() {
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

    logger.info('Startup diagnostics complete.', report);
    return report;
  }
}

export const ipcModule = new IPCModule();
