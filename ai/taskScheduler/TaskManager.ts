import { logger } from '../../src/main/agent/core/Logger';
import { TaskStep } from '../planner/TaskPlanner';

export type TaskState = 'WAITING' | 'RUNNING' | 'PAUSED' | 'CANCELLING' | 'CANCELLED' | 'COMPLETED' | 'FAILED';

export class CancellationToken {
  private _isCancelled: boolean = false;
  private listeners: (() => void)[] = [];

  public get isCancelled(): boolean {
    return this._isCancelled;
  }

  public cancel() {
    if (this._isCancelled) return;
    this._isCancelled = true;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        logger.error("Error in cancellation listener", err);
      }
    }
  }

  public onCancelled(callback: () => void) {
    if (this._isCancelled) {
      callback();
    } else {
      this.listeners.push(callback);
    }
  }
}

export class CancellationError extends Error {
  constructor(message = "Task was cancelled") {
    super(message);
    this.name = "CancellationError";
    Object.setPrototypeOf(this, CancellationError.prototype);
  }
}

export interface Task {
  id: string;
  name: string;
  steps: TaskStep[];
  currentStepIndex: number;
  priority: 'low' | 'normal' | 'high' | 'background';
  status: TaskState;
  createdTime: number;
  cancellationToken: CancellationToken;
  executionState: TaskState;
  dependencies: string[]; // Task IDs that must be completed before this runs
}

export class TaskManager {
  private static instance: TaskManager;
  private tasks: Map<string, Task> = new Map();
  private activeForegroundTaskId: string | null = null;
  private isEmergencyStopActive: boolean = false;
  private inputsInhibited: boolean = false;
  private activeKeyboardEngine: any = null;
  private activeActionEngine: any = null;

  private constructor() {
    // Start watchdog
    this.startWatchdog();
  }

  public static getInstance(): TaskManager {
    if (!TaskManager.instance) {
      TaskManager.instance = new TaskManager();
    }
    return TaskManager.instance;
  }

  public registerEngines(keyboard: any, action: any) {
    this.activeKeyboardEngine = keyboard;
    this.activeActionEngine = action;
  }

  public getOrCreateInteractiveTask(): Task {
    let task = this.tasks.get("interactive_session");
    if (!task) {
      task = {
        id: "interactive_session",
        name: "Interactive Session",
        steps: [],
        currentStepIndex: 0,
        priority: "high",
        status: "RUNNING",
        executionState: "RUNNING",
        createdTime: Date.now(),
        cancellationToken: new CancellationToken(),
        dependencies: []
      };
      this.tasks.set("interactive_session", task);
    }
    return task;
  }

  public addTask(task: Omit<Task, 'currentStepIndex' | 'status' | 'createdTime' | 'cancellationToken' | 'executionState'>): string {
    const newTask: Task = {
      ...task,
      currentStepIndex: 0,
      status: 'WAITING',
      executionState: 'WAITING',
      createdTime: Date.now(),
      cancellationToken: new CancellationToken()
    };
    this.tasks.set(task.id, newTask);
    logger.info(`Task added: ${task.name} (Priority: ${task.priority})`);
    return task.id;
  }

  public getNextExecutableTask(): Task | null {
    if (this.isEmergencyStopActive) return null;
    
    // Sort by priority (high > normal > low > background)
    const priorityWeights = { high: 3, normal: 2, low: 1, background: 0 };
    
    const runnableTasks = Array.from(this.tasks.values())
      .filter(t => t.status === 'WAITING' || t.status === 'RUNNING')
      .filter(t => this.areDependenciesMet(t))
      .sort((a, b) => priorityWeights[b.priority] - priorityWeights[a.priority]);

    if (runnableTasks.length > 0) {
      return runnableTasks[0];
    }
    return null;
  }

  private areDependenciesMet(task: Task): boolean {
    for (const depId of task.dependencies) {
      const dep = this.tasks.get(depId);
      if (!dep || dep.status !== 'COMPLETED') {
        return false;
      }
    }
    return true;
  }

  public getNextStepForTask(taskId: string): TaskStep | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    
    if (task.status === 'PAUSED' || task.status === 'CANCELLED' || task.status === 'CANCELLING') {
      return null;
    }

    if (task.currentStepIndex < task.steps.length) {
      task.status = 'RUNNING';
      task.executionState = 'RUNNING';
      
      // If foreground task, set it active
      if (task.priority !== 'background') {
        this.activeForegroundTaskId = taskId;
      }

      const step = task.steps[task.currentStepIndex];
      step.status = 'in_progress';
      return step;
    }

