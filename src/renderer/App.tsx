import React, { useState, useRef, useEffect } from "react";
import { useAvySession } from "./hooks/useAvySession";
import { AvyOrb } from "./components/AvyOrb";
import { AvyAvatar3D } from "./components/AvyAvatar3D";
import { ActionCards } from "./components/ActionCards";
import { Waveform } from "./components/Waveform";
import { BuiltInBrowser } from "./components/BuiltInBrowser";
import { AvyDesktopControl } from "./components/AvyDesktopControl";
import { 
  HelpCircle, 
  X, 
  Smile,
  Globe,
  Brain,
  Settings,
  Sparkles,
  Phone,
  Mic,
  Volume2,
  Loader2,
  Send,
  Keyboard,
  Monitor
} from "lucide-react";
import { AssistantTheme } from "./types";

const THEME_STYLES: Record<AssistantTheme, { bgGlow1: string; bgGlow2: string; accentBorder: string; glowText: string }> = {
  cyan: {
    bgGlow1: "from-cyan-500/10",
    bgGlow2: "to-blue-600/10",
    accentBorder: "border-cyan-500/20",
    glowText: "text-cyan-400"
  },
  amber: {
    bgGlow1: "from-amber-500/10",
    bgGlow2: "to-rose-600/10",
    accentBorder: "border-amber-500/20",
    glowText: "text-amber-400"
  },
  purple: {
    bgGlow1: "from-purple-500/10",
    bgGlow2: "to-indigo-600/10",
    accentBorder: "border-purple-500/20",
    glowText: "text-purple-400"
  },
  emerald: {
    bgGlow1: "from-emerald-500/10",
    bgGlow2: "to-teal-600/10",
    accentBorder: "border-emerald-500/20",
    glowText: "text-emerald-400"
  },
  crimson: {
    bgGlow1: "from-red-500/10",
    bgGlow2: "to-amber-800/10",
    accentBorder: "border-red-500/20",
    glowText: "text-red-400"
  },
  aurora: {
    bgGlow1: "from-green-500/10",
    bgGlow2: "to-indigo-500/10",
    accentBorder: "border-emerald-400/20",
    glowText: "text-emerald-400"
  }
};

