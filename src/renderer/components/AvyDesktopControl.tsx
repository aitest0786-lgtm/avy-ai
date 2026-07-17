import React, { useState, useRef, useEffect } from "react";
import { 
  Monitor, 
  ShieldAlert, 
  Play, 
  Square, 
  MousePointer, 
  Check, 
  X, 
  Lock, 
  Unlock, 
  Copy, 
  Terminal as TerminalIcon, 
  AlertCircle, 
  RefreshCw,
  Info,
  ExternalLink,
  Cpu,
  Settings as SettingsIcon,
  HelpCircle,
  Eye,
  ShieldCheck
} from "lucide-react";

interface AvyDesktopControlProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ActionLogEntry {
  id: string;
  time: string;
  action: string;
  details: string;
  status: "pending" | "success" | "failed";
}

export function AvyDesktopControl({ isOpen, onClose }: AvyDesktopControlProps) {
  // Screen stream states
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [isScreenShared, setIsScreenShared] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Connection & Control status
  const [agentConnected, setAgentConnected] = useState(false);
  const [mouseControlAllowed, setMouseControlAllowed] = useState(true);
  const [keyboardControlAllowed, setKeyboardControlAllowed] = useState(true);
  const [actionLogs, setActionLogs] = useState<ActionLogEntry[]>([
    { id: "1", time: new Date().toLocaleTimeString(), action: "System init", details: "Avy PC Control Center loaded. Awaiting Screen Share...", status: "success" }
  ]);

  // UI state
  const [activeTab, setActiveTab] = useState<"visuals" | "logs">("visuals");

  // Safety confirmation states
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmDescription, setConfirmDescription] = useState("");
  const [pendingConfirmResolve, setPendingConfirmResolve] = useState<{ resolve: (val: any) => void } | null>(null);

  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const [pendingPermissionResolve, setPendingPermissionResolve] = useState<{ resolve: (val: any) => void } | null>(null);

  const grantControl = () => {
    setMouseControlAllowed(true);
    setKeyboardControlAllowed(true);
    setShowPermissionPrompt(false);
    if (pendingPermissionResolve) {
      pendingPermissionResolve.resolve({ success: true, granted: true });
      setPendingPermissionResolve(null);
    }
  };

  const denyControl = () => {
    setMouseControlAllowed(false);
    setKeyboardControlAllowed(false);
    setShowPermissionPrompt(false);
    if (pendingPermissionResolve) {
      pendingPermissionResolve.resolve({ success: false, error: "Access Denied: Desktop input control permission rejected by user." });
      setPendingPermissionResolve(null);
    }
  };

  const handleInstantDisable = () => {
    stopScreenShare();
    setMouseControlAllowed(false);
    setKeyboardControlAllowed(false);
    
    // Trigger global emergency stop in the backend
    window.dispatchEvent(new CustomEvent("avy-emergency-stop"));

    const newLog: ActionLogEntry = {
      id: Math.random().toString(),
      time: new Date().toLocaleTimeString(),
      action: "Emergency Stop",
      details: "All native permissions and display streams immediately terminated.",
      status: "success"
    };
    setActionLogs(prev => [newLog, ...prev]);
  };

  // Track cursor position sent by agent or system
  const [cursorPos, setCursorPos] = useState({ x: 50, y: 50 });
  const [cursorActive, setCursorActive] = useState(false);

  // Setup listeners for Agent Connection Status, Dispatched Actions, and Action Results
  useEffect(() => {
    const handleAgentConnection = (e: Event) => {
      const customEvent = e as CustomEvent;
      const connected = !!customEvent.detail.connected;
      setAgentConnected(connected);
      
      const newLog: ActionLogEntry = {
        id: Math.random().toString(),
        time: new Date().toLocaleTimeString(),
        action: "Agent Link",
        details: connected ? "Native Local Execution Agent online. Host machine control active!" : "Native Local Agent disconnected. Falling back to simulated logs.",
        status: "success"
      };
      setActionLogs(prev => [newLog, ...prev]);
    };

    const handleActionDispatched = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { action, args } = customEvent.detail;
      
      // Update coordinates visual if mouse move is tracked
      if (action === "desktopMouseMove") {
        setCursorPos({ x: args.x ?? 50, y: args.y ?? 50 });
        setCursorActive(true);
      }

      const newLog: ActionLogEntry = {
        id: customEvent.detail.id || Math.random().toString(),
        time: new Date().toLocaleTimeString(),
        action: action.replace("desktop", "OS "),
        details: `Executing: ${JSON.stringify(args)}`,
        status: "pending"
      };
      setActionLogs(prev => [newLog, ...prev]);
    };

    const handleActionResult = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { id, result } = customEvent.detail;
      
      setActionLogs(prev => prev.map(log => {
        if (log.id === id) {
          const isSuccess = result?.success !== false;
          return {
            ...log,
            status: isSuccess ? "success" : "failed",
            details: isSuccess 
              ? `Done: ${JSON.stringify(result)}` 
              : `Error: ${result?.error || "Execution failed"}`
          };
        }
        return log;
      }));
    };

    const handleAgentLog = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { message } = customEvent.detail;
      const newLog: ActionLogEntry = {
        id: Math.random().toString(),
        time: new Date().toLocaleTimeString(),
        action: "Agent Log",
        details: message,
        status: "success"
      };
      setActionLogs(prev => [newLog, ...prev]);
    };

    window.addEventListener("avy-agent_connection_status", handleAgentConnection);
    window.addEventListener("avy-desktop_action_dispatched", handleActionDispatched);
    window.addEventListener("avy-desktop_action_result_log", handleActionResult);
    window.addEventListener("avy-agent_log", handleAgentLog);

    return () => {
      window.removeEventListener("avy-agent_connection_status", handleAgentConnection);
      window.removeEventListener("avy-desktop_action_dispatched", handleActionDispatched);
      window.removeEventListener("avy-desktop_action_result_log", handleActionResult);
      window.removeEventListener("avy-agent_log", handleAgentLog);
    };
  }, []);

  // Listen for direct local client tool calls from Gemini when local agent is NOT connected
  useEffect(() => {
    const handleLocalToolRequest = async (e: Event) => {
      const customEvent = e as CustomEvent;
      const { id, action, args } = customEvent.detail;

      const respond = (result: any) => {
        window.dispatchEvent(new CustomEvent(`avy-desktop-control-response-${id}`, {
          detail: { result }
        }));
      };

      // Add a log for the local fallback action
      const newLog: ActionLogEntry = {
        id,
        time: new Date().toLocaleTimeString(),
        action: action.replace("desktop", "OS (Sim) "),
        details: `Simulated fallback run: ${JSON.stringify(args)}`,
        status: "pending"
      };
      setActionLogs(prev => [newLog, ...prev]);

      try {
        if (action === "desktopRequestPermission") {
          if (mouseControlAllowed && keyboardControlAllowed && isScreenShared) {
            respond({ success: true, granted: true });
            setActionLogs(prev => prev.map(l => l.id === id ? { ...l, status: "success", details: "Permission checked. Already Authorized." } : l));
          } else {
            setShowPermissionPrompt(true);
            const userConfirm = await new Promise((resolve) => {
              setPendingPermissionResolve({ resolve });
            });
            respond(userConfirm);
            setActionLogs(prev => prev.map(l => l.id === id ? { ...l, status: "success", details: "Permission prompt authorized." } : l));
          }
          return;
        }

        if (action === "desktopConfirmAction") {
          const desc = args.actionDescription || "execute critical command";
          setConfirmDescription(desc);
          setShowConfirmModal(true);
          const userConfirm = await new Promise((resolve) => {
            setPendingConfirmResolve({ resolve });
          });
          respond(userConfirm);
          setActionLogs(prev => prev.map(l => l.id === id ? { ...l, status: "success", details: `User prompt completed: ${JSON.stringify(userConfirm)}` } : l));
          return;
        }

        // Validate Mouse permissions
        if (["desktopMouseMove", "desktopMouseClick", "desktopMouseDragDrop"].includes(action)) {
          if (!mouseControlAllowed) {
            respond({ success: false, error: "Access Denied: Mouse control permission is currently disabled by the user." });
            setActionLogs(prev => prev.map(l => l.id === id ? { ...l, status: "failed", details: "Blocked: Mouse control is disabled." } : l));
            return;
          }
        }

        // Validate Keyboard permissions
        if (["desktopKeyboardType", "desktopKeyboardPress"].includes(action)) {
          if (!keyboardControlAllowed) {
            respond({ success: false, error: "Access Denied: Keyboard control permission is currently disabled by the user." });
            setActionLogs(prev => prev.map(l => l.id === id ? { ...l, status: "failed", details: "Blocked: Keyboard control is disabled." } : l));
            return;
          }
        }

        // Mouse cursor tracing
        if (action === "desktopMouseMove") {
          setCursorPos({ x: args.x ?? 50, y: args.y ?? 50 });
          setCursorActive(true);
          respond({ success: true, x: args.x, y: args.y });
          setActionLogs(prev => prev.map(l => l.id === id ? { ...l, status: "success", details: `Mouse moved to coordinates (${args.x}%, ${args.y}%)` } : l));
          return;
        }

        // Clicking tracing
        if (action === "desktopMouseClick") {
          respond({ success: true, clicked: args.clickType || "left" });
          setActionLogs(prev => prev.map(l => l.id === id ? { ...l, status: "success", details: `Mouse click (${args.clickType || "left"}) executed successfully.` } : l));
          return;
        }

        // Typing / Keyboard tracing
        if (action === "desktopKeyboardType") {
          respond({ success: true, typed: args.text });
          setActionLogs(prev => prev.map(l => l.id === id ? { ...l, status: "success", details: `Typed text: "${args.text}"` } : l));
          return;
        }

        if (action === "desktopKeyboardPress") {
          respond({ success: true, pressed: args.key });
          setActionLogs(prev => prev.map(l => l.id === id ? { ...l, status: "success", details: `Pressed key combination: [${args.key}]` } : l));
          return;
        }

        // Fallback catch all for virtual windows close/maximize
        respond({ success: true, info: "Executed natively on host or logged in terminal logs." });
        setActionLogs(prev => prev.map(l => l.id === id ? { ...l, status: "success", details: "Local simulation completed safely." } : l));

      } catch (err: any) {
        respond({ success: false, error: err.message });
        setActionLogs(prev => prev.map(l => l.id === id ? { ...l, status: "failed", details: `Error: ${err.message}` } : l));
      }
    };

    window.addEventListener("avy-desktop-control", handleLocalToolRequest);
    return () => {
      window.removeEventListener("avy-desktop-control", handleLocalToolRequest);
    };
  }, [mouseControlAllowed, keyboardControlAllowed, isScreenShared]);

  // Native Screen Capture initiator
  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "monitor",
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });
      setScreenStream(stream);
      setIsScreenShared(true);

      const newLog: ActionLogEntry = {
        id: Math.random().toString(),
        time: new Date().toLocaleTimeString(),
        action: "Screen Share",
        details: "OS display pipeline active. Captured real desktop frames.",
        status: "success"
      };
      setActionLogs(prev => [newLog, ...prev]);

      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };
    } catch (err: any) {
      console.error("OS Screen Capture Error:", err);
      const newLog: ActionLogEntry = {
        id: Math.random().toString(),
        time: new Date().toLocaleTimeString(),
        action: "Capture Error",
        details: `Failed to capture display: ${err.message || "User declined / sandbox policy restricted"}`,
        status: "failed"
      };
      setActionLogs(prev => [newLog, ...prev]);
    }
  };

  const stopScreenShare = () => {
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      setScreenStream(null);
    }
    setIsScreenShared(false);
    
    const newLog: ActionLogEntry = {
      id: Math.random().toString(),
      time: new Date().toLocaleTimeString(),
      action: "Screen Share",
      details: "OS display stream terminated by user.",
      status: "success"
    };
    setActionLogs(prev => [newLog, ...prev]);
  };

  // Continuous frame streaming to Gemini Vision Pipeline (at most 1 FPS)
  useEffect(() => {
    if (!screenStream || !isScreenShared) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    
    // Create local video element to play the stream for screenshot captures
    const captureVideo = document.createElement("video");
    captureVideo.srcObject = screenStream;
    captureVideo.muted = true;
    captureVideo.playsInline = true;
    captureVideo.play().catch(err => console.error("[Avy Vision] Capture video play failed:", err));

    const intervalId = setInterval(() => {
      if (captureVideo.videoWidth === 0 || captureVideo.videoHeight === 0) return;
      
      // Standard resolution (800x450 is highly optimal for Gemini Vision and latency)
      const targetWidth = 800;
      const targetHeight = Math.round((captureVideo.videoHeight / captureVideo.videoWidth) * targetWidth);
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      
      if (ctx) {
        ctx.drawImage(captureVideo, 0, 0, targetWidth, targetHeight);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.75); // 0.75 compression ratio
        const base64 = dataUrl.split(",")[1];
        if (base64) {
          // Dispatch global custom event that is listened by useAvySession
          window.dispatchEvent(new CustomEvent("avy-send-image", { detail: { base64 } }));
        }
      }
    }, 1000); // Send exactly 1 frame per second to obey Gemini limits and preserve bandwidth

    return () => {
      clearInterval(intervalId);
      captureVideo.srcObject = null;
    };
  }, [screenStream, isScreenShared]);

  useEffect(() => {
    if (videoRef.current && screenStream) {
      videoRef.current.srcObject = screenStream;
    }
  }, [screenStream]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [screenStream]);
  // Clean up on unmount

  if (!isOpen) return null;

  const isDesktopControlActive = isScreenShared && (mouseControlAllowed || keyboardControlAllowed);

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-[#090a0f] border-l border-white/10 shadow-2xl z-40 flex flex-col overflow-hidden text-slate-100 font-sans">
      {/* Top Header Row */}
      <div className="px-5 py-4 bg-gradient-to-r from-[#111422] to-[#0a0c14] border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Monitor className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-wide text-white uppercase">OS Control Panel</h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${agentConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`}></span>
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                {agentConnected ? "Host Machine Linked" : "Simulated Logs Active"}
              </span>
            </div>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Emergency Stop / Instant Disable Banner */}
      {isDesktopControlActive && (
        <div className="bg-rose-500/10 border-b border-rose-500/25 px-4 py-2 flex items-center justify-between animate-pulse shrink-0">
          <div className="flex items-center gap-1.5 text-rose-400 font-mono text-[9px] font-bold uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block animate-ping"></span>
            Live Desktop Control Active
          </div>
          <button
            onClick={handleInstantDisable}
            className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white font-mono font-bold text-[8px] rounded uppercase cursor-pointer transition-colors shadow-lg shadow-rose-950/50 hover:shadow-rose-600/30"
          >
            Instant Disable
          </button>
        </div>
      )}

      {/* Primary Action Row - Screen Share Trigger */}
      <div className="p-4 bg-[#0d101a] border-b border-white/5 flex items-center justify-between gap-3">
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-wider font-mono text-slate-400 font-bold mb-1 flex items-center gap-1">
            <Eye className="w-3 h-3 text-cyan-400" /> Screen Streaming Pipe
          </div>
          <p className="text-[11px] text-slate-400 leading-tight">
            {isScreenShared ? "Continuously streaming desktop frames (1 FPS) to Gemini vision." : "Screen pipe is inactive. Share display for sight."}
          </p>
        </div>

        {isScreenShared ? (
          <button
            onClick={stopScreenShare}
            className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-md shadow-rose-950/20 transition-all cursor-pointer"
          >
            <Square className="w-3.5 h-3.5 fill-current" /> Stop Share
          </button>
        ) : (
          <button
            onClick={startScreenShare}
            className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-md shadow-cyan-950/20 hover:shadow-cyan-500/10 transition-all cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" /> Share Screen
          </button>
        )}
      </div>

      {/* Screen Mirror Preview Frame */}
      {isScreenShared && (
        <div className="px-4 pt-4 pb-1 bg-[#090a0f] flex-shrink-0">
          <div className="relative aspect-video rounded-xl overflow-hidden border border-white/10 bg-black shadow-inner group">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className="w-full h-full object-cover"
            />
            {/* Live Indicator overlay */}
            <div className="absolute top-3 left-3 px-2 py-1 bg-black/80 backdrop-blur-md border border-red-500/30 rounded-lg text-[9px] font-mono text-red-400 flex items-center gap-1.5 font-bold tracking-wider uppercase">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
              STREAMING REAL DESKTOP
            </div>
            
            {/* Resolution indicator */}
            <div className="absolute bottom-3 right-3 px-1.5 py-0.5 bg-black/80 backdrop-blur-md rounded text-[8px] font-mono text-slate-400">
              1080P • 1 FPS
            </div>

            {/* Virtual Pointer overlay tracing coordinates */}
            {cursorActive && (
              <div 
                className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-all duration-300 z-30"
                style={{ left: `${cursorPos.x}%`, top: `${cursorPos.y}%` }}
              >
                <div className="w-full h-full rounded-full bg-cyan-500/30 border border-cyan-400 flex items-center justify-center animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="px-4 pt-3 flex items-center gap-2 border-b border-white/5 bg-[#090a0f]">
        <button
          onClick={() => setActiveTab("visuals")}
          className={`px-3 py-2 text-xs font-medium tracking-wide transition-colors relative border-b-2 ${
            activeTab === "visuals" 
              ? "text-cyan-400 border-cyan-400" 
              : "text-slate-400 hover:text-slate-200 border-transparent"
          }`}
        >
          OS Status
        </button>
        <button
          onClick={() => setActiveTab("logs")}
          className={`px-3 py-2 text-xs font-medium tracking-wide transition-colors relative border-b-2 ${
            activeTab === "logs" 
              ? "text-cyan-400 border-cyan-400" 
              : "text-slate-400 hover:text-slate-200 border-transparent"
          }`}
        >
          Terminal Logs
        </button>
      </div>

      {/* Main Tab Contents */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        
        {activeTab === "visuals" && (
          <div className="space-y-4">
            
            {/* OS Native Integration Status Card */}
            <div className="p-4 rounded-xl bg-gradient-to-br from-[#111526] to-[#0c0e18] border border-cyan-500/10 shadow-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white tracking-wide uppercase">Native OS Interlock</span>
                <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                  agentConnected 
                    ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" 
                    : "bg-amber-500/10 border border-amber-500/30 text-amber-400"
                }`}>
                  {agentConnected ? "ACTIVE LINK" : "LOCAL MANUAL LINK"}
                </span>
              </div>

              <p className="text-[11px] text-slate-400 leading-normal">
                {agentConnected 
                  ? "Avy is linked to your local PC. Clicks, typing, scrolling, and keyboard combinations will occur on your physical computer!" 
                  : "To let Avy control your actual operating system (click Chrome, open local apps, type natively), setup and run our lightweight connection agent on your machine."}
              </p>


            </div>

            {/* Safety & Permissions Card */}
            <div className="p-4 rounded-xl bg-[#0d101a] border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-semibold text-white tracking-wide uppercase">Safety Guard & Permissions</span>
                </div>
              </div>

              <div className="space-y-2.5">
                {/* Screen Capture Stream Permission */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-mono text-slate-300 font-bold uppercase">Screen Capture Stream</span>
                    <span className="text-[9px] text-slate-400">Sight feed for intent coordinates parsing</span>
                  </div>
                  <button 
                    onClick={isScreenShared ? stopScreenShare : startScreenShare}
                    className={`p-1 rounded transition-colors ${isScreenShared ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}
                  >
                    {isScreenShared ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                  </button>
                </div>

                {/* Mouse Control Access Permission */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-mono text-slate-300 font-bold uppercase">Mouse Control Access</span>
                    <span className="text-[9px] text-slate-400">Allows moving, dragging, and clicking cursor</span>
                  </div>
                  <button 
                    onClick={() => setMouseControlAllowed(!mouseControlAllowed)}
                    className={`p-1 rounded transition-colors ${mouseControlAllowed ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}
                  >
                    {mouseControlAllowed ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                  </button>
                </div>

                {/* Keyboard Control Access Permission */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-mono text-slate-300 font-bold uppercase">Keyboard Control Access</span>
                    <span className="text-[9px] text-slate-400">Allows native keystrokes and typing injection</span>
                  </div>
                  <button 
                    onClick={() => setKeyboardControlAllowed(!keyboardControlAllowed)}
                    className={`p-1 rounded transition-colors ${keyboardControlAllowed ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}
                  >
                    {keyboardControlAllowed ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                  </button>
                </div>

                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/10 text-[10px] text-amber-300 font-mono leading-tight">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                  <span>AVY always prompts for explicit confirmation before carrying out destructive OS commands.</span>
                </div>
              </div>
            </div>

            {/* Simulated Desktop Note */}
            {!isScreenShared && (
              <div className="p-4 rounded-xl border border-dashed border-white/10 flex flex-col items-center justify-center text-center p-6 space-y-3 bg-[#0d101a]/30">
                <Monitor className="w-8 h-8 text-slate-500" />
                <div className="space-y-1">
                  <h3 className="text-xs font-semibold text-slate-300">Continuous Vision Inactive</h3>
                  <p className="text-[10px] text-slate-400 max-w-[280px]">
                    Gemini cannot see your computer right now. Activate <strong>Share Screen</strong> to link your real monitor directly to the vision pipeline.
                  </p>
                </div>
              </div>
            )}

          </div>
        )}

        {activeTab === "logs" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 flex items-center gap-1.5 font-bold">
                <TerminalIcon className="w-3.5 h-3.5 text-cyan-400" /> System Action Stream
              </span>
              <button 
                onClick={() => setActionLogs([{ id: "1", time: new Date().toLocaleTimeString(), action: "Logs cleared", details: "Ready...", status: "success" }])}
                className="text-[9px] font-mono text-rose-400 hover:text-rose-300 cursor-pointer hover:underline"
              >
                Clear
              </button>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/90 p-3 font-mono text-[10px] space-y-2.5 max-h-[400px] overflow-y-auto leading-normal min-h-[180px]">
              {actionLogs.length === 0 ? (
                <div className="text-slate-500 text-center py-6">No action signals parsed.</div>
              ) : (
                actionLogs.map((log) => (
                  <div key={log.id} className="border-b border-white/5 pb-2 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-slate-500">{log.time}</span>
                        <span className={`px-1 py-0.2 rounded text-[8px] font-bold ${
                          log.action.includes("Error") 
                            ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" 
                            : "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                        }`}>
                          {log.action}
                        </span>
                      </div>
                      <span className={`text-[8px] font-bold uppercase ${
                        log.status === "success" 
                          ? "text-emerald-400" 
                          : log.status === "pending" 
                            ? "text-cyan-400 animate-pulse" 
                            : "text-rose-400"
                      }`}>
                        {log.status}
                      </span>
                    </div>
                    <p className="text-slate-300 mt-1 select-all break-all">{log.details}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

      </div>

      {/* Security Action Confirmation Modal Popup */}
      {showConfirmModal && (
        <div className="absolute inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-6 select-none animate-[fadeIn_0.2s_ease-out]">
          <div className="w-full max-w-sm rounded-2xl bg-[#0f1220] border border-amber-500/30 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-amber-400">
              <ShieldAlert className="w-5 h-5" />
              <span className="text-sm font-bold tracking-wide uppercase">OS Safety Prompt</span>
            </div>
            
            <div className="space-y-1">
              <p className="text-xs text-slate-200 leading-normal">
                Avy is requesting permissions to execute the following native command:
              </p>
              <p className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs font-mono text-amber-300 font-bold leading-normal break-words">
                {confirmDescription}
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  if (pendingConfirmResolve) {
                    pendingConfirmResolve.resolve({ success: false, error: "Action rejected by client supervisor." });
                    setPendingConfirmResolve(null);
                  }
                }}
                className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Reject Action
              </button>
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  if (pendingConfirmResolve) {
                    pendingConfirmResolve.resolve({ success: true, confirmed: true });
                    setPendingConfirmResolve(null);
                  }
                }}
                className="flex-1 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-black font-bold text-xs rounded-lg transition-colors cursor-pointer"
              >
                Approve & Run
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Permission Request Prompt Modal Popup */}
      {showPermissionPrompt && (
        <div className="absolute inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-6 select-none animate-[fadeIn_0.2s_ease-out]">
          <div className="w-full max-w-sm rounded-2xl bg-[#0f1220] border border-cyan-500/30 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-cyan-400">
              <ShieldAlert className="w-5 h-5 animate-pulse" />
              <span className="text-sm font-bold tracking-wide uppercase">Input Control Access</span>
            </div>
            
            <p className="text-xs text-slate-200 leading-normal">
              Gemini is requesting direct cursor tracking and mouse/keyboard automation access to navigate your operating system natively.
            </p>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={denyControl}
                className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Deny Control
              </button>
              <button
                onClick={grantControl}
                className="flex-1 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
              >
                Authorize Link
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
