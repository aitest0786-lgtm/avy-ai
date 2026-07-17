import { AppController } from '../applicationManager/AppController';
import { ActionEngine } from '../../src/main/agent/actions/ActionEngine';
import { ScreenPerception } from '../../vision/screenReader/ScreenPerception';
import { logger } from '../../src/main/agent/core/Logger';

import { VerificationEngine } from '../../ai/verificationEngine/VerificationEngine';

export class ChromeController extends AppController {

  constructor(actions: ActionEngine, perception: ScreenPerception, verifier: VerificationEngine) {
    super('Google Chrome', actions, perception, verifier);
  }

  protected verifyIsApp(windowIdentifier: string): boolean {
    return windowIdentifier.toLowerCase().includes('chrome') || windowIdentifier.toLowerCase().includes('google chrome');
  }

  public async launchApp(originalRequest?: string): Promise<boolean> {
    logger.info("Launching Chrome Browser");
    const success = await this.appLauncher.launchApp(originalRequest || 'chrome');
    if (success) {
      return await this.waitForReadiness();
    }
    return false;
  }

  public async navigateTo(url: string) {
    logger.action(`Navigating Chrome to ${url}`);
    
    // Ctrl + L selects address bar
    await this.actions.pressKey('l', ['control']);
    await this.wait(200); // UI responsiveness

    await this.actions.typeString(url);
    await this.actions.pressKey('enter');

    // Wait for page to render
    await this.waitForDOMReady();
  }

  /**
   * Ensures the page is loaded by checking for common loading indicators disappearing,
   * or looking for structural DOM elements if accessibility API is enabled.
   */
  private async waitForDOMReady() {
    logger.info("Waiting for DOM to be ready...");
    let ready = false;
    let attempts = 0;
    while (!ready && attempts < 10) {
       attempts++;
       // Here we'd ideally hook into Chrome DevTools Protocol or Accessibility API.
       // With vision/OCR, we might wait for a "Reload" icon to appear instead of "X" (stop).
       // Placeholder wait for now:
       await this.wait(1000);
       ready = true; // Assume ready after 1 second for MVP
    }
  }

  public async closePopupIfPresent() {
    logger.info("Checking for blocking popups...");
    const popupTextPatterns = ['Accept All', 'No Thanks', 'Close', 'Got it'];
    
    for (const text of popupTextPatterns) {
       const coords = await this.perception.findElementCoordinates(text);
       if (coords) {
          logger.info(`Found popup containing '${text}', clicking it.`);
          await this.actions.moveMouseSmooth(coords.x, coords.y);
          await this.actions.click();
          await this.wait(500);
          return true;
       }
    }
    return false;
  }

  public async clickElement(text: string) {
    logger.action(`Clicking element with text: ${text}`);
    // Handle popups before clicking our target
    await this.closePopupIfPresent();

    const coords = await this.perception.findElementCoordinates(text);
    if (coords) {
      await this.actions.moveMouseSmooth(coords.x, coords.y);
      await this.actions.click();
    } else {
      logger.warn(`Could not find element: ${text}`);
    }
  }

  public async goBack() {
    logger.action("Chrome: Going back");
    await this.actions.pressKey('left', ['alt']);
  }
}
