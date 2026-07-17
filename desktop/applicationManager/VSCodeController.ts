import { AppController } from './AppController';
import { logger } from '../../src/main/agent/core/Logger';
import { ActionEngine } from '../../src/main/agent/actions/ActionEngine';
import { ScreenPerception } from '../../vision/screenReader/ScreenPerception';
import { VerificationEngine } from '../../ai/verificationEngine/VerificationEngine';

export class VSCodeController extends AppController {

  constructor(actions: ActionEngine, perception: ScreenPerception, verifier: VerificationEngine) {
    super('Visual Studio Code', actions, perception, verifier);
  }
  
  protected verifyIsApp(windowIdentifier: string): boolean {
    return windowIdentifier.toLowerCase().includes('visual studio code') || windowIdentifier.toLowerCase().includes('vscode');
  }

  protected async launchApp(originalRequest?: string): Promise<boolean> {
    logger.info("Launching VS Code...");
    return await this.appLauncher.launchApp(originalRequest || 'vs code');
  }

  public async createAndWriteFile(filename: string, codeContent: string): Promise<boolean> {
    logger.info(`Creating file ${filename} in VS Code...`);
    
    if (!(await this.isActive())) {
      await this.open();
    }

    // Ctrl+N for new file
    await this.actions.pressKey('n', ['control']);
    await this.wait(300);

    // Save as immediately
    await this.actions.pressKey('s', ['control']);
    await this.wait(500);
    
    // Type filename
    await this.actions.typeString(filename);
    await this.wait(100);
    await this.actions.pressKey('enter');
    await this.wait(300); // Wait for save dialog to close

    // Now write the code professionally
    await this.actions.typeCode(codeContent);

    // Final save
    await this.actions.pressKey('s', ['control']);
    logger.info("File saved successfully.");

    return true;
  }
}
