import { useCallback, useMemo } from 'react';
import { translate } from '../../../platform/i18n';
import { getClipEndTime, getLinkedClipIds } from '../../../features/video/project/timeline';
import { VideoExportScope } from '../../../features/video/project/types/index';
import { cancelProjectExport, startProjectExport } from '../../project/operations/ops';
import { toErrorMessage } from './helpers';
import type { ExportHandlerPort, VideoEditorActionHandlers } from './types';

export function useExportHandlers(
  port: ExportHandlerPort
): Pick<VideoEditorActionHandlers, 'handleStartExport' | 'handleCancelExport'> {
  const handleStartExport = useCallback(async () => {
    const project = port.getCurrentProject();
    const exportState = port.getCurrentExportState();
    if (!project || !exportState.settings) {
      return;
    }

    const resolvedSettings = resolveExportSettings(port, project, exportState);
    if (!resolvedSettings) {
      return;
    }

    const jobId = crypto.randomUUID();
    port.startExport(jobId);

    try {
      const response = await startProjectExport(jobId, project, resolvedSettings);
      if (!response?.success) {
        port.failExport(toErrorMessage(response?.error, 'videoEditor.app.exportStartFailed'));
      }
    } catch (exportError) {
      port.failExport(toErrorMessage(exportError, 'videoEditor.app.exportStartFailed'));
    }
  }, [port]);

  const handleCancelExport = useCallback(async () => {
    const exportState = port.getCurrentExportState();
    if (!exportState.jobId) {
      return;
    }

    try {
      await cancelProjectExport(exportState.jobId);
      port.cancelExport();
    } catch (cancelError) {
      port.failExportCancellation(toErrorMessage(cancelError, 'common.errors.actionFailed'));
    }
  }, [port]);

  return useMemo(
    () => ({ handleStartExport, handleCancelExport }),
    [handleCancelExport, handleStartExport]
  );
}

function resolveExportSettings(
  port: ExportHandlerPort,
  project: NonNullable<ReturnType<ExportHandlerPort['getCurrentProject']>>,
  exportState: ReturnType<ExportHandlerPort['getCurrentExportState']>
) {
  const selectedClipId = port.getCurrentSelectedClipId();
  if (!project || !exportState.settings) {
    return null;
  }

  if (exportState.settings.scope !== VideoExportScope.SELECTED_CLIP) {
    return exportState.settings;
  }

  if (!selectedClipId) {
    port.failExport(translate('videoEditor.exportDialog.selectedClipMissing'));
    return null;
  }

  const selectedClip = project.clips.find((clip) => clip.id === selectedClipId);
  if (!selectedClip) {
    port.failExport(translate('videoEditor.exportDialog.selectedClipMissing'));
    return null;
  }

  return {
    ...exportState.settings,
    selectedClipIds: getLinkedClipIds(project, selectedClip.id),
    rangeStartSeconds: selectedClip.startTime,
    rangeEndSeconds: getClipEndTime(selectedClip),
  };
}
