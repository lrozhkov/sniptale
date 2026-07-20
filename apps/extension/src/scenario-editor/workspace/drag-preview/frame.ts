type PointerPreviewPoint = Pick<PointerEvent, 'clientX' | 'clientY'>;

export function toPointerPreviewPoint(
  event: Pick<PointerEvent, 'clientX' | 'clientY'>
): PointerPreviewPoint {
  return {
    clientX: event.clientX,
    clientY: event.clientY,
  };
}

export function createPointerPreviewScheduler(onPreview: (point: PointerPreviewPoint) => void) {
  let frameId: number | null = null;
  let latestPoint: PointerPreviewPoint | null = null;

  const flushPreview = () => {
    frameId = null;
    if (latestPoint) {
      onPreview(latestPoint);
    }
  };

  return {
    cancel() {
      if (frameId !== null) {
        globalThis.cancelAnimationFrame(frameId);
        frameId = null;
      }
      latestPoint = null;
    },
    schedule(point: PointerPreviewPoint) {
      latestPoint = point;
      if (frameId !== null) {
        return;
      }

      frameId = globalThis.requestAnimationFrame(flushPreview);
    },
  };
}
