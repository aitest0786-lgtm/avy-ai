import { AppController } from './AppController';
import { ActionEngine } from '../../src/main/agent/actions/ActionEngine';
import { logger } from '../../src/main/agent/core/Logger';

import { ScreenPerception } from '../../vision/screenReader/ScreenPerception';
import { VerificationEngine } from '../../ai/verificationEngine/VerificationEngine';

export class CalculatorController extends AppController {

  constructor(actions: ActionEngine, perception: ScreenPerception, verifier: VerificationEngine) {
    super('Calculator', actions, perception, verifier);
  }

  protected verifyIsApp(windowIdentifier: string): boolean {
    return windowIdentifier.toLowerCase().includes('calc') || windowIdentifier.toLowerCase().includes('calculator');
  }

  public async launchApp(originalRequest?: string): Promise<boolean> {
    logger.info("Launching Calculator");
    const success = await this.appLauncher.launchApp(originalRequest || 'calculator');
    if (success) {
      return await this.waitForReadiness();
    }
    return false;
  }

  public async calculate(expression: string) {
    logger.action(`Calculating expression: ${expression}`);
    // Clear first
    await this.actions.pressKey('escape');
    await this.wait(200);

    // Filter to valid calculator chars to avoid issues
    const validChars = expression.replace(/[^0-9\+\-\*\/\.\=\(\)]/g, '');
    
    // Type the expression
    for (const char of validChars) {
       await this.actions.typeString(char);
       await this.wait(50);
    }

    // Press enter to get result if no equals sign
    if (!validChars.includes('=')) {
       await this.actions.pressKey('enter');
    }
    
    // Could use OCR to read the result back
  }
}
