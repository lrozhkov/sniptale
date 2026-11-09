import { type Canvas, type FabricObject } from 'fabric';

import type { EditorFrameSettings } from '../../../features/editor/document/types';
import { createBackgroundLayer } from './objects';
import type { BackgroundCanvasSize } from './geometry';
import { findBackgroundLayer } from './identity';
import { replaceBackgroundLayer } from './layer';
import { assignBackgroundMetadata, preserveBackgroundLayerState } from './metadata';

type SyncBackgroundOptions = {
  canvas: Canvas | null;
  canvasSize: BackgroundCanvasSize;
  frame: EditorFrameSettings;
  preview?: boolean;
  prepareObject: (object: FabricObject) => void;
  createMutationToken?: () => number;
  isMutationTokenCurrent?: (token: number) => boolean;
  isCurrent?: () => boolean;
};

const renderedBackgrounds = new WeakMap<
  Canvas,
  {
    frame: EditorFrameSettings;
    preview: boolean;
    size: BackgroundCanvasSize;
    object: FabricObject | undefined;
  }
>();

/** Compare paint inputs without serializing embedded image assets. */
export function hasSameBackgroundPaint(
  left: EditorFrameSettings,
  right: EditorFrameSettings
): boolean {
  return (
    left.backgroundMode === right.backgroundMode &&
    left.backgroundBlurAmount === right.backgroundBlurAmount &&
    left.backgroundColor === right.backgroundColor &&
    left.backgroundImageData === right.backgroundImageData &&
    left.backgroundImageFit === right.backgroundImageFit &&
    left.backgroundGradientAngle === right.backgroundGradientAngle &&
    left.backgroundGradientFrom === right.backgroundGradientFrom &&
    left.backgroundGradientTo === right.backgroundGradientTo &&
    JSON.stringify(left.backgroundGradient) === JSON.stringify(right.backgroundGradient) &&
    JSON.stringify(left.backgroundGradientStops) ===
      JSON.stringify(right.backgroundGradientStops) &&
    JSON.stringify(left.backgroundGradientColorStops) ===
      JSON.stringify(right.backgroundGradientColorStops)
  );
}

export type PreparedBackgroundLayer = {
  apply: () => boolean;
  dispose: () => void;
};

/** Prepare the raster before changing the visible scene; the caller owns cancellation and commit. */
export async function prepareEditorBackgroundLayer(
  options: SyncBackgroundOptions
): Promise<PreparedBackgroundLayer> {
  const { canvas, canvasSize, frame, prepareObject } = options;
  const empty = { apply: () => false, dispose: () => undefined };
  if (!canvas || typeof canvas.getObjects !== 'function') return empty;
  const token = options.createMutationToken?.();
  const isCurrent = () =>
    !canvas.disposed &&
    !canvas.destroyed &&
    options.isCurrent?.() !== false &&
    (token === undefined || options.isMutationTokenCurrent?.(token) !== false);
  if (!isCurrent()) return empty;

  const previous = findBackgroundLayer(canvas);
  const rendered = renderedBackgrounds.get(canvas);
  if (
    rendered &&
    rendered.object === previous &&
    (!rendered.preview || options.preview === true) &&
    rendered.size.width === canvasSize.width &&
    rendered.size.height === canvasSize.height &&
    hasSameBackgroundPaint(rendered.frame, frame)
  )
    return { apply: isCurrent, dispose: () => undefined };

  const next = await createBackgroundLayer(canvasSize, frame, options.preview === true);
  if (!isCurrent()) {
    next?.dispose();
    return empty;
  }
  if (next) {
    preserveBackgroundLayerState(next, previous);
    assignBackgroundMetadata(next, frame);
    prepareObject(next);
  }
  return {
    dispose: () => next?.dispose(),
    apply: () => {
      if (!isCurrent()) {
        next?.dispose();
        return false;
      }
      if (next) replaceBackgroundLayer(canvas, previous, next);
      else if (previous) canvas.remove(previous);
      renderedBackgrounds.set(canvas, {
        frame,
        preview: options.preview === true,
        size: { ...canvasSize },
        object: next ?? undefined,
      });
      return true;
    },
  };
}

export async function syncEditorBackgroundLayer(options: SyncBackgroundOptions): Promise<void> {
  const prepared = await prepareEditorBackgroundLayer(options);
  prepared.apply();
}
