import { useEffect } from 'react';

import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { subscribeToMediaHubEvents } from '../../../features/media-hub/events';
import type { VideoEditorLibrariesState } from '../app-model/types';
import type { VideoEditorExportActions } from '../../contracts/commands/export';
import type { VideoEditorSessionActions } from '../../contracts/commands/session';
import { routeProjectExportRuntimeEvent } from './export-event-route';

interface UseVideoEditorExportEventsParams {
  projectId: string | undefined;
  getActiveExportJobId: () => string | null;
  setError: VideoEditorSessionActions['setError'];
  updateExportStatus: VideoEditorExportActions['updateExportStatus'];
  failExport: VideoEditorExportActions['failExport'];
  completeExport: VideoEditorExportActions['completeExport'];
  cancelExport: VideoEditorExportActions['cancelExport'];
  refreshRecordings: VideoEditorLibrariesState['refreshRecordings'];
  refreshProjects: VideoEditorLibrariesState['refreshProjects'];
  refreshProjectExports: VideoEditorLibrariesState['refreshProjectExports'];
}

/**
 * Subscribes the editor shell to media-hub and export status events.
 */
function useMediaHubRefreshSubscription(
  projectId: string | undefined,
  setError: VideoEditorSessionActions['setError'],
  refreshRecordings: VideoEditorLibrariesState['refreshRecordings'],
  refreshProjects: VideoEditorLibrariesState['refreshProjects'],
  refreshProjectExports: VideoEditorLibrariesState['refreshProjectExports']
): void {
  useEffect(() => {
    const unsubscribeMediaHub = subscribeToMediaHubEvents((event) => {
      if (event.type === 'library-changed') {
        void refreshRecordings();
        void refreshProjects();
        if (projectId) {
          void refreshProjectExports(projectId);
        }
        return;
      }

      setError(event.message);
    });

    return () => {
      unsubscribeMediaHub();
    };
  }, [projectId, refreshProjectExports, refreshProjects, refreshRecordings, setError]);
}

function useProjectExportMessageSubscription(
  getActiveExportJobId: () => string | null,
  updateExportStatus: VideoEditorExportActions['updateExportStatus'],
  failExport: VideoEditorExportActions['failExport'],
  completeExport: VideoEditorExportActions['completeExport'],
  cancelExport: VideoEditorExportActions['cancelExport'],
  refreshRecordings: VideoEditorLibrariesState['refreshRecordings'],
  refreshProjects: VideoEditorLibrariesState['refreshProjects'],
  refreshProjectExports: VideoEditorLibrariesState['refreshProjectExports']
): void {
  useEffect(() => {
    const listener = (
      message: unknown,
      _sender: chrome.runtime.MessageSender,
      sendResponse?: (response?: unknown) => void
    ) => {
      const response = routeProjectExportRuntimeEvent(
        message,
        {
          cancelExport,
          completeExport,
          failExport,
          refreshProjectExports,
          refreshProjects,
          refreshRecordings,
          updateExportStatus,
        },
        getActiveExportJobId
      );
      if (response && typeof sendResponse === 'function') {
        sendResponse(response);
      }
    };

    return browserRuntime.subscribeToMessages(listener);
  }, [
    cancelExport,
    completeExport,
    failExport,
    getActiveExportJobId,
    refreshProjectExports,
    refreshProjects,
    refreshRecordings,
    updateExportStatus,
  ]);
}

export function useVideoEditorExportEvents(params: UseVideoEditorExportEventsParams): void {
  const {
    projectId,
    getActiveExportJobId,
    setError,
    updateExportStatus,
    failExport,
    completeExport,
    cancelExport,
    refreshRecordings,
    refreshProjects,
    refreshProjectExports,
  } = params;

  useMediaHubRefreshSubscription(
    projectId,
    setError,
    refreshRecordings,
    refreshProjects,
    refreshProjectExports
  );
  useProjectExportMessageSubscription(
    getActiveExportJobId,
    updateExportStatus,
    failExport,
    completeExport,
    cancelExport,
    refreshRecordings,
    refreshProjects,
    refreshProjectExports
  );
}
