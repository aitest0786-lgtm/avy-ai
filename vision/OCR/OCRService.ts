import { logger } from '../../src/main/agent/core/Logger';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OCRResult {
  text: string;
  box: BoundingBox;
  confidence: number;
}

export class OCRService {
  private cache = new Map<Buffer, OCRResult[]>();

  constructor() {}

  /**
   * Simulates extracting text from the screen using an OCR engine.
   * Caches results per image buffer to prevent duplicate OCR runs.
   */
  public async extractTextFromScreen(imageBuffer?: Buffer): Promise<OCRResult[]> {
    if (imageBuffer && this.cache.has(imageBuffer)) {
      logger.info("OCRService: Returning cached OCR results.");
      return this.cache.get(imageBuffer)!;
    }

    logger.info("OCRService: Extracting text from screen image...");
    
    // Simulate OCR delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Return dummy results for testing
    const results: OCRResult[] = [
      { text: "Submit", box: { x: 100, y: 200, width: 80, height: 30 }, confidence: 0.95 },
      { text: "Search", box: { x: 400, y: 50, width: 60, height: 25 }, confidence: 0.98 },
      { text: "Cancel", box: { x: 200, y: 200, width: 80, height: 30 }, confidence: 0.92 }
    ];

    if (imageBuffer) {
      this.cache.set(imageBuffer, results);
    }

    return results;
  }

  public async findTextOnScreen(searchText: string, imageBuffer?: Buffer): Promise<OCRResult | null> {
    const results = await this.extractTextFromScreen(imageBuffer);
    
    // Simple exact or partial match
    const match = results.find(r => r.text.toLowerCase().includes(searchText.toLowerCase()));
    
    if (match) {
      logger.info(`OCRService: Found text "${searchText}" at coordinates: x=${match.box.x}, y=${match.box.y}`);
      return match;
    }

    logger.warn(`OCRService: Text "${searchText}" not found on screen.`);
    return null;
  }
}
