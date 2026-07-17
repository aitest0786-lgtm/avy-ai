import React, { useEffect, useRef, useState } from "react";
import { CompanionState, AssistantTheme } from "../types";
import { Sparkles } from "lucide-react";

interface AvyAvatar3DProps {
  status: CompanionState;
  theme: AssistantTheme;
  outputAnalyser: React.RefObject<AnalyserNode | null>;
  inputAnalyser?: React.RefObject<AnalyserNode | null>;
  onCommandTriggered?: (command: string) => void;
}

// Animation states
type AnimationState = "IDLE" | "HEY" | "THINKING" | "TALKING" | "LAUGH";

// Map states to assets in the /assets folder as served by the server (excluding IDLE which uses Avy.png)
const VIDEO_PATHS: Record<Exclude<AnimationState, "IDLE">, string> = {
  HEY: "http://127.0.0.1:3000/assets/HEY.mp4",
  THINKING: "http://127.0.0.1:3000/assets/THINKING.mp4",
  TALKING: "http://127.0.0.1:3000/assets/TALKING.mp4",
  LAUGH: "http://127.0.0.1:3000/assets/LAUGH.mp4",
};

// Custom hook to pre-fetch and cache assets (images & videos) for zero-latency transitions
const useAssetPrefetch = (imageUrls: string[], videoUrls: string[]) => {
  const [isPrefetched, setIsPrefetched] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let active = true;
    const totalAssets = imageUrls.length + videoUrls.length;
    if (totalAssets === 0) {
      setIsPrefetched(true);
      return;
    }

    let loadedCount = 0;

    const incrementProgress = () => {
      if (!active) return;
      loadedCount++;
      setProgress(Math.round((loadedCount / totalAssets) * 100));
      if (loadedCount === totalAssets) {
        setIsPrefetched(true);
      }
    };

    // Preload Images
    imageUrls.forEach((url) => {
      const img = new Image();
      img.onload = incrementProgress;
      img.onerror = () => {
        console.error(`Failed to load asset from path: ${url}`);
        incrementProgress(); // Count as loaded on error to prevent infinite hanging
      };
      img.src = url;
    });

    // Preload Videos
    videoUrls.forEach((url) => {
      fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          return response.blob();
        })
        .then(() => {
          incrementProgress();
        })
        .catch(() => {
          // Fallback: create temporary video element to trigger caching
          const video = document.createElement("video");
          video.src = url;
          video.preload = "auto";
          video.oncanplaythrough = incrementProgress;
          video.onerror = incrementProgress;
        });
    });

    return () => {
      active = false;
    };
  }, [imageUrls, videoUrls]);

  return { isPrefetched, progress };
};

