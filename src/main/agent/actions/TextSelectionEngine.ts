import { logger } from '../core/Logger';
import { ActionEngine } from './ActionEngine';
import { VerificationEngine } from '../../../../ai/verificationEngine/VerificationEngine';

export class TextSelectionEngine {
  private actions: ActionEngine;
  private verifier?: VerificationEngine;

  constructor(actions: ActionEngine, verifier?: VerificationEngine) {
    this.actions = actions;
    this.verifier = verifier;
  }

  public async selectAll() {
    logger.action("Selecting all text (Ctrl+A)");
    await this.actions.keyboard.selectAll();
    await this.verifySelection();
  }

  public async selectWord() {
    logger.action("Selecting current word (Ctrl+Shift+Right)");
    await this.actions.keyboard.pressKey('right', ['control', 'shift']);
    await this.verifySelection();
  }

  public async selectLine() {
    logger.action("Selecting current line (Shift+End)");
    await this.actions.keyboard.pressKey('end', ['shift']);
    await this.verifySelection();
  }

  public async selectMultipleLines(count: number, direction: 'up' | 'down' = 'down') {
    logger.action(`Selecting ${count} lines ${direction}`);
    for (let i = 0; i < count; i++) {
       await this.actions.keyboard.pressKey(direction, ['shift']);
       await this.wait(50);
    }
    await this.verifySelection();
  }

  public async shiftArrowSelect(direction: 'left' | 'right' | 'up' | 'down', times: number = 1) {
    logger.action(`Shift+Arrow ${direction} x${times}`);
    for (let i = 0; i < times; i++) {
       await this.actions.keyboard.pressKey(direction, ['shift']);
       await this.wait(20);
    }
    await this.verifySelection();
  }

  public async mouseDragSelect(fromX: number, fromY: number, toX: number, toY: number) {
    logger.action(`Mouse drag selection from (${fromX}, ${fromY}) to (${toX}, ${toY})`);
    await this.actions.dragAndDrop(fromX, fromY, toX, toY);
    await this.verifySelection();
  }

  /**
   * Tries to verify that text is actually selected by copying it and checking the clipboard.
   * This is much faster and more accurate than OCR for pure text selection.
   */
  public async verifySelection(): Promise<boolean> {
    if (!this.verifier) return true;

    logger.info("Verifying selection via clipboard...");
    const electron = require('electron');
    const clipboard = electron.clipboard;
    
    const oldClipboard = clipboard.readText();
    clipboard.writeText(''); // Clear
    
    await this.actions.keyboard.copy();
    await this.wait(100);
    
    const newClipboard = clipboard.readText();
    
    // Restore
    clipboard.writeText(oldClipboard);
    
    if (newClipboard && newClipboard.length > 0) {
       logger.info(`Verified selection: highlighted ${newClipboard.length} characters.`);
       return true;
    }
    
    logger.warn("Selection verification failed: Nothing was copied to clipboard.");
    return false;
  }

  public async deleteSelected() {
     logger.action("Attempting to delete selected text.");
     
     // 1. Verify target is selected
     const isSelected = await this.verifySelection();
     if (!isSelected) {
        logger.error("Cannot delete: No text is selected.");
        return;
     }

     // 2. Press delete
     await this.actions.keyboard.delete();
     await this.wait(100);

     // 3. Verify result (the selection should now be gone, so copy should yield nothing new)
     const stillSelected = await this.verifySelection();
     if (stillSelected) {
        logger.error("Delete failed: Text is still selected after pressing Delete.");
     } else {
        logger.info("Delete successful and verified.");
     }
  }

  public async backspaceSelected() {
     logger.action("Attempting to backspace selected text.");
     
     const isSelected = await this.verifySelection();
     if (!isSelected) {
        logger.error("Cannot backspace: No text is selected.");
        return;
     }

     await this.actions.keyboard.backspace();
     await this.wait(100);

     const stillSelected = await this.verifySelection();
     if (stillSelected) {
        logger.error("Backspace failed: Text is still selected after pressing Backspace.");
     } else {
        logger.info("Backspace successful and verified.");
     }
  }

  private wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
