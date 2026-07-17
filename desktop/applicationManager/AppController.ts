import { ActionEngine } from '../../src/main/agent/actions/ActionEngine';
import { ScreenPerception } from '../../vision/screenReader/ScreenPerception';
import { VerificationEngine } from '../../ai/verificationEngine/VerificationEngine';
import { AppLauncher } from './AppLauncher';
import { logger } from '../../src/main/agent/core/Logger';

export abstract class AppController {
  protected actions: ActionEngine;
  protected perception: ScreenPerception;
  protected verifier: VerificationEngine;
  protected appLauncher: AppLauncher;
  protected appName: string;

  constructor(appName: string, actions: ActionEngine, perception: ScreenPerception, verifier: VerificationEngine) {
    this.appName = appName;
    this.actions = actions;
    this.perception = perception;
    this.verifier = verifier;
    this.appLauncher = new AppLauncher(this.actions.keyboard);
  }

  /**
   * Opens the application. Must wait until it is fully loaded.
   */
  public async open(originalRequest?: string): Promise<boolean> {
     const launched = await this.launchApp(originalRequest);
     if (!launched) {
        logger.error(`Failed to launch or focus application: ${this.appName}`);
        return false;
     }

     return await this.waitForReadiness();
  }

  protected abstract launchApp(originalRequest?: string): Promise<boolean>;

  /**
   * Waits for the application UI to be fully ready.
   */
  public async waitForReadiness(timeoutMs = 10000): Promise<boolean> {
     logger.info(`Waiting for ${this.appName} to be ready...`);
     const start = Date.now();
     while (Date.now() - start < timeoutMs) {
        if (await this.isActive()) {
           // Allow extra time for content to paint
           await this.wait(1000); 
           return true;
        }
        await this.wait(500);
     }
     logger.warn(`Timeout waiting for ${this.appName} to be ready.`);
     return false;
  }

  public async isAlreadyRunning(): Promise<boolean> {
     return await this.isActive();
  }

  public async activate(originalRequest?: string): Promise<boolean> {
     // Fallback if needed, but AppLauncher handles this centrally now
     return await this.appLauncher.launchApp(originalRequest || this.appName);
  }

  /**
   * Verifies if the application is currently the active window.
   */
  public async isActive(): Promise<boolean> {
    const activeWindow = await this.perception.getActiveWindow();
    return this.verifyIsApp(activeWindow.app) || this.verifyIsApp(activeWindow.title);
  }

  protected abstract verifyIsApp(windowIdentifier: string): boolean;

  protected wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Safe click handler that attempts to find an element before clicking.
   */
  protected async safeClick(elementName: string): Promise<boolean> {
    logger.info(`Attempting to click: ${elementName}`);
    const coords = await this.perception.findElementCoordinates(elementName);
    
    if (coords) {
      await this.actions.moveMouseSmooth(coords.x, coords.y);
      await this.actions.click();
      return true;
    } else {
      logger.warn(`Could not find element: ${elementName}`);
      return false;
    }
  }
}
