import { logger } from '../core/Logger';
import { clipboard } from 'electron';
import * as os from 'os';
import { KeyboardEngine } from '../../../../desktop/keyboardEngine/KeyboardEngine';
import { HighPerformanceTypingEngine } from '../../../../desktop/keyboardEngine/HighPerformanceTypingEngine';
import { TaskManager, CancellationError } from '../../../../ai/taskScheduler/TaskManager';
import { CentralTaskScheduler } from '../../../../ai/taskScheduler/CentralTaskScheduler';

import { MouseEngine } from '../../../../desktop/mouseEngine/MouseEngine';

// robotjs has been completely replaced by MouseEngine V2 and HighPerformanceTypingEngine V2


export class ActionEngine {
  public keyboard: KeyboardEngine;
  public typingEngine: HighPerformanceTypingEngine;
  public mouseEngine: MouseEngine;

  constructor(
    verifyFocusFn?: () => Promise<boolean>,
    getActiveWindowFn?: () => Promise<{ title: string; app: string; pid?: number }>
  ) {
    this.keyboard = new KeyboardEngine(verifyFocusFn, getActiveWindowFn);
    this.typingEngine = new HighPerformanceTypingEngine(verifyFocusFn, getActiveWindowFn);
    this.mouseEngine = new MouseEngine();
    // Register engines globally with TaskManager
    TaskManager.getInstance().registerEngines(this.keyboard, this);
  }

  private ensureInputControl() {
    const taskManager = TaskManager.getInstance();
    if (taskManager.areInputsInhibited()) {
      throw new CancellationError("Inputs are inhibited due to cancellation/emergency stop.");
    }
    
    const activeTaskId = taskManager.getActiveForegroundTaskId();
    if (!taskManager.acquireInputControl(activeTaskId)) {
      throw new Error(`Task '${activeTaskId}' does not have foreground input control lock.`);
    }
  }

  public async releaseMouseButtons() {
    if (CentralTaskScheduler.getInstance().isKeyboardLocked()) {
      logger.warn("MOUSE BLOCKED: Keyboard typing is active.");
      return;
    }
    logger.warn("Releasing all mouse buttons.");
    try {
      const worker = (await import('../../modules/PowerShellWorker')).PowerShellWorker.getInstance();
      await worker.releaseAllModifiersAndMouse();
    } catch (e) {}
  }

  public async moveMouseSmooth(x: number, y: number) {
    this.ensureInputControl();
    if (CentralTaskScheduler.getInstance().isKeyboardLocked()) {
      logger.warn("MOUSE BLOCKED: Keyboard typing is active. Move mouse smooth request ignored.");
      return;
    }
    await this.mouseEngine.moveSmooth(x, y);
  }

  public async click(button: 'left' | 'right' | 'middle' = 'left', double: boolean = false) {
    this.ensureInputControl();
    if (CentralTaskScheduler.getInstance().isKeyboardLocked()) {
      logger.warn(`MOUSE BLOCKED: Keyboard typing is active. Click (${button}) request ignored.`);
      return;
    }
    await this.mouseEngine.click(button, double);
  }

  public async scroll(amount: number, direction: 'up' | 'down' | 'left' | 'right') {
    this.ensureInputControl();
    if (CentralTaskScheduler.getInstance().isKeyboardLocked()) {
      logger.warn("MOUSE BLOCKED: Keyboard typing is active. Scroll request ignored.");
      return;
    }
    await this.mouseEngine.scroll(amount, direction);
  }

  /**
   * Character-by-character typing utilizing the new KeyboardEngine for safety.
   * Eliminates stuck keys by controlling down/up explicitly for every character.
   */
  public async typeString(text: string) {
    this.ensureInputControl();
    logger.action(`Typing string securely using HighPerformanceTypingEngine: "${text}"`);
    await this.typingEngine.type(text);
  }

  public async typeUnicode(text: string) {
    this.ensureInputControl();
    logger.action(`Typing unicode/clipboard string: "${text}"`);
    const oldClipboard = clipboard.readText();
    clipboard.writeText(text);
    await this.wait(100);
    
    try {
      await this.keyboard.paste();
    } catch (e) {
      if (e instanceof CancellationError) {
        throw e;
      }
    }
    
    await this.wait(100);
    clipboard.writeText(oldClipboard); // restore
  }

  public async typeCode(code: string) {
    this.ensureInputControl();
    logger.action(`Typing multi-line code...`);
    
    if (code.length > 50) {
       await this.typeUnicode(code);
       return;
    }

    const lines = code.split('\n');
    for (const line of lines) {
       this.ensureInputControl();
       await this.typeString(line);
       this.ensureInputControl();
       await this.keyboard.enter();
       await this.wait(50); 
    }
  }

  public async pressKey(key: string, modifiers?: string[]) {
    this.ensureInputControl();
    await this.keyboard.pressKey(key, modifiers);
  }

  public async dragAndDrop(fromX: number, fromY: number, toX: number, toY: number) {
    this.ensureInputControl();
    if (CentralTaskScheduler.getInstance().isKeyboardLocked()) {
      logger.warn("MOUSE BLOCKED: Keyboard typing is active. Drag and drop request ignored.");
      return;
    }
    await this.mouseEngine.dragAndDrop(fromX, fromY, toX, toY);
  }

  public async dragMouse(x: number, y: number) {
    this.ensureInputControl();
    if (CentralTaskScheduler.getInstance().isKeyboardLocked()) {
      logger.warn("MOUSE BLOCKED: Keyboard typing is active. Drag mouse request ignored.");
      return;
    }
    // We can simulate dragMouse by moving smoothly to the target and releasing
    const worker = (await import('../../modules/PowerShellWorker')).PowerShellWorker.getInstance();
    const pos = await worker.getCursorPos();
    await this.mouseEngine.dragAndDrop(pos.x, pos.y, x, y);
  }

  public async maximizeWindow() {
    this.ensureInputControl();
    logger.action("Maximizing window");
    const isMac = os.platform() === 'darwin';
    isMac ? await this.keyboard.pressKey('f', ['command', 'control']) : await this.keyboard.pressKey('up', ['command']);
  }

  public async minimizeWindow() {
    this.ensureInputControl();
    logger.action("Minimizing window");
    const isMac = os.platform() === 'darwin';
    isMac ? await this.keyboard.pressKey('m', ['command']) : await this.keyboard.pressKey('down', ['command']);
  }

  public async closeWindow() {
    this.ensureInputControl();
    logger.action("Closing window");
    await this.keyboard.closeWindow();
  }

  public async scrollUntil(verifyFn: () => Promise<boolean>, maxAttempts = 10, direction: 'up' | 'down' = 'down'): Promise<boolean> {
    this.ensureInputControl();
    logger.action(`Scrolling until condition met (max ${maxAttempts} attempts)`);
    for (let i = 0; i < maxAttempts; i++) {
      this.ensureInputControl();
      if (await verifyFn()) {
        return true;
      }
      await this.scroll(5, direction);
      await this.wait(500); 
    }
    logger.warn(`Failed to meet condition after ${maxAttempts} scrolls`);
    return false;
  }

  private wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
