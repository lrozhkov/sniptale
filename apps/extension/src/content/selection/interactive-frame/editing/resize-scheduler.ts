import { applyInteractiveFramePointerUpdate } from './helpers';
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
  applyInteractiveFramePointerUpdate(params, sample, direction);
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
