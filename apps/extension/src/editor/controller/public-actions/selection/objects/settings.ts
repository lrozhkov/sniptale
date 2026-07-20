import type { Canvas } from 'fabric';

import { useEditorStore } from '../../../../state/useEditorStore';
import { applySelectionToolSettingsToObjects } from '../../../selection';
import { getSingleSelectionType } from '../../../../document/model';
import { getMutableEditorSelection } from './active-selection';

function runSelectionSettingsMutation(options: {
  canvas: Canvas | null;
  withHistoryMuted: <T>(callback: () => T) => T;
}): boolean {
  const { canvas, withHistoryMuted } = options;
  const activeObjects = getMutableEditorSelection(canvas);
  if (!activeObjects) {
    return false;
  }

  const selectedType = getSingleSelectionType(activeObjects);
  if (!selectedType) {
    return false;
  }

  withHistoryMuted(() => {
    applySelectionToolSettingsToObjects(
      activeObjects,
      selectedType,
      useEditorStore.getState().selectionToolSettings
    );
    canvas?.requestRenderAll();
  });

  return true;
}

export function applyEditorSelectionSettings(options: {
  canvas: Canvas | null;
  withHistoryMuted: <T>(callback: () => T) => T;
  commitHistory: () => void;
  syncRuntimeState: () => void;
}): void {
  if (runSelectionSettingsMutation(options)) {
    options.commitHistory();
    options.syncRuntimeState();
  }
}

export function previewEditorSelectionSettings(options: {
  canvas: Canvas | null;
  withHistoryMuted: <T>(callback: () => T) => T;
  syncRuntimeState: () => void;
}): void {
  if (runSelectionSettingsMutation(options)) {
    options.syncRuntimeState();
  }
}
