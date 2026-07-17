export class Logger {
  private static instance: Logger;
  private metrics: Record<string, number[]> = {
    screen_capture: [],
    ocr: [],
    tool_execution: [],
    model_latency: [],
    response_time: []
  };

  private constructor() {
    // Automatically report performance bottlenecks every 30 seconds
    setInterval(() => {
      this.reportBottlenecks();
    }, 30000);
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private formatMessage(level: string, message: string, context?: any) {
    const timestamp = new Date().toISOString();
    let logStr = `[${level}] ${timestamp} - ${message}`;
    if (context) {
      logStr += ` | Context: ${JSON.stringify(context)}`;
    }
    return logStr;
  }

  public info(message: string, context?: any) {
    console.log(this.formatMessage('INFO', message, context));
  }

  public warn(message: string, context?: any) {
    console.warn(this.formatMessage('WARN', message, context));
  }

  public error(message: string, error?: any) {
    console.error(this.formatMessage('ERROR', message, error));
  }

  public action(actionName: string, details?: any) {
    console.log(this.formatMessage('ACTION', `Executing: ${actionName}`, details));
  }

  public verify(step: string, success: boolean, details?: any) {
    const level = success ? 'VERIFY_OK' : 'VERIFY_FAIL';
    console.log(this.formatMessage(level, `Step: ${step}`, details));
  }

  public timing(actionName: string, durationMs: number) {
    console.log(this.formatMessage('TIMING', `${actionName} took ${durationMs}ms`));
  }

  public retry(actionName: string, attempt: number, maxAttempts: number) {
    console.warn(this.formatMessage('RETRY', `Retrying ${actionName} (Attempt ${attempt} of ${maxAttempts})`));
  }

  public recordMetric(category: 'screen_capture' | 'ocr' | 'tool_execution' | 'model_latency' | 'response_time', durationMs: number) {
    if (!this.metrics[category]) {
      this.metrics[category] = [];
    }
    this.metrics[category].push(durationMs);
  }

  public reportBottlenecks() {
    const activeMetrics = Object.entries(this.metrics).filter(([_, times]) => times.length > 0);
    if (activeMetrics.length === 0) return;

    console.log("┌────────────────────────────────────────────────────────┐");
    console.log("│             AVY PERFORMANCE BOTTLENECKS                │");
    console.log("├────────────────────────────────────────────────────────┤");
    for (const [category, times] of activeMetrics) {
      const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
      const max = Math.max(...times);
      const name = category.replace('_', ' ').toUpperCase();
      console.log(`│ ${name.padEnd(20)} : Avg: ${avg}ms | Max: ${max}ms (${times.length} runs)`.padEnd(54) + " │");
    }
    console.log("└────────────────────────────────────────────────────────┘");
  }
}

export const logger = Logger.getInstance();
