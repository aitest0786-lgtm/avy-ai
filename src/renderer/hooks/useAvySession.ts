import { useState, useEffect, useRef, useCallback } from "react";
import { CompanionState, AssistantTheme, SuggestedWebsite, AssistantState, BrowserState, BrowserTab } from "../types";
import { floatTo16BitPCM, arrayBufferToBase64, base64ToFloat32PCM } from "../lib/audio-helpers";

const formatUrl = (input: string): { url: string; siteName: string } => {
  let trimmed = input.trim();
  if (!trimmed) {
    return { url: "https://www.google.com", siteName: "Google" };
  }

  // Handle custom app schemas
  if (trimmed.startsWith("avy://")) {
    const page = trimmed.replace("avy://", "");
    const siteName = page.charAt(0).toUpperCase() + page.slice(1) + " Hub";
    return { url: trimmed, siteName: `Avy's ${siteName}` };
  }

  // Detect and strip website launch commands
  const webCmdPrefixes = [
    /^(open\s+the\s+website\s+of\s+)/i,
    /^(open\s+the\s+website\s+)/i,
    /^(open\s+the\s+page\s+for\s+)/i,
    /^(open\s+up\s+)/i,
    /^(open\s+)/i,
    /^(go\s+to\s+the\s+website\s+of\s+)/i,
    /^(go\s+to\s+the\s+website\s+)/i,
    /^(go\s+to\s+)/i,
    /^(visit\s+the\s+website\s+of\s+)/i,
    /^(visit\s+the\s+website\s+)/i,
    /^(visit\s+)/i,
    /^(launch\s+the\s+website\s+of\s+)/i,
    /^(launch\s+the\s+website\s+)/i,
    /^(launch\s+)/i,
    /^(navigate\s+to\s+the\s+website\s+of\s+)/i,
    /^(navigate\s+to\s+the\s+website\s+)/i,
    /^(navigate\s+to\s+)/i,
    /^(browse\s+to\s+)/i,
    /^(browse\s+)/i,
  ];

  let isExplicitWebsiteCmd = false;
  for (const prefix of webCmdPrefixes) {
    if (prefix.test(trimmed)) {
      trimmed = trimmed.replace(prefix, "").trim();
      isExplicitWebsiteCmd = true;
      break;
    }
  }

  // Detect explicit search command prefixes
  const searchCmdPrefixes = [
    /^(search\s+for\s+)/i,
    /^(search\s+)/i,
    /^(google\s+for\s+)/i,
    /^(google\s+)/i,
    /^(find\s+information\s+about\s+)/i,
    /^(find\s+info\s+on\s+)/i,
    /^(find\s+)/i,
    /^(look\s+up\s+for\s+)/i,
    /^(look\s+up\s+)/i,
    /^(ask\s+about\s+)/i,
  ];

  let isExplicitSearchCmd = false;
  let searchQuery = trimmed;
  for (const prefix of searchCmdPrefixes) {
    if (prefix.test(trimmed)) {
      searchQuery = trimmed.replace(prefix, "").trim();
      isExplicitSearchCmd = true;
      break;
    }
  }

  // Clean the trimmed text of basic wrapping quotes/braces
  trimmed = trimmed.replace(/^["'`\[\(]+|["'`\]\)]+$/g, "").trim();

  if (isExplicitSearchCmd) {
    return {
      url: `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`,
      siteName: `Search: ${searchQuery}`
    };
  }

  // Common popular websites dictionary for direct domain/name mapping
  const commonWebsites: { [key: string]: { url: string; siteName: string } } = {
    "youtube": { url: "https://www.youtube.com", siteName: "YouTube" },
    "chatgpt": { url: "https://chatgpt.com", siteName: "ChatGPT" },
    "openai": { url: "https://openai.com", siteName: "OpenAI" },
    "instagram": { url: "https://www.instagram.com", siteName: "Instagram" },
    "facebook": { url: "https://www.facebook.com", siteName: "Facebook" },
    "github": { url: "https://github.com", siteName: "GitHub" },
    "netflix": { url: "https://www.netflix.com", siteName: "Netflix" },
    "spotify": { url: "https://spotify.com", siteName: "Spotify" },
    "gmail": { url: "https://mail.google.com", siteName: "Gmail" },
    "reddit": { url: "https://reddit.com", siteName: "Reddit" },
    "google": { url: "https://www.google.com", siteName: "Google" },
    "x": { url: "https://x.com", siteName: "X" },
    "twitter": { url: "https://x.com", siteName: "Twitter" },
    "linkedin": { url: "https://linkedin.com", siteName: "LinkedIn" },
    "amazon": { url: "https://www.amazon.com", siteName: "Amazon" },
    "wikipedia": { url: "https://wikipedia.org", siteName: "Wikipedia" },
    "twitch": { url: "https://twitch.tv", siteName: "Twitch" },
    "discord": { url: "https://discord.com", siteName: "Discord" },
    "pinterest": { url: "https://pinterest.com", siteName: "Pinterest" },
    "tiktok": { url: "https://tiktok.com", siteName: "TikTok" },
    "claude": { url: "https://claude.ai", siteName: "Claude" },
    "gemini": { url: "https://gemini.google.com", siteName: "Gemini" },
    "apple": { url: "https://apple.com", siteName: "Apple" },
    "microsoft": { url: "https://microsoft.com", siteName: "Microsoft" },
    "yahoo": { url: "https://yahoo.com", siteName: "Yahoo" },
    "bing": { url: "https://bing.com", siteName: "Bing" },
    "canva": { url: "https://www.canva.com", siteName: "Canva" },
    "cursor": { url: "https://cursor.com", siteName: "Cursor" }
  };

  const lookupKey = trimmed.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (commonWebsites[lookupKey]) {
    return commonWebsites[lookupKey];
  }

  // Remove duplicate/nested protocols or invalid prefix spacings
  let cleanInput = trimmed.replace(/^(https?:\/\/)+/i, "");
  // Clean other protocols if they somehow got chained/pasted (e.g., "https://http://example.com")
  cleanInput = cleanInput.replace(/^(https?:\/\/)+/i, "");

  // Detect whether the input is a valid URL or looks like a domain name
  const hasSpace = cleanInput.includes(" ");
  const hasDot = cleanInput.includes(".");
  
  // A standard domain regex check
  const domainRegex = /^[a-zA-Z0-9][-a-zA-Z0-9]{0,62}\.[a-zA-Z]{2,24}(?:\/.*)?$/i;
  const isDomainName = domainRegex.test(cleanInput);

  // Decide if it should be opened directly as a website or searched via Google
  const isProbablyUrl = (hasDot && !hasSpace) || isDomainName || isExplicitWebsiteCmd;

  if (!isProbablyUrl) {
    // Treat everything else as a search query
    return {
      url: `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`,
      siteName: `Search: ${trimmed}`
    };
  }

  // If there's no dot but they explicitly commanded a website navigation, assume .com
  if (!hasDot && !cleanInput.includes("/") && isExplicitWebsiteCmd) {
    cleanInput = cleanInput + ".com";
  }

  // Clean any invalid spaces or brackets inside the URL
  cleanInput = cleanInput.replace(/\s+/g, "");

  // Generate the final secure URL
  const finalUrl = "https://" + cleanInput;

  // Determine site name elegantly from the hostname
  let host = cleanInput.split("/")[0].toLowerCase();
  host = host.replace(/^www\./i, "");
  let siteName = host.split(".")[0] || "Website";
  siteName = siteName.charAt(0).toUpperCase() + siteName.slice(1);

  return { url: finalUrl, siteName };
};

export function useAvySession() {
  const [state, setState] = useState<AssistantState>(() => {
    let savedBrowser = null;
    try {
      const saved = localStorage.getItem("avy_browser_state");
      if (saved) {
        savedBrowser = JSON.parse(saved);
      }
    } catch (e) {
      console.warn("Failed to load saved browser state", e);
    }

    const defaultBrowser: BrowserState = {
      isOpen: false,
      activeTabId: "tab-default",
      tabs: [
        {
          id: "tab-default",
          url: "https://www.google.com",
          siteName: "Google",
          history: ["https://www.google.com"],
          historyIndex: 0
        }
      ],
      bookmarks: [
        { url: "https://www.google.com", siteName: "Google Search" },
        { url: "https://wikipedia.org", siteName: "Wikipedia" },
        { url: "https://github.com", siteName: "GitHub" },
        { url: "https://news.ycombinator.com", siteName: "Hacker News" },
        { url: "avy://memory", siteName: "Memory Hub" }
      ],
      isDesktopView: false,
      isPrivate: false,
      showHistory: false,
      showBookmarks: false,
      historyList: []
    };

    return {
      status: "disconnected",
      theme: "cyan",
      error: null,
      websites: [],
      browser: savedBrowser || defaultBrowser
    };
  });

  // Save browser state to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem("avy_browser_state", JSON.stringify(state.browser));
    } catch (e) {
      // ignore
    }
  }, [state.browser]);

  const wsRef = useRef<WebSocket | null>(null);
  
  // Audio Context and node references
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  
  // Scheduling references
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const stateCheckIntervalRef = useRef<number | null>(null);

  // Stop all active audio playback nodes immediately
  const stopAllPlayback = useCallback(() => {
    activeSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch (e) {
        // Already stopped or finished
      }
    });
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  }, []);

  // Cleanup all audio resources and connections
  const disconnect = useCallback((errorMsg?: string | null, clearError = false) => {
    console.log("[useAvySession] Disconnecting session and releasing resources...");
    
    // Clear check interval
    if (stateCheckIntervalRef.current) {
      window.clearInterval(stateCheckIntervalRef.current);
      stateCheckIntervalRef.current = null;
    }

    // Stop playback
    stopAllPlayback();

    // Close WebSocket
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }

    // Release microphone
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    // Disconnect Web Audio processor
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    // Close Audio Contexts
    if (inputCtxRef.current) {
      inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current) {
      outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }

    inputAnalyserRef.current = null;
    outputAnalyserRef.current = null;

    setState((prev) => ({
      ...prev,
      status: errorMsg ? "error" : (clearError ? "disconnected" : (prev.status === "error" ? "error" : "disconnected")),
      error: errorMsg || (clearError ? null : (prev.status === "error" ? prev.error : null))
    }));
  }, [stopAllPlayback]);

  // Handle playing a Base64 PCM chunk
  const playAudioChunk = useCallback((base64PCM: string) => {
    try {
      const outputCtx = outputCtxRef.current;
      if (!outputCtx) return;

      // Resume context if suspended
      if (outputCtx.state === "suspended") {
        outputCtx.resume();
      }

      const float32Data = base64ToFloat32PCM(base64PCM);
      const audioBuffer = outputCtx.createBuffer(1, float32Data.length, 24000);
      audioBuffer.copyToChannel(float32Data, 0);

      const sourceNode = outputCtx.createBufferSource();
      sourceNode.buffer = audioBuffer;

      // Connect to output analyser
      if (outputAnalyserRef.current) {
        sourceNode.connect(outputAnalyserRef.current);
      } else {
        sourceNode.connect(outputCtx.destination);
      }

      const now = outputCtx.currentTime;
      if (nextStartTimeRef.current < now) {
        nextStartTimeRef.current = now + 0.05; // 50ms safety buffer
      }

      sourceNode.start(nextStartTimeRef.current);

      activeSourcesRef.current.add(sourceNode);
      sourceNode.onended = () => {
        activeSourcesRef.current.delete(sourceNode);
      };

      nextStartTimeRef.current += audioBuffer.duration;
    } catch (err) {
      console.error("[useAvySession] Playback chunk error:", err);
    }
  }, []);

  // Built-in Web Browser Controls
  const setBrowserOpen = useCallback((isOpen: boolean) => {
    setState((prev) => ({
      ...prev,
      browser: {
        ...prev.browser,
        isOpen
      }
    }));
  }, []);

  const openBrowserUrl = useCallback((input: string, customSiteName?: string, forceNewTab = false) => {
    const { url, siteName } = formatUrl(input);
    const finalSiteName = customSiteName || siteName;

    setState((prev) => {
      const { tabs, activeTabId, isPrivate, historyList } = prev.browser;
      
      const updatedHistoryList = isPrivate 
        ? historyList 
        : [{ url, siteName: finalSiteName, timestamp: new Date().toLocaleTimeString() }, ...historyList];

      // "If the current page is already open, switch to it."
      // Check if any existing tab already has this website (matching domain/path)
      const alreadyOpenTab = tabs.find((t) => {
        try {
          const tUrl = new URL(t.url);
          const targetUrlObj = new URL(url);
          return tUrl.hostname === targetUrlObj.hostname && tUrl.pathname === targetUrlObj.pathname;
        } catch (e) {
          return t.url.toLowerCase().trim() === url.toLowerCase().trim();
        }
      });

      if (alreadyOpenTab) {
        return {
          ...prev,
          browser: {
            ...prev.browser,
            isOpen: true,
            activeTabId: alreadyOpenTab.id
          }
        };
      }

      if (forceNewTab || tabs.length === 0) {
        const newId = `tab-${Date.now()}`;
        const newTabItem = {
          id: newId,
          url,
          siteName: finalSiteName,
          history: [url],
          historyIndex: 0
        };
        return {
          ...prev,
          browser: {
            ...prev.browser,
            isOpen: true,
            activeTabId: newId,
            tabs: [...tabs, newTabItem],
            historyList: updatedHistoryList
          }
        };
      } else {
        const updatedTabs = tabs.map((tab) => {
          if (tab.id === activeTabId) {
            const newHistory = tab.history.slice(0, tab.historyIndex + 1);
            newHistory.push(url);
            return {
              ...tab,
              url,
              siteName: finalSiteName,
              history: newHistory,
              historyIndex: newHistory.length - 1
            };
          }
          return tab;
        });
        return {
          ...prev,
          browser: {
            ...prev.browser,
            isOpen: true,
            tabs: updatedTabs,
            historyList: updatedHistoryList
          }
        };
      }
    });
  }, []);

  const closeBrowserTab = useCallback((tabId: string) => {
    setState((prev) => {
      const { tabs, activeTabId, closedTabs = [] } = prev.browser;
      const tabToClose = tabs.find((t) => t.id === tabId);
      const filteredTabs = tabs.filter((t) => t.id !== tabId);
      
      let nextActiveId = activeTabId;
      if (activeTabId === tabId && filteredTabs.length > 0) {
        nextActiveId = filteredTabs[filteredTabs.length - 1].id;
      }

      const nextClosedTabs = tabToClose ? [tabToClose, ...closedTabs].slice(0, 15) : closedTabs;

      return {
        ...prev,
        browser: {
          ...prev.browser,
          tabs: filteredTabs,
          activeTabId: nextActiveId,
          isOpen: filteredTabs.length > 0 ? prev.browser.isOpen : false,
          closedTabs: nextClosedTabs
        }
      };
    });
  }, []);

  const restoreLastClosedTab = useCallback(() => {
    setState((prev) => {
      const { tabs, closedTabs = [] } = prev.browser;
      if (closedTabs.length === 0) return prev;

      const [tabToRestore, ...remainingClosed] = closedTabs;
      return {
        ...prev,
        browser: {
          ...prev.browser,
          tabs: [...tabs, tabToRestore],
          activeTabId: tabToRestore.id,
          closedTabs: remainingClosed
        }
      };
    });
  }, []);

  const updateActiveTabUrlAndTitle = useCallback((url: string, title: string) => {
    setState((prev) => {
      const { tabs, activeTabId } = prev.browser;
      const updatedTabs = tabs.map((tab) => {
        if (tab.id === activeTabId) {
          const cleanTitle = title.startsWith("http") ? tab.siteName : title;
          const currentUrl = tab.history[tab.historyIndex];
          let nextHistory = [...tab.history];
          let nextIndex = tab.historyIndex;
          
          if (currentUrl !== url) {
            nextHistory = tab.history.slice(0, tab.historyIndex + 1);
            nextHistory.push(url);
            nextIndex = nextHistory.length - 1;
          }

          return {
            ...tab,
            url,
            siteName: cleanTitle,
            history: nextHistory,
            historyIndex: nextIndex
          };
        }
        return tab;
      });
      return {
        ...prev,
        browser: {
          ...prev.browser,
          tabs: updatedTabs
        }
      };
    });
  }, []);

  const newBrowserTab = useCallback((url = "https://www.google.com", siteName = "Google") => {
    setState((prev) => {
      const { tabs } = prev.browser;
      const newId = `tab-${Date.now()}`;
      const newTabItem = {
        id: newId,
        url,
        siteName,
        history: [url],
        historyIndex: 0
      };
      return {
        ...prev,
        browser: {
          ...prev.browser,
          isOpen: true,
          activeTabId: newId,
          tabs: [...tabs, newTabItem]
        }
      };
    });
  }, []);

  const goBack = useCallback(() => {
    setState((prev) => {
      const { tabs, activeTabId } = prev.browser;
      const updatedTabs = tabs.map((tab) => {
        if (tab.id === activeTabId && tab.historyIndex > 0) {
          const nextIndex = tab.historyIndex - 1;
          return {
            ...tab,
            historyIndex: nextIndex,
            url: tab.history[nextIndex]
          };
        }
        return tab;
      });
      return {
        ...prev,
        browser: {
          ...prev.browser,
          tabs: updatedTabs
        }
      };
    });
  }, []);

  const goForward = useCallback(() => {
    setState((prev) => {
      const { tabs, activeTabId } = prev.browser;
      const updatedTabs = tabs.map((tab) => {
        if (tab.id === activeTabId && tab.historyIndex < tab.history.length - 1) {
          const nextIndex = tab.historyIndex + 1;
          return {
            ...tab,
            historyIndex: nextIndex,
            url: tab.history[nextIndex]
          };
        }
        return tab;
      });
      return {
        ...prev,
        browser: {
          ...prev.browser,
          tabs: updatedTabs
        }
      };
    });
  }, []);

  const toggleDesktopView = useCallback(() => {
    setState((prev) => ({
      ...prev,
      browser: {
        ...prev.browser,
        isDesktopView: !prev.browser.isDesktopView
      }
    }));
  }, []);

  const togglePrivateMode = useCallback(() => {
    setState((prev) => ({
      ...prev,
      browser: {
        ...prev.browser,
        isPrivate: !prev.browser.isPrivate
      }
    }));
  }, []);

  const toggleBookmark = useCallback(() => {
    setState((prev) => {
      const { tabs, activeTabId, bookmarks } = prev.browser;
      const activeTab = tabs.find((t) => t.id === activeTabId);
      if (!activeTab) return prev;

      const isBookmarked = bookmarks.some((b) => b.url === activeTab.url);
      let nextBookmarks = [];
      if (isBookmarked) {
        nextBookmarks = bookmarks.filter((b) => b.url !== activeTab.url);
      } else {
        nextBookmarks = [...bookmarks, { url: activeTab.url, siteName: activeTab.siteName }];
      }

      return {
        ...prev,
        browser: {
          ...prev.browser,
          bookmarks: nextBookmarks
        }
      };
    });
  }, []);

  const clearBrowserHistory = useCallback(() => {
    setState((prev) => ({
      ...prev,
      browser: {
        ...prev.browser,
        historyList: []
      }
    }));
  }, []);

  const setActiveTab = useCallback((tabId: string) => {
    setState((prev) => ({
      ...prev,
      browser: {
        ...prev.browser,
        activeTabId: tabId
      }
    }));
  }, []);

  const toggleShowBookmarks = useCallback(() => {
    setState((prev) => ({
      ...prev,
      browser: {
        ...prev.browser,
        showBookmarks: !prev.browser.showBookmarks,
        showHistory: false
      }
    }));
  }, []);

  const toggleShowHistory = useCallback(() => {
    setState((prev) => ({
      ...prev,
      browser: {
        ...prev.browser,
        showHistory: !prev.browser.showHistory,
        showBookmarks: false
      }
    }));
  }, []);

  const setTheme = useCallback((theme: AssistantTheme) => {
    setState((prev) => ({
      ...prev,
      theme
    }));
  }, []);

  // Keep browser handlers up to date for WebSocket callback reference
  const browserHandlersRef = useRef({
    newBrowserTab,
    closeBrowserTab,
    setActiveTab,
    activeTabId: state.browser.activeTabId
  });

  useEffect(() => {
    browserHandlersRef.current = {
      newBrowserTab,
      closeBrowserTab,
      setActiveTab,
      activeTabId: state.browser.activeTabId
    };
  }, [newBrowserTab, closeBrowserTab, setActiveTab, state.browser.activeTabId]);

  // Connect to server and request microphone stream
  const connectSession = useCallback(async (options?: { forceTextMode?: boolean }) => {
    try {
      disconnect(); // ensure clean state

      setState((prev) => ({
        ...prev,
        status: "connecting",
        error: null
      }));

      let micStream: MediaStream | null = null;
      let inputCtx: AudioContext | null = null;
      let inputAnalyser: AnalyserNode | null = null;
      let processor: ScriptProcessorNode | null = null;
      let isTextMode = options?.forceTextMode || false;

      if (!isTextMode) {
        try {
          console.log("[useAvySession] Requesting microphone permission...");
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });
          micStreamRef.current = micStream;
        } catch (micErr: any) {
          console.warn("[useAvySession] Microphone access denied or failed, falling back to keyboard input / text mode:", micErr);
          isTextMode = true;
          setState((prev) => ({
            ...prev,
            error: "Microphone permission denied. Feel free to type your messages to chat!"
          }));
        }
      }

      // Create Web Audio contexts
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      outputCtxRef.current = outputCtx;

      // Create Analysers
      const outputAnalyser = outputCtx.createAnalyser();
      outputAnalyser.fftSize = 256;
      outputAnalyser.connect(outputCtx.destination);
      outputAnalyserRef.current = outputAnalyser;

      if (!isTextMode && micStream) {
        inputCtx = new AudioContext({ sampleRate: 16000 });
        inputCtxRef.current = inputCtx;

        const inputAnalyserNode = inputCtx.createAnalyser();
        inputAnalyserNode.fftSize = 256;
        inputAnalyserRef.current = inputAnalyserNode;

        const micSource = inputCtx.createMediaStreamSource(micStream);
        micSource.connect(inputAnalyserNode);

        // Create script processor node for mic streaming (size 4096 is standard and stable)
        const processorNode = inputCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processorNode;
        micSource.connect(processorNode);
        processorNode.connect(inputCtx.destination);
        processor = processorNode;
      }

      // Establish WebSocket connection with persistent userId
      let userId = localStorage.getItem("avy_user_id");
      if (!userId) {
        userId = `user_${Math.random().toString(36).substring(2, 11)}`;
        localStorage.setItem("avy_user_id", userId);
      }

      // Pre-warm the HTTP connection to ensure it is awake
      try {
        await fetch(`http://127.0.0.1:3000/api/health?userId=${userId}`);
      } catch (err) {
        console.warn("[useAvySession] Connection pre-warm failed:", err);
      }

      // VoiceServer runs on 3000 locally in the main process
      const wsUrl = `ws://127.0.0.1:3000/live?userId=${userId}`;
      console.log(`[useAvySession] Connecting WebSocket to ${wsUrl} for user: ${userId} (Text mode: ${isTextMode})`);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      // Process mic input processing
      if (processor && !isTextMode) {
        processor.onaudioprocess = (e) => {
          if (ws.readyState === WebSocket.OPEN) {
            const channelData = e.inputBuffer.getChannelData(0);
            const pcmBuffer = floatTo16BitPCM(channelData);
            const base64Audio = arrayBufferToBase64(pcmBuffer);
            ws.send(JSON.stringify({ type: "audio", data: base64Audio }));
          }
        };
      }

      ws.onopen = () => {
        console.log("[useAvySession] WebSocket connection opened.");
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.type === "connected") {
            console.log("[useAvySession] Gemini live session connected.");
            setState((prev) => ({
              ...prev,
              status: "listening"
            }));
          } else if (msg.type === "audio" && msg.data) {
            playAudioChunk(msg.data);
          } else if (msg.type === "interrupted") {
            console.log("[useAvySession] Received interruption signal. Silencing playback.");
            stopAllPlayback();
          } else if (["memory_saved", "memory_updated", "memory_forgot"].includes(msg.type)) {
            console.log(`[useAvySession] Memory operation event: ${msg.type}`, msg);
            window.dispatchEvent(new CustomEvent("avy-memory-update", { detail: msg }));
          } else if (msg.type === "open_website" && msg.url) {
            console.log(`[useAvySession] Web action: openWebsite -> ${msg.url}`);
            
            // Core upgrade: trigger built-in browser load
            openBrowserUrl(msg.url, msg.siteName || "Suggested Link");

            // Also append to suggested websites state
            const newSite: SuggestedWebsite = {
              url: msg.url,
              siteName: msg.siteName || "Suggested Link",
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            };
            setState((prev) => ({
              ...prev,
              websites: [newSite, ...prev.websites]
            }));
          } else if (msg.type === "avy_customization") {
            console.log("[useAvySession] Received Avy visual customization tool trigger:", msg);
            window.dispatchEvent(new CustomEvent("avy-voice-customization", { detail: msg }));
          } else if (msg.type === "change_theme" && msg.theme) {
            console.log(`[useAvySession] Web action: changeTheme -> ${msg.theme}`);
            const themeSanitized = msg.theme.toLowerCase() as AssistantTheme;
            const validThemes: AssistantTheme[] = ["cyan", "amber", "purple", "emerald", "crimson", "aurora"];
            
            if (validThemes.includes(themeSanitized)) {
              setState((prev) => ({
                ...prev,
                theme: themeSanitized
              }));
            }
          } else if (msg.type === "desktop_action") {
            const { id, action, args } = msg;
            console.log("[useAvySession] Received desktop action from server:", action, args);
            
            // Listen for the unique response event from our desktop component
            const responseHandler = (e: Event) => {
              const customEvent = e as CustomEvent;
              const { result } = customEvent.detail;
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: "desktop_action_result",
                  id,
                  result
                }));
              }
              window.removeEventListener(`avy-desktop-control-response-${id}`, responseHandler);
            };
            window.addEventListener(`avy-desktop-control-response-${id}`, responseHandler);

            // Backup timeout in case the desktop UI fails to respond
            setTimeout(() => {
              window.removeEventListener(`avy-desktop-control-response-${id}`, responseHandler);
            }, 11000);

            // Dispatch the desktop control action to the desktop control panel
            window.dispatchEvent(new CustomEvent("avy-desktop-control", { detail: { id, action, args } }));
          } else if (["agent_connection_status", "desktop_action_dispatched", "desktop_action_result_log", "agent_log"].includes(msg.type)) {
            window.dispatchEvent(new CustomEvent(`avy-${msg.type}`, { detail: msg }));
          } else if (msg.type === "browser_action") {
            const { id, action, args } = msg;
            
            // Helper to send the result back
            const sendResult = (result: any) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: "browser_action_result",
                  id,
                  result
                }));
              }
            };

            try {
              const iframe = document.getElementById("browser-active-iframe") as HTMLIFrameElement;

              // For tab control, we don't necessarily need the active iframe to be present
              if (action === "browserTabControl") {
                const { action: tabAction, url, tabId } = args;
                const handlers = browserHandlersRef.current;
                if (tabAction === "new") {
                  handlers.newBrowserTab(url || "https://www.google.com", url ? undefined : "Google");
                  sendResult({ success: true, message: `Opened new tab at ${url || "Google"}` });
                } else if (tabAction === "close") {
                  const targetId = tabId || handlers.activeTabId;
                  handlers.closeBrowserTab(targetId);
                  sendResult({ success: true, message: `Closed tab ${targetId}` });
                } else if (tabAction === "switch") {
                  if (tabId) {
                    handlers.setActiveTab(tabId);
                    sendResult({ success: true, message: `Switched to tab ${tabId}` });
                  } else {
                    sendResult({ success: false, error: "Missing tabId parameter" });
                  }
                } else {
                  sendResult({ success: false, error: `Unsupported tab control action: ${tabAction}` });
                }
                return;
              }

              // Check if iframe is loaded
              if (!iframe) {
                sendResult({ success: false, error: "Browser is currently closed. Make sure to open a website first." });
                return;
              }

              const doc = iframe.contentDocument;
              const win = iframe.contentWindow;

              if (!doc || !win) {
                sendResult({ success: false, error: "Failed to access browser iframe DOM. Same-origin constraint or security exception." });
                return;
              }

              if (action === "readWebpageContent") {
                // Read full text content of the page
                const text = doc.body ? doc.body.innerText || doc.body.textContent || "" : "";
                // Clean up whitespace/trim to make it compact
                const cleanedText = text.replace(/\s+/g, " ").trim().substring(0, 15000); // 15k characters limit to avoid token bloat
                
                sendResult({
                  success: true,
                  url: doc.location.href || iframe.src,
                  title: doc.title || "Webpage",
                  content: cleanedText
                });
              } else if (action === "browserScroll") {
                const { direction } = args;
                if (direction === "down") {
                  win.scrollBy({ top: win.innerHeight * 0.7, behavior: "smooth" });
                  sendResult({ success: true, message: "Scrolled page down" });
                } else if (direction === "up") {
                  win.scrollBy({ top: -win.innerHeight * 0.7, behavior: "smooth" });
                  sendResult({ success: true, message: "Scrolled page up" });
                } else if (direction === "top") {
                  win.scrollTo({ top: 0, behavior: "smooth" });
                  sendResult({ success: true, message: "Scrolled to top of the page" });
                } else if (direction === "bottom") {
                  win.scrollTo({ top: doc.body.scrollHeight, behavior: "smooth" });
                  sendResult({ success: true, message: "Scrolled to bottom of the page" });
                } else {
                  sendResult({ success: false, error: `Invalid scroll direction: ${direction}` });
                }
              } else if (action === "browserClick") {
                const { selectorOrText } = args;
                if (!selectorOrText) {
                  sendResult({ success: false, error: "Missing selectorOrText parameter" });
                  return;
                }

                // Try as CSS Selector first
                let el: any = null;
                try {
                  el = doc.querySelector(selectorOrText);
                } catch (e) {
                  // ignore selector syntax errors, try text search instead
                }

                // If not found, try text match search (case-insensitive) on links, buttons, inputs
                if (!el) {
                  const clickableTags = doc.querySelectorAll("a, button, [role=button], input[type=button], input[type=submit]");
                  for (let i = 0; i < clickableTags.length; i++) {
                    const item = clickableTags[i] as HTMLElement;
                    if (item.innerText?.toLowerCase().includes(selectorOrText.toLowerCase()) || 
                        item.textContent?.toLowerCase().includes(selectorOrText.toLowerCase())) {
                      el = item;
                      break;
                    }
                  }
                }

                if (el) {
                  // Scroll it into view and click
                  el.scrollIntoView({ behavior: "smooth", block: "center" });
                  setTimeout(() => {
                    el.click();
                    sendResult({ success: true, message: `Successfully clicked element matching: ${selectorOrText}` });
                  }, 400);
                } else {
                  sendResult({ success: false, error: `Could not find any clickable element matching: ${selectorOrText}` });
                }
              } else if (action === "browserInput") {
                const { selectorOrPlaceholder, text } = args;
                if (!selectorOrPlaceholder || text === undefined) {
                  sendResult({ success: false, error: "Missing selectorOrPlaceholder or text parameter" });
                  return;
                }

                let el: any = null;
                try {
                  el = doc.querySelector(selectorOrPlaceholder);
                } catch (e) {
                  // ignore
                }

                // Try searching for inputs with placeholders or names
                if (!el) {
                  const inputs = doc.querySelectorAll("input, textarea");
                  for (let i = 0; i < inputs.length; i++) {
                    const item = inputs[i] as HTMLInputElement;
                    if (item.placeholder?.toLowerCase().includes(selectorOrPlaceholder.toLowerCase()) || 
                        item.name?.toLowerCase() === selectorOrPlaceholder.toLowerCase() ||
                        item.id?.toLowerCase() === selectorOrPlaceholder.toLowerCase()) {
                      el = item;
                      break;
                    }
                  }
                }

                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "center" });
                  el.value = text;
                  // Dispatch events to trigger react/vue/angular data binding updates
                  el.dispatchEvent(new Event("input", { bubbles: true }));
                  el.dispatchEvent(new Event("change", { bubbles: true }));
                  sendResult({ success: true, message: `Successfully inputted text into field matching: ${selectorOrPlaceholder}` });
                } else {
                  sendResult({ success: false, error: `Could not find any input field matching: ${selectorOrPlaceholder}` });
                }
              } else if (action === "browserMediaControl") {
                const { action: mediaAction } = args;
                // Find video or audio elements inside iframe
                const mediaElements = doc.querySelectorAll("video, audio");
                if (mediaElements.length === 0) {
                  sendResult({ success: false, error: "No video or audio media elements found on the active page." });
                  return;
                }

                let successCount = 0;
                mediaElements.forEach((el: any) => {
                  try {
                    if (mediaAction === "play") {
                      el.play().catch(() => {});
                      successCount++;
                    } else if (mediaAction === "pause") {
                      el.pause();
                      successCount++;
                    } else if (mediaAction === "mute") {
                      el.muted = true;
                      successCount++;
                    } else if (mediaAction === "unmute") {
                      el.muted = false;
                      successCount++;
                    }
                  } catch (e) {
                    // ignore
                  }
                });

                if (successCount > 0) {
                  sendResult({ success: true, message: `Executed ${mediaAction} on ${successCount} media element(s).` });
                } else {
                  sendResult({ success: false, error: `Failed to perform ${mediaAction} on any media elements.` });
                }
              } else {
                sendResult({ success: false, error: `Unsupported browser action: ${action}` });
              }
            } catch (err: any) {
              console.error("[useAvySession] Error during client browser action execution:", err);
              sendResult({ success: false, error: `Client-side exception: ${err.message || err}` });
            }
          } else if (msg.type === "error") {
            console.error("[useAvySession] WebSocket server error:", msg.message);
            disconnect(msg.message);
          }
        } catch (err) {
          console.error("[useAvySession] Error handling socket message:", err);
        }
      };

      ws.onclose = () => {
        console.log("[useAvySession] WebSocket connection closed.");
        disconnect();
      };

      ws.onerror = (err) => {
        console.error("[useAvySession] WebSocket error:", err);
        disconnect("Connection error: Unable to reach Avy's server. If you are previewing inside the AI Studio frame, please click the 'Open in a new tab' button in the top-right corner of the preview to bypass browser sandboxing or third-party cookie restrictions.");
      };

      // Start state synchronization loop based on playback queues
      stateCheckIntervalRef.current = window.setInterval(() => {
        const outputCtx = outputCtxRef.current;
        if (!outputCtx) return;

        // If there are active playing sources and current time hasn't passed nextStartTime
        const isCurrentlySpeaking = activeSourcesRef.current.size > 0 && outputCtx.currentTime < nextStartTimeRef.current;

        setState((prev) => {
          if (prev.status === "connecting" || prev.status === "disconnected" || prev.status === "error") {
            return prev;
          }
          const targetStatus: CompanionState = isCurrentlySpeaking ? "speaking" : "listening";
          if (prev.status !== targetStatus) {
            return { ...prev, status: targetStatus };
          }
          return prev;
        });
      }, 50);

    } catch (err: any) {
      console.error("[useAvySession] Connection failed:", err);
      disconnect(err.message || "Failed to capture microphone. Please verify site permissions.");
    }
  }, [disconnect, playAudioChunk, stopAllPlayback, openBrowserUrl]);

  const sendTextMessage = useCallback((text: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "text", data: text }));
      return true;
    }
    return false;
  }, []);

  // Disconnect on unmount
  useEffect(() => {
    const handleSendImage = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { base64 } = customEvent.detail;
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "image", data: base64 }));
      }
    };

    const handleEmergencyStop = () => {
      console.warn("[useAvySession] Emergency stop event intercepted! Sending to WebSocket...");
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "emergency_stop" }));
      }
    };

    window.addEventListener("avy-send-image", handleSendImage);
    window.addEventListener("avy-emergency-stop", handleEmergencyStop);

    return () => {
      window.removeEventListener("avy-send-image", handleSendImage);
      window.removeEventListener("avy-emergency-stop", handleEmergencyStop);
      disconnect(null, true);
    };
  }, [disconnect]);

  return {
    ...state,
    connect: connectSession,
    disconnect,
    sendTextMessage,
    inputAnalyser: inputAnalyserRef,
    outputAnalyser: outputAnalyserRef,
    
    // Browser Controller exports
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
    updateActiveTabUrlAndTitle,
    setTheme
  };
}
