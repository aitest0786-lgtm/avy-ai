import { AppController } from './AppController';
import { logger } from '../../src/main/agent/core/Logger';
import { ActionEngine } from '../../src/main/agent/actions/ActionEngine';
import { ScreenPerception } from '../../vision/screenReader/ScreenPerception';
import { VerificationEngine } from '../../ai/verificationEngine/VerificationEngine';

export class ExplorerController extends AppController {
  
  constructor(actions: ActionEngine, perception: ScreenPerception, verifier: VerificationEngine) {
    super('File Explorer', actions, perception, verifier);
  }

  protected verifyIsApp(windowIdentifier: string): boolean {
    return windowIdentifier.toLowerCase().includes('file explorer') || windowIdentifier.toLowerCase().includes('explorer');
  }

  protected async launchApp(originalRequest?: string): Promise<boolean> {
    logger.info("Launching File Explorer...");
    return await this.appLauncher.launchApp(originalRequest || 'file explorer');
  }

  public async navigateToPath(folderPath: string): Promise<boolean> {
    logger.info(`Navigating Explorer to: ${folderPath}`);
    
    if (!(await this.isActive())) {
      await this.open();
    }

    // Ctrl+L focuses the address bar in File Explorer
    await this.actions.pressKey('l', ['control']);
    await this.wait(200);
    
    await this.actions.typeString(folderPath);
    await this.actions.pressKey('enter');
    await this.wait(500); // Reduced from 2000

    return true; // Use VerificationEngine to ensure path changed
  }
}
