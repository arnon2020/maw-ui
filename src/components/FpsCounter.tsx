import { memo, useState, useEffect } from "react";
import { useStaticMode } from "../lib/staticMode";

export function useFps() {
  const [fps, setFps] = useState(0);
  const staticMode = useStaticMode();
  useEffect(() => {
    if (staticMode) {
      setFps(0);
      return;
    }
    let frames = 0;
    let last = performance.now();
    let id: number;
    const tick = () => {
      frames++;
      const now = performance.now();
      if (now - last >= 1000) {
        setFps(frames);
        frames = 0;
        last = now;
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [staticMode]);
  return fps;
}

export const FpsCounter = memo(function FpsCounter() {
  const fps = useFps();
  return (
    <div
      className="absolute top-2 right-2 px-2 py-1 rounded-md bg-black/50 backdrop-blur border border-white/[0.06] font-mono text-[10px] z-10"
      style={{ color: fps >= 50 ? "#4caf50" : fps >= 30 ? "#ffa726" : "#ef5350" }}
    >
      {fps ? `${fps} fps` : "static"}
    </div>
  );
});
