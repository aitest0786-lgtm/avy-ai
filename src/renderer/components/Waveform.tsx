import React, { useEffect, useState, useRef } from "react";
import { CompanionState } from "../types";

interface WaveformProps {
  status: CompanionState;
  inputAnalyser: React.RefObject<AnalyserNode | null>;
  outputAnalyser: React.RefObject<AnalyserNode | null>;
}

export const Waveform: React.FC<WaveformProps> = ({ status, inputAnalyser, outputAnalyser }) => {
  const [heights, setHeights] = useState<number[]>([20, 35, 65, 45, 85, 60, 40, 95, 70, 30, 50, 20]);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    // If disconnected, let the bars animate with a gentle pulsing ambient idle wave
    if (status === "disconnected" || status === "error") {
      let step = 0;
      const idleAnimate = () => {
        step += 0.05;
        const newHeights = [
          15 + Math.sin(step) * 5,
          25 + Math.cos(step * 0.8) * 8,
          40 + Math.sin(step * 1.2) * 15,
          30 + Math.cos(step * 1.5) * 10,
          50 + Math.sin(step * 0.9) * 20,
          45 + Math.cos(step * 1.1) * 15,
          35 + Math.sin(step * 0.7) * 12,
          55 + Math.cos(step * 1.3) * 25,
          45 + Math.sin(step * 1.6) * 18,
          25 + Math.cos(step * 1.0) * 10,
          35 + Math.sin(step * 0.5) * 12,
          15 + Math.cos(step * 1.4) * 6,
        ];
        setHeights(newHeights);
        animationFrameRef.current = requestAnimationFrame(idleAnimate);
      };
      idleAnimate();
      return () => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      };
    }

    // If active (listening or speaking), read real microphone/audio output data to feed the bars!
    const activeAnalyser = status === "listening" ? inputAnalyser.current : outputAnalyser.current;
    if (!activeAnalyser) {
      // Fallback fallback animation if nodes are not ready yet
      let step = 0;
      const connectingAnimate = () => {
        step += 0.15;
        const newHeights = Array.from({ length: 12 }, (_, i) => 
          20 + Math.sin(step + i * 0.5) * 40
        );
        setHeights(newHeights);
        animationFrameRef.current = requestAnimationFrame(connectingAnimate);
      };
      connectingAnimate();
      return () => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      };
    }

    const bufferLength = activeAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const updateWaveform = () => {
      if (status === "listening") {
        activeAnalyser.getByteTimeDomainData(dataArray);
      } else {
        activeAnalyser.getByteFrequencyData(dataArray);
      }

      // Map raw frequencies to 12 aesthetic bars
      const nextHeights: number[] = [];
      const segmentSize = Math.floor(bufferLength / 12) || 1;

      for (let i = 0; i < 12; i++) {
        let sum = 0;
        const start = i * segmentSize;
        const end = start + segmentSize;
        for (let j = start; j < end; j++) {
          sum += dataArray[j] || 0;
        }
        const avg = sum / segmentSize;

        let scale = 0;
        if (status === "listening") {
          // Time domain data centers around 128
          const dev = Math.abs(avg - 128);
          scale = Math.min(100, 10 + dev * 5.0);
        } else {
          // Frequency data ranges from 0 to 255
          scale = Math.min(100, 10 + (avg / 255.0) * 90);
        }

        // Add a small jitter to keep the bars looking organic
        const jitter = Math.random() * 8;
        nextHeights.push(Math.max(12, scale + jitter));
      }

      setHeights(nextHeights);
      animationFrameRef.current = requestAnimationFrame(updateWaveform);
    };

    updateWaveform();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [status, inputAnalyser, outputAnalyser]);

  return (
    <div 
      className="flex justify-center items-end gap-2 h-20 w-full max-w-sm mt-8 transition-opacity duration-500" 
      id="waveform-display"
    >
      {heights.map((h, i) => (
        <div
          key={i}
          className="w-1.5 rounded-full bg-gradient-to-t from-violet-600 via-indigo-500 to-blue-400 transition-all duration-75"
          style={{ height: `${h}%` }}
          id={`waveform-bar-${i}`}
        />
      ))}
    </div>
  );
};
