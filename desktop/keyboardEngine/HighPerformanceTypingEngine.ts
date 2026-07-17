import { logger } from '../../src/main/agent/core/Logger';
import { TaskManager, CancellationError } from '../../ai/taskScheduler/TaskManager';
import { CentralTaskScheduler } from '../../ai/taskScheduler/CentralTaskScheduler';
import { PowerShellWorker } from '../../src/main/modules/PowerShellWorker';
import { BenchmarkManager } from '../../src/main/agent/core/BenchmarkManager';

let robot: any;
try {
  robot = require('robotjs');
  robot.setKeyboardDelay(0);
} catch (e) {
  logger.warn('robotjs failed to load. HighPerformanceTypingEngine running in simulation mode.');
}

interface CharEvent {
  char: string;
  key: string;
  modifiers: string[];
}

export class HighPerformanceTypingEngine {
  private queue: CharEvent[] = [];
  public isProcessing: boolean = false;
  private currentDelayMs: number = 20; // Start delay (safe default)
  private minDelayMs: number = 5;      // Max speed limit (ultra fast)
  private maxDelayMs: number = 100;    // Min speed limit (when lagging)
  
  // Performance metrics
  private totalCharsTyped: number = 0;
  private errorsCount: number = 0;
  private startTime: number = 0;
  private cancellationsCount: number = 0;
  
  private lastTypedChar: string = "";
  private verifyFocusFn?: () => Promise<boolean>;
  private getActiveWindowFn?: () => Promise<{ title: string; app: string; pid?: number }>;

  constructor(
    verifyFocusFn?: () => Promise<boolean>,
    getActiveWindowFn?: () => Promise<{ title: string; app: string; pid?: number }>
  ) {
    this.verifyFocusFn = verifyFocusFn;
    this.getActiveWindowFn = getActiveWindowFn;
  }

  public increaseSafeSpeed() {
    this.minDelayMs = Math.max(2, this.minDelayMs - 2);
    this.currentDelayMs = Math.max(this.minDelayMs, this.currentDelayMs - 5);
    logger.info(`TYPING SPEED OPTIMIZED: Increased safe speed. New min delay: ${this.minDelayMs}ms, current delay: ${this.currentDelayMs}ms.`);
  }

