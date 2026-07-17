import { logger } from './Logger';

export interface PerformanceMetrics {
  responseLatencies: number[];
  typingThroughputs: number[]; // characters per second (CPS)
  typingAccuracies: number[];  // percentage (0-100)
  appLaunchTimes: Record<string, number[]>;
  browserLoadTimes: number[];
  errorRate: number;
  recoveryEvents: number;
}

export class BenchmarkManager {
  private static instance: BenchmarkManager | null = null;
  
  private metrics: PerformanceMetrics = {
    responseLatencies: [],
    typingThroughputs: [],
    typingAccuracies: [],
    appLaunchTimes: {},
    browserLoadTimes: [],
    errorRate: 0,
    recoveryEvents: 0
  };

  private totalErrors = 0;
  private totalOperations = 0;

  private constructor() {}

  public static getInstance(): BenchmarkManager {
    if (!BenchmarkManager.instance) {
      BenchmarkManager.instance = new BenchmarkManager();
    }
    return BenchmarkManager.instance;
  }

  public recordResponseLatency(ms: number) {
    this.metrics.responseLatencies.push(ms);
    logger.info(`[Benchmark] Response Latency recorded: ${ms}ms. Avg: ${this.getAverage(this.metrics.responseLatencies).toFixed(1)}ms`);
  }

  public recordTypingThroughput(cps: number) {
    this.metrics.typingThroughputs.push(cps);
    logger.info(`[Benchmark] Typing Throughput recorded: ${cps} CPS. Avg: ${this.getAverage(this.metrics.typingThroughputs).toFixed(1)} CPS`);
  }

  public recordTypingAccuracy(accuracyPct: number) {
    this.metrics.typingAccuracies.push(accuracyPct);
    logger.info(`[Benchmark] Typing Accuracy recorded: ${accuracyPct}%. Avg: ${this.getAverage(this.metrics.typingAccuracies).toFixed(1)}%`);
  }

  public recordAppLaunchTime(appName: string, ms: number) {
    if (!this.metrics.appLaunchTimes[appName]) {
      this.metrics.appLaunchTimes[appName] = [];
    }
    this.metrics.appLaunchTimes[appName].push(ms);
    logger.info(`[Benchmark] App Launch Time for '${appName}' recorded: ${ms}ms. Avg: ${this.getAverage(this.metrics.appLaunchTimes[appName]).toFixed(1)}ms`);
  }

  public recordBrowserLoadTime(ms: number) {
    this.metrics.browserLoadTimes.push(ms);
    logger.info(`[Benchmark] Browser Load Time recorded: ${ms}ms. Avg: ${this.getAverage(this.metrics.browserLoadTimes).toFixed(1)}ms`);
  }

  public recordError(operationName: string) {
    this.totalErrors++;
    this.totalOperations++;
    this.updateErrorRate();
    logger.warn(`[Benchmark] Error encountered in '${operationName}'. Total errors: ${this.totalErrors}, Current Error Rate: ${(this.metrics.errorRate * 100).toFixed(1)}%`);
  }

  public recordSuccess() {
    this.totalOperations++;
    this.updateErrorRate();
  }

  public recordRecoveryEvent() {
    this.metrics.recoveryEvents++;
    logger.info(`[Benchmark] Focus Recovery Event recorded. Total recovery events: ${this.metrics.recoveryEvents}`);
  }

  private updateErrorRate() {
    if (this.totalOperations > 0) {
      this.metrics.errorRate = this.totalErrors / this.totalOperations;
    }
  }

  private getAverage(arr: number[]): number {
    if (arr.length === 0) return 0;
    const sum = arr.reduce((a, b) => a + b, 0);
    return sum / arr.length;
  }

  public getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  public printSummary() {
    console.log("┌────────────────────────────────────────────────────────┐");
    console.log("│               AVY SYSTEM BENCHMARKS SUMMARY            │");
    console.log("├────────────────────────────────────────────────────────┤");
    console.log(`│ Avg Response Latency : ${(this.getAverage(this.metrics.responseLatencies).toFixed(1) + " ms").padEnd(31)} │`);
    console.log(`│ Avg Typing Speed     : ${(this.getAverage(this.metrics.typingThroughputs).toFixed(1) + " CPS").padEnd(31)} │`);
    console.log(`│ Avg Typing Accuracy  : ${(this.getAverage(this.metrics.typingAccuracies).toFixed(1) + " %").padEnd(31)} │`);
    console.log(`│ Error Rate           : ${((this.metrics.errorRate * 100).toFixed(1) + " %").padEnd(31)} │`);
    console.log(`│ Focus Recoveries     : ${this.metrics.recoveryEvents.toString().padEnd(31)} │`);
    console.log("└────────────────────────────────────────────────────────┘");
  }
}
