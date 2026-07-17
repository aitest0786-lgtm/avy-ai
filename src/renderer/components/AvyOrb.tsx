import React, { useEffect, useRef } from "react";
import { CompanionState, AssistantTheme } from "../types";
import { Power, Mic, MicOff, Volume2 } from "lucide-react";

interface AvyOrbProps {
  status: CompanionState;
  theme: AssistantTheme;
  inputAnalyser: React.RefObject<AnalyserNode | null>;
  outputAnalyser: React.RefObject<AnalyserNode | null>;
  onClick: () => void;
}

const THEME_COLORS: Record<AssistantTheme, { primary: string; secondary: string; shadow: string; glow: string }> = {
  cyan: {
    primary: "rgba(6, 182, 212, 0.8)", // cyan-500
    secondary: "rgba(59, 130, 246, 0.4)", // blue-500
    shadow: "rgba(6, 182, 212, 0.5)",
    glow: "rgba(6, 182, 212, 0.2)"
  },
  amber: {
    primary: "rgba(245, 158, 11, 0.8)", // amber-500
    secondary: "rgba(239, 68, 68, 0.4)", // red-500
    shadow: "rgba(245, 158, 11, 0.5)",
    glow: "rgba(245, 158, 11, 0.2)"
  },
  purple: {
    primary: "rgba(168, 85, 247, 0.8)", // purple-500
    secondary: "rgba(99, 102, 241, 0.4)", // indigo-500
    shadow: "rgba(168, 85, 247, 0.5)",
    glow: "rgba(168, 85, 247, 0.2)"
  },
  emerald: {
    primary: "rgba(16, 185, 129, 0.8)", // emerald-500
    secondary: "rgba(20, 184, 166, 0.4)", // teal-500
    shadow: "rgba(16, 185, 129, 0.5)",
    glow: "rgba(16, 185, 129, 0.2)"
  },
  crimson: {
    primary: "rgba(239, 68, 68, 0.8)", // red-500
    secondary: "rgba(146, 64, 14, 0.4)", // amber-800
    shadow: "rgba(239, 68, 68, 0.5)",
    glow: "rgba(239, 68, 68, 0.2)"
  },
  aurora: {
    primary: "rgba(34, 197, 94, 0.8)", // green-500
    secondary: "rgba(168, 85, 247, 0.4)", // purple-500
    shadow: "rgba(59, 130, 246, 0.5)", // blue-500
    glow: "rgba(34, 197, 94, 0.2)"
  }
};

