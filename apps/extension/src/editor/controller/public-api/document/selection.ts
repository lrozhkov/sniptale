import type { Canvas } from 'fabric';

import { applyEditorSelectionSettings } from '../../public-actions';
import { previewEditorSelectionSettings } from '../../public-actions/selection/objects/settings';

type EditorSelectionCanvasSource = {
  canvas: Canvas | null;
};

type EditorSelectionHistoryScope = {
  withHistoryMuted: <T>(callback: () => T) => T;
};

type EditorSelectionHistoryCommit = {
  commitHistory: () => void;
};

type EditorSelectionRuntimeSync = {
  syncRuntimeState: () => void;
};

export type EditorSelectionApplyController = EditorSelectionCanvasSource &
  EditorSelectionHistoryScope &
  EditorSelectionHistoryCommit &
  EditorSelectionRuntimeSync;

export type EditorSelectionPreviewController = EditorSelectionCanvasSource &
  EditorSelectionHistoryScope &
  EditorSelectionRuntimeSync;

export function applyEditorSelectionSettingsViaController(
  controller: EditorSelectionApplyController
): void {
  applyEditorSelectionSettings({
    canvas: controller.canvas,
    withHistoryMuted: (callback) => controller.withHistoryMuted(callback),
    commitHistory: () => controller.commitHistory(),
    syncRuntimeState: () => controller.syncRuntimeState(),
  });
}

export function previewEditorSelectionSettingsViaController(
  controller: EditorSelectionPreviewController
): void {
  previewEditorSelectionSettings({
    canvas: controller.canvas,
    withHistoryMuted: (callback) => controller.withHistoryMuted(callback),
    syncRuntimeState: () => controller.syncRuntimeState(),
  });
}
