import { PREVIEW_FPS } from './helpers';

function syncPreviewCanvasSize(args: {
  previewCanvas: HTMLCanvasElement;
  previewSize: { width: number; height: number };
  pixelRatio: number;
}) {
  const targetWidth = Math.max(1, Math.round(args.previewSize.width * args.pixelRatio));
  const targetHeight = Math.max(1, Math.round(args.previewSize.height * args.pixelRatio));

  if (args.previewCanvas.width === targetWidth && args.previewCanvas.height === targetHeight) {
    return;
  }

  args.previewCanvas.width = targetWidth;
  args.previewCanvas.height = targetHeight;
  args.previewCanvas.style.width = `${args.previewSize.width}px`;
  args.previewCanvas.style.height = `${args.previewSize.height}px`;
}

function hasDrawableCanvasSize(canvas: HTMLCanvasElement): boolean {
  return canvas.width > 0 && canvas.height > 0;
}

function drawPreviewFrame(args: {
  sourceCanvas: HTMLCanvasElement;
  previewCanvas: HTMLCanvasElement;
  previewSize: { width: number; height: number };
}) {
  const pixelRatio = window.devicePixelRatio || 1;
  syncPreviewCanvasSize({
    pixelRatio,
    previewCanvas: args.previewCanvas,
    previewSize: args.previewSize,
  });

  const context = args.previewCanvas.getContext('2d');
  if (!context) {
    return;
  }

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, args.previewSize.width, args.previewSize.height);

  // `hasImage` flips to true before Fabric finishes sizing the backing canvas.
  // Skip this frame until the source canvas becomes drawable instead of throwing.
  if (!hasDrawableCanvasSize(args.sourceCanvas)) {
    return;
  }

  context.imageSmoothingEnabled = true;
  context.drawImage(
    args.sourceCanvas,
    0,
    0,
    args.sourceCanvas.width,
    args.sourceCanvas.height,
    0,
    0,
    args.previewSize.width,
    args.previewSize.height
  );
}

export function startEditorViewportPreviewLoop(args: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  previewCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  previewSize: { width: number; height: number };
}) {
  let frameId = 0;
  let lastDrawAt = 0;

  const drawPreview = () => {
    const sourceCanvas = args.canvasRef.current;
    const previewCanvas = args.previewCanvasRef.current;
    if (
      !sourceCanvas ||
      !previewCanvas ||
      args.previewSize.width <= 0 ||
      args.previewSize.height <= 0
    ) {
      return;
    }

    drawPreviewFrame({ sourceCanvas, previewCanvas, previewSize: args.previewSize });
  };

  const animate = (timestamp: number) => {
    if (timestamp - lastDrawAt >= 1000 / PREVIEW_FPS) {
      drawPreview();
      lastDrawAt = timestamp;
    }
    frameId = window.requestAnimationFrame(animate);
  };

  frameId = window.requestAnimationFrame(animate);
  return () => {
    if (frameId !== 0) {
      window.cancelAnimationFrame(frameId);
    }
  };
}
