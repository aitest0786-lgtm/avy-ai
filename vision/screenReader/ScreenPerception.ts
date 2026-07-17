import { logger } from '../../src/main/agent/core/Logger';
import { OCRService, OCRResult } from '../OCR/OCRService';
import { PowerShellTemplateEngine } from '../../src/main/modules/PowerShellTemplateEngine';

export interface UIElement {
  type: 'button' | 'input' | 'text' | 'image' | 'window';
  text?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export class ScreenPerception {
  private ocr: OCRService;
  private cachedScreen: Buffer | null = null;
  private cachedTime: number = 0;
  private readonly CACHE_TTL_MS = 250; // 250ms screen cache duration

  constructor() {
    this.ocr = new OCRService();
  }

  /**
   * Captures the current screen state natively as a PNG buffer (cached for CACHE_TTL_MS).
   */
  public async captureScreen(force = false): Promise<Buffer | null> {
    const now = Date.now();
    if (this.cachedScreen && !force && (now - this.cachedTime < this.CACHE_TTL_MS)) {
      logger.info("ScreenPerception: Returning cached screen buffer.");
      return this.cachedScreen;
    }

    logger.info("Capturing screen state...");
    try {
      const { desktopCapturer } = require('electron');
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 }
      });
      if (sources.length > 0) {
        this.cachedScreen = sources[0].thumbnail.toPNG();
        this.cachedTime = Date.now();
        return this.cachedScreen;
      }
    } catch (error) {
      logger.error("Failed to capture screen natively via desktopCapturer:", error);
    }
    return null; 
  }

  /**
   * Identifies the currently active window title, process name, and PID on Windows.
   */
  public async getActiveWindow(): Promise<{ title: string; app: string; pid?: number }> {
    logger.info("Identifying active window...");
    if (process.platform !== 'win32') {
      return { title: 'Active Window', app: 'Unknown', pid: 0 };
    }

    try {
      const stdout = await PowerShellTemplateEngine.getInstance().executeTemplate('getActiveWindow', {});
      const parsed = JSON.parse(stdout.trim());
      return {
        title: parsed.title || "Unknown",
        app: parsed.app || "Unknown",
        pid: parsed.pid || 0
      };
    } catch (err) {
      logger.error("Error executing active window script on PowerShellTemplateEngine:", err);
      return { title: 'Unknown', app: 'Unknown', pid: 0 };
    }
  }

  /**
   * Finds the exact coordinates of a specific element based on text using Windows UI Automation or OCR fallback.
   */
  public async findElementCoordinates(searchText: string): Promise<{ x: number, y: number } | null> {
    logger.info(`Searching for element containing text: ${searchText}`);
    if (process.platform === 'win32') {
      const nativeCoords = await this.findElementNatively(searchText);
      if (nativeCoords) {
        logger.info(`UI Automation: Found element "${searchText}" at coords: x=${nativeCoords.x}, y=${nativeCoords.y}`);
        return nativeCoords;
      }
    }

    // Fallback to OCR
    const screenBuffer = await this.captureScreen();
    const match = await this.ocr.findTextOnScreen(searchText, screenBuffer || undefined);
    
    if (match) {
      return { 
        x: match.box.x + (match.box.width / 2), 
        y: match.box.y + (match.box.height / 2) 
      };
    }
    
    return null;
  }

  private async findElementNatively(searchText: string): Promise<{ x: number, y: number } | null> {
    try {
      const stdout = await PowerShellTemplateEngine.getInstance().executeTemplate('findElementNatively', {
        SEARCH_TEXT: searchText
      });
      const out = stdout.trim();
      if (out === "null" || !out) {
        return null;
      }
      const parsed = JSON.parse(out);
      return { x: parsed.x, y: parsed.y };
    } catch (err) {
      logger.error(`Error in findElementNatively via template for: ${searchText}`, err);
      return null;
    }
  }
}
