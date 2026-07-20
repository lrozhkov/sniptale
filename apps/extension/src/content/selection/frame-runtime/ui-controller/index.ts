import { useRef, useCallback } from 'react';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { useFrameUIStore } from '../state/frame-ui.store';
import { processFrameHover } from './helpers';
import { getViewportClientPoint } from '../../../platform/frame';
import { useFrameUiMouseTracking, useFrameUiStoreSync } from './effects';

interface UseFrameUIControllerOptions {
  frames: FrameData[];
  onActiveFrameChange?: (frameId: string | null) => void;
}

export function useFrameUIController({ frames, onActiveFrameChange }: UseFrameUIControllerOptions) {
  const showTooltip = useFrameUIStore((state) => state.showTooltip);
  const hideTooltip = useFrameUIStore((state) => state.hideTooltip);
  const closePopover = useFrameUIStore((state) => state.closePopover);
  const activeFrameId = useFrameUIStore((state) => state.activeFrameId);
  const popoverFrameId = useFrameUIStore((state) => state.popoverFrameId);
  const framesRef = useRef<FrameData[]>(frames);
  const activeFrameIdRef = useRef<string | null>(activeFrameId);
  const popoverFrameIdRef = useRef<string | null>(popoverFrameId);
  const lastMouseX = useRef(-1);
  const lastMouseY = useRef(-1);
  const lastProcessTime = useRef(0);
  const rafId = useRef<number | null>(null);

  useFrameUiStoreSync({
    frames,
    activeFrameId,
    popoverFrameId,
    framesRef,
    activeFrameIdRef,
    popoverFrameIdRef,
    ...(onActiveFrameChange === undefined ? {} : { onActiveFrameChange }),
  });

  const handleMouseMove = useCallback(
    (event: MouseEvent, iframe?: HTMLIFrameElement) => {
      const point = getViewportClientPoint(event.clientX, event.clientY, iframe);

      processFrameHover({
        frames: framesRef.current,
        activeFrameId: activeFrameIdRef.current,
        popoverFrameId: popoverFrameIdRef.current,
        showTooltip,
        hideTooltip,
        x: point.x,
        y: point.y,
      });
    },
    [showTooltip, hideTooltip]
  );

  useFrameUiMouseTracking({ handleMouseMove, lastMouseX, lastMouseY, lastProcessTime, rafId });

  return { activeFrameId, popoverFrameId, showTooltip, hideTooltip, closePopover };
}
