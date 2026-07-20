import type { Canvas, FabricObject } from 'fabric';

import type { SourceState } from '../../../../document/model/source-state';
import { resizeLayerObject, toggleLayerLock, toggleLayerVisibility } from '../../../layer-actions';
import { updateSourceAndSync } from './source-sync';

export function toggleEditorLayerVisibility(options: {
  canvas: Canvas | null;
  id: string;
  source: SourceState | null;
  setSource: (source: SourceState | null) => void;
  commitHistory: () => void;
  syncRuntimeState: () => void;
}): void {
  updateSourceAndSync(
    options.source,
    toggleLayerVisibility(options.canvas, options.id),
    options.setSource,
    options.commitHistory,
    options.syncRuntimeState
  );
}

export function toggleEditorLayerLockState(options: {
  canvas: Canvas | null;
  id: string;
  source: SourceState | null;
  setSource: (source: SourceState | null) => void;
  prepareObject: (object: FabricObject) => void;
  commitHistory: () => void;
  syncRuntimeState: () => void;
}): void {
  updateSourceAndSync(
    options.source,
    toggleLayerLock(options.canvas, options.id, options.prepareObject),
    options.setSource,
    options.commitHistory,
    options.syncRuntimeState
  );
}

export function resizeEditorLayerById(options: {
  canvas: Canvas | null;
  id: string;
  width: number;
  height: number;
  source: SourceState | null;
  setSource: (source: SourceState | null) => void;
  ensureObjectReachable: (object: FabricObject) => boolean;
  commitHistory: () => void;
  syncRuntimeState: () => void;
}): void {
  updateSourceAndSync(
    options.source,
    resizeLayerObject(
      options.canvas,
      options.id,
      options.width,
      options.height,
      options.ensureObjectReachable
    ),
    options.setSource,
    options.commitHistory,
    options.syncRuntimeState
  );
}
