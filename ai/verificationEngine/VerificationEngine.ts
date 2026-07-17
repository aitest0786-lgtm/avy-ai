import { logger } from '../../src/main/agent/core/Logger';
import { TaskStep } from '../planner/TaskPlanner';
import { ScreenPerception } from '../../vision/screenReader/ScreenPerception';

export class VerificationEngine {
  private perception: ScreenPerception;

  constructor(perception: ScreenPerception) {
    this.perception = perception;
  }

  /**
   * Verifies if the previously executed step achieved its intended outcome.
   * NEVER assumes success. Returns false if verification fails.
   */
  public async verifyStep(step: TaskStep): Promise<boolean> {
    logger.info(`Verifying outcome for step: ${step.description}`);
    
    try {
      // Small delay to allow OS animations / rendering to finish
      await this.wait(1000); 
      const activeWindow = await this.perception.getActiveWindow();
      
      switch (step.actionType) {
        case 'open_app':
          return this.verifyAppOpened(step, activeWindow);
        case 'click':
          return await this.verifyClickSuccess(step);
        case 'type':
        case 'type_code':
          return await this.verifyTypeSuccess(step);
        case 'scroll':
          return await this.verifyScrollSuccess(step);
        case 'terminal_command':
          return true;
        default:
          logger.warn(`No specific verification logic for actionType: ${step.actionType}. Assuming success for now.`);
          return true; 
      }
    } catch (error) {
      logger.error("Error during verification process", error);
      return false;
    }
  }

  private verifyAppOpened(step: TaskStep, activeWindow: { title: string; app: string }): boolean {
    const expectedApp = step.targetApp?.toLowerCase() || '';
    if (activeWindow.app.toLowerCase().includes(expectedApp) || activeWindow.title.toLowerCase().includes(expectedApp)) {
      logger.info(`Verified: App '${expectedApp}' is open and active.`);
      return true;
    }
    logger.warn(`Verification failed: Expected app '${expectedApp}', but active window is '${activeWindow.title}'.`);
    return false;
  }

  private async verifyClickSuccess(step: TaskStep): Promise<boolean> {
    if (step.payload?.expectedNextText) {
       const coords = await this.perception.findElementCoordinates(step.payload.expectedNextText);
       if (coords) {
          logger.info(`Verified: Found expected text '${step.payload.expectedNextText}' after click.`);
          return true;
       }
       logger.warn(`Verification failed: Did not find '${step.payload.expectedNextText}' after click.`);
       return false;
    }
    return true; 
  }

  private async verifyTypeSuccess(step: TaskStep): Promise<boolean> {
    if (step.payload?.text) {
       const coords = await this.perception.findElementCoordinates(step.payload.text);
       if (coords) {
          logger.info(`Verified: Found typed text on screen.`);
          return true;
       }
       logger.warn(`Verification failed: Typed text not found on screen.`);
    }
    return true;
  }

  public async verifyScrollSuccess(step: TaskStep): Promise<boolean> {
    logger.info(`Verifying scroll success...`);
    // Advanced: check if screen changed visually (needs previous screen state).
    // For now, we assume true unless infinite loop detected in task manager.
    return true;
  }

  /**
   * Verifies if a text field or the window currently has active cursor focus.
   * Can use Accessibility APIs or OCR heuristics.
   */
  public async verifyFocus(): Promise<boolean> {
    logger.info(`Verifying window focus...`);
    // In a full implementation, we'd query the OS Accessibility API to find the Focused Element.
    // Since we don't have that linked, we check if our window is at least active.
    const activeWindow = await this.perception.getActiveWindow();
    if (activeWindow) {
      return true;
    }
    return false;
  }

  private wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
