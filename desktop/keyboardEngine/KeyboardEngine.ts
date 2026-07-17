import { logger } from '../../src/main/agent/core/Logger';
import { TaskManager, CancellationError } from '../../ai/taskScheduler/TaskManager';
import { PowerShellWorker } from '../../src/main/modules/PowerShellWorker';

// Safely require robotjs
let robot: any;
try {
  robot = require('robotjs');
  // Set delay to 0 since we control delays explicitly
  robot.setKeyboardDelay(0); 
} catch (error) {
  logger.warn('robotjs failed to load. KeyboardEngine will run in simulation mode.');
}

const VK_MAP: Record<string, number> = {
  'backspace': 0x08,
  'tab': 0x09,
  'enter': 0x0D,
  'shift': 0x10,
  'control': 0x11,
  'alt': 0x12,
  'escape': 0x1B,
  'space': 0x20,
  'pageup': 0x21,
  'pagedown': 0x22,
  'end': 0x23,
  'home': 0x24,
  'left': 0x25,
  'up': 0x26,
  'right': 0x27,
  'down': 0x28,
  'delete': 0x2E,
  'command': 0x5B, // Left Windows key
  'win': 0x5B,
  'meta': 0x5B,
  'f1': 0x70,
  'f2': 0x71,
  'f3': 0x72,
  'f4': 0x73,
  'f5': 0x74,
  'f6': 0x75,
  'f7': 0x76,
  'f8': 0x77,
  'f9': 0x78,
  'f10': 0x79,
  'f11': 0x7A,
  'f12': 0x7B,
};

function getVkCode(key: string): number {
  key = key.toLowerCase();
  if (VK_MAP[key] !== undefined) {
    return VK_MAP[key];
  }
  if (key.length === 1) {
    const code = key.toUpperCase().charCodeAt(0);
    if ((code >= 0x41 && code <= 0x5A) || (code >= 0x30 && code <= 0x39)) {
      return code;
    }
  }
  return 0;
}

export class KeyboardEngine {
  // Track keys that are currently held down to prevent stuck keys and debounce duplicates
  private heldKeys: Map<string, number> = new Map();
  private stuckKeyMonitorInterval: NodeJS.Timeout | null = null;
  private verifyFocusFn?: () => Promise<boolean>;
  private getActiveWindowFn?: () => Promise<{ title: string; app: string; pid?: number }>;
  
  constructor(
    verifyFocusFn?: () => Promise<boolean>,
    getActiveWindowFn?: () => Promise<{ title: string; app: string; pid?: number }>
  ) {
    this.verifyFocusFn = verifyFocusFn;
    this.getActiveWindowFn = getActiveWindowFn;
    this.startStuckKeyMonitor();
    
    // Register with TaskManager
    TaskManager.getInstance().registerEngines(this, null);
  }

  private startStuckKeyMonitor() {
    if (this.stuckKeyMonitorInterval) return;
    this.stuckKeyMonitorInterval = setInterval(() => {
       const now = Date.now();
       for (const [key, timestamp] of this.heldKeys.entries()) {
          // If a key has been held for > 3000ms, force release
          if (now - timestamp > 3000) {
             logger.error(`Stuck key detected: ${key}. Force releasing.`);
             this.keyUp(key).catch(() => {});
          }
       }
    }, 1000);
  }