    return null;
  }

  public markTaskStepCompleted(taskId: string) {
    const task = this.tasks.get(taskId);
    if (task && task.currentStepIndex < task.steps.length) {
      task.steps[task.currentStepIndex].status = 'completed';
      task.currentStepIndex++;
      
      if (task.currentStepIndex >= task.steps.length) {
        task.status = 'COMPLETED';
        task.executionState = 'COMPLETED';
        if (this.activeForegroundTaskId === taskId) {
          this.activeForegroundTaskId = null;
        }
        logger.info(`Task fully completed: ${task.name}`);
      }
    }
  }

  public markTaskFailed(taskId: string, error: any) {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'FAILED';
      task.executionState = 'FAILED';
      if (this.activeForegroundTaskId === taskId) {
        this.activeForegroundTaskId = null;
      }
      logger.error(`Task failed: ${task.name}`, error);
      if (task.currentStepIndex < task.steps.length) {
         task.steps[task.currentStepIndex].status = 'failed';
      }
    }
  }

  public markTaskCancelled(taskId: string) {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'CANCELLED';
      task.executionState = 'CANCELLED';
      task.cancellationToken.cancel();
      if (this.activeForegroundTaskId === taskId) {
        this.activeForegroundTaskId = null;
      }
      logger.info(`Task marked CANCELLED: ${task.name}`);
    }
  }

  public pauseTask(taskId: string) {
    const task = this.tasks.get(taskId);
    if (task && task.status === 'RUNNING') {
      task.status = 'PAUSED';
      task.executionState = 'PAUSED';
      logger.info(`Task paused: ${task.name}`);
    }
  }

  public resumeTask(taskId: string) {
    const task = this.tasks.get(taskId);
    if (task && task.status === 'PAUSED') {
      task.status = 'WAITING';
      task.executionState = 'WAITING';
      logger.info(`Task resumed: ${task.name}`);
    }
  }

  public cancelTask(taskId: string) {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'CANCELLING';
      task.executionState = 'CANCELLING';
      task.cancellationToken.cancel();
      logger.info(`Task cancelling: ${task.name}`);
      
      // Let it transition to CANCELLED
      setTimeout(() => {
        if (task.status === 'CANCELLING') {
          task.status = 'CANCELLED';
          task.executionState = 'CANCELLED';
          if (this.activeForegroundTaskId === taskId) {
            this.activeForegroundTaskId = null;
          }
        }
      }, 100);
    }
  }

  public triggerEmergencyStop() {
    logger.warn("EMERGENCY STOP TRIGGERED");
    this.isEmergencyStopActive = true;
    this.inputsInhibited = true;
    
    // Cancel all running/waiting tasks
    for (const task of this.tasks.values()) {
      if (task.status === 'RUNNING' || task.status === 'WAITING' || task.status === 'PAUSED' || task.status === 'CANCELLING') {
        task.status = 'CANCELLED';
        task.executionState = 'CANCELLED';
        task.cancellationToken.cancel();
      }
    }
    
    this.activeForegroundTaskId = null;
    
    // Release physical inputs immediately (loudly)
    this.forceReleaseAllInputs(false);
  }

  public resetEmergencyStop() {
    if (this.isEmergencyStopActive || this.inputsInhibited) {
      logger.info("Emergency Stop reset. Inputs allowed.");
      this.isEmergencyStopActive = false;
      this.inputsInhibited = false;
    }
  }

  public isCancelled(taskId?: string): boolean {
    if (this.isEmergencyStopActive) return true;
    if (taskId) {
      const task = this.tasks.get(taskId);
      return task ? (task.status === 'CANCELLED' || task.status === 'CANCELLING') : false;
    }
    // If no taskId, check active foreground task
    if (this.activeForegroundTaskId) {
      const task = this.tasks.get(this.activeForegroundTaskId);
      return task ? (task.status === 'CANCELLED' || task.status === 'CANCELLING') : false;
    }
    return false;
  }

  public areInputsInhibited(): boolean {
    return this.inputsInhibited;
  }

  public getActiveForegroundTaskId(): string {
    return this.activeForegroundTaskId || "interactive_session";
  }

  public acquireInputControl(taskId: string): boolean {
    if (this.inputsInhibited) return false;
    
    const task = this.tasks.get(taskId);
    // If interactive session, ensure no planned task is holding lock
    if (taskId === "interactive_session") {
      return this.activeForegroundTaskId === null;
    }
    
    if (!task || task.status === 'CANCELLED' || task.status === 'FAILED') return false;
    
    if (this.activeForegroundTaskId === null) {
      this.activeForegroundTaskId = taskId;
      return true;
    }
    
    return this.activeForegroundTaskId === taskId;
  }

  private forceReleaseAllInputs(silent = true) {
    try {
      if (this.activeKeyboardEngine) {
        this.activeKeyboardEngine.releaseAll(silent).catch((e: any) => {
          logger.error("Error in watchdog keyboard releaseAll", e);
        });
      }
      if (this.activeActionEngine) {
        if (this.activeActionEngine.typingEngine) {
          this.activeActionEngine.typingEngine.emergencyStop().catch(() => {});
        }
        if (typeof this.activeActionEngine.releaseMouseButtons === 'function') {
          this.activeActionEngine.releaseMouseButtons(silent);
        }
      }
    } catch (err) {
      logger.error("Error releasing inputs during emergency stop", err);
    }
  }

  private startWatchdog() {
    setInterval(() => {
      if (this.isEmergencyStopActive || this.inputsInhibited) {
        // Keep releasing keys and mouse to prevent stuck states silently
        this.forceReleaseAllInputs(true);
      }
    }, 100); // Background watchdog runs every 100ms
  }

  public getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }
}
