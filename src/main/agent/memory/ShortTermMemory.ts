import { logger } from '../core/Logger';
import { TaskStep } from '../../../../ai/planner/TaskPlanner';

export interface AppContext {
  appName: string;
  windowTitle: string;
  isActive: boolean;
  pid?: number;
}

export class ShortTermMemory {
  private history: TaskStep[] = [];
  private currentContext: Record<string, any> = {};
  private activeApps: Map<string, AppContext> = new Map();
  private verificationHistory: Map<string, boolean> = new Map();

  constructor() {}

  public recordStep(step: TaskStep) {
    this.history.push(step);
    logger.info(`Recorded step in short-term memory: ${step.description}`);
  }

  public getHistory(): TaskStep[] {
    return this.history;
  }

  public getRecentFailures(): TaskStep[] {
    return this.history.filter(step => step.status === 'failed');
  }

  public setContext(key: string, value: any) {
    this.currentContext[key] = value;
  }

  public getContext(key: string): any {
    return this.currentContext[key];
  }

  public updateActiveApp(app: AppContext) {
    this.activeApps.set(app.appName.toLowerCase(), app);
    logger.info(`Updated active app context: ${app.appName}`);
  }

  public getActiveApp(appName: string): AppContext | undefined {
    return this.activeApps.get(appName.toLowerCase());
  }

  public isAppRunning(appName: string): boolean {
    const app = this.getActiveApp(appName);
    return app !== undefined && app.isActive;
  }

  public recordVerification(stepId: string, success: boolean) {
    this.verificationHistory.set(stepId, success);
  }

  public getVerificationStatus(stepId: string): boolean | undefined {
    return this.verificationHistory.get(stepId);
  }

  public clear() {
    this.history = [];
    this.currentContext = {};
    this.activeApps.clear();
    this.verificationHistory.clear();
    logger.info("Short-term memory cleared.");
  }
}
