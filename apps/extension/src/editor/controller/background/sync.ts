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
  prepareObject: (object: FabricObject) => void;
  createMutationToken?: () => number;
  isMutationTokenCurrent?: (token: number) => boolean;
};

export async function syncEditorBackgroundLayer(options: SyncBackgroundOptions): Promise<void> {
  const { canvas, canvasSize, frame, prepareObject } = options;
  if (!canvas || typeof canvas.getObjects !== 'function') {
    return;
  }

  const previous = findBackgroundLayer(canvas);
  const token = options.createMutationToken?.();
  const next = await createBackgroundLayer(canvasSize, frame);
  if (token !== undefined && options.isMutationTokenCurrent?.(token) === false) {
    return;
  }

  if (!next) {
    if (previous) {
      canvas.remove(previous);
    }
    return;
  }

  preserveBackgroundLayerState(next, previous);
  assignBackgroundMetadata(next, frame);
  prepareObject(next);
  replaceBackgroundLayer(canvas, previous, next);
}