export default function App() {
  const session = useAvySession();
  const { 
    status, 
    theme, 
    error, 
    websites, 
    browser,
    connect, 
    disconnect, 
    sendTextMessage,
    inputAnalyser, 
    outputAnalyser,
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
  } = session;

  const [showGuide, setShowGuide] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [visualMode, setVisualMode] = useState<"avatar" | "orb">("avatar");
  const [textInput, setTextInput] = useState("");
  const [desktopControlOpen, setDesktopControlOpen] = useState(false);
  
  const pendingMessageRef = useRef<string | null>(null);

  // Send pending message when session finishes connecting
  useEffect(() => {
    if ((status === "listening" || status === "speaking") && pendingMessageRef.current) {
      sendTextMessage(pendingMessageRef.current);
      pendingMessageRef.current = null;
    }
  }, [status, sendTextMessage]);

  const handleSendText = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!textInput.trim()) return;

    const message = textInput.trim();
    setTextInput("");

    if (status === "listening" || status === "speaking") {
      sendTextMessage(message);
    } else {
      pendingMessageRef.current = message;
      connect({ forceTextMode: true });
    }
  };

  const handleOrbClick = () => {
    if (status === "disconnected" || status === "error") {
      connect();
    } else {
      disconnect(null, true);
    }
  };

  const currentThemeStyle = THEME_STYLES[theme];

  return (
    <div className="bg-[#020203] text-[#f0f0f0] min-h-screen relative overflow-hidden flex flex-col font-sans select-none animate-fade-in" id="app-root">
      
      {/* Hidden iframe for cookie-warming proxy handshake */}
      <iframe 
        src="/api/health?warm=1" 
        style={{ display: "none", width: 0, height: 0, border: 0 }} 
        title="cookie-warm"
        id="cookie-warm-iframe"
      />
      
      {/* Subtle Grid Overlay from Sophisticated Dark design */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] grid-overlay z-0" id="grid-pattern-overlay" />

      {/* Ambient Gradient Blurs */}
      <div className={`absolute top-[-15%] left-[-15%] w-[60%] h-[60%] rounded-full bg-gradient-to-br ${currentThemeStyle.bgGlow1} blur-[140px] pointer-events-none transition-all duration-1000 animate-pulse z-0`} id="bg-glow-1" />
      <div className={`absolute bottom-[-15%] right-[-15%] w-[60%] h-[60%] rounded-full bg-gradient-to-tr ${currentThemeStyle.bgGlow2} blur-[140px] pointer-events-none transition-all duration-1000 z-0`} id="bg-glow-2" />

      {/* Workspace split-screen container */}
      <div className="flex-1 flex flex-col lg:flex-row relative z-10 overflow-hidden" id="workspace-wrapper">
        
        {/* Left Side: Voice AI companion pane */}
        <div className={`flex-1 flex flex-col justify-between transition-all duration-500 ${(browser.isOpen || desktopControlOpen) ? "lg:max-w-[50%] lg:border-r lg:border-white/10" : "w-full"}`} id="voice-pane">
          
          {/* Header Navigation */}
          <header className="w-full px-8 py-6 flex justify-between items-center shrink-0 z-40" id="hud-header">
            <div className="flex items-center gap-3 relative" id="hud-left">
              <button 
                onClick={() => { setShowProfileDropdown(!showProfileDropdown); setShowSettingsDropdown(false); }}
                className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-600 to-blue-400 shadow-md animate-pulse hover:scale-105 active:scale-95 transition-all cursor-pointer focus:outline-none" 
                id="header-avatar"
                aria-label="User Profile"
              />
              <span className="font-serif italic text-2xl font-light tracking-wide text-[#f0f0f0]" id="hud-logo">Avy</span>

              {showProfileDropdown && (
                <div className="absolute top-12 left-0 w-64 bg-[#0e111a] border border-white/10 rounded-2xl p-4 shadow-2xl z-50 animate-fade-in" id="profile-dropdown">
                  <div className="flex items-center gap-2.5 border-b border-white/5 pb-2.5 mb-3" id="profile-dropdown-user-header">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-cyan-600 to-violet-500 flex items-center justify-center font-bold text-white text-xs" id="profile-dropdown-badge">
                      R
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white" id="profile-dropdown-name">Rahul</h4>
                      <p className="text-[9px] font-mono text-slate-500" id="profile-dropdown-metadata">Age: 24 &bull; San Francisco</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 mb-3 leading-relaxed" id="profile-dropdown-description">
                    Avy matches responses to your long-term memory profile in real-time.
                  </p>
                  <button
                    onClick={() => {
                      openBrowserUrl("avy://memory", "Memory Hub");
                      setShowProfileDropdown(false);
                    }}
                    className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md active:scale-98"
                    id="profile-core-memory-btn"
                  >
                    <Brain className="w-3.5 h-3.5" /> Core Memory
                  </button>
                </div>
              )}
            </div>

            {/* Right HUD telemetry stats */}
            <div className="flex items-center gap-4 sm:gap-6" id="hud-right">
              <div className="flex flex-col items-end" id="telemetry-status">
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-mono">System Status</span>
                <span className={`text-xs font-mono font-semibold ${
                  status === "listening" ? "text-emerald-400" :
                  status === "speaking" ? "text-purple-400" :
                  status === "connecting" ? "text-cyan-400 animate-pulse" :
                  status === "error" ? "text-red-500" :
                  "text-slate-400"
                }`}>
                  {status === "disconnected" && "NEURAL_LINK_IDLE"}
                  {status === "connecting" && "ESTABLISHING_LINK"}
                  {status === "listening" && "LIVE_SESSION_ACTIVE"}
                  {status === "speaking" && "STREAMING_VOICE"}
                  {status === "error" && "UPLINK_FAILURE"}
                </span>
              </div>
              
              <div className="w-px h-8 bg-white/10" id="hud-divider" />
              
              <div className="flex flex-col items-end" id="telemetry-latency">
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-mono">Latency</span>
                <span className="text-xs font-mono text-slate-300">
                  {status === "disconnected" ? "---" : "142ms"}
                </span>
              </div>

              <div className="w-px h-8 bg-white/10 hidden sm:block" id="hud-divider-2" />

              {/* Settings Dropdown Button */}
              <div className="relative" id="settings-menu-container">
                <button 
                  onClick={() => { setShowSettingsDropdown(!showSettingsDropdown); setShowProfileDropdown(false); }}
                  className="hidden sm:flex items-center gap-1.5 px-4 py-2 rounded-full glass hover:bg-white/10 text-[11px] font-mono uppercase tracking-wider text-white/70 transition-all duration-300 active:scale-95 focus:outline-none cursor-pointer"
                  id="settings-hud-button"
                  aria-label="Settings"
                >
                  <Settings className="w-3.5 h-3.5 text-amber-400" />
                  <span>Settings</span>
                </button>

                {showSettingsDropdown && (
                  <div className="absolute top-12 right-0 w-64 bg-[#0e111a] border border-white/10 rounded-2xl p-4 shadow-2xl z-50 animate-fade-in space-y-4" id="settings-dropdown">
                    <div className="border-b border-white/5 pb-2" id="settings-dropdown-header">
                      <h4 className="text-xs font-bold text-slate-200">System Preferences</h4>
                    </div>
                    
                    {/* Theme Picker */}
                    <div className="space-y-1.5" id="settings-theme-picker-section">
                      <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block">INTERFACE THEME</span>
                      <div className="grid grid-cols-3 gap-1" id="settings-theme-grid">
                        {["cyan", "amber", "purple", "emerald", "crimson", "aurora"].map((t) => (
                          <button
                            key={t}
                            onClick={() => setTheme(t as any)}
                            className={`px-1.5 py-1 text-[9px] capitalize rounded transition-all cursor-pointer ${
                              theme === t 
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" 
                                : "bg-white/5 hover:bg-white/10 text-slate-300"
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Core Memory Action inside Settings */}
                    <div className="border-t border-white/5 pt-3" id="settings-core-memory-wrapper">
                      <button
                        onClick={() => {
                          openBrowserUrl("avy://memory", "Memory Hub");
                          setShowSettingsDropdown(false);
                        }}
                        className="w-full py-2 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md active:scale-98"
                        id="settings-core-memory-btn"
                      >
                        <Brain className="w-3.5 h-3.5" /> Core Memory
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Built-in Browser Trigger */}
              <button 
                onClick={() => {
                  setBrowserOpen(!browser.isOpen);
                  if (!browser.isOpen) {
                    setDesktopControlOpen(false);
                  }
                }}
                className={`hidden sm:flex items-center gap-1.5 px-4 py-2 rounded-full glass hover:bg-white/10 text-[11px] font-mono uppercase tracking-wider transition-all duration-300 active:scale-95 focus:outline-none cursor-pointer ${
                  browser.isOpen ? "border border-cyan-500/30 bg-cyan-500/10 text-cyan-300" : "text-white/70"
                }`}
                id="browser-hud-button"
                aria-label="Toggle Browser"
              >
                <Globe className="w-3.5 h-3.5 text-cyan-400" />
                <span>{browser.isOpen ? "Hide Browser" : "Browser"}</span>
              </button>

              {/* AVY Desktop Control Trigger */}
              <button 
                onClick={() => {
                  setDesktopControlOpen(!desktopControlOpen);
                  if (!desktopControlOpen) {
                    setBrowserOpen(false);
                  }
                }}
                className={`hidden sm:flex items-center gap-1.5 px-4 py-2 rounded-full glass hover:bg-white/10 text-[11px] font-mono uppercase tracking-wider transition-all duration-300 active:scale-95 focus:outline-none cursor-pointer ${
                  desktopControlOpen ? "border border-amber-500/30 bg-amber-500/10 text-amber-300" : "text-white/70"
                }`}
                id="desktop-hud-button"
                aria-label="Toggle Desktop Control"
              >
                <Monitor className="w-3.5 h-3.5 text-amber-400" />
                <span>{desktopControlOpen ? "Hide Desktop" : "Desktop Control"}</span>
              </button>

              {/* Quick Guide Trigger */}
              <button 
                onClick={() => setShowGuide(true)}
                className="hidden sm:flex items-center gap-1.5 px-4 py-2 rounded-full glass hover:bg-white/10 text-[11px] font-mono uppercase tracking-wider text-white/70 transition-all duration-300 active:scale-95 focus:outline-none cursor-pointer"
                id="guide-hud-button"
                aria-label="View Info"
              >
                <HelpCircle className="w-3.5 h-3.5 text-violet-400" />
                <span>Guide</span>
              </button>
            </div>
          </header>

          {/* Main Visualizer Section */}
          <main className="flex-1 flex flex-col items-center justify-center py-6 px-4 overflow-y-auto animate-fade-in" id="main-canvas">
            <div className={`w-full ${visualMode === "avatar" ? "max-w-4xl" : "max-w-lg"} mx-auto flex flex-col items-center justify-center text-center transition-all duration-300`} id="visualizer-container">
              
              {/* Visualizer Mode Switcher */}
              <div className="flex gap-1 p-1 rounded-full bg-white/5 border border-white/5 mb-8" id="visualizer-mode-toggle-group">
                <button
                  onClick={() => setVisualMode("avatar")}
                  className={`px-4 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                    visualMode === "avatar"
                      ? "bg-purple-600/25 text-purple-300 border border-purple-500/20 font-semibold"
                      : "text-slate-400 hover:text-white border-transparent"
                  }`}
                  id="toggle-mode-avatar-btn"
                >
                  <Sparkles className="w-3.5 h-3.5" /> 3D Companion
                </button>
              </div>

              {/* Dynamic State Headline */}
              <div className="mb-8 text-center animate-fade-in" id="main-banner">
                <h2 className="text-3xl font-light font-serif italic tracking-wide text-[#f0f0f0] mb-2" id="main-welcome-title">
                  {status === "disconnected" && "Speak to Avy"}
                  {status === "connecting" && "Summoning Avy..."}
                  {status === "listening" && "Listening..."}
                  {status === "speaking" && "Avy is talking"}
                  {status === "error" && "Connection Error"}
                </h2>
                <p className="text-white/40 text-[10px] tracking-[0.25em] uppercase font-mono" id="main-welcome-subtitle">
                  {status === "disconnected" && "Tap to establish connection and start speaking"}
                  {status === "connecting" && "Initializing ultra-low latency voice bridge"}
                  {status === "listening" && "Speak now, I'm all ears"}
                  {status === "speaking" && "Real-time 24kHz audio synthesis"}
                  {status === "error" && "Microphone or server link failed"}
                </p>
              </div>

              {visualMode === "avatar" ? (
                <div className="w-full animate-fade-in space-y-4" id="avy-avatar-3d-wrapper">
                  <AvyAvatar3D 
                    status={status}
                    theme={theme}
                    outputAnalyser={outputAnalyser}
                    inputAnalyser={inputAnalyser}
                  />
                  
                  {/* Quick Action Button underneath avatar */}
                  <div className="flex items-center justify-center gap-4" id="avatar-call-controls">
                    <button
                      onClick={handleOrbClick}
                      className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer shadow-lg active:scale-95 relative group ${
                        status === "disconnected" || status === "error"
                          ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20 hover:shadow-emerald-500/30"
                          : status === "connecting"
                          ? "bg-amber-600/40 border border-amber-500/30 text-amber-300 shadow-amber-500/10 cursor-not-allowed"
                          : status === "listening"
                          ? "bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/30 hover:shadow-purple-500/40 animate-pulse"
                          : "bg-pink-600 hover:bg-pink-500 text-white shadow-pink-600/30 hover:shadow-pink-500/40"
                      }`}
                      id="avatar-quick-call-btn"
                      title={
                        status === "disconnected" || status === "error"
                          ? "Connect Avy Voice Link"
                          : status === "connecting"
                          ? "Connecting..."
                          : status === "listening"
                          ? "Listening... (Click to disconnect)"
                          : "Avy Speaking... (Click to disconnect)"
                      }
                    >
                      {status === "disconnected" || status === "error" ? (
                        <Phone className="w-5 h-5" />
                      ) : status === "connecting" ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : status === "listening" ? (
                        <Mic className="w-5 h-5" />
                      ) : (
                        <Volume2 className="w-5 h-5" />
                      )}

                      {/* Ripple pulse animations for active call states */}
                      {status !== "disconnected" && status !== "error" && status !== "connecting" && (
                        <span className={`absolute -inset-2 rounded-full border-2 ${
                          status === "listening" ? "border-purple-500/20 animate-ping" : "border-pink-500/20 animate-ping"
                        }`} />
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="w-full flex flex-col items-center justify-center animate-fade-in" id="avy-orb-mode-container">
                  {/* Core Animated Interactive Orb Button */}
                  <AvyOrb 
                    status={status}
                    theme={theme}
                    inputAnalyser={inputAnalyser}
                    outputAnalyser={outputAnalyser}
                    onClick={handleOrbClick}
                  />

                  {/* Dynamic Live Waveform Bars */}
                  <Waveform 
                    status={status}
                    inputAnalyser={inputAnalyser}
                    outputAnalyser={outputAnalyser}
                  />
                </div>
              )}

              {/* Mobile Quick Actions (Toggling Browser) */}
              {!browser.isOpen && (
                <div className="mt-6 block sm:hidden">
                  <button
                    onClick={() => setBrowserOpen(true)}
                    className="px-5 py-2.5 rounded-full bg-cyan-950/80 border border-cyan-500/20 text-[11px] uppercase tracking-wider font-mono text-cyan-300 hover:bg-cyan-900 transition-all active:scale-95 flex items-center gap-2 mx-auto"
                    id="mobile-browser-trigger-btn"
                  >
                    <Globe className="w-3.5 h-3.5" /> Open Browser
                  </button>
                </div>
              )}

              {/* Action Cards for Suggested Links */}
              <ActionCards websites={websites} />

              {/* Core Memory Dashboard Quick Access Panel */}
              <div 
                className="w-full max-w-md mx-auto mt-6 p-4 rounded-2xl bg-[#0e111a]/80 border border-white/5 shadow-xl flex flex-col justify-between items-center text-center backdrop-blur-md relative overflow-hidden" 
                id="dashboard-core-memory-banner"
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/5 to-purple-500/5 pointer-events-none" />
                
                <div className="flex items-center gap-2 mb-1.5 z-10">
                  <Brain className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-semibold tracking-wider uppercase font-mono text-slate-300">
                    Memory Core System
                  </h3>
                </div>
                
                <p className="text-[11px] text-slate-400 max-w-xs mb-3 leading-relaxed z-10">
                  Manage personal facts, interests, and goals extracted during conversations.
                </p>

                <button
                  onClick={() => openBrowserUrl("avy://memory", "Memory Hub")}
                  className="px-5 py-2 rounded-full bg-gradient-to-r from-cyan-600 to-violet-600 hover:from-cyan-500 hover:to-violet-500 text-white font-semibold text-[11px] tracking-wide shadow-lg active:scale-95 transition-all cursor-pointer z-10 flex items-center gap-1.5"
                  id="dashboard-core-memory-btn"
                >
                  <Brain className="w-3.5 h-3.5" /> Core Memory
                </button>
              </div>

              {/* Type message fallback */}
              <form 
                onSubmit={handleSendText}
                className="w-full max-w-md mx-auto mt-6 flex items-center gap-2 p-1.5 rounded-2xl bg-white/[0.03] border border-white/10 focus-within:border-cyan-500/50 focus-within:shadow-[0_0_15px_rgba(34,211,238,0.15)] transition-all duration-300 backdrop-blur-md relative overflow-hidden"
                id="keyboard-input-form"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-purple-500/5 pointer-events-none" />
                <div className="pl-3 text-slate-400 flex items-center z-10">
                  <Keyboard className="w-4 h-4 text-cyan-500/80" />
                </div>
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder={
                    status === "disconnected" || status === "error"
                      ? "Type to connect & message Avy..."
                      : "Type a message or website command..."
                  }
                  className="flex-1 bg-transparent border-0 outline-none focus:ring-0 text-xs text-white placeholder-slate-500 py-2.5 px-2 z-10"
                  id="keyboard-message-input"
                />
                <button
                  type="submit"
                  disabled={!textInput.trim() || status === "connecting"}
                  className={`p-2 rounded-xl flex items-center justify-center transition-all z-10 ${
                    textInput.trim() && status !== "connecting"
                      ? "bg-cyan-600/20 hover:bg-cyan-600/35 text-cyan-300 border border-cyan-500/20 active:scale-95 cursor-pointer"
                      : "text-slate-600 cursor-not-allowed"
                  }`}
                  id="keyboard-send-btn"
                  title="Send message or open website"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>

              {/* Error Details */}
              {error && (
                <div className="mt-6 max-w-md p-4 rounded-2xl bg-red-950/20 border border-red-500/20 backdrop-blur-md text-center" id="error-alert">
                  <p className="text-xs text-red-400/90 font-mono leading-relaxed">{error}</p>
                </div>
              )}
            </div>
          </main>

          {/* Bottom Badges and Quote Footer */}
          <footer className="w-full p-8 flex flex-col md:flex-row justify-between items-center md:items-end gap-6 shrink-0" id="app-footer">
            <div className="flex flex-wrap gap-2.5 justify-center md:justify-start" id="footer-badges">
              <div className="glass px-4 py-2 rounded-full inline-flex items-center gap-3 shadow-sm" id="tool-badge">
                <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-white/60 font-mono">
                  Tool: Browser Interface
                </span>
              </div>
              <div className="glass px-4 py-2 rounded-full inline-flex items-center gap-3 shadow-sm" id="voice-badge">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-white/60 font-mono">
                  Voice: Charming Female
                </span>
              </div>
              {status !== "disconnected" && (
                <div className="glass px-4 py-2 rounded-full inline-flex items-center gap-3 shadow-sm capitalize" id="theme-badge">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-[11px] font-medium uppercase tracking-wider text-white/60 font-mono">
                    Style: {theme}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-col items-center md:items-end gap-2 text-center md:text-right max-w-sm" id="footer-quote">
              <div className="font-serif italic text-lg text-white/80 leading-relaxed" id="footer-main-quote">
                {status === "disconnected" && "\"Ready to explore the future of live speech? tap to connect.\""}
                {status === "connecting" && "\"Hold on tight while I sync up your system.\""}
                {status === "listening" && "\"I'm listening, go ahead and ask me anything!\""}
                {status === "speaking" && "\"You're looking sharp today, ready to conquer the web?\""}
                {status === "error" && "\"Oh no, something went sideways with the link.\""}
              </div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/30 font-mono" id="footer-quote-label">
                {status === "speaking" ? "Active Synthesis" : "Companion Guidance"}
              </div>
            </div>
          </footer>

        </div>

        {/* Right Side: Embedded Custom-Engine Browser Panel */}
        <BuiltInBrowser
          browser={browser}
          setBrowserOpen={setBrowserOpen}
          openBrowserUrl={openBrowserUrl}
          closeBrowserTab={closeBrowserTab}
          newBrowserTab={newBrowserTab}
          goBack={goBack}
          goForward={goForward}
          toggleDesktopView={toggleDesktopView}
          togglePrivateMode={togglePrivateMode}
          toggleBookmark={toggleBookmark}
          clearBrowserHistory={clearBrowserHistory}
          setActiveTab={setActiveTab}
          toggleShowBookmarks={toggleShowBookmarks}
          toggleShowHistory={toggleShowHistory}
          restoreLastClosedTab={restoreLastClosedTab}
          updateActiveTabUrlAndTitle={updateActiveTabUrlAndTitle}
        />

        {/* Right Side: Interactive AI Voice Desktop Control Panel */}
        <AvyDesktopControl
          isOpen={desktopControlOpen}
          onClose={() => setDesktopControlOpen(false)}
        />

      </div>

      {/* Guide Overlay Modal */}
      {showGuide && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300" id="guide-modal-overlay">
          <div className="w-full max-w-md bg-slate-900/90 border border-white/10 rounded-3xl p-6 shadow-2xl relative" id="guide-modal">
            
            <button 
              onClick={() => setShowGuide(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-full hover:bg-white/5 transition-colors cursor-pointer"
              aria-label="Close Guide"
              id="close-guide-button"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4" id="guide-modal-header">
              <Smile className="w-6 h-6 text-violet-400" />
              <h3 className="text-lg font-bold text-white font-serif italic">Avy Conversation Guide</h3>
            </div>

            <div className="space-y-4 text-slate-300 text-sm leading-relaxed" id="guide-modal-body">
              <p>
                Avy is a modern **audio-to-audio ONLY AI companion**. No text input required. Once you activate the core, speak naturally as with a human friend.
              </p>

              <div>
                <p className="font-semibold text-slate-200 mb-2 font-serif italic">Personality Profile:</p>
                <ul className="list-disc list-inside space-y-1 text-xs text-slate-400 pl-1 font-mono">
                  <li>Confident, warm, playful, and witty.</li>
                  <li>Loves light-hearted banter and clever responses.</li>
                  <li>Context-aware conversational memory.</li>
                  <li>Supports active interruption (barge-in) instantly.</li>
                </ul>
              </div>

              <div>
                <p className="font-semibold text-slate-200 mb-2 font-serif italic">Available Actions / Tools:</p>
                <div className="space-y-2 text-xs font-mono">
                  <div className="p-2.5 rounded-xl bg-slate-950/60 border border-white/5">
                    <span className="text-violet-400 font-semibold block">&bull; Change Theme Colors</span>
                    <p className="text-slate-400 mt-0.5">"Change your theme to purple" or "Set lighting to emerald"</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/60 border border-white/5">
                    <span className="text-violet-400 font-semibold block">&bull; Time & Date Checks</span>
                    <p className="text-slate-400 mt-0.5">"What's the date today?" or "Give me the time"</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/60 border border-white/5">
                    <span className="text-cyan-400 font-semibold block">&bull; Fully Integrated Web Browser</span>
                    <p className="text-slate-400 mt-0.5">"Open Wikipedia", "Search for latest AI news", or click "Browser" above!</p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowGuide(false)}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 font-semibold text-white transition-all duration-300 shadow-lg active:scale-[0.98] mt-2 cursor-pointer text-center"
                id="guide-dismiss-button"
              >
                Summon Avy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
