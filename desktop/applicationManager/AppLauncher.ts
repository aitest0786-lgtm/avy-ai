import { logger } from '../../src/main/agent/core/Logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import { KeyboardEngine } from '../keyboardEngine/KeyboardEngine';
import { PowerShellTemplateEngine } from '../../src/main/modules/PowerShellTemplateEngine';
import { BenchmarkManager } from '../../src/main/agent/core/BenchmarkManager';
import { CentralTaskScheduler } from '../../ai/taskScheduler/CentralTaskScheduler';

const execAsync = promisify(exec);

export type AppState = 'NOT_RUNNING' | 'LAUNCHING' | 'RUNNING' | 'CLOSING';

export class AppLauncher {
  private keyboard: KeyboardEngine;
  
  // State Machine tracker
  private static appStates = new Map<string, AppState>();
  
  // Voice command deduplication registry
  private static recentCommands = new Map<string, number>();
  private readonly DEDUPLICATION_WINDOW_MS = 2500;

  // Map user-friendly names to Executable Name and Display Name
  private appMapping: Record<string, { exe: string; display: string; cli?: string }> = {
    'vs code': { exe: 'Code', display: 'Visual Studio Code', cli: 'code' },
    'chrome': { exe: 'chrome', display: 'Google Chrome', cli: 'chrome' },
    'notepad': { exe: 'notepad', display: 'Notepad', cli: 'notepad' },
    'cmd': { exe: 'cmd', display: 'Command Prompt', cli: 'cmd' },
    'powershell': { exe: 'powershell', display: 'Windows PowerShell', cli: 'powershell' },
    'terminal': { exe: 'WindowsTerminal', display: 'Windows Terminal', cli: 'wt' },
    'whatsapp': { exe: 'WhatsApp', display: 'WhatsApp' },
    'file explorer': { exe: 'explorer', display: 'File Explorer', cli: 'explorer' }
  };

  constructor(keyboard: KeyboardEngine) {
    this.keyboard = keyboard;
  }

  public async launchApp(appName: string, forceNewWindow = false): Promise<boolean> {
    const normalizedName = appName.toLowerCase().trim();
    
    // Clean name of new window request phrases to find matching app in mapping
    let cleanedName = normalizedName
      .replace(/new window/gi, "")
      .replace(/new instance/gi, "")
      .replace(/another window/gi, "")
      .replace(/second window/gi, "")
      .replace(/third window/gi, "")
      .replace(/open a new/gi, "")
      .replace(/open another/gi, "")
      .replace(/open/gi, "")
      .trim();

    // Check if the request explicitly asks for a new window or instance
    const explicitNewWindowRequest = 
      /new window|new instance|another window|second window|third window|open a new|open another/i.test(normalizedName) || forceNewWindow;

    const mapping = this.appMapping[cleanedName] || this.appMapping[normalizedName];
    const exeName = mapping ? mapping.exe : cleanedName;
    const displayName = mapping ? mapping.display : appName;
    const cliCmd = mapping ? mapping.cli : cleanedName;

    const appKey = exeName.toLowerCase();

    // 1. VOICE COMMAND DEDUPLICATION
    const now = Date.now();
    const commandKey = `${appName.toLowerCase()}`;
    const lastRequestTime = AppLauncher.recentCommands.get(commandKey);
    if (lastRequestTime && (now - lastRequestTime < this.DEDUPLICATION_WINDOW_MS)) {
      logger.warn(`[AppLauncher] DUPLICATE REQUESTS BLOCKED: "${appName}" received within ${this.DEDUPLICATION_WINDOW_MS}ms.`);
      return false;
    }
    AppLauncher.recentCommands.set(commandKey, now);

    // Synchronize state machine with the operating system before proceeding
    await this.syncStateWithOS(exeName);

    const currentState = AppLauncher.appStates.get(appKey) || 'NOT_RUNNING';
    logger.info(`[AppLauncher] COMMAND RECEIVED: "open ${appName}" | App Name: ${displayName} | Current State: ${currentState} | Force New: ${explicitNewWindowRequest}`);

    // 2. STATE MACHINE CHECKS & LOCKS
    if (currentState === 'LAUNCHING') {
      logger.warn(`[AppLauncher] Request ignored. Application '${displayName}' is currently in LAUNCHING state. Lock is active.`);
      return false;
    }

    if (currentState === 'RUNNING' && !explicitNewWindowRequest) {
      logger.info(`[AppLauncher] Application '${displayName}' is already RUNNING. Focusing existing window.`);
      const focused = await this.focusIfRunning(exeName);
      if (focused) {
        logger.info(`[AppLauncher] WINDOW DETECTED: Successfully focused existing window for '${displayName}'.`);
        return true;
      }
      logger.warn(`[AppLauncher] App was marked RUNNING but could not be focused. Resetting state.`);
      AppLauncher.appStates.set(appKey, 'NOT_RUNNING');
    }

    // 3. LAUNCH INITIATION
    AppLauncher.appStates.set(appKey, 'LAUNCHING');
    const startTime = Date.now();
    logger.info(`[AppLauncher] LAUNCH START TIME: ${new Date(startTime).toISOString()} for '${displayName}'`);

    const success = await this.performLaunchWithRetry(appName, exeName, displayName, cliCmd, explicitNewWindowRequest);
    const duration = Date.now() - startTime;
    
    if (success) {
      AppLauncher.appStates.set(appKey, 'RUNNING');
      CentralTaskScheduler.getInstance().registerAppLaunch(displayName);
      BenchmarkManager.getInstance().recordAppLaunchTime(displayName, duration);
      return true;
    } else {
      AppLauncher.appStates.set(appKey, 'NOT_RUNNING');
      BenchmarkManager.getInstance().recordError("app_launch_failed");
      return false;
    }
  }

