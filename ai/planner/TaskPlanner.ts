import { logger } from '../../src/main/agent/core/Logger';

export interface TaskStep {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'paused';
  actionType: string;
  targetApp?: string;
  payload?: any;
  subSteps?: TaskStep[]; // For hierarchical breakdown
}

export class TaskPlanner {
  private stepQueue: TaskStep[] = [];
  private currentStepIndex: number = 0;
  private isPaused: boolean = false;

  constructor() {}

  /**
   * Translates a high-level user intent into a queue of executable steps.
   */
  public planTask(userRequest: string, steps: TaskStep[]) {
    logger.info(`Planning new task: ${userRequest}`);
    this.stepQueue = steps;
    this.currentStepIndex = 0;
    this.isPaused = false;
    logger.info(`Generated ${this.stepQueue.length} steps.`);
  }

  public pause() {
    this.isPaused = true;
    logger.info("Task execution paused.");
    if (this.currentStepIndex < this.stepQueue.length) {
       this.stepQueue[this.currentStepIndex].status = 'paused';
    }
  }

  public resume() {
    this.isPaused = false;
    logger.info("Task execution resumed.");
    if (this.currentStepIndex < this.stepQueue.length && this.stepQueue[this.currentStepIndex].status === 'paused') {
       this.stepQueue[this.currentStepIndex].status = 'pending';
    }
  }

  public isPlanPaused(): boolean {
    return this.isPaused;
  }

  public hasNextStep(): boolean {
    return !this.isPaused && this.currentStepIndex < this.stepQueue.length;
  }

  public getNextStep(): TaskStep | null {
    if (!this.hasNextStep()) return null;
    const step = this.stepQueue[this.currentStepIndex];
    step.status = 'in_progress';
    return step;
  }

  public markStepCompleted() {
    if (this.currentStepIndex < this.stepQueue.length) {
      this.stepQueue[this.currentStepIndex].status = 'completed';
      logger.info(`Step completed: ${this.stepQueue[this.currentStepIndex].description}`);
      this.currentStepIndex++;
    }
  }

  public markStepFailed(error: any) {
    if (this.currentStepIndex < this.stepQueue.length) {
      this.stepQueue[this.currentStepIndex].status = 'failed';
      logger.error(`Step failed: ${this.stepQueue[this.currentStepIndex].description}`, error);
    }
  }

  public getRemainingSteps(): TaskStep[] {
    return this.stepQueue.slice(this.currentStepIndex);
  }

  public clearPlan() {
    this.stepQueue = [];
    this.currentStepIndex = 0;
    this.isPaused = false;
  }
}
