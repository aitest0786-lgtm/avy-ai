import { logger } from '../core/Logger';
import { ActionEngine } from './ActionEngine';
import { VerificationEngine } from '../../../../ai/verificationEngine/VerificationEngine';
import { TaskManager, CancellationError } from '../../../../ai/taskScheduler/TaskManager';

export class CodeWritingEngine {
  private actions: ActionEngine;
  private verifier?: VerificationEngine;
  private isWriting: boolean = false;
  private electron = require('electron');

  constructor(actions: ActionEngine, verifier?: VerificationEngine) {
    this.actions = actions;
    this.verifier = verifier;
  }

  private checkCancellation() {
    if (TaskManager.getInstance().isCancelled()) {
      this.isWriting = false;
      throw new CancellationError("Code writing interrupted by cancellation.");
    }
  }

  /**
   * Types code strictly, line by line, maintaining proper indentation.
   * Actively checks for focus loss and aborts/recovers if needed.
   */
  public async writeCode(code: string, language?: string) {
    logger.info("Starting professional code writing sequence.");
    this.isWriting = true;
    this.checkCancellation();
    
    if (!language) {
       language = this.detectLanguage(code);
       logger.info(`Detected programming language: ${language}`);
    }

    if (!(await this.ensureFocus())) {
       logger.error("Aborting code writing: Could not establish focus.");
       return;
    }

    await this.typeStrictlyVerified(code);
    
    this.isWriting = false;
    logger.info("Code writing sequence completed.");
  }

  private async typeStrictlyVerified(code: string) {
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
       this.checkCancellation();
       if (!this.isWriting) break;

       // Verify focus before every line
       if (!(await this.ensureFocus())) {
          logger.error(`Lost focus at line ${i}. Aborting code write.`);
          break;
       }

       const line = lines[i];
       
       await this.typeAndVerifyLine(line);

       if (i < lines.length - 1) {
          this.checkCancellation();
          await this.actions.keyboard.enter();
          // Wait for the cursor to move to the next line (IDE formatting etc)
          await this.wait(200);
       }
    }
  }

  private async typeAndVerifyLine(line: string, maxRetries = 3) {
      if (line.trim() === '') {
         // Don't verify completely empty lines
         return; 
      }
      
      let attempts = 0;
      while (attempts < maxRetries && this.isWriting) {
          this.checkCancellation();
          attempts++;
          
          // 1. Type the line securely (character by character mapping)
          await this.actions.typeString(line);
          
          if (!this.verifier) {
             return; // Skip verification if no verifier exists
          }

          // 2. Select what we just typed (Shift + Left Arrow * line length)
          for (let c = 0; c < line.length; c++) {
              this.checkCancellation();
              await this.actions.keyboard.pressKey('left', ['shift']);
          }
          await this.wait(100);
          
          // 3. Copy and check clipboard
          const clipboard = this.electron.clipboard;
          const oldClipboard = clipboard.readText();
          clipboard.writeText(''); 
          
          this.checkCancellation();
          await this.actions.keyboard.copy();
          await this.wait(100);
          
          let newClipboard = clipboard.readText();
          clipboard.writeText(oldClipboard); // Restore original clipboard

          // 4. Verify
          if (newClipboard && newClipboard === line) {
              logger.info(`Line verified successfully: "${line}"`);
              // Deselect by moving right
              for (let c = 0; c < line.length; c++) {
                  this.checkCancellation();
                  await this.actions.keyboard.pressKey('right');
              }
              return;
          } else {
              logger.warn(`Verification failed. Expected: "${line}", Got: "${newClipboard}". Backspacing and retrying...`);
              this.checkCancellation();
              // Since it's still selected, we press backspace to remove the incorrect text
              await this.actions.keyboard.backspace();
              await this.wait(100);
              
              // Failsafe: Reset keyboard state just in case a modifier got stuck
              await this.actions.keyboard.releaseAll();
          }
      }

      if (attempts >= maxRetries) {
          logger.error(`Failed to type line correctly after ${maxRetries} attempts: "${line}"`);
      }
  }

  private async ensureFocus(): Promise<boolean> {
    this.checkCancellation();
    if (this.verifier) {
       const isFocused = await this.verifier.verifyFocus();
       if (!isFocused) {
          logger.warn("Editor does not seem to have focus. Attempting to click to focus...");
          this.checkCancellation();
          await this.actions.click();
          await this.wait(200);
          
          // Re-verify
          this.checkCancellation();
          const recheck = await this.verifier.verifyFocus();
          if (!recheck) {
              // Reset keyboard state if we lost focus, to prevent sticky keys outside app
              await this.actions.keyboard.releaseAll();
              return false;
          }
       }
    }
    return true;
  }

  public abortWriting() {
    this.isWriting = false;
    logger.warn("Code writing forcefully aborted.");
  }

  private detectLanguage(code: string): string {
    if (code.includes('import React') || code.includes('JSX')) return 'typescript-react';
    if (code.includes('def ') && code.includes('import ')) return 'python';
    if (code.includes('public class ') || code.includes('System.out')) return 'java';
    if (code.includes('interface ') || code.includes('type ')) return 'typescript';
    if (code.includes('<html>') || code.includes('</div>')) return 'html';
    return 'unknown';
  }

  public async formatDocument() {
    this.checkCancellation();
    logger.info("Formatting document...");
    await this.actions.keyboard.pressKey('f', ['shift', 'alt']);
    await this.wait(500);
  }

  private wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
