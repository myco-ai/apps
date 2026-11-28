import { useEffect, useState } from "react";
import { language } from "../_lib/i18n";
export function DetailSplitter({
  width,
  onChange,
}: {
  width: number;
  onChange: (width: number) => void;
}) {
  const [dragging, setDragging] = useState(false),
    [screen, setScreen] = useState(window.innerWidth);
  useEffect(() => {
    const resize = () => setScreen(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const max = Math.max(280, screen - (screen > 1100 ? 236 : 220) - 280 - 8),
    min = Math.min(320, max);
  const clamp = (w: number) => Math.round(Math.max(min, Math.min(max, w)));
  return (
    <div
      className={`detail-splitter ${dragging ? "dragging" : ""}`}
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={language() === "zh" ? "调整详情宽度" : "Resize details"}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={clamp(width)}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          onChange(clamp(window.innerWidth - e.clientX));
      }}
      onPointerUp={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
        setDragging(false);
      }}
      onPointerCancel={() => setDragging(false)}
      onLostPointerCapture={() => setDragging(false)}
      onDoubleClick={() => onChange(clamp(500))}
      onKeyDown={(e) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        onChange(
          clamp(
            e.key === "Home"
              ? min
              : e.key === "End"
                ? max
                : clamp(width) + (e.key === "ArrowLeft" ? 24 : -24),
          ),
        );
      }}
    />
  );
}
