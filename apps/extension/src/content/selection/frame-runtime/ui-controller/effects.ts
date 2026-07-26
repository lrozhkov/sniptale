import { useEffect, type MutableRefObject } from 'react';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { addEventListenerToAllWindowsDynamic } from '../../../platform/frame';
import { useFrameUIStore } from '../state/frame-ui.store';
import { addHighlighterModeChangedListener } from '../../../platform/page-context/mode-events';
import { createThrottledMouseMoveHandler, type FrameUiMouseTrackingParams } from './helpers';
import { createFrameSelectionEventHandlers } from './activation';
import type { ActiveFramePopover } from '../state/frame-ui.store';
import { consumeHighlighterSuppressedClick } from '../../highlighter';

function cancelPendingAnimationFrame(rafId: MutableRefObject<number | null>) {
  if (rafId.current !== null) {
    cancelAnimationFrame(rafId.current);
  }
}

interface FrameUiRefSyncParams {
  frames: FrameData[];
  hoveredFrameId: string | null;
  selectedFrameId: string | null;
  activePopover: ActiveFramePopover | null;
  onSelectedFrameChange?: (frameId: string | null) => void;
  framesRef: MutableRefObject<FrameData[]>;
  hoveredFrameIdRef: MutableRefObject<string | null>;
  activePopoverRef: MutableRefObject<ActiveFramePopover | null>;
  selectedFrameIdRef: MutableRefObject<string | null>;
}

export function useFrameUiStoreSync(params: FrameUiRefSyncParams) {
  const {
    frames,
    hoveredFrameId,
    selectedFrameId,
    activePopover,
    onSelectedFrameChange,
    framesRef,
    hoveredFrameIdRef,
    activePopoverRef,
    selectedFrameIdRef,
  } = params;

  useFrameUiRefSync({
    hoveredFrameId,
    hoveredFrameIdRef,
    selectedFrameId,
    selectedFrameIdRef,
    frames,
    framesRef,
    activePopover,
    activePopoverRef,
    ...(onSelectedFrameChange === undefined ? {} : { onSelectedFrameChange }),
  });
  useHighlighterModeFrameUiDismissal();
}

function useFrameUiRefSync(params: FrameUiRefSyncParams) {
  const {
    hoveredFrameId,
    hoveredFrameIdRef,
    selectedFrameId,
    selectedFrameIdRef,
    frames,
    framesRef,
    onSelectedFrameChange,
    activePopover,
    activePopoverRef,
  } = params;

  useEffect(() => {
    framesRef.current = frames;
  }, [frames, framesRef]);

  useEffect(() => {
    hoveredFrameIdRef.current = hoveredFrameId;
  }, [hoveredFrameId, hoveredFrameIdRef]);

  useEffect(() => {
    selectedFrameIdRef.current = selectedFrameId;
    onSelectedFrameChange?.(selectedFrameId);
  }, [selectedFrameId, onSelectedFrameChange, selectedFrameIdRef]);

  useEffect(() => {
    activePopoverRef.current = activePopover;
  }, [activePopover, activePopoverRef]);
}

function useHighlighterModeFrameUiDismissal() {
  useEffect(() => {
    return addHighlighterModeChangedListener(({ enabled }) => {
      if (!enabled) {
        useFrameUIStore.getState().dismissFrameUi();
      }
    });
  }, []);
}

export function useFrameUiSelectionEvents(params: {
  framesRef: MutableRefObject<FrameData[]>;
  hoveredFrameIdRef: MutableRefObject<string | null>;
  activePopoverRef: MutableRefObject<ActiveFramePopover | null>;
  selectedFrameIdRef: MutableRefObject<string | null>;
  clearSelection: () => void;
  hoverFrame: (frameId: string) => void;
  selectFrame: (frameId: string, anchorOffset?: { x: number; y: number }) => void;
}) {
  const {
    framesRef,
    hoveredFrameIdRef,
    activePopoverRef,
    selectedFrameIdRef,
    clearSelection,
    hoverFrame,
    selectFrame,
  } = params;
  useEffect(() => {
    const handlers = createFrameSelectionEventHandlers({
      framesRef,
      hoveredFrameIdRef,
      activePopoverRef,
      selectedFrameIdRef,
      consumeSuppressedClick: consumeHighlighterSuppressedClick,
      clearSelection,
      hoverFrame,
      selectFrame,
    });
    const cleanupPointerDown = addEventListenerToAllWindowsDynamic<PointerEvent>(
      'pointerdown',
      handlers.pointerDown,
      { capture: true }
    );
    const cleanupClick = addEventListenerToAllWindowsDynamic<MouseEvent>('click', handlers.click, {
      capture: true,
    });
    const cleanupKeyDown = addEventListenerToAllWindowsDynamic<KeyboardEvent>(
      'keydown',
      handlers.keyDown,
      { capture: true }
    );

    return () => {
      cleanupPointerDown();
      cleanupClick();
      cleanupKeyDown();
    };
  }, [
    clearSelection,
    framesRef,
    hoveredFrameIdRef,
    activePopoverRef,
    hoverFrame,
    selectedFrameIdRef,
    selectFrame,
  ]);
}

export function useFrameUiMouseTracking(params: FrameUiMouseTrackingParams) {
  const { handleMouseMove, lastMouseX, lastMouseY, lastProcessTime, rafId } = params;

  useEffect(() => {
    const throttledHandleMouseMove = createThrottledMouseMoveHandler({
      handleMouseMove,
      lastMouseX,
      lastMouseY,
      lastProcessTime,
      rafId,
    });

    const cleanupMouseMove = addEventListenerToAllWindowsDynamic<MouseEvent>(
      'mousemove',
      throttledHandleMouseMove,
      { passive: true }
    );

    return () => {
      cleanupMouseMove();
      cancelPendingAnimationFrame(rafId);
    };
  }, [handleMouseMove, lastMouseX, lastMouseY, lastProcessTime, rafId]);
}
