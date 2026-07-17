import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { logger } from '../agent/core/Logger';

export class PowerShellTemplateEngine {
  private static instance: PowerShellTemplateEngine | null = null;
  private templatesDir: string;
  private tempDir: string;

  private constructor() {
    // templatesDir is scripts/ps in workspace root
    this.templatesDir = path.resolve(__dirname, '../../../../scripts/ps');
    this.tempDir = path.join(os.tmpdir(), 'avy_ps_scripts');
    
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  public static getInstance(): PowerShellTemplateEngine {
    if (!PowerShellTemplateEngine.instance) {
      PowerShellTemplateEngine.instance = new PowerShellTemplateEngine();
    }
    return PowerShellTemplateEngine.instance;
  }

  /**
   * Loads a template from templatesDir, replaces placeholders,
   * writes the script to a temp file, and runs it via PowerShell -File.
   */
  public async executeTemplate(templateName: string, placeholders: Record<string, string>): Promise<string> {
    const templatePath = path.join(this.templatesDir, `${templateName}.ps1`);
    if (!fs.existsSync(templatePath)) {
      throw new Error(`PowerShellTemplateEngine: Template not found at: ${templatePath}`);
    }

    let content = fs.readFileSync(templatePath, 'utf8');

    // Replace placeholders and validate
    for (const [key, value] of Object.entries(placeholders)) {
      const token = `{{${key}}}`;
      // Basic escaping to prevent script injection in double quotes
      const escapedValue = value.replace(/"/g, '`"').replace(/\$/g, '`$');
      content = content.split(token).join(escapedValue);
    }

    // Validation check: ensure no {{...}} tokens remain
    const tokenRegex = /\{\{[A-Z0-9_]+\}\}/i;
    const match = content.match(tokenRegex);
    if (match) {
      throw new Error(`PowerShellTemplateEngine: Validation failed. Required placeholder was not substituted: ${match[0]} in template: ${templateName}`);
    }

    // Write to a random temporary file
    const tempFileName = `script_${templateName}_${Date.now()}_${Math.floor(Math.random() * 10000)}.ps1`;
    const tempFilePath = path.join(this.tempDir, tempFileName);
    fs.writeFileSync(tempFilePath, content, 'utf8');

    // Execute script via PowerShell -File
    return new Promise<string>((resolve, reject) => {
      // Use powershell.exe with -File parameter and bypass execution policy
      const command = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tempFilePath}"`;
      
      exec(command, (error, stdout, stderr) => {
        // Always delete temp file to prevent leak
        try {
          fs.unlinkSync(tempFilePath);
        } catch (unlinkErr) {
          logger.error(`PowerShellTemplateEngine: Failed to delete temp file ${tempFilePath}`, unlinkErr);
        }

        if (error) {
          reject(new Error(`PowerShell execution error: ${error.message}\nStderr: ${stderr}`));
        } else {
          resolve(stdout);
        }
      });
    });
  }
}
