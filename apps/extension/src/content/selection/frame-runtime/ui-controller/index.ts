import { useRef, useCallback } from 'react';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { useFrameUIStore } from '../state/frame-ui.store';
import { processFrameHover } from './helpers';
import { getViewportClientPoint } from '../../../platform/frame';
import { useFrameUiMouseTracking, useFrameUiSelectionEvents, useFrameUiStoreSync } from './effects';
import { queryContentUiElement } from '../../../platform/dom-host';
import { resolveFrameControlHit } from './hit-test';

interface UseFrameUIControllerOptions {
  frames: FrameData[];
  onSelectedFrameChange?: (frameId: string | null) => void;
}

export function useFrameUIController({
  frames,
  onSelectedFrameChange,
}: UseFrameUIControllerOptions) {
  const hoverFrame = useFrameUIStore((state) => state.hoverFrame);
  const scheduleHoverFrameHide = useFrameUIStore((state) => state.scheduleHoverFrameHide);
  const clearHoverFrame = useFrameUIStore((state) => state.clearHoverFrame);
  const selectFrame = useFrameUIStore((state) => state.selectFrame);
  const clearSelection = useFrameUIStore((state) => state.clearSelection);
  const closePopover = useFrameUIStore((state) => state.closePopover);
  const hoveredFrameId = useFrameUIStore((state) => state.hoveredFrameId);
  const selectedFrameId = useFrameUIStore((state) => state.selectedFrameId);
  const activePopover = useFrameUIStore((state) => state.activePopover);
  const resizeFrameId = useFrameUIStore((state) => state.resizeFrameId);
  const setResizeFrame = useFrameUIStore((state) => state.setResizeFrame);
  const framesRef = useRef<FrameData[]>(frames);
  const hoveredFrameIdRef = useRef<string | null>(hoveredFrameId);
  const selectedFrameIdRef = useRef<string | null>(selectedFrameId);
  const activePopoverRef = useRef(activePopover);
  const lastMouseX = useRef(-1);
  const lastMouseY = useRef(-1);
  const lastProcessTime = useRef(0);
  const rafId = useRef<number | null>(null);

  useFrameUiStoreSync({
    frames,
    hoveredFrameId,
    selectedFrameId,
    activePopover,
    framesRef,
    hoveredFrameIdRef,
    selectedFrameIdRef,
    activePopoverRef,
    ...(onSelectedFrameChange === undefined ? {} : { onSelectedFrameChange }),
  });

  const handleMouseMove = useCallback(
    (event: MouseEvent, iframe?: HTMLIFrameElement) => {
      const point = getViewportClientPoint(event.clientX, event.clientY, iframe);

      processFrameHover({
        frames: framesRef.current,
        directControl: resolveFrameControlHit(event),
        hoveredFrameId: hoveredFrameIdRef.current,
        selectedFrameId: selectedFrameIdRef.current,
        isDrawing: Boolean(queryContentUiElement('.sniptale-free-frame-draft-portal')),
        hoverFrame,
        scheduleHoverFrameHide,
        clearHoverFrame,
        setResizeFrame,
        x: point.x,
        y: point.y,
      });
    },
    [clearHoverFrame, hoverFrame, scheduleHoverFrameHide, setResizeFrame]
  );

  useFrameUiMouseTracking({ handleMouseMove, lastMouseX, lastMouseY, lastProcessTime, rafId });
  useFrameUiSelectionEvents({
    framesRef,
    hoveredFrameIdRef,
    activePopoverRef,
    selectedFrameIdRef,
    clearSelection,
    hoverFrame,
    selectFrame,
  });

  return {
    hoveredFrameId,
    selectedFrameId,
    activePopover,
    resizeFrameId,
    hoverFrame,
    selectFrame,
    clearSelection,
    closePopover,
  };
}
