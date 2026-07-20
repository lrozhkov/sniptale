import type { StateCreator } from 'zustand';
import type { VideoEditorExportActions } from '../../contracts/commands/export';
import type {
  VideoEditorExportResult,
  VideoEditorExportRuntimeState,
} from '../../contracts/export-state';
import type { VideoEditorState } from '../types';
import {
  cancelExportState,
  closeExportDialogState,
  completeExportState,
  failExportCancellationState,
  failExportState,
  openExportDialogState,
  startExportState,
  updateExportSettingsState,
  updateExportStatusState,
} from './transitions';

type VideoEditorStoreSet = Parameters<StateCreator<VideoEditorState>>[0];
type VideoEditorExportSettingsPatch = Parameters<
  VideoEditorExportActions['updateExportSettings']
>[0];

function createExportStateSetter<TArgs extends unknown[]>(
  set: VideoEditorStoreSet,
  updateExportState: (
    state: VideoEditorExportRuntimeState,
    ...args: TArgs
  ) => VideoEditorExportRuntimeState
) {
  return (...args: TArgs) =>
    set(
      (state): Partial<VideoEditorState> => ({
        exportState: updateExportState(state.exportState, ...args),
      })
    );
}

export function createExportStateActions(set: VideoEditorStoreSet): VideoEditorExportActions {
  return {
    openExportDialog: () =>
      set(
        (state): Partial<VideoEditorState> => ({
          exportState: openExportDialogState(state),
        })
      ),
    closeExportDialog: createExportStateSetter(set, closeExportDialogState),
    updateExportSettings: createExportStateSetter(set, updateExportSettingsState) as (
      patch: VideoEditorExportSettingsPatch
    ) => void,
    startExport: createExportStateSetter(set, startExportState),
    updateExportStatus: createExportStateSetter(set, updateExportStatusState) as (
      status: Parameters<VideoEditorExportActions['updateExportStatus']>[0]
    ) => void,
    failExport: createExportStateSetter(set, failExportState),
    failExportCancellation: createExportStateSetter(set, failExportCancellationState),
    completeExport: createExportStateSetter(set, completeExportState) as (
      result: VideoEditorExportResult
    ) => void,
    cancelExport: createExportStateSetter(set, cancelExportState),
  };
}
