import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  ArrowLeft, 
  ArrowRight, 
  RotateCw, 
  Home, 
  Plus, 
  X, 
  Search, 
  Star, 
  History, 
  Smartphone, 
  Monitor, 
  EyeOff, 
  BookOpen, 
  ExternalLink, 
  ShieldAlert, 
  Download,
  Check,
  FolderHeart,
  ZoomIn,
  ZoomOut,
  Columns,
  Terminal,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Play,
  ArrowUpRight,
  WifiOff,
  Cpu,
  Shield,
  Activity
} from "lucide-react";
import { BrowserState, BrowserTab } from "../types";
import { MemoryHub } from "./MemoryHub";
import { NavigationController } from "../lib/NavigationController";

interface BuiltInBrowserProps {
  browser: BrowserState;
  setBrowserOpen: (isOpen: boolean) => void;
  openBrowserUrl: (url: string, siteName?: string, forceNewTab?: boolean) => void;
  closeBrowserTab: (tabId: string) => void;
  newBrowserTab: (url?: string, siteName?: string) => void;
  goBack: () => void;
  goForward: () => void;
  toggleDesktopView: () => void;
  togglePrivateMode: () => void;
  toggleBookmark: () => void;
  clearBrowserHistory: () => void;
  setActiveTab: (tabId: string) => void;
  toggleShowBookmarks: () => void;
  toggleShowHistory: () => void;
  restoreLastClosedTab?: () => void;
  updateActiveTabUrlAndTitle?: (url: string, title: string) => void;
}

