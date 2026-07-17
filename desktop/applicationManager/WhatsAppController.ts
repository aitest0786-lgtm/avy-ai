import { AppController } from './AppController';
import { logger } from '../../src/main/agent/core/Logger';
import { ActionEngine } from '../../src/main/agent/actions/ActionEngine';
import { ScreenPerception } from '../../vision/screenReader/ScreenPerception';
import { VerificationEngine } from '../../ai/verificationEngine/VerificationEngine';

export class WhatsAppController extends AppController {
  
  constructor(actions: ActionEngine, perception: ScreenPerception, verifier: VerificationEngine) {
    super('WhatsApp', actions, perception, verifier);
  }

  protected verifyIsApp(windowIdentifier: string): boolean {
    return windowIdentifier.toLowerCase().includes('whatsapp');
  }

  protected async launchApp(originalRequest?: string): Promise<boolean> {
    logger.info("Launching WhatsApp Desktop...");
    return await this.appLauncher.launchApp(originalRequest || 'whatsapp');
  }

  public async sendChat(contactName: string, message: string, autoSend: boolean = false): Promise<boolean> {
    logger.info(`Initiating chat with ${contactName}...`);
    
    if (!(await this.isActive())) {
      await this.open();
    }

    // Usually Ctrl+F or Tab to search
    await this.actions.pressKey('f', ['control']);
    await this.wait(200);
    
    await this.actions.typeString(contactName);
    await this.wait(500); // reduced from 2000
    
    // Select the first contact
    await this.actions.pressKey('enter');
    await this.wait(200);

    // Now type the message
    logger.info("Typing message...");
    await this.actions.typeString(message);

    if (autoSend) {
      logger.info("Auto-sending message...");
      await this.actions.pressKey('enter');
    } else {
      logger.info("Message typed. Awaiting user approval to send.");
    }

    return true;
  }
}