export const AvyAvatar3D: React.FC<AvyAvatar3DProps> = ({
  status,
  theme,
  outputAnalyser,
  inputAnalyser,
  onCommandTriggered,
}) => {
  const { isPrefetched, progress } = useAssetPrefetch(
    ["/assets/AVY.png"],
    Object.values(VIDEO_PATHS)
  );

  const [animationState, setAnimationState] = useState<AnimationState>("IDLE");
  const [isActuallySpeaking, setIsActuallySpeaking] = useState(false);
  const [loadedVideos, setLoadedVideos] = useState<Record<string, boolean>>({});
  const [playingKeys, setPlayingKeys] = useState<string[]>(["IDLE"]);
  const [expression, setExpression] = useState<string>("Listening");

  useEffect(() => {
    if (animationState !== "TALKING") {
      setIsActuallySpeaking(false);
    }
  }, [animationState]);

  // Video Refs (excluding IDLE which uses Avy.png)
  const videoRefs: Record<Exclude<AnimationState, "IDLE">, React.RefObject<HTMLVideoElement | null>> = {
    HEY: useRef<HTMLVideoElement | null>(null),
    THINKING: useRef<HTMLVideoElement | null>(null),
    TALKING: useRef<HTMLVideoElement | null>(null),
    LAUGH: useRef<HTMLVideoElement | null>(null),
  };

  // Preload all video assets on start
  useEffect(() => {
    Object.values(videoRefs).forEach((ref) => {
      if (ref.current) {
        ref.current.load();
      }
    });
  }, []);

  // Set greeting state on start of connection
  const hasGreetedOnStart = useRef(false);
  useEffect(() => {
    if (status === "listening" && !hasGreetedOnStart.current) {
      setAnimationState("HEY");
      hasGreetedOnStart.current = true;
    }
    if (status === "disconnected") {
      hasGreetedOnStart.current = false;
      setAnimationState("IDLE");
    }
  }, [status]);

    // Video transition controllers
  const handleVideoCanPlay = (key: Exclude<AnimationState, "IDLE">) => {
    setLoadedVideos((prev) => ({ ...prev, [key]: true }));
  };

  const handleVideoError = (key: Exclude<AnimationState, "IDLE">) => {
    console.warn(`[Avy Video] Failed to load video state: ${key}`);
    setLoadedVideos((prev) => ({ ...prev, [key]: false }));
  };

  const handleVideoEnded = (key: Exclude<AnimationState, "IDLE">) => {
    // When non-looping videos (HEY and LAUGH) end, transition back
    if (key === "HEY") {
      setAnimationState("IDLE");
    } else if (key === "LAUGH") {
      if (status === "speaking") {
        setAnimationState("TALKING");
      } else {
        setAnimationState("IDLE");
      }
    }
  };

  const lastSpeakingTimeRef = useRef<number>(0);
  const hasUserSpokenInThisTurnRef = useRef<boolean>(false);

  // Voice Activity Detection (VAD) via inputAnalyser
  useEffect(() => {
    let interval: number;
    if (status === "listening" && inputAnalyser?.current) {
      const analyser = inputAnalyser.current;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      let silentCount = 0;

      interval = window.setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const averageVolume = sum / bufferLength;

        if (averageVolume > 8) {
          lastSpeakingTimeRef.current = Date.now();
          hasUserSpokenInThisTurnRef.current = true;
          silentCount = 0;
          // Switch to IDLE/Listening state when user is speaking
          if (animationState !== "IDLE" && animationState !== "HEY" && animationState !== "LAUGH") {
            setAnimationState("IDLE");
          }
        } else {
          if (hasUserSpokenInThisTurnRef.current) {
            silentCount += 1;
            // If silent for ~1 second (20 * 50ms) -> trigger thinking animation
            if (silentCount > 20) {
              if (animationState !== "THINKING" && animationState !== "HEY") {
                setAnimationState("THINKING");
              }
              hasUserSpokenInThisTurnRef.current = false;
            }
          }
        }
      }, 50);
    }
    return () => clearInterval(interval);
  }, [status, inputAnalyser, animationState]);

  // Synchronize status transitions (Instant switch to TALKING when server speaks)
  useEffect(() => {
    if (status === "speaking") {
      if (animationState !== "LAUGH") {
        setAnimationState("TALKING");
      }
    } else if (status === "listening") {
      if (animationState === "TALKING") {
        setAnimationState("IDLE");
      }
    }
  }, [status, animationState]);

  // Handle express level mapping from incoming WebSocket customization tool calls
  useEffect(() => {
    if (expression === "Laughing") {
      setAnimationState("LAUGH");
    } else if (expression === "Thinking") {
      setAnimationState("THINKING");
    } else if (expression === "Happy" || expression === "Excited") {
      if (status !== "speaking") {
        setAnimationState("HEY");
      }
    }
  }, [expression, status]);

  // Listen to customization triggers from server/WebSocket
  useEffect(() => {
    const handleVoiceCustomization = (e: Event) => {
      const customEvent = e as CustomEvent;
      const data = customEvent.detail;
      if (data && typeof data === "object") {
        if (data.expression) {
          setExpression(data.expression);
        }
      }
    };
    window.addEventListener("avy-voice-customization", handleVoiceCustomization);
    return () => {
      window.removeEventListener("avy-voice-customization", handleVoiceCustomization);
    };
  }, []);

    // Hardware-accelerated transitions & delayed play/pause cleanups
  useEffect(() => {
    setPlayingKeys((prev) => {
      if (prev.includes(animationState)) return prev;
      return [...prev, animationState];
    });

    const currentVideo = animationState !== "IDLE" ? videoRefs[animationState]?.current : null;
    if (currentVideo && loadedVideos[animationState]) {
      if (animationState === "HEY" || animationState === "LAUGH") {
        currentVideo.currentTime = 0;
      }
      if (currentVideo.paused) {
        currentVideo.play().catch(() => {});
      }
    }

    const timer = setTimeout(() => {
      setPlayingKeys([animationState]);

      Object.entries(videoRefs).forEach(([key, ref]) => {
        if (key !== animationState && ref.current) {
          if (key === "TALKING" || animationState !== "TALKING") {
            ref.current.pause();
          }
        }
      });
    }, 600);

    if (animationState !== "TALKING" && videoRefs.TALKING.current) {
      videoRefs.TALKING.current.pause();
    }

    return () => clearTimeout(timer);
  }, [animationState, loadedVideos]);

  // Optimized Voice / Lip Sync
  useEffect(() => {
    let animFrame: number;
    const syncMouth = () => {
      const video = videoRefs.TALKING.current;
      if (video && animationState === "TALKING" && loadedVideos["TALKING"]) {
        if (outputAnalyser?.current) {
          const analyser = outputAnalyser.current;
          const array = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(array);
          const total = array.reduce((a, b) => a + b, 0);
          const volume = total / array.length;

          if (volume > 1.5) {
            setIsActuallySpeaking(true);
            if (video.paused) {
              video.play().catch(() => {});
            }
            video.playbackRate = Math.min(1.4, Math.max(0.6, volume / 8));
          } else {
            setIsActuallySpeaking(false);
            if (!video.paused) {
              video.pause();
            }
          }
        } else {
          setIsActuallySpeaking(true);
          if (video.paused) {
            video.play().catch(() => {});
          }
          video.playbackRate = 1.0;
        }
      } else {
        setIsActuallySpeaking(false);
      }
      animFrame = requestAnimationFrame(syncMouth);
    };

    if (animationState === "TALKING" && loadedVideos["TALKING"]) {
      animFrame = requestAnimationFrame(syncMouth);
    } else {
      setIsActuallySpeaking(false);
    }
    return () => {
      cancelAnimationFrame(animFrame);
      setIsActuallySpeaking(false);
    };
  }, [animationState, loadedVideos, outputAnalyser]);

  // Local speech recognition keywords
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      const result = event.results[event.results.length - 1];
      if (result.isFinal) {
        const text = result[0].transcript.trim().toLowerCase();

        const stopKeywords = ["stop", "cancel", "abort", "exit", "halt", "stop now", "enough", "quit task", "return to idle"];
        if (stopKeywords.some((keyword) => text === keyword || text.startsWith(keyword + " ") || text.endsWith(" " + keyword) || text.includes(" " + keyword + " "))) {
          console.warn("[AvyAvatar3D] EMERGENCY STOP DETECTED VIA LOCAL SPEECH RECOGNITION:", text);
          window.dispatchEvent(new CustomEvent("avy-emergency-stop"));
        }

        const greetingKeywords = [
          "hi",
          "hello",
          "hey",
          "good morning",
          "good afternoon",
          "good evening",
          "welcome back",
        ];
        if (greetingKeywords.some((keyword) => text.includes(keyword))) {
          setAnimationState("HEY");
        }

        const laughKeywords = ["haha", "funny", "joke", "lol", "laughing"];
        if (laughKeywords.some((keyword) => text.includes(keyword))) {
          setAnimationState("LAUGH");
        }
      }
    };

    recognition.onerror = () => {};

    if (status === "listening") {
      try {
        recognition.start();
      } catch (e) {}
    }

    return () => {
      try {
        recognition.stop();
      } catch (e) {}
    };
  }, [status]);

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col select-none" id="avy-avatar-3d-pane">
      {/* 3D AVATAR STAGE */}
      <div
        className="w-full relative flex flex-col items-center justify-center bg-slate-950/80 border border-white/5 rounded-3xl overflow-hidden shadow-2xl aspect-[4/3] min-h-[350px] md:min-h-[460px]"
        id="avy-avatar-stage"
      >
        {/* Environment Light Reflection Background */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none z-20" />

        {/* Dynamic Watermark HUD overlay */}
        <div
          className="absolute top-4 left-4 flex items-center gap-1.5 font-mono text-[9px] text-white/40 tracking-widest uppercase z-30"
          id="avatar-hud-left"
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span>{isPrefetched ? "AVATAR_SYS_ACTIVE [CACHED]" : `AVATAR_PRELOADING [${progress}%]`}</span>
        </div>

        <div
          className="absolute top-4 right-4 flex items-center gap-2 font-mono text-[9px] tracking-wider z-30"
          id="avatar-hud-right"
        >
          <span className="text-white/40">STATE:</span>
          <span className="text-cyan-400 px-1.5 py-0.5 rounded bg-cyan-950/40 border border-cyan-500/20 uppercase">
            {animationState}
          </span>
        </div>

                {/* IDLE IMAGE OVERLAY */}
        <img
          src="http://127.0.0.1:3000/assets/AVY.png"
          alt="Avy Idle"
          className={`absolute inset-0 w-full h-full object-cover rounded-3xl transition-opacity duration-200 ease-in-out pointer-events-none ${
            (animationState === "IDLE" || (animationState === "TALKING" && !isActuallySpeaking)) ? "opacity-100 z-10" : "opacity-0 z-0"
          }`}
          onError={() => console.error("Failed to load asset from path: /assets/AVY.png")}
        />

        {/* VIDEO ANIMATION OVERLAYS */}
        {Object.entries(VIDEO_PATHS).map(([key, path]) => {
          const isCurrent = key === animationState && loadedVideos[key];
          const isPlaying = playingKeys.includes(key);
          
          // Special handling for TALKING state - only show video if actually speaking
          const isTalkingAndSpeaking = key === "TALKING" && isActuallySpeaking;
          const isOtherActive = key !== "TALKING" && isCurrent;
          const isVisible = isTalkingAndSpeaking || isOtherActive;
          
          return (
            <video
              key={key}
              ref={videoRefs[key as Exclude<AnimationState, "IDLE">]}
              src={path}
              className={`absolute inset-0 w-full h-full object-cover rounded-3xl transition-opacity duration-200 ease-in-out pointer-events-none ${
                isVisible ? "opacity-100 z-10" : isPlaying ? "opacity-0 z-5" : "opacity-0 z-0"
              }`}
              muted
              playsInline
              preload="auto"
              loop={key === "THINKING" || key === "TALKING"}
              onCanPlay={() => handleVideoCanPlay(key as Exclude<AnimationState, "IDLE">)}
              onError={() => handleVideoError(key as Exclude<AnimationState, "IDLE">)}
              onEnded={() => handleVideoEnded(key as Exclude<AnimationState, "IDLE">)}
            />
          );
        })}

        {/* Expression Badge */}
        <div
          className="absolute bottom-4 right-4 flex items-center gap-1.5 font-mono text-[9px] text-white/30 tracking-wide z-30"
          id="avatar-expression-feedback"
        >
          <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/5">
            Mood: {expression}
          </span>
        </div>
      </div>
    </div>
  );
};
