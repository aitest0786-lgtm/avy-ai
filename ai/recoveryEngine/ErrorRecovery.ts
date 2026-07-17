import { logger } from '../../src/main/agent/core/Logger';
import { TaskStep } from '../planner/TaskPlanner';
import { TaskManager } from '../taskScheduler/TaskManager';
import { ScreenPerception } from '../../vision/screenReader/ScreenPerception';

export class ErrorRecovery {
  private taskManager: TaskManager;
  private perception: ScreenPerception;
  private retryStrategies: Map<string, string[]> = new Map();

  constructor(taskManager: TaskManager, perception: ScreenPerception) {
    this.taskManager = taskManager;
    this.perception = perception;
  }

  /**
   * Observe the screen explicitly when a failure occurs to identify WHY it failed.
   * Then select an alternative strategy rather than looping blindly.
   */
  public async attemptInlineRecovery(step: TaskStep) {
     logger.warn("RECOVER: Observing screen to identify failure reason...");
     const activeWindow = await this.perception.getActiveWindow();
     
     // E.g., if a popup blocked us:
     if (activeWindow && activeWindow.title.toLowerCase().includes("error")) {
        logger.info("Identified error dialog. Attempting to dismiss...");
        // Logic to dismiss dialog (e.g. hitting Enter or Esc)
        return;
     } 

     // Alternative method selection
     const stepId = step.id || step.description;
     let strategies = this.retryStrategies.get(stepId) || ['primary', 'alternative_1', 'alternative_2'];
     
     const currentStrategy = strategies.shift(); // Consume the failed strategy
     
     if (strategies.length > 0) {
        logger.info(`Strategy '${currentStrategy}' failed. Selecting alternative method: '${strategies[0]}'`);
        this.retryStrategies.set(stepId, strategies);
        // In a real system, the TaskStep's payload or actionType would be mutated here
        // to force the execution loop to use the alternative (e.g. CLI vs Start Menu)
     } else {
        logger.warn(`No more alternative methods for step: ${step.description}`);
     }
  }

  public async handleFailure(step: TaskStep, error: any, taskId: string): Promise<boolean> {
    logger.error(`Handling fatal failure for step: ${step.description}`, error);
    
    // Clear strategies on fatal fail
    const stepId = step.id || step.description;
    this.retryStrategies.delete(stepId);

    // Unrecoverable or max retries reached
    logger.error(`Unrecoverable error on step: ${step.description}. Aborting task.`);
    this.taskManager.markTaskFailed(taskId, error);
    
    // In a full implementation, we'd log this to LongTermMemory
    return true; // Indicates we handled it by aborting
  }

  private isNetworkError(error: any): boolean {
    const errStr = String(error).toLowerCase();
    return errStr.includes('timeout') || errStr.includes('network') || errStr.includes('econnrefused');
  }

  private isUIElementNotFoundError(error: any): boolean {
    const errStr = String(error).toLowerCase();
    return errStr.includes('not found') || errStr.includes('no element') || errStr.includes('timeout waiting for');
  }
}