  /**
   * Performs the launch sequence with exactly ONE retry.
   */
  private async performLaunchWithRetry(appName: string, exeName: string, displayName: string, cliCmd?: string, forceNewWindow = false): Promise<boolean> {
    let success = await this.executeLaunchSequence(appName, exeName, displayName, cliCmd, forceNewWindow);
    if (success) {
      return true;
    }

    logger.warn(`[AppLauncher] Launch failed for '${displayName}'. Retrying exactly ONE time...`);
    await this.wait(1500); // Small cooldown before retry
    
    success = await this.executeLaunchSequence(appName, exeName, displayName, cliCmd, forceNewWindow);
    return success;
  }

  /**
   * Main launch worker sequence.
   */
  private async executeLaunchSequence(appName: string, exeName: string, displayName: string, cliCmd?: string, forceNewWindow = false): Promise<boolean> {
    // Check if the process exists right before launching to prevent multiple instances
    if (!forceNewWindow) {
      const exists = await this.checkProcessExists(exeName);
      if (exists) {
        logger.info(`[AppLauncher] Process for '${displayName}' already exists. Attempting window focus.`);
        return await this.focusIfRunning(exeName);
      }
    }

    let launched = false;
    if (cliCmd) {
      try {
        await execAsync(`start "" "${cliCmd}"`);
        logger.info(`[AppLauncher] Launched '${displayName}' via CLI command.`);
        launched = true;
      } catch (err) {
        logger.warn(`[AppLauncher] CLI launch failed for '${cliCmd}':`, err);
      }
    }

    if (!launched) {
      launched = await this.launchViaStartMenu(displayName);
    }

    if (!launched) return false;

    // Verify application window exists and is ready
    logger.info(`[AppLauncher] Verifying application window for '${displayName}'...`);
    const ready = await this.waitForWindowReady(exeName);
    if (ready) {
      logger.info(`[AppLauncher] WINDOW DETECTED: '${displayName}' main window is active and verified.`);
      return true;
    }
    return false;
  }

  /**
   * Synchronizes the state machine with the OS process status.
   */
  private async syncStateWithOS(exeName: string): Promise<AppState> {
    const appKey = exeName.toLowerCase();
    const currentState = AppLauncher.appStates.get(appKey) || 'NOT_RUNNING';
    
    // If we think it's LAUNCHING, don't override it with sync checks
    if (currentState === 'LAUNCHING') {
      return 'LAUNCHING';
    }

    const exists = await this.checkProcessExists(exeName);
    if (exists) {
      // Check if it has a window handle
      const state = await this.checkProcessState(exeName);
      if (state === 'FOCUSED' || state === 'PROCESS_EXISTS_NO_WINDOW') {
        AppLauncher.appStates.set(appKey, 'RUNNING');
        return 'RUNNING';
      }
    }

    AppLauncher.appStates.set(appKey, 'NOT_RUNNING');
    return 'NOT_RUNNING';
  }

  /**
   * Checks if process exists in the OS.
   */
  private async checkProcessExists(exeName: string): Promise<boolean> {
    try {
      const result = await PowerShellTemplateEngine.getInstance().executeTemplate('checkProcessExists', {
        EXE_NAME: exeName
      });
      return result.includes("EXISTS");
    } catch (err) {
      return false;
    }
  }

  /**
   * Queries process state and attempts to activate window if MainWindowHandle is ready.
   */
  private async checkProcessState(exeName: string): Promise<"FOCUSED" | "PROCESS_EXISTS_NO_WINDOW" | "NOT_FOUND"> {
    try {
      const result = await PowerShellTemplateEngine.getInstance().executeTemplate('checkProcessState', {
        EXE_NAME: exeName
      });
      if (result.includes("FOCUSED")) return "FOCUSED";
      if (result.includes("PROCESS_EXISTS_NO_WINDOW")) return "PROCESS_EXISTS_NO_WINDOW";
      return "NOT_FOUND";
    } catch (error) {
      logger.error(`Error checking process state for ${exeName}`, error);
      return "NOT_FOUND";
    }
  }

  /**
   * Brings running process window to the front.
   */
  private async focusIfRunning(exeName: string): Promise<boolean> {
    const state = await this.checkProcessState(exeName);
    return state === "FOCUSED";
  }

  /**
   * Polls until the process has a valid, non-zero MainWindowHandle.
   */
  private async waitForWindowReady(exeName: string, timeoutMs = 12000): Promise<boolean> {
    const start = Date.now();
    const interval = 250;
    while (Date.now() - start < timeoutMs) {
      try {
        const result = await PowerShellTemplateEngine.getInstance().executeTemplate('waitForWindowReady', {
          EXE_NAME: exeName
        });
        if (result.includes("READY")) {
          // Force activation of the newly created window
          await this.focusIfRunning(exeName);
          return true;
        }
      } catch (err) {
        // ignore
      }
      await this.wait(interval);
    }
    return false;
  }

  private async launchViaStartMenu(displayName: string): Promise<boolean> {
    logger.info(`Searching start menu for: ${displayName}`);
    try {
       // Open start menu
       await this.keyboard.pressKey('command');
       await this.wait(400);

       // Type name char by char to ensure search registers
       for (const char of displayName) {
          await this.keyboard.pressKey(char.toLowerCase());
          await this.wait(10);
       }
       
       await this.wait(600); // Wait for search results
       await this.keyboard.enter();
       return true;
    } catch (e) {
       logger.error(`Failed to launch via Start menu: ${e}`);
       return false;
    }
  }

  private wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
