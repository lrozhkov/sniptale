import { translate } from '../../../platform/i18n';
import { normalizeVideoProjectExportSettings } from '../../../features/video/project/export/capabilities';
import { getDefaultExportSettings } from '../../../features/video/project/timeline';
import {
  VideoProjectExportPhase,
  type VideoProject,
} from '../../../features/video/project/types/index';
import type { VideoEditorExportActions } from '../../contracts/commands/export';
import type {
  VideoEditorExportResult,
  VideoEditorExportRuntimeState,
} from '../../contracts/export-state';

type VideoEditorExportSettingsPatch = Parameters<
  VideoEditorExportActions['updateExportSettings']
>[0];

function normalizeExportSettingsPatch(
  patch: VideoEditorExportSettingsPatch
): VideoEditorExportSettingsPatch {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => typeof value !== 'number' || Number.isFinite(value))
  ) as VideoEditorExportSettingsPatch;
}

export function createInitialExportState(): VideoEditorExportRuntimeState {
  return {
    dialogOpen: false,
    isRunning: false,
    jobId: null,
    status: null,
    settings: null,
    error: null,
    lastResult: null,
  };
}

export function openExportDialogState(state: {
  exportState: VideoEditorExportRuntimeState;
  project: VideoProject | null;
}): VideoEditorExportRuntimeState {
  return {
    ...state.exportState,
    dialogOpen: true,
    error: null,
    settings:
      state.exportState.settings ??
      (state.project ? getDefaultExportSettings(state.project) : null),
  };
}

export function closeExportDialogState(
  exportState: VideoEditorExportRuntimeState
): VideoEditorExportRuntimeState {
  return {
    ...exportState,
    dialogOpen: false,
    error: null,
  };
}

export function updateExportSettingsState(
  exportState: VideoEditorExportRuntimeState,
  patch: VideoEditorExportSettingsPatch
): VideoEditorExportRuntimeState {
  const normalizedPatch = normalizeExportSettingsPatch(patch);

  return {
    ...exportState,
    settings: exportState.settings
      ? normalizeVideoProjectExportSettings({
          ...exportState.settings,
          ...normalizedPatch,
        })
      : null,
  };
}

export function startExportState(
  exportState: VideoEditorExportRuntimeState,
  jobId: string
): VideoEditorExportRuntimeState {
  return {
    ...exportState,
    dialogOpen: false,
    isRunning: true,
    jobId,
    error: null,
    lastResult: null,
    status: {
      phase: VideoProjectExportPhase.PREPARING,
      progress: 0,
      message: translate('offscreenExport.storePreparing'),
    },
  };
}

export function updateExportStatusState(
  exportState: VideoEditorExportRuntimeState,
  status: Parameters<VideoEditorExportActions['updateExportStatus']>[0]
): VideoEditorExportRuntimeState {
  return {
    ...exportState,
    status,
  };
}

export function failExportState(
  exportState: VideoEditorExportRuntimeState,
  error: string
): VideoEditorExportRuntimeState {
  return {
    ...exportState,
    isRunning: false,
    jobId: null,
    error,
  };
}

export function failExportCancellationState(
  exportState: VideoEditorExportRuntimeState,
  error: string
): VideoEditorExportRuntimeState {
  return {
    ...exportState,
    error,
  };
}

export function completeExportState(
  exportState: VideoEditorExportRuntimeState,
  result: VideoEditorExportResult
): VideoEditorExportRuntimeState {
  return {
    ...exportState,
    isRunning: false,
    jobId: null,
    error: null,
    lastResult: result,
    status: {
      phase: VideoProjectExportPhase.DONE,
      progress: 100,
      message: `${translate('offscreenExport.storeCompletedPrefix')} ${result.filename}`,
    },
  };
}

export function cancelExportState(
  exportState: VideoEditorExportRuntimeState
): VideoEditorExportRuntimeState {
  return {
    ...exportState,
    isRunning: false,
    jobId: null,
    status: {
      phase: VideoProjectExportPhase.CANCELLED,
      progress: 0,
      message: translate('offscreenExport.storeCancelled'),
    },
  };
}
