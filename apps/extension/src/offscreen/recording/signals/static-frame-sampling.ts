const FRAME_SIGNATURE_WIDTH = 32;
const FRAME_SIGNATURE_HEIGHT = 18;

export function createFrameSignatureCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_SIGNATURE_WIDTH;
  canvas.height = FRAME_SIGNATURE_HEIGHT;
  return canvas;
}

export function captureFrameSignature(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement
): Uint8ClampedArray {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const luma = new Uint8ClampedArray(canvas.width * canvas.height);

  for (let index = 0; index < luma.length; index += 1) {
    const offset = index * 4;
    const red = imageData[offset] ?? 0;
    const green = imageData[offset + 1] ?? 0;
    const blue = imageData[offset + 2] ?? 0;
    luma[index] = Math.round(red * 0.299 + green * 0.587 + blue * 0.114);
  }

  return luma;
}

export function measureFrameDiff(left: Uint8ClampedArray, right: Uint8ClampedArray): number {
  let total = 0;

  for (let index = 0; index < left.length; index += 1) {
    total += Math.abs((left[index] ?? 0) - (right[index] ?? 0));
  }

  return total / Math.max(1, left.length);
}
