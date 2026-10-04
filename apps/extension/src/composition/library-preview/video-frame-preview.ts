import { useEffect, useRef, useState } from 'react';
import { createVideoFrameCache, sampleVideoTime, type VideoFrameCache } from './video-frame-cache';
import type { VideoFrameHover } from './video-frame-placement';

/** Keeps one frame cache for the mounted video source and observes its snapshots. */
export function useVideoFramePreview({
  src,
  duration,
  hover,
  ready,
}: {
  src: string;
  duration: number;
  hover: VideoFrameHover | null;
  ready: boolean;
}) {
  const cacheRef = useRef<{ src: string; cache: VideoFrameCache } | null>(null);
  const [, updateFrames] = useState(0);
  const sampleTime = hover && ready ? sampleVideoTime(hover.time, duration) : null;

  useEffect(() => {
    const cache = createVideoFrameCache(src, () => updateFrames((value) => value + 1));
    cacheRef.current = { src, cache };
    updateFrames((value) => value + 1);
    return () => {
      cache.dispose();
      if (cacheRef.current?.cache === cache) cacheRef.current = null;
    };
  }, [src]);

  useEffect(() => {
    if (cacheRef.current?.src === src) cacheRef.current.cache.setDuration(duration);
  }, [duration, src]);

  useEffect(() => {
    if (sampleTime !== null && cacheRef.current?.src === src) {
      cacheRef.current.cache.request(sampleTime, duration);
    }
  }, [duration, sampleTime, src]);

  const snapshot =
    sampleTime !== null && cacheRef.current?.src === src
      ? cacheRef.current.cache.get(sampleTime, duration)
      : null;
  return { sampleTime, snapshot };
}
