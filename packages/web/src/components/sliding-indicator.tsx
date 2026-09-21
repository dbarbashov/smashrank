import { useLayoutEffect, useRef, useState } from "react";

export type SlidingIndicatorPosition = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function useSlidingIndicator(
  activeSelector: string,
  activeKey: string,
) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<SlidingIndicatorPosition | null>(null);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    let activeItem: HTMLElement | null = null;
    const updatePosition = () => {
      activeItem = track.querySelector<HTMLElement>(activeSelector);
      if (!activeItem) {
        setPosition(null);
        return;
      }

      const trackRect = track.getBoundingClientRect();
      const itemRect = activeItem.getBoundingClientRect();
      setPosition({
        left: itemRect.left - trackRect.left,
        top: itemRect.top - trackRect.top,
        width: itemRect.width,
        height: itemRect.height,
      });
    };

    const resizeObserver = new ResizeObserver(updatePosition);
    updatePosition();
    const frame = requestAnimationFrame(updatePosition);
    resizeObserver.observe(track);
    if (activeItem) resizeObserver.observe(activeItem);
    window.addEventListener("resize", updatePosition);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updatePosition);
    };
  }, [activeKey, activeSelector]);

  return { trackRef, position };
}

export function SlidingIndicator({
  position,
}: {
  position: SlidingIndicatorPosition | null;
}) {
  if (!position) return null;

  return (
    <span
      aria-hidden="true"
      className="ios-nav-indicator"
      style={{
        left: position.left,
        top: position.top,
        width: position.width,
        height: position.height,
      }}
    />
  );
}
