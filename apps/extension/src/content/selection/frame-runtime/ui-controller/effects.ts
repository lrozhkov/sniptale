import { useEffect, type MutableRefObject } from 'react';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { addEventListenerToAllWindowsDynamic } from '../../../platform/frame';
import { useFrameUIStore } from '../state/frame-ui.store';
import { addHighlighterModeChangedListener } from '../../../platform/page-context/mode-events';
import { clearFrameTooltipVisible, setFrameTooltipVisible } from '../../highlighter';
import { createThrottledMouseMoveHandler, type FrameUiMouseTrackingParams } from './helpers';

function cancelPendingAnimationFrame(rafId: MutableRefObject<number | null>) {
  if (rafId.current !== null) {
    cancelAnimationFrame(rafId.current);
  }
}

interface FrameUiRefSyncParams {
  frames: FrameData[];
  activeFrameId: string | null;
  popoverFrameId: string | null;
  onActiveFrameChange?: (frameId: string | null) => void;
  framesRef: MutableRefObject<FrameData[]>;
  activeFrameIdRef: MutableRefObject<string | null>;
  popoverFrameIdRef: MutableRefObject<string | null>;
}

export function useFrameUiStoreSync(params: FrameUiRefSyncParams) {
  const {
    frames,
    activeFrameId,
    popoverFrameId,
    onActiveFrameChange,
    framesRef,
    activeFrameIdRef,
    popoverFrameIdRef,
  } = params;

  useFrameUiRefSync({
    activeFrameId,
    activeFrameIdRef,
    frames,
    framesRef,
    popoverFrameId,
    popoverFrameIdRef,
    ...(onActiveFrameChange === undefined ? {} : { onActiveFrameChange }),
  });
  useFrameTooltipVisibility(activeFrameId);
  useHighlighterModeTooltipSync();
}

function useFrameUiRefSync(params: FrameUiRefSyncParams) {
  const {
    activeFrameId,
    activeFrameIdRef,
    frames,
    framesRef,
    onActiveFrameChange,
    popoverFrameId,
    popoverFrameIdRef,
  } = params;

  useEffect(() => {
    framesRef.current = frames;
  }, [frames, framesRef]);

  useEffect(() => {
    activeFrameIdRef.current = activeFrameId;
    onActiveFrameChange?.(activeFrameId);
  }, [activeFrameId, onActiveFrameChange, activeFrameIdRef]);

  useEffect(() => {
    popoverFrameIdRef.current = popoverFrameId;
  }, [popoverFrameId, popoverFrameIdRef]);
}

function useFrameTooltipVisibility(activeFrameId: string | null) {
  useEffect(() => {
    if (activeFrameId !== null) {
      setFrameTooltipVisible();
    } else {
      clearFrameTooltipVisible();
    }

    return () => {
      clearFrameTooltipVisible();
    };
  }, [activeFrameId]);
}

function useHighlighterModeTooltipSync() {
  useEffect(() => {
    return addHighlighterModeChangedListener(({ enabled }) => {
      if (!enabled) {
        useFrameUIStore.getState().forceHideTooltip();
      }
    });
  }, []);
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
