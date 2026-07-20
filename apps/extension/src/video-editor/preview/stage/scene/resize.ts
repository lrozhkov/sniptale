import type React from 'react';
import { useEffect, useRef, useState } from 'react';

interface StageSize {
  height: number;
  width: number;
}

export function usePreviewStageCanvasResizeVersion(
  stageRef: React.RefObject<HTMLDivElement | null>
): number {
  const [resizeVersion, setResizeVersion] = useState(0);
  const lastStageSizeRef = useRef<StageSize | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    lastStageSizeRef.current = readStageSize(stage);
    const bumpVersion = (entries?: ResizeObserverEntry[]) => {
      const nextSize = readStageSize(stage, entries?.[0]);
      const previousSize = lastStageSizeRef.current;
      if (previousSize && areStageSizesEqual(previousSize, nextSize)) {
        return;
      }
      lastStageSizeRef.current = nextSize;
      setResizeVersion((value) => value + 1);
    };
    const bumpVersionFromEvent = () => bumpVersion();
    const observer = new ResizeObserver((entries) => bumpVersion(entries));

    observer.observe(stage);
    window.addEventListener('resize', bumpVersionFromEvent);
    document.addEventListener('fullscreenchange', bumpVersionFromEvent);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', bumpVersionFromEvent);
      document.removeEventListener('fullscreenchange', bumpVersionFromEvent);
    };
  }, [stageRef]);

  return resizeVersion;
}

function readStageSize(stage: HTMLDivElement, entry?: ResizeObserverEntry): StageSize {
  const entryRect = entry?.contentRect;
  return {
    height: entryRect?.height ?? stage.clientHeight,
    width: entryRect?.width ?? stage.clientWidth,
  };
}

function areStageSizesEqual(first: StageSize, second: StageSize): boolean {
  return first.height === second.height && first.width === second.width;
}
