import { AppController } from './AppController';
import { ActionEngine } from '../../src/main/agent/actions/ActionEngine';
import { logger } from '../../src/main/agent/core/Logger';

import { ScreenPerception } from '../../vision/screenReader/ScreenPerception';
import { VerificationEngine } from '../../ai/verificationEngine/VerificationEngine';

export class NotepadController extends AppController {

  constructor(actions: ActionEngine, perception: ScreenPerception, verifier: VerificationEngine) {
    super('Notepad', actions, perception, verifier);
  }

  protected verifyIsApp(windowIdentifier: string): boolean {
    return windowIdentifier.toLowerCase().includes('notepad');
  }

  public async launchApp(originalRequest?: string): Promise<boolean> {
    logger.info("Launching Notepad");
    const success = await this.appLauncher.launchApp(originalRequest || 'notepad');
    if (success) {
      return await this.waitForReadiness();
    }
    return false;
  }

  public async writeText(text: string) {
    logger.action("Writing text to Notepad");
    // Notepad natively struggles with massive single-line strings without line breaks,
    // so we can use clipboard for speed or just type
    if (text.length > 200) {
        await this.actions.typeUnicode(text);
    } else {
        await this.actions.typeString(text);
    }
  }

  public async saveFile(filename: string) {
    logger.action(`Saving Notepad file as ${filename}`);
    await this.actions.pressKey('s', ['control']);
    await this.wait(1000); // wait for save dialog
    await this.actions.typeString(filename);
    await this.wait(500);
    await this.actions.pressKey('enter');
  }
}
