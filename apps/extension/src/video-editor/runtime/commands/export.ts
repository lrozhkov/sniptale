import { useCallback } from 'react';
import { translate } from '../../../platform/i18n';
import { getClipEndTime, getLinkedClipIds } from '../../../features/video/project/timeline';
import { VideoExportScope } from '../../../features/video/project/types/index';
import { cancelProjectExport, startProjectExport } from '../../project/operations/ops';
import { toErrorMessage } from './helpers';
import type { UseVideoEditorActionHandlersParams, VideoEditorActionHandlers } from './types';

export function useExportHandlers(
  params: UseVideoEditorActionHandlersParams
): Pick<VideoEditorActionHandlers, 'handleStartExport' | 'handleCancelExport'> {
  const handleStartExport = useCallback(async () => {
    if (!params.project || !params.exportState.settings) {
      return;
    }

    const resolvedSettings = resolveExportSettings(params);
    if (!resolvedSettings) {
      return;
    }

    const jobId = crypto.randomUUID();
    params.startExport(jobId);

    try {
      const response = await startProjectExport(jobId, params.project, resolvedSettings);
      if (!response?.success) {
        params.failExport(response?.error || translate('videoEditor.app.exportStartFailed'));
      }
    } catch (exportError) {
      params.failExport(toErrorMessage(exportError));
    }
  }, [params]);

  const handleCancelExport = useCallback(async () => {
    if (!params.exportState.jobId) {
      return;
    }

    try {
      await cancelProjectExport(params.exportState.jobId);
      params.cancelExport();
    } catch (cancelError) {
      params.failExportCancellation(toErrorMessage(cancelError));
    }
  }, [params]);

  return {
    handleStartExport,
    handleCancelExport,
  };
}

function resolveExportSettings(params: UseVideoEditorActionHandlersParams) {
  const { exportState, project, selectedClipId } = params;
  if (!project || !exportState.settings) {
    return null;
  }

  if (exportState.settings.scope !== VideoExportScope.SELECTED_CLIP) {
    return exportState.settings;
  }

  if (!selectedClipId) {
    params.failExport(translate('videoEditor.exportDialog.selectedClipMissing'));
    return null;
  }

  const selectedClip = project.clips.find((clip) => clip.id === selectedClipId);
  if (!selectedClip) {
    params.failExport(translate('videoEditor.exportDialog.selectedClipMissing'));
    return null;
  }

  return {
    ...exportState.settings,
    selectedClipIds: getLinkedClipIds(project, selectedClip.id),
    rangeStartSeconds: selectedClip.startTime,
    rangeEndSeconds: getClipEndTime(selectedClip),
  };
}
