import { PowerShellWorker } from '../../src/main/modules/PowerShellWorker';
import { logger } from '../../src/main/agent/core/Logger';
import { TaskManager, CancellationError } from '../../ai/taskScheduler/TaskManager';
import { CentralTaskScheduler } from '../../ai/taskScheduler/CentralTaskScheduler';

const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_RIGHTDOWN = 0x0008;
const MOUSEEVENTF_RIGHTUP = 0x0010;
const MOUSEEVENTF_MIDDLEDOWN = 0x0020;
const MOUSEEVENTF_MIDDLEUP = 0x0040;
const MOUSEEVENTF_WHEEL = 0x0800;
const MOUSEEVENTF_HWHEEL = 0x1000;

export class MouseEngine {
  public isProcessing = false;
  private worker: PowerShellWorker;
  
  constructor() {
    this.worker = PowerShellWorker.getInstance();
  }

  private ensureSafety() {
    const taskManager = TaskManager.getInstance();
    if (taskManager.areInputsInhibited()) {
      throw new CancellationError("Inputs are inhibited due to cancellation/emergency stop.");
    }

    if (CentralTaskScheduler.getInstance().isKeyboardLocked()) {
      throw new Error("MOUSE BLOCKED: Keyboard typing is currently active.");
    }
  }

  private async wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Easing function for smooth, human-like movement
  private easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  public async moveSmooth(targetX: number, targetY: number, durationMs: number = 300) {
    this.ensureSafety();
    CentralTaskScheduler.getInstance().acquireLock('mouse');
    this.isProcessing = true;
    try {
      const { width, height } = await this.worker.getScreenSize();
      // Clamp to screen boundaries
      targetX = Math.max(0, Math.min(width - 1, targetX));
      targetY = Math.max(0, Math.min(height - 1, targetY));

      const startPos = await this.worker.getCursorPos();
      let currentX = startPos.x;
      let currentY = startPos.y;

      const distance = Math.hypot(targetX - currentX, targetY - currentY);
      if (distance < 2) {
        await this.worker.setCursorPos(targetX, targetY);
        return;
      }

      logger.action(`MouseEngine: Moving smooth to (${targetX}, ${targetY})`);

      const steps = Math.max(10, Math.floor(durationMs / 15)); // Roughly 60fps update rate
      
      for (let i = 1; i <= steps; i++) {
        this.ensureSafety();
        const t = i / steps;
        const easedT = this.easeInOutQuad(t);
        
        const nextX = currentX + (targetX - currentX) * easedT;
        const nextY = currentY + (targetY - currentY) * easedT;
        
        await this.worker.setCursorPos(nextX, nextY);
        await this.wait(15);
      }
      
      // Ensure final position is exactly the target
      await this.worker.setCursorPos(targetX, targetY);
    } finally {
      this.isProcessing = false;
      CentralTaskScheduler.getInstance().releaseLock('mouse');
    }
  }

  public async click(button: 'left' | 'right' | 'middle' = 'left', double: boolean = false) {
    this.ensureSafety();
    CentralTaskScheduler.getInstance().acquireLock('mouse');
    this.isProcessing = true;
    try {
      // Release any modifiers to prevent accidental shift-clicks etc.
      await this.worker.releaseAllModifiersAndMouse();
      await this.wait(10);
      
      let downFlag = MOUSEEVENTF_LEFTDOWN;
      let upFlag = MOUSEEVENTF_LEFTUP;

      if (button === 'right') {
        downFlag = MOUSEEVENTF_RIGHTDOWN;
        upFlag = MOUSEEVENTF_RIGHTUP;
      } else if (button === 'middle') {
        downFlag = MOUSEEVENTF_MIDDLEDOWN;
        upFlag = MOUSEEVENTF_MIDDLEUP;
      }

      logger.action(`MouseEngine: Clicking ${button} (Double: ${double})`);
      
      // First click
      await this.worker.performMouseEvent(downFlag);
      await this.wait(50);
      await this.worker.performMouseEvent(upFlag);

      if (double) {
        await this.wait(80);
        await this.worker.performMouseEvent(downFlag);
        await this.wait(50);
        await this.worker.performMouseEvent(upFlag);
      }
    } finally {
      this.isProcessing = false;
      CentralTaskScheduler.getInstance().releaseLock('mouse');
    }
  }

  public async scroll(amount: number, direction: 'up' | 'down' | 'left' | 'right') {
    this.ensureSafety();
    CentralTaskScheduler.getInstance().acquireLock('mouse');
    this.isProcessing = true;
    try {
      logger.action(`MouseEngine: Scrolling ${direction} by ${amount}`);
      const scrollTicks = amount * 120;
      
      if (direction === 'up') {
        await this.worker.performMouseEvent(MOUSEEVENTF_WHEEL, scrollTicks);
      } else if (direction === 'down') {
        // PowerShell dwData is uint. For negative values we'd need to handle 32-bit conversion,
        // but passing the signed value converted to unsigned 32-bit integer:
        const negativeTicks = ((-scrollTicks) >>> 0);
        await this.worker.performMouseEvent(MOUSEEVENTF_WHEEL, negativeTicks);
      } else if (direction === 'right') {
        await this.worker.performMouseEvent(MOUSEEVENTF_HWHEEL, scrollTicks);
      } else if (direction === 'left') {
        const negativeTicks = ((-scrollTicks) >>> 0);
        await this.worker.performMouseEvent(MOUSEEVENTF_HWHEEL, negativeTicks);
      }
      await this.wait(100);
    } finally {
      this.isProcessing = false;
      CentralTaskScheduler.getInstance().releaseLock('mouse');
    }
  }

  public async dragAndDrop(fromX: number, fromY: number, toX: number, toY: number) {
    this.ensureSafety();
    CentralTaskScheduler.getInstance().acquireLock('mouse');
    this.isProcessing = true;
    try {
      logger.action(`MouseEngine: Drag and Drop from (${fromX}, ${fromY}) to (${toX}, ${toY})`);
      await this.moveSmooth(fromX, fromY, 200);
      await this.wait(50);
      
      await this.worker.performMouseEvent(MOUSEEVENTF_LEFTDOWN);
      await this.wait(100);
      
      // Moving smooth to destination
      // Using direct worker setCursorPos loop inside here or just call moveSmooth?
      // Calling moveSmooth handles the easing nicely
      // But we need to bypass isProcessing check temporarily or it will fail
      
      // Let's implement inline to avoid isProcessing conflict
      const { width, height } = await this.worker.getScreenSize();
      toX = Math.max(0, Math.min(width - 1, toX));
      toY = Math.max(0, Math.min(height - 1, toY));

      const steps = 20; 
      for (let i = 1; i <= steps; i++) {
        this.ensureSafety();
        const t = i / steps;
        const easedT = this.easeInOutQuad(t);
        
        const nextX = fromX + (toX - fromX) * easedT;
        const nextY = fromY + (toY - fromY) * easedT;
        
        await this.worker.setCursorPos(nextX, nextY);
        await this.wait(15);
      }
      
      await this.worker.setCursorPos(toX, toY);
      await this.wait(100);
      
      await this.worker.performMouseEvent(MOUSEEVENTF_LEFTUP);
    } finally {
      this.isProcessing = false;
      CentralTaskScheduler.getInstance().releaseLock('mouse');
    }
  }
}