export const AvyOrb: React.FC<AvyOrbProps> = ({
  status,
  theme,
  inputAnalyser,
  outputAnalyser,
  onClick
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const phaseRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set pixel density scaling for ultra-crisp retina display
    const dpr = window.devicePixelRatio || 1;
    const width = 360;
    const height = 360;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const colors = THEME_COLORS[theme];
    const center = width / 2;
    const baseRadius = 80;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      phaseRef.current += 0.05;

      // Get real-time volume data depending on current state
      let volume = 0;
      let frequencyData: Uint8Array | null = null;

      if (status === "listening" && inputAnalyser.current) {
        const analyser = inputAnalyser.current;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          const val = (dataArray[i] - 128) / 128;
          sum += val * val;
        }
        volume = Math.min(1, Math.sqrt(sum / bufferLength) * 3.5);
      } else if (status === "speaking" && outputAnalyser.current) {
        const analyser = outputAnalyser.current;
        const bufferLength = analyser.frequencyBinCount;
        frequencyData = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(frequencyData);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += frequencyData[i];
        }
        volume = Math.min(1, (sum / bufferLength) / 100);
      }

      // Dynamic scaling factor driven by audio output amplitude
      const dynamicScale = 1 + volume * 0.4;
      const radius = baseRadius * dynamicScale;

      // Draw background glow layers
      ctx.save();
      const glowGrad = ctx.createRadialGradient(center, center, radius * 0.4, center, center, radius * 2.2);
      
      let glowColor1 = colors.glow;
      let glowColor2 = "rgba(0,0,0,0)";
      if (status === "connecting") {
        glowColor1 = theme === "aurora" ? "rgba(59,130,246,0.3)" : colors.shadow;
      } else if (status === "speaking") {
        glowColor1 = colors.primary.replace("0.8", "0.35");
      } else if (status === "listening") {
        glowColor1 = colors.primary.replace("0.8", "0.25");
      }

      glowGrad.addColorStop(0, glowColor1);
      glowGrad.addColorStop(1, glowColor2);
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(center, center, radius * 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // State Renderers
      if (status === "disconnected") {
        // Slow calm breathing pulse
        const breath = Math.sin(phaseRef.current * 0.4) * 4;
        const finalRadius = baseRadius + breath;

        ctx.strokeStyle = "rgba(100, 116, 139, 0.35)"; // slate-400
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(center, center, finalRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = "rgba(100, 116, 139, 0.15)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(center, center, finalRadius + 10, 0, Math.PI * 2);
        ctx.stroke();

      } else if (status === "connecting") {
        // Spinning holographic orbit ring
        ctx.save();
        ctx.translate(center, center);
        ctx.rotate(phaseRef.current * 1.5);

        const grad = ctx.createLinearGradient(-radius, -radius, radius, radius);
        grad.addColorStop(0, colors.primary);
        grad.addColorStop(0.5, "rgba(255,255,255,0.1)");
        grad.addColorStop(1, colors.secondary);

        ctx.strokeStyle = grad;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 1.6); // slight gap
        ctx.stroke();

        // Orb dot tracker
        ctx.fillStyle = colors.primary;
        ctx.beginPath();
        ctx.arc(radius * Math.cos(Math.PI * 1.6), radius * Math.sin(Math.PI * 1.6), 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

      } else if (status === "listening") {
        // Microphone sound-capturing ripples
        ctx.strokeStyle = colors.primary;
        ctx.lineWidth = 2;
        
        // Ripple layers
        for (let j = 0; j < 3; j++) {
          const ripplePhase = (phaseRef.current * 0.5 + j * 0.3) % 1.0;
          const rippleRadius = radius + ripplePhase * 60;
          const alpha = 1 - ripplePhase;

          ctx.strokeStyle = colors.primary.replace("0.8", (alpha * 0.7).toFixed(2));
          ctx.beginPath();
          ctx.arc(center, center, rippleRadius, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Inner micro-bars
        ctx.strokeStyle = colors.secondary;
        ctx.lineWidth = 1.5;
        const barCount = 48;
        for (let i = 0; i < barCount; i++) {
          const angle = (i / barCount) * Math.PI * 2;
          const amplitude = Math.sin(angle * 5 + phaseRef.current * 2) * 8 * volume;
          const startR = radius - 8 + amplitude;
          const endR = radius + 2 + amplitude * 1.5;

          const sx = center + startR * Math.cos(angle);
          const sy = center + startR * Math.sin(angle);
          const ex = center + endR * Math.cos(angle);
          const ey = center + endR * Math.sin(angle);

          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.stroke();
        }

      } else if (status === "speaking") {
        // Fluid sine-wave ribbons
        const waveCount = 3;
        for (let w = 0; w < waveCount; w++) {
          ctx.strokeStyle = w === 0 ? colors.primary : colors.secondary;
          ctx.lineWidth = w === 0 ? 3 : 1.5;
          ctx.beginPath();

          const points: { x: number; y: number }[] = [];
          const segments = 120;
          const wavePhase = phaseRef.current * (1.2 + w * 0.3);

          for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            
            // Generate radial wave offsets using frequency data
            let scaleOffset = 0;
            if (frequencyData) {
              const freqIndex = Math.floor((i / segments) * (frequencyData.length * 0.5));
              scaleOffset = (frequencyData[freqIndex] / 255.0) * 22;
            } else {
              scaleOffset = Math.sin(angle * 6 + wavePhase) * 12 * volume;
            }

            const r = radius + scaleOffset + Math.sin(angle * (4 + w) + wavePhase) * (5 + volume * 15);
            const x = center + r * Math.cos(angle);
            const y = center + r * Math.sin(angle);
            points.push({ x, y });
          }

          ctx.moveTo(points[0].x, points[0].y);
          for (let p = 1; p < points.length; p++) {
            ctx.lineTo(points[p].x, points[p].y);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }

      // Draw the central glassmorphism core button
      ctx.save();
      const coreGrad = ctx.createRadialGradient(center, center, 0, center, center, baseRadius - 10);
      coreGrad.addColorStop(0, "rgba(30, 41, 59, 0.95)"); // slate-800
      coreGrad.addColorStop(1, "rgba(15, 23, 42, 0.95)"); // slate-900
      ctx.fillStyle = coreGrad;
      
      // Shadow for deep inset button feel
      ctx.shadowBlur = 20;
      ctx.shadowColor = colors.shadow;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;

      ctx.beginPath();
      ctx.arc(center, center, baseRadius - 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Border shine
      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(center, center, baseRadius - 5, 0, Math.PI * 2);
      ctx.stroke();

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [status, theme, inputAnalyser, outputAnalyser]);

  // Dynamic icon and status colors inside the central button
  const getIcon = () => {
    switch (status) {
      case "disconnected":
        return <Power className="w-10 h-10 text-slate-400 group-hover:text-red-400 transition-colors duration-300" id="power-icon" />;
      case "connecting":
        return <Mic className="w-10 h-10 text-cyan-400 animate-pulse" id="mic-icon" />;
      case "listening":
        return <Mic className="w-10 h-10 text-green-400 scale-110 transition-transform duration-300" id="mic-icon" />;
      case "speaking":
        return <Volume2 className="w-10 h-10 text-purple-400 animate-bounce" id="volume-icon" />;
      case "error":
        return <MicOff className="w-10 h-10 text-red-500" id="micoff-icon" />;
      default:
        return <Mic className="w-10 h-10 text-slate-400" id="mic-icon" />;
    }
  };

  return (
    <div className="flex flex-col items-center justify-center relative select-none" id="avy-orb-wrapper">
      {/* Interactive canvas component */}
      <div 
        onClick={onClick}
        className="relative group cursor-pointer transition-transform duration-500 hover:scale-[1.03] active:scale-[0.98] focus:outline-none"
        style={{ width: "360px", height: "360px" }}
        role="button"
        tabIndex={0}
        aria-label="Toggle Avy Voice Session"
        id="avy-orb-interactive"
      >
        <canvas ref={canvasRef} className="absolute inset-0 z-0" id="avy-visualizer-canvas" />
        
        {/* Central Overlay for Icons */}
        <div 
          className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none"
          id="avy-orb-center-overlay"
        >
          <div className="w-[120px] h-[120px] rounded-full bg-slate-950/20 backdrop-blur-sm flex items-center justify-center border border-white/5 shadow-inner">
            {getIcon()}
          </div>
        </div>
      </div>

      {/* Helper text under button */}
      <div className="text-center mt-6 transition-all duration-300" id="avy-status-label">
        <span className={`text-xs font-mono tracking-widest uppercase px-3 py-1 rounded-full border ${
          status === "disconnected" ? "text-slate-400 border-slate-800 bg-slate-900/40" :
          status === "connecting" ? "text-cyan-400 border-cyan-500/20 bg-cyan-950/20 animate-pulse" :
          status === "listening" ? "text-emerald-400 border-emerald-500/20 bg-emerald-950/20" :
          status === "speaking" ? "text-purple-400 border-purple-500/20 bg-purple-950/20" :
          "text-red-400 border-red-500/20 bg-red-950/20"
        }`}>
          {status === "disconnected" && "Tap to summon Avy"}
          {status === "connecting" && "Initializing Live Bridge..."}
          {status === "listening" && "Avy is Listening..."}
          {status === "speaking" && "Avy is Speaking..."}
          {status === "error" && "Link Broken / Tap to Retry"}
        </span>
      </div>
    </div>
  );
};
