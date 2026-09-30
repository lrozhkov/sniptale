import { useLayoutEffect, useState, type RefObject } from 'react';

export type VideoFrameHover = { time: number; clientX: number | null };
type Placement = { left: number; top: number; width: number };

function measureFramePlacement(args: {
  duration: number;
  hover: VideoFrameHover;
  player: DOMRect;
  popupHeight: number;
  range: DOMRect;
  timeline: DOMRect;
}): Placement | null {
  const { duration, hover, player, popupHeight, range, timeline } = args;
  if (player.width <= 0 || range.width <= 0) return null;
  const width = Math.min(
    192,
    Math.max(1, player.width - 16),
    Math.max(1, ((player.height - 34) * 16) / 9)
  );
  const clientX =
    hover.clientX ?? range.left + (Math.min(hover.time, duration) / duration) * range.width;
  const leftInPlayer = Math.max(
    0,
    Math.min(player.width - width, clientX - player.left - width / 2)
  );
  const desiredTop = timeline.top - player.top - popupHeight - 8;
  const topInPlayer = Math.max(0, Math.min(player.height - popupHeight, desiredTop));
  return {
    left: leftInPlayer + player.left - timeline.left,
    top: topInPlayer + player.top - timeline.top,
    width,
  };
}

/** Places the transient frame beside its anchor while keeping it inside the player. */
export function useVideoFramePlacement(args: {
  duration: number;
  hover: VideoFrameHover | null;
  playerRef: RefObject<HTMLDivElement | null>;
  popupRef: RefObject<HTMLDivElement | null>;
  rangeRef: RefObject<HTMLInputElement | null>;
  ready: boolean;
  timelineRef: RefObject<HTMLDivElement | null>;
}): Placement | null {
  const [placement, setPlacement] = useState<Placement | null>(null);
  const { duration, hover, playerRef, popupRef, rangeRef, ready, timelineRef } = args;

  useLayoutEffect(() => {
    if (!hover || !ready) {
      setPlacement(null);
      return;
    }
    const player = playerRef.current;
    const range = rangeRef.current;
    const popup = popupRef.current;
    const timeline = timelineRef.current;
    if (!player || !range || !popup || !timeline) return;

    const place = () => {
      const next = measureFramePlacement({
        duration,
        hover,
        player: player.getBoundingClientRect(),
        popupHeight: popup.getBoundingClientRect().height,
        range: range.getBoundingClientRect(),
        timeline: timeline.getBoundingClientRect(),
      });
      if (!next) return;
      setPlacement((current) =>
        current?.left === next.left && current.top === next.top && current.width === next.width
          ? current
          : next
      );
    };
    place();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(place);
    observer.observe(player);
    observer.observe(range);
    observer.observe(popup);
    return () => observer.disconnect();
  }, [duration, hover, playerRef, popupRef, rangeRef, ready, timelineRef]);

  return placement;
}
