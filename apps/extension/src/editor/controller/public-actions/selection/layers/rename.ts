import type { Canvas } from 'fabric';

import type { SourceState } from '../../../../document/model/source-state';
import { findObjectById } from '../../../document/layers';
import { syncSourceStateFromObject } from '../../../document/source';

export function renameEditorLayerById(options: {
  canvas: Canvas | null;
  id: string;
  name: string;
  source: SourceState | null;
  setSource: (source: SourceState | null) => void;
  commitHistory: () => void;
  syncRuntimeState: () => void;
}): void {
  const object = findObjectById(options.canvas, options.id);
  const nextName = options.name.trim();
  if (!object || object.sniptaleLocked || !nextName || object.sniptaleLabel === nextName) {
    return;
  }

  object.sniptaleLabel = nextName;
  options.setSource(syncSourceStateFromObject(options.source, object));
  options.commitHistory();
  options.syncRuntimeState();
}
