export class NavigationController {
  private webview: any = null;
  private state: 'idle' | 'navigating' = 'idle';
  private queue: { url: string; resolve: () => void; reject: (err: any) => void }[] = [];
  private currentTimeout: NodeJS.Timeout | null = null;
  private resolveNavigation: (() => void) | null = null;
  private rejectNavigation: ((err: any) => void) | null = null;

  private onFinish: (() => void) | null = null;
  private onFail: ((e: any) => void) | null = null;

  constructor() {}

  public setWebview(webview: any) {
    this.webview = webview;
    // If the webview is replaced, clean up any previous listeners
    this.cleanup();
  }

  public async navigateTo(url: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.queue.push({ url, resolve, reject });
      this.processQueue();
    });
  }

  private processQueue() {
    if (this.state === 'navigating' || this.queue.length === 0) {
      return;
    }

    if (!this.webview) {
      const next = this.queue.shift();
      next?.reject(new Error("NavigationController: Webview reference not available."));
      return;
    }

    const { url, resolve, reject } = this.queue.shift()!;
    this.state = 'navigating';
    this.resolveNavigation = resolve;
    this.rejectNavigation = reject;

    // Listeners must be attached BEFORE calling loadURL
    const handleFinish = () => {
      console.log(`[NavigationController] Load finished successfully for: ${url}`);
      this.cleanup();
      this.state = 'idle';
      resolve();
      this.processQueue();
    };

    const handleFail = (e: any) => {
      // Ignore benign aborted loads (code -3) and non-main-frame failures
      if (e.errorCode === -3 || !e.isMainFrame) {
        console.log(`[NavigationController] Ignoring benign did-fail-load event (code=${e.errorCode}, mainFrame=${e.isMainFrame})`);
        return;
      }
      console.error(`[NavigationController] Load failed for: ${url}. Error: ${e.errorDescription} (Code: ${e.errorCode})`);
      this.cleanup();
      this.state = 'idle';
      reject(new Error(`Navigation failed: ${e.errorDescription} (Code: ${e.errorCode})`));
      this.processQueue();
    };

    this.onFinish = handleFinish;
    this.onFail = handleFail;

    this.webview.addEventListener('did-finish-load', handleFinish);
    this.webview.addEventListener('did-fail-load', handleFail);

    // Timeout (15 seconds) to prevent lockouts/deadlocks
    this.currentTimeout = setTimeout(() => {
      console.error(`[NavigationController] Timeout reached (15s) navigating to: ${url}`);
      this.cleanup();
      this.state = 'idle';
      reject(new Error(`Navigation timed out for URL: ${url}`));
      this.processQueue();
    }, 15000);

    try {
      this.webview.loadURL(url);
    } catch (err: any) {
      console.error(`[NavigationController] Error calling loadURL:`, err);
      this.cleanup();
      this.state = 'idle';
      reject(err);
      this.processQueue();
    }
  }

  private cleanup() {
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
      this.currentTimeout = null;
    }
    if (this.webview) {
      if (this.onFinish) {
        try { this.webview.removeEventListener('did-finish-load', this.onFinish); } catch (err) {}
        this.onFinish = null;
      }
      if (this.onFail) {
        try { this.webview.removeEventListener('did-fail-load', this.onFail); } catch (err) {}
        this.onFail = null;
      }
    }
    this.resolveNavigation = null;
    this.rejectNavigation = null;
  }
}
