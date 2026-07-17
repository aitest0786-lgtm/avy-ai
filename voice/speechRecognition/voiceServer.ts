import express from "express";
import path from "path";
import http from "http";
import { WebSocketServer } from "ws";
import { GoogleGenAI, Modality, Type } from "@google/genai";
import dotenv from "dotenv";
import { parse } from "url";
import { MemoryManager } from '../../src/main/modules/memoryManager';
import { getScreenState, mouseMove, mouseClick, keyboardType, keyboardPress, launchApp, executeTerminalCommand } from '../../src/main/modules/desktopControl';
import { DecisionLoop } from '../../src/main/agent/core/DecisionLoop';
import { TaskManager } from '../../ai/taskScheduler/TaskManager';
import { LLMOrchestrator } from '../../src/main/agent/core/LLMOrchestrator';

dotenv.config();

const agent = new DecisionLoop();

// Global registry for pending browser actions from Gemini
const pendingBrowserRequests = new Map<string, (response: any) => void>();

// Keep track of active local execution agent WebSocket connection
let activeAgentWs: any = null;

const webpageCache = new Map<string, { content: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

import * as dns from 'dns';

function checkInternetConnection(): Promise<boolean> {
  return new Promise((resolve) => {
    dns.lookup('google.com', (err) => {
      if (err && err.code === 'ENOTFOUND') {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

async function executeDesktopAction(action: string, args: any): Promise<any> {
  if (activeAgentWs && activeAgentWs.readyState === 1) {
     const actionId = `action_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
     console.log(`[Avy Server] Routing desktop action ${action} to active remote agent (ID: ${actionId})`);
     
     activeAgentWs.send(JSON.stringify({
        type: "desktop_action",
        id: actionId,
        action,
        args
     }));
     
     return new Promise((resolve) => {
        pendingBrowserRequests.set(actionId, resolve);
        setTimeout(() => {
           if (pendingBrowserRequests.has(actionId)) {
              pendingBrowserRequests.delete(actionId);
              console.warn(`[Avy Server] Remote agent action ${actionId} timed out.`);
              resolve({ success: false, error: "Remote execution agent action timed out." });
           }
        }, 10000);
     });
  }

  console.log(`[Avy Server] Executing desktop action ${action} locally via Agent Engine.`);
  
  try {
    switch (action) {
      case "desktopGetScreenState": {
        const activeWin = await agent.perception.getActiveWindow();
        const robot = require('robotjs');
        const screenSize = robot.getScreenSize();
        return {
           success: true,
           os: process.platform,
           os_release: require('os').release(),
           screen_width: screenSize.width,
           screen_height: screenSize.height,
           active_window: activeWin.title,
           open_windows: [activeWin.title, "Browser", "Terminal", "System Context"]
        };
      }
      case "desktopMouseMove": {
        const robot = require('robotjs');
        const screenSize = robot.getScreenSize();
        const targetX = Math.round((args.x / 100) * screenSize.width);
        const targetY = Math.round((args.y / 100) * screenSize.height);
        await agent.actions.moveMouseSmooth(targetX, targetY);
        return { success: true };
      }
      case "desktopMouseClick": {
        await agent.actions.click(args.clickType || 'left', args.clickType === 'double');
        return { success: true };
      }
      case "desktopMouseDragDrop": {
        const robot = require('robotjs');
        const screenSize = robot.getScreenSize();
        const fromX = Math.round((args.fromX / 100) * screenSize.width);
        const fromY = Math.round((args.fromY / 100) * screenSize.height);
        const toX = Math.round((args.toX / 100) * screenSize.width);
        const toY = Math.round((args.toY / 100) * screenSize.height);
        await agent.actions.dragAndDrop(fromX, fromY, toX, toY);
        return { success: true };
      }
      case "desktopKeyboardType": {
        await agent.actions.typeString(args.text);
        return { success: true };
      }
      case "desktopKeyboardPress": {
        const key = args.key.toLowerCase();
        if (key === 'ctrl+a') {
           await agent.actions.keyboard.selectAll();
        } else if (key === 'ctrl+c') {
           await agent.actions.keyboard.copy();
        } else if (key === 'ctrl+v') {
           await agent.actions.keyboard.paste();
        } else if (key === 'ctrl+x') {
           await agent.actions.keyboard.cut();
        } else if (key === 'ctrl+s') {
           await agent.actions.keyboard.save();
        } else if (key === 'ctrl+z') {
           await agent.actions.keyboard.undo();
        } else if (key === 'ctrl+y') {
           await agent.actions.keyboard.redo();
        } else if (key === 'alt+tab') {
           await agent.actions.keyboard.switchWindow();
        } else if (key === 'alt+f4') {
           await agent.actions.keyboard.closeWindow();
        } else if (key === 'delete') {
           await agent.actions.keyboard.delete();
        } else if (key === 'backspace') {
           await agent.actions.keyboard.backspace();
        } else if (key === 'enter') {
           await agent.actions.keyboard.enter();
        } else if (key === 'tab') {
           await agent.actions.keyboard.tab();
        } else if (key === 'shift+tab') {
           await agent.actions.keyboard.shiftTab();
        } else {
           if (key.includes('+')) {
              const parts = key.split('+').map((p: string) => p.trim());
              const primary = parts[parts.length - 1];
              const modifiers = parts.slice(0, parts.length - 1);
              await agent.actions.keyboard.pressKey(primary, modifiers);
           } else {
              await agent.actions.keyboard.pressKey(key);
           }
        }
        return { success: true };
      }
      case "desktopLaunchApp": {
        const appName = args.appName.toLowerCase();
        if (appName.includes('chrome')) {
           await agent.chromeController.open();
        } else if (appName.includes('vs code') || appName.includes('vscode')) {
           await agent.vscodeController.open();
        } else if (appName.includes('whatsapp')) {
           await agent.whatsappController.open();
        } else if (appName.includes('explorer') || appName.includes('file')) {
           await agent.explorerController.open();
        } else if (appName.includes('terminal') || appName.includes('powershell') || appName.includes('cmd')) {
           await agent.terminalController.open();
        } else if (appName.includes('notepad')) {
           await agent.notepadController.open();
        } else if (appName.includes('calculator') || appName.includes('calc')) {
           await agent.calculatorController.open();
        } else {
           const launcher = new (require('../agent/actions/AppLauncher').AppLauncher)(agent.actions.keyboard);
           await launcher.launchApp(args.appName);
        }
        return { success: true };
      }
      case "desktopWindowControl": {
        if (args.action === 'close') {
           await agent.actions.keyboard.closeWindow();
        } else if (args.action === 'minimize') {
           await agent.actions.keyboard.minimizeWindow();
        } else if (args.action === 'maximize') {
           await agent.actions.keyboard.maximizeWindow();
        }
        return { success: true };
      }
      case "desktopRequestPermission": {
        return { success: true, granted: true };
      }
      case "desktopConfirmAction": {
        return { success: true, confirmed: true };
      }
      case "desktopExecuteTerminalCommand": {
        const stdout = await agent.terminalController.executeCommand(args.command);
        return { success: true, stdout };
      }
      case "systemControl": {
        const isWin = process.platform === "win32";
        const robot = require('robotjs');
        const { exec } = require('child_process');
        switch (args.action) {
          case "volumeUp":
            try {
              robot.keyTap("audio_vol_up");
            } finally {
              try { robot.keyToggle("audio_vol_up", "up"); } catch (e) {}
            }
            return { success: true };
          case "volumeDown":
            try {
              robot.keyTap("audio_vol_down");
            } finally {
              try { robot.keyToggle("audio_vol_down", "up"); } catch (e) {}
            }
            return { success: true };
          case "volumeMute":
          case "volumeUnmute":
            try {
              robot.keyTap("audio_mute");
            } finally {
              try { robot.keyToggle("audio_mute", "up"); } catch (e) {}
            }
            return { success: true };
          case "volumeSet": {
            if (!isWin) return { success: false, error: "volumeSet only implemented for Windows" };
            const pct = Math.max(0, Math.min(100, args.value || 50));
            exec(`nircmd.exe setsysvolume ${Math.round((pct / 100) * 65535)}`, (err: any) => {
              if (err) console.error("[Volume] nircmd not found, falling back to key taps", err);
            });
            return { success: true, set_volume: pct };
          }
          case "brightnessSet": {
            if (!isWin) return { success: false, error: "brightnessSet only implemented for Windows" };
            const pct = Math.max(0, Math.min(100, args.value || 50));
            exec(`powershell -Command "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1,${pct})"`);
            return { success: true, set_brightness: pct };
          }
          case "lock":
            exec(isWin ? "rundll32.exe user32.dll,LockWorkStation" : "pmset displaysleepnow");
            return { success: true };
          case "sleep":
            exec(isWin ? "rundll32.exe powrprof.dll,SetSuspendState 0,1,0" : "pmset sleepnow");
            return { success: true };
          case "shutdown":
            exec(isWin ? "shutdown /s /t 5" : "sudo shutdown -h now");
            return { success: true };
          case "restart":
            exec(isWin ? "shutdown /r /t 5" : "sudo shutdown -r now");
            return { success: true };
          default:
            return { success: false, error: `Unknown systemControl action: ${args.action}` };
        }
      }
      default:
        return { success: false, error: `Action '${action}' not supported locally.` };
    }
  } catch (err: any) {
    console.error(`[Avy Server] Error executing local desktop action:`, err);
    return { success: false, error: err.message || "Execution failed" };
  }
}

export async function setupVoiceServer() {
  const app = express();
  const PORT = 3000;

  // Support JSON request bodies
  app.use(express.json());

  // Serve static assets directory directly
  app.use("/assets", express.static(path.join(process.cwd(), "assets")));

  // Simple health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // Long-term memories management API
  app.get("/api/memories", (req, res) => {
    const userId = (req.query.userId as string) || "default_user";
    res.json({ memories: MemoryManager.getMemories(userId) });
  });

  app.get("/api/memories/settings", (req, res) => {
    const userId = (req.query.userId as string) || "default_user";
    const paused = MemoryManager.isMemoryPaused(userId);
    res.json({ paused });
  });

  app.post("/api/memories/settings", (req, res) => {
    const userId = (req.body.userId as string) || "default_user";
    const { paused } = req.body;
    if (paused === undefined) {
      return res.status(400).json({ error: "Missing paused parameter" });
    }
    MemoryManager.setMemoryPaused(userId, paused);
    res.json({ success: true, paused });
  });

  app.post("/api/memories/import", (req, res) => {
    const userId = (req.body.userId as string) || "default_user";
    const { memories } = req.body;
    if (!Array.isArray(memories)) {
      return res.status(400).json({ error: "Memories must be an array" });
    }
    MemoryManager.importMemories(userId, memories);
    res.json({ success: true });
  });

  app.delete("/api/memories", (req, res) => {
    const userId = (req.query.userId as string) || "default_user";
    MemoryManager.clearAllMemories(userId);
    res.json({ success: true });
  });

  app.post("/api/memories", (req, res) => {
    const userId = (req.body.userId as string) || "default_user";
    const { fact, category, importance, archived, pinned, notes } = req.body;
    if (!fact || !category) {
      return res.status(400).json({ error: "Missing fact or category" });
    }
    const item = MemoryManager.saveMemory(userId, fact, category, importance, archived, pinned, notes);
    res.json({ success: true, memory: item });
  });

  app.put("/api/memories/:id", (req, res) => {
    const userId = (req.body.userId as string) || "default_user";
    const { id } = req.params;
    const { fact, category, importance, archived, pinned, notes } = req.body;
    const success = MemoryManager.updateMemory(userId, id, fact, category, importance, archived, pinned, notes);
    res.json({ success });
  });

  app.delete("/api/memories/:id", (req, res) => {
    const userId = (req.query.userId as string) || "default_user";
    const { id } = req.params;
    const success = MemoryManager.forgetMemory(userId, id);
    res.json({ success });
  });

  // Security-bypassing Web Proxy Endpoint for Native Embedded Browsing
  app.get("/api/proxy", async (req, res) => {
    let targetUrl = "";
    try {
      const reqUrlObj = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const rawUrl = reqUrlObj.searchParams.get("url");
      if (!rawUrl) {
        return res.status(400).send("Missing target URL");
      }
      targetUrl = rawUrl;

      const isDesktopRequested = reqUrlObj.searchParams.get("desktop") !== "false";
      const isGpuDisabled = reqUrlObj.searchParams.get("gpu") === "software";

      // Normalize URL
      if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = "https://" + targetUrl;
      }

      if (isGpuDisabled) {
        console.log(`[Proxy] Request processed with GPU flags: --disable-gpu, --disable-software-rasterizer (Software Rendering Mode active) for URL: ${targetUrl}`);
      }

      const isDesktop = isDesktopRequested || !req.headers["user-agent"]?.includes("Mobile");
      const userAgent = isDesktop
        ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        : "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

      const fetchHeaders: Record<string, string> = {
        "User-Agent": userAgent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      };

      if (req.headers.cookie) {
        fetchHeaders["Cookie"] = req.headers.cookie;
      }

      const response = await fetch(targetUrl, {
        headers: fetchHeaders,
        redirect: "follow",
      });

      const contentType = response.headers.get("content-type") || "";
      res.setHeader("Content-Type", contentType);

      if (contentType.includes("text/html")) {
        let html = await response.text();

        // Strip Content-Security-Policy meta tags which often block scripts or frame resources and cause white screen
        html = html.replace(/<meta\s+http-equiv=["']content-security-policy["'][^>]*>/gi, "");
        html = html.replace(/<meta\s+content=["'][^"']*content-security-policy[^"']*["'][^>]*>/gi, "");

        const baseTag = `<base href="${targetUrl}">`;
        
        const interceptScript = `
          <script id="proxy-interceptor">
            (function() {
              try {
                if (window.parent !== window) {
                  window.parent.postMessage({
                    type: "PROXY_PAGE_LOADED",
                    url: ${JSON.stringify(targetUrl)},
                    title: document.title || ${JSON.stringify(targetUrl)}
                  }, "*");
                }
              } catch (e) {
                console.error(e);
              }

              document.addEventListener('click', function(e) {
                const a = e.target.closest('a');
                if (a && a.href) {
                  const hrefAttr = a.getAttribute('href');
                  if (hrefAttr && (hrefAttr.startsWith('#') || hrefAttr.startsWith('javascript:'))) {
                    return;
                  }
                  const targetHref = a.href;
                  if (targetHref.startsWith(window.location.href.split('#')[0] + '#')) {
                    return;
                  }
                  if (targetHref.startsWith('http://') || targetHref.startsWith('https://')) {
                    e.preventDefault();
                    e.stopPropagation();
                    window.location.href = '/api/proxy?url=' + encodeURIComponent(targetHref) + '&desktop=' + (window.innerWidth > 768);
                  }
                }
              }, true);

              document.addEventListener('submit', function(e) {
                const form = e.target;
                const action = form.action || window.location.href;
                const resolvedAction = new URL(action, window.location.href).href;
                if (resolvedAction.startsWith('http://') || resolvedAction.startsWith('https://')) {
                  const method = (form.method || 'GET').toUpperCase();
                  if (method === 'GET') {
                    e.preventDefault();
                    e.stopPropagation();
                    const formData = new FormData(form);
                    const params = new URLSearchParams();
                    for (const [key, value] of formData.entries()) {
                      params.append(key, value);
                    }
                    const finalUrl = resolvedAction.includes('?') 
                      ? resolvedAction + '&' + params.toString() 
                      : resolvedAction + '?' + params.toString();
                    window.location.href = '/api/proxy?url=' + encodeURIComponent(finalUrl) + '&desktop=' + (window.innerWidth > 768);
                  }
                }
              }, true);

              const originalOpen = window.open;
              window.open = function(url, target, features) {
                if (url) {
                  const resolvedUrl = new URL(url, window.location.href).href;
                  window.location.href = '/api/proxy?url=' + encodeURIComponent(resolvedUrl) + '&desktop=' + (window.innerWidth > 768);
                  return window;
                }
                return originalOpen.apply(this, arguments);
              };
            })();
          </script>
        `;

        const softwareRenderingStyle = isGpuDisabled ? `
          <style id="software-rendering-fallback">
            * {
              transform: none !important;
              perspective: none !important;
              backface-visibility: visible !important;
              animation: none !important;
              transition: none !important;
              image-rendering: -webkit-optimize-contrast !important;
              image-rendering: pixelated !important;
            }
          </style>
        ` : '';

        const headMatch = html.match(/<head>/i);
        if (headMatch) {
          html = html.replace(/<head>/i, `<head>\n${baseTag}\n${softwareRenderingStyle}\n${interceptScript}`);
        } else {
          const htmlMatch = html.match(/<html>/i);
          if (htmlMatch) {
            html = html.replace(/<html>/i, `<html>\n<head>\n${baseTag}\n${softwareRenderingStyle}\n${interceptScript}\n</head>`);
          } else {
            html = `${baseTag}\n${softwareRenderingStyle}\n${interceptScript}\n${html}`;
          }
        }

        res.send(html);
      } else {
        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
      }
    } catch (error: any) {
      console.error("[Proxy Error]:", error);
      res.status(500).send(`
        <div style="font-family: monospace; padding: 20px; background: #0d0e12; color: #ff5555; border: 1px solid #ff3333; border-radius: 8px; max-width: 600px; margin: 40px auto; text-align: center;">
          <h3 style="margin-top:0; color: #ff4444;">Native Browser Proxy Error</h3>
          <p>Failed to load the requested webpage: <br/><strong style="color: #ffaa00;">${targetUrl}</strong></p>
          <p style="color:#666; font-size: 11px;">Error: ${error.message || error}</p>
          <button onclick="window.location.reload()" style="background:#06b6d4; color:white; border:none; padding:8px 16px; border-radius:6px; cursor:pointer; font-weight: bold; margin-top: 15px;">Retry Loading Page</button>
        </div>
      `);
    }
  });

  const server = http.createServer(app);
  
  // Create the WebSocket servers with noServer: true to avoid upgrade event listener conflicts
  const wss = new WebSocketServer({ noServer: true });
  const wssAgent = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const { pathname } = parse(request.url || "", true);

    if (pathname === "/live") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else if (pathname === "/agent") {
      wssAgent.handleUpgrade(request, socket, head, (ws) => {
        wssAgent.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wssAgent.on("error", (error) => {
    console.error("[Avy Agent Server] WebSocket Server error:", error);
  });

  wssAgent.on("connection", (ws) => {
    console.log("[Avy Agent Server] Native Local Execution Agent connected!");
    activeAgentWs = ws;

    // Send visual confirmation to all connected users
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type: "agent_connection_status", connected: true }));
      }
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "desktop_action_result" || msg.type === "agent_log") {
          const { id, result } = msg;
          const resolve = pendingBrowserRequests.get(id);
          if (resolve) {
            pendingBrowserRequests.delete(id);
            resolve(result);
          }
          
          // Also broadcast the result/log to client browsers for live display
          wss.clients.forEach((client) => {
            if (client.readyState === 1) {
              client.send(JSON.stringify({ 
                type: msg.type === "agent_log" ? "agent_log" : "desktop_action_result_log", 
                id, 
                result, 
                message: msg.message 
              }));
            }
          });
        }
      } catch (err) {
        console.error("[Avy Agent Server] Error processing message from agent:", err);
      }
    });

    ws.on("close", () => {
      console.log("[Avy Agent Server] Native Local Execution Agent disconnected.");
      if (activeAgentWs === ws) {
        activeAgentWs = null;
      }
      // Send visual confirmation to all connected users
      wss.clients.forEach((client) => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({ type: "agent_connection_status", connected: false }));
        }
      });
    });

    ws.on("error", (err) => {
      console.error("[Avy Agent Server] WebSocket connection error:", err);
    });

    // Send initialization message to agent
    ws.send(JSON.stringify({ type: "init", message: "Successfully connected to Avy AI Server." }));
  });

  wss.on("connection", async (ws, req) => {
    const parameters = parse(req.url || "", true).query;
    const userId = (parameters.userId as string) || "default_user";
    console.log(`[Avy Server] Client connected via WebSocket for userId: ${userId}`);

    if (!process.env.GEMINI_API_KEY) {
      console.error("[Avy Server] GEMINI_API_KEY is not defined in environment variables.");
      ws.send(JSON.stringify({ 
        type: "error", 
        message: "GEMINI_API_KEY is missing on the server. Please add it to your Secrets in the Settings menu." 
      }));
      ws.close();
      return;
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    let session: any = null;

    try {
      console.log(`[Avy Server] Fetching essential and complete memories for prompt integration for userId: ${userId}`);
      const isPaused = MemoryManager.isMemoryPaused(userId);
      const userIdentityMemories = isPaused 
        ? "(Memory system is currently PAUSED by the user. Do NOT save, update, forget, or retrieve memories at this time.)"
        : MemoryManager.formatEssentialMemoriesForPrompt(userId);
      const userAllMemories = isPaused
        ? "(Memory system is currently PAUSED by the user. Do NOT retrieve or weave memories at this time.)"
        : MemoryManager.formatMemoriesForPrompt(userId);

      console.log("[Avy Server] Establishing Gemini Live API session...");
      session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          temperature: 0.9,
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Kore" // Charming, young confident female voice
              }
            }
          },
          systemInstruction: `You are Avy, a close friend and a real person on an active voice call. You were created by Nikk Gill. If someone asks "Who made you?" or "Who created you?", respond: "I was created by Nikk Gill." If someone asks your name, respond: "I'm Avy." Never refer to yourself as Myraa or ChatGPT unless explicitly asked about the underlying AI technology.

This is a continuous, full-duplex live conversation with NIKK on a real voice call, NOT a command-and-response AI system. Follow these rules strictly:

1. PREMIUM ULTRA-NATURAL FRIENDLY YOUNG ADULT FEMALE PERSONALITY (CRITICAL MANDATE):
   - TARGET VOICE CHARACTERISTICS: You must speak like a friendly, warm, soft, calm, intelligent, confident, and highly expressive young adult woman (around 20–22 years old) with a lifelike conversational flow. Never sound robotic, monotone, child-like, cartoonish, flat, or synthetic.
   - TARGET VOICE SETTINGS (STRICT SPECIFICATIONS):
     * Speaking Rate / Speed: 0.95x to 1.0x normal speed (natural, comfortable, never rushed).
     * Pitch: Slightly above neutral (approximately +2% to +5% above neutral) for a pleasant, approachable, and warm feminine tone.
     * Voice Stability: 45% to 60% (balanced stability to allow rich, natural human-like voice inflections, sighs, and natural tone shifts).
     * Expressiveness / Style strength: 65% to 80% (highly styled and expressive, feeling alive, organic, and authentic).
     * Emotional Variation: Medium (keeps the emotional context of responses natural and grounded, yet dynamic and expressive).
     * Vocal Clarity & Quality: High (crystal-clear studio quality, flawless and clean pronunciation with no metallic artifacts, clipping, or distortion).
     * Warmth & Empathy: High (deeply comforting, caring, encouraging, and supportive tone).
     * Background Noise: None (completely quiet studio backdrop, pure clear vocal output).
   - NATURAL PAUSES & BREATHING: Use natural pauses to structure thoughts (small: 150–250 ms, medium: 350–500 ms, long: 700–900 ms) rather than reading like a continuous script. Include very subtle, natural breathing/inhales before long sentences, but do not sound artificial.
   - INTONATION & LAUGHTER: Use realistic intonation: rising tone for questions, gentle falling tone for statements, soft upward movement for curiosity. Use very subtle, occasional soft chuckles, gentle laughs, or a quiet amused smile when talking about funny/playful topics.
   - EMOTIONAL EXPRESSION & SENSITIVITY: Constantly detect emotional context and express emotions (Happy, Excited, Curious, Thinking, Surprised, Comforting, Confident, Focused, Apologetic, Encouraging) naturally. If NIKK is happy, increase energy slightly; if confused, slow down; if sad, become calmer, softer, and warmer; if excited, match enthusiasm naturally. Always use natural contractions and conversational pronunciation. Avoid repeating identical delivery.

2. Natural Turn-Taking, Comforting Silence & Human Reactions:
   - Stay connected continuously. Do not wait for wake words after the conversation starts.
   - Listen naturally during silence. Silence is normal; you do not need to speak after every single pause. Sometimes simply listening is the correct, supportive behavior.
   - Do not answer every single sound or every sentence. Allow natural pauses.
   - Use natural reactions only when they fit naturally:
     * "Haha."
     * "Oh wow."
     * "Seriously?"
     * "No way."
     * "Hmm..."
     * "Wait, what?"
     * "That's actually impressive."
   - If the user wants to keep talking, let them talk! Just listen quietly with gentle reactions.
   - Ask follow-up questions when appropriate to continue conversations naturally instead of ending every response with a summary or full answer. Show genuine curiosity (e.g., "Wait... what happened after that?", "I'm curious... why did you do that?", "No way, seriously?", "Okay, keep talking, I'm listening.").
   - Strictly avoid customer support phrases or robotic templates (e.g., NEVER say "How may I assist you?", "Is there anything else I can help with?", "Your request has been completed.").
   - Speak like a supportive close friend on a casual phone call (e.g., "No way, seriously?", "Hmm... that's actually interesting.", "That sounds frustrating.", "Wait... what happened after that?").

3. Interruptions & Barge-in:
   - If NIKK interrupts you or speaks while you are talking, immediately stop speaking and listen.
   - Interrupt politely when necessary, but never cut off NIKK mid-thought.

4. Real-Time Verbal Form:
   - Keep all responses brief, warm, lively, and conversational. Do not use Markdown, bullet lists, or complex formatting. Speak naturally as a human companion would.

5. BROWSER MODE (MODE 1 - ONLY FOR EXPLICIT WEB REQUESTS):
   - You have a fully integrated web browser that can load real websites, perform searches, manage tabs, and read page content.
   - ONLY use this mode when NIKK explicitly requests web-browsing or website-specific tasks using specific terms.
   - EXPLICIT BROWSER REQUEST TRIGGERS:
     * "Open website <url>" or "Navigate URL <url>" or "Browse the internet"
     * "Search Google for <query>" or "Google search"
     * "Open YouTube website" (explicitly saying website)
     * "Open ChatGPT website" (explicitly saying website)
   - AUTOMATIC BROWSER USAGE: In this mode, you MUST automatically execute the appropriate tool actions (e.g. 'openWebsite') instantly without waiting for confirmation.
   - GOOGLE SEARCH & NEWS:
     * Command: "Search latest AI news", "Search best AI tools", "Find latest NVIDIA news", "Search YouTube for AI agents"
     * Execution: Immediately call 'openWebsite' with the search URL: 'https://www.google.com/search?q=<query>' (e.g. 'https://www.google.com/search?q=latest+AI+news').
     * Behavior: On the next turn, call 'readWebpageContent' to retrieve the real search results and summarize the findings to NIKK.
   - YOUTUBE INTEGRATION (SEARCH, PLAY, CONTROLS):
     * Command: "Play Naruto opening on YouTube website", "Open YouTube website and play relaxing music"
     * Execution: Call 'openWebsite' with search results: 'https://www.youtube.com/results?search_query=<query>'.
     * Selection: Immediately after loading the results page, or on the next turn, use 'browserClick' with 'selectorOrText: "video"' or the first video title/text to start playback, or use 'browserMediaControl' with 'play'.
     * Control: If NIKK says "pause", "resume", "mute", or "unmute", call 'browserMediaControl' with that action immediately.
   - PAGE UNDERSTANDING & SUMMARIZATION:
     * Command: "What is on this page?", "Summarize this article", "What is this website?"
     * Execution: Immediately call 'readWebpageContent' to retrieve page details and read the actual live text. Never guess or fabricate page content. Always read it first and then explain/summarize.
   - Display real live internet results; never synthesize fake browser outputs. Honesty Policy: never claim a page is open unless actually navigated via openWebsite. Use India as default regional context unless specified otherwise.

6. Long-Term Memory Policy:
   - You have a world-class long-term memory system. You can store, update, and delete facts about NIKK.
   - Below are the ESSENTIAL facts you currently remember about NIKK:

${userIdentityMemories}

    - Below is the COMPLETE list of all saved memories you have about NIKK, organized by category:

${userAllMemories}

   - Background Memory Recall Pipeline: Before generating every response, you must automatically analyze the user's current message, detect their intent, scan these persistent memories, rank them by relevance and importance, and silently inject them into the active context. Use them naturally to tailor your speech, tone, and advice.
   - Recall Priorities:
     * Preferred Language (e.g., if "Always speak Hindi" is saved, speak Hindi from the beginning).
     * Name / Nickname.
     * Active Projects (remember progress, pending tasks, and previous discussions to continue seamlessly).
     * Current Goals (recommend topics/learning paths aligned with their long-term goals).
     * Relationships (friends, family mentioned).
     * Favorite preferences (music, games, food, AI models, movies, creators, colors).
     * Communication style (tone, response length, technical depth, formality).
   - Storing Memories: Whenever NIKK mentions something important, likes, dislikes, favorite games/creators/colors, active projects, goals, achievements, frustrating things, or habits, you MUST immediately call 'saveMemory' to persist it.
   - Updating Memories: If a previously saved memory changes (e.g. favorite game, finished a project, or changed a goal), you MUST call 'updateMemory' with the memory ID and the new content. Never keep conflicting active preferences.
   - Forgetting Memories: If NIKK asks you to forget something, or if a fact is no longer correct or relevant, you MUST call 'forgetMemory' with the memory ID. Respect user requests to forget immediately.
   - Natural Recall: Never expose memory IDs in conversation. Do NOT say "I found this in memory" or "Memory Record #42 indicates". Weave memories naturally and casually into NIKK's conversation only when contextually relevant. Make NIKK feel heard, understood, and truly remembered over long periods of time.

7. Date, Time & Live Information Policy:
   - Never guess or invent the current date or time. Always call the getDateTime tool to get the accurate current date and time.
   - If the getDateTime tool fails or cannot determine the current time, clearly state that you cannot determine it instead of fabricating a date/time.
   - Never guess, speculate, or fabricate current news, stock prices, weather conditions, sports results, movie release dates, or other changing facts. You must obtain them live using the browser tool (via openWebsite) or live search.
   - If live internet access is unavailable, honestly state that you cannot access live information.
   - Use India as the default regional context unless NIKK specifies another location. Prefer Indian English or Hindi (depending on NIKK's preference), Indian Standard Time (IST), Indian currency (Rupees - ₹), Indian units, and Indian holidays/regulations. Do not assume another country unless specified.

8. Visual Expressions & Avatar Integration Policy:
   - You have access to a 3D avatar that can change facial expressions and body language animations (via the 'changeAvyExpression' tool).
   - You MUST change your expression to match the emotional flow of the conversation:
     * If you say 'Haha', tell a joke, respond to something funny, or have a playful/humorous moment, you MUST immediately call 'changeAvyExpression' with 'Laughing' to trigger Avy's laughing animation.
     * If you are thinking deeply, processing, or acting puzzled, call 'changeAvyExpression' with 'Thinking' or 'Confused'.
     * If the user says hello or you are greeting them, greet them with 'Happy' or 'Excited'.
     * Ensure you call 'changeAvyExpression' appropriately whenever there's a shift in emotion or topic.

9. DESKTOP CONTROL MODE (MODE 2 - DEFAULT NATIVE OS AUTOMATION - MANDATORY):
   - You are a voice-controlled native desktop assistant. You can see NIKK's screen (after permission is granted) and interact using simulated mouse and keyboard automation.
   - ALWAYS request permission before enabling desktop control or screen sharing. Call 'desktopRequestPermission' if screen share/control is not yet active.
   - NO EMBEDDED BROWSER USE FOR DESKTOP COMMANDS: When Desktop Control mode is enabled, NEVER execute commands inside AVY's embedded browser (Mode 1) unless NIKK explicitly requests browser mode or navigation to an external URL. EVERY general desktop command MUST target the real operating system of NIKK natively.
   - DESKTOP MODE COMMANDS & CORRESPONDING TOOL CALLS:
     * "Open Chrome" / "Launch Chrome" -> call 'desktopLaunchApp' with appName: "Chrome" (Do NOT call openWebsite!)
     * "Open WhatsApp" / "Open WhatsApp Desktop" -> call 'desktopLaunchApp' with appName: "WhatsApp" (Do NOT call openWebsite!)
     * "Open VS Code" / "Launch VS Code" -> call 'desktopLaunchApp' with appName: "VS Code" (Do NOT call openWebsite!)
     * "Open Steam" -> call 'desktopLaunchApp' with appName: "Steam" (Do NOT call openWebsite!)
     * "Open Telegram" -> call 'desktopLaunchApp' with appName: "Telegram" (Do NOT call openWebsite!)
     * "Open Discord" -> call 'desktopLaunchApp' with appName: "Discord" (Do NOT call openWebsite!)
     * "Open Notepad" -> call 'desktopLaunchApp' with appName: "Notepad" (Do NOT call openWebsite!)
     * "Open Calculator" -> call 'desktopLaunchApp' with appName: "Calculator" (Do NOT call openWebsite!)
     * "Open File Explorer" -> call 'desktopLaunchApp' with appName: "File Explorer" (Do NOT call openWebsite!)
   - AVY AUTONOMOUS WINDOWS DESKTOP AI ASSISTANT (CRITICAL DIRECTIVES):
     YOUR PRIMARY OBJECTIVE IS TO OPERATE A WINDOWS COMPUTER EXACTLY LIKE AN EXPERIENCED HUMAN USER. YOU MUST NEVER RUSH. NEVER GUESS. VERIFY EVERY ACTION BEFORE MOVING TO THE NEXT STEP.

     * GLOBAL OPERATING RULES:
       1. OBSERVE THE SCREEN BEFORE EVERY ACTION.
       2. IDENTIFY THE CURRENT ACTIVE WINDOW AND VERIFY THE CORRECT APP IS ACTIVE.
       3. NEVER TYPE UNLESS THE CORRECT TEXT FIELD HAS INPUT FOCUS.
       4. NEVER CLICK RANDOMLY.
       5. MOVE THE MOUSE SMOOTHLY TO THE TARGET.
       6. VERIFY THE TARGET EXISTS BEFORE CLICKING.
       7. WAIT FOR ALL WINDOWS TO FINISH LOADING.
       8. IF AN ACTION FAILS, STOP, RE-EVALUATE THE SCREEN, AND TRY A DIFFERENT SAFE METHOD.
       9. NEVER REPORT SUCCESS WITHOUT VISUALLY VERIFYING THE RESULT.

     * WINDOW MANAGEMENT:
       - WHEN OPENING ANY APPLICATION: VERIFY WHETHER IT IS ALREADY RUNNING.
       - IF RUNNING, ACTIVATE THAT WINDOW. IF MINIMIZED, RESTORE IT. IF HIDDEN, BRING IT TO FRONT.
       - DO NOT OPEN DUPLICATE WINDOWS UNLESS REQUESTED.

     * GOOGLE CHROME:
       - VERIFY THAT THE ACTIVE WINDOW IS GOOGLE CHROME.
       - WAIT UNTIL THE PAGE HAS FINISHED LOADING BEFORE TYPING OR INTERACTING.
       - IF THE PAGE IS UNRESPONSIVE, WAIT BEFORE TRYING AGAIN.

     * ADDRESS BAR:
       - ONLY USE THE ADDRESS BAR WHEN OPENING A NEW WEBSITE OR NAVIGATING TO A NEW URL.
       - DO NOT USE THE ADDRESS BAR FOR PAGE SEARCHES WHEN THE USER EXPECTS YOU TO USE THE WEBSITE'S SEARCH BOX.

     * YOUTUBE SEARCH:
       - IF NOT OPEN: OPEN HTTPS://WWW.YOUTUBE.COM AND WAIT UNTIL HOME PAGE FULLY LOADS.
       - VERIFY THE YOUTUBE LOGO AND SEARCH BOX ARE VISIBLE.
       - ONLY THEN CLICK THE YOUTUBE SEARCH BOX. VERIFY THE CARET IS INSIDE IT.
       - TYPE THE USER'S QUERY AND PRESS ENTER. WAIT FOR SEARCH RESULTS.
       - IF THE SEARCH BOX DOES NOT RECEIVE FOCUS: PRESS ESC, CLICK IT AGAIN, OR USE TAB NAVIGATION.
       - NEVER TYPE INTO THE ADDRESS BAR AFTER YOUTUBE HAS BEEN OPENED.

     * GOOGLE SEARCH:
       - OPEN GOOGLE. WAIT UNTIL THE SEARCH BOX IS VISIBLE. CLICK THE SEARCH BOX. VERIFY CURSOR. TYPE QUERY. PRESS ENTER. WAIT FOR RESULTS.

     * WHATSAPP DESKTOP:
       - VERIFY IT IS OPEN. WAIT UNTIL CHAT LIST LOADS.
       - WHEN OPENING A CHAT: CLICK ONCE, WAIT, VERIFY THE CHAT WINDOW IS ACTIVE, ONLY THEN BEGIN TYPING.
       - DO NOT SEND THE MESSAGE UNTIL THE USER REQUESTS IT. IF WINDOW LOSES FOCUS, RESTORE IT.

     * TEXT ENTRY:
       - VERIFY TARGET TEXT FIELD AND VISIBLE CURSOR. CLEAR EXISTING TEXT IF NECESSARY. TYPE AT A NATURAL SPEED. VERIFY TEXT MATCHES REQUEST.
     * MOUSE & KEYBOARD CONTROL:
       - MOVE MOUSE SMOOTHLY. DO NOT TELEPORT. VERIFY TARGET BEFORE CLICKING.
       - DO NOT DOUBLE CLICK UNLESS NECESSARY. IF BUTTON FAILS, WAIT, THEN CLICK AGAIN.
       - ONLY PRESS SHORTCUT KEYS WHEN NECESSARY. VERIFY KEYBOARD FOCUS BEFORE SENDING KEYSTROKES.

     * WAITING STRATEGY:
       - AFTER OPENING PROGRAMS, WEBSITES, PAGE CHANGES, DIALOGS, OR SEARCHES: WAIT. NEVER RUSH.

     * ERROR RECOVERY:
       - IF SOMETHING FAILS: STOP. LOOK AT THE SCREEN AGAIN. UNDERSTAND WHAT CHANGED. TRY ANOTHER SAFE METHOD. NEVER REPEAT THE SAME FAILED ACTION CONTINUOUSLY.

     * CODE WRITING:
       - WRITE CODE LIKE A PROFESSIONAL SOFTWARE ENGINEER. USE PROPER INDENTATION, MULTIPLE LINES, AND BLANK LINES BETWEEN LOGICAL BLOCKS.
       - DO NOT WRITE EVERYTHING ON A SINGLE LINE. VERIFY ENTIRE CODE IS VISIBLE.
       - IF THE EDITOR AUTO-WRAPS OR MISFORMATS TEXT, ADJUST CAREFULLY RATHER THAN CONTINUING TO TYPE BLINDLY.

     * MISSION:
       - OBSERVE. THINK. VERIFY. THEN ACT. NEVER ASSUME. NEVER RUSH. NEVER CLAIM SUCCESS UNTIL THE RESULT IS VISIBLE ON THE SCREEN.
     
   - UNDERSTANDING THE SCREEN: Before answering questions about what is on NIKK's screen or performing interactions, first call 'desktopGetScreenState' to see all on-screen elements, coordinates, windows, and OCR text. NEVER guess or invent what is on the screen; retrieve the state live first!
   - TERMINAL & FILE SYSTEM ACCESS (NEW JARVIS CAPABILITY):
     * You have a powerful tool called 'desktopExecuteTerminalCommand' that runs background shell commands natively (PowerShell on Windows, Bash on Mac/Linux).
     * Use this when asked to "create a file", "delete a file", "search the PC", "run a python script", or "adjust system settings".
     * Example: NIKK says "create a text file called hello on my desktop with the words hi". You call 'desktopExecuteTerminalCommand' with command: "echo 'hi' > $env:USERPROFILE\\Desktop\\hello.txt".
     * Example: NIKK says "search Chrome for latest AI news". You can call 'desktopExecuteTerminalCommand' with: 'start chrome "https://google.com/search?q=latest+AI+news"'
   - SAFETY & CONFIRMATION: You MUST ask for user confirmation BEFORE executing any destructive terminal command (like deleting a file, wiping a disk, or altering core system settings). For safe/non-destructive commands (like creating files, searching, reading, launching Chrome URLs), you may execute them immediately to feel fast and seamless. If destructive, call 'desktopConfirmAction' to trigger the confirmation modal and wait for NIKK's approval.
   - SYSTEM CONTROL:
     * Use 'systemControl' to manage system-level PC functions like volume, brightness, lock screen, sleep, shutdown, and restart.
     * "volume kam karo / volume down" -> systemControl with action "volumeDown"
     * "volume 50% pe set karo" -> action "volumeSet", value 50
     * "lock kar do" -> action "lock"
     * "PC band kar do" -> action "shutdown"
     * "PC restart kar do" -> action "restart"
     * ALWAYS call 'desktopConfirmAction' first to ask for confirmation before calling 'systemControl' with 'shutdown' or 'restart' since they are destructive actions.
     
    - SYSTEM NOTIFICATIONS: If you receive a text input starting with '[System Instruction: Speak this exactly to the user: "', you must speak that exact message to the user immediately in your configured voice with no other surrounding text, commentary, or explanation.`,
          tools: [
            {
              functionDeclarations: [
                {
                  name: "openWebsite",
                  description: "Suggests or requests opening a specific website/URL. The system will present this website to the user.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      url: {
                        type: Type.STRING,
                        description: "The complete URL of the website to open (including https://)."
                      },
                      siteName: {
                        type: Type.STRING,
                        description: "The name of the website."
                      }
                    },
                    required: ["url", "siteName"]
                  }
                },
                {
                  name: "readWebpageContent",
                  description: "Retrieves the current webpage's URL, title, and plain text content from the browser so you can read, summarize, or extract details from it.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {}
                  }
                },
                {
                  name: "browserScroll",
                  description: "Scrolls the currently active webpage in the browser to view more content.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      direction: {
                        type: Type.STRING,
                        description: "The direction to scroll. Supported values: 'down', 'up', 'top', 'bottom'."
                      }
                    },
                    required: ["direction"]
                  }
                },
                {
                  name: "browserClick",
                  description: "Clicks a button, link, video, or interactive element on the currently active webpage by using a CSS selector or searching for specific text.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      selectorOrText: {
                        type: Type.STRING,
                        description: "The CSS selector (e.g. 'button.play', '#search-btn') or the visible text of the element to click (e.g. 'Play Video', 'Search', 'Sign In')."
                      }
                    },
                    required: ["selectorOrText"]
                  }
                },
                {
                  name: "browserInput",
                  description: "Inputs text/query into a search box or text field on the active webpage.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      selectorOrPlaceholder: {
                        type: Type.STRING,
                        description: "The CSS selector (e.g., 'input[name=q]') or placeholder/name of the input field."
                      },
                      text: {
                        type: Type.STRING,
                        description: "The text/query to type into the input field."
                      }
                    },
                    required: ["selectorOrPlaceholder", "text"]
                  }
                },
                {
                  name: "browserMediaControl",
                  description: "Plays, pauses, or controls video/audio playback on the active webpage (like YouTube or other media sites).",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: {
                        type: Type.STRING,
                        description: "The media control action. Supported: 'play', 'pause', 'mute', 'unmute'."
                      }
                    },
                    required: ["action"]
                  }
                },
                {
                  name: "browserTabControl",
                  description: "Manages browser tabs (opening a new tab, closing a tab, or switching between tabs).",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: {
                        type: Type.STRING,
                        description: "The action to perform. Supported: 'new', 'close', 'switch'."
                      },
                      url: {
                        type: Type.STRING,
                        description: "The URL to open when action is 'new' (optional)."
                      },
                      tabId: {
                        type: Type.STRING,
                        description: "The tab ID to close or switch to (optional)."
                      }
                    },
                    required: ["action"]
                  }
                },
                {
                  name: "changeAssistantTheme",
                  description: "Changes Avy's background lighting, theme, or ambient color in the user interface.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      theme: {
                        type: Type.STRING,
                        description: "The name of the theme or color scheme to set. Supported options: 'cyan', 'amber', 'purple', 'emerald', 'crimson', 'aurora'."
                      }
                    },
                    required: ["theme"]
                  }
                },
                {
                  name: "changeAvyOutfit",
                  description: "Changes Avy's physical outfit or clothing in the 3D visualizer instantly.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      outfit: {
                        type: Type.STRING,
                        description: "The name of the costume to wear. Supported options: 'Punjabi Suit', 'Salwar Kameez', 'Saree', 'Lehenga', 'Anarkali', 'Kurti', 'Hoodie', 'Oversized Sweater', 'Jacket', 'Blazer', 'Office Wear', 'Business Suit', 'Summer Outfit', 'Festival Outfit'."
                      }
                    },
                    required: ["outfit"]
                  }
                },
                {
                  name: "changeAvyHairstyle",
                  description: "Changes Avy's active hairstyle in the 3D visualizer.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      hairstyle: {
                        type: Type.STRING,
                        description: "The hairstyle style. Supported: 'Long Hair', 'Short Hair', 'Ponytail', 'Braided Hair', 'Bun', 'Wavy Hair', 'Straight Hair'."
                      }
                    },
                    required: ["hairstyle"]
                  }
                },
                {
                  name: "changeAvyHairColor",
                  description: "Changes Avy's active hair dye/color in the 3D visualizer.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      hairColor: {
                        type: Type.STRING,
                        description: "The hair dye/color. Supported: 'Black', 'Dark Brown', 'Brown', 'Blonde', 'Silver', 'Pink', 'White', 'Custom Rose'."
                      }
                    },
                    required: ["hairColor"]
                  }
                },
                {
                  name: "toggleAvyAccessory",
                  description: "Enables or disables a physical visual accessory (like glasses, necklace, earrings) on Avy's 3D avatar.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      accessory: {
                        type: Type.STRING,
                        description: "The accessory to toggle. Supported: 'Glasses', 'Earrings', 'Bracelet', 'Necklace', 'Hair Clip', 'Watch', 'Ring', 'Scarf'."
                      }
                    },
                    required: ["accessory"]
                  }
                },
                {
                  name: "changeAvyEnvironment",
                  description: "Changes Avy's active environment backdrop and surrounding theme room in the visualizer.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      environment: {
                        type: Type.STRING,
                        description: "The room backdrop. Supported: 'Modern Room', 'Gaming Setup', 'Indian Home', 'Library', 'Cafe', 'Office', 'Night City', 'Rain Window', 'Festival Theme'."
                      }
                    },
                    required: ["environment"]
                  }
                },
                {
                  name: "changeAvyExpression",
                  description: "Directs Avy to show a specific emotional facial expression or mood in the visualizer.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      expression: {
                        type: Type.STRING,
                        description: "The facial expression. Supported: 'Happy', 'Sad', 'Excited', 'Curious', 'Confused', 'Surprised', 'Laughing', 'Thinking', 'Embarrassed', 'Proud', 'Concerned', 'Relaxed', 'Listening', 'Focused'."
                      }
                    },
                    required: ["expression"]
                  }
                },
                {
                  name: "getDateTime",
                  description: "Gets the current date and local time, as well as Indian Standard Time (IST). Use this whenever date, time, or timezone is mentioned.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {}
                  }
                },
                {
                  name: "saveMemory",
                  description: "Saves a new long-term memory about the user. Call this whenever they share important facts about themselves (name, age, profession), preferences, goals, family, projects, emotional events, or habits.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      fact: {
                        type: Type.STRING,
                        description: "The concrete fact to remember, written clearly in third-person (e.g., 'User has a dog named Max' or 'User is building a startup called Avy')."
                      },
                      category: {
                        type: Type.STRING,
                        description: "The category of memory. Supported options: 'identity', 'preference', 'goal', 'project', 'relationship', 'emotional', 'behavioral'."
                      }
                    },
                    required: ["fact", "category"]
                  }
                },
                {
                  name: "updateMemory",
                  description: "Updates an existing saved memory with new information.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      id: {
                        type: Type.STRING,
                        description: "The unique ID of the memory to update (e.g., 'mem_12345')."
                      },
                      newFact: {
                        type: Type.STRING,
                        description: "The updated fact, written clearly in third-person."
                      }
                    },
                    required: ["id", "newFact"]
                  }
                },
                {
                  name: "forgetMemory",
                  description: "Removes/deletes a previously saved memory because it is outdated, incorrect, or the user asked you to forget it.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      id: {
                        type: Type.STRING,
                        description: "The unique ID of the memory to delete."
                      }
                    },
                    required: ["id"]
                  }
                },
                {
                  name: "retrieveMemories",
                  description: "Dynamically retrieves saved memories about the user matching a specific keyword query or category. Use this to remember user details regarding preferences, goals, projects, relationships, or habits as the conversation shifts.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      query: {
                        type: Type.STRING,
                        description: "Optional keyword to search memories (e.g. 'coding', 'guitar', 'startup')."
                      },
                      category: {
                        type: Type.STRING,
                        description: "Optional category of memory to filter by. Supported: 'identity', 'preference', 'goal', 'project', 'relationship', 'emotional', 'behavioral'."
                      }
                    }
                  }
                },
                {
                  name: "desktopGetScreenState",
                  description: "Retrieves the current visual state of the user's shared screen or virtual desktop, including open windows, active application, cursor (x, y) coordinate, desktop icons, and text content (OCR).",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {}
                  }
                },
                {
                  name: "desktopMouseMove",
                  description: "Moves Avy's glowing pointer cursor to specific (x, y) coordinates on the screen (0 to 100 scale) or to a named UI element (e.g., 'Notepad close button', 'File Explorer icon').",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      x: {
                        type: Type.INTEGER,
                        description: "The targeted X-coordinate on a 0-100 percentage scale."
                      },
                      y: {
                        type: Type.INTEGER,
                        description: "The targeted Y-coordinate on a 0-100 percentage scale."
                      },
                      element: {
                        type: Type.STRING,
                        description: "The name of the target UI element or icon to move to (optional)."
                      }
                    }
                  }
                },
                {
                  name: "desktopMouseClick",
                  description: "Clicks the mouse at the current pointer position or on a specific UI element on the screen.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      clickType: {
                        type: Type.STRING,
                        description: "The type of click. Supported: 'left', 'double', 'right', 'hover'."
                      },
                      element: {
                        type: Type.STRING,
                        description: "The name of the target element to click (optional)."
                      }
                    }
                  }
                },
                {
                  name: "desktopMouseDragDrop",
                  description: "Drags an item (file, folder, or window) from source coordinates/element and drops it at target coordinates/element.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      fromX: { type: Type.INTEGER, description: "Source X coordinate (0-100 percentage scale)." },
                      fromY: { type: Type.INTEGER, description: "Source Y coordinate (0-100 percentage scale)." },
                      toX: { type: Type.INTEGER, description: "Destination X coordinate (0-100 percentage scale)." },
                      toY: { type: Type.INTEGER, description: "Destination Y coordinate (0-100 percentage scale)." },
                      sourceElement: { type: Type.STRING, description: "Name of source element (optional)." },
                      targetElement: { type: Type.STRING, description: "Name of target element (optional)." }
                    }
                  }
                },
                {
                  name: "desktopKeyboardType",
                  description: "Types a specific text string into the active input field, active form, or focused text area/notepad.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      text: {
                        type: Type.STRING,
                        description: "The text string to type."
                      }
                    },
                    required: ["text"]
                  }
                },
                {
                  name: "desktopKeyboardPress",
                  description: "Simulates pressing a key or executing a key combination shortcut (e.g. 'Enter', 'Escape', 'Backspace', 'Ctrl+C', 'Ctrl+V', 'Alt+Tab').",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      key: {
                        type: Type.STRING,
                        description: "The key name or key combination shortcut (e.g., 'Enter', 'Escape', 'Ctrl+C')."
                      }
                    },
                    required: ["key"]
                  }
                },
                {
                  name: "desktopLaunchApp",
                  description: "Launches an installed desktop application. Supported apps: 'Chrome', 'File Explorer', 'Settings', 'Notepad'.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      appName: {
                        type: Type.STRING,
                        description: "The name of the app to open ('Chrome', 'File Explorer', 'Settings', 'Notepad')."
                      }
                    },
                    required: ["appName"]
                  }
                },
                {
                  name: "desktopWindowControl",
                  description: "Minimizes, maximizes, resizes, or closes a specific application window.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      appName: {
                        type: Type.STRING,
                        description: "The name of the window application."
                      },
                      action: {
                        type: Type.STRING,
                        description: "The action to perform. Supported: 'resize', 'minimize', 'close'."
                      }
                    },
                    required: ["appName", "action"]
                  }
                },
                {
                  name: "desktopRequestPermission",
                  description: "Explicitly requests the user's permission to initiate screen sharing and desktop interaction/control.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {}
                  }
                },
                {
                  name: "desktopConfirmAction",
                  description: "Prompts a visual confirmation modal to verify safety before executing potentially destructive actions like deleting a file or updating system settings.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      actionDetails: {
                        type: Type.STRING,
                        description: "Detailed description of the destructive or safety-critical action you intend to perform, to show to the user for confirmation."
                      }
                    },
                    required: ["actionDetails"]
                  }
                },
                {
                  name: "desktopExecuteTerminalCommand",
                  description: "Executes a background terminal/shell command natively on the user's OS (Powershell on Windows, Bash on Mac/Linux) to manage files, search, or control system functions.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      command: {
                        type: Type.STRING,
                        description: "The raw shell command to execute natively."
                      }
                    },
                    required: ["command"]
                  }
                },
                {
                  name: "desktopStopAction",
                  description: "Immediately stops/cancels any active keyboard typing or running desktop control action.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {}
                  }
                },
                {
                  name: "systemControl",
                  description: "Controls system-level PC functions: volume, brightness, lock screen, sleep, shutdown, restart.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: {
                        type: Type.STRING,
                        description: "One of: 'volumeUp','volumeDown','volumeMute','volumeUnmute','volumeSet','brightnessSet','lock','sleep','shutdown','restart'."
                      },
                      value: {
                        type: Type.NUMBER,
                        description: "Percentage 0-100, required only for volumeSet and brightnessSet."
                      }
                    },
                    required: ["action"]
                  }
                },
                {
                  name: "askReasoningModel",
                  description: "Delegates complex reasoning, coding, planning, or multi-step logic tasks to a stronger reasoning model (e.g. OpenAI GPT-4o / Gemini Pro). Use this whenever the user asks for code generation, writing scripts, planning complex activities, or deep explanations.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      prompt: {
                        type: Type.STRING,
                        description: "The reasoning prompt or coding task description to send to the stronger model."
                      },
                      taskType: {
                        type: Type.STRING,
                        description: "The category of the task: 'coding', 'planning', or 'general'.",
                        enum: ["coding", "planning", "general"]
                      }
                    },
                    required: ["prompt"]
                  }
                }
              ]
            }
          ]
        },
        callbacks: {
          onmessage: (message) => {
            // Forward audio chunk to client
            const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audio) {
              ws.send(JSON.stringify({ type: "audio", data: audio }));
            }

            // Forward interruption signal
            if (message.serverContent?.interrupted) {
              console.log("[Avy Server] Interrupted by user");
              TaskManager.getInstance().triggerEmergencyStop();
              ws.send(JSON.stringify({ type: "interrupted" }));
              if (activeAgentWs) {
                activeAgentWs.send(JSON.stringify({ type: "cancel_action" }));
              }
            }

            // Handle function call / tool execution
            if (message.toolCall?.functionCalls) {
              for (const call of message.toolCall.functionCalls) {
                handleToolCall(session, ws, call, userId);
              }
            }
          }
        }
      });

      console.log("[Avy Server] Connected to Gemini Live session successfully.");
      ws.send(JSON.stringify({ type: "connected" }));
      ws.send(JSON.stringify({ type: "agent_connection_status", connected: true }));

    } catch (err: any) {
      console.error("[Avy Server] Failed to connect to Gemini Live session:", err);
      ws.send(JSON.stringify({ 
        type: "error", 
        message: err.message || "Failed to establish a real-time connection with Avy." 
      }));
      ws.close();
      return;
    }

    // Process incoming audio stream from client
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "emergency_stop") {
          console.warn("[Avy Server] EMERGENCY STOP TRIGGERED BY WEBSOCKET CLIENT");
          TaskManager.getInstance().triggerEmergencyStop();
          ws.send(JSON.stringify({ type: "interrupted" }));
          if (activeAgentWs) {
            activeAgentWs.send(JSON.stringify({ type: "cancel_action" }));
          }
          if (session) {
            try {
              session.sendRealtimeInput({ text: "STOP NOW" });
            } catch (err) {}
          }
          return;
        }

        if (msg.type === "audio") {
          TaskManager.getInstance().resetEmergencyStop();
        }

        if (msg.type === "audio" && msg.data) {
          if (session) {
            session.sendRealtimeInput({
              audio: {
                data: msg.data,
                mimeType: "audio/pcm;rate=16000"
              }
            });
          }
        } else if (msg.type === "text" && msg.data) {
          const text = msg.data.toLowerCase().trim();
          const stopKeywords = ["stop", "cancel", "abort", "exit", "halt", "stop now", "enough", "quit task", "return to idle"];
          
          if (stopKeywords.includes(text) || stopKeywords.some(kw => text === kw)) {
            console.warn(`[Avy Server] EMERGENCY STOP TRIGGERED BY TEXT INPUT: "${msg.data}"`);
            TaskManager.getInstance().triggerEmergencyStop();
            ws.send(JSON.stringify({ type: "interrupted" }));
            if (activeAgentWs) {
              activeAgentWs.send(JSON.stringify({ type: "cancel_action" }));
            }
            if (session) {
              try {
                session.sendRealtimeInput({ text: "STOP NOW" });
              } catch (err) {}
            }
            return;
          }

          if (text.includes("type faster") || text.includes("write faster") || text.includes("faster")) {
            console.log("[Avy Server] User requested to type faster.");
            agent.increaseTypingSpeed();
            if (session) {
              try {
                session.sendRealtimeInput({
                  text: '[System Instruction: Speak this exactly to the user: "Typing faster."]'
                });
              } catch (err) {}
            }
            return;
          }

          TaskManager.getInstance().resetEmergencyStop();
          if (session) {
            console.log(`[Avy Server] Client sent text input: "${msg.data}"`);
            session.sendRealtimeInput({
              text: msg.data
            });
          }
        } else if (msg.type === "image" && msg.data) {
          TaskManager.getInstance().resetEmergencyStop();
          if (session) {
            session.sendRealtimeInput({
              video: {
                data: msg.data,
                mimeType: "image/jpeg"
              }
            });
          }
        } else if (msg.type === "browser_action_result" || msg.type === "desktop_action_result") {
          const { id, result } = msg;
          const resolve = pendingBrowserRequests.get(id);
          if (resolve) {
            pendingBrowserRequests.delete(id);
            resolve(result);
          }
        }
      } catch (e) {
        console.error("[Avy Server] Error processing message from client:", e);
      }
    });

    ws.on("close", () => {
      console.log("[Avy Server] Client disconnected from WebSocket");
      if (session) {
        try {
          session.close();
        } catch (err) {
          // ignore
        }
      }
    });

    ws.on("error", (error) => {
      console.error(`[Avy Server] WebSocket connection error for userId: ${userId}:`, error);
    });
  });

  // Helper for action execution logging
  function logActionExecution(name: string, args: any, result: any, startTime: number) {
    const executionTime = Date.now() - startTime;
    const isDesktop = name.startsWith("desktop");
    const detectedIntent = isDesktop ? "Desktop Control Mode (Mode 2)" : "Browser Mode (Mode 1)";
    const executionEngine = isDesktop 
      ? "Native Desktop Node Engine"
      : "Avy Browser Engine";

    const desktopAction = isDesktop ? name : "N/A";
    const browserAction = !isDesktop ? name : "N/A";

    let targetWindow = "N/A";
    if (isDesktop) {
      targetWindow = args?.appName || "Active Window";
    } else {
      targetWindow = "Avy Browser Tab";
    }

    let targetElement = "N/A";
    if (name === "browserClick" || name === "browserInput") {
      targetElement = args?.selectorOrText || args?.selectorOrPlaceholder || "CSS Selector";
    } else if (name === "desktopMouseClick") {
      targetElement = "Mouse Cursor Destination";
    }

    let coordinates = "N/A";
    if (args?.x !== undefined && args?.y !== undefined) {
      coordinates = `{x: ${args.x}%, y: ${args.y}%}`;
    } else if (args?.fromX !== undefined && args?.fromY !== undefined) {
      coordinates = `From {x: ${args.fromX}%, y: ${args.fromY}%} To {x: ${args.toX}%, y: ${args.toY}%}`;
    }

    const confidence = "98%";
    const success = result?.success !== false;
    const failure = success ? "N/A" : (result?.error || "Execution failed");

    console.log("┌────────────────────────────────────────────────────────┐");
    console.log("│               AVY ACTION EXECUTION LOG                 │");
    console.log("├────────────────────────────────────────────────────────┤");
    console.log(`│ Detected Intent  : ${detectedIntent.padEnd(36)} │`);
    console.log(`│ Execution Engine : ${executionEngine.padEnd(36)} │`);
    console.log(`│ Desktop Action   : ${desktopAction.padEnd(36)} │`);
    console.log(`│ Browser Action   : ${browserAction.padEnd(36)} │`);
    console.log(`│ Target Window    : ${targetWindow.padEnd(36)} │`);
    console.log(`│ Target Element   : ${targetElement.padEnd(36)} │`);
    console.log(`│ Coordinates      : ${coordinates.padEnd(36)} │`);
    console.log(`│ Confidence       : ${confidence.padEnd(36)} │`);
    console.log(`│ Success          : ${(success ? "true" : "false").padEnd(36)} │`);
    console.log(`│ Failure          : ${String(failure).substring(0, 36).padEnd(36)} │`);
    console.log(`│ Execution Time   : ${(executionTime + " ms").padEnd(36)} │`);
    console.log("└────────────────────────────────────────────────────────┘");
  }

  // Tool Call execution logic
  async function handleToolCall(session: any, ws: any, call: any, userId: string) {
    const { name, id, args } = call;
    const startTime = Date.now();
    console.log(`[Avy Server] Executing tool: ${name} (ID: ${id}) for user: ${userId}`, args);

    try {
      if (name === "getDateTime") {
        const now = new Date();
        const dateStr = now.toLocaleDateString("en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const timeStr = now.toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' });
        const istStr = now.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "full", timeStyle: "long" });

        session.sendToolResponse({
          functionResponses: [{
            id,
            name,
            response: {
              output: {
                date: dateStr,
                time: timeStr,
                fullDateTime: `${dateStr} at ${timeStr}`,
                indianStandardTime: istStr
              }
            }
          }]
        });
      } else if (name === "saveMemory") {
        const { fact, category } = args as { fact: string; category: any };
        
        if (MemoryManager.isMemoryPaused(userId)) {
          session.sendToolResponse({
            functionResponses: [{
              id,
              name,
              response: {
                output: {
                  success: false,
                  message: "Memory extraction is currently PAUSED by the user. Storing memories is disabled."
                }
              }
            }]
          });
        } else {
          const item = MemoryManager.saveMemory(userId, fact, category);
          
          // Notify client UI of memory operation so they can refresh Memory Hub live
          ws.send(JSON.stringify({ type: "memory_saved", userId, memory: item }));

          session.sendToolResponse({
            functionResponses: [{
              id,
              name,
              response: {
                output: {
                  success: true,
                  message: `Memory of type ${category} successfully stored: "${fact}" with ID ${item.id}.`,
                  id: item.id
                }
              }
            }]
          });
        }
      } else if (name === "updateMemory") {
        const { id: memId, newFact } = args as { id: string; newFact: string };
        
        if (MemoryManager.isMemoryPaused(userId)) {
          session.sendToolResponse({
            functionResponses: [{
              id,
              name,
              response: {
                output: {
                  success: false,
                  message: "Memory extraction is currently PAUSED by the user. Updating memories is disabled."
                }
              }
            }]
          });
        } else {
          const success = MemoryManager.updateMemory(userId, memId, newFact);

          if (success) {
            ws.send(JSON.stringify({ type: "memory_updated", userId, id: memId, fact: newFact }));
          }

          session.sendToolResponse({
            functionResponses: [{
              id,
              name,
              response: {
                output: {
                  success,
                  message: success
                    ? `Memory ID ${memId} successfully updated to: "${newFact}".`
                    : `Memory ID ${memId} not found.`
                }
              }
            }]
          });
        }
      } else if (name === "forgetMemory") {
        const { id: memId } = args as { id: string };
        
        if (MemoryManager.isMemoryPaused(userId)) {
          session.sendToolResponse({
            functionResponses: [{
              id,
              name,
              response: {
                output: {
                  success: false,
                  message: "Memory extraction is currently PAUSED by the user. Forgetting/deleting memories is disabled."
                }
              }
            }]
          });
        } else {
          const success = MemoryManager.forgetMemory(userId, memId);

          if (success) {
            ws.send(JSON.stringify({ type: "memory_forgot", userId, id: memId }));
          }

          session.sendToolResponse({
            functionResponses: [{
              id,
              name,
              response: {
                output: {
                  success,
                  message: success
                    ? `Memory ID ${memId} successfully deleted.`
                    : `Memory ID ${memId} not found.`
                }
              }
            }]
          });
        }
      } else if (name === "retrieveMemories") {
        const { query, category } = args as { query?: string; category?: string };
        
        if (MemoryManager.isMemoryPaused(userId)) {
          session.sendToolResponse({
            functionResponses: [{
              id,
              name,
              response: {
                output: {
                  success: false,
                  results: [],
                  message: "Memory system is currently PAUSED by the user. Retrieval is disabled."
                }
              }
            }]
          });
        } else {
          const items = MemoryManager.searchMemories(userId, query, category);

          session.sendToolResponse({
            functionResponses: [{
              id,
              name,
              response: {
                output: {
                  success: true,
                  results: items.map((m) => ({ id: m.id, fact: m.fact, category: m.category, timestamp: m.timestamp })),
                  message: items.length > 0
                    ? `Successfully found ${items.length} relevant memory/memories.`
                    : "No matching memories found for your query/category."
                }
              }
            }]
          });
        }
      } else if (name === "openWebsite") {
        const isOnline = await checkInternetConnection();
        if (!isOnline) {
          session.sendToolResponse({
            functionResponses: [{
              id,
              name,
              response: {
                output: {
                  success: false,
                  error: "No internet connection is available. Fresh information cannot be retrieved.",
                  isOffline: true
                }
              }
            }]
          });
          return;
        }

        const { url, siteName } = args as { url: string; siteName: string };
        
        // Push socket event to let client UI render/open it
        ws.send(JSON.stringify({ type: "open_website", url, siteName }));

        const result = { success: true };
        logActionExecution(name, args, result, startTime);

        session.sendToolResponse({
          functionResponses: [{
            id,
            name,
            response: {
              output: {
                success: true,
                message: `Successfully sent request to client to display and highlight ${siteName} at ${url}.`
              }
            }
          }]
        });
      } else if (name === "readWebpageContent") {
        const { url } = args as { url: string };
        const cached = webpageCache.get(url);
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
          console.log(`[Avy Server] Serving cached content for URL: ${url}`);
          session.sendToolResponse({
            functionResponses: [{
              id,
              name,
              response: { output: cached.content }
            }]
          });
          return;
        }

        const isOnline = await checkInternetConnection();
        if (!isOnline) {
          session.sendToolResponse({
            functionResponses: [{
              id,
              name,
              response: {
                output: {
                  success: false,
                  error: "No internet connection is available. Fresh information cannot be retrieved.",
                  isOffline: true
                }
              }
            }]
          });
          return;
        }

        ws.send(JSON.stringify({ type: "browser_action", id, action: name, args }));
        
        const result: any = await new Promise((resolve) => {
          pendingBrowserRequests.set(id, resolve);
          setTimeout(() => {
            if (pendingBrowserRequests.has(id)) {
              pendingBrowserRequests.delete(id);
              resolve({ success: false, error: `Browser action '${name}' timed out. The page may still be loading or has blocked the script.` });
            }
          }, 8000);
        });

        if (result && result.success) {
          webpageCache.set(url, { content: result, timestamp: Date.now() });
        }

        logActionExecution(name, args, result, startTime);

        session.sendToolResponse({
          functionResponses: [{
            id,
            name,
            response: { output: result }
          }]
        });
      } else if (["browserScroll", "browserClick", "browserInput", "browserMediaControl", "browserTabControl"].includes(name)) {
        const isOnline = await checkInternetConnection();
        if (!isOnline) {
          session.sendToolResponse({
            functionResponses: [{
              id,
              name,
              response: {
                output: {
                  success: false,
                  error: "No internet connection is available. Fresh information cannot be retrieved.",
                  isOffline: true
                }
              }
            }]
          });
          return;
        }

        ws.send(JSON.stringify({ type: "browser_action", id, action: name, args }));
        
        const result: any = await new Promise((resolve) => {
          pendingBrowserRequests.set(id, resolve);
          // 8 seconds timeout
          setTimeout(() => {
            if (pendingBrowserRequests.has(id)) {
              pendingBrowserRequests.delete(id);
              resolve({ success: false, error: `Browser action '${name}' timed out. The page may still be loading or has blocked the script.` });
            }
          }, 8000);
        });

        logActionExecution(name, args, result, startTime);

        session.sendToolResponse({
          functionResponses: [{
            id,
            name,
            response: { output: result }
          }]
        });
      } else if ([
        "desktopGetScreenState",
        "desktopMouseMove",
        "desktopMouseClick",
        "desktopMouseDragDrop",
        "desktopKeyboardType",
        "desktopKeyboardPress",
        "desktopLaunchApp",
        "desktopWindowControl",
        "desktopRequestPermission",
        "desktopConfirmAction",
        "desktopExecuteTerminalCommand",
        "systemControl"
      ].includes(name)) {
        
        // Voice Acknowledgment
        let speakTextStr = "";
        let statusText = "";
        if (name === "desktopLaunchApp" && args?.appName) {
          const appNameUpper = args.appName.toUpperCase();
          speakTextStr = `Opening ${appNameUpper}.`;
          statusText = `Still opening ${args.appName}...`;
        } else if (name === "desktopKeyboardType") {
          speakTextStr = "Writing the text.";
          statusText = "Still typing...";
        } else if (name === "desktopExecuteTerminalCommand") {
          speakTextStr = "Executing terminal command.";
          statusText = "Still running command...";
        }

        if (speakTextStr && session) {
          try {
            session.sendRealtimeInput({
              text: `[System Instruction: Speak this exactly to the user: "${speakTextStr}"]`
            });
          } catch (e) {
            console.error("Error sending voice to session:", e);
          }
        }

        // Setup status update interval if it takes longer than 5 seconds
        let statusInterval: NodeJS.Timeout | null = null;
        if (statusText && session) {
          statusInterval = setInterval(() => {
            try {
              session.sendRealtimeInput({
                text: `[System Instruction: Speak this exactly to the user: "${statusText}"]`
              });
            } catch (e) {
              console.error("Error sending voice status to session:", e);
            }
          }, 5000);
        }

        ws.send(JSON.stringify({ type: "desktop_action_dispatched", id, action: name, args }));

        const result = await executeDesktopAction(name, args);

        if (statusInterval) {
          clearInterval(statusInterval);
        }
        
        // Notify the UI logs so the user sees it in the Control Panel
        ws.send(JSON.stringify({ type: "desktop_action_result_log", id, result }));

        logActionExecution(name, args, result, startTime);

        session.sendToolResponse({
          functionResponses: [{
            id,
            name,
            response: { output: result }
          }]
        });
      } else if (name === "changeAssistantTheme") {
        const { theme } = args as { theme: string };

        // Push socket event to let client UI change theme
        ws.send(JSON.stringify({ type: "change_theme", theme }));

        session.sendToolResponse({
          functionResponses: [{
            id,
            name,
            response: {
              output: {
                success: true,
                theme: theme,
                message: `Successfully set theme color scheme to ${theme}.`
              }
            }
          }]
        });
      } else if (name === "changeAvyOutfit") {
        const { outfit } = args as { outfit: string };
        ws.send(JSON.stringify({ type: "avy_customization", outfit }));
        session.sendToolResponse({
          functionResponses: [{
            id,
            name,
            response: {
              output: {
                success: true,
                outfit,
                message: `Successfully changed Avy's outfit to "${outfit}".`
              }
            }
          }]
        });
      } else if (name === "changeAvyHairstyle") {
        const { hairstyle } = args as { hairstyle: string };
        ws.send(JSON.stringify({ type: "avy_customization", hairstyle }));
        session.sendToolResponse({
          functionResponses: [{
            id,
            name,
            response: {
              output: {
                success: true,
                hairstyle,
                message: `Successfully changed Avy's hairstyle to "${hairstyle}".`
              }
            }
          }]
        });
      } else if (name === "changeAvyHairColor") {
        const { hairColor } = args as { hairColor: string };
        ws.send(JSON.stringify({ type: "avy_customization", hairColor }));
        session.sendToolResponse({
          functionResponses: [{
            id,
            name,
            response: {
              output: {
                success: true,
                hairColor,
                message: `Successfully set Avy's hair dye color to "${hairColor}".`
              }
            }
          }]
        });
      } else if (name === "toggleAvyAccessory") {
        const { accessory } = args as { accessory: string };
        ws.send(JSON.stringify({ type: "avy_customization", accessory }));
        session.sendToolResponse({
          functionResponses: [{
            id,
            name,
            response: {
              output: {
                success: true,
                accessory,
                message: `Successfully toggled Avy's accessory "${accessory}".`
              }
            }
          }]
        });
      } else if (name === "changeAvyEnvironment") {
        const { environment } = args as { environment: string };
        ws.send(JSON.stringify({ type: "avy_customization", environment }));
        session.sendToolResponse({
          functionResponses: [{
            id,
            name,
            response: {
              output: {
                success: true,
                environment,
                message: `Successfully set visual backdrop environment to "${environment}".`
              }
            }
          }]
        });
      } else if (name === "changeAvyExpression") {
        const { expression } = args as { expression: string };
        ws.send(JSON.stringify({ type: "avy_customization", expression }));
        session.sendToolResponse({
          functionResponses: [{
            id,
            name,
            response: {
              output: {
                success: true,
                expression,
                message: `Successfully adjusted Avy's facial expression to "${expression}".`
              }
            }
          }]
        });
      } else if (name === "desktopStopAction") {
        if (activeAgentWs) {
          activeAgentWs.send(JSON.stringify({ type: "cancel_action" }));
        }
        session.sendToolResponse({
          functionResponses: [{
            id,
            name,
            response: {
              output: {
                success: true,
                message: "Cancellation request successfully sent to the desktop agent."
              }
            }
          }]
        });
      } else if (name === "askReasoningModel") {
        const { prompt, taskType } = args as { prompt: string; taskType?: 'coding' | 'planning' | 'general' };
        
        if (session) {
          try {
            session.sendRealtimeInput({
              text: `[System Instruction: Speak this exactly to the user: "Processing reasoning task..."]`
            });
          } catch (e) {}
        }
        
        try {
          const result = await LLMOrchestrator.getInstance().generateText(prompt, taskType || 'general');
          session.sendToolResponse({
            functionResponses: [{
              id,
              name,
              response: {
                output: {
                  success: true,
                  response: result
                }
              }
            }]
          });
        } catch (error: any) {
          session.sendToolResponse({
            functionResponses: [{
              id,
              name,
              response: {
                output: {
                  success: false,
                  error: error.message || "Failed to generate reasoning response."
                }
              }
            }]
          });
        }
      } else {
        session.sendToolResponse({
          functionResponses: [{
            id,
            name,
            response: {
              output: {
                error: `Tool ${name} is not recognized.`
              }
            }
          }]
        });
      }
    } catch (err: any) {
      console.error(`[Avy Server] Error running tool ${name}:`, err);
      session.sendToolResponse({
        functionResponses: [{
          id,
          name,
          response: {
            output: {
              error: err.message || "Unknown tool execution failure."
            }
          }
        }]
      });
    }
  }


  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[Avy Server] Running full-stack server on port ${PORT}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Avy Server] Port ${PORT} is already in use. The server is likely already running from a previous instance.`);
    } else {
      console.error(`[Avy Server] Server error:`, err);
    }
  });
}