  public async type(text: string): Promise<{ success: boolean; typedCount: number; cps: number }> {
    this.startTime = Date.now();
    this.totalCharsTyped = 0;
    this.errorsCount = 0;
    this.queue = [];
    
    // Parse text into queue of character events
    for (const char of text) {
      this.queue.push(this.mapCharToEvent(char));
    }

    this.isProcessing = true;
    const scheduler = CentralTaskScheduler.getInstance();
    scheduler.acquireLock('keyboard');
    logger.info(`Starting independent Keyboard Engine V2 for ${this.queue.length} characters.`);

    const isWin = process.platform === 'win32';
    let targetWindow: { title: string; app: string; pid: number } | null = null;

    try {
      // 1. INPUT RULES - BEFORE STARTING TO TYPE:
      // A. Release all modifiers and mouse buttons
      if (isWin) {
        logger.info("[TypingEngine] Releasing all modifier keys and mouse buttons before typing...");
        await PowerShellWorker.getInstance().releaseAllModifiersAndMouse();
        
        // B. Verify no mouse button is pressed
        let mousePressed = await PowerShellWorker.getInstance().isMouseButtonPressed();
        if (mousePressed) {
          logger.warn("[TypingEngine] Mouse button detected down. Waiting for release...");
          for (let attempt = 1; attempt <= 20; attempt++) {
            await this.wait(100);
            mousePressed = await PowerShellWorker.getInstance().isMouseButtonPressed();
            if (!mousePressed) break;
          }
          if (mousePressed) {
            logger.error("[TypingEngine] Mouse button still pressed. Attempting final force-release.");
            await PowerShellWorker.getInstance().releaseAllModifiersAndMouse();
          }
        }
      }

      // C. Verify the target input field has focus (initial check)
      if (isWin) {
        targetWindow = await PowerShellWorker.getInstance().getActiveWindow();
        logger.info(`[TypingEngine] Target focus window verified: title="${targetWindow.title}", app="${targetWindow.app}", pid=${targetWindow.pid}`);
      } else if (this.verifyFocusFn) {
        let hasFocus = await this.verifyFocusFn();
        if (!hasFocus) {
          logger.warn("[TypingEngine] Target window not focused. Waiting for focus...");
          for (let i = 0; i < 10; i++) {
            await this.wait(500);
            hasFocus = await this.verifyFocusFn();
            if (hasFocus) break;
          }
          if (!hasFocus) {
            throw new Error("Typing aborted: Target window did not receive focus.");
          }
        }
      }

      // 2. BEGIN TYPING
      let charIndex = 0;
      while (this.queue.length > 0) {
        const taskManager = TaskManager.getInstance();
        if (taskManager.areInputsInhibited()) {
          this.cancellationsCount++;
          logger.warn("Typing cancelled via Global Stop Request. Clearing queue.");
          await this.emergencyStop();
          throw new CancellationError("Typing interrupted.");
        }

        // A. ERROR RECOVERY - CONTEXT MENU DETECTION
        if (isWin && targetWindow) {
          const menuOpen = await PowerShellWorker.getInstance().isContextMenuOpen();
          if (menuOpen) {
            logger.warn("[TypingEngine] Context menu detected mid-typing! Recovery triggered.");
            this.errorsCount++;
            BenchmarkManager.getInstance().recordRecoveryEvent();
            BenchmarkManager.getInstance().recordError("context_menu_detected");

            // Press Escape to close it
            await PowerShellWorker.getInstance().sendKey(0x1B, false); // Escape Down
            await this.wait(10);
            await PowerShellWorker.getInstance().sendKey(0x1B, true);  // Escape Up
            await this.wait(100);

            // Restore focus to input field
            await PowerShellWorker.getInstance().restoreFocus(targetWindow.pid);
            await this.wait(200);

            logger.info("[TypingEngine] Context menu closed. Resuming typing from the current character...");
            continue; // Re-evaluate loop without popping queue
          }
        }

        // B. FOCUS LOST AUTO-PAUSE
        if (isWin && targetWindow) {
          let activeWin = await PowerShellWorker.getInstance().getActiveWindow();
          if (activeWin.pid !== targetWindow.pid && activeWin.title !== targetWindow.title) {
            logger.warn(`[TypingEngine] Focus lost! Expected PID ${targetWindow.pid} (${targetWindow.app}), but active window is PID ${activeWin.pid} (${activeWin.app}). Pausing typing engine...`);
            this.errorsCount++;
            BenchmarkManager.getInstance().recordError("typing_focus_lost");

            // Pause typing until focus is restored
            let focusRestored = false;
            while (this.isProcessing && !focusRestored) {
              if (taskManager.areInputsInhibited()) {
                throw new CancellationError("Typing interrupted during focus loss pause.");
              }
              await this.wait(500);
              activeWin = await PowerShellWorker.getInstance().getActiveWindow();
              if (activeWin.pid === targetWindow.pid) {
                focusRestored = true;
                logger.info("[TypingEngine] Focus restored! Resuming typing from current character.");
                break;
              }
            }
          }
        } else if (!isWin && this.verifyFocusFn) {
          let hasFocus = await this.verifyFocusFn();
          if (!hasFocus) {
            logger.warn("[TypingEngine] Focus lost mid-typing. Pausing typing engine...");
            this.errorsCount++;
            let focusRestored = false;
            while (this.isProcessing && !focusRestored) {
              if (taskManager.areInputsInhibited()) {
                throw new CancellationError("Typing interrupted during focus loss pause.");
              }
              await this.wait(1000);
              focusRestored = await this.verifyFocusFn();
            }
            logger.info("[TypingEngine] Focus restored. Resuming typing.");
          }
        }

        const event = this.queue.shift();
        if (!event) break;

        // C. Send key down & key up exactly once
        const startStroke = Date.now();
        await this.sendKeyStroke(event);
        const strokeLatency = Date.now() - startStroke;

        // D. Adaptive Speed calculation
        if (strokeLatency > 30) {
          this.adjustSpeed(false);
        } else {
          this.adjustSpeed(true);
        }

        this.totalCharsTyped++;
        charIndex++;
        this.lastTypedChar = event.char;

        BenchmarkManager.getInstance().recordSuccess();

        await this.wait(this.currentDelayMs);
      }

      this.isProcessing = false;
      const cps = this.calculateCPS();
      
      BenchmarkManager.getInstance().recordTypingThroughput(cps);
      const accuracy = this.totalCharsTyped > 0 
        ? ((this.totalCharsTyped - this.errorsCount) / this.totalCharsTyped) * 100
        : 100;
      BenchmarkManager.getInstance().recordTypingAccuracy(accuracy);

      this.logPerformanceMetrics();
      return {
        success: true,
        typedCount: this.totalCharsTyped,
        cps: cps
      };
    } catch (err) {
      this.isProcessing = false;
      await this.emergencyStop();
      this.logPerformanceMetrics();
      throw err;
    } finally {
      this.isProcessing = false;
      CentralTaskScheduler.getInstance().releaseLock('keyboard');
      await this.releaseAllModifiers();
    }
  }

