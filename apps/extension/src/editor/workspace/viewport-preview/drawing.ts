import type { Canvas } from 'fabric';
import { EditorCanvas } from '../../controller/viewport/render-region';
import { PREVIEW_FPS } from './helpers';
import {
  getEditorEditingSurfaceSize,
  getEditorWorkspaceMargin,
} from '../../controller/viewport/editing-surface';

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

function renderFabricPreviewSource(
  canvas: Canvas,
  documentSize: { width: number; height: number },
  previewWidth: number
): HTMLCanvasElement {
  const multiplier = previewWidth / documentSize.width;
  if (canvas instanceof EditorCanvas && canvas.hasVirtualViewport) {
    return canvas.renderDocumentCanvas(multiplier);
  }
  const margin = getEditorWorkspaceMargin(documentSize);
  return canvas.toCanvasElement(multiplier, {
    left: margin,
    top: margin,
    width: documentSize.width,
    height: documentSize.height,
  });
}

function drawPreviewFrame(args: {
  sourceCanvas: HTMLCanvasElement;
  fabricCanvas?: Canvas | null;
  previewCanvas: HTMLCanvasElement;
  previewSize: { width: number; height: number };
  documentSize?: { width: number; height: number };
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
  const documentSize = args.documentSize;
  if (documentSize && args.fabricCanvas) {
    const rendered = renderFabricPreviewSource(
      args.fabricCanvas,
      documentSize,
      args.previewSize.width
    );
    context.drawImage(rendered, 0, 0, args.previewSize.width, args.previewSize.height);
    return;
  }
  const surface = documentSize ? getEditorEditingSurfaceSize(documentSize) : null;
  const margin = documentSize ? getEditorWorkspaceMargin(documentSize) : 0;
  const sourceLeft = surface ? (args.sourceCanvas.width * margin) / surface.width : 0;
  const sourceTop = surface ? (args.sourceCanvas.height * margin) / surface.height : 0;
  const sourceWidth =
    surface && documentSize
      ? (args.sourceCanvas.width * documentSize.width) / surface.width
      : args.sourceCanvas.width;
  const sourceHeight =
    surface && documentSize
      ? (args.sourceCanvas.height * documentSize.height) / surface.height
      : args.sourceCanvas.height;
  context.drawImage(
    args.sourceCanvas,
    sourceLeft,
    sourceTop,
    sourceWidth,
    sourceHeight,
    0,
    0,
    args.previewSize.width,
    args.previewSize.height
  );
}

export function startEditorViewportPreviewLoop(args: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  getCanvas?: () => Canvas | null;
  previewCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  previewSize: { width: number; height: number };
  documentSize?: { width: number; height: number };
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

    drawPreviewFrame({
      sourceCanvas,
      ...(args.getCanvas ? { fabricCanvas: args.getCanvas() } : {}),
      previewCanvas,
      previewSize: args.previewSize,
      ...(args.documentSize ? { documentSize: args.documentSize } : {}),
    });
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
