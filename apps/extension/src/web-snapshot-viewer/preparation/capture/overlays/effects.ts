import type { BlurSettings } from '../../../../features/highlighter/contracts';
import {
  clipRoundedRect,
  createScratchCanvas,
  traceRoundedRect,
  type ViewerFrameProjection,
} from './canvas';

function resolveSolidOpacity(settings: BlurSettings): number {
  return Math.min(1, Math.max(0.08, settings.amount / 25));
}

export function drawViewerFocusLayer(args: {
  context: CanvasRenderingContext2D;
  projections: ViewerFrameProjection[];
  scale: number;
  width: number;
  height: number;
}): void {
  const focusFrames = args.projections.filter(({ frame }) => frame.effectMode === 'focus');
  if (focusFrames.length === 0) return;

  const opacity = focusFrames.reduce(
    (maxOpacity, { frame }) => Math.max(maxOpacity, frame.focusSettings?.opacity ?? 0.5),
    0.1
  );

  const mask = createScratchCanvas(args.width * args.scale, args.height * args.scale);
  const maskContext = mask?.getContext('2d');
  if (!mask || !maskContext) return;

  maskContext.scale(args.scale, args.scale);
  maskContext.fillStyle = `rgb(0 0 0 / ${Math.min(1, Math.max(0, opacity)).toFixed(3)})`;
  maskContext.fillRect(0, 0, args.width, args.height);
  maskContext.globalCompositeOperation = 'destination-out';
  focusFrames.forEach(({ surface }) => {
    maskContext.beginPath();
    traceRoundedRect(maskContext, surface.geometry);
    maskContext.fill();
  });

  args.context.drawImage(mask, 0, 0, args.width, args.height);
}

function drawGaussianBackdrop(args: {
  context: CanvasRenderingContext2D;
  backdrop: HTMLCanvasElement;
  width: number;
  height: number;
  amount: number;
}) {
  args.context.filter = `blur(${args.amount}px)`;
  args.context.drawImage(
    args.backdrop,
    0,
    0,
    args.backdrop.width,
    args.backdrop.height,
    0,
    0,
    args.width,
    args.height
  );
}

function drawPixelatedBackdrop(args: {
  context: CanvasRenderingContext2D;
  backdrop: HTMLCanvasElement;
  projection: ViewerFrameProjection;
  scale: number;
  amount: number;
}) {
  const { x, y, width, height } = args.projection.surface.geometry;
  const blockSize = Math.max(1, Math.round(args.amount));
  const scratch = createScratchCanvas(width / blockSize, height / blockSize);
  const scratchContext = scratch?.getContext('2d');
  if (!scratch || !scratchContext) return;

  scratchContext.drawImage(
    args.backdrop,
    x * args.scale,
    y * args.scale,
    width * args.scale,
    height * args.scale,
    0,
    0,
    scratch.width,
    scratch.height
  );
  args.context.imageSmoothingEnabled = false;
  args.context.drawImage(scratch, 0, 0, scratch.width, scratch.height, x, y, width, height);
}

function drawDistortedBackdrop(args: {
  context: CanvasRenderingContext2D;
  backdrop: HTMLCanvasElement;
  projection: ViewerFrameProjection;
  scale: number;
  amount: number;
}) {
  const { x, y, width, height } = args.projection.surface.geometry;
  const sliceHeight = Math.max(1, Math.min(6, Math.round(args.amount / 3)));
  for (let offsetY = 0; offsetY < height; offsetY += sliceHeight) {
    const heightSlice = Math.min(sliceHeight, height - offsetY);
    const waveOffset =
      Math.sin((offsetY + args.amount * 11) * 0.18) * args.amount * 0.45 +
      Math.cos((offsetY + args.amount * 7) * 0.07) * args.amount * 0.25;
    args.context.drawImage(
      args.backdrop,
      (x + waveOffset) * args.scale,
      (y + offsetY) * args.scale,
      width * args.scale,
      heightSlice * args.scale,
      x,
      y + offsetY,
      width,
      heightSlice
    );
  }
}

function drawViewerBlurProjection(args: {
  context: CanvasRenderingContext2D;
  backdrop: HTMLCanvasElement;
  projection: ViewerFrameProjection;
  scale: number;
  width: number;
  height: number;
}) {
  const settings = args.projection.frame.blurSettings ?? {
    amount: 8,
    blurType: 'gaussian' as const,
  };
  args.context.save();
  clipRoundedRect(args.context, args.projection.surface.geometry);

  switch (settings.blurType) {
    case 'solid':
      args.context.fillStyle = `rgb(0 0 0 / ${resolveSolidOpacity(settings).toFixed(3)})`;
      args.context.fillRect(
        args.projection.surface.geometry.x,
        args.projection.surface.geometry.y,
        args.projection.surface.geometry.width,
        args.projection.surface.geometry.height
      );
      break;
    case 'gaussian':
      drawGaussianBackdrop({ ...args, amount: settings.amount });
      break;
    case 'pixelate':
      drawPixelatedBackdrop({ ...args, amount: settings.amount });
      break;
    case 'distortion':
      drawDistortedBackdrop({ ...args, amount: settings.amount });
      break;
  }

  args.context.restore();
}

export function drawViewerBlurLayers(args: {
  context: CanvasRenderingContext2D;
  backdrop: HTMLCanvasElement;
  projections: ViewerFrameProjection[];
  scale: number;
  width: number;
  height: number;
}): void {
  args.projections
    .filter(({ frame }) => frame.effectMode === 'blur')
    .forEach((projection) => drawViewerBlurProjection({ ...args, projection }));
}
