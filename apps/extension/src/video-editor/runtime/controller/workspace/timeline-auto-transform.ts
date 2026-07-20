import type { VideoAutoProcessingSettings } from '@sniptale/runtime-contracts/video/types/types';
import type { VideoProject } from '../../../../features/video/project/types/index';
import { translate } from '../../../../platform/i18n';
import { autoTransformRecordingProject } from '../../../project/operations/auto-transform';

interface TimelineAutoTransformStore {
  project: VideoProject | null;
  recordingId: string | null;
  setError: (error: string | null) => void;
  updateProject: (updater: (project: VideoProject) => VideoProject) => void;
}

export function createAutoTransformRecordingAction(store: TimelineAutoTransformStore) {
  return (settings: VideoAutoProcessingSettings) => {
    const project = store.project;
    const recordingId = store.recordingId ?? project?.baseRecordingId ?? null;
    if (!project || !recordingId) return;

    const projectId = project.id;
    const projectRevision = project.updatedAt;
    void autoTransformRecordingProject(project, recordingId, settings)
      .then((nextProject) => {
        if (!nextProject) {
          store.setError(translate('videoEditor.timeline.autoTransformUnavailable'));
          return;
        }

        store.updateProject((currentProject) =>
          currentProject.id === projectId && currentProject.updatedAt === projectRevision
            ? nextProject
            : currentProject
        );
      })
      .catch((error) => {
        store.setError(error instanceof Error ? error.message : String(error));
      });
  };
}