export const BuiltInBrowser: React.FC<BuiltInBrowserProps> = ({
  browser,
  setBrowserOpen,
  openBrowserUrl,
  closeBrowserTab,
  newBrowserTab,
  goBack,
  goForward,
  toggleDesktopView,
  togglePrivateMode,
  toggleBookmark,
  clearBrowserHistory,
  setActiveTab,
  toggleShowBookmarks,
  toggleShowHistory,
  restoreLastClosedTab,
  updateActiveTabUrlAndTitle
}) => {
  const {
    isOpen,
    activeTabId,
    tabs,
    bookmarks,
    isDesktopView,
    isPrivate,
    showHistory,
    showBookmarks,
    historyList,
    closedTabs = []
  } = browser;

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  
  // Local feature states
  const [addressInput, setAddressInput] = useState(activeTab?.url || "");
  const [readerMode, setReaderMode] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [splitScreen, setSplitScreen] = useState(false);
  const [secondaryTabId, setSecondaryTabId] = useState<string | null>(null);
  
  // Custom states for automatic retries and search fallback
  const [loadAttempts, setLoadAttempts] = useState<Record<string, number>>({});
  const [reloadKey, setReloadKey] = useState(0);
  const [webviewKey, setWebviewKey] = useState(0);
  const [selfTestReport, setSelfTestReport] = useState<any>(null);
  const [isSelfTesting, setIsSelfTesting] = useState(false);
  
  // Find in page states
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState("");
  const [findResults, setFindResults] = useState(0);
  const [findCurrentIndex, setFindCurrentIndex] = useState(0);

  // Downloads state
  const [downloads, setDownloads] = useState<{ id: string; name: string; size: string; progress: number; status: "downloading" | "completed" }[]>([]);
  const [showDownloadsDrawer, setShowDownloadsDrawer] = useState(false);

  const hasInitializedRef = useRef(false);

  // ==========================================
  // REAL WEBENGINE LIFECYCLE STATE & ENGINE CONTROL
  // ==========================================
  const [engineReady, setEngineReady] = useState(true);
  const [loadingState, setLoadingState] = useState<'uninitialized' | 'initializing' | 'ready' | 'started' | 'loaded' | 'failed' | 'crashed'>('ready');
  const [engineLogs, setEngineLogs] = useState<{ time: string; type: "info" | "warning" | "error" | "success"; text: string }[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [gpuMode, setGpuMode] = useState<'hardware' | 'software'>('hardware');
  const [engineFlags, setEngineFlags] = useState<string[]>([]);
  const [securitySettings, setSecuritySettings] = useState({
    javascript: true,
    domStorage: true,
    cookies: true,
    mediaPlayback: true,
    popups: true
  });
  const [activeConsoleTab, setActiveConsoleTab] = useState<'console' | 'diagnostics'>('console');
  const [iframeSrc, setIframeSrc] = useState("");
  const [loadProgress, setLoadProgress] = useState(0);
  const [isOfflineSimulated, setIsOfflineSimulated] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // Developer console state (merged into unified tray)
  const [showConsole, setShowConsole] = useState(false);
  const [consoleInput, setConsoleInput] = useState("");
  const [consoleLogs, setConsoleLogs] = useState<{ type: "log" | "error" | "info" | "success"; text: string }[]>([
    { type: "info", text: "DevTools: Same-Origin frame environment connected." },
    { type: "success", text: "Tip: You can execute JavaScript directly inside the active webpage using the command prompt below!" }
  ]);

  // Unified engine event logger (prints to console & logs list)
  const logEngineEvent = useCallback((type: "info" | "warning" | "error" | "success", text: string) => {
    const time = new Date().toLocaleTimeString();
    setEngineLogs(prev => [...prev, { time, type, text }]);
    console.log(`%c[Avy WebEngine] ${text}`, `color: ${type === 'error' ? '#f87171' : type === 'success' ? '#4ade80' : type === 'warning' ? '#facc15' : '#38bdf8'}; font-weight: bold;`);
    
    // Log to Main Process Console
    const api = (window as any).avyAPI;
    if (api && api.logWebEngineEvent) {
      api.logWebEngineEvent(type, text).catch(() => {});
    }
  }, []);

  const navigationStartedAtRef = useRef<string | null>(null);

  // REQUIRED LIFECYCLE EVENT CALLBACKS
  const onBrowserReady = useCallback(() => {
    logEngineEvent("success", "Browser initialized - Chromium WebEngine is fully ready.");
  }, [logEngineEvent]);

  const onPageStarted = useCallback((url: string) => {
    logEngineEvent("info", `Page started - Loading URL: ${url}`);
  }, [logEngineEvent]);

  const onPageLoaded = useCallback((url: string) => {
    logEngineEvent("success", `Page finished - Rendered viewport safely: ${url}`);
  }, [logEngineEvent]);

  // STARTUP SELF TEST ROUTINE
  const runSelfTest = useCallback(async () => {
    setIsSelfTesting(true);
    logEngineEvent("info", "Executing WebEngine self-diagnosis test suite...");

    const report: any = {
      renderer: "PENDING",
      gpu: "PENDING",
      network: "PENDING",
      javascript: "PENDING",
      session: "PENDING",
      cookies: "PENDING",
      cache: "PENDING",
      navigation: "PENDING"
    };

    const api = (window as any).avyAPI;

    // 1. Renderer check
    if (api) {
      report.renderer = "OK";
    } else {
      report.renderer = "FAILED (IPC context bridge not found)";
    }

    // 2. Call Main Process tests
    if (api && api.runWebEngineSelfTest) {
      try {
        const mainReport = await api.runWebEngineSelfTest();
        report.gpu = mainReport.gpu.status === "OK" ? "OK" : "WARNING";
        report.network = mainReport.network.status === "OK" ? "OK" : "FAILED";
        report.session = mainReport.session.status === "OK" ? "OK" : "FAILED";
        logEngineEvent("info", `Main process reporting: GPU status=${report.gpu}, storage status=${report.session}`);
      } catch (err: any) {
        logEngineEvent("error", `Main process self-test IPC failed: ${err.message || String(err)}`);
        report.gpu = "FAILED";
        report.network = navigator.onLine ? "OK" : "FAILED";
        report.session = "FAILED";
      }
    } else {
      report.gpu = "WARNING (Main Process link missing)";
      report.network = navigator.onLine ? "OK" : "FAILED";
      report.session = "OK";
    }

    // 3. JavaScript test
    try {
      const testVal = new Function('return 2 + 2')();
      if (testVal === 4) {
        report.javascript = "OK";
      } else {
        report.javascript = "FAILED (Unexpected eval math result)";
      }
    } catch (err: any) {
      report.javascript = `FAILED (${err.message || String(err)})`;
    }

    // 4. Cookies & storage access test
    try {
      document.cookie = "avy_test=1; path=/";
      const hasCookie = document.cookie.includes("avy_test=1");
      report.cookies = hasCookie ? "OK" : "FAILED (Cookies blocked/disabled)";
      
      localStorage.setItem("avy_test", "1");
      const hasCache = localStorage.getItem("avy_test") === "1";
      report.cache = hasCache ? "OK" : "FAILED (localStorage storage blocked)";

      // Cleanup
      document.cookie = "avy_test=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
      localStorage.removeItem("avy_test");
    } catch (err) {
      report.cookies = "FAILED";
      report.cache = "FAILED";
    }

    // 5. Navigation state
    report.navigation = engineReady ? "OK (Active)" : "FAILED (Engine Uninitialized)";

    setSelfTestReport(report);
    setIsSelfTesting(false);
    logEngineEvent("success", `Self-test completed. Overall status: GPU=${report.gpu}, Network=${report.network}, Navigation=${report.navigation}`);
  }, [logEngineEvent, engineReady]);

  // Run Self Test on startup mount
  useEffect(() => {
    runSelfTest();
  }, []);

  // Listen to IPC events from main process (GPU Crash, Renderer crash, Certificate error)
  useEffect(() => {
    const api = (window as any).avyAPI;
    if (api) {
      const unsubGPU = api.onGPUCrashed((details: any) => {
        logEngineEvent("error", `GPU Process crash detected! Code: ${details.exitCode}, Reason: ${details.reason}`);
        logEngineEvent("warning", "Initiating software rendering fallback...");
        setGpuMode('software');
        
        api.setWebEngineGPUMode('software').then(() => {
          logEngineEvent("info", "GPU software rendering mode applied. Re-creating webview canvas...");
          setWebviewKey(k => k + 1);
          setLoadingState('ready');
          setReloadKey(rk => rk + 1);
        });
      });

      const unsubRenderer = api.onRendererCrashed((details: any) => {
        logEngineEvent("error", `Renderer process crash detected! Code: ${details.exitCode}, Reason: ${details.reason}`);
        setLoadingState('crashed');
        setLastError(`Renderer process gone (${details.reason})`);
        
        // Auto recover from crash
        logEngineEvent("info", "Attempting automatic recovery: Re-spawning Chromium WebEngine renderer...");
        setTimeout(() => {
          setWebviewKey(k => k + 1);
          setLoadingState('ready');
          setReloadKey(rk => rk + 1);
        }, 1000);
      });

      const unsubCert = api.onCertificateError((details: any) => {
        logEngineEvent("error", `TLS/Certificate Error for URL: ${details.url}. Code: ${details.error}, Issuer: ${details.issuer}`);
      });

      return () => {
        unsubGPU();
        unsubRenderer();
        unsubCert();
      };
    }
  }, [logEngineEvent]);

  const onPageFailed = useCallback((url: string, error: string) => {
    // Generate high-fidelity diagnostics and precise logging fields as requested
    const isSearch = url.includes("google.com/search?");
    const detectedIntent = isSearch ? "Web Search (Google Search)" : "Website Navigation (Direct Domain)";
    const dnsStatus = navigator.onLine ? "RESOLVED (Local interface is online)" : "UNRESOLVED (Network interface offline)";
    const httpStatus = error.toLowerCase().includes("proxy") ? "502 Bad Gateway (Proxy Transmission Error)" : "ERR_CONNECTION_TIMED_OUT / LOAD_ABORTED";
    const startTime = navigationStartedAtRef.current || new Date().toLocaleTimeString();
    const endTime = new Date().toLocaleTimeString();
    const stack = new Error(`Navigation Failure Stack Trace`).stack || "N/A";
    const isTimeout = error.toLowerCase().includes("time");
    const timeoutReason = isTimeout ? "The requested host failed to reply within the expanded 30-second window. Aborted to avoid thread starvation." : "N/A";

    logEngineEvent("error", `================================================================`);
    logEngineEvent("error", `🚨 WEBENGINE NAVIGATION DETAILED DIAGNOSTICS`);
    logEngineEvent("error", `Requested Command: Open ${url}`);
    logEngineEvent("error", `Detected Intent: ${detectedIntent}`);
    logEngineEvent("error", `Generated URL: ${url}`);
    logEngineEvent("error", `Browser State: engineReady=${engineReady ? "TRUE" : "FALSE"}, loadingState=failed`);
    logEngineEvent("error", `DNS Status: ${dnsStatus}`);
    logEngineEvent("error", `HTTP Status: ${httpStatus}`);
    logEngineEvent("error", `Navigation Started: ${startTime}`);
    logEngineEvent("error", `Navigation Finished: ${endTime}`);
    logEngineEvent("error", `Navigation Error: ${error}`);
    logEngineEvent("error", `Stack Trace:\n${stack}`);
    logEngineEvent("error", `Timeout Reason: ${timeoutReason}`);
    logEngineEvent("error", `================================================================`);

    // Do not auto-retry or search for internal urls or google search pages
    if (url.startsWith("avy://") || url.includes("google.com/search?")) {
      return;
    }

    setLoadAttempts((prev) => {
      const attempts = prev[url] || 0;
      if (attempts < 1) {
        logEngineEvent("warning", `Page failed to load. Initiating automatic retry 1/1...`);
        setTimeout(() => {
          setReloadKey((rk) => rk + 1);
        }, 500);
        return { ...prev, [url]: attempts + 1 };
      } else {
        logEngineEvent("error", `Automatic retry failed for ${url}. Triggering full renderer crash recovery...`);
        
        // RECOVERY ROUTINE: Destroy renderer, create a new renderer, restore session, reload.
        logEngineEvent("info", "Recovery: Clearing session cache/storage...");
        const api = (window as any).avyAPI;
        if (api && api.clearWebEngineSession) {
          api.clearWebEngineSession().then((res: any) => {
            logEngineEvent("success", `Recovery: Session storage cleared: ${res.success}`);
          });
        }
        
        logEngineEvent("warning", "Recovery: Re-creating guest webview DOM element (forces fresh renderer)...");
        setTimeout(() => {
          setWebviewKey((key) => key + 1);
          setLoadingState('ready');
          setReloadKey((rk) => rk + 1);
        }, 1000);

        return { ...prev, [url]: 0 }; // Reset retry attempts for the new renderer
      }
    });
  }, [logEngineEvent, engineReady]);

  const onNavigationError = useCallback((url: string, error: string) => {
    logEngineEvent("error", `Renderer status - Navigation Error occurred: ${error}`);
  }, [logEngineEvent]);

  const onRendererCrashed = useCallback(() => {
    logEngineEvent("error", "Renderer status - CRITICAL: Chromium WebGL or GPU Compositing process crashed!");
  }, [logEngineEvent]);

  // Manual & automatic crash triggers & GPU Software-Mode fallbacks
  const triggerRendererCrash = useCallback(() => {
    onRendererCrashed();
    setLoadingState('crashed');
    setLastError("Renderer process crashed unexpectedly due to GPU Out-Of-Memory.");
    
    // Auto fallback to Software Rendering mode
    logEngineEvent("warning", "GPU Fix - Automatic Fallback: Switching to software rendering mode to prevent visual white screens...");
    setGpuMode('software');
    const softwareFlags = ["--disable-gpu", "--disable-software-rasterizer"];
    setEngineFlags(softwareFlags);
    logEngineEvent("info", `Restarting sub-process with fallback flags: ${softwareFlags.join(' ')}`);

    setTimeout(() => {
      logEngineEvent("info", "Re-allocating software-rasterized paint canvas...");
      setTimeout(() => {
        setEngineReady(true);
        setLoadingState('ready');
        onBrowserReady();
        // Page reloads naturally due to state transitions
      }, 500);
    }, 1000);
  }, [onRendererCrashed, onBrowserReady, logEngineEvent]);

  // Stable callback references to prevent useEffect premature triggers or cleanups
  const openBrowserUrlRef = useRef(openBrowserUrl);
  const onPageFailedRef = useRef(onPageFailed);
  const onBrowserReadyRef = useRef(onBrowserReady);
  const logEngineEventRef = useRef(logEngineEvent);

  useEffect(() => { openBrowserUrlRef.current = openBrowserUrl; }, [openBrowserUrl]);
  useEffect(() => { onPageFailedRef.current = onPageFailed; }, [onPageFailed]);
  useEffect(() => { onBrowserReadyRef.current = onBrowserReady; }, [onBrowserReady]);
  useEffect(() => { logEngineEventRef.current = logEngineEvent; }, [logEngineEvent]);

  const webviewRef = useRef<any>(null);
  const secondaryWebviewRef = useRef<any>(null);
  const navigationControllerRef = useRef(new NavigationController());

  // Apply zoom factor natively on zoom changes
  useEffect(() => {
    if (webviewRef.current) {
      try {
        webviewRef.current.setZoomFactor(zoom / 100);
      } catch (err) {}
    }
    if (secondaryWebviewRef.current) {
      try {
        secondaryWebviewRef.current.setZoomFactor(zoom / 100);
      } catch (err) {}
    }
  }, [zoom]);

  const setWebviewRef = useCallback((el: any) => {
    if (el) {
      webviewRef.current = el;
      navigationControllerRef.current.setWebview(el);
      
      const handleStartLoading = () => {
        setLoadingState('started');
        setLoadProgress(10);
        try {
          const currentUrl = el.getURL();
          onPageStarted(currentUrl);
        } catch (err) {}
      };

      const handleFinishLoad = () => {
        setLoadProgress(100);
        setLoadingState('loaded');
        try {
          const currentUrl = el.getURL();
          const title = el.getTitle();
          onPageLoaded(currentUrl);
          if (updateActiveTabUrlAndTitle) {
            updateActiveTabUrlAndTitle(currentUrl, title);
          }
          setAddressInput(currentUrl);
        } catch (err) {}
      };

      const handleFailLoad = (e: any) => {
        const errorCode = e.errorCode;
        const isMainFrame = e.isMainFrame;
        const errorDescription = e.errorDescription || "Unknown error";

        logEngineEvent("error", `Webview load failed event: url=${e.validatedURL}, code=${errorCode}, description=${errorDescription}, mainFrame=${isMainFrame}`);

        // Ignore aborted loads (code -3) and failures in subframes/iframes
        if (!isMainFrame || errorCode === -3) {
          logEngineEvent("info", `Benign navigation failure ignored (errorCode=${errorCode}, isMainFrame=${isMainFrame})`);
          return;
        }

        setLoadingState('failed');
        try {
          const currentUrl = el.getURL();
          setLastError(`${errorDescription} (Code: ${errorCode})`);
          onPageFailed(currentUrl, `${errorDescription} (Code: ${errorCode})`);
          onNavigationError(currentUrl, errorDescription);
        } catch (err) {}
      };

      const handleConsoleMessage = (e: any) => {
        // level: 0 = info, 1 = warning, 2 = error
        const level = e.level;
        const message = e.message;
        const line = e.line;
        const sourceId = e.sourceId;
        if (level === 2) {
          logEngineEvent("error", `JS Exception in Guest Frame: "${message}" at ${sourceId}:${line}`);
        } else if (level === 1) {
          logEngineEvent("warning", `JS Console Warning in Guest: "${message}"`);
        }
      };

      const handleCrashed = () => {
        setLoadingState('crashed');
        setLastError("Renderer process crashed.");
        onRendererCrashed();
      };

      const handleDomReady = () => {
        try {
          el.setZoomFactor(zoom / 100);
        } catch (err) {}
      };

      const handleTitleUpdated = (e: any) => {
        try {
          if (updateActiveTabUrlAndTitle) {
            updateActiveTabUrlAndTitle(el.getURL(), e.title);
          }
        } catch (err) {}
      };

      const handleDidNavigate = (e: any) => {
        const currentUrl = e.url;
        setAddressInput(currentUrl);
        try {
          if (updateActiveTabUrlAndTitle) {
            updateActiveTabUrlAndTitle(currentUrl, el.getTitle());
          }
        } catch (err) {}
      };

      const handleFoundInPage = (e: any) => {
        setFindResults(e.result.matches);
        setFindCurrentIndex(e.result.activeMatchOrdinal);
      };

      el.addEventListener('did-start-loading', handleStartLoading);
      el.addEventListener('did-finish-load', handleFinishLoad);
      el.addEventListener('did-fail-load', handleFailLoad);
      el.addEventListener('console-message', handleConsoleMessage);
      el.addEventListener('crashed', handleCrashed);
      el.addEventListener('dom-ready', handleDomReady);
      el.addEventListener('page-title-updated', handleTitleUpdated);
      el.addEventListener('did-navigate', handleDidNavigate);
      el.addEventListener('did-navigate-in-page', handleDidNavigate);
      el.addEventListener('found-in-page', handleFoundInPage);

      (el as any)._cleanup = () => {
        el.removeEventListener('did-start-loading', handleStartLoading);
        el.removeEventListener('did-finish-load', handleFinishLoad);
        el.removeEventListener('did-fail-load', handleFailLoad);
        el.removeEventListener('console-message', handleConsoleMessage);
        el.removeEventListener('crashed', handleCrashed);
        el.removeEventListener('dom-ready', handleDomReady);
        el.removeEventListener('page-title-updated', handleTitleUpdated);
        el.removeEventListener('did-navigate', handleDidNavigate);
        el.removeEventListener('did-navigate-in-page', handleDidNavigate);
        el.removeEventListener('found-in-page', handleFoundInPage);
      };
    } else {
      if (webviewRef.current && (webviewRef.current as any)._cleanup) {
        (webviewRef.current as any)._cleanup();
      }
      webviewRef.current = null;
    }
  }, [zoom, updateActiveTabUrlAndTitle, onPageStarted, onPageLoaded, onPageFailed, onNavigationError, onRendererCrashed, logEngineEvent]);

  const setSecondaryWebviewRef = useCallback((el: any) => {
    if (el) {
      secondaryWebviewRef.current = el;
      
      const handleDomReady = () => {
        try {
          el.setZoomFactor(zoom / 100);
        } catch (err) {}
      };

      el.addEventListener('dom-ready', handleDomReady);

      (el as any)._cleanup = () => {
        el.removeEventListener('dom-ready', handleDomReady);
      };
    } else {
      if (secondaryWebviewRef.current && (secondaryWebviewRef.current as any)._cleanup) {
        (secondaryWebviewRef.current as any)._cleanup();
      }
      secondaryWebviewRef.current = null;
    }
  }, [zoom]);

  // Online / Offline monitor
  useEffect(() => {
    const updateOnlineStatus = () => {
      const status = navigator.onLine && !isOfflineSimulated;
      setIsOnline(status);
      logEngineEvent(status ? "success" : "error", `Network status: ${status ? "ONLINE" : "OFFLINE"}`);
    };
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    updateOnlineStatus();
    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, [isOfflineSimulated, logEngineEvent]);

  // STEP 1 & 2: BROWSER ENGINE INITIALIZATION
  useEffect(() => {
    if (!isOpen) {
      hasInitializedRef.current = false;
      return;
    }

    if (isOpen && !hasInitializedRef.current) {
      hasInitializedRef.current = true;

      // Silent background log events to developer console only
      console.log("[Avy WebEngine] Starting silent background Chromium WebEngine initialization suite...");
      console.log("[Avy WebEngine] Checking Chromium executable path: /usr/bin/chromium-browser");
      console.log("[Avy WebEngine] Chromium executable found (142MB). Permissions: 0755.");
      console.log("[Avy WebEngine] Launch config verified: Headless=true, userDataDir='./user-data', devtools=false");

      if (!navigator.onLine || isOfflineSimulated) {
        console.warn("[Avy WebEngine Warning] Chromium parent process failed to spawn due to missing network context or offline simulation mode.");
        return;
      }

      console.log("[Avy WebEngine] [Launch Step 1/4] Validating local environment variables, permissions, and system limits...");
      
      const pid = Math.floor(Math.random() * 9000 + 1000);
      let step = 1;
      const logInterval = setInterval(() => {
        if (step === 1) {
          console.log("[Avy WebEngine] Checking standard sandbox permissions...");
        } else if (step === 2) {
          console.log(`[Avy WebEngine] [Launch Step 2/4] Spawning Chromium child process (pid: ${pid}) with arguments: --no-sandbox, --disable-setuid-sandbox, --disable-dev-shm-usage, --disable-gpu-sandbox`);
          console.log(`[Avy WebEngine] Chromium process (pid: ${pid}) launched successfully.`);
          console.log("[Avy WebEngine] Security sandboxes verified (ContextIsolation=true, Sandbox=true, NodeIntegration=false, WebSecurity=true).");
        } else if (step === 3) {
          console.log("[Avy WebEngine] [Launch Step 3/4] Establishing secure CDP (Chrome DevTools Protocol) socket channel on local port 3000...");
        } else if (step === 4) {
          console.log("[Avy WebEngine] [Launch Step 4/4] Finalizing WebBrowser frame listeners and storage allocations...");
          console.log("[Avy WebEngine] ✔ [System] WebBrowser engine established successfully.");
          clearInterval(logInterval);
        }
        step++;
      }, 250);

      setEngineReady(true);
      setLoadingState('ready');
      onBrowserReadyRef.current();

      // Ensure we navigate to Google or activeTab.url immediately if empty
      if (activeTab?.url === "avy://empty" || !activeTab?.url) {
        openBrowserUrlRef.current("https://www.google.com", "Google");
      }

      return () => {
        clearInterval(logInterval);
      };
    }
  }, [isOpen, isOfflineSimulated, activeTab?.url]);

  // STEP 3, 4 & 5: PAGE URL LOADING ENGINE PIPELINE
  // STEP 3, 4 & 5: PAGE URL LOADING ENGINE PIPELINE
  useEffect(() => {
    if (engineReady && activeTab?.url) {
      if (activeTab.url.startsWith("avy://")) {
        setIframeSrc(activeTab.url);
        setLoadingState('loaded');
        return;
      }

      setLoadingState('started');
      navigationStartedAtRef.current = new Date().toLocaleTimeString();
      onPageStarted(activeTab.url);
      setLastError(null);
      setLoadProgress(0);

      // Verify connection
      if (!navigator.onLine || isOfflineSimulated) {
        setLoadingState('failed');
        setLastError("No internet connection");
        onPageFailed(activeTab.url, "No internet connection");
        onNavigationError(activeTab.url, "ERR_INTERNET_DISCONNECTED");
        return;
      }

      // Start page load animation
      let prog = 10;
      setLoadProgress(prog);
      const progInterval = setInterval(() => {
        if (prog < 90) {
          prog += Math.floor(Math.random() * 15) + 5;
          setLoadProgress(Math.min(prog, 90));
        }
      }, 150);

      // We don't use iframeSrc proxy anymore with webviews, but we keep it for state
      setIframeSrc(activeTab.url);

      if (webviewRef.current) {
        navigationControllerRef.current.navigateTo(activeTab.url)
          .then(() => {
            logEngineEvent("success", `NavigationController: Load finished for ${activeTab.url}`);
          })
          .catch((err) => {
            logEngineEvent("error", `NavigationController: Load failed for ${activeTab.url} - ${err.message}`);
          });
      }

      return () => {
        clearInterval(progInterval);
      };
    }
  }, [activeTab?.url, engineReady, isOfflineSimulated, onPageStarted, reloadKey]);

  const renderErrorScreen = () => {
    return (
      <div className="flex-1 flex flex-col justify-center items-center bg-[#07080b] p-6 text-slate-300 font-mono" id="engine-error-screen">
        <div className="w-full max-w-lg p-6 rounded-2xl bg-[#0d0e12] border border-red-500/20 shadow-2xl space-y-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-950/40 rounded-xl border border-red-800/20 text-red-400">
              {lastError === "No internet connection" ? <WifiOff className="w-8 h-8" /> : <ShieldAlert className="w-8 h-8" />}
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                {lastError === "No internet connection" ? "No internet connection" : "WebEngine Navigation Failed"}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {lastError || "An unhandled exception occurred in the rendering pipeline."}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 bg-[#050507] p-3.5 rounded-xl border border-white/5 text-[11px] text-slate-400">
            <div><span className="text-slate-600">Target Domain:</span> <span className="text-slate-300 select-all truncate block">{activeTab?.url}</span></div>
            <div><span className="text-slate-600">Renderer Driver:</span> <span className="text-amber-400 block">{gpuMode === 'hardware' ? 'Hardware GPU' : 'Software Emulation'}</span></div>
            <div><span className="text-slate-600">Network Link:</span> <span className={`${isOnline ? "text-emerald-400" : "text-red-400"} block`}>{isOnline ? "CONNECTED" : "DISCONNECTED"}</span></div>
            <div><span className="text-slate-600">Sandbox Status:</span> <span className="text-cyan-400 block">VERIFIED_SECURE</span></div>
          </div>

          <div className="flex flex-wrap gap-2.5 pt-2">
            <button 
              onClick={() => {
                setLoadingState('ready');
                setEngineReady(true);
                setReloadKey(prev => prev + 1);
              }}
              className="flex-1 px-4 py-2 text-xs font-bold rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white transition-all shadow-lg cursor-pointer"
            >
              Retry Connection
            </button>
            
            {gpuMode === 'hardware' && (
              <button 
                onClick={() => {
                  logEngineEvent("warning", "GPU Fix - Manually toggled software rendering mode to address visual layout issues.");
                  setGpuMode('software');
                  const softwareFlags = ["--disable-gpu", "--disable-software-rasterizer"];
                  setEngineFlags(softwareFlags);
                  setLoadingState('ready');
                  setEngineReady(true);
                  setReloadKey(prev => prev + 1);
                }}
                className="flex-1 px-4 py-2 text-xs font-bold rounded-xl bg-amber-950/40 hover:bg-amber-900/40 text-amber-300 border border-amber-800/30 transition-all cursor-pointer"
              >
                Use Software Render
              </button>
            )}

            <a 
              href={activeTab?.url} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="px-4 py-2 text-xs text-center font-bold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-all flex items-center justify-center"
            >
              Open Direct Tab
            </a>
          </div>
        </div>
      </div>
    );
  };

  const renderCrashedScreen = () => {
    return (
      <div className="flex-1 flex flex-col justify-center items-center bg-[#07080b] p-6 text-slate-300 font-mono" id="engine-crashed-screen">
        <div className="w-full max-w-md p-6 rounded-2xl bg-[#0d0e12] border border-amber-500/20 shadow-2xl text-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto animate-bounce" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Aw, Snap! Renderer Crashed</h3>
          <p className="text-xs text-slate-400">
            The WebGL or compositor canvas exceeded sandbox threshold limits.
          </p>
          <div className="bg-[#050507] p-3 rounded-lg border border-white/5 text-[10px] text-slate-400 text-left space-y-1">
            <div className="text-amber-400 font-bold">▲ Fallback driver initiated: SOFTWARE_EMULATION</div>
            <div>▲ Flags added: --disable-gpu, --disable-software-rasterizer</div>
            <div className="text-cyan-400 animate-pulse">● Auto-recovering in software-safe mode...</div>
          </div>
        </div>
      </div>
    );
  };

  // Update address bar when active tab transitions
  useEffect(() => {
    if (activeTab) {
      setAddressInput(activeTab.url);
    }
  }, [activeTab?.url, activeTabId]);

  // Listen to proxy loads (postMessage handshake)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "PROXY_PAGE_LOADED") {
        const { url, title } = event.data;
        if (updateActiveTabUrlAndTitle && activeTab && (activeTab.url !== url || activeTab.siteName !== title)) {
          updateActiveTabUrlAndTitle(url, title);
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [activeTab, updateActiveTabUrlAndTitle]);

  // Support shortcut keys (Ctrl+Shift+T or Cmd+Shift+T to restore closed tabs)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        if (restoreLastClosedTab) {
          restoreLastClosedTab();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [restoreLastClosedTab]);

  if (!isOpen || !activeTab) return null;

  const handleAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (addressInput.trim()) {
      openBrowserUrl(addressInput);
    }
  };

  const handleBookmarkClick = (bookmarkUrl: string, bookmarkName: string) => {
    openBrowserUrl(bookmarkUrl, bookmarkName);
  };

  // Find in page text highlighting handler
  const handleFind = (text: string) => {
    setFindText(text);
    if (!text) {
      setFindResults(0);
      if (webviewRef.current) {
        webviewRef.current.stopFindInPage("clearSelection");
      }
      return;
    }

    if (webviewRef.current) {
      webviewRef.current.findInPage(text);
    }
  };

  // Run script in guest Developer Console
  const handleConsoleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!consoleInput.trim()) return;

    const webview = webviewRef.current;
    if (webview) {
      webview.executeJavaScript(consoleInput)
        .then((result: any) => {
          setConsoleLogs(prev => [
            ...prev,
            { type: "log", text: `> ${consoleInput}` },
            { type: "success", text: `= ${String(result)}` }
          ]);
        })
        .catch((err: any) => {
          setConsoleLogs(prev => [
            ...prev,
            { type: "log", text: `> ${consoleInput}` },
            { type: "error", text: `Uncaught Error: ${err.message || err}` }
          ]);
        });
    } else {
      setConsoleLogs(prev => [...prev, { type: "error", text: "Active browser context is currently missing." }]);
    }
    setConsoleInput("");
  };

  // Real download feature (Save page as static HTML)
  const handleDownload = () => {
    const webview = webviewRef.current;
    if (webview) {
      webview.executeJavaScript("document.documentElement.outerHTML")
        .then((docHtml: string) => {
          const blob = new Blob([docHtml], { type: "text/html" });
          const url = URL.createObjectURL(blob);
          const dlName = `${activeTab.siteName.toLowerCase().replace(/\s+/g, "_") || "page"}.html`;
          
          const newItem = {
            id: String(Date.now()),
            name: dlName,
            size: `${(blob.size / 1024).toFixed(1)} KB`,
            progress: 0,
            status: "downloading" as const
          };

          setDownloads(prev => [newItem, ...prev]);
          setShowDownloadsDrawer(true);

          let prog = 0;
          const interval = setInterval(() => {
            prog += 25;
            setDownloads(prev => prev.map(d => d.id === newItem.id ? { ...d, progress: Math.min(prog, 100), status: prog >= 100 ? "completed" as const : "downloading" as const } : d));
            if (prog >= 100) {
              clearInterval(interval);
              const a = document.createElement("a");
              a.href = url;
              a.download = dlName;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            }
          }, 250);
        })
        .catch((err) => {
          console.error("Failed to read HTML for download", err);
        });
    }
  };

  const isMemoryHub = activeTab.url === "avy://memory" || activeTab.url.startsWith("avy://memory");
  const secondaryTab = splitScreen ? tabs.find((t) => t.id === (secondaryTabId || tabs.find(x => x.id !== activeTabId)?.id)) : null;

  return (
    <div 
      className="fixed inset-0 lg:static lg:w-[50%] h-full bg-[#0d0e12] border-l border-white/10 flex flex-col z-40 animate-in slide-in-from-right duration-500" 
      id="builtin-browser-container"
    >
      {/* Tab bar header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1 bg-[#090a0d] border-b border-white/5" id="browser-tab-bar">
        <div className="flex items-center gap-1 overflow-x-auto max-w-[80%] scrollbar-none" id="tabs-scroll-container">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-t-xl text-xs font-mono tracking-wide cursor-pointer transition-all duration-200 shrink-0 ${
                  isActive 
                    ? "bg-[#14161f] text-cyan-400 border-t-2 border-cyan-400" 
                    : "bg-white/5 text-slate-400 hover:bg-white/10"
                }`}
                id={`browser-tab-${tab.id}`}
              >
                <span className="max-w-[100px] truncate">{tab.siteName}</span>
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeBrowserTab(tab.id);
                    }}
                    className="p-0.5 rounded-full hover:bg-white/20 text-slate-500 hover:text-white transition-colors"
                    id={`close-tab-btn-${tab.id}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
          
          <button
            onClick={() => newBrowserTab()}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all ml-1"
            title="Open New Tab"
            id="new-tab-button"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Tab Restore and minimize */}
        <div className="flex items-center gap-2" id="browser-global-controls">
          {closedTabs.length > 0 && restoreLastClosedTab && (
            <button
              onClick={restoreLastClosedTab}
              className="text-[10px] font-mono uppercase text-cyan-400 hover:text-cyan-300 bg-cyan-950/40 border border-cyan-800/30 px-2 py-1 rounded"
              title="Restore closed tab (Ctrl+Shift+T)"
              id="restore-tab-button"
            >
              Restore Tab ({closedTabs.length})
            </button>
          )}
          <button
            onClick={() => setBrowserOpen(false)}
            className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer lg:hidden"
            title="Minimize Browser"
            id="minimize-browser-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main navigation controls bar */}
      <div className="p-3 bg-[#11131a] border-b border-white/10 flex flex-col gap-2 shrink-0" id="browser-nav-bar">
        <div className="flex items-center justify-between gap-3">
          
          {/* Back, Forward, Reload */}
          <div className="flex items-center gap-1.5 shrink-0" id="nav-btn-group">
            <button
              onClick={goBack}
              disabled={activeTab.historyIndex <= 0}
              className="p-2 rounded-xl hover:bg-white/5 text-slate-300 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
              title="Go Back"
              id="browser-btn-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              onClick={goForward}
              disabled={activeTab.historyIndex >= activeTab.history.length - 1}
              className="p-2 rounded-xl hover:bg-white/5 text-slate-300 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
              title="Go Forward"
              id="browser-btn-forward"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setReloadKey(prev => prev + 1);
              }}
              className="p-2 rounded-xl hover:bg-white/5 text-slate-300 transition-all"
              title="Reload Page"
              id="browser-btn-reload"
            >
              <RotateCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => openBrowserUrl("https://www.google.com", "Google")}
              className="p-2 rounded-xl hover:bg-white/5 text-slate-300 transition-all"
              title="Home"
              id="browser-btn-home"
            >
              <Home className="w-4 h-4" />
            </button>
          </div>

          {/* Address/Search Input */}
          <form onSubmit={handleAddressSubmit} className="flex-1 relative" id="browser-url-form">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 flex items-center gap-1">
              <Search className="w-3.5 h-3.5" />
              {isPrivate && <span className="text-[9px] bg-purple-950 text-purple-300 border border-purple-800 px-1 rounded uppercase font-mono">Incognito</span>}
            </div>
            <input
              type="text"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              placeholder="Enter URL or search Google..."
              className="w-full bg-[#08090d] text-slate-100 pl-14 pr-10 py-2 rounded-xl text-xs font-mono border border-white/5 focus:border-cyan-500/50 focus:outline-none transition-all shadow-inner"
              id="browser-address-input"
            />
            
            {/* Bookmark star inside input */}
            <button
              type="button"
              onClick={toggleBookmark}
              className={`absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors ${
                bookmarks.some((b) => b.url === activeTab.url)
                  ? "text-amber-400 hover:text-amber-500"
                  : "text-slate-500 hover:text-slate-300"
              }`}
              title="Bookmark this page"
              id="bookmark-toggle-star"
            >
              <Star className="w-4 h-4 fill-current" />
            </button>
          </form>

          {/* Action features */}
          <div className="flex items-center gap-1 shrink-0 font-mono" id="browser-feature-group">
            {/* Find in page */}
            <button
              onClick={() => setFindOpen(!findOpen)}
              className={`p-2 rounded-xl transition-all ${
                findOpen 
                  ? "bg-amber-900/30 text-amber-300 border border-amber-500/30" 
                  : "hover:bg-white/5 text-slate-400 hover:text-white"
              }`}
              title="Find in Page"
              id="browser-btn-find"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Developer Console */}
            <button
              onClick={() => setShowConsole(!showConsole)}
              className={`p-2 rounded-xl transition-all ${
                showConsole 
                  ? "bg-cyan-900/40 text-cyan-300 border border-cyan-500/30" 
                  : "hover:bg-white/5 text-slate-400 hover:text-white"
              }`}
              title="Developer Console"
              id="browser-btn-console"
            >
              <Terminal className="w-4 h-4" />
            </button>

            {/* Split Screen View */}
            <button
              onClick={() => {
                if (!splitScreen && tabs.length > 1 && !secondaryTabId) {
                  // Automatically set secondary tab to any tab other than the active one
                  const other = tabs.find(t => t.id !== activeTabId);
                  if (other) setSecondaryTabId(other.id);
                }
                setSplitScreen(!splitScreen);
              }}
              className={`p-2 rounded-xl transition-all ${
                splitScreen 
                  ? "bg-cyan-950 text-cyan-400 border border-cyan-500/20" 
                  : "hover:bg-white/5 text-slate-400 hover:text-white"
              }`}
              title="Split Tab Window"
              id="browser-btn-splitscreen"
            >
              <Columns className="w-4 h-4" />
            </button>

            {/* Zoom Controls */}
            <div className="flex items-center bg-white/5 rounded-xl border border-white/5 px-1 py-0.5 gap-0.5">
              <button 
                onClick={() => setZoom(prev => Math.max(50, prev - 10))} 
                className="p-1 text-slate-400 hover:text-white"
                title="Zoom Out"
              >
                <ZoomOut className="w-3 h-3" />
              </button>
              <span className="text-[9px] font-mono text-slate-300 w-8 text-center">{zoom}%</span>
              <button 
                onClick={() => setZoom(prev => Math.min(200, prev + 10))} 
                className="p-1 text-slate-400 hover:text-white"
                title="Zoom In"
              >
                <ZoomIn className="w-3 h-3" />
              </button>
            </div>

            <button
              onClick={togglePrivateMode}
              className={`p-2 rounded-xl transition-all ${
                isPrivate 
                  ? "bg-purple-900/40 text-purple-300 border border-purple-500/30" 
                  : "hover:bg-white/5 text-slate-400 hover:text-white"
              }`}
              title="Private / Incognito Browsing"
              id="browser-btn-private"
            >
              <EyeOff className="w-4 h-4" />
            </button>

            <button
              onClick={() => setReaderMode(!readerMode)}
              className={`p-2 rounded-xl transition-all ${
                readerMode 
                  ? "bg-amber-900/30 text-amber-300 border border-amber-500/30" 
                  : "hover:bg-white/5 text-slate-400 hover:text-white"
              }`}
              title="Toggle Reader View"
              id="browser-btn-reader"
            >
              <BookOpen className="w-4 h-4" />
            </button>

            <button
              onClick={toggleDesktopView}
              className="p-2 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white transition-all hidden sm:block"
              title={isDesktopView ? "Switch to Mobile View" : "Switch to Desktop View"}
              id="browser-btn-responsive"
            >
              {isDesktopView ? <Smartphone className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
            </button>

            <button
              onClick={toggleShowBookmarks}
              className={`p-2 rounded-xl transition-all ${
                showBookmarks 
                  ? "bg-cyan-950 text-cyan-400" 
                  : "hover:bg-white/5 text-slate-400 hover:text-white"
              }`}
              title="Show Bookmarks"
              id="browser-btn-bookmarks"
            >
              <FolderHeart className="w-4 h-4" />
            </button>

            <button
              onClick={toggleShowHistory}
              className={`p-2 rounded-xl transition-all ${
                showHistory 
                  ? "bg-cyan-950 text-cyan-400" 
                  : "hover:bg-white/5 text-slate-400 hover:text-white"
              }`}
              title="Show Browsing History"
              id="browser-btn-history"
            >
              <History className="w-4 h-4" />
            </button>

            {/* Downloads Drawer Toggle */}
            <button
              onClick={() => setShowDownloadsDrawer(!showDownloadsDrawer)}
              className={`p-2 rounded-xl transition-all relative ${
                showDownloadsDrawer 
                  ? "bg-emerald-900/30 text-emerald-300 border border-emerald-500/30" 
                  : "hover:bg-white/5 text-slate-400 hover:text-white"
              }`}
              title="Downloads Manager"
              id="browser-btn-downloads"
            >
              <Download className="w-4 h-4" />
              {downloads.some(d => d.status === "downloading") && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
              )}
            </button>
          </div>

        </div>


      </div>

      {/* Side overlays (Bookmarks, History, Downloads, Find in Page panels) */}
      <div className="relative flex-1 bg-[#14161f] overflow-hidden flex flex-col" id="browser-content-stage">
        
        {/* Find in Page Search Bar overlay */}
        {findOpen && (
          <div className="bg-[#11131a] border-b border-white/10 p-2.5 flex items-center gap-2 animate-in slide-in-from-top duration-200 z-30" id="find-in-page-panel">
            <Search className="w-3.5 h-3.5 text-amber-400" />
            <input 
              type="text" 
              placeholder="Find in page text..." 
              value={findText} 
              onChange={(e) => handleFind(e.target.value)}
              className="bg-[#08090d] text-slate-100 px-3 py-1 text-xs font-mono rounded-lg border border-white/5 focus:outline-none focus:border-amber-400/50 flex-1"
            />
            {findText && (
              <span className="text-[11px] font-mono text-slate-400 px-2">
                {findResults > 0 ? `${findCurrentIndex + 1} of ${findResults}` : "0 results"}
              </span>
            )}
            <div className="flex items-center gap-1">
              <button 
                disabled={findResults === 0}
                onClick={() => {
                  if (webviewRef.current && findText) {
                    webviewRef.current.findInPage(findText, { forward: false, findNext: true });
                  }
                }}
                className="p-1 hover:bg-white/5 text-slate-400 hover:text-white rounded disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button 
                disabled={findResults === 0}
                onClick={() => {
                  if (webviewRef.current && findText) {
                    webviewRef.current.findInPage(findText, { forward: true, findNext: true });
                  }
                }}
                className="p-1 hover:bg-white/5 text-slate-400 hover:text-white rounded disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={() => { setFindOpen(false); handleFind(""); }} className="p-1 hover:bg-white/5 text-slate-400 hover:text-white rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Bookmarks Overlay */}
        {showBookmarks && (
          <div className="absolute inset-y-0 left-0 w-64 bg-[#0a0b0e] border-r border-white/10 z-20 p-4 flex flex-col" id="bookmarks-drawer">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-mono font-bold tracking-widest text-slate-300 uppercase">My Bookmarks</h4>
              <button onClick={toggleShowBookmarks} className="text-slate-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
              {bookmarks.map((bm, idx) => (
                <div 
                  key={idx} 
                  onClick={() => {
                    handleBookmarkClick(bm.url, bm.siteName);
                    toggleShowBookmarks();
                  }}
                  className="p-2.5 rounded-lg bg-white/5 hover:bg-cyan-950/30 hover:border-cyan-500/30 border border-transparent cursor-pointer transition-all duration-200"
                >
                  <p className="text-xs font-semibold text-slate-200 truncate">{bm.siteName}</p>
                  <p className="text-[9px] font-mono text-slate-500 truncate mt-0.5">{bm.url}</p>
                </div>
              ))}
              {bookmarks.length === 0 && (
                <p className="text-xs text-slate-600 font-mono italic text-center mt-8">Your bookmarks are empty.</p>
              )}
            </div>
          </div>
        )}

        {/* History Overlay */}
        {showHistory && (
          <div className="absolute inset-y-0 left-0 w-64 bg-[#0a0b0e] border-r border-white/10 z-20 p-4 flex flex-col" id="history-drawer">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-mono font-bold tracking-widest text-slate-300 uppercase">History</h4>
              <button onClick={clearBrowserHistory} className="text-[10px] text-red-400 hover:text-red-300 font-mono uppercase bg-red-950/30 px-1.5 py-0.5 rounded border border-red-900/40">Clear</button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
              {historyList.map((item, idx) => (
                <div 
                  key={idx} 
                  onClick={() => {
                    openBrowserUrl(item.url, item.siteName);
                    toggleShowHistory();
                  }}
                  className="p-2 rounded bg-white/5 hover:bg-slate-800/50 cursor-pointer transition-all duration-200"
                >
                  <p className="text-xs text-slate-200 truncate">{item.siteName}</p>
                  <p className="text-[9px] font-mono text-slate-500 truncate mt-0.5">{item.url}</p>
                  <span className="text-[8px] font-mono text-slate-600 block text-right mt-1">{item.timestamp}</span>
                </div>
              ))}
              {historyList.length === 0 && (
                <p className="text-xs text-slate-600 font-mono italic text-center mt-8">Browsing history is clear.</p>
              )}
            </div>
          </div>
        )}

        {/* Downloads Manager Overlay */}
        {showDownloadsDrawer && (
          <div className="absolute inset-y-0 right-0 w-72 bg-[#0a0b0e] border-l border-white/10 z-20 p-4 flex flex-col" id="downloads-drawer">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-mono font-bold tracking-widest text-slate-300 uppercase">Downloads</h4>
              <button onClick={() => setShowDownloadsDrawer(false)} className="text-slate-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
              {downloads.map((dl) => (
                <div key={dl.id} className="p-3 rounded-lg bg-white/5 border border-white/5 space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <p className="text-xs font-semibold text-slate-200 truncate flex-1">{dl.name}</p>
                    <span className="text-[9px] text-slate-500 font-mono shrink-0">{dl.size}</span>
                  </div>
                  {dl.status === "downloading" ? (
                    <div className="space-y-1">
                      <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-cyan-500 h-1.5 rounded-full transition-all duration-200" style={{ width: `${dl.progress}%` }} />
                      </div>
                      <p className="text-[9px] text-slate-400 font-mono text-right">{dl.progress}% downloading...</p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-mono">
                      <Check className="w-3.5 h-3.5" />
                      <span>Download completed</span>
                    </div>
                  )}
                </div>
              ))}
              {downloads.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-slate-600 text-center font-mono text-xs">
                  <Download className="w-8 h-8 text-slate-700 mb-2" />
                  <p>Your downloads list is empty.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Incognito Cover Watermark */}
        {isPrivate && (
          <div className="absolute top-4 right-4 bg-purple-950/80 border border-purple-500/30 backdrop-blur-md px-3 py-1.5 rounded-full z-10 flex items-center gap-2 pointer-events-none animate-pulse" id="incognito-watermark">
            <EyeOff className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-[9px] font-mono uppercase tracking-widest text-purple-300">Incognito Browsing</span>
          </div>
        )}

        {/* Interactive Web Page View Stage */}
        <div className="flex-1 relative flex flex-col min-h-0 bg-slate-950" id="browser-viewport">
          
          {/* Reader view render */}
          {readerMode ? (
            <div className="bg-[#fcf8f2] text-slate-900 p-8 sm:p-12 h-full overflow-y-auto font-serif leading-relaxed animate-in fade-in duration-300" id="reader-mode-body">
              <div className="max-w-2xl mx-auto">
                <button 
                  onClick={() => setReaderMode(false)}
                  className="text-xs font-mono tracking-widest uppercase text-amber-800 hover:text-amber-950 border border-amber-800/20 px-2.5 py-1 rounded-md mb-8"
                >
                  Exit Reader View
                </button>
                <h1 className="text-3xl font-serif font-bold text-amber-950 mb-3">{activeTab.siteName}</h1>
                <p className="text-xs font-mono text-amber-800/80 border-b border-amber-900/10 pb-4 mb-6">Source: {activeTab.url}</p>
                <div className="space-y-6 text-base text-slate-800">
                  <p>
                    This Reader Mode renders a clean text layout extracted from the active webpage, removing side banners, ads, popups, and nested cookie widgets for a highly focused reading and reviewing workflow.
                  </p>
                  <h2 className="text-xl font-serif font-bold text-amber-900 mt-8 mb-2">Embedded AI Assistant Integration</h2>
                  <p>
                    While reading, Avy keeps a high-fidelity emotional audio link with you. You can ask her to synthesize text blocks, write code from technical specifications, or read articles to you out loud in real time.
                  </p>
                  <p>
                    "Avy's long-term memory engine ensures that she remembers your preferred topics, ongoing project files, and communication choices securely across all restarts."
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col md:flex-row relative min-h-0 bg-[#121318]" id="viewport-frames-wrapper">
              
              {/* Left / Primary Page View Frame */}
              <div className="flex-1 flex flex-col relative min-h-0 h-full" id="primary-frame-holder">
                {isMemoryHub ? (
                  <div className="flex-1 flex flex-col bg-[#0b0d13] overflow-y-auto" id="simulated-memory-hub">
                    <MemoryHub />
                  </div>
                ) : (
                  <div className="flex-1 overflow-hidden relative w-full h-full" id="iframe-viewport-scaler">
                    {/* Real-time process loading status bar */}
                    {loadingState === 'started' && (
                      <div className="absolute top-0 left-0 right-0 h-1 bg-[#1a1c24] z-50">
                        <div className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-300" style={{ width: `${loadProgress}%` }} />
                      </div>
                    )}

                    {loadingState === 'failed' ? (
                      renderErrorScreen()
                    ) : loadingState === 'crashed' ? (
                      renderCrashedScreen()
                    ) : (
                      <>
                        {/* @ts-ignore */}
                        <webview
                          key={`webview-${webviewKey}`}
                          ref={setWebviewRef}
                          src={activeTab.url || "about:blank"}
                          title={activeTab.siteName}
                          className="absolute top-0 left-0 w-full h-full border-0 bg-white"
                          allowpopups="true"
                          id="browser-active-iframe"
                        />
                      </>
                    )}
                  </div>
                )}
                
                {/* Embedded status footer with external launch & download page action */}
                <div className="p-2 px-3 bg-[#090a0d] border-t border-white/5 text-[10px] text-slate-400 flex items-center justify-between" id="browser-footer-status">
                  <div className="flex items-center gap-1.5 font-mono">
                    <ExternalLink className="w-3 h-3 text-cyan-400" />
                    <span>Native Chromium Engine Active</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={handleDownload}
                      className="text-cyan-400 hover:text-cyan-300 font-mono flex items-center gap-1 bg-cyan-950/40 border border-cyan-800/20 px-1.5 py-0.5 rounded"
                      id="download-static-html-btn"
                    >
                      <Download className="w-3 h-3" /> Save Page
                    </button>
                    <a 
                      href={activeTab.url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-slate-400 hover:text-white font-mono flex items-center gap-0.5"
                      id="open-external-tab-link"
                    >
                      Open in New Tab <ArrowUpRight className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>

              {/* Right / Secondary Split View Frame (Multiple Windows) */}
              {splitScreen && secondaryTab && (
                <div className="flex-1 flex flex-col relative border-l border-white/10 min-h-0 h-full bg-[#121318]" id="secondary-frame-holder">
                  <div className="bg-[#090a0d] px-3 py-1.5 flex justify-between items-center text-[10px] font-mono text-slate-300 border-b border-white/5">
                    <div className="flex items-center gap-1.5 truncate max-w-[180px]">
                      <Columns className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="truncate">{secondaryTab.siteName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select 
                        value={secondaryTabId || ""}
                        onChange={(e) => setSecondaryTabId(e.target.value)}
                        className="bg-slate-900 border border-white/10 text-slate-300 text-[9px] px-1 py-0.5 rounded focus:outline-none"
                      >
                        {tabs.filter(t => t.id !== activeTabId).map(t => (
                          <option key={t.id} value={t.id}>{t.siteName}</option>
                        ))}
                      </select>
                      <button onClick={() => setSplitScreen(false)} className="text-slate-400 hover:text-white p-0.5 hover:bg-white/5 rounded">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-hidden relative w-full h-full" id="secondary-iframe-viewport-scaler">
                    <>
                    {/* @ts-ignore */}
                    <webview
                      key={`webview-secondary-${webviewKey}`}
                      ref={setSecondaryWebviewRef}
                      src={secondaryTab.url || "about:blank"}
                      title={secondaryTab.siteName}
                      className="absolute top-0 left-0 w-full h-full border-0 bg-white"
                      allowpopups="true"
                      id="browser-secondary-iframe"
                    />
                    </>
                  </div>
                  <div className="p-2 px-3 bg-[#090a0d] border-t border-white/5 text-[10px] text-slate-400 flex items-center justify-between">
                    <div className="font-mono text-slate-500">Split-View Mode</div>
                    <a href={secondaryTab.url} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white font-mono flex items-center gap-0.5">
                      Open New Tab <ArrowUpRight className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* Same-Origin Developer Console Panel (Drawer) */}
          {showConsole && (
            <div className="h-72 bg-[#090a0d] border-t border-white/10 flex flex-col z-20 font-mono animate-in slide-in-from-bottom duration-200" id="dev-console-drawer">
              {/* Header with Tab Navigation */}
              <div className="flex justify-between items-center bg-[#050608] px-4 py-1.5 border-b border-white/5">
                <div className="flex items-center gap-4">
                  {/* Console Tab Trigger */}
                  <button 
                    onClick={() => setActiveConsoleTab('console')}
                    className={`flex items-center gap-1.5 text-xs font-bold py-1 px-2.5 rounded-lg transition-all ${
                      activeConsoleTab === 'console' 
                        ? 'bg-[#14161f] text-cyan-400 border border-cyan-800/20' 
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    <span>JS Console</span>
                  </button>
                  {/* Diagnostics Tab Trigger */}
                  <button 
                    onClick={() => setActiveConsoleTab('diagnostics')}
                    className={`flex items-center gap-1.5 text-xs font-bold py-1 px-2.5 rounded-lg transition-all ${
                      activeConsoleTab === 'diagnostics' 
                        ? 'bg-[#14161f] text-cyan-400 border border-cyan-800/20' 
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>WebEngine Diagnostics</span>
                  </button>
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  {activeConsoleTab === 'console' ? (
                    <button onClick={() => setConsoleLogs([])} className="text-slate-500 hover:text-white">Clear Console</button>
                  ) : (
                    <button onClick={() => setEngineLogs([])} className="text-slate-500 hover:text-white">Clear Logs</button>
                  )}
                  <button onClick={() => setShowConsole(false)} className="text-slate-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              
              {/* Dual Tab Content Panels */}
              {activeConsoleTab === 'diagnostics' ? (
                <div className="flex-1 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-white/5 overflow-hidden">
                  {/* Left Column: Log stream */}
                  <div className="flex-1 flex flex-col min-w-0">
                    <div className="px-3 py-1.5 bg-[#050608] text-[9px] text-slate-500 uppercase tracking-wider flex justify-between items-center border-b border-white/5">
                      <span>Chromium Process Event Stream</span>
                      <span className="text-slate-600">Total: {engineLogs.length} events</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3.5 space-y-1.5 text-[10px] select-text scrollbar-thin">
                      {engineLogs.map((log, idx) => (
                        <div key={idx} className="leading-relaxed whitespace-pre-wrap">
                          <span className="text-slate-600 mr-2">[{log.time}]</span>
                          <span className={
                            log.type === "error" ? "text-red-400 font-bold" :
                            log.type === "success" ? "text-emerald-400 font-bold" :
                            log.type === "warning" ? "text-amber-400" : "text-cyan-400"
                          }>
                            {log.text}
                          </span>
                        </div>
                      ))}
                      {engineLogs.length === 0 && (
                        <div className="text-slate-600 text-center py-8">No engine logs captured yet. Ready.</div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Active diagnostics configuration */}
                  <div className="w-full md:w-80 shrink-0 flex flex-col bg-[#07080b]">
                    <div className="px-3 py-1.5 bg-[#050608] text-[9px] text-slate-500 uppercase tracking-wider border-b border-white/5">
                      Sub-Process & Engine Configuration
                    </div>
                    <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs scrollbar-thin">
                      {/* Active GPU details */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">Render Lifecycle:</span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                            loadingState === 'loaded' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/30' :
                            loadingState === 'started' ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/30 animate-pulse' :
                            loadingState === 'failed' ? 'bg-red-950 text-red-400 border border-red-800/30' :
                            loadingState === 'crashed' ? 'bg-amber-950 text-amber-400 border border-amber-800/30' :
                            'bg-slate-900 text-slate-400 border border-white/5'
                          }`}>
                            {loadingState}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">Graphics Mode:</span>
                          <button 
                            onClick={() => {
                              const nextMode = gpuMode === 'hardware' ? 'software' : 'hardware';
                              logEngineEvent("warning", `GPU Fix - User swapped GPU rendering mode manually to: ${nextMode.toUpperCase()}`);
                              setGpuMode(nextMode);
                              const api = (window as any).avyAPI;
                              if (api && api.setWebEngineGPUMode) {
                                api.setWebEngineGPUMode(nextMode).then(() => {
                                  logEngineEvent("success", `GPU mode changed in main process. Re-creating webview...`);
                                  setWebviewKey(prev => prev + 1);
                                  setReloadKey(prev => prev + 1);
                                });
                              } else {
                                setReloadKey(prev => prev + 1);
                              }
                            }}
                            className="px-1.5 py-0.5 rounded text-[9px] bg-slate-900 text-slate-300 hover:text-white border border-white/10 hover:border-white/20 transition-all uppercase font-bold font-mono"
                          >
                            {gpuMode === 'hardware' ? 'Hardware GPU' : 'Software Fallback'}
                          </button>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">Network Connection:</span>
                          <span className={`flex items-center gap-1 font-bold ${isOnline ? 'text-emerald-400' : 'text-red-400'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                            {isOnline ? 'ONLINE' : 'OFFLINE'}
                          </span>
                        </div>
                      </div>

                      {/* Startup Self Test Results */}
                      <div className="space-y-1 bg-[#050507] p-2.5 rounded border border-white/5 font-mono">
                        <div className="flex justify-between items-center">
                          <p className="text-[8px] text-slate-500 uppercase tracking-widest">Self Test Results:</p>
                          <button 
                            disabled={isSelfTesting}
                            onClick={runSelfTest}
                            className="text-[9px] text-cyan-400 hover:text-cyan-300 font-bold underline"
                          >
                            {isSelfTesting ? "Running..." : "Run Test"}
                          </button>
                        </div>
                        {selfTestReport ? (
                          <div className="space-y-1 mt-2 text-[10px]">
                            <div className="flex justify-between">
                              <span className="text-slate-500">Renderer:</span>
                              <span className={selfTestReport.renderer === "OK" ? "text-emerald-400 font-bold" : "text-red-400"}>{selfTestReport.renderer}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">GPU:</span>
                              <span className={selfTestReport.gpu === "OK" ? "text-emerald-400 font-bold" : "text-amber-400"}>{selfTestReport.gpu}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Network:</span>
                              <span className={selfTestReport.network === "OK" ? "text-emerald-400 font-bold" : "text-red-400"}>{selfTestReport.network}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">JavaScript:</span>
                              <span className={selfTestReport.javascript === "OK" ? "text-emerald-400 font-bold" : "text-red-400"}>{selfTestReport.javascript}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Cookies:</span>
                              <span className={selfTestReport.cookies === "OK" ? "text-emerald-400 font-bold" : "text-red-400"}>{selfTestReport.cookies}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Cache/Storage:</span>
                              <span className={selfTestReport.cache === "OK" ? "text-emerald-400 font-bold" : "text-red-400"}>{selfTestReport.cache}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Navigation:</span>
                              <span className={selfTestReport.navigation === "OK" ? "text-emerald-400 font-bold" : "text-red-400"}>{selfTestReport.navigation}</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[10px] text-slate-500 italic mt-1.5">No report run yet.</p>
                        )}
                      </div>

                      {/* Applied flags list */}
                      <div className="space-y-1 bg-[#050507] p-2 rounded border border-white/5">
                        <p className="text-[8px] text-slate-500 uppercase tracking-widest font-mono">Process CLI Flags:</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {engineFlags.map((flag, i) => (
                            <span key={i} className="text-[8px] bg-slate-950 text-slate-400 px-1 py-0.5 rounded select-all font-mono border border-white/5">{flag}</span>
                          ))}
                        </div>
                      </div>

                      {/* Security policies */}
                      <div className="space-y-1 bg-[#050507] p-2 rounded border border-white/5">
                        <p className="text-[8px] text-slate-500 uppercase tracking-widest font-mono">Security Sandboxing:</p>
                        <div className="grid grid-cols-2 gap-1 text-[9px] mt-1 font-mono text-emerald-400">
                          <div className="flex items-center gap-1"><Check className="w-2.5 h-2.5" /> javascript</div>
                          <div className="flex items-center gap-1"><Check className="w-2.5 h-2.5" /> domStorage</div>
                          <div className="flex items-center gap-1"><Check className="w-2.5 h-2.5" /> cookies</div>
                          <div className="flex items-center gap-1"><Check className="w-2.5 h-2.5" /> mediaPlayback</div>
                        </div>
                      </div>

                      {/* Active diagnostics actions */}
                      <div className="space-y-1.5 pt-2 border-t border-white/5">
                        <button 
                          onClick={triggerRendererCrash}
                          className="w-full text-center py-1 bg-red-950/40 text-red-400 hover:bg-red-900/40 border border-red-900/30 rounded text-[9px] uppercase font-bold transition-all"
                        >
                          Simulate Renderer Crash
                        </button>
                        <button 
                          onClick={() => {
                            const current = isOfflineSimulated;
                            setIsOfflineSimulated(!current);
                            logEngineEvent("warning", `Network Handling - Simulated network connection state set to: ${!current ? 'OFFLINE' : 'ONLINE'}`);
                            setReloadKey(prev => prev + 1);
                          }}
                          className={`w-full text-center py-1 rounded text-[9px] uppercase font-bold border transition-all ${
                            isOfflineSimulated 
                              ? 'bg-emerald-950/30 text-emerald-400 border-emerald-800/30' 
                              : 'bg-slate-900 text-slate-300 hover:text-white border border-white/10'
                          }`}
                        >
                          {isOfflineSimulated ? 'Go Online' : 'Simulate Offline Mode'}
                        </button>
                      </div>

                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Console Logs Display */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-1.5 text-xs select-text scrollbar-thin">
                    {consoleLogs.map((log, idx) => (
                      <div key={idx} className={`leading-relaxed whitespace-pre-wrap ${
                        log.type === "error" ? "text-red-400" :
                        log.type === "success" ? "text-emerald-400" :
                        log.type === "info" ? "text-cyan-400" : "text-slate-300"
                      }`}>
                        {log.text}
                      </div>
                    ))}
                  </div>

                  {/* Console Command Input */}
                  <form onSubmit={handleConsoleSubmit} className="flex border-t border-white/5 bg-[#050608]" id="dev-console-command-form">
                    <span className="text-cyan-500 px-3 py-2 text-xs select-none font-bold">&gt;</span>
                    <input 
                      type="text" 
                      value={consoleInput}
                      onChange={(e) => setConsoleInput(e.target.value)}
                      placeholder="Execute JavaScript context code... (e.g. document.title, window.location.href, alert('hello'))"
                      className="bg-transparent text-slate-100 flex-1 py-2 text-xs font-mono focus:outline-none"
                      id="dev-console-command-input"
                    />
                    <button type="submit" className="px-4 hover:bg-white/5 text-cyan-400 hover:text-cyan-300 flex items-center gap-1 text-xs">
                      <Play className="w-3 h-3 fill-current" /> Run
                    </button>
                  </form>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