  private mapCharToEvent(char: string): CharEvent {
    const isUpper = /[A-Z]/.test(char);
    const isLetter = /[a-zA-Z]/.test(char);
    
    const charMap: Record<string, {key: string, modifiers: string[]}> = {
      '\n': { key: 'enter', modifiers: [] },
      '\t': { key: 'tab', modifiers: [] },
      ' ': { key: 'space', modifiers: [] },
      '~': { key: '`', modifiers: ['shift'] },
      '!': { key: '1', modifiers: ['shift'] },
      '@': { key: '2', modifiers: ['shift'] },
      '#': { key: '3', modifiers: ['shift'] },
      '$': { key: '4', modifiers: ['shift'] },
      '%': { key: '5', modifiers: ['shift'] },
      '^': { key: '6', modifiers: ['shift'] },
      '&': { key: '7', modifiers: ['shift'] },
      '*': { key: '8', modifiers: ['shift'] },
      '(': { key: '9', modifiers: ['shift'] },
      ')': { key: '0', modifiers: ['shift'] },
      '_': { key: '-', modifiers: ['shift'] },
      '+': { key: '=', modifiers: ['shift'] },
      '{': { key: '[', modifiers: ['shift'] },
      '}': { key: ']', modifiers: ['shift'] },
      '|': { key: '\\', modifiers: ['shift'] },
      ':': { key: ';', modifiers: ['shift'] },
      '"': { key: '\'', modifiers: ['shift'] },
      '<': { key: ',', modifiers: ['shift'] },
      '>': { key: '.', modifiers: ['shift'] },
      '?': { key: '/', modifiers: ['shift'] },
    };

    if (charMap[char]) {
      return { char, ...charMap[char] };
    } else if (isLetter) {
      return { char, key: char.toLowerCase(), modifiers: isUpper ? ['shift'] : [] };
    } else {
      return { char, key: char.toLowerCase(), modifiers: [] };
    }
  }

  private async sendKeyStroke(event: CharEvent) {
    const isWin = process.platform === 'win32';

    try {
      if (isWin) {
        // Log event for debugging
        logger.info(`[TypingEngine V2] KEY EVENT: char='${event.char}' key='${event.key}' code=${event.char.charCodeAt(0)}`);

        // Check if this is a special virtual key that needs VK codes
        const controlKeys: Record<string, number> = {
          'enter': 0x0D,
          'tab': 0x09,
          'space': 0x20,
          'escape': 0x1B,
          'backspace': 0x08,
          'delete': 0x2E
        };

        const keyLower = event.key.toLowerCase();
        if (controlKeys[keyLower] !== undefined) {
          const vk = controlKeys[keyLower];
          // KeyDown
          await PowerShellWorker.getInstance().sendKey(vk, false);
          await this.wait(4);
          // KeyUp
          await PowerShellWorker.getInstance().sendKey(vk, true);
        } else {
          // KeyDown
          await PowerShellWorker.getInstance().sendUnicodeChar(event.char, false);
          await this.wait(4);
          // KeyUp
          await PowerShellWorker.getInstance().sendUnicodeChar(event.char, true);
        }
      } else {
        // Fallback for macOS/Linux
        const isNonAscii = /[^\x00-\x7F]/.test(event.char);
        if (isNonAscii) {
          await this.pasteChar(event.char);
        } else {
          if (robot) {
            for (const mod of event.modifiers) {
              robot.keyToggle(mod, "down");
            }
            robot.keyToggle(event.key, "down");
            await this.wait(4);
            robot.keyToggle(event.key, "up");
            for (const mod of [...event.modifiers].reverse()) {
              robot.keyToggle(mod, "up");
            }
          }
        }
      }
    } catch (e: any) {
      this.errorsCount++;
      logger.error(`Error sending keystroke for '${event.char}':`, e);
      await this.releaseAllModifiers();
    }
  }

