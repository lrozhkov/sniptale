import type { VideoAutoProcessingSettings } from '@sniptale/runtime-contracts/video/types/types';
import type { VideoProject } from '../../../../features/video/project/types/index';
import { translate } from '../../../../platform/i18n';
import { createUserFacingErrorMessage } from '../../../../platform/i18n/user-facing-error';
import { autoTransformRecordingProject } from '../../../project/operations/auto-transform';

interface TimelineAutoTransformStore {
  project: VideoProject | null;
  setError: (error: string | null) => void;
  updateProject: (updater: (project: VideoProject) => VideoProject) => void;
}

export function createAutoTransformRecordingAction(
  store: TimelineAutoTransformStore,
  getProjectSnapshot: () => VideoProject | null
) {
  return (settings: VideoAutoProcessingSettings) => {
    const project = store.project;
    const recordingId = project?.baseRecordingId ?? null;
    if (!project || !recordingId) return;

    const projectId = project.id;
    const projectRevision = project.updatedAt;
    const isCurrent = () => {
      const current = getProjectSnapshot();
      return current?.id === projectId && current.updatedAt === projectRevision;
    };
    void autoTransformRecordingProject(project, recordingId, settings)
      .then((nextProject) => {
        if (!nextProject) {
          if (isCurrent()) {
            store.setError(translate('videoEditor.timeline.autoTransformUnavailable'));
          }
          return;
        }

        store.updateProject((currentProject) =>
          currentProject.id === projectId && currentProject.updatedAt === projectRevision
            ? nextProject
            : currentProject
        );
      })
      .catch((error) => {
        if (isCurrent()) {
          store.setError(
            createUserFacingErrorMessage({
              cause: error,
              detail: 'storage',
              summaryKey: 'common.errors.actionFailed',
            })
          );
        }
      });
  };
}
