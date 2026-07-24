import { applyResizeUpdate } from './helpers';
import type {
  InteractiveFrameListenerConfig,
  InteractiveFramePointerSample,
} from '../controller/types';

function applyResizeSample(
  params: InteractiveFrameListenerConfig,
  sample: InteractiveFramePointerSample
) {
  const direction = params.resizeDirectionRef.current;
  if (!params.isResizingRef.current || !direction) return;
  if (params.pointerIdRef.current !== sample.pointerId) return;
  applyResizeUpdate({
    event: sample,
    direction,
    containerRef: params.containerRef,
    startX: params.startXRef.current,
    startY: params.startYRef.current,
    startFrame: params.startFrameRef.current,
    setTempFrame: params.setTempFrame,
    frameId: params.frameId,
    effectMode: params.effectModeRef.current,
    tempFrameRef: params.tempFrameRef,
  });
}

export function cancelPendingInteractiveFrameResize(
  params: Pick<InteractiveFrameListenerConfig, 'resizeRafIdRef' | 'latestResizeSampleRef'>
) {
  if (params.resizeRafIdRef.current !== null) {
    cancelAnimationFrame(params.resizeRafIdRef.current);
  }
  params.resizeRafIdRef.current = null;
  params.latestResizeSampleRef.current = null;
}

export function queueInteractiveFrameResize(
  params: InteractiveFrameListenerConfig,
  event: InteractiveFramePointerSample
) {
  params.latestResizeSampleRef.current = {
    clientX: event.clientX,
    clientY: event.clientY,
    pointerId: event.pointerId,
  };
  if (params.resizeRafIdRef.current !== null) return;
  const rafId = requestAnimationFrame(() => {
    if (params.resizeRafIdRef.current !== rafId) return;
    params.resizeRafIdRef.current = null;
    const sample = params.latestResizeSampleRef.current;
    params.latestResizeSampleRef.current = null;
    if (sample) applyResizeSample(params, sample);
  });
  params.resizeRafIdRef.current = rafId;
}

export function flushInteractiveFrameResize(
  params: InteractiveFrameListenerConfig,
  event: InteractiveFramePointerSample
) {
  cancelPendingInteractiveFrameResize(params);
  applyResizeSample(params, event);
}