  private async pasteChar(char: string) {
    const { clipboard } = require('electron');
    const isMac = process.platform === 'darwin';
    const pasteModifiers = isMac ? ['command'] : ['control'];
    const oldClipboard = clipboard.readText();
    clipboard.writeText(char);
    
    try {
      if (robot) {
        for (const mod of pasteModifiers) {
          robot.keyToggle(mod, "down");
        }
        robot.keyToggle("v", "down");
        await this.wait(4);
        robot.keyToggle("v", "up");
        for (const mod of [...pasteModifiers].reverse()) {
          robot.keyToggle(mod, "up");
        }
        await this.wait(10);
      }
    } finally {
      clipboard.writeText(oldClipboard);
    }
  }

  private adjustSpeed(success: boolean) {
    if (success) {
      this.currentDelayMs = Math.max(this.minDelayMs, this.currentDelayMs - 1);
    } else {
      this.currentDelayMs = Math.min(this.maxDelayMs, this.currentDelayMs + 10);
    }
  }

  public async releaseAllModifiers() {
    const isWin = process.platform === 'win32';
    if (isWin) {
      await PowerShellWorker.getInstance().releaseAllModifiersAndMouse();
    } else if (robot) {
      const modifiers = ['control', 'shift', 'alt', 'command'];
      for (const mod of modifiers) {
        try {
          robot.keyToggle(mod, "up");
        } catch (e) {}
      }
    }
  }

  public async emergencyStop() {
    this.queue = [];
    await this.releaseAllModifiers();
    const isWin = process.platform === 'win32';
    if (isWin) {
      const keys = [0x0D, 0x09, 0x20, 0x1B, 0x2E, 0x08]; // Enter, Tab, Space, Esc, Delete, Backspace
      for (const key of keys) {
        PowerShellWorker.getInstance().sendKey(key, true).catch(() => {});
      }
    } else if (robot) {
      const keysToRelease = ['enter', 'tab', 'space', 'escape', 'delete', 'backspace'];
      for (const key of keysToRelease) {
        try {
          robot.keyToggle(key, "up");
        } catch (e) {}
      }
    }
    logger.warn("HighPerformanceTypingEngine V2: Native emergency stop completed, all keys released.");
  }

  private calculateCPS(): number {
    const elapsed = (Date.now() - this.startTime) / 1000;
    return elapsed > 0 ? parseFloat((this.totalCharsTyped / elapsed).toFixed(1)) : 0;
  }

  private logPerformanceMetrics() {
    const cps = this.calculateCPS();
    const errorRate = this.totalCharsTyped > 0 
      ? parseFloat(((this.errorsCount / this.totalCharsTyped) * 100).toFixed(1)) 
      : 0;

    console.log("┌────────────────────────────────────────────────────────┐");
    console.log("│         AVY HIGH-PERFORMANCE TYPING ENGINE METRICS V2  │");
    console.log("├────────────────────────────────────────────────────────┤");
    console.log(`│ Characters Typed  : ${this.totalCharsTyped.toString().padEnd(35)} │`);
    console.log(`│ Speed (Char/Sec)  : ${cps.toString().padEnd(35)} │`);
    console.log(`│ Error Rate (%)    : ${errorRate.toString().padEnd(35)} │`);
    console.log(`│ Current Delay     : ${(this.currentDelayMs + "ms").padEnd(35)} │`);
    console.log(`│ Cancellations     : ${this.cancellationsCount.toString().padEnd(35)} │`);
    console.log("└────────────────────────────────────────────────────────┘");
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
