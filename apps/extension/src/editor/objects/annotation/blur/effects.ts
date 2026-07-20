import { clamp } from '../../../document/model';
import type { BlurSettings } from '../../../../features/highlighter/contracts';

function createScratchCanvas(width: number, height: number): HTMLCanvasElement | null {
  const scratch = document.createElement('canvas');
  scratch.width = Math.max(1, width);
  scratch.height = Math.max(1, height);
  return scratch.getContext('2d') ? scratch : null;
}

export function drawSolidBlur(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  settings: BlurSettings
) {
  ctx.save();
  ctx.fillStyle = `rgb(0 0 0 / ${clamp(settings.amount / 24, 0.08, 1).toFixed(3)})`;
  ctx.fillRect(-width / 2, -height / 2, width, height);
  ctx.restore();
}

export function drawGaussianBackdrop(
  ctx: CanvasRenderingContext2D,
  backdrop: HTMLCanvasElement,
  width: number,
  height: number,
  padding: number,
  amount: number
) {
  ctx.save();
  ctx.filter = `blur(${amount}px)`;
  ctx.drawImage(
    backdrop,
    0,
    0,
    backdrop.width,
    backdrop.height,
    -width / 2 - padding,
    -height / 2 - padding,
    backdrop.width,
    backdrop.height
  );
  ctx.restore();
}

export function drawPixelatedBackdrop(
  ctx: CanvasRenderingContext2D,
  backdrop: HTMLCanvasElement,
  width: number,
  height: number,
  padding: number,
  amount: number
) {
  const blockSize = Math.max(1, Math.round(amount));
  const scaledWidth = Math.max(1, Math.round(width / blockSize));
  const scaledHeight = Math.max(1, Math.round(height / blockSize));
  const scaledCanvas = createScratchCanvas(scaledWidth, scaledHeight);
  const scaledContext = scaledCanvas?.getContext('2d');
  if (!scaledCanvas || !scaledContext) {
    return;
  }

  scaledContext.drawImage(
    backdrop,
    padding,
    padding,
    width,
    height,
    0,
    0,
    scaledWidth,
    scaledHeight
  );

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    scaledCanvas,
    0,
    0,
    scaledWidth,
    scaledHeight,
    -width / 2,
    -height / 2,
    width,
    height
  );
  ctx.restore();
}

export function drawDistortedBackdrop(
  ctx: CanvasRenderingContext2D,
  backdrop: HTMLCanvasElement,
  width: number,
  height: number,
  padding: number,
  amount: number
) {
  const sliceHeight = Math.max(1, Math.min(6, Math.round(amount / 3)));
  const maxSourceX = Math.max(0, backdrop.width - width);

  for (let offsetY = 0; offsetY < height; offsetY += sliceHeight) {
    const heightSlice = Math.min(sliceHeight, height - offsetY);
    const waveOffset = Math.round(
      Math.sin((offsetY + amount * 11) * 0.18) * amount * 0.45 +
        Math.cos((offsetY + amount * 7) * 0.07) * amount * 0.25
    );
    const sourceX = Math.max(0, Math.min(maxSourceX, padding + waveOffset));

    ctx.drawImage(
      backdrop,
      sourceX,
      padding + offsetY,
      width,
      heightSlice,
      -width / 2,
      -height / 2 + offsetY,
      width,
      heightSlice
    );
  }
}