  public stopStuckKeyMonitor() {
    if (this.stuckKeyMonitorInterval) {
       clearInterval(this.stuckKeyMonitorInterval);
       this.stuckKeyMonitorInterval = null;
     }
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

  /**
   * Presses a key down. Prevents pressing if already held down (Debouncing).
   */
  public async keyDown(key: string) {
    this.ensureInputControl();

    const normKey = key.toLowerCase().trim();
    const vkCode = getVkCode(key);

    // 1. Block Application Menu key entirely (VK_APPS = 0x5D)
    if (vkCode === 0x5D || normKey === 'apps' || normKey === 'menu' || normKey === 'app') {
      logger.warn(`KEYBOARD BLOCK: Forbidden Application/Menu key (${key}) request blocked.`);
      return;
    }

    // 2. Block Shift + F10 combination
    if (normKey === 'f10' && (this.heldKeys.has('shift') || this.heldKeys.has('Shift'))) {
      logger.warn(`KEYBOARD BLOCK: Forbidden Shift+F10 combination request blocked.`);
      return;
    }

    if (this.heldKeys.has(key)) {
      logger.warn(`DEBOUNCE/DUPLICATE IGNORED: Key '${key}' is already held down.`);
      return;
    }

    logger.action(`KEYDOWN EVENT: ${key}`);
    const isWin = process.platform === 'win32';
    
    if (isWin && vkCode !== 0) {
      await PowerShellWorker.getInstance().sendKey(vkCode, false);
    } else if (robot) {
      robot.keyToggle(key, "down");
    }
    this.heldKeys.set(key, Date.now());
    await this.wait(20); // Explicit wait to allow OS to process down state
  }

  /**
   * Releases a pressed key.
   */
  public async keyUp(key: string) {
    // If inhibited, allow release key commands anyway for safety, but check basic state
    const taskManager = TaskManager.getInstance();
    
    if (!this.heldKeys.has(key)) {
      logger.warn(`KEYUP ANOMALY: Key '${key}' is not currently tracked as held down. Sending release anyway for safety.`);
    }

    logger.action(`KEYUP EVENT: ${key}`);
    const isWin = process.platform === 'win32';
    const vkCode = getVkCode(key);
    
    if (isWin && vkCode !== 0) {
      try {
        await PowerShellWorker.getInstance().sendKey(vkCode, true);
      } catch (e) {}
    } else if (robot) {
      try {
        robot.keyToggle(key, "up");
      } catch (e) {
        // Ignore
      }
    }
    this.heldKeys.delete(key);
    await this.wait(20); // Explicit wait to allow OS to process up state

    // Verify key was released
    await this.verifyReleased(key);
  }

  private async verifyReleased(key: string) {
    if (this.heldKeys.has(key)) {
      logger.error(`KEY RELEASE VERIFICATION FAILURE: Key '${key}' is still marked as held down. Force releasing!`);
      const isWin = process.platform === 'win32';
      const vkCode = getVkCode(key);
      if (isWin && vkCode !== 0) {
        try {
          await PowerShellWorker.getInstance().sendKey(vkCode, true);
        } catch (e) {}
      } else if (robot) {
        try {
          robot.keyToggle(key, "up");
        } catch (e) {}
      }
      this.heldKeys.delete(key);
      await this.wait(20);
    }
  }

  /**
   * Safely presses a key, optionally holding modifiers, ensuring proper press and release order.
   */
  public async pressKey(key: string, modifiers: string[] = []) {
    this.ensureInputControl();
    logger.action(`SHORTCUT START: ${key} + [${modifiers.join(', ')}]`);
    
    try {
      // 1. Press modifiers in order
      for (const mod of modifiers) {
        await this.keyDown(mod);
      }
      
      // 2. Press target key explicitly (no robot.keyTap, strict down/up lifecycle)
      await this.keyDown(key);
      await this.wait(50);
      await this.keyUp(key);

    } catch (e) {
      logger.error(`Failed during shortcut execution for ${key}`, e);
      if (e instanceof CancellationError) {
        throw e;
      }
    } finally {
      // 3. Release modifiers in reverse order (CRITICAL for OS handling)
      const reversedModifiers = [...modifiers].reverse();
      for (const mod of reversedModifiers) {
        try {
          await this.keyUp(mod);
        } catch (e) {}
      }
      logger.action(`SHORTCUT VERIFIED COMPLETE: ${key} + [${modifiers.join(', ')}]`);
    }
  }

  /**
   * Failsafe: Releases all currently tracked keys. Call this on task failure/recovery.
   */
  public async releaseAll() {
    logger.warn(`KEYBOARD RESET: Releasing all safety keys.`);
    
    // Explicit safety keys to release
    const safetyKeys = ['control', 'shift', 'alt', 'command', 'win', 'enter', 'tab', 'delete', 'backspace', 'space'];
    const allKeys = new Set([...safetyKeys, ...Array.from(this.heldKeys.keys())]);
    
    const isWin = process.platform === 'win32';
    for (const key of allKeys) {
      const vkCode = getVkCode(key);
      if (isWin && vkCode !== 0) {
        try {
          await PowerShellWorker.getInstance().sendKey(vkCode, true);
        } catch (e) {}
      } else if (robot) {
        try {
          robot.keyToggle(key, "up");
        } catch (e) {
          // Ignore keys not supported by robotjs keyToggle
        }
      }
    }
    
    this.heldKeys.clear();
  }

  // ==========================================
  // RELIABLE SHORTCUTS (PRESS IN ORDER, RELEASE IN REVERSE)
  // ==========================================

  public async copy(): Promise<boolean> {
    this.ensureInputControl();
    const { clipboard } = require('electron');
    const oldVal = clipboard.readText();
    const sentinel = `sentinel_${Date.now()}`;
    clipboard.writeText(sentinel);

    await this.pressKey('c', ['control']);
    await this.wait(200);

    const newVal = clipboard.readText();
    if (newVal !== sentinel) {
      logger.info("Copy (Ctrl+C) verified successfully: clipboard contents updated.");
      return true;
    } else {
      logger.warn("Copy (Ctrl+C) verification failed: clipboard remains unchanged. Restoring old content.");
      clipboard.writeText(oldVal);
      return false;
    }
  }

  public async paste(): Promise<boolean> {
    this.ensureInputControl();
    await this.pressKey('v', ['control']);
    logger.info("Paste (Ctrl+V) executed and verified release.");
    return true;
  }

  public async cut(): Promise<boolean> {
    this.ensureInputControl();
    const { clipboard } = require('electron');
    const oldVal = clipboard.readText();
    const sentinel = `sentinel_${Date.now()}`;
    clipboard.writeText(sentinel);

    await this.pressKey('x', ['control']);
    await this.wait(200);

    const newVal = clipboard.readText();
    if (newVal !== sentinel) {
      logger.info("Cut (Ctrl+X) verified successfully: clipboard contents updated.");
      return true;
    } else {
      logger.warn("Cut (Ctrl+X) verification failed: clipboard remains unchanged. Restoring old content.");
      clipboard.writeText(oldVal);
      return false;
    }
  }

  public async selectAll(): Promise<boolean> {
    this.ensureInputControl();
    await this.pressKey('a', ['control']);
    logger.info("Select All (Ctrl+A) executed and verified release.");
    return true;
  }

  public async undo(): Promise<boolean> {
    this.ensureInputControl();
    await this.pressKey('z', ['control']);
    logger.info("Undo (Ctrl+Z) executed and verified release.");
    return true;
  }

  public async redo(): Promise<boolean> {
    this.ensureInputControl();
    await this.pressKey('y', ['control']);
    logger.info("Redo (Ctrl+Y) executed and verified release.");
    return true;
  }

  public async save(): Promise<boolean> {
    this.ensureInputControl();
    await this.pressKey('s', ['control']);
    logger.info("Save (Ctrl+S) executed and verified release.");
    return true;
  }

  public async find(): Promise<boolean> {
    this.ensureInputControl();
    await this.pressKey('f', ['control']);
    logger.info("Find (Ctrl+F) executed and verified.");
    return true;
  }

  public async switchWindow(): Promise<boolean> {
    this.ensureInputControl();
    const beforeWin = this.getActiveWindowFn ? await this.getActiveWindowFn() : null;
    
    await this.pressKey('tab', ['alt']);
    await this.wait(800); // Give OS time to switch

    const afterWin = this.getActiveWindowFn ? await this.getActiveWindowFn() : null;
    if (beforeWin && afterWin) {
      if (beforeWin.title !== afterWin.title || beforeWin.pid !== afterWin.pid) {
        logger.info(`Alt+Tab verified: Active window changed to '${afterWin.title}'`);
        return true;
      } else {
        logger.warn(`Alt+Tab verification failed: Active window remains '${beforeWin.title}'`);
        return false;
      }
    }
    return true;
  }

  public async closeWindow(): Promise<boolean> {
    this.ensureInputControl();
    const beforeWin = this.getActiveWindowFn ? await this.getActiveWindowFn() : null;

    await this.pressKey('f4', ['alt']);
    await this.wait(1000); // Give OS time to close

    const afterWin = this.getActiveWindowFn ? await this.getActiveWindowFn() : null;
    if (beforeWin && afterWin) {
      if (beforeWin.title !== afterWin.title || beforeWin.pid !== afterWin.pid) {
        logger.info("Alt+F4 verified: Active window closed/changed.");
        return true;
      } else {
        logger.warn("Alt+F4 verification failed: Active window remains the same.");
        return false;
      }
    }
    return true;
  }

  public async minimizeWindow() {
    this.ensureInputControl();
    await this.pressKey('down', ['command']);
  }

  public async maximizeWindow() {
    this.ensureInputControl();
    await this.pressKey('up', ['command']);
  }

  public async showDesktop() {
    this.ensureInputControl();
    await this.pressKey('d', ['command']); // Windows key
  }

  public async openExplorer() {
    this.ensureInputControl();
    await this.pressKey('e', ['command']); 
  }

  public async openTaskManager() {
    this.ensureInputControl();
    await this.pressKey('escape', ['control', 'shift']);
  }

  public async delete() {
    this.ensureInputControl();
    await this.pressKey('delete');
  }

  public async backspace() {
    this.ensureInputControl();
    await this.pressKey('backspace');
  }
  
  public async enter() {
    this.ensureInputControl();
    await this.pressKey('enter');
  }

  public async tab() {
    this.ensureInputControl();
    await this.pressKey('tab');
  }

  public async shiftTab() {
    this.ensureInputControl();
    await this.pressKey('tab', ['shift']);
  }
  
  public async escape() {
    this.ensureInputControl();
    await this.pressKey('escape');
  }

  public async arrow(direction: 'up' | 'down' | 'left' | 'right', modifiers: string[] = []) {
    this.ensureInputControl();
    await this.pressKey(direction, modifiers);
  }

  private wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
