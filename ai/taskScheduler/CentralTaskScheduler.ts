import { TaskManager, Task, TaskState, CancellationError } from './TaskManager';
import { logger } from '../../src/main/agent/core/Logger';

export type EngineType = 'keyboard' | 'mouse' | 'browser' | 'ocr' | 'voice' | 'application';

export class CentralTaskScheduler {
  private static instance: CentralTaskScheduler;
  private taskManager: TaskManager;

  // Locks for distinct engines
  private locks: Map<EngineType, string | null> = new Map([
    ['keyboard', null],
    ['mouse', null],
    ['browser', null],
    ['ocr', null],
    ['voice', null],
    ['application', null]
  ]);

  // Track running applications to prevent duplicates
  private activeApplications: Set<string> = new Set();

  private constructor() {
    this.taskManager = TaskManager.getInstance();
  }

  public static getInstance(): CentralTaskScheduler {
    if (!CentralTaskScheduler.instance) {
      CentralTaskScheduler.instance = new CentralTaskScheduler();
    }
    return CentralTaskScheduler.instance;
  }

  /**
   * Submit a new task to the queue. 
   * Prevents duplicate application launches within the active running list.
   */
  public enqueueTask(task: Omit<Task, 'currentStepIndex' | 'status' | 'createdTime' | 'cancellationToken' | 'executionState'>): string | null {
    if (task.name.startsWith('Launch App: ')) {
      const appName = task.name.replace('Launch App: ', '').trim();
      if (this.activeApplications.has(appName)) {
        logger.warn(`Scheduler: Prevented duplicate launch of application '${appName}'.`);
        return null; // Reject duplicate launch
      }
    }
    
    return this.taskManager.addTask(task);
  }

  /**
   * Acquire a lock for a specific engine. Throws if inputs are inhibited or already locked by another task.
   */
  public acquireLock(engine: EngineType, taskId: string = "interactive_session"): void {
    if (this.taskManager.areInputsInhibited()) {
      throw new CancellationError("Inputs are inhibited. Cannot acquire lock.");
    }
    
    // For high-priority inputs, we also ensure TaskManager allows foreground control
    if (engine === 'keyboard' || engine === 'mouse') {
      if (!this.taskManager.acquireInputControl(taskId)) {
        throw new Error(`Task '${taskId}' does not have foreground input control.`);
      }
    }

    const currentLock = this.locks.get(engine);
    if (currentLock !== null && currentLock !== taskId) {
      throw new Error(`Engine '${engine}' is already locked by task '${currentLock}'.`);
    }

    this.locks.set(engine, taskId);
  }

  /**
   * Release a lock for a specific engine.
   */
  public releaseLock(engine: EngineType, taskId: string = "interactive_session"): void {
    const currentLock = this.locks.get(engine);
    if (currentLock === taskId) {
      this.locks.set(engine, null);
    }
  }

  public isEngineLocked(engine: EngineType): boolean {
    return this.locks.get(engine) !== null;
  }

  /**
   * Check if keyboard is actively locked by anyone.
   */
  public isKeyboardLocked(): boolean {
    return this.isEngineLocked('keyboard');
  }

  /**
   * Check if mouse is actively locked by anyone.
   */
  public isMouseLocked(): boolean {
    return this.isEngineLocked('mouse');
  }

  /**
   * Register that an application has been successfully launched.
   */
  public registerAppLaunch(appName: string) {
    this.activeApplications.add(appName);
  }

  /**
   * Unregister an application (e.g., when it is closed).
   */
  public registerAppClose(appName: string) {
    this.activeApplications.delete(appName);
  }

  /**
   * Stop all tasks immediately. Uses TaskManager's emergency stop to cancel all.
   * If pause was preferred, we would loop and pause, but 'triggerEmergencyStop' ensures safety.
   */
  public stopAll() {
    logger.warn("Scheduler: STOP command received. Halting all engines and tasks.");
    // Release all engine locks locally
    for (const engine of this.locks.keys()) {
      this.locks.set(engine, null);
    }
    this.taskManager.triggerEmergencyStop();
  }

  /**
   * Resumes operations by resetting the emergency stop.
   */
  public resumeAll() {
    logger.info("Scheduler: RESUME command received.");
    this.taskManager.resetEmergencyStop();
  }
}
