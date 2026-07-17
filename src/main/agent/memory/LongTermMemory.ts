import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { logger } from '../core/Logger';

export interface MemoryData {
  preferences: Record<string, string>;
  failureHistory: Array<{ taskId: string; error: string; timestamp: number }>;
}

export class LongTermMemory {
  private memoryFilePath: string;
  private data: MemoryData;

  constructor() {
    const userDataPath = app ? app.getPath('userData') : path.join(__dirname, '../../../../');
    this.memoryFilePath = path.join(userDataPath, 'avy_memory.json');
    this.data = this.loadMemory();
  }

  private loadMemory(): MemoryData {
    try {
      if (fs.existsSync(this.memoryFilePath)) {
        const fileContent = fs.readFileSync(this.memoryFilePath, 'utf-8');
        return JSON.parse(fileContent) as MemoryData;
      }
    } catch (error) {
      logger.error("Failed to load long-term memory", error);
    }
    return { preferences: {}, failureHistory: [] };
  }

  private saveMemory() {
    try {
      fs.writeFileSync(this.memoryFilePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      logger.error("Failed to save long-term memory", error);
    }
  }

  public setPreference(key: string, value: string) {
    this.data.preferences[key] = value;
    this.saveMemory();
    logger.info(`Preference updated: ${key} = ${value}`);
  }

  public getPreference(key: string): string | undefined {
    return this.data.preferences[key];
  }

  public recordFailure(taskId: string, error: string) {
    this.data.failureHistory.push({
      taskId,
      error,
      timestamp: Date.now()
    });
    // Keep only last 50 failures
    if (this.data.failureHistory.length > 50) {
      this.data.failureHistory.shift();
    }
    this.saveMemory();
  }

  public getFailureHistory() {
    return this.data.failureHistory;
  }
}
