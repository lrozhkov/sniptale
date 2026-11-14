import { type Canvas, type FabricObject } from 'fabric';

import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';
import {
  EDITOR_RASTER_BINARY_FIELDS,
  parseEditorRasterMetadata,
  type EditorRasterMetadata,
} from '../../../features/editor/document/raster-state';
import type { EditorRasterEffect } from '../../../features/editor/document/effects';
import type { EditorFrameSettings } from '../../../features/editor/document/types';
import { createBackgroundLayer } from './objects';
import type { BackgroundCanvasSize } from './geometry';
import { findBackgroundLayer } from './identity';
import { replaceBackgroundLayer } from './layer';
import {
  assignBackgroundMetadata,
  preserveBackgroundImageAppearance,
  preserveBackgroundLayerState,
} from './metadata';

/** Prepared source work; the managed object remains the accepted authority. */
export type BackgroundRasterCandidate = {
  observeReplacement?: (next: FabricObject) => () => void;
  isCurrent?: () => boolean;
  targetId: string;
  expectedObject: FabricObject;
  metadata: EditorRasterMetadata;
  effects: readonly EditorRasterEffect[];
  derivedImageData: string;
  flipX: boolean;
  flipY: boolean;
};

type SyncBackgroundOptions = {
  candidate?: BackgroundRasterCandidate;
  allowBackgroundContentEditing?: boolean;
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
  readonly previewObject?: FabricObject;
  dispose: () => void;
};

/** Prepare the raster before changing the visible scene; the caller owns cancellation and commit. */
export async function prepareEditorBackgroundLayer(
  options: SyncBackgroundOptions
): Promise<PreparedBackgroundLayer> {
  const { canvas, canvasSize, frame, prepareObject, candidate } = options;
  const empty = { apply: () => false, dispose: () => undefined };
  if (!canvas || typeof canvas.getObjects !== 'function') return empty;
  if (
    candidate &&
    (!isImageDataUrl(candidate.derivedImageData) ||
      frame.backgroundMode !== 'image' ||
      frame.backgroundImageData !== candidate.derivedImageData ||
      !parseEditorRasterMetadata(
        candidate.metadata,
        (value, kind): value is string =>
          isImageDataUrl(value) && (kind === 'image' || value.startsWith('data:image/png;'))
      ))
  )
    return empty;
  const token = options.createMutationToken?.();
  const isCurrent = () =>
    !canvas.disposed &&
    !canvas.destroyed &&
    options.isCurrent?.() !== false &&
    (!candidate ||
      (candidate.isCurrent?.() !== false &&
        findBackgroundLayer(canvas) === candidate.expectedObject &&
        candidate.expectedObject.sniptaleId === candidate.targetId)) &&
    (token === undefined || options.isMutationTokenCurrent?.(token) !== false);
  if (!isCurrent()) return empty;

  const previous = findBackgroundLayer(canvas);
  const rendered = renderedBackgrounds.get(canvas);
  if (
    !candidate &&
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
    assignBackgroundMetadata(next, frame);
    preserveBackgroundLayerState(next, previous);
    if (candidate) {
      const state = candidate.metadata.sniptaleRasterState;
      const previousCrop = previous?.sniptaleRasterState?.crop ?? {
        x: 0,
        y: 0,
        width: state.width,
        height: state.height,
      };
      const sameCrop =
        previousCrop.x === state.crop.x &&
        previousCrop.y === state.crop.y &&
        previousCrop.width === state.crop.width &&
        previousCrop.height === state.crop.height;
      if (previous) preserveBackgroundImageAppearance(next, previous, sameCrop);
      for (const field of EDITOR_RASTER_BINARY_FIELDS) Reflect.deleteProperty(next, field);
      Object.assign(next, candidate.metadata);
      next.sniptaleEffects = candidate.effects.map((effect) => ({ ...effect }));
      next.set({ flipX: candidate.flipX, flipY: candidate.flipY });
    }
    if (
      options.allowBackgroundContentEditing &&
      frame.backgroundMode === 'image' &&
      (!previous ||
        previous.sniptaleBackgroundMode !== 'image' ||
        previous.sniptaleBackgroundImageData !== frame.backgroundImageData)
    )
      next.sniptaleContentLocked = false;
    prepareObject(next);
  }
  return {
    ...(next ? { previewObject: next } : {}),
    dispose: () => next?.dispose(),
    apply: () => {
      if (!isCurrent()) {
        next?.dispose();
        return false;
      }
      const active = candidate ? (canvas.getActiveObjects?.() ?? []) : [];
      const retainTarget = active.length === 1 && active[0] === previous;
      if (next) {
        try {
          const complete = candidate?.observeReplacement?.(next);
          try {
            replaceBackgroundLayer(canvas, previous, next);
            if (retainTarget) canvas.setActiveObject(next);
          } finally {
            complete?.();
          }
        } catch (error) {
          if (!canvas.getObjects().includes(next)) next.dispose();
          throw error;
        }
      } else if (previous) canvas.remove(previous);
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
