import { AppController } from './AppController';
import { logger } from '../../src/main/agent/core/Logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ActionEngine } from '../../src/main/agent/actions/ActionEngine';
import { ScreenPerception } from '../../vision/screenReader/ScreenPerception';
import { VerificationEngine } from '../../ai/verificationEngine/VerificationEngine';

const execAsync = promisify(exec);

export class TerminalController extends AppController {
  
  constructor(actions: ActionEngine, perception: ScreenPerception, verifier: VerificationEngine) {
    super('Terminal', actions, perception, verifier);
  }

  protected verifyIsApp(windowIdentifier: string): boolean {
    return windowIdentifier.toLowerCase().includes('powershell') || 
           windowIdentifier.toLowerCase().includes('cmd') ||
           windowIdentifier.toLowerCase().includes('terminal');
  }

  protected async launchApp(originalRequest?: string): Promise<boolean> {
    logger.info("Launching Terminal...");
    return await this.appLauncher.launchApp(originalRequest || 'powershell');
  }

  /**
   * Executes a command directly via Node.js child_process (safer, faster)
   * OR could type it out into a native window if visual simulation is required.
   */
  public async executeCommand(command: string, visually: boolean = false): Promise<string> {
    logger.info(`Executing command: ${command}`);

    if (visually) {
      if (!(await this.isActive())) {
        await this.open();
      }
      await this.actions.typeString(command);
      await this.actions.pressKey('enter');
      return "Executed visually. Output reading requires OCR.";
    } else {
      try {
        // Execute cleanly in background
        const { stdout, stderr } = await execAsync(command, { shell: 'powershell.exe' });
        if (stderr) {
          logger.warn(`Command stderr: ${stderr}`);
        }
        return stdout;
      } catch (error: any) {
        logger.error(`Command execution failed: ${error.message}`);
        throw error;
      }
    }
  }
}
