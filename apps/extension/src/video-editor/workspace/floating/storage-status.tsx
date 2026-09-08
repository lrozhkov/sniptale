import { useCallback, useEffect } from 'react';
import { connectAggregateEditorPresence } from '../../../workflows/aggregate-editor-presence/client';
import { useVideoEditorProjectStorageStatus } from '../../runtime/controller/store';
import { promoteOpenVideoProject, refreshSavedVideoProjectPresentation } from './storage-promotion';

export function VideoProjectStorageStatus() {
  const { projectId, projectUpdatedAt, saveState } = useVideoEditorProjectStorageStatus();
  const promote = useCallback(async () => {
    if (projectId) await promoteOpenVideoProject(projectId);
  }, [projectId]);

  useEffect(() => {
    if (!projectId || projectUpdatedAt === null || saveState !== 'saved') return;
    void refreshSavedVideoProjectPresentation(projectId, projectUpdatedAt).catch(() => undefined);
  }, [projectId, projectUpdatedAt, saveState]);

  useEffect(() => {
    if (!projectId) return;
    const presence = connectAggregateEditorPresence({
      aggregate: { id: projectId, kind: 'video-project' },
      promote,
    });
    return () => presence.dispose();
  }, [projectId, promote]);

  return null;
}
