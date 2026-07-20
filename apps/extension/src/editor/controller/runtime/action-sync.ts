import type { Canvas, FabricObject } from 'fabric';
import type { EditorViewportState } from '../../../features/editor/document/types';
import type { SnapshotHistory } from '@sniptale/foundation/history/snapshot-history';
import { scheduleEditorZoomToFit, syncEditorRuntimeState } from './';

export function scheduleEditorControllerZoomToFit(callback: () => void): void {
  scheduleEditorZoomToFit(callback);
}

export function syncEditorControllerRuntimeState(options: {
  canvas: Canvas | null;
  history: SnapshotHistory<string> | null;
  cropGuide: FabricObject | null;
  cropSelection: { left: number; top: number; width: number; height: number } | null;
  viewportState: EditorViewportState;
}): void {
  syncEditorRuntimeState(
    options.canvas,
    options.history,
    options.cropGuide,
    options.cropSelection,
    options.viewportState
  );
}
