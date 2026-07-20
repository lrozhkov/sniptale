export function createVideoCompositionBufferCanvas(
  width: number,
  height: number,
  ownerDocument?: Document | null
): HTMLCanvasElement | OffscreenCanvas | null {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }

  const documentRef = ownerDocument ?? (typeof document !== 'undefined' ? document : null);
  if (!documentRef) {
    return null;
  }

  const canvas = documentRef.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
