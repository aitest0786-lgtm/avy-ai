import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { IModule } from './IModule';
import { logger } from '../../main/agent/core/Logger';

export interface WebEngineSettings {
  disableGPU?: boolean;
  gpuFailed?: boolean;
}

export class ConfigurationModule implements IModule {
  public readonly name = 'Configuration';
  private settingsPath: string;
  private currentSettings: WebEngineSettings = {};

  constructor() {
    this.settingsPath = path.join(app.getPath('userData'), 'webengine-settings.json');
  }

  public async initialize(): Promise<boolean> {
    logger.info('Initializing Configuration Module...');
    try {
      this.currentSettings = this.loadSettings();
      
      if (this.currentSettings.disableGPU || this.currentSettings.gpuFailed) {
        logger.warn('Software rendering fallback initiated due to prior GPU failure or manual preference.');
        app.disableHardwareAcceleration();
      }

      logger.info('Configuration Module initialized successfully.');
      return true;
    } catch (error) {
      logger.error('Failed to load configuration:', error);
      return false; 
    }
  }

  public async shutdown(): Promise<void> {
    logger.info('Shutting down Configuration Module...');
  }

  public status(): any {
    return {
      status: 'OK',
      settingsPath: this.settingsPath,
      settings: this.currentSettings
    };
  }

  public getSettings(): WebEngineSettings {
    return this.currentSettings;
  }

  public updateSettings(settings: Partial<WebEngineSettings>) {
    try {
      this.currentSettings = { ...this.currentSettings, ...settings };
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.currentSettings, null, 2), 'utf8');
      logger.info('Settings updated successfully:', this.currentSettings);
    } catch (err) {
      logger.error('Error writing settings:', err);
    }
  }

  private loadSettings(): WebEngineSettings {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (err) {
      logger.error('Error reading settings:', err);
    }
    return {};
  }
}

export const configurationModule = new ConfigurationModule();
