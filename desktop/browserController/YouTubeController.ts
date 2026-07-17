import { AppController } from '../applicationManager/AppController';
import { logger } from '../../src/main/agent/core/Logger';
import { ActionEngine } from '../../src/main/agent/actions/ActionEngine';
import { ScreenPerception } from '../../vision/screenReader/ScreenPerception';
import { VerificationEngine } from '../../ai/verificationEngine/VerificationEngine';

export class YouTubeController extends AppController {
  
  constructor(actions: ActionEngine, perception: ScreenPerception, verifier: VerificationEngine) {
    super('YouTube', actions, perception, verifier);
  }

  protected verifyIsApp(windowIdentifier: string): boolean {
    return windowIdentifier.toLowerCase().includes('youtube');
  }

  protected async launchApp(originalRequest?: string): Promise<boolean> {
    // YouTube is launched via Chrome Browser
    return await this.appLauncher.launchApp(originalRequest || 'chrome');
  }

  public async open(originalRequest?: string): Promise<boolean> {
    logger.info("Opening YouTube via Chrome...");
    // 1. Open Chrome using idempotent AppLauncher
    const launched = await this.launchApp(originalRequest);
    if (!launched) {
      return false;
    }

    // 2. Type URL in address bar
    await this.actions.pressKey('l', ['control']);
    await this.wait(200);
    await this.actions.typeString('https://www.youtube.com');
    await this.actions.pressKey('enter');
    
    // 3. Wait for load
    await this.wait(3000);
    return await this.isActive();
  }

  public async search(query: string): Promise<boolean> {
    logger.info(`Searching YouTube for: ${query}`);
    
    if (!(await this.isActive())) {
      logger.warn("YouTube is not active. Cannot search.");
      return false;
    }

    // STRICT RULES: DO NOT USE ADDRESS BAR IF OPEN
    // Find the YouTube search box visually or via OCR
    const success = await this.safeClick("Search"); // Assumes search box has placeholder "Search"
    
    if (!success) {
      logger.info("Search box not found directly. Attempting fallback (Tab navigation).");
      // Fallback logic
      await this.actions.pressKey('escape');
      await this.wait(200);
      await this.actions.pressKey('tab');
      // In a full implementation, we'd loop tab and check focus using accessibility trees.
    }

    await this.actions.typeString(query);
    await this.actions.pressKey('enter');
    await this.wait(4000); // Wait for results

    return true; // We'd use VerificationEngine here to check URL for 'results?search_query='
  }
}
